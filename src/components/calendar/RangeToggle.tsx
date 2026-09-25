"use client";

export type RangeMode = "week" | "month" | "quarter";

const OPTIONS: { key: RangeMode; label: string }[] = [
  { key: "week", label: "7 j" },
  { key: "month", label: "28 j" },
  { key: "quarter", label: "90 j" },
];

/* Fenêtre des graphiques Charge/Récupération sur /today, /coach et /coach/athletes — même bouton
   partout (extraControls de CalendarHeader). 3 crans (2026-09-24, voir POC poc-coach-context_6.html,
   perSeg() : seg("per",[["7","7 j"],["28","28 j"],["90","90 j"]],st.per)) — remplace l'ancien toggle
   binaire "un seul bouton dynamique" (ViewToggleButton), qui ne peut représenter que 2 états. Segment
   à 3 boutons, celui actif surligné — même esprit que le seg() du POC. */
export default function RangeToggle({ mode, onChange }: { mode: RangeMode; onChange: (m: RangeMode) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, padding: 2 }}>
      {OPTIONS.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            height: 28, padding: "0 10px", borderRadius: 8, border: "none", cursor: "pointer",
            background: mode === o.key ? "rgba(255,255,255,.18)" : "transparent",
            color: mode === o.key ? "#fff" : "rgba(255,255,255,.55)",
            fontSize: 11, fontWeight: 800, whiteSpace: "nowrap",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
