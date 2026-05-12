"use client";

import { useState } from "react";
import type { Session } from "@/types";

interface DuplicateModalProps {
  session: Session;
  onDuplicate: (newDate: string) => Promise<void>;
  onClose: () => void;
}

export default function DuplicateModal({ session, onDuplicate, onClose }: DuplicateModalProps) {
  const [newDate, setNewDate] = useState(session.date);
  const [saving, setSaving] = useState(false);

  async function handleDuplicate() {
    setSaving(true);
    await onDuplicate(newDate);
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
        borderRadius: 30, padding: 28,
        width: "100%", maxWidth: 380,
      }}>
        <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", marginBottom: 4 }}>
          Dupliquer
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginBottom: 20, lineHeight: 1.4 }}>
          Une copie de la séance sera créée à la date choisie.
        </div>

        {/* Session name preview */}
        <div style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.07)", borderRadius: 14, padding: "10px 13px", marginBottom: 18, fontSize: 14, fontWeight: 700, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {session.name}
        </div>

        {/* New date */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nouvelle date</div>
          <input
            type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
          />
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
            onClick={handleDuplicate} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
          >
            {saving ? "..." : "⎘ Dupliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}
