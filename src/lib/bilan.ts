/* Bilan (2026-10-23, POC canvas Qx548NQG7ZrWgwQA28DYpp) — carrousel « ce que tes données ont appris »,
   par période (semaine, mois, depuis le début). Un écran par thème, chacun avec son seuil de données :
   sous le seuil, l'écran saute (jamais de chiffre creux ni inventé).

   Deux familles d'écrans :
   - les écrans DE LA PÉRIODE (régularité, charge, tendance, tests) ne lisent que la période ;
   - les écrans APPRIS (ce qui te prédit, tes biais, ce qui te fatigue, tes leviers, ressenti vs montre)
     lisent tout l'historique jusqu'à la fin de la période : une semaine seule n'a jamais assez de
     matière pour une corrélation honnête. La semaine n'en garde que 2.

   Historique synthétique de l'onboarding exclu (ligne datée avant l'inscription ET créée dans la
   demi-heure qui suit) : il ne doit jamais apparaître comme une vraie séance dans un bilan.

   Wording validé par Gildas : « soirée (alcool ou sortie) », « se paie le lendemain ». */

import { acwrSeries, sessionLoad, type LoadPoint } from "@/lib/trainingLoad";

export type BilanPeriodKind = "week" | "month" | "all";
export type BilanPeriod = { kind: BilanPeriodKind; start: string; end: string };

export type BilanSession = { date: string; name: string | null; rpe: number | null; target_difficulty: number | null; duration: number | null; done: boolean; created_at?: string | null };
export type BilanCheckin = {
  date: string; sleep: number; stress: number; recovery: number; motivation: number;
  score: number | null; behaviors: string[] | null; bedtime: string | null;
  device_sleep_minutes: number | null; device_hrv_ms: number | null; created_at?: string | null;
};
export type BilanTest = { name: string; unit: string; date: string; value: number };

export type Bar = { label: string; value: number; display: string; highlight?: boolean };
export type Compare = { label: string; part: number; total: number; highlight?: boolean };

export type BilanSlide =
  | { kind: "regularite"; sessions: number; checkins: number; days: number; noGap: boolean; bars: Bar[] }
  | { kind: "charge"; pctInZone: number; daysHigh: number; daysCounted: number }
  | { kind: "ressenti"; sleepBars: Bar[]; crashes: number; crashesSeen: number }
  | { kind: "predit"; blocks: { title: string; rows: Compare[] }[] }
  | { kind: "biais"; name: string; harder: number; total: number; points: { label: string; planned: number; felt: number }[]; accurate: { name: string; ok: number; total: number } | null }
  | { kind: "fatigue"; soirees: number; normScore: number; nextScore: number; afterScore: number | null; hrv: { norm: number; next: number } | null; hard: { easy: number; hard: number } | null }
  | { kind: "leviers"; rows: { label: string; with: string; without: string; delta: string; positive: boolean }[]; unit: "sleep" | "score" }
  | { kind: "tendance"; months: Bar[]; lateNights: Bar[] | null; direction: "down" | "up" | "stable" }
  | { kind: "tests"; main: { name: string; unit: string; points: { date: string; value: number }[]; pct: number }; others: { name: string; from: string; to: string; pct: number }[] }
  | { kind: "partage"; kpis: { value: string; label: string }[]; line: string | null };

export type Bilan = { period: BilanPeriod; slides: BilanSlide[]; title: string };

