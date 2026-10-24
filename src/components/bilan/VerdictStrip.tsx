"use client";

import { outcomeRight } from "@/lib/adviceJudge";
import type { StripCell } from "@/lib/bilan";

/* Frise des verdicts (2026-10-24) : une case par conseil jugé, la plus récente à droite. Deux états
   seulement (Gildas : « juste confirmé ou non », le reste faisait fouillis) : case PLEINE verte =
   confirmé, case VIDE (contour) = non confirmé. Plein / vide se lit sans distinguer les couleurs
   (Gildas est daltonien). Toucher une case rouvre l'écran de résultat de sa séance si `onOpen`. */
const OK = "#2f9e44";

export function VerdictStrip({ cells, onOpen, light = false, slots = 14 }: { cells: StripCell[]; onOpen?: (id: string) => void; light?: boolean; slots?: number }) {
  const line = light ? "rgba(23,27,31,0.3)" : "rgba(255,255,255,0.4)";
  const empty = light ? "rgba(23,27,31,0.06)" : "rgba(255,255,255,0.07)";
  const pad = Math.max(0, slots - cells.length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${slots}, 1fr)`, gap: 4 }}>
      {cells.map((c, i) => {
        const ok = !!outcomeRight(c.outcome);
        const tap = onOpen && c.id ? () => onOpen(c.id!) : undefined;
        return (
          <button key={`${c.date}-${i}`} type="button" onClick={tap} disabled={!tap}
            aria-label={`${c.date} : ${ok ? "conseil confirmé" : "conseil non confirmé"}`}
            style={{ aspectRatio: "1", borderRadius: 4, padding: 0, background: ok ? OK : "transparent", border: ok ? 0 : `1.5px solid ${line}`, cursor: tap ? "pointer" : "default" }} />
        );
      })}
      {Array.from({ length: pad }, (_, i) => <span key={`e${i}`} style={{ aspectRatio: "1", borderRadius: 4, background: empty }} />)}
    </div>
  );
}

export function StripLegend({ light = false }: { light?: boolean }) {
  const ink = light ? "#8a8f94" : "rgba(255,255,255,0.55)";
  const line = light ? "rgba(23,27,31,0.3)" : "rgba(255,255,255,0.4)";
  const box = (ok: boolean) => <span style={{ width: 9, height: 9, borderRadius: 2, background: ok ? OK : "transparent", border: ok ? 0 : `1.5px solid ${line}` }} />;
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 11, color: ink }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{box(true)}confirmé</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{box(false)}non confirmé</span>
    </div>
  );
}
