"use client";

import { useState, useEffect } from "react";
import type { Session, ExerciseAttachments } from "@/types";
import ExerciseBlockEditor from "@/components/sessions/ExerciseBlockEditor";
import ShareButton from "@/components/sessions/ShareButton";
import { buildUserHistory, setUserHistory, resetUserHistory } from "@/lib/exerciseAutocomplete";
import { createClient } from "@/lib/supabase/client";

interface AddSessionModalProps {
  date: string;
  session?: Session;
  initialName?: string;
  hideDate?: boolean;
  /* Optionnel — quand fourni, l'autocomplete priorise les exercices des dernières séances
     réellement faites par cet utilisateur (fetch léger, RLS déjà scoping sur son propre user_id). */
  userId?: string;
  /* Signe les commentaires laissés dans l'éditeur d'exercices — pas juste "Sportif" générique. */
  userName?: string;
  onSave: (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function AddSessionModal({ date, session, initialName, hideDate, userId, userName, onSave, onDelete, onClose }: AddSessionModalProps) {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.from("sessions").select("notes,date").eq("user_id", userId).eq("done", true)
      .order("date", { ascending: false }).limit(60)
      .then(({ data }) => { if (!cancelled && data) setUserHistory(buildUserHistory(data)); });
    return () => { cancelled = true; resetUserHistory(); };
  }, [userId]);

  // Marque la séance vue par le sportif — fait disparaître le point de notification sur ses lignes
  // dans les vues de lecture. `user_id: "template"` = édition de programme (ProgramBuilderModal),
  // pas une vraie séance, rien à marquer.
  useEffect(() => {
    if (!session?.id || session.user_id === "template") return;
    createClient().from("sessions").update({ viewed_by_athlete_at: new Date().toISOString() }).eq("id", session.id).then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const [name, setName] = useState(session?.name ?? initialName ?? "");
  const [selectedDate, setSelectedDate] = useState(session?.date ?? date);
  const [targetDiff, setTargetDiff] = useState(session?.target_difficulty ?? 6);
  const [exercisesText, setExercisesText] = useState(session?.notes ?? "");
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, ExerciseAttachments>>(session?.exercise_media ?? {});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = !!session;

  const diffCls = targetDiff >= 8 ? "hard" : targetDiff >= 5 ? "moderate" : "easy";
  const diffLabel = { hard: "Dure", moderate: "Modérée", easy: "Facile" }[diffCls];
  const diffBg = { hard: "#fff0ed", moderate: "#fff7e6", easy: "#edf9f0" }[diffCls];
  const diffColor = { hard: "#d44000", moderate: "#b96500", easy: "#2f9e44" }[diffCls];
  const diffBorder = { hard: "rgba(212,64,0,.18)", moderate: "rgba(249,138,0,.22)", easy: "rgba(47,158,68,.18)" }[diffCls];

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const notes = exercisesText.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
    await onSave({ name: name.trim(), notes, date: selectedDate, target_difficulty: targetDiff, exercise_media: exerciseMedia });
    setSaving(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2147483100, padding: 18, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        border: "1px solid rgba(0,0,0,.10)",
        boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        borderRadius: 30, paddingTop: 28, paddingLeft: 28, paddingRight: 28, paddingBottom: 0,
        width: "100%", maxWidth: 620,
        maxHeight: "calc(100vh - 34px)",
        overflowY: "auto",
        animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
        overscrollBehavior: "contain",
        scrollbarWidth: "thin" as const,
      }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", marginBottom: 4 }}>
            {isEdit ? "Modifier la séance" : "Nouvelle séance"}
          </div>
          {isEdit && session && (
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <ShareButton
                resourceType="session"
                buildSnapshot={() => ({
                  name: name.trim() || session.name,
                  done: session.done,
                  difficulty: targetDiff,
                  exercises: exercisesText.split("\n").map(l => l.trim()).filter(Boolean),
                  authorName: userName ?? "Toi",
                })}
                title={name.trim() || session.name}
                text={(() => {
                  const n = exercisesText.split("\n").filter(Boolean).length;
                  return n ? `${n} exercice${n > 1 ? "s" : ""}` : undefined;
                })()}
              />
            </div>
          )}
        </div>
        {isEdit && session && (
          <div style={{ fontSize: 13, color: "#62686e", marginBottom: 20 }}>{session.name}</div>
        )}
        {!isEdit && (
          <div style={{ fontSize: 15, color: "#62686e", lineHeight: 1.5, marginBottom: 20 }}>
            Planifie ta séance et ajoute tes exercices.
          </div>
        )}

        {/* Date + nom */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {!hideDate && (
            <div style={{ flex: "0 0 150px" }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Date</div>
              <input
                type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 16, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Nom de la séance *</div>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Squat max, Sprint 20m, Récup active..."
              style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
            />
          </div>
        </div>

        {/* Difficulté cible */}
        <div style={{ background: diffBg, border: `1px solid ${diffBorder}`, borderRadius: 16, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#202428" }}>Difficulté prévue</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", background: diffBg, border: `1px solid ${diffBorder}`, color: diffColor, borderRadius: 999, padding: "3px 8px" }}>{diffLabel}</span>
              <span style={{ fontSize: 22, fontWeight: 1000, color: diffColor, lineHeight: 1, letterSpacing: "-0.04em" }}>{targetDiff}</span>
            </div>
          </div>
          <input
            type="range" min={1} max={10} value={targetDiff} step={1}
            onChange={e => setTargetDiff(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>Facile</span><span>Modérée</span><span>Dure</span>
          </div>
        </div>

        {/* Exercices */}
        <div style={{ marginBottom: 8 }}>
          <ExerciseBlockEditor
            value={exercisesText}
            onChange={setExercisesText}
            authorRole="athlete"
            authorName={userName ?? "Toi"}
            initialMedia={session?.exercise_media}
            onMediaChange={setExerciseMedia}
          />
        </div>

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
            onClick={handleSave} disabled={saving || !name.trim()}
            style={{ height: 46, borderRadius: 14, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: !name.trim() ? 0.6 : 1 }}
          >
            {saving ? "..." : isEdit ? "Enregistrer ✓" : "Créer ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
