import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, WellnessDaily, Profile } from "@/types";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { NEGATIVE_BEHAVIOR_TIPS, wellnessColor } from "@/lib/wellness";
import { computeSignature, sigDimInfo, trendDimInfo, buildDailyTimeSeries, chargeCrossInsight, recoveryCrossInsight, daysAgoStr, type DayPoint, type Perspective } from "@/lib/fatigueSignature";
import { fitnessFatigueTrend, dailyLoad } from "@/lib/trainingLoad";
import { buildDeviceSeries, type DeviceDay, type HealthRow } from "@/lib/deviceWellness";
import { withWatchEstimates, isEstimated, type WatchWorkout } from "@/lib/watchEstimates";
import { computeWellnessBaselineAt, computeWellnessBaselineSeries, sleepZFromDeviceOnly, normalCDF, WELLNESS_BASELINE_WINDOW_DAYS, wellnessSignal, dimensionRaw, DIMENSION_KEYS, DIMENSION_LABELS, type WellnessBaselineResult, type DimensionKey } from "@/lib/wellnessBaseline";

/* Calcul pur de tout ce qu'affiche /conseils, paramétré par une date de référence — réutilisé par
   la page (SSR, date = aujourd'hui) et par GET /api/conseils?date=... (sélecteur de calendrier,
   voir ConseilsClient.tsx). Isolé de la génération/mise en page (JSX) qui reste dans ConseilsClient
   et BehaviorImpactCard. */

/* Fenêtre de fetch partagée par tous les appelants qui alimentent les charts Charge/Récupération
   (getConseilsData ici, /coach/page.tsx, src/lib/athletesData.ts, sandboxFixtures.ts) — 90j (le plus
   grand cran du toggle 7j/28j/90j, voir RangeToggle.tsx) + 14j de pur recul pour l'ACWR (même marge
   déjà en place avant l'ajout du cran 90j, voir le commentaire détaillé sur computeConseilsData plus
   bas). Un seul nombre, jamais 4 constantes "42" divergentes. */
export const CONSEILS_HISTORY_DAYS = 104;

export function sessionStatusInfo(done: number, target: number): { label: string; color: string } {
  if (done >= target) return { label: "OBJECTIF ATTEINT", color: "#2f9e44" };
  if (done > 0)       return { label: "EN COURS",         color: "#f28a00" };
  return                { label: "SEMAINE LÉGÈRE",   color: "#8a8f94" };
}

export type BehaviorCorrelation = {
  key: string; impact: number; occurrences: number;
  emoji: string; label: string; positive: boolean;
  /* Dimension la plus touchée par ce comportement/cette charge ("profil par dimension", 2026-09) —
     distincte de l'impact composite ci-dessus : "l'alcool baisse ton score de -3" devient "impacte
     négativement le sommeil (-1.8)" quand une dimension domine nettement les 3 autres. Même
     comparaison avec/sans que l'impact composite, mais sur dimensionRaw() (wellnessBaseline.ts,
     stress déjà inversé pour rester "plus haut = mieux" uniformément) au lieu du score composite.
     null si aucune dimension n'a assez d'occurrences pour être honnête (même seuil que l'impact
     composite, 2 jours mini de chaque côté). */
  dominantDimension: { key: DimensionKey; label: string; impact: number } | null;
};

// score à comparer pour l'impact composite — `score` en priorité, jamais `wellnessSignal()`
// (base_score en priorité) : seule exception volontaire du module, voir le commentaire dans
// wellnessBaseline.ts (dimensionRaw) — une corrélation comportement/charge doit regarder le score
// RÉELLEMENT vécu par l'utilisateur ce jour-là, comportements inclus, pas le score brut du matin.
function behaviorDayScore(row: Pick<WellnessDaily, "score" | "base_score">): number | null {
  return row.score ?? row.base_score ?? null;
}

