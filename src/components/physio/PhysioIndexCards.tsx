"use client";

import { useState } from "react";
import type { ExtraIndexCard } from "@/components/conseils/IndexCards";
import MetricChart from "@/components/conseils/MetricChart";
import type { ChartSpec } from "@/lib/metricCards";
import { HEART_CALIBRATION, HEART_FAMILY_LABEL, PHYSIO_MIN_DAYS, heartFamily, matchWorkout, physioVerdictAt, type HeartFamily, type HeartResult, type PhysioVerdict } from "@/lib/physioCompare";
import { requestPhysioReplay, type PhysioData } from "@/lib/physioData";
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
/* `chartDays` (2026-10-17) : fenêtre du chart déplié, pilotée par le toggle 7/28/90 partagé des cartes
   d'indice. Statut, impact et aperçu restent sur leur fenêtre propre (42 j / 7 j). */
export function heartIndexCard(physio: PhysioData | null | undefined, referenceDate: string, chartDays = 42): ExtraIndexCard | null {
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

  // Chart (2026-10-17) : lecture horizontale, un trait vertical par séance entre le ressenti (point
  // plein) et ce qu'a mesuré la fréquence cardiaque (point vide). Séances en calibrage : ressenti seul.
  const chartDates = dayRange(referenceDate, chartDays);
  const byDate = new Map<string, { id: string; name: string | null; r: HeartResult; rpe: number }>();
  physio.sessions
    .filter(s => s.date <= referenceDate && s.date >= chartDates[0] && physio.heart[s.id] && s.rpe != null)
    .forEach(s => byDate.set(s.date, { id: s.id, name: s.name ?? null, r: physio.heart[s.id], rpe: s.rpe as number }));
  return {
    key: "heart", label: "Ressenti vs physiologie", status, statusColor: color, value: fmtGap(avgGap), accent, impact,
    trend: harder ? `${harder} séance${harder > 1 ? "s" : ""} sur ${recent.length}` : `${recent.length} séances`,
    preview: <GapBars values={ok.slice(-8).map(x => ({ v: x.r.gap, color: x.r.verdict === "harder" ? HARDER : x.r.verdict === "easier" ? EASIER : MID }))} />,
    rangeToggle: true,
    body: <HeartPairChart dates={chartDates} byDate={byDate} />,
  };
}

/* ── Ressenti vs physiologie, par type de séance (2026-10-23) ──
   Ce qui restait de la puce « Charge cardiaque », fusionnée dans « Ressenti vs physiologie » (Gildas) :
   la lecture STRUCTURELLE, sous le chart séance par séance. Rapport TRIMP / charge ressentie
   (RPE × durée) par famille de séance (heartFamily), sur les séances mesurées de la fenêtre. Affiché
   seulement avec au moins 3 séances dans chacune de 2 familles ; phrase seulement si une famille charge
   le cœur au moins 2 fois moins que l'autre à ressenti égal. */
const FAMILY_TITLE: Record<HeartFamily, string> = { force: "FORCE", cardio: "COURSE & CARDIO", autre: "AUTRES" };
const FAMILY_WORD: Record<HeartFamily, string> = { force: "de force", cardio: "de course et cardio", autre: "autres" };

