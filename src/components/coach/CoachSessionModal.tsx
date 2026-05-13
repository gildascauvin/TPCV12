"use client";

import { useState } from "react";
import type { CoachSession } from "@/types";

interface Props {
  athleteName: string;
  date: string;
  session?: CoachSession | null;
  onSave: (data: { name: string; notes: string; date: string; target_difficulty: number }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function CoachSessionModal({ athleteName, date, session, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(session?.name ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [sessionDate, setSessionDate] = useState(session?.date ?? date);
  const [difficulty, setDifficulty] = useState(session?.target_difficulty ?? 6);
  const [saving, setSaving] = useState(false);

  const diffColor = difficulty >= 8 ? "#d44000" : difficulty >= 5 ? "#f28a00" : "#2f9e44";
  const diffLabel = difficulty >= 8 ? "Dure" : difficulty >= 5 ? "Modérée" : "Facile";

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), notes, date: sessionDate, target_difficulty: difficulty });
    setSaving(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 2147483100, padding: "0 0" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: "30px 30px 0 0", padding: 28, width: "100%", maxWidth: 640, maxHeight: "90svh", overflowY: "auto", boxShadow: "0 -20px 60px rgba(0,0,0,.22)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f" }}>
              {session ? "Modifier la séance" : "Nouvelle séance"}
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>Pour {athleteName}</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 16, color: "#62686e" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Date */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Date</div>
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
          </div>

          {/* Name */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nom de la séance</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Squat 5×5, Interval run…"
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
          </div>

          {/* Difficulty */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté cible</div>
              <div style={{ fontSize: 20, fontWeight: 1000, color: diffColor, letterSpacing: "-0.04em" }}>{difficulty}/10 · {diffLabel}</div>
            </div>
            <input type="range" min={1} max={10} value={difficulty} onChange={e => setDifficulty(Number(e.target.value))}
              style={{ width: "100%", accentColor: diffColor }} />
          </div>

          {/* Notes / exercises */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Exercices / Consignes</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={"Échauffement 10–15 min\nBloc principal : 4–6 séries\nConsignes techniques\nRetour au calme 5 min"}
              rows={5}
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 16px", fontSize: 14, color: "#171b1f", fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box" as const, lineHeight: 1.55 }} />
            <div style={{ fontSize: 10, color: "#8a8f94", marginTop: 4 }}>Un exercice par ligne</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ position: "sticky", bottom: 0, margin: "16px -28px 0", padding: "14px 28px 20px", background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {session && onDelete && (
              <button onClick={async () => { if (confirm("Supprimer cette séance ?")) { await onDelete(); } }} style={{ width: 46, height: 50, borderRadius: 14, background: "#fff", border: "1px solid rgba(220,30,30,.22)", color: "#c81e1e", cursor: "pointer", flexShrink: 0, fontSize: 16 }}>
                🗑
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, height: 50, borderRadius: 14, background: "#f0efed", color: "#62686e", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !name.trim()} style={{ flex: 2, height: 50, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}>
              {saving ? "..." : session ? "Enregistrer" : "Ajouter →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
