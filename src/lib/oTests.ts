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
export interface ODetail { /** Outils sans ligne de test (cardio) : le résultat principal en grand. */ big?: { label: string; value: string; note?: string }; summary: string; table?: { head: string[]; rows: string[][]; hl?: number }; lines?: string[] }
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
  /** Valeurs enregistrées à l'inscription si elles diffèrent de l'affichage (ex. une FC max estimée
   *  s'affiche mais ne s'enregistre pas : seule une mesure devient un résultat de test). Absent = compute. */
  persist?: (v: Record<string, number>, ctx: { mode: string; choice: string }) => Partial<Record<MetricKey, number>> | null;
  /** Ligne sans repère par nature (cardio) : pas de mention « pas de repère ». */
  plain?: boolean;
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


/* ── Cardio (11/11/2026) : ports fidèles de fc-max.js, zones-karvonen.js et zone2.js ── */

/** fc-max.js : Tanaka 2001, Nes 2013, Gulati 2010 (femmes), Fox (220 − âge) ; le pic mesuré passe avant. */
export function fcMaxFormulas(age: number) {
  return { tanaka: Math.round(208 - 0.7 * age), nes: Math.round(211 - 0.64 * age), gulati: Math.round(206 - 0.88 * age), fox: Math.round(220 - age) };
}
/** zones-karvonen.js : 5 zones de 50 à 100 % de la réserve, FC max mesurée sinon 220 − âge. */
export const HZ_ZONES: [number, number, string, string][] = [
  [0.5, 0.6, "Récupération", "Récupération active, échauffement"], [0.6, 0.7, "Endurance fondamentale", "Base aérobie, sorties longues"],
  [0.7, 0.8, "Tempo", "Allure marathon, seuil aérobie"], [0.8, 0.9, "Seuil / VO2max", "Intervalles VO2max, allure 5 km-10 km"],
  [0.9, 1.0, "Anaérobie / Max", "Sprints, puissance maximale"],
];
export function karvonen(age: number, rest: number, measuredMax: number) {
  if (!(rest > 0)) return null;
  const measured = measuredMax > 0;
  if (!measured && !(age > 0)) return null;
  const max = measured ? measuredMax : 220 - age;
  if (max <= rest) return null;
  const reserve = max - rest;
  return { max, measured, reserve, zones: HZ_ZONES.map(([a, b, name, desc]) => ({ a, b, name, desc, low: Math.round(reserve * a + rest), high: Math.round(reserve * b + rest) })) };
}
/** zone2.js : Karvonen 60-70 %, % FC max 60-70 %, Maffetone 180 − âge ; FC max estimée par Tanaka si non mesurée. */
export function zone2(age: number, rest: number, measuredMax: number) {
  const measured = measuredMax > 0;
  if (!measured && !(age > 0)) return null;
  const max = measured ? measuredMax : Math.round(208 - 0.7 * age);
  if (!(rest > 0) || max <= rest) return null;
  const r = max - rest;
  return { max, measured, kl: Math.round(r * 0.6 + rest), kh: Math.round(r * 0.7 + rest), pl: Math.round(max * 0.6), ph: Math.round(max * 0.7), maf: age > 0 ? 180 - Math.round(age) : null };
}
/* ── VFC (11/11/2026) : port fidèle de vfc.js (médianes RMSSD Lifelines, Tegegne et al. 2020,
   Eur J Prev Cardiol 27(19):2191-2194 ; ECG de 10 s au repos, 84 772 personnes ; [médiane, 2e, 98e centile]
   femmes puis hommes ; positions 0,6 / 0,85 / 1,15 / 1,6 ; zone perso ±8 %). ── */