const SOIREE = new Set(["alcohol", "social_out"]);
const SOIREE_WIDE = new Set(["alcohol", "social_out", "tobacco"]);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hm = (m: number) => { const t = Math.round(m); return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, "0")}`; };
const isSoiree = (c: BilanCheckin) => (c.behaviors ?? []).some(b => SOIREE.has(b));
const declared = (c: BilanCheckin) => (c.sleep + (11 - c.stress) + c.recovery + c.motivation) / 4;

/* Lundi ISO d'une date. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function periodFor(kind: BilanPeriodKind, anchor: string, since: string): BilanPeriod {
  if (kind === "week") { const s = mondayOf(anchor); return { kind, start: s, end: addDays(s, 6) }; }
  if (kind === "month") {
    const s = anchor.slice(0, 7) + "-01";
    const d = new Date(s + "T12:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return { kind, start: s, end: d.toISOString().slice(0, 10) };
  }
  return { kind, start: since, end: anchor };
}

/* Historique généré à l'inscription : daté avant le jour d'inscription et créé dans la demi-heure. */
export function isSynthetic(row: { date: string; created_at?: string | null }, signupAt: string): boolean {
  if (!row.created_at) return false;
  const signupDay = signupAt.slice(0, 10);
  return row.date < signupDay && new Date(row.created_at).getTime() <= new Date(signupAt).getTime() + 30 * 60000;
}

const EMOJI = /[\u2600-\u27BF\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g;

/* Nom de séance normalisé pour regrouper les séances d'un même type (« SN 🏋️🦵 », « SN/ FS »…). */
function sessionKey(name: string | null): string | null {
  if (!name) return null;
  const k = name
    .replace(/\(.*?\)/g, "")
    .replace(EMOJI, "")
    .replace(/\s*[-–·].*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!k || k.startsWith("séance du jour")) return null;
  return k;
}
const displayName = (name: string) => name.replace(/\(.*?\)/g, "").replace(EMOJI, "").replace(/\s*[-–·].*$/, "").replace(/\s+/g, " ").trim();

type Joined = { s: BilanSession; c: BilanCheckin | undefined; gap: number };

function regularite(period: BilanPeriod, sessions: BilanSession[], checkins: BilanCheckin[], today: string): BilanSlide | null {
  const end = period.end < today ? period.end : today;
  const days = daysBetween(period.start, end) + 1;
  const ss = sessions.filter(s => s.date >= period.start && s.date <= end);
  const cs = checkins.filter(c => c.date >= period.start && c.date <= end);
  if (ss.length + cs.length === 0) return null;
  let bars: Bar[];
  let noGap = false;
  if (period.kind === "week") {
    const L = ["L", "M", "M", "J", "V", "S", "D"];
    bars = L.map((label, i) => {
      const d = addDays(period.start, i);
      const load = ss.filter(s => s.date === d).reduce((a, s) => a + sessionLoad(s), 0);
      return { label, value: load, display: load ? String(Math.round(load)) : "" };
    });
  } else {
    const weeks: Bar[] = [];
    for (let m = mondayOf(period.start); m <= end; m = addDays(m, 7)) {
      const load = ss.filter(s => s.date >= m && s.date <= addDays(m, 6)).reduce((a, s) => a + sessionLoad(s), 0);
      weeks.push({ label: period.kind === "month" ? `${Number(m.slice(8))}/${Number(m.slice(5, 7))}` : MONTHS[Number(m.slice(5, 7)) - 1], value: load, display: String(Math.round(load)) });
    }
    while (weeks.length && weeks[0].value === 0) weeks.shift();
    bars = weeks;
    noGap = weeks.length >= 3 && weeks.every(w => w.value > 0);
  }
  return { kind: "regularite", sessions: ss.length, checkins: cs.length, days, noGap, bars };
}

function charge(period: BilanPeriod, sessions: BilanSession[], today: string): BilanSlide | null {
  const end = period.end < today ? period.end : today;
  const from = addDays(period.start, -42);
  const series: LoadPoint[] = [];
  for (let d = from; d <= end; d = addDays(d, 1)) {
    series.push({ date: d, load: sessions.filter(s => s.date === d).reduce((a, s) => a + sessionLoad(s), 0) });
  }
  const ac = acwrSeries(series);
  const inPeriod = ac.filter((_, i) => series[i].date >= period.start && ac[i].value !== null);
  if (inPeriod.length < (period.kind === "week" ? 5 : 10)) return null;
  const inZone = inPeriod.filter(p => p.value! >= 0.8 && p.value! <= 1.3).length;
  const high = inPeriod.filter(p => p.value! > 1.5).length;
  return { kind: "charge", pctInZone: Math.round(100 * inZone / inPeriod.length), daysHigh: high, daysCounted: inPeriod.length };
}

function ressenti(checkins: BilanCheckin[]): BilanSlide | null {
  const withSleep = checkins.filter(c => c.device_sleep_minutes && c.device_sleep_minutes > 120);
  if (withSleep.length < 14) return null;
  const sleepBars: Bar[] = [];
  for (let n = 1; n <= 10; n++) {
    const v = withSleep.filter(c => c.sleep === n).map(c => c.device_sleep_minutes!);
    if (v.length >= 3) sleepBars.push({ label: `noté ${n}`, value: mean(v), display: hm(mean(v)).replace(" h ", "h") });
  }
  if (sleepBars.length < 3) return null;
  // Le claim « ton ressenti vaut une montre » n'est montré que si la note suit vraiment la mesure.
  const increasing = sleepBars.every((b, i) => i === 0 || b.value >= sleepBars[i - 1].value - 10);
  if (!increasing) return null;
  sleepBars[sleepBars.length - 1].highlight = true;
  const hrv = checkins.filter(c => c.device_hrv_ms);
  let crashes = 0, crashesSeen = 0;
  if (hrv.length >= 14) {
    const hv = hrv.map(c => c.device_hrv_ms!);
    const m = mean(hv), sd = Math.sqrt(mean(hv.map(x => (x - m) ** 2)));
    const dm = mean(hrv.map(declared));
    for (const c of hrv) if ((c.device_hrv_ms! - m) / sd < -1) { crashes++; if (declared(c) < dm) crashesSeen++; }
  }
  return { kind: "ressenti", sleepBars, crashes, crashesSeen };
}

/* Famille de séance par mots-clés du nom : un même signal (sommeil, stress) ne pèse pas pareil sur un
   sprint et sur une séance de force, mélanger les deux dilue tout (constaté sur les données de Gildas). */
const CARDIO = /sprint|speed|vitesse|acc[ée]l|course|run|footing|fraction|vma|seuil|tempo|v[ée]lo|natation|trail|endurance|cardio|hyrox|rameur/i;
const familyOf = (name: string | null): "cardio" | "force" => CARDIO.test(name ?? "") ? "cardio" : "force";
const FAMILY_LABEL = { cardio: "Sprints et cardio", force: "Force et technique" } as const;

function predit(joined: Joined[]): BilanSlide | null {
  const all = joined.filter(j => j.c);
  if (all.length < 15) return null;
  type Cand = { title: string; rows: Compare[]; diff: number };
  const cands: Cand[] = [];
  for (const fam of ["cardio", "force"] as const) {
    const usable = all.filter(j => familyOf(j.s.name) === fam);
    if (usable.length < 12) continue;
    const split = (what: string, lowLabel: string, highLabel: string, isLow: (j: Joined) => boolean | null) => {
      const title = `${FAMILY_LABEL[fam]} · ${what}`;
      const lo = usable.filter(j => isLow(j) === true), hi = usable.filter(j => isLow(j) === false);
      if (lo.length < 5 || hi.length < 5) return;
      const hl = lo.filter(j => j.gap > 0).length, hh = hi.filter(j => j.gap > 0).length;
      const diff = hl / lo.length - hh / hi.length;
      if (diff < 0.2) return;
      cands.push({ title, diff, rows: [{ label: lowLabel, part: hl, total: lo.length, highlight: true }, { label: highLabel, part: hh, total: hi.length }] });
    };
    split("ton stress mental", "Stress noté 4 ou plus", "Stress noté 3 ou moins", j => j.c!.stress >= 4);
    split("ton sommeil noté", "Sommeil noté 6 ou moins", "Sommeil noté 7 ou plus", j => j.c!.sleep <= 6);
    split("ta récup notée", "Récup notée 6 ou moins", "Récup notée 7 ou plus", j => j.c!.recovery <= 6);
    split("ta motivation", "Motivation 6 ou moins", "Motivation 7 ou plus", j => j.c!.motivation <= 6);
    split("ta nuit mesurée", "Nuit sous 7 h 20", "Nuit de 7 h 20 et plus", j => j.c!.device_sleep_minutes ? j.c!.device_sleep_minutes < 440 : null);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.diff - a.diff);
  // Au plus un signal par famille : « tes sprints écoutent ta nuit, ton haltéro ton stress ».
  const picked: Cand[] = [];
  for (const c of cands) if (!picked.some(p => p.title.split(" · ")[0] === c.title.split(" · ")[0]) && picked.length < 2) picked.push(c);
  return { kind: "predit", blocks: picked.map(({ title, rows }) => ({ title, rows })) };
}

function biais(joined: Joined[]): BilanSlide | null {
  const groups = new Map<string, Joined[]>();
  for (const j of joined) { const k = sessionKey(j.s.name); if (!k) continue; groups.set(k, [...(groups.get(k) ?? []), j]); }
  let best: { name: string; js: Joined[]; share: number } | null = null;
  let accurate: { name: string; ok: number; total: number } | null = null;
  for (const js of Array.from(groups.values())) {
    const harder = js.filter(j => j.gap > 0).length;
    const share = harder / js.length;
    if (js.length >= 3 && harder >= 3 && share >= 0.7 && (!best || share > best.share || (share === best.share && js.length > best.js.length))) best = { name: displayName(js[0].s.name!), js, share };
    const ok = js.filter(j => j.gap <= 0).length;
    if (js.length >= 6 && ok / js.length >= 0.8 && (!accurate || js.length > accurate.total)) accurate = { name: displayName(js[0].s.name!), ok, total: js.length };
  }
  if (!best) return null;
  const pts = best.js.slice(-9).map(j => ({ label: `${Number(j.s.date.slice(8))}/${Number(j.s.date.slice(5, 7))}`, planned: j.s.target_difficulty!, felt: j.s.rpe! }));
  if (accurate && accurate.name === best.name) accurate = null;
  return { kind: "biais", name: best.name, harder: best.js.filter(j => j.gap > 0).length, total: best.js.length, points: pts, accurate };
}

function fatigue(checkins: BilanCheckin[], sessions: BilanSession[]): BilanSlide | null {
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const soirees = checkins.filter(isSoiree).filter(c => c.score !== null);
  if (soirees.length < 3) return null;
  const normal = checkins.filter(c => !(c.behaviors ?? []).some(b => SOIREE_WIDE.has(b)) && c.score !== null);
  if (normal.length < 10) return null;
  const normScore = mean(normal.map(c => c.score!));
  const nextScore = mean(soirees.map(c => c.score!));
  const after = soirees.map(c => byDate.get(addDays(c.date, 1))).filter((c): c is BilanCheckin => !!c && c.score !== null && !isSoiree(c));
  const afterScore = after.length >= 3 ? mean(after.map(c => c.score!)) : null;
  const sh = soirees.filter(c => c.device_hrv_ms), nh = normal.filter(c => c.device_hrv_ms);
  const hrv = sh.length >= 3 && nh.length >= 10 ? { norm: mean(nh.map(c => c.device_hrv_ms!)), next: mean(sh.map(c => c.device_hrv_ms!)) } : null;
  const nextAfter = (rpeOk: (r: number) => boolean) => sessions
    .filter(s => s.rpe !== null && rpeOk(s.rpe))
    .map(s => byDate.get(addDays(s.date, 1)))
    .filter((c): c is BilanCheckin => !!c && c.score !== null && !(c.behaviors ?? []).some(b => SOIREE_WIDE.has(b)))
    .map(c => c.score!);
  const hardS = nextAfter(r => r >= 8), easyS = nextAfter(r => r < 8);
  const hard = hardS.length >= 5 && easyS.length >= 5 ? { easy: mean(easyS), hard: mean(hardS) } : null;
  if (normScore - nextScore < 5) return null;
  return { kind: "fatigue", soirees: soirees.length, normScore, nextScore, afterScore, hrv, hard };
}

function leviers(checkins: BilanCheckin[]): BilanSlide | null {
  const days = checkins.filter(c => !(c.behaviors ?? []).some(b => SOIREE_WIDE.has(b)));
  const keys = ["stretching", "screen_late", "walk", "hydration", "reading", "meditation", "cold_shower", "caffeine_late", "heavy_meal"];
  const LABEL: Record<string, [string, boolean]> = {
    stretching: ["Stretching le soir", true], screen_late: ["Écran tard", false], walk: ["Marche détente", true],
    hydration: ["Bonne hydratation", true], reading: ["Lecture", true], meditation: ["Méditation", true],
    cold_shower: ["Douche froide", true], caffeine_late: ["Caféine tard", false], heavy_meal: ["Repas lourd", false],
  };
  const withSleep = days.filter(c => c.device_sleep_minutes && c.device_sleep_minutes > 120);
  const useSleep = withSleep.length >= 20;
  const pool = useSleep ? withSleep : days.filter(c => c.score !== null);
  const val = (c: BilanCheckin) => useSleep ? c.device_sleep_minutes! : c.score!;
  const rows: { label: string; with: string; without: string; delta: string; positive: boolean; d: number }[] = [];
  for (const k of keys) {
    const w = pool.filter(c => (c.behaviors ?? []).includes(k)), wo = pool.filter(c => !(c.behaviors ?? []).includes(k));
    if (w.length < 5 || wo.length < 5) continue;
    const d = mean(w.map(val)) - mean(wo.map(val));
    const fmt = (x: number) => useSleep ? hm(x) : String(Math.round(x));
    const delta = useSleep ? `${d >= 0 ? "+" : "−"}${Math.round(Math.abs(d))} min` : `${d >= 0 ? "+" : "−"}${Math.round(Math.abs(d))} pts`;
    rows.push({ label: LABEL[k][0], with: fmt(mean(w.map(val))), without: fmt(mean(wo.map(val))), delta, positive: d > 0, d });
  }
  const strong = rows.filter(r => Math.abs(r.d) >= (useSleep ? 10 : 3));
  if (!strong.length) return null;
  strong.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  // Le contraste « écran tard : presque rien » est gardé s'il existe : c'est lui qui rend le levier crédible.
  const screen = rows.find(r => r.label === "Écran tard" && !strong.includes(r));
  const shown = [...strong.slice(0, 2), ...(screen && strong.length < 3 ? [screen] : [])].map(({ d: _d, ...r }) => r);
  return { kind: "leviers", rows: shown, unit: useSleep ? "sleep" : "score" };
}

function tendance(period: BilanPeriod, checkins: BilanCheckin[]): BilanSlide | null {
  if (period.kind === "week") return null;
  const start = period.kind === "month" ? (() => { const d = new Date(period.start + "T12:00:00"); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })() : period.start;
  const by = new Map<string, BilanCheckin[]>();
  for (const c of checkins) if (c.date >= start && c.date <= period.end && c.score !== null) by.set(c.date.slice(0, 7), [...(by.get(c.date.slice(0, 7)) ?? []), c]);
  const keys = Array.from(by.keys()).sort().filter(k => by.get(k)!.length >= 8);
  if (keys.length < 2) return null;
  const months: Bar[] = keys.map(k => ({ label: MONTHS[Number(k.slice(5)) - 1], value: Math.round(mean(by.get(k)!.map(c => c.score!))), display: String(Math.round(mean(by.get(k)!.map(c => c.score!)))) }));
  const last = months[months.length - 1].value, peak = Math.max(...months.slice(0, -1).map(m => m.value)), prev = months[months.length - 2].value;
  const direction = last <= Math.min(peak, prev + 2) - 4 ? "down" : last >= prev + 4 ? "up" : "stable";
  let lateNights: Bar[] | null = keys.map(k => { const n = by.get(k)!.filter(c => c.bedtime === "00to01" || c.bedtime === "after01").length; return { label: MONTHS[Number(k.slice(5)) - 1], value: n, display: String(n) }; });
  const lateFirst = lateNights[0].value, lateLast = lateNights[lateNights.length - 1].value;
  if (!(direction === "down" && lateLast >= lateFirst + 3)) lateNights = null;
  if (lateNights) lateNights[lateNights.length - 1].highlight = true;
  months[months.length - 1].highlight = true;
  return { kind: "tendance", months, lateNights, direction };
}

function tests(period: BilanPeriod, rows: BilanTest[]): BilanSlide | null {
  const inP = rows.filter(r => r.date >= period.start && r.date <= period.end);
  const by = new Map<string, BilanTest[]>();
  for (const r of inP) by.set(r.name, [...(by.get(r.name) ?? []), r]);
  const prog: { name: string; unit: string; pts: BilanTest[]; pct: number }[] = [];
  for (const [name, rs] of Array.from(by.entries())) {
    if (rs.length < 2) continue;
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].value, last = sorted[sorted.length - 1].value;
    if (!first) continue;
    const lower = rs[0].unit === "s" || rs[0].unit === "min";
    const pct = Math.round(((lower ? first - last : last - first) / first) * 100);
    prog.push({ name, unit: rs[0].unit, pts: sorted, pct });
  }
  const good = prog.filter(p => p.pct > 0).sort((a, b) => b.pct - a.pct);
  if (!good.length) return null;
  const fmt = (v: number, u: string) => u === "s" && v < 1 ? `${Math.round(v * 1000)} ms` : u === "m" && v < 2 ? `${(v * 100).toFixed(1).replace(".", ",")} cm` : `${String(Math.round(v * 10) / 10).replace(".", ",")} ${u}`;
  const m = good[0];
  return {
    kind: "tests",
    main: { name: m.name, unit: m.unit, points: m.pts.map(p => ({ date: p.date, value: p.value })), pct: m.pct },
    others: good.slice(1, 3).map(p => ({ name: p.name, from: fmt(p.pts[0].value, p.unit), to: fmt(p.pts[p.pts.length - 1].value, p.unit), pct: p.pct })),
  };
}

export function computeBilan(input: {
  period: BilanPeriod; today: string; signupAt: string;
  sessions: BilanSession[]; checkins: BilanCheckin[]; tests: BilanTest[];
}): Bilan {
  const { period, today, signupAt } = input;
  const sessions = input.sessions.filter(s => s.done && s.rpe !== null && !isSynthetic(s, signupAt) && s.date <= period.end);
  const checkins = input.checkins.filter(c => !isSynthetic(c, signupAt) && c.date <= period.end);
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const joined: Joined[] = [...sessions].sort((x, y) => x.date.localeCompare(y.date)).filter(s => s.target_difficulty).map(s => ({ s, c: byDate.get(s.date), gap: s.rpe! - s.target_difficulty! }));

  const periodSlides = [regularite(period, sessions, checkins, today), charge(period, sessions, today)];
  const learned = [ressenti(checkins), predit(joined), biais(joined), fatigue(checkins, sessions), leviers(checkins)].filter((x): x is BilanSlide => !!x);
  const late = [tendance(period, checkins), tests(period, input.tests)];
  const slides = [...periodSlides, ...(period.kind === "week" ? learned.slice(0, 2) : learned), ...late].filter((x): x is BilanSlide => !!x);

  const kpis: { value: string; label: string }[] = [];
  for (const s of slides) {
    if (s.kind === "regularite") kpis.push({ value: String(s.sessions), label: s.noGap ? "séances, zéro semaine sautée" : "séances" });
    if (s.kind === "charge") kpis.push({ value: `${s.pctInZone} %`, label: "des jours en zone de charge" });
    if (s.kind === "tests") kpis.push({ value: `+${s.main.pct} %`, label: s.main.name });
    if (s.kind === "ressenti" && s.crashes >= 3) kpis.push({ value: `${s.crashesSeen} / ${s.crashes}`, label: "chutes de VFC vues par le check-in" });
  }
  const f = slides.find(s => s.kind === "fatigue");
  const line = f && f.kind === "fatigue" && f.afterScore !== null && f.normScore - f.afterScore < 5 ? "Une soirée (alcool ou sortie) se paie le lendemain, pas plus." : null;
  if (slides.length >= 2) slides.push({ kind: "partage", kpis: kpis.slice(0, 4), line });

  const fmtD = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  const title = period.kind === "week" ? `Semaine du ${fmtD(period.start)}` : period.kind === "month" ? (MONTHS[Number(period.start.slice(5, 7)) - 1].replace(".", "") + " " + period.start.slice(0, 4)) : `Depuis le ${fmtD(period.start)}`;
  return { period, slides, title };
}
