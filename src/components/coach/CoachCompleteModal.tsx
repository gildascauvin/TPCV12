"use client";

import { useState } from "react";
import type { CoachSession } from "@/types";

interface Props {
  session: CoachSession;
  athleteName: string;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

export default function CoachCompleteModal({ session, athleteName, onSave, onClose }: Props) {
  const [rpe, setRpe] = useState(session.target_difficulty ?? 6);
  const [duration, setDuration] = useState(session.duration ?? 45);
  const [saving, setSaving] = useState(false);

  const rpeColor = rpe >= 8 ? "#d44000" : rpe >= 5 ? "#f28a00" : "#2f9e44";

  async function handleSave() {
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 4 }}>
          Résultat de la séance
        </div>
        <div style={{ fontSize: 13, color: "#8a8f94", marginBottom: 20 }}>{session.name} · {athleteName}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté réelle (RPE)</div>
              <div style={{ fontSize: 28, fontWeight: 1000, color: rpeColor, letterSpacing: "-0.04em" }}>{rpe}/10</div>
            </div>
            <input type="range" min={1} max={10} value={rpe} onChange={e => setRpe(Number(e.target.value))}
              style={{ width: "100%", accentColor: rpeColor }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
              <span>Très facile</span><span>Maximum</span>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Durée</div>
              <div style={{ fontSize: 28, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.04em" }}>{duration} min</div>
            </div>
            <input type="range" min={10} max={180} step={5} value={duration} onChange={e => setDuration(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#d44000" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
              <span>10 min</span><span>180 min</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, height: 50, borderRadius: 14, background: "#f0efed", color: "#62686e", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, height: 50, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}>
            {saving ? "..." : "Valider ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
