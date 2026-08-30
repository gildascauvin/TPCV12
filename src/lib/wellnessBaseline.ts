import type { WellnessDaily } from "@/types";
import { daysAgoStr } from "@/lib/trainingLoad";

/* Baseline personnelle du wellness — Z-score vs moyenne/écart-type glissants (14-28j, défaut 21j),
   composite ET par dimension (sommeil/stress/récup/motivation), pour remplacer les seuils absolus
   par des seuils relatifs à l'historique propre de chaque sportif. `wellness_daily.score`/
   `base_score` restent la seule mémoire stockée (jamais écrasés) — ce module ne fait que lire cet
   historique et dériver un `relativeScore` d'affichage, jamais persisté nulle part. */

export type ZStat = { mean: number; stdDev: number; n: number };

// Variance de population (divise par n, pas n-1) — même convention que rollingStats() (trainingLoad.ts).
export function rollingMeanStd(series: { date: string; value: number }[], windowDays: number): ZStat {
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const slice = sorted.slice(-windowDays);
  const vals = slice.map(p => p.value);
  if (!vals.length) return { mean: 0, stdDev: 0, n: 0 };
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return { mean, stdDev: Math.sqrt(variance), n: vals.length };
}

export function zScore(value: number, stat: ZStat): number | null {
  if (stat.n < 2 || stat.stdDev === 0) return null;
  return (value - stat.mean) / stat.stdDev;
}

export const WELLNESS_BASELINE_WINDOW_DAYS = 21;
export const WELLNESS_BASELINE_MIN_DAYS = 12;
// Réutilise le seuil critique déjà existant dans computeAutoregSuggestion (wellness<40→🚨) — pas un
// nouveau chiffre inventé pour ce garde-fou.
export const WELLNESS_ABSOLUTE_GUARD_SCORE = 40;

/* Approximation d'Abramowitz & Stegun 7.1.26 (Handbook of Mathematical Functions) de la fonction
   d'erreur — erreur max ~1.5e-7, largement suffisant ici. Sert à convertir un Z en percentile via
   la fonction de répartition de la loi normale standard, la même conversion que celle utilisée par
   les systèmes de "readiness score" sportifs réels pour transformer un Z-score en score 0-100. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Fonction de répartition de la loi normale standard Φ(z) — z=0 → 0.5 (50e percentile). */
export function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/* Seuils Z ancrés sur la littérature du monitoring sportif (Hopkins & Batterham) plutôt qu'inventés :
   - Z_SWC (Smallest Worthwhile Change) = 0.2×écart-type — seuil standard du "plus petit changement
     qui compte" en science du sport (Hopkins & Batterham, "Making Meaningful Inferences About
     Magnitudes"). Sépare "Équilibré" du reste dans les zones d'affichage (purement descriptif).
   - Z_MODERATE = 0.6 — borne "modérée" de l'échelle d'ampleur d'effet de Hopkins (trivial<0.2,
     petit 0.2-0.59, modéré 0.6-1.19, grand 1.2-1.9, très grand ≥2). Déclenche les décisions
     actionnables (Alléger/Surcharger, alertes coach) — volontairement plus haut que Z_SWC pour ne
     pas déclencher une action sur un simple changement "notable mais pas encore modéré".
   - Z_SEVERE = -1.645 — 5e percentile de la loi normale standard, convention statistique usuelle du
     seuil "anormalement bas" (IC 95% unilatéral) — combiné au garde-fou absolu pour le cas critique. */
export const Z_SWC = 0.2;
export const Z_MODERATE = 0.6;
export const Z_SEVERE = -1.645;

export type Perspective = "athlete" | "coach";
export type DimensionKey = "sleep" | "stress" | "recovery" | "motivation";
export type DimensionBaseline = { raw: number; z: number | null };

