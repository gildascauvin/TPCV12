"use client";

import { useState, useEffect, useRef } from "react";

const MONTH_FR = ["jan","fév","mar","avr","mai","juin","juil","aoû","sep","oct","nov","déc"];
const DAY_FR   = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];

function formatDateFr(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

function wellnessZone(v: number): string {
  if (v >= 82) return "Zone optimale";
  if (v >= 65) return "Zone stable";
  if (v >= 45) return "Zone prudente";
  return "Zone récupération";
}

function formatTooltipValue(metricType: "nervous" | "muscular" | "recovery", v: number | null): string {
  if (metricType === "nervous") {
    if (v === null || v === 0) return "🛌 Repos";
    return `⚡ Charge : ${v}`;
  }
  if (metricType === "muscular") {
    if (v === null || v === 0) return "🛌 Repos";
    return `💪 ${v} min de séance`;
  }
  // recovery
  if (v === null) return "— Non renseigné";
  return `🌿 ${v}/100 · ${wellnessZone(v)}`;
}

const W = 400;
const PAD_TOP = 5;
const PAD_BOT = 2;

interface Props {
  points: (number | null)[];
  dates: string[];
  color: string;
  maxVal: number;
  height?: number;
  animDelay?: number;
  metricType: "nervous" | "muscular" | "recovery";
  uid: string;
}

export default function SparkLineClient({
  points, dates, color, maxVal, height = 52, animDelay = 0, metricType, uid,
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const [hover, setHover] = useState<{ idx: number; xPx: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const H = height;
  const n = points.length;

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), animDelay + 60);
    return () => clearTimeout(t);
  }, [animDelay]);

  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => {
    const pct = maxVal > 0 ? Math.min(v / maxVal, 1) : 0;
    return H - PAD_BOT - pct * (H - PAD_TOP - PAD_BOT);
  };

  type Seg = { x: number; y: number }[];
  const segments: Seg[] = [];
  let cur: Seg = [];
  points.forEach((v, i) => {
    if (v === null) { if (cur.length) { segments.push(cur); cur = []; } }
    else cur.push({ x: toX(i), y: toY(v) });
  });
  if (cur.length) segments.push(cur);

  const lastNonNullIdx = points.map((v, i) => v !== null ? i : -1).filter(i => i >= 0).at(-1) ?? -1;
  const lastPt = lastNonNullIdx >= 0
    ? { x: toX(lastNonNullIdx), y: toY(points[lastNonNullIdx] as number) }
    : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(xRatio * (n - 1))));
    setHover({ idx, xPx: e.clientX - rect.left });
  };

  const hIdx = hover?.idx ?? null;
  const hVal  = hIdx !== null ? points[hIdx] : null;
  const hDate = hIdx !== null ? dates[hIdx] : null;
  const cursorX = hIdx !== null ? toX(hIdx) : null;

  // Tooltip positioning: avoid overflow on edges
  const wrapWidth = wrapRef.current?.offsetWidth ?? 300;
  const hXPct = hover ? (hover.xPx / wrapWidth) * 100 : 0;
  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    bottom: "calc(100% + 8px)",
    pointerEvents: "none",
    zIndex: 20,
    background: "rgba(18,18,18,0.92)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 10,
    padding: "7px 12px",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    ...(hXPct < 25
      ? { left: 0 }
      : hXPct > 75
      ? { right: 0 }
      : { left: `${hXPct}%`, transform: "translateX(-50%)" }),
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {hover && hDate && (
        <div style={tooltipStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
            {formatDateFr(hDate)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color }}>
            {formatTooltipValue(metricType, hVal)}
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={`sc-${uid}`}>
            <rect
              x={0} y={0}
              style={{
                width: revealed ? `${W}px` : "0px",
                height: `${H + 10}px`,
                transition: `width 0.85s cubic-bezier(0.2,0,0.38,0.9)`,
              }}
            />
          </clipPath>
        </defs>

        {/* Baseline */}
        <line x1={0} y1={H - PAD_BOT} x2={W} y2={H - PAD_BOT} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

        {/* Chart content — animated reveal via clipPath */}
        <g clipPath={`url(#sc-${uid})`}>
          {segments.map((seg, si) => {
            if (!seg.length) return null;
            const ptStr = seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            const baseline = H - PAD_BOT;
            const fillD = [
              `M ${seg[0].x.toFixed(1)},${baseline}`,
              `L ${seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`,
              `L ${seg[seg.length - 1].x.toFixed(1)},${baseline} Z`,
            ].join(" ");
            return (
              <g key={si}>
                <path d={fillD} fill={color} fillOpacity={0.12} />
                {seg.length > 1
                  ? <polyline points={ptStr} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  : <circle cx={seg[0].x} cy={seg[0].y} r={3} fill={color} />}
              </g>
            );
          })}
          {lastPt && (
            <circle
              cx={lastPt.x.toFixed(1)} cy={lastPt.y.toFixed(1)}
              r={4} fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5}
            />
          )}
        </g>

        {/* Cursor vertical line */}
        {cursorX !== null && (
          <line
            x1={cursorX.toFixed(1)} y1={0}
            x2={cursorX.toFixed(1)} y2={H}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}

        {/* Hover dot */}
        {cursorX !== null && hIdx !== null && hVal !== null && (
          <circle
            cx={cursorX.toFixed(1)}
            cy={toY(hVal).toFixed(1)}
            r={5} fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  );
}
