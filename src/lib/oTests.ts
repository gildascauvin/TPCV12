/* Outils de test publics /o/[test] (alter ego des /p/[id]) : chaque entrée branche une page outil
   WordPress sur un métrique de l'app. L'outil montre la saisie puis la même ligne de test que
   l'onglet Performance ; « Enregistrer ce résultat » mène à l'inscription, qui enregistre la valeur.
   Pour ajouter un test : une entrée ici (métrique existant dans testNorms.ts), puis l'iframe
   `{APP}/o/<key>` dans la page WordPress (b_iframe(kind="o") dans ~/Desktop/tpc-seo/build.py). */

import { heightFromFlightTime, vo2maxFromCooperDistance, type MetricKey } from "@/lib/testNorms";

import { oneRepMaxFromSet, oneRepMaxRaw } from "@/lib/strengthProfile";

const RPE_OPTIONS = [
  { value: "10", label: "RPE 10 : échec, rien en réserve" }, { value: "9.5", label: "RPE 9,5 : peut-être 1 rep" },
  { value: "9", label: "RPE 9 : 1 rep en réserve" }, { value: "8.5", label: "RPE 8,5 : 1 à 2 reps" },
  { value: "8", label: "RPE 8 : 2 reps en réserve" }, { value: "7.5", label: "RPE 7,5 : 2 à 3 reps" }, { value: "7", label: "RPE 7 : 3 reps en réserve" },
];

export interface OField { id: string; label: string; unit: string; def: string; options?: { value: string; label: string }[] }
/** Détail sous la ligne de test (repris des outils WordPress) : un résumé visible, le reste replié. */
export interface ODetail { summary: string; table?: { head: string[]; rows: string[][]; hl?: number }; lines?: string[] }
export interface OTestDef {
  key: string;
  /** Balise <title> et meta description de la page /o/ (noindex, indexée seulement intégrée). */
  title: string;
  description: string;
  /** En-tête quand la page est ouverte hors iframe. */
  heading: string;
  /** Bouton de l'iframe vers l'inscription : un bénéfice à la 1re personne (10/11). */
  cta: string;
  /** Page WordPress qui intègre l'outil (campagne utm par défaut). */
  wpPath: string;
  modes?: { id: string; label: string }[];
  fields: (mode: string) => OField[];
  choice?: { label: string; options: { value: string; label: string }[] };
  ask: { sport?: boolean; sexe?: boolean; poids?: boolean };
  /** Valeurs en unités de l'app (testNorms.ts), `null` si la saisie est incomplète. */
  compute: (v: Record<string, number>, ctx: { mode: string; choice: string }) => Partial<Record<MetricKey, number>> | null;
  /** Métrique de la ligne affichée, `null` si aucune valeur saisie n'a de métrique dans l'app. */
  metric: (choice: string, values: Partial<Record<MetricKey, number>> | null) => MetricKey | null;
  formula: (mode: string) => string;
  /** Saisie en tableau (lignes × colonnes) : en-têtes des colonnes ; les champs vont par ligne. */
  grid?: (mode: string) => string[];
  /** Conversion des valeurs déjà tapées quand on change de mode (comme l'outil WordPress). */
  onModeChange?: (vals: Record<string, string>, to: string) => Record<string, string>;
  detail?: (v: Record<string, number>, ctx: { mode: string; choice: string }) => ODetail | null;
}

