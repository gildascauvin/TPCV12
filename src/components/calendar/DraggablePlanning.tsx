"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core";
import { haptic } from "@/lib/native";
import { WeekSessionCard, type SessionLike } from "@/components/calendar/DayColumn";
import UnseenDot, { hasUnseenAttachment } from "@/components/sessions/UnseenDot";
import { ExerciseLineView, type LineContext } from "@/components/sessions/ExerciseLineView";

/* Wrappers dnd-kit partagés par /week (WeekClient.tsx) ET /coach/planning (CoachPlanningClient.tsx) —
   "le même composant" des deux côtés, générique sur SessionLike (Session ou CoachViewSession).
   DayColumn/WeekSessionCard eux-mêmes n'importent jamais dnd-kit : zéro impact sur l'aperçu
   onboarding (WeekPreviewStep.tsx), qui rend ces composants sans jamais passer par ici. */

export function DroppableDay({ dstr, children }: { dstr: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dstr, data: { type: "day" } });
  return (
    <div ref={setNodeRef} style={{ borderRadius: 24, outline: isOver ? "2px dashed rgba(212,64,0,.55)" : "2px dashed transparent", outlineOffset: 4, background: isOver ? "rgba(212,64,0,.06)" : "transparent", transition: "outline-color .15s, background .15s" }}>
      {children}
    </div>
  );
}

export function DraggableSessionCard<T extends SessionLike>({ session, onComplete, onEdit, onDuplicate, viewerRole, decisionGauge, previewPct, onStart, liveLabel }: {
  session: T;
  onComplete: (s: T) => void;
  onStart?: (s: T) => void;
  liveLabel?: string | null;
  onEdit: (s: T) => void;
  onDuplicate?: (s: T) => void;
  /* "coach" sur /coach/planning, "athlete" sur /week — pilote le point de notification (voir
     UnseenDot.tsx) : visible quand la dernière modif d'une ligne vient de l'autre rôle et n'a pas
     encore été vue par celui-ci. */
  viewerRole: "coach" | "athlete";
  /* Passthrough vers WeekSessionCard (voir DayColumn.tsx) — undefined partout sauf pour la séance
     ciblée par une suggestion d'autorégulation du jour. */
  decisionGauge?: React.ReactNode;
  /* Décharge/surcharge en cours de sélection sur la jauge de décision de CETTE séance (2026-09-24,
     fix — "quand je bouge la jauge je veux voir le delta dans le planning aussi") : même mécanisme
     que TodaySessionCard.tsx/CoachAthleteCard.tsx (previewPct → parseAndApply par ligne, ancienne
     valeur barrée au-dessus de la nouvelle) — jusqu'ici seul /today et Coach Control le faisaient,
     Planning affichait la jauge sans jamais répercuter l'aperçu sur les lignes en dessous.
     `undefined`/`null` = comportement inchangé (texte brut, pas de ligne barrée). */
  previewPct?: number | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: session.id, data: { type: "session", session } });
  /* Droppable "séance" — reçoit un exercice glissé depuis une AUTRE séance (drag cross-séance,
     2026-09-17). Rattaché au même noeud que la carte uniquement quand la séance est vide : sinon
     chaque ligne d'exercice (DraggableExerciseLine, ci-dessous) a déjà son propre droppable plus
     précis, pas besoin (ni souhaitable) de faire concurrence à ces zones plus petites. */
  const { setNodeRef: setCardDropRef } = useDroppable({ id: `sess-drop:${session.id}`, data: { type: "session", sessionId: session.id } });
  const exerciseCount = session.notes ? session.notes.split("\n").filter(Boolean).length : 0;
  const cardRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (exerciseCount === 0) setCardDropRef(el);
  };
  /* Pendant le glisser, c'est la copie soulevée de PlanningDnd (DragOverlay) qui suit le doigt, au-dessus
     de toute la page : la carte d'origine reste en place, en pointillé, comme emplacement de départ.
     (Déplacée elle-même, elle était coupée par la zone de défilement de son jour.) */
  const style: React.CSSProperties = isDragging
    ? { opacity: 0.35, outline: "2px dashed rgba(0,0,0,.18)", outlineOffset: -2 }
    : {};
  useEffect(() => { if (isDragging) haptic("light"); }, [isDragging]);
  const viewedAt = viewerRole === "coach" ? session.viewed_by_coach_at : session.viewed_by_athlete_at;
  return (
    <WeekSessionCard
      session={session}
      onComplete={onComplete}
      onStart={onStart}
      liveLabel={liveLabel}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      dragHandleProps={{ ...attributes, ...listeners }}
      cardRef={cardRef}
      cardStyle={style}
      decisionGauge={decisionGauge}
      adjustPct={previewPct}
      renderExerciseLine={(_line, index, view) => (
        <DraggableExerciseLine
          key={index} sessionId={session.id} index={index}
          text={view.text}
          originalText={view.original}
          adjusting={view.adjusting}
          ctx={view.ctx}
          unseen={hasUnseenAttachment(session.exercise_media?.[String(index)], viewerRole, viewedAt)}
        />
      )}
    />
  );
}

