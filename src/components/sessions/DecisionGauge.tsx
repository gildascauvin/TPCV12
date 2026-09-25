"use client";

import { useRef, useState } from "react";
import type { AutoregDir } from "@/lib/autoregulation";

const MIN = 1, MAX = 10;
export const TOLERANCE = 0.5; // demi-largeur MAX de la zone cible, en points de difficulté — exportée pour qu'AutoregButtons.tsx puisse calculer "inZone" sans dupliquer ce seuil.

/* Tolérance PROPORTIONNELLE à la difficulté prévue, plafonnée à TOLERANCE (2026-09-25, retour de
   Gildas avec capture d'écran : "Surcharger recommandé" affiché, mais la jauge montrait déjà "Dans
   la zone recommandée" sans rien à cliquer, sur une séance à difficulté prévue 4/10). Root cause :
   0,5 point était calibré pour des difficultés ~8-10, où c'est une fraction raisonnable du delta
   produit par une reco. Sur une difficulté prévue basse (4/10), même une reco réelle à 10% ne
   déplace la cible que de 0,4 point — AVALÉ par la tolérance fixe, qui devient alors plus large que
   le changement recommandé lui-même. Un coefficient de 5% (moitié du plus petit palier de chip,
   2,5%) garantit qu'AUCUNE reco réelle (≥10%, les seuls vraiment proposés par
   computeAutoregSuggestion — voir autoregulation.ts) ne peut jamais tomber "déjà dans la zone" au
   repos, quelle que soit la difficulté prévue, tout en préservant le comportement historique pour
   les difficultés hautes (coefficient×10 = 0,5, identique à l'ancien plafond fixe) et le cas
   volontaire "reco minuscule (2,5%) déjà satisfaite" pour les difficultés modérées/hautes. */
export function toleranceFor(plannedDifficulty: number): number {
  return Math.min(TOLERANCE, plannedDifficulty * 0.05);
}

function clampDiff(v: number) { return Math.max(MIN, Math.min(MAX, v)); }
function diffToLeft(d: number) { return ((d - MIN) / (MAX - MIN)) * 100; }
function leftToDiff(l: number) { return clampDiff(MIN + (l / 100) * (MAX - MIN)); }

// Dégradé continu vert→jaune→orange→rouge du POC (`poc-coach-contextclkaude.html`, `.gauge-fill`) —
// pas les 3 paliers pleins de DiffGauge.tsx : ici le fill doit lire comme une position sur tout le
// spectre 1-10, pas comme "facile/modérée/dure". Le fill est peint sur un canvas TOUJOURS large de
// 100% du track (via la largeur relative ci-dessous), puis rogné à la position du curseur — même
// technique que le POC (`background-size` en JS) portée en pourcentages CSS imbriqués.
const FILL_GRADIENT = "linear-gradient(to right,#4ade80 0%,#a3e635 22%,#eab308 45%,#f97316 70%,#ef4444 100%)";

export default function DecisionGauge({
  targetDifficulty, dir, value, onChange, light, tolerance = TOLERANCE,
}: {
  targetDifficulty: number;
  dir: AutoregDir;
  value: number;
  onChange: (newDifficulty: number) => void;
  light?: boolean;
  // Calculée par l'appelant via toleranceFor(plannedDifficulty) — défaut TOLERANCE (0.5) pour rester
  // inoffensif si jamais appelé sans, mais AutoregButtons.tsx la passe toujours désormais.
  tolerance?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const inZone = Math.abs(value - targetDifficulty) <= tolerance;

  function diffFromClientX(x: number): number {
    const rect = trackRef.current!.getBoundingClientRect();
    const left = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    // Pas de 1 point entier (2026-09-25, retour de Gildas — "faudrait pas 0.5 de finesse mais 1") :
    // remplace l'ancien snap à 0,5 (Math.round(...*2)/2). N'affecte QUE la précision atteignable en
    // draguant — le calcul de `tolerance` (toleranceFor(), plus haut) reste indépendant, toujours
    // proportionnel à la difficulté prévue, donc une reco réelle continue de sortir de la zone.
    return Math.round(leftToDiff(left));
  }

  function handlePointerDown(e: React.PointerEvent) {
    trackRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(diffFromClientX(e.clientX));
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    onChange(diffFromClientX(e.clientX));
  }
  function endDrag() { setDragging(false); }

  const cursorLeft = diffToLeft(value);
  const zoneLeft = diffToLeft(Math.max(MIN, targetDifficulty - tolerance));
  const zoneWidth = diffToLeft(Math.min(MAX, targetDifficulty + tolerance)) - zoneLeft;
  const dim = (o: number) => (light ? `rgba(0,0,0,${o})` : `rgba(255,255,255,${o})`);

  const hint = inZone
    ? "Dans la zone recommandée"
    : value < targetDifficulty
      ? "Sous la difficulté cible"
      : "Au dessus de la difficulté cible";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: dim(0.45) }}>
          Difficulté
        </span>
        <span style={{ fontSize: 16, fontWeight: 900, color: inZone ? "#2a8045" : (light ? "#171b1f" : "#fff") }}>
          {value % 1 === 0 ? value : value.toFixed(1)}
          <span style={{ fontSize: 11, fontWeight: 600, color: dim(0.45) }}> / 10</span>
        </span>
      </div>
      {/* `overflow: visible` (jamais hidden) — la zone conseillée (18px) doit déborder au-dessus/en
          dessous des 10px du track pour bien se voir "flotter" par-dessus, comme dans le POC. Seul
          le fill (ci-dessous) est rogné, dans son propre conteneur imbriqué. */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative", height: 10, borderRadius: 5, cursor: "pointer", touchAction: "none",
          background: "#e7e4df",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${cursorLeft}%`, overflow: "hidden", borderRadius: 5, zIndex: 1,
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: cursorLeft > 0 ? `${10000 / cursorLeft}%` : "100%",
            background: FILL_GRADIENT,
          }} />
        </div>
        <div style={{
          position: "absolute", top: "50%", transform: "translateY(-50%)",
          left: `${zoneLeft}%`, width: `${zoneWidth}%`, height: 18, borderRadius: 9, zIndex: 2,
          background: "rgba(47,158,68,.30)", border: "1.5px solid rgba(47,158,68,.6)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: `${cursorLeft}%`, transform: "translate(-50%,-50%)",
          width: 19, height: 19, borderRadius: "50%", zIndex: 3,
          background: inZone ? "#2a8045" : "#18181b",
          boxShadow: inZone ? "0 0 0 3px rgba(42,128,69,.2), 0 2px 8px rgba(0,0,0,.12)" : "0 0 0 3px rgba(24,24,27,.1), 0 2px 8px rgba(0,0,0,.18)",
          transition: dragging ? "none" : "left .35s cubic-bezier(.22,1,.36,1), background .2s",
        }}>
          {/* Poignée de préhension (3 traits horizontaux) — même détail que le POC (`.gauge-cursor::after`, box-shadow dupliqué au-dessus/en dessous). */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: 7, height: 2, background: "#fff", borderRadius: 1,
            boxShadow: "0 -3px 0 #fff, 0 3px 0 #fff",
          }} />
        </div>
      </div>
      <div style={{ marginTop: 7, fontSize: 10.5, fontWeight: 700, textAlign: "center", color: inZone ? "#2a8045" : dim(0.5) }}>
        {hint}
      </div>
    </div>
  );
}
