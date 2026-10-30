"use client";

/* Écran « on analyse » avant le programme généré et avant le bilan (2026-10-29, qualité perçue). Plein
   écran sombre : un anneau qui se remplit, le pourcentage qui monte, puis les étapes qui se cochent une à
   une avec leur détail personnalisé (sport, faiblesses, réponses du point forme…). La dernière étape
   attend `ready` (le vrai programme) avant de se cocher, 15 s au plus ; durée minimale `minMs`. Mouvement réduit :
   version courte, sans rotation. */

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/native";

export type AnalysisStep = { label: string; detail?: string };

export default function AnalysisReveal({ kicker, title, steps, ready = true, minMs = 4200, onDone }: {
  kicker: string;
  title: string;
  steps: AnalysisStep[];
  ready?: boolean;
  minMs?: number;
  onDone: () => void;
}) {
  const [done, setDone] = useState(0);
  const [pct, setPct] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? 1200 : minMs;
    const per = total / steps.length;
    const t0 = performance.now();
    let raf = 0, finished = false, count = 0;
    const tick = (now: number) => {
      const elapsed = now - t0;
      // Garde-fou : au-delà de 15 s on termine quand même, l'écran suivant sait faire sans le contenu.
      if (elapsed > 15000) readyRef.current = true;
      // Toutes les étapes sauf la dernière se cochent au rythme ; la dernière attend le vrai contenu.
      const target = Math.min(steps.length - (readyRef.current ? 0 : 1), Math.floor(elapsed / per));
      if (target > count) { count = target; setDone(target); haptic("light"); }
      // L'anneau suit les étapes, en douceur, sans jamais dépasser 96 % tant que ce n'est pas prêt.
      const p = Math.min(readyRef.current ? 1 : 0.96, elapsed / total);
      setPct(1 - Math.pow(1 - p, 2));
      if (count >= steps.length && !finished) {
        finished = true;
        setPct(1);
        haptic("success");
        setTimeout(() => setLeaving(true), 450);
        setTimeout(() => doneRef.current(), 800);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const R = 54, C = 2 * Math.PI * R;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center",
      background: "#070a0d", backgroundImage: "radial-gradient(ellipse 120% 60% at 50% 0%, rgba(240,74,8,.22) 0%, transparent 62%)",
      color: "#fff", padding: "max(32px, env(safe-area-inset-top)) 24px 32px",
      opacity: leaving ? 0 : 1, transform: leaving ? "scale(.985)" : "none", transition: "opacity .35s ease, transform .35s ease",
    }}>
      <style>{`
        @keyframes tpcAnaIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        @keyframes tpcAnaSpin { to { transform: rotate(360deg) } }
        @keyframes tpcAnaPop { 0% { transform: scale(.6) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @keyframes tpcAnaGlow { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", alignItems: "center", animation: "tpcAnaIn .45s cubic-bezier(.2,0,0,1) both" }}>
        <div style={{ position: "relative", width: 132, height: 132, marginBottom: 22 }}>
          <div aria-hidden style={{ position: "absolute", inset: -18, borderRadius: "50%", background: "radial-gradient(circle, rgba(240,74,8,.28) 0%, transparent 70%)", animation: "tpcAnaGlow 2.2s ease-in-out infinite" }} />
          <svg width={132} height={132} viewBox="0 0 132 132" style={{ position: "relative", transform: "rotate(-90deg)" }}>
            <defs>
              <linearGradient id="tpcAnaGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffb08a" /><stop offset="100%" stopColor="#f04a08" />
              </linearGradient>
            </defs>
            <circle cx={66} cy={66} r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={8} />
            <circle cx={66} cy={66} r={R} fill="none" stroke="url(#tpcAnaGrad)" strokeWidth={8} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          {/* Chiffre et % sur une seule ligne, centrés ensemble (en grille, le % passait sous le chiffre). */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "var(--font-mono), monospace", fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {Math.round(pct * 100)}<span style={{ fontSize: 15, opacity: .6, marginLeft: 2 }}>%</span>
            </span>
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 8 }}>{kicker}</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, textAlign: "center", textWrap: "balance", marginBottom: 26 } as React.CSSProperties}>{title}</div>
        <div style={{ width: "100%", display: "grid", gap: 14 }}>
          {steps.map((s, i) => {
            const state = i < done ? "done" : i === done ? "active" : "todo";
            return (
              <div key={s.label} style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, alignItems: "start", opacity: state === "todo" ? .38 : 1, transition: "opacity .3s ease" }}>
                <span style={{ width: 26, height: 26, display: "grid", placeItems: "center" }}>
                  {state === "done" ? (
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#f04a08", display: "grid", placeItems: "center", animation: "tpcAnaPop .35s cubic-bezier(.2,0,0,1) both" }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </span>
                  ) : state === "active" ? (
                    <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,.14)", borderTopColor: "#ff8a55", animation: "tpcAnaSpin .8s linear infinite" }} />
                  ) : (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.35)" }} />
                  )}
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, lineHeight: 1.3, color: state === "todo" ? "rgba(255,255,255,.7)" : "#fff" }}>{s.label}</span>
                  {s.detail && state !== "todo" && (
                    <span style={{ display: "block", fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,.55)", marginTop: 2, animation: "tpcAnaIn .35s ease both" }}>{s.detail}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
