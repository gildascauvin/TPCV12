import { createAdminClient } from "@/lib/supabase/admin";

/* Séances de la bibliothèque officielle pour « Créer une séance › Modèle » (SessionQuickFill).
   Bug du 2026-10-07 : depuis le 2026-10-04, /api/programs/library ne renvoie plus `template` (perf),
   le picker Modèle ne trouvait donc plus aucune séance. Cette route garde la liste légère : seule la
   1re semaine de chaque modèle est renvoyée (c'est tout ce que le picker affiche). Même posture que
   /api/programs/library (public, client admin, revalidée toutes les 5 min). */
export const revalidate = 300;

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("programs")
    .select("name, sport, template")
    .eq("is_official_template", true)
    .order("name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  const programs = (data ?? []).map(p => ({
    name: p.name,
    sport: p.sport,
    template: { weeks: (p.template as { weeks?: unknown[] } | null)?.weeks?.slice(0, 1) ?? [] },
  }));
  return Response.json({ programs });
}
