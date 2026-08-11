import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachAthlete, Session, WellnessDaily } from "@/types";
import { buildDailyTimeSeries, computeSignature, type AthleteSignature } from "@/lib/fatigueSignature";
import { daysAgoStr, computeWeekOverWeekTrend, describeTrend, trendSeverity, trendActionWord, type TrendCode } from "@/lib/trainingLoad";

/* Signatures de fatigue + tendances par sportif pour /coach/athletes, paramétré par une date de
   référence — réutilisé par la page (SSR, date = aujourd'hui) et par
   GET /api/coach/athletes?date=... (sélecteur de calendrier, voir AthletesClient.tsx). `admin`
   attendu (bypass RLS nécessaire pour lire les sessions/wellness d'autres utilisateurs, même
   pattern que /api/coach/wellness).

   Fenêtre à 28j (comme /conseils, pas 14) : le chart de zone ACWR affiche les 7 derniers jours,
   et acwrSeries/formPercentSeries n'ont une valeur valide qu'à partir du 14e jour de la série fournie —
   avec seulement 14j de fenêtre, seul le tout dernier jour affiché aurait une valeur (6 des 7
   points du chart resteraient vides). Il faut n-7+1 >= 14, donc n >= 20 au minimum ; 28 aligne
   avec /conseils et garantit les 7 points. */
export type AthleteTrendInsight = { text: string; emoji: string; action: string } | null;

export async function getAthletesSignatures(
  admin: SupabaseClient,
  athletes: CoachAthlete[],
  referenceDate: string
): Promise<{
  signatures: Record<string, AthleteSignature>;
  trends: Record<string, TrendCode | null>;
  trendInsights: Record<string, AthleteTrendInsight>;
}> {
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const anchor = new Date(referenceDate + "T12:00:00");
  const since28 = daysAgoStr(28, anchor);

  const [sessionsRes, wellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", since28).lte("date", referenceDate)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", since28).lte("date", referenceDate)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
  ]);
  const allSessions = (sessionsRes.data || []) as Session[];
  const allWellness = (wellnessRes.data || []) as WellnessDaily[];

  const signatures: Record<string, AthleteSignature> = {};
  const trends: Record<string, TrendCode | null> = {};
  const trendInsights: Record<string, AthleteTrendInsight> = {};
  for (const a of athletes) {
    if (!a.user_id) { signatures[a.id] = { kind: "manual" }; trends[a.id] = null; trendInsights[a.id] = null; continue; }
    const myWellness = allWellness.filter(w => w.user_id === a.user_id);
    const mySessions = allSessions.filter(s => s.user_id === a.user_id);
    const { code, input } = computeWeekOverWeekTrend(mySessions, myWellness, anchor);
    trends[a.id] = code;
    // Wording coach (3e personne) — même classification que /conseils, texte adapté au destinataire
    const coachText = code ? describeTrend(code, input, "coach") : null;
    trendInsights[a.id] = coachText
      ? { text: coachText, emoji: trendSeverity(code!) === "alert" ? "🔴" : trendSeverity(code!) === "watch" ? "🟡" : "🟢", action: trendActionWord(code!) }
      : null;
    if (myWellness.length === 0) { signatures[a.id] = { kind: "no_data" }; continue; }
    const refWellness = myWellness.find(w => w.date === referenceDate);
    const wellnessScore = refWellness?.score ?? refWellness?.base_score ?? 75;
    const series = buildDailyTimeSeries(mySessions, myWellness, 28, anchor);
    const sig = computeSignature(mySessions, wellnessScore, 28, anchor);
    signatures[a.id] = { kind: "ok", series, sig };
  }

  return { signatures, trends, trendInsights };
}
