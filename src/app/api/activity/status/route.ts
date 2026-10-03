import { format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityStatus } from "@/lib/activityStatus";
import { buildActivitySubject as subject, type ActivityAssignmentRow as AssignmentRow, type ActivitySessionRow as SessionRow } from "@/lib/activitySubject";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const todayParam = new URL(req.url).searchParams.get("today");
  const today = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : new Date().toISOString().slice(0, 10);
  const monday = format(startOfWeek(new Date(today + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const since = monday < today ? monday : today;

  // Profil et roster en parallèle (le roster est vide pour un sportif, requête quasi gratuite).
  const [{ data: profile }, { data: athletes }] = await Promise.all([
    supabase.from("profiles").select("mode, name, sport").eq("user_id", user.id).maybeSingle(),
    supabase.from("coach_athletes").select("id, name, sport, user_id").eq("coach_id", user.id).order("created_at"),
  ]);

  if (profile?.mode !== "coach") {
    const [aRes, sRes] = await Promise.all([
      supabase.from("program_assignments").select("start_date, programs(id, name, sport, weeks_count)").eq("user_id", user.id).eq("status", "active"),
      supabase.from("sessions").select("date, name, done").eq("user_id", user.id).gte("date", since),
    ]);
    const self = subject(user.id, profile?.name ?? "", profile?.sport ?? null, (aRes.data ?? []) as AssignmentRow[], (sRes.data ?? []) as SessionRow[], today);
    return Response.json({ role: "athlete", self, athletes: [] } satisfies ActivityStatus);
  }

  const list = athletes ?? [];
  const ids = list.map(a => a.id);
  const userIds = list.map(a => a.user_id).filter((x): x is string => !!x);
  const admin = createAdminClient();
  const [realSess, demoSess, byAthlete, byUser, realProfiles] = await Promise.all([
    userIds.length ? admin.from("sessions").select("user_id, date, name, done").in("user_id", userIds).gte("date", since) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("coach_sessions").select("athlete_id, date, name, done").eq("coach_id", user.id).in("athlete_id", ids).gte("date", since) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("program_assignments").select("athlete_id, start_date, programs(id, name, sport, weeks_count)").eq("status", "active").in("athlete_id", ids) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("program_assignments").select("user_id, start_date, programs(id, name, sport, weeks_count)").eq("status", "active").in("user_id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("user_id, sport").in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const out = list.map(a => {
    // Même fusion que Coach Control : séances du sportif inscrit + séances posées par le coach.
    const sess = [
      ...((realSess.data ?? []) as (SessionRow & { user_id: string })[]).filter(s => a.user_id && s.user_id === a.user_id),
      ...((demoSess.data ?? []) as (SessionRow & { athlete_id: string })[]).filter(s => s.athlete_id === a.id),
    ];
    const asg = [
      ...((byAthlete.data ?? []) as AssignmentRow[]).filter(x => x.athlete_id === a.id),
      ...((byUser.data ?? []) as AssignmentRow[]).filter(x => a.user_id && x.user_id === a.user_id),
    ];
    const realSport = a.user_id ? ((realProfiles.data ?? []) as { user_id: string; sport: string | null }[]).find(p => p.user_id === a.user_id)?.sport : null;
    return subject(a.id, a.name, realSport ?? a.sport ?? null, asg, sess, today);
  });
  return Response.json({ role: "coach", self: null, athletes: out } satisfies ActivityStatus);
}
