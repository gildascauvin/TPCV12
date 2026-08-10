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

function formatTooltipValue(metricType: "load" | "monotony" | "recovery", v: number | null): string {
  if (metricType === "load") {
    if (v === null || v === 0) return "🛌 Repos";
    return `⚡ Charge : ${v}`;
  }
  if (metricType === "monotony") {
    if (v === null) return "— Pas assez d'historique";
    return `🔁 Monotonie : ${v}`;
  }
  // recovery
  if (v === null) return "— Non renseigné";
  return `🌿 ${v}/100 · ${wellnessZone(v)}`;
}

function formatFormValue(v: number | null, raw: number | null): string | null {
  if (v === null) return null;
  const rawStr = raw !== null ? ` (${raw > 0 ? "+" : ""}${raw} UA)` : "";
  return `📊 Forme : ${v}/100${rawStr}`;
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_FR[d.getDay()];
}

const W = 400;
const PAD_TOP = 5;
// Espace réservé en bas pour la ligne de labels de jour (overlay HTML, voir ZoneSparkline.tsx pour
// le pourquoi de l'overlay plutôt que du <text> SVG — même piège de "zoom" déjà rencontré ici).
const PAD_BOT = 20;

interface Props {
  points: (number | null)[];
  dates: string[];
  color: string;
  maxVal: number;
  height?: number;
  animDelay?: number;
  metricType: "load" | "monotony" | "recovery";
  uid: string;
  chartType?: "line" | "bars";
  /* Série secondaire optionnelle superposée (ex. Form sur le chart Récupération) — rendue en
     simple trait pointillé, sans aire remplie, même échelle Y que la série principale. */
  points2?: (number | null)[];
  points2Raw?: (number | null)[]; // valeur brute (ex. UA) affichée en tooltip à côté de la valeur normalisée
  color2?: string;
  /* Ligne de seuil horizontale optionnelle (ex. monotonie = 2, seuil Foster) — uniquement pertinent
     quand un seuil universel existe réellement dans la littérature, pas une valeur inventée. */
  thresholdValue?: number;
  thresholdLabel?: string;
}

export default function SparkLineClient({
  points, dates, color, maxVal, height = 52, animDelay = 0, metricType, uid, chartType = "line",
  points2, points2Raw, color2, thresholdValue, thresholdLabel,
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
  const toXPct = (i: number) => (toX(i) / W) * 100;

  // Décimation des labels si beaucoup de points (mêmes règles que ZoneSparkline) — toujours le
  // premier et le dernier, un point tous les `labelStep` entre les deux.
  const labelStep = n > 10 ? Math.ceil(n / 7) : 1;

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

  const segments2: Seg[] = [];
  if (points2) {
    let cur2: Seg = [];
    points2.forEach((v, i) => {
      if (v === null) { if (cur2.length) { segments2.push(cur2); cur2 = []; } }
      else cur2.push({ x: toX(i), y: toY(v) });
    });
    if (cur2.length) segments2.push(cur2);
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(xRatio * (n - 1))));
    setHover({ idx, xPx: e.clientX - rect.left });
  };

  const hIdx = hover?.idx ?? null;
  const hVal  = hIdx !== null ? points[hIdx] : null;
  const hVal2 = hIdx !== null && points2 ? points2[hIdx] : null;
  const hVal2Raw = hIdx !== null && points2Raw ? points2Raw[hIdx] : null;
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
          {points2 && formatFormValue(hVal2, hVal2Raw) && (
            <div style={{ fontSize: 12, fontWeight: 700, color: color2 ?? "#8a8f94", marginTop: 2 }}>
              {formatFormValue(hVal2, hVal2Raw)}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block", cursor: "crosshair" }}
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

        {/* Seuil à ne pas dépasser */}
        {thresholdValue !== undefined && thresholdValue <= maxVal && (
          <>
            <line
              x1={0} y1={toY(thresholdValue).toFixed(1)} x2={W} y2={toY(thresholdValue).toFixed(1)}
              stroke="#d10000" strokeWidth={1} strokeDasharray="5,4" opacity={0.55}
            />
            {thresholdLabel && (
              <text x={W} y={toY(thresholdValue) - 4} textAnchor="end" fontSize={9} fontWeight={800} fill="#d10000" opacity={0.75}>
                {thresholdLabel}
              </text>
            )}
          </>
        )}

        {/* Chart content — animated reveal via clipPath */}
        <g clipPath={`url(#sc-${uid})`}>
          {chartType === "bars" ? (
            // Bar chart: one column per day
            (() => {
              const barW = Math.max(5, Math.floor(W / n * 0.55));
              const baseline = H - PAD_BOT;
              return points.map((v, i) => {
                if (v === null || v === 0) return null;
                const x = toX(i);
                const y = toY(v);
                const bh = baseline - y;
                return (
                  <rect
                    key={i}
                    x={(x - barW / 2).toFixed(1)} y={y.toFixed(1)}
                    width={barW} height={bh > 0 ? bh.toFixed(1) : 0}
                    rx={2} fill={color} fillOpacity={0.75}
                  />
                );
              });
            })()
          ) : (
            // Line + area chart
            <>
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
            </>
          )}
          {segments2.map((seg, si) => {
            if (seg.length < 2) return null;
            const ptStr = seg.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            return (
              <polyline key={`s2-${si}`} points={ptStr} fill="none" stroke={color2 ?? "#8a8f94"}
                strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" />
            );
          })}
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

        {/* Hover dot — only for line charts */}
        {chartType === "line" && cursorX !== null && hIdx !== null && hVal !== null && (
          <circle
            cx={cursorX.toFixed(1)}
            cy={toY(hVal).toFixed(1)}
            r={5} fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
          />
        )}
      </svg>

      {/* Labels de jour — overlay HTML (taille fixe en px), pas du <text> SVG à l'intérieur du
          viewBox : voir ZoneSparkline.tsx pour le détail du piège de "zoom" évité ici. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {dates.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          const anchor = i === 0 ? "left" : i === n - 1 ? "right" : "center";
          const xPct = toXPct(i);
          return (
            <div key={d} style={{
              position: "absolute", bottom: 0,
              ...(anchor === "left" ? { left: `${xPct}%` } : anchor === "right" ? { right: `${100 - xPct}%` } : { left: `${xPct}%`, transform: "translateX(-50%)" }),
              fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap" as const,
            }}>
              {dayLabel(d)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
