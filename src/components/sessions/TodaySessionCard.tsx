"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import DiffGauge from "@/components/calendar/DiffGauge";
import { DraggableExerciseLine } from "@/components/calendar/DraggablePlanning";
import ShareButton from "@/components/sessions/ShareButton";
import { hasUnseenAttachment } from "@/components/sessions/UnseenDot";
import { parseAndApply } from "@/lib/loadAdjust";
import { isLive, liveElapsedMs, formatChrono } from "@/lib/liveSession";
import type { Session } from "@/types";

/* ─── Today session card — reste CLAIRE (2026-09-24, redesign "bg dark, plus de card" — voir POC
   `poc-coach-context_4.html`) : le "plus de card" ne s'applique qu'à l'en-tête ring/décision (voir
   plus bas, devenu flush sur le fond sombre de la page) — la carte séance, elle, reste un vrai bloc
   blanc posé SUR ce fond sombre, exactement comme le `.session`/`.ath-session` du POC (jamais
   retiré par `body.ath-dark`, contrairement à `.card`/`.ana-card`) : contraste volontaire, contenu
   actionnable qui doit "ressortir" du fond sombre ambiant. Retour explicite de Gildas : "les
   background des séances doivent rester light (même dans le wellness card, partout)". ─── */
export default function TodaySessionCard({ session, onComplete, onEdit, previewPct, onReorderExercises, authorName, hideGauge, onStart, viewer = "athlete", concealed }: {
  /* Séance d'un programme ThePerfClub au-delà de J+7 (programReveal.ts) : exercices floutés, pas d'ouverture. */
  concealed?: string | null;
  session: Session;
  /* Absent (coach) : pas de Démarrer / Terminer / saisie du résultat. */
  onComplete?: (s: Session) => void;
  /* Qui regarde (pastille « nouveau » sur les médias/commentaires de l'autre). */
  viewer?: "athlete" | "coach";
  /* Séance en direct (2026-10-02) : Démarrer / Reprendre, seulement pour une séance du jour à faire. */
  onStart?: (s: Session) => void;
  onEdit: (s: Session) => void;
  authorName: string;
  /* Décharge/surcharge en cours de sélection ou déjà appliquée (autorégulation) — surligne en
     orange les lignes réellement modifiées, undefined/null partout ailleurs (comportement inchangé). */
  previewPct?: number | null;
  /* Drag & drop des exercices — même composant/geste que /week et /coach/planning
     (DraggableExerciseLine, DraggablePlanning.tsx). DndContext scopé à cette carte (une seule
     séance ici, contrairement au Planning qui en gère plusieurs sur une grille de jours). */
  onReorderExercises?: (sessionId: string, fromIdx: number, toIdx: number) => void;
  /* Vrai pour la SEULE séance dont la jauge a été promue en tête de l'onglet (3e itération
     2026-09-29) : son curseur y affiche déjà la difficulté prévue, une DiffGauge ici serait la
     deuxième jauge de la même séance — exactement ce que "la jauge de décision EST la jauge de la
     séance, pas 2 jauges" écartait. Les autres séances du jour (et toute séance terminée, qui
     affiche son RPE réel) gardent la leur. */
  hideGauge?: boolean;
}) {
  const live = isLive(session);
  const isFuture = session.date > format(new Date(), "yyyy-MM-dd");
  const [, setLiveTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLiveTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);
  const exerciseSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function handleExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    const overData = over.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    if (activeData?.type !== "exercise" || overData?.type !== "exercise" || overData.sessionId !== activeData.sessionId) return;
    onReorderExercises?.(activeData.sessionId!, activeData.index!, overData.index!);
  }
  const [justDone, setJustDone] = useState(false);
  const prevDoneRef = useRef(session.done);
  useEffect(() => {
    if (!prevDoneRef.current && session.done) {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 700);
      return () => clearTimeout(t);
    }
    prevDoneRef.current = session.done;
  }, [session.done]);

  return (
    <div
      data-tour="session-card"
      className="mb-2 cursor-pointer"
      style={{
        background: "#fff",
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        padding: 18, borderRadius: 24,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        animation: justDone ? "sessionDone 0.7s ease" : undefined,
      }}
      onClick={() => { if (!concealed) onEdit(session); }}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
          {session.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <span style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
            background: session.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,0.10)",
            color: session.done ? "#2f9e44" : "#d44000",
          }}>
            {session.done ? "Terminé" : live ? `● En cours · ${formatChrono(liveElapsedMs(session))}` : "Prévu"}
          </span>
          {!concealed && <ShareButton
            resourceType="session"
            buildSnapshot={() => ({
              name: session.name,
              done: session.done,
              difficulty: gaugeValue,
              exercises,
              authorName,
            })}
            title={session.name}
            text={exercises.length ? `${exercises.length} exercice${exercises.length > 1 ? "s" : ""}` : undefined}
          />}
        </div>
      </div>

      {/* 2. Single difficulty gauge (no label) — masquée pour la séance dont la jauge de décision a
         été promue en tête de l'onglet, voir `hideGauge`. */}
      {!hideGauge && gaugeValue && (
        <div style={{ marginBottom: 12 }}>
          <DiffGauge value={gaugeValue} height={12} />
        </div>
      )}

      {/* 3. Exercise display list — drag & drop, même composant que /week et /coach/planning */}
      {concealed ? (
        <div style={{ marginBottom: 12 }}>
          {exercises.length > 0 && (
            <div aria-hidden style={{ border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
              {exercises.map((ex, i) => (
                <div key={i} style={{ padding: "9px 12px", fontSize: 13, color: "#2c3236", fontWeight: 600, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>{ex}</div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#8a8f94" }}>🔒 {concealed}</div>
        </div>
      ) : exercises.length > 0 && (
        <div style={{ marginBottom: 12, border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden" }}>
          <DndContext sensors={exerciseSensors} onDragEnd={handleExerciseDragEnd}>
            {exercises.map((ex, i) => {
              const modified = previewPct != null ? parseAndApply(ex, previewPct) : ex;
              const unseen = viewer === "coach"
                ? hasUnseenAttachment(session.exercise_media?.[String(i)], "coach", (session as Session & { viewed_by_coach_at?: string | null }).viewed_by_coach_at)
                : hasUnseenAttachment(session.exercise_media?.[String(i)], "athlete", session.viewed_by_athlete_at);
              return (
                <DraggableExerciseLine key={i} sessionId={session.id} index={i} text={modified} originalText={ex} unseen={unseen} />
              );
            })}
          </DndContext>
        </div>
      )}

      {/* 4. Résultat (séance faite) : durée et difficulté réelle, sans bouton — un tap dessus rouvre
          la saisie du résultat pour le corriger (2026-10-02). */}
      {session.done && (session.duration || session.rpe) ? (
        <div onClick={e => { e.stopPropagation(); onComplete?.(session); }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, cursor: "pointer" }}>
          {session.duration ? (
            <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#d44000", letterSpacing: "-0.02em", lineHeight: 1 }}>{session.duration}</div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>MIN</div>
            </div>
          ) : <div />}
          {session.rpe ? (
            <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#d44000", letterSpacing: "-0.02em", lineHeight: 1 }}>{session.rpe}</div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>DIFF.</div>
            </div>
          ) : <div />}
        </div>
      ) : session.done || !onComplete ? null : isFuture ? null : (
        /* 5. Actions — aujourd'hui : Démarrer (+ « Déjà faite ? ») ; jour passé : Terminer. Jamais
           sur un jour futur (on ne termine pas une séance qui n'a pas eu lieu). Dupliquer vit
           désormais dans le tiroir d'édition (2026-10-02). */
        <div onClick={e => e.stopPropagation()}>
          {onStart ? (
            <button
              onClick={() => onStart(session)}
              style={{
                width: "100%", height: 46, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 8px 20px rgba(212,64,0,.22)",
              }}
            >
              {live ? "Reprendre la séance" : "▶ Démarrer la séance"}
            </button>
          ) : (
            <button
              data-tour="terminer-btn"
              onClick={() => onComplete!(session)}
              style={{
                width: "100%", height: 46, borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 8px 20px rgba(212,64,0,.22)",
              }}
            >
              Terminer<span className="tour-lock">🔒</span>
            </button>
          )}
          {onStart && !live && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={() => onComplete!(session)} style={{ border: "none", background: "none", color: "#8a8f94", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                Déjà faite ? Noter le résultat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
