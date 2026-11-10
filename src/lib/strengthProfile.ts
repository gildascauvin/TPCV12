/* Estimation 1RM et endurance de force à partir de séries reps×poids — 2026-09, généralisé (suite).
   10/11/2026 : l'estimation passe sur la méthode de l'outil WordPress (oneRepMaxFromSet ci-dessous,
   moyenne Epley / Brzycki) ; le texte qui suit décrit l'ancienne formule Epley seule.
   Une seule formule, réutilisée dans les 2 sens (jamais 2 modèles différents avec 2 statuts
   épistémiques distincts) :

   Epley : 1RM = poids × (1 + reps/30) — sourcée (voir jbmorin.net/theicss.org, cf. le chantier profil
   de vitesse pour la méthode de recherche), la plus citée avec Brzycki pour l'estimation de 1RM.
   Fiable pour 2-10 reps, se dégrade nettement au-delà (cité par plusieurs sources) — affiché tel quel,
   jamais masqué.

   Endurance de force, généralisée (2026-09, suite) — ne dépend plus d'un vrai 1RM logué à part :
   n'importe quelles 2 séries reps×poids d'un même mouvement (ex. un 5RM et un 3RM, ou un vrai 1RM
   traité comme une série à "1 rep" comme les autres) peuvent être comparées entre elles. Chacune
   donne SA PROPRE estimation de 1RM (Epley) ; si les deux s'accordent, rien à signaler (le modèle
   suppose qu'elles estiment la même vraie valeur). Si elles divergent, la direction dit où porter
   l'effort : si la série à PLUS de reps implique un 1RM plus élevé que celle à MOINS de reps, tu tiens
   mieux à haute répétition qu'à l'effort quasi-maximal → axe de travail = force absolue (ex. "ton 5RM
   est théoriquement meilleur que ton 3RM. Travaille ta force absolue.", exemple donné par Gildas).
   Dans l'autre sens (série à moins de reps qui implique un 1RM plus élevé) → axe de travail =
   endurance de force (tu tiens moins bien que prévu à mesure que les reps augmentent). Toujours la
   MÊME équation Epley des deux côtés, jamais une 2e table avec son propre statut de source. */

export interface RepSet { reps: number; weight: number }

/* 1RM estimé (Epley) à partir d'une série reps×poids — pure info d'affichage, jamais utilisé pour les
   RATIO_CARDS sourcées (testNorms.ts), qui ne lisent jamais `strength_reps`. Fiabilité déclarée dans
   `reliable` (2-10 reps, au-delà le modèle se dégrade nettement).
   Cas reps=1 traité à part (bug réel trouvé en vérifiant) : Epley(W,1) = W×(1+1/30) ≈ W×1.033, ce qui
   SURESTIME un vrai 1RM de ~3.3% — la formule est conçue pour EXTRAPOLER depuis une série sous-
   maximale (reps>1), pas pour "corriger" un effort déjà maximal à 1 rep, qui EST le 1RM par
   définition. */
/* Méthode unique de l'app et des outils (10/11/2026, alignée sur l'outil WordPress
   ~/Desktop/tpc-seo/tools/calc-1rm.js) : série à l'échec = moyenne Epley / Brzycki, 1 rep = la
   charge ; série en RPE = tableau de Helms et al. 2016 (1 à 8 reps). Arrondi au dixième, comme la
   page. Les résultats déjà en base ne sont pas recalculés. */
