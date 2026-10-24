"use client";

import { outcomeRight, type Outcome } from "@/lib/adviceJudge";
import type { StripCell } from "@/lib/bilan";

/* Frise des verdicts (2026-10-24) : une case par conseil jugé, la plus récente à droite. Couleurs
   gardées (Gildas les préfère) mais jamais seules (il est daltonien) : case PLEINE = conseil confirmé,
   couleur du conseil (vert rien à changer, orange alléger, bleu pousser) ; case VIDE (contour gris) =
   non confirmé ; le signe redit le conseil : ↓ alléger, ↑ pousser, • rien à changer. Les cases des
   séances suivies et bien passées (hors des comptes) n'apparaissent pas. Toucher une case rouvre
   l'écran de résultat de sa séance, quand `onOpen` est fourni. */
const HUE: Record<"•" | "↓" | "↑", string> = { "•": "#2f9e44", "↓": "#f28a00", "↑": "#4c8dff" };
const GLYPH: Record<Outcome, "•" | "↓" | "↑"> = {
  justified: "↓", margin: "↓", followed_ok: "↓",
  push_right: "↑", push_wrong: "↑",
  none_same: "•", none_harder: "•", none_easier: "•",
};

export function VerdictStrip({ cells, onOpen, light = false, slots = 14 }: { cells: StripCell[]; onOpen?: (id: string) => void; light?: boolean; slots?: number }) {
  const line = light ? "rgba(23,27,31,0.35)" : "rgba(255,255,255,0.45)";
  const lineInk = light ? "rgba(23,27,31,0.55)" : "rgba(255,255,255,0.7)";
  const empty = light ? "rgba(23,27,31,0.08)" : "rgba(255,255,255,0.08)";
  const pad = Math.max(0, slots - cells.length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${slots}, 1fr)`, gap: 4 }}>
      {cells.map((c, i) => {
        const ok = !!outcomeRight(c.outcome);
        const tap = onOpen && c.id ? () => onOpen(c.id!) : undefined;
        return (
          <button key={`${c.date}-${i}`} type="button" onClick={tap} disabled={!tap}
            aria-label={`${c.date} : ${ok ? "conseil confirmé" : "conseil non confirmé"}`}
            style={{ aspectRatio: "1", borderRadius: 5, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, lineHeight: 1,
              background: ok ? HUE[GLYPH[c.outcome]] : "transparent", color: ok ? "#fff" : lineInk, border: ok ? 0 : `1.5px solid ${line}`, cursor: tap ? "pointer" : "default", fontFamily: "inherit" }}>
            {GLYPH[c.outcome]}
          </button>
        );
      })}
      {Array.from({ length: pad }, (_, i) => <span key={`e${i}`} style={{ aspectRatio: "1", borderRadius: 5, background: empty }} />)}
    </div>
  );
}

export function StripLegend({ light = false }: { light?: boolean }) {
  const ink = light ? "#62686e" : "rgba(255,255,255,0.62)";
  const line = light ? "rgba(23,27,31,0.35)" : "rgba(255,255,255,0.45)";
  const box = (bg: string | null, g: string) => (
    <span style={{ width: 13, height: 13, borderRadius: 3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, lineHeight: 1,
      background: bg ?? "transparent", color: bg ? "#fff" : ink, border: bg ? 0 : `1.5px solid ${line}` }}>{g}</span>
  );
  const item = (b: React.ReactNode, l: string) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{b}{l}</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11, color: ink }}>
      {item(box(HUE["•"], "•"), "comme prévu")}
      {item(box(HUE["↓"], "↓"), "alerte confirmée")}
      {item(box(HUE["↑"], "↑"), "surcharge justifiée")}
      {item(box(null, "↓"), "non confirmé")}
    </div>
  );
}
