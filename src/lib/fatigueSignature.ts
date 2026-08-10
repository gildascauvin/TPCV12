import type { Session, WellnessDaily } from "@/types";
import { dailyLoad, monotony as monotonyOf, strain as strainOf, strainTrendPct, acwr as acwrOf, acwrSeries as acwrSeriesOf, formSeries as formSeriesOf, daysAgoStr, type LoadPoint } from "@/lib/trainingLoad";

export { daysAgoStr } from "@/lib/trainingLoad";

/**
 * Signature de fatigue par sportif — calculée sur des métriques réelles (Foster session-RPE +
 * monotonie + wellness littéral). Utilisée par /conseils (28j) et /coach/athletes (14j condensé).
 * `anchor` (défaut aujourd'hui) permet de rejouer le calcul pour une date passée — voir le
 * sélecteur de date sur /conseils et /coach/athletes.
 */
export function computeSignature(sessions: Session[], wellnessScore: number, days = 28, anchor: Date = new Date()) {
  const done = sessions.filter(s => s.done && s.rpe && s.duration);
  const avgRpe = done.length
    ? Math.round(done.reduce((a, s) => a + (s.rpe || 0), 0) / done.length * 10) / 10
    : 7;
  const hard = done.filter(s => (s.rpe || 0) >= 8).length;
  const long = done.filter(s => (s.duration || 0) >= 70).length;
  const signals = done.length;

  const loadPoints: LoadPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    loadPoints.push({ date, load: dailyLoad(sessions.filter(s => s.date === date)) });
  }
  const weeklyLoad = loadPoints.slice(-7).reduce((a, p) => a + p.load, 0);
  const chronicLoad = loadPoints.length
    ? Math.round((loadPoints.reduce((a, p) => a + p.load, 0) / loadPoints.length) * 10) / 10
    : 0;
  const monotony = monotonyOf(loadPoints);
  const strain = strainOf(loadPoints);
  const strainPct = strainTrendPct(loadPoints);
  const acwr = acwrOf(loadPoints); // hasEnoughHistory reste false si `days` < 28 (ex. 14j côté coach)

  return { monotony, strain, strainPct, acwr, weeklyLoad, chronicLoad, recovery: wellnessScore, signals, hard, long, avgRpe };
}

/** Définitions courtes pour les tooltips au survol des badges (ACWR/Monotonie/Strain/Récup/Form) —
 * neutres (pas de "tu"/"ta"), réutilisables telles quelles côté sportif et côté coach. */
export const METRIC_DEFINITIONS: Record<"acwr" | "monotony" | "strain" | "recovery" | "form", string> = {
  acwr: "Charge des 7 derniers jours comparée à la charge habituelle (28j). Une hausse trop rapide augmente le risque de blessure.",
  monotony: "Régularité de la charge d'entraînement. Trop répétitive = risque de fatigue et de blessure plus élevé (Foster, 1998).",
  strain: "Charge × Monotonie. Une charge élevée et répétitive à la fois est plus risquée que prise séparément (Foster, 1998).",
  recovery: "Wellness du jour : sommeil, stress, courbatures, motivation.",
  form: "Charge habituelle moins charge récente. Positif = fraîcheur, négatif = fatigue accumulée.",
};

