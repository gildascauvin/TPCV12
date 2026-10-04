import { format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivityStatus } from "@/lib/activityStatus";
import { buildActivitySubject as subject, type ActivityAssignmentRow as AssignmentRow, type ActivitySessionRow as SessionRow } from "@/lib/activitySubject";
import { findProgramForWeek } from "@/lib/programAssignment";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Sans `template` (lourd) : le contenu n'est chargé que pour le sportif affiché (voir withTemplate).
const PROGRAM_COLS = "programs(id, name, sport, weeks_count)";

/* Barres de charge : contenu du programme qui couvre la semaine affichée, pour UN sportif seulement
   (celui du bandeau). Les autres n'en ont pas besoin (voyant seul dans la barre des sportifs). */
async function withTemplate(
  db: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { template: unknown } | null }> } } } },
  assignments: AssignmentRow[], monday: string,
): Promise<AssignmentRow[]> {
  const match = findProgramForWeek(assignments.map(a => ({ start_date: a.start_date, programs: a.programs })), monday);
  if (!match) return assignments;
  const { data } = await db.from("programs").select("template").eq("id", match.program.id).maybeSingle();
  if (!data) return assignments;
  return assignments.map(a => {
    const p = Array.isArray(a.programs) ? a.programs[0] : a.programs;
    return p && p.id === match.program.id ? { ...a, programs: { ...p, template: data.template } } : a;
  });
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const todayParam = params.get("today");
  const today = todayParam && ISO.test(todayParam) ? todayParam : new Date().toISOString().slice(0, 10);
  // Période affichée par la page (jour sur l'Accueil, semaine sur le Planning). Défaut : aujourd'hui.
  const fromParam = params.get("from"), toParam = params.get("to");
  const from = fromParam && ISO.test(fromParam) ? fromParam : today;
  const to = toParam && ISO.test(toParam) && toParam >= from ? toParam : from;
  const anchorParam = params.get("anchor");
  const anchor = anchorParam && ISO.test(anchorParam) ? anchorParam : (from > today ? from : today);
  const period = { from, to, anchor };
  const subjectId = params.get("subject") || null;
  const mondayOf = (d: string) => format(startOfWeek(new Date(d + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  // Semaine courante (état actuel), semaine affichée (bandeau) et séances à venir.
  const since = [mondayOf(today), mondayOf(from), today].sort()[0];

  // Profil et roster en parallèle (le roster est vide pour un sportif, requête quasi gratuite).
  const [{ data: profile }, { data: athletes }] = await Promise.all([
    supabase.from("profiles").select("mode, name, sport, free_training_label").eq("user_id", user.id).maybeSingle(),
    supabase.from("coach_athletes").select("id, name, sport, user_id, free_training_label").eq("coach_id", user.id).order("created_at"),
  ]);

  if (profile?.mode !== "coach") {
    const [aRes, sRes] = await Promise.all([
      supabase.from("program_assignments").select(`start_date, ${PROGRAM_COLS}`).eq("user_id", user.id).eq("status", "active"),
      supabase.from("sessions").select("date, name, done").eq("user_id", user.id).gte("date", since),
    ]);
    const asg = await withTemplate(supabase as never, (aRes.data ?? []) as AssignmentRow[], from);
    const self = subject(
      user.id, profile?.name ?? "", profile?.sport ?? null,
      asg, (sRes.data ?? []) as SessionRow[], today,
      period, (profile?.free_training_label as Record<string, string> | null) ?? null,
    );
    return Response.json({ role: "athlete", self, athletes: [] } satisfies ActivityStatus);
  }

  const list = athletes ?? [];
  const ids = list.map(a => a.id);
  const userIds = list.map(a => a.user_id).filter((x): x is string => !!x);
  const admin = createAdminClient();
  const [realSess, demoSess, byAthlete, byUser, realProfiles] = await Promise.all([
    userIds.length ? admin.from("sessions").select("user_id, date, name, done").in("user_id", userIds).gte("date", since) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("coach_sessions").select("athlete_id, date, name, done").eq("coach_id", user.id).in("athlete_id", ids).gte("date", since) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("program_assignments").select(`athlete_id, start_date, ${PROGRAM_COLS}`).eq("status", "active").in("athlete_id", ids) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("program_assignments").select(`user_id, start_date, ${PROGRAM_COLS}`).eq("status", "active").in("user_id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("user_id, sport, free_training_label").in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  type RealProfile = { user_id: string; sport: string | null; free_training_label: Record<string, string> | null };
  const out = await Promise.all(list.map(async a => {
    // Même fusion que Coach Control : séances du sportif inscrit + séances posées par le coach.
    const sess = [
      ...((realSess.data ?? []) as (SessionRow & { user_id: string })[]).filter(s => a.user_id && s.user_id === a.user_id),
      ...((demoSess.data ?? []) as (SessionRow & { athlete_id: string })[]).filter(s => s.athlete_id === a.id),
    ];
    const rows = [
      ...((byAthlete.data ?? []) as AssignmentRow[]).filter(x => x.athlete_id === a.id),
      ...((byUser.data ?? []) as AssignmentRow[]).filter(x => a.user_id && x.user_id === a.user_id),
    ];
    const asg = a.id === subjectId ? await withTemplate(admin as never, rows, from) : rows;
    const real = a.user_id ? ((realProfiles.data ?? []) as RealProfile[]).find(p => p.user_id === a.user_id) : undefined;
    // Thème de semaine : celui du sportif inscrit (profiles), sinon celui posé par le coach.
    const labels = real ? real.free_training_label : (a.free_training_label as Record<string, string> | null);
    return subject(a.id, a.name, real?.sport ?? a.sport ?? null, asg, sess, today, period, labels);
  }));
  return Response.json({ role: "coach", self: null, athletes: out } satisfies ActivityStatus);
}
