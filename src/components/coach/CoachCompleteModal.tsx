"use client";

import { useState } from "react";
import ScaleBars, { CR10_LABELS } from "@/components/ui/ScaleBars";
import type { CoachSession } from "@/types";

interface Props {
  session: CoachSession;
  athleteName: string;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

export default function CoachCompleteModal({ session, athleteName, onSave, onClose }: Props) {
  /* Même jauge que le sportif (CompleteModal, 2026-10-17) : aucune valeur par défaut pour une
     1re note, Valider bloqué tant que rien n'est choisi. Avant, RPE 6 était enregistré si le
     coach validait sans toucher. Une séance déjà notée garde sa note. */
  const [rpe, setRpe] = useState<number | null>(session.rpe ?? null);
  const [duration, setDuration] = useState(session.duration ?? 45);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (rpe == null) return;
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 420, maxHeight: "calc(100dvh - 36px)", overflowY: "auto", boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#171b1f", marginBottom: 4 }}>
          Résultat de la séance
        </div>
        <div style={{ fontSize: 13, color: "#8a8f94", marginBottom: 20 }}>{session.name} · {athleteName}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Durée</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 20, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em" }}>{duration} <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>min</span></div>
            </div>
            <input type="range" min={10} max={180} step={5} value={duration} onChange={e => setDuration(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
              <span>10 min</span><span>180 min</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 8 }}>Difficulté réelle</div>
            <ScaleBars value={rpe} onChange={setRpe} palette="load" labels={CR10_LABELS} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, height: 50, borderRadius: 16, background: "#f0efed", color: "#62686e", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || rpe == null} style={{ flex: 2, height: 50, borderRadius: 16, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 800, cursor: rpe == null ? "default" : "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)", opacity: rpe == null ? 0.45 : 1 }}>
            {saving ? "..." : "Valider ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
