/* Profil de vitesse à partir des splits sprint (sprint10m/20m/30m/60m/100m/200m + fly10m/20m/30m,
   testNorms.ts) — 2026-09, généralisé.

   MODÈLE — mono-exponentiel de vitesse (Samozino & Morin, 2016, Scandinavian Journal of Medicine &
   Science in Sports) : v(t) = Vmax × (1 − e^(−t/τ)), intégré en distance d(t) = Vmax × (t − τ×(1−e^
   (−t/τ))). C'est EXACTEMENT le modèle déjà publié et utilisé par Gildas sur
   theperfclub.com/simulateur-de-temps-de-sprint/ (JS vérifié en direct sur la page, `spDist`/
   `spTimeAtDist`/`spSolveVmax`/`spSolveTau` ci-dessous en sont un portage TypeScript fidèle, pas une
   réimplémentation devinée) — résout Vmax/τ à partir de N'IMPORTE QUELLE PAIRE de 2 distances déjà
   mesurées pour le même effort, puis prédit le temps à toute autre distance à partir de ces 2 seuls
   paramètres.

   Vmax/τ restent des paramètres 100% INTERNES au calcul, jamais affichés à l'utilisateur — seule la
   comparaison réel-vs-attendu par distance/segment est montrée (décision déjà tranchée par Gildas :
   l'ancien volet "mécanique brute" F0/V0/Pmax/Sfv, retiré en 2026-09, était jugé incompréhensible
   pour la plupart des utilisateurs ; ce nouveau modèle ne réintroduit PAS cet affichage, seulement un
   fit plus général en coulisses).

   RÉINTRODUIT (2026-09, suite) — `predictFrom100m`/`predictFrom60m` (régressions quadratiques
   fechain-athletisme.fr, Chu/Dick) avaient été retirées un peu plus tôt ce même chantier, jugées
   strictement subsumées par le modèle mono-exponentiel. Faux en pratique : un sportif qui n'a logué
   QUE 60m et 100m (cas réel de Gildas) voit les 2 SEULES distances disponibles consommées comme base
   du fit — `classifySprintProfile` les exclut alors toutes les deux par construction (se comparer à
   soi-même = 0% d'écart, aucune info) et ne produit RIEN, alors même que fechain peut comparer le
   100m réel à ce que le 60m laisse attendre (et vice-versa) via une vraie régression de population,
   indépendante du fit personnel. Réintégrées comme REPLI CIBLÉ, uniquement quand le fit ne peut rien
   dire sur 60m ou 100m (voir `classifySprintProfile`) — jamais en doublon d'une comparaison déjà
   produite par le fit pour ces mêmes distances, pour ne pas recréer la confusion "2 sources, laquelle
   regarder" qui avait motivé leur retrait initial. Formules revérifiées le jour même par fetch direct
   du JS brut des 2 pages (fechain-athletisme.fr/calculs/testde100.htm et /test60m.htm), pas
   recopiées de mémoire ni redevinées.

   Comparaison RÉEL-vs-ATTENDU (jamais une "capacité" force/vitesse inférée) : évite délibérément la
   controverse Ettema 2023 (IJSPP, "The Force-Velocity Profiling Concept for Sprint Running Is a Dead
   End") sur l'usage du profil force-vitesse complet pour classer les profils d'athlètes — ce fichier
   ne calcule et n'affiche jamais F0/V0/Pmax/Sfv, seulement des temps prédits vs mesurés.

   Toutes les distances "standing" supposent des temps CUMULÉS depuis le départ arrêté (0→10m, 0→20m,
   0→30m, 0→60m, 0→100m, 0→200m). Les segments "fly" (fly10m/20m/30m, testNorms.ts) sont des tronçons
   LANCÉS — soit une vraie mesure loguée séparément (radar/cellules sans repartir de 0), soit dérivés
   de 2 temps cumulés déjà logués (voir `classifySprintProfile`). */

export type SprintDistance = 10 | 20 | 30 | 60 | 100 | 200;
export const SPRINT_DISTANCES: SprintDistance[] = [10, 20, 30, 60, 100, 200];

export type FlyKey = "fly10m" | "fly20m" | "fly30m";
/* Fenêtre "flying" conventionnelle pour chaque longueur de segment, choisie parmi les distances
   standing supportées (10/20/30/60/100/200m) — jamais un segment qui démarre à 0 (ce serait un
   standing, pas un flying). Convention utilisée : Fly 10m = 20→30m (flying après une entrée de
   20m, la fenêtre la plus classique en pratique de terrain) ; Fly 20m = 10→30m (seule paire à 20m
   d'écart disponible dans les distances supportées) ; Fly 30m = 30→60m (le "flying 30" classique de
   la littérature sprint). */
