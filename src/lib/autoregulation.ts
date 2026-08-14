// Boucle d'autorégulation — heuristique de déclenchement + décision 1-clic (décharge/surcharge),
// posée au-dessus du wellness existant. Réutilise parseAndApply()/adjustDifficulty() (loadAdjust.ts,
// déjà construits pour "Reconduire") pour l'application réelle du % — cette couche ne fait que
// détecter le signal et proposer la décision, jamais de modification automatique.

export type AutoregDir = "low" | "high";

export interface AutoregSuggestion {
  dir: AutoregDir;
  reco: number; // % signé pré-sélectionné, ex. -15 ou 10
  icon: string; // ⚠️/🚨 (alléger, gradué sur le seul palier existant : wellness<40 → 🚨) ou 🚀 (surcharger)
}

/* ALERTE BASSE : wellness < 60 ET difficulté prévue ≥ 7 → alléger (reco -15%, ou -20% si wellness < 40)
   ALERTE HAUTE : wellness ≥ 80 ET difficulté prévue ≤ 4 → surcharger (reco +10%)
   Sinon : pas de suggestion — affichage normal, pas de CTA décisionnel. */
export function computeAutoregSuggestion(wellness: number | null, plannedDifficulty: number | null): AutoregSuggestion | null {
  if (wellness === null || plannedDifficulty === null || plannedDifficulty <= 0) return null;
  if (wellness < 60 && plannedDifficulty >= 7) {
    // Gradation sur le seul palier réel de l'heuristique (le % pré-rempli) : -15% = alerte modérée
    // (⚠️), -20% = cas critique (🚨) — pas de 3e palier inventé, contrairement à l'itération précédente.
    return { dir: "low", reco: wellness < 40 ? -20 : -15, icon: wellness < 40 ? "🚨" : "⚠️" };
  }
  if (wellness >= 80 && plannedDifficulty <= 4) {
    return { dir: "high", reco: 10, icon: "🚀" };
  }
  return null;
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
   personne (Coach Control / Planning coach, prénom du sportif). */
export function autoregAdvice(dir: AutoregDir, plannedDifficulty: number, subject?: string): string {
  const qualif = qualitativeDifficulty(plannedDifficulty);
  if (dir === "low") {
    return subject
      ? `Récupération basse — la séance ${qualif} prévue est trop élevée pour l'état de forme de ${subject}.`
      : `Récupération basse — la séance ${qualif} prévue est trop élevée pour ta récupération actuelle.`;
  }
  return subject
    ? `Forme optimale — la séance ${qualif} prévue laisse de la marge pour ${subject}.`
    : `Forme optimale — la séance ${qualif} prévue laisse de la marge. Tu peux pousser plus.`;
}

export function autoregTitle(dir: AutoregDir): string {
  return dir === "low" ? "Alléger la séance" : "Surcharger la séance";
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
