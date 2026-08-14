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

export function DraggableSessionCard<T extends SessionLike>({ session, onComplete, onEdit, onDuplicate, viewerRole }: {
  session: T;
  onComplete: (s: T) => void;
  onEdit: (s: T) => void;
  onDuplicate: (s: T) => void;
  /* "coach" sur /coach/planning, "athlete" sur /week — pilote le point de notification (voir
     UnseenDot.tsx) : visible quand la dernière modif d'une ligne vient de l'autre rôle et n'a pas
     encore été vue par celui-ci. */
  viewerRole: "coach" | "athlete";
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: session.id, data: { type: "session" } });
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
      cardRef={setNodeRef}
      cardStyle={style}
      renderExerciseLine={(line, index) => (
        <DraggableExerciseLine
          key={index} sessionId={session.id} index={index} text={line}
          unseen={hasUnseenAttachment(session.exercise_media?.[String(index)], viewerRole, viewedAt)}
        />
      )}
    />
  );
}

export function DraggableExerciseLine({ sessionId, index, text, unseen }: { sessionId: string; index: number; text: string; unseen?: boolean }) {
  const dragId = `ex:${sessionId}:${index}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: dragId, data: { type: "exercise", sessionId, index } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data: { type: "exercise", sessionId, index } });
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
      <span style={{ flex: 1 }}>{text}{unseen && <UnseenDot />}</span>
    </div>
  );
}

/** Handler générique pour DndContext.onDragEnd — session déplacée entre jours OU exercice réordonné
    dans une séance. `moveSession`/`reorderExercises` restent fournis par l'appelant (écriture DB
    différente selon /week vs /coach/planning). */
export function makePlanningDragEndHandler<T extends SessionLike>(opts: {
  sessions: T[];
  moveSession: (session: T, newDate: string) => void;
  reorderExercises: (sessionId: string, fromIdx: number, toIdx: number) => void;
}) {
  return (event: { active: { id: string | number; data: { current?: unknown } }; over: { id: string | number; data: { current?: unknown } } | null }) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    if (activeData?.type === "exercise") {
      const overData = over.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
      if (overData?.type !== "exercise" || overData.sessionId !== activeData.sessionId) return;
      opts.reorderExercises(activeData.sessionId!, activeData.index!, overData.index!);
      return;
    }
    const overData = over.data.current as { type?: string } | undefined;
    if (overData?.type !== "day") return;
    const session = opts.sessions.find(s => s.id === active.id);
    if (!session) return;
    opts.moveSession(session, over.id as string);
  };
}
