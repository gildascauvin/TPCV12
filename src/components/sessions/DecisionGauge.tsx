"use client";

import { useRef, useState } from "react";
import type { AutoregDir } from "@/lib/autoregulation";

const MIN = 1, MAX = 10;

function clampDiff(v: number) { return Math.max(MIN, Math.min(MAX, v)); }
function diffToLeft(d: number) { return ((d - MIN) / (MAX - MIN)) * 100; }
function leftToDiff(l: number) { return clampDiff(MIN + (l / 100) * (MAX - MIN)); }

/* Remplissage : les dégradés de la barre de difficulté de prod (DiffGauge.tsx — facile 1-4, modérée
   5-7, dure 8-10), un seul dégradé choisi selon la position du curseur (2026-09-30, Gildas : "le
   même gradient que les autres jauges"). Remplace les segments pleins par palier du 2026-09-29. */
const DIFF_GRADIENT = {
  hard: "linear-gradient(90deg,#ffb5a7,#d44000)",
  moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)",
  easy: "linear-gradient(90deg,#bfeec8,#2f9e44)",
} as const;

export default function DecisionGauge({
  zoneLow, zoneHigh, dir, value, onChange, light, readOnly, plannedMarker, hint: hintOverride, noZone = false,
}: {
  /* Simple réglage de difficulté (2026-10-02, tiroirs d'édition de séance) : même barre, même
     remplissage, même curseur, mais sans zone conseillée, sans en-tête ni repère — on planifie, on
     ne décide pas d'un ajustement. zoneLow/zoneHigh/dir sont alors ignorés. */
  noZone?: boolean;
  // Les 2 entiers (ou 1 si identiques) qui bornent la zone conseillée — voir zoneRange() ci-dessus,
  // calculée par l'appelant (AutoregButtons.tsx) à partir de la cible brute.
  zoneLow: number;
  zoneHigh: number;
  dir: AutoregDir;
  value: number;
  onChange: (newDifficulty: number) => void;
  light?: boolean;
  /* Mode "décidé" (2026-09-27) : la jauge reste AFFICHÉE après validation, pour qu'on voie la
     nouvelle difficulté (avant, elle disparaissait au profit d'un simple bandeau ✓ — la carte
     séance se retrouvait donc sans aucune jauge de difficulté, puisque celle-ci a remplacé
     DiffGauge le 2026-09-24). Non draguable dans ce cas : la décision est prise, on la relit. */
  readOnly?: boolean;
  /* Repère "prévu" — la difficulté d'ORIGINE du plan, quand elle diffère de la valeur affichée
     (donc uniquement en mode décidé après une application réelle). Vient de
     `AutoregDecision.original.target_difficulty`, déjà stockée pour le mécanisme de retour arrière :
     aucune nouvelle donnée à faire circuler. */
  plannedMarker?: number | null;
  hint?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Arrondi avant comparaison — `value` au repos vaut `plannedDifficulty` tel quel, potentiellement
  // fractionnaire (ex. 4.4 après un ajustement précédemment appliqué et persisté) ; une fois dragué,
  // toujours un entier (voir diffFromClientX plus bas). Les deux cas se comparent à des entiers
  // (zoneLow/zoneHigh), donc toujours arrondir `value` en premier.
  const roundedValue = Math.round(value);
  const inZone = !noZone && roundedValue >= zoneLow && roundedValue <= zoneHigh;

  function diffFromClientX(x: number): number {
    const rect = trackRef.current!.getBoundingClientRect();
    const left = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
    // Pas de 1 point entier (2026-09-25, retour de Gildas — "faudrait pas 0.5 de finesse mais 1") :
    // condition nécessaire pour que la zone (elle-même en entiers, voir zoneRange()) soit toujours
    // atteignable en draguant.
    return Math.round(leftToDiff(left));
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    trackRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(diffFromClientX(e.clientX));
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (readOnly || !dragging) return;
    onChange(diffFromClientX(e.clientX));
  }
  function endDrag() { setDragging(false); }

  const cursorLeft = diffToLeft(value);
  // Largeur visuelle mini quand zoneLow===zoneHigh (cible calculée tombant pile sur un entier) —
  // purement cosmétique (la bande ne disparaît pas à l'œil), la logique `inZone` ci-dessus reste
  // une comparaison stricte à cet entier unique, pas affectée par ce padding visuel.
  // Marge visuelle de chaque côté (2026-09-29, Gildas : "on dirait que le curseur n'est pas dedans
  // même quand il est dans la zone") : le curseur est centré sur l'entier, donc une bande qui
  // s'arrêtait pile à l'entier coupait le curseur en deux sur les bornes.
  const bandLow = zoneLow - 0.35;
  const bandHigh = zoneHigh + 0.35;
  const zoneLeft = diffToLeft(Math.max(MIN, bandLow));
  const zoneWidth = diffToLeft(Math.min(MAX, bandHigh)) - zoneLeft;
  const dim = (o: number) => (light ? `rgba(0,0,0,${o})` : `rgba(255,255,255,${o})`);

  /* Position du curseur par rapport à la zone, en 3 états (2026-09-30, Gildas : jamais
     "Zone conseillée : 6-7 / 10") — même wording que la jauge ronde (DecisionRing.tsx). */
  const hint = hintOverride ?? (inZone ? "Dans la zone" : roundedValue < zoneLow ? "Sous la zone" : "Au-dessus de la zone");
  const markerLeft = plannedMarker != null && Math.round(plannedMarker) !== roundedValue
    ? diffToLeft(clampDiff(plannedMarker)) : null;

  return (
    <div>
      {!noZone && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: dim(0.45) }}>
          Difficulté
        </span>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 16, fontWeight: 700, color: inZone ? "#2a8045" : (light ? "#171b1f" : "#fff") }}>
          {value % 1 === 0 ? value : value.toFixed(1)}
          <span style={{ fontSize: 11, fontWeight: 600, color: dim(0.45) }}> / 10</span>
        </span>
      </div>}
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
          /* Partie VIDE du track (à droite du curseur) en SOMBRE (2026-09-30, Gildas : "mets la zone
             où la jauge est vide à droite en dark") — le pointillé de la zone conseillée, lui, passe
             en clair : sur un track clair il se perdait. Sombre plutôt que clair aussi parce que le
             contraste avec les paliers colorés du remplissage est plus net des deux côtés. */
          position: "relative", height: 12, borderRadius: 999, cursor: readOnly ? "default" : "pointer", touchAction: "none",
          /* Fond gris clair (2026-09-30, Gildas : "trop différente des autres") — le même track que
             DiffGauge.tsx, la barre de difficulté de toutes les autres cartes séance. */
          background: light ? "#e7e4df" : "rgba(255,255,255,.12)",
        }}
      >
        {/* Repère de la difficulté PRÉVUE (mode décidé) — un simple trait, jamais un 2e curseur :
            il n'y a rien à y ramener directement, le retour arrière se fait par le bouton dédié. */}
        {markerLeft !== null && (
          <div style={{ position: "absolute", top: "50%", left: `${markerLeft}%`, transform: "translate(-50%,-50%)", zIndex: 2, pointerEvents: "none" }}>
            <div style={{ width: 2, height: 16, borderRadius: 1, background: dim(0.32) }} />
            <div style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--font-mono), monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em", color: dim(0.4), whiteSpace: "nowrap" }}>
              prévu
            </div>
          </div>
        )}
        {/* Remplissage : le MÊME dégradé que DiffGauge.tsx (2026-09-30, Gildas : "le même gradient
            que les autres jauges") — un dégradé par palier (facile 1-4 / modérée 5-7 / dure 8-10),
            choisi selon la position du curseur. */}
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${cursorLeft}%`, borderRadius: 999, zIndex: 1,
          background: DIFF_GRADIENT[roundedValue >= 8 ? "hard" : roundedValue >= 5 ? "moderate" : "easy"],
          transition: dragging ? "none" : "width .35s cubic-bezier(.22,1,.36,1)",
        }} />
        {/* Zone conseillée en POINTILLÉ, sans remplissage (2026-09-29, POC) : le pointillé est un
            signal de forme, pas de couleur — un contour vert se serait confondu avec le palier vert
            du remplissage juste en dessous. */}
        {!noZone && <div style={{
          /* Déborde de 4px au-dessus et en dessous du track (2026-09-30, Gildas) : la zone se lit
             comme un cadre posé sur la barre, pas comme une bande de la barre. */
          position: "absolute", top: -4, bottom: -4,
          left: `${zoneLeft}%`, width: `${zoneWidth}%`, borderRadius: 999, zIndex: 2,
          /* Pointillé CLAIR, et contenu dans la hauteur du track (2026-09-30) : il se lit sur les
             paliers colorés du remplissage comme sur la partie vide sombre, et ne déborde plus sur
             le fond de la carte — sinon il resterait invisible sur les surfaces à carte blanche
             (Coach Control, Planning, AdjustSessionModal), qui utilisent la même jauge. */
          /* Sombre sur le track clair, clair sur fond sombre : lisible des deux côtés du remplissage. */
          border: `2px dashed ${light ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.85)"}`, pointerEvents: "none",
        }} />}
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
      {!noZone && <div style={{ marginTop: 7, fontSize: 10.5, fontWeight: 700, textAlign: "center", color: inZone ? "#2a8045" : dim(0.5) }}>
        {hint}
      </div>}
    </div>
  );
}
