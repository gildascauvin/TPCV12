import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getSportCategory, type WeaknessMeta } from "@/app/api/programs/generate/route";
import type { SessionType } from "@/types";

const client = new Anthropic();

const SESSION_TYPES: SessionType[] = ["technique", "volume", "intensite", "recuperation", "test"];

interface CustomExercises {
  technique: string[];
  volume: string[];
  intensite: string[];
  recuperation: string[];
  test: string[];
}
interface CustomWeakness { key: string; label: string; extraLine: string; typeHints: SessionType[] }

function isValidExercises(v: unknown): v is CustomExercises {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return SESSION_TYPES.every(t => {
    const arr = o[t];
    return Array.isArray(arr) && arr.length > 0 && arr.every(x => typeof x === "string" && x.trim());
  });
}

function isValidWeaknesses(v: unknown): v is CustomWeakness[] {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every(w => {
    if (!w || typeof w !== "object") return false;
    const o = w as Record<string, unknown>;
    return typeof o.key === "string" && o.key.trim() &&
      typeof o.label === "string" && o.label.trim() &&
      typeof o.extraLine === "string" && o.extraLine.trim() &&
      Array.isArray(o.typeHints) && o.typeHints.length > 0 &&
      (o.typeHints as unknown[]).every(t => SESSION_TYPES.includes(t as SessionType));
  });
}

// Sport libre non couvert par les 31 curriculums pré-construits (2026-08-06) — voir
// ProgramCriteriaModal.tsx, carte "Autre". getSportCategory() est vérifié EN PREMIER : si le
// texte matche déjà un sport existant (ex. "je fais du CrossFit"), aucun appel Claude, on retourne
// directement la catégorie déjà construite (meilleure qualité, gratuit, instantané) — Claude
// n'intervient que pour un sport réellement non couvert. Le contenu généré (banque d'exercices +
// menu de faiblesses) est ensuite injecté dans /api/programs/generate via customExercises/
// customWeaknessMeta — le moteur de périodisation (blocs, plafonds RPE, Phase A2/B) n'est jamais
// touché, Claude ne fournit que le vocabulaire, jamais la structure.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ error: "description requise" }, { status: 400 });

  const category = getSportCategory(description);
  if (category !== "autre") {
    return NextResponse.json({ matched: true, category, sportLabel: description });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `Tu es le générateur de contenu sportif de ThePerfClub. Un utilisateur décrit un sport absent de nos 31 catégories pré-construites. Génère un contenu adapté à ce sport précis, à intégrer dans un moteur de périodisation existant (blocs MEV/Surcharge/MRV/Deload) qui gère déjà toute la structure — tu fournis UNIQUEMENT le vocabulaire d'exercices et les priorités de faiblesses, jamais de structure de programme, jamais de nombre de semaines ou de séances.

Réponds uniquement en JSON valide, exactement cette forme :
{
  "weaknesses": [
    { "key": "cle_courte_sans_espace", "label": "Libellé affiché à l'utilisateur", "extraLine": "Ligne d'exercice ajoutée — format Sx R", "typeHints": ["volume","intensite","technique"] }
  ],
  "exercises": {
    "technique": ["Exercice — Sx R", "..."],
    "volume": ["Exercice — Sx R", "..."],
    "intensite": ["Exercice — Sx R", "..."],
    "recuperation": ["Exercice ou activité — durée/format", "..."],
    "test": ["Description de test ou bilan", "..."]
  }
}

Règles strictes :
- 4 à 5 entrées dans "weaknesses", clés courtes en snake_case sans accents.
- "typeHints" ne contient QUE des valeurs parmi technique/volume/intensite/recuperation/test, dans l'ordre de préférence pour cette faiblesse.
- Exactement 4 lignes par catégorie dans "exercises".
- Format des exercices "technique"/"volume"/"intensite" : "Nom de l'exercice — Sx R" (ex. "Pompes lestées — 4×8"), jamais de fourchette approximative.
- "recuperation"/"test" : texte libre plus descriptif accepté.
- Vocabulaire réellement spécifique au sport décrit (mouvements, équipement, gestes propres à cette discipline) — jamais de mouvement générique interchangeable ("squat", "gainage", "course") sauf s'il est authentiquement central à ce sport précis.`,
      messages: [{ role: "user", content: `Sport décrit par l'utilisateur : "${description}"` }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Réponse Claude sans JSON exploitable");
    const parsed = JSON.parse(jsonMatch[0]);

    if (!isValidExercises(parsed.exercises) || !isValidWeaknesses(parsed.weaknesses)) {
      throw new Error("Forme JSON invalide");
    }

    const weaknessMeta: Record<string, WeaknessMeta> = {};
    const weaknessOptions: { key: string; label: string }[] = [];
    for (const w of parsed.weaknesses as CustomWeakness[]) {
      weaknessMeta[w.key] = { extraLine: w.extraLine, typeHints: w.typeHints };
      weaknessOptions.push({ key: w.key, label: w.label });
    }

    return NextResponse.json({
      matched: false,
      sportLabel: description,
      exercises: parsed.exercises as CustomExercises,
      weaknessOptions,
      weaknessMeta,
    });
  } catch {
    // Repli explicite — le front retombe sur le contenu générique "Autre" existant, jamais
    // d'écran cassé sur un échec Claude (parsing, timeout, forme inattendue).
    return NextResponse.json({ matched: false, sportLabel: description, exercises: null, weaknessOptions: null, weaknessMeta: null });
  }
}
