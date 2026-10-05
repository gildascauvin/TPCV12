"use client";

import { wellnessColor } from "@/lib/wellness";

/* Anneau de récupération 52px (liste des sportifs, lignes du Coach Control). Extrait
   d'AthletesClient.tsx le 2026-10-05 pour être réutilisé sans importer toute la page. */
export function AthleteRing({ score }: { score: number | null }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = score === null ? circ : +(circ * (1 - score / 100)).toFixed(1);
  const color = score === null ? "rgba(255,255,255,0.28)" : wellnessColor(score);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color }}>{score !== null ? score : "—"}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>récup</span>
      </div>
    </div>
  );
}
