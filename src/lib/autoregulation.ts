// Boucle d'autorégulation — heuristique de déclenchement + décision 1-clic (décharge/surcharge),
// posée au-dessus du wellness existant. Réutilise parseAndApply()/adjustDifficulty() (loadAdjust.ts,
// déjà construits pour "Reconduire") pour l'application réelle du % — cette couche ne fait que
// détecter le signal et proposer la décision, jamais de modification automatique.

import {
  Z_SEVERE, WELLNESS_ABSOLUTE_GUARD_SCORE, autoregDimensionLabel,
  type WellnessBaselineResult,
} from "@/lib/wellnessBaseline";

export type AutoregDir = "low" | "high";

export interface AutoregSuggestion {
  dir: AutoregDir;
  reco: number; // % signé, gradué en continu (voir plus bas), snappé au chip le plus proche
  icon: string; // ⚠️/🚨 (alléger, gradué sur le garde-fou/seuil critique) ou 🚀 (surcharger)
}

// Les 5 paliers réellement proposables (AUTOREG_CHIPS plus bas) — le % continu calculé par
// computeAutoregSuggestion() est toujours arrondi à l'un de ceux-ci, jamais un chiffre "en dehors
// de la grille" que l'utilisateur ne pourrait pas retrouver en cliquant les chips lui-même.
const AUTOREG_STEPS = [2.5, 5, 10, 15, 20];
function nearestStep(magnitude: number): number {
  const capped = Math.min(20, magnitude);
  return AUTOREG_STEPS.reduce((best, s) => Math.abs(capped - s) < Math.abs(capped - best) ? s : best, AUTOREG_STEPS[0]);
}

/* Écart continu score/difficulté (2026-08-31, retour explicite de Gildas — remplace la grille à
   seuils fixes de la veille : diff=7 vs diff=8 pouvait faire toute la différence entre "rien" et
   "Alléger" pour un score quasi identique, un pur effet de falaise. Exemple qui a motivé le
   changement : score=5/100 + séance à 7/10 ne déclenchait rien malgré un état clairement critique).

   Difficulté (1-10) et score (0-100, relatif si la baseline est disponible, sinon absolu) ramenés
   sur la MÊME échelle (diffPos = difficulté×10) — l'écart entre les deux pilote à la fois le
   déclenchement et l'ampleur de la reco :
     mismatch = diffPos − score
     mismatch > 0 → séance plus dure que ce que l'état du jour permet → Alléger
     mismatch < 0 → séance plus facile que ce que l'état du jour permet → Surcharger
     |mismatch| < 35 → pas de reco chiffrée (peut rester une alerte informative sans chips, voir
       decisionText()/coachAlertFor()/athleteAlertFor() — logique Z_SWC séparée, inchangée)
     |mismatch| ≥ 35 → reco actionnable, % = clamp(20, |mismatch|/5) arrondi au chip le plus proche
   `baseline` (optionnel) : dès que l'historique du sportif est suffisant, le score utilisé dans le
   calcul devient le score RELATIF personnel (baseline.relativeScore) plutôt que `wellness` en
   absolu — repli exact sur `wellness` tant que l'historique est insuffisant, comportement 100%
   inchangé pour tout appelant qui ne fournit pas encore ce paramètre.

   Le garde-fou absolu (score composite brut < 40) et le seuil critique (Z_SEVERE) n'inventent
   jamais un déclenchement à eux seuls — ils ESCALADENT la sévérité d'un Alléger déjà déclenché par
   le mismatch (🚨/-20% au lieu de ce que le calcul continu aurait donné), jamais côté Surcharger
   (pas de notion de "critique" pour une séance trop facile). */
export function computeAutoregSuggestion(
  wellness: number | null,
  plannedDifficulty: number | null,
  baseline?: WellnessBaselineResult | null,
): AutoregSuggestion | null {
  if (wellness === null || plannedDifficulty === null || plannedDifficulty <= 0) return null;

  const useZ = baseline?.hasEnoughHistory && baseline.composite.z !== null;
  const scoreForMismatch = useZ ? baseline!.relativeScore : wellness;
  const mismatch = plannedDifficulty * 10 - scoreForMismatch;
  const absMismatch = Math.abs(mismatch);
  if (absMismatch < 35) return null;

  if (mismatch > 0) {
    const guardRail = (baseline?.guardRailTriggered ?? false) || wellness < WELLNESS_ABSOLUTE_GUARD_SCORE;
    const severe = useZ && baseline!.composite.z! <= Z_SEVERE;
    const critical = guardRail || severe;
    return { dir: "low", reco: critical ? -20 : -nearestStep(absMismatch / 5), icon: critical ? "🚨" : "⚠️" };
  }
  return { dir: "high", reco: nearestStep(absMismatch / 5), icon: "🚀" };
}

/* Couleur de sévérité par palier réel de l'heuristique (🚨 critique / ⚠️ modéré / 🚀 surcharge),
   source unique pour AlertBox.tsx, WeekClient.tsx, CoachPlanningClient.tsx, CoachAthleteCard.tsx
   et AutoregButtons.tsx (CTA principal) — jamais une couleur inventée séparément par fichier.
   Rouge jamais utilisé ailleurs dans l'app avant ce chantier (loadRule.ts réutilise l'orange
   existant même pour son tag "🔴 Critique") — introduit ici spécifiquement pour distinguer
   visuellement le cas 🚨 du cas ⚠️. */
