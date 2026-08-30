import type { Session, WellnessDaily } from "@/types";
import { dailyLoad, monotony as monotonyOf, strain as strainOf, strainTrendPct, acwr as acwrOf, acwrSeries as acwrSeriesOf, formPercentSeries as formPercentSeriesOf, daysAgoStr, type LoadPoint, type TrendDirection } from "@/lib/trainingLoad";
import { wellnessColor } from "@/lib/wellness";
import { Z_SWC, wellnessSignal, describeDominantDimension, type WellnessBaselineResult } from "@/lib/wellnessBaseline";

export { fitnessFatigueTrend } from "@/lib/trainingLoad";
export type { TrendDirection } from "@/lib/trainingLoad";

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

/** Définitions courtes pour les tooltips au survol des badges (ACWR/Monotonie/Contrainte/Récup/Forme) —
 * neutres (pas de "tu"/"ta"), réutilisables telles quelles côté sportif et côté coach. */
export const METRIC_DEFINITIONS: Record<"acwr" | "monotony" | "strain" | "recovery" | "form" | "fitness" | "fatigue", string> = {
  acwr: "Charge des 7 derniers jours comparée à la charge habituelle (28j). Une hausse trop rapide augmente le risque de blessure.",
  monotony: "Régularité de la charge d'entraînement. Trop répétitive = risque de fatigue et de blessure plus élevé (Foster, 1998).",
  strain: "Charge × Monotonie. Une charge élevée et répétitive à la fois est plus risquée que prise séparément (Foster, 1998).",
  recovery: "Récupération du jour : sommeil, stress, courbatures, motivation.",
  form: "Charge chronique (Fitness) moins charge récente (Fatigue), en % de la charge chronique. Positif = fraîcheur, négatif = fatigue accumulée. Un signal de tendance relative, pas une mesure physiologique directe.",
  fitness: "Charge chronique (moyenne pondérée sur ~42j) — plus elle monte, plus l'organisme s'adapte à l'entraînement.",
  fatigue: "Charge aiguë (moyenne pondérée sur ~7j) — plus elle monte par rapport à la charge chronique, plus la fatigue récente s'accumule.",
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
 * - "form" (Fitness − Fatigue, en % de la charge chronique, voir formPercentSeries) : bandes
 *   "produit" choisies pour rester lisibles (inspirées de la forme du TSB TrainingPeaks, sans
 *   reprendre ses seuils en points TSS — pas transférables à une échelle en % de Foster session-RPE)
 *   — PAS des seuils issus d'une étude, à recalibrer sur données réelles une fois assez d'historique.
 */
export type Perspective = "athlete" | "coach";

/**
 * `baseline` (optionnel, uniquement consulté pour `dim==="recovery"`, ignoré — donc zéro
 * changement de comportement — pour les 4 autres dimensions) : dès que l'historique du sportif est
 * suffisant, bascule "recovery" sur les 3 zones relatives ("Frais/Équilibré/Fatigué") au lieu
 * des seuils absolus 70/50 — voir src/lib/wellnessBaseline.ts. `value` reste le repli exact tant
 * que ce n'est pas le cas (comportement 100% inchangé pour tout appelant qui ne fournit pas encore
 * ce paramètre).
 */
export function sigDimInfo(dim: "load" | "monotony" | "recovery" | "strain" | "form", value: number, perspective: Perspective = "athlete", baseline?: WellnessBaselineResult | null): { label: string; color: string; text: string } {
  const coach = perspective === "coach";
  if (dim === "form") {
    // 3 bandes (pas 5) — la version à 5 paliers testée d'abord ajoutait plus de bruit que de
    // lecture utile sur un aussi petit chart ; ±8% aligné sur recoveryCrossInsight juste au-dessus.
    if (value >= 8) return { label: "FRAIS", color: "#2f9e44", text: coach ? "Charge récente sous sa charge habituelle : fraîcheur disponible." : "Ta charge récente est sous ta charge habituelle : fraîcheur disponible." };
    if (value > -8) return { label: "ÉQUILIBRÉ", color: "#8a8f94", text: "Charge récente proche de la charge habituelle." };
    return { label: "FATIGUE ACCUMULÉE", color: "#d10000", text: coach ? "Charge récente au-dessus de sa charge habituelle : fatigue qui s'accumule." : "Ta charge récente est au-dessus de ta charge habituelle : fatigue qui s'accumule." };
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
    if (value < 6000) return { label: "CONTRAINTE OK", color: "#2f9e44", text: "En dessous du seuil de fatigue (Foster, 1998)." };
    if (value < 10000) return { label: "RISQUE FATIGUE", color: "#f28a00", text: "Fatigue/surentraînement possible au-delà de 6000 UA/semaine (Foster, 1998)." };
    return { label: "RISQUE BLESSURE", color: "#d10000", text: "Risque de blessure accru au-delà de 10000 UA/semaine (Foster, 1998)." };
  }
  // Couleur = wellnessColor(value) (dégradé séquentiel bleu, même source que le ring/chart) au lieu
  // de rouge/orange/vert — la fonction elle-même n'est jamais modifiée, seul le nombre qu'elle reçoit
  // change (relatif dès que la baseline est fournie, absolu sinon).
  if (baseline?.hasEnoughHistory && baseline.composite.z !== null) {
    const z = baseline.composite.z;
    if (z >= Z_SWC) return { label: "FRAIS", color: wellnessColor(value), text: coach ? "Récupération au-dessus de sa norme habituelle." : "Ta récupération est au-dessus de ta norme habituelle." };
    if (z >= -Z_SWC) return { label: "ÉQUILIBRÉ", color: wellnessColor(value), text: coach ? "Récupération dans sa norme habituelle." : "Ta récupération est dans ta norme habituelle." };
    return { label: "FATIGUÉ", color: wellnessColor(value), text: coach ? "Récupération sous sa norme habituelle — éviter d'enchaîner les séances dures." : "Ta récupération est sous ta norme habituelle — évite d'enchaîner les séances dures." };
  }
  if (value >= 70) return { label: "BONNE RÉCUP",  color: wellnessColor(value), text: "Bonne capacité de récupération." };
  if (value >= 50) return { label: "RÉCUP STABLE", color: wellnessColor(value), text: coach ? "Récupération moyenne — sommeil à surveiller." : "Récupération moyenne — surveille le sommeil." };
  return             { label: "RÉCUP FRAGILE", color: wellnessColor(value), text: coach ? "Récupération fragile — éviter d'enchaîner les séances dures." : "Récupération fragile — évite d'enchaîner les séances dures." };
}

/**
 * Badge de tendance Fitness/Fatigue (7 derniers jours) — jamais la valeur EWMA brute (UA sans
 * repère fixe, voir formPercentSeries dans trainingLoad.ts), seulement la direction. "Fitness en
 * baisse" et "Fatigue en hausse" ne sont pas symétriquement négatifs : monter en fatigue est un
 * signal à surveiller (orange), monter en fitness est positif (vert) — même logique inversée entre
 * les deux dimensions, comme Fitness/Fatigue le sont conceptuellement (adaptation vs coût récent).
 */
export function trendDimInfo(dim: "fitness" | "fatigue", trend: TrendDirection, perspective: Perspective = "athlete"): { label: string; color: string; text: string } {
  const coach = perspective === "coach";
  if (dim === "fitness") {
    if (trend === "up") return { label: "FITNESS ↗", color: "#2f9e44", text: coach ? "Charge chronique en hausse : adaptation à l'entraînement en cours." : "Ta charge chronique est en hausse : tu es en phase d'adaptation." };
    if (trend === "down") return { label: "FITNESS ↘", color: "#f28a00", text: coach ? "Charge chronique en baisse : possible perte de forme si ça dure." : "Ta charge chronique est en baisse : possible perte de forme si ça dure." };
    return { label: "FITNESS → STABLE", color: "#8a8f94", text: "Charge chronique stable ces derniers jours." };
  }
  if (trend === "up") return { label: "FATIGUE ACCUMULÉE ↗", color: "#f28a00", text: coach ? "Charge récente en hausse par rapport à sa charge habituelle." : "Ta charge récente est en hausse par rapport à ta charge habituelle." };
  if (trend === "down") return { label: "FATIGUE ACCUMULÉE ↘", color: "#2f9e44", text: coach ? "Charge récente en baisse : récupération en cours." : "Ta charge récente est en baisse : récupération en cours." };
  return { label: "FATIGUE ACCUMULÉE → STABLE", color: "#8a8f94", text: "Charge récente stable ces derniers jours." };
}

type ZoneInfo = { label: string; color: string; text: string };
type Severity = "good" | "watch" | "alert";
function severityOf(color: string): Severity {
  if (color === "#d10000") return "alert";
  if (color === "#f28a00") return "watch";
  return "good";
}

/**
 * Insight croisé "Charge" — combine ACWR, monotonie, strain, et (depuis le déplacement des badges
 * Fitness/Fatigue vers la carte Charge) leur tendance, en une seule phrase plutôt que de laisser le
 * sportif recouper 5 badges tout seul. Priorité aux signaux "alerte" (rouge), puis "à surveiller"
 * (orange). Fitness/Fatigue optionnels (`null` tant que <14j d'historique, comme le reste) — jamais
 * de statut "alerte" pour ces deux-là (trendDimInfo ne renvoie que vert/gris/orange), seulement
 * "à surveiller" (fitness en baisse, fatigue en hausse) ou rien (stable/positif).
 */
/* Action concrète par métrique (2026-08-31) — remplace les fins de phrase vagues ("à prendre au
   sérieux", "reste attentif") par une vraie instruction, propre à CE qui a déclenché l'alerte plutôt
   qu'un conseil générique. `fitness`/`fatigue` absents ici : jamais "alert" (voir commentaire de
   chargeCrossInsight), seulement "watch" — pas d'action dédiée nécessaire, le fallback watch suffit. */
const CHARGE_METRIC_ACTION: Record<"load" | "monotony" | "strain", { coach: string; athlete: string }> = {
  load: {
    coach: "réduis le volume ou l'intensité de ses prochaines séances.",
    athlete: "réduis le volume ou l'intensité de tes prochaines séances.",
  },
  monotony: {
    coach: "varie l'intensité d'un jour à l'autre plutôt que d'enchaîner des séances similaires.",
    athlete: "varie l'intensité d'un jour à l'autre plutôt que d'enchaîner des séances similaires.",
  },
  strain: {
    coach: "insère un jour de récupération avant sa prochaine séance dure.",
    athlete: "insère un jour de récupération avant ta prochaine séance dure.",
  },
};

export function chargeCrossInsight(loadInfo: ZoneInfo, monotonyInfo: ZoneInfo, strainInfo: ZoneInfo, fitnessTrendInfo?: ZoneInfo | null, fatigueTrendInfo?: ZoneInfo | null, perspective: Perspective = "athlete"): string {
  const coach = perspective === "coach";
  const items: { name: string; key: "load" | "monotony" | "strain" | "fitness" | "fatigue"; sev: Severity }[] = [
    { name: coach ? "sa charge (ACWR)" : "ta charge (ACWR)", key: "load", sev: severityOf(loadInfo.color) },
    { name: coach ? "sa monotonie" : "ta monotonie", key: "monotony", sev: severityOf(monotonyInfo.color) },
    { name: coach ? "son strain" : "ton strain", key: "strain", sev: severityOf(strainInfo.color) },
  ];
  if (fitnessTrendInfo) items.push({ name: coach ? "sa fitness" : "ta fitness", key: "fitness", sev: severityOf(fitnessTrendInfo.color) });
  if (fatigueTrendInfo) items.push({ name: coach ? "sa fatigue accumulée" : "ta fatigue accumulée", key: "fatigue", sev: severityOf(fatigueTrendInfo.color) });
  const alerts = items.filter(i => i.sev === "alert");
  const watches = items.filter(i => i.sev === "watch");
  if (alerts.length >= 2) return coach
    ? `Plusieurs signaux de charge convergent vers un risque accru (${alerts.map(a => a.name).join(", ")}) : allègement conseillé dans les prochains jours.`
    : `Plusieurs signaux de charge convergent vers un risque accru (${alerts.map(a => a.name).join(", ")}) : allège significativement dans les prochains jours.`;
  if (alerts.length === 1) {
    const key = alerts[0].key as "load" | "monotony" | "strain"; // fitness/fatigue jamais "alert"
    const action = CHARGE_METRIC_ACTION[key][coach ? "coach" : "athlete"];
    return `${alerts[0].name} est en zone de risque : ${action}`;
  }
  if (watches.length >= 2) return coach
    ? `${watches.map(w => w.name).join(" et ")} sont à surveiller ensemble : lève le pied si l'un des deux continue de se dégrader.`
    : `${watches.map(w => w.name).join(" et ")} sont à surveiller ensemble : lève le pied si l'un des deux continue de se dégrader.`;
  if (watches.length === 1) return coach
    ? `${watches[0].name} est à surveiller : le reste de ses indicateurs est bon.`
    : `${watches[0].name} est à surveiller : le reste de tes indicateurs est bon.`;
  const extra = (fitnessTrendInfo || fatigueTrendInfo) ? ", fitness et fatigue" : "";
  return `Charge, monotonie, strain${extra} sont tous dans des zones saines : rien à ajuster.`;
}

/**
 * Insight croisé "Récupération" — combine le wellness (ressenti subjectif du jour) et la Forme
 * (charge chronique − aiguë, signal objectif dérivé de l'entraînement). Les deux peuvent diverger
 * (ex. bon wellness mais charge récente élevée = fatigue possible avec un décalage) — c'est
 * justement ce décalage qui est le plus intéressant à signaler.
 *
 * `baseline` (optionnel) : quand fourni et son historique suffisant, la dimension qui domine le Z
 * du jour (positive ou négative — describeDominantDimension(), wellnessBaseline.ts) est ajoutée en
 * fin de phrase ("Sommeil au-dessus de ta norme.") — répond au "pour savoir quelle dimension
 * impacte" plutôt que de laisser l'insight composite sans détail. Absent/insuffisant = comportement
 * 100% inchangé (phrase seule, comme avant ce paramètre). */
export function recoveryCrossInsight(recoveryInfo: ZoneInfo, formValue: number | null, perspective: Perspective = "athlete", baseline?: WellnessBaselineResult | null): string {
  const dominant = baseline ? describeDominantDimension(baseline, perspective) : null;
  const suffix = dominant ? ` ${dominant.charAt(0).toUpperCase() + dominant.slice(1)}.` : "";

  if (formValue === null) return recoveryInfo.text + suffix;
  const coach = perspective === "coach";
  // Bornes alignées sur la bande "Équilibré" de sigDimInfo (±8%, voir plus haut) — pas de nouveau
  // seuil inventé séparément.
  const formGood = formValue >= 8;
  const formBad = formValue <= -8;
  // Sur le label, pas la couleur : depuis le passage du badge Récupération au dégradé séquentiel
  // bleu (wellnessColor), la couleur n'est plus un rouge/vert fixe comparable par égalité — le
  // label reste, lui, une chaîne stable. 2 jeux de libellés possibles selon que sigDimInfo("recovery",...)
  // a basculé sur la baseline relative ou non (voir sigDimInfo plus haut) — les deux sont testés ici.
  const wellGood = recoveryInfo.label === "BONNE RÉCUP" || recoveryInfo.label === "FRAIS";
  const wellBad = recoveryInfo.label === "RÉCUP FRAGILE" || recoveryInfo.label === "FATIGUÉ";
  if (wellGood && formGood) return (coach
    ? "Récupération et forme (charge chronique vs récente) sont alignées positivement : prêt à bien performer."
    : "Récupération et forme (charge chronique vs récente) sont alignées positivement : tu es prêt à bien performer.") + suffix;
  if (wellBad && formBad) return (coach
    ? "Récupération basse et forme dégradée en même temps : signaux convergents de fatigue, récupération à prioriser."
    : "Récupération basse et forme dégradée en même temps : signaux convergents de fatigue, priorise la récupération.") + suffix;
  if (wellGood && formBad) return (coach
    ? "Récupération bonne, mais charge récente au-dessus de l'habituelle : surveille les prochains jours, une fatigue avec décalage peut encore apparaître."
    : "Tu te sens bien, mais ta charge récente dépasse ta charge habituelle : reste vigilant les prochains jours, une fatigue avec décalage peut encore apparaître.") + suffix;
  if (wellBad && formGood) return (coach
    ? "Charge récente sous l'habituelle mais récupération basse : la fatigue ne semble pas (encore) liée à l'entraînement, vérifie son sommeil et son stress des derniers jours."
    : "Ta charge récente est sous ta charge habituelle mais ta récupération reste basse : la fatigue ne semble pas (encore) liée à l'entraînement, vérifie ton sommeil et ton stress des derniers jours.") + suffix;
  return recoveryInfo.text + suffix;
}

export type DayPoint = {
  date: string;
  load: number;             // charge Foster du jour (RPE × durée, Σ séances terminées)
  monotony: number | null;  // monotonie 7j glissante se terminant ce jour-là (null si <7j d'historique dans la fenêtre)
  strain: number | null;    // contrainte (charge hebdo × monotonie) 7j glissante se terminant ce jour-là — même fenêtre que monotony, null si <7j d'historique
  acwr: number | null;      // ACWR ce jour-là (fenêtre chronique élargie progressivement, voir acwrSeries) — null si <14j d'historique
  recovery: number | null;  // wellness score ce jour-là
  form: number | null;      // Forme (Fitness − Fatigue) en % de la charge chronique, voir formPercentSeries — null si <14j d'historique
  formRaw: number | null;   // Forme en UA brutes (fitness EWMA42j − fatigue EWMA7j), pour affichage tooltip
};

export function buildDailyTimeSeries(sessions: Session[], wellness: WellnessDaily[], days = 28, anchor: Date = new Date()): DayPoint[] {
  const loadPoints: LoadPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    loadPoints.push({ date, load: dailyLoad(sessions.filter(s => s.date === date)) });
  }

  const acwrPoints = acwrSeriesOf(loadPoints);
  const formPoints = formPercentSeriesOf(loadPoints);

  return loadPoints.map((p, idx) => {
    const monotonyVal = idx >= 6 ? monotonyOf(loadPoints.slice(0, idx + 1)) : null;
    const strainVal = idx >= 6 ? strainOf(loadPoints.slice(0, idx + 1)) : null;
    const fp = formPoints[idx];
    const form = fp.value;
    const formRaw = fp.fitness !== null && fp.fatigue !== null ? Math.round(fp.fitness - fp.fatigue) : null;
    const w = wellness.find(wd => wd.date === p.date);
    // base_score en priorité (jamais score, qui inclut le bonus/malus comportements) — voir
    // wellnessSignal() dans wellnessBaseline.ts pour le pourquoi ; nécessaire pour que ce chiffre
    // reste comparable à la baseline personnelle calculée ailleurs sur la même donnée.
    const recovery = w ? wellnessSignal(w) : null;
    return { date: p.date, load: p.load, monotony: monotonyVal, strain: strainVal, acwr: acwrPoints[idx].value, recovery, form, formRaw };
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
