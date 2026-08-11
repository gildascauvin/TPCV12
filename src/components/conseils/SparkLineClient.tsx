"use client";

import { useState, useEffect, useRef } from "react";
import { wellnessColor, WELLNESS_RAMP } from "@/lib/wellness";

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

function formatFormValue(pct: number | null, zoneLabel?: string | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `📊 Forme : ${sign}${pct}%${zoneLabel ? ` · ${zoneLabel}` : ""}`;
}

/* Bandes de zone Form (Fitness − Fatigue, en % de la charge chronique) — mêmes bornes que
   sigDimInfo("form",...) dans fatigueSignature.ts, exprimées dans l'espace d'affichage "position"
   (50 + %, plafonné 0-100 — voir points2 au call site) pour rester à une hauteur FIXE peu importe
   la semaine affichée (contrairement à l'ancienne normalisation par pic de fenêtre). Rendues en
   liseré fin sur le bord droit (pas en bande pleine comme ZoneSparkline) : ce chart affiche déjà
   l'aire wellness en fond sur tout le 0-100, une bande pleine superposée aurait brouillé les deux
   lectures — le liseré reste une référence discrète, pas un fond qui rivalise visuellement. */
export type Zone2 = { min: number; max: number; label: string; color: string };
// 3 bandes (pas 5) — mêmes bornes que sigDimInfo("form",...) dans fatigueSignature.ts (±8%, soit
// 42/58 dans cet espace "position" 50+%) : la version à 5 paliers testée d'abord ajoutait plus de
// bruit que de lecture utile sur un chart aussi compact.
export const FORM_ZONES: Zone2[] = [
  { min: 0,  max: 42,  label: "FATIGUÉ",    color: "#d10000" },
  { min: 42, max: 58,  label: "ÉQUILIBRÉ",  color: "#8a8f94" },
  { min: 58, max: 101, label: "FRAIS",      color: "#2f9e44" },
];
function zone2For(zones: Zone2[], v: number): Zone2 {
  return zones.find(z => v < z.max) ?? zones[zones.length - 1];
}

/* Mappe un Form% (échelle fixe, ~-50 à +50 en pratique) sur l'espace d'affichage 0-100 partagé
   avec le wellness — 50 = 0%, plafonné aux bords pour les cas extrêmes plutôt que de sortir du
   chart. Fixe (pas relatif au pic de la fenêtre) : contrairement à l'ancienne normalisation, un
   même % tombe toujours à la même hauteur, quelle que soit la semaine affichée. */
export function formToChartPosition(pct: number): number {
  return Math.max(0, Math.min(100, 50 + pct));
}

/* wellnessColor()/WELLNESS_RAMP vivent dans src/lib/wellness.ts (source unique, réutilisée par les
   WellnessRing partout dans l'app depuis leur unification — voir ce fichier pour la doc complète
   de la rampe et du choix d'ancrage sur fond sombre). */

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
  points2Raw?: (number | null)[]; // valeur réelle (ex. %, non mappée à l'affichage) affichée en tooltip à côté de la valeur tracée
  color2?: string;
  /* Bandes de zone optionnelles pour la série secondaire (ex. Form) — voir FORM_ZONES plus haut,
     rendues en liseré sur le bord droit du chart. Bornes dans le même espace que `points2`. */
  zones2?: Zone2[];
  /* Colore la série principale en dégradé séquentiel bleu (WELLNESS_RAMP) au lieu du `color` plat —
     remplace aussi le fill/stroke par un <linearGradient> ancré sur l'axe Y (0-maxVal), donc chaque
     point de la courbe prend la teinte correspondant à sa vraie valeur, plus une légende continue
     en bord gauche. Pensé pour le wellness (magnitude continue, voir WELLNESS_RAMP) — `color` reste
     utilisé pour le point de survol/dernier point si `sequentialFill` est absent. */
  sequentialFill?: boolean;
  /* Ligne de seuil horizontale optionnelle (ex. monotonie = 2, seuil Foster) — uniquement pertinent
     quand un seuil universel existe réellement dans la littérature, pas une valeur inventée. */
  thresholdValue?: number;
  thresholdLabel?: string;
}

