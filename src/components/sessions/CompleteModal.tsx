"use client";

import { useState } from "react";
import type { Session } from "@/types";

interface CompleteModalProps {
  session: Session;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

export default function CompleteModal({ session, onSave, onClose }: CompleteModalProps) {
  const [rpe, setRpe] = useState(session.rpe ?? 6);
  const [duration, setDuration] = useState(session.duration ?? 45);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
  }

  const impact = Math.min(Math.round((rpe * duration) / 60), 25);
  const rpeCls = rpe >= 8 ? "hard" : rpe >= 5 ? "moderate" : "easy";
  const rpeColor = { hard: "#d44000", moderate: "#b96500", easy: "#2f9e44" }[rpeCls];

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
        borderRadius: 30, padding: 28,
        width: "100%", maxWidth: 400,
      }}>
        {/* Title */}
        <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", marginBottom: 4 }}>
          Terminer la séance
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginBottom: 22, lineHeight: 1.4 }}>
          {session.name}
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Durée</div>
            <div style={{ fontSize: 20, fontWeight: 1000, color: "#171b1f", letterSpacing: "-0.04em" }}>{duration} <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>min</span></div>
          </div>
          <input
            type="range" min={5} max={240} step={5} value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>5 min</span><span>2h</span><span>4h</span>
          </div>
        </div>

        {/* RPE */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté réelle</div>
            <div style={{ fontSize: 20, fontWeight: 1000, color: rpeColor, letterSpacing: "-0.04em" }}>{rpe}<span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>/10</span></div>
          </div>
          <input
            type="range" min={1} max={10} step={1} value={rpe}
            onChange={e => setRpe(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>Très facile</span><span>Modéré</span><span>Max effort</span>
          </div>
        </div>

        {/* Stats mini grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "#f7f8f9", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 1000, color: "#171b1f", letterSpacing: "-0.04em", lineHeight: 1 }}>{duration}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>MINUTES</div>
          </div>
          <div style={{ background: "#f7f8f9", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 1000, color: rpeColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{rpe}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>DIFFICULTÉ</div>
          </div>
        </div>

        {/* Impact banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff3e8", border: "0.5px solid rgba(212,64,0,.22)", borderRadius: 12, padding: "10px 13px", marginBottom: 20, fontSize: 13, color: "#d44000", fontWeight: 700 }}>
          🔥 Impact fatigue estimé : −{impact} pts
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
          >
            {saving ? "..." : "Valider ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
