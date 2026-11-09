import { parseLine, type ParsedLine } from "@/lib/exerciseParser";

/* Ressenti par série en séance en direct (2026-11-09, POC canvas 3HwFYueK858LbGciExihYm).
   Un tap après chaque série = série validée + ressenti + repos ; la suite de l'exercice s'ajuste.
   La ligne de notes est réécrite avec le prévu restant (elle reste la source de vérité) ; le journal
   `sessions.live_sets` garde le prévu d'origine, les ressentis et le repos en cours. */

export type Feel = "facile" | "prevu" | "dur";
export type SetKind = "load" | "pct" | "reps" | "pace" | "count";

export interface LineLog {
  key: string;
  kind: SetKind;
  orig: (number | null)[];
  vals: number[];
  reps: (string | null)[];
  work?: string;
  feels: (Feel | null)[];
  done: number;
  net: number;
  cut: number;
  skipped?: boolean;
}

export interface LiveSets {
  v: 1;
  lines: Record<string, LineLog>;
  rest?: { at: string; sec: number | null; next: string } | null;
}

export const FEEL_LABEL: Record<Feel, string> = { facile: "Plus facile", prevu: "Comme prévu", dur: "Plus dur" };
const EX_CAP = 2;
const SESSION_CAP_PCT = 10;
const UP_PCT = 2.5;
const DOWN_PCT = 5;

