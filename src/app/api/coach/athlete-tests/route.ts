import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Résultats de test qu'un vrai sportif a enregistrés LUI-MÊME (via son propre /conseils ou ses
   propres séances) — vivent sous son propre owner_id, RLS (auth.uid()=owner_id) bloque donc leur
   lecture directe par le coach, même en lecture seule. Même garde d'accès que
   /api/coach/session-history : vérifie que ce coach_athlete appartient bien au coach connecté avant
   de lire via le client admin. But : que "un coach qui a un sportif voit ses tests" marche pour de
   vrai — pas seulement quand coach et sportif sont la même personne (auto-coach). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athleteId");
  if (!athleteId) return Response.json({ error: "athleteId requis" }, { status: 400 });

  const { data: athlete } = await supabase
    .from("coach_athletes")
    .select("id, user_id, coach_id")
    .eq("id", athleteId)
    .eq("coach_id", user.id)
    .single();
  if (!athlete) return Response.json({ error: "Sportif introuvable" }, { status: 404 });

  // Démo / invitation en attente : pas de compte réel, donc rien à fusionner.
  if (!athlete.user_id) return Response.json({ ok: true, tests: [], results: [] });

  const admin = createAdminClient();
  const [{ data: tests }, { data: results }] = await Promise.all([
    admin.from("tests").select("id,name,name_key,unit").eq("owner_id", athlete.user_id).order("name"),
    admin.from("test_results").select("id,test_id,date,value,unit,video_url")
      .eq("owner_id", athlete.user_id).eq("subject_user_id", athlete.user_id).order("date"),
  ]);

  return Response.json({ ok: true, tests: tests ?? [], results: results ?? [] });
}
