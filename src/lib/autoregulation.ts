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
  reco: number; // % signé équivalent au delta en points réellement calculé (voir plus bas) — API inchangée pour les consommateurs (chips manuels, formatAutoregPct, "decided" state…)
  icon: string; // ⚠️/🚨 (alléger, gradué sur le garde-fou/seuil critique) ou 🚀 (surcharger)
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
  const t = Math.round(target);
  return dir === "high" ? { zoneLow: t, zoneHigh: t + 1 } : { zoneLow: t - 1, zoneHigh: t };
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

/* Écart score/difficulté en POINTS DE RPE, plafonné à 2 (2026-09-25, 2e itération — remplace le
   modèle en %, retour explicite de Gildas : "faut avoir une règle simple selon le score, faut pas
   sur-conceptualiser... plutôt qu'un plafond de 20%, on prend un plafond de 2 points de RPE. et la
   reco est proportionnelle à l'écart du score et de la cible"). Root cause du modèle précédent
   (%, plafond 20% de plannedDifficulty) : structurellement incapable de produire un vrai geste pour
   le Surcharger — vérifié par balayage exhaustif (1-10 × 0-100) : 0% des cas restaient actionnables
   une fois la règle "pas de CTA si le RPE prévu est déjà dans le range" appliquée à la source (voir
   plus bas), le plafond de 20% ne déplaçant jamais la cible d'un point RPE entier pour une
   difficulté prévue ≤9 (20%×9 < 2). En points fixes, le même balayage donne 186/324/414 cas
   actionnables pour Surcharger/Alléger-critique/Alléger-modéré respectivement — le mécanisme
   redevient réellement utilisable dans les 3 registres, pas seulement le cas critique.

   Difficulté (1-10) et score (0-100, relatif si la baseline est disponible, sinon absolu) ramenés
   sur la MÊME échelle (diffPos = difficulté×10) — l'écart entre les deux, ramené en points de RPE
   (÷10), pilote à la fois le déclenchement ET l'ampleur de la reco :
     mismatch = diffPos − score
     mismatch > 0 → séance plus dure que ce que l'état du jour permet → Alléger
     mismatch < 0 → séance plus facile que ce que l'état du jour permet → Surcharger
     magnitude = clamp(2, |mismatch|/10), arrondie à l'entier le plus proche
     magnitude arrondie à 0 → pas de reco (remplace l'ancien seuil fixe "|mismatch|<35" — un écart
       qui arrondit à 0 point n'a simplement rien à proposer, plus besoin d'un seuil séparé)
   `baseline` (optionnel) : dès que l'historique du sportif est suffisant, le score utilisé dans le
   calcul devient le score RELATIF personnel (baseline.relativeScore) plutôt que `wellness` en
   absolu — repli exact sur `wellness` tant que l'historique est insuffisant, comportement 100%
   inchangé pour tout appelant qui ne fournit pas encore ce paramètre.

   Le garde-fou absolu (score composite brut < 40) et le seuil critique (Z_SEVERE) n'inventent
   jamais un déclenchement à eux seuls — ils ESCALADENT la sévérité d'un Alléger déjà déclenché par
   le mismatch (🚨/-2 points, le plafond, au lieu de ce que le calcul continu aurait donné), jamais
   côté Surcharger (pas de notion de "critique" pour une séance trop facile).

   `chronicPenalty` (2026-09, retour de Gildas — "le chronique doit moduler le journalier, pas le
   concurrencer") : points retranchés au score effectif AVANT de le comparer à la difficulté prévue —
   ex. -10/-20 quand la charge chronique (ACWR/monotonie/contrainte/tendance Fitness, 42j) est en
   zone watch/alert (voir decisionCard.ts). Remplace l'ancien mécanisme où le signal chronique
   produisait SA PROPRE suggestion séparée, capable de gagner (via severer()) même sur un jour sans
   rapport avec le plan réel du jour (séance déjà légère, voire aucune séance prévue) — ici, la
   décision finale reste TOUJOURS calculée contre `plannedDifficulty`, le chronique ne fait qu'abaisser
   le seuil de tolérance. Défaut 0 = comportement 100% inchangé pour tout appelant qui ne le fournit
   pas encore (garde-fous absolus/`baseline` non affectés, ils continuent de lire `wellness`/`baseline`
   tels quels, jamais le score pénalisé).

   Garde-fou (2026-09-25, retour de Gildas — "pourquoi thomas est en super forme, [et pourtant] on
   lui recommande un RPE très light ?") : "moduler, pas concurrencer" n'était vrai qu'à moitié —
   `chronicPenalty` pouvait à lui seul FABRIQUER un "Alléger" sur un jour où le score du jour, SEUL,
   ne le justifiait pas (mismatch déjà négatif, càd séance déjà dans les cordes voire en dessous de
   ce que la forme du jour permettrait) — un sportif objectivement en forme pouvait donc se voir dire
   "Alléger" au seul motif d'une charge chronique dégradée, sans que rien dans son état du jour ne
   l'explique. Fix : le chronique n'est appliqué QUE si le jour, à lui seul, penche déjà vers "plus
   dur que ce que la forme du jour permet" (`rawMismatch >= 0`) — il amplifie alors un écart déjà là,
   il ne peut plus jamais en inventer un à partir d'un jour où le plan est déjà cohérent ou laisse de
   la marge.

   Garde-fou (2026-09-25, retour de Gildas — "faut pas 'Surcharger recommandé' si le prévu est dans
   le range. c'est la règle de base") : une fois le delta en points calculé, si le RPE déjà prévu
   (arrondi) tombe dans le range conservateur (2 entiers) de la cible, ce n'est pas une vraie
   suggestion — `null`, la carte affiche "Plan cohérent" comme n'importe quel autre jour cohérent. */
