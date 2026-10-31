"use client";

import { useEffect, useState } from "react";
import DecisionRing, { decisionRingState } from "@/components/sessions/DecisionRing";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import MetricChart from "@/components/conseils/MetricChart";
import AlertBox from "@/components/calendar/AlertBox";
import DiffGauge from "@/components/calendar/DiffGauge";
import CoachRadar, { type RadarPoint } from "@/components/coach/CoachRadar";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, suggestionSeverityColor, pctToPoints, zoneRange } from "@/lib/autoregulation";
import { adjustDifficulty } from "@/lib/loadAdjust";
import { ExerciseLineView, SessionSynthesis, exerciseViews } from "@/components/sessions/ExerciseLineView";
import { adjustNotes } from "@/lib/sessionLevers";
import { AGG_BANDS, chartSpecFor, type AggBand } from "@/lib/metricCards";
import type { DayPoint } from "@/lib/fatigueSignature";
import { DARK_CARD_BG } from "@/lib/theme";

/* Illustrations de l'AHA (DecisionStep, 2026-10-07, POC https://claude.ai/artifact/QpGXUusZ3mTYRPB63WDrK3) :
   les composants ACTUELS de l'app (jauge de décision ronde, ligne Phase, chart de Forme, jauge de
   Charge, radar du Coach Control), alimentés par des données d'exemple passées
   dans le VRAI moteur de reco (syntheticBaselineFor + computeAutoregSuggestion) — jamais une reco
   écrite à la main. Lecture seule, rien n'est cliquable. Scores calibrés le 2026-10-07 :
   55 (relatif ~22, Fatigué) + séance à 8 → Alléger −2 ; 50 + séance à 9 → Alléger −2.
   2026-10-28 : le score de forme (onglet Récupération) et la liste Charge du groupe sont retirés,
   remplacés par les bilans en écran de synthèse (voir plus bas). */

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

const ATHLETE_SCORE = 55;
const ATHLETE_PLANNED = 8;

/* ── Sportif 2 / Coach 2 · l'ajustement : jauge de décision ronde ──────────────────────────── */
const DEMO_SESSION_LINES = ["Back squat — 5×5 @ 120 kg", "Fentes bulgares — 3×8 @ 24 kg", "Sprint 30 m — 6 reps", "Planche — 3×45 s"];

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
      {/* Anneau en grand + conseil sans encart, comme /today et la carte coach (2026-10-30, voir
          DecisionRing `fluid`) : le titre au centre est celui de l'app (position dans la zone, puis
          le hint décidé d'AutoregButtons une fois appliqué). */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
        <DecisionRing
          readOnly onChange={noop} recoDir={sug.dir}
          zoneLow={zoneLow} zoneHigh={zoneHigh}
          value={step === 0 ? planned : target} plannedMarker={planned}
          hideHint fluid glow={color}
          hint={applied ? (sug.dir === "low" ? "Allègement appliqué" : "Surcharge appliquée") : undefined}
        />
      </div>
      <AlertBox variant="bare"
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
  const chargePos = 0.5 + (0.52 - 0.5) * k;
  const chargeBand = bandAt(AGG_BANDS.charge, chargePos);
  return (
    <Panel>
      <AlertBox variant="darkColor" alert={{ border: "#2f9e4466", glow: "#2f9e44", text: "Phase · Supercompensation\nLe travail des dernières semaines monte et ta récupération suit : tu encaisses le travail, ta forme progresse." }} />
      <div style={{ marginTop: 16, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Forme</div>
            <div style={{ fontSize: 17.5, fontWeight: 700, marginTop: 4 }}>Forme en hausse</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "rgba(255,255,255,.6)", marginTop: 6, maxWidth: "30ch" }}>Ta forme progresse : la condition prend le dessus sur la fatigue.</div>
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, color: "#8fbdf0", whiteSpace: "nowrap" }}>↗ +25 pts / 28 j</div>
        </div>
        <div style={{ marginTop: 12 }}><MetricChart spec={spec} height={170} weekLabels /></div>
      </div>
      <div style={{ marginTop: 12, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: "12px 16px", display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 12, alignItems: "center" }}>
        <AggregateGauge pos={chargePos} band={chargeBand} bands={AGG_BANDS.charge} size={58} showLabel={false} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Charge · risque de blessure</div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12.5, fontWeight: 700, color: chargeBand.color, marginTop: 3 }}>{chargeBand.label} · 1,05</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,.6)", marginTop: 3 }}>Ton travail récent suit ton rythme habituel : tu progresses sans t&apos;exposer. Une alerte arrive si elle s&apos;emballe.</div>
        </div>
      </div>
    </Panel>
  );
}

