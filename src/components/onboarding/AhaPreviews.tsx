"use client";

import { useEffect, useState } from "react";
import DecisionRing, { decisionRingState } from "@/components/sessions/DecisionRing";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import MetricChart from "@/components/conseils/MetricChart";
import HomeTabs from "@/components/today/HomeTabs";
import AlertBox from "@/components/calendar/AlertBox";
import DiffGauge from "@/components/calendar/DiffGauge";
import CoachRadar, { type RadarPoint } from "@/components/coach/CoachRadar";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, suggestionSeverityColor, pctToPoints, zoneRange } from "@/lib/autoregulation";
import { adjustDifficulty } from "@/lib/loadAdjust";
import { ExerciseLineView, SessionSynthesis, exerciseViews } from "@/components/sessions/ExerciseLineView";
import { AGG_BANDS, chartSpecFor, type AggBand } from "@/lib/metricCards";
import { BEHAVIOR_META } from "@/lib/behaviors";
import type { DayPoint } from "@/lib/fatigueSignature";
import { DARK_CARD_BG } from "@/lib/theme";

/* Illustrations de l'AHA (DecisionStep, 2026-10-07, POC https://claude.ai/artifact/QpGXUusZ3mTYRPB63WDrK3) :
   les composants ACTUELS de l'app (onglet Récupération, jauge de décision ronde, ligne Phase, chart
   de Forme, radar et liste Charge du Coach Control), alimentés par des données d'exemple passées
   dans le VRAI moteur de reco (syntheticBaselineFor + computeAutoregSuggestion) — jamais une reco
   écrite à la main. Lecture seule, rien n'est cliquable. Scores calibrés le 2026-10-07 :
   55 (relatif ~22, Fatigué) + séance à 8 → Alléger −2 ; 50 + séance à 9 → Alléger −2. */

const noop = () => {};
const bandAt = (bands: AggBand[], pos: number) => bands.find(b => pos >= b.from && pos < b.to) ?? bands[bands.length - 1];

/* Fond sombre de l'app : la colonne d'illustration du desktop est claire (#f1f0ee), ces
   composants sont dessinés pour le fond sombre. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: DARK_CARD_BG, borderRadius: 24, border: "1px solid rgba(255,255,255,.10)", padding: "20px 16px 22px", color: "#fff", pointerEvents: "none", maxWidth: 520, margin: "0 auto", boxShadow: "0 24px 60px rgba(0,0,0,.28)" }}>
      {children}
    </div>
  );
}

/* Rejoue une valeur de 0 à 1 à l'arrivée (jauges qui se posent, courbe qui se dessine). */
function useProgress(ms: number, delay = 200) {
  const [k, setK] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t = setTimeout(() => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        setK(1 - Math.pow(1 - p, 3));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [ms, delay]);
  return k;
}

const chip: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
  padding: "6px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.85)",
};

/* ── Sportif 1 · ta forme du jour : l'onglet Récupération ──────────────────────────────────── */
const ATHLETE_SCORE = 55;
const ATHLETE_PLANNED = 8;