/**
 * Seuillage d'affichage pour les dimensions de la signature.
 * - "load" : ACWR (charge aiguë 7j / charge chronique jusqu'à 28j, voir acwrSeries) — seuils issus
 *   de la littérature (Gabbett et al., la "sweet spot" 0.8–1.3 est la bande la plus citée) :
 *   <0.8 sous-charge, 0.8–1.3 zone optimale, 1.3–1.5 risque modéré, >1.5 risque élevé. Jamais
 *   présenté comme un score de risque de blessure (usage prédictif contesté dans la littérature
 *   récente) — uniquement comme indicateur de tendance de charge.
 * - "monotony" : seuils Foster, 1998 — diminution de la capacité de performance/fatigue au-delà de
 *   2, survenue de blessures au-delà de 2,5.
 * - "strain" (Contrainte = Charge × Monotonie, hebdomadaire) : seuils Foster, 1998 — fatigue/
 *   surentraînement possible au-delà de 6000 UA/semaine, risque de blessure au-delà de 10000 UA/semaine.
 * - "recovery" : wellness littéral (échelle app 0-100, plus haut = mieux), seuils inchangés.
 * - "form" (Fitness − Fatigue, TSB-like) : indice normalisé 0-100 autour de 50 = neutre (voir
 *   buildDailyTimeSeries), pas de seuil qualitatif universel — utile en évolution relative, pas en
 *   valeur absolue isolée.
 */
export type Perspective = "athlete" | "coach";

export function sigDimInfo(dim: "load" | "monotony" | "recovery" | "strain" | "form", value: number, perspective: Perspective = "athlete"): { label: string; color: string; text: string } {
  const coach = perspective === "coach";
  if (dim === "form") {
    // Pas de seuil universel (contrairement à ACWR/monotonie/strain) — indice normalisé sur le
    // pic personnel de la fenêtre, seuils choisis pour rester cohérents avec recoveryCrossInsight
    // (formGood > 55, formBad < 45).
    if (value > 55) return { label: "FRAIS", color: "#2f9e44", text: coach ? "Charge récente sous sa charge habituelle : fraîcheur disponible." : "Charge récente sous ta charge habituelle : fraîcheur disponible." };
    if (value < 45) return { label: "FATIGUE", color: "#f28a00", text: coach ? "Charge récente au-dessus de sa charge habituelle : fatigue qui s'accumule." : "Charge récente au-dessus de ta charge habituelle : fatigue qui s'accumule." };
    return { label: "ÉQUILIBRÉ", color: "#8a8f94", text: "Charge récente proche de la charge habituelle." };
  }
  if (dim === "load") {
    if (value < 0.8) return { label: "SOUS-CHARGE", color: "#8a8f94", text: coach ? "En dessous de sa zone d'entraînement optimale (ACWR < 0,8)." : "En dessous de ta zone d'entraînement optimale (ACWR < 0,8)." };
    if (value <= 1.3) return { label: "ZONE OPTIMALE", color: "#2f9e44", text: "Dans la fourchette de charge recommandée (ACWR 0,8–1,3)." };
    if (value <= 1.5) return { label: "RISQUE MODÉRÉ", color: "#f28a00", text: coach ? "Charge récente nettement au-dessus de sa charge chronique — récupération à surveiller." : "Charge récente nettement au-dessus de ta charge chronique — surveille la récupération." };
    return { label: "RISQUE ÉLEVÉ", color: "#d10000", text: coach ? "Charge récente très au-dessus de sa charge chronique (ACWR > 1,5)." : "Charge récente très au-dessus de ta charge chronique (ACWR > 1,5)." };
  }
  if (dim === "monotony") {
    if (value < 2) return { label: "VARIÉE", color: "#2f9e44", text: "Charge bien variée d'un jour à l'autre." };
    if (value <= 2.5) return { label: "FATIGUE PROBABLE", color: "#f28a00", text: "Diminution de la capacité de performance probable au-delà de 2 (Foster, 1998)." };
    return { label: "RISQUE BLESSURE", color: "#d10000", text: "Risque de blessure accru au-delà de 2,5 (Foster, 1998)." };
  }
  if (dim === "strain") {
    if (value < 6000) return { label: "STRAIN OK", color: "#2f9e44", text: "En dessous du seuil de fatigue (Foster, 1998)." };
    if (value < 10000) return { label: "RISQUE FATIGUE", color: "#f28a00", text: "Fatigue/surentraînement possible au-delà de 6000 UA/semaine (Foster, 1998)." };
    return { label: "RISQUE BLESSURE", color: "#d10000", text: "Risque de blessure accru au-delà de 10000 UA/semaine (Foster, 1998)." };
  }
  if (value >= 70) return { label: "BONNE RÉCUP",  color: "#2f9e44", text: "Bonne capacité de récupération." };
  if (value >= 50) return { label: "RÉCUP STABLE", color: "#f28a00", text: coach ? "Récupération moyenne — sommeil à surveiller." : "Récupération moyenne — surveille le sommeil." };
  return             { label: "RÉCUP FRAGILE", color: "#d10000", text: coach ? "Récupération fragile — éviter d'enchaîner les séances dures." : "Récupération fragile — évite d'enchaîner les séances dures." };
}

