import type { Session } from "@/types";

/* Moteur de charge d'entraînement — fonctions pures, sans dépendance React/DB, réutilisables
   telles quelles par de futurs simulateurs (hors scope de ce chantier). Source unique de vérité
   pour le calcul de charge (Foster session-RPE = RPE × durée), remplace les 3 formules jusque-là
   dupliquées (computeFatigueImpact impact-only mis à part, voir wellness.ts — non touché) :
   fatigueSignature.computeSignature, le seuillage du calendrier (TodayClient/CoachPlanningClient),
   et le loadTrend de conseils/page.tsx.

   daysAgoStr vit ici (et non dans fatigueSignature.ts, qui le ré-exporte pour compat) pour éviter
   une dépendance circulaire : fatigueSignature.ts dépend de ce module, jamais l'inverse.

   `anchor` (défaut : maintenant) permet de rejouer tous ces calculs pour une date de référence
   différente d'aujourd'hui — nécessaire pour le sélecteur de date sur /conseils et
   /coach/athletes (voir ConseilsClient.tsx / AthletesClient.tsx), et réutilisable telles quelles
   par de futurs simulateurs. */
export function daysAgoStr(n: number, anchor: Date = new Date()): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export function sessionLoad(s: Pick<Session, "rpe" | "duration" | "done">): number {
  if (!s.done || !s.rpe || !s.duration) return 0;
  return s.rpe * s.duration;
}

export function dailyLoad(sessions: Pick<Session, "rpe" | "duration" | "done">[]): number {
  return sessions.reduce((a, s) => a + sessionLoad(s), 0);
}

export type LoadPoint = { date: string; load: number };

export function buildLoadSeries(sessions: Session[], days: number, anchor: Date = new Date()): LoadPoint[] {
  const points: LoadPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    const load = dailyLoad(sessions.filter(s => s.date === date));
    points.push({ date, load });
  }
  return points;
}

