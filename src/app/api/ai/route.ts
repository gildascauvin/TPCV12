import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { AIAdvice, Objective } from "@/types";

const client = new Anthropic();

interface AIRequestBody {
  wellness: {
    sleep: number;
    stress: number;
    recovery: number;
    motivation: number;
    score: number;
    behaviors: string[];
  };
  sessions_semaine: Array<{ name: string; rpe: number | null; duration: number | null; done: boolean }>;
  profil: { sport: string | null; objective: Objective | null };
  comportements: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: AIRequestBody = await request.json();

  const prompt = `Données athlète :
- Sport : ${body.profil.sport ?? "non renseigné"}
- Objectif : ${body.profil.objective ?? "non renseigné"}
- Wellness aujourd'hui : sommeil ${body.wellness.sleep}/10, stress ${body.wellness.stress}/10, récupération ${body.wellness.recovery}/10, motivation ${body.wellness.motivation}/10, score global ${body.wellness.score}/100
- Comportements négatifs : ${body.wellness.behaviors.join(", ") || "aucun"}
- Séances cette semaine : ${JSON.stringify(body.sessions_semaine)}

Génère deux conseils courts, pratiques et personnalisés.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: `Tu es l'agent d'autorégulation de ThePerfClub. Tu reçois les données wellness et d'entraînement d'un athlète et tu génères deux conseils courts : un sur l'entraînement du jour (intensité recommandée), un sur la récupération (comportements à corriger). Adapte les conseils à l'objectif : performance / longévité / stress / composition / équilibre / réhabilitation. Réponds uniquement en JSON valide : { "training": string, "recovery": string }`,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const advice: AIAdvice = jsonMatch ? JSON.parse(jsonMatch[0]) : { training: text, recovery: "" };
    return NextResponse.json(advice);
  } catch {
    return NextResponse.json({ training: text, recovery: "" });
  }
}
