"use client";

import { useRef, useState } from "react";
import { chargeColor } from "@/lib/ringColors";
import { hapticTick } from "@/lib/native";
import { gaugeTick } from "@/lib/gaugeSound";
import { CR10_LABELS } from "@/components/ui/ScaleBars";
import { ringLabelLines } from "@/components/calendar/SessionRing";

/* Difficulté prévue dans l'éditeur de séance (06/11, option A validée par Gildas) : anneau compact de 240°
   aux couleurs de l'onglet Charge, qu'on règle d'un toucher ou en glissant, le mot au centre. Même geste que
   partout ailleurs ; remplace la barre (DecisionGauge noZone). */
const A0 = -120, A1 = 120, MIN = 1, MAX = 10;
const ang = (v: number) => A0 + ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * (A1 - A0);
function pol(cx: number, cy: number, r: number, d: number): [number, number] { const a = ((d - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
const P = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const arc = (cx: number, cy: number, r: number, f: number, t: number) => `M ${P(pol(cx, cy, r, f))} A ${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${P(pol(cx, cy, r, t))}`;

export default function DifficultyRingInput({ value, onChange, size = 120, compact = false }: { value: number; onChange: (v: number) => void; size?: number;
  /* En haut à droite de l'éditeur (06/11) : le mot au centre suffit, pas de ligne d'échelle dessous. */
  compact?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState(false);
  /* Miniature fidèle de l'anneau de la note de fin de séance (06/11, Gildas) : disque sombre, rail, 10 crans,
     piste orange de l'effort, curseur à trois traits, mot de l'échelle au centre. */
  const R = 38, SW = 9, CX = 50, CY = 48, H = 80, end = ang(value), n = 26, f = (value - MIN) / (MAX - MIN);
  /* Couleurs de l'onglet Charge (06/11, Gildas), les mêmes que l'anneau d'une séance à venir dans le Planning. */
  const col = (k: number) => chargeColor(0.2 + 0.8 * k);
  const [sx, sy] = pol(CX, CY, R, A0), [ex, ey] = pol(CX, CY, R, end);
  function pick(e: React.PointerEvent) {
    const rc = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - rc.left) / rc.width) * 100 - CX, y = ((e.clientY - rc.top) / rc.width) * 100 - CY;
    const a = Math.max(A0, Math.min(A1, (Math.atan2(x, -y) * 180) / Math.PI));
    const v = Math.round(MIN + ((a - A0) / (A1 - A0)) * (MAX - MIN));
    if (v !== value) { hapticTick(value, v); gaugeTick(v); onChange(v); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg ref={ref} viewBox={`0 0 100 ${H}`} width={size} height={Math.round((size * H) / 100)}
        role="slider" tabIndex={0} aria-label="Difficulté prévue" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={value} aria-valuetext={CR10_LABELS[value]}
        onKeyDown={e => { const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0; if (d) { e.preventDefault(); onChange(Math.max(MIN, Math.min(MAX, value + d))); } }}
        onPointerDown={e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } setDrag(true); pick(e); }}
        onPointerMove={e => { if (drag) pick(e); }}
        onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)}
        style={{ display: "block", overflow: "visible", touchAction: "none", cursor: drag ? "grabbing" : "grab", outline: "none" }}>
        <path d={arc(CX, CY, R, A0, A1)} fill="none" stroke="#ebe9e4" strokeWidth={SW} strokeLinecap="round" />
        {Array.from({ length: 10 }, (_, t) => { const u = t / 9, a = A0 + (A1 - A0) * u, [ax, ay] = pol(CX, CY, R - SW * 0.5 - 3, a), [bx, by] = pol(CX, CY, R - SW * 0.5 - 6, a); return <line key={t} x1={ax} y1={ay} x2={bx} y2={by} stroke={u <= f + 0.001 ? "rgba(23,27,31,.55)" : "rgba(23,27,31,.15)"} strokeWidth={1.2} strokeLinecap="round" />; })}
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={arc(CX, CY, R, A0 + ((end - A0) * i) / n, A0 + ((end - A0) * (i + 1.05)) / n)} fill="none" stroke={col(((i + 0.5) / n) * f)} strokeWidth={SW} />
        ))}
        <circle cx={sx} cy={sy} r={SW / 2} fill={col(0)} />
        <circle cx={ex} cy={ey} r={SW * 0.62} fill="#18181b" stroke="#fff" strokeWidth={1.2} />
        {[-1.8, 0, 1.8].map(d => <line key={d} x1={ex - 2.2} x2={ex + 2.2} y1={ey + d} y2={ey + d} stroke="#fff" strokeWidth={1.1} strokeLinecap="round" />)}
        {/* Libellé de la difficulté seul, sur deux lignes s'il est long (06/11, Gildas). */}
        {ringLabelLines(CR10_LABELS[value]).map((ln, k, all) => <text key={k} x={CX} y={CY + 4 + (k - (all.length - 1) / 2) * 12} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontWeight={900} fontSize={11.5} fill="#171b1f">{ln}</text>)}
      </svg>
      {!compact && <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 2 }}>{CR10_LABELS[value]}</div>}
    </div>
  );
}
