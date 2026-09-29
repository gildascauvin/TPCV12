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

/* Reco = écart de la forme du jour à la PROPRE NORME du sportif, jamais à la difficulté prévue
   (2026-09-27, 3e itération — retour de Gildas : "ma récup était à l'équilibre et ça m'a recommandé
   d'alléger, je trouve ça bizarre, j'ai toujours répété que je voulais un algo simple : en gros
   équilibre → touche rien ou peu, au plus on est fatigué au plus ça reco d'alléger, au plus on est
   en forme au plus ça reco de surcharger, tout en respectant la périodisation").

   Root cause du modèle précédent (`mismatch = plannedDifficulty × 10 − score`) : il ramenait la
   difficulté et le score sur la même échelle, donc il exigeait implicitement un score de 80/100 pour
   tolérer une séance à 8/10. Un sportif pile à SA norme (relativeScore = 50, zone "Équilibré")
   déclenchait donc un "Alléger" sur n'importe quelle séance au-dessus de 5/10 — c'est-à-dire qu'il
   COMBATTAIT la périodisation au lieu de la respecter (une séance dure est planifiée parce que le
   bloc l'appelle, pas parce que le sportif est euphorique).

   Nouveau modèle, 3 règles :
     1. La zone morte EST la zone "Équilibré" déjà affichée (|z| < Z_SWC) — si le libellé dit
        "Équilibré", il n'y a pas de reco. Plus aucune contradiction possible entre ce que la zone
        annonce et ce que la carte propose.
     2. Ampleur graduée sur l'échelle d'ampleur d'effet de Hopkins, déjà utilisée partout ailleurs
        dans l'app : Z_SWC ≤ |z| < Z_MODERATE → 1 point de RPE, |z| ≥ Z_MODERATE → 2 points (le
        plafond, inchangé). Aucun nouveau seuil inventé.
     3. La difficulté prévue n'entre QUE dans les garde-fous (voir plus bas) — c'est le plan qui fixe
        le niveau, la forme ne fait que le décaler de ±1 ou ±2 points. La périodisation est donc
        respectée par construction.

   Repli sans baseline personnelle (historique < 12j) : bande neutre absolue 60-80, qui reproduit
   exactement l'heuristique d'origine de cette boucle (2026-08-13 : "Alléger si wellness < 60",
   "Surcharger si wellness ≥ 80") — |écart à 70| < 10 → rien, 10-20 → 1 point, ≥20 → 2 points.

   Garde-fous de périodisation :
   - Le résultat est clampé dans [1,10] ; si l'ampleur tombe à 0 après clamp, pas de reco (surcharger
     une séance déjà à 10/10 ne propose rien).
   - Une séance à ≤3/10 (jour de récupération/deload réellement programmé — `recuperation` sort
     toujours dans 1-3, voir generate/route.ts) ne se SURCHARGE jamais : transformer un jour de récup
     en séance de travail casse l'intention du bloc, c'est le seul cas où elle est non ambiguë.
     L'inverse reste vrai (une séance à 10/10 peut toujours s'alléger — c'est tout l'objet).

   Escalade critique : côté Alléger seulement, un garde-fou absolu (score composite brut
   < 40) ou z ≤ Z_SEVERE force 3 points (−10%, 2026-09-28) et l'icône 🚨. Ils n'inventent jamais un
   déclenchement à eux seuls, ils n'escaladent qu'un Alléger déjà déclenché par l'écart à la norme.

   `chronicPenalty` (points, 0/-10/-20 selon la zone chronique ACWR/monotonie/contrainte/Forme —
   voir decisionCard.ts) : converti en décalage de z (÷50, soit -0.2/-0.4 = 1 à 2 SWC) et appliqué
   AVANT le calcul, pour que le chronique MODULE le journalier sans le concurrencer. Garde-fou
   conservé du fix 2026-09-25 ("pourquoi Thomas est en super forme et on lui recommande un RPE très
   light ?") : jamais appliqué à un sportif réellement frais (z > Z_SWC) — il peut amplifier ou faire
   basculer un jour neutre/fatigué, jamais inventer un Alléger sur un jour franchement bon. */
