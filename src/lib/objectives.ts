/* Objectifs (22/11/2026, POC « Ta stratégie » Pd5wUyWL, table caps-par-sport.md) : jusqu'à 3 objectifs
   mesurables, une seule échéance pour tous. Un objectif = un repère que l'app mesure déjà (test ou charge
   max estimée, régularité, récupération par rapport à sa norme, forme) + une cible relative au départ.
   Stockage v1 : user_metadata.objectives (local, aucune migration) ; à passer en table avant la prod
   pour que le coach les voie. Les cibles sont des ordres de grandeur à valider (voir caps-par-sport.md). */

import { WEAKNESSES_BY_SPORT } from "@/lib/sportCategories";
import { weaknessKeyFor } from "@/lib/sportCatalog";
import { canonicalMetricKey, METRIC_DISPLAY, type MetricKey } from "@/lib/testNorms";
import { estimateOneRepMax } from "@/lib/strengthProfile";
import { formPercentSeries, sessionLoad, daysAgoStr, type LoadPoint } from "@/lib/trainingLoad";
import { relativeWellnessByDate } from "@/lib/wellnessBaseline";
import type { TestRow, TestResultRow, StrengthRepRow } from "@/lib/testResults";
import type { WellnessDaily } from "@/types";
import { METRIC_QUALITY, QUALITY_META, type Quality } from "@/lib/testQualities";
import { sportBatteryTestNames, batteryTestMetrics } from "@/lib/testProfile";

export const MAX_OBJECTIVES = 3;

export type ObjectiveMeasure =
  | { kind: "metric"; metric: MetricKey; gainPct?: number; gainAbs?: number }
  | { kind: "regularity" }
  | { kind: "recovery" }
  | { kind: "forme" };

export interface ObjectiveDef { id: string; label: string; measure: ObjectiveMeasure; defaultWeeks: number }

/* Un objectif suivi : son départ et SON échéance (22/11 : échéances différentes par objectif). */
export interface ObjectiveItem { id: string; start: string; deadline: string }
/* Ancien format (une échéance commune) lu pour compatibilité. */
export interface ObjectivesState { start: string; deadline: string; ids?: string[] }

export function normalizeObjectives(raw: unknown): ObjectiveItem[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { items?: ObjectiveItem[]; start?: string; deadline?: string; ids?: string[] };
  if (Array.isArray(r.items)) return r.items.filter(i => i && i.id && i.start && i.deadline).slice(0, 3);
  if (Array.isArray(r.ids) && r.start && r.deadline) return r.ids.slice(0, 3).map(id => ({ id, start: r.start!, deadline: r.deadline! }));
  return [];
}

/* Plus bas = mieux (temps). */
const LOWER_IS_BETTER = new Set<MetricKey>(["sprint10m", "sprint30m", "sprint20m", "sprint60m", "sprint100m", "sprint200m", "fly10m", "fly20m", "fly30m", "time5k", "time10k", "timeSemi", "timeMarathon", "bronco", "test505", "illinoisAgility", "proAgility"]);
export const lowerIsBetter = (m: MetricKey) => LOWER_IS_BETTER.has(m);

/* Le nom affiché d'un objectif-test est le nom du test (23/11, Gildas : pas de « plus lourd » partout). */
const M = (metric: MetricKey, _label: string, gainPct: number, weeks: number): ObjectiveDef =>
  ({ id: `metric:${metric}`, label: METRIC_DISPLAY[metric]?.name ?? _label, measure: { kind: "metric", metric, gainPct }, defaultWeeks: weeks });
const MA = (metric: MetricKey, _label: string, gainAbs: number, weeks: number): ObjectiveDef =>
  ({ id: `metric:${metric}`, label: METRIC_DISPLAY[metric]?.name ?? _label, measure: { kind: "metric", metric, gainAbs }, defaultWeeks: weeks });

