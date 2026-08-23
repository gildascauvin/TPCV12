"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import DayColumn from "@/components/calendar/DayColumn";
import { DroppableDay, DraggableSessionCard, makePlanningDragEndHandler } from "@/components/calendar/DraggablePlanning";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import CompleteModal from "@/components/sessions/CompleteModal";
import DuplicateModal from "@/components/sessions/DuplicateModal";
import ReconduireModal from "@/components/sessions/ReconduireModal";
import WellnessModal from "@/components/wellness/WellnessModal";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AdjustSessionModal, { type AdjustSessionTarget } from "@/components/sessions/AdjustSessionModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import type { LoadContext } from "@/lib/loadRule";
import { athleteAlertFor } from "@/lib/alerts";
import { computeAutoregSuggestion, autoregAdvice, setAutoregDecision } from "@/lib/autoregulation";
import { pickRelevantAssignment } from "@/lib/programAssignment";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import ProgramBanner from "@/components/programs/ProgramBanner";
import ProgramLibraryPage from "@/components/programs/ProgramLibraryPage";
import type { Session, WellnessDaily, SubscriptionStatus, Program, ExerciseAttachments } from "@/types";

/* ─── helpers ─── */
function getWeekDates(base: Date): Date[] {
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/* ─── Main ─── */
interface Props { userId: string; userName?: string | null; initialSessions: Session[]; initialWellness: WellnessDaily[]; subscriptionStatus: SubscriptionStatus; hasCoach?: boolean; hasActiveCoach?: boolean; initialDate?: string; sandboxMode?: boolean; }

export default function WeekClient({ userId, userName, initialSessions, initialWellness, subscriptionStatus, hasCoach = false, hasActiveCoach = false, initialDate, sandboxMode = false }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;
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
  const [showReconduire, setShowReconduire] = useState(false);
  const [adjustCtx, setAdjustCtx] = useState<{ session: Session; dir: "low" | "high"; reco: number } | null>(null);
  const [decisionTick, setDecisionTick] = useState(0);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [activeProgramWeek, setActiveProgramWeek] = useState<number>(-1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [activeProgramStartDate, setActiveProgramStartDate] = useState<string | null>(null);
  // Tous les assignments actifs du sportif (il peut en enchaîner plusieurs dans le futur) —
  // sert à trouver quel programme couvre la semaine réellement affichée (navigation),
  // distinct de `activeProgram` ci-dessus qui reste "le programme pertinent aujourd'hui".
  const [activeAssignments, setActiveAssignments] = useState<{ id: string; start_date: string; programs: Program | Program[] | null }[]>([]);

  async function fetchActiveProgram() {
    const { data } = await supabase
      .from("program_assignments")
      .select("*, programs(*)")
      .eq("user_id", userId)
      .eq("status", "active");
    setActiveAssignments(data ?? []);
    const picked = pickRelevantAssignment(data ?? []);
    if (picked?.programs) {
      const prog = (Array.isArray(picked.programs) ? picked.programs[0] : picked.programs) as Program;
      setActiveProgram(prog);
      setActiveAssignmentId(picked.id);
      setActiveProgramStartDate(picked.start_date);
      const startDate = new Date(picked.start_date + "T12:00:00");
      const diffMs = Date.now() - startDate.getTime();
      const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      setActiveProgramWeek(weekIdx >= 0 && weekIdx < prog.weeks_count ? weekIdx : -1);
    } else {
      setActiveProgram(null);
      setActiveProgramWeek(-1);
      setActiveAssignmentId(null);
      setActiveProgramStartDate(null);
    }
  }

  useEffect(() => { if (!sandboxMode) fetchActiveProgram(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Sandbox : le fixture initial couvre déjà -41/+21 jours (voir sandboxFixtures.ts) — un
    // refetch réseau écraserait cette fenêtre avec un résultat vide pour un userId fictif.
    if (sandboxMode) return;
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
    if (sandboxMode) return;
    const base = new Date(anchor + "T12:00:00");
    // La grille Mois affiche aussi les jours de bord des semaines qui chevauchent le mois
    // (eachWeekOfInterval) — le fetch doit couvrir la même plage, pas le mois strict,
    // sinon les séances de ces jours de bord n'apparaissent jamais.
    const gridStart = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const gridEnd = addDays(startOfWeek(endOfMonth(base), { weekStartsOn: 1 }), 6);
    const start = format(gridStart, "yyyy-MM-dd");
    const end = format(gridEnd, "yyyy-MM-dd");
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

  // Scroll vers le jour sélectionné (ring du header cliqué, ou "Aujourd'hui" par défaut au montage/
  // changement de semaine — selectedDate vaut todayStr initialement et à chaque navigation).
  useEffect(() => {
    if (viewMode !== "week") return;
    const idx = dates.findIndex(d => format(d, "yyyy-MM-dd") === selectedDate);
    if (idx >= 0) {
      dayRefs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [weekBase, selectedDate, viewMode]);

  useEffect(() => {
    const el = weekGridRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Une modale ouverte (édition/ajout/dupliquer/reconduire/ajustement) ne doit jamais laisser
      // un scroll rapide sur la grille sous-jacente changer de semaine — le contenu affilié à la
      // modale (session référencée par id) devient alors incohérent avec la semaine affichée
      // dessous, provoquant un "saut" visuel de la modale.
      if (addingDate || completing || pendingCompleteSession || editing || duplicating || showReconduire || adjustCtx) return;
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

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }) => {
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

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }) => {
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

  const moveSessionToDate = useCallback(async (session: Session, newDate: string) => {
    if (session.date === newDate) return;
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: newDate } : s));
    const { error } = await supabase.from("sessions").update({ date: newDate }).eq("id", session.id);
    if (error) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: session.date } : s));
      return;
    }
    router.refresh();
  }, [supabase, router]);

  const reorderExercises = useCallback(async (sessionId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const target = sessions.find(s => s.id === sessionId);
    if (!target || !target.notes) return;
    const lines = target.notes.split("\n").filter(Boolean);
    if (fromIdx < 0 || fromIdx >= lines.length || toIdx < 0 || toIdx >= lines.length) return;
    const [moved] = lines.splice(fromIdx, 1);
    lines.splice(toIdx, 0, moved);
    const newNotes = lines.join("\n");
    const prevNotes = target.notes;
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: newNotes } : s));
    const { error } = await supabase.from("sessions").update({ notes: newNotes }).eq("id", sessionId);
    if (error) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: prevNotes } : s));
  }, [supabase, sessions]);

  const handleDragEnd = makePlanningDragEndHandler({ sessions, moveSession: moveSessionToDate, reorderExercises }) as (event: DragEndEvent) => void;

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // Programme + semaine correspondant à la semaine actuellement affichée (navigation) —
  // un sportif pouvant enchaîner plusieurs programmes actifs, celui pertinent pour la
  // semaine affichée n'est pas forcément `activeProgram` (qui reste "pertinent aujourd'hui").
  const { program: viewedProgram, week: viewedProgramWeek } = (() => {
    const viewedMonday = new Date(format(dates[0], "yyyy-MM-dd") + "T12:00:00").getTime();
    for (const a of activeAssignments) {
      const prog = (Array.isArray(a.programs) ? a.programs[0] : a.programs) as Program | undefined;
      if (!prog) continue;
      const start = new Date(a.start_date + "T12:00:00").getTime();
      const end = start + prog.weeks_count * 7 * 24 * 60 * 60 * 1000;
      if (viewedMonday >= start && viewedMonday < end) {
        return { program: prog, week: Math.round((viewedMonday - start) / (7 * 24 * 60 * 60 * 1000)) };
      }
    }
    return { program: null as Program | null, week: -1 };
  })();
  const isViewingCurrentWeek = dates.some(d => format(d, "yyyy-MM-dd") === todayStr);

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

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
        program={viewedProgram}
        currentWeek={viewedProgramWeek}
        onEdit={viewedProgram ? () => setShowLibrary(true) : undefined}
        onOpenLibrary={() => setShowLibrary(true)}
        onReconduire={() => setShowReconduire(true)}
      />

      {activeProgram && activeProgramWeek === -1 && activeProgramStartDate
        && new Date(activeProgramStartDate + "T12:00:00").getTime() > Date.now()
        && isViewingCurrentWeek && (
        <div style={{ margin: isMd ? "14px 20px 0" : "14px 14px 0" }}>
          <div style={{
            textAlign: "center", padding: "28px 20px",
            border: "0.5px dashed rgba(212,64,0,.28)",
            borderRadius: 20, background: "#fff",
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#171b1f", marginBottom: 4, letterSpacing: "-0.02em" }}>
              Ta semaine 1 démarre lundi
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>
              {activeProgram.name} t&apos;attend.
            </div>
            <button
              onClick={() => navigatePeriod("next")}
              style={{
                width: "100%", height: 48, borderRadius: 14,
                background: "linear-gradient(180deg,#f04a08,#d44000)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 900,
                cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)",
              }}
            >
              Voir la semaine 1 →
            </button>
          </div>
        </div>
      )}

      <div ref={weekGridRef} data-tour="week-sessions">
        <div key={`cal-${navKey}`} style={{
          animation: navKey > 0
            ? `${slideDirRef.current === "left" ? "calSlideFromRight" : "calSlideFromLeft"} 220ms ease-out`
            : undefined,
        }}>

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
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
            // Alerte "jour prioritaire" — uniquement sur la carte "Aujourd'hui", avec le vrai wellness/
            // la vraie difficulté du jour (jamais de valeur forcée, contrairement à l'aperçu onboarding).
            let alert;
            let alertActions;
            if (dstr === todayStr) {
              const todaySessions = sessions.filter(s => s.date === todayStr);
              const pendingDiffs = todaySessions.filter(s => !s.done && s.target_difficulty).map(s => s.target_difficulty!);
              const maxDiff = pendingDiffs.length ? Math.max(...pendingDiffs) : 0;
              const wellnessToday = wellnessList.find(w => w.date === todayStr) ?? null;
              const wellnessFilledToday = wellnessToday !== null && wellnessToday.bedtime != null;
              const autoregTarget = [...todaySessions].filter(s => !s.done)
                .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
              const suggestion = wellnessFilledToday && autoregTarget
                ? computeAutoregSuggestion(wellnessToday?.score ?? null, autoregTarget.target_difficulty)
                : null;
              if (suggestion && autoregTarget) {
                alert = {
                  border: suggestion.dir === "low" ? "rgba(242,138,0,.4)" : "rgba(47,158,68,.4)",
                  glow: suggestion.dir === "low" ? "#f28a00" : "#2f9e44",
                  text: `${suggestion.icon} ${autoregAdvice(suggestion.dir, autoregTarget.target_difficulty ?? maxDiff)}`,
                };
                alertActions = (
                  <AutoregButtons
                    key={`${autoregTarget.id}-${decisionTick}`}
                    sessionId={autoregTarget.id}
                    dir={suggestion.dir}
                    reco={suggestion.reco}
                    advice=""
                    sessionLabel={autoregTarget.name}
                    onMaintenir={() => setDecisionTick(t => t + 1)}
                    onOpenModal={() => setAdjustCtx({ session: autoregTarget, dir: suggestion.dir, reco: suggestion.reco })}
                    onUndo={async (original) => {
                      if (!original) return;
                      const { data: saved } = await supabase.from("sessions").update({ notes: original.notes, target_difficulty: original.target_difficulty }).eq("id", autoregTarget.id).select().single();
                      if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
                      setDecisionTick(t => t + 1);
                    }}
                  />
                );
              } else {
                alert = athleteAlertFor(wellnessToday?.score ?? null, maxDiff, wellnessFilledToday) ?? undefined;
              }
            }
            return (
              <div key={dstr} ref={el => { dayRefs.current[idx] = el; }}>
              <DroppableDay dstr={dstr}>
              <DayColumn
                date={date}
                sessions={sessions.filter(s => s.date === dstr)}
                wellness={wellnessList.find(w => w.date === dstr) ?? null}
                todayStr={todayStr}
                ctx={ctx}
                alert={alert}
                alertActions={alertActions}
                renderSession={(s) => (
                  <DraggableSessionCard
                    key={s.id}
                    session={s}
                    viewerRole="athlete"
                    onComplete={(sess) => handleTerminer(sess)}
                    onEdit={(sess) => setEditing(sess)}
                    onDuplicate={(sess) => setDuplicating(sess)}
                  />
                )}
                onAddSession={(d) => setAddingDate(d)}
                onComplete={(s) => handleTerminer(s)}
                onEdit={(s) => setEditing(s)}
                onDuplicate={(s) => setDuplicating(s)}
                onWellness={() => setShowWellness(true)}
              />
              </DroppableDay>
              </div>
            );
          })}
        </div>
        </DndContext>
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
                                onClick={e => { e.stopPropagation(); setEditing(s); }}
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
                              onClick={e => { e.stopPropagation(); setAddingDate(dstr); }}
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

      {/* Modals — ouverture toujours libre (voir onClick plus haut), seule la persistance réelle
          (onSave/onConfirm/onDuplicate/onDelete) est gatée derrière requireSubscription()
          (2026-08-19). */}
      {addingDate && (
        <AddSessionModal date={addingDate} userId={userId} userName={userName ?? "Toi"} onSave={data => requireSubscription(() => addSession(data))} onClose={() => setAddingDate(null)} />
      )}
      {showReconduire && (
        <ReconduireModal
          daySlots={dates.map(d => ({ sessions: sessions.filter(s => s.date === format(d, "yyyy-MM-dd")) }))}
          onClose={() => setShowReconduire(false)}
          onConfirm={weeksOut => requireSubscription(async () => {
            const inserts = weeksOut.flatMap((rows, w) => rows.map(r => ({
              user_id: userId,
              name: r.name,
              notes: r.notes,
              target_difficulty: r.target_difficulty,
              date: format(addDays(dates[r.dayIndex], 7 * (w + 1)), "yyyy-MM-dd"),
              done: false,
            })));
            const { data: saved } = await supabase.from("sessions").insert(inserts).select();
            if (saved) setSessions(prev => [...prev, ...(saved as Session[])]);
            setShowReconduire(false);
            if (inserts.length) handleDateChange(inserts[0].date);
            router.refresh();
          })}
        />
      )}
      {adjustCtx && (
        <AdjustSessionModal
          session={adjustCtx.session as AdjustSessionTarget}
          dir={adjustCtx.dir}
          reco={adjustCtx.reco}
          wellnessScore={wellnessList.find(w => w.date === todayStr)?.score ?? null}
          behaviors={wellnessList.find(w => w.date === todayStr)?.behaviors ?? []}
          advice={autoregAdvice(adjustCtx.dir, adjustCtx.session.target_difficulty ?? 6)}
          onClose={() => setAdjustCtx(null)}
          onConfirm={pct => requireSubscription(async () => {
            const notes = adjustCtx.session.notes ? adjustCtx.session.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : adjustCtx.session.notes;
            const target_difficulty = adjustDifficulty(adjustCtx.session.target_difficulty ?? 6, pct);
            const { data: saved } = await supabase.from("sessions").update({ notes, target_difficulty }).eq("id", adjustCtx.session.id).select().single();
            if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
            setAutoregDecision(adjustCtx.session.id, adjustCtx.dir, pct, { notes: adjustCtx.session.notes, target_difficulty: adjustCtx.session.target_difficulty });
            setDecisionTick(t => t + 1);
            setAdjustCtx(null);
          })}
        />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={data => requireSubscription(() => saveComplete(data))} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date} session={editing} userId={userId} userName={userName ?? "Toi"}
          onSave={data => requireSubscription(() => saveEdit(data))}
          onDelete={() => requireSubscription(() => deleteSession(editing))}
          onClose={() => setEditing(null)}
        />
      )}
      {duplicating && (
        <DuplicateModal session={duplicating} onDuplicate={date => requireSubscription(() => duplicateSession(date))} onClose={() => setDuplicating(null)} />
      )}
      {showWellness && (
        <WellnessModal date={todayStr} onSave={data => requireSubscription(() => saveWellness(data))} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); }} />
      )}
      {showLibrary && (
        <ProgramLibraryPage
          athletes={[]}
          selfUserId={userId}
          activeProgram={activeProgram}
          activeProgramWeek={activeProgramWeek}
          requireSubscription={requireSubscription}
          isActive={isActive}
          sandboxMode={sandboxMode}
          onClose={async () => { setShowLibrary(false); if (!sandboxMode) { await fetchActiveProgram(); router.refresh(); } }}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
        ) : (
          <PrimingJourneyModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
            onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
        )
      )}
      {!sandboxMode && paywallStep === "paywall" && (
        <PaywallModal mode="athlete" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
