import type { Session, WellnessDaily } from "@/types";
import { dailyLoad, monotony as monotonyOf, strain as strainOf, strainTrendPct, acwr as acwrOf, acwrSeries as acwrSeriesOf, formPercentSeries as formPercentSeriesOf, rollingStats as rollingStatsOf, daysAgoStr, type LoadPoint, type TrendDirection, type TrendCode } from "@/lib/trainingLoad";
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
  acwr: "Charge des 7 derniers jours comparée à la charge chronique (28j). Une hausse trop rapide augmente le risque de blessure.",
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
    if (value >= 8) return { label: "FRAIS", color: "#2f9e44", text: coach ? "Charge récente sous sa charge chronique : fraîcheur disponible." : "Ta charge récente est sous ta charge chronique : fraîcheur disponible." };
    if (value > -8) return { label: "ÉQUILIBRÉ", color: "#8a8f94", text: "Charge récente proche de la charge chronique." };
    return { label: "FATIGUE ACCUMULÉE", color: "#d10000", text: coach ? "Charge récente au-dessus de sa charge chronique : fatigue qui s'accumule." : "Ta charge récente est au-dessus de ta charge chronique : fatigue qui s'accumule." };
  }
  if (dim === "load") {
    /* Jaune et non plus gris (2026-09-27, demande de Gildas pour la ligne du chart Charge — "jaune si
       en bas") : le gris #8a8f94 sert partout ailleurs dans l'app à dire "pas de donnée", alors que la
       sous-charge EST un signal (le texte de l'insight dit déjà "possible perte de forme si ça dure").
       Changé ici, à la source, plutôt que dans le chart seul — sinon la ligne et le badge du même état
       auraient deux couleurs différentes. Teinte reprise du POC de Gildas (`charge-poc (4).html`). */
    if (value < 0.8) return { label: "SOUS-CHARGE", color: "#eab308", text: coach ? "En dessous de sa zone d'entraînement optimale (ACWR < 0,8)." : "En dessous de ta zone d'entraînement optimale (ACWR < 0,8)." };
    if (value <= 1.3) return { label: "ZONE OPTIMALE", color: "#2f9e44", text: "Dans la fourchette de charge recommandée (ACWR 0,8–1,3)." };
    if (value <= 1.5) return { label: "RISQUE MODÉRÉ", color: "#f28a00", text: coach ? "Charge récente nettement au-dessus de sa charge chronique : récupération à surveiller." : "Charge récente nettement au-dessus de ta charge chronique : surveille la récupération." };
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
  if (trend === "up") return { label: "FATIGUE ACCUMULÉE ↗", color: "#f28a00", text: coach ? "Charge récente en hausse par rapport à sa charge chronique." : "Ta charge récente est en hausse par rapport à ta charge chronique." };
  if (trend === "down") return { label: "FATIGUE ACCUMULÉE ↘", color: "#2f9e44", text: coach ? "Charge récente en baisse : récupération en cours." : "Ta charge récente est en baisse : récupération en cours." };
  return { label: "FATIGUE ACCUMULÉE → STABLE", color: "#8a8f94", text: "Charge récente stable ces derniers jours." };
}

type ZoneInfo = { label: string; color: string; text: string };
/* Exporté avec severityOf (2026-09-29) : le score agrégé de l'Accueil prend ces sévérités en
   entrée, et les réécrire en union locale ailleurs les ferait diverger de severityOf. */
export type Severity = "good" | "watch" | "alert";
/* Exporté (2026-09-28) — les cartes d'indice de l'Accueil ont besoin de la même lecture de
   sévérité pour décider si l'insight doit porter l'action (l'indice décroche) ou expliquer
   l'indicateur (tout va bien). Dupliquer ce test de couleur ailleurs le ferait diverger. */
