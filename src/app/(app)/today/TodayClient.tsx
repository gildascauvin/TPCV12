"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import WellnessModal from "@/components/wellness/WellnessModal";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import CompleteModal from "@/components/sessions/CompleteModal";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import { usePaywall } from "@/hooks/usePaywall";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import EmptySessionState from "@/components/sessions/EmptySessionState";
import type { Profile, WellnessDaily, Session, SubscriptionStatus } from "@/types";

const BEHAVIOR_LABELS: Record<string, string> = {
  alcohol: "🍷 Alcool",
  late_sleep: "🌙 Couché tardif",
  tobacco: "🚬 Tabac",
  screen_late: "📱 Écran tard",
  heavy_meal: "🍔 Repas lourd",
  caffeine_late: "☕ Caféine tard",
  social_out: "🎉 Sortie sociale",
  travel: "✈️ Voyage",
};

/* ─── helpers ─── */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

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

function getAdvice(wellness: WellnessDaily | null, sessions: Session[]) {
  const done = sessions.filter((s) => s.done && s.rpe && s.duration);
  const score = wellness?.score ?? null;

  if (!wellness && !done.length) {
    return {
      training: "Remplis ton wellness pour obtenir tes recommandations.",
      recovery: "Les conseils apparaîtront ici.",
    };
  }
  if (done.length) {
    const load = done.reduce((a, s) => a + s.rpe! * s.duration!, 0);
    const avgRpe = +(done.reduce((a, s) => a + s.rpe!, 0) / done.length).toFixed(1);
    const mins = done.reduce((a, s) => a + s.duration!, 0);
    return {
      training: `${done.length} séance${done.length > 1 ? "s" : ""} terminée${done.length > 1 ? "s" : ""} · Effort moy. ${avgRpe}/10 · ${mins} min. ${load > 600 ? "Charge haute : récupération prioritaire." : load > 300 ? "Charge modérée : évite d'ajouter de l'intensité." : "Charge légère : progression possible."}`,
      recovery: load > 600 ? "Hydratation + glucides/protéines post-séance, coucher tôt et mobilité douce." : load > 300 ? "Hydrate-toi bien, 10 min de mobilité et sommeil régulier." : "Routine simple : hydratation, marche légère et sommeil stable.",
    };
  }
  return {
    training: score! >= 80 ? `Score excellent (${score}/100). Fenêtre idéale pour une séance qualitative.` : score! >= 65 ? `Forme correcte (${score}/100). Intensité normale.` : score! >= 45 ? `Fatigue modérée (${score}/100). Allège légèrement l'intensité.` : `Score bas (${score}/100). Réduis l'intensité de 20–30%.`,
    recovery: score! >= 75 ? "Maintiens les bons signaux : hydratation, protéines et coucher régulier." : score! >= 55 ? "Priorise hydratation 35ml/kg, protéines 1,6–2g/kg/j et coucher avant 23h." : "Récupération prioritaire : sommeil, nutrition simple, pas d'effort max.",
  };
}

