import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Objectifs d'un sportif vus et fixés par son coach (23/11/2026). Table `objectives` en RLS propriétaire :
   le coach passe par ici (client admin après vérification du lien coach_athletes), comme /api/coach/checkin.
   GET ?athleteId=<coach_athletes.id> : ses objectifs + les données qui les mesurent (tests, résultats et séries
   du sportif ET ceux saisis par le coach, séances 120 j, rythme). POST { athleteId, items } : remplace la liste. */

async function linkFor(athleteId: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "Non authentifié" }, { status: 401 }) };
  if (typeof athleteId !== "string") return { error: Response.json({ error: "Sportif manquant" }, { status: 400 }) };
  const { data: link, error } = await supabase.from("coach_athletes").select("id,user_id").eq("id", athleteId).eq("coach_id", user.id).maybeSingle();
  if (error) return { error: Response.json({ error: error.message }, { status: 500 }) };
  if (!link) return { error: Response.json({ error: "Sportif introuvable" }, { status: 404 }) };
  /* Sportif inscrit : objectifs sur son compte (il les voit). Sans compte : sur sa fiche coach (24/11). */
  const athleteUserId = (link.user_id as string | null) ?? null;
  const owner = athleteUserId ? { col: "user_id", val: athleteUserId } : { col: "coach_athlete_id", val: link.id as string };
  return { coachId: user.id, athleteUserId, coachAthleteId: link.id as string, owner };
}

export async function GET(req: Request) {
  const l = await linkFor(new URL(req.url).searchParams.get("athleteId"));
  if ("error" in l) return l.error;
  const admin = createAdminClient();
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const subj = l.athleteUserId ? `subject_user_id.eq.${l.athleteUserId},subject_coach_athlete_id.eq.${l.coachAthleteId}` : `subject_coach_athlete_id.eq.${l.coachAthleteId}`;
  const sessQ = admin.from("sessions").select("date,done,rpe,duration,name,notes").gte("date", since);
  const [objs, results, reps, sessions, profile] = await Promise.all([
    admin.from("objectives").select("objective_id,start_date,deadline").eq(l.owner.col, l.owner.val).order("created_at"),
    admin.from("test_results").select("id,test_id,date,value,unit,video_url").or(subj).order("date"),
    admin.from("strength_reps").select("id,test_id,date,reps,weight").or(subj).order("date"),
    /* Sans compte, ses séances vivent dans coach_sessions (athlete_id = fiche coach). */
    l.athleteUserId ? sessQ.eq("user_id", l.athleteUserId) : admin.from("coach_sessions").select("date,done,rpe,duration,name,notes").eq("athlete_id", l.coachAthleteId).gte("date", since),
    l.athleteUserId ? admin.from("profiles").select("freq_target").eq("user_id", l.athleteUserId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const err = [objs, results, reps, sessions, profile].find(r => r.error)?.error;
  if (err) return Response.json({ error: err.message }, { status: 500 });
  const testIds = Array.from(new Set([...(results.data ?? []), ...(reps.data ?? [])].map(r => r.test_id)));
  const tests = testIds.length ? await admin.from("tests").select("id,name,name_key,unit,qualities").in("id", testIds) : { data: [], error: null };
  if (tests.error) return Response.json({ error: tests.error.message }, { status: 500 });
  return Response.json({
    items: (objs.data ?? []).map(o => ({ id: o.objective_id, start: o.start_date, deadline: o.deadline })),
    data: { tests: tests.data ?? [], results: results.data ?? [], strengthReps: reps.data ?? [], sessions: sessions.data ?? [], wellness: [], freqTarget: (profile.data as { freq_target?: number | null } | null)?.freq_target ?? 3 },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const l = await linkFor(body.athleteId);
  if ("error" in l) return l.error;
  const items = Array.isArray(body.items) ? body.items.slice(0, 3) as { id: string; start: string; deadline: string }[] : null;
  if (!items || items.some(i => typeof i?.id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(i.start) || !/^\d{4}-\d{2}-\d{2}$/.test(i.deadline))) {
    return Response.json({ error: "Objectifs invalides" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: current, error: readErr } = await admin.from("objectives").select("objective_id").eq(l.owner.col, l.owner.val);
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  const removed = (current ?? []).map(c => c.objective_id as string).filter(id => !items.some(i => i.id === id));
  if (removed.length) {
    const { error } = await admin.from("objectives").delete().eq(l.owner.col, l.owner.val).in("objective_id", removed);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  /* Nouveaux objectifs : fixés par le coach (set_by). Existants : seule l'échéance change, l'auteur reste. */
  const existing = new Set((current ?? []).map(c => c.objective_id as string));
  const added = items.filter(i => !existing.has(i.id));
  if (added.length) {
    const { error } = await admin.from("objectives").insert(added.map(i => ({ [l.owner.col]: l.owner.val, objective_id: i.id, start_date: i.start, deadline: i.deadline, set_by: l.coachId })));
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  for (const i of items.filter(x => existing.has(x.id))) {
    const { error } = await admin.from("objectives").update({ deadline: i.deadline }).eq(l.owner.col, l.owner.val).eq("objective_id", i.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