export function rollingStats(series: LoadPoint[], windowDays: number): { mean: number; stdDev: number; sum: number } {
  const slice = series.slice(-windowDays);
  const vals = slice.map(p => p.load);
  if (!vals.length) return { mean: 0, stdDev: 0, sum: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return { mean, stdDev: Math.sqrt(variance), sum };
}

/**
 * Monotonie de Foster : moyenne / écart-type des charges quotidiennes sur 7j.
 * null si aucune charge récente (rien à mesurer) ; plafonnée à 10 si l'écart-type est nul
 * (charge parfaitement uniforme = monotonie maximale par convention, évite une division par 0).
 */
export function monotony(series7: LoadPoint[]): number | null {
  const { mean, stdDev } = rollingStats(series7, 7);
  if (mean === 0) return null;
  if (stdDev === 0) return 10;
  return Math.round((mean / stdDev) * 100) / 100;
}

/** Strain de Foster : charge hebdomadaire (somme) × monotonie. null si monotony() est null. */
export function strain(series7: LoadPoint[]): number | null {
  const m = monotony(series7);
  if (m === null) return null;
  const { sum } = rollingStats(series7, 7);
  return Math.round(sum * m);
}

/**
 * Variation du strain (7 derniers jours glissants vs les 7 jours précédents), en % — un chiffre
 * brut de strain (charge × monotonie) n'a pas de sens intrinsèque hors contexte individuel ; la
 * variation relative est ce qui est réellement lisible. null si <14j d'historique ou si le strain
 * précédent est nul (pas de base de comparaison).
 */
export function strainTrendPct(series: LoadPoint[]): number | null {
  if (series.length < 14) return null;
  const curr = strain(series);
  const prev = strain(series.slice(0, series.length - 7));
  if (curr === null || prev === null || prev === 0) return null;
  return Math.round((curr - prev) / prev * 100);
}

/**
 * ACWR (acute:chronic workload ratio) : moyenne quotidienne 7j / moyenne quotidienne 28j.
 * Volontairement jamais présenté comme un score de risque de blessure (littérature critique sur ce
 * point) — uniquement comme indicateur de tendance de charge. hasEnoughHistory=false (value=null)
 * tant que la série ne couvre pas au moins 28 jours de charge réelle — évite un ratio bruyant sur
 * un historique trop court.
 */
export function acwr(series28: LoadPoint[]): { value: number | null; hasEnoughHistory: boolean } {
  const nonZeroDays = series28.filter(p => p.load > 0).length;
  const hasEnoughHistory = series28.length >= 28 && nonZeroDays >= 4;
  if (!hasEnoughHistory) return { value: null, hasEnoughHistory };
  const acute = rollingStats(series28, 7).mean;
  const chronic = rollingStats(series28, 28).mean;
  if (chronic === 0) return { value: null, hasEnoughHistory };
  return { value: Math.round((acute / chronic) * 100) / 100, hasEnoughHistory };
}

/**
 * Charge aiguë (7j) / chronique (jusqu'à 28j, élargie progressivement) à un jour donné — même
 * calcul sous-jacent que le modèle Fitness/Fatigue de Banister (Fitness ≈ chronique, Fatigue ≈
 * aiguë), juste combiné différemment selon l'usage : en ratio pour l'ACWR, en différence pour le
 * Form (TSB). Seuil relâché à 14j (au lieu de 28) pour couvrir les 7 derniers jours affichés sans
 * exiger 56j de données — au prix d'une fenêtre chronique parfois plus courte que 28j sur les tout
 * premiers jours d'usage de l'app. Différence assumée avec le vrai modèle de Banister : ici,
 * moyennes glissantes simples (comme l'ACWR standard), pas de moyennes pondérées exponentiellement
 * (le modèle Banister original utilise une décroissance exponentielle, ex. constantes de temps
 * 7j/42j) — plus simple à calculer et cohérent avec l'ACWR déjà en place, mais moins lissé.
 */
function acuteChronicAt(series: LoadPoint[], idx: number): { acute: number; chronic: number } | null {
  const upTo = series.slice(0, idx + 1);
  const nonZeroDays = upTo.filter(p => p.load > 0).length;
  if (upTo.length < 14 || nonZeroDays < 4) return null;
  return {
    acute: rollingStats(upTo, 7).mean,
    chronic: rollingStats(upTo, Math.min(upTo.length, 28)).mean,
  };
}

/**
 * ACWR par jour, pour tracer une vraie tendance (ex. chart de zones Récup/Optimal/Surcharge) —
 * contrairement à acwr() (une seule valeur, fenêtre chronique strictement à 28j), la fenêtre
 * chronique s'élargit progressivement : dès qu'un point a 28j d'historique derrière lui, sa valeur
 * est identique à acwr() ; avant ça, c'est une approximation qui se resserre au fil des jours.
 */
export function acwrSeries(series: LoadPoint[]): { value: number | null; hasEnoughHistory: boolean }[] {
  return series.map((_, idx) => {
    const ac = acuteChronicAt(series, idx);
    if (!ac) return { value: null, hasEnoughHistory: false };
    if (ac.chronic === 0) return { value: null, hasEnoughHistory: true };
    return { value: Math.round((ac.acute / ac.chronic) * 100) / 100, hasEnoughHistory: true };
  });
}

/**
 * Form (TSB-like) par jour : charge chronique ("Fitness") − charge aiguë ("Fatigue"), en UA brutes.
 * Positif = charge récente en dessous de l'habituelle (fraîcheur, ex. après un allègement/tapering) ;
 * négatif = charge récente au-dessus de l'habituelle (fatigue accumulée). C'est la même donnée que
 * l'ACWR (acuteChronicAt), combinée en différence plutôt qu'en ratio — la lecture "readiness du
 * jour" que ni la Fitness seule ni l'ACWR seul ne donnent isolément.
 */
export function formSeries(series: LoadPoint[]): { value: number | null; hasEnoughHistory: boolean }[] {
  return series.map((_, idx) => {
    const ac = acuteChronicAt(series, idx);
    if (!ac) return { value: null, hasEnoughHistory: false };
    return { value: Math.round(ac.chronic - ac.acute), hasEnoughHistory: true };
  });
}

export type TrendCode =
  | "adaptation"
  | "accumulation"
  | "recuperation_insuffisante"
  | "fatigue_persistante"
  | "recuperation"
  | "recuperation_legere"
  | "tolerance_stable"
  | "supercompensation"
  | "stable";

export type TrendInput = {
  loadPct: number | null;      // variation % charge hebdo courante vs précédente, null si pas de base de comparaison
  wellnessDelta: number | null; // wellness EWMA courant - EWMA précédent (points, sur 100) — voir ewmaWellness
  rpeDelta: number | null;      // RPE moyen courant - RPE moyen précédent
};

type Direction = "up" | "stable" | "down";

function loadDirection(pct: number): Direction {
  if (Math.abs(pct) < 15) return "stable"; // même bande que loadTrend existant (conseils/page.tsx)
  return pct > 0 ? "up" : "down";
}
function wellnessDirection(delta: number): Direction {
  if (Math.abs(delta) < 5) return "stable";
  return delta > 0 ? "up" : "down"; // "up" = amélioration (échelle app, plus haut = mieux)
}
function rpeDirection(delta: number): Direction {
  if (Math.abs(delta) < 0.5) return "stable";
  return delta > 0 ? "up" : "down";
}

/**
 * Classe la tendance charge/récupération/RPE (semaine courante vs semaine précédente) — grille
 * complète 3×3 (direction charge × signal corporel), toujours un code parmi les 9, jamais un
 * "silence" tant qu'il y a une base de comparaison valable (Gildas : "je veux toujours un
 * insight", certaines semaines "plates" ne remontaient rien auparavant). Retourne null uniquement
 * si aucune séance n'existe la semaine précédente (pas de base de comparaison du tout) — "stable"
 * n'est plus un cas silencieux, c'est la seule vraie case "rien de notable, continue" (charge et
 * signaux corporels tous les deux plats).
 */
export function classifyTrend(input: TrendInput): TrendCode | null {
  const { loadPct, wellnessDelta, rpeDelta } = input;
  if (loadPct === null || wellnessDelta === null || rpeDelta === null) return null;

  const load = loadDirection(loadPct);
  const wellness = wellnessDirection(wellnessDelta); // up = récup qui s'améliore
  const rpe = rpeDirection(rpeDelta);

  const wellnessScore = wellness === "up" ? 1 : wellness === "down" ? -1 : 0;
  const rpeScore = rpe === "down" ? 1 : rpe === "up" ? -1 : 0; // RPE en baisse = bon signe
  const bodySignal = wellnessScore + rpeScore; // -2 (dégradation nette) .. +2 (amélioration nette)

  if (bodySignal <= -1) {
    if (load === "up") return "accumulation";
    if (load === "down") return "fatigue_persistante";
    return "recuperation_insuffisante";
  }
  if (bodySignal >= 1) {
    if (load === "up") return "supercompensation";
    if (load === "down") return "recuperation";
    return "tolerance_stable";
  }
  // bodySignal === 0 : récupération et RPE ne donnent aucun signal net
  if (load === "up") return "adaptation";
  if (load === "down") return "recuperation_legere";
  return "stable";
}

type TrendSession = { date: string; done: boolean; rpe: number | null; duration: number | null };
type TrendWellness = { date: string; score: number | null; base_score: number | null };

/**
 * Calcule la tendance charge/récupération/RPE d'un sportif — 7 derniers jours glissants (jusqu'à
 * `anchor`, défaut aujourd'hui) vs les 7 jours précédents, PAS la semaine calendaire (lundi-
 * dimanche) : évite l'artefact d'un lundi/mardi où "cette semaine" n'aurait que 1-2 jours de
 * données. Source unique pour /conseils, Coach Control et la liste sportifs coach, pour que les
 * 3 surfaces s'accordent toujours sur la même classification.
 */
/* Poids EWMA (lambda = 2/(N+1), N=7 — même convention que l'EWMA de charge d'entraînement de la
   littérature sports science, ex. Williams et al. 2016) : le jour le plus récent de la fenêtre
   pèse 25% du total, chaque jour plus ancien pèse 25% de moins que le précédent (poids renormalisés
   sur les seuls jours où un wellness existe, donc les jours manquants n'introduisent pas de biais).
   Remplace la moyenne simple précédente — avec une moyenne simple, un seul jour très dégradé ne
   pesait qu'1/7 et pouvait passer inaperçu dans wellnessDelta malgré une vraie chute le jour même
   (cf. cas réel : "Augmenter" affiché un jour de fatigue franche, RÉCUP FRAGILE juste en dessous). */
const WELLNESS_EWMA_LAMBDA = 2 / (7 + 1);

function ewmaWellness(rows: TrendWellness[], windowEndStr: string): number | null {
  const byDate = new Map(rows.map(w => [w.date, w.score ?? w.base_score]));
  const end = new Date(windowEndStr + "T12:00:00");
  let weightedSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const val = byDate.get(d.toISOString().split("T")[0]);
    if (val === null || val === undefined) continue;
    const weight = WELLNESS_EWMA_LAMBDA * Math.pow(1 - WELLNESS_EWMA_LAMBDA, i);
    weightedSum += val * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}

export function computeWeekOverWeekTrend(sessions: TrendSession[], wellness: TrendWellness[], anchor: Date = new Date()): { code: TrendCode | null; input: TrendInput } {
  const refStr = daysAgoStr(0, anchor);
  const curStart = daysAgoStr(6, anchor);
  const prevEnd = daysAgoStr(7, anchor);
  const prevStart = daysAgoStr(13, anchor);

  const done7 = sessions.filter(s => s.date >= curStart && s.date <= refStr && s.done && s.rpe && s.duration);
  const prevDone = sessions.filter(s => s.date >= prevStart && s.date < curStart && s.done && s.rpe && s.duration);
  const currLoad = dailyLoad(done7);
  const prevLoad = dailyLoad(prevDone);
  const loadPct = prevLoad > 0 ? Math.round((currLoad - prevLoad) / prevLoad * 100) : null;

  const currWellnessAvg = ewmaWellness(wellness.filter(w => w.date >= curStart && w.date <= refStr), refStr);
  const prevWellnessAvg = ewmaWellness(wellness.filter(w => w.date >= prevStart && w.date < curStart), prevEnd);
  const wellnessDelta = currWellnessAvg !== null && prevWellnessAvg !== null
    ? Math.round((currWellnessAvg - prevWellnessAvg) * 10) / 10
    : null;

  const avgRpeOf = (rows: TrendSession[]) => rows.length
    ? Math.round(rows.reduce((a, s) => a + (s.rpe || 0), 0) / rows.length * 10) / 10
    : null;
  const currRpe = avgRpeOf(done7);
  const prevRpe = avgRpeOf(prevDone);
  const rpeDelta = currRpe !== null && prevRpe !== null ? Math.round((currRpe - prevRpe) * 10) / 10 : null;

  const input: TrendInput = { loadPct, wellnessDelta, rpeDelta };
  return { code: classifyTrend(input), input };
}

/** 🟢 bon signe / 🟡 à surveiller / 🔴 signal net — pour un badge visuel, cf. discussion insights. */
export function trendSeverity(code: TrendCode): "good" | "watch" | "alert" | "neutral" {
  if (code === "accumulation" || code === "fatigue_persistante") return "alert";
  if (code === "recuperation_insuffisante") return "watch";
  if (code === "adaptation" || code === "recuperation" || code === "supercompensation" || code === "tolerance_stable" || code === "recuperation_legere") return "good";
  return "neutral";
}

/**
 * Niveau 4 "Agir" (maintenir/augmenter/réduire/récupérer) — le mot-clé actionnable qui manquait
 * pour transformer l'insight (niveau 3, "Interpréter") en recommandation explicite. Un seul verbe
 * par code, pas de variante coach/athlète (un impératif à l'infinitif fonctionne pour les deux
 * lectures, contrairement aux phrases complètes de describeTrend).
 */
export function trendActionWord(code: TrendCode): "Maintenir" | "Augmenter" | "Réduire" | "Récupérer" {
  switch (code) {
    case "adaptation": return "Maintenir";
    case "supercompensation": return "Augmenter";
    case "accumulation": return "Réduire";
    case "recuperation_insuffisante": return "Réduire";
    case "fatigue_persistante": return "Récupérer";
    case "recuperation": return "Récupérer";
    case "recuperation_legere": return "Maintenir";
    case "tolerance_stable": return "Maintenir";
    case "stable": return "Maintenir";
  }
}

export type TrendPerspective = "athlete" | "coach";

function bodySignalPhrase(input: TrendInput, perspective: TrendPerspective): string {
  const recoveryWord = perspective === "coach" ? "sa récupération" : "ta récupération";
  const effortWord = perspective === "coach" ? "son effort perçu" : "ton effort perçu";
  const parts: string[] = [];
  if (input.wellnessDelta !== null && wellnessDirection(input.wellnessDelta) !== "stable") {
    parts.push(input.wellnessDelta < 0 ? `${recoveryWord} se dégrade` : `${recoveryWord} s'améliore`);
  }
  if (input.rpeDelta !== null && rpeDirection(input.rpeDelta) !== "stable") {
    parts.push(input.rpeDelta > 0 ? `${effortWord} augmente` : `${effortWord} diminue`);
  }
  return parts.length ? parts.join(" et ") : "récupération et effort perçu stables";
}

/**
 * `perspective`: "athlete" (défaut, tutoiement — /conseils) ou "coach" (3e personne — Coach
 * Control, liste sportifs coach). Le wording coach évite les pronoms genrés ("sa"/"son" possessifs
 * neutres plutôt que "il"/"elle"), même principe que decisionText() de CoachAthleteCard.
 */
export function describeTrend(code: TrendCode, input: TrendInput, perspective: TrendPerspective = "athlete"): string {
  const loadPct = input.loadPct ?? 0;
  const loadStr = `${loadPct > 0 ? "+" : ""}${loadPct}%`;
  const loadDir = loadDirection(loadPct);
  const loadWord = loadDir === "up" ? `en hausse (${loadStr})` : loadDir === "down" ? `en baisse (${loadStr})` : `stable (${loadStr})`;
  const body = bodySignalPhrase(input, perspective);
  const recoveryWord = perspective === "coach" ? "sa récupération" : "ta récupération";
  const effortWord = perspective === "coach" ? "son effort perçu" : "ton effort perçu";
  const trainingWord = perspective === "coach" ? "son entraînement" : "ton entraînement";
  const toleranceWord = perspective === "coach" ? "sa tolérance" : "ta tolérance";
  const progressionSuffix = perspective === "coach" ? "il peut poursuivre la progression prévue." : "tu peux poursuivre la progression.";
  const planSuffix = perspective === "coach" ? "le plan actuel lui convient." : "le plan actuel te convient.";
  switch (code) {
    case "adaptation":
      return `Charge ${loadWord} sans dégradation de ${recoveryWord} ni de ${effortWord} : ${trainingWord} semble bien toléré.`;
    case "accumulation":
      return `Charge ${loadWord} alors que ${body} : les signaux convergent vers une accumulation de fatigue.`;
    case "recuperation_insuffisante":
      return `À charge ${loadWord}, ${body} : ${toleranceWord} à la charge semble baisser.`;
    case "fatigue_persistante":
      return `Charge ${loadWord} mais ${body} : la fatigue accumulée ne semble pas encore résorbée.`;
    case "recuperation":
      return `Charge ${loadWord} et ${body} : phase de récupération qui semble bien engagée.`;
    case "recuperation_legere":
      return `Charge ${loadWord}, sans signal marqué de récupération ou d'effort perçu : rien d'alarmant, ${planSuffix}`;
    case "tolerance_stable":
      return `Charge stable (${loadStr}) alors que ${body} : bonne tolérance à ce niveau de charge.`;
    case "supercompensation":
      return `Charge ${loadWord} alors que ${body} : bonne tolérance actuelle, ${progressionSuffix}`;
    case "stable":
      return `Charge et signaux corporels stables cette semaine : rien de notable, ${planSuffix}`;
  }
}
