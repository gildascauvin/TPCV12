"use client";

import { useState } from "react";
import type { SessionLike } from "@/components/calendar/DayColumn";
import { wellnessColor } from "@/lib/wellness";
import type { CoachAthlete } from "@/types";

function scoreColor(s: number) { return wellnessColor(s); }

interface DuplicateModalProps {
  session: SessionLike;
  onDuplicate: (newDate: string, targetAthleteIds?: string[]) => Promise<void>;
  onClose: () => void;
  /* Coach uniquement — permet de dupliquer vers un ou plusieurs sportifs différents de celui
     actuellement consulté, même pattern que ReconduireModal.athletes/sourceAthleteId. Absent =
     comportement inchangé pour WeekClient (sportif, pas d'autre destinataire possible). */
  athletes?: CoachAthlete[];
  sourceAthleteId?: string;
}

export default function DuplicateModal({ session, onDuplicate, onClose, athletes = [], sourceAthleteId }: DuplicateModalProps) {
  const [newDate, setNewDate] = useState(session.date);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<string[]>(() => sourceAthleteId ? [sourceAthleteId] : []);

  const showRecipients = athletes.length > 0;
  function toggleRecipient(id: string) {
    setRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  const canDuplicate = !showRecipients || recipients.length > 0;

  async function handleDuplicate() {
    if (!canDuplicate) return;
    setSaving(true);
    await onDuplicate(newDate, showRecipients ? recipients : undefined);
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

        {/* Sportifs destinataires — coach uniquement */}
        {showRecipients && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>
              Dupliquer vers
              {recipients.length > 0 && (
                <span style={{ marginLeft: 8, background: "#d44000", color: "#fff", borderRadius: 999, padding: "2px 7px", fontSize: 10 }}>
                  {recipients.length}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {athletes.map(a => {
                const checked = recipients.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleRecipient(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: checked ? "#fff5f0" : "#fff",
                      border: checked ? "1.5px solid rgba(212,64,0,.35)" : "1.5px solid rgba(0,0,0,.09)",
                      borderRadius: 14, padding: "10px 12px",
                      cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: checked ? "#d44000" : "#f0efed",
                      border: checked ? "none" : "1.5px solid rgba(0,0,0,.14)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {checked && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1f2428", lineHeight: 1.2 }}>
                      {a.name}
                      {a.id === sourceAthleteId && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", color: "#a0a0a0", textTransform: "uppercase" }}>actuel</span>}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(a.wellness_score), flexShrink: 0 }}>{a.wellness_score}</span>
                  </button>
                );
              })}
            </div>
            {recipients.length === 0 && (
              <div style={{ fontSize: 12, color: "#c81e1e", marginTop: 8 }}>Sélectionne au moins un sportif.</div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleDuplicate} disabled={saving || !canDuplicate}
            style={{ flex: 1, height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: canDuplicate ? 1 : 0.5 }}
          >
            {saving ? "..." : recipients.length > 1 ? `⎘ Dupliquer (${recipients.length})` : "⎘ Dupliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}
