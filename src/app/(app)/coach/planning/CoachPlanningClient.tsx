"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePaywall } from "@/hooks/usePaywall";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import WelcomeModal from "@/components/onboarding/WelcomeModal";

import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import PlanningRingShared from "@/components/calendar/PlanningRing";
import DiffGaugeShared from "@/components/calendar/DiffGauge";
import CoachSessionModal from "@/components/coach/CoachSessionModal";
import CoachCompleteModal from "@/components/coach/CoachCompleteModal";
import EmptySessionState from "@/components/sessions/EmptySessionState";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus } from "@/types";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function scoreColor(s: number | null) { if (s === null) return "#8a8f94"; return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }
function formLabel(s: number | null) { if (s === null) return "—"; return s >= 82 ? "Zone optimale" : s >= 65 ? "Zone stable" : s >= 45 ? "Zone prudente" : "Zone récupération"; }

function dayWellness(
  athlete: CoachAthlete,
  dateStr: string,
  wellnessMap: Record<string, Record<string, number>>
): number | null {
  if (athlete.user_id && wellnessMap[athlete.user_id]?.[dateStr] !== undefined) {
    return wellnessMap[athlete.user_id][dateStr];
  }
  const todayStr = new Date().toISOString().split("T")[0];
  if (!athlete.user_id && dateStr > todayStr) return null;
  return athlete.wellness_score;
}

function loadRule(sessions: CoachViewSession[]): { title: string; tag: string; text: string; cls: string } {
  const maxDiff = sessions.length ? Math.max(...sessions.map(s => s.target_difficulty ?? 6)) : 0;
  if (maxDiff >= 8) return { cls: "hard", tag: "Charge haute", title: "Séance dure isolée", text: "OK si elle reste isolée : garde la variation autour pour préserver la récupération." };
  if (maxDiff >= 5) return { cls: "moderate", tag: "Modérée", title: "Charge maîtrisable", text: "Enchaîner du modéré est acceptable si tu varies le stimulus." };
  if (maxDiff > 0) return { cls: "easy", tag: "Facile", title: "Variation utile", text: "Séance légère : bon tampon entre deux charges ou bon support technique." };
  return { cls: "rest", tag: "Libre", title: "Récupération", text: "Journée ouverte : elle crée de l'espace dans le bloc de charge." };
}

const ruleTagColors: Record<string, { bg: string; color: string }> = {
  hard: { bg: "#ffe9df", color: "#d44000" },
  moderate: { bg: "#fff1d8", color: "#b96500" },
  easy: { bg: "#e4f3e8", color: "#166534" },
  rest: { bg: "#e7e7e7", color: "#666" },
};

/* PlanningRing et DiffGauge — alias des composants partagés */
const PlanningRing = ({ score }: { score: number | null }) => <PlanningRingShared score={score} />;
const DiffGauge = DiffGaugeShared;

interface Props {
  userId: string;
  athletes: CoachAthlete[];
  initialSessions: CoachViewSession[];
  initialWellnessMap: Record<string, Record<string, number>>;
  subscriptionStatus: SubscriptionStatus;
}

