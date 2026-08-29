"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore, zoneLabel as formLabel, getRecoveryAdvice, computeFatigueImpact, computeDisplayScore, wellnessColor } from "@/lib/wellness";
import { loadRule, type LoadContext } from "@/lib/loadRule";
import { dailyLoad } from "@/lib/trainingLoad";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import EmptySessionState from "@/components/sessions/EmptySessionState";
import { hasUnseenAttachment } from "@/components/sessions/UnseenDot";
import { DraggableExerciseLine } from "@/components/calendar/DraggablePlanning";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import ShareButton from "@/components/sessions/ShareButton";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, suggestionSeverityColor } from "@/lib/autoregulation";
import AlertBox from "@/components/calendar/AlertBox";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import type { Profile, WellnessDaily, Session, SubscriptionStatus, ExerciseAttachments } from "@/types";
import { BEHAVIOR_META } from "@/lib/behaviors";

const WellnessModal = dynamic(() => import("@/components/wellness/WellnessModal"));
const AddSessionModal = dynamic(() => import("@/components/sessions/AddSessionModal"));
const CompleteModal = dynamic(() => import("@/components/sessions/CompleteModal"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));

/* ─── helpers ─── */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

// Dégradé séquentiel bleu (wellnessColor, src/lib/wellness.ts) — voir SparkLineClient.tsx pour la
// doc complète du choix (magnitude continue, pas un état catégoriel).
function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return wellnessColor(score);
}

