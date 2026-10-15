import type { ExtraIndexCard } from "@/components/conseils/IndexCards";
import MetricChart from "@/components/conseils/MetricChart";
import type { ChartSpec } from "@/lib/metricCards";
import { HEART_CALIBRATION, HEART_FAMILY_LABEL, PHYSIO_MIN_DAYS, physioVerdictAt, type HeartResult, type PhysioVerdict } from "@/lib/physioCompare";
import type { PhysioData } from "@/lib/physioData";
import { canReadHeart } from "@/lib/heartAccess";

/* Cartes d'indice "Ressenti vs cœur" (onglet Charge) et "Ressenti vs physiologie" (onglet
   Récupération), 2026-10-11. Même gabarit que les autres cartes (IndexCards, extraCards) et même
   chart (MetricChart) une fois dépliées. Absentes sans données physiologiques. Sportif uniquement
   (le coach ne lit pas health_* : RLS). */

const HARDER = "#ff8a55", EASIER = "#6ede8a", NEUTRAL = "#fff";
const LESS = "#ffb35c", MORE = "#6da7ec", MID = "rgba(255,255,255,.55)";
const fmtGap = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(1).replace(".", ",")}`;

type Ok = Extract<HeartResult, { kind: "ok" }>;

function dayRange(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shift(end, i - n + 1));
}

/* ── Ressenti vs cœur ── */
export function heartIndexCard(physio: PhysioData | null | undefined, referenceDate: string): ExtraIndexCard | null {
  if (!physio || !referenceDate) return null;
  const dates = dayRange(referenceDate, 42);
  const rows = physio.sessions
    .filter(s => s.date <= referenceDate && s.date >= dates[0] && physio.heart[s.id])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ date: s.date, r: physio.heart[s.id] }));
  if (!rows.length) {
    // Les séances arrivent mais pas encore leur FC (autorisation à donner dans l'app iPhone). Rien à
    // proposer tant que l'app utilisée ne sait pas demander la FC (heartAccess.ts).
    if (!canReadHeart()) return null;
    const hasWorkouts = physio.workouts.some(w => w.date >= dates[0] && w.date <= referenceDate && w.duration_min >= 10);
    if (!hasWorkouts) return null;
    return {
      key: "heart", label: "Ressenti vs physiologie", status: "En attente de fréquence cardiaque", statusColor: MID, accent: null,
      trend: "0 séance mesurée",
      impact: "Tes séances arrivent dans Santé, mais pas encore leur fréquence cardiaque. Ouvre l'app iPhone et autorise la lecture de la fréquence cardiaque dans Santé.",
      preview: <GapBars values={[]} />,
      body: <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>Dès que la fréquence cardiaque de tes séances arrive, chaque séance compare ton ressenti à tes données physiologiques (après {HEART_CALIBRATION} séances du même type).</div>,
    };
  }
  const ok = rows.filter((x): x is { date: string; r: Ok } => x.r.kind === "ok");

  if (!ok.length) {
    const last = rows[rows.length - 1].r;
    const have = last.kind === "calibrating" ? last.have : 0;
    const fam = HEART_FAMILY_LABEL[last.family];
    return {
      key: "heart", label: "Ressenti vs physiologie", status: "En calibrage", statusColor: MID,
      accent: null, trend: `${have}/${HEART_CALIBRATION} séances${fam ? ` ${fam}` : ""}`,
      impact: `Encore ${HEART_CALIBRATION - have} séance${HEART_CALIBRATION - have > 1 ? "s" : ""}${fam ? ` ${fam}` : ""} avec fréquence cardiaque et on pourra comparer ton ressenti à tes données physiologiques.`,
      preview: <GapBars values={[]} />,
      body: <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>Chaque séance avec fréquence cardiaque apprend la relation entre ton ressenti et tes données physiologiques. Le verdict arrive après {HEART_CALIBRATION} séances du même type.</div>,
    };
  }

  const recent = ok.slice(-4);
  const harder = recent.filter(x => x.r.verdict === "harder").length;
  const easier = recent.filter(x => x.r.verdict === "easier").length;
  const lastTwo = ok.slice(-2);
  const repeated = lastTwo.length === 2 && lastTwo.every(x => x.r.verdict === "harder") && lastTwo[0].r.family === lastTwo[1].r.family;
  const avgGap = recent.reduce((a, x) => a + x.r.gap, 0) / recent.length;
  const fam = HEART_FAMILY_LABEL[lastTwo[lastTwo.length - 1].r.family];
  let status = "D'accord", color = NEUTRAL, accent: string | null = null, impact: string;
  if (repeated || harder >= 2) {
    status = "Plus dur que mesuré"; color = HARDER; accent = HARDER;
    impact = `${repeated ? `Tes 2 dernières séances${fam ? ` ${fam}` : ""}` : `${harder} de tes ${recent.length} dernières séances`} t'ont paru plus dures que ce que mesurent tes données physiologiques : souvent le signe d'une fatigue qui s'installe.`;
  } else if (easier >= 2) {
    status = "Plus facile que mesuré"; color = EASIER;
    impact = "Tes données physiologiques mesurent plus d'effort que tu n'en ressens : signe de forme, ou effort sous-estimé.";
  } else {
    impact = "Ton ressenti suit tes données physiologiques : tes séances sont encaissées comme d'habitude.";
  }

  // Chart : un bâton par séance comparée, l'écart en points de RPE (au-dessus = plus dur que le cœur).
  const byDate = new Map<string, Ok>();
  ok.forEach(x => byDate.set(x.date, x.r));
  const spec: ChartSpec = {
    values: dates.map(d => { const g = byDate.get(d)?.gap; return g == null ? null : Math.max(-3, Math.min(3, g)); }), dates, kind: "bars", lo: -3, hi: 3, barsFrom: 0,
    zones: [
      { from: -99, to: -1, color: EASIER, label: "PLUS FACILE" },
      { from: -1, to: 1, color: MID, label: "D'ACCORD" },
      { from: 1, to: 99, color: HARDER, label: "PLUS DUR" },
    ],
    bandZones: ["D'ACCORD"], showTicks: false,
    fmt: fmtGap,
    colorAt: v => (v >= 1 ? HARDER : v <= -1 ? EASIER : MID),
    tooltipExtra: i => { const r = byDate.get(dates[i]); return r ? `Ressenti ${r.rpe} · mesuré ${Math.round(r.predicted)}` : null; },
  };
  return {
    key: "heart", label: "Ressenti vs physiologie", status, statusColor: color, value: fmtGap(avgGap), accent, impact,
    trend: harder ? `${harder} séance${harder > 1 ? "s" : ""} sur ${recent.length}` : `${recent.length} séances`,
    preview: <GapBars values={ok.slice(-8).map(x => ({ v: x.r.gap, color: x.r.verdict === "harder" ? HARDER : x.r.verdict === "easier" ? EASIER : MID }))} />,
    body: <MetricChart spec={spec} height={200} weekLabels />,
  };
}