/* Dimension la plus touchée entre 2 groupes de jours (avec/sans un comportement, ou avant/après une
   charge) — factorisé une seule fois, réutilisé par computeBehaviorCorrelations() ET
   computeLoadBehaviorCorrelations() ci-dessous pour ne jamais dupliquer cette comparaison. */
function dominantDimensionFor(daysWith: WellnessDaily[], daysWithout: WellnessDaily[]): BehaviorCorrelation["dominantDimension"] {
  if (daysWith.length < 2 || daysWithout.length < 2) return null;
  let dominantDimension: BehaviorCorrelation["dominantDimension"] = null;
  let bestAbs = 0;
  for (const dim of DIMENSION_KEYS) {
    const dimAvgWith    = daysWith.reduce((a, d) => a + dimensionRaw(d, dim), 0) / daysWith.length;
    const dimAvgWithout = daysWithout.reduce((a, d) => a + dimensionRaw(d, dim), 0) / daysWithout.length;
    const dimImpact = Math.round((dimAvgWith - dimAvgWithout) * 10) / 10;
    if (Math.abs(dimImpact) > bestAbs) {
      bestAbs = Math.abs(dimImpact);
      dominantDimension = { key: dim, label: DIMENSION_LABELS[dim], impact: dimImpact };
    }
  }
  return dominantDimension;
}

export function computeBehaviorCorrelations(wellness: WellnessDaily[]): BehaviorCorrelation[] {
  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));
  const allKeys = Array.from(new Set(sorted.flatMap(w => w.behaviors || [])));
  const results: BehaviorCorrelation[] = [];

  for (const key of allKeys) {
    const daysWith: WellnessDaily[] = [];
    const daysWithout: WellnessDaily[] = [];
    for (const day of sorted) {
      if (behaviorDayScore(day) === null) continue;
      if ((day.behaviors || []).includes(key)) daysWith.push(day);
      else daysWithout.push(day);
    }
    if (daysWith.length < 2 || daysWithout.length < 2) continue;
    const avgWith    = daysWith.reduce((a, d) => a + behaviorDayScore(d)!, 0) / daysWith.length;
    const avgWithout = daysWithout.reduce((a, d) => a + behaviorDayScore(d)!, 0) / daysWithout.length;
    const impact = Math.round((avgWith - avgWithout) * 10) / 10;
    const meta = BEHAVIOR_META[key];
    if (!meta) continue;

    results.push({ key, impact, occurrences: daysWith.length, emoji: meta.emoji, label: meta.label, positive: meta.positive, dominantDimension: dominantDimensionFor(daysWith, daysWithout) });
  }
  return results.sort((a, b) => b.impact - a.impact);
}

/* Corrélation "charge (RPE×durée) de la veille → récupération du jour" (2026-09) — même principe que
   computeBehaviorCorrelations() (comparaison avec/sans) mais sur la charge d'entraînement réelle de
   la veille plutôt que sur un comportement déclaratif, rendue sous la forme de 2 BehaviorCorrelation
   synthétiques ("Séance fatigante la veille" / "Jour de récup la veille") pour être fusionnée dans la
   MÊME liste/le même layout que les comportements — retour explicite de Gildas, pas une carte séparée.
   Seuil "charge élevée" = médiane des jours avec une charge non nulle DANS L'HISTORIQUE PROPRE de
   l'utilisateur (dailyLoad, trainingLoad.ts) — pas un seuil absolu, cohérent avec le reste du module
   (baseline Z-score, ratios de tests) qui compare toujours un utilisateur à lui-même. "Jour de récup"
   (charge de la veille strictement nulle) ne dépend pas de ce seuil, donc reste calculable même sans
   assez d'historique pour la médiane. */
