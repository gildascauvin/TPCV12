import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachAthlete, Session, WellnessDaily, CoachSession } from "@/types";
import { buildDailyTimeSeries, computeSignature, type AthleteSignature } from "@/lib/fatigueSignature";
import { daysAgoStr, computeWeekOverWeekTrend, describeTrend, trendSeverity, trendActionWord, type TrendCode } from "@/lib/trainingLoad";
import { coachWellnessScoreFor } from "@/lib/sandboxFixtures";
import { computeWellnessBaselineAt, computeWellnessBaselineSeries, wellnessSignal, type WellnessBaselineResult } from "@/lib/wellnessBaseline";

/* Signatures de fatigue + tendances par sportif pour /coach/athletes, paramétré par une date de
   référence — réutilisé par la page (SSR, date = aujourd'hui) et par
   GET /api/coach/athletes?date=... (sélecteur de calendrier, voir AthletesClient.tsx). `admin`
   attendu (bypass RLS nécessaire pour lire les sessions/wellness d'autres utilisateurs, même
   pattern que /api/coach/wellness).

   Fenêtre à 42j (comme /conseils) : le chart de zone ACWR affiche 7 derniers jours (vue Sem.) ou
   28 derniers jours (vue Mois, toggle RangeToggle), et acwrSeries/formPercentSeries n'ont une
   valeur valide qu'à partir du 14e jour de la série fournie — il faut donc n-fenêtreAffichée+1 >= 14.
   Pour 7j affichés : n >= 20. Pour 28j affichés (le cas le plus large) : n >= 41 ; 42 aligne avec
   /conseils et garantit les 28 points de la vue Mois, pas seulement les 7 de la vue Sem. */
export type AthleteTrendInsight = { text: string; emoji: string; action: string } | null;

export async function getAthletesSignatures(
  admin: SupabaseClient,
  athletes: CoachAthlete[],
  referenceDate: string
): Promise<{
  signatures: Record<string, AthleteSignature>;
  trends: Record<string, TrendCode | null>;
  trendInsights: Record<string, AthleteTrendInsight>;
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) du jour de référence + série 42j
     (même alignement que `series` dans AthleteSignature), par sportif. */
  baselines: Record<string, WellnessBaselineResult | null>;
  baselineSeries: Record<string, (WellnessBaselineResult | null)[]>;
}> {
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const demoAthleteIds = athletes.filter(a => !a.user_id).map(a => a.id);
  const anchor = new Date(referenceDate + "T12:00:00");
  const since42 = daysAgoStr(42, anchor);

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
  const trends: Record<string, TrendCode | null> = {};
  const trendInsights: Record<string, AthleteTrendInsight> = {};
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
      for (let offset = -42; offset <= 0; offset++) {
        const score = coachWellnessScoreFor(offset, a.wellness_score);
        myWellness.push({
          id: `demo-wellness-${a.id}-${offset}`, user_id: a.id, date: daysAgoStr(-offset, anchor),
          sleep: score < 50 ? 3 : score < 70 ? 5 : 7, stress: score < 50 ? 7 : 4, recovery: score < 50 ? 3 : 6, motivation: score < 50 ? 4 : 7,
          base_score: score, score, behaviors: [], bedtime: "23:00", created_at: new Date().toISOString(),
        });
      }
      const { code, input } = computeWeekOverWeekTrend(mySessions, myWellness, anchor);
      trends[a.id] = code;
      const coachText = code ? describeTrend(code, input, "coach") : null;
      trendInsights[a.id] = coachText
        ? { text: coachText, emoji: trendSeverity(code!) === "alert" ? "🔴" : trendSeverity(code!) === "watch" ? "🟡" : "🟢", action: trendActionWord(code!) }
        : null;
      const series = buildDailyTimeSeries(mySessions, myWellness, 42, anchor);
      const sig = computeSignature(mySessions, a.wellness_score, 28, anchor);
      signatures[a.id] = { kind: "ok", series, sig };
      const demoTodayRow = myWellness.find(w => w.date === referenceDate) ?? null;
      baselines[a.id] = demoTodayRow
        ? computeWellnessBaselineAt(myWellness.filter(w => w.date < referenceDate), demoTodayRow)
        : null;
      baselineSeries[a.id] = computeWellnessBaselineSeries(myWellness, 42, anchor);
      continue;
    }
    const myWellness = allWellness.filter(w => w.user_id === a.user_id);
    const mySessions = allSessions.filter(s => s.user_id === a.user_id);
    const { code, input } = computeWeekOverWeekTrend(mySessions, myWellness, anchor);
    trends[a.id] = code;
    // Wording coach (3e personne) — même classification que /conseils, texte adapté au destinataire
    const coachText = code ? describeTrend(code, input, "coach") : null;
    trendInsights[a.id] = coachText
      ? { text: coachText, emoji: trendSeverity(code!) === "alert" ? "🔴" : trendSeverity(code!) === "watch" ? "🟡" : "🟢", action: trendActionWord(code!) }
      : null;
    if (myWellness.length === 0) { signatures[a.id] = { kind: "no_data" }; baselines[a.id] = null; baselineSeries[a.id] = []; continue; }
    const refWellness = myWellness.find(w => w.date === referenceDate);
    // base_score en priorité (jamais score, qui inclut le bonus/malus comportements).
    const wellnessScore = refWellness ? (wellnessSignal(refWellness) ?? 75) : 75;
    const series = buildDailyTimeSeries(mySessions, myWellness, 42, anchor);
    const sig = computeSignature(mySessions, wellnessScore, 28, anchor);
    signatures[a.id] = { kind: "ok", series, sig };
    baselines[a.id] = refWellness
      ? computeWellnessBaselineAt(myWellness.filter(w => w.date < referenceDate), refWellness)
      : null;
    baselineSeries[a.id] = computeWellnessBaselineSeries(myWellness, 42, anchor);
  }

  return { signatures, trends, trendInsights, baselines, baselineSeries };
}
