import { addDays, format, startOfWeek } from "date-fns";
import { findProgramForWeek, pickRelevantAssignment, programWeekIndex } from "@/lib/programAssignment";
import { programSportEmoji } from "@/lib/sportCategories";
import { sportShortLabel } from "@/lib/sportShortLabel";
import type { ActivitySubject } from "@/lib/activityStatus";

export type ActivityProgramRow = { id: string; name: string; sport: string | null; weeks_count: number; template?: unknown };
export type ActivityAssignmentRow = { start_date: string; athlete_id?: string | null; user_id?: string | null; programs: ActivityProgramRow | ActivityProgramRow[] | null };
export type ActivitySessionRow = { date: string; name: string; done: boolean };

const TEMPLATE_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* Difficulté moyenne prévue de chaque semaine du programme : mêmes barres que ProgramBanner. */
function weekLoads(template: unknown): number[] {
  const weeks = (template as { weeks?: Record<string, { target_difficulty?: number }[]>[] } | null)?.weeks;
  if (!Array.isArray(weeks)) return [];
  return weeks.map(w => {
    const s = TEMPLATE_DAYS.flatMap(d => w?.[d] ?? []);
    return s.length ? s.reduce((sum, x) => sum + (x.target_difficulty ?? 5), 0) / s.length : 0;
  });
}

/* Bandeau d'activité (2026-10-04, POC poc-element-activation-v5.html) : fonction pure, partagée par
   GET /api/activity/status et la sandbox, pour que les deux affichent exactement la même chose.
   - `active` (état actuel) : au moins une séance prévue à venir, programme ou pas.
   - `period*` (période affichée : le jour sur l'Accueil, la semaine sur le Planning) : le contenu
     (programme, semaine, jours, thème) suit la période ; le voyant reste la règle de base, une séance
     prévue dans le futur, pas encore faite (à partir de la période affichée si elle est à venir).
   Illustration : l'emoji du sport (programme, puis profil). */
export function buildActivitySubject(
  id: string, name: string, profileSport: string | null,
  assignments: ActivityAssignmentRow[], sessions: ActivitySessionRow[], today: string,
  period?: { from: string; to: string; anchor?: string }, freeLabels?: Record<string, string> | null,
): ActivitySubject {
  const monday = format(startOfWeek(new Date(today + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const sunday = format(addDays(new Date(monday + "T12:00:00"), 6), "yyyy-MM-dd");
  const week = sessions.filter(s => s.date >= monday && s.date <= sunday);
  const next = sessions.filter(s => s.date >= today && !s.done).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const a = pickRelevantAssignment(assignments);
  const p = a ? (Array.isArray(a.programs) ? a.programs[0] : a.programs) : null;
  const sport = p?.sport ?? profileSport;

  const from = period?.from ?? today;
  const pMonday = format(startOfWeek(new Date(from + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  // Voyant : une séance prévue dans le futur (pas encore faite), à partir de la période affichée.
  const anchor = period?.anchor ?? (from > today ? from : today);
  const periodActive = sessions.some(s => s.date >= anchor && !s.done);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = format(addDays(new Date(pMonday + "T12:00:00"), i), "yyyy-MM-dd");
    const day = sessions.filter(s => s.date === d);
    if (!day.length) return 0 as const;
    return day.every(s => s.done) ? 2 as const : 1 as const;
  });
  const viewed = findProgramForWeek(assignments.map(x => ({ start_date: x.start_date, programs: x.programs })), pMonday);
  const viewSport = viewed?.program.sport ?? sport;

  return {
    id, name,
    active: !!next,
    label: sportShortLabel(sport),
    emoji: programSportEmoji(sport),
    program: a && p ? { id: p.id, name: p.name, week: Math.min(Math.max(programWeekIndex(a.start_date, today), 0) + 1, p.weeks_count), weeks: p.weeks_count } : null,
    weekDone: week.filter(s => s.done).length,
    weekTotal: week.length,
    next: next ? { date: next.date, name: next.name } : null,
    periodActive,
    periodEmoji: programSportEmoji(viewSport),
    periodProgram: viewed
      ? { id: viewed.program.id, name: viewed.program.name, week: viewed.week, weeks: viewed.program.weeks_count, loads: weekLoads(viewed.program.template) }
      : null,
    weekMonday: pMonday,
    weekDays,
    freeLabel: freeLabels?.[pMonday]?.trim() || null,
  };
}
