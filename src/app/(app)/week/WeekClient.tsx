"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import DayColumn from "@/components/calendar/DayColumn";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import CompleteModal from "@/components/sessions/CompleteModal";
import DuplicateModal from "@/components/sessions/DuplicateModal";
import WellnessModal from "@/components/wellness/WellnessModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import type { LoadContext } from "@/lib/loadRule";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import { usePaywall } from "@/hooks/usePaywall";
import ProgramBanner from "@/components/programs/ProgramBanner";
import ProgramLibraryPage from "@/components/programs/ProgramLibraryPage";
import type { Session, WellnessDaily, SubscriptionStatus, Program } from "@/types";

/* ─── helpers ─── */
function getWeekDates(base: Date): Date[] {
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/* ─── Main ─── */
interface Props { userId: string; initialSessions: Session[]; initialWellness: WellnessDaily[]; subscriptionStatus: SubscriptionStatus; hasCoach?: boolean; initialDate?: string; }

export default function WeekClient({ userId, initialSessions, initialWellness, subscriptionStatus, hasCoach = false, initialDate }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus, hasCoach);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekBase, setWeekBase] = useState(initialDate ? new Date(initialDate + "T12:00:00") : new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [navKey, setNavKey] = useState(0);
  const slideDirRef  = useRef<"left" | "right">("left");
  const lastWheelNav = useRef(0);
  const weekGridRef  = useRef<HTMLDivElement>(null);
  const dayRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [wellnessList, setWellnessList] = useState<WellnessDaily[]>(initialWellness);
  const [monthSessions, setMonthSessions] = useState<Session[]>([]);
  const [monthWellness, setMonthWellness] = useState<WellnessDaily[]>([]);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [pendingCompleteSession, setPendingCompleteSession] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [duplicating, setDuplicating] = useState<Session | null>(null);
  const [showWellness, setShowWellness] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [activeProgramWeek, setActiveProgramWeek] = useState<number>(-1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  async function fetchActiveProgram() {
    const { data } = await supabase
      .from("program_assignments")
      .select("*, programs(*)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.programs) {
      const prog = data.programs as Program;
      setActiveProgram(prog);
      setActiveAssignmentId(data.id);
      const startDate = new Date(data.start_date + "T12:00:00");
      const diffMs = Date.now() - startDate.getTime();
      const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      setActiveProgramWeek(weekIdx >= 0 && weekIdx < prog.weeks_count ? weekIdx : -1);
    } else {
      setActiveProgram(null);
      setActiveProgramWeek(-1);
      setActiveAssignmentId(null);
    }
  }

  useEffect(() => { fetchActiveProgram(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref pour les closures realtime (évite staleness sur weekBase)
  const weekBaseRef = useRef(weekBase);
  useEffect(() => { weekBaseRef.current = weekBase; }, [weekBase]);

  // Realtime — sessions + wellness_daily
  useEffect(() => {
    const sessionsCh = supabase
      .channel(`week-sessions-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        const base = weekBaseRef.current;
        const mon = format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const sun = format(addDays(startOfWeek(base, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
        if (payload.eventType === "INSERT") {
          const s = payload.new as Session;
          if (s.date >= mon && s.date <= sun) {
            setSessions(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s]);
          }
        } else if (payload.eventType === "UPDATE") {
          setSessions(prev => prev.map(s => s.id === (payload.new as Session).id ? payload.new as Session : s));
        } else if (payload.eventType === "DELETE") {
          setSessions(prev => prev.filter(s => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    const wellnessCh = supabase
      .channel(`week-wellness-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const w = payload.new as WellnessDaily;
          setWellnessList(prev => { const out = prev.filter(x => x.date !== w.date); return [...out, w]; });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsCh);
      supabase.removeChannel(wellnessCh);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function navigatePeriod(dir: "next" | "prev") {
    slideDirRef.current = dir === "next" ? "left" : "right";
    setNavKey(k => k + 1);
    const base = viewMode === "week"
      ? (dir === "next" ? addDays(weekBase, 7) : subDays(weekBase, 7))
      : (dir === "next" ? addMonths(weekBase, 1) : subMonths(weekBase, 1));
    handleDateChange(format(base, "yyyy-MM-dd"));
  }

  useEffect(() => {
    if (viewMode !== "week") return;
    const todayIdx = dates.findIndex(d => format(d, "yyyy-MM-dd") === todayStr);
    if (todayIdx >= 0) {
      dayRefs.current[todayIdx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [weekBase, viewMode]);

  useEffect(() => {
    const el = weekGridRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 60) return;
      const now = Date.now();
      if (now - lastWheelNav.current < 600) return;
      lastWheelNav.current = now;
      navigatePeriod(e.deltaY > 0 ? "next" : "prev");
    };
    el.addEventListener("wheel", handler, { passive: true });
    return () => el.removeEventListener("wheel", handler);
  });

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
    if (pendingCompleteSession) {
      const pending = pendingCompleteSession;
      setPendingCompleteSession(null);
      setCompleting(pending);
    }
  }, [supabase, userId, pendingCompleteSession]);

  function handleTerminer(session: Session) {
    const wellnessTodayFilled = wellnessList.some(w => w.date === todayStr && w.bedtime != null);
    if (session.date === todayStr && !wellnessTodayFilled) {
      setPendingCompleteSession(session);
      setShowWellness(true);
    } else {
      setCompleting(session);
    }
  }

  const wellnessMapForHeader: Record<string, number | null> = {};
  dates.forEach(d => {
    const iso = format(d, "yyyy-MM-dd");
    wellnessMapForHeader[iso] = wellnessList.find(w => w.date === iso)?.score ?? null;
  });

  return (
    <>
      <CalendarHeader
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        dotMap={dotMap}
        wellnessMap={wellnessMapForHeader}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onSwipe={navigatePeriod}
      />

      <ProgramBanner
        program={activeProgram}
        currentWeek={activeProgramWeek}
        onEdit={activeProgram ? () => setShowLibrary(true) : undefined}
        onOpenLibrary={() => setShowLibrary(true)}
      />

      <div ref={weekGridRef} data-tour="week-sessions">
        <div key={`cal-${navKey}`} style={{
          animation: navKey > 0
            ? `${slideDirRef.current === "left" ? "calSlideFromRight" : "calSlideFromLeft"} 220ms ease-out`
            : undefined,
        }}>

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
          {dates.map((date, idx) => {
            const dstr = format(date, "yyyy-MM-dd");
            const prevStr = idx > 0 ? format(dates[idx - 1], "yyyy-MM-dd") : null;
            const nextStr = idx < dates.length - 1 ? format(dates[idx + 1], "yyyy-MM-dd") : null;
            const prevSess = prevStr ? sessions.filter(s => s.date === prevStr) : [];
            const nextSess = nextStr ? sessions.filter(s => s.date === nextStr) : [];
            const ctx: LoadContext = {
              prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
              nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
            };
            return (
              <div key={dstr} ref={el => { dayRefs.current[idx] = el; }}>
              <DayColumn
                date={date}
                sessions={sessions.filter(s => s.date === dstr)}
                wellness={wellnessList.find(w => w.date === dstr) ?? null}
                todayStr={todayStr}
                ctx={ctx}
                onAddSession={(d) => requireSubscription(() => setAddingDate(d))}
                onComplete={(s) => requireSubscription(() => handleTerminer(s))}
                onEdit={(s) => requireSubscription(() => setEditing(s))}
                onDuplicate={(s) => requireSubscription(() => setDuplicating(s))}
                onWellness={() => requireSubscription(() => setShowWellness(true))}
              />
              </div>
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

        </div>{/* animation wrapper */}
      </div>{/* weekGridRef */}

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
        <WellnessModal date={todayStr} onSave={saveWellness} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); }} />
      )}
      {showLibrary && (
        <ProgramLibraryPage
          athletes={[]}
          selfUserId={userId}
          activeProgram={activeProgram}
          activeProgramWeek={activeProgramWeek}
          requireSubscription={requireSubscription}
          onClose={async () => { setShowLibrary(false); await fetchActiveProgram(); router.refresh(); }}
        />
      )}
      {paywallStep === "priming" && (
        <PrimingJourneyModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
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
