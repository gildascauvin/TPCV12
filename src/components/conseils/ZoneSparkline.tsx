"use client";

import { useState, useRef } from "react";

/* Chart "Charge" façon WHOOP/TrainingPeaks (bandes de zone + points reliés) — inspiré d'une
   capture partagée par Gildas. Pensé pour les 7 derniers jours glissants : c'est la fenêtre où le
   concept de "zone" (Récup/Optimal/Surcharge) reste lisible jour par jour.

   Labels et points sont rendus en overlay HTML (position absolue en %, taille de police/rayon en
   px fixe) plutôt qu'en <text>/<circle> SVG à l'intérieur du viewBox : un <text> SVG scale avec
   la largeur rendue du SVG (unités viewBox), donc sur une carte desktop large, tout devenait
   visuellement "zoomé" hors de proportion avec le reste de la page — un plafond de largeur avait
   été essayé en pis-aller, mais l'objectif est une largeur pleine, donc il fallait s'attaquer à la
   vraie cause plutôt que contraindre la largeur. Seuls les éléments de fond (bandes de couleur,
   ligne de connexion) restent en SVG — un remplissage ou un trait qui s'étire ne "zoome" pas
   visuellement de la même façon qu'un texte ou un marqueur. */

const MONTH_FR = ["jan","fév","mar","avr","mai","juin","juil","aoû","sep","oct","nov","déc"];
const DAY_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_FR[d.getDay()];
}
function formatDateFr(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

/* Bandes ACWR — seuils Gabbett et al. (la "sweet spot" 0.8–1.3 est la bande la plus citée dans la
   littérature sportive) : <0.8 sous-charge, 0.8–1.3 zone optimale, >1.3 risque accru. */
type Zone = { min: number; max: number; label: string; color: string };
const ZONES: Zone[] = [
  { min: 0,   max: 0.8,       label: "RÉCUP.",    color: "#7ecb20" },
  { min: 0.8, max: 1.3,       label: "OPTIMAL",   color: "#2f9e44" },
  { min: 1.3, max: Infinity,  label: "SURCHARGE", color: "#d44000" },
];
const DISPLAY_MAX = 2; // ratio au-delà duquel on plafonne visuellement (charge >> chronique)

function zoneFor(ratio: number): Zone {
  return ZONES.find(z => ratio < z.max) ?? ZONES[ZONES.length - 1];
}

const W = 400, H = 168, PAD_L = 4, PAD_R = 10, PAD_TOP = 10, PAD_BOT = 22;

export default function ZoneSparkline({ points, dates, loads }: { points: (number | null)[]; dates: string[]; loads?: number[] }) {
  const [hover, setHover] = useState<{ idx: number; xPx: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const n = points.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_TOP - PAD_BOT;
  const toX = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const toY = (v: number) => {
    const clamped = Math.max(0, Math.min(DISPLAY_MAX, v));
    return PAD_TOP + (1 - clamped / DISPLAY_MAX) * plotH;
  };
  const toXPct = (i: number) => (toX(i) / W) * 100;
  const toYPct = (v: number) => (toY(v) / H) * 100;

  const known = points
    .map((v, i) => (v !== null ? { i, v } : null))
    .filter((p): p is { i: number; v: number } => p !== null);
  const linePts = known.map(p => `${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(xRatio * (n - 1))));
    setHover({ idx, xPx: e.clientX - rect.left });
  };

  const hIdx = hover?.idx ?? null;
  const hVal = hIdx !== null ? points[hIdx] : null;
  const hLoad = hIdx !== null && loads ? loads[hIdx] : null;
  const hDate = hIdx !== null ? dates[hIdx] : null;
  const hZone = hVal !== null ? zoneFor(hVal) : null;

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

  // Décimation des labels de jour si beaucoup de points (évite le chevauchement) — toujours le
  // premier et le dernier, un point tous les `labelStep` entre les deux.
  const labelStep = n > 10 ? Math.ceil(n / 7) : 1;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {hover && hDate && (
        <div style={tooltipStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
            {formatDateFr(hDate)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: hZone?.color ?? "#8a8f94" }}>
            {hVal !== null && hZone ? `⚡ ACWR ${hVal.toFixed(2)} · ${hZone.label}` : "— Historique insuffisant"}
          </div>
          {hLoad !== null && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {hLoad > 0 ? `${hLoad} UA` : "🛌 Repos"}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block", cursor: "crosshair" }}
        preserveAspectRatio="none"
      >
        {/* Bandes de zone (fond + barre de couleur — pas de texte ici) */}
        {ZONES.map((z, idx) => {
          const yTop = toY(Math.min(z.max, DISPLAY_MAX));
          const yBot = toY(z.min);
          return (
            <g key={z.label}>
              {idx === 1 && <rect x={PAD_L} y={yTop} width={plotW} height={yBot - yTop} fill="rgba(255,255,255,.05)" />}
              <rect x={0} y={yTop} width={3} height={Math.max(0, yBot - yTop)} fill={z.color} />
            </g>
          );
        })}

        {/* Ligne reliant les points */}
        {linePts && <polyline points={linePts} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={1.5} />}

        {/* Curseur vertical au survol */}
        {hIdx !== null && (
          <line x1={toX(hIdx).toFixed(1)} y1={0} x2={toX(hIdx).toFixed(1)} y2={H - PAD_BOT} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="3,3" />
        )}
      </svg>

      {/* Overlay HTML : labels de zone, points, labels de jour — taille fixe en px, jamais liée à
          la largeur rendue du SVG. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {ZONES.map(z => (
          <div key={z.label} style={{
            position: "absolute", left: 8, top: `${toYPct(Math.min(z.max, DISPLAY_MAX))}%`,
            transform: "translateY(2px)",
            fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", color: z.color,
          }}>
            {z.label}
          </div>
        ))}

        {known.map(({ i, v }) => {
          const z = zoneFor(v);
          const isHovered = hIdx === i;
          const size = isHovered ? 14 : 11;
          return (
            <div key={i} style={{
              position: "absolute",
              left: `calc(${toXPct(i)}% - ${size / 2}px)`, top: `calc(${toYPct(v)}% - ${size / 2}px)`,
              width: size, height: size, borderRadius: "50%",
              background: "#1c1c1c", border: `${isHovered ? 3 : 2.5}px solid ${z.color}`,
              transition: "width .1s, height .1s",
            }} />
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