export const REGULARITY: ObjectiveDef = { id: "regularity", label: "Tenir ton rythme de séances", measure: { kind: "regularity" }, defaultWeeks: 6 };
export const RECOVERY: ObjectiveDef = { id: "recovery", label: "Mieux récupérer", measure: { kind: "recovery" }, defaultWeeks: 4 };
export const FORME: ObjectiveDef = { id: "forme", label: "Arriver au top le jour J", measure: { kind: "forme" }, defaultWeeks: 12 };

/* Famille WEAKNESSES_BY_SPORT → point faible (clé) → objectif. */
const BY_WEAKNESS: Record<string, Record<string, ObjectiveDef>> = {
  "Haltérophilie": { arrache: M("snatch", "Arraché plus lourd", 3, 8), epaule_jete: M("cleanJerk", "Épaulé-jeté plus lourd", 3, 8), mobilite: MA("kneeToWall", "Chevilles plus mobiles", 2, 6), explosivite: M("cmjHeight", "Sauter plus haut", 6, 6), recuperation: RECOVERY },
  "Powerlifting": { jambes: M("backSquat", "Squat plus lourd", 3, 8), dos_bras: M("deadlift", "Soulevé de terre plus lourd", 3, 8), pecs_epaules: M("bench", "Développé couché plus lourd", 2.5, 8), technique: M("backSquat", "Squat plus lourd", 2.5, 8), recuperation: RECOVERY },
  "Musculation / Hypertrophie": { jambes: M("backSquat", "Squat plus lourd", 4, 8), dos: M("deadlift", "Soulevé de terre plus lourd", 4, 8), pectoraux: M("bench", "Développé couché plus lourd", 3, 8), epaules: M("pressOh", "Développé militaire plus lourd", 3, 8), bras: M("pressOh", "Développé militaire plus lourd", 3, 8) },
  "Athlétisme & vitesse": { vitesse: M("sprint10m", "Partir plus vite", 2, 6), endurance_vitesse: M("sprint100m", "Tenir ta vitesse", 1.5, 8), explosivite: M("cmjHeight", "Sauter plus haut", 6, 6), technique_course: M("fly30m", "Vitesse lancée", 1.5, 8), recuperation: RECOVERY },
  "Endurance": { vitesse: M("vma", "Aller plus vite", 3, 12), endurance_fond: M("time10k", "Tenir plus longtemps", 2, 12), explosivite: M("cmjHeight", "Une foulée plus réactive", 5, 6), technique_course: M("time5k", "Courir plus économe", 2, 8), recuperation: RECOVERY },
  "Sports collectifs": { puissance: M("cmjHeight", "Sauter plus haut", 6, 6), vitesse: M("sprint10m", "Partir plus vite", 2, 6), explosivite: M("dropJumpHeight", "Être plus réactif", 6, 6), gainage: M("backSquat", "Gagner en force", 4, 8), recuperation: { ...RECOVERY, label: "Récupérer entre les matchs" } },
  "Fitness / CrossFit": { cardio: M("time5k", "Tenir plus longtemps", 3, 8), force_generale: M("backSquat", "Squat plus lourd", 4, 8), technique: M("cleanJerk", "Épaulé-jeté plus lourd", 3, 8), explosivite: M("cmjHeight", "Sauter plus haut", 5, 6), recuperation: RECOVERY },
  "Arts martiaux & combat": { frappe: M("squatJumpHeight", "Frapper plus fort", 6, 6), cardio: M("time5k", "Tenir tout le combat", 3, 8), explosivite: M("cmjHeight", "Être plus explosif", 5, 6), gainage: REGULARITY, recuperation: RECOVERY },
  "Autre": { force_generale: M("backSquat", "Gagner en force", 4, 8), cardio: M("time5k", "Tenir plus longtemps", 3, 8), technique: REGULARITY, recuperation: RECOVERY },
};

export function familyFor(sport: string | null | undefined): string {
  const k = weaknessKeyFor(sport ?? null);
  return BY_WEAKNESS[k] ? k : "Autre";
}