export function suggestionSeverityColor(s: AutoregSuggestion): string {
  if (s.icon === "🚨") return "#dc2626";
  if (s.icon === "⚠️") return "#f28a00";
  return "#2f9e44"; // 🚀
}

/* Reprend les paliers déjà établis ailleurs dans l'app (DiffGauge, loadRule.ts : hard≥8/moderate≥5/
   easy<5) — jamais de nombre brut dans les textes d'autorégulation, uniquement ce vocabulaire. */
export function qualitativeDifficulty(diff: number): "légère" | "modérée" | "dure" {
  if (diff >= 8) return "dure";
  if (diff >= 5) return "modérée";
  return "légère";
}

export const AUTOREG_CHIPS: Record<AutoregDir, number[]> = {
  low: [-2.5, -5, -10, -15, -20],
  high: [2.5, 5, 10, 15, 20],
};

export function formatAutoregPct(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  return sign + (abs % 1 === 0 ? String(abs) : abs.toFixed(1).replace(".", ",")) + "%";
}

/* subject omis = à la 2e personne (Aujourd'hui, sportif sur sa propre séance) ; fourni = à la 3e
   personne (Coach Control / Planning coach, prénom du sportif).
   `baseline` (optionnel, 2026-08-31) : cite la dimension dominante entre parenthèses ("Récupération
   basse (sommeil)") UNIQUEMENT quand une dimension domine clairement (autoregDimensionLabel(),
   seuil Z_MODERATE — plus strict que les seuils purement descriptifs) — le calcul qui déclenche
   cette reco (computeAutoregSuggestion) regarde le score COMPOSITE, pas une dimension précise ;
   citer une dimension à chaque fois donnerait une fausse impression de précision sur un état bas/
   haut en réalité diffus, réparti sur les 4 dimensions à la fois. Repli sur le texte générique
   (comportement inchangé) si `baseline` est omis ou si aucune dimension ne ressort. */
export function autoregAdvice(
  dir: AutoregDir, plannedDifficulty: number, subject?: string,
  baseline?: WellnessBaselineResult | null,
): string {
  const qualif = qualitativeDifficulty(plannedDifficulty);
  const dimLabel = autoregDimensionLabel(dir === "low" ? "low" : "high", baseline);
  const dimSuffix = dimLabel ? ` (${dimLabel})` : "";
  if (dir === "low") {
    return subject
      ? `Récupération basse${dimSuffix} : la séance ${qualif} prévue est trop élevée pour l'état de forme de ${subject}.`
      : `Récupération basse${dimSuffix} : la séance ${qualif} prévue est trop élevée pour ta récupération actuelle.`;
  }
  return subject
    ? `Forme optimale${dimSuffix} : la séance ${qualif} prévue laisse de la marge pour ${subject}.`
    : `Forme optimale${dimSuffix} : la séance ${qualif} prévue laisse de la marge. Tu peux pousser plus.`;
}

export function autoregTitle(dir: AutoregDir): string {
  return dir === "low" ? "Alléger la séance" : "Surcharger la séance";
}

/* Titre court utilisé en 1re ligne de l'encart de suggestion (AlertBox), la 2e ligne restant
   autoregAdvice() (le détail). Distinct d'autoregTitle (utilisé ailleurs, ex. AdjustSessionModal)
   qui garde son wording existant. */
export function autoregHeadline(dir: AutoregDir): string {
  return dir === "low" ? "Alléger recommandé" : "Surcharger recommandé";
}

export function autoregCtaLabel(dir: AutoregDir): string {
  return dir === "low" ? "⬇ Alléger →" : "⬆ Surcharger →";
}

/* Décision "traitée" pour la journée — persistée en localStorage (pas de colonne DB, V1 assumée
   volontairement légère, voir CLAUDE.md). Empêche 2 choses : re-proposer la même décision à chaque
   rechargement de page, et un ré-déclenchement en boucle après application (une décharge de -15%
   appliquée à une difficulté 8 retombe à 7, qui reste ≥7 — sans ce garde-fou la suggestion réapparaît
   indéfiniment). Clé = id de la séance concernée, réinitialisée naturellement chaque jour (la date
   fait partie de la valeur stockée, pas de purge active nécessaire).

   `original` (notes/difficulté AVANT application) est capturé par l'appelant au moment précis de la
   décision — jamais recalculé après coup — car parseAndApply()/adjustDifficulty() ne sont pas
   exactement inversibles (arrondis). "Annuler" réécrit ces valeurs d'origine telles quelles plutôt
   que de tenter d'inverser la transformation. */
export interface AutoregOriginal { notes: string | null; target_difficulty: number | null }
export interface AutoregDecision { date: string; dir: AutoregDir; pct: number | null; original?: AutoregOriginal } // pct null = "Maintenir"

function storageKey(sessionId: string) { return `autoreg_decided_${sessionId}`; }
const todayStr = () => new Date().toISOString().slice(0, 10);

export function getAutoregDecision(sessionId: string): AutoregDecision | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoregDecision;
    if (parsed.date !== todayStr()) return null;
    return parsed;
  } catch { return null; }
}

export function setAutoregDecision(sessionId: string, dir: AutoregDir, pct: number | null, original?: AutoregOriginal) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(storageKey(sessionId), JSON.stringify({ date: todayStr(), dir, pct, original })); } catch {}
}

export function clearAutoregDecision(sessionId: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(storageKey(sessionId)); } catch {}
}