/* ── Ressenti vs physiologie ── */
export function physioIndexCard(physio: PhysioData | null | undefined, referenceDate: string): ExtraIndexCard | null {
  if (!physio || !referenceDate) return null;
  const dates = dayRange(referenceDate, 28);
  const checkins = physio.checkins.filter(c => c.bedtime != null);
  const verdicts = new Map<string, PhysioVerdict>();
  dates.forEach(d => {
    const c = checkins.find(x => x.date === d);
    const v = c ? physioVerdictAt(d, c, checkins, physio.health) : null;
    if (v) verdicts.set(d, v);
  });
  const hasNights = physio.health.some(h => h.date >= dates[0] && (h.resting_hr != null || (h.sleep_minutes ?? 0) >= 180));
  if (!hasNights) return null;

  const week = dates.slice(-7).filter(d => verdicts.has(d));
  if (!week.length) {
    const n = Math.min(PHYSIO_MIN_DAYS, checkins.filter(c => c.date >= dates[0]).length);
    return {
      key: "physio", label: "Ressenti vs physiologie", status: "En collecte", statusColor: MID, accent: null,
      trend: `${n}/${PHYSIO_MIN_DAYS} jours`,
      impact: "Ton ressenti et tes données physiologiques sont chacun comparés à leur norme. Il faut quelques jours de check-ins et de nuits mesurées.",
      preview: <GapBars values={[]} />,
      body: <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>Le verdict arrive après {PHYSIO_MIN_DAYS} jours de check-ins avec une nuit mesurée.</div>,
    };
  }
  const latest = verdicts.get(week[week.length - 1])!;
  const agree = week.filter(d => verdicts.get(d)!.kind === "agree").length;
  const color = latest.kind === "less" ? LESS : latest.kind === "more" ? MORE : NEUTRAL;
  const colorOf = (k: PhysioVerdict["kind"]) => (k === "less" ? LESS : k === "more" ? MORE : MID);
  // Chart : écart données − ressenti, en écarts-types (au-dessus = données plus optimistes).
  const spec: ChartSpec = {
    values: dates.map(d => { const x = verdicts.get(d)?.diff; return x == null ? null : Math.max(-3, Math.min(3, x)); }), dates, kind: "bars", lo: -3, hi: 3, barsFrom: 0,
    zones: [
      { from: -99, to: -1, color: LESS, label: "DONNÉES MOINS OPTIMISTES" },
      { from: -1, to: 1, color: MID, label: "D'ACCORD" },
      { from: 1, to: 99, color: MORE, label: "DONNÉES PLUS OPTIMISTES" },
    ],
    bandZones: ["D'ACCORD"], showTicks: false,
    fmt: v => fmtGap(v),
    colorAt: v => (v >= 1 ? MORE : v <= -1 ? LESS : MID),
    tooltipExtra: i => verdicts.get(dates[i])?.status ?? null,
  };
  return {
    key: "physio", label: "Ressenti vs physiologie", status: latest.status, statusColor: color,
    accent: latest.kind === "less" ? LESS : null,
    impact: `${latest.title}. ${latest.text}`,
    trend: `${agree}/${week.length} jours d'accord`,
    preview: <GapBars values={week.map(d => { const v = verdicts.get(d)!; return { v: v.diff, color: colorOf(v.kind) }; })} />,
    body: <MetricChart spec={spec} height={200} weekLabels />,
  };
}

/* Aperçu : écarts en barres verticales centrées sur zéro. */
function GapBars({ values }: { values: { v: number; color: string }[] }) {
  const W = 118, H = 36, n = Math.max(values.length, 6), bw = Math.min(9, W / n - 4);
  const max = Math.max(2, ...values.map(x => Math.abs(x.v)));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} aria-hidden="true">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.2)" strokeWidth={1} />
      {values.map((x, i) => {
        const h = Math.max(2, (Math.abs(x.v) / max) * (H / 2 - 2));
        const cx = W - (values.length - i) * (W / n) + (W / n - bw) / 2;
        return <rect key={i} x={cx} y={x.v >= 0 ? H / 2 - h : H / 2} width={bw} height={h} rx={2.5} fill={x.color} />;
      })}
    </svg>
  );
}

function shift(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
