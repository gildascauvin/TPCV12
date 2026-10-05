// Boucle d'autorégulation — heuristique de déclenchement + décision 1-clic (décharge/surcharge),
// posée au-dessus du wellness existant. Réutilise parseAndApply()/adjustDifficulty() (loadAdjust.ts,
// déjà construits pour "Reconduire") pour l'application réelle du % — cette couche ne fait que
// détecter le signal et proposer la décision, jamais de modification automatique.

import {
  Z_SWC, Z_MODERATE, Z_SEVERE, WELLNESS_ABSOLUTE_GUARD_SCORE, autoregDimensionLabel,
  type WellnessBaselineResult,
} from "@/lib/wellnessBaseline";

export type AutoregDir = "low" | "high";
/* Repli sans baseline personnelle (historique < 12j) — bande neutre absolue 60-80, qui reproduit
   exactement l'heuristique d'origine de cette boucle (2026-08-13 : "Alléger si wellness < 60",
   "Surcharger si wellness >= 80"). Jamais utilisé dès qu'un z personnel est disponible. */
const ABSOLUTE_NEUTRAL_SCORE = 70;
const ABSOLUTE_DEAD_ZONE = 10;
/* Lecture du ressenti en repli absolu (pas encore de baseline perso) — la MÊME bande 60-80 qui
   déclenche Alléger/Surcharger ci-dessous. Exportée (2026-09-29) pour la ligne Phase de la carte
   décision : avec les seuils 50/70 de sigDimInfo, un 55 donnait "Récupération basse" en ligne 2 et
   "récupération correcte" dans la phase juste en dessous. */
export function absoluteFeel(score: number): "bad" | "mid" | "good" {
  if (score < ABSOLUTE_NEUTRAL_SCORE - ABSOLUTE_DEAD_ZONE) return "bad";
  if (score >= ABSOLUTE_NEUTRAL_SCORE + ABSOLUTE_DEAD_ZONE) return "good";
  return "mid";
}
/* Difficulté au-delà de laquelle une séance n'est plus un jour de récupération programmé — le
   générateur sort toujours `recuperation` dans 1-3 (generate/route.ts, sessionDifficulty()). */
// Même seuil que qualitativeDifficulty() "dure" (DiffGauge, loadRule.ts).
const HARD_MIN_DIFFICULTY = 8;


export interface AutoregSuggestion {
  dir: AutoregDir;
  reco: number; // % signé équivalent au delta en points réellement calculé (voir plus bas) — API inchangée pour les consommateurs (chips manuels, formatAutoregPct, "decided" state…)
  icon: string; // ⚠️/🚨 (alléger, gradué sur le garde-fou/seuil critique) ou 🚀 (surcharger)
  // "norm_hard" : Alléger −1 déclenché par la seule difficulté de la séance (récup dans la norme +
  // séance dure), jamais par une récup basse — le texte de la carte doit le dire (decisionCard.ts).
  kind?: "norm_hard";
}

// Les 5 paliers proposables MANUELLEMENT (AUTOREG_CHIPS plus bas, toujours utilisés tels quels par
// AdjustSessionModal.tsx — flux séparé, pas touché par ce chantier) — computeAutoregSuggestion()
// ci-dessous ne s'en sert plus pour sa propre reco AUTOMATIQUE depuis le 2026-09-25 (voir plus bas).

