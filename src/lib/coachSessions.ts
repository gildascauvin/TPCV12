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
    exercise_media: s.exercise_media,
    viewed_by_athlete_at: s.viewed_by_athlete_at,
    viewed_by_coach_at: s.viewed_by_coach_at,
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
    exercise_media: s.exercise_media,
    viewed_by_athlete_at: s.viewed_by_athlete_at,
    viewed_by_coach_at: s.viewed_by_coach_at,
  };
}

/* `base_score` en priorité (jamais `score`, qui inclut le bonus/malus comportements) — voir
   wellnessSignal() dans wellnessBaseline.ts pour le pourquoi. `base_score` optionnel dans le type
   pour rester compatible avec les appelants qui ne le sélectionnent pas encore en base (repli sur
   `score` dans ce cas, comportement inchangé). */
export function buildWellnessMap(
  rows: { user_id: string; date: string; score: number | null; base_score?: number | null }[]
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const v = r.base_score ?? r.score;
    if (v == null) continue;
    if (!map[r.user_id]) map[r.user_id] = {};
    map[r.user_id][r.date] = v;
  }
  return map;
}
