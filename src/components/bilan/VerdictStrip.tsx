"use client";

import { outcomeRight, type Outcome } from "@/lib/adviceJudge";
import type { StripCell } from "@/lib/bilan";

/* Frise des verdicts (2026-10-24) : une case par conseil jugé, la plus récente à droite. Même couleur
   partout : bilan « Mes conseils » (fond sombre) et écran post-séance (fond clair). Toucher une case
   rouvre l'écran de résultat de sa séance, quand `onOpen` est fourni. */
const COLOR: Record<Outcome, string> = {
  none_same: "#2f9e44", justified: "#f28a00", push_right: "#4c8dff",
  margin: "var(--strip-miss)", push_wrong: "var(--strip-miss)", none_harder: "var(--strip-miss)",
  followed_ok: "transparent", none_easier: "transparent",
};

export function VerdictStrip({ cells, onOpen, light = false, slots = 14 }: { cells: StripCell[]; onOpen?: (id: string) => void; light?: boolean; slots?: number }) {
  const miss = light ? "#c9ced3" : "rgba(255,255,255,0.28)";
  const empty = light ? "inset 0 0 0 1.5px #dfe2e5" : "inset 0 0 0 1.5px rgba(255,255,255,0.18)";
  const pad = Math.max(0, slots - cells.length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${slots}, 1fr)`, gap: 4, ["--strip-miss" as string]: miss }}>
      {cells.map((c, i) => {
        const tap = onOpen && c.id ? () => onOpen(c.id!) : undefined;
        return (
          <button key={`${c.date}-${i}`} type="button" onClick={tap} disabled={!tap}
            aria-label={`${c.date} : ${outcomeRight(c.outcome) ? "conseil confirmé" : "conseil non confirmé"}`}
            style={{ aspectRatio: "1", borderRadius: 4, border: 0, padding: 0, background: COLOR[c.outcome], cursor: tap ? "pointer" : "default" }} />
        );
      })}
      {Array.from({ length: pad }, (_, i) => <span key={`e${i}`} style={{ aspectRatio: "1", borderRadius: 4, boxShadow: empty }} />)}
    </div>
  );
}

export function StripLegend({ light = false }: { light?: boolean }) {
  const ink = light ? "#62686e" : "rgba(255,255,255,0.62)";
  const items: [string, string][] = [["#2f9e44", "comme prévu"], ["#f28a00", "alerte confirmée"], ["#4c8dff", "surcharge justifiée"], [light ? "#c9ced3" : "rgba(255,255,255,0.28)", "conseil non confirmé"]];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: ink }}>
      {items.map(([c, l]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{l}</span>)}
    </div>
  );
}
