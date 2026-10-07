/* Leviers d'ajustement d'une séance : moteur UNIQUE de l'app (décisions d'autorégulation, aperçus,
   Reconduire, Dupliquer, acclimatation, simulateurs). Remplace l'ancien parseAndApply (regex) depuis
   le 2026-10-07 — loadAdjust.parseAndApply délègue ici.

   Un % signé choisit le levier :
   - pct > 0  → surcharger : charges +pct (cran minimum), sinon intensité relevée, sinon durée +pct, sinon
                +1 série/tour (endurance, en-tête de bloc), sinon reps +pct (poids du corps, au moins +1).
   - -10 < pct < 0 → alléger : même ordre à la baisse, RPE −1 ; au poids du corps −1 rep (au moins),
                sinon −1 série si > 2.
   - pct ≤ -10 → décharge : séries −|pct| (en retirant les dernières, donc le haut des montées) ET charges
                −|pct|/2 sauf sur une montée ; en endurance l'intensité baisse d'un cran ; RPE −1.
   - mode "loads" (acclimatation) : mêmes séries, la baisse est portée par les charges (ou l'intensité,
                la durée, les reps) quel que soit le %.
   Garde-fou : une ligne non comprise, sans chiffre, une consigne ou une lecture ambiguë n'est jamais
   touchée. Seuls les chiffres modifiés sont réécrits, le reste de la ligne est recopié tel quel. */
import { parseLine, rewriteLine, type LineEdits, type ParsedLine, type Token, type TokRef } from "./exerciseParser";

export type LeverDir = "light" | "over" | "deload";
export type LeverWhy = "" | "load-" | "load+" | "int" | "time" | "sets" | "reps";
export interface LineAdjustment { text: string; why: LeverWhy; skipped?: boolean }

const toN = (s: string | number | undefined) => parseFloat(String(s ?? "").replace(",", "."));
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const r25 = (n: number) => Math.round(n / 2.5) * 2.5;
const r5 = (n: number) => Math.round(n / 5) * 5;

export function leverDir(pct: number): LeverDir | null {
  if (!pct) return null;
  if (pct > 0) return "over";
  return pct <= -10 ? "deload" : "light";
}

/** Charge mise à l'échelle avec un cran minimum (2,5 kg, 1 kg sous 20 kg) : une décision se voit toujours. */
function scaleLoad(v: number, f: number): number {
  const step = v < 20 ? 1 : 2.5;
  const n = v < 20 ? Math.round(v * f * 2) / 2 : r25(v * f);
  const out = f < 1 ? Math.min(n, v - step) : Math.max(n, v + step);
  return out > 0 ? out : v;
}

const totalSets = (p: ParsedLine) => p.entries.length ? p.entries.reduce((a, e) => a + (e.n || 1), 0) : p.schemes.reduce((a, s) => a + (s.sets || 0), 0);

export interface LeverOptions {
  header?: boolean;
  /** "loads" : baisse/hausse toujours portée par les charges, jamais par les séries, quel que soit le %
      (acclimatation : mêmes séries, charges −20 %). */
  mode?: "loads";
}