export function heartFamilyCards(physio: PhysioData | null | undefined, referenceDate: string, chartDays = 28): React.ReactNode | null {
  if (!physio || !referenceDate) return null;
  const dates = dayRange(referenceDate, chartDays);
  const fam = new Map<HeartFamily, { ua: number; trimp: number; n: number }>();
  physio.sessions
    .filter(s => s.done && s.rpe != null && s.duration != null && s.date >= dates[0] && s.date <= referenceDate)
    .forEach(s => {
      const w = matchWorkout(s, physio.workouts);
      if (!w || w.trimp == null) return;
      const k = heartFamily(w.workout_type);
      const f = fam.get(k) ?? { ua: 0, trimp: 0, n: 0 };
      f.ua += (s.rpe as number) * (s.duration as number); f.trimp += w.trimp; f.n += 1;
      fam.set(k, f);
    });
  const rows = Array.from(fam.entries()).filter(([, f]) => f.n >= 3 && f.ua > 0)
    .map(([k, f]) => ({ k, r: f.trimp / f.ua, n: f.n, avg: f.trimp / f.n }))
    .sort((a, b) => b.r - a.r);
  if (rows.length < 2) return null;
  const top = rows[0];
  const times = (r: number) => (Math.round((top.r / r) * 2) / 2).toString().replace(".", ",");
  const low = rows[rows.length - 1];
  const sentence = top.r / low.r >= 2
    ? `À ressenti égal, tes séances ${FAMILY_WORD[low.k]} chargent ton cœur ${times(low.r)} fois moins que tes séances ${FAMILY_WORD[top.k]}. La fréquence cardiaque mesure mal certains efforts (sprints courts, charges lourdes) : pour ces séances, ton ressenti reste la référence.`
    : null;
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono), monospace" };
  return (
    <div style={{ marginTop: 14 }}>
      {sentence && <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "rgba(255,255,255,.8)", marginBottom: 10 }}>{sentence}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {rows.map(x => {
          const k = top.r / x.r;
          return (
            <div key={x.k} style={{ background: "rgba(255,255,255,.05)", borderRadius: 12, padding: "8px 10px" }}>
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,.6)" }}>{FAMILY_TITLE[x.k]} · {x.n} SÉANCES</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, color: "#fff" }}>{x === top || k < 1.5 ? "Cœur ≈ ressenti" : `Cœur ${times(x.r)}× plus bas`}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 2 }}>TRIMP moyen {Math.round(x.avg)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const diffWord = (d: number) => (d >= 7.5 ? "très dure" : d >= 4.5 ? "dure" : d >= 2.5 ? "modérée" : "légère"); // mots de Foster, voir qualitativeDifficulty
const diffColor = (d: number) => (d >= 7.5 ? "#ff8a55" : d >= 4.5 ? "#ffd27a" : "#6ede8a");

function HeartPairChart({ dates, byDate }: { dates: string[]; byDate: Map<string, { id: string; name: string | null; r: HeartResult; rpe: number }> }) {
  const [picked, setPicked] = useState<number | null>(() => {
    for (let i = dates.length - 1; i >= 0; i--) if (byDate.get(dates[i])?.r.kind === "ok") return i;
    return null;
  });
  const at = (i: number) => byDate.get(dates[i]);
  const spec: ChartSpec = {
    values: dates.map(d => byDate.get(d)?.rpe ?? null), dates, kind: "pairs", lo: 1, hi: 10,
    values2: dates.map(d => { const r = byDate.get(d)?.r; return r?.kind === "ok" ? r.predicted : null; }),
    pairColorAt: i => { const r = at(i)?.r; return r?.kind === "ok" ? (r.verdict === "harder" ? HARDER : r.verdict === "easier" ? EASIER : MID) : MID; },
    zones: [
      { from: 1, to: 4.5, color: EASIER, label: "LÉGÈRE" },
      { from: 4.5, to: 7.5, color: "#ffd27a", label: "MODÉRÉE" },
      { from: 7.5, to: 10.01, color: HARDER, label: "DURE" },
    ],
    showTicks: false, fmt: v => diffWord(v), colorAt: diffColor,
    tooltipExtra: i => { const r = at(i)?.r; return r?.kind === "ok" ? `Mesuré : ${diffWord(r.predicted)}` : "En calibrage"; },
  };
  const cur = picked != null ? at(picked) : undefined;
  return (
    <div>
      <MetricChart spec={spec} height={200} weekLabels={dates.length > 7} picked={picked} onPick={setPicked} />
      <Legend items={[{ dot: "#ff8a55", label: "Ressenti" }, { hollow: true, label: "Mesuré" }, { dot: "rgba(255,255,255,.3)", label: "En calibrage" }]} />
      {cur && picked != null && (
        <DetailBox
          date={dates[picked]} sub={cur.name}
          title={cur.r.kind === "ok" ? (cur.r.verdict === "harder" ? "Plus dure que mesuré" : cur.r.verdict === "easier" ? "Plus facile que mesuré" : "D'accord") : "En calibrage"}
          titleColor={cur.r.kind === "ok" ? (cur.r.verdict === "harder" ? HARDER : cur.r.verdict === "easier" ? EASIER : NEUTRAL) : MID}
          text={cur.r.kind === "ok"
            ? `Ressenti ${diffWord(cur.rpe)} · mesuré ${diffWord(cur.r.predicted)}`
            : `Ressenti ${diffWord(cur.rpe)} · séance ${cur.r.have + 1}/${HEART_CALIBRATION}${HEART_FAMILY_LABEL[cur.r.family] ? ` ${HEART_FAMILY_LABEL[cur.r.family]}` : ""} avec fréquence cardiaque`}
          onOpen={cur.r.kind === "ok" ? () => requestPhysioReplay({ kind: "session", sessionId: cur.id }) : undefined}
        />
      )}
    </div>
  );
}

function Legend({ items }: { items: { dot?: string; hollow?: boolean; label: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: "rgba(255,255,255,.7)" }}>
      {items.map(it => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={it.hollow ? { width: 7, height: 7, borderRadius: "50%", border: "2px solid #fff" } : { width: 9, height: 9, borderRadius: "50%", background: it.dot }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const dateFr = (iso: string) => { const d = new Date(iso + "T12:00:00"); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

function DetailBox({ date, sub, title, titleColor, text, onOpen }: { date: string; sub?: string | null; title: string; titleColor: string; text: string; onOpen?: () => void }) {
  return (
    <div style={{ marginTop: 10, background: "rgba(255,255,255,.07)", borderRadius: 12, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "rgba(255,255,255,.55)" }}>{dateFr(date)}{sub ? ` · ${sub}` : ""}</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: titleColor }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,.7)", marginTop: 1 }}>{text}</div>
      </div>
      {onOpen && (
        <button onClick={onOpen} style={{ flex: "none", border: "none", background: "none", cursor: "pointer", color: "#ff9a6a", fontSize: 12.5, fontWeight: 800, padding: 0 }}>Ouvrir ›</button>
      )}
    </div>
  );
}

/* ── Ressenti vs physiologie ── */
export function physioIndexCard(physio: PhysioData | null | undefined, referenceDate: string, chartDays = 28): ExtraIndexCard | null {
  if (!physio || !referenceDate) return null;
  const dates = dayRange(referenceDate, 28);
  const checkins = physio.checkins.filter(c => c.bedtime != null);
  const verdicts = new Map<string, PhysioVerdict>();
  const chartDates = dayRange(referenceDate, chartDays);
  (chartDays > dates.length ? chartDates : dates).forEach(d => {
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
  return {
    key: "physio", label: "Ressenti vs physiologie", status: latest.status, statusColor: color,
    accent: latest.kind === "less" ? LESS : null,
    impact: `${latest.title}. ${latest.text}`,
    trend: `${agree}/${week.length} jours d'accord`,
    preview: <GapBars values={week.map(d => { const v = verdicts.get(d)!; return { v: v.diff, color: colorOf(v.kind) }; })} />,
    rangeToggle: true,
    body: <RecoveryPairChart dates={chartDates} verdicts={verdicts} />,
  };
}

const zWord = (z: number) => (z <= -0.5 ? "sous ta norme" : z >= 0.5 ? "au-dessus de ta norme" : "dans ta norme");
const clampZ = (z: number) => Math.max(-2.5, Math.min(2.5, z));

function RecoveryPairChart({ dates, verdicts }: { dates: string[]; verdicts: Map<string, PhysioVerdict> }) {
  const [picked, setPicked] = useState<number | null>(() => {
    for (let i = dates.length - 1; i >= 0; i--) if (verdicts.has(dates[i])) return i;
    return null;
  });
  const colorOf = (k: PhysioVerdict["kind"]) => (k === "less" ? LESS : k === "more" ? MORE : MID);
  const spec: ChartSpec = {
    values: dates.map(d => { const v = verdicts.get(d); return v ? clampZ(v.zFeel) : null; }),
    values2: dates.map(d => { const v = verdicts.get(d); return v ? clampZ(v.zPhysio) : null; }),
    dates, kind: "pairs", lo: -2.5, hi: 2.5,
    pairColorAt: i => { const v = verdicts.get(dates[i]); return v ? colorOf(v.kind) : MID; },
    zones: [
      { from: -2.5, to: -0.5, color: LESS, label: "MOINS BIEN" },
      { from: -0.5, to: 0.5, color: "rgba(255,255,255,.55)", label: "TA NORME" },
      { from: 0.5, to: 2.51, color: MORE, label: "MIEUX" },
    ],
    bandZones: ["TA NORME"], neutralBand: true, showTicks: false,
    fmt: v => zWord(v), colorAt: () => MORE,
    tooltipExtra: i => { const v = verdicts.get(dates[i]); return v ? `Mesuré : ${zWord(v.zPhysio)}` : null; },
  };
  const cur = picked != null ? verdicts.get(dates[picked]) : undefined;
  return (
    <div>
      <MetricChart spec={spec} height={200} weekLabels={dates.length > 7} picked={picked} onPick={setPicked} />
      <Legend items={[{ dot: MORE, label: "Ressenti" }, { hollow: true, label: "Mesuré" }]} />
      {cur && picked != null && (
        <DetailBox
          date={dates[picked]}
          title={cur.kind === "less" ? "Mesures moins bonnes que ton ressenti" : cur.kind === "more" ? "Mesures meilleures que ton ressenti" : "D'accord"}
          titleColor={cur.kind === "agree" ? NEUTRAL : colorOf(cur.kind)}
          text={`Ressenti ${zWord(cur.zFeel)}, mesuré ${zWord(cur.zPhysio)}.`}
          onOpen={() => requestPhysioReplay({ kind: "wellness", date: dates[picked] })}
        />
      )}
    </div>
  );
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