function buildDotMap(sessions: Session[], anchor: string) {
  const map: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
  const weekStart = startOfWeek(new Date(anchor + "T12:00:00"), { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    const d = format(addDays(weekStart, i), "yyyy-MM-dd");
    const charge = sessions.filter((s) => s.date === d && s.done && s.rpe && s.duration).reduce((a, s) => a + s.rpe! * s.duration!, 0);
    if (charge > 600) map[d] = "done-high";
    else if (charge > 300) map[d] = "done-med";
    else if (charge > 0) map[d] = "done-light";
    else if (sessions.some((s) => s.date === d && !s.done)) map[d] = "planned";
  }
  return map;
}

/* ─── WellnessRing inline (responsive size) ─── */
function WellnessRingPOC({ score, size = 104 }: { score: number | null; size?: number }) {
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
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "all 0.5s ease" }} />
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
function TodaySessionCard({ session, onComplete, onEdit, onDelete }: {
  session: Session;
  onComplete: (s: Session) => void;
  onEdit: (s: Session) => void;
  onDelete: (s: Session) => void;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  // Single gauge: rpe if done, target_difficulty if planned
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);

  return (
    <div
      className="mb-2 cursor-pointer"
      style={{
        background: "#fff",
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        padding: 18, borderRadius: 24,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onClick={() => onEdit(session)}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 1000, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.04em" }}>
          {session.name}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
          background: session.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,0.10)",
          color: session.done ? "#2f9e44" : "#d44000",
        }}>
          {session.done ? "Terminé" : "Prévu"}
        </span>
      </div>

      {/* 2. Single difficulty gauge — no label */}
      {gaugeValue && (
        <div style={{ marginBottom: 12 }}>
          <DiffGauge value={gaugeValue} height={12} />
        </div>
      )}

      {/* 3. Exercise display list (v50 — no numbers) */}
      {exercises.length > 0 && (
        <div style={{ marginBottom: 12, border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden" }}>
          {exercises.map((ex, i) => (
            <div key={i} style={{
              padding: "10px 12px", fontSize: 13.5, lineHeight: 1.45,
              color: "#2c3236", fontWeight: 650,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.08)" : "none",
              background: "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {ex}
            </div>
          ))}
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
          onClick={() => onComplete(session)}
          style={{
            flex: 1, height: 46, borderRadius: 14, fontSize: 14, fontWeight: 800, cursor: "pointer",
            background: session.done ? "#fff" : "linear-gradient(180deg,#f04a08,#d44000)",
            color: session.done ? "#171b1f" : "#fff",
            border: session.done ? "1px solid rgba(0,0,0,.10)" : "none",
            boxShadow: session.done ? "none" : "0 8px 20px rgba(212,64,0,.22)",
          }}
        >
          {session.done ? "Résultat" : "Terminer"}
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
}

export default function TodayClient({ userId, profile, initialDate, initialWellness, initialSessions, subscriptionStatus, hasCoach = false }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus, hasCoach);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [wellness, setWellness] = useState<WellnessDaily | null>(initialWellness);
  const [allSessions, setAllSessions] = useState<Session[]>(initialSessions);
  const [weekWellnessMap, setWeekWellnessMap] = useState<Record<string, number | null>>({
    [initialDate]: initialWellness?.score ?? null,
  });

  const prevWeekRef = useRef("");

  // Recharge wellness + sessions quand on change de semaine
  useEffect(() => {
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

  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromOnboarding = params.get("welcome") === "1";
    const alreadySeen = localStorage.getItem(`welcome_shown_${userId}`);
    if (fromOnboarding && !alreadySeen) setShowWelcome(true);
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
  const displayScore = wellnessFilledToday ? score : null;
  const displayWellness = wellnessFilledToday ? wellness : null;
  const advice = getAdvice(displayWellness, todaySessions);
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

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }) => {
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

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }) => {
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
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={weekWellnessMap} onSwipe={navigatePeriod} />

      <div style={{ padding: `14px ${pad}px 18px`, maxWidth: isLg ? 1000 : isMd ? 720 : "100%", margin: "0 auto" }}>

        {/* ── Welcome handled by overlay modal below ── */}

        {/* Greeting */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: isMd ? 17 : 15, fontWeight: 600 }}>
            {greeting()} {profile.name ? profile.name : ""} 👋
          </div>
        </div>

        {/* ── 2-col layout on md+ ── */}
        <div className="today-layout">

          {/* ── Wellness + Conseils card ── */}
          <div
            onClick={() => requireSubscription(() => setShowWellness(true))}
            style={{
              position: "relative", overflow: "hidden",
              borderRadius: 30, padding: isMd ? 28 : 22, marginBottom: 12,
              background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: "0 28px 72px rgba(0,0,0,0.28)",
              color: "#fff", cursor: "pointer",
            }}
          >
            <div style={{ position: "absolute", right: "-12%", bottom: "-42%", width: 300, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(32px)", pointerEvents: "none" }} />

            {/* Ring + status */}
            <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: isMd ? 24 : 18, marginBottom: 18 }}>
              <WellnessRingPOC score={displayScore} size={ringSize} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 6 }}>
                  Score &amp; conseils
                </div>
                <div style={{ fontSize: "clamp(22px, 7vw, 34px)", fontWeight: 1000, color: "#fff", marginBottom: 8, lineHeight: 1.08, letterSpacing: "-0.04em" }}>
                  {wellnessFilledToday ? formLabel(displayScore) : "Non renseigné"}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.76)" }}>
                  {wellnessFilledToday ? "Rempli aujourd'hui" : "Non renseigné · Appuie pour remplir"}
                </div>
                {wellnessFilledToday && wellness && wellness.behaviors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {wellness.behaviors.map((b) => (
                      <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(212,64,0,0.22)", color: "#ffd2bf" }}>{BEHAVIOR_LABELS[b] || b}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.07)", color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900 }}>
                    ✓ <strong style={{ color: "#ff8a55" }}>Autorégulation</strong> active
                  </span>
                </div>
              </div>
            </div>

            {displayScore !== null && displayScore < 55 && (
              <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 7, background: "rgba(212,64,0,0.18)", border: "1px solid rgba(212,64,0,0.36)", borderRadius: 16, padding: "10px 14px", marginBottom: 12, fontSize: 11, color: "#ffd2bf" }}>
                🔥 Wellness bas — pense à alléger ou reporter si la séance est intense
              </div>
            )}

            <div style={{ position: "relative", zIndex: 2, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                ✦ Conseils
              </div>
              <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>⚡ Entraînement</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{advice.training}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>🌿 Récupération</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{advice.recovery}</div>
              </div>
            </div>
          </div>

          {/* ── Sessions column ── */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>
                {format(new Date(selectedDate + "T12:00:00"), "EEEE d MMMM", { locale: fr })}
              </div>
            </div>

            {/* Bandeau séance du jour */}
            {(() => {
              const nextSession = todaySessions.find(s => !s.done);
              if (!nextSession) return null;
              return (
                <div style={{
                  background: "linear-gradient(135deg,#171b1f,#2a2f35)",
                  borderRadius: 18, padding: "14px 16px", marginBottom: 10,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 4 }}>
                      Séance du jour
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {nextSession.name}
                    </div>
                    {nextSession.target_difficulty && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>
                        Diff. cible : {nextSession.target_difficulty}/10
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => requireSubscription(() => handleTerminer(nextSession))}
                    style={{ flexShrink: 0, height: 38, paddingLeft: 16, paddingRight: 16, borderRadius: 11, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.3)" }}
                  >
                    ▶ Démarrer
                  </button>
                </div>
              );
            })()}

            <div id="day-sessions-container">
              {/* Empty state semaine entière */}
              {weekSessions.length === 0 ? (
                <EmptySessionState
                  sport={profile.sport}
                  label="Créer ma première séance"
                  onAdd={(name) => { setAddSessionInitialName(name); requireSubscription(() => setShowAddSession(true)); }}
                />
              ) : todaySessions.length === 0 ? (
                <div style={{ border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: "var(--radius)", padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 12, marginBottom: 9 }}>
                  Repos ou séance libre
                </div>
              ) : null}
              {todaySessions.map((s) => (
                <TodaySessionCard
                  key={s.id}
                  session={s}
                  onComplete={(s) => requireSubscription(() => handleTerminer(s))}
                  onEdit={(s) => requireSubscription(() => setEditing(s))}
                  onDelete={(s) => requireSubscription(() => deleteSession(s))}
                />
              ))}
            </div>

            <div
              onClick={() => requireSubscription(() => { setAddSessionInitialName(undefined); setShowAddSession(true); })}
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

        </div>
      </div>

      {/* Modals */}
      {showWellness && (
        <WellnessModal date={selectedDate} onSave={saveWellness} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); }} />
      )}
      {showAddSession && (
        <AddSessionModal date={selectedDate} initialName={addSessionInitialName} onSave={addSession} onClose={() => { setShowAddSession(false); setAddSessionInitialName(undefined); }} />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={saveComplete} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date}
          session={editing}
          onSave={saveEdit}
          onDelete={async () => { await deleteSession(editing); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
      {showWelcome && (
        <WelcomeModal mode="athlete" onClose={() => { localStorage.setItem(`welcome_shown_${userId}`, "1"); setShowWelcome(false); }} />
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
