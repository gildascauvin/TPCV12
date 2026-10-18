"use client";

import { useRef } from "react";
import { hapticTick } from "@/lib/native";
import { wellnessColor } from "@/lib/wellness";

/* Jauge verticale 1-10 (2026-10-17, POC "Notes en un tap") : 10 lignes, 10 en haut, un libellé
   par ligne, barre proportionnelle à la note. Grise et sans curseur tant que rien n'est choisi :
   elle remplace les curseurs du wellness et du RPE de fin de séance, qui partaient d'une valeur par
   défaut enregistrée telle quelle si le sportif validait sans toucher. Couleur seulement une fois
   la note choisie : bleus récup (WELLNESS_RAMP) ou zones de charge (mêmes seuils que DecisionRing).
   Geste : un tap n'importe où choisit la note (au relâcher, si le doigt n'a presque pas bougé,
   sinon c'est un scroll de la page). Glisser n'est possible qu'à partir de la ligne choisie : seule
   elle bloque le scroll (touch-action: none). */

/* Libellés de l'échelle CR-10 de Foster (RPE de séance), un par note. */
export const CR10_LABELS: Record<number, string> = {
  1: "Très, très facile", 2: "Facile", 3: "Modéré", 4: "Un peu dur", 5: "Dur",
  6: "Dur +", 7: "Très dur", 8: "Très dur +", 9: "Presque max", 10: "Maximal",
};

export type ScalePalette = "recovery" | "recovery-inverted" | "load";

const LOAD_STOPS = {
  easy: ["#bfeec8", "#2f9e44"],
  moderate: ["#ffe0a0", "#f28a00"],
  hard: ["#ffb5a7", "#d44000"],
} as const;

function mixHex(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}

/* Couleur d'une note. Récup : clair = mauvais, foncé = bon (stress inversé : 10 = le plus clair).
   Charge : zone facile 1-4, modérée 5-7, dure 8-10, la teinte fonce à l'intérieur de chaque zone. */
export function scaleColor(palette: ScalePalette, n: number): string {
  if (palette === "load") {
    const [stops, lo, hi] = n <= 4 ? [LOAD_STOPS.easy, 1, 4] : n <= 7 ? [LOAD_STOPS.moderate, 5, 7] : [LOAD_STOPS.hard, 8, 10];
    return mixHex(stops[0], stops[1], 0.45 + 0.55 * ((n - lo) / (hi - lo)));
  }
  const g = palette === "recovery-inverted" ? 11 - n : n;
  return wellnessColor(((g - 1) / 9) * 100);
}

export function inkOn(hex: string): string {
  const c = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.36 ? "#172018" : "#ffffff";
}

const ROWS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const TAP_SLOP = 8;

interface Props {
  value: number | null;
  /* Note qui change (tap, ou chaque cran pendant le glissé). */
  onChange: (n: number) => void;
  /* Doigt relâché avec une note choisie : c'est là que le wellness passe à la question suivante. */
  onRelease?: (n: number) => void;
  palette: ScalePalette;
  /* Un libellé par note (1 à 10). */
  labels: Record<number, string>;
  rowHeight?: number;
}

export default function ScaleBars({ value, onChange, onRelease, palette, labels, rowHeight = 30 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ mode: "tap" | "drag"; x: number; y: number } | null>(null);
  const current = useRef(value);
  current.current = value;

  function rowAt(clientY: number): number | null {
    const rows = hostRef.current?.querySelectorAll<HTMLElement>("[data-n]");
    if (!rows || rows.length === 0) return null;
    let best: number | null = null, bd = Infinity;
    rows.forEach(r => {
      const b = r.getBoundingClientRect();
      const d = Math.abs(clientY - (b.top + b.height / 2));
      if (d < bd) { bd = d; best = Number(r.dataset.n); }
    });
    return best;
  }
  function pick(clientY: number) {
    const n = rowAt(clientY);
    if (n == null || n === current.current) return;
    hapticTick(current.current ?? 0, n);
    current.current = n;
    onChange(n);
  }

  function onPointerDown(e: React.PointerEvent) {
    const onHandle = (e.target as HTMLElement).closest?.("[data-handle]");
    if (onHandle) {
      gesture.current = { mode: "drag", x: e.clientX, y: e.clientY };
      try { hostRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      pick(e.clientY);
    } else {
      gesture.current = { mode: "tap", x: e.clientX, y: e.clientY };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "drag") pick(e.clientY);
    else if (Math.abs(e.clientY - g.y) > TAP_SLOP || Math.abs(e.clientX - g.x) > TAP_SLOP) gesture.current = null;
  }
  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.mode === "tap") pick(e.clientY);
    if (current.current != null) onRelease?.(current.current);
  }

  return (
    <div
      ref={hostRef}
      role="radiogroup"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; }}
      style={{ display: "flex", flexDirection: "column", gap: 4, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer" }}
    >
      {ROWS.map(n => {
        const c = scaleColor(palette, n);
        const fill = value != null && n <= value;
        const sel = value === n;
        const text = sel ? inkOn(c) : fill ? "#172018" : "#8a8f94";
        return (
          <div
            key={n}
            data-n={n}
            data-handle={sel ? "" : undefined}
            role="radio"
            aria-checked={sel}
            aria-label={`${n} · ${labels[n] ?? ""}`}
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(n); onRelease?.(n); } }}
            style={{
              position: "relative", height: rowHeight, borderRadius: 9, background: "#f4f5f4",
              touchAction: sel ? "none" : undefined,
            }}
          >
            <span aria-hidden style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: `${n * 10}%`, borderRadius: 9,
              background: fill ? (sel ? c : mixHex(c, "#ffffff", 0.45)) : "#e7e9e8", transition: "background .12s",
            }} />
            <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, height: "100%", padding: "0 10px" }}>
              <b style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, minWidth: 18, color: text }}>{n}</b>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: text }}>{labels[n]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