export function computeLoadBehaviorCorrelations(sessions: Session[], wellness: WellnessDaily[]): BehaviorCorrelation[] {
  const doneByDate = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!s.done || !s.rpe) continue;
    const arr = doneByDate.get(s.date) ?? [];
    arr.push(s);
    doneByDate.set(s.date, arr);
  }
  const loadOnDate = (date: string): number => {
    const arr = doneByDate.get(date);
    return arr ? dailyLoad(arr) : 0;
  };
  const nonzeroLoads = Array.from(doneByDate.keys()).map(loadOnDate).filter(l => l > 0).sort((a, b) => a - b);
  const thresholdLoad = nonzeroLoads.length >= 4 ? nonzeroLoads[Math.floor(nonzeroLoads.length / 2)] : null;

  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));

  function bucket(key: string, emoji: string, label: string, positive: boolean, isMember: (prevLoad: number) => boolean): BehaviorCorrelation | null {
    const daysWith: WellnessDaily[] = [];
    const daysWithout: WellnessDaily[] = [];
    for (const day of sorted) {
      if (behaviorDayScore(day) === null) continue;
      const prevDate = daysAgoStr(1, new Date(day.date + "T12:00:00"));
      const prevLoad = loadOnDate(prevDate);
      if (isMember(prevLoad)) daysWith.push(day); else daysWithout.push(day);
    }
    if (daysWith.length < 2 || daysWithout.length < 2) return null;
    const avgWith    = daysWith.reduce((a, d) => a + behaviorDayScore(d)!, 0) / daysWith.length;
    const avgWithout = daysWithout.reduce((a, d) => a + behaviorDayScore(d)!, 0) / daysWithout.length;
    const impact = Math.round((avgWith - avgWithout) * 10) / 10;
    return { key, impact, occurrences: daysWith.length, emoji, label, positive, dominantDimension: dominantDimensionFor(daysWith, daysWithout) };
  }

  const results: BehaviorCorrelation[] = [];
  if (thresholdLoad !== null) {
    const r = bucket("load_high_prev_day", "🔥", "Séance fatigante la veille", false, prevLoad => prevLoad >= thresholdLoad);
    if (r) results.push(r);
  }
  const rest = bucket("load_rest_prev_day", "🛌", "Jour de récup la veille", true, prevLoad => prevLoad === 0);
  if (rest) results.push(rest);
  return results;
}

/* Conseil récup personnalisé pour la carte décision /today+Coach Control (decisionCard.ts, 2026-09) —
   remplace NEGATIVE_BEHAVIOR_TIPS (dictionnaire statique, même texte pour tout le monde) par
   l'impact RÉELLEMENT mesuré chez CE sportif via computeBehaviorCorrelations() — "réutiliser les
   règles d'Impact comportements", demande explicite de Gildas. Parmi les comportements négatifs
   loggués aujourd'hui (= actions d'hier, voir wellness_daily.behaviors), celui à l'impact le plus
   marqué ; repli sur le tip générique NEGATIVE_BEHAVIOR_TIPS si ce comportement précis n'a pas encore
   ≥2 occurrences de chaque côté (compte neuf, ou comportement rare) — jamais aucun texte affiché
   pour un comportement négatif connu. */
