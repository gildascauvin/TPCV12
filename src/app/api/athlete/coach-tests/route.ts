import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Symétrique de /api/coach/athlete-tests : un résultat que le COACH a enregistré pour ce sportif
   vit sous l'owner_id du coach (subject_coach_athlete_id = la ligne coach_athletes qui représente
   ce sportif) — RLS (auth.uid()=owner_id) bloque sa lecture directe par le sportif lui-même, même
   en lecture seule. Aucun paramètre : toujours "le coach du sportif actuellement connecté", résolu
   via profiles.invited_by_coach_id (même champ déjà utilisé par coachIsPaying/hasActiveCoach). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("invited_by_coach_id").eq("user_id", user.id).single();
  const coachId = profile?.invited_by_coach_id;
  if (!coachId) return Response.json({ ok: true, tests: [], results: [] });

  const admin = createAdminClient();

  const { data: coachAthlete } = await admin
    .from("coach_athletes").select("id").eq("coach_id", coachId).eq("user_id", user.id).maybeSingle();
  if (!coachAthlete) return Response.json({ ok: true, tests: [], results: [] });

  const [{ data: tests }, { data: results }] = await Promise.all([
    admin.from("tests").select("id,name,name_key,unit").eq("owner_id", coachId).order("name"),
    admin.from("test_results").select("id,test_id,date,value,unit,video_url")
      .eq("owner_id", coachId).eq("subject_coach_athlete_id", coachAthlete.id).order("date"),
  ]);

  return Response.json({ ok: true, tests: tests ?? [], results: results ?? [] });
}
