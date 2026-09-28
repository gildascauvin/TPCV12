"use client";

import { useState, useId } from "react";
import type { ChartSpec } from "@/lib/metricCards";

/* Chart générique d'UN indice (2026-09-28) — le détail qui se déplie sous une carte d'indice de
   l'Accueil. Les charts existants (ZoneSparkline, SparkLineClient) sont composites par
   construction : chacun trace plusieurs métriques ensemble. Ici il en faut un par
   indice, donc un composant piloté par un descripteur (ChartSpec, construit dans metricCards.ts),
   qui reste la source unique des bornes, des bandes, des couleurs et des formats.

   Mêmes conventions que ZoneSparkline, et pour la même raison : viewBox `0 0 400 H` +
   `preserveAspectRatio="none"`, mais TOUT ce qui est texte ou marqueur est rendu en overlay HTML à
   taille fixe en px — un <text> ou un <circle> dans le viewBox scale avec la largeur rendue, donc
   paraît "zoomé" sur une carte large. Seuls les remplissages et les traits restent en SVG. */

const MONTH_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];
const DAY_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const dayLabel = (d: string) => DAY_FR[new Date(d + "T12:00:00").getDay()];
function weekMonthLabel(dateStr: string, weekNum: number) {
  const d = new Date(dateStr + "T12:00:00");
  const m = MONTH_FR[d.getMonth()];
  return `S${weekNum} ${m.charAt(0).toUpperCase()}${m.slice(1)}.`;
}
function formatDateFr(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

const W = 400, PAD_L = 8, PAD_R = 10, PAD_TOP = 12, PAD_BOT = 22;

export default function MetricChart({ spec, height, weekLabels }: {
  spec: ChartSpec;
  height?: number;
  weekLabels?: boolean;
}) {
  const H = height ?? 200;
  const [hover, setHover] = useState<number | null>(null);
  const gradId = `mc-grad-${useId().replace(/:/g, "")}`;

  const { values: vals, dates, zones, fmt, colorAt } = spec;
  const n = vals.length;
  const real = vals.filter((v): v is number => v !== null);
  /* Sans ticks, le tracé démarre juste après le liseré (4, comme ZoneSparkline) : à 8 il restait un
     écart visible entre la légende verticale et le chart sur les indices sans bande de fond. */
  const padL = spec.showTicks ? 34 : zones ? 4 : PAD_L;
  const plotW = W - padL - PAD_R, plotH = H - PAD_TOP - PAD_BOT;

  /* Cadrage. Sans `autoScale` : l'échelle déclarée. Avec : la plage réellement occupée, élargie
     d'une marge et d'un `minSpan` plancher, puis reclampée dans les bornes physiques de l'indice —
     un ACWR ne doit jamais s'afficher négatif parce que la fenêtre est étroite. */
  const refV = spec.refLine?.value;
  const dataMin = real.length ? Math.min(...real, refV ?? Infinity) : spec.lo;
  const dataMax = real.length ? Math.max(...real, refV ?? -Infinity) : (spec.hi ?? 1);
  let lo = spec.lo;
  let hi = spec.hi ?? (real.length ? dataMax * 1.12 : 1);
  if (spec.autoScale && real.length) {
    const span = Math.max(dataMax - dataMin, spec.minSpan ?? ((dataMax - dataMin) || 1));
    const mid = (dataMin + dataMax) / 2;
    lo = Math.max(mid - span / 2 - span * 0.1, spec.lo);
    hi = spec.hi !== null && spec.hi !== undefined ? Math.min(mid + span / 2 + span * 0.1, spec.hi) : mid + span / 2 + span * 0.1;
    if (hi - lo < 1e-6) { lo = spec.lo; hi = spec.hi ?? dataMax * 1.12; }
  }
  const toX = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const toY = (v: number) => PAD_TOP + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * plotH;
  const pctX = (i: number) => (toX(i) / W) * 100;
  const pctY = (v: number) => (toY(v) / H) * 100;

  const known = vals.map((v, i) => (v !== null ? { i, v } : null)).filter((p): p is { i: number; v: number } => p !== null);
  /* Segments contigus : un trou (historique insuffisant) ne doit jamais être relié en ligne droite
     par-dessus le vide — même découpage que ZoneSparkline et SparkLineClient. */
  const segments: { i: number; v: number }[][] = [];
  for (const p of known) {
    const last = segments[segments.length - 1];
    if (last && p.i === last[last.length - 1].i + 1) last.push(p);
    else segments.push([p]);
  }
  const pts = (seg: { i: number; v: number }[]) => seg.map(p => `${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");

  /* Pastilles sur chaque jour, à trou au centre — même rendu que la courbe Forme en prod
     (SparkLineClient : fond sombre + bordure colorée). Au-delà de 31 jours on retombe sur les 3
     marqueurs de la prod (dernier point, point survolé, point isolé) : 90 pastilles rendraient la
     courbe illisible, et c'est exactement pour ça qu'elles avaient été réduites sur ZoneSparkline. */
  const markerIdx = new Set<number>(known.map(p => p.i));
  /* Un point par jour à toutes les densités (2026-09-28, Gildas : "à 90 j j'ai plus de points
     colorés") — on rétrécit au lieu de supprimer, c'est la couleur du point qui porte la zone. */
  const markerSize = n > 60 ? 5 : n > 31 ? 6 : n > 14 ? 8 : 11;

  const tickVals = [0, 0.25, 0.5, 0.75, 1].map(f => lo + (hi - lo) * f);
  const labelStep = n > 10 ? Math.ceil(n / 7) : 1;
  let weekNum = 0;

  return (
    <div
      style={{ position: "relative" as const, width: "100%" }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const i = Math.round(((x - padL) / plotW) * (n - 1));
        setHover(i >= 0 && i < n ? i : null);
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", aspectRatio: `${W} / ${H}`, cursor: "crosshair" }} aria-hidden="true">
        {spec.kind === "area" && spec.gradient && (
          <defs>
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1={PAD_TOP} x2="0" y2={PAD_TOP + plotH}>
              {spec.gradient.map(g => <stop key={g.offset} offset={`${g.offset}%`} stopColor={g.color} />)}
            </linearGradient>
          </defs>
        )}

        {/* Zones : un liseré vertical coloré à gauche (la légende), et une bande de fond UNIQUEMENT
            là où elle informe — la zone optimale pour l'ACWR, les zones à éviter pour la monotonie
            et la contrainte. Tout colorer ferait un fond arc-en-ciel qui ne dit rien. */}
        {zones?.map(z => {
          const yt = toY(Math.min(hi, z.to)), yb = toY(Math.max(lo, z.from));
          if (yb - yt <= 0.5) return null;
          const filled = spec.bandZones?.includes(z.label);
          return (
            <g key={z.label}>
              {/* La bande démarre juste après le liseré (x=3) et non à padL : un espace entre les
                  deux les faisait lire comme deux éléments sans rapport. */}
              {filled && <rect x={3} y={yt} width={W - PAD_R - 3} height={yb - yt} fill={spec.neutralBand ? "rgba(255,255,255,.05)" : z.color} opacity={spec.neutralBand ? 1 : 0.13} />}
              <rect x={0} y={yt} width={3} height={yb - yt} fill={z.color} />
            </g>
          );
        })}
        {spec.showTicks && tickVals.map(v => (
          <line key={v} x1={padL} y1={toY(v)} x2={W - PAD_R} y2={toY(v)} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
        ))}

        {/* Frontières de zone en pointillé (récupération) : la courbe porte déjà la couleur de zone,
            une bande en plus ne ferait que redire la même chose. */}
        {spec.boundaryLines?.map(b => (
          b > lo && b < hi
            ? <line key={b} x1={padL} y1={toY(b)} x2={W - PAD_R} y2={toY(b)} stroke="rgba(255,255,255,.42)" strokeWidth={1.2} strokeDasharray="4 4" />
            : null
        ))}

        {spec.refLine && spec.refLine.value <= hi && (
          <line x1={padL} y1={toY(spec.refLine.value)} x2={W - PAD_R} y2={toY(spec.refLine.value)} stroke="rgba(255,255,255,.45)" strokeWidth={1.2} strokeDasharray="5 4" />
        )}

        {spec.kind === "bars" && vals.map((v, i) => {
          if (v === null || v <= lo) return null;
          const bw = Math.max(2, Math.min(18, (plotW / n) * 0.62));
          return <rect key={i} x={toX(i) - bw / 2} y={toY(v)} width={bw} height={toY(lo) - toY(v)} rx={2} fill={colorAt(v)} opacity={0.9} />;
        })}

        {spec.kind === "area" && segments.map((seg, k) => (
          <path key={k} d={`M ${pts(seg).split(" ").join(" L ")} L ${toX(seg[seg.length - 1].i).toFixed(1)},${toY(lo).toFixed(1)} L ${toX(seg[0].i).toFixed(1)},${toY(lo).toFixed(1)} Z`} fill={spec.gradient ? `url(#${gradId})` : colorAt(seg[seg.length - 1].v)} opacity={0.22} />
        ))}

        {(spec.kind === "area" || spec.kind === "line" || (spec.kind === "dots" && spec.link)) && segments.map((seg, k) => (
          seg.length > 1 ? (
            <polyline
              key={`l${k}`} points={pts(seg)} fill="none"
              stroke={spec.kind === "dots" ? "rgba(255,255,255,.28)" : spec.gradient && spec.kind === "area" ? `url(#${gradId})` : colorAt(seg[seg.length - 1].v)}
              strokeWidth={spec.kind === "dots" ? 1.2 : 1.8}
              strokeLinecap="round" strokeLinejoin="round"
            />
          ) : null
        ))}

        {hover !== null && (
          <line x1={toX(hover)} y1={0} x2={toX(hover)} y2={H - PAD_BOT} stroke="rgba(255,255,255,.22)" strokeWidth={1} strokeDasharray="3,3" />
        )}
      </svg>

      {/* ── overlay HTML : texte et marqueurs, à taille fixe ── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" as const }}>
        {/* Nom de zone ET seuil d'entrée : "ÉLEVÉE" ne dit pas à partir de quand, "ÉLEVÉE ≥ 2,00"
            si. Pas de seuil sur la zone du bas, qui n'en a pas (elle part du plancher de l'axe). */}
        {zones?.filter(z => z.to > lo && z.from < hi).map(z => (
          <div key={z.label} style={{ position: "absolute", left: 14, top: `${pctY(Math.min(hi, z.to))}%`, transform: "translateY(2px)", fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: z.color, whiteSpace: "nowrap" as const }}>
            {z.label}
            {z.from > lo && <span style={{ opacity: 0.75, fontWeight: 600 }}>{` ≥ ${fmt(z.from)}`}</span>}
          </div>
        ))}
        {spec.showTicks && tickVals.map(v => (
          <div key={`t${v}`} style={{ position: "absolute", left: 0, top: `${pctY(v)}%`, transform: "translateY(-50%)", width: 30, textAlign: "right" as const, fontFamily: "var(--font-mono), monospace", fontSize: 9.5, color: "rgba(255,255,255,.38)" }}>
            {fmt(v).replace(/\s*(UA|\/100)$/, "")}
          </div>
        ))}

        {/* Légende de la ligne de repère (séance moyenne 4 sem.) — sans elle, un pointillé au milieu
            du chart ne dit pas ce qu'il représente. */}
        {spec.refLine && spec.refLine.value <= hi && (
          <div style={{ position: "absolute", right: 10, top: `${pctY(spec.refLine.value)}%`, transform: "translateY(-100%)", marginTop: -3, fontFamily: "var(--font-mono), monospace", fontSize: 9, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap" as const }}>
            {spec.refLine.label}
          </div>
        )}

        {spec.kind !== "bars" && known.filter(p => markerIdx.has(p.i)).map(p => {
          const size = hover === p.i ? markerSize + 3 : markerSize;
          return (
            <div key={p.i} style={{
              position: "absolute", left: `calc(${pctX(p.i)}% - ${size / 2}px)`, top: `calc(${pctY(p.v)}% - ${size / 2}px)`,
              width: size, height: size, borderRadius: "50%",
              background: "#1c1c1c", border: `${hover === p.i ? 3 : markerSize <= 6 ? 2 : 2.5}px solid ${colorAt(p.v)}`,
            }} />
          );
        })}

        {dates.map((d, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          if (weekLabels) weekNum += 1;
          return (
            <div key={d} style={{ position: "absolute", left: `${pctX(i)}%`, bottom: 0, transform: i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)", fontFamily: "var(--font-mono), monospace", fontSize: 9.5, color: "rgba(255,255,255,.38)", whiteSpace: "nowrap" as const }}>
              {weekLabels ? weekMonthLabel(d, weekNum) : dayLabel(d)}
            </div>
          );
        })}

        {hover !== null && vals[hover] !== null && (
          <div style={{ position: "absolute", left: `${pctX(hover)}%`, top: `${pctY(vals[hover] as number)}%`, transform: "translate(-50%, calc(-100% - 10px))", background: "rgba(18,18,18,.92)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.13)", borderRadius: 10, padding: "7px 11px", whiteSpace: "nowrap" as const, boxShadow: "0 8px 24px rgba(0,0,0,.5)", zIndex: 20 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "rgba(255,255,255,.5)" }}>{formatDateFr(dates[hover])}</div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, color: colorAt(vals[hover] as number) }}>{fmt(vals[hover] as number)}</div>
            {spec.tooltipExtra?.(hover) && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", marginTop: 2 }}>{spec.tooltipExtra(hover)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