export function computeAutoregSuggestion(
  wellness: number | null,
  plannedDifficulty: number | null,
  baseline?: WellnessBaselineResult | null,
  chronicPenalty = 0,
): AutoregSuggestion | null {
  if (wellness === null || plannedDifficulty === null || plannedDifficulty <= 0) return null;

  const useZ = baseline?.hasEnoughHistory && baseline.composite.z !== null;

  /* Ampleur en points de RPE (0 = rien à proposer), signée : négatif = alléger, positif =
     surcharger. Deux échelles, même forme (zone morte → 1 point → 2 points) : le z personnel dès
     que l'historique le permet, sinon la bande absolue 60-80 de repli. */
  let points: number;
  if (useZ) {
    const zShift = chronicPenalty / 50; // -10 → -0.2 (1 SWC), -20 → -0.4 (2 SWC)
    const rawZ = baseline!.composite.z!;
    const z = rawZ > Z_SWC ? rawZ : rawZ + zShift;
    const absZ = Math.abs(z);
    const magnitude = absZ < Z_SWC ? 0 : absZ < Z_MODERATE ? 1 : 2;
    points = z < 0 ? -magnitude : magnitude;
  } else {
    const dev = (wellness - ABSOLUTE_NEUTRAL_SCORE) + (wellness <= ABSOLUTE_NEUTRAL_SCORE + ABSOLUTE_DEAD_ZONE ? chronicPenalty : 0);
    const absDev = Math.abs(dev);
    const magnitude = absDev < ABSOLUTE_DEAD_ZONE ? 0 : absDev < ABSOLUTE_DEAD_ZONE * 2 ? 1 : 2;
    points = dev < 0 ? -magnitude : magnitude;
  }
  /* Règles par difficulté prévue (2026-09-29, Gildas — "un user à 79 de récup avec RPE cible à 9,
     on lui recommande 10 : 9 suffit, 8 suffirait aussi") :
     - séance dure (≥ HARD_MIN_DIFFICULTY) + récup dans la norme → −1 (garder un point de marge sur
       une séance quasi maximale) ;
     - séance dure + récup fraîche → rien : la séance est déjà dure, pas de surcharge ;
     - séance légère (≤3) + récup fraîche → surcharge autorisée (+1 un peu frais,
       +2 nettement frais) : 3 → 5 au plus, la séance reste sous le dur, la périodisation tient.
       Remplace l'ancien blocage total des jours légers. */
  let kind: AutoregSuggestion["kind"];
  if (points === 0) {
    if (plannedDifficulty < HARD_MIN_DIFFICULTY) return null;
    points = -1;
    kind = "norm_hard";
  }
  if (points > 0 && plannedDifficulty >= HARD_MIN_DIFFICULTY) return null;

  const dir: AutoregDir = points < 0 ? "low" : "high";

  const guardRail = (baseline?.guardRailTriggered ?? false) || wellness < WELLNESS_ABSOLUTE_GUARD_SCORE;
  const severe = useZ && baseline!.composite.z! <= Z_SEVERE;
  const critical = dir === "low" && (guardRail || severe);

  // Critique = 3 points (2026-09-28, retour de Gildas) : avant, forcé à 2 comme "très fatigué", le 🚨
  // ne changeait que la couleur. Asymétrique volontairement : la surcharge reste plafonnée à 2 points
  // (z ≥ 0,6 ≈ 1 jour sur 4, +3 transformerait trop souvent une séance à 7 en 10/10).
  // Clamp dans [1,10] : ce qui déborde réduit l'ampleur, jusqu'à annuler la reco s'il ne reste rien.
  const magnitude = critical ? 3 : Math.abs(points);
  const target = Math.min(10, Math.max(1, plannedDifficulty + (dir === "low" ? -magnitude : magnitude)));
  const signedPoints = Math.round(target - plannedDifficulty);
  if (signedPoints === 0) return null;

  const icon = dir === "low" ? (critical ? "🚨" : "⚠️") : "🚀";
  // % équivalent au delta en points réellement calculé, via la table FIXE pointsToPct() — reco garde
  // son unité historique (API inchangée pour tous les consommateurs : chips manuels,
  // formatAutoregPct, "decided" state…).
  const reco = pointsToPct(signedPoints);

  // Filet de sécurité : si le RPE déjà prévu tombe dans la range conservatrice de la cible, il n'y a
  // rien à décider. Ne peut plus se produire avec une ampleur entière ≥1 (voir zoneRange), gardé
  // pour une `plannedDifficulty` fractionnaire (séance déjà ajustée par le passé).
  // Zone NON glissée ici : aux bords, la zone affichée (zoneRange) s'étend vers le plan ("1-2" pour
  // une séance à 2 allégée à 1) et absorberait à tort la suggestion.
  const t = Math.round(target);
  const zoneLow = dir === "high" ? t : t - 1;
  const zoneHigh = dir === "high" ? t + 1 : t;
  const roundedPlanned = Math.round(plannedDifficulty);
  if (roundedPlanned >= zoneLow && roundedPlanned <= zoneHigh) return null;

  // Un garde-fou critique (score absolu < 40) prime : ce n'est plus "juste la séance dure".
  return { dir, reco, icon, ...(kind && !critical ? { kind } : {}) };
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
