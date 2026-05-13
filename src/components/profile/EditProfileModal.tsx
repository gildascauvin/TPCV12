"use client";

import { useState } from "react";
import type { Objective } from "@/types";

const SPORTS = [
  "Haltérophilie", "Sprint", "Préparation physique", "CrossFit",
  "Fitness", "Rugby", "Football", "Natation", "Cyclisme",
  "Course à pied", "Tennis", "Basketball", "Arts martiaux", "Autre",
];

const OBJECTIVES: { id: Objective; icon: string; label: string }[] = [
  { id: "performance", icon: "🏆", label: "Performance" },
  { id: "longevite", icon: "🌱", label: "Longévité" },
  { id: "stress", icon: "🧘", label: "Anti-stress" },
  { id: "composition", icon: "💪", label: "Composition" },
  { id: "equilibre", icon: "⚖️", label: "Équilibre" },
  { id: "rehab", icon: "🩹", label: "Réhabilitation" },
];

interface EditProfileModalProps {
  initialName: string;
  initialSport: string;
  initialObjective: Objective | null;
  initialFreq: number | null;
  onSave: (data: { name: string; sport: string; objective: Objective; freq_target: number }) => Promise<void>;
  onClose: () => void;
}

export default function EditProfileModal({
  initialName, initialSport, initialObjective, initialFreq, onSave, onClose,
}: EditProfileModalProps) {
  const [name, setName] = useState(initialName);
  const [sport, setSport] = useState(initialSport);
  const [objective, setObjective] = useState<Objective | null>(initialObjective);
  const [freq, setFreq] = useState(initialFreq ?? 4);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !sport || !objective) return;
    setSaving(true);
    await onSave({ name: name.trim(), sport, objective, freq_target: freq });
    setSaving(false);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2147483100, padding: 18,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        border: "1px solid rgba(0,0,0,.10)",
        boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        borderRadius: 30, paddingTop: 28, paddingLeft: 28, paddingRight: 28, paddingBottom: 0,
        width: "100%", maxWidth: 440,
        maxHeight: "calc(100vh - 34px)", overflowY: "auto",
        scrollbarWidth: "thin" as const,
      }}>
        <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", marginBottom: 4 }}>
          Modifier le profil
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginBottom: 22 }}>
          Tes informations personnalisent l'expérience.
        </div>

        {/* Prénom */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Prénom</div>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Alex"
            style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
          />
        </div>

        {/* Sport */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Sport principal</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {SPORTS.map(s => (
              <button
                key={s} onClick={() => setSport(s)}
                style={{
                  padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .14s",
                  border: sport === s ? "1px solid rgba(212,64,0,.40)" : "1px solid rgba(0,0,0,.10)",
                  background: sport === s ? "rgba(212,64,0,.08)" : "#f7f8f9",
                  color: sport === s ? "#d44000" : "#62686e",
                }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Objectif */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>Objectif</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {OBJECTIVES.map(o => (
              <button
                key={o.id} onClick={() => setObjective(o.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", borderRadius: 16, cursor: "pointer", textAlign: "left" as const, transition: "all .14s",
                  border: objective === o.id ? "1px solid rgba(212,64,0,.36)" : "1px solid rgba(0,0,0,.09)",
                  background: objective === o.id ? "rgba(212,64,0,.07)" : "#f7f8f9",
                  color: objective === o.id ? "#d44000" : "#62686e",
                  fontWeight: 700, fontSize: 13,
                }}
              >
                <span style={{ fontSize: 18 }}>{o.icon}</span>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fréquence */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 7 }}>
            Fréquence cible — <span style={{ color: "#d44000" }}>{freq} séance{freq > 1 ? "s" : ""}/semaine</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(f => (
              <button
                key={f} onClick={() => setFreq(f)}
                style={{
                  height: 44, borderRadius: 12, fontSize: 14, fontWeight: 900, cursor: "pointer", transition: "all .14s",
                  border: freq === f ? "none" : "1px solid rgba(0,0,0,.10)",
                  background: freq === f ? "linear-gradient(180deg,#f04a08,#d44000)" : "#f7f8f9",
                  color: freq === f ? "#fff" : "#62686e",
                  boxShadow: freq === f ? "0 6px 16px rgba(212,64,0,.22)" : "none",
                }}
              >{f}</button>
            ))}
          </div>
        </div>

        {/* Sticky actions */}
        <div style={{
          position: "sticky" as const, bottom: 0, zIndex: 20,
          display: "flex", gap: 8,
          margin: "16px -28px 0", padding: "14px 28px 20px",
          background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)",
          borderTop: "1px solid rgba(0,0,0,.08)",
          boxShadow: "0 -16px 28px rgba(0,0,0,.08)",
        }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave} disabled={saving || !name.trim() || !sport || !objective}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: (!name.trim() || !sport || !objective) ? 0.6 : 1 }}
          >
            {saving ? "..." : "Enregistrer ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