export const FLY_SEGMENTS: { key: FlyKey; from: SprintDistance; to: SprintDistance; label: string }[] = [
  { key: "fly10m", from: 20, to: 30, label: "Fly 10m (20→30m)" },
  { key: "fly20m", from: 10, to: 30, label: "Fly 20m (10→30m)" },
  { key: "fly30m", from: 30, to: 60, label: "Fly 30m (30→60m)" },
];

/* Portage fidèle du JS publié sur theperfclub.com/simulateur-de-temps-de-sprint/ — mêmes noms de
   fonctions, même algorithme de bissection (100 itérations, jamais une résolution analytique
   inventée). `spDist`/`spTimeAtDist` exportées (utiles à un futur appelant qui voudrait prédire une
   distance arbitraire hors de la liste ci-dessus) ; `spSolveVmax`/`spSolveTau` restent internes,
   seul `fitSprintModel` les expose via son résultat {vmax,tau} — jamais affiché tel quel à l'écran. */
export function spDist(t: number, vmax: number, tau: number): number {
  return vmax * (t - tau * (1 - Math.exp(-t / tau)));
}
export function spTimeAtDist(d: number, vmax: number, tau: number): number {
  let lo = 0.01, hi = 60;
  let flo = spDist(lo, vmax, tau) - d;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fmid = spDist(mid, vmax, tau) - d;
    if ((fmid > 0) === (flo > 0)) { lo = mid; flo = fmid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}
function spSolveVmax(tau: number, d: number, t: number): number {
  const denom = t - tau * (1 - Math.exp(-t / tau));
  return d / denom;
}
function spFTau(tau: number, d1: number, t1: number, d2: number, t2: number): number {
  const vmax = spSolveVmax(tau, d1, t1);
  return d2 - vmax * (t2 - tau * (1 - Math.exp(-t2 / tau)));
}
function spSolveTau(d1: number, t1: number, d2: number, t2: number): number | null {
  let lo = 0.05, hi = 3.0;
  let flo = spFTau(lo, d1, t1, d2, t2);
  const fhi = spFTau(hi, d1, t1, d2, t2);
  if ((flo > 0) === (fhi > 0)) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fmid = spFTau(mid, d1, t1, d2, t2);
    if ((fmid > 0) === (flo > 0)) { lo = mid; flo = fmid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

export interface MonoExpFit { vmax: number; tau: number; fromDist: SprintDistance; toDist: SprintDistance; }

/* Choisit la paire de distances la plus fiable parmi celles déjà loguées (dernière valeur de chaque
   distance, voir TestsPanel.tsx `latestByMetric`) : l'écart le plus large possible (span = to-from)
   maximise la robustesse du fit face au bruit de mesure d'un chrono manuel — 2 points trop proches
   (ex. 10m+20m) amplifient l'erreur sur τ. À span égal, préfère la paire dont la distance finale est
   la plus grande (capte mieux la phase de vitesse max, utile au-delà du fit lui-même si un futur
   appelant veut juger sa qualité). Retourne `null` si moins de 2 distances sont loguées, ou si la
   bissection ne trouve pas de racine (cas dégénéré, ex. 2 temps identiques). */
export function fitSprintModel(splits: Partial<Record<SprintDistance, number>>): MonoExpFit | null {
  const logged = SPRINT_DISTANCES.filter(d => splits[d] != null);
  if (logged.length < 2) return null;
  let best: { from: SprintDistance; to: SprintDistance; span: number } | null = null;
  for (let i = 0; i < logged.length; i++) {
    for (let j = i + 1; j < logged.length; j++) {
      const from = logged[i], to = logged[j];
      const span = to - from;
      if (!best || span > best.span || (span === best.span && to > best.to)) best = { from, to, span };
    }
  }
  if (!best) return null;
  const t1 = splits[best.from]!, t2 = splits[best.to]!;
  const tau = spSolveTau(best.from, t1, best.to, t2);
  if (tau == null) return null;
  const vmax = spSolveVmax(tau, best.from, t1);
  if (!Number.isFinite(vmax) || vmax <= 0 || !Number.isFinite(tau) || tau <= 0) return null;
  return { vmax, tau, fromDist: best.from, toDist: best.to };
}

export interface SprintAxisComparison {
  /** Libellé humain déjà formé (ex. "Sprint 60m", "Fly 30m (30→60m)") — plus un enum fixe à mapper
      côté UI, puisque l'ensemble des distances/segments interprétables est désormais dynamique. */
  axis: string;
  actual: number;
  predicted: number;
  deltaPct: number; // (actual-predicted)/predicted*100 — positif = plus LENT que prévu
  label: "point fort" | "conforme à l'attendu" | "axe de travail";
}
const DELTA_TOLERANCE_PCT = 3; // ±3% = "conforme" — en dessous, le bruit de mesure (chrono manuel) domine le signal

function compareAxis(axis: string, actual: number, predicted: number): SprintAxisComparison {
  const deltaPct = ((actual - predicted) / predicted) * 100;
  const label = deltaPct > DELTA_TOLERANCE_PCT ? "axe de travail" : deltaPct < -DELTA_TOLERANCE_PCT ? "point fort" : "conforme à l'attendu";
  return { axis, actual, predicted, deltaPct, label };
}

/* Régressions quadratiques fechain-athletisme.fr (Chu/Dick) — portées telles quelles depuis le JS
   brut des 2 pages (fetch direct du 2026-09, coefficients non arrondis). Servent UNIQUEMENT de repli
   pour 60m/100m quand le fit mono-exponentiel personnel ne peut rien en dire (voir appel dans
   `classifySprintProfile`) — jamais utilisées seules pour un autre usage. */
function predictFrom100m(t100: number): { t30: number; t60: number; t3060: number } {
  return {
    t30: -0.904251 + 0.3894074 * t100 + 0.0054527 * t100 * t100,
    t60: -5.321233 + 1.535573 * t100 - 0.038825 * t100 * t100,
    t3060: -1.689993 + 0.3338059 * t100 + 0.0078765 * t100 * t100,
  };
}
function predictFrom60m(t60: number): { t100: number; t200: number } {
  return {
    t100: 7.3829894 - 0.431975 * t60 + 0.1394189 * t60 * t60,
    t200: 13.795573 - 0.720532 * t60 + 0.2806044 * t60 * t60,
  };
}

/* Profil de vitesse généralisé (2026-09, remplace l'ancienne logique à 3 axes fixes) — compare le
   temps RÉEL de chaque distance/segment logué à ce que le modèle mono-exponentiel (fitté sur les 2
   distances les plus fiables du même sportif) laisse attendre. Les 2 distances qui SERVENT au fit
   sont exclues par construction (parfaitement prédites, rien à comparer — comparer une distance à
   elle-même donnerait toujours "conforme", un faux signal). `flySplits` optionnel : valeurs RÉELLEMENT
   loguées pour fly10m/20m/30m (test radar/cellules à part, jamais une valeur inventée) — si absent
   pour un segment donné, dérivé des 2 temps cumulés correspondants s'ils sont tous les deux logués
   (voir FLY_SEGMENTS), sauf si ce segment coïncide exactement avec la paire source du fit (la
   comparaison serait alors triviale : delta = 0 par construction, aucune information). Une mesure de
   fly RÉELLEMENT loguée reste en revanche toujours comparée, même si elle coïncide avec la paire
   source du fit — c'est une mesure indépendante (méthode de test différente), pas une valeur dérivée
   des mêmes 2 points.

   Repli fechain (60m/100m) — APRÈS les 2 boucles ci-dessus : si sprint60m ET sprint100m sont tous les
   deux logués mais que l'un des deux (ou les deux) n'a reçu AUCUNE comparaison du fit personnel (cas
   réel : ce sont les 2 seules distances loguées, donc toutes les deux consommées par le fit — voir
   note de fichier), la régression de population Chu/Dick comble le trou pour cette distance
   précisément. Ne s'applique JAMAIS à une distance déjà couverte par le fit — single source de
   vérité par distance, jamais 2 jauges concurrentes pour le même sprint. */
export function classifySprintProfile(
  splits: Partial<Record<SprintDistance, number>>,
  flySplits?: Partial<Record<FlyKey, number>>
): SprintAxisComparison[] {
  const fit = fitSprintModel(splits);
  const out: SprintAxisComparison[] = [];
  if (fit) {
    for (const d of SPRINT_DISTANCES) {
      if (d === fit.fromDist || d === fit.toDist) continue;
      const actual = splits[d];
      if (actual == null) continue;
      const predicted = spTimeAtDist(d, fit.vmax, fit.tau);
      out.push(compareAxis(`Sprint ${d}m`, actual, predicted));
    }
    for (const seg of FLY_SEGMENTS) {
      const direct = flySplits?.[seg.key];
      const isFitPair = seg.from === fit.fromDist && seg.to === fit.toDist;
      let actual: number | null = null;
      if (direct != null) actual = direct;
      else if (!isFitPair && splits[seg.from] != null && splits[seg.to] != null) actual = splits[seg.to]! - splits[seg.from]!;
      if (actual == null) continue;
      const predicted = spTimeAtDist(seg.to, fit.vmax, fit.tau) - spTimeAtDist(seg.from, fit.vmax, fit.tau);
      out.push(compareAxis(seg.label, actual, predicted));
    }
  }
  const t60 = splits[60], t100 = splits[100];
  if (t60 != null && t100 != null) {
    const covered = new Set(out.map(c => c.axis));
    if (!covered.has("Sprint 60m")) out.push(compareAxis("Sprint 60m", t60, predictFrom100m(t100).t60));
    if (!covered.has("Sprint 100m")) out.push(compareAxis("Sprint 100m", t100, predictFrom60m(t60).t100));
  }
  return out;
}
