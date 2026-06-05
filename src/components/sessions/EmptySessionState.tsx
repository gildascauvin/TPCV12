"use client";

import { getSessionTemplates } from "@/lib/sessionTemplates";

interface Props {
  sport: string | null;
  label: string;
  onAdd: (suggestedName: string) => void;
}

export default function EmptySessionState({ sport, label, onAdd }: Props) {
  const suggested = sport ? getSessionTemplates(sport)[0][0] : "Séance qualité";
  return (
    <div style={{
      textAlign: "center", padding: "28px 20px",
      border: "0.5px dashed rgba(212,64,0,.28)",
      borderRadius: 20, background: "#fff",
      marginBottom: 10,
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: "#171b1f", marginBottom: 4, letterSpacing: "-0.02em" }}>
        Aucune séance cette semaine
      </div>
      <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>
        Suggéré : "{suggested}"
      </div>
      <button
        onClick={() => onAdd(suggested)}
        style={{
          width: "100%", height: 48, borderRadius: 14,
          background: "linear-gradient(180deg,#f04a08,#d44000)",
          color: "#fff", border: "none", fontSize: 14, fontWeight: 900,
          cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)",
        }}
      >
        + {label} →
      </button>
    </div>
  );
}
