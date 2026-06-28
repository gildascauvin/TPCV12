"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { getSessionTemplates, nextDateForDow } from "@/lib/sessionTemplates";
import Link from "next/link";
import AuthBackground from "@/components/auth/AuthBackground";
import WeekPreviewStep from "@/components/onboarding/WeekPreviewStep";
import WeekPreviewStepCoach from "@/components/onboarding/WeekPreviewStepCoach";
import AutoRegScoreStep from "@/components/onboarding/AutoRegScoreStep";
import AutoRegScoreStepCoach from "@/components/onboarding/AutoRegScoreStepCoach";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "role"
  | "value_slides"
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"
  | "overload_2a" | "planning_2a" | "fatigue_2a"
  | "autoreg_score"
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"
  | "autoreg_score_coach"
  | "week_preview_2a" | "week_preview_2b"
  | "wellness_q"
  | "account";

type PendingData = {
  role: Role; sport: string; sportPrecision: string; level: Level;
  goal: string; frustration: string; trainingDays: number[];
  coachingContext: string; athleteCount: string; coachingChallenge: string; currentTool: string;
  name: string; wSleep: number; wBedtime: string; wStress: number; wRecovery: number;
  wBehaviors: string[]; wMotivation: number; wScore: number | null;
};
interface Props { userId?: string; pendingData?: PendingData | null; initialRole?: Role }

const ATHLETE_PATH: StepId[] = [
  "role", "value_slides",
  "frustration_2a",
  "overload_2a", "planning_2a", "fatigue_2a",
  "autoreg_score",
  "sport_2a", "level_2a", "goal_2a", "days_2a",
  "week_preview_2a",
  "wellness_q", "account",
];
const COACH_PATH: StepId[] = [
  "role", "value_slides",
  "challenge_2b",
  "overload_2b", "planning_time_2b", "fatigue_2b",
  "autoreg_score_coach",
  "context_2b", "sport_2b", "count_2b", "tool_2b",
  "week_preview_2b",
  "account",
];

const POST_PROGRESS: StepId[] = ["value_slides", "wellness_q", "autoreg_score", "autoreg_score_coach"];

const PROGRAM_ATHLETE_PATH: StepId[] = ["week_preview_2a", "role", "wellness_q", "account"];
const PROGRAM_COACH_PATH: StepId[] = ["week_preview_2a", "role", "account"];

function getNextMonday(): string {
  const today = new Date();
  const dow = today.getDay();
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  return monday.toISOString().split("T")[0];
}

const SPORT_CATEGORIES = [
  { id: "Force & puissance",      icon: "💪", sub: "Haltérophilie, powerlifting, CrossFit…" },
  { id: "Athlétisme & vitesse",   icon: "🏃", sub: "Sprint, saut, lancer…" },
  { id: "Sports collectifs",      icon: "🏉", sub: "Rugby, handball, basket, foot…" },
  { id: "Endurance",              icon: "🚴", sub: "Course, cyclisme, natation…" },
  { id: "Arts martiaux & combat", icon: "🥋", sub: "Judo, MMA, boxe…" },
  { id: "Autre",                  icon: "⚡", sub: "Autre discipline" },
];

const BEDTIME_OPTIONS = [
  { value: "before22", label: "Avant 22h" },
  { value: "22to23",   label: "22h–23h" },
  { value: "23to00",   label: "23h–minuit" },
  { value: "00to01",   label: "Minuit–1h" },
  { value: "after01",  label: "Après 1h" },
];

const NEGATIVE_BEHAVIORS = [
  { key: "alcohol",       emoji: "🍷", label: "Alcool" },
  { key: "late_sleep",    emoji: "🌙", label: "Couché tardif" },
  { key: "tobacco",       emoji: "🚬", label: "Tabac" },
  { key: "screen_late",   emoji: "📱", label: "Écran tard" },
  { key: "heavy_meal",    emoji: "🍔", label: "Repas lourd" },
  { key: "caffeine_late", emoji: "☕", label: "Caféine tard" },
  { key: "social_out",    emoji: "🎉", label: "Sortie sociale" },
  { key: "travel",        emoji: "✈️", label: "Voyage" },
];

const POSITIVE_BEHAVIORS = [
  { key: "stretching",  emoji: "🧘",   label: "Stretching" },
  { key: "cold_shower", emoji: "🧊",   label: "Douche froide" },
  { key: "reading",     emoji: "📖",   label: "Lecture" },
  { key: "meditation",  emoji: "🧘‍♂️", label: "Méditation" },
  { key: "hydration",   emoji: "💧",   label: "Bonne hydratation" },
  { key: "walk",        emoji: "🚶",   label: "Marche détente" },
];

function buildAthleteSessions(userId: string, sport: string, level: Level, days: number[]) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, elite: 8 };
  const dow = days.length > 0 ? days : [1, 3, 5];

  // Planifier sur la semaine en cours ET la semaine suivante
  // Semaine en cours = lundi de cette semaine. Utilise les dates locales pour éviter le décalage UTC.
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;

  const dateForDow = (d: number, weekOffset: number): string => {
    const offsetFromMonday = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offsetFromMonday + weekOffset * 7);
    const y = result.getFullYear();
    const m = String(result.getMonth() + 1).padStart(2, "0");
    const day = String(result.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const sessions: object[] = [];
  for (const weekOffset of [0, 1]) {
    dow.forEach((d, i) => {
      const [name, notes] = templates[i % templates.length];
      sessions.push({ user_id: userId, date: dateForDow(d, weekOffset), name, notes: `${notes}\nDifficulté cible : ${rpe[level]}`, done: false, target_difficulty: rpe[level] });
    });
    if (days.length < 6) {
      const rec = dow.includes(0) ? 2 : 0;
      sessions.push({ user_id: userId, date: dateForDow(rec, weekOffset), name: "Récupération active", notes: "Marche ou vélo facile 25–35 min\nMobilité 10 min\nObjectif : faire redescendre la fatigue", done: false, target_difficulty: 3 });
    }
  }
  return sessions;
}

