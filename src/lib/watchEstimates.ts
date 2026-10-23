import type { Session } from "@/types";
import { matchWorkout, personalRpeFor, type PhysioSession, type PhysioWorkout } from "@/lib/physioCompare";

/* Séances estimées depuis la montre (2026-10-23, Gildas : « faut tout récupérer au possible pour
   alimenter les charts »). Un entraînement montre (Apple Santé ou Garmin, health_workouts) qui ne
   correspond à aucune séance notée compte dans la charge avec un RPE ESTIMÉ, avant comme après
   l'inscription : une vraie séance comptée à zéro ferait croire que la charge baisse. Dès que le
   sportif note la séance, la note remplace l'estimation (l'entraînement est alors « apparié »).

   Ces séances ne servent QU'AUX CALCULS de charge (ACWR, monotonie, contrainte, Forme, insights,
   pénalité chronique de la décision). Elles ne sont jamais affichées comme séances (Planning, cartes,
   checklist), d'où une fonction séparée que chaque appelant applique à la liste qu'il passe au moteur.
   Elles portent `estimated: true` ; decisionCard ignore ce drapeau pour « séance faite aujourd'hui ».

   RPE estimé : relation apprise sur le sportif (personalRpeFor, ≥ 8 séances notées du même type),
   sinon règle générale = la fraction de FC de réserve déduite du TRIMP par minute (même formule de
   Banister que la synchro), ×10. Limite connue : la FC sous-estime la force et les sprints. */

export type EstimatedSession = Session & { estimated: true };
export type WatchWorkout = PhysioWorkout & { platform_id?: string | null };

/* TRIMP/min de Banister = r × 0,64 × e^(1,92 r), r = fraction de FC de réserve. Inversé par bissection. */
function reserveFractionFromTrimpPerMin(tpm: number): number {
  let lo = 0, hi = 1.2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (mid * 0.64 * Math.exp(1.92 * mid) < tpm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function genericRpeFromTrimp(trimp: number, durationMin: number): number {
  const r = reserveFractionFromTrimpPerMin(trimp / Math.max(1, durationMin));
  return Math.min(10, Math.max(1, Math.round(r * 100) / 10));
}

export function estimateRpe(w: PhysioWorkout, sessions: PhysioSession[], workouts: PhysioWorkout[]): number | null {
  if (w.trimp == null || w.duration_min < 10) return null;
  const personal = personalRpeFor(w, sessions, workouts);
  const rpe = personal ?? genericRpeFromTrimp(w.trimp, w.duration_min);
  return Math.round(rpe * 10) / 10;
}

/* Entraînements montre non appariés à une séance notée → séances estimées (jamais pour un jour au-delà
   de `until`, la séance du jour comprise). */
export function watchEstimatedSessions(
  sessions: Pick<Session, "id" | "date" | "duration" | "rpe" | "done">[],
  workouts: WatchWorkout[] | null | undefined,
  until?: string,
): EstimatedSession[] {
  if (!workouts?.length) return [];
  const noted = sessions.filter(s => s.done && s.rpe != null);
  const matched = new Set<WatchWorkout>();
  noted.forEach(s => { const w = matchWorkout(s, workouts); if (w) matched.add(w as WatchWorkout); });
  const physioSessions: PhysioSession[] = noted.map(s => ({ id: s.id, date: s.date, duration: s.duration, rpe: s.rpe, done: true }));
  const out: EstimatedSession[] = [];
  workouts.forEach((w, i) => {
    if (matched.has(w) || w.trimp == null || w.duration_min < 10) return;
    /* Marche exclue : en prod, la plupart sont des trajets détectés automatiquement par la montre
       (23 sur 38 entraînements non notés au 23/10), pas de l'entraînement. */
    if (/walk/i.test(w.workout_type ?? "")) return;
    if (until && w.date > until) return;
    const rpe = estimateRpe(w, physioSessions, workouts);
    if (rpe == null) return;
    out.push({
      id: `est:${w.platform_id ?? `${w.start_at}-${i}`}`, user_id: "", date: w.date, name: "Entraînement montre",
      notes: null, duration: Math.round(w.duration_min), rpe, done: true, target_difficulty: null, created_at: w.start_at,
      estimated: true,
    });
  });
  return out;
}

/* La liste à passer au moteur de charge : séances réelles + séances estimées. */
export function withWatchEstimates<T extends Pick<Session, "id" | "date" | "duration" | "rpe" | "done">>(
  sessions: T[],
  workouts: WatchWorkout[] | null | undefined,
  until?: string,
): (T | EstimatedSession)[] {
  const est = watchEstimatedSessions(sessions, workouts, until);
  return est.length ? [...sessions, ...est] : sessions;
}

export const isEstimated = (s: object): boolean => (s as { estimated?: boolean }).estimated === true;
