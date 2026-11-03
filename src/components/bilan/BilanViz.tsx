"use client";

/* Visualisations du bilan reprises du POC (2026-11-03, GSXeRzonoyn2UdnD46L9ML v3) : une visu propre à
   chaque thème sous le grand chiffre. Toujours lisibles sans la couleur (plein + coche / pointillé,
   anneau extérieur / intérieur, mots sous chaque case) : Gildas est daltonien. */

const DIM = "rgba(255,255,255,0.6)";

export type Dot = { on: boolean; label: string; onClick?: () => void };

/* Pastilles : pleine avec une marque (✓ ou !) / contour pointillé. */
export function Dots({ items, color, mark = "✓" }: { items: Dot[]; color: string; mark?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((d, i) => (
        <button key={i} type="button" onClick={d.onClick} disabled={!d.onClick} aria-label={d.label}
          style={{ width: 28, height: 28, borderRadius: "50%", padding: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", fontSize: 14, fontWeight: 800, lineHeight: 1,
            background: d.on ? color : "transparent", color: "#070a0d", border: d.on ? 0 : "2px dashed rgba(255,255,255,0.6)", cursor: d.onClick ? "pointer" : "default" }}>
          {d.on ? mark : ""}
        </button>
      ))}
    </div>
  );
}

export function Legend({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: DIM }}>{children}</div>;
}

/* Dessinée à l'échelle 1 (viewBox ≈ largeur de la carte) : à 248 de large, elle était agrandie ×1,5. */
export function DayCurve({ norm, next, after, color, normLabel }: { norm: number; next: number; after: number | null; color: string; normLabel: string }) {
  const vals = [norm, next, ...(after !== null ? [after] : [])];
  const lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 2;
  const y = (v: number) => 30 + (1 - (v - lo) / (hi - lo || 1)) * 44;
  const xs = after !== null ? [40, 170, 300] : [70, 270];
  const labels = ["Soirée", "Lendemain", "2 jours après"].slice(0, vals.length);
  const pts = vals.map((v, i) => [xs[i], y(v)]);
  return (
    <svg viewBox="0 0 340 120" width="100%" style={{ maxWidth: 380, display: "block", margin: "0 auto" }} role="img" aria-label={`Forme ressentie : ${Math.round(norm)} habituelle, ${Math.round(next)} le lendemain d'une soirée${after !== null ? `, ${Math.round(after)} deux jours après` : ""}`}>
      <line x1="10" x2="330" y1={y(norm)} y2={y(norm)} stroke="rgba(255,255,255,.3)" strokeDasharray="3 4" />
      <text x={xs[1]} y={y(norm) - 8} textAnchor="middle" fill={DIM} fontSize="11">{normLabel} {Math.round(norm)}</text>
      <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => i === 1
        ? <g key={i}><circle cx={p[0]} cy={p[1]} r="6.5" fill={color} stroke="#fff" strokeWidth="2" /><text x={p[0] + 14} y={p[1] + 4} fill="#fff" fontSize="12.5" fontWeight="700">{Math.round(next)}</text></g>
        : <circle key={i} cx={p[0]} cy={p[1]} r="4.5" fill="#fff" />)}
      {labels.map((l, i) => <text key={l} x={xs[i]} y="114" textAnchor="middle" fill={DIM} fontSize="11">{l}</text>)}
    </svg>
  );
}

/* Frise des jours après une grosse séance : ● séance, − en dessous, ✓ revenu dans la norme. */
export function DayFrise({ steps, color }: { steps: { back: boolean }[]; color: string }) {
  const cells: { k: "s" | "low" | "ok"; label: string }[] = [{ k: "s", label: "Séance" }];
  let back = false;
  for (let d = 1; d <= 3; d++) {
    const st = steps[d - 1];
    if (back || (st && st.back)) { cells.push({ k: "ok", label: back ? `J+${d}` : `J+${d}\nrevenu` }); back = true; }
    else cells.push({ k: "low", label: st ? `J+${d}\nen dessous` : `J+${d}` });
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }} role="img" aria-label={cells.map(c => c.label.replace("\n", " ")).join(", ")}>
      {cells.map((c, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-line" }}>
          <div style={{ width: "100%", height: 46, borderRadius: 10, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800,
            background: c.k === "s" ? "#fff" : c.k === "ok" ? color : "transparent", color: "#062a31", border: c.k === "low" ? "2px dashed rgba(255,255,255,0.55)" : 0 }}>
            {c.k === "s" ? "●" : c.k === "ok" ? "✓" : <span style={{ color: "#fff" }}>−</span>}
          </div>
          {c.label}
        </div>
      ))}
    </div>
  );
}
