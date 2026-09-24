import type { Session } from "@/types";
import { daysAgoStr, dailyLoad, monotony, strain, acwr, formPercentSeries, fitnessFatigueTrend, type LoadPoint, type TrendCode, type TrendInput, type TrendPerspective } from "@/lib/trainingLoad";
import { sigDimInfo, trendDimInfo, chargeCrossInsight, recoveryCrossInsight } from "@/lib/fatigueSignature";
import { Z_SEVERE, WELLNESS_ABSOLUTE_GUARD_SCORE, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { computeAutoregSuggestion, autoregStatusLabel, autoregDetail, type AutoregSuggestion } from "@/lib/autoregulation";

/* Carte décision unifiée /today + Coach Control + Planning (2026-09) — toujours non-null, combine
   2 sources de signal :
     1. le jour (computeAutoregSuggestion, wellness vs séance prévue)
     2. charge + récup synthétisées — MÊMES fonctions et MÊMES textes que /conseils
        (chargeCrossInsight/recoveryCrossInsight, fatigueSignature.ts), sur une fenêtre 42j
        (ACWR/monotonie/strain/Fitness-Fatigue côté charge, wellness/Form côté récup).
   Le titre (statut) est TOUJOURS dérivé de ces 2 mêmes insights — jamais d'une 3e source séparée
   (2026-09, retour de Gildas : le titre venait auparavant de classifyTrend(), une tendance 7j/7j
   lissée différente du calcul charge/récup — les deux pouvaient légitimement se contredire, ex.
   titre "Récupération insuffisante" avec un corps disant "tout va bien", ou "Supercompensation"
   /Augmenter affiché alors que le wellness du jour même est mauvais. Le titre ne peut plus jamais
   contredire ce qui est écrit juste en dessous, et reflète l'état réel du jour puisque charge/récup
   le sont déjà). Le signal le plus sévère gagne (le jour prime sur charge/récup à icône égale/pire) ;
   les chips (±%) ciblent toujours la séance du jour, quelle que soit la source qui a déclenché. */

type Severity = "good" | "watch" | "alert";
// Mêmes seuils que severityOf() dans fatigueSignature.ts (chargeCrossInsight s'appuie dessus en
// interne) — copie locale à 3 lignes plutôt qu'un export cross-fichier pour ce seul besoin.
function severityOf(color: string): Severity {
  if (color === "#d10000") return "alert";
  if (color === "#f28a00") return "watch";
  return "good";
}
function worstOf(...sevs: Severity[]): Severity {
  if (sevs.includes("alert")) return "alert";
  if (sevs.includes("watch")) return "watch";
  return "good";
}

// 🚨 > ⚠️ > 🚀, et à icône égale "low" (alléger) passe toujours devant "high" (surcharger) — jamais
// l'inverse (une opportunité de surcharge ne doit jamais masquer un vrai signal de prudence).
const ICON_RANK: Record<string, number> = { "🚨": 3, "⚠️": 2, "🚀": 1 };
function severer(a: AutoregSuggestion | null, b: AutoregSuggestion | null): AutoregSuggestion | null {
  if (!a) return b;
  if (!b) return a;
  const ra = ICON_RANK[a.icon] + (a.dir === "low" ? 10 : 0);
  const rb = ICON_RANK[b.icon] + (b.dir === "low" ? 10 : 0);
  return ra >= rb ? a : b;
}

// `n` derniers jours de charge quotidienne jusqu'à `anchor` inclus — 7j pour monotonie/contrainte
// (Foster), 42j pour le calcul charge/récup ci-dessous (ACWR 28j + Fitness EWMA 42j).
function lastNLoadPoints(sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[], anchor: Date, n: number): LoadPoint[] {
  const pts: LoadPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    pts.push({ date, load: dailyLoad(sessions.filter(s => s.date === date)) });
  }
  return pts;
}

/* Exportée (2026-09) — pour que attention()/riskScore() (CoachAthleteCard.tsx, le tri "À décider
   maintenant"/"Plan cohérent" de Coach Control) utilisent EXACTEMENT le même calcul que la carte
   décision elle-même, plutôt qu'une 2e formule séparée qui pourrait diverger. */
export function monotonyStrainFor(sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[], anchor: Date = new Date()): { monotonyVal: number | null; strainVal: number | null } {
  const load7 = lastNLoadPoints(sessions, anchor, 7);
  return { monotonyVal: monotony(load7), strainVal: strain(load7) };
}