type HrvRef = [number, number, number];
export const HRV_AGE: [number, number, HrvRef, HrvRef][] = [[15, 19, [60.7, 12.4, 225.9], [59.9, 9.8, 213.2]], [20, 24, [52.1, 11.3, 205.5], [47.6, 9.6, 174.0]], [25, 29, [47.5, 11.5, 180.7], [42.3, 10.1, 172.7]], [30, 34, [42.3, 11.5, 161.0], [36.9, 10.2, 140.8]], [35, 39, [37.9, 10.8, 141.9], [32.8, 8.6, 123.8]], [40, 44, [33.9, 9.7, 123.7], [29.0, 8.1, 105.5]], [45, 49, [29.2, 8.3, 109.5], [26.0, 7.1, 95.5]], [50, 54, [26.6, 7.5, 96.3], [23.7, 6.7, 87.5]], [55, 59, [22.5, 6.7, 83.6], [21.0, 5.5, 89.5]], [60, 64, [20.5, 5.5, 79.3], [19.1, 4.8, 86.6]], [65, 69, [17.8, 5.0, 83.0], [17.7, 4.87, 110.5]], [70, 74, [18.3, 5.0, 115.8], [16.0, 4.7, 161.9]], [75, 120, [16.1, 3.5, 106.2], [14.9, 3.7, 130.3]]];
const f1 = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
export function hrvRead(age: number, today: number, usual: number | undefined, sex: string) {
  if (!(Number.isFinite(age) && age > 0) || !pos(today)) return null;
  const a = Math.max(15, age);
  const idx = HRV_AGE.findIndex(r => a <= r[1]);
  const i = idx < 0 ? HRV_AGE.length - 1 : idx;
  const row = HRV_AGE[i], w = sex === "w", ref = w ? row[2] : row[3], med = ref[0], r = today / med;
  const where = r < 0.6 ? "nettement en dessous de" : r < 0.85 ? "un peu en dessous de" : r <= 1.15 ? "proche de" : r <= 1.6 ? "au-dessus de" : "nettement au-dessus de";
  const lab = (w ? "des femmes" : "des hommes") + " de " + row[0] + (row[1] >= 120 ? " ans et plus" : " à " + row[1] + " ans");
  const popLine = `Avec ${f1(today)} ms, tu es ${where} la médiane ${lab} (${f1(med)} ms). 96 % d’entre ${w ? "elles" : "eux"} sont entre ${f1(ref[1])} et ${f1(ref[2])} ms : une VFC très différente de la médiane reste souvent normale.`;
  let perso: { ecart: number | null; head: string; text: string };
  if (!pos(usual)) {
    perso = { ecart: null, head: "Il manque ta moyenne habituelle", text: "Une VFC ne se juge pas seule : 24 ms peut être normal pour toi et bas pour quelqu’un d’autre. Ajoute ta moyenne des dernières semaines (visible dans l’app de ta montre) pour savoir si ta séance du jour doit changer." };
  } else {
    const e = Math.round((today / usual - 1) * 100);
    perso = e >= 8 ? { ecart: e, head: "Au-dessus de ta norme", text: `Ta VFC est ${e} % au-dessus de ta moyenne. En général, c’est un signe de bonne récupération : ta séance prévue tient.` }
      : e > -8 ? { ecart: e, head: "Dans ta norme", text: "Ta VFC est dans ta zone habituelle (±8 %). Sur ce critère, rien ne justifie de changer ta séance du jour." }
      : { ecart: e, head: "Sous ta norme", text: `Ta VFC est ${-e} % sous ta moyenne. Seule, ce n’est pas une raison d’annuler. Regarde ton sommeil, ton stress et tes courbatures : si eux aussi sont mauvais, allège la séance dure du jour (moins de séries ou de charge) et garde les séances légères.` };
  }
  return { i, med, where, lab, popLine, perso, w };
}

/* ── Bronco (11/11/2026) : moyennes du résumé de Weakley et al. 2026 (JSCR 40(5):e479-e484, PMID 42017981),
   462 joueurs Super Rugby, 1 668 tests sur 10 ans. Hommes 5:11 (avants 5:21, trois-quarts 4:57),
   femmes 6:19 (avants 6:38, trois-quarts 5:52). Le résumé ne donne pas d'écart-type (± = erreur type) :
   pas de jauge ni de badge, juste l'écart à la moyenne du groupe. ── */
