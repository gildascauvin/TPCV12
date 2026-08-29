"use client";

import { useState } from "react";
import { WeekSessionCard, type SessionLike } from "@/components/calendar/DayColumn";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { wellnessColor } from "@/lib/wellness";
import type { CoachAthlete } from "@/types";
import { useBreakpoint } from "@/hooks/useBreakpoint";

function scoreColor(s: number) { return wellnessColor(s); }

type Mode = "deload" | "maintien" | "surcharge";
const CHIP_VALUES = [2.5, 5, 10, 15, 20];

function fmtNum(n: number): string {
  return n % 1 === 0 ? String(n) : String(n).replace(".", ",");
}

interface DuplicateModalProps {
  session: SessionLike;
  /* pct : même convention que ReconduireModal — 0 en mode Maintien, négatif en Décharge, positif
     en Surcharge. Toujours transmis (jamais optionnel) pour que l'appelant applique l'ajustement
     de la même façon, qu'il soit nul ou non. */
  onDuplicate: (newDate: string, targetAthleteIds: string[] | undefined, pct: number) => Promise<void>;
  onClose: () => void;
  /* Coach uniquement — permet de dupliquer vers un ou plusieurs sportifs différents de celui
     actuellement consulté, même pattern que ReconduireModal.athletes/sourceAthleteId. Absent =
     comportement inchangé pour WeekClient (sportif, pas d'autre destinataire possible). */
  athletes?: CoachAthlete[];
  sourceAthleteId?: string;
}

export default function DuplicateModal({ session, onDuplicate, onClose, athletes = [], sourceAthleteId }: DuplicateModalProps) {
  const { isMd } = useBreakpoint();
  const [newDate, setNewDate] = useState(session.date);
  const [mode, setMode] = useState<Mode>("maintien");
  const [customPct, setCustomPct] = useState(10);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<string[]>(() => sourceAthleteId ? [sourceAthleteId] : []);

  const showRecipients = athletes.length > 0;
  function toggleRecipient(id: string) {
    setRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  const currentPct = mode === "maintien" ? 0 : mode === "deload" ? -customPct : customPct;
  const canDuplicate = !showRecipients || recipients.length > 0;

  async function handleDuplicate() {
    if (!canDuplicate) return;
    setSaving(true);
    await onDuplicate(newDate, showRecipients ? recipients : undefined, currentPct);
    setSaving(false);
  }

  const modeCards: { key: Mode; icon: string; label: string; sub: string }[] = [
    { key: "deload", icon: "📉", label: "Décharge", sub: `−${fmtNum(customPct)}%` },
    { key: "maintien", icon: "⏸", label: "Maintien", sub: "Identique" },
    { key: "surcharge", icon: "📈", label: "Surcharge", sub: `+${fmtNum(customPct)}%` },
  ];

  const lines = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const newDiff = adjustDifficulty(session.target_difficulty ?? 6, currentPct);
  const rendered = lines.map(line => ({ line, after: parseAndApply(line, currentPct) }));
  const previewSession: SessionLike = {
    id: session.id, date: newDate, name: session.name, notes: session.notes,
    duration: session.duration ?? null, rpe: null, done: false, target_difficulty: newDiff,
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: isMd ? "flex-end" : "stretch",
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.045em" }}>Dupliquer</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 15, color: "#62686e", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 20px" }}>
          <div style={{ fontSize: 13, color: "#62686e", marginBottom: 18, lineHeight: 1.4 }}>
            Une copie de la séance sera créée à la date choisie.
          </div>

          {/* New date */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nouvelle date</div>
            <input
              type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
            />
          </div>

          {/* Mode de charge */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Charge de la copie
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: mode !== "maintien" ? 14 : 20 }}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {CHIP_VALUES.map(v => {
                const active = v === customPct;
                const sign = mode === "deload" ? "−" : "+";
                return (
                  <button
                    key={v}
                    onClick={() => setCustomPct(v)}
                    style={{
                      padding: "9px 16px", borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: "pointer",
                      border: `1.5px solid ${active ? "#d44000" : "rgba(0,0,0,.12)"}`,
                      background: active ? "linear-gradient(180deg,#f04a08,#d44000)" : "#fff",
                      color: active ? "#fff" : "#62686e",
                      boxShadow: active ? "0 4px 12px rgba(212,64,0,.22)" : "none",
                    }}
                  >
                    {sign}{fmtNum(v)}%
                  </button>
                );
              })}
            </div>
          )}

          {/* Sportifs destinataires — coach uniquement */}
          {showRecipients && (
            <div style={{ marginBottom: 20 }}>
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

          {/* Aperçu — même carte que le planning (WeekSessionCard), diff avant/après si la charge
              a été ajustée. Lecture seule (onComplete/onEdit/onDuplicate no-op). */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Aperçu de la copie
          </div>
          <WeekSessionCard
            session={previewSession}
            onComplete={() => {}}
            onEdit={() => {}}
            onDuplicate={() => {}}
            cardStyle={{ cursor: "default" }}
            renderExerciseLine={(_ex, i) => {
              const { line, after } = rendered[i];
              const changed = after !== line;
              return changed ? (
                <div style={{ padding: "7px 9px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                  <div style={{ fontSize: 10.5, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1, wordBreak: "break-word" }}>{line}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#171b1f", wordBreak: "break-word" }}>{after}</div>
                </div>
              ) : (
                <div style={{
                  padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
                  borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {line}
                </div>
              );
            }}
          />
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, alignItems: "center",
          padding: "16px 24px 20px", borderTop: "1px solid #f0f0f0", background: "#fff",
        }}>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, cursor: "pointer", color: "#666" }}>
            Annuler
          </button>
          <button
            onClick={handleDuplicate} disabled={saving || !canDuplicate}
            style={{ flex: 1, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: canDuplicate ? 1 : 0.5 }}
          >
            {saving ? "..." : recipients.length > 1 ? `⎘ Dupliquer (${recipients.length})` : "⎘ Dupliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}