/* ── Écran 1 (value_intro) · la séance du matin réécrite (2026-10-28) ─────────────────────────
   Remplace « Signal du jour » (score 52) : plus de score de forme avant l'inscription. Mêmes
   données que AhaDecisionPreview (même reco du vrai moteur, mêmes lignes réécrites par le vrai
   parseur), pour que l'écran 2 montre la même séance. */
export function AhaMorningCard({ isMd }: { isMd: boolean }) {
  const sug = computeAutoregSuggestion(ATHLETE_SCORE, ATHLETE_PLANNED, syntheticBaselineFor(ATHLETE_SCORE));
  if (!sug) return null;
  const lines = DEMO_SESSION_LINES.map(l => {
    const [name, rx] = l.split(" — ");
    return { name, before: rx, after: adjustNotes(l, sug.reco).text.split(" — ")[1] ?? rx };
  }).filter(l => l.after !== l.before).slice(0, 2);
  const kicker: React.CSSProperties = { fontSize: isMd ? 10 : 9, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" };
  return (
    <div style={{
      display: "inline-block", background: "rgba(24,24,24,.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: "1.5px solid rgba(255,255,255,.28)", borderRadius: 16, padding: isMd ? "14px 16px" : "10px 12px",
      maxWidth: isMd ? 270 : 214, boxShadow: "0 10px 28px rgba(0,0,0,.4)",
    }}>
      <div style={{ ...kicker, color: "#ff8a70", marginBottom: isMd ? 9 : 7 }}>Ce matin</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: isMd ? 10 : 8 }}>
        {["😴 Mal dormi", "💼 Stressé"].map(t => (
          <span key={t} style={{ fontSize: isMd ? 10 : 9, padding: "2px 7px", borderRadius: 999, background: "rgba(212,64,0,.22)", color: "#ffd2bf" }}>{t}</span>
        ))}
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,.12)", marginBottom: isMd ? 9 : 7 }} />
      <div style={{ ...kicker, color: "rgba(255,255,255,.5)", marginBottom: 5 }}>⬇ Séance allégée</div>
      {lines.map(l => (
        <div key={l.name} style={{ fontSize: isMd ? 12 : 11, color: "rgba(255,255,255,.85)", lineHeight: 1.45 }}>
          {l.name} <s style={{ color: "rgba(255,255,255,.4)" }}>{l.before}</s> <b style={{ color: "#ffb38e" }}>{l.after}</b>
        </div>
      ))}
    </div>
  );
}

/* ── Bilans en écran de synthèse (2026-10-28, POC H5zyp9dymAYsk3v1ZoTtGG) ─────────────────────
   Pas de story qui défile : les 3 étapes de l'AHA sont déjà minutées. Un seul écran, au style du
   BilanCarousel (cartes rgba .06, kickers mono) sans l'importer (module lourd, inscription). Textes
   et chiffres = ceux de la landing (sportif) et de la landing coach (groupe, au tutoiement). */
type SynthBlock = { kicker: string; color: string; text: string; extra?: React.ReactNode };

