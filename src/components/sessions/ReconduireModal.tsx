"use client";

import { useState } from "react";
import type { SessionLike } from "@/components/calendar/DayColumn";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";

type Mode = "deload" | "maintien" | "surcharge";

/* Positionnel (index de jour Lun=0..Dim=6) plutôt que basé sur des dates réelles — permet à ce
   même modal de reconduire une semaine réelle (/week, /coach/planning, dates concrètes) OU une
   semaine de template local (ProgramBuilderModal, clés "Lun".."Dim", aucune date, aucune DB tant
   que le programme n'est pas sauvegardé). Chaque appelant traduit dayIndex → sa propre notion de
   "jour" (date réelle ou clé de jour du template). */
export interface ReconduireDaySlot { sessions: SessionLike[] }
export interface ReconduireOutputRow { dayIndex: number; name: string; notes: string; target_difficulty: number }

interface ReconduireModalProps {
  daySlots: ReconduireDaySlot[]; // 7 entrées, Lun → Dim, dans l'ordre
  title?: string;
  onClose: () => void;
  onConfirm: (weeks: ReconduireOutputRow[][]) => Promise<void>; // weeks[w] = lignes à créer pour la (w+1)-ième semaine suivante
}

export default function ReconduireModal({ daySlots, title, onClose, onConfirm }: ReconduireModalProps) {
  const [mode, setMode] = useState<Mode>("maintien");
  const [customPct, setCustomPct] = useState(5);
  const [weeks, setWeeks] = useState(1);
  const [saving, setSaving] = useState(false);

  const currentPct = mode === "maintien" ? 0 : mode === "deload" ? -customPct : customPct;
  const totalSessions = daySlots.reduce((n, s) => n + s.sessions.length, 0);

  async function handleConfirm() {
    setSaving(true);
    const weeksOut: ReconduireOutputRow[][] = [];
    for (let w = 0; w < weeks; w++) {
      const rows: ReconduireOutputRow[] = [];
      daySlots.forEach((slot, dayIndex) => {
        slot.sessions.forEach(s => {
          const notes = s.notes ? s.notes.split("\n").map(line => parseAndApply(line, currentPct)).join("\n") : s.notes ?? "";
          const target_difficulty = adjustDifficulty(s.target_difficulty ?? 6, currentPct);
          rows.push({ dayIndex, name: s.name, notes, target_difficulty });
        });
      });
      weeksOut.push(rows);
    }
    await onConfirm(weeksOut);
    setSaving(false);
  }

  const modeCards: { key: Mode; icon: string; label: string; sub: string }[] = [
    { key: "deload", icon: "📉", label: "Décharge", sub: `−${customPct}%` },
    { key: "maintien", icon: "⏸", label: "Maintien", sub: "Identique" },
    { key: "surcharge", icon: "📈", label: "Surcharge", sub: `+${customPct}%` },
  ];

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
        borderRadius: 30, width: "100%", maxWidth: 480,
        maxHeight: "calc(100vh - 34px)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "28px 28px 0" }}>
          <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", marginBottom: 4 }}>{title ?? "Reconduire la semaine"}</div>
          <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.5, marginBottom: 20 }}>
            Copie les {totalSessions} séance{totalSessions > 1 ? "s" : ""} de cette semaine sur les suivantes, avec un ajustement de charge optionnel.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 28px" }}>
          {/* Mode */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Mode de progression
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
            {modeCards.map(m => (
              <div
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  border: `2px solid ${mode === m.key ? "#d44000" : "#eee"}`,
                  background: mode === m.key ? "rgba(212,64,0,.05)" : "#fff",
                  borderRadius: 14, padding: "12px 8px", textAlign: "center", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: mode === m.key ? "#d44000" : "#171b1f" }}>{m.label}</div>
                <div style={{ fontSize: 10.5, color: "#8a8f94", marginTop: 2 }}>{m.sub}</div>
              </div>
            ))}
          </div>

          {mode !== "maintien" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: "#62686e", flexShrink: 0 }}>{mode === "deload" ? "−" : "+"}</span>
              <input type="range" min={1} max={30} value={customPct} onChange={e => setCustomPct(Number(e.target.value))} style={{ flex: 1, accentColor: "#d44000", cursor: "pointer" }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#d44000", width: 40, textAlign: "right", flexShrink: 0 }}>{customPct}%</span>
            </div>
          )}

          {/* Nombre de semaines */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Nombre de semaines
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <button
              onClick={() => setWeeks(w => Math.max(1, w - 1))}
              style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #eee", background: "#f8f8f8", fontSize: 18, color: "#666", cursor: "pointer" }}
            >−</button>
            <div style={{ flex: 1, textAlign: "center" }}>
              <span style={{ fontSize: 26, fontWeight: 800 }}>{weeks}</span>
              <span style={{ fontSize: 13, color: "#8a8f94", marginLeft: 4 }}>semaine{weeks > 1 ? "s" : ""}</span>
            </div>
            <button
              onClick={() => setWeeks(w => Math.min(8, w + 1))}
              style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #eee", background: "#f8f8f8", fontSize: 18, color: "#666", cursor: "pointer" }}
            >+</button>
          </div>

          {/* Diff preview */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Aperçu des modifications
          </div>
          <div style={{ marginBottom: 20 }}>
            {totalSessions === 0 && (
              <div style={{ fontSize: 13, color: "#8a8f94", fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>
                Aucune séance cette semaine à reconduire.
              </div>
            )}
            {daySlots.flatMap(slot => slot.sessions).map(s => {
              const lines = s.notes ? s.notes.split("\n").filter(Boolean) : [];
              const baseDiff = s.target_difficulty ?? 6;
              const newDiff = adjustDifficulty(baseDiff, currentPct);
              return (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: newDiff !== baseDiff ? "#d44000" : "#bbb", flexShrink: 0 }}>
                      Difficulté {newDiff !== baseDiff ? (
                        <>
                          <span style={{ color: "#bbb", textDecoration: "line-through", fontWeight: 500 }}>{baseDiff}</span> → {newDiff}
                        </>
                      ) : baseDiff}
                    </div>
                  </div>
                  {lines.length === 0 && <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic" }}>Aucun exercice</div>}
                  {lines.map((line, i) => {
                    const after = parseAndApply(line, currentPct);
                    const changed = after !== line;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "3px 0", fontSize: 12, borderBottom: i < lines.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                        {changed ? (
                          <>
                            <span style={{ color: "#aaa", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
                            <span style={{ color: "#ddd", flexShrink: 0 }}>→</span>
                            <span style={{ color: "#171b1f", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{after}</span>
                          </>
                        ) : (
                          <span style={{ color: "#bbb", fontStyle: "italic" }}>{line}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, alignItems: "center",
          padding: "16px 28px 20px", borderTop: "1px solid #f0f0f0", background: "#fff",
        }}>
          <span style={{ fontSize: 12, color: "#bbb", flex: 1 }}>{totalSessions * weeks} séance(s) créée(s)</span>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, cursor: "pointer", color: "#666" }}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || totalSessions === 0}
            style={{ background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: totalSessions === 0 ? 0.5 : 1 }}
          >
            {saving ? "..." : "Reconduire →"}
          </button>
        </div>
      </div>
    </div>
  );
}
