import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, WellnessDaily, Profile } from "@/types";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { computeSignature, sigDimInfo, buildDailyTimeSeries, chargeCrossInsight, recoveryCrossInsight, daysAgoStr, type DayPoint } from "@/lib/fatigueSignature";
import { computeWeekOverWeekTrend, describeTrend, trendSeverity, trendActionWord, type TrendCode } from "@/lib/trainingLoad";

/* Calcul pur de tout ce qu'affiche /conseils, paramétré par une date de référence — réutilisé par
   la page (SSR, date = aujourd'hui) et par GET /api/conseils?date=... (sélecteur de calendrier,
   voir ConseilsClient.tsx). Isolé de la génération/mise en page (JSX) qui reste dans ConseilsClient
   et BehaviorImpactCard. */

export const OBJECTIVE_LABELS: Record<string, string> = {
  performance:  "Performance",
  longevite:    "Longévité",
  stress:       "Gestion du stress",
  composition:  "Composition corporelle",
  equilibre:    "Équilibre",
  rehab:        "Réhabilitation",
};

export function sessionStatusInfo(done: number, target: number): { label: string; color: string } {
  if (done >= target) return { label: "OBJECTIF ATTEINT", color: "#2f9e44" };
  if (done > 0)       return { label: "EN COURS",         color: "#f28a00" };
  return                { label: "SEMAINE LÉGÈRE",   color: "#8a8f94" };
}

export type BehaviorCorrelation = {
  key: string; impact: number; occurrences: number;
  emoji: string; label: string; positive: boolean;
};

export function computeBehaviorCorrelations(wellness: WellnessDaily[]): BehaviorCorrelation[] {
  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));
  const allKeys = Array.from(new Set(sorted.flatMap(w => w.behaviors || [])));
  const results: BehaviorCorrelation[] = [];

  for (const key of allKeys) {
    const daysWith: number[] = [];
    const daysWithout: number[] = [];
    for (const day of sorted) {
      const dayScore = day.score ?? day.base_score;
      if (dayScore === null || dayScore === undefined) continue;
      if ((day.behaviors || []).includes(key)) daysWith.push(dayScore);
      else daysWithout.push(dayScore);
    }
    if (daysWith.length < 2 || daysWithout.length < 2) continue;
    const avgWith    = daysWith.reduce((a, b) => a + b, 0) / daysWith.length;
    const avgWithout = daysWithout.reduce((a, b) => a + b, 0) / daysWithout.length;
    const impact = Math.round((avgWith - avgWithout) * 10) / 10;
    const meta = BEHAVIOR_META[key];
    if (!meta) continue;
    results.push({ key, impact, occurrences: daysWith.length, emoji: meta.emoji, label: meta.label, positive: meta.positive });
  }
  return results.sort((a, b) => b.impact - a.impact);
}

export type ConseilsData = {
  referenceDate: string;
  profile: { name: string | null; sport: string | null; objective: string | null } | null;
  sig: ReturnType<typeof computeSignature>;
  timeSeries: DayPoint[];
  maxLoad: number;
  maxMonotony: number;
  loadInfo: { label: string; color: string; text: string };
  monotonyInfo: { label: string; color: string; text: string };
  strainInfo: { label: string; color: string; text: string } | null;
  recoveryInfo: { label: string; color: string; text: string };
  formInfo: { label: string; color: string; text: string } | null;
  chargeInsight: string;
  recoveryInsight: string;
  zoneAcwr: (number | null)[];
  zoneLoads: number[];
  zoneDates: string[];
  recoveryAlert: boolean;
  done7Count: number;
  avgRpe: number | null;
  freqTarget: number;
  sessionStatus: { label: string; color: string };
  loadTrend: number | null;
  trendCode: TrendCode | null;
  trendText: string | null;
  trendEmoji: string | null;
  trendAction: string | null;
  loadAdviceShort: string;
  correlations: BehaviorCorrelation[];
  filledDays: number;
  recentBehaviors: { date: string; behaviors: string[] }[];
  allRecentBehaviorKeys: string[];
};

