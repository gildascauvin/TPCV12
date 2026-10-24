import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Données du bilan d'un sportif, vues par son coach (2026-10-24). Mêmes lectures que BilanCarousel
   côté sportif ; le coach ne lit pas les lignes d'un autre user_id (RLS), donc client admin après
   vérification que ce sportif est bien le sien (même pattern que /api/coach/wellness). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const url = new URL(req.url);
  const athleteId = url.searchParams.get("athleteId");
  const today = url.searchParams.get("today");
  if (!athleteId || !today) return Response.json({ error: "athleteId et today requis" }, { status: 400 });

  const { data: link, error: linkErr } = await supabase
    .from("coach_athletes").select("user_id").eq("id", athleteId).eq("coach_id", user.id).maybeSingle();
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  if (!link?.user_id) return Response.json({ error: "Sportif introuvable" }, { status: 404 });
  const uid = link.user_id as string;

  const admin = createAdminClient();
  const [p, s, w, t] = await Promise.all([
    admin.from("profiles").select("created_at, autoreg_shift, autoreg_shift_high, autoreg_recal_events").eq("user_id", uid).maybeSingle(),
    admin.from("sessions").select("id,date,name,notes,rpe,target_difficulty,duration,done,created_at,autoreg_decision,autoreg_proposal,autoreg_followed").eq("user_id", uid).eq("done", true).lte("date", today),
    admin.from("wellness_daily").select("date,sleep,stress,recovery,motivation,score,base_score,behaviors,bedtime,device_sleep_minutes,device_hrv_ms,device_resting_hr,device_rhr_baseline,device_hrv_baseline,created_at").eq("user_id", uid).lte("date", today),
    admin.from("test_results").select("date,value,unit,tests(name)").eq("subject_user_id", uid),
  ]);
  const err = p.error || s.error || w.error || t.error;
  if (err) return Response.json({ error: err.message }, { status: 500 });
  return Response.json({ profile: p.data, sessions: s.data ?? [], checkins: w.data ?? [], tests: t.data ?? [] });
}