export function adjustParsedLine(p: ParsedLine, pct: number, opt: LeverOptions = {}): LineAdjustment {
  const dir = opt.mode === "loads" && pct < 0 ? "light" : leverDir(pct);
  if (!dir || p.kind === "fallback" || p.kind === "note" || p.kind === "nameOnly") return { text: p.raw, why: "" };
  if (p.ambiguous) return { text: p.raw, why: "", skipped: true };
  const header = opt.header ?? p.header;
  const f = 1 + pct / 100;
  const edits: LineEdits = new Map();
  const set = (ref: TokRef | null | undefined, val: string) => {
    if (!ref || !ref.t || edits.get(ref.t) === "remove") return;
    const o = (edits.get(ref.t) as Record<number, string> | undefined) || {};
    o[ref.gi] = val; edits.set(ref.t, o);
  };
  const remove = (t: Token | null | undefined) => { if (t) edits.set(t, "remove"); };
  const numStr = (ref: TokRef, v: number) => { const s = fmt(v), orig = ref.t.g[ref.gi] || ""; return orig.includes(".") ? s.replace(",", ".") : s; };
  const done = (why: LeverWhy): LineAdjustment => ({ text: rewriteLine(p, edits).replace(/\s*\+\s*$/, "").replace(/\+\s*\+/g, "+"), why });
  const rpeDown = () => { if (p.rpe && p.rpe.k === "RPE" && p.rpe.v > 1) set(p.rpe.ref, fmt(p.rpe.v - 1)); };

  const items = p.schemes.flatMap(s => s.items).filter(x => x.ref);
  const timeOnly = !items.length && p.schemes.length > 0 && p.schemes.every(s => s.secRef && !s.sets && s.reps == null);
  const timeScale = (k: number) => p.schemes.forEach(s => {
    if (!s.secRef) return;
    const src = s.secRef.t.g[s.secRef.gi] || "";
    const m = src.match(/\d+(?:[.,]\d+)?/);
    if (!m) return;
    const v = toN(m[0]);
    let nv = v >= 20 ? r5(v * k) : Math.round(v * k);
    if (nv === v) nv = v + (k < 1 ? -1 : 1);
    set(s.secRef, src.replace(m[0], String(Math.max(1, nv)))); // garde l'unité ("40 min" → "35 min")
  });
  const zone = p.extras.find(x => x.k === "zone"), pace = p.extras.find(x => x.k === "pace");
  const mag = Math.abs(pct);
  const intensity = (up: boolean, m = mag) => {
    if (p.pct != null && p.pctRefs) {
      const base = Math.min(10, Math.max(2.5, r25(m / 2)));
      const st = up ? base : -Math.max(5, base);
      set(p.pctRefs[0], fmt(p.pct + st));
      if (p.pctRefs[1] && p.pct2 != null) set(p.pctRefs[1], fmt(p.pct2 + st));
      return true;
    }
    if (pace && pace.sec != null && pace.ref && pace.ref2) {
      // allure : ±5 s/km par tranche de 5 %, plafonnée à 10 s/km par décision (une allure bouge vite)
      const d = Math.min(10, Math.max(5, r5(pace.sec * m / 100)));
      const s = Math.max(60, pace.sec + (up ? -d : d));
      set(pace.ref, String(Math.floor(s / 60))); set(pace.ref2, String(s % 60).padStart(2, "0"));
      return true;
    }
    if (zone && zone.ref && zone.raw && !up && /[3-5]/.test(zone.raw)) { set(zone.ref, zone.raw.replace(/[1-5]/g, n => String(Math.max(1, +n - 1)))); return true; }
    return false;
  };
  // reps simples d'une ligne sans charge ("Tractions 4x10", "10 reps", "20 crunchs")
  const repsTargets = p.schemes.flatMap(sc => {
    if (!sc.tok || sc.items.length || sc.reps == null || !/^\d+$/.test(String(sc.reps))) return [];
    const gi = sc.tok.k === "scheme" ? 1 : ["reps", "bare", "side"].includes(sc.tok.k) ? 0 : -1;
    return gi < 0 || sc.tok.g[gi] !== String(sc.reps) ? [] : [{ ref: { t: sc.tok, gi } as TokRef, r: +sc.reps }];
  });
  const scaleReps = (up: boolean) => {
    repsTargets.forEach(({ ref, r }) => {
      const n = Math.round(r * f);
      set(ref, String(Math.max(1, up ? Math.max(n, r + 1) : Math.min(n, r - 1))));
    });
    return repsTargets.length > 0;
  };
  const endu = p.schemes.some(s => s.dist || s.sec || s.work) || !!zone || !!pace || (!!p.pctRef && !/RM/i.test(p.pctRef));

  if (dir === "light" || dir === "over") {
    const up = dir === "over";
    if (items.length) { items.forEach(it => set(it.ref!, numStr(it.ref!, scaleLoad(it.v, f)))); if (!up) rpeDown(); return done(up ? "load+" : "load-"); }
    if (intensity(up)) { if (!up) rpeDown(); return done("int"); }
    if (timeOnly) { timeScale(f); if (!up) rpeDown(); return done("time"); }
    const sc = [...p.schemes].reverse().find(s => s.setsRef && s.sets);
    if (up) {
      if (sc && (endu || header)) { set(sc.setsRef, String(sc.sets! + 1)); return done("sets"); }
      if (scaleReps(true)) return done("reps");
      return done("");
    }
    if (!endu && !header && scaleReps(false)) { rpeDown(); return done("reps"); }
    if (opt.mode === "loads") return done("");
    if (sc && sc.sets! > 2) { set(sc.setsRef, String(sc.sets! - 1)); rpeDown(); return done("sets"); }
    return done("");
  }

  // décharge : volume réduit de |pct| ET charges réduites de |pct|/2 (cran minimum). Sur une montée
  // en charge, retirer les dernières séries enlève déjà les plus lourdes : les charges restantes ne
  // bougent pas. En endurance, l'intensité baisse d'un cran (allure, zone, %).
  const halfF = 1 + pct / 200;
  const enduInt = endu && intensity(false, mag / 2);
  if (timeOnly) { timeScale(f); rpeDown(); return done("time"); }
  // montée = plusieurs charges différentes sur la ligne (même réparties sur plusieurs schémas)
  const lineIsRamp = p.schemes.some(sc => sc.range) || new Set(items.map(x => x.v)).size > 1;
  const E = p.entries.filter(e => e.item.ref);
  const total = E.length ? E.reduce((a, e) => a + e.n, 0) : p.schemes.reduce((a, s) => a + (s.setsRef ? s.sets || 0 : 0), 0);
  let cut = Math.max(0, total - Math.max(1, Math.round(total * f)));
  if (!cut && total > 1) cut = 1;
  rpeDown();
  if (E.length) {
    const nn = E.map(e => e.n);
    E.forEach(({ item: it }) => { if (!lineIsRamp && it.ref) set(it.ref, numStr(it.ref, scaleLoad(it.v, halfF))); });
    for (let i = E.length - 1; i >= 0 && cut > 0; i--) { const k = Math.min(cut, nn[i] - (i === 0 ? 1 : 0)); nn[i] -= k; cut -= k; }
    E.forEach((e, i) => {
      const it = e.item; if (nn[i] === e.n) return;
      if (it.kind === "sub") { if (!nn[i]) remove(it.ref!.t); else if (it.nRef) set(it.nRef, String(nn[i])); }
      else if (it.nFromScheme && it.scheme) { if (!nn[i]) { remove(it.scheme.tok); remove(it.ref!.t); } else set(it.scheme.setsRef, String(nn[i])); }
      else if (!nn[i]) remove(it.ref!.t);
    });
    p.schemes.forEach(s => {
      if (!s.items.length || s.items.some(x => x.nFromScheme)) return;
      const mine = E.map((e, i) => e.item.scheme === s ? i : -1).filter(i => i >= 0);
      const left = mine.reduce((a, i) => a + nn[i], 0);
      if (s.setsRef) { if (!left) remove(s.tok); else if (left !== s.sets) set(s.setsRef, String(left)); }
      if (s.range && s.range[1].ref) { const rem = mine.filter(i => nn[i] > 0).map(i => E[i].load); if (rem.length) set(s.range[1].ref, numStr(s.range[1].ref, Math.max(...rem))); }
    });
    return done("sets");
  }
  if (!cut) { if (!E.length && !endu && scaleReps(false)) return done("reps"); if (!enduInt) return done(""); }
  const sch = p.schemes.filter(s => s.setsRef && s.sets);
  for (let i = sch.length - 1; i >= 0 && cut > 0; i--) { const k = Math.min(cut, sch[i].sets! - 1); if (k > 0) { set(sch[i].setsRef, String(sch[i].sets! - k)); cut -= k; } }
  return done("sets");
}

