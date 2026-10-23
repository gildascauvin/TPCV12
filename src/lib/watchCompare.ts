import type { ChartSpec } from "@/lib/metricCards";
import type { DeviceDay } from "@/lib/deviceWellness";
import type { WellnessBaselineResult } from "@/lib/wellnessBaseline";

/* Ressenti vs montre dans la carte Récupération (2026-10-23, maquettes validées par Gildas :
   https://claude.ai/artifact/GoiHozJU7mGYmyv49LJEMp). Pour chaque sujet, deux courbes sur la même
   échelle : ce que le sportif déclare au check-in (trait plein) et ce que mesure sa montre (pointillé),
   chacune en ÉCART À SA NORME sur la fenêtre affichée (z : (valeur − moyenne) / écart-type), sinon
   une note sur 10 et des minutes ne se comparent pas. Toutes les séries sont orientées « plus haut =
   mieux » (stress et FC au repos inversés).

   Accord (règle simple, documentée ici) : corrélation de Pearson entre les deux séries de z, sur les
   jours où les deux existent (5 jours au moins, sinon rien n'est dit).
     • r ≥ 0,4 : « d'accord » ; r < 0,15 : « en désaccord » ; entre les deux : « en partie ».
     • Le plus grand écart cité est le jour où les deux s'opposent le plus nettement : signes
       contraires, chacun à au moins 0,5 écart-type de sa norme, et au moins 1,5 entre les deux. */

export type WatchPairKey = "score" | "sleep" | "stress" | "physique";

export type WatchPair = {
  key: WatchPairKey;
  deviceLabel: string;
  spec: ChartSpec;
  verdict: "agree" | "partial" | "disagree" | null;
  sentence: string | null;
  feltToday: string | null;
  deviceToday: string | null;
};