export function personalizedBehaviorTip(
  todayBehaviors: string[] | undefined, allWellness: WellnessDaily[], allSessions: Session[],
): string | null {
  if (!todayBehaviors?.length) return null;
  const correlations = [...computeBehaviorCorrelations(allWellness), ...computeLoadBehaviorCorrelations(allSessions, allWellness)];
  const negatives = todayBehaviors
    .map(key => ({ key, meta: BEHAVIOR_META[key], corr: correlations.find(c => c.key === key) }))
    .filter((x): x is { key: string; meta: NonNullable<typeof x.meta>; corr: BehaviorCorrelation | undefined } => !!x.meta && !x.meta.positive);
  if (!negatives.length) return null;
  const worst = negatives.reduce((a, b) => (b.corr && (!a.corr || b.corr.impact < a.corr.impact) ? b : a));
  if (worst.corr?.dominantDimension) {
    const { label: dimLabel, impact } = worst.corr.dominantDimension;
    const sign = impact < 0 ? "−" : "+";
    return `${worst.meta.emoji} ${worst.meta.label} — impacte ${dimLabel.toLowerCase()} de ${sign}${Math.abs(impact).toFixed(1)}pt en moyenne chez toi.`;
  }
  const fallback = NEGATIVE_BEHAVIOR_TIPS[worst.key];
  return fallback ? `${fallback.label} — ${fallback.tip}.` : null;
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
  fitnessTrendInfo: { label: string; color: string; text: string } | null;
  fatigueTrendInfo: { label: string; color: string; text: string } | null;
  chargeInsight: string;
  recoveryInsight: string;
  zoneAcwr: (number | null)[];
  zoneLoads: number[];
  zoneDates: string[];
  zoneMonotony: (number | null)[];
  zoneStrain: (number | null)[];
  recoveryAlert: boolean;
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) du jour de référence — pilote
     recoveryInfo/recoveryInsight dès que l'historique est suffisant (voir plus bas). */
  wellnessBaseline: WellnessBaselineResult | null;
  /* Série jour par jour (CONSEILS_HISTORY_DAYS, même longueur et alignement que `timeSeries`) — pour le chart Récupération, tracé
     en relatif plutôt qu'en absolu dès que l'historique de chaque jour est suffisant. */
  wellnessBaselineSeries: (WellnessBaselineResult | null)[];
  /* Montre jour par jour (même alignement que `timeSeries`) : FC repos / VFC brutes + norme, pour les
     sous-charts FC repos et VFC. Lue dans health_daily quand on y a accès (jours sans point forme
     compris), sinon dans les colonnes device_* des points forme. */
  deviceSeries: DeviceDay[];
  /* Séances estimées depuis la montre (watchEstimates.ts) comptées dans la fenêtre : la charge les
     inclut, l'interface le dit (2026-10-23). */
  estimatedSessionCount: number;
  /* Récupération D'APRÈS LES MESURES SEULES (nuit, FC au repos, VFC face à leur norme de 28 jours,
     en percentile comme le score relatif), uniquement pour les jours AVANT l'inscription sans
     point forme : l'historique importé remplit le chart dès le 1er jour. Après l'inscription, le score
     du jour exige un point forme (Gildas, 2026-10-23) : null. Même alignement que `timeSeries`. */
  measuredRecovery: (number | null)[];
  done7Count: number;
  avgRpe: number | null;
  freqTarget: number;
  sessionStatus: { label: string; color: string };
  loadTrend: number | null;
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
  const since42 = daysAgoStr(CONSEILS_HISTORY_DAYS, anchor);

  // Montre : 28 jours de plus que la fenêtre, pour que la norme FC du premier jour affiché existe.
  const sinceHealth = daysAgoStr(CONSEILS_HISTORY_DAYS + 28, anchor);
  const [{ data: rawProfile }, { data: rawSessions }, { data: rawWellness }, { data: rawHealth, error: healthError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("sessions").select("*").eq("user_id", userId).gte("date", since42).order("date", { ascending: false }),
    supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", since42).order("date", { ascending: false }),
    supabase.from("health_daily").select("date, resting_hr, sleep_minutes, hrv_ms, stress_avg, body_battery_charged, body_battery_drained").eq("user_id", userId).gte("date", sinceHealth).lte("date", referenceDate),
  ]);
  if (healthError) console.error("[health_daily] lecture conseils:", healthError.message);
  const { data: rawWorkouts, error: workoutsError } = await supabase.from("health_workouts")
    .select("platform_id, date, start_at, duration_min, workout_type, trimp").eq("user_id", userId).gte("date", since42).lte("date", referenceDate);
  if (workoutsError) console.error("[health_workouts] lecture conseils:", workoutsError.message);
  const health: HealthRow[] = (rawHealth ?? []).map(h => ({
    date: h.date, sleep_minutes: h.sleep_minutes,
    resting_hr: h.resting_hr == null ? null : Number(h.resting_hr),
    hrv_ms: h.hrv_ms == null ? null : Number(h.hrv_ms),
    stress_avg: h.stress_avg, body_battery_charged: h.body_battery_charged, body_battery_drained: h.body_battery_drained,
  }));

  const sessions = withWatchEstimates((rawSessions || []) as Session[], dedupeWorkouts(rawWorkouts), referenceDate) as Session[];
  return computeConseilsData(referenceDate, rawProfile as Profile | null, sessions, (rawWellness || []) as WellnessDaily[], "athlete", health);
}