/** Une ligne. Toujours 1 ligne en sortie (exercise_media est indexé par numéro de ligne). */
export function adjustLine(raw: string, pct: number, opt: LeverOptions = {}): LineAdjustment {
  if (!pct || !raw.trim()) return { text: raw, why: "" };
  return adjustParsedLine(parseLine(raw), pct, opt);
}

export interface NotesAdjustment { text: string; changed: number; skipped: number; summary: string }

/** Toute une séance (notes \n-séparées), 1:1 en lignes, avec la phrase de synthèse. */
export function adjustNotes(notes: string | null | undefined, pct: number): NotesAdjustment {
  const src = notes ?? "";
  if (!pct) return { text: src, changed: 0, skipped: 0, summary: "" };
  const lines = src.split("\n");
  const results = lines.map(l => {
    const p = parseLine(l);
    return { p, r: !l.trim() ? { text: l, why: "" as LeverWhy } : adjustParsedLine(p, pct) };
  });
  const text = results.map(x => x.r.text).join("\n");
  return {
    text,
    changed: results.filter(x => x.r.text !== x.p.raw).length,
    skipped: results.filter(x => x.r.skipped).length,
    summary: summarize(pct, results),
  };
}

function summarize(pct: number, results: { p: ParsedLine; r: LineAdjustment }[]): string {
  const dir = leverDir(pct);
  if (!dir) return "";
  let load = 0, inten = 0, sets = 0, reps = 0, time = 0, same = 0, skipped = 0, s0 = 0, s1 = 0;
  for (const { p, r } of results) {
    if (p.kind === "note" || !p.raw.trim()) continue;
    if (r.skipped) { skipped++; continue; }
    s0 += totalSets(p); s1 += totalSets(parseLine(r.text));
    if (r.text === p.raw) { if (p.kind !== "nameOnly" && p.kind !== "fallback") same++; continue; }
    if (r.why.startsWith("load")) load++; else if (r.why === "int") inten++; else if (r.why === "time") time++; else if (r.why === "reps") reps++; else sets++;
  }
  const ex = (n: number) => `${n} exo${n > 1 ? "s" : ""}`;
  const pctTxt = `${pct > 0 ? "+" : "−"}${fmt(Math.abs(pct))} %`;
  const parts: string[] = [];
  if (dir === "deload") {
    if (s0 && s0 !== s1) parts.push(`${s0} → ${s1} séries, en retirant les dernières de chaque exo.`);
    parts.push(`Charges −${fmt(Math.abs(pct) / 2)} % (montées en charge inchangées, leurs séries les plus lourdes sont retirées).`);
  } else {
    if (load) parts.push(`Charges ${pctTxt} sur ${ex(load)}.`);
    if (inten) parts.push(`Intensité ${dir === "light" ? "baissée" : "relevée"} sur ${ex(inten)}.`);
    if (sets) parts.push(`${dir === "light" ? "−1" : "+1"} série ou tour sur ${ex(sets)}.`);
    if (reps) parts.push(`Répétitions ${pctTxt} sur ${ex(reps)}.`);
  }
  if (time) parts.push(`Durée ${pctTxt} sur ${ex(time)}.`);
  if (same) parts.push(`${ex(same)} inchangé${same > 1 ? "s" : ""}.`);
  if (skipped) parts.push(`${ex(skipped)} non ajusté${skipped > 1 ? "s" : ""} : lecture incertaine.`);
  return parts.join(" ");
}