/* Range conseillée = TOUJOURS 2 ENTIERS de RPE (2026-09-25, 2e itération) — `target` (la cible déjà
   plafonnée/calculée, arrondie ici au cas où `plannedDifficulty` lui-même serait fractionnaire) est
   TOUJOURS l'extrémité CONSERVATRICE (la plus proche du plan initial), l'autre extrémité s'étend
   d'1 point supplémentaire dans le sens de l'ajustement — jamais vers `plannedDifficulty` (sinon,
   à magnitude 1, une extrémité retombe exactement sur le plan et absorbe silencieusement TOUTE
   suggestion à magnitude 1, un vrai bug trouvé en vérifiant). Retour de Gildas, exemple donné deux
   fois : reco "6-7" (surcharge, cible=6=conservateur) ou "5-6" (allège, cible=6=conservateur) —
   jamais un point unique ("Thomas a cible 6 au lieu de 5-6 ou 6-7", le modèle en points, toujours
   entier, faisait dégénérer le range en un point isolé avec l'ancien Math.floor/Math.ceil, qui ne
   sert à élargir que sur une cible FRACTIONNAIRE). Vit ici (pas dans DecisionGauge.tsx, qui ne fait
   plus que l'AFFICHER) car computeAutoregSuggestion() en a lui-même besoin pour décider si une
   suggestion est RÉELLEMENT actionnable — un seul point de calcul, jamais deux logiques de zone qui
   pourraient diverger entre déclenchement et affichage. */
export function zoneRange(target: number, dir: AutoregDir): { zoneLow: number; zoneHigh: number } {
  const t = Math.min(10, Math.max(1, Math.round(target)));
  /* Toujours 2 entiers, y compris aux bords (2026-09-29, Gildas : "je veux toujours que le range
     recommandé fasse 2 points") : à 10 ou à 1, la range glisse vers l'intérieur de l'échelle
     ("9-10", "1-2") au lieu de retomber sur un point unique comme depuis le 2026-09-28. */
  if (dir === "high") return t >= 10 ? { zoneLow: 9, zoneHigh: 10 } : { zoneLow: t, zoneHigh: t + 1 };
  return t <= 1 ? { zoneLow: 1, zoneHigh: 2 } : { zoneLow: t - 1, zoneHigh: t };
}

/* Conversion POINTS DE RPE (signés) <-> % à appliquer aux exercices — table FIXE, indépendante de la
   difficulté planifiée (2026-09-26, retour de Gildas : "après le changement des tokens quand on
   ajuste les RPE est trop brutal" — l'ancienne formule (AutoregButtons.tsx, `diffFromPct`/
   `pctFromDiff`) calculait le % comme un ratio RELATIF À `plannedDifficulty` (`(diff/planned-1)*100`)
   — sur une séance prévue à 3/10, bouger la jauge d'1 seul point donnait déjà +33% sur les charges ;
   sur une séance à 8/10, le même 1 point ne donnait que +12,5%. Incohérent et trop agressif sur les
   séances légères. Remplacé par un doublement fixe par point (2,5/5/10/20%, même esprit qu'un
   tableau RPE→%1RM classique en force), plafonné à 20% au-delà de 4 points : le système automatique
   (computeAutoregSuggestion, plafond 2 points) n'a jamais besoin de plus, seul le drag manuel de la
   jauge (toute l'échelle 1-10 accessible) peut atteindre un delta plus grand — continuer à doubler
   indéfiniment (40/80%...) n'aurait aucun sens, capé au palier 4 points.
   Source UNIQUE — réutilisée par computeAutoregSuggestion() (reco automatique) ET AutoregButtons.tsx
   (drag manuel de la jauge, diffFromPct/pctFromDiff) : jamais 2 formules qui pourraient diverger,
   même classe de bug déjà rencontrée plusieurs fois sur ce module. */
export function pointsToPct(points: number): number {
  const abs = Math.abs(points);
  if (abs === 0) return 0;
  const sign = points < 0 ? -1 : 1;
  return sign * Math.min(20, 2.5 * Math.pow(2, abs - 1));
}

/* Inverse de pointsToPct() — les seules valeurs de `pct` réellement rencontrées sont 0/2,5/5/10/20
   (tout passe par pointsToPct en amont), donc un simple seuillage par palier suffit, jamais un calcul
   proportionnel à une difficulté externe. */
export function pctToPoints(pct: number): number {
  const abs = Math.abs(pct);
  if (abs <= 0) return 0;
  const sign = pct < 0 ? -1 : 1;
  if (abs <= 2.5) return sign * 1;
  if (abs <= 5) return sign * 2;
  if (abs <= 10) return sign * 3;
  return sign * 4;
}