export function AhaRecoveryPreview() {
  const k = useProgress(1100);
  const rel = (syntheticBaselineFor(ATHLETE_SCORE)?.relativeScore ?? 22) / 100;
  const pos = 0.5 + (rel - 0.5) * k;
  const recup = AGG_BANDS.recup, charge = AGG_BANDS.charge;
  return (
    <Panel>
      <HomeTabs active="recuperation" onChange={noop} previews={{
        today: { value: ATHLETE_PLANNED, zoneLow: ATHLETE_PLANNED, zoneHigh: ATHLETE_PLANNED, planned: true },
        charge: { pos: 0.52, band: bandAt(charge, 0.52) },
        recuperation: { pos: rel, band: bandAt(recup, rel) },
      }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <AggregateGauge pos={pos} band={bandAt(recup, pos)} bands={recup} />
      </div>
      <p style={{ fontSize: 17.5, lineHeight: 1.35, fontWeight: 600, textAlign: "center", maxWidth: 420, margin: "12px auto 0" }}>
        Ta récupération est sous ta norme : ton sommeil tire vers le bas.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 16 }}>
        {["Sommeil ↓", "Stress →", "État physique ↓", "Motivation →"].map(l => <span key={l} style={chip}>{l}</span>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 8 }}>
        {(["late_sleep", "alcohol", "hydration"] as const).map(b => {
          const m = BEHAVIOR_META[b];
          return (
            <span key={b} style={{ ...chip, ...(m.positive
              ? { background: "rgba(47,158,68,.16)", borderColor: "rgba(47,158,68,.4)", color: "#8fe0b0" }
              : { background: "rgba(212,64,0,.16)", borderColor: "rgba(212,64,0,.4)", color: "#ffb38e" }) }}>
              {m.emoji} {m.label}
            </span>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── Sportif 2 / Coach 2 · l'ajustement : jauge de décision ronde ──────────────────────────── */
const DEMO_SESSION_LINES = ["Back squat — 5×5 @ 120 kg", "Fentes bulgares — 3×8 @ 24 kg", "Sprint 30 m — 6 reps", "Gainage — 3×45 s"];

export function AhaDecisionPreview({ name }: { name?: string }) {
  const score = name ? 50 : ATHLETE_SCORE;
  const planned = name ? 9 : ATHLETE_PLANNED;
  const baseline = syntheticBaselineFor(score);
  const sug = computeAutoregSuggestion(score, planned, baseline);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 1400);
    const b = setTimeout(() => setStep(2), 2300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (!sug) return null;
  const target = Math.round(planned + pctToPoints(sug.reco));
  const { zoneLow, zoneHigh } = zoneRange(target, sug.dir);
  const color = suggestionSeverityColor(sug);
  const verb = sug.dir === "low" ? "⬇ Alléger" : "⬆ Surcharger";
  const applied = step === 2;
  const btn: React.CSSProperties = { borderRadius: 12, padding: "9px 16px", fontSize: 12, fontWeight: 900, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.12)", color: "#fff", transition: "transform .2s, background .3s" };
  return (
    <Panel>
      {name && (
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", textAlign: "center", marginBottom: 12 }}>{name}</div>
      )}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <DecisionRing
          readOnly onChange={noop} recoDir={sug.dir}
          zoneLow={zoneLow} zoneHigh={zoneHigh}
          value={step === 0 ? planned : target} plannedMarker={planned}
          hint={applied ? "Difficulté ajustée appliquée" : undefined}
        />
      </div>
      <AlertBox variant="darkColor" centered
        alert={{ border: `${color}66`, glow: color, text: `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, planned, name, baseline)}` }}
        actions={
          <div style={{ display: "flex", gap: 7, justifyContent: "center" }}>
              <span style={btn}>→ Maintenir</span>
              <span style={applied
                ? { ...btn, background: "rgba(47,158,68,.25)", borderColor: "rgba(47,158,68,.5)", color: "#8fe0b0" }
                : { ...btn, background: color, borderColor: color, transform: step === 1 ? "scale(.95)" : undefined }}>
                {applied ? "✓ Appliqué" : `${verb} →`}
              </span>
          </div>
        }
      />
      <div style={{ marginTop: 16, background: "#fff", color: "#171b1f", borderRadius: 24, padding: "16px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 15 }}>💪 Force · Bas du corps</span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 8px", borderRadius: 8, background: applied ? "#fff4e6" : "rgba(212,64,0,.10)", color: applied ? "#c25d00" : "#d44000" }}>
            {applied ? "Ajustée" : "Prévue"}
          </span>
        </div>
        <SessionSynthesis notes={DEMO_SESSION_LINES.join("\n")} adjustPct={applied ? sug.reco : null} style={{ marginBottom: 10 }} />
        <DiffGauge value={applied ? adjustDifficulty(planned, sug.reco) : planned} height={10} />
        <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
          {exerciseViews(DEMO_SESSION_LINES, applied ? sug.reco : null).map((v, i) => (
            <div key={i} style={{ padding: "8px 10px", borderRadius: 12, background: "#f7f8f9" }}>
              <ExerciseLineView text={v.text} original={v.original} ctx={v.ctx} />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ── Sportif 3 · pics de forme : ligne Phase + chart de Forme ──────────────────────────────── */
/* Navigue entre Fatigué et Équilibré avant d'entrer dans Frais (2026-10-07, Gildas : pas une
   courbe droite). Bornes de zone de la Forme : ±8 %. */
const FORM_DEMO = [-12, -6, -13, -4, -10, -2, -11, 1, -8, 3, -12, -1, -9, 4, -5, 6, -10, 2, -6, 5, -3, 7, 1, 9, 6, 11, 10, 13];

export function AhaFormPeakPreview() {
  const k = useProgress(1600, 300);
  const today = new Date();
  const series = FORM_DEMO.map((v, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (FORM_DEMO.length - 1 - i));
    const date = d.toISOString().slice(0, 10);
    return { date, form: i < Math.max(1, Math.round(FORM_DEMO.length * k)) ? v : null } as unknown as DayPoint;
  });
  const spec = chartSpecFor("form", series, { sessionRef: null });
  return (
    <Panel>
      <AlertBox variant="darkColor" alert={{ border: "#2f9e4466", glow: "#2f9e44", text: "Phase · Supercompensation\nTa charge chronique monte et ta récupération suit : tu encaisses le travail, ta forme progresse." }} />
      <div style={{ marginTop: 16, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Forme</div>
            <div style={{ fontSize: 17.5, fontWeight: 700, marginTop: 4 }}>Frais · <span style={{ fontFamily: "var(--font-mono), monospace" }}>+13 %</span></div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "rgba(255,255,255,.6)", marginTop: 6, maxWidth: "30ch" }}>Ta forme progresse : la condition prend le dessus sur la fatigue.</div>
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, color: "#8fbdf0", whiteSpace: "nowrap" }}>↗ +25 pts / 28 j</div>
        </div>
        <div style={{ marginTop: 12 }}><MetricChart spec={spec} height={170} weekLabels /></div>
      </div>
    </Panel>
  );
}

/* ── Coach 1 · qui est en forme : le radar du Coach Control ────────────────────────────────── */
const RADAR_TEAM: { id: string; name: string; score: number; diff: number }[] = [
  { id: "lea", name: "Léa Girard", score: 45, diff: 8 },
  { id: "karim", name: "Karim Haddad", score: 50, diff: 9 },
  { id: "thomas", name: "Thomas Morel", score: 65, diff: 6 },
  { id: "nora", name: "Nora Lefebvre", score: 70, diff: 7 },
  { id: "sofia", name: "Sofia Renard", score: 85, diff: 3 },
];

export function AhaRadarPreview() {
  const [shown, setShown] = useState(0);
  const [withReco, setWithReco] = useState(false);
  useEffect(() => {
    const ts = RADAR_TEAM.map((_, i) => setTimeout(() => setShown(i + 1), 250 + i * 160));
    ts.push(setTimeout(() => setWithReco(true), 1600));
    return () => ts.forEach(clearTimeout);
  }, []);
  let decisions = 0;
  const points: RadarPoint[] = RADAR_TEAM.slice(0, shown).map(a => {
    const baseline = syntheticBaselineFor(a.score);
    const sug = computeAutoregSuggestion(a.score, a.diff, baseline);
    if (sug) decisions++;
    const showZone = withReco && !!sug;
    return {
      id: a.id, name: a.name, score: Math.round(baseline?.relativeScore ?? a.score), diff: a.diff,
      ring: decisionRingState([{ done: false, target_difficulty: a.diff }], showZone ? sug : null), hideZone: !showZone,
    };
  });
  return (
    <Panel>
      <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.75)" }}>
        Chaque sportif est placé selon sa récupération du jour et la difficulté de sa séance prévue. La bande montre ce que sa récupération peut encaisser : au-dessus, on allège ; en dessous, on peut pousser.
      </p>
      <CoachRadar points={points} onSelect={noop} />
      <div style={{ marginTop: 14, display: "flex", justifyContent: "center", borderRadius: 16, padding: "15px 18px", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, boxShadow: "0 10px 28px rgba(212,64,0,.35)", opacity: withReco ? 1 : 0, transition: "opacity .4s" }}>
        Passer en revue · {decisions} décision{decisions > 1 ? "s" : ""}
      </div>
    </Panel>
  );
}

/* ── Coach 3 · risques de l'équipe : onglet Charge en vue Groupe ───────────────────────────── */
const CHARGE_TEAM: { name: string; pos: number; value: string; insight: string; bars: number[] }[] = [
  { name: "Karim Haddad", pos: 0.82, value: "1,42", insight: "Charge récente très au-dessus de sa charge chronique : réduis le volume cette semaine.", bars: [3, 5, 6, 7, 8, 9, 9] },
  { name: "Léa Girard", pos: 0.7, value: "1,34", insight: "Sa charge monte vite depuis 5 jours : surveille sa récupération.", bars: [4, 4, 6, 6, 7, 8, 8] },
  { name: "Thomas Morel", pos: 0.52, value: "1,05", insight: "Sa charge récente suit sa charge chronique : il progresse sans s'exposer.", bars: [5, 4, 6, 5, 6, 5, 6] },
  { name: "Sofia Renard", pos: 0.3, value: "0,72", insight: "En dessous de sa zone optimale : elle a de la marge pour recharger.", bars: [3, 2, 0, 3, 2, 0, 3] },
];

export function AhaTeamChargePreview() {
  const k = useProgress(900);
  const bands = AGG_BANDS.charge;
  const sections = [...bands].reverse().map(b => ({ band: b, list: CHARGE_TEAM.filter(a => bandAt(bands, a.pos).label === b.label) })).filter(s => s.list.length);
  return (
    <Panel>
      {sections.map(({ band, list }) => (
        <div key={band.label} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: band.color, marginBottom: 8 }}>{band.label}</div>
          <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: "4px 0" }}>
            {list.map((a, i) => {
              const pos = 0.5 + (a.pos - 0.5) * k;
              return (
                <div key={a.name} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "11px 16px", borderTop: i ? "1px solid rgba(255,255,255,.08)" : "none", boxShadow: `inset 3px 0 0 ${band.color}` }}>
                  <AggregateGauge pos={pos} band={bandAt(bands, pos)} bands={bands} size={58} showLabel={false} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{a.name}</div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, color: band.color, marginTop: 3 }}>{band.label} · {a.value}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{a.insight}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 30, paddingTop: 6 }}>
                    {a.bars.map((v, j) => (
                      <i key={j} style={{ display: "block", width: 6, borderRadius: 2, background: band.color, opacity: v ? 0.85 : 0.2, height: Math.max(2, (v / 9) * 24 * k) }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Panel>
  );
}
