"use client";

import { useRef, useState } from "react";
import { type AutoregDir, zoneRange, pctToPoints } from "@/lib/autoregulation";

/* Jauge de décision en ANNEAU (2026-09-30, variante R2 du POC "Onglet Charge, version retenue" :
   https://claude.ai/artifact/McRwVAu86X9vArN2JRHBGF). Même contrat que DecisionGauge.tsx (la barre
   horizontale, qui reste celle de Coach Control et du Planning) — seule la forme change, montée sur
   /today via `shape="ring"` d'AutoregButtons.

   - Même géométrie que les jauges de charge/récup (AggregateGauge.tsx) : arc ouvert de 240°,
     A0 −120 / A1 +120 — une seule forme de jauge dans l'app, de la miniature d'onglet à ce ring.
   - Axe = RPE 1 à 10, remplissage aux paliers de la barre de difficulté de prod, rogné au curseur.
   - Plage conseillée = cadre pointillé FERMÉ qui entoure l'épaisseur de l'anneau, bouts
     entièrement arrondis : la transposition du rectangle pointillé de la barre (R2, préférée à R1
     où la plage était un arc ouvert posé à l'extérieur).
   - Centre : flèche + verbe de la reco, aux places du chiffre et du libellé de zone des autres
     jauges. Dessous : où est le curseur par rapport à la zone, sans wording inventé. */

const MIN = 1, MAX = 10;
const A0 = -120, A1 = 120;
/* Mêmes dégradés que DiffGauge.tsx / la jauge horizontale (2026-09-30, Gildas : "même gradient que
   les jauges RPE") — un dégradé choisi selon la position du curseur, déroulé le long de l'arc. */
const DIFF_STOPS = {
  hard: ["#ffb5a7", "#d44000"],
  moderate: ["#ffe0a0", "#f28a00"],
  easy: ["#bfeec8", "#2f9e44"],
} as const;
function mixHex(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}
const VERB = { low: "Alléger", high: "Surcharger", flat: "Maintenir" } as const;
const ARROW = { low: "⬇", high: "⬆", flat: "→" } as const;

const clampDiff = (v: number) => Math.max(MIN, Math.min(MAX, v));
const ang = (d: number) => A0 + ((clampDiff(d) - MIN) / (MAX - MIN)) * (A1 - A0);
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  return `M ${pt(polar(cx, cy, r, from))} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(polar(cx, cy, r, to))}`;
}
/* Contour fermé d'une portion d'anneau à bouts arrondis (demi-cercles de rayon (rOut−rIn)/2).
   polar() tourne dans le sens horaire à l'écran = sweep 1 en SVG, d'où sweep 1 sur l'arc extérieur
   et les deux bouchons, sweep 0 sur l'arc intérieur qui revient. */