export type WellnessBaselineResult = {
  hasEnoughHistory: boolean;
  historyDays: number;
  composite: DimensionBaseline;
  // Score d'affichage : score absolu tel quel si !hasEnoughHistory (repli exact du comportement
  // actuel), sinon clamp(5,95, Φ(z)×100) — percentile de la loi normale standard, la même conversion
  // Z→score 0-100 utilisée par les systèmes de "readiness score" sportifs réels (voir normalCDF()
  // plus haut). LE nombre qui remplace le score absolu partout où il s'affiche (ring, /today, Coach
  // Control, chart Récupération).
  relativeScore: number;
  dimensions: Record<DimensionKey, DimensionBaseline>;
  // Dimension au Z le plus négatif parmi les 4 — même principe de priorité que le tri
  // `signals.filter(s=>s.low).sort((a,b)=>a.value-b.value)[0]` déjà utilisé dans getRecoveryAdvice()
  // (wellness.ts). null si historique insuffisant.
  drivingDimension: DimensionKey | null;
  // Score composite ABSOLU < 40 — indépendant du Z, ne doit jamais être masqué par une norme perso
  // basse (ex. sportif chroniquement fatigué, Z≈0 mais état réellement à risque).
  guardRailTriggered: boolean;
};

type WellnessRow = Pick<WellnessDaily, "date" | "score" | "base_score" | "sleep" | "stress" | "recovery" | "motivation">;
type TodayRow = Pick<WellnessDaily, "score" | "base_score" | "sleep" | "stress" | "recovery" | "motivation">;

/* `base_score` en priorité, jamais `score` : `score` inclut le bonus/malus comportements
   (computeWellnessScore, wellness.ts) — un signal comportemental (alcool, écrans tard...) n'est pas
   censé faire bouger "l'état de forme" lui-même, seulement être corrélé à lui après coup (voir
   computeBehaviorCorrelations dans conseilsData.ts, seule fonction qui reste volontairement sur
   `score` — sinon la corrélation deviendrait tautologique : le comportement expliquerait le score
   en partie PARCE QU'il y est mécaniquement additionné, pas parce qu'un vrai lien a été observé).
   Exportée pour que tout appelant qui doit dériver "la valeur du jour" reste sur la même convention. */
export function wellnessSignal(row: Pick<WellnessDaily, "score" | "base_score">): number | null {
  return row.base_score ?? row.score ?? null;
}

function compositeValue(row: TodayRow): number | null {
  return wellnessSignal(row);
}