const FELT = "#93c5fd", DEVICE = "#fb923c";
const BAND = 0.5, LIM = 2.5;
const MONTH = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dayFr = (d: string) => { const x = new Date(d + "T12:00:00"); return `${x.getDate()} ${MONTH[x.getMonth()]}`; };
const hm = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m) % 60).padStart(2, "0")}`;

export function zOf(values: (number | null)[]): (number | null)[] {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 3) return values.map(() => null);
  const m = real.reduce((a, v) => a + v, 0) / real.length;
  const sd = Math.sqrt(real.reduce((a, v) => a + (v - m) ** 2, 0) / real.length);
  if (sd < 1e-6) return values.map(v => (v === null ? null : 0));
  return values.map(v => (v === null ? null : (v - m) / sd));
}

export function agreement(felt: (number | null)[], device: (number | null)[], dates: string[]) {
  const idx = felt.map((f, i) => (f !== null && device[i] !== null ? i : -1)).filter(i => i >= 0);
  if (idx.length < 5) return { verdict: null, r: null, gapDay: null as null | { date: string; deviceBetter: boolean } };
  const xs = idx.map(i => felt[i] as number), ys = idx.map(i => device[i] as number);
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
  const cov = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0);
  const vx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), vy = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const r = vx > 1e-9 && vy > 1e-9 ? cov / Math.sqrt(vx * vy) : 0;
  let gap: { i: number; d: number } | null = null;
  idx.forEach(i => {
    const f = felt[i] as number, d = device[i] as number;
    if (Math.sign(f) === Math.sign(d) || Math.abs(f) < BAND || Math.abs(d) < BAND || Math.abs(f - d) < 1.5) return;
    if (!gap || Math.abs(f - d) > gap.d) gap = { i, d: Math.abs(f - d) };
  });
  const g = gap as { i: number; d: number } | null;
  return {
    verdict: (r >= 0.4 ? "agree" : r < 0.15 ? "disagree" : "partial") as WatchPair["verdict"],
    r,
    gapDay: g ? { date: dates[g.i], deviceBetter: (device[g.i] as number) > (felt[g.i] as number) } : null,
  };
}

function sentenceOf(a: ReturnType<typeof agreement>): string | null {
  if (!a.verdict) return null;
  const head = a.verdict === "agree"
    ? "Ton ressenti et ta montre vont dans le même sens sur la période."
    : a.verdict === "partial" ? "Ton ressenti et ta montre se suivent en partie sur la période."
    : "Ton ressenti et ta montre se suivent peu sur la période.";
  const gap = a.gapDay ? ` Plus grand écart le ${dayFr(a.gapDay.date)} : ta montre te voyait ${a.gapDay.deviceBetter ? "mieux" : "moins bien"} que ton ressenti.` : "";
  return head + gap;
}

const lastReal = <T,>(xs: (T | null | undefined)[]): T | null => { for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return xs[i] as T; return null; };

/* `baseline` et `device` alignés sur `dates` (même fenêtre que le chart). */
export function watchPairs(baseline: (WellnessBaselineResult | null)[], device: DeviceDay[], dates: string[]): Partial<Record<WatchPairKey, WatchPair>> {
  const dims = (b: WellnessBaselineResult | null) => b?.dimensions ?? null;
  // Ressenti pur : la note déclarée (le sommeil "raw" mélange déjà la nuit mesurée), stress en 10 − stress.
  const sleepFelt = baseline.map(b => { const d = dims(b); return d ? (d.sleep.declared ?? d.sleep.raw) : null; });
  const stressFelt = baseline.map(b => dims(b)?.stress.raw ?? null);
  const physFelt = baseline.map(b => dims(b)?.recovery.raw ?? null);
  // Score ressenti = moyenne des 4 réponses (sans les données montre que le score de prod intègre).
  const scoreFelt = baseline.map(b => {
    const d = dims(b);
    if (!d) return null;
    return ((d.sleep.declared ?? d.sleep.raw) + d.stress.raw + d.recovery.raw + d.motivation.raw) * 2.5;
  });

  const build = (key: WatchPairKey, deviceLabel: string, felt: (number | null)[], dev: (number | null)[], invertDev: boolean, feltToday: string | null, deviceToday: string | null, feltFmt: (i: number) => string | null, devFmt: (i: number) => string | null): WatchPair | null => {
    if (dev.filter(v => v !== null).length < 3) return null;
    const fz = zOf(felt), dz = zOf(dev.map(v => (v === null ? null : invertDev ? -v : v)));
    const a = agreement(fz, dz, dates);
    const spec: ChartSpec = {
      values: fz, dates, kind: "line", lo: -LIM, hi: LIM, showTicks: false,
      lineColor: FELT, overlay: { values: dz, color: DEVICE },
      zones: [
        { from: -LIM, to: -BAND, color: "rgba(255,255,255,.28)", label: "MOINS BIEN" },
        { from: -BAND, to: BAND, color: "rgba(255,255,255,.5)", label: "DANS MA NORME" },
        { from: BAND, to: LIM, color: "rgba(255,255,255,.8)", label: "MIEUX" },
      ],
      bandZones: ["DANS MA NORME"], neutralBand: true,
      fmt: () => "", colorAt: () => FELT,
      tooltipExtra: i => [feltFmt(i) && `Ressenti ${feltFmt(i)}`, devFmt(i) && `${deviceLabel} ${devFmt(i)}`].filter(Boolean).join(" · ") || null,
    };
    // Le tooltip affiche les valeurs réelles (tooltipExtra) : pas de z brut en titre.
    spec.fmt = () => "";
    return { key, deviceLabel, spec, verdict: a.verdict, sentence: sentenceOf(a), feltToday, deviceToday };
  };

  const out: Partial<Record<WatchPairKey, WatchPair>> = {};
  const bb = device.map(d => d?.bbCharged ?? null);
  const sl = device.map(d => d?.sleepMin ?? null);
  const st = device.map(d => d?.stress ?? null);
  const hrv = device.map(d => d?.hrv ?? null);
  const rhr = device.map(d => d?.rhr ?? null);
  const f10 = (v: number | null) => (v == null ? null : `${Math.round(v * 10) / 10}/10`.replace(".", ","));

  const score = build("score", "Body Battery", scoreFelt, bb, false,
    lastReal(scoreFelt) != null ? `${Math.round(lastReal(scoreFelt) as number)}/100` : null,
    lastReal(bb) != null ? `+${Math.round(lastReal(bb) as number)} rechargés` : null,
    i => (scoreFelt[i] == null ? null : `${Math.round(scoreFelt[i] as number)}/100`),
    i => (bb[i] == null ? null : `+${Math.round(bb[i] as number)}`));
  if (score) out.score = score;

  const sleep = build("sleep", "Durée mesurée", sleepFelt, sl, false,
    f10(lastReal(sleepFelt)), lastReal(sl) != null ? hm(lastReal(sl) as number) : null,
    i => f10(sleepFelt[i]), i => (sl[i] == null ? null : hm(sl[i] as number)));
  if (sleep) out.sleep = sleep;

  const stress = build("stress", "Stress mesuré", stressFelt, st, true,
    lastReal(stressFelt) != null ? f10(10 - (lastReal(stressFelt) as number)) : null,
    lastReal(st) != null ? `${Math.round(lastReal(st) as number)}/100` : null,
    i => (stressFelt[i] == null ? null : f10(10 - (stressFelt[i] as number))), i => (st[i] == null ? null : `${Math.round(st[i] as number)}/100`));
  if (stress) out.stress = stress;

  const useHrv = hrv.filter(v => v !== null).length >= 3;
  const phys = useHrv
    ? build("physique", "VFC", physFelt, hrv, false, f10(lastReal(physFelt)), lastReal(hrv) != null ? `${Math.round(lastReal(hrv) as number)} ms` : null,
        i => f10(physFelt[i]), i => (hrv[i] == null ? null : `${Math.round(hrv[i] as number)} ms`))
    : build("physique", "FC au repos", physFelt, rhr, true, f10(lastReal(physFelt)), lastReal(rhr) != null ? `${Math.round(lastReal(rhr) as number)} bpm` : null,
        i => f10(physFelt[i]), i => (rhr[i] == null ? null : `${Math.round(rhr[i] as number)} bpm`));
  if (phys) out.physique = phys;
  return out;
}
