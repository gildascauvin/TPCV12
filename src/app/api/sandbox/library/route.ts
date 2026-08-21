import { createAdminClient } from "@/lib/supabase/admin";

/* Sandbox uniquement (2026-08-20) — GET /api/programs (utilisé par ProgramLibraryPage.tsx en
   temps normal) est une route authentifiée qui renvoie la bibliothèque du user courant ; un
   visiteur anonyme n'a évidemment aucune bibliothèque. Plutôt que montrer une bibliothèque vide,
   Gildas a demandé "quelques exemples de programmes" représentatifs des curriculums réels du
   générateur — cette route publique (bypass RLS via admin client, même pattern que /p/[id]) sert
   une sélection fixe de 8 programmes publics réels, un par grande famille de curriculum. Lecture
   seule : aucune écriture, jamais liée à un compte. */
const CURATED_PROGRAM_IDS = [
  "d85c3fff-51df-466c-92cf-54b675fa7ed4", // 🏋️ Haltérophilie
  "55d6d90f-f35f-46e3-a81c-9b928a6f432c", // 🦍 Powerlifting
  "9918f6ab-7251-47d4-b50b-6c8732279fb7", // 💪 Musculation / Hypertrophie
  "698b8601-93ca-4893-886a-5224d3ca1b9a", // 🔥 Fitness / CrossFit
  "e1037e4f-6ee9-407b-b68f-751cc425a25f", // 🏃 Athlétisme & vitesse
  "bab4683e-a599-4c26-908f-5882d328aa54", // ⚽ Sports collectifs
  "6ddca6dd-e97f-4271-b4fc-7b4c63023cad", // 🏊 Endurance
  "1a6275e6-0f4c-448f-8389-0ce8d4bf9151", // 🥋 Arts martiaux & combat
];

export async function GET() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("programs")
    .select("*")
    .in("id", CURATED_PROGRAM_IDS)
    .eq("is_public", true);

  const byId = new Map((data ?? []).map(p => [p.id, p]));
  const programs = CURATED_PROGRAM_IDS.map(id => byId.get(id)).filter(Boolean);

  return Response.json({ programs, assignments: [] });
}
