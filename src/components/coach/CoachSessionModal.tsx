"use client";

import { useState } from "react";
import type { CoachSession, CoachAthlete } from "@/types";

interface Exercise {
  id: string;
  text: string;
}

export interface ReviewContext {
  wellness: number;
  maxDiff: number;
  queueCurrent: number;
  queueTotal: number;
}

interface Props {
  athleteName: string;
  date: string;
  session?: CoachSession | null;
  athletes?: CoachAthlete[];
  initialAthleteId?: string;
  reviewContext?: ReviewContext;
  onSave: (data: { name: string; notes: string; date: string; target_difficulty: number }, athleteIds: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function buildAttentionPoints(wellness: number, maxDiff: number): string[] {
  const points: string[] = [];
  if (wellness < 55) {
    points.push(`Wellness critique (${wellness}/100) — récupération insuffisante.`);
  } else if (wellness < 65) {
    points.push(`Wellness faible (${wellness}/100) — surveiller la charge du jour.`);
  } else if (wellness < 72) {
    points.push(`Wellness en dessous de la zone optimale (${wellness}/100).`);
  }
  if (maxDiff >= 9) {
    points.push(`Séance maximale prévue (${maxDiff}/10) — confirmer que la forme le permet.`);
  } else if (maxDiff >= 8) {
    points.push(`Séance dure prévue (${maxDiff}/10) — vérifier l'état de récupération.`);
  } else if (maxDiff >= 6 && wellness < 72) {
    points.push(`Charge importante (${maxDiff}/10) malgré une récupération limitée.`);
  }
  if (wellness < 65 && maxDiff >= 7) {
    points.push("Risque élevé : wellness bas + séance difficile.");
  }
  return points;
}

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }

export default function CoachSessionModal({ athleteName, date, session, athletes = [], initialAthleteId, reviewContext, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(session?.name ?? "");
  const [sessionDate, setSessionDate] = useState(session?.date ?? date);
  const [difficulty, setDifficulty] = useState(session?.target_difficulty ?? 6);
  const [exercises, setExercises] = useState<Exercise[]>(() => {
    if (session?.notes) {
      return session.notes.split("\n").filter(Boolean).map((text, i) => ({ id: String(i), text }));
    }
    return [{ id: "0", text: "" }];
  });
  const [recipients, setRecipients] = useState<string[]>(() =>
    initialAthleteId ? [initialAthleteId] : athletes.length > 0 ? [athletes[0].id] : []
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!session;
  const showRecipients = athletes.length > 0;

  const diffCls = difficulty >= 8 ? "hard" : difficulty >= 5 ? "moderate" : "easy";
  const diffLabel = { hard: "Dure", moderate: "Modérée", easy: "Facile" }[diffCls];
  const diffBg = { hard: "#fff0ed", moderate: "#fff7e6", easy: "#edf9f0" }[diffCls];
  const diffColor = { hard: "#d44000", moderate: "#b96500", easy: "#2f9e44" }[diffCls];
  const diffBorder = { hard: "rgba(212,64,0,.18)", moderate: "rgba(249,138,0,.22)", easy: "rgba(47,158,68,.18)" }[diffCls];

  function toggleRecipient(id: string) {
    if (isEdit && id === initialAthleteId) return; // original always stays
    setRecipients(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function addExercise() {
    setExercises(p => [...p, { id: Date.now().toString(), text: "" }]);
  }
  function duplicateExercise(id: string) {
    const idx = exercises.findIndex(e => e.id === id);
    if (idx < 0) return;
    setExercises(p => [...p.slice(0, idx + 1), { id: Date.now().toString(), text: p[idx].text }, ...p.slice(idx + 1)]);
  }
  function removeExercise(id: string) {
    setExercises(p => p.filter(e => e.id !== id));
  }
  function updateExercise(id: string, text: string) {
    setExercises(p => p.map(e => e.id === id ? { ...e, text } : e));
  }

  const canSave = name.trim() && (isEdit || recipients.length > 0);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const notes = exercises.map(e => e.text.trim()).filter(Boolean).join("\n");
    const ids = isEdit && initialAthleteId ? [initialAthleteId] : recipients;
    await onSave({ name: name.trim(), notes, date: sessionDate, target_difficulty: difficulty }, ids);
    setSaving(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  const extras = isEdit ? recipients.filter(id => id !== initialAthleteId).length : 0;
  const saveLabel = saving ? "..." : reviewContext
    ? (reviewContext.queueCurrent < reviewContext.queueTotal ? "Suivant →" : "Terminer ✓")
    : isEdit
      ? extras > 0 ? `Enregistrer + Dupliquer (${extras}) →` : "Enregistrer ✓"
      : recipients.length > 1 ? `Partager (${recipients.length}) →` : "Ajouter →";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2147483100, padding: "0 0" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: "30px 30px 0 0", paddingTop: 28, paddingLeft: 28, paddingRight: 28, paddingBottom: 0, width: "100%", maxWidth: 640, maxHeight: "90svh", overflowY: "auto", boxShadow: "0 -20px 60px rgba(0,0,0,.22)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: reviewContext ? 12 : 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f" }}>
              {reviewContext ? `Réviser · ${athleteName}` : isEdit ? "Modifier la séance" : "Nouvelle séance"}
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
              {reviewContext ? (
                <>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#d44000", background: "#fff0e9", border: "1px solid rgba(212,64,0,.20)", borderRadius: 999, padding: "2px 8px" }}>
                    Revue {reviewContext.queueCurrent}/{reviewContext.queueTotal}
                  </span>
                </>
              ) : (
                isEdit ? `Pour ${athleteName}` : "Choisir les destinataires ci-dessous"
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 16, color: "#62686e" }}>✕</button>
        </div>

        {/* Wellness + attention block (combined) */}
        {reviewContext && (() => {
          const wColor = reviewContext.wellness >= 70 ? "#78bf13" : reviewContext.wellness >= 45 ? "#f28a00" : "#d10000";
          const wBg = reviewContext.wellness >= 70 ? "rgba(120,191,19,0.07)" : reviewContext.wellness >= 45 ? "rgba(242,138,0,0.07)" : "rgba(209,0,0,0.07)";
          const wBorder = reviewContext.wellness >= 70 ? "rgba(120,191,19,0.26)" : reviewContext.wellness >= 45 ? "rgba(242,138,0,0.26)" : "rgba(209,0,0,0.26)";
          const wLabel = reviewContext.wellness >= 82 ? "Zone optimale" : reviewContext.wellness >= 65 ? "Zone stable" : reviewContext.wellness >= 45 ? "Zone prudente" : "Zone récupération";
          const dColor = reviewContext.maxDiff >= 8 ? "#d44000" : reviewContext.maxDiff >= 5 ? "#b96500" : "#2f9e44";
          const circ = +(2 * Math.PI * 21).toFixed(1);
          const offset = +(circ * (1 - reviewContext.wellness / 100)).toFixed(1);
          const points = buildAttentionPoints(reviewContext.wellness, reviewContext.maxDiff);
          return (
            <div style={{ background: wBg, border: `1px solid ${wBorder}`, borderRadius: 16, padding: "13px 16px", marginBottom: 18 }}>
              {/* Gauge row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative", flexShrink: 0, width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 16px rgba(0,0,0,.18))" }}>
                  <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)", display: "block" }}>
                    <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                    <circle cx="32" cy="32" r="27" fill="none" stroke={wColor} strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={String(+(2 * Math.PI * 27).toFixed(1))}
                      strokeDashoffset={String(+(2 * Math.PI * 27 * (1 - reviewContext.wellness / 100)).toFixed(1))} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 18, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.05em", color: wColor }}>{reviewContext.wellness}</span>
                    <span style={{ fontSize: 7, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,0.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: wColor, letterSpacing: "-0.01em" }}>{wLabel}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                    Wellness <span style={{ fontWeight: 800 }}>{reviewContext.wellness}/100</span>
                    {reviewContext.maxDiff > 0 && (
                      <> · Difficulté prévue <span style={{ fontWeight: 800, color: dColor }}>{reviewContext.maxDiff}/10</span></>
                    )}
                  </div>
                </div>
              </div>
              {/* Attention points */}
              {points.length > 0 && (
                <>
                  <div style={{ height: 1, background: `${wBorder}`, margin: "12px 0" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {points.map((point, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "#333", lineHeight: 1.4 }}>
                        <span style={{ color: wColor, fontWeight: 900, flexShrink: 0, marginTop: 1 }}>·</span>
                        {point}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Date */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Date</div>
          <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
            style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nom de la séance *</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Squat 5×5, Interval run…"
            style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
        </div>

        {/* Difficulty */}
        <div style={{ background: diffBg, border: `1px solid ${diffBorder}`, borderRadius: 16, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#202428" }}>Difficulté cible</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", background: diffBg, border: `1px solid ${diffBorder}`, color: diffColor, borderRadius: 999, padding: "3px 8px" }}>{diffLabel}</span>
              <span style={{ fontSize: 22, fontWeight: 1000, color: diffColor, lineHeight: 1, letterSpacing: "-0.04em" }}>{difficulty}</span>
            </div>
          </div>
          <input type="range" min={1} max={10} value={difficulty} step={1} onChange={e => setDifficulty(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>Facile</span><span>Modérée</span><span>Dure</span>
          </div>
        </div>

        {/* Exercises */}
        <div style={{ background: "#f6f6f6", border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 1000, color: "#202428", letterSpacing: "-0.02em" }}>Exercices de la séance</div>
            <span style={{ fontSize: 11, color: "#8a8f94" }}>{exercises.filter(e => e.text.trim()).length} renseigné{exercises.filter(e => e.text.trim()).length > 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exercises.map((ex, i) => (
              <div key={ex.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 7, alignItems: "start" }}>
                <textarea
                  value={ex.text}
                  onChange={e => updateExercise(ex.id, e.target.value)}
                  placeholder={`Exercice ${i + 1} : séries, reps, consignes...`}
                  style={{
                    height: 48, minHeight: 48, maxHeight: 48, resize: "none",
                    background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 14,
                    padding: "10px 12px", fontSize: 13, color: "#171b1f",
                    fontFamily: "inherit", lineHeight: 1.35, outline: "none",
                    overflowY: "auto",
                  }}
                />
                <button
                  onClick={() => duplicateExercise(ex.id)} title="Dupliquer"
                  style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(0,0,0,.08)", background: "#fff", color: "#8a8f94", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >⎘</button>
                {exercises.length > 1 ? (
                  <button
                    onClick={() => removeExercise(ex.id)} title="Supprimer"
                    style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(200,30,30,.14)", background: "#fff", color: "#d44000", cursor: "pointer", fontSize: 18, fontWeight: 1000, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >×</button>
                ) : (
                  <div style={{ width: 38 }} />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addExercise}
            style={{ width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 14, border: "1px dashed rgba(212,64,0,.35)", background: "#fff", color: "#d44000", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            + Ajouter un exercice
          </button>
        </div>

        {/* Recipients */}
        {showRecipients && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
              {isEdit ? "Dupliquer aussi vers" : "Sportifs destinataires"}
              {recipients.length > 0 && (
                <span style={{ marginLeft: 8, background: "#d44000", color: "#fff", borderRadius: 999, padding: "2px 7px", fontSize: 10 }}>
                  {recipients.length}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {athletes.map(a => {
                const checked = recipients.includes(a.id);
                const locked = isEdit && a.id === initialAthleteId;
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleRecipient(a.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: checked ? "#fff5f0" : "#fff",
                      border: checked ? "1.5px solid rgba(212,64,0,.35)" : "1.5px solid rgba(0,0,0,.09)",
                      borderRadius: 14, padding: "10px 12px",
                      cursor: locked ? "default" : "pointer", textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: checked ? (locked ? "#a0a0a0" : "#d44000") : "#f0efed",
                      border: checked ? "none" : "1.5px solid rgba(0,0,0,.14)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {checked && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#1f2428", lineHeight: 1.2 }}>
                      {a.name}
                      {locked && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", color: "#a0a0a0", textTransform: "uppercase" }}>original</span>}
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

        {/* Sticky actions bar */}
        <div style={{
          position: "sticky", bottom: 0, zIndex: 20,
          display: "grid",
          gridTemplateColumns: isEdit && onDelete ? "auto 1fr 1fr" : "1fr 1fr",
          gap: 8, alignItems: "center",
          margin: "16px -28px 0", padding: "14px 28px 20px",
          background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)",
          borderTop: "1px solid rgba(0,0,0,.08)",
          boxShadow: "0 -16px 28px rgba(0,0,0,.08)",
        }}>
          {isEdit && onDelete && (
            <div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ height: 46, paddingLeft: 14, paddingRight: 14, borderRadius: 14, border: "1px solid rgba(200,30,30,.22)", background: "#fff8f8", color: "#c81e1e", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const, display: "flex", alignItems: "center", gap: 5 }}
                >
                  🗑
                </button>
              ) : (
                <button
                  onClick={handleDelete} disabled={deleting}
                  style={{ height: 46, paddingLeft: 10, paddingRight: 10, borderRadius: 14, border: "1px solid rgba(200,30,30,.36)", background: "#fee2e2", color: "#c81e1e", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, minWidth: 104 }}
                >
                  {deleting ? "..." : "Confirmer 🗑"}
                </button>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            style={{ height: 46, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave} disabled={saving || !canSave}
            style={{ height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: !canSave ? 0.6 : 1 }}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