// stress est toujours inversé (10-stress) — même convention que computeWellnessScore() (wellness.ts)
// — garantit qu'un Z positif signifie toujours "mieux que d'habitude" sur les 4 dimensions comme
// sur le composite, sans inversion de signe à gérer ailleurs dans l'app.
function dimensionRaw(row: TodayRow, dim: DimensionKey): number {
  return dim === "stress" ? 10 - row.stress : row[dim];
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

const DIMENSION_KEYS: DimensionKey[] = ["sleep", "stress", "recovery", "motivation"];

/**
 * Calcule la baseline (composite + par dimension) pour UN jour donné.
 * `history` : jours STRICTEMENT antérieurs au jour évalué (l'appelant filtre/fournit la fenêtre,
 * peu importe l'ordre — trié en interne). Toujours comparé au score BRUT du jour (`wellnessSignal`)
 * — plus d'impact fatigue post-séance appliqué nulle part (retiré de /today, seule surface qui
 * l'utilisait) : le garder sur une seule surface créait exactement le type de confusion inter-
 * surfaces que ce module vise à éliminer.
 */
export function computeWellnessBaselineAt(
  history: WellnessRow[],
  todayRow: TodayRow | null,
  windowDays: number = WELLNESS_BASELINE_WINDOW_DAYS,
): WellnessBaselineResult | null {
  if (!todayRow) return null;
  const todayComposite = compositeValue(todayRow);
  if (todayComposite === null) return null;

  const compositeSeries = history
    .map(h => ({ date: h.date, value: compositeValue(h) }))
    .filter((p): p is { date: string; value: number } => p.value !== null);

  const historyDays = compositeSeries.length;
  const hasEnoughHistory = historyDays >= WELLNESS_BASELINE_MIN_DAYS;

  const compositeStat = rollingMeanStd(compositeSeries, windowDays);
  const compositeZ = hasEnoughHistory ? zScore(todayComposite, compositeStat) : null;

  const relativeScore = compositeZ !== null
    ? Math.round(clamp(5, 95, normalCDF(compositeZ) * 100))
    : todayComposite; // repli : score absolu tel quel, comportement actuel inchangé

  const dimensions = {} as Record<DimensionKey, DimensionBaseline>;
  for (const dim of DIMENSION_KEYS) {
    const series = history.map(h => ({ date: h.date, value: dimensionRaw(h, dim) }));
    const stat = rollingMeanStd(series, windowDays);
    const rawToday = dimensionRaw(todayRow, dim);
    const z = hasEnoughHistory ? zScore(rawToday, stat) : null;
    dimensions[dim] = { raw: rawToday, z };
  }

  let drivingDimension: DimensionKey | null = null;
  if (hasEnoughHistory) {
    let worstZ = Infinity;
    for (const dim of DIMENSION_KEYS) {
      const z = dimensions[dim].z;
      if (z !== null && z < worstZ) { worstZ = z; drivingDimension = dim; }
    }
  }

  return {
    hasEnoughHistory,
    historyDays,
    composite: { raw: todayComposite, z: compositeZ },
    relativeScore,
    dimensions,
    drivingDimension,
    guardRailTriggered: todayComposite < WELLNESS_ABSOLUTE_GUARD_SCORE,
  };
}

/**
 * Série jour par jour sur `days` jours (fenêtre qui s'élargit progressivement vers `windowDays`
 * réels, même convention que buildDailyTimeSeries()/acwrSeries() dans trainingLoad.ts/
 * fatigueSignature.ts) — pour /conseils et /coach/athletes (charts, pas juste "aujourd'hui").
 */
export function computeWellnessBaselineSeries(
  wellness: WellnessDaily[],
  days: number,
  anchor: Date = new Date(),
  windowDays: number = WELLNESS_BASELINE_WINDOW_DAYS,
): (WellnessBaselineResult | null)[] {
  const byDate = new Map(wellness.map(w => [w.date, w]));
  const results: (WellnessBaselineResult | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    const todayRow = byDate.get(date) ?? null;
    const history: WellnessRow[] = [];
    for (let j = 1; j <= windowDays; j++) {
      const row = byDate.get(daysAgoStr(i + j, anchor));
      if (row) history.push(row);
    }
    results.push(computeWellnessBaselineAt(history, todayRow, windowDays));
  }
  return results;
}

/**
 * Zone relative ("Fatigué"/"Équilibré"/"Frais") — même vocabulaire que FORM_ZONES
 * (SparkLineClient.tsx, système de zones désormais partagé entre Wellness et Forme sur le chart
 * Récupération) — remplace zoneLabel() (wellness.ts, 4 zones absolues 82/65/45) une fois
 * l'historique suffisant ; repli exact sur les mêmes seuils/libellés absolus que zoneLabel() tant
 * que ce n'est pas le cas (comportement actuel inchangé). Aucune notion de possessif nécessaire
 * (contrairement à "sous ta/sa norme"), donc `perspective` n'a plus d'effet ici — gardé en
 * paramètre pour ne pas casser les appelants existants.
 */
export function relativeZoneLabel(b: WellnessBaselineResult | null, _perspective: Perspective = "athlete"): string {
  if (!b) return "Non renseigné";
  if (!b.hasEnoughHistory || b.composite.z === null) {
    const s = b.relativeScore;
    if (s >= 82) return "Zone optimale";
    if (s >= 65) return "Zone stable";
    if (s >= 45) return "Zone prudente";
    return "Zone récupération";
  }
  const z = b.composite.z;
  if (z >= Z_SWC) return "Frais";
  if (z >= -Z_SWC) return "Équilibré";
  return "Fatigué";
}

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  sleep: "Sommeil",
  stress: "Stress",
  recovery: "Récup. musculaire", // distinct du titre de page "Récupération" (ex-"Wellness") — voir wellness.ts:211 pour le libellé déjà existant repris ici
  motivation: "Motivation",
};

/* Le composite "stress" est inversé en interne (dimensionRaw = 10-stress, voir plus haut) — un Z
   positif y signifie "moins stressé que d'habitude", jamais "stress au-dessus de la norme". Cette
   inversion est correcte pour la SÉLECTION (plus négatif = pire, uniformément sur les 4 dimensions,
   voir drivingDimension) mais fausserait le TEXTE si on l'affichait telle quelle ("Stress en dessous
   de ta norme" pour dire "tu es plus stressé que d'habitude" — l'inverse de ce que ça donne à lire).
   `directionalZ` re-flip cette seule dimension avant construction de la phrase, pour que "Stress
   au-dessus de ta norme" veuille bien dire "ton stress réel est au-dessus de d'habitude". */
function directionalZ(dim: DimensionKey, z: number): number {
  return dim === "stress" ? -z : z;
}

