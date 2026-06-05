"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import PlanningRing from "@/components/calendar/PlanningRing";
import DiffGaugeShared from "@/components/calendar/DiffGauge";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import CompleteModal from "@/components/sessions/CompleteModal";
import DuplicateModal from "@/components/sessions/DuplicateModal";
import WellnessModal from "@/components/wellness/WellnessModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingModal from "@/components/paywall/PrimingModal";
import { usePaywall } from "@/hooks/usePaywall";
import type { Session, WellnessDaily, SubscriptionStatus } from "@/types";

/* ─── helpers ─── */
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return score >= 75 ? "#2f9e44" : score >= 55 ? "#f28a00" : "#d10000";
}
function formLabel(score: number | null) {
  if (score === null) return "Non renseigné";
  if (score >= 82) return "Zone optimale";
  if (score >= 65) return "Zone stable";
  if (score >= 45) return "Zone prudente";
  return "Zone récupération";
}
function getWeekDates(base: Date): Date[] {
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/* ─── Difficulty gauge — alias du composant partagé ─── */
const DiffGauge = DiffGaugeShared;

/* ─── Week session card (v59 POC exact layout) ─── */
function WeekSessionCard({ session, onComplete, onEdit, onDuplicate }: {
  session: Session;
  onComplete: (s: Session) => void;
  onEdit: (s: Session) => void;
  onDuplicate: (s: Session) => void;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  // Single gauge: rpe if done, target_difficulty if planned
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);

  return (
    <div
      style={{
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        background: "#fff", borderRadius: 14, padding: "10px 11px",
        cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.045)",
        transition: "transform .2s ease, box-shadow .2s ease",
      }}
      onClick={() => onEdit(session)}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word" }}>
          {session.name}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
          background: session.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,0.10)",
          color: session.done ? "#2f9e44" : "#d44000",
        }}>
          {session.done ? "Terminé" : "Prévu"}
        </span>
      </div>

      {/* 2. Single gauge — no label */}
      {gaugeValue && (
        <div style={{ marginBottom: 8 }}>
          <DiffGauge value={gaugeValue} height={10} />
        </div>
      )}

      {/* 3. Exercise display list (v50 — no numbers) */}
      {exercises.length > 0 && (
        <div style={{ marginBottom: 8, borderRadius: 12, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{
              padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4,
              color: "#2c3236", fontWeight: 600,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
              background: "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {ex}
            </div>
          ))}
        </div>
      )}

      {/* 4. Actions */}
      <div style={{ display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onComplete(session)}
          style={{
            flex: 1, height: 32, borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer",
            background: session.done ? "#fff" : "linear-gradient(180deg,#f04a08,#d44000)",
            color: session.done ? "#171b1f" : "#fff",
            border: session.done ? "1px solid rgba(0,0,0,.10)" : "none",
            boxShadow: session.done ? "none" : "0 4px 12px rgba(212,64,0,.20)",
          }}
        >
          {session.done ? "Résultat" : "Terminer"}
        </button>
        <button
          onClick={() => onDuplicate(session)} title="Dupliquer"
          style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(0,0,0,.09)", background: "#f7f8f9", color: "#8a8f94", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >⎘</button>
      </div>
    </div>
  );
}

/* ─── Load rule card (v49 POC) ─── */
function loadRule(sessions: Session[]): { title: string; tag: string; text: string; cls: "hard" | "moderate" | "easy" | "rest" } {
  const maxDiff = sessions.length
    ? Math.max(...sessions.map(s => s.rpe ?? s.target_difficulty ?? (s.done ? 6 : 6)))
    : 0;
  if (maxDiff >= 8) return { cls: "hard", tag: "Charge haute", title: "Séance dure isolée", text: "OK si elle reste isolée : garde la variation autour pour préserver la récupération." };
  if (maxDiff >= 5) return { cls: "moderate", tag: "Modérée", title: "Charge maîtrisable", text: "Enchaîner du modéré est acceptable si tu varies le stimulus : volume, intensité ou récupération active." };
  if (maxDiff > 0) return { cls: "easy", tag: "Facile", title: "Variation utile", text: "Séance légère : bon tampon entre deux charges ou bon support technique sans trop de fatigue." };
  return { cls: "rest", tag: "Libre", title: "Récupération", text: "Journée ouverte : elle crée de l'espace dans le bloc de charge." };
}
const ruleTagColors: Record<string, { bg: string; color: string }> = {
  hard: { bg: "#ffe9df", color: "#d44000" },
  moderate: { bg: "#fff1d8", color: "#b96500" },
  easy: { bg: "#e4f3e8", color: "#166534" },
  rest: { bg: "#e7e7e7", color: "#666" },
};

