/* Logo ThePerfClub (2026-10-05) : la jauge de décision figée (géométrie et dégradé de DecisionRing,
   zone conseillée 7-8 en pointillés, curseur noir à 7,5) + le nom. Variante « empilé » : jauge au-dessus
   du nom. `theme` = couleur du fond sur lequel le logo est posé. */

const A0 = -120, A1 = 120, MIN = 1, MAX = 10;
const VALUE = 7.5, ZLO = 7, ZHI = 8;
const STOPS = ["#ffb5a7", "#d44000"] as const;
const ang = (d: number) => A0 + ((d - MIN) / (MAX - MIN)) * (A1 - A0);
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const arc = (cx: number, cy: number, r: number, f: number, t: number) =>
  `M ${pt(polar(cx, cy, r, f))} A ${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${pt(polar(cx, cy, r, t))}`;
function sector(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number) {
  const rc = ((rOut - rIn) / 2).toFixed(2), big = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(polar(cx, cy, rOut, a0))} A ${rOut} ${rOut} 0 ${big} 1 ${pt(polar(cx, cy, rOut, a1))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rIn, a1))}`
    + ` A ${rIn} ${rIn} 0 ${big} 0 ${pt(polar(cx, cy, rIn, a0))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rOut, a0))} Z`;
}
function mix(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}

export function BrandMark({ size = 96, theme = "light" }: { size?: number; theme?: "light" | "dark" }) {
  const r = size * 0.36, sw = size * 0.085, k = size / 188;
  const rOut = r + sw * 0.95, rIn = r - sw * 0.95;
  const cx = size / 2, cy = rOut + 2;
  const h = Math.round(cy + r / 2 + sw / 2 + 2);
  const end = ang(VALUE), SEGS = 32;
  const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, end);
  const light = theme === "light";
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="img" aria-label="ThePerfClub" style={{ display: "block" }}>
      <path d={arc(cx, cy, r, A0, A1)} fill="none" stroke={light ? "rgba(20,20,20,.1)" : "#1d2226"} strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(cx, cy, r, A0, end)} fill="none" stroke={mix(STOPS[0], STOPS[1], 0.5)} strokeWidth={sw * 0.98} />
      {Array.from({ length: SEGS }, (_, i) => (
        <path key={i} d={arc(cx, cy, r, A0 + ((end - A0) * i) / SEGS, Math.min(end, A0 + ((end - A0) * (i + 1.6)) / SEGS))}
          fill="none" stroke={mix(STOPS[0], STOPS[1], (i + 0.5) / SEGS)} strokeWidth={sw} />
      ))}
      <circle cx={sx} cy={sy} r={sw / 2} fill={STOPS[0]} />
      <circle cx={ex} cy={ey} r={sw / 2} fill={STOPS[1]} />
      <path d={sector(cx, cy, rIn, rOut, ang(ZLO - 0.35), ang(ZHI + 0.35))} fill="none"
        stroke={light ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.75)"} strokeWidth={2 * k} strokeDasharray={`${3 * k} ${3 * k}`} />
      <g transform={`translate(${ex} ${ey}) scale(${k})`}>
        <circle r={12.5} fill={light ? "rgba(24,24,27,.1)" : "rgba(255,255,255,.14)"} />
        <circle r={9.5} fill="#18181b" stroke="rgba(255,255,255,.9)" strokeWidth={1.5} />
        {[-3, 0, 3].map(dy => <line key={dy} x1={-3.5} x2={3.5} y1={dy} y2={dy} stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
      </g>
    </svg>
  );
}

/* Empilé : jauge au-dessus du nom. */
export default function BrandLogoStacked({ size = 96, theme = "light" }: { size?: number; theme?: "light" | "dark" }) {
  const ink = theme === "light" ? "#141414" : "#fff";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.14) }}>
      <BrandMark size={size} theme={theme} />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: Math.round(size * 0.27), letterSpacing: "-0.02em", lineHeight: 1, color: ink }}>
        The<span style={{ color: "#d44000" }}>Perf</span>Club
      </div>
    </div>
  );
}