export function computeAutoregSuggestion(
  wellness: number | null,
  plannedDifficulty: number | null,
  baseline?: WellnessBaselineResult | null,
  chronicPenalty = 0,
): AutoregSuggestion | null {
  if (wellness === null || plannedDifficulty === null || plannedDifficulty <= 0) return null;

  const useZ = baseline?.hasEnoughHistory && baseline.composite.z !== null;
  const baseScore = useZ ? baseline!.relativeScore : wellness;
  const rawMismatch = plannedDifficulty * 10 - baseScore;
  const scoreForMismatch = rawMismatch >= 0 ? baseScore + chronicPenalty : baseScore;
  const mismatch = plannedDifficulty * 10 - scoreForMismatch;

  const magnitude = Math.min(2, Math.abs(mismatch) / 10);
  const roundedMagnitude = Math.round(magnitude);
  if (roundedMagnitude === 0) return null;

  const dir: AutoregDir = mismatch > 0 ? "low" : "high";
  const guardRail = (baseline?.guardRailTriggered ?? false) || wellness < WELLNESS_ABSOLUTE_GUARD_SCORE;
  const severe = useZ && baseline!.composite.z! <= Z_SEVERE;
  const critical = dir === "low" && (guardRail || severe);
  const finalMagnitude = critical ? 2 : roundedMagnitude;
  const signedPoints = dir === "low" ? -finalMagnitude : finalMagnitude;
  const icon = dir === "low" ? (critical ? "🚨" : "⚠️") : "🚀";
  // % équivalent au delta en points réellement calculé, via la table FIXE pointsToPct() (2026-09-26,
  // remplace l'ancien calcul proportionnel à plannedDifficulty — voir sa doc) — reco garde son unité
  // historique (API inchangée pour tous les consommateurs : chips manuels, formatAutoregPct,
  // "decided" state…).
  const reco = pointsToPct(signedPoints);

  const { zoneLow, zoneHigh } = zoneRange(plannedDifficulty + signedPoints, dir);
  const roundedPlanned = Math.round(plannedDifficulty);
  if (roundedPlanned >= zoneLow && roundedPlanned <= zoneHigh) return null;

  return { dir, reco, icon };
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
