import { addDays, format, startOfWeek } from "date-fns";
import { pickRelevantAssignment, programWeekIndex } from "@/lib/programAssignment";
import { programSportEmoji } from "@/lib/sportCategories";
import { sportShortLabel } from "@/lib/sportShortLabel";
import type { ActivitySubject } from "@/lib/activityStatus";

export type ActivityProgramRow = { id: string; name: string; sport: string | null; weeks_count: number };
export type ActivityAssignmentRow = { start_date: string; athlete_id?: string | null; user_id?: string | null; programs: ActivityProgramRow | ActivityProgramRow[] | null };
export type ActivitySessionRow = { date: string; name: string; done: boolean };

/* Pilule d'activité du header (2026-10-03) : fonction pure, partagée par GET /api/activity/status et
   la sandbox (données d'exemple), pour que les deux affichent exactement la même chose.
   Actif = au moins une séance prévue à venir (aujourd'hui compris, pas encore faite), programme ou
   pas. Illustration : l'emoji du sport (programme, puis profil), partout — les photos de programme
   étaient illisibles à cette taille (Gildas, 2026-10-03). */
export function buildActivitySubject(
  id: string, name: string, profileSport: string | null,
  assignments: ActivityAssignmentRow[], sessions: ActivitySessionRow[], today: string,
): ActivitySubject {
  const monday = format(startOfWeek(new Date(today + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const sunday = format(addDays(new Date(monday + "T12:00:00"), 6), "yyyy-MM-dd");
  const week = sessions.filter(s => s.date >= monday && s.date <= sunday);
  const next = sessions.filter(s => s.date >= today && !s.done).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const a = pickRelevantAssignment(assignments);
  const p = a ? (Array.isArray(a.programs) ? a.programs[0] : a.programs) : null;
  const sport = p?.sport ?? profileSport;
  const label = sportShortLabel(sport);
  return {
    id, name,
    active: !!next,
    label,
    emoji: programSportEmoji(sport),
    program: a && p ? { id: p.id, name: p.name, week: Math.min(Math.max(programWeekIndex(a.start_date, today), 0) + 1, p.weeks_count), weeks: p.weeks_count } : null,
    weekDone: week.filter(s => s.done).length,
    weekTotal: week.length,
    next: next ? { date: next.date, name: next.name } : null,
  };
}