type ZoneInfo = { label: string; color: string; text: string };
type Severity = "good" | "watch" | "alert";
function severityOf(color: string): Severity {
  if (color === "#d10000") return "alert";
  if (color === "#f28a00") return "watch";
  return "good";
}

/**
 * Insight croisé "Charge" — combine ACWR, monotonie et strain (3 signaux distincts de la même
 * dimension charge) en une seule phrase, plutôt que de laisser le sportif recouper 3 badges tout
 * seul. Priorité aux signaux "alerte" (rouge), puis "à surveiller" (orange).
 */
export function chargeCrossInsight(loadInfo: ZoneInfo, monotonyInfo: ZoneInfo, strainInfo: ZoneInfo, perspective: Perspective = "athlete"): string {
  const coach = perspective === "coach";
  const items = [
    { name: coach ? "sa charge (ACWR)" : "ta charge (ACWR)", sev: severityOf(loadInfo.color) },
    { name: coach ? "sa monotonie" : "ta monotonie", sev: severityOf(monotonyInfo.color) },
    { name: coach ? "son strain" : "ton strain", sev: severityOf(strainInfo.color) },
  ];
  const alerts = items.filter(i => i.sev === "alert").map(i => i.name);
  const watches = items.filter(i => i.sev === "watch").map(i => i.name);
  if (alerts.length >= 2) return coach
    ? `Plusieurs signaux de charge convergent vers un risque accru (${alerts.join(", ")}) : allègement conseillé dans les prochains jours.`
    : `Plusieurs signaux de charge convergent vers un risque accru (${alerts.join(", ")}) : allège significativement dans les prochains jours.`;
  if (alerts.length === 1) return coach
    ? `${alerts[0]} est en zone de risque : à prendre au sérieux, même si le reste va bien.`
    : `${alerts[0]} est en zone de risque : prends-le au sérieux, même si le reste va bien.`;
  if (watches.length >= 2) return coach
    ? `${watches.join(" et ")} sont à surveiller ensemble ces prochains jours.`
    : `${watches.join(" et ")} sont à surveiller ensemble : reste attentif ces prochains jours.`;
  if (watches.length === 1) return coach
    ? `${watches[0]} est à surveiller, le reste de sa charge est sain.`
    : `${watches[0]} est à surveiller, le reste de ta charge est sain.`;
  return "Charge, monotonie et strain sont tous dans des zones saines : rien à ajuster.";
}

/**
 * Insight croisé "Récupération" — combine le wellness (ressenti subjectif du jour) et le Form
 * (charge chronique − aiguë, signal objectif dérivé de l'entraînement). Les deux peuvent diverger
 * (ex. bon wellness mais charge récente élevée = fatigue possible avec un décalage) — c'est
 * justement ce décalage qui est le plus intéressant à signaler.
 */