function sectorPath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number) {
  const rc = ((rOut - rIn) / 2).toFixed(2);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(polar(cx, cy, rOut, a0))} A ${rOut} ${rOut} 0 ${big} 1 ${pt(polar(cx, cy, rOut, a1))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rIn, a1))}`
    + ` A ${rIn} ${rIn} 0 ${big} 0 ${pt(polar(cx, cy, rIn, a0))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rOut, a0))} Z`;
}

/* État d'une jauge de décision (valeur du curseur + zone conseillée), calculé comme la vraie jauge
   (AutoregButtons.tsx) — sert à la miniature de l'onglet Aujourd'hui (HomeTabs.tsx), pour qu'elle
   montre exactement la même chose que la grande (2026-09-30, Gildas : "fidèle"). */
export type DecisionRingState = { value: number; zoneLow: number; zoneHigh: number };
export function decisionRingState(
  sessions: { done: boolean; rpe?: number | null; target_difficulty?: number | null }[],
  suggestion: { dir: AutoregDir; reco: number } | null | undefined,
  previewPct?: number | null,
): DecisionRingState {
  const byDiff = [...sessions].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0));
  const undone = byDiff.find(s => !s.done);
  if (undone) {
    const planned = undone.target_difficulty ?? 6;
    const zone = suggestion
      ? zoneRange(Math.round(planned + pctToPoints(suggestion.reco)), suggestion.dir)
      : zoneRange(Math.round(planned), "low");
    const value = Math.max(MIN, Math.min(MAX, planned + (previewPct ? pctToPoints(previewPct) : 0)));
    return { value, ...zone };
  }
  const done = byDiff[0];
  if (!done) return { value: 1, zoneLow: 1, zoneHigh: 2 };   // repos
  const target = Math.round(done.target_difficulty ?? done.rpe ?? 5);
  return { value: done.rpe ?? target, zoneLow: target, zoneHigh: target };
}

/* Miniature de la jauge de décision (onglet Aujourd'hui) : même dégradé, même zone pointillée, même
   curseur que la grande, sans texte — géométrie des miniatures Charge/Récup (AggregateGauge bare). */
export function DecisionRingMini({ state, size = 40 }: { state: DecisionRingState; size?: number }) {
  const { value, zoneLow, zoneHigh } = state;
  const r = size * 0.36, sw = Math.max(3, Math.round(size * 0.17));
  const rOut = r + sw * 0.75, rIn = r - sw * 0.75;
  const cx = size / 2, cy = rOut + 2;
  const h = Math.round(cy + rOut * 0.5 + 2);
  const rounded = Math.round(value);
  const inZone = rounded >= zoneLow && rounded <= zoneHigh;
  const [c0, c1] = DIFF_STOPS[rounded >= 8 ? "hard" : rounded >= 5 ? "moderate" : "easy"];
  const end = ang(value);
  const SEGS = 16;
  const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, end);
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={sw} strokeLinecap="round" />
      {value > MIN && Array.from({ length: SEGS }, (_, i) => (
        <path key={i} d={arcPath(cx, cy, r, A0 + ((end - A0) * i) / SEGS, A0 + ((end - A0) * (i + 1.02)) / SEGS)}
          fill="none" stroke={mixHex(c0, c1, (i + 0.5) / SEGS)} strokeWidth={sw} />
      ))}
      <circle cx={sx} cy={sy} r={sw / 2} fill={c0} />
      {value > MIN && <circle cx={ex} cy={ey} r={sw / 2} fill={c1} />}
      <path d={sectorPath(cx, cy, rIn, rOut, ang(Math.max(MIN, zoneLow - 0.35)), ang(Math.min(MAX, zoneHigh + 0.35)))}
        fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={1.1} strokeDasharray="2 1.5" />
      <circle cx={ex} cy={ey} r={sw * 0.62} fill={inZone ? "#2a8045" : "#18181b"} stroke="#fff" strokeWidth={1.1} />
    </svg>
  );
}

/* Jour de repos (2026-09-30, Gildas : "même en jour de repos je veux afficher cette ring, comme
   étant dans la zone puisque c'est repos") — lecture seule, curseur au plancher dans sa zone. */
export function RestDecisionRing({ size, light }: { size?: number; light?: boolean }) {
  return (
    <DecisionRing
      zoneLow={1} zoneHigh={2} value={1} readOnly onChange={() => {}}
      size={size} light={light}
      centerLabel={{ arrow: "→", verb: "Repos" }}
      hint="Jour de repos · dans la zone"
    />
  );
}

/* Séance déjà faite (2026-09-30, Gildas : "dans le passé, je veux voir la jauge qu'il y ait une
   séance de faite ou non") — lecture seule, curseur sur le RPE réellement ressenti, repère blanc sur
   le prévu, zone = la difficulté prévue. Sans RPE noté, le curseur reste sur le prévu. */
export function DoneDecisionRing({ rpe, planned, size, light }: { rpe: number | null; planned: number | null; size?: number; light?: boolean }) {
  const target = planned ?? rpe ?? 5;
  const value = rpe ?? target;
  const hint = rpe === null ? "Séance faite · RPE non noté"
    : planned === null ? `Séance faite · RPE ${rpe}`
    : Math.round(rpe) === Math.round(planned) ? `Séance faite · RPE ${rpe}, comme prévu`
    : `Séance faite · RPE ${rpe} pour ${planned} prévu`;
  return (
    <DecisionRing
      zoneLow={Math.round(target)} zoneHigh={Math.round(target)} value={value} readOnly onChange={() => {}}
      plannedMarker={planned}
      size={size} light={light}
      centerLabel={{ arrow: "✓", verb: "Faite" }}
      hint={hint}
    />
  );
}

export default function DecisionRing({
  zoneLow, zoneHigh, recoDir, value, onChange, readOnly, plannedMarker, hint: hintOverride, size = 188, light, centerLabel,
}: {
  zoneLow: number;
  zoneHigh: number;
  /* Sens de la RECO, pas du curseur : c'est lui que porte le centre. Absent = Maintenir. */
  recoDir?: AutoregDir;
  value: number;
  onChange: (newDifficulty: number) => void;
  readOnly?: boolean;
  plannedMarker?: number | null;
  hint?: string;
  size?: number;
  /* Carte blanche (Coach Control, 2026-09-30) : texte du centre et pointillé en sombre, le track
     sombre reste — il se lit aussi bien sur fond clair. */
  light?: boolean;
  /* Centre imposé (2026-09-30, jour de repos) : remplace flèche + verbe de la reco. */
  centerLabel?: { arrow: string; verb: string };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const r = Math.round(size * 0.36), sw = Math.round(size * 0.085);
  const rOut = r + sw * 0.95, rIn = r - sw * 0.95;
  const cx = size / 2, cy = Math.round(rOut + sw / 2 + 3);
  const h = Math.round(cy + rOut * 0.5 + sw / 2 + 3);

  const roundedValue = Math.round(value);
  const inZone = roundedValue >= zoneLow && roundedValue <= zoneHigh;

  /* Angle du pointeur -> RPE entier. Dans l'ouverture du bas (|angle| > 120°), on colle à
     l'extrémité la plus proche plutôt que de sauter d'un bout à l'autre. */
  function diffFromPointer(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size - cx;
    const y = ((e.clientY - rect.top) / rect.height) * h - cy;
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg > 180) deg -= 360;
    deg = Math.max(A0, Math.min(A1, deg));
    return Math.round(MIN + ((deg - A0) / (A1 - A0)) * (MAX - MIN));
  }
  function handlePointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(diffFromPointer(e));
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (readOnly || !dragging) return;
    onChange(diffFromPointer(e));
  }
  const endDrag = () => setDragging(false);

  // Même marge visuelle que la barre (±0,35) : le curseur est centré sur l'entier, une plage qui
  // s'arrêtait pile à l'entier le couperait en deux sur les bornes.
  const zoneA0 = ang(Math.max(MIN, zoneLow - 0.35));
  const zoneA1 = ang(Math.min(MAX, zoneHigh + 0.35));

  /* Le dégradé suit l'arc : découpé en petits segments dont la couleur est interpolée (un
     linearGradient SVG suivrait la corde, pas la courbe). */
  const [c0, c1] = DIFF_STOPS[roundedValue >= 8 ? "hard" : roundedValue >= 5 ? "moderate" : "easy"];
  const fillEnd = ang(value);
  const SEGS = 28;
  const fills = value > MIN ? Array.from({ length: SEGS }, (_, i) => ({
    d: arcPath(cx, cy, r, A0 + ((fillEnd - A0) * i) / SEGS, A0 + ((fillEnd - A0) * (i + 1.02)) / SEGS),
    color: mixHex(c0, c1, (i + 0.5) / SEGS),
  })) : [];
  const [mx, my] = polar(cx, cy, r, ang(value));
  const showMarker = plannedMarker != null && Math.round(plannedMarker) !== roundedValue;

  const k = recoDir ?? "flat";
  const zonePos = roundedValue < zoneLow ? "Sous la zone" : roundedValue > zoneHigh ? "Au-dessus de la zone" : "Dans la zone";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: h }}>
        <svg
          ref={svgRef}
          width={size} height={h} viewBox={`0 0 ${size} ${h}`}
          role="img" aria-label={`Difficulté ${roundedValue} sur 10, zone conseillée ${zoneLow} à ${zoneHigh}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ display: "block", cursor: readOnly ? "default" : "pointer", touchAction: "none" }}
        >
          <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="#1d2226" strokeWidth={sw} strokeLinecap="round" />
          {fills.map((f, i) => <path key={i} d={f.d} fill="none" stroke={f.color} strokeWidth={sw} strokeLinecap="butt" />)}
          {/* Bouts arrondis du remplissage, aux couleurs de départ et d'arrivée du dégradé. Plus de
              repères blancs par point de RPE (2026-09-30, Gildas). */}
          {fills.length > 0 && (() => {
            const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, fillEnd);
            return <>
              <circle cx={sx} cy={sy} r={sw / 2} fill={c0} />
              <circle cx={ex} cy={ey} r={sw / 2} fill={c1} />
            </>;
          })()}
          {/* Repère du RPE PRÉVU (2026-09-30, Gildas : "une petite barre blanche qui symbolise le
              prévu") : trait blanc radial en travers de l'anneau. Au repos il est caché sous le
              curseur, qui démarre sur le prévu ; il apparaît dès qu'on déplace le curseur, et reste
              en mode décidé pour montrer d'où on est parti. */}
          {showMarker && (() => {
            const [ax, ay] = polar(cx, cy, r - sw * 0.8, ang(plannedMarker!));
            const [bx, by] = polar(cx, cy, r + sw * 0.8, ang(plannedMarker!));
            return <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#fff" strokeWidth={3} strokeLinecap="round" />;
          })()}
          <path d={sectorPath(cx, cy, rIn, rOut, zoneA0, zoneA1)} fill="none" stroke={light ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.75)"} strokeWidth={2} strokeDasharray="3 3" />
          {/* Même curseur que la jauge horizontale du Planning (DecisionGauge.tsx) : 19px, sombre,
              vert dans la zone, halo doux et poignée à 3 traits. Liseré blanc sur fond sombre
              seulement, sinon le curseur sombre se perd sur le track sombre. */}
          <g style={{ transform: `translate(${mx}px, ${my}px)`, transition: dragging ? "none" : "transform .35s cubic-bezier(.22,1,.36,1)" }}>
            <circle r={12.5} fill={inZone ? "rgba(42,128,69,.25)" : (light ? "rgba(24,24,27,.1)" : "rgba(255,255,255,.14)")} />
            <circle r={9.5} fill={inZone ? "#2a8045" : "#18181b"} stroke={light ? "none" : "rgba(255,255,255,.9)"} strokeWidth={1.5} />
            {[-3, 0, 3].map(dy => <line key={dy} x1={-3.5} x2={3.5} y1={dy} y2={dy} stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
          </g>
        </svg>
        {/* Arc ouvert en bas : le centre du cercle n'est pas celui de la boîte, on ancre sur cy.
            Mêmes tailles relatives qu'AggregateGauge (.215 valeur, .063 libellé). */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none",
        }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: light ? "#171b1f" : "#fff", fontSize: Math.round(size * 0.215) }}>
            {centerLabel?.arrow ?? ARROW[k]}
          </span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.15, marginTop: 4, color: light ? "#171b1f" : "#fff", fontSize: Math.max(9, Math.round(size * 0.063)) }}>
            {centerLabel?.verb ?? VERB[k]}
          </span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: inZone ? (light ? "#2a8045" : "#4ade80") : (light ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.5)") }}>
        {hintOverride ?? zonePos}
      </div>
    </div>
  );
}
