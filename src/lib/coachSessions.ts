import type { CoachAthlete, CoachViewSession, Session, CoachSession } from "@/types";

export function realToView(s: Session, athletes: CoachAthlete[]): CoachViewSession {
  const athlete = athletes.find(a => a.user_id === s.user_id);
  return {
    id: s.id,
    athlete_id: athlete?.id ?? "",
    date: s.date,
    name: s.name,
    notes: s.notes,
    duration: s.duration,
    rpe: s.rpe,
    done: s.done,
    target_difficulty: s.target_difficulty,
    created_at: s.created_at,
    _real: true,
  };
}

export function demoToView(s: CoachSession): CoachViewSession {
  return {
    id: s.id,
    athlete_id: s.athlete_id,
    date: s.date,
    name: s.name,
    notes: s.notes,
    duration: s.duration,
    rpe: s.rpe,
    done: s.done,
    target_difficulty: s.target_difficulty,
    created_at: s.created_at,
    _real: false,
  };
}

export function buildWellnessMap(
  rows: { user_id: string; date: string; score: number | null }[]
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (r.score == null) continue;
    if (!map[r.user_id]) map[r.user_id] = {};
    map[r.user_id][r.date] = r.score;
  }
  return map;
}