function buildWellnessBaseline(userId: string, level: Level) {
  const bonus = level === "elite" ? 4 : 0;
  const base  = Math.max(35, 74 + bonus);
  const today = new Date().toISOString().split("T")[0];
  return { user_id: userId, date: today, sleep: 7, stress: 5, recovery: 6, motivation: 7, base_score: base, score: base, behaviors: [] };
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildAthleteHistory(userId: string, sport: string, level: Level, days: number[]) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, elite: 8 };
  const dow = days.length > 0 ? days : [1, 3, 5];
  const targetRpe = rpe[level];
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;

  const sessions: object[] = [];
  for (let weekOffset = -4; weekOffset <= -1; weekOffset++) {
    dow.forEach((d, i) => {
      const offsetFromMonday = d === 0 ? 6 : d - 1;
      const result = new Date(today);
      result.setDate(today.getDate() + daysToCurrentMonday + offsetFromMonday + weekOffset * 7);
      if (result >= today) return;
      const sessionRpe = Math.max(1, Math.min(10, targetRpe + Math.round((Math.random() - 0.5) * 4)));
      const duration = 45 + Math.round(Math.random() * 30);
      const [name, notes] = templates[i % templates.length];
      sessions.push({ user_id: userId, date: toIso(result), name, notes: `${notes}\nDifficulté cible : ${targetRpe}`, done: true, target_difficulty: targetRpe, rpe: sessionRpe, duration });
    });
  }

  const wellnessRows: object[] = [];
  const baseScore = level === "elite" ? 74 : level === "intermediate" ? 70 : 65;
  for (let i = 28; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const sleep = Math.max(4, Math.min(10, 7 + Math.round((Math.random() - 0.5) * 4)));
    const stress = Math.max(1, Math.min(10, 5 + Math.round((Math.random() - 0.5) * 4)));
    const recovery = Math.max(3, Math.min(10, 6 + Math.round((Math.random() - 0.5) * 4)));
    const motivation = Math.max(4, Math.min(10, 7 + Math.round((Math.random() - 0.5) * 4)));
    const variation = Math.round((Math.random() - 0.5) * 16);
    const score = Math.max(30, Math.min(95, baseScore + variation));
    wellnessRows.push({ user_id: userId, date: toIso(d), sleep, stress, recovery, motivation, behaviors: [], bedtime: "23to00", base_score: score, score });
  }

  return { sessions, wellnessRows };
}

function buildCoachDemoSessions(coachId: string, athleteId: string, sport: string, rpeBase: number) {
  const templates = getSessionTemplates(sport);
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const dateForDow = (d: number, weekOffset: number): string => {
    const offset = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
    return toIso(result);
  };
  const sessions: object[] = [];

  // 4 semaines passées
  for (let weekOffset = -4; weekOffset <= -1; weekOffset++) {
    [1, 3, 5, 6].forEach((d, i) => {
      const offset = d === 0 ? 6 : d - 1;
      const result = new Date(today);
      result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
      if (result >= today) return;
      const sessionRpe = Math.max(1, Math.min(10, rpeBase + Math.round((Math.random() - 0.5) * 4)));
      const duration = 45 + Math.round(Math.random() * 30);
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: toIso(result), name, notes, done: true, target_difficulty: rpeBase, rpe: sessionRpe, duration });
    });
  }

  // 2 semaines futures (S0 + S1)
  const scheduledDays = [1, 3, 5, 6];
  for (const weekOffset of [0, 1]) {
    scheduledDays.forEach((d, i) => {
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: dateForDow(d, weekOffset), name, notes, done: false, target_difficulty: rpeBase });
    });
  }

  // Garantir une séance aujourd'hui pour le coach control (filtre hasSessions)
  if (!scheduledDays.includes(todayDow)) {
    const [name, notes] = templates[0];
    sessions.push({ coach_id: coachId, athlete_id: athleteId, date: today.toISOString().split("T")[0], name, notes, done: false, target_difficulty: rpeBase });
  }

  return sessions;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: "block", flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/* ── sub-components ── */
function Choice({ icon, title, sub, selected, onClick }: { icon: string; title: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer", borderRadius: 12, padding: 11, border: selected ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,.10)", background: selected ? "rgba(212,64,0,.05)" : "#fff", transition: "all .15s" }}>
      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: sub ? 3 : 0, color: selected ? "#d44000" : "#1f2428" }}>
        {icon}{icon ? " " : ""}{title}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#8a8f94", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function Actions({ onBack, onNext, nextLabel, nextDisabled = false }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onBack} style={{ flex: 1, height: 44, borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        ← Retour
      </button>
      <button onClick={() => { if (!nextDisabled) onNext(); }} style={{ flex: 1, height: 44, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: nextDisabled ? "default" : "pointer", opacity: nextDisabled ? 0.45 : 1, boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}>
        {nextLabel}
      </button>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(212,64,0,.10)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#d44000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function EmailSentScreen({ email }: { email: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
      <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 8 }}>Vérifie tes emails</div>
      <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.6, marginBottom: 18 }}>
        On a envoyé un lien à <strong>{email}</strong>.<br />
        Clique dessus pour activer ton compte et accéder à ton espace.
      </div>
      <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-block", padding: "12px 24px", borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        Ouvrir Gmail →
      </a>
    </div>
  );
}

const LEVEL_LABELS: Record<Level, string> = { beginner: "Débutant", intermediate: "Intermédiaire", elite: "Compétiteur" };
const FREQ_LABELS: Record<number, string>  = { 2: "1–2 séances/semaine", 3: "3–4 séances/semaine", 5: "5–6 séances/semaine", 7: "7 séances ou plus/semaine" };

