"use client";

import { useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { ProgramTemplate, SessionTemplate, WeekTemplate, Session } from "@/types";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import ReconduireModal, { type ReconduireOutputRow } from "@/components/sessions/ReconduireModal";
import DiffGauge from "@/components/calendar/DiffGauge";
import { loadRule, ruleTagColors } from "@/lib/loadRule";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function avgWeekRpe(week: WeekTemplate): number {
  const sessions = DAYS.flatMap(d => (week[d] ?? []) as SessionTemplate[]);
  if (!sessions.length) return 0;
  return sessions.reduce((sum, s) => sum + (s.target_difficulty ?? 5), 0) / sessions.length;
}

export function loadBarColor(avg: number): string {
  if (!avg) return "#e5e7eb";
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

export function SessionTemplateCard({ session, onClick, dragHandleProps, cardRef, cardStyle, renderExerciseLine }: {
  session: SessionTemplate;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  cardRef?: (el: HTMLDivElement | null) => void;
  cardStyle?: React.CSSProperties;
  renderExerciseLine?: (line: string, index: number) => React.ReactNode;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const gaugeValue = session.target_difficulty ?? null;
  return (
    <div ref={cardRef} onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default",
      border: "1px solid rgba(212,64,0,0.16)", background: "#fff", borderRadius: 14,
      padding: "10px 11px", boxShadow: "0 2px 10px rgba(0,0,0,0.045)",
      transition: "transform .2s ease, box-shadow .2s ease",
      ...cardStyle,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            onClick={e => e.stopPropagation()}
            title="Glisser vers un autre jour"
            style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 12, flexShrink: 0, marginTop: 2, userSelect: "none" as const, lineHeight: 1 }}
          >⠿</span>
        )}
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word", flex: 1 }}>
          {session.name}
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: "rgba(212,64,0,0.10)", color: "#d44000" }}>
          Prévu
        </span>
      </div>
      {gaugeValue ? <DiffGauge value={gaugeValue} height={10} /> : null}
      {exercises.length > 0 && (
        <div style={{ marginTop: 7, borderRadius: 10, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
          {exercises.map((ex, i) => renderExerciseLine ? (
            <div key={i}>{renderExerciseLine(ex, i)}</div>
          ) : (
            <div key={i} style={{
              padding: "6px 9px", fontSize: 11, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{ex}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Drag & drop local au template (aucune écriture DB — setTemplate direct, tant que le
   programme n'est pas enregistré). Séances entre jours (Lun..Dim) de la semaine affichée +
   réordonnancement des exercices dans une séance. ─── */

function DroppableProgramDay({ day, children }: { day: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { type: "day", day } });
  return (
    <div ref={setNodeRef} style={{ borderRadius: 26, outline: isOver ? "2px dashed rgba(212,64,0,.55)" : "2px dashed transparent", outlineOffset: 4, transition: "outline-color .15s" }}>
      {children}
    </div>
  );
}

function DraggableProgramSession({ day, sIdx, session, onClick }: { day: string; sIdx: number; session: SessionTemplate; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `sess:${day}:${sIdx}`, data: { type: "session", day, sIdx } });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <SessionTemplateCard
      session={session}
      onClick={onClick}
      dragHandleProps={{ ...attributes, ...listeners }}
      cardRef={setNodeRef}
      cardStyle={style}
      renderExerciseLine={(line, exIdx) => (
        <DraggableProgramExercise key={exIdx} day={day} sIdx={sIdx} exIdx={exIdx} text={line} />
      )}
    />
  );
}

function DraggableProgramExercise({ day, sIdx, exIdx, text }: { day: string; sIdx: number; exIdx: number; text: string }) {
  const dragId = `ex:${day}:${sIdx}:${exIdx}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: dragId, data: { type: "exercise", day, sIdx, exIdx } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data: { type: "exercise", day, sIdx, exIdx } });
  return (
    <div
      ref={el => { setDragRef(el); setDropRef(el); }}
      style={{
        padding: "6px 9px", fontSize: 11, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
        borderTop: exIdx > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
        background: isOver ? "#fff5f2" : "transparent", whiteSpace: "pre-wrap", wordBreak: "break-word",
        display: "flex", alignItems: "flex-start", gap: 6, opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        {...attributes} {...listeners}
        style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 11, flexShrink: 0, userSelect: "none" as const, lineHeight: 1.4, marginTop: 1 }}
      >⠿</span>
      <span style={{ flex: 1 }}>{text}</span>
    </div>
  );
}

interface EditingTarget { weekIdx: number; day: string; sessionIdx: number }

interface Props {
  programName: string;
  template: ProgramTemplate;
  assignmentCount?: number;
  requireSubscription?: (fn: () => void) => void;
  onSaveToLibrary: (name: string, template: ProgramTemplate) => Promise<void>;
  onSaveAndAssign: (name: string, template: ProgramTemplate) => Promise<void>;
  onBack: () => void;
}

export default function ProgramBuilderModal({ programName: initialName, template: initialTemplate, assignmentCount = 0, requireSubscription, onSaveToLibrary, onSaveAndAssign, onBack }: Props) {
  const gate = (fn: () => void) => requireSubscription ? requireSubscription(fn) : fn();
  const [name, setName] = useState(initialName || "Mon programme");
  const [template, setTemplate] = useState<ProgramTemplate>(initialTemplate);
  const [weekIdx, setWeekIdx] = useState(0);
  const [showReconduire, setShowReconduire] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [saving, setSaving] = useState<"library" | "assign" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const week = template.weeks[weekIdx];
  const weekAvgLoads = template.weeks.map(w => avgWeekRpe(w as WeekTemplate));
  const maxAvgLoad = Math.max(...weekAvgLoads, 0.01);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const editingSession: SessionTemplate | null = editingTarget
    ? (template.weeks[editingTarget.weekIdx]?.[editingTarget.day]?.[editingTarget.sessionIdx] ?? null)
    : null;

  function updateSession(wIdx: number, day: string, sIdx: number, updates: Partial<SessionTemplate>) {
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== wIdx ? w : {
        ...w, [day]: ((w[day] ?? []) as SessionTemplate[]).map((s, si) => si === sIdx ? { ...s, ...updates } : s),
      }),
    }));
  }

  function removeSession(wIdx: number, day: string, sIdx: number) {
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== wIdx ? w : {
        ...w, [day]: ((w[day] ?? []) as SessionTemplate[]).filter((_, si) => si !== sIdx),
      }),
    }));
  }

  function addSession(day: string) {
    const newIdx = ((week[day] ?? []) as SessionTemplate[]).length;
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== weekIdx ? w : {
        ...w, [day]: [...((w[day] ?? []) as SessionTemplate[]), { name: "Nouvelle séance", notes: null, target_difficulty: 6, load: 2, type: "technique" as const }],
      }),
    }));
    setEditingTarget({ weekIdx, day, sessionIdx: newIdx });
  }

  function moveSessionToDay(fromDay: string, sIdx: number, toDay: string) {
    if (fromDay === toDay) return;
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => {
        if (wi !== weekIdx) return w;
        const fromArr = [...((w[fromDay] ?? []) as SessionTemplate[])];
        const [moved] = fromArr.splice(sIdx, 1);
        if (!moved) return w;
        const toArr = [...((w[toDay] ?? []) as SessionTemplate[]), moved];
        return { ...w, [fromDay]: fromArr, [toDay]: toArr };
      }),
    }));
  }

  function reorderExercisesInSession(day: string, sIdx: number, fromExIdx: number, toExIdx: number) {
    if (fromExIdx === toExIdx) return;
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => {
        if (wi !== weekIdx) return w;
        const sessions = [...((w[day] ?? []) as SessionTemplate[])];
        const session = sessions[sIdx];
        if (!session || !session.notes) return w;
        const lines = session.notes.split("\n").filter(Boolean);
        if (fromExIdx < 0 || fromExIdx >= lines.length || toExIdx < 0 || toExIdx >= lines.length) return w;
        const [moved] = lines.splice(fromExIdx, 1);
        lines.splice(toExIdx, 0, moved);
        sessions[sIdx] = { ...session, notes: lines.join("\n") };
        return { ...w, [day]: sessions };
      }),
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { type?: string; day?: string; sIdx?: number; exIdx?: number } | undefined;
    if (activeData?.type === "exercise") {
      const overData = over.data.current as { type?: string; day?: string; sIdx?: number; exIdx?: number } | undefined;
      if (overData?.type !== "exercise" || overData.day !== activeData.day || overData.sIdx !== activeData.sIdx) return;
      reorderExercisesInSession(activeData.day!, activeData.sIdx!, activeData.exIdx!, overData.exIdx!);
      return;
    }
    if (activeData?.type === "session") {
      const overData = over.data.current as { type?: string; day?: string } | undefined;
      if (overData?.type !== "day" || !overData.day) return;
      moveSessionToDay(activeData.day!, activeData.sIdx!, overData.day);
    }
  }

  function applyReconduire(weeksOut: ReconduireOutputRow[][]) {
    const startIdx = template.weeks.length;
    const newWeeks: WeekTemplate[] = weeksOut.map(rows => {
      const w: WeekTemplate = {};
      DAYS.forEach(d => { w[d] = []; });
      rows.forEach(r => {
        (w[DAYS[r.dayIndex]] as SessionTemplate[]).push({
          name: r.name, notes: r.notes || null, target_difficulty: r.target_difficulty, load: 2, type: "volume",
        });
      });
      return w;
    });
    setTemplate(prev => ({ weeks: [...prev.weeks, ...newWeeks] }));
    setWeekIdx(startIdx);
    setShowReconduire(false);
  }

  function deleteWeek(idx: number) {
    if (template.weeks.length <= 1) return;
    setTemplate(prev => ({ weeks: prev.weeks.filter((_, i) => i !== idx) }));
    setWeekIdx(prev => Math.min(prev, template.weeks.length - 2));
  }

  async function handleSave(mode: "library" | "assign") {
    if (!name.trim() || saving) return;
    setSaving(mode);
    setSaveError(null);
    try {
      if (mode === "library") await onSaveToLibrary(name, template);
      else await onSaveAndAssign(name, template);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur inattendue");
      setSaving(null);
    }
  }

  const fakeSession: Session | undefined = editingSession ? {
    id: `tpl-${editingTarget!.day}-${editingTarget!.sessionIdx}`,
    user_id: "template",
    date: "2026-01-01",
    name: editingSession.name,
    notes: editingSession.notes,
    duration: null,
    rpe: null,
    done: false,
    target_difficulty: editingSession.target_difficulty,
    created_at: "",
  } : undefined;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", display: "flex", flexDirection: "column", zIndex: 2147483100 }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 20, padding: "4px 6px", borderRadius: 8, flexShrink: 0 }}>←</button>
        <input
          value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "#171b1f", border: "none", outline: "none", background: "transparent", letterSpacing: "-0.02em", minWidth: 0 }}
          placeholder="Nom du programme"
        />
      </div>

      {/* Week tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "0 18px", display: "flex", alignItems: "flex-end", height: 56, gap: 0, overflowX: "auto", flexShrink: 0 }}>
        {template.weeks.map((w, i) => {
          const avg = weekAvgLoads[i];
          const barH = Math.max(4, Math.round((avg / maxAvgLoad) * 26));
          const isActive = i === weekIdx;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, padding: "0 4px 8px", borderBottom: isActive ? "2.5px solid #d44000" : "2.5px solid transparent", flexShrink: 0, position: "relative" }}>
              <div style={{ width: 18, height: barH, borderRadius: "2px 2px 0 0", background: loadBarColor(avg), opacity: isActive ? 1 : 0.55, cursor: "pointer" }} onClick={() => setWeekIdx(i)} />
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span onClick={() => setWeekIdx(i)} style={{ fontSize: 11, fontWeight: isActive ? 800 : 500, color: isActive ? "#171b1f" : "#8a8f94", cursor: "pointer", padding: "0 4px" }}>S{i + 1}</span>
                {isActive && template.weeks.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); gate(() => deleteWeek(i)); }}
                    title="Supprimer cette semaine"
                    style={{ width: 14, height: 14, borderRadius: "50%", border: "none", background: "rgba(212,64,0,.15)", color: "#d44000", fontSize: 9, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1, flexShrink: 0 }}
                  >×</button>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ flex: 1, minWidth: 12 }} />
        <button
          onClick={() => gate(() => setShowReconduire(true))}
          style={{
            margin: "0 0 12px", padding: "6px 13px", borderRadius: 10, border: "1px solid rgba(0,0,0,.12)",
            cursor: "pointer", background: "#fff", color: "#62686e", fontWeight: 700, fontSize: 11,
            display: "flex", alignItems: "center", flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          Reconduire la semaine →
        </button>
      </div>

      {/* Warning: programme with active assignments */}
      {assignmentCount > 0 && (
        <div style={{ background: "#fff8f0", borderBottom: "1px solid rgba(212,64,0,.15)", padding: "8px 18px", fontSize: 12, color: "#b96500", fontWeight: 600, flexShrink: 0 }}>
          ⚠️ {assignmentCount} sportif{assignmentCount > 1 ? "s suivent" : " suit"} ce programme — les séances déjà planifiées ne seront pas modifiées.
        </div>
      )}

      {/* 7-column grid — same layout as planning */}
      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 240px))",
        alignItems: "start",
        gap: 10,
        overflowX: "auto",
        overflowY: "auto",
        padding: "14px 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
      }}>
        {DAYS.map((day, dayIdx) => {
          const daySessions = (week[day] ?? []) as SessionTemplate[];
          const prevSess = (week[DAYS[dayIdx - 1]] ?? []) as SessionTemplate[];
          const nextSess = (week[DAYS[dayIdx + 1]] ?? []) as SessionTemplate[];
          const ctx = {
            prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
            nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
          };
          const rule = loadRule(daySessions.map(s => ({ target_difficulty: s.target_difficulty })), ctx);
          const tagColor = ruleTagColors[rule.cls];
          return (
            <div key={day}>
            <DroppableProgramDay day={day}>
            <div style={{ background: "#fff", borderRadius: 26, border: "1px solid rgba(0,0,0,.08)", padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.05)", scrollSnapAlign: "start" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>{day}</div>
              </div>

              {(daySessions.length > 0 || rule.cls !== "rest") && (
                <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>{rule.tag}</div>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                </div>
              )}

              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                Séances · {daySessions.length}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {daySessions.length === 0 && (
                  <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
                    Repos / libre
                  </div>
                )}
                {daySessions.map((s, sIdx) => (
                  <DraggableProgramSession key={sIdx} day={day} sIdx={sIdx} session={s} onClick={() => gate(() => setEditingTarget({ weekIdx, day, sessionIdx: sIdx }))} />
                ))}
                <div
                  onClick={() => gate(() => addSession(day))}
                  style={{ border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 10, padding: "9px 8px", textAlign: "center", fontSize: 11, cursor: "pointer", fontWeight: 700 }}
                >
                  + Ajouter une séance
                </div>
              </div>
            </div>
            </DroppableProgramDay>
            </div>
          );
        })}
      </div>
      </DndContext>

      {/* Bottom */}
      {saveError && (
        <div style={{ background: "rgba(212,64,0,.1)", padding: "8px 18px", fontSize: 12, color: "#d44000", fontWeight: 600 }}>
          ⚠️ {saveError}
        </div>
      )}
      <div style={{ background: "#fff", borderTop: "1px solid rgba(0,0,0,.08)", padding: "12px 18px 20px", display: "flex", gap: 10, flexShrink: 0 }}>
        <button onClick={() => gate(() => handleSave("library"))} disabled={!name.trim() || saving !== null} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "2px solid rgba(0,0,0,.10)", cursor: name.trim() && !saving ? "pointer" : "not-allowed", background: name.trim() && !saving ? "#faf9f7" : "#f5f5f5", color: name.trim() && !saving ? "#555" : "#aaa", fontWeight: 700, fontSize: 13 }}>
          {saving === "library" ? "Enregistrement…" : "💾 Enregistrer en librairie"}
        </button>
        <button onClick={() => gate(() => handleSave("assign"))} disabled={!name.trim() || saving !== null} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", cursor: name.trim() && !saving ? "pointer" : "not-allowed", background: name.trim() && !saving ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df", color: name.trim() && !saving ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, boxShadow: name.trim() && !saving ? "0 4px 12px rgba(212,64,0,.20)" : "none" }}>
          {saving === "assign" ? "Assignation…" : "👤 Assigner →"}
        </button>
      </div>

      {showReconduire && (() => {
        const lastWeek = template.weeks[template.weeks.length - 1];
        const daySlots = DAYS.map(day => ({
          sessions: ((lastWeek[day] ?? []) as SessionTemplate[]).map((s, idx) => ({
            id: `${day}:${idx}`, date: "", name: s.name, notes: s.notes,
            duration: null, rpe: null, done: false, target_difficulty: s.target_difficulty,
          })),
        }));
        return (
          <ReconduireModal
            daySlots={daySlots}
            title="Reconduire la dernière semaine"
            onClose={() => setShowReconduire(false)}
            onConfirm={async (weeksOut) => applyReconduire(weeksOut)}
          />
        );
      })()}

      {editingSession && editingTarget && fakeSession && (
        <AddSessionModal
          date={fakeSession.date}
          session={fakeSession}
          hideDate
          onSave={async (data) => {
            updateSession(editingTarget.weekIdx, editingTarget.day, editingTarget.sessionIdx, { name: data.name, notes: data.notes || null, target_difficulty: data.target_difficulty });
            setEditingTarget(null);
          }}
          onDelete={async () => { removeSession(editingTarget.weekIdx, editingTarget.day, editingTarget.sessionIdx); setEditingTarget(null); }}
          onClose={() => setEditingTarget(null)}
        />
      )}
    </div>
  );
}
