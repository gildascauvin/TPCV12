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
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>(athletes[0] ? [athletes[0].id] : []);
  const [startDate, setStartDate] = useState(monNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function toggleAthlete(id: string) {
    setSelectedAthleteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function assignOne(body: Record<string, string>): Promise<{ ok: true } | { ok: false; reason: string }> {
    const res = await fetch(`/api/programs/${programId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    if (res.status === 409) return { ok: false, reason: "déjà assigné" };
    const d = await res.json().catch(() => ({}));
    return { ok: false, reason: d.error ?? "erreur" };
  }

  async function handleAssign() {
    if (!isSelfMode && selectedAthleteIds.length === 0) return;
    if (!startDate) return;
    setLoading(true);
    setError("");
    try {
      if (isSelfMode) {
        const result = await assignOne({ start_date: startDate, user_id: selfUserId! });
        if (!result.ok) {
          setError(result.reason === "déjà assigné" ? "Ce sportif suit déjà ce programme." : result.reason);
          return;
        }
        setSuccess(true);
        setTimeout(() => { onAssigned(); onClose(); }, 1400);
        return;
      }

      const results = await Promise.all(selectedAthleteIds.map(async id => {
        const athlete = athletes.find(a => a.id === id);
        const body: Record<string, string> = { start_date: startDate, athlete_id: id };
        if (athlete?.user_id) body.user_id = athlete.user_id;
        const r = await assignOne(body);
        return { name: athlete?.name ?? "—", ...r };
      }));
      const failed = results.filter(r => !r.ok) as { name: string; reason: string }[];
      const succeeded = results.filter(r => r.ok);

      if (failed.length === 0) {
        setSuccess(true);
        setTimeout(() => { onAssigned(); onClose(); }, 1400);
      } else {
        onAssigned(); // rafraîchit la liste — les réussites restent acquises même si certaines ont échoué
        const failText = failed.map(f => `${f.name} (${f.reason})`).join(", ");
        setError(succeeded.length > 0 ? `Assigné à ${succeeded.length} sportif(s). Échec pour ${failText}.` : `Échec pour ${failText}.`);
      }
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
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2f9e44", marginTop: 10 }}>
              {isSelfMode || selectedAthleteIds.length <= 1 ? "Programme assigné !" : `Programme assigné à ${selectedAthleteIds.length} sportifs !`}
            </div>
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
                    Sportif{selectedAthleteIds.length > 1 ? "s" : ""} {selectedAthleteIds.length > 0 && `(${selectedAthleteIds.length})`}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {athletes.map(a => {
                      const checked = selectedAthleteIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => toggleAthlete(a.id)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                            border: checked ? "2px solid #d44000" : "2px solid #e8e4df",
                            background: checked ? "#fff4f0" : "#faf9f7",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#171b1f" }}>{a.name}</div>
                            {a.sport && <div style={{ fontSize: 11, color: "#8a8f94" }}>{a.sport}</div>}
                          </div>
                          <div style={{
                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                            border: checked ? "none" : "2px solid #d8d3cc",
                            background: checked ? "#d44000" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                          </div>
                        </button>
                      );
                    })}
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
                disabled={(!isSelfMode && selectedAthleteIds.length === 0) || !startDate || loading}
                style={{
                  width: "100%", padding: "14px", borderRadius: 26, border: "none",
                  cursor: (isSelfMode || selectedAthleteIds.length > 0) && !loading ? "pointer" : "not-allowed",
                  background: (isSelfMode || selectedAthleteIds.length > 0) && !loading ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df",
                  color: (isSelfMode || selectedAthleteIds.length > 0) && !loading ? "#fff" : "#aaa",
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {loading
                  ? "Génération des séances…"
                  : isSelfMode
                    ? "Démarrer ce programme"
                    : selectedAthleteIds.length > 1
                      ? `Assigner à ${selectedAthleteIds.length} sportifs`
                      : "Assigner le programme"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
