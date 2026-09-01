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
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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
  /* targetAthleteIds : présent seulement quand `athletes` est fourni (contexte coach) — un ou
     plusieurs sportifs destinataires, jamais forcément le sportif consulté actuellement (voir
     "Sportifs destinataires" ci-dessous). Absent pour les 2 autres appelants (WeekClient — sportif
     sur sa propre semaine, ProgramBuilderModal — template local sans notion d'athlète). */
  onConfirm: (weeks: ReconduireOutputRow[][], targetAthleteIds?: string[]) => Promise<void>; // toujours 1 semaine (weeks[0])
  /* Coach uniquement — permet de reconduire la semaine vers un ou plusieurs sportifs différents de
     celui actuellement consulté, même idée que le sélecteur multi-destinataires de
     CoachSessionModal ("Sportifs destinataires"). Absent = comportement inchangé pour WeekClient/
     ProgramBuilderModal (aucun sélecteur affiché). */
  athletes?: CoachAthlete[];
  sourceAthleteId?: string;
}

function fmtNum(n: number): string {
  return n % 1 === 0 ? String(n) : String(n).replace(".", ",");
}

export default function ReconduireModal({ daySlots, title, onClose, onConfirm, athletes = [], sourceAthleteId }: ReconduireModalProps) {
  const { isMd } = useBreakpoint();
  const [mode, setMode] = useState<Mode>("maintien");
  const [customPct, setCustomPct] = useState(10);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<string[]>(() => sourceAthleteId ? [sourceAthleteId] : []);

  const showRecipients = athletes.length > 0;
  function toggleRecipient(id: string) {
    setRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const currentPct = mode === "maintien" ? 0 : mode === "deload" ? -customPct : customPct;
  const totalSessions = daySlots.reduce((n, s) => n + s.sessions.length, 0);
  const canConfirm = totalSessions > 0 && (!showRecipients || recipients.length > 0);

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    const rows: ReconduireOutputRow[] = [];
    daySlots.forEach((slot, dayIndex) => {
      slot.sessions.forEach(s => {
        const notes = s.notes ? s.notes.split("\n").map(line => parseAndApply(line, currentPct)).join("\n") : s.notes ?? "";
        const target_difficulty = adjustDifficulty(s.target_difficulty ?? 6, currentPct);
        rows.push({ dayIndex, name: s.name, notes, target_difficulty });
      });
    });
    await onConfirm([rows], showRecipients ? recipients : undefined);
    setSaving(false);
  }

  // Pas de "sub" (ex. "−10%") sous les 3 cartes — le % réel se choisit avec les chips juste en
  // dessous, l'action ne se fait pas ici (retour explicite : ça laissait croire à une valeur figée).
  const modeCards: { key: Mode; icon: string; label: string }[] = [
    { key: "deload", icon: "📉", label: "Décharge" },
    { key: "maintien", icon: "⏸", label: "Maintien" },
    { key: "surcharge", icon: "📈", label: "Surcharge" },
  ];

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
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.045em" }}>{title ?? "Reconduire la semaine"}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 15, color: "#62686e", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 0" }}>
          {/* Mode */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Mode de progression
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
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
              </div>
            ))}
          </div>

          {mode !== "maintien" && (
            <>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
                De combien {mode === "deload" ? "alléger" : "surcharger"} ?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
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
            </>
          )}

          {/* Aperçu — scroll horizontal par jour, mêmes composants séance/exercice que le planning
              (WeekSessionCard, DayColumn.tsx) plutôt qu'une liste de cartes diff maison. Sessions
              en lecture seule (onComplete/onEdit/onDuplicate no-op) : ce n'est qu'un aperçu avant
              confirmation, pas un éditeur. */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Aperçu des modifications
          </div>
          {totalSessions === 0 ? (
            <div style={{ fontSize: 13, color: "#8a8f94", fontStyle: "italic", textAlign: "center", padding: "12px 0", marginBottom: 20 }}>
              Aucune séance cette semaine à reconduire.
            </div>
          ) : (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(7, var(--wk-col, 220px))", gap: 10,
              overflowX: "auto", scrollSnapType: "x proximity", scrollbarWidth: "thin" as const,
              margin: "0 -24px 20px", padding: "2px 24px 6px",
            }}>
              {daySlots.map((slot, dayIndex) => (
                <div key={dayIndex} style={{ scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>
                    {DAY_LABELS[dayIndex]}
                  </div>
                  {slot.sessions.length === 0 && (
                    <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
                      Repos / libre
                    </div>
                  )}
                  {slot.sessions.map(s => {
                    const lines = s.notes ? s.notes.split("\n").filter(Boolean) : [];
                    const newDiff = adjustDifficulty(s.target_difficulty ?? 6, currentPct);
                    const rendered = lines.map(line => ({ line, after: parseAndApply(line, currentPct) }));
                    const previewSession: SessionLike = {
                      id: s.id, date: s.date, name: s.name, notes: s.notes,
                      duration: s.duration ?? null, rpe: null, done: false, target_difficulty: newDiff,
                    };
                    return (
                      <WeekSessionCard
                        key={s.id}
                        session={previewSession}
                        onComplete={() => {}}
                        onEdit={() => {}}
                        onDuplicate={() => {}}
                        hideActions
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
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Sportifs destinataires — coach uniquement, sous l'aperçu (demandé explicitement). */}
          {showRecipients && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
                Reconduire vers
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
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, alignItems: "center",
          padding: "16px 24px 20px", borderTop: "1px solid #f0f0f0", background: "#fff",
        }}>
          <span style={{ fontSize: 12, color: "#bbb", flex: 1 }}>{totalSessions} séance{totalSessions > 1 ? "s" : ""} concernée{totalSessions > 1 ? "s" : ""}</span>
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, cursor: "pointer", color: "#666" }}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !canConfirm}
            style={{ background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: canConfirm ? 1 : 0.5 }}
          >
            {saving ? "..." : recipients.length > 1 ? `Reconduire (${recipients.length}) →` : "Reconduire →"}
          </button>
        </div>
      </div>
    </div>
  );
}
