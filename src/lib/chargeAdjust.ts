/* Réglages de Dupliquer / Reconduire (2026-11-01) : deux leviers explicites en %, valables pour
   tous les sports, au lieu d'un seul % dont le moteur choisissait lui-même la cible. Partout :
   Planning sportif et coach, Accueil, Coach Control, éditeur de programme.
   - Intensité (± %, au demi-point près) : charges en kg via le moteur unique (sessionLevers, arrondi
     2,5 kg, cran minimum) ; %1RM/%FTP en points (65 % + 5 = 70 %) ; allure à la seconde (vitesse
     ± %) ; zone et RPE par cran. Une ligne sans intensité ne bouge pas.
   - Volume (± %) : séries (4×6, 10×400 m, « 4 tours », 3×75kg), sinon durée (45 min), sinon
     distance (5 km). Arrondi AU PLUS PROCHE, sans cran forcé : « +10 % » ne devient jamais +33 %
     sur un 3×5 (il ne bouge qu'à partir de ±17 %). Les répétitions ne bougent jamais : en
     musculation elles vont avec la charge ; pour les changer, on édite la ligne.
   Une ligne non comprise, ambiguë ou une consigne n'est jamais touchée. */
import { parseLine, rewriteLine, type LineEdits, type Token } from "./exerciseParser";
import { adjustParsedLine } from "./sessionLevers";
import { adjustDifficulty } from "./loadAdjust";

export interface ChargeAdjust { inten: number; vol: number }
export type ChargePreset = "deload" | "maintien" | "surcharge";

export const NO_ADJUST: ChargeAdjust = { inten: 0, vol: 0 };
export const CHARGE_PRESETS: Record<ChargePreset, ChargeAdjust> = {
  deload: { inten: -10, vol: -30 },
  maintien: { inten: 0, vol: 0 },
  surcharge: { inten: 5, vol: 0 },
};

export const isNoAdjust = (a: ChargeAdjust) => !a.inten && !a.vol;

export function presetOf(a: ChargeAdjust): ChargePreset | null {
  return (Object.keys(CHARGE_PRESETS) as ChargePreset[]).find(k => {
    const p = CHARGE_PRESETS[k];
    return p.inten === a.inten && p.vol === a.vol;
  }) ?? null;
}

const fmtN = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function intensityOnly(line: string, pct: number): string {
  if (!pct) return line;
  const p = parseLine(line);
  if (p.kind === "full" && !p.ambiguous) {
    const hasKg = p.schemes.some(sc => sc.items.some(it => it.ref));
    // %1RM / %FTP… sans charge en kg : l'intensité ajoute des points (65 % + 5 = 70 %), au demi-point.
    if (!hasKg && p.pct != null && p.pctRefs) {
      const d = Math.round(pct * 2) / 2;
      const edits: LineEdits = new Map();
      const put = (ref: NonNullable<typeof p.pctRefs>[0], v: number) => { const o = (edits.get(ref.t) as Record<number, string> | undefined) || {}; o[ref.gi] = fmtN(Math.max(1, v)); edits.set(ref.t, o); };
      put(p.pctRefs[0], p.pct + d);
      if (p.pctRefs[1] && p.pct2 != null) put(p.pctRefs[1], p.pct2 + d);
      return rewriteLine(p, edits);
    }
    // Allure : vitesse +pct % (4'30/km à +5 % = 4'17/km), à la seconde.
    const pace = p.extras.find(x => x.k === "pace");
    if (!hasKg && pace?.sec != null && pace.ref && pace.ref2) {
      const sec = Math.max(60, Math.round(pace.sec / (1 + pct / 100)));
      if (sec === pace.sec) return line;
      const edits: LineEdits = new Map();
      if (pace.ref.t === pace.ref2.t) edits.set(pace.ref.t, { [pace.ref.gi]: String(Math.floor(sec / 60)), [pace.ref2.gi]: String(sec % 60).padStart(2, "0") });
      else { edits.set(pace.ref.t, { [pace.ref.gi]: String(Math.floor(sec / 60)) }); edits.set(pace.ref2.t, { [pace.ref2.gi]: String(sec % 60).padStart(2, "0") }); }
      return rewriteLine(p, edits);
    }
  }
  const r = adjustParsedLine(p, pct, { mode: "loads" });
  if (r.why === "load+" || r.why === "load-" || r.why === "int") return r.text;
  // Seule intensité écrite = un RPE / RIR : un cran par tranche de 5 %.
  if (p.kind === "full" && !p.ambiguous && p.rpe && Math.abs(pct) >= 5) {
    const step = Math.max(1, Math.round(Math.abs(pct) / 10)) * Math.sign(pct) * (p.rpe.k === "RIR" ? -1 : 1);
    const v = Math.max(p.rpe.k === "RIR" ? 0 : 1, Math.min(10, p.rpe.v + step));
    if (v !== p.rpe.v) return rewriteLine(p, new Map([[p.rpe.ref.t, { [p.rpe.ref.gi]: String(v) }]]));
  }
  return line;
}

