"use client";

/* Carrousel du bilan (2026-10-23, POC canvas Qx548NQG7ZrWgwQA28DYpp) : un écran par thème, façon
   story. Les chiffres viennent de computeBilan() (src/lib/bilan.ts), qui saute tout écran sous son
   seuil de données. Plein écran, au-dessus de la bottom nav (zIndex modale). */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { computeBilan, isSynthetic, periodFor, type Bilan, type BilanCheckin, type BilanPeriodKind, type BilanSession, type BilanSlide, type BilanTest } from "@/lib/bilan";

type Props = {
  userId: string;
  kind: BilanPeriodKind;
  /* Un jour de la période (n'importe lequel) ; pour « depuis le début », la date de fin. */
  anchor: string;
  today: string;
  source: "home_card" | "date_picker";
  onClose: () => void;
};

const GLOW: Record<BilanSlide["kind"], string> = {
  regularite: "rgba(212,64,0,0.45)", charge: "rgba(47,158,68,0.40)", ressenti: "rgba(56,189,248,0.38)",
  predit: "rgba(212,64,0,0.40)", biais: "rgba(242,138,0,0.40)", fatigue: "rgba(168,85,247,0.38)",
  leviers: "rgba(47,158,68,0.38)", tendance: "rgba(56,189,248,0.36)", tests: "rgba(212,64,0,0.45)", partage: "rgba(56,189,248,0.20)",
};
const KICKER: Record<BilanSlide["kind"], string> = {
  regularite: "RÉGULARITÉ", charge: "CHARGE", ressenti: "RESSENTI VS MONTRE", predit: "CE QUI TE PRÉDIT",
  biais: "TES BIAIS", fatigue: "CE QUI TE FATIGUE", leviers: "TES LEVIERS", tendance: "TENDANCE", tests: "TESTS", partage: "EN UNE CARTE",
};
const LEARNED = new Set<BilanSlide["kind"]>(["ressenti", "predit", "biais", "fatigue", "leviers"]);

const card: React.CSSProperties = { background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 10 };
const h2: React.CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontSize: 30, lineHeight: 1.12, fontWeight: 700, color: "#fff" };
const body: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" };
const small: React.CSSProperties = { fontSize: 13, color: "rgba(255,255,255,0.65)" };
const round = (x: number) => Math.round(x);

function Bars({ bars, height = 140, color = "#ff6a2b", dim = "rgba(255,255,255,0.28)", showValues = false }: { bars: { label: string; value: number; display: string; highlight?: boolean }[]; height?: number; color?: string; dim?: string; showValues?: boolean }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  const min = showValues ? Math.min(...bars.map(b => b.value)) * 0.8 : 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: bars.length > 12 ? 3 : 10, height: height + (showValues ? 40 : 22) }} role="img" aria-label={bars.map(b => `${b.label} ${b.display}`).join(", ")}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
          {showValues && <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{b.display}</div>}
          <div style={{ width: "100%", height: Math.max(4, ((b.value - min) / (max - min || 1)) * height), borderRadius: bars.length > 12 ? 3 : 7, background: b.highlight || !showValues ? color : dim }} />
          <div style={{ minHeight: 14, fontSize: 11, lineHeight: "14px", color: "rgba(255,255,255,0.5)", whiteSpace: bars.length <= 5 ? "normal" : "nowrap", textAlign: "center" }}>{bars.length <= 12 || (i > 0 ? bars[i - 1].label !== b.label : true) ? b.label : ""}</div>
        </div>
      ))}
    </div>
  );
}

function Rows({ rows, color }: { rows: { label: string; part: number; total: number; highlight?: boolean }[]; color: string }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.78)" }}><span>{r.label}</span><b style={{ color: "#fff" }}>{r.part} sur {r.total}</b></div>
          <div style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: `${Math.max(3, (r.part / r.total) * 100)}%`, height: "100%", borderRadius: 6, background: r.highlight ? color : "rgba(255,255,255,0.45)" }} /></div>
        </div>
      ))}
    </>
  );
}