function deviationIntensity(absZ: number, direction: "above" | "below"): string {
  if (direction === "below") {
    return absZ >= Math.abs(Z_SEVERE) ? "très en dessous" : absZ >= Z_MODERATE ? "nettement en dessous" : "légèrement en dessous";
  }
  return absZ >= Z_MODERATE ? "nettement au-dessus" : "au-dessus";
}

/** Quelle dimension pousse la déviation, en texte — null si historique insuffisant ou rien de notable. */
export function describeDrivingDimension(b: WellnessBaselineResult, perspective: Perspective = "athlete"): string | null {
  if (!b.hasEnoughHistory || !b.drivingDimension) return null;
  const dim = b.drivingDimension;
  const z = b.dimensions[dim].z;
  if (z === null || z >= -Z_SWC) return null; // pas réellement basse malgré la priorité "la plus négative"
  const poss = perspective === "coach" ? "sa" : "ta";
  const dz = directionalZ(dim, z);
  const intensity = deviationIntensity(Math.abs(dz), dz >= 0 ? "above" : "below");
  return `${DIMENSION_LABELS[dim]} ${intensity} de ${poss} norme`;
}

/* Dimension qui domine l'écart du jour, DANS LES DEUX SENS — contrairement à describeDrivingDimension()
   ci-dessus (toujours la plus négative des 4, jamais un excédent), celle-ci retourne la dimension au
   |Z| le plus marqué parmi les 4, que ce soit un déficit OU un excédent. Sert à expliquer un bon jour
   ("porté par ton sommeil") autant qu'un mauvais ("tiré par ton stress"), pas seulement à signaler un
   creux — voir recoveryCrossInsight() dans fatigueSignature.ts. */
export function describeDominantDimension(b: WellnessBaselineResult, perspective: Perspective = "athlete"): string | null {
  if (!b.hasEnoughHistory) return null;
  let dim: DimensionKey | null = null;
  let bestAbsZ = 0;
  for (const k of DIMENSION_KEYS) {
    const z = b.dimensions[k].z;
    if (z === null) continue;
    if (Math.abs(z) > bestAbsZ) { bestAbsZ = Math.abs(z); dim = k; }
  }
  if (!dim || bestAbsZ < Z_SWC) return null; // rien de vraiment notable (toutes les dimensions proches de la norme)
  const z = b.dimensions[dim].z!;
  const poss = perspective === "coach" ? "sa" : "ta";
  const dz = directionalZ(dim, z);
  const intensity = deviationIntensity(Math.abs(dz), dz >= 0 ? "above" : "below");
  return `${DIMENSION_LABELS[dim]} ${intensity} de ${poss} norme`;
}

export type DimensionBadge = { key: DimensionKey; label: string; z: number; arrow: "up" | "down" | "stable" };

/* Badges de dimension pour un point donné d'une série (ex. survol du chart Récupération) — un badge
   par dimension avec historique suffisant, Z + tendance (comparée au même point ~`trendLookback`
   jours plus tôt, borné au début de la série). Seuil Z_SWC pour "stable" — même convention SWC
   (Hopkins & Batterham) que la zone d'affichage, réutilisée ici sur un delta de 2 Z déjà lissés. */
function dimensionBadgesAt(series: (WellnessBaselineResult | null)[], idx: number, trendLookback = 7): DimensionBadge[] | null {
  const b = series[idx];
  if (!b?.hasEnoughHistory) return null;
  const prev = series[Math.max(0, idx - trendLookback)];
  const badges: DimensionBadge[] = [];
  for (const dim of DIMENSION_KEYS) {
    const z = b.dimensions[dim].z;
    if (z === null) continue;
    const prevZ = prev?.dimensions[dim].z ?? null;
    const delta = prevZ !== null ? z - prevZ : 0;
    const arrow: DimensionBadge["arrow"] = Math.abs(delta) < Z_SWC ? "stable" : delta > 0 ? "up" : "down";
    badges.push({ key: dim, label: DIMENSION_LABELS[dim], z, arrow });
  }
  return badges;
}

/** Version série complète (mêmes points que computeWellnessBaselineSeries) — pour brancher le survol du chart. */
export function dimensionBadgesSeries(series: (WellnessBaselineResult | null)[], trendLookback = 7): (DimensionBadge[] | null)[] {
  return series.map((_, i) => dimensionBadgesAt(series, i, trendLookback));
}
