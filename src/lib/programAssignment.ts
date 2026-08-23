export interface AssignmentLike {
  start_date: string;
  programs: { weeks_count: number } | { weeks_count: number }[] | null;
}

function weeksCountOf(programs: AssignmentLike["programs"]): number {
  if (!programs) return 0;
  const p = Array.isArray(programs) ? programs[0] : programs;
  return p?.weeks_count ?? 0;
}

/**
 * Parmi plusieurs assignments "active" d'un même sportif (un sportif peut enchaîner
 * plusieurs programmes futurs), choisit celui pertinent pour aujourd'hui : celui en
 * cours en priorité, sinon le plus proche à venir, sinon aucun (tous déjà terminés).
 */
export function pickRelevantAssignment<T extends AssignmentLike>(assignments: T[]): T | null {
  if (!assignments.length) return null;
  const today = new Date(new Date().toISOString().split("T")[0] + "T12:00:00").getTime();
  const withRange = assignments.map(a => {
    const start = new Date(a.start_date + "T12:00:00").getTime();
    const end = start + weeksCountOf(a.programs) * 7 * 24 * 60 * 60 * 1000;
    return { a, start, end };
  });
  const inProgress = withRange.filter(x => x.start <= today && today < x.end);
  if (inProgress.length) return inProgress.sort((x, y) => y.start - x.start)[0].a;
  const upcoming = withRange.filter(x => x.start > today);
  if (upcoming.length) return upcoming.sort((x, y) => x.start - y.start)[0].a;
  return null;
}