/* Gain par défaut d'un test sans entrée dédiée, selon sa qualité (ordres de grandeur, caps-par-sport.md). */
const GAIN_BY_QUALITY: Partial<Record<Quality, [number, number]>> = { force: [4, 8], puissance: [5, 6], reactivite: [6, 6], vitesse: [2, 6], agilite: [2, 6], endurance: [3, 12] };
export function metricLabel(metric: MetricKey): string { return METRIC_DISPLAY[metric]?.name ?? metric; }
function metricDef(metric: MetricKey): ObjectiveDef {
  const q = METRIC_QUALITY[metric]?.[0];
  const [pct, weeks] = (q && GAIN_BY_QUALITY[q]) ?? [3, 8];
  return metric === "kneeToWall" ? MA(metric, "", 2, 6) : M(metric, metricLabel(metric), pct, weeks);
}

/* Tous les objectifs proposables : ceux de la famille (point faible), les tests de la batterie du sport,
   les tests déjà saisis (n'importe quel test devient un objectif : front squat d'un haltérophile…),
   puis jour J, régularité, récupération. Sans doublon. */
export function catalogFor(sport: string | null | undefined, ownTestNames: string[] = []): ObjectiveDef[] {
  const fam = familyFor(sport);
  const order = (WEAKNESSES_BY_SPORT[fam] ?? []).map(w => w.key);
  const defs = order.map(k => BY_WEAKNESS[fam][k]).filter(Boolean);
  const battery = sportBatteryTestNames(sport).flatMap(n => batteryTestMetrics(n).slice(0, 1)).map(metricDef);
  const own = ownTestNames.map(n => metricOfName(n)).filter((m): m is MetricKey => !!m).map(metricDef);
  const all = [...defs, ...battery, ...own, FORME, REGULARITY, RECOVERY];
  return all.filter((d, i) => all.findIndex(x => x.id === d.id) === i);
}

export function defById(id: string, sport?: string | null): ObjectiveDef | null {
  return catalogFor(sport).find(d => d.id === id)
    ?? Object.values(BY_WEAKNESS).flatMap(f => Object.values(f)).find(d => d.id === id)
    ?? (id.startsWith("metric:") && METRIC_DISPLAY[id.slice(7) as MetricKey] ? metricDef(id.slice(7) as MetricKey) : null);
}

/* Qualité (pour ranger la bibliothèque), photo et icônes. */
export type ObjGroup = Quality | "regularite" | "recuperation" | "echeance";
export function groupOf(def: ObjectiveDef): ObjGroup {
  const m = def.measure;
  if (m.kind === "metric") return METRIC_QUALITY[m.metric]?.[0] ?? "polyvalence";
  return m.kind === "regularity" ? "regularite" : m.kind === "recovery" ? "recuperation" : "echeance";
}
export const GROUP_LABEL: Record<ObjGroup, string> = {
  ...Object.fromEntries(Object.entries(QUALITY_META).map(([k, v]) => [k, v.label.split(" / ")[0]])) as Record<Quality, string>,
  regularite: "Régularité", recuperation: "Récupération", echeance: "Échéance",
};
export const GROUP_SUB: Partial<Record<ObjGroup, string>> = {
  force: "Plus lourd, à ressenti égal.", puissance: "Ce qui fait décoller.", reactivite: "Rebondir plus vite.", vitesse: "Partir et accélérer plus vite.",
  agilite: "Changer de direction sans perdre de vitesse.", endurance: "Tenir plus longtemps, plus vite.", mobilite: "Plus d'amplitude, moins de compensations.",
  regularite: "La base de tout le reste.", recuperation: "Ce qui se joue hors séance.", echeance: "Arriver frais le jour J.",
};
const GROUP_PHOTO: Partial<Record<ObjGroup, string>> = {
  puissance: "/illustrations/pliometrie.jpg", reactivite: "/illustrations/pliometrie.jpg", vitesse: "/illustrations/sprint.jpg", agilite: "/illustrations/sprint.jpg",
  endurance: "/illustrations/course.jpg", mobilite: "/illustrations/mobilite.jpg", regularite: "/illustrations/groupe.jpg", recuperation: "/illustrations/recuperation.jpg", echeance: "/illustrations/sprint.jpg",
};
export function photoForGroup(g: ObjGroup, sportPhoto: string): string { return g === "force" || g === "polyvalence" ? sportPhoto : GROUP_PHOTO[g] ?? sportPhoto; }
export const GROUP_ICON: Record<ObjGroup, string> = {
  force: "🏋️", puissance: "⚡", reactivite: "🔁", vitesse: "🏃", agilite: "↔️", endurance: "🫀", mobilite: "🤸", polyvalence: "🔥", regularite: "📅", recuperation: "🌙", echeance: "🎯",
};

