import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { SessionType, SessionTemplate, WeekTemplate, ProgramTemplate } from "@/types";

const client = new Anthropic();

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
const SESSION_TYPES: SessionType[] = ["technique", "volume", "intensite", "recuperation", "test"];

// Import d'un programme existant (photo ou texte collé) — 1re brique du chantier "import de
// programme" (voir historique de conversation). Volontairement une SEULE semaine en sortie, même
// si le document source en contient plusieurs : reconstruire fidèlement une périodisation multi-
// semaines inconnue (durée réelle, progression voulue par son auteur) est jugé trop risqué —
// décision explicite de Gildas. Une semaine suffit, "Reconduire" (déjà construit) gère la
// projection sur les semaines suivantes. Mêmes 2 raisons pour lesquelles ce choix sert aussi de
// test pour l'onboarding plus tard : week_preview n'a jamais eu besoin de plus d'une semaine.
//
// Tool-use plutôt que "réponds en JSON" en prose — même choix et même raison que
// /api/sports/custom (2026-08-06) : le tool-use fait porter la conformité du schéma par l'API
// elle-même, pas par un parsing regex sur du texte libre. Haiku (pas Sonnet) — tâche de
// transcription fidèle, pas de raisonnement complexe, même arbitrage déjà tranché sur
// /api/sports/custom.
const IMPORT_TOOL = {
  name: "soumettre_programme",
  description: "Soumet UNE semaine de séances transcrites fidèlement depuis le document/texte fourni.",
  input_schema: {
    type: "object" as const,
    properties: {
      sessions: {
        type: "array" as const,
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object" as const,
          properties: {
            day: { type: "string" as const, enum: DAYS, description: "Jour de la semaine" },
            name: { type: "string" as const, description: "Nom de la séance tel qu'il apparaît dans le document (ex. \"Squat\", \"Push day\", \"Séance 1\")" },
            type: { type: "string" as const, enum: SESSION_TYPES, description: "Nature dominante de la séance" },
            target_difficulty: { type: "integer" as const, minimum: 1, maximum: 10, description: "Difficulté perçue estimée de la séance, sur 10" },
            notes: { type: "string" as const, description: "Exercices de la séance, une ligne par exercice séparée par des \\n, format \"Nom — SxR\" ou \"Nom — Sx R @ poids\" — reprend tel quel ce qui est écrit dans le document (noms, séries, reps, charges), jamais inventé ou complété" },
          },
          required: ["day", "name", "type", "target_difficulty", "notes"],
        },
      },
    },
    required: ["sessions"],
  },
};

const SYSTEM = `Tu es l'assistant d'import de programme de ThePerfClub. Un utilisateur fournit un programme d'entraînement qu'il suit déjà (photo ou texte collé) — ta seule tâche est de le TRANSCRIRE fidèlement dans le schéma fourni, jamais de le générer ou de le compléter.

Règles strictes :
- Ne transcris JAMAIS d'exercice, de série, de répétition ou de charge qui n'est pas explicitement présent dans le document. Un doute sur un chiffre illisible → laisse la ligne sans ce chiffre plutôt que de l'inventer.
- Le document peut couvrir plusieurs semaines : choisis UNE SEULE semaine représentative (la première semaine complète et lisible) — ne fusionne jamais le contenu de plusieurs semaines dans une seule sortie.
- Si le document ne précise pas de jours explicites (ex. "Séance 1/2/3" sans date), répartis les séances sur la semaine en espaçant les jours d'entraînement (jamais deux séances d'affilée sans raison, sauf si le document le précise explicitement) — commence un lundi.
- "target_difficulty" est ton estimation de la difficulté perçue de la séance (volume × intensité), pas une donnée du document sauf si elle y figure explicitement (RPE, %1RM élevé...).
- "type" reflète la nature réelle de la séance (ex. une séance de repos actif/mobilité → "recuperation", un test de charge maximale → "test", le reste selon dominante technique/volume/intensité).`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
  const imageMediaType = typeof body?.imageMediaType === "string" ? body.imageMediaType : "image/jpeg";

  if (!text && !imageBase64) {
    return NextResponse.json({ ok: false, error: "text ou imageBase64 requis" }, { status: 400 });
  }

  const content: Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam> = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: imageMediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: imageBase64 },
    });
    content.push({ type: "text", text: "Voici une photo d'un programme d'entraînement existant. Transcris-le fidèlement selon les règles données." });
  } else {
    content.push({ type: "text", text: `Voici un programme d'entraînement existant, collé en texte :\n\n${text}` });
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      tools: [IMPORT_TOOL],
      tool_choice: { type: "tool", name: IMPORT_TOOL.name },
    });

    const toolUse = message.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude n'a pas appelé l'outil soumettre_programme");

    const input = toolUse.input as { sessions?: unknown[] };
    if (!Array.isArray(input.sessions) || !input.sessions.length) throw new Error("Aucune séance reconnue dans le document");

    const week: WeekTemplate = {};
    DAYS.forEach(d => { week[d] = []; });

    for (const raw of input.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      const day = typeof s.day === "string" && (DAYS as readonly string[]).includes(s.day) ? s.day : null;
      const name = typeof s.name === "string" ? s.name.trim() : "";
      if (!day || !name) continue;
      const type: SessionType = typeof s.type === "string" && SESSION_TYPES.includes(s.type as SessionType) ? s.type as SessionType : "volume";
      const diff = typeof s.target_difficulty === "number" ? Math.max(1, Math.min(10, Math.round(s.target_difficulty))) : 5;
      const notes = typeof s.notes === "string" ? s.notes.trim() : "";
      const session: SessionTemplate = { name, notes: notes || null, target_difficulty: diff, load: 2, type };
      week[day].push(session);
    }

    if (!Object.values(week).some(arr => arr.length)) throw new Error("Reconstruction vide — aucune séance valide dans la sortie de l'outil");

    const template: ProgramTemplate = { weeks: [week] };
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    // Repli explicite — jamais d'écran cassé sur un échec Claude (timeout, refus d'appeler
    // l'outil, forme inattendue, image illisible) : même convention que /api/sports/custom.
    console.error("[api/programs/import] échec parsing:", err);
    return NextResponse.json({ ok: false, error: "On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte." });
  }
}
