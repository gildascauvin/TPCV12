import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachAthlete, Session, WellnessDaily, CoachSession } from "@/types";
import { buildDailyTimeSeries, computeSignature, type AthleteSignature } from "@/lib/fatigueSignature";
import { daysAgoStr } from "@/lib/trainingLoad";
import { coachWellnessScoreFor } from "@/lib/sandboxFixtures";
import { computeWellnessBaselineAt, computeWellnessBaselineSeries, wellnessSignal, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";

/* Signatures de fatigue par sportif pour /coach/athletes, paramétré par une date de
   référence — réutilisé par la page (SSR, date = aujourd'hui) et par
   GET /api/coach/athletes?date=... (sélecteur de calendrier, voir AthletesClient.tsx). `admin`
   attendu (bypass RLS nécessaire pour lire les sessions/wellness d'autres utilisateurs, même
   pattern que /api/coach/wellness).

   Fenêtre à CONSEILS_HISTORY_DAYS jours (comme /conseils, 2026-09-24 — cran 90j ajouté au toggle
   RangeToggle) : le chart de zone ACWR affiche 7/28/90 derniers jours selon le toggle, et
   acwrSeries/formPercentSeries n'ont une valeur valide qu'à partir du 14e jour de la série fournie —
   il faut donc n-fenêtreAffichée+1 >= 14. Pour 90j affichés (le cas le plus large) : n >= 103 ; 104
   aligne avec /conseils et garantit les 90 points de la vue la plus large. */
export async function getAthletesSignatures(
  admin: SupabaseClient,
  athletes: CoachAthlete[],
  referenceDate: string
): Promise<{
  signatures: Record<string, AthleteSignature>;
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) du jour de référence + série 42j
     (même alignement que `series` dans AthleteSignature), par sportif. */
  baselines: Record<string, WellnessBaselineResult | null>;
  baselineSeries: Record<string, (WellnessBaselineResult | null)[]>;
}> {
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const demoAthleteIds = athletes.filter(a => !a.user_id).map(a => a.id);
  const anchor = new Date(referenceDate + "T12:00:00");
  const since42 = daysAgoStr(CONSEILS_HISTORY_DAYS, anchor);

  const [sessionsRes, wellnessRes, demoSessionsRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", since42).lte("date", referenceDate)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", since42).lte("date", referenceDate)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
    demoAthleteIds.length
      ? admin.from("coach_sessions").select("*").in("athlete_id", demoAthleteIds).gte("date", since42).lte("date", referenceDate)
      : Promise.resolve({ data: [] as CoachSession[] }),
  ]);
  const allSessions = (sessionsRes.data || []) as Session[];
  const allWellness = (wellnessRes.data || []) as WellnessDaily[];
  const allDemoSessions = (demoSessionsRes.data || []) as CoachSession[];

  const signatures: Record<string, AthleteSignature> = {};
  const baselines: Record<string, WellnessBaselineResult | null> = {};
  const baselineSeries: Record<string, (WellnessBaselineResult | null)[]> = {};
  for (const a of athletes) {
    if (!a.user_id) {
      /* Sportif démo : coach_sessions déjà réels (buildCoachDemoSessions), mais wellness_daily
         structurellement impossible (RLS `auth.uid() = user_id`, athlete.user_id est null) — donc
         signature/tendance/graphe calculées sur un historique wellness synthétique déterministe
         (coachWellnessScoreFor, même fonction que la sandbox — aucune logique dupliquée),
         convergeant vers le score statique du profil. Charge/séances restent 100% réelles. */
      const mySessions: Session[] = allDemoSessions
        .filter(s => s.athlete_id === a.id)
        .map(s => ({
          id: s.id, user_id: a.id, date: s.date, name: s.name, notes: s.notes,
          duration: s.duration, rpe: s.rpe, done: s.done, target_difficulty: s.target_difficulty,
          created_at: s.created_at,
        }));
      const myWellness: WellnessDaily[] = [];
      for (let offset = -CONSEILS_HISTORY_DAYS; offset <= 0; offset++) {
        const score = coachWellnessScoreFor(offset, a.wellness_score);
        myWellness.push({
          id: `demo-wellness-${a.id}-${offset}`, user_id: a.id, date: daysAgoStr(-offset, anchor),
          sleep: score < 50 ? 3 : score < 70 ? 5 : 7, stress: score < 50 ? 7 : 4, recovery: score < 50 ? 3 : 6, motivation: score < 50 ? 4 : 7,
          base_score: score, score, behaviors: [], bedtime: "23:00", created_at: new Date().toISOString(),
        });
      }
      const series = buildDailyTimeSeries(mySessions, myWellness, CONSEILS_HISTORY_DAYS, anchor);
      const sig = computeSignature(mySessions, a.wellness_score, 28, anchor);
      signatures[a.id] = { kind: "ok", series, sig };
      const demoTodayRow = myWellness.find(w => w.date === referenceDate) ?? null;
      const demoBaseline = demoTodayRow
        ? computeWellnessBaselineAt(myWellness.filter(w => w.date < referenceDate), demoTodayRow)
        : null;
      baselines[a.id] = demoBaseline;
      baselineSeries[a.id] = computeWellnessBaselineSeries(myWellness, CONSEILS_HISTORY_DAYS, anchor);
      continue;
    }
    const myWellness = allWellness.filter(w => w.user_id === a.user_id);
    const mySessions = allSessions.filter(s => s.user_id === a.user_id);
    if (myWellness.length === 0) {
      signatures[a.id] = { kind: "no_data" }; baselines[a.id] = null; baselineSeries[a.id] = [];
      continue;
    }
    const refWellness = myWellness.find(w => w.date === referenceDate);
    // base_score en priorité (jamais score, qui inclut le bonus/malus comportements).
    const wellnessScore = refWellness ? (wellnessSignal(refWellness) ?? 75) : 75;
    const series = buildDailyTimeSeries(mySessions, myWellness, CONSEILS_HISTORY_DAYS, anchor);
    const sig = computeSignature(mySessions, wellnessScore, 28, anchor);
    signatures[a.id] = { kind: "ok", series, sig };
    const baseline = refWellness
      ? computeWellnessBaselineAt(myWellness.filter(w => w.date < referenceDate), refWellness)
      : null;
    baselines[a.id] = baseline;
    baselineSeries[a.id] = computeWellnessBaselineSeries(myWellness, CONSEILS_HISTORY_DAYS, anchor);
  }

  return { signatures, baselines, baselineSeries };
}