/* ── Préparation : la part des séances attendues faites, parmi celles qui travaillent l'objectif ── */
const SERVES: Partial<Record<MetricKey, RegExp>> = {
  backSquat: /squat(?! ?(jump|saut))/i, frontSquat: /front squat|squat avant/i, deadlift: /soulev|deadlift|\brdl\b|\bsdt\b/i, bench: /couch|bench/i,
  pressOh: /militaire|overhead press|push press|d[ée]velopp[ée] [ée]paules/i, press: /militaire|press/i,
  snatch: /arrach|snatch/i, cleanJerk: /[ée]paul|jet[ée]|jerk|clean|front squat/i, clean: /[ée]paul|clean/i,
  cmjHeight: /saut|jump|pliom|bond/i, squatJumpHeight: /saut|jump|pliom|bond/i, dropJumpHeight: /saut|jump|pliom|bond|rebond/i, broadJump: /saut|jump|bond/i,
  kneeToWall: /mobilit|cheville|cosaque|cossack/i,
};
const SPRINT = /sprint|acc[ée]l[ée]ration|lanc[ée]|d[ée]part/i, RUN = /course|footing|fractionn|seuil|vma|\brun|trail|tempo|endurance/i;
export function servesObjective(def: ObjectiveDef, s: { name?: string | null; notes?: string | null }): boolean {
  const m = def.measure;
  if (m.kind !== "metric") return true;
  const text = `${s.name ?? ""}\n${s.notes ?? ""}`;
  const re = SERVES[m.metric] ?? (/^sprint|^fly/.test(m.metric) ? SPRINT : /^time|vma|vo2/.test(m.metric) ? RUN : null);
  return re ? re.test(text) : true;
}
export interface Preparation { pct: number; done: number; expected: number; onTrack: boolean; likelyDate: string | null }
export function preparation(def: ObjectiveDef, item: ObjectiveItem, sessions: ObjectiveData["sessions"], freqTarget: number, today = todayIso()): Preparation {
  const inWin = sessions.filter(s => s.date >= item.start && s.date <= today);
  const serving = inWin.filter(s => servesObjective(def, s));
  const done = serving.filter(s => s.done).length;
  const weeks = Math.max(1 / 7, (Date.parse(today) - Date.parse(item.start)) / (7 * 86400000));
  /* Attendues : celles prévues au planning qui le servent ; sans planning, ton rythme. */
  const expected = Math.max(1, serving.length || Math.round(freqTarget * weeks * (def.measure.kind === "metric" ? 0.5 : 1)));
  const pct = Math.min(100, Math.round(done / expected * 100));
  const total = Math.max(1, dayDiff(item.start, item.deadline));
  const onTrack = pct >= 85;
  const likelyDate = onTrack ? item.deadline : addDays(item.start, Math.round(total / Math.max(0.35, pct / 100)));
  return { pct, done, expected, onTrack, likelyDate };
}

/* Proposition : le point faible donné à l'inscription d'abord (ob_vecu.weak), l'échéance si l'objectif
   est « competition », puis la régularité. */