/* Nouvelle difficulté après un ajustement d'autorégulation — PRÉVU + POINTS, jamais un % de la
   difficulté (2026-09-28, bug : "quand je valide un ajustement, la barre de RPE prévu ne s'update
   pas"). adjustDifficulty() (loadAdjust.ts) multiplie la difficulté par (1+pct) : depuis la table
   fixe pointsToPct() (±1 point = ±2,5%), 7 × 0,95 = 6,65 arrondi à 7 — le RPE ne bougeait jamais,
   seules les charges changeaient. adjustDifficulty() reste la bonne formule pour Reconduire/Dupliquer
   (vraie progression en %), celle-ci sert à tout ce qui applique une décision d'autorégulation. */
export function applyAutoregDifficulty(diff: number, pct: number): number {
  return Math.max(1, Math.min(10, Math.round(diff + pctToPoints(pct))));
}

/* Historique : 3e itération (2026-09-27, z-score par paliers Hopkins + exceptions par difficulté)
   remplacée le 2026-10-05 par le modèle diagonal ci-dessous (voir CLAUDE.md). */
/* ── Modèle diagonal (2026-10-05, demande de Gildas : le radar du Coach Control est LA référence
   interne du calcul) ──────────────────────────────────────────────────────────────────────────────
   Axe X = récupération effective, 0..100 : percentile personnel du jour (baseline.relativeScore)
   dès que la norme existe, sinon le score absolu ramené sur la même échelle (60 → 42, 80 → 58,
   bornes de la bande "Équilibré"). La pénalité chronique la décale vers la gauche, sauf pour un
   sportif frais (> 58).
   Bande "Maintenir" façon WHOOP mais arrondie (2026-10-05, Gildas : "les angles de WHOOP, mais un
   arrondi") : un plateau bas pour les sportifs fatigués, une montée au milieu, un plateau haut pour
   les sportifs frais, raccordés par une sigmoïde (pas d'angle) :
     s(x)    = 1 / (1 + e^(−(x − 50) / 9))     (≈ 0 sous 20, 0,5 à 50, ≈ 1 au-dessus de 80)
     haut(x) = 4,5 + 6·s(x)                    (4,5 fatigué · 7,5 équilibré · 10,5 frais)
     bas(x)  = haut(x) − 6                     (−1,5 fatigué · 1,5 équilibré · 4,5 frais)
   RPE prévu au-dessus du haut → Alléger de ⌈RPE − haut⌉ points ; sous le bas → Surcharger de
   ⌈bas − RPE⌉ points ; plafond 2 points (3 en cas critique). Un fatigué sur une séance facile
   garde sa séance, un sportif dans sa norme garde un point de marge sur une séance quasi maximale,
   un sportif frais pousse ses séances légères. */
export const AUTOREG_BAND_LOW = 4.5;
export const AUTOREG_BAND_RISE = 6;
export const AUTOREG_BAND_WIDTH = 6;
const AUTOREG_BAND_MID = 50, AUTOREG_BAND_SOFTNESS = 9;
export function autoregBand(x: number): { lo: number; hi: number } {
  const sx = 1 / (1 + Math.exp(-(x - AUTOREG_BAND_MID) / AUTOREG_BAND_SOFTNESS));
  const hi = AUTOREG_BAND_LOW + AUTOREG_BAND_RISE * sx;
  return { lo: hi - AUTOREG_BAND_WIDTH, hi };
}
const RECOVERY_X_FATIGUE = 42, RECOVERY_X_FRESH = 58;
/* Récupération du jour sur l'axe X (sans pénalité chronique). null = pas de ressenti. */
export function recoveryAxisX(wellness: number | null, baseline?: WellnessBaselineResult | null): number | null {
  if (wellness === null) return null;
  if (baseline?.hasEnoughHistory && baseline.composite.z !== null) return baseline.relativeScore;
  // Bande neutre absolue [70 − 10, 70 + 10] = [60, 80] posée sur [42, 58].
  const mapped = RECOVERY_X_FATIGUE + (wellness - (ABSOLUTE_NEUTRAL_SCORE - ABSOLUTE_DEAD_ZONE)) * ((RECOVERY_X_FRESH - RECOVERY_X_FATIGUE) / (2 * ABSOLUTE_DEAD_ZONE));
  return Math.max(0, Math.min(100, mapped));
}
/* Récupération EFFECTIVE (avec la pénalité chronique) : la position exacte utilisée par la reco. */
export function effectiveRecoveryX(wellness: number | null, baseline: WellnessBaselineResult | null | undefined, chronicPenalty = 0): number | null {
  const x = recoveryAxisX(wellness, baseline);
  if (x === null) return null;
  return x > RECOVERY_X_FRESH ? x : Math.max(0, x + chronicPenalty);
}