/* Un même entraînement peut arriver deux fois (Garmin écrit aussi dans Apple Santé) : un par début. */
export function dedupeWorkouts(rows: unknown[] | null | undefined): WatchWorkout[] {
  const byStart = new Map<string, WatchWorkout>();
  (rows ?? []).forEach(r => {
    const w = r as { platform_id?: string | null; date: string; start_at: string; duration_min: number | string; workout_type: string | null; trimp: number | string | null };
    const row: WatchWorkout = { platform_id: w.platform_id ?? null, date: w.date, start_at: w.start_at, duration_min: Number(w.duration_min), workout_type: w.workout_type ?? "", trimp: w.trimp == null ? null : Number(w.trimp) };
    const prev = byStart.get(w.start_at);
    if (!prev || (prev.trimp == null && row.trimp != null)) byStart.set(w.start_at, row);
  });
  return Array.from(byStart.values());
}

/* Percentile d'un jour d'après les mesures seules (voir `measuredRecovery`). z de chaque mesure face à
   ses 28 jours précédents (≥ 5 jours, écart-type plancher), FC au repos inversée, moyenne des z
   disponibles, puis Φ(z) × 100 borné 5-95 : même échelle que le score relatif du ressenti. */
function measuredRecoverySeries(dates: string[], health: HealthRow[] | null | undefined, checkinDates: Set<string>, before: string | null): (number | null)[] {
  if (!health?.length || !before) return dates.map(() => null);
  const sorted = [...health].sort((a, b) => a.date.localeCompare(b.date));
  const z = (date: string, pick: (h: HealthRow) => number | null, floor: (mean: number) => number, invert: boolean): number | null => {
    const today = sorted.find(h => h.date === date);
    const v = today ? pick(today) : null;
    if (v == null) return null;
    const from = daysAgoStr(28, new Date(date + "T12:00:00"));
    const prior = sorted.filter(h => h.date < date && h.date >= from).map(pick).filter((x): x is number => x != null);
    if (prior.length < 5) return null;
    const mean = prior.reduce((a, x) => a + x, 0) / prior.length;
    const sd = Math.max(floor(mean), Math.sqrt(prior.reduce((a, x) => a + (x - mean) ** 2, 0) / prior.length));
    return ((v - mean) / sd) * (invert ? -1 : 1);
  };
  return dates.map(date => {
    if (date >= before || checkinDates.has(date)) return null;
    const zs = [
      z(date, h => (h.sleep_minutes != null && h.sleep_minutes >= 180 ? h.sleep_minutes : null), () => 30, false),
      z(date, h => h.resting_hr ?? null, () => 2, true),
      z(date, h => h.hrv_ms ?? null, m => m * 0.08, false),
    ].filter((x): x is number => x != null);
    if (!zs.length) return null;
    const mz = zs.reduce((a, x) => a + x, 0) / zs.length;
    return Math.round(Math.max(5, Math.min(95, normalCDF(mz) * 100)));
  });
}