const pos = (n: number | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
const fr = (n: number, k: number) => n.toFixed(k).replace(".", ",");

/* ── Ports fidèles des outils WordPress (~/Desktop/tpc-seo/tools/*.js), 10/11/2026 ── */

/** rsi-drop-jump.js : RSI par hauteur de chute ; la hauteur idéale = celle du RSI le plus haut (le 1er en cas d'égalité). */
const RSI_ROWS = 5, G = 9.81;
const RSI_DEF: [string, string, string][] = [["20", "520", "210"], ["30", "540", "215"], ["40", "545", "230"], ["50", "540", "255"], ["", "", ""]];
export function rsiRows(v: Record<string, number>, mode: string) {
  const rows: { b: number; h: number; c: number; r: number }[] = [];
  let best: (typeof rows)[number] | null = null;
  for (let i = 0; i < RSI_ROWS; i++) {
    const b = v[`b${i}`], j = v[`j${i}`], c = v[`c${i}`];
    if (!(c > 0) || !(j > 0)) continue;
    const h = mode === "vol" ? (G * Math.pow(j / 1000, 2)) / 8 : j / 100;
    const row = { b, h, c, r: h / (c / 1000) };
    rows.push(row);
    if (best === null || row.r > best.r) best = row;
  }
  return { rows, best };
}

/** calc-1rm.js : charges de 1 à 8 RM depuis le 1RM (colonne RPE 10 de Helms), la série saisie gardée telle quelle. */
const RPE10 = [100, 95, 91, 87, 85, 83, 81, 79];
export function chargesFrom1RM(one: number, w: number, reps: number): number[] {
  return RPE10.map((p, i) => (i + 1 === reps ? w : (one * p) / 100));
}

/** simulateur-sprint.js : modèle mono-exponentiel, mêmes dichotomies. */
export const SP_DISTANCES = [5, 10, 20, 30, 40, 50, 60, 80, 100];
const spDist = (t: number, vmax: number, tau: number) => vmax * (t - tau * (1 - Math.exp(-t / tau)));
function spTimeAtDist(d: number, vmax: number, tau: number) {
  let lo = 0.01, hi = 60, flo = spDist(lo, vmax, tau) - d;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, fmid = spDist(mid, vmax, tau) - d;
    if ((fmid > 0) === (flo > 0)) { lo = mid; flo = fmid; } else hi = mid;
  }
  return (lo + hi) / 2;
}
const spSolveVmax = (tau: number, d: number, t: number) => d / (t - tau * (1 - Math.exp(-t / tau)));
const spFTau = (tau: number, d1: number, t1: number, d2: number, t2: number) => d2 - spSolveVmax(tau, d1, t1) * (t2 - tau * (1 - Math.exp(-t2 / tau)));
function spSolveTau(d1: number, t1: number, d2: number, t2: number) {
  let lo = 0.05, hi = 3.0, flo = spFTau(lo, d1, t1, d2, t2);
  const fhi = spFTau(hi, d1, t1, d2, t2);
  if ((flo > 0) === (fhi > 0)) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, fmid = spFTau(mid, d1, t1, d2, t2);
    if ((fmid > 0) === (flo > 0)) { lo = mid; flo = fmid; } else hi = mid;
  }
  return (lo + hi) / 2;
}
export function sprintModel(d1: number, t1: number, d2: number, t2: number) {
  if (!d1 || !t1 || !d2 || !t2 || d1 === d2 || t1 <= 0 || t2 <= 0) return null;
  if (d1 > d2) { [d1, d2] = [d2, d1]; [t1, t2] = [t2, t1]; }
  if (t1 >= t2) return null;
  const tau = spSolveTau(d1, t1, d2, t2);
  if (tau === null) return null;
  const vmax = spSolveVmax(tau, d1, t1);
  return { vmax, tau, d1, d2, times: SP_DISTANCES.map(d => spTimeAtDist(d, vmax, tau)) };
}
const SPRINT_METRIC: Record<number, MetricKey> = { 10: "sprint10m", 20: "sprint20m", 30: "sprint30m", 60: "sprint60m", 100: "sprint100m" };

/** vo2max-cooper.js : 7 repères généraux. */
export const VO2_REF: [number, number, string, string][] = [[0, 30, "< 30", "Faible"], [30, 35, "30 – 35", "Moyen −"], [35, 40, "35 – 40", "Moyen"], [40, 45, "40 – 45", "Moyen +"], [45, 50, "45 – 50", "Bon"], [50, 55, "50 – 55", "Très bon"], [55, 999, "≥ 55", "Excellent"]];