export const RPE_TABLE: Record<string, number[]> = {
  "10": [100, 95, 91, 87, 85, 83, 81, 79], "9.5": [97, 93, 89, 86, 84, 82, 80, 77.5], "9": [95, 91, 87, 85, 83, 81, 79, 76],
  "8.5": [93, 89, 86, 84, 82, 80, 77.5, 74.5], "8": [91, 87, 85, 83, 81, 79, 76, 73], "7.5": [89, 86, 84, 82, 80, 77.5, 74.5, 71.5],
  "7": [87, 85, 83, 81, 79, 76, 73, 70],
};
/** 1RM estimé d'une série (méthode de l'outil WordPress). `strict` : mêmes refus que la page (plus de 12 reps, plus de 500 kg). */
export function oneRepMaxFromSet(weight: number, reps: number, opts: { rpe?: string; strict?: boolean } = {}): number | null {
  const one = oneRepMaxRaw(weight, reps, opts);
  return one == null ? null : Number(one.toFixed(1));
}
/** Même calcul sans arrondi (l'outil WordPress dérive ses charges de 1 à 8 RM de cette valeur-là). */
export function oneRepMaxRaw(weight: number, reps: number, opts: { rpe?: string; strict?: boolean } = {}): number | null {
  if (!(weight > 0) || !Number.isInteger(reps) || reps < 1) return null;
  if (opts.strict && (weight > 500 || reps > 12)) return null;
  let one: number;
  if (opts.rpe != null) {
    const row = RPE_TABLE[opts.rpe];
    if (!row || reps > 8) return null;
    one = weight / (row[reps - 1] / 100);
  } else if (reps === 1) one = weight;
  else if (reps < 37) one = (weight * (1 + reps / 30) + (weight * 36) / (37 - reps)) / 2;
  else one = weight * (1 + reps / 30);
  return one;
}

export function estimateOneRepMax(set: RepSet): { value: number; reliable: boolean } {
  if (set.reps <= 1) return { value: set.weight, reliable: true };
  return { value: oneRepMaxFromSet(set.weight, set.reps) ?? set.weight * (1 + set.reps / 30), reliable: set.reps <= 10 };
}

export interface StrengthEnduranceComparison {
  lowRepSet: RepSet; // moins de reps, plus proche de l'effort quasi-maximal
  highRepSet: RepSet; // plus de reps, plus proche de l'endurance de force
  deltaPct: number; // (e1RM(highRep) - e1RM(lowRep)) / e1RM(lowRep) * 100
  focus: "force absolue" | "endurance de force" | null; // null = cohérent, rien à signaler
  reliable: boolean; // les 2 séries sont dans la zone fiable du modèle Epley (2-10 reps chacune)
}
const ENDURANCE_TOLERANCE_PCT = 10; // plus large que le ±3% du profil de vitesse : Epley est lui-même approximatif, surtout hors 2-10 reps

/* Compare 2 séries reps×poids d'un MÊME mouvement (n'importe lesquelles — un vrai 1RM compte comme
   une série à 1 rep). Retourne `null` si les 2 séries ont le même nombre de reps (rien à comparer) ou
   si l'une des deux a un poids ≤0. */
export function compareRepRanges(a: RepSet, b: RepSet): StrengthEnduranceComparison | null {
  if (a.reps === b.reps || a.weight <= 0 || b.weight <= 0) return null;
  const [lowRepSet, highRepSet] = a.reps < b.reps ? [a, b] : [b, a];
  const e1rmLow = estimateOneRepMax(lowRepSet);
  const e1rmHigh = estimateOneRepMax(highRepSet);
  const deltaPct = ((e1rmHigh.value - e1rmLow.value) / e1rmLow.value) * 100;
  const focus = deltaPct > ENDURANCE_TOLERANCE_PCT ? "force absolue" : deltaPct < -ENDURANCE_TOLERANCE_PCT ? "endurance de force" : null;
  return { lowRepSet, highRepSet, deltaPct, focus, reliable: e1rmLow.reliable && e1rmHigh.reliable };
}

/* Choisit LA paire la plus informative parmi toutes les séries connues d'un mouvement (2026-09, suite)
   — l'écart le plus large entre reps (ex. 1RM vs 8RM plutôt que 5RM vs 6RM) donne le signal le plus
   net et le moins sensible au bruit de mesure d'une série. `sets` dédupliqué par reps au préalable par
   l'appelant (une seule série par nombre de reps, la plus récente) n'est pas requis ici — cette
   fonction se contente de prendre l'écart max parmi ce qu'on lui donne. */
export function bestStrengthEnduranceComparison(sets: RepSet[]): StrengthEnduranceComparison | null {
  let best: StrengthEnduranceComparison | null = null;
  let bestSpread = -1;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const cmp = compareRepRanges(sets[i], sets[j]);
      if (!cmp) continue;
      const spread = Math.abs(cmp.highRepSet.reps - cmp.lowRepSet.reps);
      if (spread > bestSpread) { bestSpread = spread; best = cmp; }
    }
  }
  return best;
}