export function recoveryCrossInsight(recoveryInfo: ZoneInfo, formValue: number | null, perspective: Perspective = "athlete"): string {
  if (formValue === null) return recoveryInfo.text;
  const coach = perspective === "coach";
  const formGood = formValue > 55;
  const formBad = formValue < 45;
  const wellGood = recoveryInfo.color === "#2f9e44";
  const wellBad = recoveryInfo.color === "#d10000";
  if (wellGood && formGood) return coach
    ? "Wellness et forme (charge chronique vs récente) sont alignés positivement : prêt à bien performer."
    : "Wellness et forme (charge chronique vs récente) sont alignés positivement : tu es prêt à bien performer.";
  if (wellBad && formBad) return coach
    ? "Wellness bas et forme dégradée en même temps : signaux convergents de fatigue, récupération à prioriser."
    : "Wellness bas et forme dégradée en même temps : signaux convergents de fatigue, priorise la récupération.";
  if (wellGood && formBad) return coach
    ? "Wellness bon, mais charge récente au-dessus de l'habituelle : une fatigue avec décalage est possible dans les prochains jours."
    : "Tu te sens bien, mais ta charge récente dépasse ta charge habituelle : une fatigue avec décalage est possible dans les prochains jours.";
  if (wellBad && formGood) return coach
    ? "Charge récente sous l'habituelle mais wellness bas : la fatigue ne semble pas (encore) liée à l'entraînement — sommeil/stress à explorer."
    : "Ta charge récente est sous ta charge habituelle mais ton wellness reste bas : la fatigue ne semble pas (encore) liée à l'entraînement — regarde sommeil/stress.";
  return recoveryInfo.text;
}

export type DayPoint = {
  date: string;
  load: number;             // charge Foster du jour (RPE × durée, Σ séances terminées)
  monotony: number | null;  // monotonie 7j glissante se terminant ce jour-là (null si <7j d'historique dans la fenêtre)
  acwr: number | null;      // ACWR ce jour-là (fenêtre chronique élargie progressivement, voir acwrSeries) — null si <14j d'historique
  recovery: number | null;  // wellness score ce jour-là
  form: number | null;      // Form (TSB-like) normalisé 0-100 (50 = neutre) pour partager l'axe visuel avec le wellness — null si <14j d'historique
  formRaw: number | null;   // Form en UA brutes (chronique − aiguë), pour affichage tooltip
};

export function buildDailyTimeSeries(sessions: Session[], wellness: WellnessDaily[], days = 28, anchor: Date = new Date()): DayPoint[] {
  const loadPoints: LoadPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    loadPoints.push({ date, load: dailyLoad(sessions.filter(s => s.date === date)) });
  }

  const acwrPoints = acwrSeriesOf(loadPoints);
  const formPoints = formSeriesOf(loadPoints);

  // Normalisation 0-100 (50 = neutre) sur le pic absolu observé dans la fenêtre, pour partager
  // l'axe visuel avec le wellness (0-100) — voir /conseils.
  const maxAbsForm = Math.max(
    ...formPoints.filter(p => p.value !== null).map(p => Math.abs(p.value as number)),
    1
  );

  return loadPoints.map((p, idx) => {
    const monotonyVal = idx >= 6 ? monotonyOf(loadPoints.slice(0, idx + 1)) : null;
    const formRaw = formPoints[idx].value;
    const form = formRaw !== null ? Math.round(50 + (formRaw / maxAbsForm) * 50) : null;
    const w = wellness.find(wd => wd.date === p.date);
    const recovery = (w?.score ?? w?.base_score) ?? null;
    return { date: p.date, load: p.load, monotony: monotonyVal, acwr: acwrPoints[idx].value, recovery, form, formRaw };
  });
}

// Signature condensée d'un sportif pour la liste /coach/athletes : "manual" (sportif géré à la
// main par le coach, pas de wellness quotidien), "no_data" (sportif réel mais rien renseigné sur
// la fenêtre), "ok" (courbes + stats exploitables — mêmes charts/badges/insights que /conseils).
export type AthleteSignature =
  | { kind: "manual" }
  | { kind: "no_data" }
  | {
      kind: "ok";
      series: DayPoint[];
      sig: ReturnType<typeof computeSignature>;
    };