export function proposeObjectives(opts: { sport: string | null; weak?: string[] | null; goal?: string | null }): ObjectiveDef[] {
  const fam = familyFor(opts.sport);
  const fromWeak = (opts.weak ?? []).map(k => BY_WEAKNESS[fam][k]).filter(Boolean);
  const first = fromWeak[0] ?? catalogFor(opts.sport)[0];
  const list = [opts.goal === "competition" ? FORME : null, first, ...fromWeak.slice(1), REGULARITY].filter((d): d is ObjectiveDef => !!d);
  return list.filter((d, i) => list.findIndex(x => x.id === d.id) === i).slice(0, MAX_OBJECTIVES);
}

/* ── Mesure ── */
export interface ObjectivePoint { date: string; value: number }
export interface ObjectiveProgress {
  def: ObjectiveDef;
  unit: string;
  points: ObjectivePoint[];        // depuis le départ
  start: number | null;
  current: number | null;
  target: number | null;
  expectedNow: number | null;      // sur le tracé, aujourd'hui
  delta: number | null;            // current - expectedNow, signé « dans le bon sens » (> 0 = en avance)
  reached: boolean;
  lowerIsBetter: boolean;
  emptyHint: string | null;        // tant qu'il n'y a pas de départ
}

export interface ObjectiveData {
  tests: TestRow[]; results: TestResultRow[]; strengthReps: StrengthRepRow[];
  sessions: { date: string; done: boolean; rpe: number | null; duration: number | null; name?: string | null; notes?: string | null }[];
  wellness: WellnessDaily[];
  freqTarget: number;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function metricOfName(nameKey: string): MetricKey | null {
  const k = nameKey.trim().toLowerCase();
  return canonicalMetricKey(k) ?? canonicalMetricKey(k.replace(/^1\s?rm\s+/, ""));
}

export function metricPoints(metric: MetricKey, d: ObjectiveData): ObjectivePoint[] {
  const ids = new Set(d.tests.filter(t => metricOfName(t.name_key || t.name) === metric).map(t => t.id));
  /* Les résultats réels enregistrés font foi (23/11, Gildas : « mon record est 132,5 et tu affiches 134,5 »).
     La charge max estimée depuis les séries ne sert que s'il n'existe encore aucun résultat pour ce mouvement. */
  const pts: ObjectivePoint[] = d.results.filter(r => ids.has(r.test_id)).map(r => ({ date: r.date, value: Number(r.value) }));
  if (!pts.length && METRIC_DISPLAY[metric]?.unit === "kg") {
    for (const s of d.strengthReps) if (ids.has(s.test_id)) pts.push({ date: s.date, value: estimateOneRepMax({ reps: s.reps, weight: s.weight }).value });
  }
  /* Un point par jour : le meilleur du jour. */
  const lower = lowerIsBetter(metric), byDay = new Map<string, number>();
  for (const p of pts) { const v = byDay.get(p.date); if (v === undefined || (lower ? p.value < v : p.value > v)) byDay.set(p.date, p.value); }
  return Array.from(byDay, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

/* Dernière valeur par mesure (résultats + charge max estimée des séries), pour les repères de prod. */
export function latestByMetric(d: ObjectiveData): Partial<Record<MetricKey, number>> {
  const out: Partial<Record<MetricKey, number>> = {};
  const metrics = Array.from(new Set(d.tests.map(t => metricOfName(t.name_key || t.name)).filter((m): m is MetricKey => !!m)));
  for (const m of metrics) { const pts = metricPoints(m, d); if (pts.length) out[m] = pts[pts.length - 1].value; }
  return out;
}

export function measureObjective(def: ObjectiveDef, state: ObjectivesState, d: ObjectiveData, today = todayIso()): ObjectiveProgress {
  const total = Math.max(1, dayDiff(state.start, state.deadline));
  const elapsed = Math.min(total, Math.max(0, dayDiff(state.start, today)));
  const m = def.measure;
  const base = { def, points: [] as ObjectivePoint[], start: null as number | null, current: null as number | null, target: null as number | null, expectedNow: null as number | null, delta: null as number | null, reached: false, lowerIsBetter: false, emptyHint: null as string | null };

  if (m.kind === "metric") {
    const all = metricPoints(m.metric, d), lower = lowerIsBetter(m.metric);
    const before = all.filter(p => p.date <= state.start);
    const startPt = before[before.length - 1] ?? all.find(p => p.date > state.start) ?? null;
    const unit = METRIC_DISPLAY[m.metric]?.unit ?? "";
    if (!startPt) return { ...base, unit, lowerIsBetter: lower, emptyHint: "Renseigne ton 1er test" };
    const start = startPt.value;
    const gain = m.gainAbs ?? start * (m.gainPct ?? 0) / 100;
    const target = lower ? start - gain : start + gain;
    const points = [{ date: state.start, value: start }, ...all.filter(p => p.date > state.start)];
    const current = points[points.length - 1].value;
    const expectedNow = start + (target - start) * elapsed / total;
    const delta = lower ? expectedNow - current : current - expectedNow;
    return { ...base, unit, points, start, current, target, expectedNow, delta, reached: lower ? current <= target : current >= target, lowerIsBetter: lower };
  }

  if (m.kind === "regularity") {
    /* Séances faites, en cumul depuis le départ ; cible = rythme × semaines. */
    const perDay = d.freqTarget / 7, target = Math.round(perDay * total);
    const done = d.sessions.filter(s => s.done && s.date >= state.start && s.date <= today).map(s => s.date).sort();
    const points: ObjectivePoint[] = [{ date: state.start, value: 0 }];
    done.forEach((date, i) => points.push({ date, value: i + 1 }));
    const current = done.length, expectedNow = perDay * elapsed;
    return { ...base, unit: "séances", points, start: 0, current, target, expectedNow, delta: current - expectedNow, reached: current >= target };
  }

  if (m.kind === "recovery") {
    /* Récupération par rapport à sa norme (score relatif), moyenne glissante sur 7 jours. */
    const days = Math.max(28, dayDiff(addDays(state.start, -14), today) + 1);
    const map = relativeWellnessByDate(d.wellness, days);
    const dates = Object.keys(map).sort();
    const avg7 = (i: number) => { const vs = dates.slice(Math.max(0, i - 6), i + 1).map(k => map[k]).filter((v): v is number => v !== null); return vs.length >= 3 ? vs.reduce((a, b) => a + b, 0) / vs.length : null; };
    const series = dates.map((date, i) => ({ date, value: avg7(i) })).filter((p): p is ObjectivePoint => p.value !== null);
    const startPt = [...series].reverse().find(p => p.date <= state.start) ?? series.find(p => p.date > state.start) ?? null;
    if (!startPt) return { ...base, unit: "", emptyHint: "Départ après une semaine de points forme." };
    const start = startPt.value, target = Math.min(100, start + 5);
    const points = [{ date: state.start, value: start }, ...series.filter(p => p.date > state.start)];
    const current = points[points.length - 1].value, expectedNow = start + (target - start) * elapsed / total;
    return { ...base, unit: "", points, start, current, target, expectedNow, delta: current - expectedNow, reached: current >= target };
  }

  /* Forme le jour J : forme (fond moins fatigue) ; cible = fraîcheur positive à l'échéance. */
  const days = Math.max(42, dayDiff(addDays(state.start, -42), today) + 1);
  const loads: LoadPoint[] = Array.from({ length: days }, (_, i) => {
    const date = daysAgoStr(days - 1 - i);
    return { date, load: d.sessions.filter(s => s.date === date).reduce((a, s) => a + sessionLoad({ rpe: s.rpe, duration: s.duration, done: s.done }), 0) };
  });
  const fs = formPercentSeries(loads);
  const series = loads.map((p, i) => ({ date: p.date, value: fs[i].value })).filter((p): p is ObjectivePoint => p.value !== null);
  const startPt = [...series].reverse().find(p => p.date <= state.start) ?? series[0] ?? null;
  if (!startPt) return { ...base, unit: "%", emptyHint: "Départ après deux semaines de séances notées." };
  const start = startPt.value, target = 10;
  const points = [{ date: state.start, value: start }, ...series.filter(p => p.date > state.start)];
  const current = points[points.length - 1].value;
  return { ...base, unit: "%", points, start, current, target, expectedNow: null, delta: null, reached: today >= state.deadline && current >= target };
}

/* ── Affichage ── */
export function fmtValue(v: number, unit: string): string {
  const n = (x: number, d: number) => x.toFixed(d).replace(".", ",").replace(/,0+$/, "");
  if (unit === "kg") return `${n(Math.round(v * 2) / 2, 1)} kg`;
  if (unit === "s") return `${n(v, 2)} s`;
  if (unit === "min") { const m = Math.floor(v), s = Math.round((v - m) * 60); return `${m} min ${String(s).padStart(2, "0")}`; }
  if (unit === "séances") return `${Math.round(v)} séance${Math.round(v) > 1 ? "s" : ""}`;
  if (unit === "%") return `${Math.round(v)} %`;
  if (unit === "") return `${Math.round(v)}`;
  return `${n(v, unit === "m" ? 2 : 1)} ${unit}`;
}

export function deltaLine(p: ObjectiveProgress): string | null {
  if (p.def.measure.kind === "forme") return p.current === null ? null : `Forme ${p.current > 0 ? "+" : ""}${Math.round(p.current)} %`;
  if (p.delta === null || p.current === null || p.target === null || p.start === null) return null;
  const span = Math.abs(p.target - p.start) || 1;
  if (Math.abs(p.delta) < span * 0.08) return "Dans le couloir";
  const abs = Math.abs(p.delta);
  const txt = p.unit === "séances" ? `${Math.round(abs)} séance${Math.round(abs) > 1 ? "s" : ""}` : fmtValue(abs, p.unit).trim();
  return p.delta > 0 ? `${txt} d'avance` : `${txt} de retard`;
}

export const OBJ_EXAMPLE_PHOTO: Record<ObjectiveMeasure["kind"], string> = {
  metric: "", regularity: "/onboarding/vecu/p_groupe.webp", recovery: "/onboarding/vecu/p_decroche.webp", forme: "/onboarding/vecu/p_sprint.webp",
};

/* ── Liste des tests, même composition que TestsPanel (prod) : par filtre de qualité, tests interprétés
   (repère, du plus faible au plus fort), tests saisis sans repère, puis tests recommandés de toutes les
   batteries non encore couverts. Avec le verdict (recommandation) de la vue. ── */
import { computeAllInsights, computeCrossFamilyInsights, computeAllFamiliesInsights, type CardInsight } from "@/lib/testNorms";
import { cmjHaugenInsight, buildTestProfile, buildAxisVerdict, buildQualityVerdict } from "@/lib/testProfile";
import { TEST_BATTERIES } from "@/lib/testBattery";
import { BATTERY_TEST_QUALITY } from "@/lib/testQualities";
import { guessSportChip } from "@/lib/sportCategories";

const SECONDARY_ONLY = new Set<MetricKey>(["dropJumpContact"]);
export interface TestLibrary { metrics: MetricKey[]; insights: CardInsight[]; verdict: { title: string; line: string } | null }
export function testLibrary(opts: { sport: string | null; sexe: "homme" | "femme" | null; poidsKg: number | null; latest: Partial<Record<MetricKey, number>>; quality: Quality | null }): TestLibrary {
  const { sport, sexe, poidsKg, latest, quality } = opts;
  const fam = sport ? guessSportChip(sport) : null;
  const haugen = cmjHaugenInsight(sport, sexe, latest.cmjHeight ?? null);
  const card = [...computeAllInsights(fam, sexe, poidsKg, latest), ...(haugen ? [haugen] : []), ...computeCrossFamilyInsights(fam, sexe, poidsKg, latest)];
  const filtered = quality ? [...computeAllFamiliesInsights(sexe, poidsKg, latest), ...(haugen ? [haugen] : [])].filter(i => METRIC_QUALITY[i.primaryMetric]?.includes(quality)) : card;
  const bestScore = new Map<MetricKey, number | null>();
  for (const i of filtered) { const prev = bestScore.get(i.primaryMetric); if (prev === undefined || (i.score != null && (prev == null || i.score < prev))) bestScore.set(i.primaryMetric, i.score); }
  const interpreted = Array.from(bestScore.entries()).sort((a, b) => (a[1] ?? 999) - (b[1] ?? 999)).map(([m]) => m);
  const covered = new Set(interpreted);
  const logged = (Object.keys(latest) as MetricKey[]).filter(m => !covered.has(m) && !SECONDARY_ONLY.has(m) && (!quality || METRIC_QUALITY[m]?.includes(quality)));
  logged.forEach(m => covered.add(m));
  const recommended: MetricKey[] = [];
  for (const b of Object.values(TEST_BATTERIES)) for (const t of b.tests) {
    if (quality && !BATTERY_TEST_QUALITY[t.name]?.includes(quality)) continue;
    const m = batteryTestMetrics(t.name)[0];
    if (!m || covered.has(m) || SECONDARY_ONLY.has(m)) continue;
    covered.add(m); recommended.push(m);
  }
  const profile = buildTestProfile(card);
  const v = quality ? (profile.verdictOn ? buildQualityVerdict(filtered, quality, QUALITY_META[quality].label) : null) : buildAxisVerdict(profile);
  return { metrics: [...interpreted, ...logged, ...recommended], insights: filtered, verdict: v ? { title: v.title, line: `${v.emoji} ${v.action} :${v.focus ? ` ${v.focus}.` : ""} ${v.sub}` } : null };
}

/* Ce que compte « N séances … » d'un objectif, en mots concrets (23/11, Gildas : « séances qui comptent » pas clair). */
const SERVE_WORDS: Partial<Record<MetricKey, string>> = {
  backSquat: "avec du squat", frontSquat: "avec du front squat", deadlift: "avec du soulevé de terre", bench: "avec du développé couché",
  pressOh: "avec du développé militaire", press: "avec du développé militaire", snatch: "avec de l'arraché", cleanJerk: "avec de l'épaulé-jeté", clean: "avec de l'épaulé",
  cmjHeight: "avec des sauts", squatJumpHeight: "avec des sauts", dropJumpHeight: "avec des sauts", broadJump: "avec des sauts", kneeToWall: "avec de la mobilité",
};
export function servedSessionsText(def: ObjectiveDef, n: number): string {
  const s = `${n} séance${n > 1 ? "s" : ""}`;
  const m = def.measure;
  if (m.kind !== "metric") return m.kind === "regularity" ? `${s} faite${n > 1 ? "s" : ""}` : `${s} faite${n > 1 ? "s" : ""}`;
  const w = SERVE_WORDS[m.metric] ?? (/^sprint|^fly/.test(m.metric) ? "avec des sprints" : /^time|vma|vo2/.test(m.metric) ? "de course" : `avec du ${def.label.toLowerCase()}`);
  return `${s} ${w}`;
}

/** Point faible du générateur qui travaille cette mesure, pour le sport (P3, 24/11) : pré-remplit « un
    programme fait pour cet objectif ». null si aucun point faible du sport ne la vise. */
export function weaknessForMetric(sport: string | null | undefined, metric: MetricKey): string | null {
  const fam = familyFor(sport);
  const entry = Object.entries(BY_WEAKNESS[fam] ?? {}).find(([, d]) => d.measure.kind === "metric" && d.measure.metric === metric);
  return entry ? entry[0] : null;
}