function SlideBody({ s, bilan, onShare, shared }: { s: BilanSlide; bilan: Bilan; onShare: () => void; shared: boolean }) {
  switch (s.kind) {
    case "regularite": {
      const scope = bilan.period.kind === "week" ? "cette semaine" : bilan.period.kind === "month" ? "ce mois-ci" : "depuis le début";
      return (<>
        <h2 style={h2}>{s.sessions} séance{s.sessions > 1 ? "s" : ""}. {s.checkins} check-in{s.checkins > 1 ? "s" : ""}.{s.noGap && <><br /><span style={{ color: "#ff8a5c" }}>Zéro semaine sautée.</span></>}</h2>
        <div style={card}><div style={small}>Charge d'entraînement {bilan.period.kind === "week" ? "par jour" : "par semaine"}</div><Bars bars={s.bars} height={120} /></div>
        <p style={body}>Ton check-in rempli {s.checkins} matin{s.checkins > 1 ? "s" : ""} sur {s.days}, {scope}.</p>
      </>);
    }
    case "charge":
      return (<>
        <h2 style={h2}>{s.pctInZone >= 70 ? <>Tu t'entraînes dur, <span style={{ color: "#7ee08f" }}>sans t'enterrer.</span></> : <>Ta charge est sortie de ta zone <span style={{ color: "#ffb347" }}>{100 - s.pctInZone} % du temps.</span></>}</h2>
        <div style={{ position: "relative", width: 220, height: 220, alignSelf: "center" }}>
          <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label={`${s.pctInZone} % des jours dans la zone de charge`}>
            <circle cx="110" cy="110" r="88" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="20" />
            <circle cx="110" cy="110" r="88" fill="none" stroke="#2f9e44" strokeWidth="20" strokeLinecap="round" strokeDasharray={`${(s.pctInZone / 100) * 553} 553`} transform="rotate(-90 110 110)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><b style={{ fontSize: 48, lineHeight: 1, color: "#fff" }}>{s.pctInZone} %</b><span style={small}>des jours en zone</span></div>
        </div>
        <p style={body}>Ta charge des 7 derniers jours est restée dans ta zone optimale {s.pctInZone} % du temps{s.daysHigh ? `, et ${s.daysHigh} jour${s.daysHigh > 1 ? "s" : ""} au-dessus de la zone de risque.` : ", sans jamais passer dans la zone de risque."}</p>
      </>);
    case "ressenti":
      return (<>
        <h2 style={h2}>Ton ressenti <span style={{ color: "#8cc4f5" }}>vaut une montre.</span></h2>
        <div style={card}><div style={small}>Sommeil mesuré, selon la note que tu donnes au réveil</div><Bars bars={s.sleepBars} height={100} color="#6da7ec" dim="rgba(109,167,236,0.4)" showValues /></div>
        {s.crashes >= 3 && <div style={card}><div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>{s.crashesSeen === s.crashes ? `Les ${s.crashes} matins où ta VFC s'est effondrée, ton check-in l'avait vu aussi.` : `Sur les ${s.crashes} matins où ta VFC s'est effondrée, ton check-in l'avait vu ${s.crashesSeen} fois.`}</div></div>}
      </>);
    case "predit":
      return (<>
        <h2 style={h2}>Ce qui rend tes séances <span style={{ color: "#ff8a5c" }}>plus dures que prévu.</span></h2>
        {s.blocks.map((b, i) => <div key={i} style={card}><div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{b.title}</div><Rows rows={b.rows} color="#ff6a2b" /></div>)}
        <p style={{ ...body, fontSize: 14 }}>Séances ressenties plus dures que ce que tu avais prévu, selon ton check-in du matin.</p>
      </>);
    case "biais":
      return (<>
        <h2 style={h2}>Tes séances {s.name} <span style={{ color: "#ffb347" }}>sont plus dures que prévu.</span></h2>
        <div style={card}>
          <div style={small}>Prévu (trait) et ressenti (barre)</div>
          <div style={{ display: "flex", gap: 7, alignItems: "flex-end", height: 160 }} role="img" aria-label={`${s.harder} séances sur ${s.total} plus dures que prévu`}>
            {s.points.map((p, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ position: "relative", width: "100%", height: 130, display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: p.felt * 13, borderRadius: 6, background: p.felt > p.planned ? "#f28a00" : "rgba(255,255,255,0.3)" }} />
                  <div style={{ position: "absolute", left: -2, right: -2, bottom: p.planned * 13, height: 3, borderRadius: 2, background: "#fff" }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: s.accurate ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: 10 }}>
          <div style={{ ...card, gap: 2 }}><b style={{ fontSize: 26, color: "#ffb347" }}>{s.harder} / {s.total}</b><span style={small}>plus dures que prévu</span></div>
          {s.accurate && <div style={{ ...card, gap: 2 }}><b style={{ fontSize: 26, color: "#fff" }}>{s.accurate.ok} / {s.accurate.total}</b><span style={small}>{s.accurate.name} pas plus dures</span></div>}
        </div>
        <p style={{ ...body, fontSize: 14 }}>Conseil : prévois-les un cran plus haut.{s.accurate ? ` Tes séances ${s.accurate.name}, elles, tombent juste.` : ""}</p>
      </>);
    case "fatigue": {
      const bars = [
        ...(s.hard ? [{ label: "Séance facile", value: s.hard.easy, display: String(round(s.hard.easy)) }, { label: "Séance très dure", value: s.hard.hard, display: String(round(s.hard.hard)) }] : [{ label: "Ta norme", value: s.normScore, display: String(round(s.normScore)) }]),
        { label: "Soirée", value: s.nextScore, display: String(round(s.nextScore)), highlight: true },
        ...(s.afterScore !== null ? [{ label: "2 jours après une soirée", value: s.afterScore, display: String(round(s.afterScore)) }] : []),
      ];
      const hardFree = s.hard && Math.abs(s.hard.hard - s.hard.easy) < 5;
      const back = s.afterScore !== null && s.normScore - s.afterScore < 5;
      return (<>
        <h2 style={h2}>{hardFree ? <>Une séance très dure ne te coûte rien le lendemain. <span style={{ color: "#c79bf7" }}>Une soirée, si.</span></> : <>Une soirée (alcool ou sortie) <span style={{ color: "#c79bf7" }}>se paie le lendemain.</span></>}</h2>
        <div style={card}><div style={small}>Ta forme le lendemain de…, sur 100</div><Bars bars={bars} height={110} color="#a855f7" dim="rgba(199,155,247,0.35)" showValues /></div>
        <p style={body}>{s.hrv ? `Le lendemain d'une soirée (alcool ou sortie), ta VFC tombe de ${round(s.hrv.norm)} à ${round(s.hrv.next)} ms. ` : `Mesuré sur ${s.soirees} soirées (alcool ou sortie). `}{back ? "Le surlendemain, tout est revenu dans ta norme." : ""}</p>
      </>);
    }
    case "leviers": {
      const top = s.rows[0];
      return (<>
        <h2 style={h2}>{top.positive ? <>{top.label} <span style={{ color: "#7ee08f" }}>{s.unit === "sleep" ? `te rend ${top.delta.replace("+", "")} de nuit.` : `te fait gagner ${top.delta.replace("+", "")} de forme.`}</span></> : <>{top.label} <span style={{ color: "#ffb347" }}>{s.unit === "sleep" ? `te coûte ${top.delta.replace("−", "")} de nuit.` : `te coûte ${top.delta.replace("−", "")} de forme.`}</span></>}</h2>
        <div style={card}>
          <div style={small}>{s.unit === "sleep" ? "Sommeil mesuré" : "Forme du matin"}, hors soirées (alcool ou sortie)</div>
          {s.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.85)" }}><span>{r.label}</span><b style={{ color: r.positive ? "#7ee08f" : "#fff" }}>{r.delta}</b></div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Avec : {r.with} · Sans : {r.without}</div>
            </div>
          ))}
        </div>
        <p style={{ ...body, fontSize: 14 }}>Chacun a ses leviers. Garde ton énergie pour ceux qui marchent chez toi.</p>
      </>);
    }
    case "tendance": {
      const last = s.months[s.months.length - 1];
      return (<>
        <h2 style={h2}>{s.direction === "down" ? <>Ta forme baisse. {s.lateNights && <span style={{ color: "#8cc4f5" }}>Tes couchers reculent.</span>}</> : s.direction === "up" ? <>Ta forme <span style={{ color: "#7ee08f" }}>remonte.</span></> : <>Ta forme est <span style={{ color: "#8cc4f5" }}>stable.</span></>}</h2>
        <div style={card}><div style={small}>Forme moyenne par mois</div><Bars bars={s.months} height={90} color="#6da7ec" dim="rgba(109,167,236,0.45)" showValues /></div>
        {s.lateNights && <div style={card}><div style={small}>Couchers après minuit</div><Bars bars={s.lateNights} height={50} color="#f28a00" dim="rgba(109,167,236,0.45)" showValues /></div>}
        <p style={{ ...body, fontSize: 14 }}>{(() => { const peak = s.months.reduce((a, b) => (b.value > a.value ? b : a)); return peak !== last ? `Au plus haut en ${peak.label.replace(".", "")} (${peak.display}), ${last.display} en ${last.label.replace(".", "")}.` : `${last.display} en ${last.label.replace(".", "")}, ton meilleur mois.`; })()} Le signal est lent : tu ne le sens pas d'un jour à l'autre.</p>
      </>);
    }
    case "tests": {
      const pts = s.main.points, vs = pts.map(p => p.value);
      const mn = Math.min(...vs), mx = Math.max(...vs), W = 300, H = 120;
      const xy = pts.map((p, i) => [16 + (i / Math.max(1, pts.length - 1)) * (W - 32), 20 + (1 - (p.value - mn) / (mx - mn || 1)) * (H - 40)]);
      const fmt = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
      return (<>
        <h2 style={h2}>{s.main.name} <span style={{ color: "#ff8a5c" }}>+{s.main.pct} %.</span></h2>
        <div style={card}>
          <svg width="100%" height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={`${s.main.name} : ${pts.map(p => fmt(p.value)).join(", ")}`}>
            <polyline points={xy.map(p => p.join(",")).join(" ")} fill="none" stroke="#ff6a2b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            {xy.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="6" fill={i === xy.length - 1 ? "#ff6a2b" : "#14181b"} stroke="#ff6a2b" strokeWidth="3" /><text x={p[0]} y={p[1] - 12} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle">{fmt(pts[i].value)}</text><text x={p[0]} y={H + 18} fill="rgba(255,255,255,0.5)" fontSize="11" textAnchor="middle">{`${Number(pts[i].date.slice(8))}/${Number(pts[i].date.slice(5, 7))}`}</text></g>)}
          </svg>
        </div>
        {s.others.map((o, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px" }}><span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{o.name}</span><span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{o.from} → {o.to} <span style={{ color: "#7ee08f" }}>+{o.pct} %</span></span></div>)}
      </>);
    }
    case "partage":
      return (<>
        <div style={{ borderRadius: 22, padding: "22px 20px", background: "linear-gradient(160deg, #2a1206 0%, #14181b 55%, #0c1a26 100%)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "#ff8a5c" }}>{bilan.title.toUpperCase()}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, lineHeight: 1.15, color: "#fff" }}>M'entraîner à ma forme du jour</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {s.kpis.map((k, i) => <div key={i} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 22, color: "#fff" }}>{k.value}</b><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}>{k.label}</span></div>)}
          </div>
          {s.line && <div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.8)" }}>{s.line}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)" }}><span>THEPERFCLUB</span><span>theperfclub.com</span></div>
        </div>
        <button onClick={onShare} style={{ height: 52, border: "none", borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>{shared ? "Copié ✓" : "Partager mon bilan"}</button>
      </>);
  }
}

export default function BilanCarousel({ userId, kind, anchor, today, source, onClose }: Props) {
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [shared, setShared] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const [p, s, w, t] = await Promise.all([
        supabase.from("profiles").select("created_at").eq("user_id", userId).maybeSingle(),
        supabase.from("sessions").select("date,name,rpe,target_difficulty,duration,done,created_at").eq("user_id", userId).eq("done", true).lte("date", today),
        supabase.from("wellness_daily").select("date,sleep,stress,recovery,motivation,score,behaviors,bedtime,device_sleep_minutes,device_hrv_ms,created_at").eq("user_id", userId).lte("date", today),
        supabase.from("test_results").select("date,value,unit,tests(name)").eq("subject_user_id", userId),
      ]);
      if (!alive) return;
      const err = p.error || s.error || w.error || t.error;
      if (err) { console.error("[bilan] lecture", err.message); setFailed(true); return; }
      const signupAt = (p.data?.created_at as string | undefined) ?? new Date().toISOString();
      const checkins = (w.data ?? []) as BilanCheckin[];
      const sessions = (s.data ?? []) as BilanSession[];
      const firstDate = [...sessions, ...checkins].filter(x => !isSynthetic(x, signupAt)).map(x => x.date).sort()[0] ?? today;
      const tests: BilanTest[] = ((t.data ?? []) as { date: string; value: number; unit: string; tests: { name: string } | { name: string }[] | null }[])
        .map(r => ({ date: r.date, value: Number(r.value), unit: r.unit, name: (Array.isArray(r.tests) ? r.tests[0]?.name : r.tests?.name) ?? "" }))
        .filter(r => r.name);
      const period = periodFor(kind, anchor, firstDate);
      const b = computeBilan({ period, today, signupAt, sessions, checkins, tests });
      setBilan(b);
      posthog.capture("bilan_opened", { period: kind, source, slides: b.slides.length, slide_kinds: b.slides.map(x => x.kind).join(",") });
    })();
    return () => { alive = false; };
  }, [userId, kind, anchor, today, source]);

  const slides = useMemo(() => bilan?.slides ?? [], [bilan]);
  const slide = slides[idx];

  useEffect(() => {
    if (slide) posthog.capture("bilan_slide_viewed", { period: kind, slide: slide.kind, index: idx });
  }, [slide, idx, kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx(i => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  async function share() {
    if (!bilan || slide?.kind !== "partage") return;
    const text = [`Mon bilan ThePerfClub · ${bilan.title}`, ...slide.kpis.map(k => `${k.value} ${k.label}`), slide.line ?? "", "https://theperfclub.com"].filter(Boolean).join("\n");
    posthog.capture("bilan_shared", { period: kind });
    try {
      if (navigator.share) { await navigator.share({ title: "Mon bilan ThePerfClub", text }); return; }
    } catch { /* partage annulé : on retombe sur la copie */ }
    try { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 1600); } catch (e) { console.error("[bilan] copie", e); }
  }

  const last = idx >= slides.length - 1;
  const content = (
    <div
      role="dialog" aria-modal="true" aria-label="Ton bilan"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
        if (dx < -50) setIdx(i => Math.min(i + 1, slides.length - 1)); else if (dx > 50) setIdx(i => Math.max(i - 1, 0));
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483100, background: "#070a0d",
        backgroundImage: slide ? `radial-gradient(ellipse 110% 50% at 50% -8%, ${GLOW[slide.kind]} 0%, transparent 65%)` : undefined,
        color: "#fff", fontFamily: "var(--font-dm-sans), 'Helvetica Neue', sans-serif", display: "flex", justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, boxSizing: "border-box", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "#fff" : "rgba(255,255,255,0.22)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.6)" }}>
          <span>{bilan ? `TON BILAN · ${slide ? KICKER[slide.kind] : ""}` : "TON BILAN"}</span>
          <button onClick={onClose} aria-label="Fermer le bilan" style={{ background: "none", border: 0, color: "#fff", fontSize: 26, lineHeight: 1, cursor: "pointer", padding: 4 }}>×</button>
        </div>
        {bilan && slide && LEARNED.has(slide.kind) && bilan.period.kind !== "all" && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: -8 }}>Appris sur tout ton historique</div>}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingTop: 12 }}>
          {!bilan && !failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>On rassemble tes données…</div>}
          {failed && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>Impossible de charger ton bilan. Réessaie dans un instant.</div>}
          {bilan && !slides.length && <div style={{ ...body, textAlign: "center", marginTop: 80 }}>Pas encore assez de données pour ce bilan. Remplis ton check-in et note tes séances quelques jours : il se construit tout seul.</div>}
          {bilan && slide && <SlideBody s={slide} bilan={bilan} onShare={share} shared={shared} />}
        </div>

        {slides.length > 0 && (
          <div style={{ flexShrink: 0, display: "flex", gap: 10 }}>
            {idx > 0 && <button onClick={() => setIdx(i => i - 1)} style={{ flex: 1, height: 52, borderRadius: 14, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Précédent</button>}
            <button onClick={() => last ? onClose() : setIdx(i => i + 1)} style={{ flex: 1.6, height: 52, borderRadius: 14, border: 0, background: "#fff", color: "#14181b", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{last ? "Fermer" : idx === 0 ? "Voir ce que tes données ont appris" : "Suivant"}</button>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(content, document.body);
}