export function computeAutoregSuggestion(
  wellness: number | null,
  plannedDifficulty: number | null,
  baseline?: WellnessBaselineResult | null,
  chronicPenalty = 0,
): AutoregSuggestion | null {
  if (wellness === null || plannedDifficulty === null || plannedDifficulty <= 0) return null;
  const x = effectiveRecoveryX(wellness, baseline, chronicPenalty)!;
  const { lo, hi } = autoregBand(x);

  let dir: AutoregDir;
  let magnitude: number;
  if (plannedDifficulty > hi) { dir = "low"; magnitude = Math.ceil(plannedDifficulty - hi - 1e-9); }
  else if (plannedDifficulty < lo) { dir = "high"; magnitude = Math.ceil(lo - plannedDifficulty - 1e-9); }
  else return null;
  magnitude = Math.min(2, Math.max(1, magnitude));

  const useZ = baseline?.hasEnoughHistory && baseline.composite.z !== null;
  const guardRail = (baseline?.guardRailTriggered ?? false) || wellness < WELLNESS_ABSOLUTE_GUARD_SCORE;
  const severe = !!useZ && baseline!.composite.z! <= Z_SEVERE;
  const critical = dir === "low" && (guardRail || severe);
  if (critical) magnitude = Math.min(3, magnitude + 1);

  const target = Math.min(10, Math.max(1, plannedDifficulty + (dir === "low" ? -magnitude : magnitude)));
  const signedPoints = Math.round(target - plannedDifficulty);
  if (signedPoints === 0) return null;

  const icon = dir === "low" ? (critical ? "🚨" : "⚠️") : "🚀";
  const reco = pointsToPct(signedPoints);
  /* "norm_hard" : on allège un sportif qui n'est PAS fatigué (récup dans sa norme ou au-dessus,
     sans pénalité chronique) — c'est la séance qui est trop dure, pas lui qui va mal. */
  const rawX = recoveryAxisX(wellness, baseline)!;
  const kind: AutoregSuggestion["kind"] = dir === "low" && !critical && chronicPenalty === 0 && rawX >= RECOVERY_X_FATIGUE ? "norm_hard" : undefined;

  const t = Math.round(target);
  const zoneLow = dir === "high" ? t : t - 1;
  const zoneHigh = dir === "high" ? t + 1 : t;
  const roundedPlanned = Math.round(plannedDifficulty);
  if (roundedPlanned >= zoneLow && roundedPlanned <= zoneHigh) return null;

  return { dir, reco, icon, ...(kind ? { kind } : {}) };
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

/* Affichage en POINTS DE RPE, jamais en % (2026-09-25, retour de Gildas — "faut pas afficher '−33%
   appliqué'") : la reco AUTOMATIQUE (computeAutoregSuggestion) est calculée en points puis convertie
   en % équivalent uniquement pour rester compatible avec `AutoregDecision.pct` (partagé avec le flux
   manuel d'AdjustSessionModal.tsx, resté en %, voir plus haut). Reconvertit ICI, à l'affichage
   seulement, jamais dans le stockage — via pctToPoints() (2026-09-26, table fixe, ne dépend plus de
   `plannedDifficulty` — remplace l'ancienne reconstruction proportionnelle `round(pct/100*planned)`,
   devenue fausse depuis que `pct` lui-même n'est plus proportionnel à la difficulté planifiée). */
export function formatAutoregPoints(pct: number): string {
  const points = pctToPoints(pct);
  const sign = points < 0 ? "−" : "+";
  const abs = Math.abs(points);
  return `${sign}${abs} point${abs > 1 ? "s" : ""}`;
}

/* `baseline` (optionnel, 2026-08-31) : cite la dimension dominante entre parenthèses ("Récupération
   basse (sommeil)") UNIQUEMENT quand une dimension domine clairement (autoregDimensionLabel(),
   seuil Z_MODERATE — plus strict que les seuils purement descriptifs) — le calcul qui déclenche
   cette reco (computeAutoregSuggestion) regarde le score COMPOSITE, pas une dimension précise ;
   citer une dimension à chaque fois donnerait une fausse impression de précision sur un état bas/
   haut en réalité diffus, réparti sur les 4 dimensions à la fois. Repli sur le texte générique
   (comportement inchangé) si `baseline` est omis ou si aucune dimension ne ressort.
   Exportée séparément (2026-09) pour servir de TITRE de carte décision (decisionCard.ts, "diagnostic
   en titre, prescription en CTA" — retour de Gildas) sans dupliquer ce préfixe dans le détail. */
export function autoregStatusLabel(dir: AutoregDir, baseline?: WellnessBaselineResult | null): string {
  const dimLabel = autoregDimensionLabel(dir === "low" ? "low" : "high", baseline);
  const dimSuffix = dimLabel ? ` (${dimLabel})` : "";
  return dir === "low" ? `Récupération basse${dimSuffix}` : `Forme optimale${dimSuffix}`;
}

/* subject omis = à la 2e personne (Aujourd'hui, sportif sur sa propre séance) ; fourni = à la 3e
   personne (Coach Control / Planning coach, prénom du sportif). Corps SEUL, sans le préfixe de
   statut (voir autoregStatusLabel ci-dessus) — decisionCard.ts compose les deux séparément
   (titre = statut, détail = ce corps) ; autoregAdvice() en dessous recolle les deux pour tout
   appelant qui veut la phrase complète d'un coup (comportement 100% inchangé). */
export function autoregDetail(dir: AutoregDir, plannedDifficulty: number, subject?: string): string {
  const qualif = qualitativeDifficulty(plannedDifficulty);
  if (dir === "low") {
    return subject
      ? `La séance ${qualif} prévue est trop élevée pour l'état de forme de ${subject}.`
      : `La séance ${qualif} prévue est trop élevée pour ta récupération actuelle.`;
  }
  return subject
    ? `La séance ${qualif} prévue laisse de la marge pour ${subject}.`
    : `La séance ${qualif} prévue laisse de la marge. Tu peux pousser plus.`;
}

export function autoregAdvice(
  dir: AutoregDir, plannedDifficulty: number, subject?: string,
  baseline?: WellnessBaselineResult | null,
): string {
  return `${autoregStatusLabel(dir, baseline)} : ${autoregDetail(dir, plannedDifficulty, subject)}`;
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

/* Même format que autoregCtaLabel() (flèche + verbe + →) mais avec un verbe précis (ex. "Réduire",
   "Récupérer", "Augmenter") — decisionCard.ts l'utilise quand une tendance nomme une action plus
   spécifique qu'"Alléger"/"Surcharger" générique. Le titre de la carte porte le diagnostic
   (statut/tendance), le CTA porte le verbe — jamais les deux à la fois dans le titre. */
export function autoregCtaWordLabel(dir: AutoregDir, word: string): string {
  return `${dir === "low" ? "⬇" : "⬆"} ${word} →`;
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
