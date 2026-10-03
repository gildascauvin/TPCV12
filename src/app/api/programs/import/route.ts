import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SessionType, SessionTemplate, WeekTemplate, ProgramTemplate } from "@/types";

const client = new Anthropic();

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
const SESSION_TYPES: SessionType[] = ["technique", "volume", "intensite", "recuperation", "test"];

// Import d'un programme existant (photo ou texte collé). Transcrit exactement ce que le document
// contient : une semaine s'il n'en décrit qu'une, plusieurs s'il en décrit plusieurs (décision de
// Gildas 2026-10-03, remplace l'ancienne règle « une seule semaine »). Jamais de semaine inventée :
// prolonger un programme d'une semaine reste le rôle de Reconduire.
//
// Tool-use plutôt que "réponds en JSON" en prose — même choix et même raison que
// /api/sports/custom (2026-08-06). Haiku : tâche de transcription, pas de raisonnement.
const MAX_WEEKS = 16;

const IMPORT_TOOL = {
  name: "soumettre_programme",
  description: "Soumet les séances transcrites fidèlement depuis le document/texte fourni, chacune rattachée à sa semaine.",
  input_schema: {
    type: "object" as const,
    properties: {
      sessions: {
        type: "array" as const,
        minItems: 1,
        maxItems: 7 * MAX_WEEKS,
        items: {
          type: "object" as const,
          properties: {
            week: { type: "integer" as const, minimum: 1, maximum: MAX_WEEKS, description: "Numéro de la semaine du document où figure la séance (1 si le document ne décrit qu'une semaine)" },
            day: { type: "string" as const, enum: DAYS, description: "Jour de la semaine" },
            name: { type: "string" as const, description: "Nom de la séance tel qu'il apparaît dans le document (ex. \"Squat\", \"Push day\", \"Séance 1\")" },
            type: { type: "string" as const, enum: SESSION_TYPES, description: "Nature dominante de la séance" },
            target_difficulty: { type: "integer" as const, minimum: 1, maximum: 10, description: "Difficulté perçue estimée de la séance, sur 10" },
            notes: { type: "string" as const, description: "Exercices de la séance, une ligne par exercice séparée par des \\n, format \"Nom — SxR\" ou \"Nom — Sx R @ poids\" — reprend tel quel ce qui est écrit dans le document (noms, séries, reps, charges), jamais inventé ou complété" },
          },
          required: ["week", "day", "name", "type", "target_difficulty", "notes"],
        },
      },
    },
    required: ["sessions"],
  },
};

const SYSTEM = `Tu es l'assistant d'import de programme de ThePerfClub. Un utilisateur fournit un programme d'entraînement qu'il suit déjà (photo ou texte collé) — ta seule tâche est de le TRANSCRIRE fidèlement dans le schéma fourni, jamais de le générer ou de le compléter.

Règles strictes :
- Ne transcris JAMAIS d'exercice, de série, de répétition ou de charge qui n'est pas explicitement présent dans le document. Un doute sur un chiffre illisible → laisse la ligne sans ce chiffre plutôt que de l'inventer.
- Le document peut couvrir plusieurs semaines : transcris CHAQUE semaine qu'il décrit, avec son numéro (\"week\" = 1, 2, 3...), sans fusionner deux semaines. S'il ne décrit qu'une semaine, tout est en semaine 1. N'invente jamais de semaine : si le document dit seulement \"à répéter 6 semaines\" sans écrire les semaines suivantes, transcris uniquement la semaine écrite.
- Si le document ne précise pas de jours explicites (ex. "Séance 1/2/3" sans date), répartis les séances sur la semaine en espaçant les jours d'entraînement (jamais deux séances d'affilée sans raison, sauf si le document le précise explicitement) — commence un lundi.
- "target_difficulty" est ton estimation de la difficulté perçue de la séance (volume × intensité), pas une donnée du document sauf si elle y figure explicitement (RPE, %1RM élevé...).
- "type" reflète la nature réelle de la séance (ex. une séance de repos actif/mobilité → "recuperation", un test de charge maximale → "test", le reste selon dominante technique/volume/intensité).`;

// Route publique (2026-08-29) — nécessaire pour l'appeler depuis sport_2a en onboarding, avant la
// création du compte (account arrive bien plus tard dans le path, après week_preview/role/decision).
// Même correction que /api/sports/custom le même jour — un check auth.getUser() ici aurait été
// silencieusement cassé pour tout visiteur anonyme en cours d'inscription, exactement le bug déjà
// trouvé sur cette route sœur.
export async function POST(req: Request) {
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
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      tools: [IMPORT_TOOL],
      tool_choice: { type: "tool", name: IMPORT_TOOL.name },
    });

    const toolUse = message.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude n'a pas appelé l'outil soumettre_programme");

    const input = toolUse.input as { sessions?: unknown[] };
    if (!Array.isArray(input.sessions) || !input.sessions.length) throw new Error("Aucune séance reconnue dans le document");

    const emptyWeek = (): WeekTemplate => { const w: WeekTemplate = {}; DAYS.forEach(d => { w[d] = []; }); return w; };
    const weeks: WeekTemplate[] = [];

    for (const raw of input.sessions) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      const day = typeof s.day === "string" && (DAYS as readonly string[]).includes(s.day) ? s.day : null;
      const name = typeof s.name === "string" ? s.name.trim() : "";
      if (!day || !name) continue;
      const weekNo = typeof s.week === "number" ? Math.max(1, Math.min(MAX_WEEKS, Math.round(s.week))) : 1;
      const type: SessionType = typeof s.type === "string" && SESSION_TYPES.includes(s.type as SessionType) ? s.type as SessionType : "volume";
      const diff = typeof s.target_difficulty === "number" ? Math.max(1, Math.min(10, Math.round(s.target_difficulty))) : 5;
      const notes = typeof s.notes === "string" ? s.notes.trim() : "";
      while (weeks.length < weekNo) weeks.push(emptyWeek());
      const session: SessionTemplate = { name, notes: notes || null, target_difficulty: diff, load: 2, type };
      weeks[weekNo - 1][day].push(session);
    }

    // Une semaine sans aucune séance au milieu (numérotation sautée par le modèle) est retirée :
    // on garde la suite des semaines réellement transcrites.
    const filled = weeks.filter(w => Object.values(w).some(arr => arr.length));
    if (!filled.length) throw new Error("Reconstruction vide — aucune séance valide dans la sortie de l'outil");

    const template: ProgramTemplate = { weeks: filled };
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    // Repli explicite — jamais d'écran cassé sur un échec Claude (timeout, refus d'appeler
    // l'outil, forme inattendue, image illisible) : même convention que /api/sports/custom.
    console.error("[api/programs/import] échec parsing:", err);
    return NextResponse.json({ ok: false, error: "On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte." });
  }
}
