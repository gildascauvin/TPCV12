"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { WeekSessionCard, type SessionLike } from "@/components/calendar/DayColumn";
import UnseenDot, { hasUnseenAttachment } from "@/components/sessions/UnseenDot";

/* Wrappers dnd-kit partagés par /week (WeekClient.tsx) ET /coach/planning (CoachPlanningClient.tsx) —
   "le même composant" des deux côtés, générique sur SessionLike (Session ou CoachViewSession).
   DayColumn/WeekSessionCard eux-mêmes n'importent jamais dnd-kit : zéro impact sur l'aperçu
   onboarding (WeekPreviewStep.tsx), qui rend ces composants sans jamais passer par ici. */

export function DroppableDay({ dstr, children }: { dstr: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dstr, data: { type: "day" } });
  return (
    <div ref={setNodeRef} style={{ borderRadius: 26, outline: isOver ? "2px dashed rgba(212,64,0,.55)" : "2px dashed transparent", outlineOffset: 4, transition: "outline-color .15s" }}>
      {children}
    </div>
  );
}

export function DraggableSessionCard<T extends SessionLike>({ session, onComplete, onEdit, onDuplicate, viewerRole, decisionGauge }: {
  session: T;
  onComplete: (s: T) => void;
  onEdit: (s: T) => void;
  onDuplicate: (s: T) => void;
  /* "coach" sur /coach/planning, "athlete" sur /week — pilote le point de notification (voir
     UnseenDot.tsx) : visible quand la dernière modif d'une ligne vient de l'autre rôle et n'a pas
     encore été vue par celui-ci. */
  viewerRole: "coach" | "athlete";
  /* Passthrough vers WeekSessionCard (voir DayColumn.tsx) — undefined partout sauf pour la séance
     ciblée par une suggestion d'autorégulation du jour. */
  decisionGauge?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id, data: { type: "session" } });
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
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 30 : undefined,
  };
  const viewedAt = viewerRole === "coach" ? session.viewed_by_coach_at : session.viewed_by_athlete_at;
  return (
    <WeekSessionCard
      session={session}
      onComplete={onComplete}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      dragHandleProps={{ ...attributes, ...listeners }}
      cardRef={cardRef}
      cardStyle={style}
      decisionGauge={decisionGauge}
      renderExerciseLine={(line, index) => (
        <DraggableExerciseLine
          key={index} sessionId={session.id} index={index} text={line}
          unseen={hasUnseenAttachment(session.exercise_media?.[String(index)], viewerRole, viewedAt)}
        />
      )}
    />
  );
}

export function DraggableExerciseLine({ sessionId, index, text, originalText, unseen }: {
  sessionId: string; index: number; text: string; unseen?: boolean;
  /* Ligne brute avant décharge/surcharge (autorégulation) — quand différente de `text`, affichée
     barrée au-dessus (même style que TodaySessionCard/CoachAthleteCard). undefined partout où ce
     mécanisme n'existe pas (comportement inchangé pour /week et /coach/planning aujourd'hui). */
  originalText?: string;
}) {
  const dragId = `ex:${sessionId}:${index}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: dragId, data: { type: "exercise", sessionId, index } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data: { type: "exercise", sessionId, index } });
  const changed = originalText !== undefined && originalText !== text;
  return (
    <div
      ref={el => { setDragRef(el); setDropRef(el); }}
      style={{
        padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
        borderTop: index > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
        background: isOver ? "#fff5f2" : "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
        display: "flex", alignItems: "flex-start", gap: 6,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        {...attributes} {...listeners}
        style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 11, flexShrink: 0, userSelect: "none" as const, lineHeight: 1.4, marginTop: 1 }}
      >⠿</span>
      <span style={{ flex: 1 }}>
        {changed && (
          <div style={{ fontSize: 10.5, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1 }}>{originalText}</div>
        )}
        <span style={{ color: changed ? "#E8571A" : undefined, fontWeight: changed ? 800 : undefined }}>{text}</span>
        {unseen && <UnseenDot />}
      </span>
    </div>
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
