"use client";

import { useState, useEffect, useRef } from "react";
import type { Session, ExerciseAttachments } from "@/types";
import ExerciseBlockEditor from "@/components/sessions/ExerciseBlockEditor";
import ShareButton from "@/components/sessions/ShareButton";
import AutosaveFooterButton, { type AutosaveFooterState } from "@/components/sessions/AutosaveFooterButton";
import { buildUserHistory, setUserHistory, resetUserHistory } from "@/lib/exerciseAutocomplete";
import { syncTestResultsFromSession } from "@/lib/testResults";
import { createClient } from "@/lib/supabase/client";
import { useBreakpoint } from "@/hooks/useBreakpoint";

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
  /* Autosave (2026-09-06) — création ET édition. `id` est absent au tout premier appel (rien
     n'existe encore) ; l'appelant crée alors la séance et DOIT retourner son id pour que les
     autosaves suivants mettent à jour cette même ligne au lieu d'en recréer une à chaque frappe. */
  onSave: (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, id?: string) => Promise<{ id: string } | void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /* Wizard onboarding (2026-09-06) : ProgramBuilderModal ouvre cette modale par-dessus sa propre
     bannière fixe (UnsavedBanner, WIZARD_BANNER_H) — sans ce décalage, l'écran plein-page de
     cette modale (position:fixed inset:0) démarre à y=0 et la bannière (zIndex plus haut) se
     retrouve à recouvrir son propre header. Absent = comportement inchangé (usage in-app normal). */
  topOffset?: number;
}

export default function AddSessionModal({ date, session, initialName, hideDate, userId, userName, onSave, onDelete, onClose, topOffset }: AddSessionModalProps) {
  const { isMd } = useBreakpoint();

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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // `isEdit` reste ancré sur la prop `session` d'origine — pilote l'aperçu initial des champs, le
  // texte d'accroche et le bouton de partage, qui ont tous besoin d'une vraie séance existante.
  const isEdit = !!session;

  const diffCls = targetDiff >= 8 ? "hard" : targetDiff >= 5 ? "moderate" : "easy";
  const diffLabel = { hard: "Dure", moderate: "Modérée", easy: "Facile" }[diffCls];
  const diffBg = { hard: "#fff0ed", moderate: "#fff7e6", easy: "#edf9f0" }[diffCls];
  const diffColor = { hard: "#d44000", moderate: "#b96500", easy: "#2f9e44" }[diffCls];
  const diffBorder = { hard: "rgba(212,64,0,.18)", moderate: "rgba(249,138,0,.22)", easy: "rgba(47,158,68,.18)" }[diffCls];

  function buildPayload() {
    const notes = exercisesText.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
    return { name: name.trim(), notes, date: selectedDate, target_difficulty: targetDiff, exercise_media: exerciseMedia };
  }

  /* Autosave universel (2026-09-06) — création ET édition. `lastSavedRef` vaut `null` tant que rien
     n'a encore été persisté (création à blanc) : n'importe quel nom saisi devient alors "dirty". Une
     fois créée, `persistedId` fait basculer les autosaves suivants en mise à jour de cette même ligne. */
  const lastSavedRef = useRef<string | null>(session ? JSON.stringify({
    name: session.name.trim(),
    notes: session.notes ?? "",
    date: session.date,
    target_difficulty: session.target_difficulty ?? 6,
    exercise_media: session.exercise_media ?? {},
  }) : null);
  const [persistedId, setPersistedId] = useState<string | null>(session?.id ?? null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRevertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [footerState, setFooterState] = useState<AutosaveFooterState>("idle");

  async function persist() {
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    if (!payload.name || snapshot === lastSavedRef.current) return;
    if (savedRevertTimer.current) { clearTimeout(savedRevertTimer.current); savedRevertTimer.current = null; }
    setFooterState("saving");
    try {
      const result = await onSave(payload, persistedId ?? undefined);
      if (result?.id) setPersistedId(result.id);
      // Écriture double vers tests/test_results — jamais pour un template (ProgramBuilderModal,
      // session?.user_id === "template", pas un vrai sportif authentifié).
      if (session?.user_id !== "template") {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await syncTestResultsFromSession(user.id, { subjectUserId: user.id }, payload.notes, exerciseMedia, selectedDate);
      }
      lastSavedRef.current = snapshot;
      setFooterState("saved");
      savedRevertTimer.current = setTimeout(() => setFooterState("idle"), 1800);
    } catch {
      setFooterState("error");
    }
  }

  useEffect(() => {
    const payload = buildPayload();
    if (!payload.name) return;
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(persist, 600);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, selectedDate, targetDiff, exercisesText, exerciseMedia]);

  // Flush immédiat d'un changement pas encore débounçé (évite de perdre les dernières frappes) puis
  // fermeture — jamais bloquante, le flush part en arrière-plan sans attendre sa résolution.
  function flushAndClose() {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); persist(); }
    onClose();
  }

  // Bouton unique du footer : en erreur, un clic relance l'enregistrement plutôt que de fermer —
  // le clic sur le fond, lui, ferme toujours (voir flushAndClose ci-dessus).
  function handleFooterClick() {
    if (footerState === "error") { persist(); return; }
    flushAndClose();
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
        position: "fixed", top: topOffset ?? 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: isMd ? "flex-end" : "stretch",
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) flushAndClose(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: topOffset ? `calc(100dvh - ${topOffset}px)` : "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 28, overscrollBehavior: "contain", scrollbarWidth: "thin" as const }}>
          {/* Nom + date — champs éditables directement, pas de titre ni de doublon */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Nom de la séance"
              style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", background: "transparent", border: "none", outline: "none", padding: 0, fontFamily: "inherit" }}
            />
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
          {!hideDate && (
            <input
              type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              style={{ fontSize: 14, color: "#62686e", background: "transparent", border: "none", outline: "none", padding: 0, fontFamily: "inherit", marginTop: 4, cursor: "pointer" }}
            />
          )}
          {!isEdit && (
            <div style={{ fontSize: 15, color: "#62686e", lineHeight: 1.5, marginTop: 10, marginBottom: 16 }}>
              Planifie ta séance et ajoute tes exercices.
            </div>
          )}
          {isEdit && <div style={{ marginBottom: 16 }} />}

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
          <ExerciseBlockEditor
            value={exercisesText}
            onChange={setExercisesText}
            authorRole="athlete"
            authorName={userName ?? "Toi"}
            initialMedia={session?.exercise_media}
            onMediaChange={setExerciseMedia}
            sessionDate={selectedDate}
            disableLiveTestSync={session?.user_id === "template"}
          />
        </div>

        {/* Actions — flex item non-scrollable, jamais recouvert par le contenu. Autosave partout
            (création ET édition) : plus de bouton "Enregistrer"/"Créer" — seul "Fermer" reste, aux
            côtés de la suppression quand elle est proposée (jamais à la création). */}
        <div style={{
          flexShrink: 0,
          display: "grid",
          gridTemplateColumns: isEdit && onDelete ? "auto 1fr" : "1fr",
          gap: 8, alignItems: "center",
          padding: "20px 28px 20px",
          background: "#fff",
          borderTop: "1px solid rgba(0,0,0,.08)",
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
          <AutosaveFooterButton state={footerState} onClick={handleFooterClick} />
        </div>
      </div>
    </div>
  );
}
