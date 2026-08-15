import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachAthlete, Session, WellnessDaily } from "@/types";
import { buildDailyTimeSeries, computeSignature, type AthleteSignature } from "@/lib/fatigueSignature";
import { daysAgoStr, computeWeekOverWeekTrend, describeTrend, trendSeverity, trendActionWord, type TrendCode } from "@/lib/trainingLoad";

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
}> {
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const anchor = new Date(referenceDate + "T12:00:00");
  const since42 = daysAgoStr(42, anchor);

  const [sessionsRes, wellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", since42).lte("date", referenceDate)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", since42).lte("date", referenceDate)
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
    const series = buildDailyTimeSeries(mySessions, myWellness, 42, anchor);
    const sig = computeSignature(mySessions, wellnessScore, 28, anchor);
    signatures[a.id] = { kind: "ok", series, sig };
  }

  return { signatures, trends, trendInsights };
}