/* Couleur pour N'IMPORTE LEQUEL des 6 icônes possibles de la carte décision — étend
   suggestionSeverityColor() (autoregulation.ts, 3 icônes seulement : 🚨/⚠️/🚀, pour le cas
   `suggestion` non-null) aux 3 icônes purement informatives (🔴/🟡/🟢, cas `suggestion` null). Même
   teintes que leurs équivalents actionnables (🔴↔🚨 registre alerte, 🟡↔⚠️ watch, 🟢↔🚀 bon signe) —
   jamais une couleur inventée. */
export function decisionCardColor(icon: string): string {
  if (icon === "🚨" || icon === "🔴") return icon === "🚨" ? "#dc2626" : "#d44000";
  if (icon === "⚠️" || icon === "🟡") return "#f28a00";
  if (icon === "🚀" || icon === "🟢") return "#2f9e44";
  return "#d44000";
}

/* Titre = diagnostic, dérivé des 2 mêmes sévérités qui pilotent chargeLine/recoveryLine (jamais une
   3e source) — "les deux vont bien" > "un seul va mal, on le nomme" > "les deux vont mal en même
   temps" (2026-09, règle validée par Gildas). */
function crossStatusTitle(chargeSeverity: Severity, recoverySeverity: Severity): string {
  const chargeBad = chargeSeverity !== "good";
  const recoveryBad = recoverySeverity !== "good";
  if (chargeBad && recoveryBad) return "Risque de surcharge";
  if (chargeBad) return chargeSeverity === "alert" ? "Charge à risque" : "Charge à surveiller";
  if (recoveryBad) return recoverySeverity === "alert" ? "Récupération critique" : "Récupération à surveiller";
  return "Plan cohérent";
}

export interface DecisionCard {
  suggestion: AutoregSuggestion | null; // null = informatif seul, pas de chips
  icon: string;
  // "headline\ndetail[\nsecondaire]" — voir AlertText (AlertBox.tsx), qui rend chaque ligne séparément.
  // headline = TOUJOURS un diagnostic/statut (jamais un verbe) — le CTA (bouton) porte l'action.
  text: string;
}