export async function getConseilsData(
  supabase: SupabaseClient,
  userId: string,
  referenceDate: string
): Promise<ConseilsData> {
  const anchor = new Date(referenceDate + "T12:00:00");
  const since28 = daysAgoStr(28, anchor);
  const since7  = daysAgoStr(7, anchor);
  const tomorrowStr = daysAgoStr(-1, anchor);

  const [{ data: rawProfile }, { data: rawSessions }, { data: rawWellness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("sessions").select("*").eq("user_id", userId).gte("date", since28).order("date", { ascending: false }),
    supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", since28).order("date", { ascending: false }),
  ]);

  const profile     = rawProfile as Profile | null;
  const allSessions = (rawSessions || []) as Session[];
  const allWellness = (rawWellness || []) as WellnessDaily[];

  const refWellness = allWellness.find(w => w.date === referenceDate);
  const wellnessScore = refWellness?.score ?? refWellness?.base_score ?? null;

  // 7 derniers jours glissants jusqu'à la date de référence (pas la semaine calendaire — voir
  // computeWeekOverWeekTrend dans trainingLoad.ts pour la même convention)
  const curStart = daysAgoStr(6, anchor);
  const prevStart = daysAgoStr(13, anchor);
  const done7Sessions = allSessions.filter(s => s.date >= curStart && s.date <= referenceDate && s.done && s.rpe);
  const avgRpe = done7Sessions.length
    ? Math.round(done7Sessions.reduce((a, s) => a + (s.rpe || 0), 0) / done7Sessions.length * 10) / 10
    : null;

  const freqTarget    = profile?.freq_target ?? 3;
  const sessionStatus = sessionStatusInfo(done7Sessions.length, freqTarget);

  const currLoad = done7Sessions.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const prevDoneSessions = allSessions.filter(s => s.date >= prevStart && s.date < curStart && s.done && s.rpe);
  const prevLoad = prevDoneSessions.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const loadTrend: number | null = prevLoad > 0
    ? Math.round((currLoad - prevLoad) / prevLoad * 100)
    : null;

  const { code: trendCode, input: trendInput } = computeWeekOverWeekTrend(allSessions, allWellness, anchor);
  const trendText = trendCode ? describeTrend(trendCode, trendInput) : null;
  const trendEmoji = trendCode
    ? (trendSeverity(trendCode) === "alert" ? "🔴" : trendSeverity(trendCode) === "watch" ? "🟡" : "🟢")
    : null;
  const trendAction = trendText && trendCode ? trendActionWord(trendCode) : null;

  const hasTomorrowSession = allSessions.some(s => s.date === tomorrowStr && !s.done);

  const recentBehaviors = allWellness
    .filter(w => w.date >= since7 && w.date <= referenceDate && w.behaviors?.length > 0)
    .map(w => ({ date: w.date, behaviors: w.behaviors }));
  const allRecentBehaviorKeys = Array.from(new Set(recentBehaviors.flatMap(r => r.behaviors)));

  const correlations = computeBehaviorCorrelations(allWellness);
  const filledDays   = allWellness.filter(w => w.score !== null || w.base_score !== null).length;

  const sig = computeSignature(allSessions, wellnessScore ?? 75, 28, anchor);
  const recoveryAlert = hasTomorrowSession && sig.recovery < 50 && sig.signals > 0;

  const timeSeries = buildDailyTimeSeries(allSessions, allWellness, 28, anchor);
  const maxLoad     = Math.max(...timeSeries.map(p => p.load), 400);
  const maxMonotony = Math.max(...timeSeries.map(p => p.monotony ?? 0), 3);

  // ACWR du jour de référence (dernier point de la série) — pilote le badge "Charge" et les zones
  // du chart, voir acwrSeries() dans trainingLoad.ts
  const todayAcwr = timeSeries[timeSeries.length - 1]?.acwr ?? null;
  const loadInfo = todayAcwr !== null
    ? sigDimInfo("load", todayAcwr)
    : { label: "HISTORIQUE INSUFFISANT", color: "#8a8f94", text: "Il faut au moins 14 jours d'historique pour calculer l'ACWR." };
  const monotonyInfo = sig.monotony !== null
    ? sigDimInfo("monotony", sig.monotony)
    : { label: "PAS ASSEZ D'HISTORIQUE", color: "#8a8f94", text: "Termine des séances sur au moins 7 jours pour calculer ta monotonie." };
  const strainInfo = sig.strain !== null ? sigDimInfo("strain", sig.strain) : null;
  const recoveryInfo = sigDimInfo("recovery", sig.recovery);
  const todayForm = timeSeries[timeSeries.length - 1]?.form ?? null;
  const formInfo = todayForm !== null ? sigDimInfo("form", todayForm) : null;

  const chargeInsight = chargeCrossInsight(loadInfo, monotonyInfo, strainInfo ?? { label: "", color: "#8a8f94", text: "" });
  const recoveryInsight = recoveryCrossInsight(recoveryInfo, todayForm);

  const last7 = timeSeries.slice(-7);
  const zoneAcwr = last7.map(p => p.acwr);
  const zoneLoads = last7.map(p => p.load);
  const zoneDates = last7.map(p => p.date);

  const loadAdviceShort = done7Sessions.length >= freqTarget
    ? avgRpe !== null && avgRpe >= 8
      ? "Objectif atteint à haute intensité — soigne la récup avant la semaine prochaine."
      : "Bonne régularité cette semaine — maintiens le rythme."
    : done7Sessions.length > 0
    ? `Plus que ${freqTarget - done7Sessions.length} séance${freqTarget - done7Sessions.length > 1 ? "s" : ""} pour atteindre ton objectif de la semaine.`
    : "Aucune séance cette semaine — reprends progressivement si l'arrêt n'était pas voulu.";

  return {
    referenceDate,
    profile: profile ? { name: profile.name, sport: profile.sport, objective: profile.objective } : null,
    sig, timeSeries, maxLoad, maxMonotony, loadInfo, monotonyInfo, strainInfo, recoveryInfo, formInfo, chargeInsight, recoveryInsight, zoneAcwr, zoneLoads, zoneDates,
    recoveryAlert, done7Count: done7Sessions.length, avgRpe, freqTarget, sessionStatus, loadTrend,
    trendCode, trendText, trendEmoji, trendAction, loadAdviceShort, correlations, filledDays, recentBehaviors, allRecentBehaviorKeys,
  };
}