export default function CoachPlanningClient({ userId, athletes, initialSessions, initialWellnessMap, subscriptionStatus }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const defaultAthleteId = searchParams.get("athlete") ?? athletes[0]?.id ?? "";
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedAthleteId, setSelectedAthleteId] = useState(defaultAthleteId);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [navKey, setNavKey] = useState(0);
  const slideDirRef  = useRef<"left" | "right">("left");
  const lastWheelNav = useRef(0);
  const calGridRef   = useRef<HTMLDivElement>(null);
  const dayRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const [sessions, setSessions] = useState<CoachViewSession[]>(initialSessions);
  const [wellnessMap, setWellnessMap] = useState(initialWellnessMap);
  const [monthSessions, setMonthSessions] = useState<CoachViewSession[]>([]);
  const [monthWellnessMap, setMonthWellnessMap] = useState<Record<string, Record<string, number>>>({});
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<CoachViewSession | null>(null);
  const [completing, setCompleting] = useState<CoachViewSession | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const id = searchParams.get("athlete");
    if (id && athletes.find(a => a.id === id)) setSelectedAthleteId(id);
  }, [searchParams, athletes]);

  useEffect(() => {
    const fromOnboarding = searchParams.get("welcome") === "1";
    const alreadySeen = localStorage.getItem(`welcome_shown_coach_${userId}`);
    if (fromOnboarding && !alreadySeen) setShowWelcome(true);
  }, [userId, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const athlete = athletes.find(a => a.id === selectedAthleteId) ?? athletes[0] ?? null;

  // Realtime: sync athlete's sessions and wellness as they change
  useEffect(() => {
    if (!athlete?.user_id) return;
    const uid = athlete.user_id;

    const channel = supabase
      .channel(`coach-watch-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${uid}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const s = realToView(payload.new as Session, athletes);
            if (s.athlete_id) setSessions(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s]);
          } else if (payload.eventType === "UPDATE") {
            const s = realToView(payload.new as Session, athletes);
            setSessions(prev => prev.map(x => x.id === s.id ? { ...s, athlete_id: x.athlete_id } : x));
          } else if (payload.eventType === "DELETE") {
            setSessions(prev => prev.filter(x => x.id !== (payload.old as any).id));
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.score != null) {
            setWellnessMap(prev => ({
              ...prev,
              [uid]: { ...(prev[uid] ?? {}), [row.date]: row.score },
            }));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [athlete?.user_id]);

  const weekStart = startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    const mon = format(startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const sun = format(addDays(startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 }), 6), "yyyy-MM-dd");

    const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
    const allAthleteIds = athletes.map(a => a.id);

    const [realRes, coachRes, wellnessRes] = await Promise.all([
      realUserIds.length
        ? supabase.from("sessions").select("*").in("user_id", realUserIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
      allAthleteIds.length
        ? supabase.from("coach_sessions").select("*").eq("coach_id", userId).in("athlete_id", allAthleteIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
      realUserIds.length
        ? supabase.from("wellness_daily").select("user_id, date, score").in("user_id", realUserIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
    ]);

    const newSessions: CoachViewSession[] = [
      ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
      ...(coachRes.data || []).map(s => demoToView(s as CoachSession)),
    ];

    setSessions(prev => {
      const out = prev.filter(s => s.date < mon || s.date > sun);
      return [...out, ...newSessions];
    });

    const newWellness = buildWellnessMap(
      (wellnessRes.data || []) as { user_id: string; date: string; score: number | null }[]
    );
    setWellnessMap(prev => {
      const merged = { ...prev };
      for (const uid of Object.keys(newWellness)) {
        merged[uid] = { ...(merged[uid] ?? {}), ...newWellness[uid] };
      }
      return merged;
    });
  }

  const dotMap = (() => {
    if (!athlete) return {};
    const map: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
    weekDates.forEach(d => {
      const dstr = format(d, "yyyy-MM-dd");
      const ds = sessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
      const charge = ds.filter(s => s.done && s.rpe && s.duration).reduce((a, s) => a + s.rpe! * s.duration!, 0);
      if (charge > 600) map[dstr] = "done-high";
      else if (charge > 300) map[dstr] = "done-med";
      else if (charge > 0) map[dstr] = "done-light";
      else if (ds.some(s => !s.done)) map[dstr] = "planned";
    });
    return map;
  })();

  async function callSessionAPI(body: object): Promise<{ ok: boolean; session?: any; _real?: boolean }> {
    const res = await fetch("/api/coach/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }, athleteIds: string[]) => {
    const results = await Promise.all(
      athleteIds.map(aid => callSessionAPI({ action: "add", athleteId: aid, data }))
    );
    const newSessions: CoachViewSession[] = results
      .filter(r => r.ok && r.session)
      .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
    setSessions(prev => [...prev, ...newSessions]);
    setAddingDate(null);
  }, [athletes]);

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }, athleteIds: string[]) => {
    if (!editingSession || !athlete) return;
    const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: editingSession.id, data });
    if (result.ok) {
      const updated: CoachViewSession = { ...editingSession, ...data };
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    const extras = athleteIds.filter(id => id !== athlete.id);
    if (extras.length > 0) {
      const results = await Promise.all(extras.map(aid => callSessionAPI({ action: "add", athleteId: aid, data })));
      const newSessions: CoachViewSession[] = results
        .filter(r => r.ok && r.session)
        .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
      setSessions(prev => [...prev, ...newSessions]);
    }
    setEditingSession(null);
  }, [editingSession, athlete, athletes]);

  const deleteSession = useCallback(async () => {
    if (!editingSession || !athlete) return;
    await callSessionAPI({ action: "delete", athleteId: athlete.id, sessionId: editingSession.id });
    setSessions(prev => prev.filter(s => s.id !== editingSession.id));
    setEditingSession(null);
  }, [editingSession, athlete]);

  const completeSession = useCallback(async (data: { rpe: number; duration: number }) => {
    if (!completing || !athlete) return;
    const result = await callSessionAPI({ action: "complete", athleteId: athlete.id, sessionId: completing.id, data });
    if (result.ok) {
      const updated: CoachViewSession = { ...completing, done: true, rpe: data.rpe, duration: data.duration };
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    setCompleting(null);
  }, [completing, athlete]);

  async function loadMonth(anchor: string, athleteObj: CoachAthlete) {
    const base = new Date(anchor + "T12:00:00");
    const start = format(startOfMonth(base), "yyyy-MM-dd");
    const end = format(endOfMonth(base), "yyyy-MM-dd");

    if (athleteObj.user_id) {
      const [realRes, demoRes, wellRes] = await Promise.all([
        supabase.from("sessions").select("*").eq("user_id", athleteObj.user_id).gte("date", start).lte("date", end),
        supabase.from("coach_sessions").select("*").eq("coach_id", userId).eq("athlete_id", athleteObj.id).gte("date", start).lte("date", end),
        supabase.from("wellness_daily").select("date, score").eq("user_id", athleteObj.user_id).gte("date", start).lte("date", end),
      ]);
      const unified: CoachViewSession[] = [
        ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
        ...(demoRes.data || []).map(s => demoToView(s as CoachSession)),
      ];
      setMonthSessions(unified);
      const wm: Record<string, Record<string, number>> = {};
      (wellRes.data || []).forEach((w: { date: string; score: number | null }) => {
        if (w.score != null) {
          if (!wm[athleteObj.user_id!]) wm[athleteObj.user_id!] = {};
          wm[athleteObj.user_id!][w.date] = w.score;
        }
      });
      setMonthWellnessMap(wm);
    } else {
      const { data } = await supabase.from("coach_sessions").select("*").eq("coach_id", userId).eq("athlete_id", athleteObj.id).gte("date", start).lte("date", end);
      setMonthSessions((data || []).map(s => demoToView(s as CoachSession)));
      setMonthWellnessMap({});
    }
  }

  function navigatePeriod(dir: "next" | "prev") {
    slideDirRef.current = dir === "next" ? "left" : "right";
    setNavKey(k => k + 1);
    const base = new Date(selectedDate + "T12:00:00");
    const newBase = viewMode === "week"
      ? (dir === "next" ? addDays(base, 7) : subDays(base, 7))
      : (dir === "next" ? addMonths(base, 1) : subMonths(base, 1));
    handleDateChange(format(newBase, "yyyy-MM-dd"));
  }

  useEffect(() => {
    if (viewMode !== "week") return;
    const todayIdx = weekDates.findIndex(d => format(d, "yyyy-MM-dd") === todayStr);
    if (todayIdx >= 0) {
      dayRefs.current[todayIdx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    const el = calGridRef.current;
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

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "month" && athlete) loadMonth(selectedDate, athlete);
  }

  const coachWellnessHeader: Record<string, number | null> = {};
  if (athlete?.user_id) {
    const aw = wellnessMap[athlete.user_id] ?? {};
    weekDates.forEach(d => {
      const iso = format(d, "yyyy-MM-dd");
      coachWellnessHeader[iso] = aw[iso] ?? null;
    });
  }

  if (!athlete) {
    return (
      <>
        <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} wellnessMap={coachWellnessHeader} viewMode={viewMode} onViewModeChange={handleViewModeChange} onSwipe={navigatePeriod} />
        <div className="page-shell" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#171b1f", marginBottom: 16 }}>Aucun sportif encore</div>
          <button onClick={() => router.push("/coach/athletes")}
            style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}>
            Ajouter un sportif →
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={coachWellnessHeader} viewMode={viewMode} onViewModeChange={handleViewModeChange} onSwipe={navigatePeriod} />

      <div style={{ padding: isLg ? "12px 40px 0" : isMd ? "12px 24px 0" : "12px 16px 0", maxWidth: isLg ? 1000 : isMd ? 720 : 600, margin: "0 auto" }}>
        <div style={{
          position: "relative", overflow: "hidden",
          background: "linear-gradient(135deg,#111 0%,#303030 70%,#151515 100%)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 22, padding: 16,
          boxShadow: "0 18px 44px rgba(0,0,0,.20)",
          marginBottom: 12,
        }}>
          <div style={{ position: "absolute", right: -52, top: -52, width: 180, height: 180, borderRadius: "50%", background: "rgba(212,64,0,.24)", filter: "blur(18px)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ fontSize: 32, fontWeight: 1000, letterSpacing: "-0.05em", lineHeight: 1.02, color: "#fff", marginBottom: 6 }}>
              Planning · {athlete.name}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.78)" }}>
              Charge prévue, wellness et séances individuelles.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <select
            value={selectedAthleteId}
            onChange={e => setSelectedAthleteId(e.target.value)}
            style={{ flex: 1, background: "#fff", border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, padding: "10px 14px", fontSize: 14, fontWeight: 700, color: "#171b1f", fontFamily: "inherit", outline: "none", cursor: "pointer" }}
          >
            {athletes.map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.sport}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state — aucune séance cette semaine pour cet athlète */}
      {viewMode === "week" && athlete && sessions.filter(s => s.athlete_id === athlete.id).length === 0 && (
        <div style={{ padding: isMd ? "0 24px 4px" : "0 16px 4px" }}>
          <EmptySessionState
            sport={athlete.sport}
            label={`Créer une séance pour ${athlete.name}`}
            onAdd={() => requireSubscription(() => setAddingDate(todayStr))}
          />
        </div>
      )}

      <div ref={calGridRef}>
      <div key={`cal-${navKey}`} style={{
        animation: navKey > 0
          ? `${slideDirRef.current === "left" ? "calSlideFromRight" : "calSlideFromLeft"} 220ms ease-out`
          : undefined,
      }}>

      {/* ── Vue mois coach ── */}
      {viewMode === "month" && athlete && (() => {
        const anchor = new Date(selectedDate + "T12:00:00");
        const weeks = eachWeekOfInterval(
          { start: startOfMonth(anchor), end: endOfMonth(anchor) },
          { weekStartsOn: 1 }
        );
        const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
        return (
          <div style={{ padding: isMd ? "14px 24px 100px" : "8px 8px 100px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: 4 }}>
              {dayLabels.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 2 }}>
                  {isMd ? d : d[0]}
                </div>
              ))}
            </div>
            {weeks.map(weekMonday => (
              <div key={weekMonday.toISOString()} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: isMd ? 4 : 2 }}>
                {Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)).map(date => {
                  const dstr = format(date, "yyyy-MM-dd");
                  const isToday = dstr === todayStr;
                  const inMonth = date.getMonth() === anchor.getMonth();
                  const daySessions = monthSessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
                  const wellScore = dayWellness(athlete, dstr, monthWellnessMap);

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
                          {inMonth && <PlanningRingShared score={wellScore} size={44} />}
                        </div>
                      )}

                      {/* Mobile : numéro + ring empilés, dots dessous */}
                      {!isMd && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: "-0.04em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1, textAlign: "center", marginBottom: 4 }}>
                            {date.getDate()}
                          </div>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                            {inMonth
                              ? <PlanningRingShared score={wellScore} size={40} />
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
                                onClick={e => { e.stopPropagation(); requireSubscription(() => setEditingSession(s)); }}
                                style={{ background: "#f7f8f9", borderRadius: 8, padding: "4px 6px", marginBottom: 3, cursor: "pointer" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name}</div>
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
                              style={{ marginTop: "auto", border: "0.5px dashed rgba(212,64,0,.28)", borderRadius: 7, textAlign: "center", fontSize: 11, color: "#d44000", cursor: "pointer", fontWeight: 700, padding: "4px 2px" }}
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

      {/* 7-column scrollable grid — semaine */}
      {viewMode === "week" && <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
        gap: isMd ? 12 : 10,
        overflowX: "auto",
        padding: isMd ? "14px 24px 18px" : "14px 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
      }}>
        {weekDates.map((date, idx) => {
          const dstr = format(date, "yyyy-MM-dd");
          const isToday = dstr === todayStr;
          const daySessions = sessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
          const wellness = dayWellness(athlete, dstr, wellnessMap);
          const rule = loadRule(daySessions);
          const tagColor = ruleTagColors[rule.cls];

          return (
            <div key={dstr} ref={el => { dayRefs.current[idx] = el; }} className="week-col-width" style={{
              background: "#fff",
              border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,0.08)",
              borderRadius: 26, padding: 16,
              boxShadow: isToday ? "0 0 0 0 transparent, 0 8px 24px rgba(212,64,0,.08)" : "0 6px 18px rgba(0,0,0,0.05)",
              scrollSnapAlign: "start",
            }}>
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
                <PlanningRing score={wellness} />
              </div>

              <div style={{ fontSize: 10, fontWeight: 800, color: scoreColor(wellness), marginBottom: 8 }}>
                {formLabel(wellness)}
              </div>

              <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                  <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
                    {rule.tag}
                  </div>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
              </div>

              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                Séances · {daySessions.length}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {daySessions.length === 0 && (
                  <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
                    Repos / libre
                  </div>
                )}
                {daySessions.map(s => {
                  const gaugeValue = s.done ? s.rpe : s.target_difficulty;
                  return (
                    <div key={s.id}
                      style={{ border: s.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)", background: "#fff", borderRadius: 14, padding: "10px 11px", cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.045)" }}
                      onClick={() => requireSubscription(() => setEditingSession(s))}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word" }}>
                          {s.name}
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: s.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,0.10)", color: s.done ? "#2f9e44" : "#d44000" }}>
                          {s.done ? "Terminé" : "Prévu"}
                        </span>
                      </div>
                      {gaugeValue && <DiffGauge value={gaugeValue} height={10} />}
                      {s.notes && (
                        <div style={{ marginTop: 7, borderRadius: 10, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
                          {s.notes.split("\n").filter(Boolean).map((ex, i) => (
                            <div key={i} style={{ padding: "6px 9px", fontSize: 11, lineHeight: 1.4, color: "#2c3236", fontWeight: 600, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                              {ex}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 5, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setCompleting(s)} style={{ flex: 1, height: 32, borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer", background: s.done ? "#fff" : "linear-gradient(180deg,#f04a08,#d44000)", color: s.done ? "#171b1f" : "#fff", border: s.done ? "1px solid rgba(0,0,0,.10)" : "none", boxShadow: s.done ? "none" : "0 4px 12px rgba(212,64,0,.20)" }}>
                          {s.done ? "Résultat" : "Terminer"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div onClick={() => requireSubscription(() => setAddingDate(dstr))}
                  style={{ border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 10, padding: "9px 8px", textAlign: "center", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                  + Ajouter une séance
                </div>
              </div>
            </div>
          );
        })}
      </div>}

      {(addingDate || editingSession) && athlete && (
        <CoachSessionModal
          athleteName={athlete.name}
          date={addingDate ?? editingSession!.date}
          session={editingSession ? {
            id: editingSession.id,
            coach_id: userId,
            athlete_id: editingSession.athlete_id,
            date: editingSession.date,
            name: editingSession.name,
            notes: editingSession.notes,
            done: editingSession.done,
            rpe: editingSession.rpe,
            duration: editingSession.duration,
            target_difficulty: editingSession.target_difficulty,
            created_at: editingSession.created_at,
          } : null}
          athletes={athletes}
          initialAthleteId={athlete.id}
          onSave={editingSession ? saveEdit : addSession}
          onDelete={editingSession ? deleteSession : undefined}
          onClose={() => { setAddingDate(null); setEditingSession(null); }}
        />
      )}

      </div>{/* animation wrapper */}
      </div>{/* calGridRef */}

      {showWelcome && (
        <WelcomeModal mode="coach" onClose={() => { localStorage.setItem(`welcome_shown_coach_${userId}`, "1"); setShowWelcome(false); }} />
      )}
      {paywallStep === "priming" && (
        <PrimingJourneyModal mode="coach" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
          onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
      )}
      {paywallStep === "paywall" && (
        <PaywallModal mode="coach" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}

      {completing && athlete && (
        <CoachCompleteModal
          session={{
            id: completing.id,
            coach_id: userId,
            athlete_id: completing.athlete_id,
            date: completing.date,
            name: completing.name,
            notes: completing.notes,
            done: completing.done,
            rpe: completing.rpe,
            duration: completing.duration,
            target_difficulty: completing.target_difficulty,
            created_at: completing.created_at,
          }}
          athleteName={athlete.name}
          onSave={completeSession}
          onClose={() => setCompleting(null)}
        />
      )}
    </>
  );
}