export function DraggableExerciseLine({ sessionId, index, text, originalText, unseen, ctx, compact = true, adjusting = false }: {
  sessionId: string; index: number; text: string; unseen?: boolean;
  /** Contexte de la ligne dans sa séance (catégorie héritée, bloc), voir sessionLineContexts. */
  ctx?: LineContext;
  /** Variante serrée (cartes du Planning, Coach Control) ; false sur la carte de l'Accueil. */
  compact?: boolean;
  /** Aperçu ou décision en cours : signale les lignes non ajustées (lecture incertaine). */
  adjusting?: boolean;
  /* Ligne brute avant décharge/surcharge (autorégulation) — quand différente de `text`, affichée
     barrée au-dessus (même style que TodaySessionCard/CoachAthleteCard). undefined partout où ce
     mécanisme n'existe pas (comportement inchangé pour /week et /coach/planning aujourd'hui). */
  originalText?: string;
}) {
  const dragId = `ex:${sessionId}:${index}`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: dragId, data: { type: "exercise", sessionId, index, text } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data: { type: "exercise", sessionId, index } });
  useEffect(() => { if (isDragging) haptic("light"); }, [isDragging]);
  return (
    <div
      ref={el => { setDragRef(el); setDropRef(el); }}
      style={{
        padding: compact ? "7px 9px" : "10px 12px", fontSize: 11.5, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
        borderTop: index > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
        background: isOver ? "#fff5f2" : "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
        // Ligne d'insertion orange au-dessus de la ligne survolée : on voit où l'exercice va tomber.
        boxShadow: isOver && !isDragging ? "inset 0 2px 0 #d44000" : "none", transition: "background .12s, box-shadow .12s",
        display: "flex", alignItems: "flex-start", gap: 6,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        {...attributes} {...listeners}
        style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 11, flexShrink: 0, userSelect: "none" as const, lineHeight: 1.4, marginTop: 1 }}
      >⠿</span>
      <span style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <ExerciseLineView text={text} original={originalText} ctx={ctx} compact={compact} adjusting={adjusting} />
        {unseen && <span style={{ position: "absolute", top: 0, right: 0 }}><UnseenDot /></span>}
      </span>
    </div>
  );
}

/* Contexte de glisser-déposer du Planning (2026-10-27), partagé par /week, /coach/planning et les vues
   défilantes : DndContext + copie soulevée (DragOverlay) rendue dans <body>, donc jamais coupée par
   une zone de défilement ni passée sous la colonne voisine. Séance : vraie carte, inclinée et portée
   par une ombre. Exercice : la ligne seule. */
const LIFT: React.CSSProperties = { transform: "rotate(-1.5deg) scale(1.03)", boxShadow: "0 24px 50px rgba(0,0,0,.30)", cursor: "grabbing" };

export function PlanningDnd({ sensors, onDragEnd, children }: {
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (e: DragEndEvent) => void;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<{ type?: string; session?: SessionLike; text?: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as typeof active) ?? null);
  const overlay = (
    <DragOverlay dropAnimation={null} zIndex={2147483050}>
      {active?.type === "session" && active.session ? (
        <WeekSessionCard session={active.session} onComplete={() => {}} onEdit={() => {}} hideActions cardStyle={LIFT} />
      ) : active?.type === "exercise" && active.text ? (
        <div style={{ ...LIFT, background: "#fff", borderRadius: 10, padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4, fontWeight: 600, color: "#2c3236", display: "flex", gap: 6 }}>
          <span style={{ color: "#c7ccd1" }}>⠿</span>
          <ExerciseLineView text={active.text} compact />
        </div>
      ) : null}
    </DragOverlay>
  );
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={e => { setActive(null); onDragEnd(e); }} onDragCancel={() => setActive(null)}>
      {children}
      {mounted ? createPortal(overlay, document.body) : null}
    </DndContext>
  );
}

/** Handler générique pour DndContext.onDragEnd — session déplacée entre jours OU exercice déplacé
    (réordonné dans sa séance, ou glissé vers une AUTRE séance — 2026-09-17, `toIdx: null` = ajout
    en fin de séance cible, cas d'un drop sur une séance vide via son droppable de carte).
    `moveSession`/`moveExercise` restent fournis par l'appelant (écriture DB différente selon
    /week vs /coach/planning). */
export function makePlanningDragEndHandler<T extends SessionLike>(opts: {
  sessions: T[];
  moveSession: (session: T, newDate: string) => void;
  moveExercise: (fromSessionId: string, fromIdx: number, toSessionId: string, toIdx: number | null) => void;
}) {
  return (event: { active: { id: string | number; data: { current?: unknown } }; over: { id: string | number; data: { current?: unknown } } | null }) => {
    const { active, over } = event;
    if (!over) return;
    if (over.id !== active.id) haptic("medium");
    const activeData = active.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    if (activeData?.type === "exercise") {
      const overData = over.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
      if (overData?.type === "exercise" && overData.sessionId) {
        opts.moveExercise(activeData.sessionId!, activeData.index!, overData.sessionId, overData.index ?? null);
        return;
      }
      if (overData?.type === "session" && overData.sessionId) {
        opts.moveExercise(activeData.sessionId!, activeData.index!, overData.sessionId, null);
        return;
      }
      return;
    }
    const overData = over.data.current as { type?: string } | undefined;
    if (overData?.type !== "day") return;
    const session = opts.sessions.find(s => s.id === active.id);
    if (!session) return;
    opts.moveSession(session, over.id as string);
  };
}
