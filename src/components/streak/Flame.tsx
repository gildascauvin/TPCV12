"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/native";

/* Flamme de la série (24/11/2026) : dessinée maison (même rendu iPhone, Android, web), éteinte tant que
   la journée n'est pas validée, allumée avec un halo ensuite. Une seule animation continue, très douce
   (la flamme respire), coupée si le téléphone demande moins d'animations. */

const CSS = `
@keyframes tpcFlameBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.045) translateY(-1%)}}
@keyframes tpcFlameIgnite{0%{transform:scale(.6);opacity:.4}55%{transform:scale(1.18);opacity:1}100%{transform:scale(1)}}
@keyframes tpcGlow{0%{opacity:0;transform:scale(.6)}60%{opacity:1}100%{opacity:.75;transform:scale(1)}}
@keyframes tpcCountUp{0%{transform:translateY(40%);opacity:0}100%{transform:none;opacity:1}}
@keyframes tpcCountOut{0%{transform:none;opacity:1}100%{transform:translateY(-40%);opacity:0}}
@keyframes tpcMedal{0%{transform:scale(.4) rotate(-25deg);opacity:0}60%{transform:scale(1.12) rotate(6deg);opacity:1}100%{transform:none}}
.tpc-flame-lit{animation:tpcFlameBreath 2.6s ease-in-out infinite;transform-origin:50% 90%}
.tpc-flame-ignite{animation:tpcFlameIgnite .7s cubic-bezier(.34,1.56,.64,1) both;transform-origin:50% 90%}
.tpc-glow{animation:tpcGlow .9s ease-out both}
.tpc-count-in{animation:tpcCountUp .45s cubic-bezier(.22,1,.36,1) both}
.tpc-count-out{animation:tpcCountOut .3s ease-in both}
.tpc-medal{animation:tpcMedal .75s cubic-bezier(.34,1.56,.64,1) both}
@media (prefers-reduced-motion:reduce){.tpc-flame-lit,.tpc-flame-ignite,.tpc-glow,.tpc-count-in,.tpc-count-out,.tpc-medal{animation:none!important}}
`;
let injected = false;
export function useStreakCss() {
  useEffect(() => {
    if (injected || typeof document === "undefined") return;
    injected = true;
    const el = document.createElement("style");
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

export function Flame({ lit, size = 24, className, glow = false }: { lit: boolean; size?: number; className?: string; glow?: boolean }) {
  useStreakCss();
  const id = `fl${size}${lit ? 1 : 0}`;
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size, flexShrink: 0 }}>
      {lit && glow && <span className="tpc-glow" style={{ position: "absolute", inset: "-45%", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,122,40,.55), rgba(255,122,40,0))" }} />}
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className ?? (lit ? "tpc-flame-lit" : undefined)} style={{ position: "relative", overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={lit ? "#ffb5a7" : "rgba(255,255,255,.35)"} />
            <stop offset="1" stopColor={lit ? "#d44000" : "rgba(255,255,255,.18)"} />
          </linearGradient>
          <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={lit ? "#fff" : "rgba(255,255,255,.25)"} />
            <stop offset="1" stopColor={lit ? "#ffb5a7" : "rgba(255,255,255,.12)"} />
          </linearGradient>
        </defs>
        <path d="M12 1.6c.6 3.1 2.4 4.9 4.1 6.8 1.9 2.1 3.4 4.2 3.4 7.2A7.5 7.5 0 0 1 12 23a7.5 7.5 0 0 1-7.5-7.4c0-2.6 1.1-4.6 2.7-6.2.3 1.7 1.2 2.9 2.4 3.6-.4-4.5 1-8.2 2.4-11.4z" fill={`url(#${id}o)`} />
        <path d="M12.2 11.2c.4 1.8 1.5 2.8 2.4 3.9.8 1 1.3 2 1.3 3.2A3.9 3.9 0 0 1 12 22.2a3.9 3.9 0 0 1-3.9-3.9c0-1.5.8-2.7 1.8-3.4.2.9.7 1.5 1.3 1.8-.2-2.2.3-3.9 1-5.5z" fill={`url(#${id}i)`} />
      </svg>
    </span>
  );
}

/** Moment d'allumage (page « TA SÉRIE » du mini bilan) : flamme éteinte → allumée, compteur N-1 → N, vibration. */
export function StreakIgnite({ to, size = 96 }: { to: number; size?: number }) {
  useStreakCss();
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => { setLit(true); haptic("success"); }, reduce ? 0 : 450);
    return () => window.clearTimeout(t);
  }, []);
  const from = Math.max(0, to - 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <Flame lit={lit} size={size} glow className={lit ? "tpc-flame-ignite" : undefined} />
      <div aria-live="polite" style={{ position: "relative", height: 64, overflow: "hidden", fontFamily: "var(--font-display)", fontSize: 58, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: "64px", fontVariantNumeric: "tabular-nums", color: "#fff", minWidth: 80, textAlign: "center" }}>
        {lit ? <span key="to" className="tpc-count-in" style={{ display: "block" }}>{to}</span> : <span key="from" style={{ display: "block", color: "rgba(255,255,255,.5)" }}>{from}</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,.75)", marginTop: -4 }}>{to > 1 ? "jours d'affilée" : "jour, ta série commence"}</div>
    </div>
  );
}