export const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
export const paceTxt = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}`;

function workTxt(p: ParsedLine): string | undefined {
  const s = p.schemes[0];
  if (!s) return undefined;
  if (s.dist != null) return s.unit === "km" ? `${fmtNum(s.dist)}km` : `${fmtNum(s.dist)}m`;
  if (s.sec != null) return s.sec % 60 === 0 && s.sec >= 60 ? `${s.sec / 60} min` : `${s.sec}s`;
  return undefined;
}

/* Séries lisibles sur une ligne, ou null si la ligne ne se découpe pas en séries sûres. */
function extract(line: string): Omit<LineLog, "key" | "feels" | "done" | "net" | "cut" | "orig"> | null {
  const p = parseLine(line);
  if (!p.ok || p.kind !== "full" || p.ambiguous) return null;
  if (p.pct != null) {
    if (p.entries.length) return null;
    const pctToks = p.toks.filter(t => t.k === "pct");
    const sch = p.schemes;
    if (!sch.length || pctToks.length !== sch.length || sch.some(s => !s.sets)) return null;
    const vals: number[] = [];
    const reps: (string | null)[] = [];
    for (let i = 0; i < sch.length; i++) {
      const v = parseFloat((pctToks[i].src.match(/\d+(?:[.,]\d+)?/)?.[0] ?? "").replace(",", "."));
      if (!v) return null;
      const r = sch[i].reps ?? (sch[i].sec != null || sch[i].dist != null ? null : undefined);
      if (r === undefined) return null;
      for (let k = 0; k < sch[i].sets!; k++) { vals.push(v); reps.push(r); }
    }
    if (vals.length > 20) return null;
    return { kind: "pct", vals, reps, work: workTxt(p) };
  }
  if (p.entries.length) {
    const vals: number[] = [];
    const reps: (string | null)[] = [];
    for (const e of p.entries) for (let i = 0; i < e.n; i++) { vals.push(e.load); reps.push(e.item.scheme?.reps ?? null); }
    if (vals.length < 1 || vals.length > 20) return null;
    return { kind: "load", vals, reps };
  }
  const sch = p.schemes.filter(s => s.sets != null && s.sets > 0);
  if (!sch.length || sch.length !== p.schemes.length) return null;
  const total = sch.reduce((a, s) => a + (s.sets ?? 0), 0);
  if (total < 1 || total > 20) return null;
  const paces = p.extras.filter(x => x.k === "pace" && x.sec);
  if (paces.length === sch.length && sch.every(s => s.sec != null || s.dist != null)) {
    const vals: number[] = [];
    sch.forEach((s, i) => { for (let k = 0; k < (s.sets ?? 0); k++) vals.push(paces[i].sec!); });
    return { kind: "pace", vals, reps: vals.map(() => null), work: workTxt(p) };
  }
  if (paces.length) return null;
  if (sch.every(s => s.reps && /^\d+$/.test(s.reps) && s.dist == null && s.sec == null)) {
    const vals: number[] = [];
    sch.forEach(s => { for (let k = 0; k < (s.sets ?? 0); k++) vals.push(parseInt(s.reps!, 10)); });
    return { kind: "reps", vals, reps: vals.map(() => null) };
  }
  if (sch.length === 1 && (sch[0].dist != null || sch[0].sec != null)) {
    const v = sch[0].dist ?? sch[0].sec!;
    return { kind: "count", vals: Array(total).fill(v), reps: Array(total).fill(null), work: workTxt(p) };
  }
  return null;
}

export function restSecOf(line: string): number | null {
  const p = parseLine(line);
  const r = p.extras.find(x => x.k === "rest");
  if (!r) return null;
  const t = (r.raw ?? r.t).toLowerCase();
  let m = t.match(/(\d+)\s*['’]\s*(\d{1,2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(min|mn|m\b|')/);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
  m = t.match(/(\d+)\s*(s|sec|")/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/* Journal d'une ligne : celui enregistré s'il correspond encore au texte, sinon reconstruit depuis
   le texte (modifié à la main pendant la séance) en gardant les séries déjà faites. */
export function logFor(line: string, saved: LineLog | undefined): LineLog | null {
  if (saved && saved.key === line) return saved;
  const x = extract(line);
  if (!x) return null;
  const done = Math.min(saved?.done ?? 0, x.vals.length);
  const vals = saved ? [...saved.vals.slice(0, done), ...x.vals.slice(done)] : x.vals;
  const orig = saved ? [...saved.orig.slice(0, done), ...x.vals.slice(done)] : x.vals.slice();
  return {
    key: line, kind: x.kind, vals, orig, reps: x.reps, work: x.work,
    feels: saved ? saved.feels.slice(0, done) : [], done, net: saved?.net ?? 0, cut: 0, skipped: saved?.skipped,
  };
}

export const activeCount = (l: LineLog) => l.vals.length - l.cut;

function scaleLoad(v: number, up: boolean): number {
  const step = v < 20 ? 1 : 2.5;
  const target = Math.round((v * (1 + (up ? UP_PCT : -DOWN_PCT) / 100)) / step) * step;
  const out = up ? Math.max(target, v + step) : Math.min(target, v - step);
  return out > 0 ? Math.round(out * 100) / 100 : v;
}

const pctOfNet = (net: number) => (net > 0 ? net * UP_PCT : net * DOWN_PCT);
export function sessionPct(ls: LiveSets | null | undefined): number {
  return Object.values(ls?.lines ?? {}).reduce((a, l) => a + pctOfNet(l.net), 0);
}

export type FeelOutcome = { log: LineLog; capped: "ex" | "session" | null; msg: string };

export function applyFeel(log: LineLog, feel: Feel, sessPct: number): FeelOutcome {
  const n = activeCount(log);
  if (log.done >= n) return { log, capped: null, msg: "" };
  const nd = log.done + 1;
  const feels = [...log.feels.slice(0, log.done), feel];
  const base: LineLog = { ...log, feels, done: nd, skipped: false };
  const step = feel === "facile" ? 1 : feel === "dur" ? -1 : 0;
  if (step === 0) return { log: base, capped: null, msg: "" };
  if ((step > 0 && log.net >= EX_CAP) || (step < 0 && log.net <= -EX_CAP)) return { log: base, capped: "ex", msg: "" };
  if (Math.abs(sessPct + (step > 0 ? UP_PCT : -DOWN_PCT)) > SESSION_CAP_PCT) return { log: base, capped: "session", msg: "" };
  if (nd >= n) return { log: base, capped: null, msg: "" };

  if (log.kind === "count") {
    if (step > 0) {
      if (log.cut > 0) return { log: { ...base, cut: log.cut - 1, net: log.net + 1 }, capped: null, msg: "une série rendue" };
      return { log: base, capped: null, msg: "on garde le volume prévu" };
    }
    if (n - nd >= 1 && n > 2) return { log: { ...base, cut: log.cut + 1, net: log.net - 1 }, capped: null, msg: "une série en moins" };
    return { log: base, capped: null, msg: "" };
  }
  const vals = log.vals.map((v, i) => {
    if (i < nd) return v;
    if (log.kind === "pace") return Math.max(60, v + (step > 0 ? -5 : 10));
    if (log.kind === "reps") return Math.max(1, v + step);
    if (log.kind === "pct") {
      const t = Math.round(v * (1 + (step > 0 ? UP_PCT : -DOWN_PCT) / 100));
      return Math.max(1, step > 0 ? Math.max(t, v + 1) : Math.min(t, v - 1));
    }
    return scaleLoad(v, step > 0);
  });
  return { log: { ...base, vals, net: log.net + step }, capped: null, msg: "" };
}

export function valueTxt(log: LineLog, v: number): string {
  if (log.kind === "pace") return `${paceTxt(v)}/km`;
  if (log.kind === "reps") return `${v} rep${v > 1 ? "s" : ""}`;
  if (log.kind === "count") return log.work ?? fmtNum(v);
  if (log.kind === "pct") return `${fmtNum(v)} %`;
  return `${fmtNum(v)} kg`;
}

function groups(log: LineLog, upto: number) {
  const out: { n: number; v: number; reps: string | null }[] = [];
  for (let i = 0; i < upto; i++) {
    const g = out[out.length - 1];
    if (g && g.v === log.vals[i] && g.reps === (log.reps[i] ?? null)) g.n++;
    else out.push({ n: 1, v: log.vals[i], reps: log.reps[i] ?? null });
  }
  return out;
}

function volumeText(log: LineLog): string {
  const n = activeCount(log);
  if (log.kind === "count") return `${n}x${log.work}`;
  const gs = groups(log, n);
  if (log.kind === "reps") return gs.map(g => `${g.n}x${g.v}`).join(" ");
  if (log.kind === "pace") return gs.map(g => `${g.n}x${log.work} ${paceTxt(g.v)}/km`).join(", ");
  if (log.kind === "pct") return gs.map(g => `${g.n}x${g.reps ?? log.work}@${fmtNum(g.v)}%`).join(", ");
  return gs.map(g => {
    if (g.reps == null) return g.n > 1 ? `${g.n}x${fmtNum(g.v)}kg` : `${fmtNum(g.v)}kg`;
    const r = /^\d+$/.test(g.reps) ? g.reps : `(${g.reps})`;
    return `${g.n}x${r} ${fmtNum(g.v)}kg`;
  }).join(log.reps.some(r => r != null) ? ", " : " ");
}

const VOLUME_TOKS = new Set(["complex", "scheme", "series", "count", "reps", "time", "dist", "load", "atload", "mult", "interval", "pace", "bare", "pct"]);

/* Réécrit la partie volume de la ligne. Si le texte obtenu ne se relit pas exactement en ces séries,
   la ligne reste telle quelle (le journal garde la vérité). */
export function rewriteLineFor(line: string, log: LineLog): string {
  const p = parseLine(line);
  const toks = p.toks.filter(t => VOLUME_TOKS.has(t.k));
  if (!toks.length) return line;
  const start = Math.min(...toks.map(t => t.start));
  const end = Math.max(...toks.map(t => t.end));
  if (p.toks.some(t => !VOLUME_TOKS.has(t.k) && t.start > start && t.end < end)) return line;
  const next = (line.slice(0, start) + volumeText(log) + line.slice(end)).replace(/\s{2,}/g, " ");
  const check = extract(next);
  const n = activeCount(log);
  if (!check || check.kind !== log.kind || check.vals.length !== n || check.vals.some((v, i) => Math.abs(v - log.vals[i]) > 0.01)) return line;
  return next;
}

export function changedCount(log: LineLog): number {
  return log.vals.filter((v, i) => i < activeCount(log) && log.orig[i] != null && v !== log.orig[i]).length + log.cut;
}

/* Synthèse en mots pour la fenêtre Terminer. */
export function sessionSummary(lines: string[], ls: LiveSets | null | undefined, nameOf: (line: string) => string): string | null {
  if (!ls) return null;
  const up: string[] = [], down: string[] = [], skipped: string[] = [];
  lines.forEach((line, i) => {
    const l = ls.lines[String(i)];
    if (!l) return;
    const name = nameOf(l.key || line).toLowerCase();
    if (l.net > 0) up.push(name);
    else if (l.net < 0) down.push(name);
    const left = activeCount(l) - l.done;
    if (l.skipped && left > 0) skipped.push(name);
  });
  const parts: string[] = [];
  if (up.length) parts.push(`${up.join(", ")} monté${up.length > 1 ? "s" : ""}`);
  if (down.length) parts.push(`${down.join(", ")} allégé${down.length > 1 ? "s" : ""}`);
  let s = parts.length ? `Ajustée en séance : ${parts.join(" ; ")}.` : "";
  if (skipped.length) s += `${s ? " " : ""}Séries non notées : ${skipped.join(", ")}.`;
  return s || null;
}