/* PlanningRing importé depuis @/components/calendar/PlanningRing */

/* ─── Day column ─── */
function DayColumn({ date, sessions, wellness, todayStr, onAddSession, onComplete, onEdit, onDuplicate, onWellness }: {
  date: Date; sessions: Session[]; wellness: WellnessDaily | null;
  todayStr: string; onAddSession: (d: string) => void;
  onComplete: (s: Session) => void; onEdit: (s: Session) => void;
  onDuplicate: (s: Session) => void; onWellness: () => void;
}) {
  const dstr = format(date, "yyyy-MM-dd");
  const isToday = dstr === todayStr;
  const score = wellness?.score ?? null;
  const rule = loadRule(sessions);
  const tagColor = ruleTagColors[rule.cls];

  return (
    <div className="week-col-width" style={{
      background: "#fff",
      border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,0.08)",
      borderRadius: 26, padding: 16,
      boxShadow: isToday ? "0 0 0 0 transparent, 0 8px 24px rgba(212,64,0,.08)" : "0 6px 18px rgba(0,0,0,0.05)",
      scrollSnapAlign: "start",
      transition: "transform 0.22s ease, box-shadow 0.22s ease",
    }}>
      {/* Header: day + ring */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>
            {DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
          </div>
          <div style={{ fontSize: 26, fontWeight: 1000, color: "#171b1f", lineHeight: 1.05, letterSpacing: "-0.04em" }}>
            {date.getDate()}
          </div>
          {isToday && (
            <span style={{ display: "inline-block", fontSize: 9, fontWeight: 800, color: "#fff", background: "#d44000", padding: "2px 7px", borderRadius: 999, marginTop: 3, letterSpacing: "0.04em" }}>
              Aujourd'hui
            </span>
          )}
        </div>
        <div onClick={e => { e.stopPropagation(); onWellness(); }} style={{ cursor: "pointer" }}>
          <PlanningRing score={score} />
        </div>
      </div>

      {/* Zone label */}
      <div style={{ fontSize: 10, fontWeight: 800, color: score !== null ? scoreColor(score) : "#8a8f94", marginBottom: 8, letterSpacing: "0.01em" }}>
        {formLabel(score)}
      </div>

      {/* Load rule card */}
      <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
            {rule.tag}
          </div>
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
        {isToday && !wellness && (
          <button
            onClick={e => { e.stopPropagation(); onWellness(); }}
            style={{ width: "100%", marginTop: 9, padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
          >
            Renseigner mon wellness
          </button>
        )}
      </div>

      {/* Sessions label */}
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
        Séances · {sessions.length}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sessions.length === 0 && (
          <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
            Repos / libre
          </div>
        )}
        {sessions.map(s => (
          <WeekSessionCard key={s.id} session={s} onComplete={onComplete} onEdit={onEdit} onDuplicate={onDuplicate} />
        ))}
        <div
          onClick={e => { e.stopPropagation(); onAddSession(dstr); }}
          style={{ border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 10, padding: "9px 8px", textAlign: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, transition: "all .15s" }}
        >
          + Ajouter une séance
        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
interface Props { userId: string; initialSessions: Session[]; initialWellness: WellnessDaily[]; subscriptionStatus: SubscriptionStatus; }

export default function WeekClient({ userId, initialSessions, initialWellness, subscriptionStatus }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekBase, setWeekBase] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [wellnessList, setWellnessList] = useState<WellnessDaily[]>(initialWellness);
  const [monthSessions, setMonthSessions] = useState<Session[]>([]);
  const [monthWellness, setMonthWellness] = useState<WellnessDaily[]>([]);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [duplicating, setDuplicating] = useState<Session | null>(null);
  const [showWellness, setShowWellness] = useState(false);

  const dates = getWeekDates(weekBase);

  const dotMap = (() => {
    const map: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
    dates.forEach(d => {
      const dstr = format(d, "yyyy-MM-dd");
      const ds = sessions.filter(s => s.date === dstr);
      const charge = ds.filter(s => s.done && s.rpe && s.duration).reduce((a, s) => a + s.rpe! * s.duration!, 0);
      if (charge > 600) map[dstr] = "done-high";
      else if (charge > 300) map[dstr] = "done-med";
      else if (charge > 0) map[dstr] = "done-light";
      else if (ds.some(s => !s.done)) map[dstr] = "planned";
    });
    return map;
  })();

  async function loadWeek(base: Date) {
    const mon = format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const sun = format(addDays(startOfWeek(base, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
    const [{ data: s }, { data: w }] = await Promise.all([
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", mon).lte("date", sun).order("created_at"),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", mon).lte("date", sun),
    ]);
    if (s) setSessions(prev => { const out = prev.filter(x => x.date < mon || x.date > sun); return [...out, ...s]; });
    if (w) setWellnessList(prev => { const out = prev.filter(x => x.date < mon || x.date > sun); return [...out, ...w]; });
  }

  async function loadMonth(anchor: string) {
    const base = new Date(anchor + "T12:00:00");
    const start = format(startOfMonth(base), "yyyy-MM-dd");
    const end = format(endOfMonth(base), "yyyy-MM-dd");
    const [{ data: s }, { data: w }] = await Promise.all([
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", start).lte("date", end).order("created_at"),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", start).lte("date", end),
    ]);
    setMonthSessions(s ?? []);
    setMonthWellness(w ?? []);
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    const nb = new Date(date + "T12:00:00");
    setWeekBase(nb);
    if (viewMode === "week") loadWeek(nb);
    else loadMonth(date);
  }

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "month") loadMonth(selectedDate);
  }

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }) => {
    const { data: saved } = await supabase.from("sessions").insert({ user_id: userId, ...data, done: false }).select().single();
    if (saved) setSessions(prev => [...prev, saved as Session]);
    setAddingDate(null);
    router.refresh();
  }, [supabase, userId, router]);

  const saveComplete = useCallback(async (data: { rpe: number; duration: number }) => {
    if (!completing) return;
    const { data: saved } = await supabase.from("sessions").update({ done: true, ...data }).eq("id", completing.id).select().single();
    if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
    setCompleting(null);
    router.refresh();
  }, [supabase, completing, router]);

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }) => {
    if (!editing) return;
    const { data: saved } = await supabase.from("sessions").update(data).eq("id", editing.id).select().single();
    if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
    setEditing(null);
    router.refresh();
  }, [supabase, editing, router]);

  const deleteSession = useCallback(async (session: Session) => {
    await supabase.from("sessions").delete().eq("id", session.id);
    setSessions(prev => prev.filter(s => s.id !== session.id));
    setEditing(null);
    router.refresh();
  }, [supabase, router]);

  const duplicateSession = useCallback(async (newDate: string) => {
    if (!duplicating) return;
    const { data: saved } = await supabase.from("sessions").insert({
      user_id: userId,
      name: duplicating.name,
      notes: duplicating.notes,
      date: newDate,
      target_difficulty: duplicating.target_difficulty,
      done: false,
    }).select().single();
    if (saved) setSessions(prev => [...prev, saved as Session]);
    setDuplicating(null);
    router.refresh();
  }, [supabase, userId, duplicating, router]);

  const saveWellness = useCallback(async (data: {
    sleep: number; stress: number; recovery: number; motivation: number;
    behaviors: string[]; bedtime: string; base_score: number; score: number;
  }) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: saved } = await supabase.from("wellness_daily")
      .upsert({ user_id: userId, date: today, ...data }, { onConflict: "user_id,date" })
      .select().single();
    if (saved) setWellnessList(prev => { const w = prev.filter(x => x.date !== today); return [...w, saved as WellnessDaily]; });
    setShowWellness(false);
  }, [supabase, userId]);

  return (
    <>
      <CalendarHeader
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        dotMap={dotMap}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
          gap: isMd ? 12 : 10,
          overflowX: "auto",
          padding: isMd ? "14px 20px 18px" : "14px 14px 18px",
          scrollSnapType: "x proximity",
          scrollbarWidth: "thin",
        }}>
          {dates.map(date => {
            const dstr = format(date, "yyyy-MM-dd");
            return (
              <DayColumn
                key={dstr} date={date}
                sessions={sessions.filter(s => s.date === dstr)}
                wellness={wellnessList.find(w => w.date === dstr) ?? null}
                todayStr={todayStr}
                onAddSession={(d) => requireSubscription(() => setAddingDate(d))}
                onComplete={(s) => requireSubscription(() => setCompleting(s))}
                onEdit={(s) => requireSubscription(() => setEditing(s))}
                onDuplicate={(s) => requireSubscription(() => setDuplicating(s))}
                onWellness={() => requireSubscription(() => setShowWellness(true))}
              />
            );
          })}
        </div>
      )}

      {/* ── Vue mois ── */}
      {viewMode === "month" && (() => {
        const anchor = new Date(selectedDate + "T12:00:00");
        const weeks = eachWeekOfInterval(
          { start: startOfMonth(anchor), end: endOfMonth(anchor) },
          { weekStartsOn: 1 }
        );
        const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
        return (
          <div style={{ padding: isMd ? "14px 20px 100px" : "8px 8px 100px" }}>
            {/* En-têtes colonnes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: 4 }}>
              {dayLabels.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 2 }}>
                  {isMd ? d : d[0]}
                </div>
              ))}
            </div>
            {/* Grille semaines */}
            {weeks.map(weekMonday => (
              <div key={weekMonday.toISOString()} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: isMd ? 4 : 2 }}>
                {Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)).map(date => {
                  const dstr = format(date, "yyyy-MM-dd");
                  const isToday = dstr === todayStr;
                  const inMonth = date.getMonth() === anchor.getMonth();
                  const daySessions = monthSessions.filter(s => s.date === dstr);
                  const wellness = monthWellness.find(w => w.date === dstr) ?? null;
                  const score = wellness?.score ?? null;

                  return (
                    <div
                      key={dstr}
                      style={{
                        background: inMonth ? "#fff" : "rgba(255,255,255,.45)",
                        border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,.08)",
                        borderRadius: isMd ? 14 : 10,
                        padding: isMd ? "8px 8px 6px" : "6px 5px 6px",
                        minHeight: isMd ? 100 : 90,
                        opacity: inMonth ? 1 : 0.4,
                        boxShadow: isToday ? "0 4px 14px rgba(212,64,0,.10)" : "0 2px 6px rgba(0,0,0,.04)",
                        display: "flex", flexDirection: "column",
                      }}
                    >
                      {/* Desktop : date + ring côte à côte */}
                      {isMd && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", color: "#8a8f94", letterSpacing: "0.08em", lineHeight: 1.2 }}>
                              {format(date, "EEE", { locale: fr }).slice(0, 3)}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: "-0.04em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1 }}>
                              {date.getDate()}
                            </div>
                          </div>
                          {score !== null && <PlanningRing score={score} size={44} />}
                        </div>
                      )}

                      {/* Mobile : numéro + ring empilés verticalement, dots dessous */}
                      {!isMd && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: "-0.04em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1, textAlign: "center", marginBottom: 4 }}>
                            {date.getDate()}
                          </div>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                            {score !== null
                              ? <PlanningRing score={score} size={40} />
                              : <div style={{ width: 40, height: 40 }} />}
                          </div>
                          {daySessions.length > 0 && (
                            <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                              {daySessions.slice(0, 3).map(s => (
                                <div key={s.id} style={{ width: 6, height: 6, borderRadius: "50%", background: s.done ? "#2f9e44" : "#d44000", flexShrink: 0 }} />
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Desktop : séances + bouton ajouter */}
                      {isMd && (
                        <>
                          {daySessions.slice(0, 2).map(s => {
                            const gaugeVal = s.done ? (s.rpe ?? null) : (s.target_difficulty ?? null);
                            return (
                              <div
                                key={s.id}
                                onClick={e => { e.stopPropagation(); requireSubscription(() => setEditing(s)); }}
                                style={{ background: "#f7f8f9", borderRadius: 8, padding: "4px 6px", marginBottom: 3, cursor: "pointer" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                    {s.name}
                                  </div>
                                  <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: s.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.10)", color: s.done ? "#2f9e44" : "#d44000" }}>
                                    {s.done ? "Terminé" : "Prévu"}
                                  </span>
                                </div>
                                <DiffGauge value={gaugeVal} height={5} />
                              </div>
                            );
                          })}
                          {daySessions.length > 2 && (
                            <div style={{ fontSize: 9, color: "#8a8f94", textAlign: "center" }}>+{daySessions.length - 2}</div>
                          )}
                          {inMonth && (
                            <div
                              onClick={e => { e.stopPropagation(); requireSubscription(() => setAddingDate(dstr)); }}
                              style={{ marginTop: "auto", border: "0.5px dashed rgba(212,64,0,.28)", borderRadius: 7, textAlign: "center", fontSize: 10, color: "#d44000", cursor: "pointer", fontWeight: 700, padding: "4px 2px" }}
                            >
                              +
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Modals */}
      {addingDate && (
        <AddSessionModal date={addingDate} onSave={addSession} onClose={() => setAddingDate(null)} />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={saveComplete} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date} session={editing}
          onSave={saveEdit}
          onDelete={async () => deleteSession(editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {duplicating && (
        <DuplicateModal session={duplicating} onDuplicate={duplicateSession} onClose={() => setDuplicating(null)} />
      )}
      {showWellness && (
        <WellnessModal date={todayStr} onSave={saveWellness} onClose={() => setShowWellness(false)} />
      )}
      {paywallStep === "priming" && (
        <PrimingModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
          onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
      )}
      {paywallStep === "paywall" && (
        <PaywallModal mode="athlete" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