/** Décision déjà appliquée : ce qui a changé entre les notes d'avant et les notes actuelles, dans les
    mêmes mots que l'aperçu (charges en %, séries, intensité, durée, reps). */
export function describeChange(before: string | null | undefined, after: string | null | undefined): string {
  const a = (before ?? "").split("\n"), b = (after ?? "").split("\n");
  let s0 = 0, s1 = 0, loadN = 0, loadPct = 0, inten = 0, time = 0, reps = 0, other = 0;
  const loadsOf = (p: ParsedLine) => p.entries.reduce((acc, e) => acc + e.load * (e.n || 1), 0) / Math.max(1, totalSets(p));
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? "", y = b[i] ?? "";
    if (x === y) continue;
    const px = parseLine(x), py = parseLine(y);
    s0 += totalSets(px); s1 += totalSets(py);
    const lx = loadsOf(px), ly = loadsOf(py);
    if (px.entries.length && py.entries.length && lx && Math.abs(ly - lx) / lx > 0.004) { loadN++; loadPct += (ly - lx) / lx * 100; continue; }
    if ((px.pct ?? null) !== (py.pct ?? null) || JSON.stringify(px.extras.map(e => e.t)) !== JSON.stringify(py.extras.map(e => e.t))) { inten++; continue; }
    const sec = (p: ParsedLine) => p.schemes.reduce((acc, sc) => acc + (sc.sec || 0), 0);
    if (sec(px) !== sec(py) && totalSets(px) === totalSets(py)) { time++; continue; }
    const rp = (p: ParsedLine) => p.schemes.map(sc => sc.reps).join("|");
    if (rp(px) !== rp(py) && totalSets(px) === totalSets(py)) { reps++; continue; }
    if (totalSets(px) === totalSets(py)) other++;
  }
  const ex = (n: number) => `${n} exo${n > 1 ? "s" : ""}`;
  const parts: string[] = [];
  if (s0 !== s1) parts.push(`${s0} → ${s1} séries.`);
  if (loadN) { const m = loadPct / loadN; parts.push(`Charges ${m > 0 ? "+" : "−"}${fmt(Math.abs(Math.round(m * 2) / 2))} % sur ${ex(loadN)}.`); }
  if (inten) parts.push(`Intensité modifiée sur ${ex(inten)}.`);
  if (time) parts.push(`Durée modifiée sur ${ex(time)}.`);
  if (reps) parts.push(`Répétitions modifiées sur ${ex(reps)}.`);
  if (other) parts.push(`${ex(other)} ajusté${other > 1 ? "s" : ""}.`);
  return parts.length ? `Ajustement appliqué : ${parts.join(" ")}` : "";
}