function buildDotMap(sessions: Session[], anchor: string) {
  const map: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
  const weekStart = startOfWeek(new Date(anchor + "T12:00:00"), { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    const d = format(addDays(weekStart, i), "yyyy-MM-dd");
    const charge = dailyLoad(sessions.filter((s) => s.date === d));
    if (charge > 600) map[d] = "done-high";
    else if (charge > 300) map[d] = "done-med";
    else if (charge > 0) map[d] = "done-light";
    else if (sessions.some((s) => s.date === d && !s.done)) map[d] = "planned";
  }
  return map;
}

/* ─── WellnessRing inline (responsive size) ─── */
function WellnessRingPOC({ score, size = 104 }: { score: number | null; size?: number }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  const r = Math.round(size * 0.423);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const color = scoreColor(score);
  const sw = Math.round(size * 0.077);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={animated ? offset : circ} strokeLinecap="round"
          style={{ transition: "all 0.6s cubic-bezier(0.2,0,0.38,0.9)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.307), fontWeight: 1000, color, lineHeight: 1, letterSpacing: "-0.055em" }}>
          {score !== null ? score : "—"}
        </span>
        <span style={{ fontSize: Math.round(size * 0.077), fontWeight: 1000, color: "rgba(255,255,255,0.58)", letterSpacing: "0.14em", marginTop: 2, textTransform: "uppercase" }}>
          wellness
        </span>
      </div>
    </div>
  );
}

/* ─── Difficulty gauge (v46 POC — no label, single) ─── */
function DiffGauge({ value, height = 12 }: { value: number | null; height?: number }) {
  if (!value) return null;
  const cls = value >= 8 ? "hard" : value >= 5 ? "moderate" : "easy";
  const bg: Record<string, string> = {
    hard: "linear-gradient(90deg,#ffb5a7,#d44000)",
    moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)",
    easy: "linear-gradient(90deg,#bfeec8,#2f9e44)",
  };
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ width: "100%", height, borderRadius: 999, background: "#e7e4df", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${w}%`, background: bg[cls], transition: "width .22s ease" }} />
    </div>
  );
}

/* ─── Today session card (v59 POC exact layout) ─── */
function TodaySessionCard({ session, onComplete, onEdit, onDelete, previewPct, onReorderExercises, authorName }: {
  session: Session;
  onComplete: (s: Session) => void;
  onEdit: (s: Session) => void;
  onDelete: (s: Session) => void;
  authorName: string;
  /* Décharge/surcharge en cours de sélection ou déjà appliquée (autorégulation) — surligne en
     orange les lignes réellement modifiées, undefined/null partout ailleurs (comportement inchangé). */
  previewPct?: number | null;
  /* Drag & drop des exercices — même composant/geste que /week et /coach/planning
     (DraggableExerciseLine, DraggablePlanning.tsx). DndContext scopé à cette carte (une seule
     séance ici, contrairement au Planning qui en gère plusieurs sur une grille de jours). */
  onReorderExercises: (sessionId: string, fromIdx: number, toIdx: number) => void;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);
  const exerciseSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function handleExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    const overData = over.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    if (activeData?.type !== "exercise" || overData?.type !== "exercise" || overData.sessionId !== activeData.sessionId) return;
    onReorderExercises(activeData.sessionId!, activeData.index!, overData.index!);
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
      onClick={() => onEdit(session)}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 1000, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.04em" }}>
          {session.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
            background: session.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,0.10)",
            color: session.done ? "#2f9e44" : "#d44000",
          }}>
            {session.done ? "Terminé" : "Prévu"}
          </span>
          <ShareButton
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
          />
        </div>
      </div>

      {/* 2. Single difficulty gauge — no label */}
      {gaugeValue && (
        <div style={{ marginBottom: 12 }}>
          <DiffGauge value={gaugeValue} height={12} />
        </div>
      )}

      {/* 3. Exercise display list — drag & drop, même composant que /week et /coach/planning */}
      {exercises.length > 0 && (
        <div style={{ marginBottom: 12, border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden" }}>
          <DndContext sensors={exerciseSensors} onDragEnd={handleExerciseDragEnd}>
            {exercises.map((ex, i) => {
              const modified = previewPct != null ? parseAndApply(ex, previewPct) : ex;
              const unseen = hasUnseenAttachment(session.exercise_media?.[String(i)], "athlete", session.viewed_by_athlete_at);
              return (
                <DraggableExerciseLine key={i} sessionId={session.id} index={i} text={modified} originalText={ex} unseen={unseen} />
              );
            })}
          </DndContext>
        </div>
      )}

      {/* 4. Stats grid (MIN + DIFF.) — only when done */}
      {session.done && (session.duration || session.rpe) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {session.duration && (
            <div style={{ background: "#f7f8f9", borderRadius: 14, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.04em", lineHeight: 1 }}>{session.duration}</div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>MIN</div>
            </div>
          )}
          {session.rpe && (
            <div style={{ background: "#f7f8f9", borderRadius: 14, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.04em", lineHeight: 1 }}>{session.rpe}</div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>DIFF.</div>
            </div>
          )}
        </div>
      )}

      {/* 5. Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        <button
          data-tour="terminer-btn"
          onClick={() => onComplete(session)}
          style={{
            flex: 1, height: 46, borderRadius: 14, fontSize: 14, fontWeight: 800, cursor: "pointer",
            background: session.done ? "#fff" : "linear-gradient(180deg,#f04a08,#d44000)",
            color: session.done ? "#171b1f" : "#fff",
            border: session.done ? "1px solid rgba(0,0,0,.10)" : "none",
            boxShadow: session.done ? "none" : "0 8px 20px rgba(212,64,0,.22)",
          }}
        >
          {session.done ? "Résultat" : "Terminer"}<span className="tour-lock">🔒</span>
        </button>
        <button
          onClick={() => onDelete(session)}
          style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: "rgba(0,0,0,0.04)", color: "#8a8f94",
            border: "1px solid rgba(0,0,0,.08)", cursor: "pointer",
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
interface Props {
  userId: string;
  profile: Profile;
  initialDate: string;
  initialWellness: WellnessDaily | null;
  initialSessions: Session[];
  subscriptionStatus: SubscriptionStatus;
  hasCoach?: boolean;
  /* Distinct de hasCoach (qui reste "un coach existe", utilisé pour le rattrapage d'invitation
     plus bas) — hasActiveCoach = "ce coach paie", seule condition qui débloque un accès gratuit
     réel désormais (voir src/lib/access.ts, 2026-08-19). */
  hasActiveCoach?: boolean;
  activeProgram?: { start_date: string; name: string } | null;
  /* Sandbox uniquement (2026-08-19) : quand true, remplace usePaywall par useSandboxGate (même
     interface, destination = signup au lieu de priming/paywall) et neutralise les effets qui
     rafraîchiraient les données via Supabase (le fixture initial couvre déjà toute la fenêtre
     navigable, voir sandboxWellnessByDate). Aucun impact sur l'app réelle (prop absente partout
     ailleurs). */
  sandboxMode?: boolean;
  sandboxWellnessByDate?: Record<string, WellnessDaily>;
}

export default function TodayClient({ userId, profile, initialDate, initialWellness, initialSessions, subscriptionStatus, hasCoach = false, hasActiveCoach = false, activeProgram, sandboxMode = false, sandboxWellnessByDate }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [wellness, setWellness] = useState<WellnessDaily | null>(initialWellness);
  const [allSessions, setAllSessions] = useState<Session[]>(initialSessions);
  const [weekWellnessMap, setWeekWellnessMap] = useState<Record<string, number | null>>({
    [initialDate]: initialWellness?.score ?? null,
  });

  const prevWeekRef = useRef("");

  // Rattrape une invitation coach en attente pour un compte déjà inscrit (créée après
  // l'onboarding, jamais consommée sinon — /api/invite/link n'était appelé qu'à l'inscription)
  useEffect(() => {
    if (sandboxMode || hasCoach) return;
    fetch("/api/invite/link", { method: "POST" })
      .then(r => r.json())
      .then(d => { if (d.ok) router.refresh(); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recharge wellness + sessions quand on change de semaine — pas en sandbox (le fixture initial
  // couvre déjà toute la fenêtre navigable, voir sandboxFixtures.ts, aucune donnée réelle à aller
  // chercher pour un userId fictif).
  useEffect(() => {
    if (sandboxMode) return;
    const weekStart = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (weekStart === prevWeekRef.current) return;
    prevWeekRef.current = weekStart;
    const dates = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(weekStart + "T12:00:00"), i), "yyyy-MM-dd"));
    const sun = dates[6];
    Promise.all([
      supabase.from("wellness_daily").select("date, score").eq("user_id", userId).in("date", dates),
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", weekStart).lte("date", sun).order("created_at"),
    ]).then(([{ data: wellData }, { data: sessData }]) => {
      const map: Record<string, number | null> = {};
      dates.forEach(d => { map[d] = null; });
      (wellData ?? []).forEach((w: { date: string; score: number | null }) => { map[w.date] = w.score; });
      setWeekWellnessMap(prev => ({ ...prev, ...map }));
      if (sessData) setAllSessions(prev => [...prev.filter(s => s.date < weekStart || s.date > sun), ...(sessData as Session[])]);
    });
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigatePeriod(dir: "next" | "prev") {
    const newDate = format(
      dir === "next" ? addDays(new Date(selectedDate + "T12:00:00"), 7) : subDays(new Date(selectedDate + "T12:00:00"), 7),
      "yyyy-MM-dd"
    );
    handleDateChange(newDate);
  }

  const [showWellness, setShowWellness] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [addSessionInitialName, setAddSessionInitialName] = useState<string | undefined>(undefined);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [pendingCompleteSession, setPendingCompleteSession] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [autoregPreview, setAutoregPreview] = useState<{ sessionId: string; pct: number } | null>(null);

  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(`activation_shown_athlete_${userId}`)) { setShowActivation(true); posthog.capture("activation_banner_viewed", { mode: "athlete" }); }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref pour les closures realtime (évite staleness sur selectedDate)
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // Realtime — sessions + wellness_daily
  useEffect(() => {
    const sessionsCh = supabase
      .channel(`today-sessions-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const s = payload.new as Session;
          setAllSessions(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s]);
        } else if (payload.eventType === "UPDATE") {
          setAllSessions(prev => prev.map(s => s.id === (payload.new as Session).id ? payload.new as Session : s));
        } else if (payload.eventType === "DELETE") {
          setAllSessions(prev => prev.filter(s => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    const wellnessCh = supabase
      .channel(`today-wellness-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const w = payload.new as WellnessDaily;
          if (w.date === selectedDateRef.current) {
            setWellness(w);
            setWeekWellnessMap(prev => ({ ...prev, [w.date]: w.score }));
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsCh);
      supabase.removeChannel(wellnessCh);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaySessions = allSessions.filter((s) => s.date === selectedDate);
  const weekStart = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(weekStart + "T12:00:00"), 6), "yyyy-MM-dd");
  const weekSessions = allSessions.filter(s => s.date >= weekStart && s.date <= weekEnd);
  const score = wellness?.score ?? null;
  const wellnessFilledToday = wellness !== null && wellness.bedtime != null;
  const doneToday = todaySessions.filter(s => s.done && s.rpe && s.duration);
  const impacts = doneToday.map(s => computeFatigueImpact(s.rpe!, s.duration!));
  const displayScore = wellnessFilledToday && score !== null ? computeDisplayScore(score, impacts) : null;
  const displayWellness = wellnessFilledToday ? wellness : null;
  /* Hissé ici (au lieu de recalculé dans l'IIFE plus bas) pour être accessible à la fois par la
     carte "Score & conseils" (halo pulsant sur le CONTOUR de la carte, même mécanisme que Coach
     Control/CoachAthleteCard.tsx — un seul signal de mouvement, pas un 2e sur l'encart interne) et
     par l'encart lui-même. */
  const autoregTargetTop = [...todaySessions].filter(s => !s.done)
    .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  const wellnessCardSuggestion = wellnessFilledToday && autoregTargetTop
    ? computeAutoregSuggestion(displayScore, autoregTargetTop.target_difficulty)
    : null;
  const wellnessCardBadgeColor = wellnessCardSuggestion ? suggestionSeverityColor(wellnessCardSuggestion) : "#d44000";
  const yesterdayDate = format(subDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd");
  const tomorrowDate = format(addDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd");
  const yesterdaySessions = allSessions.filter(s => s.date === yesterdayDate);
  const tomorrowSessions = allSessions.filter(s => s.date === tomorrowDate);
  const loadCtx: LoadContext = {
    prevMax: yesterdaySessions.length ? Math.max(...yesterdaySessions.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
    nextMax: tomorrowSessions.length ? Math.max(...tomorrowSessions.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
  };
  const rule = loadRule(todaySessions, loadCtx);
  const advice = {
    training: `${rule.title}. ${rule.text}`,
    recovery: getRecoveryAdvice(displayWellness, rule.cls),
  };
  const dotMap = buildDotMap(allSessions, selectedDate);

  useEffect(() => {
    const key = `wellness_prompted_${initialDate}`;
    if (
      subscriptionStatus !== "free" &&
      subscriptionStatus !== "expired" &&
      !wellnessFilledToday &&
      !sessionStorage.getItem(key)
    ) {
      sessionStorage.setItem(key, "1");
      setShowWellness(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    if (sandboxMode) {
      setWellness(sandboxWellnessByDate?.[date] ?? null);
      return;
    }
    const [{ data: w }] = await Promise.all([
      supabase.from("wellness_daily").select("*").eq("user_id", userId).eq("date", date).maybeSingle(),
    ]);
    setWellness(w ?? null);
  }

  const saveWellness = useCallback(async (data: {
    sleep: number; stress: number; recovery: number; motivation: number;
    behaviors: string[]; bedtime: string; base_score: number; score: number;
  }) => {
    const { data: saved } = await supabase
      .from("wellness_daily")
      .upsert({ user_id: userId, date: selectedDate, ...data }, { onConflict: "user_id,date" })
      .select().single();
    if (saved) {
      setWellness(saved as WellnessDaily);
      setWeekWellnessMap(prev => ({ ...prev, [selectedDate]: (saved as WellnessDaily).score }));
    }
    setShowWellness(false);
    if (pendingCompleteSession) {
      const pending = pendingCompleteSession;
      setPendingCompleteSession(null);
      setCompleting(pending);
    }
    router.refresh();
  }, [supabase, userId, selectedDate, router, pendingCompleteSession]);

  function handleTerminer(session: Session) {
    if (!wellnessFilledToday) {
      setPendingCompleteSession(session);
      setShowWellness(true);
    } else {
      setCompleting(session);
    }
  }

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }) => {
    const { data: saved } = await supabase
      .from("sessions").insert({ user_id: userId, ...data, done: false }).select().single();
    if (saved) setAllSessions((prev) => [...prev, saved as Session]);
    setShowAddSession(false);
    setAddSessionInitialName(undefined);
    router.refresh();
  }, [supabase, userId, router]);

  const saveComplete = useCallback(async (data: { rpe: number; duration: number }) => {
    if (!completing) return;
    const { data: saved } = await supabase
      .from("sessions").update({ done: true, ...data }).eq("id", completing.id).select().single();
    if (saved) setAllSessions((prev) => prev.map((s) => s.id === saved.id ? saved as Session : s));
    setCompleting(null);
    router.refresh();
  }, [supabase, completing, router]);

  const deleteSession = useCallback(async (session: Session) => {
    await supabase.from("sessions").delete().eq("id", session.id);
    setAllSessions((prev) => prev.filter((s) => s.id !== session.id));
    router.refresh();
  }, [supabase, router]);

  // Réordonner les exercices d'une séance par drag & drop — même mécanique que WeekClient.tsx
  // (reorderExercises), pour que /today utilise le même composant/geste que le Planning.
  const reorderTodayExercises = useCallback(async (sessionId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const target = allSessions.find(s => s.id === sessionId);
    if (!target || !target.notes) return;
    const lines = target.notes.split("\n").filter(Boolean);
    if (fromIdx < 0 || fromIdx >= lines.length || toIdx < 0 || toIdx >= lines.length) return;
    const [moved] = lines.splice(fromIdx, 1);
    lines.splice(toIdx, 0, moved);
    const newNotes = lines.join("\n");
    const prevNotes = target.notes;
    setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: newNotes } : s));
    const { error } = await supabase.from("sessions").update({ notes: newNotes }).eq("id", sessionId);
    if (error) setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: prevNotes } : s));
  }, [supabase, allSessions]);

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }) => {
    if (!editing) return;
    const { data: saved } = await supabase
      .from("sessions").update(data).eq("id", editing.id).select().single();
    if (saved) setAllSessions((prev) => prev.map((s) => s.id === saved.id ? saved as Session : s));
    setEditing(null);
    router.refresh();
  }, [supabase, editing, router]);

  const ringSize = isLg ? 120 : isMd ? 112 : 96;
  const pad = isLg ? 32 : isMd ? 24 : 16;

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={weekWellnessMap} onSwipe={navigatePeriod} />

      <div style={{ padding: `14px ${pad}px 18px`, maxWidth: isLg ? 1000 : isMd ? 720 : "100%", margin: "0 auto" }}>

        {/* ── Welcome handled by overlay modal below ── */}

        {/* ── Bandeau d'activation (J0) ── */}
        {showActivation && (() => {
          const dismissActivation = () => { localStorage.setItem(`activation_shown_athlete_${userId}`, "1"); setShowActivation(false); };
          const todaySession = allSessions.find(s => s.date === initialDate && !s.done);
          const weekStart = format(startOfWeek(new Date(initialDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
          const weekEnd = format(addDays(new Date(weekStart + "T12:00:00"), 6), "yyyy-MM-dd");
          const hasWeekSession = allSessions.some(s => s.date >= weekStart && s.date <= weekEnd);
          const programPending = !todaySession && !hasWeekSession && !!activeProgram
            && new Date(activeProgram.start_date + "T12:00:00").getTime() > Date.now();
          const programStartLabel = programPending
            ? new Date(activeProgram!.start_date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
            : null;
          return (
            <div data-tour="activation-banner" style={{ background: "#fff", borderRadius: 24, padding: "18px 18px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.08)", border: "1px solid rgba(212,64,0,.14)", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 4 }}>
                Ton espace est prêt, à toi de jouer 💪
              </div>
              <div style={{ fontSize: 12, color: "#62686e", marginBottom: 14, lineHeight: 1.5 }}>
                {todaySession ? `Séance du jour : ${todaySession.name}` : hasWeekSession ? "Tes séances de la semaine sont planifiées." : programPending ? `Ta semaine 1 démarre ${programStartLabel}.` : "Lance-toi dès maintenant."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const ctaType = todaySession ? "start_session" : hasWeekSession ? "view_planning" : programPending ? "view_week1" : "add_session";
                    posthog.capture("activation_banner_cta_clicked", { mode: "athlete", cta_type: ctaType });
                    dismissActivation();
                    if (todaySession) handleTerminer(todaySession);
                    else if (hasWeekSession) router.push(sandboxMode ? "/sandbox/athlete/week" : "/week");
                    else if (programPending) router.push(sandboxMode ? "/sandbox/athlete/week" : `/week?date=${activeProgram!.start_date}`);
                    else { setAddSessionInitialName(undefined); setShowAddSession(true); }
                  }}
                  style={{ flex: 1, height: 42, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)" }}
                >
                  {todaySession ? "▶ Démarrer ma séance" : hasWeekSession ? "Voir mon planning →" : programPending ? "Voir ma semaine 1 →" : "+ Planifier une séance"}
                </button>
                <button
                  onClick={dismissActivation}
                  style={{ height: 42, paddingLeft: 14, paddingRight: 14, borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "transparent", color: "#8a8f94", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Passer
                </button>
              </div>
            </div>
          );
        })()}

        {/* Greeting */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: isMd ? 17 : 15, fontWeight: 600 }}>
            {greeting()} {profile.name ? profile.name : ""} 👋
          </div>
        </div>

        {/* ── Wellness + séance du jour, carte unique ── */}
        {/* Même mécanisme que CoachAthleteCard.tsx : halo pulsant sur le CONTOUR de la carte (pas
            sur l'encart de suggestion interne) quand une décharge est suggérée (jamais pour une
            surcharge — pas une alerte, par design), couleur dérivée de la vraie sévérité. */}
        <div
          data-tour="wellness-card"
          style={{
            position: "relative", overflow: "hidden",
            borderRadius: 30, padding: isMd ? 28 : 22, marginBottom: 12,
            background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
            border: wellnessCardSuggestion?.dir === "low" ? `3px solid ${wellnessCardBadgeColor}8c` : "1px solid rgba(255,255,255,0.13)",
            boxShadow: wellnessCardSuggestion?.dir === "low" ? `0 0 0 0 ${wellnessCardBadgeColor}00, 0 28px 72px rgba(0,0,0,0.28)` : "0 28px 72px rgba(0,0,0,0.28)",
            animation: wellnessCardSuggestion?.dir === "low" ? "perf-border-pulse-wellness 1.8s ease-in-out infinite" : undefined,
            color: "#fff",
          }}
        >
          {wellnessCardSuggestion?.dir === "low" && (
            <>
              <style>{`
                @keyframes perf-pulse-wellness-dot {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.55; transform: scale(1.35); }
                }
                @keyframes perf-border-pulse-wellness {
                  0%, 100% { border-color: ${wellnessCardBadgeColor}66; box-shadow: 0 0 0 0 ${wellnessCardBadgeColor}00, 0 28px 72px rgba(0,0,0,0.28); }
                  50% { border-color: ${wellnessCardBadgeColor}; box-shadow: 0 0 16px 3px ${wellnessCardBadgeColor}8c, 0 28px 72px rgba(0,0,0,0.28); }
                }
              `}</style>
              {/* Même pastille pulsante que CoachAthleteCard.tsx (position/taille/rythme identiques) —
                  "mêmes couleurs de halo" demandé par Gildas, un seul signal partagé entre les 2 cartes. */}
              <div style={{
                position: "absolute", top: isMd ? 24 : 18, right: isMd ? 24 : 18,
                width: 9, height: 9, borderRadius: "50%", background: wellnessCardBadgeColor,
                animation: "perf-pulse-wellness-dot 1.8s ease-in-out infinite", zIndex: 4,
              }} />
            </>
          )}
          <div style={{ position: "absolute", right: "-12%", bottom: "-42%", width: 300, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(32px)", pointerEvents: "none" }} />

          {wellnessFilledToday && (
            <div style={{ position: "absolute", top: isMd ? 24 : 18, right: wellnessCardSuggestion?.dir === "low" ? (isMd ? 44 : 34) : (isMd ? 24 : 18), zIndex: 3 }}>
              <ShareButton
                resourceType="wellness"
                variant="dark"
                buildSnapshot={() => ({
                  score: displayScore,
                  zoneLabel: formLabel(displayScore),
                  behaviors: (wellness?.behaviors ?? []).map(b => BEHAVIOR_META[b]
                    ? { emoji: BEHAVIOR_META[b].emoji, label: BEHAVIOR_META[b].label, positive: BEHAVIOR_META[b].positive }
                    : { emoji: "", label: b, positive: true }),
                  trainingAdvice: advice.training,
                  recoveryAdvice: advice.recovery,
                  authorName: profile.name ?? "Toi",
                })}
                title={`${profile.name ?? "Mon"} — ${formLabel(displayScore)}`}
                text={advice.recovery}
              />
            </div>
          )}

          {/* Sur md+ : 2 colonnes CÔTE À CÔTE à l'intérieur de la même carte (wellness+conseils à
             gauche, séance à droite) — évite que les exercices se retrouvent tout en bas d'une
             unique colonne étroite et forcent un scroll important sur desktop. Sur mobile, empilé
             normalement (les 2 blocs sont de simples <div> block quand `display` vaut "block"). */}
          <div style={{
            position: "relative", zIndex: 2,
            display: isMd ? "grid" : "block",
            gridTemplateColumns: isMd ? (isLg ? "5fr 4fr" : "1fr 1fr") : undefined,
            gap: isMd ? (isLg ? 28 : 20) : 0,
            alignItems: "start",
          }}>
            <div>
              {/* Ring + status — seule zone cliquable pour ouvrir le formulaire wellness (le reste
                 de la carte contient la séance, avec ses propres actions Terminer/éditer). */}
              <div
                onClick={() => setShowWellness(true)}
                style={{ display: "flex", alignItems: "center", gap: isMd ? 24 : 18, marginBottom: 18, cursor: "pointer" }}
              >
                <WellnessRingPOC score={displayScore} size={ringSize} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 6 }}>
                    Score &amp; conseils
                  </div>
                  <div style={{ fontSize: "clamp(22px, 7vw, 34px)", fontWeight: 1000, color: "#fff", marginBottom: 8, lineHeight: 1.08, letterSpacing: "-0.04em" }}>
                    {wellnessFilledToday ? formLabel(displayScore) : "Non renseigné"}
                  </div>
                  {wellnessFilledToday && wellness && wellness.behaviors.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {wellness.behaviors.map((b) => (
                        <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(212,64,0,0.22)", color: "#ffd2bf" }}>{BEHAVIOR_META[b] ? `${BEHAVIOR_META[b].emoji} ${BEHAVIOR_META[b].label}` : b}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(() => {
            const pendingDiffs = todaySessions
              .filter(s => !s.done && s.target_difficulty)
              .map(s => s.target_difficulty!);
            const maxDiff = pendingDiffs.length ? Math.max(...pendingDiffs) : 0;
            const autoregTarget = [...todaySessions].filter(s => !s.done)
              .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
            const suggestion = wellnessFilledToday && autoregTarget
              ? computeAutoregSuggestion(displayScore, autoregTarget.target_difficulty)
              : null;

            const scrollToSessions = (e: React.MouseEvent) => {
              e.stopPropagation();
              document.getElementById("day-sessions-container")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            };
            const openWellness = (e: React.MouseEvent) => {
              e.stopPropagation();
              setShowWellness(true);
            };

            const row = (
              bg: string, border: string, text: string,
              cta?: string, onCta?: (e: React.MouseEvent) => void
            ) => (
              <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "10px 14px", marginBottom: 12, fontSize: 11, color: "#ffd2bf" }}>
                <span style={{ lineHeight: 1.4 }}>{text}</span>
                {cta && onCta && (
                  <button onClick={onCta} style={{ flexShrink: 0, background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.22)", color: "#fff", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {cta}
                  </button>
                )}
              </div>
            );

            if (suggestion && autoregTarget) {
              const severityColor = suggestionSeverityColor(suggestion);
              return (
              <div style={{ position: "relative", zIndex: 2 }} onClick={e => e.stopPropagation()}>
                <AlertBox
                  variant="darkColor"
                  pulse={false}
                  alert={{
                    border: `${severityColor}66`,
                    glow: severityColor,
                    text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, autoregTarget.target_difficulty ?? maxDiff)}`,
                  }}
                  actions={
                <AutoregButtons
                  sessionId={autoregTarget.id}
                  dir={suggestion.dir}
                  reco={suggestion.reco}
                  advice=""
                  sessionLabel={autoregTarget.name}
                  severityColor={severityColor}
                  isActive={isActive}
                  onPreviewChange={pct => setAutoregPreview(pct != null ? { sessionId: autoregTarget.id, pct } : null)}
                  onApply={async (pct) => {
                    /* Aperçu (onPreviewChange) reste libre — seule la persistance de la décision
                       est gatée (voir chantier gating save, 2026-08-19). isActive vient
                       directement de usePaywall() : requireSubscription() ne peut pas envelopper
                       ce callback, qui doit retourner `original` pour le mécanisme "Annuler". */
                    if (!isActive) { setPaywallStep("priming"); return; }
                    const original = { notes: autoregTarget.notes, target_difficulty: autoregTarget.target_difficulty };
                    const notes = autoregTarget.notes ? autoregTarget.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : autoregTarget.notes;
                    const target_difficulty = adjustDifficulty(autoregTarget.target_difficulty ?? 6, pct);
                    const { data: saved } = await supabase.from("sessions").update({ notes, target_difficulty }).eq("id", autoregTarget.id).select().single();
                    if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
                    return original;
                  }}
                  onUndo={async (original) => {
                    if (!original) return;
                    const { data: saved } = await supabase.from("sessions").update({ notes: original.notes, target_difficulty: original.target_difficulty }).eq("id", autoregTarget.id).select().single();
                    if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
                  }}
                />
                  }
                />
              </div>
              );
            }

            if (!wellnessFilledToday) return row(
              "rgba(255,255,255,0.07)", "rgba(255,255,255,0.18)",
              "Complète ta récupération pour des conseils personnalisés",
              "Comment tu vas ? →", openWellness
            );
            if (displayScore !== null && displayScore < 55 && maxDiff >= 8) return row(
              "rgba(212,64,0,0.18)", "rgba(212,64,0,0.36)",
              `🔥 Récupération basse · Séance à ${maxDiff}/10 prévue — allège à 6/10`,
              "Baisse la charge →", scrollToSessions
            );
            if (displayScore !== null && displayScore < 55 && maxDiff >= 5) return row(
              "rgba(212,64,0,0.12)", "rgba(212,64,0,0.28)",
              `⚠️ Récupération basse · Séance à ${maxDiff}/10 — surveille ton effort`,
              "Voir la séance →", scrollToSessions
            );
            if (displayScore !== null && displayScore < 55) return row(
              "rgba(242,138,0,0.15)", "rgba(242,138,0,0.30)",
              "💛 Récupération basse — journée allégée recommandée"
            );
            if (displayScore !== null && displayScore >= 80 && maxDiff >= 8) return row(
              "rgba(47,158,68,0.15)", "rgba(47,158,68,0.30)",
              `✅ Score ${displayScore} · Séance à ${maxDiff}/10 — fenêtre idéale !`,
              "C'est parti →", scrollToSessions
            );
            return null;
          })()}

              {/* ✦ Conseils — condensé en un seul bloc (2 lignes à icône) plutôt que 2 cartes
                 empilées, pour libérer de la hauteur avant la séance sur mobile. */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                  ✦ Conseils
                </div>
                <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 15, lineHeight: 1.55 }}>⚡</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 3 }}>Entraînement</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#fff" }}>{advice.training}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 10 }}>
                    <span style={{ fontSize: 15, lineHeight: 1.55 }}>🌿</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 3 }}>Récupération</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: "#fff" }}>{advice.recovery}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Séance(s) du jour — imbriquée dans la même carte, colonne de droite sur md+ ── */}
            <div style={{ marginTop: isMd ? 0 : 16, borderTop: isMd ? "none" : "1px solid rgba(255,255,255,0.12)", paddingTop: isMd ? 0 : 16 }}>
              <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                ✦ Séance{todaySessions.length > 1 ? "s" : ""} · {format(new Date(selectedDate + "T12:00:00"), "EEEE d MMMM", { locale: fr })}
              </div>

              <div id="day-sessions-container">
                {/* Empty state semaine entière */}
                {weekSessions.length === 0 ? (
                  activeProgram && activeProgram.start_date > initialDate ? (
                    <div style={{ background: "#f8faf3", border: "1px solid rgba(47,158,68,.18)", borderRadius: 16, padding: "18px 16px", marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#2f9e44", marginBottom: 4 }}>
                        Programme en attente
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#171b1f", marginBottom: 6 }}>
                        {activeProgram.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#62686e", lineHeight: 1.5 }}>
                        {(() => {
                          const [, m, d] = activeProgram.start_date.split("-").map(Number);
                          const MONTHS = ["jan.","fév.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
                          return `Tes séances arrivent le ${d} ${MONTHS[m - 1]}. Retrouve ton planning dans l'onglet Planning.`;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <EmptySessionState
                      sport={profile.sport}
                      label="Créer ma première séance"
                      onAdd={(name) => { setAddSessionInitialName(name); setShowAddSession(true); }}
                    />
                  )
                ) : todaySessions.length === 0 ? (
                  <div style={{ border: "0.5px dashed rgba(255,255,255,0.22)", borderRadius: "var(--radius)", padding: 12, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 9 }}>
                    Repos ou séance libre
                  </div>
                ) : null}
                {todaySessions.map((s) => (
                  <TodaySessionCard
                    key={s.id}
                    session={s}
                    onComplete={(s) => handleTerminer(s)}
                    onEdit={(s) => setEditing(s)}
                    onDelete={(s) => requireSubscription(() => deleteSession(s))}
                    previewPct={autoregPreview?.sessionId === s.id ? autoregPreview.pct : null}
                    onReorderExercises={reorderTodayExercises}
                    authorName={profile.name ?? "Toi"}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          data-tour="add-session-btn"
          onClick={() => { setAddSessionInitialName(undefined); setShowAddSession(true); }}
          style={{
            border: "0.5px dashed rgba(212,64,0,0.34)",
            color: "var(--accent)", background: "#fff",
            borderRadius: "var(--radius)", padding: "18px 14px",
            textAlign: "center", fontSize: 13, fontWeight: 600,
            cursor: "pointer", marginTop: 10, transition: "all 0.15s",
          }}
        >
          + Ajouter une séance
        </div>
      </div>

      {/* Modals — ouverture toujours libre (voir les onClick plus haut), seule la persistance
          réelle (onSave/onDelete) est gatée derrière requireSubscription() (2026-08-19). */}
      {showWellness && (
        <WellnessModal date={selectedDate} onSave={data => requireSubscription(() => saveWellness(data))} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); }} />
      )}
      {showAddSession && (
        <AddSessionModal date={selectedDate} initialName={addSessionInitialName} userName={profile.name ?? "Toi"} onSave={data => requireSubscription(() => addSession(data))} onClose={() => { setShowAddSession(false); setAddSessionInitialName(undefined); }} />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={data => requireSubscription(() => saveComplete(data))} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date}
          session={editing}
          userName={profile.name ?? "Toi"}
          onSave={data => requireSubscription(() => saveEdit(data))}
          onDelete={() => requireSubscription(async () => { await deleteSession(editing); setEditing(null); })}
          onClose={() => setEditing(null)}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" page="today" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
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
