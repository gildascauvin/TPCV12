/* Logo ThePerfClub « Z1 épais » (2026-10-05) : la piste de la jauge de décision, la zone conseillée
   en orange (dégradé de l'app) et le curseur noir à liseré blanc au milieu de la zone. Variante
   « empilé » : symbole au-dessus du nom. `theme` = fond sur lequel le logo est posé : "dark" = logo
   clair (nom blanc), "light" = logo foncé (nom noir). */

import { useId } from "react";

const R = 36, LO = 6.8, HI = 8.6, CUR = 7.7;
const ang = (v: number) => -120 + ((v - 1) / 9) * 240;
function P(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const arc = (r: number, a0: number, a1: number) =>
  `M ${pt(P(r, a0))} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(P(r, a1))}`;

export function BrandMark({ size = 96, theme = "dark" }: { size?: number; theme?: "light" | "dark" }) {
  const gid = `tpc-${useId().replace(/:/g, "")}`;
  // Épaisseur optique : plus le logo est petit, plus le trait et le curseur grossissent.
  const k = size >= 96 ? 1 : size >= 48 ? 1.15 : size >= 32 ? 1.3 : size >= 24 ? 1.45 : 1.6;
  const sw = Math.min(14 * k, 19), kr = Math.min(7.6 * k, 11), kSw = Math.min(2.4 * k, 3.6);
  const c = P(R, ang(CUR)), z0 = P(R, ang(LO)), z1 = P(R, ang(HI));
  return (
    <svg width={size} height={Math.round((size * 82) / 94)} viewBox="3 3 94 82" role="img" aria-label="ThePerfClub" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={z0[0]} y1={z0[1]} x2={z1[0]} y2={z1[1]}>
          <stop offset="0" stopColor="#ffb5a7" />
          <stop offset="1" stopColor="#d44000" />
        </linearGradient>
      </defs>
      <path d={arc(R, -120, 120)} fill="none" stroke={theme === "dark" ? "rgba(255,255,255,.16)" : "rgba(20,20,20,.11)"} strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(R, ang(LO), ang(HI))} fill="none" stroke={`url(#${gid})`} strokeWidth={sw} strokeLinecap="round" />
      <circle cx={c[0]} cy={c[1]} r={kr} fill="#18181b" stroke="#fff" strokeWidth={kSw} />
    </svg>
  );
}

/* Empilé : symbole au-dessus du nom. */
export default function BrandLogoStacked({ size = 96, theme = "dark" }: { size?: number; theme?: "light" | "dark" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.12) }}>
      <BrandMark size={size} theme={theme} />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: Math.round(size * 0.27), letterSpacing: "-0.02em", lineHeight: 1, color: theme === "dark" ? "#fff" : "#141414" }}>
        The<span style={{ color: "#d44000" }}>Perf</span>Club
      </div>
    </div>
  );
}