export function computeDecisionCard(params: {
  wellnessScore: number | null; // absolu (score composite du jour) — pour le garde-fou de computeAutoregSuggestion
  plannedDifficulty: number | null;
  baseline?: WellnessBaselineResult | null;
  wellnessFilledToday: boolean;
  // Plus consommés en interne (2026-09) — le titre/corps viennent désormais de chargeCrossInsight/
  // recoveryCrossInsight (voir plus bas), jamais de classifyTrend(). Gardés dans l'interface pour ne
  // pas casser les 4 appelants qui les calculent/passent encore pour leurs propres besoins.
  trendCode?: TrendCode | null;
  trendInput?: TrendInput | null;
  sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[]; // historique — 42j idéalement (ACWR 28j + Fitness EWMA 42j), 7j minimum pour monotonie/contrainte seules
  anchor?: Date;
  perspective: TrendPerspective;
  subject?: string; // prénom — absent = 2e personne (Coach Control passe le prénom, /today rien)
  // Plus consommé en interne (2026-09) — déjà porté par les chips de comportements affichées sur la
  // carte. Gardé dans l'interface pour ne pas casser les appelants qui le passent encore.
  behaviorTip?: string | null;
}): DecisionCard {
  const anchor = params.anchor ?? new Date();

  const todaySug = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline);

  /* Insights ⚡ charge / 🌿 récup — MÊMES fonctions et MÊMES textes que /conseils
     (chargeCrossInsight/recoveryCrossInsight, fatigueSignature.ts). Fenêtre 42j (couvre ACWR 28j +
     Fitness EWMA 42j) — déjà la largeur réelle de `sessions` chez les 4 appelants actuels ; sinon
     repli gracieux (zones vides, jamais de "⚡ null"). */
  const { monotonyVal, strainVal } = monotonyStrainFor(params.sessions, anchor);
  const load42 = lastNLoadPoints(params.sessions, anchor, 42);
  const emptyZone = { label: "", color: "#8a8f94", text: "" };
  const loadZone = acwr(load42);
  const loadInfo = loadZone.value !== null ? sigDimInfo("load", loadZone.value, params.perspective) : emptyZone;
  const monotonyInfo = monotonyVal !== null ? sigDimInfo("monotony", monotonyVal, params.perspective) : emptyZone;
  const strainInfo = strainVal !== null ? sigDimInfo("strain", strainVal, params.perspective) : emptyZone;
  const ffTrend = fitnessFatigueTrend(load42);
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, params.perspective) : null;
  const fatigueTrendInfo = ffTrend.fatigue !== null ? trendDimInfo("fatigue", ffTrend.fatigue, params.perspective) : null;
  const chargeLine = `⚡ ${chargeCrossInsight(loadInfo, monotonyInfo, strainInfo, fitnessTrendInfo, fatigueTrendInfo, params.perspective)}`;
  const chargeSeverity = worstOf(
    severityOf(loadInfo.color), severityOf(monotonyInfo.color), severityOf(strainInfo.color),
    fitnessTrendInfo ? severityOf(fitnessTrendInfo.color) : "good",
    fatigueTrendInfo ? severityOf(fatigueTrendInfo.color) : "good",
  );

  const formSeries = formPercentSeries(load42);
  const formValue = formSeries.length ? formSeries[formSeries.length - 1].value : null;
  const recoveryZoneInfo = params.wellnessScore !== null ? sigDimInfo("recovery", params.wellnessScore, params.perspective, params.baseline) : null;
  const recoveryLine = recoveryZoneInfo ? `🌿 ${recoveryCrossInsight(recoveryZoneInfo, formValue, params.perspective, params.baseline)}` : null;
  /* Sévérité récup — reprend le garde-fou critique déjà en place ailleurs (score absolu <40,
     guardRailTriggered, Z_SEVERE) : un état vraiment critique force "alert" même si le zonage
     label-based (BONNE RÉCUP/RÉCUP FRAGILE...) lirait quelque chose de moins tranché. Sinon,
     mêmes booléens que recoveryCrossInsight() utilise en interne (wellBad/formBad) — jamais un 2e
     seuil séparé qui pourrait diverger du texte affiché. */
  const useZ = params.baseline?.hasEnoughHistory && params.baseline.composite.z !== null;
  const recoveryGuardCritical = params.wellnessScore !== null && (
    (params.baseline?.guardRailTriggered ?? false)
    || params.wellnessScore < WELLNESS_ABSOLUTE_GUARD_SCORE
    || (useZ && params.baseline!.composite.z! <= Z_SEVERE)
  );
  const wellBad = recoveryZoneInfo ? (recoveryZoneInfo.label === "RÉCUP FRAGILE" || recoveryZoneInfo.label === "FATIGUÉ") : false;
  const formBad = formValue !== null && formValue <= -8;
  const recoverySeverity: Severity = recoveryGuardCritical ? "alert" : wellBad && formBad ? "alert" : wellBad || formBad ? "watch" : "good";

  const combinedSeverity = worstOf(chargeSeverity, recoverySeverity);
  const chargeRecupSug: AutoregSuggestion | null =
    combinedSeverity === "alert" ? { dir: "low", reco: -15, icon: "🚨" } :
    combinedSeverity === "watch" ? { dir: "low", reco: -10, icon: "⚠️" } :
    null;

  const winner = [todaySug, chargeRecupSug].reduce(severer, null);

  if (winner === todaySug && todaySug) {
    return {
      suggestion: todaySug, icon: todaySug.icon,
      text: `${autoregStatusLabel(todaySug.dir, params.baseline)}\n🌿 ${autoregDetail(todaySug.dir, params.plannedDifficulty ?? 6, params.subject)}`,
    };
  }
  if (winner === chargeRecupSug && chargeRecupSug) {
    return {
      suggestion: chargeRecupSug, icon: chargeRecupSug.icon,
      text: `${crossStatusTitle(chargeSeverity, recoverySeverity)}\n${chargeLine}${recoveryLine ? `\n${recoveryLine}` : ""}`,
    };
  }

  // Rien ne se déclenche (charge et récup toutes deux saines) — la carte reste toujours visible.
  if (!params.wellnessFilledToday) {
    return { suggestion: null, icon: "🟢", text: "Plan cohérent\n🌿 Pas encore assez d'historique pour dégager une tendance : renseigne ta récupération pour des conseils personnalisés." };
  }
  if (recoveryLine) {
    return { suggestion: null, icon: "🟢", text: `Plan cohérent\n${chargeLine}\n${recoveryLine}` };
  }
  return { suggestion: null, icon: "🟢", text: "Plan cohérent\n🌿 Pas encore assez d'historique pour dégager une tendance, on se base sur ta forme de ce matin." };
}