export function severityOf(color: string): Severity {
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

/* Première lettre en majuscule — nécessaire partout où `name` (toujours au format minuscule "ta/sa
   ...", pensé pour s'insérer au milieu d'une phrase, ex. la liste entre parenthèses de la branche
   alerts≥2) démarre en réalité la phrase (branches à un seul élément ci-dessous). */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CHARGE_METRIC_NAME: Record<"load" | "monotony" | "strain", { coach: string; athlete: string }> = {
  load: { coach: "sa charge (ACWR)", athlete: "ta charge (ACWR)" },
  monotony: { coach: "sa monotonie", athlete: "ta monotonie" },
  strain: { coach: "son strain", athlete: "ton strain" },
};

/* Exportée (2026-09, decisionCard.ts) — même format "{métrique nommée} est en zone de risque :
   {action}" que la branche alerts.length===1 de chargeCrossInsight() ci-dessous, plutôt que le texte
   observationnel de sigDimInfo() seul ("Diminution de la capacité de performance probable au-delà de
   2 (Foster, 1998)."), qui ne nomme jamais la métrique concernée et ne dit jamais quoi faire —
   retour explicite de Gildas : "on sait même pas que ça parle de monotonie, il faudrait plutôt
   conseiller de varier que constater". */
export function chargeMetricAttribution(dim: "load" | "monotony" | "strain", perspective: Perspective = "athlete"): string {
  const coach = perspective === "coach";
  const name = CHARGE_METRIC_NAME[dim][coach ? "coach" : "athlete"];
  const action = CHARGE_METRIC_ACTION[dim][coach ? "coach" : "athlete"];
  return `${cap(name)} est en zone de risque : ${action}`;
}

/* Fitness et Fatigue ne sont PLUS ici (2026-09-29, décision de Gildas). Elles étaient AFFICHÉES
   comme cartes dans l'onglet Récupération mais RACONTÉES dans l'insight de la charge — d'où les
   deux incohérences qu'il a relevées en prod : l'insight de récup ne pouvait structurellement pas
   mentionner sa fatigue accumulée, et l'insight de charge disait "ta charge récente est en hausse"
   pendant que la carte décision disait "ta charge chronique baisse". Elles vivent désormais dans
   recoveryCrossInsight(), avec les cartes qui les affichent. */
export function chargeCrossInsight(loadInfo: ZoneInfo, monotonyInfo: ZoneInfo, strainInfo: ZoneInfo, perspective: Perspective = "athlete"): string {
  const coach = perspective === "coach";
  const items: { name: string; text: string; key: "load" | "monotony" | "strain"; sev: Severity }[] = [
    { name: coach ? "sa charge (ACWR)" : "ta charge (ACWR)", text: loadInfo.text, key: "load", sev: severityOf(loadInfo.color) },
    { name: coach ? "sa monotonie" : "ta monotonie", text: monotonyInfo.text, key: "monotony", sev: severityOf(monotonyInfo.color) },
    { name: coach ? "son strain" : "ton strain", text: strainInfo.text, key: "strain", sev: severityOf(strainInfo.color) },
  ];
  const alerts = items.filter(i => i.sev === "alert");
  const watches = items.filter(i => i.sev === "watch");
  if (alerts.length >= 2) return coach
    ? `Plusieurs signaux de charge convergent vers un risque accru (${alerts.map(a => a.name).join(", ")}) : allègement conseillé dans les prochains jours.`
    : `Plusieurs signaux de charge convergent vers un risque accru (${alerts.map(a => a.name).join(", ")}) : allège significativement dans les prochains jours.`;
  if (alerts.length === 1) {
    const action = CHARGE_METRIC_ACTION[alerts[0].key][coach ? "coach" : "athlete"];
    return `${cap(alerts[0].name)} est en zone de risque : ${action}`;
  }
  if (watches.length >= 2) return coach
    ? `${cap(watches.map(w => w.name).join(" et "))} sont à surveiller ensemble : lève le pied si l'un des deux continue de se dégrader.`
    : `${cap(watches.map(w => w.name).join(" et "))} sont à surveiller ensemble : lève le pied si l'un des deux continue de se dégrader.`;
  // Réutilise le texte déjà écrit pour CET indicateur (sigDimInfo/trendDimInfo, déjà pédagogique —
  // explique la direction, ex. "Ta charge chronique est en baisse : possible perte de forme si ça
  // dure.") plutôt qu'un gabarit générique "{nom} est à surveiller" qui ne dit rien de ce que ça
  // signifie concrètement. Vaut pour les 5 indicateurs, pas seulement fitness (2026-08-31, retour de
  // Gildas — "il manque aussi la majuscule" sur le cas fatigue confirmait que le gabarit générique
  // n'était pas assez explicite non plus).
  //
  // Une "exception fitness/fatigue" avait été tentée ici le 2026-09-25 (repli générique pour éviter
  // une redondance perçue avec CrossInsightBanner) puis EXPLICITEMENT retirée le jour même — retour
  // de Gildas : cette carte perdait une info réelle ("plus bon car ça dit pas que la charge baisse
  // alors que c'est une info"), la répétition qu'il visait était ailleurs (crossTrendInsight() ci-
  // dessous, qui répétait le MÊME fait dans SA PROPRE phrase — corrigé à la source, pas ici).
  if (watches.length === 1) {
    const tail = coach ? "Le reste de ses indicateurs est bon." : "Le reste de tes indicateurs est bon.";
    return `${watches[0].text} ${tail}`;
  }
  return `Charge, monotonie et strain sont tous dans des zones saines : rien à ajuster.`;
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
/**
 * `fitnessTrendInfo`/`fatigueTrendInfo` (2026-09-29) : ces deux cartes vivent dans l'onglet
 * Récupération, leur tendance doit donc être racontée ici et plus dans chargeCrossInsight().
 *
 * Elles ne parlent QUE dans le cas où la Forme n'a rien à dire, et c'est volontaire : la Forme EST
 * Fitness − Fatigue, donc dès qu'elle sort de sa bande neutre elle porte déjà l'information. Elles
 * comblent le seul angle mort réel — Fitness et Fatigue qui montent ENSEMBLE, ce qui laisse la Forme
 * plate alors qu'il se passe quelque chose.
 */
export function recoveryCrossInsight(recoveryInfo: ZoneInfo, formValue: number | null, perspective: Perspective = "athlete", baseline?: WellnessBaselineResult | null, fitnessTrendInfo?: ZoneInfo | null, fatigueTrendInfo?: ZoneInfo | null): string {
  const dominant = baseline ? describeDominantDimension(baseline, perspective) : null;
  const suffix = dominant ? ` ${dominant.charAt(0).toUpperCase() + dominant.slice(1)}.` : "";
  const coach = perspective === "coach";

  /* Repli commun, appelé partout où les branches croisées n'ont rien à dire. Avant (2026-09-29, bug
     trouvé par Gildas en prod) ce repli renvoyait le seul texte de récupération : dès que le
     wellness était "Équilibré", AUCUNE des quatre branches ne matchait et la Forme, la Fitness et la
     Fatigue étaient avalées en silence — quelle que soit leur valeur. C'est justement le cas où
     elles portent toute l'information. */
  const trendTail = () => {
    const notable = [fitnessTrendInfo, fatigueTrendInfo].filter((t): t is ZoneInfo => !!t && severityOf(t.color) !== "good");
    return notable.length ? ` ${notable.map(t => t.text).join(" ")}` : "";
  };
  if (formValue === null) return recoveryInfo.text + trendTail() + suffix;
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
    : "Tu te sens bien, mais ta charge récente dépasse ta charge chronique : reste vigilant les prochains jours, une fatigue avec décalage peut encore apparaître.") + suffix;
  if (wellBad && formGood) return (coach
    ? "Charge récente sous l'habituelle mais récupération basse : la fatigue ne semble pas (encore) liée à l'entraînement, vérifie son sommeil et son stress des derniers jours."
    : "Ta charge récente est sous ta charge chronique mais ta récupération reste basse : la fatigue ne semble pas (encore) liée à l'entraînement, vérifie ton sommeil et ton stress des derniers jours.") + suffix;

  /* Récupération dans la norme : c'est ici que la Forme doit parler, pas se taire. Elle n'a aucune
     branche croisée à elle seule, donc sans ces deux cas elle n'était jamais dite. */
  if (formBad) return (coach
    ? "Sa récupération est dans sa norme, mais sa charge récente dépasse sa charge chronique : la fatigue s'accumule avant qu'il la ressente."
    : "Ta récupération est dans ta norme, mais ta charge récente dépasse ta charge chronique : la fatigue s'accumule avant que tu la ressentes.") + suffix;
  if (formGood) return (coach
    ? "Sa récupération est dans sa norme et sa charge récente est sous sa charge chronique : de la fraîcheur disponible pour pousser."
    : "Ta récupération est dans ta norme et ta charge récente est sous ta charge chronique : tu as de la fraîcheur disponible pour pousser.") + suffix;

  /* Tout est neutre : seul cas où Fitness et Fatigue apportent quelque chose que la Forme ne dit
     pas — elles peuvent monter ensemble et laisser la Forme plate. */
  return recoveryInfo.text + trendTail() + suffix;
}

/* Titre par code — mêmes 9 noms que l'ancien TREND_STATUS_LABEL de decisionCard.ts (retiré de là,
   /conseils est désormais LA source de ce vocabulaire) — jamais un verbe, un diagnostic. */
const CROSS_TREND_LABEL: Record<string, string> = {
  accumulation: "Accumulation", fatigue_persistante: "Fatigue persistante",
  recuperation_insuffisante: "Récupération insuffisante", supercompensation: "Supercompensation",
  recuperation: "Récupération", tolerance_stable: "Tolérance stable",
  adaptation: "Adaptation", recuperation_legere: "Récupération légère", stable: "Stable",
};
// Même mapping que l'ancien trendSeverity() de trainingLoad.ts pour ces 9 codes — pas remis en
// question, seule la FIABILITÉ des entrées qui produisent le code a changé (voir plus bas).
const CROSS_TREND_SEVERITY: Record<string, Severity> = {
  accumulation: "alert", fatigue_persistante: "alert", recuperation_insuffisante: "watch",
  supercompensation: "good", recuperation: "good", tolerance_stable: "good",
  adaptation: "good", recuperation_legere: "good", stable: "good",
};

/**
 * Insight global "croisé" — titre (9 codes) + phrase de la ligne Phase de la carte décision
 * (/today, Coach Control) et de la signature de fatigue (/coach/athletes).
 *
 * Refonte du 2026-09-29 (bug trouvé par Gildas : "Phase Accumulation" suivi de "...tu es en phase
 * d'adaptation" dans la même phrase) :
 *   - l'axe "état" ne dépend plus que du RESSENTI (recoveryInfo). Avant, la fatigue EWMA 7j comptait
 *     aussi : or elle monte mécaniquement dès que la charge monte (même charge, deux courbes), donc
 *     toute montée en charge avec un ressenti dans la norme finissait en "Accumulation" rouge. Avec un
 *     ressenti dans la norme, c'est de l'adaptation.
 *   - la phrase est écrite PAR CODE (une seule source pour titre et texte, ils ne peuvent plus
 *     diverger), puis nuancée par la fatigue récente seulement quand elle contredit le ressenti.
 *   - vocabulaire sans chiffres : "charge récente" (EWMA 7j) et "charge chronique" (EWMA 42j).
 * Libellés relatifs (FRAIS/ÉQUILIBRÉ/FATIGUÉ, baseline perso) → "ta norme" ; libellés absolus
 * (cold-start) → "correcte/basse/bonne", jamais une norme qui n'existe pas encore.
 * `loadInfo`/`monotonyInfo`/`strainInfo`/`fitnessTrendInfo` gardés dans la signature pour les
 * appelants ; les alertes ACWR/monotonie/contrainte restent portées par la carte ⚡ Charge et par la
 * ligne 2 de la carte décision quand elles déclenchent un Alléger.
 */
export function crossTrendInsight(
  _loadInfo: ZoneInfo, _monotonyInfo: ZoneInfo, _strainInfo: ZoneInfo,
  fitnessTrend: TrendDirection | null, _fitnessTrendInfo: ZoneInfo | null, fatigueTrend: TrendDirection | null,
  recoveryInfo: ZoneInfo, perspective: Perspective = "athlete",
): { title: string; text: string; severity: Severity; code: TrendCode } {
  const coach = perspective === "coach";
  const loadDir = fitnessTrend ?? "stable";
  const wellBad = recoveryInfo.label === "RÉCUP FRAGILE" || recoveryInfo.label === "FATIGUÉ";
  const wellGood = recoveryInfo.label === "BONNE RÉCUP" || recoveryInfo.label === "FRAIS";
  const relative = recoveryInfo.label === "FRAIS" || recoveryInfo.label === "ÉQUILIBRÉ" || recoveryInfo.label === "FATIGUÉ";

  const code = wellBad
    ? (loadDir === "up" ? "accumulation" : loadDir === "down" ? "fatigue_persistante" : "recuperation_insuffisante")
    : wellGood
    ? (loadDir === "up" ? "supercompensation" : loadDir === "down" ? "recuperation" : "tolerance_stable")
    : (loadDir === "up" ? "adaptation" : loadDir === "down" ? "recuperation_legere" : "stable");

  const t = crossPhaseText(code, coach, relative);
  let nuance = "";
  if (wellBad && fatigueTrend === "down") {
    nuance = coach
      ? " Sa charge récente se relâche pourtant : la cause n'est peut-être pas l'entraînement, vérifie son sommeil et son stress."
      : " Ta charge récente se relâche pourtant : la cause n'est peut-être pas l'entraînement, vérifie ton sommeil et ton stress.";
  } else if (!wellBad && fatigueTrend === "up") {
    nuance = coach
      ? " Sa charge récente pèse plus que d'habitude : la fatigue pourrait apparaître avec un peu de retard."
      : " Ta charge récente pèse plus que d'habitude : la fatigue pourrait apparaître avec un peu de retard.";
  }
  return { title: CROSS_TREND_LABEL[code], text: t + nuance, severity: CROSS_TREND_SEVERITY[code], code: code as TrendCode };
}

function crossPhaseText(code: string, coach: boolean, relative: boolean): string {
  const ta = coach ? "sa" : "ta", Ta = coach ? "Sa" : "Ta";
  const recMid = relative ? `reste dans ${ta} norme` : "reste correcte";
  const recBad = relative ? `passe sous ${ta} norme` : "est basse";
  const recGood = relative ? `est au-dessus de ${ta} norme` : "est bonne";
  switch (code) {
    case "accumulation": return coach
      ? `Sa récupération ${recBad} alors que sa charge chronique monte : les signaux de fatigue convergent, allège ses prochains jours.`
      : `Ta récupération ${recBad} alors que ta charge chronique monte : les signaux de fatigue convergent, lève le pied quelques jours.`;
    case "recuperation_insuffisante": return `${Ta} récupération ${recBad} alors que ${ta} charge chronique est stable : priorité au sommeil et au repos avant d'enchaîner.`;
    case "fatigue_persistante": return `${Ta} charge chronique baisse mais ${ta} récupération ${recBad} : la fatigue n'est pas encore résorbée.`;
    case "adaptation": return `${Ta} charge chronique monte et ${ta} récupération ${recMid} : ${coach ? "son corps encaisse bien" : "ton corps encaisse bien, continue sur cette lancée"}.`;
    case "recuperation_legere": return `${Ta} charge chronique baisse et ${ta} récupération ${recMid} : bien pour souffler, mais possible perte de forme si ça dure.`;
    case "supercompensation": return `${Ta} charge chronique monte et ${ta} récupération ${recGood} : ${coach ? "assimilation en cours, bon moment pour performer" : "tu assimiles bien, bon moment pour performer"}.`;
    case "tolerance_stable": return `${Ta} charge chronique est stable et ${ta} récupération ${recGood} : ${coach ? "de la marge pour pousser" : "tu as de la marge pour pousser"}.`;
    case "recuperation": return `${Ta} charge chronique baisse et ${ta} récupération ${recGood} : ${coach ? "réserves rechargées" : "tu refais le plein d'énergie"}.`;
    default: return `${Ta} charge chronique et ${ta} récupération sont stables : ${coach ? "rythme habituel, rien à changer" : "tu es dans ton rythme habituel, rien à changer"}.`;
  }
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
  /* Les 3 champs suivants (2026-09-27) alimentent les lectures "Charge" et "Adaptation" des charts
     de l'Accueil. Tous déjà calculés par acwrSeries()/formPercentSeries(), simplement jamais
     recopiés ici jusque-là — aucun nouveau calcul. */
  /* Charge AIGUË en UA : moyenne glissante 7j se terminant ce jour-là. C'est CETTE série que la
     fenêtre saine 0.8-1.3 × chronique borne — pas `load` (2026-09-27, bug trouvé par Gildas : "j'ai
     des barres qui dépassent donc soit disant trop de charge mais en prod j'ai pas ça"). L'ACWR est
     par définition `aiguë / chronique`, donc une seule journée dure peut valoir 2-3× la chronique
     alors que l'ACWR reste en zone optimale — comparer la charge du JOUR à cette bande produit des
     dépassements qui n'existent pas. Jamais gated sur 14j, contrairement à `chronic` : une moyenne
     sur ce qui existe est calculable dès le 1er jour. */
  acute: number | null;
  chronic: number | null;   // charge chronique en UA à ce jour-là (moyenne glissante 28j, convention ACWR) — la fenêtre saine est 0.8-1.3 × cette valeur, comparée à `acute` ci-dessus
  fitness: number | null;   // Fitness = EWMA 42j de la charge, en UA (convention Banister/CTL)
  fatigue: number | null;   // Fatigue = EWMA 7j de la charge, en UA (convention Banister/ATL)
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
    return {
      date: p.date, load: p.load, monotony: monotonyVal, strain: strainVal, acwr: acwrPoints[idx].value,
      recovery, form, formRaw,
      acute: rollingStatsOf(loadPoints.slice(0, idx + 1), 7).mean,
      chronic: acwrPoints[idx].chronic, fitness: fp.fitness, fatigue: fp.fatigue,
    };
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