export default function SparkLineClient({
  points, dates, color, maxVal, height = 52, animDelay = 0, metricType, uid, chartType = "line",
  points2, points2Raw, color2, thresholdValue, thresholdLabel, zones2, sequentialFill,
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
  // Points connus de la série secondaire, avec leur valeur affichée (même espace que zones2) — pour
  // colorer chaque marqueur selon sa zone (voir known2.map plus bas), même principe que ZoneSparkline.
  const known2 = points2
    ? points2.map((v, i) => (v !== null ? { i, x: toX(i), y: toY(v), v } : null)).filter((p): p is { i: number; x: number; y: number; v: number } => p !== null)
    : [];
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
          <div style={{ fontSize: 13, fontWeight: 800, color: sequentialFill && hVal !== null ? wellnessColor(hVal) : color }}>
            {formatTooltipValue(metricType, hVal)}
          </div>
          {points2 && formatFormValue(hVal2Raw, hVal2 !== null && zones2 ? zone2For(zones2, hVal2).label : null) && (
            <div style={{ fontSize: 12, fontWeight: 700, color: color2 ?? "#8a8f94", marginTop: 2 }}>
              {formatFormValue(hVal2Raw, hVal2 !== null && zones2 ? zone2For(zones2, hVal2).label : null)}
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
          {sequentialFill && (
            <linearGradient id={`wellness-grad-${uid}`} x1="0" y1="1" x2="0" y2="0">
              {WELLNESS_RAMP.map(s => <stop key={s.stop} offset={`${s.stop * 100}%`} stopColor={s.hex} />)}
            </linearGradient>
          )}
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

        {/* Bandes de zone (Form) — liseré fin bord droit uniquement, voir FORM_ZONES plus haut pour
            le pourquoi (pas de bande pleine comme ZoneSparkline, pour ne pas rivaliser avec l'aire
            wellness qui occupe déjà tout le 0-100). */}
        {zones2 && zones2.map(z => {
          const yTop = toY(Math.min(z.max, maxVal));
          const yBot = toY(z.min);
          return <rect key={z.label} x={W - 3} y={yTop} width={3} height={Math.max(0, yBot - yTop)} fill={z.color} />;
        })}

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
                const strokeFill = sequentialFill ? `url(#wellness-grad-${uid})` : color;
                return (
                  <g key={si}>
                    <path d={fillD} fill={strokeFill} fillOpacity={sequentialFill ? 0.28 : 0.12} />
                    {seg.length > 1
                      ? <polyline points={ptStr} fill="none" stroke={strokeFill} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      : <circle cx={seg[0].x} cy={seg[0].y} r={3} fill={strokeFill} />}
                  </g>
                );
              })}
              {lastPt && (
                <circle
                  cx={lastPt.x.toFixed(1)} cy={lastPt.y.toFixed(1)}
                  r={4} fill={sequentialFill ? wellnessColor(points[lastNonNullIdx] as number) : color} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5}
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
            r={5} fill={sequentialFill ? wellnessColor(hVal) : color} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
          />
        )}
      </svg>

      {/* Labels de jour + labels de zone Form + marqueurs colorés sur la courbe Forme — overlay
          HTML (taille fixe en px), pas du <text>/<circle> SVG à l'intérieur du viewBox : voir
          ZoneSparkline.tsx pour le détail du piège de "zoom" évité ici. Marqueurs colorés par zone
          (même principe que ZoneSparkline) : la couleur du point, identique à celle du liseré et du
          badge Forme, rend explicite que ces zones décrivent la courbe pointillée, pas le wellness. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {/* Légende wellness — barre dégradée continue en bord gauche (miroir du liseré Form à
            droite), + 2 libellés d'ancrage seulement (pas de bandes discrètes : le wellness est une
            magnitude continue, pas 3 états — voir WELLNESS_RAMP plus haut). */}
        {sequentialFill && (
          <>
            <div style={{
              position: "absolute", left: 0, top: `${(PAD_TOP / H) * 100}%`, bottom: `${(PAD_BOT / H) * 100}%`,
              width: 3, background: `linear-gradient(to top, ${WELLNESS_RAMP.map(s => s.hex).join(",")})`,
            }} />
            <div style={{ position: "absolute", left: 6, top: `${(PAD_TOP / H) * 100}%`, fontSize: 7.5, fontWeight: 900, letterSpacing: "0.04em", color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, whiteSpace: "nowrap" as const }}>
              EN FORME
            </div>
            <div style={{ position: "absolute", left: 6, bottom: `${(PAD_BOT / H) * 100}%`, fontSize: 7.5, fontWeight: 900, letterSpacing: "0.04em", color: WELLNESS_RAMP[0].hex, whiteSpace: "nowrap" as const }}>
              FATIGUÉ
            </div>
          </>
        )}
        {zones2 && known2.map(({ i, x, y, v }) => {
          const z = zone2For(zones2, v);
          const size = hIdx === i ? 14 : 11;
          return (
            <div key={`f-${i}`} style={{
              position: "absolute",
              left: `calc(${(x / W) * 100}% - ${size / 2}px)`, top: `calc(${(y / H) * 100}% - ${size / 2}px)`,
              width: size, height: size, borderRadius: "50%",
              background: "#1c1c1c", border: `${hIdx === i ? 3 : 2.5}px solid ${z.color}`,
              transition: "width .1s, height .1s",
            }} />
          );
        })}
        {zones2 && zones2.map(z => {
          const yTopPct = (toY(Math.min(z.max, maxVal)) / H) * 100;
          const yBotPct = (toY(z.min) / H) * 100;
          return (
            <div key={z.label} style={{
              position: "absolute", right: 6, top: `${(yTopPct + yBotPct) / 2}%`,
              transform: "translateY(-50%)",
              fontSize: 7.5, fontWeight: 900, letterSpacing: "0.04em", color: z.color,
              textAlign: "right" as const, whiteSpace: "nowrap" as const,
            }}>
              {z.label}
            </div>
          );
        })}
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