export const BRONCO_GROUPS = [
  { id: "ha", label: "Homme, avant", short: "avants hommes", mean: 321, row: 0 },
  { id: "hb", label: "Homme, trois-quarts", short: "trois-quarts hommes", mean: 297, row: 1 },
  { id: "fa", label: "Femme, avant", short: "avants femmes", mean: 398, row: 0 },
  { id: "fb", label: "Femme, trois-quarts", short: "trois-quarts femmes", mean: 352, row: 1 },
];
export const mmss = (sec: number) => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
function broncoSeconds(min: number | undefined, sec: number | undefined): number | null {
  const m = Number.isFinite(min) ? (min as number) : 0, s = Number.isFinite(sec) ? (sec as number) : 0;
  const t = Math.round(m * 60 + s);
  return m >= 0 && s >= 0 && s < 60 && t >= 180 && t <= 900 ? t : null;
}
const AGE_FIELD = (def: string): OField => ({ id: "age", label: "Ton âge", unit: "ans", def });

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
  fcmax: {
    key: "fcmax",
    cta: "Mieux doser mes séances",
    title: "Calculer sa fréquence cardiaque maximale : 4 formules et ton pic mesuré",
    description: "Ta FC max estimée selon ton âge (Tanaka, Nes, Gulati, 220 − âge), ou ton pic mesuré, prioritaire.",
    heading: "FC max",
    wpPath: "/frequence-cardiaque-maximale-comment-la-calculer/",
    choice: { label: "Catégorie", options: [{ value: "x", label: "Non précisé" }, { value: "f", label: "Femme" }, { value: "h", label: "Homme" }] },
    fields: () => [AGE_FIELD("40"), { id: "peak", label: "Pic mesuré (facultatif)", unit: "bpm", def: "" }],
    ask: {},
    plain: true,
    compute: v => pos(v.peak) && v.peak < 260 ? { hrMax: Math.round(v.peak) } : v.age >= 10 && v.age < 100 ? { hrMax: fcMaxFormulas(v.age).tanaka } : null,
    // Seul un pic mesuré devient un résultat de test : une formule reste une moyenne d'âge.
    persist: v => pos(v.peak) && v.peak < 260 ? { hrMax: Math.round(v.peak) } : null,
    metric: () => "hrMax",
    formula: () => "Tanaka : FC max = 208 − 0,7 × âge",
    detail: (v, { choice }) => {
      const hasPeak = pos(v.peak) && v.peak < 260;
      if (!(v.age >= 10 && v.age < 100)) return hasPeak ? { big: { label: "Ta FC max", value: `${Math.round(v.peak)} bpm`, note: "ton pic mesuré, plus fiable que toute formule" }, summary: "Ajoute ton âge pour comparer aux formules" } : null;
      const f = fcMaxFormulas(v.age);
      const rows = [["Tanaka", `${f.tanaka} bpm`, "la plus utilisée en recherche"], ["Nes", `${f.nes} bpm`, "adultes actifs, testés au maximum"],
        ...(choice !== "h" ? [["Gulati", `${f.gulati} bpm`, "établie chez les femmes"]] : []), ["220 − âge", `${f.fox} bpm`, "la plus connue, la moins précise après 40 ans"]];
      const d = hasPeak ? Math.round(v.peak - f.tanaka) : 0;
      return {
        big: hasPeak ? { label: "Ta FC max", value: `${Math.round(v.peak)} bpm`, note: "ton pic mesuré, plus fiable que toute formule" } : { label: "Ta FC max estimée", value: `${f.tanaka} bpm`, note: `probablement entre ${f.tanaka - 11} et ${f.tanaka + 11} bpm` },
        summary: "Selon les formules",
        lines: hasPeak ? [`Ton pic est ${d >= 0 ? `${d} bpm au-dessus` : `${-d} bpm en dessous`} de la formule de Tanaka.`] : undefined,
        table: { head: ["Formule", "FC max", "Pour qui"], rows, hl: hasPeak ? -1 : 0 },
      };
    },
  },
  zones: {
    key: "zones",
    cta: "Mieux doser mes séances",
    title: "Zones cardiaques Karvonen : tes 5 zones en bpm",
    description: "Tes 5 zones d'entraînement calculées sur ta réserve cardiaque (FC max − FC de repos).",
    heading: "Zones cardiaques",
    wpPath: "/calculateur-de-zones-cardiaques-methode-karvonen/",
    fields: () => [AGE_FIELD("30"), { id: "rest", label: "FC de repos", unit: "bpm", def: "60" }, { id: "max", label: "FC max mesurée (facultatif)", unit: "bpm", def: "" }],
    ask: {},
    plain: true,
    compute: v => { const k = karvonen(v.age, v.rest, v.max); return k ? { hrRest: Math.round(v.rest) } : null; },
    persist: v => { const k = karvonen(v.age, v.rest, v.max); return k ? { hrRest: Math.round(v.rest), ...(k.measured ? { hrMax: Math.round(k.max) } : {}) } : null; },
    metric: () => "hrRest",
    formula: () => "FC cible = (FC max − FC repos) × % + FC repos",
    detail: v => {
      const k = karvonen(v.age, v.rest, v.max);
      if (!k) return null;
      return {
        big: { label: "Ta réserve cardiaque", value: `${k.reserve} bpm`, note: k.measured ? `FC max mesurée : ${k.max} bpm, repos ${Math.round(v.rest)} bpm` : `FC max estimée (220 − ${Math.round(v.age)} ans) : ${k.max} bpm, à ±10-12 bpm près` },
        summary: "Tes 5 zones",
        // Ta cible en 2e colonne : sur mobile, le tableau défile et la cible doit rester visible.
        table: { head: ["Zone", "Ta cible", "% réserve", "À quoi elle sert"], rows: k.zones.map((z, i) => [`Z${i + 1} · ${z.name}`, `${z.low}–${z.high} bpm`, `${Math.round(z.a * 100)}-${Math.round(z.b * 100)} %`, z.desc]), hl: -1 },
      };
    },
  },
  zone2: {
    key: "zone2",
    cta: "Progresser en endurance",
    title: "Calculer sa zone 2 en bpm",
    description: "Ta zone 2 en battements par minute, avec ta FC au réveil (Karvonen 60-70 %), comparée au % de FC max et à Maffetone.",
    heading: "Zone 2",
    wpPath: "/pourquoi-lentrainement-en-zone-2-est-la-base-pour-progresser-en-endurance/",
    fields: () => [AGE_FIELD("35"), { id: "rest", label: "FC au réveil", unit: "bpm", def: "55" }, { id: "max", label: "FC max mesurée (facultatif)", unit: "bpm", def: "" }],
    ask: {},
    plain: true,
    compute: v => zone2(v.age, v.rest, v.max) ? { hrRest: Math.round(v.rest) } : null,
    persist: v => { const z = zone2(v.age, v.rest, v.max); return z ? { hrRest: Math.round(v.rest), ...(z.measured ? { hrMax: Math.round(z.max) } : {}) } : null; },
    metric: () => "hrRest",
    formula: () => "Zone 2 = (FC max − FC repos) × 60 à 70 % + FC repos",
    detail: v => {
      const z = zone2(v.age, v.rest, v.max);
      if (!z) return null;
      return {
        big: { label: "Ta zone 2", value: `${z.kl} à ${z.kh} bpm`, note: (z.measured ? `FC max mesurée : ${z.max} bpm` : `FC max estimée à ${z.max} bpm (à environ 11 bpm près)`) + `, FC au réveil ${Math.round(v.rest)} bpm` },
        summary: "Selon la méthode",
        table: {
          head: ["Méthode", "Zone 2", "À savoir"],
          rows: [["Réserve cardiaque (Karvonen)", `${z.kl} à ${z.kh} bpm`, "tient compte de ton cœur au repos"], ["% de FC max", `${z.pl} à ${z.ph} bpm`, "souvent trop basse chez les sportifs entraînés"],
            ...(z.maf != null ? [["Maffetone", `${z.maf} bpm au plus`, "règle d'entraîneur, non validée"]] : [])],
          hl: 0,
        },
      };
    },
  },
  vfc: {
    key: "vfc",
    cta: "Suivre ma récupération",
    title: "VFC normale selon l'âge : situe ta VFC du matin",
    description: "Ta VFC (RMSSD) de ce matin comparée à la médiane de ton âge et de ton sexe (étude Lifelines), puis à ta propre moyenne.",
    heading: "VFC selon l'âge",
    wpPath: "/la-variabilite-de-la-frequence-cardiaque-et-lage/",
    choice: { label: "Sexe", options: [{ value: "m", label: "Homme" }, { value: "w", label: "Femme" }] },
    fields: () => [AGE_FIELD("32"), { id: "today", label: "Ta VFC ce matin", unit: "ms", def: "24" }, { id: "usual", label: "Ta moyenne habituelle (facultatif)", unit: "ms", def: "30" }],
    ask: {},
    plain: true,
    compute: v => hrvRead(v.age, v.today, v.usual, "m") ? { hrv: Math.round(v.today * 10) / 10 } : null,
    metric: () => "hrv",
    formula: () => "Médiane RMSSD de ton âge (Lifelines, ECG de 10 s au repos)",
    detail: (v, { choice }) => {
      const h = hrvRead(v.age, v.today, v.usual, choice);
      if (!h) return null;
      // La page WordPress montre déjà le tableau juste au-dessus : ici, la position de CE sportif, sans le répéter.
      const e = h.perso.ecart;
      return {
        big: { label: "Ta VFC ce matin", value: `${f1(v.today)} ms`, note: `${h.where.charAt(0).toUpperCase()}${h.where.slice(1)} la médiane de ton âge (${f1(h.med)} ms)` },
        summary: e == null ? "Ajoute ta moyenne pour décider de ta séance" : `Face à ta moyenne : ${e > 0 ? "+" : ""}${e} %, ${h.perso.head.toLowerCase()}`,
        lines: [h.popLine, h.perso.text],
      };
    },
  },
  bronco: {
    key: "bronco",
    cta: "Améliorer mon Bronco",
    title: "Bronco test : situe ton temps face aux joueurs pros",
    description: "Ton temps au Bronco test (5 × 20-40-60 m, 1 200 m) face aux moyennes Super Rugby par sexe et par poste (Weakley et al. 2026).",
    heading: "Bronco test",
    wpPath: "/comment-ameliorer-son-bronco-test/",
    choice: { label: "Ton groupe", options: BRONCO_GROUPS.map(g => ({ value: g.id, label: g.label })) },
    fields: () => [{ id: "min", label: "Minutes", unit: "min", def: "5" }, { id: "sec", label: "Secondes", unit: "s", def: "45" }],
    ask: {},
    plain: true,
    compute: v => { const t = broncoSeconds(v.min, v.sec); return t == null ? null : { bronco: t }; },
    metric: () => "bronco",
    formula: () => "Temps total des 5 séries de navettes 20, 40 et 60 m (1 200 m)",
    detail: (v, { choice }) => {
      const t = broncoSeconds(v.min, v.sec);
      if (t == null) return null;
      const g = BRONCO_GROUPS.find(x => x.id === choice) ?? BRONCO_GROUPS[0];
      const d = t - g.mean;
      const vs = `la moyenne des ${g.short} pros (${mmss(g.mean)})`;
      const note = d === 0 ? `Pile sur ${vs}` : d > 0 ? `${mmss(d)} de plus que ${vs}` : `${mmss(-d)} plus rapide que ${vs}`;
      return {
        big: { label: "Ton Bronco", value: mmss(t), note },
        summary: "Moyennes Super Rugby sur 10 ans",
        table: { head: ["Groupe", "Hommes", "Femmes"], rows: [
          ["Avants", mmss(321), mmss(398)], ["Trois-quarts", mmss(297), mmss(352)], ["Tous postes", mmss(311), mmss(379)],
        ], hl: g.row },
        lines: ["Joueurs pros : un amateur part en général plus haut. Compare-toi surtout à ton test précédent. Weakley et al., JSCR 2026."],
      };
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