function BilanSynthesis({ title, kicker, headline, blocks }: { title: string; kicker: string; headline: React.ReactNode; blocks: SynthBlock[] }) {
  return (
    <Panel>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,.62)" }}>{kicker}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.14, fontWeight: 700, margin: "6px 0 14px" }}>
        {headline}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {blocks.map(b => (
          <div key={b.kicker} style={{ background: "rgba(255,255,255,.06)", borderRadius: 18, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: b.color }}>{b.kicker}</div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{b.text}</div>
            {b.extra}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SynthBar({ label, value, pct, color, k }: { label: string; value: string; pct: number; color: string; k: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,.78)" }}><span>{label}</span><b style={{ color: "#fff" }}>{value}</b></div>
      <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,.1)", overflow: "hidden" }}><div style={{ width: `${pct * k}%`, height: "100%", borderRadius: 5, background: color }} /></div>
    </div>
  );
}

/* Même codage que les Marks du bilan de groupe : plein = fait, demi-hauteur = fatigué, pointillé = manqué. */
function SynthMarks({ name, marks }: { name: string; marks: ("ok" | "tired" | "missed")[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr)", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,.78)" }}>
      <span>{name}</span>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 14 }} role="img" aria-label={marks.map(m => (m === "ok" ? "fait" : m === "tired" ? "fait, fatigué" : "manqué")).join(", ")}>
        {marks.map((m, i) => <div key={i} style={{ flex: 1, boxSizing: "border-box", borderRadius: 3, height: m === "tired" ? 7 : 14, background: m === "ok" ? "#fff" : m === "tired" ? "#f28a00" : "transparent", border: m === "missed" ? "1.5px dashed rgba(255,255,255,.55)" : "none" }} />)}
      </div>
    </div>
  );
}

export function AhaBilanPreview() {
  const k = useProgress(900);
  return (
    <BilanSynthesis title="Ton bilan du mois" kicker="APPRIS SUR TOI" headline={<>Ce qui pèse vraiment <span style={{ color: "#c79bf7" }}>sur tes séances.</span></>} blocks={[
      { kicker: "Ce qui te fatigue", color: "#c79bf7", text: "Une soirée te coûte plus qu'une séance très dure.", extra: <>
        <SynthBar k={k} label="Lendemain de séance très dure" value="68" pct={92} color="rgba(199,155,247,.4)" />
        <SynthBar k={k} label="Lendemain de soirée" value="62" pct={84} color="#a855f7" />
      </> },
      { kicker: "Ce qui te prédit", color: "#ff8a5c", text: "Le stress pèse sur tes séances de force.", extra:
        <SynthBar k={k} label="Plus dures que prévu, stressé" value="7 sur 9" pct={78} color="#ff6a2b" /> },
      { kicker: "Tes leviers", color: "#7ee08f", text: "Le stretching du soir te rend 24 min de nuit.", extra:
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Avec : 7h59 · Sans : 7h35</div> },
    ]} />
  );
}

export function AhaGroupBilanPreview() {
  const k = useProgress(900);
  return (
    <BilanSynthesis title="Bilan du groupe · semaine" kicker="BILAN DU GROUPE" headline={<>Ce qui se passe <span style={{ color: "#ff8a5c" }}>dans ton groupe.</span></>} blocks={[
      { kicker: "Qui décroche", color: "#ff8a5c", text: "Chloé ne fait plus son point forme. Hugo est souvent fatigué.", extra: <>
        <SynthMarks name="Chloé" marks={["ok", "ok", "ok", "missed", "missed", "missed", "missed"]} />
        <SynthMarks name="Hugo" marks={["tired", "ok", "tired", "tired", "ok", "tired", "ok"]} />
      </> },
      { kicker: "Tes séances", color: "#ffb347", text: "Tes séances modérées sont ressenties dures.", extra:
        <SynthBar k={k} label="Prévues modérées, plus dures" value="14 sur 20" pct={70} color="#f28a00" /> },
      { kicker: "Appris sur chacun", color: "#c79bf7", text: "Hugo : le stress pèse sur ses séances de force. Léa : une soirée se paie le lendemain." },
      { kicker: "Charge", color: "#8cc4f5", text: "Yanis monte trop vite. Allège avant la blessure.", extra:
        <SynthBar k={k} label="Jours au-dessus de sa zone" value="12 sur 26" pct={46} color="#38bdf8" /> },
    ]} />
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