function volumeOnly(line: string, pct: number): string {
  if (!pct) return line;
  const p = parseLine(line);
  if (p.kind !== "full" || p.ambiguous) return line;
  const f = 1 + pct / 100;
  const edits: LineEdits = new Map();
  const put = (t: Token, gi: number, v: string) => {
    const o = (edits.get(t) as Record<number, string> | undefined) || {};
    o[gi] = v; edits.set(t, o);
  };
  // 1. Séries (y compris intervalles, tours, « 3x75kg »)
  const sc = [...p.schemes].reverse().find(s => s.setsRef && s.sets);
  const sub = [...p.schemes.flatMap(s => s.items)].reverse().find(it => it.kind === "sub" && it.nRef && it.n);
  if (sc?.setsRef) {
    const n = Math.max(1, Math.round(sc.sets! * f));
    if (n !== sc.sets) put(sc.setsRef.t, sc.setsRef.gi, String(n));
  } else if (sub?.nRef) {
    const n = Math.max(1, Math.round(sub.n! * f));
    if (n !== sub.n) put(sub.nRef.t, sub.nRef.gi, String(n));
  } else {
    // 2. Durée simple (« 45 min », « 30s »), unité conservée
    const timed = p.schemes.find(s => s.secRef);
    const dist = p.toks.find(t => t.k === "dist");
    if (timed?.secRef) {
      const src = timed.secRef.t.g[timed.secRef.gi] || "";
      const m = src.match(/\d+(?:[.,]\d+)?/);
      if (m) {
        const v = parseFloat(m[0].replace(",", ".")), step = v >= 20 ? 5 : 1;
        const n = Math.max(step, Math.round((v * f) / step) * step);
        if (n !== v) put(timed.secRef.t, timed.secRef.gi, src.replace(m[0], fmtN(n)));
      }
    } else if (dist && dist.g[0]) {
      // 3. Distance (« 5 km », « 800 m »)
      const v = parseFloat(dist.g[0].replace(",", ".")), km = /k/i.test(dist.g[1] || "");
      const step = km ? 0.5 : v >= 1000 ? 100 : 50;
      const n = Math.max(step, Math.round((v * f) / step) * step);
      if (n !== v) put(dist, 0, fmtN(n));
    }
  }
  return edits.size ? rewriteLine(p, edits) : line;
}

export function adjustLineCharge(line: string, a: ChargeAdjust): string {
  if (!line.trim() || isNoAdjust(a)) return line;
  return volumeOnly(intensityOnly(line, a.inten), a.vol);
}

export function adjustNotesCharge(notes: string | null | undefined, a: ChargeAdjust): string | null {
  if (!notes) return notes ?? null;
  return notes.split("\n").map(l => adjustLineCharge(l, a)).join("\n");
}

/** Jauge de difficulté prévue : l'intensité compte plein, le volume pour moitié. */
export function adjustDifficultyCharge(diff: number, a: ChargeAdjust): number {
  return adjustDifficulty(diff, Math.max(-50, Math.min(50, a.inten + a.vol / 2)));
}