/* ── main ── */
export default function OnboardingFlow({ userId, pendingData, initialRole }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const isRegisterMode = !userId;
  const [hasClaimedProgram, setHasClaimedProgram] = useState<boolean | null>(null);

  const [stepIdx, setStepIdx] = useState(initialRole ? 1 : 0);
  const [role, setRole]       = useState<Role>(pendingData?.role || initialRole || "athlete");

  /* questionnaire */
  const [sport, setSport]                         = useState(pendingData?.sport || "Force & puissance");
  const [sportPrecision, setSportPrecision]       = useState(pendingData?.sportPrecision || "");
  const [level, setLevel]                         = useState<Level>(pendingData?.level || "intermediate");
  const [goal, setGoal]                           = useState(pendingData?.goal || "");
  const [frustration, setFrustration]             = useState(pendingData?.frustration || "");
  const [trainingDays, setTrainingDays]           = useState<number[]>(pendingData?.trainingDays ?? [1, 3, 5]);
  const [coachingContext, setCoachingContext]     = useState(pendingData?.coachingContext || "");
  const [athleteCount, setAthleteCount]           = useState(pendingData?.athleteCount || "");
  const [coachingChallenge, setCoachingChallenge] = useState(pendingData?.coachingChallenge || "");
  const [currentTool, setCurrentTool]             = useState(pendingData?.currentTool || "");

  /* account */
  const [name, setName]         = useState(pendingData?.name || "");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emailSent, setEmailSent]   = useState(false);

  /* value_slides */
  const [vSlide, setVSlide] = useState(0);

  /* pain point answers — athlete */
  const [overloadAns, setOverloadAns] = useState("");
  const [planningAns, setPlanningAns] = useState("");
  const [fatigueAns, setFatigueAns]   = useState("");
  /* pain point answers — coach */
  const [overloadCoachAns, setOverloadCoachAns] = useState("");
  const [planningCoachAns, setPlanningCoachAns] = useState("");
  const [fatigueCoachAns, setFatigueCoachAns]   = useState("");

  /* wellness sub-steps */
  const WQ_TOTAL = 5;
  const [wStep, setWStep]           = useState(0);
  const [wSleep, setWSleep]         = useState(pendingData?.wSleep ?? 7);
  const [wBedtime, setWBedtime]     = useState(pendingData?.wBedtime || "23to00");
  const [wStress, setWStress]       = useState(pendingData?.wStress ?? 5);
  const [wRecovery, setWRecovery]   = useState(pendingData?.wRecovery ?? 7);
  const [wBehaviors, setWBehaviors] = useState<string[]>(pendingData?.wBehaviors || []);
  const [wMotivation, setWMotivation] = useState(pendingData?.wMotivation ?? 8);
  const [wScore, setWScore]           = useState<number | null>(pendingData?.wScore ?? null);
  const [wSaving, setWSaving]         = useState(false);

  /* initializing — true quand on arrive depuis Google OAuth avec pendingData */
  const [initializing, setInitializing] = useState(!!pendingData);

  /* auto-advance guard */
  const advancingRef = useRef(false);

  function toggleBehavior(key: string) {
    setWBehaviors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const getPath = (r: Role): StepId[] => {
    if (hasClaimedProgram) return r === "coach" ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH;
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
  };
  const path        = getPath(role);
  const currentStep = path[stepIdx];
  const isLast      = stepIdx === path.length - 1;

  useEffect(() => {
    if (initialRole) {
      const syntheticProps = { step: "role", step_index: 0, role: initialRole, mode: isRegisterMode ? "register" : "auth" };
      posthog.capture("onboarding_step_viewed", syntheticProps);
      posthog.capture("onboarding_role_viewed", syntheticProps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const props = {
      step: currentStep,
      step_index: stepIdx,
      role: currentStep === "role" ? "selecting" : (role || "unknown"),
      mode: isRegisterMode ? "register" : "auth",
    };
    posthog.capture("onboarding_step_viewed", props);
    posthog.capture(`onboarding_${currentStep}_viewed`, props);
    if (hasClaimedProgram && currentStep === "week_preview_2a") {
      posthog.capture("program_preview_viewed", { program_id: localStorage.getItem("claim_program_id") });
    }
    advancingRef.current = false;
  }, [currentStep]);

  useEffect(() => {
    const claimed = !!localStorage.getItem("claim_program_id");
    setHasClaimedProgram(claimed);
    if (claimed) {
      posthog.setPersonProperties({ onboarding_source: "program", claimed_program_id: localStorage.getItem("claim_program_id") });
      posthog.capture("program_onboarding_start", { program_id: localStorage.getItem("claim_program_id") });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentStep !== "value_slides") return;
    posthog.capture("onboarding_value_slide_viewed", { role, slide: vSlide });
  }, [vSlide, currentStep]);

  function next() { if (!isLast) setStepIdx(i => i + 1); }
  function back() { if (stepIdx > 0) setStepIdx(i => i - 1); }

  function nextAfterChoice(setter: () => void) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setter();
    setTimeout(() => next(), 300);
  }

  async function saveData(uid: string) {
    const sportValue = sport === "Autre" && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport;
    await supabase.from("profiles").upsert({
      user_id: uid,
      ...(name.trim() ? { name: name.trim() } : {}),
      sport: sportValue, mode: role, onboarding_done: true,
      freq_target:        role === "athlete" ? trainingDays.length : null,
      training_days:      role === "athlete" ? trainingDays : null,
      objective:          role === "athlete" ? (goal || null) : null,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_context:   role === "coach"   ? (coachingContext || null) : null,
      athletes_count:     role === "coach"   ? (athleteCount || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
      current_tool:       role === "coach"   ? (currentTool || null) : null,
    }, { onConflict: "user_id" });

    if (role === "athlete") {
      const { sessions: pastSessions, wellnessRows } = buildAthleteHistory(uid, sportValue, level, trainingDays);
      await Promise.all([
        ...(!hasClaimedProgram ? [supabase.from("sessions").insert(buildAthleteSessions(uid, sportValue, level, trainingDays))] : []),
        supabase.from("sessions").insert(pastSessions),
        supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, level), { onConflict: "user_id,date" }),
        supabase.from("wellness_daily").upsert(wellnessRows, { onConflict: "user_id,date" }),
      ]);
    }
    if (role === "coach") {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      await supabase.from("profiles").update({ invite_code: code }).eq("user_id", uid);

      const DEMO_ATHLETES = [
        { name: "Thomas M.", wellness_score: 82, rpeBase: 7 },
        { name: "Emma L.",   wellness_score: 67, rpeBase: 8 },
        { name: "Pierre D.", wellness_score: 43, rpeBase: 9 },
        { name: "Sofia R.",  wellness_score: 71, rpeBase: 7 },
        { name: "Lucas B.",  wellness_score: 28, rpeBase: 8 },
      ];
      for (const demo of DEMO_ATHLETES) {
        const { data: athlete } = await supabase
          .from("coach_athletes")
          .insert({ coach_id: uid, name: demo.name, sport: sportValue, wellness_score: demo.wellness_score, user_id: null })
          .select("id").single();
        if (athlete?.id) {
          await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, athlete.id, sportValue, demo.rpeBase));
        }
      }
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      if (isRegisterMode) {
        const emailRedirectTo = location.hostname === "localhost"
          ? undefined
          : `${location.origin}/auth/callback`;
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(), password,
          ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
        });
        if (signUpErr) { setError(signUpErr.message); setSaving(false); return; }
        const uid = data.user?.id;
        if (!uid) { setError("Erreur lors de la création du compte."); setSaving(false); return; }
        await saveData(uid);
        if (role === "athlete") {
          const today = new Date().toISOString().split("T")[0];
          const { base_score, score } = computeWellnessScore(wSleep, wStress, wRecovery, wMotivation, wBehaviors);
          await supabase.from("wellness_daily").upsert(
            { user_id: uid, date: today, sleep: wSleep, stress: wStress, recovery: wRecovery, motivation: wMotivation, behaviors: wBehaviors, bedtime: wBedtime, base_score, score },
            { onConflict: "user_id,date" }
          );
        }
        posthog.identify(uid, { email: email.trim(), role });
        posthog.capture("account_created", { role });
        fetch("/api/brevo/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), name: name.trim(), role, status: "free" }),
        });
        await fetch("/api/invite/link", { method: "POST" });
        if (role === "athlete") {
          const storedCode = typeof window !== "undefined" ? localStorage.getItem("coach_invite_code") : null;
          if (storedCode) {
            await fetch("/api/invite/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invite_code: storedCode }),
            });
            localStorage.removeItem("coach_invite_code");
          }
        }
        if (!data.session) {
          setEmailSent(true);
          setSaving(false);
          return;
        }
        const claimId = typeof window !== "undefined" ? localStorage.getItem("claim_program_id") : null;
        if (claimId) {
          try {
            const claimRes = await fetch("/api/programs/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ programId: claimId }),
            });
            if (!claimRes.ok) throw Object.assign(new Error("claim"), { status: claimRes.status });
            const { programId: copiedId } = await claimRes.json();
            if (role === "athlete") {
              const assignRes = await fetch(`/api/programs/${copiedId}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_date: getNextMonday(), user_id: uid }),
              });
              if (!assignRes.ok) throw Object.assign(new Error("assign"), { status: assignRes.status });
            } else if (role === "coach") {
              const { data: firstAthlete } = await supabase.from("coach_athletes").select("id").eq("coach_id", uid).limit(1).maybeSingle();
              if (firstAthlete?.id) {
                await supabase.from("coach_sessions").delete().eq("coach_id", uid).eq("athlete_id", firstAthlete.id);
                await fetch(`/api/programs/${copiedId}/assign`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ start_date: getNextMonday(), athlete_id: firstAthlete.id }),
                });
                localStorage.setItem("program_start_date", getNextMonday());
              }
            }
          } catch (err: unknown) {
            const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 0;
            if (status !== 409 && role === "athlete") {
              await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, trainingDays));
            }
          } finally {
            localStorage.removeItem("claim_program_id");
          }
        }
        setSaving(false);
        window.location.href = role === "coach" ? "/coach" : "/today";
      } else {
        await saveData(userId!);
        const claimId = typeof window !== "undefined" ? localStorage.getItem("claim_program_id") : null;
        if (claimId) {
          try {
            const claimRes = await fetch("/api/programs/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ programId: claimId }),
            });
            if (!claimRes.ok) throw Object.assign(new Error("claim"), { status: claimRes.status });
            const { programId: copiedId } = await claimRes.json();
            if (role === "athlete") {
              const assignRes = await fetch(`/api/programs/${copiedId}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ start_date: getNextMonday(), user_id: userId }),
              });
              if (!assignRes.ok) throw Object.assign(new Error("assign"), { status: assignRes.status });
            } else if (role === "coach") {
              const { data: firstAthlete } = await supabase.from("coach_athletes").select("id").eq("coach_id", userId!).limit(1).maybeSingle();
              if (firstAthlete?.id) {
                await supabase.from("coach_sessions").delete().eq("coach_id", userId!).eq("athlete_id", firstAthlete.id);
                await fetch(`/api/programs/${copiedId}/assign`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ start_date: getNextMonday(), athlete_id: firstAthlete.id }),
                });
                localStorage.setItem("program_start_date", getNextMonday());
              }
            }
          } catch (err: unknown) {
            const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 0;
            if (status !== 409 && role === "athlete") {
              await supabase.from("sessions").insert(buildAthleteSessions(userId!, sport, level, trainingDays));
            }
          } finally {
            localStorage.removeItem("claim_program_id");
          }
        }
        window.location.href = role === "coach" ? "/coach" : "/today";
      }
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  function handleWellnessQuestions() {
    if (wStep < WQ_TOTAL - 1) { setWStep(s => s + 1); return; }
    const { score } = computeWellnessScore(wSleep, wStress, wRecovery, wMotivation, wBehaviors);
    setWScore(score);
    next();
  }

  async function handleGoogleRegister() {
    const pending: PendingData = {
      role, sport, sportPrecision, level, goal, frustration, trainingDays,
      coachingContext, athleteCount, coachingChallenge, currentTool, name,
      wSleep, wBedtime, wStress, wRecovery, wBehaviors, wMotivation, wScore,
    };
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pending)))));
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?d=${encoded}` },
    });
    if (oauthErr) setError(oauthErr.message);
  }

  useEffect(() => {
    if (!pendingData || !userId) return;
    const init = async () => {
      try {
        /* Récupère le nom depuis les métadonnées Google si non renseigné */
        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email || "";
        const googleName = (user?.user_metadata?.full_name as string || "").split(" ")[0] || "";
        const finalName = pendingData.name?.trim() || googleName;
        /* Injecte le nom dans le state pour que saveData le prenne */
        if (finalName) setName(finalName);

        await saveData(userId);

        /* Si le nom venait de Google, on force une mise à jour du profil */
        if (!pendingData.name?.trim() && finalName) {
          await supabase.from("profiles").update({ name: finalName }).eq("user_id", userId);
        }

        if (pendingData.role === "athlete") {
          const today = new Date().toISOString().split("T")[0];
          const { base_score, score } = computeWellnessScore(wSleep, wStress, wRecovery, wMotivation, wBehaviors);
          await supabase.from("wellness_daily").upsert(
            { user_id: userId, date: today, sleep: wSleep, stress: wStress, recovery: wRecovery, motivation: wMotivation, behaviors: wBehaviors, bedtime: wBedtime, base_score, score },
            { onConflict: "user_id,date" }
          );
        }

        posthog.identify(userId, { email: userEmail, role: pendingData.role });
        posthog.capture("account_created", { role: pendingData.role, method: "google" });
        fetch("/api/brevo/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, name: finalName, role: pendingData.role, status: "free" }),
        });
        await fetch("/api/invite/link", { method: "POST" });
        window.location.href = pendingData.role === "coach" ? "/coach" : "/today";
      } catch {
        setInitializing(false);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  const sessionCount  = trainingDays.length + (trainingDays.length < 6 ? 1 : 0);
  const progressSteps = path.filter(s => !POST_PROGRESS.includes(s));
  const progressIdx   = progressSteps.indexOf(currentStep);
  const showProgress  = !POST_PROGRESS.includes(currentStep);

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 14, border: "none",
    background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
    fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)", marginBottom: 10,
  };
  const skipBtn: React.CSSProperties = {
    width: "100%", background: "none", border: "none",
    fontSize: 12, color: "#8a8f94", cursor: "pointer", padding: "4px 0",
  };
  const backOnlyBtn: React.CSSProperties = {
    display: "block", background: "none", border: "none",
    color: "#8a8f94", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 0", marginTop: 2,
  };

  const wBehaviorPenalty = Math.min(wBehaviors.length * 3, 15);

  if (hasClaimedProgram === null) {
    return (
      <AuthBackground>
        <div style={{ width: "100%", maxWidth: 430, background: "rgba(255,255,255,.94)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 24, padding: 18, boxShadow: "0 26px 80px rgba(0,0,0,.40)", minHeight: 280 }} />
      </AuthBackground>
    );
  }

  if (initializing) {
    return (
      <AuthBackground>
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Création de ton espace…</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
        </div>
      </AuthBackground>
    );
  }

  return (
    <AuthBackground>
      <div style={{ width: "100%", maxWidth: 430, background: "rgba(255,255,255,.94)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 24, padding: 18, boxShadow: "0 26px 80px rgba(0,0,0,.40)" }}>

        {showProgress && (
          <div style={{ display: "inline-flex", marginBottom: 10, padding: "6px 10px", borderRadius: 999, background: "rgba(212,64,0,.08)", color: "#d44000", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Configuration
          </div>
        )}
        {showProgress && (
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {progressSteps.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= progressIdx ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
            ))}
          </div>
        )}

        <div key={currentStep} style={{ animation: "stepIn 0.22s ease" }}>
        {/* ── 1. ROLE ── */}
        {currentStep === "role" && (
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Tu es ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
              Cette réponse détermine ton parcours et les données préparées pour toi.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {[
                { r: "athlete" as Role, icon: "🏋️", label: "Sportif",  sub: "Je suis mon propre entraînement" },
                { r: "coach"   as Role, icon: "📋", label: "Coach",    sub: "Je gère des sportifs" },
              ].map(({ r, icon, label, sub }) => (
                <div key={r} onClick={() => { setRole(r); posthog.setPersonProperties({ role: r }); }}
                  style={{ cursor: "pointer", borderRadius: 14, padding: "16px 14px", border: role === r ? "2px solid #d44000" : "1.5px solid rgba(0,0,0,.10)", background: role === r ? "rgba(212,64,0,.05)" : "#fff", transition: "all .15s" }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: role === r ? "#d44000" : "#1f2428", marginBottom: 3 }}>{icon} {label}</div>
                  <div style={{ fontSize: 12, color: "#8a8f94" }}>{sub}</div>
                </div>
              ))}
            </div>
            <button onClick={next} style={{ ...ctaBtn, marginBottom: 0 }}>Continuer →</button>
          </div>
        )}

        {/* ── VALUE SLIDES ── */}
        {currentStep === "value_slides" && (() => {
          const cardAdaptatif = (
            <div style={{ background: "#fff", borderRadius: 12, padding: "10px 12px", width: 160, boxShadow: "0 8px 24px rgba(0,0,0,.28)", border: "1px solid rgba(212,64,0,.12)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#171b1f", lineHeight: 1.2 }}>Séance dure isolée</span>
                <span style={{ fontSize: 7, fontWeight: 900, background: "rgba(212,64,0,.10)", color: "#d44000", padding: "2px 5px", borderRadius: 999, whiteSpace: "nowrap" }}>CHARGE HAUTE</span>
              </div>
              <div style={{ fontSize: 10, color: "#62686e", lineHeight: 1.45 }}>OK si elle reste isolée : garde la variation autour pour préserver la récupération.</div>
            </div>
          );
          const cardBlessures = (
            <div style={{ borderRadius: 12, width: 155, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.38)" }}>
              <div style={{ background: "#1e1e1e", padding: "9px 11px" }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,.45)", letterSpacing: "0.12em", marginBottom: 3 }}>🌙 SOMMEIL</div>
                <div style={{ fontSize: 10, color: "#fff", lineHeight: 1.4 }}>Couche-toi avant 22h30. Vise 8h minimum.</div>
              </div>
              <div style={{ background: "#161616", padding: "9px 11px" }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,.45)", letterSpacing: "0.12em", marginBottom: 3 }}>💧 HYDRATATION</div>
                <div style={{ fontSize: 10, color: "#fff", lineHeight: 1.4 }}>×1.5 ta norme. 500ml dès le réveil.</div>
              </div>
            </div>
          );
          const cardProgression = (
            <div style={{ background: "#fff", borderRadius: 12, padding: "10px 12px", width: 160, boxShadow: "0 8px 24px rgba(0,0,0,.28)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "#171b1f" }}>Squat + tirages</span>
                <span style={{ fontSize: 7, fontWeight: 900, background: "rgba(47,158,68,.10)", color: "#2f9e44", padding: "2px 5px", borderRadius: 999 }}>Terminé ✓</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "#e7e4df", overflow: "hidden", marginBottom: 7 }}>
                <div style={{ height: "100%", width: "75%", background: "linear-gradient(90deg,#ffb5a7,#d44000)", borderRadius: 999 }} />
              </div>
              {["Back squat — 5×5", "Snatch pull — 4×3", "Gainage — 8 min"].map((ex, i) => (
                <div key={i} style={{ fontSize: 9, color: "#2c3236", padding: "4px 7px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "rgba(0,0,0,.025)" }}>{ex}</div>
              ))}
            </div>
          );
          const cardCoach = (
            <div style={{ background: "linear-gradient(180deg,#fff,#fff5ef)", border: "1.5px solid rgba(212,64,0,.40)", borderRadius: 13, padding: "10px 11px", width: 170, boxShadow: "0 10px 24px rgba(212,64,0,.18)", position: "relative" }}>
              <div style={{ position: "absolute", top: 8, right: 10, width: 7, height: 7, borderRadius: "50%", background: "#d44000" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                {/* mini wellness ring — score 88, size 36 */}
                <div style={{ position: "relative", flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(145deg,#171717,#2f2f2f)" }}>
                  <svg width={36} height={36} viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)", display: "block" }}>
                    <circle cx={18} cy={18} r={15} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
                    <circle cx={18} cy={18} r={15} fill="none" stroke="#2f9e44" strokeWidth={3} strokeDasharray={94.2} strokeDashoffset={11.3} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 1000, color: "#2f9e44" }}>88</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 950, color: "#1f2428", marginBottom: 3 }}>Thomas M.</div>
                  <span style={{ fontSize: 7, fontWeight: 900, background: "#d44000", color: "#fff", padding: "2px 5px", borderRadius: 999 }}>ATTENTION REQUISE</span>
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#444", lineHeight: 1.4 }}>Séance dure prévue : vérifier qu'il n'enchaîne pas dur.</div>
            </div>
          );

          const athleteSlides = [
            { img: "https://www.theperfclub.com/wp-content/uploads/2023/03/massage-et-recuperation.jpeg",          category: "ENTRAÎNEMENT ADAPTATIF", title: "Entraînement adaptatif intelligent",   stat: "68%",  desc: "des sportifs s'entraînent trop fort les mauvais jours. ThePerfClub ajuste chaque séance à ton état du jour.", card: cardAdaptatif },
            { img: "https://www.theperfclub.com/wp-content/uploads/2025/03/prevenir-et-guerir-dune-tendinite-au-genou-scaled.avif", category: "PRÉVENTION BLESSURES",    title: "Réduire les blessures",              stat: "3×",   desc: "plus de risque de blessure quand la charge dépasse la récupération réelle.", card: cardBlessures },
            { img: "https://www.theperfclub.com/wp-content/uploads/2022/06/lathle%CC%80te-scaled.jpg",             category: "PROGRESSION",              title: "Optimiser la progression",           stat: "−35%", desc: "de performance quand on ignore les signaux de fatigue. Sache quand pousser et quand récupérer.", card: cardProgression },
          ];
          const coachSlides = [
            { img: "https://www.theperfclub.com/wp-content/uploads/2026/06/Capture-decran-2026-06-02-a-3.40.48-PM.jpg", category: "COACHING PERSONNALISÉ",   title: "Séances personnalisées à l'échelle", stat: "68%",  desc: "des séances dépassent l'intensité prévue faute de données de forme. Adaptez chaque programme au signal du jour.", card: cardCoach },
            { img: "https://www.theperfclub.com/wp-content/uploads/2025/03/prevenir-et-guerir-dune-tendinite-au-genou-scaled.avif", category: "PRÉVENTION BLESSURES",    title: "Réduire les blessures",              stat: "3×",   desc: "plus de blessures quand la fatigue collective n'est pas détectée avant la séance.", card: cardBlessures },
            { img: "https://www.theperfclub.com/wp-content/uploads/2022/06/lathle%CC%80te-scaled.jpg",              category: "PROGRESSION",              title: "Optimiser la progression",           stat: "−35%", desc: "de progression perdue quand la charge n'est pas ajustée au signal du jour.", card: cardProgression },
          ];
          const slides = role === "athlete" ? athleteSlides : coachSlides;
          const slide = slides[vSlide];
          return (
            <div style={{ margin: "-18px", borderRadius: 24, overflow: "hidden", background: "#fff" }}>
              {/* Photo */}
              <div
                onClick={() => { if (vSlide < 2) setVSlide(v => v + 1); }}
                style={{ position: "relative", height: 270, cursor: vSlide < 2 ? "pointer" : "default", overflow: "hidden", userSelect: "none" }}>
                <img src={slide.img} alt={slide.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {/* top nav */}
                <div style={{ position: "absolute", top: 14, left: 14, right: 14, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 4 }}>
                  <button
                    onClick={e => { e.stopPropagation(); if (vSlide > 0) setVSlide(v => v - 1); else back(); }}
                    style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 999 }}>
                    ← Retour
                  </button>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ height: 3, borderRadius: 2, background: i === vSlide ? "#fff" : "rgba(255,255,255,0.40)", width: i === vSlide ? 20 : 6, transition: "all 0.2s" }} />
                    ))}
                  </div>
                </div>
                {/* floating card - middle right */}
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 3 }}>
                  {slide.card}
                </div>
                {/* bottom overlay */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "52px 16px 14px", background: "linear-gradient(transparent,rgba(0,0,0,0.86))", zIndex: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: "#f04a08", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                    THEPERFCLUB · {slide.category}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 1000, color: "#fff", lineHeight: 1.15, letterSpacing: "-0.03em" }}>
                    {slide.title}
                  </div>
                </div>
              </div>

              {/* Text section */}
              <div style={{ padding: "16px 18px 20px" }}>
                <div style={{ fontSize: 46, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 6 }}>
                  {slide.stat}
                </div>
                <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.65, marginBottom: 16 }}>
                  {slide.desc}
                </div>
                {vSlide < 2 ? (
                  <button
                    onClick={e => { e.stopPropagation(); setVSlide(v => v + 1); }}
                    style={{ width: "100%", height: 44, borderRadius: 12, border: "1.5px solid rgba(212,64,0,.35)", background: "rgba(212,64,0,.06)", color: "#d44000", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                    Continuer →
                  </button>
                ) : (
                  <button onClick={next} style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}>
                    C'est parti →
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 2A-1. SPORT ATHLETE ── */}
        {currentStep === "sport_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On génère des séances adaptées à ta discipline.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => (
                <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id}
                  onClick={() => {
                    setSport(s.id);
                    if (s.id !== "Autre" && isRegisterMode) nextAfterChoice(() => {});
                  }} />
              ))}
            </div>
            {sport === "Autre" && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text" value={sportPrecision}
                  onChange={e => setSportPrecision(e.target.value)}
                  placeholder="Précise ton sport (ex : rugby, yoga, escalade…)"
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  autoFocus
                />
              </div>
            )}
            {isRegisterMode
              ? sport === "Autre"
                ? <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!sportPrecision.trim()} />
                : <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2A-2. LEVEL ── */}
        {currentStep === "level_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton niveau actuel ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Cela ajuste l'intensité des séances générées.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {([
                { key: "beginner" as Level, icon: "🌱", title: "Débutant",      sub: "Je structure mon entraînement" },
                { key: "intermediate" as Level, icon: "📈", title: "Intermédiaire", sub: "J'ai une pratique régulière" },
                { key: "elite" as Level, icon: "🏆", title: "Compétiteur",   sub: "Je prépare des compétitions" },
              ] as const).map(l => (
                <Choice key={l.key} icon={l.icon} title={l.title} sub={l.sub} selected={level === l.key}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setLevel(l.key)) : setLevel(l.key)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2A-3. GOAL ── */}
        {currentStep === "goal_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton objectif principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>ThePerfClub adapte son suivi à ce qui compte pour toi.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Progresser en performance",             icon: "🎯" },
                { id: "Éviter le surmenage et les blessures",  icon: "😴" },
                { id: "Mieux récupérer entre les séances",     icon: "🔄" },
                { id: "Structurer et suivre mon entraînement", icon: "📊" },
              ].map(o => (
                <Choice key={o.id} icon={o.icon} title={o.id} sub="" selected={goal === o.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setGoal(o.id)) : setGoal(o.id)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!goal} />
            }
          </div>
        )}

        {/* ── 2A-4. FRUSTRATION ── */}
        {currentStep === "frustration_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ta plus grande frustration ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Ça nous aide à prioriser ce qui compte le plus.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Les programmes sont trop rigides, pas adaptés à mon état du jour", icon: "📋" },
                { id: "Je ne sais pas quand forcer et quand récupérer",                   icon: "😵" },
                { id: "Je manque de structure et de suivi",                               icon: "🗂️" },
                { id: "Je perds du temps sans progresser vraiment",                        icon: "⏱️" },
              ].map(f => (
                <Choice key={f.id} icon={f.icon} title={f.id} sub="" selected={frustration === f.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setFrustration(f.id)) : setFrustration(f.id)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!frustration} />
            }
          </div>
        )}

        {/* ── 2A-5. JOURS D'ENTRAÎNEMENT ── */}
        {currentStep === "days_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Quels sont tes jours d'entraînement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 18 }}>Tes séances seront planifiées sur ces jours.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginBottom: 8 }}>
              {([
                { dow: 1, short: "L",  full: "Lun." },
                { dow: 2, short: "M",  full: "Mar." },
                { dow: 3, short: "M",  full: "Mer." },
                { dow: 4, short: "J",  full: "Jeu." },
                { dow: 5, short: "V",  full: "Ven." },
                { dow: 6, short: "S",  full: "Sam." },
                { dow: 0, short: "D",  full: "Dim." },
              ] as const).map(({ dow, short, full }) => {
                const selected = trainingDays.includes(dow);
                return (
                  <div
                    key={dow}
                    onClick={() => setTrainingDays(prev => {
                      if (prev.includes(dow)) {
                        if (prev.length === 1) return prev;
                        return prev.filter(d => d !== dow);
                      }
                      const order = [1, 2, 3, 4, 5, 6, 0];
                      return [...prev, dow].sort((a, b) => order.indexOf(a) - order.indexOf(b));
                    })}
                    style={{
                      borderRadius: 12, padding: "10px 2px", cursor: "pointer", textAlign: "center",
                      border: selected ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)",
                      background: selected ? "#171b1f" : "#fff",
                      transition: "all .12s",
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 900, color: selected ? "#fff" : "#171b1f" }}>{short}</div>
                    <div style={{ fontSize: 9, color: selected ? "rgba(255,255,255,.55)" : "#8a8f94", marginTop: 2, fontWeight: 600 }}>{full}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#8a8f94", marginBottom: 14, textAlign: "center" }}>
              {trainingDays.length} jour{trainingDays.length > 1 ? "s" : ""} sélectionné{trainingDays.length > 1 ? "s" : ""}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Continuer →" nextDisabled={trainingDays.length === 0} />
          </div>
        )}

        {/* ── PAIN POINTS ATHLETE ── */}
        {currentStep === "overload_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que ça t'arrive de faire des séances plus dures que prévu ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Ça nous aide à calibrer ton suivi d'intensité.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je maîtrise toujours mon intensité",
                "Parfois, mais je sais m'arrêter",
                "Souvent, je pousse quand j'y suis",
                "Tout le temps, j'envoie tout à chaque fois",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={overloadAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setOverloadAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {currentStep === "planning_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que tu as des difficultés à prévoir ta charge d'entraînement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>La planification adaptative, c'est le cœur de ThePerfClub.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, j'ai un plan clair que je respecte",
                "Un peu, je m'adapte souvent au ressenti",
                "Souvent, c'est flou d'une semaine à l'autre",
                "Complètement, je fais entièrement au feeling",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={planningAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setPlanningAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {currentStep === "fatigue_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que tu t'entraînes dur même quand tu es fatigué ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Le wellness score t'aide à prendre les bonnes décisions.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je sais récupérer quand il le faut",
                "Parfois, si la séance est importante",
                "Souvent, la fatigue ne change pas mon plan",
                "Tout le temps, je pousse quoi qu'il arrive",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={fatigueAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setFatigueAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {/* ── 2B-1. COACHING CONTEXT ── */}
        {currentStep === "context_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton contexte de coaching ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour adapter les outils à ta réalité terrain.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Coach",                                   icon: "👤", sub: "Individuel ou en groupe" },
                { id: "Préparateur physique",                    icon: "🏋️", sub: "Individuel ou collectif" },
                { id: "Kiné ou professionnel de la réhabilitation", icon: "🩺", sub: "Suivi santé & retour à l'effort" },
                { id: "Autre",                                   icon: "⚡", sub: "Coach wellness, nutritionniste…" },
              ].map(c => (
                <Choice key={c.id} icon={c.icon} title={c.id} sub={c.sub} selected={coachingContext === c.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCoachingContext(c.id)) : setCoachingContext(c.id)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingContext} />
            }
          </div>
        )}

        {/* ── 2B-2. SPORT COACH ── */}
        {currentStep === "sport_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On paramètre les modèles de séances proposés.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => (
                <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id}
                  onClick={() => {
                    setSport(s.id);
                    if (s.id !== "Autre" && isRegisterMode) nextAfterChoice(() => {});
                  }} />
              ))}
            </div>
            {sport === "Autre" && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text" value={sportPrecision}
                  onChange={e => setSportPrecision(e.target.value)}
                  placeholder="Précise le sport de tes sportifs (ex : rugby, natation…)"
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  autoFocus
                />
              </div>
            )}
            {isRegisterMode
              ? sport === "Autre"
                ? <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!sportPrecision.trim()} />
                : <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2B-3. ATHLETE COUNT ── */}
        {currentStep === "count_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Combien de sportifs tu gères ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour dimensionner les outils de suivi collectif.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                { v: "1–5 sportifs",   sub: "Coaching rapproché" },
                { v: "6–20 sportifs",  sub: "Groupe moyen" },
                { v: "21–50 sportifs", sub: "Large effectif" },
                { v: "50+ sportifs",   sub: "Structure club" },
              ].map(c => (
                <Choice key={c.v} icon="" title={c.v} sub={c.sub} selected={athleteCount === c.v}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setAthleteCount(c.v)) : setAthleteCount(c.v)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!athleteCount} />
            }
          </div>
        )}

        {/* ── 2B-4. CHALLENGE ── */}
        {currentStep === "challenge_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton plus grand défi de coaching ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On priorise les fonctionnalités qui t'aident le plus.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Suivre la charge collective de mes sportifs",  icon: "📊" },
                { id: "Personnaliser l'entraînement par sportif",      icon: "🎯" },
                { id: "Créer des programmes facilement",               icon: "📝" },
                { id: "Communiquer efficacement avec mes sportifs",    icon: "💬" },
                { id: "Trop d'outils différents, pas assez de temps",  icon: "⏱️" },
              ].map(c => (
                <Choice key={c.id} icon={c.icon} title={c.id} sub="" selected={coachingChallenge === c.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCoachingChallenge(c.id)) : setCoachingChallenge(c.id)} />
              ))}
            </div>
            {isRegisterMode
              ? <button onClick={back} style={backOnlyBtn}>← Retour</button>
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingChallenge} />
            }
          </div>
        )}

        {/* ── 2B-5. CURRENT TOOL ── */}
        {currentStep === "tool_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Tu utilises quoi actuellement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour mieux comprendre ce que tu vas remplacer.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Excel / Sheets",   icon: "📊", sub: "Tableur" },
                { id: "Une autre app",    icon: "📱", sub: "Coaching app" },
                { id: "Papier / rien",    icon: "📝", sub: "Non structuré" },
                { id: "Plusieurs outils", icon: "🔀", sub: "En parallèle" },
              ].map(t => (
                <Choice key={t.id} icon={t.icon} title={t.id} sub={t.sub} selected={currentTool === t.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCurrentTool(t.id)) : setCurrentTool(t.id)} />
              ))}
            </div>
            {!isRegisterMode && isLast
              ? <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving || !currentTool} />
              : !isRegisterMode
                ? <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!currentTool} />
                : <button onClick={back} style={backOnlyBtn}>← Retour</button>
            }
          </div>
        )}

        {/* ── PAIN POINTS COACH ── */}
        {currentStep === "overload_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que tes sportifs trouvent tes séances plus dures que prévu ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Le RPE réel vs prévu, ThePerfClub le suit automatiquement.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Rarement, ils respectent bien la charge prévue",
                "Parfois, quelques cas isolés",
                "Souvent, le RPE réel dépasse régulièrement",
                "Très souvent, c'est un problème récurrent",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={overloadCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setOverloadCoachAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {currentStep === "planning_time_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que la planification de la charge te prend trop de temps ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>ThePerfClub automatise cette partie.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, j'ai un process bien rodé",
                "Un peu, mais ça reste gérable",
                "Oui, c'est souvent chronophage",
                "Oui, c'est le principal frein de ma semaine",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={planningCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setPlanningCoachAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {currentStep === "fatigue_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Est-ce que tu maintiens des séances dures quand tes sportifs se sentent fatigués ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Les alertes wellness détectent ça en temps réel pour toi.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je m'adapte toujours au ressenti",
                "Parfois, selon la période du cycle",
                "Souvent, difficile de modifier le plan en cours",
                "Oui, je préfère maintenir le programme prévu",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={fatigueCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setFatigueCoachAns(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {/* ── SCORE AUTORÉGULATION SPORTIF ── */}
        {currentStep === "autoreg_score" && (
          <AutoRegScoreStep
            overloadAns={overloadAns}
            planningAns={planningAns}
            fatigueAns={fatigueAns}
            frustration={frustration}
            onNext={next}
          />
        )}

        {/* ── SCORE AUTORÉGULATION COACH ── */}
        {currentStep === "autoreg_score_coach" && (
          <AutoRegScoreStepCoach
            overloadCoachAns={overloadCoachAns}
            planningCoachAns={planningCoachAns}
            fatigueCoachAns={fatigueCoachAns}
            onNext={next}
          />
        )}

        {/* ── 3. ACCOUNT ── */}
        {currentStep === "account" && (emailSent ? <EmailSentScreen email={email} /> : (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>{role === "coach" ? "Tes sportifs t'attendent" : "Ton programme personnalisé t'attend"}</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>Crée ton compte pour y accéder.</div>
            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                {error}{" "}
                {(error.toLowerCase().includes("déjà") || error.toLowerCase().includes("already") || error.toLowerCase().includes("registered")) && (
                  <Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Me connecter</Link>
                )}
              </div>
            )}

            <button
              type="button" onClick={handleGoogleRegister} disabled={saving}
              style={{ width: "100%", height: 48, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}
            >
              <GoogleIcon />
              Continuer avec Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
              <span style={{ fontSize: 12, color: "#8a8f94" }}>ou avec email</span>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
            </div>

            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Prénom</div>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Alex" style={inputStyle} />
            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" style={inputStyle} />
            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Mot de passe</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" minLength={8} style={{ ...inputStyle, marginBottom: 0, paddingRight: 48 }} />
              <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 13, padding: 0 }}>
                {showPwd ? "Masquer" : "Afficher"}
              </button>
            </div>
            <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon compte →"} nextDisabled={saving || !name.trim() || !email.trim() || password.length < 8} />
            <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94", marginTop: 14, lineHeight: 1.6 }}>
              Déjà un compte ?{" "}<Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Se connecter</Link>
            </div>
          </div>
        ))}

        {/* ── WEEK PREVIEW SPORTIF ── */}
        {currentStep === "week_preview_2a" && (
          <WeekPreviewStep sport={sport} level={level} trainingDays={trainingDays} onNext={next} programFlow={hasClaimedProgram} />
        )}

        {/* ── WEEK PREVIEW COACH ── */}
        {currentStep === "week_preview_2b" && (
          <WeekPreviewStepCoach sport={sport} athleteCount={parseInt(athleteCount) || 1} onNext={next} />
        )}

        {/* ── WELLNESS QUESTIONS (athlete, avant account) ── */}
        {currentStep === "wellness_q" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#d44000", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              💓 Wellness du jour
            </div>
            <div style={{ display: "flex", gap: 3, marginBottom: 20 }}>
              {Array.from({ length: WQ_TOTAL }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= wStep ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
              ))}
            </div>

            {wStep === 0 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>😴 Comment as-tu dormi ?</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>Qualité et récupération pendant le sommeil</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wSleep} step={1} onChange={e => setWSleep(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wSleep}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94", marginBottom: 16 }}>
                  <span>Très mauvais</span><span>Excellent</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#62686e", marginBottom: 6 }}>Heure de coucher</div>
                <select value={wBedtime} onChange={e => setWBedtime(e.target.value)} style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                  {BEDTIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            {wStep === 1 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>🧠 Niveau de stress mental</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>Travail, vie personnelle, charge mentale</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wStress} step={1} onChange={e => setWStress(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wStress}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Zen total</span><span>Très élevé</span>
                </div>
              </div>
            )}

            {wStep === 2 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>💪 État physique aujourd'hui</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>Ressenti musculaire, douleurs, lourdeur</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wRecovery} step={1} onChange={e => setWRecovery(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wRecovery}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Courbatures sévères</span><span>Frais et dispo</span>
                </div>
              </div>
            )}

            {wStep === 3 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>🔍 Comportements d'hier soir</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 12 }}>Coche tout ce qui s'applique</div>

                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c81e1e", marginBottom: 8 }}>
                  Ce qui m'a pénalisé
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
                  {NEGATIVE_BEHAVIORS.map(b => {
                    const checked = wBehaviors.includes(b.key);
                    return (
                      <button key={b.key} onClick={() => toggleBehavior(b.key)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, border: checked ? "1px solid rgba(200,30,30,.40)" : "1px solid rgba(0,0,0,.10)", background: checked ? "rgba(200,30,30,.08)" : "#fff", color: checked ? "#c81e1e" : "#62686e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all .14s" }}>
                        <span style={{ fontSize: 15 }}>{b.emoji}</span>{b.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2f9e44", marginBottom: 8 }}>
                  Ce que j'ai fait de bien
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {POSITIVE_BEHAVIORS.map(b => {
                    const checked = wBehaviors.includes(b.key);
                    return (
                      <button key={b.key} onClick={() => toggleBehavior(b.key)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, border: checked ? "1px solid rgba(47,158,68,.40)" : "1px solid rgba(0,0,0,.10)", background: checked ? "rgba(47,158,68,.08)" : "#fff", color: checked ? "#2f9e44" : "#62686e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all .14s" }}>
                        <span style={{ fontSize: 15 }}>{b.emoji}</span>{b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {wStep === 4 && (
              <div>
                <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>⚡ As-tu envie de t'entraîner ?</div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>Motivation intrinsèque du moment</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wMotivation} step={1} onChange={e => setWMotivation(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wMotivation}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Pas du tout</span><span>Au max</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, position: "sticky", bottom: 0, margin: "16px -18px -18px", padding: "14px 18px 20px", background: "linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.92) 28%,#fff 50%)" }}>
              <button onClick={() => wStep > 0 ? setWStep(s => s - 1) : back()}
                style={{ flex: 1, height: 44, borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ← Retour
              </button>
              <button onClick={handleWellnessQuestions}
                style={{ flex: 1, height: 44, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}>
                {wStep === WQ_TOTAL - 1 ? "Voir mon score →" : "Suivant →"}
              </button>
            </div>
          </div>
        )}

        </div>
      </div>
    </AuthBackground>
  );
}