export const O_TESTS: Record<string, OTestDef> = {
  detente: {
    key: "detente",
    cta: "Faire progresser ma détente",
    title: "Calculateur de détente verticale : hauteur et puissance",
    description: "Calcule ta détente verticale depuis un temps de vol ou deux touchés au mur, ta puissance, et situe ton saut face aux internationaux de ton sport.",
    heading: "Détente verticale",
    wpPath: "/calculateur-de-detente-verticale-vertical-jump/",
    modes: [{ id: "flight", label: "Temps de vol" }, { id: "reach", label: "Différence de touché" }],
    fields: mode => mode === "reach"
      ? [{ id: "rs", label: "Touché debout, bras tendu", unit: "cm", def: "220" }, { id: "rj", label: "Touché au sommet du saut", unit: "cm", def: "257" }]
      : [{ id: "t", label: "Temps de vol total", unit: "s", def: "0,55" }],
    ask: { sport: true, sexe: true, poids: true },
    compute: (v, { mode }) => {
      const h = mode === "reach" ? (pos(v.rj) && pos(v.rs) ? v.rj - v.rs : NaN) : pos(v.t) ? heightFromFlightTime(v.t) * 100 : NaN;
      return pos(h) && h < 150 ? { cmjHeight: Math.round(h * 10) / 10 } : null;
    },
    metric: () => "cmjHeight",
    formula: mode => mode === "reach" ? "Hauteur = touché en saut − touché debout" : "Hauteur = g × t² ÷ 8",
  },
  rsi: {
    key: "rsi",
    cta: "Améliorer ma réactivité",
    title: "Calculateur RSI drop jump : ta hauteur de box idéale",
    description: "Ton RSI à chaque hauteur de box et la hauteur de chute qui donne le RSI le plus haut.",
    heading: "RSI drop jump",
    wpPath: "/calculateur-rsi-drop-jump/",
    modes: [{ id: "vol", label: "J'ai le temps de vol" }, { id: "haut", label: "J'ai la hauteur sautée" }],
    grid: mode => ["Chute (cm)", mode === "haut" ? "Saut (cm)" : "Vol (ms)", "Contact (ms)"],
    fields: mode => RSI_DEF.flatMap(([b, j, c], i) => [
      { id: `b${i}`, label: `Hauteur de chute ${i + 1}`, unit: "cm", def: b },
      { id: `j${i}`, label: mode === "haut" ? `Hauteur du saut ${i + 1}` : `Temps de vol ${i + 1}`, unit: mode === "haut" ? "cm" : "ms", def: j },
      { id: `c${i}`, label: `Temps de contact ${i + 1}`, unit: "ms", def: c },
    ]),
    onModeChange: (vals, to) => {
      const out = { ...vals };
      for (let i = 0; i < RSI_ROWS; i++) {
        const v = parseFloat(String(vals[`j${i}`] ?? "").replace(",", "."));
        if (!(v > 0)) continue;
        out[`j${i}`] = to === "haut" ? fr(((G * Math.pow(v / 1000, 2)) / 8) * 100, 1) : fr(Math.sqrt((8 * (v / 100)) / G) * 1000, 0);
      }
      return out;
    },
    ask: {},
    compute: (v, { mode }) => {
      const { best } = rsiRows(v, mode);
      return best && best.h < 1.5 ? { dropJumpHeight: Math.round(best.h * 10000) / 10000, dropJumpContact: best.c / 1000 } : null;
    },
    metric: () => "dropJumpHeight",
    formula: () => "RSI = hauteur (m) ÷ temps de contact (s)",
    detail: (v, { mode }) => {
      const { rows, best } = rsiRows(v, mode);
      if (!best) return null;
      const multi = rows.length > 1;
      return {
        summary: multi ? `Hauteur de box idéale : ${Number.isFinite(best.b) ? fr(best.b, 0) + " cm" : "–"}` : "Teste au moins 2 hauteurs pour trouver ta box idéale",
        table: { head: ["Chute", "Saut", "Contact", "RSI"], rows: rows.map(x => [Number.isFinite(x.b) ? fr(x.b, 0) + " cm" : "–", fr(x.h * 100, 1) + " cm", fr(x.c, 0) + " ms", fr(x.r, 2)]), hl: rows.indexOf(best) },
      };
    },
  },
  "1rm": {
    key: "1rm",
    cta: "Faire progresser ma force",
    title: "Calculateur 1RM : ta charge maximale estimée",
    description: "Estime ton 1RM au squat, au développé couché ou au soulevé de terre depuis une série, et situe-le par rapport à ton poids de corps.",
    heading: "Calculateur 1RM",
    wpPath: "/calculateur-1rm-et-rpe/",
    modes: [{ id: "max", label: "Série à l'échec" }, { id: "rpe", label: "Série en RPE" }],
    choice: { label: "Mouvement", options: [{ value: "backSquat", label: "Squat" }, { value: "bench", label: "Développé couché" }, { value: "deadlift", label: "Soulevé de terre" }] },
    fields: mode => [
      { id: "w", label: "Charge", unit: "kg", def: "100" },
      { id: "r", label: "Répétitions", unit: "reps", def: "5" },
      ...(mode === "rpe" ? [{ id: "rpe", label: "RPE de la série", unit: "", def: "8", options: RPE_OPTIONS }] : []),
    ],
    ask: { sexe: true, poids: true },
    compute: (v, { mode, choice }) => {
      const one = oneRepMaxFromSet(v.w, v.r, { strict: true, rpe: mode === "rpe" ? String(v.rpe) : undefined });
      return one == null ? null : { [choice as MetricKey]: one };
    },
    metric: choice => choice as MetricKey,
    formula: mode => mode === "rpe" ? "Tableau RPE de Helms et al. 2016" : "Moyenne des formules d'Epley et de Brzycki",
    detail: (v, { mode }) => {
      const one = oneRepMaxRaw(v.w, v.r, { strict: true, rpe: mode === "rpe" ? String(v.rpe) : undefined });
      if (one == null) return null;
      const c = chargesFrom1RM(one, v.w, v.r);
      return { summary: "Tes charges de 1 à 8 RM", table: { head: ["RM", ...c.map((_, i) => String(i + 1))], rows: [["kg", ...c.map(x => fr(x, 1))]], hl: -1 } };
    },
  },
  sprint: {
    key: "sprint",
    cta: "Gagner en vitesse",
    title: "Simulateur de temps de sprint : Vmax et temps du 5 au 100 m",
    description: "Deux chronos suffisent : ta vitesse max, ton temps d'accélération et tes temps prédits du 5 au 100 m.",
    heading: "Simulateur de sprint",
    wpPath: "/simulateur-de-temps-de-sprint/",
    fields: () => [
      { id: "d1", label: "Distance 1", unit: "m", def: "10" }, { id: "t1", label: "Temps 1", unit: "s", def: "1,85" },
      { id: "d2", label: "Distance 2", unit: "m", def: "30" }, { id: "t2", label: "Temps 2", unit: "s", def: "4,1" },
    ],
    ask: {},
    // Seules les distances chronométrées sont enregistrées (jamais un temps prédit), et seulement celles qui ont une métrique.
    compute: v => {
      if (!sprintModel(v.d1, v.t1, v.d2, v.t2)) return null;
      const out: Partial<Record<MetricKey, number>> = {};
      if (SPRINT_METRIC[v.d1]) out[SPRINT_METRIC[v.d1]] = v.t1;
      if (SPRINT_METRIC[v.d2]) out[SPRINT_METRIC[v.d2]] = v.t2;
      return Object.keys(out).length ? out : null;
    },
    metric: (_c, values) => (values ? (["sprint10m", "sprint20m", "sprint30m", "sprint60m", "sprint100m"] as MetricKey[]).find(m => values[m] != null) ?? null : null),
    formula: () => "v(t) = Vmax × (1 − e^(−t/τ))",
    detail: v => {
      const m = sprintModel(v.d1, v.t1, v.d2, v.t2);
      if (!m) return null;
      return {
        summary: `Vmax ${fr(m.vmax, 2)} m/s (${fr(m.vmax * 3.6, 1)} km/h) · tes temps du 5 au 100 m`,
        lines: [`Temps d'accélération (τ) : ${fr(m.tau, 2)} s`],
        table: { head: SP_DISTANCES.map(d => `${d} m`), rows: [m.times.map(t => fr(t, 2) + " s")], hl: -1 },
      };
    },
  },
  vo2max: {
    key: "vo2max",
    cta: "Améliorer mon endurance",
    title: "VO2max estimé avec le test de Cooper",
    description: "Entre la distance courue en 12 minutes pour estimer ton VO2max et le situer face aux repères ACSM.",
    heading: "Test de Cooper",
    wpPath: "/calculateur-vo2max-estime-test-cooper-12-minutes/",
    fields: () => [{ id: "d", label: "Distance en 12 minutes", unit: "m", def: "2800" }],
    ask: { sexe: true },
    compute: v => pos(v.d) && v.d >= 800 && v.d <= 5000 ? { vo2max: Math.round(vo2maxFromCooperDistance(v.d) * 10) / 10 } : null,
    metric: () => "vo2max",
    formula: () => "VO2max = (distance − 504,9) ÷ 44,73",
    detail: v => {
      if (!(pos(v.d) && v.d >= 800 && v.d <= 5000)) return null;
      const vo = Math.round(vo2maxFromCooperDistance(v.d) * 10) / 10;
      const hl = VO2_REF.findIndex(r => vo >= r[0] && vo < r[1]);
      return { summary: `Ton niveau : ${VO2_REF[hl][3]}`, table: { head: ["ml/kg/min", "Niveau"], rows: VO2_REF.map(r => [r[2], r[3]]), hl } };
    },
  },
  eur: {
    key: "eur",
    cta: "Gagner en explosivité",
    title: "Ratio CMJ / Squat Jump : ton utilisation de l'élasticité",
    description: "Compare ton saut avec contre-mouvement à ton squat jump pour savoir si tu exploites bien ton élasticité.",
    heading: "CMJ et Squat Jump",
    wpPath: "/comment-ameliorer-sa-puissance-explosivite/",
    fields: () => [{ id: "cmj", label: "Saut avec contre-mouvement (CMJ)", unit: "cm", def: "38" }, { id: "sj", label: "Squat jump", unit: "cm", def: "35" }],
    ask: {},
    compute: v => pos(v.cmj) && pos(v.sj) && v.cmj < 150 && v.sj < 150 ? { cmjHeight: v.cmj, squatJumpHeight: v.sj } : null,
    metric: () => "cmjHeight",
    formula: () => "EUR = CMJ ÷ Squat Jump",
  },
};

export const isOTest = (k: string): boolean => Object.prototype.hasOwnProperty.call(O_TESTS, k);

/* Résultat transmis à l'inscription : `x=cmjHeight:37.1,squatJumpHeight:33` (unités de l'app). */
export function encodeOValues(values: Partial<Record<MetricKey, number>>): string {
  return Object.entries(values).filter(([, v]) => v != null && Number.isFinite(v)).map(([k, v]) => `${k}:${v}`).join(",");
}
export function decodeOValues(x: string): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  for (const part of x.split(",")) {
    const [k, v] = part.split(":");
    const n = Number(v);
    if (k && Number.isFinite(n)) out[k as MetricKey] = n;
  }
  return out;
}