/* Extrait de getConseilsData() (2026-08-19, chantier sandbox) — pure, ne dépend plus d'un client
   Supabase, réutilisable directement par la sandbox (fixtures locales) sans dupliquer la logique.
   getConseilsData() reste le seul appelant réel de l'app (fetch), cette fonction ne fait que le
   calcul. Les 42 jours d'historique (mêmes commentaires que dans getConseilsData avant ce refactor)
   doivent déjà être fournis par l'appelant dans allSessions/allWellness. */
export function computeConseilsData(
  referenceDate: string,
  profile: Profile | null,
  allSessions: Session[],
  allWellness: WellnessDaily[],
  // "athlete" par défaut (comportement inchangé pour /conseils, qui n'a jamais eu besoin de passer
  // ce paramètre) — CoachClient.tsx passe "coach" pour les sportifs de son roster (2026-09-25, fix
  // wording — "Ta charge" affiché à tort à un coach au sujet d'un sportif qu'il consulte, doit être
  // "Sa charge" : chargeCrossInsight()/recoveryCrossInsight()/crossTrendInsight()/sigDimInfo("recovery",...)
  // acceptent déjà ce paramètre, seul computeConseilsData() ne le laissait jamais passer jusqu'ici).
  perspective: Perspective = "athlete",
  // Lignes health_daily (montre) si l'appelant y a accès — voir `deviceSeries`.
  health?: HealthRow[] | null,
): ConseilsData {
  const anchor = new Date(referenceDate + "T12:00:00");
  /* CONSEILS_HISTORY_DAYS jours attendus en entrée (104, pas 90) pour que la vue "90 j" du chart
     (2026-09-24, cran ajouté au toggle 7j/28j/90j) ait un ACWR valide sur toute sa largeur —
     acuteChronicAt() (trainingLoad.ts) exige au moins 14 jours d'historique AVANT un point donné
     pour lui donner une valeur non-nulle ; avec seulement 90 jours, les 13 premiers jours affichés
     n'auraient jamais assez de recul et resteraient nuls (même bug déjà rencontré avec la vue "Mois"
     à l'époque où la fenêtre ne couvrait que 28 jours — voir historique CLAUDE.md). Les 14 jours de
     marge servent uniquement de recul de calcul, jamais affichés tels quels. getConseilsData() fetch
     bien CONSEILS_HISTORY_DAYS jours ; la sandbox (fixtures locales) et /coach/page.tsx doivent faire
     de même. */
  const since7  = daysAgoStr(7, anchor);
  const tomorrowStr = daysAgoStr(-1, anchor);

  const refWellness = allWellness.find(w => w.date === referenceDate);
  // base_score en priorité (jamais score, qui inclut le bonus/malus comportements) — voir
  // wellnessSignal() dans wellnessBaseline.ts.
  const wellnessScore = refWellness ? wellnessSignal(refWellness) : null;

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

  const hasTomorrowSession = allSessions.some(s => s.date === tomorrowStr && !s.done);

  const recentBehaviors = allWellness
    .filter(w => w.date >= since7 && w.date <= referenceDate && w.behaviors?.length > 0)
    .map(w => ({ date: w.date, behaviors: w.behaviors }));
  const allRecentBehaviorKeys = Array.from(new Set(recentBehaviors.flatMap(r => r.behaviors)));

  // Comportements + charge (2 buckets synthétiques "séance fatigante"/"jour de récup" la veille) —
  // même liste, même tri par impact, même layout (BehaviorImpactCard, ConseilsClient.tsx).
  const correlations = [...computeBehaviorCorrelations(allWellness), ...computeLoadBehaviorCorrelations(allSessions, allWellness)]
    .sort((a, b) => b.impact - a.impact);
  const filledDays   = allWellness.filter(w => w.score !== null || w.base_score !== null).length;

  const sig = computeSignature(allSessions, wellnessScore ?? 75, 28, anchor);
  const recoveryAlert = hasTomorrowSession && sig.recovery < 50 && sig.signals > 0;

  // 42 jours calculés, mais seuls les 28 derniers sont destinés à être affichés (vue "Mois") — les
  // 14 premiers ne servent qu'à donner à acuteChronicAt() assez de recul pour que l'ACWR des jours
  // réellement affichés soit toujours valide (voir commentaire sur since42 plus haut).
  const timeSeries = buildDailyTimeSeries(allSessions, allWellness, CONSEILS_HISTORY_DAYS, anchor);
  const maxLoad     = Math.max(...timeSeries.map(p => p.load), 400);
  const maxMonotony = Math.max(...timeSeries.map(p => p.monotony ?? 0), 3);

  // ACWR du jour de référence (dernier point de la série) — pilote le badge "Charge" et les zones
  // du chart, voir acwrSeries() dans trainingLoad.ts
  const todayAcwr = timeSeries[timeSeries.length - 1]?.acwr ?? null;
  const loadInfo = todayAcwr !== null
    ? sigDimInfo("load", todayAcwr, perspective)
    : { label: "HISTORIQUE INSUFFISANT", color: "#8a8f94", text: perspective === "coach" ? "Disponible après 14 jours : compare sa charge de la semaine à sa charge habituelle." : "Disponible après 14 jours : compare ta charge de la semaine à ta charge habituelle." };
  const monotonyInfo = sig.monotony !== null
    ? sigDimInfo("monotony", sig.monotony, perspective)
    : { label: "PAS ASSEZ D'HISTORIQUE", color: "#8a8f94", text: "Termine des séances sur au moins 7 jours pour calculer ta monotonie." };
  const strainInfo = sig.strain !== null ? sigDimInfo("strain", sig.strain, perspective) : null;
  // Baseline personnelle du jour de référence — history = jours strictement antérieurs, dans la
  // fenêtre déjà fetchée (allWellness, 42j). refWellness peut être absent (jour non renseigné) :
  // computeWellnessBaselineAt() renvoie alors null, repli automatique sur sig.recovery en absolu.
  const wellnessBaseline = refWellness
    ? computeWellnessBaselineAt(allWellness.filter(w => w.date < referenceDate), refWellness)
    : null;
  /* Même longueur que timeSeries (2026-10-13) : à 42 j, la vue « 90 j » du chart Récupération posait
     les 42 points sur les 42 premières dates et s'arrêtait 48 jours avant aujourd'hui. */
  const wellnessBaselineSeries = computeWellnessBaselineSeries(allWellness, CONSEILS_HISTORY_DAYS, anchor);
  const deviceSeries = buildDeviceSeries(timeSeries.map(p => p.date), health, allWellness);
  // Nuits mesurées sans point forme : point "durée seule" sur le chart Sommeil (voir sleepZFromDeviceOnly).
  const checkinDates = new Set(allWellness.filter(w => wellnessSignal(w) !== null).map(w => w.date));
  deviceSeries.forEach((d, i) => {
    const date = timeSeries[i].date;
    if (d.sleepMin == null || checkinDates.has(date)) return;
    const from = daysAgoStr(WELLNESS_BASELINE_WINDOW_DAYS, new Date(date + "T12:00:00"));
    d.sleepZ = sleepZFromDeviceOnly(allWellness.filter(w => w.date < date && w.date >= from), d.sleepMin);
  });
  const signupDate = (profile as { created_at?: string | null } | null)?.created_at?.slice(0, 10) ?? null;
  const measuredRecovery = measuredRecoverySeries(timeSeries.map(p => p.date), health, checkinDates, signupDate);
  const windowStart = timeSeries[0]?.date ?? referenceDate;
  const estimatedSessionCount = allSessions.filter(s => isEstimated(s) && s.date >= windowStart && s.date <= referenceDate).length;
  /* Sans point forme du jour mais avec un historique mesuré (2026-10-23) : le statut suit la dernière
     valeur mesurée, sur les mêmes bandes que la jauge (42/58), au lieu du repli absolu par défaut qui
     affichait « Bonne récup » à côté d'une jauge « Équilibré ». */
  const lastMeasured = [...measuredRecovery].reverse().find(v => v !== null) ?? null;
  const coachP = perspective === "coach";
  const recoveryInfo = !wellnessBaseline && !refWellness && lastMeasured !== null
    ? lastMeasured >= 58
      ? { label: "FRAIS", color: wellnessColor(lastMeasured), text: coachP ? "D'après ses mesures, sa récupération est au-dessus de sa norme." : "D'après tes mesures, ta récupération est au-dessus de ta norme." }
      : lastMeasured >= 42
      ? { label: "ÉQUILIBRÉ", color: wellnessColor(lastMeasured), text: coachP ? "D'après ses mesures, sa récupération est dans sa norme." : "D'après tes mesures, ta récupération est dans ta norme." }
      : { label: "FATIGUÉ", color: wellnessColor(lastMeasured), text: coachP ? "D'après ses mesures, sa récupération est sous sa norme : éviter d'enchaîner les séances dures." : "D'après tes mesures, ta récupération est sous ta norme : évite d'enchaîner les séances dures." }
    : sigDimInfo("recovery", sig.recovery, perspective, wellnessBaseline);
  const todayForm = timeSeries[timeSeries.length - 1]?.form ?? null;
  const formInfo = todayForm !== null ? sigDimInfo("form", todayForm, perspective) : null;
  const ffTrend = fitnessFatigueTrend(timeSeries);
  /* Bug réel trouvé par Gildas (2026-09-25, "Ta charge chronique..." affiché à côté de "Sa
     récupération...") : ces 2 appels omettaient `perspective` — sigDimInfo()/trendDimInfo()
     défaultent tous les deux à "athlete", donc `fitnessTrendInfo.text`/`fatigueTrendInfo.text`
     disaient "Ta charge..." même sur /coach (perspective="coach" passé plus haut à ce fichier,
     mais jamais redescendu ici) — mélange de "Sa"/"Ta" dès que `chargeInsight`/`trendText`
     réutilisaient ce texte tel quel (voir chargeCrossInsight()/crossTrendInsight()). */
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, perspective) : null;
  const fatigueTrendInfo = ffTrend.fatigue !== null ? trendDimInfo("fatigue", ffTrend.fatigue, perspective) : null;

  /* Fitness/Fatigue passent de l'insight de charge à celui de récupération (2026-09-29) : ce sont
     des cartes de l'onglet Récupération, elles doivent être racontées là où elles sont affichées. */
  const chargeInsight = chargeCrossInsight(loadInfo, monotonyInfo, strainInfo ?? { label: "", color: "#8a8f94", text: "" }, perspective);
  const recoveryInsight = recoveryCrossInsight(recoveryInfo, todayForm, perspective, wellnessBaseline, fitnessTrendInfo, fatigueTrendInfo);


  const last7 = timeSeries.slice(-7);
  const zoneAcwr = last7.map(p => p.acwr);
  const zoneLoads = last7.map(p => p.load);
  const zoneDates = last7.map(p => p.date);
  const zoneMonotony = last7.map(p => p.monotony);
  const zoneStrain = last7.map(p => p.strain);

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
    sig, timeSeries, maxLoad, maxMonotony, loadInfo, monotonyInfo, strainInfo, recoveryInfo, formInfo, fitnessTrendInfo, fatigueTrendInfo, chargeInsight, recoveryInsight, zoneAcwr, zoneLoads, zoneDates, zoneMonotony, zoneStrain,
    recoveryAlert, wellnessBaseline, wellnessBaselineSeries, deviceSeries, estimatedSessionCount, measuredRecovery, done7Count: done7Sessions.length, avgRpe, freqTarget, sessionStatus, loadTrend,
    loadAdviceShort, correlations, filledDays, recentBehaviors, allRecentBehaviorKeys,
  };
}
