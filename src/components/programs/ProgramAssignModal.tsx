"use client";

import { useState } from "react";
import type { CoachAthlete } from "@/types";

interface Props {
  programId: string;
  programName: string;
  athletes: CoachAthlete[];
  selfUserId?: string;
  onClose: () => void;
  onAssigned: () => void;
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function ProgramAssignModal({ programId, programName, athletes, selfUserId, onClose, onAssigned }: Props) {
  const isSelfMode = athletes.length === 0 && !!selfUserId;
  const monNext = nextMonday();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(athletes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(monNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const selectedAthlete = athletes.find(a => a.id === selectedAthleteId);

  async function handleAssign() {
    if (!isSelfMode && !selectedAthleteId) return;
    if (!startDate) return;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = { start_date: startDate };
      if (isSelfMode) {
        body.user_id = selfUserId!;
      } else {
        body.athlete_id = selectedAthleteId;
        if (selectedAthlete?.user_id) body.user_id = selectedAthlete.user_id;
      }

      const res = await fetch(`/api/programs/${programId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) { setError("Ce sportif suit déjà ce programme."); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Erreur lors de l'assignation.");
        return;
      }
      setSuccess(true);
      setTimeout(() => { onAssigned(); onClose(); }, 1400);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2147483100, padding: 18,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 30, padding: "28px 28px 0",
        width: "100%", maxWidth: 420, maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 42px 120px rgba(0,0,0,.34)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em" }}>Assigner le programme</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999" }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8f94", marginBottom: 22 }}>{programName}</div>

        {success ? (
          <div style={{ textAlign: "center", padding: "30px 0 40px" }}>
            <div style={{ fontSize: 36 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2f9e44", marginTop: 10 }}>Programme assigné !</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 6 }}>Les séances ont été générées dans le planning.</div>
          </div>
        ) : (
          <>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Athletes — or self-mode */}
              {isSelfMode ? (
                <div style={{ padding: "11px 14px", borderRadius: 12, border: "2px solid #d44000", background: "#fff4f0", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#171b1f" }}>Démarrer pour moi ✓</div>
                  <div style={{ fontSize: 11, color: "#8a8f94" }}>Le programme sera ajouté à votre planning</div>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                    Sportif
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {athletes.map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAthleteId(a.id)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                          border: selectedAthleteId === a.id ? "2px solid #d44000" : "2px solid #e8e4df",
                          background: selectedAthleteId === a.id ? "#fff4f0" : "#faf9f7",
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#171b1f" }}>{a.name}</div>
                          {a.sport && <div style={{ fontSize: 11, color: "#8a8f94" }}>{a.sport}</div>}
                        </div>
                        {selectedAthleteId === a.id && <span style={{ color: "#d44000", fontSize: 16 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                  Début du programme
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: `Lundi prochain (${fmtDate(monNext)})`, value: monNext },
                    { label: `+2 sem. (${fmtDate(addWeeks(monNext, 2))})`, value: addWeeks(monNext, 2) },
                    { label: `+1 mois (${fmtDate(addWeeks(monNext, 4))})`, value: addWeeks(monNext, 4) },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStartDate(opt.value)}
                      style={{
                        flex: 1, padding: "7px 6px", borderRadius: 10, cursor: "pointer", fontSize: 10.5, fontWeight: 600,
                        border: startDate === opt.value ? "2px solid #d44000" : "2px solid #e8e4df",
                        background: startDate === opt.value ? "#fff4f0" : "#faf9f7",
                        color: startDate === opt.value ? "#d44000" : "#555",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 12,
                    border: "2px solid #e8e4df", fontSize: 13, outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {error && <div style={{ color: "#d44000", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            </div>

            <div style={{
              position: "sticky", bottom: 0, margin: "16px -28px 0",
              padding: "14px 28px 20px",
              background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)",
            }}>
              <button
                onClick={handleAssign}
                disabled={(!isSelfMode && !selectedAthleteId) || !startDate || loading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 26, border: "none",
                  cursor: (isSelfMode || selectedAthleteId) && !loading ? "pointer" : "not-allowed",
                  background: (isSelfMode || selectedAthleteId) && !loading ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df",
                  color: (isSelfMode || selectedAthleteId) && !loading ? "#fff" : "#aaa",
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {loading ? "Génération des séances…" : isSelfMode ? "Démarrer ce programme" : "Assigner le programme"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
