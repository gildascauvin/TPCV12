"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { getSessionTemplates, nextDateForDow } from "@/lib/sessionTemplates";
import Link from "next/link";
import AuthBackground from "@/components/auth/AuthBackground";
import PaywallModal from "@/components/paywall/PaywallModal";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "role"
  | "value_slides"
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"
  | "overload_2a" | "planning_2a" | "fatigue_2a"
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"
  | "wellness_q"
  | "account"
  | "readiness_4a" | "preview_4b"
  | "invite_share"
  | "social_proof"
  | "recap_5";

type PendingData = {
  role: Role; sport: string; sportPrecision: string; level: Level;
  goal: string; frustration: string; trainingDays: number[];
  coachingContext: string; athleteCount: string; coachingChallenge: string; currentTool: string;
  name: string; wSleep: number; wBedtime: string; wStress: number; wRecovery: number;
  wBehaviors: string[]; wMotivation: number; wScore: number | null;
};
interface Props { userId?: string; pendingData?: PendingData | null }

const ATHLETE_PATH: StepId[] = [
  "role", "value_slides",
  "sport_2a", "level_2a", "goal_2a", "frustration_2a", "days_2a",
  "overload_2a", "planning_2a", "fatigue_2a",
  "wellness_q", "account", "readiness_4a", "social_proof", "recap_5",
];
const COACH_PATH: StepId[] = [
  "role", "value_slides",
  "context_2b", "sport_2b", "count_2b", "challenge_2b", "tool_2b",
  "overload_2b", "planning_time_2b", "fatigue_2b",
  "account", "preview_4b", "invite_share", "social_proof", "recap_5",
];

const POST_PROGRESS: StepId[] = ["value_slides", "wellness_q", "readiness_4a", "preview_4b", "invite_share", "social_proof", "recap_5"];

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

const BEHAVIORS = [
  { key: "alcohol",      emoji: "🍷", label: "Alcool" },
  { key: "late_sleep",   emoji: "🌙", label: "Couché tardif" },
  { key: "tobacco",      emoji: "🚬", label: "Tabac" },
  { key: "screen_late",  emoji: "📱", label: "Écran tard" },
  { key: "heavy_meal",   emoji: "🍔", label: "Repas lourd" },
  { key: "caffeine_late",emoji: "☕", label: "Caféine tard" },
  { key: "social_out",   emoji: "🎉", label: "Sortie sociale" },
  { key: "travel",       emoji: "✈️", label: "Voyage" },
];

const PRICING_ONBOARDING = {
  athlete: { monthly: 9,  annual: 59,  annualMonthly: "4,92" },
  coach:   { monthly: 49, annual: 179, annualMonthly: "14,92" },
};

function scoreColor(s: number | null) {
  if (s === null) return "rgba(255,255,255,0.18)";
  return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000";
}
function formLabel(s: number | null) {
  if (s === null) return "—";
  if (s >= 82) return "Zone optimale";
  if (s >= 65) return "Zone stable";
  if (s >= 45) return "Zone prudente";
  return "Zone récupération";
}
function getWellnessAdvice(score: number) {
  return {
    training: score >= 80
      ? `Score excellent (${score}/100). Fenêtre idéale pour une séance qualitative.`
      : score >= 65
      ? `Forme correcte (${score}/100). Intensité normale.`
      : score >= 45
      ? `Fatigue modérée (${score}/100). Allège légèrement l'intensité.`
      : `Score bas (${score}/100). Réduis l'intensité de 20–30%.`,
    recovery: score >= 75
      ? "Maintiens les bons signaux : hydratation, protéines et coucher régulier."
      : score >= 55
      ? "Priorise hydratation 35ml/kg, protéines 1,6–2g/kg/j et coucher avant 23h."
      : "Récupération prioritaire : sommeil, nutrition simple, pas d'effort max.",
  };
}

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

function buildCoachDemoSessions(coachId: string, athleteId: string, sport: string) {
  const templates = getSessionTemplates(sport);
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const dateForDow = (d: number, weekOffset: number): string => {
    const offset = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
    const y = result.getFullYear();
    const m = String(result.getMonth() + 1).padStart(2, "0");
    const day = String(result.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const sessions: object[] = [];
  for (const weekOffset of [0, 1]) {
    [1, 3, 5, 6].forEach((d, i) => {
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: dateForDow(d, weekOffset), name, notes, done: false, target_difficulty: 7 });
    });
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

/* ── WellnessRing (dark, identical to /today) ── */
function WellnessRingDark({ score, size = 96 }: { score: number | null; size?: number }) {
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
        <span style={{ fontSize: Math.round(size * 0.085), fontWeight: 1000, color: "rgba(255,255,255,0.58)", letterSpacing: "0.14em", marginTop: 2, textTransform: "uppercase" }}>
          wellness
        </span>
      </div>
    </div>
  );
}

/* ── WellnessRing for MissionCard (dark bg sphere, identical to /coach) ── */
function WellnessRingCoach({ score, size = 72 }: { score: number; size?: number }) {
  const r = Math.round(size * 0.423);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - Math.max(0, Math.min(100, score)) / 100)).toFixed(1);
  const sw = Math.round(size * 0.077);
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 16px rgba(0,0,0,.18))" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.307), fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color }}>{score}</span>
        <span style={{ fontSize: Math.round(size * 0.11), fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,0.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

/* ── Difficulty gauge (exact copy from /today) ── */
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

/* ── Demo session card (exact style from /today TodaySessionCard) ── */
function DemoSessionCard({ sessionName, exercises, difficulty, athleteName }: {
  sessionName: string;
  exercises: string[];
  difficulty: number;
  athleteName?: string;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(212,64,0,0.16)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
      padding: 18, borderRadius: 24,
    }}>
      {athleteName && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          {athleteName}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 1000, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.04em" }}>
          {sessionName}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: "rgba(212,64,0,0.10)", color: "#d44000" }}>
          Prévu
        </span>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DiffGauge value={difficulty} height={12} />
      </div>
      <div style={{ border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden" }}>
        {exercises.slice(0, 3).map((ex, i) => (
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
    </div>
  );
}

/* ── Coach demo MissionCards ── */
function CoachMissionPreview({ sport }: { sport: string }) {
  const athletes = [
    { name: "Thomas M.", score: 88, maxDiff: 8,  attention: true,  decision: "Séance dure prévue : vérifier qu'il n'enchaîne pas dur." },
    { name: "Emma L.",   score: 67, maxDiff: 6,  attention: false, decision: "Plan cohérent : suivre la difficulté réelle." },
    { name: "Pierre D.", score: 41, maxDiff: 7,  attention: true,  decision: "Wellness bas + séance difficile : alléger maintenant." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      {athletes.map((a, i) => {
        const isAttn = a.attention;
        return (
          <div key={i} style={{
            position: "relative", overflow: "hidden",
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center",
            background: isAttn ? "linear-gradient(180deg,#fff,#fff5ef)" : "#fff",
            border: isAttn ? "1.5px solid rgba(212,64,0,.45)" : "1px solid rgba(0,0,0,.08)",
            borderRadius: 22, padding: "14px 16px",
            boxShadow: isAttn ? "0 18px 46px rgba(212,64,0,.10)" : "0 10px 28px rgba(0,0,0,.06)",
          }}>
            {isAttn && (
              <>
                <style>{`@keyframes perf-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.35)}}`}</style>
                <div style={{ position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: "50%", background: "#d44000", animation: "perf-pulse 1.8s ease-in-out infinite" }} />
              </>
            )}
            <WellnessRingCoach score={a.score} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                <div style={{ fontSize: 16, fontWeight: 950, color: "#1f2428", letterSpacing: "-0.02em" }}>{a.name}</div>
                {isAttn && (
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: "#d44000", color: "#fff", borderRadius: 999, padding: "3px 8px" }}>Attention requise</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#6b7277", marginBottom: 4 }}>
                {sport} · 1 séance · difficulté prévue {a.maxDiff}/10
              </div>
              <div style={{ fontSize: 12, color: "#333", lineHeight: 1.35 }}>{a.decision}</div>
            </div>
          </div>
        );
      })}
      <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(212,64,0,.06)", border: "1px solid rgba(212,64,0,.15)" }}>
        <span style={{ fontSize: 12, color: "#d44000", fontWeight: 700, lineHeight: 1.5 }}>
          En temps réel, ThePerfClub te montre l'état de forme de chaque sportif — pour décider qui pousse et qui récupère.
        </span>
      </div>
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
export default function OnboardingFlow({ userId, pendingData }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const isRegisterMode = !userId;

  const [stepIdx, setStepIdx] = useState(0);
  const [role, setRole]       = useState<Role>(pendingData?.role || "athlete");

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
  const [showPaywall, setShowPaywall] = useState(false);

  /* value_slides */
  const [vSlide, setVSlide] = useState(0);

  /* recap billing selection */
  const [recapBilling, setRecapBilling] = useState<"monthly" | "annual">("annual");

  /* pain point visual feedback */
  const [lastClickedPain, setLastClickedPain] = useState<string | null>(null);

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

  const [inviteCode, setInviteCode]       = useState<string | null>(null);
  const [linkCopied, setLinkCopied]       = useState(false);

  /* initializing — true quand on arrive depuis Google OAuth avec pendingData */
  const [initializing, setInitializing] = useState(!!pendingData);

  /* auto-advance guard */
  const advancingRef = useRef(false);

  function toggleBehavior(key: string) {
    setWBehaviors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const getPath = (r: Role): StepId[] => {
    if (pendingData) return r === "coach"
      ? ["preview_4b", "invite_share", "social_proof", "recap_5"]
      : ["readiness_4a", "social_proof", "recap_5"];
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
  };
  const path        = getPath(role);
  const currentStep = path[stepIdx];
  const isLast      = stepIdx === path.length - 1;

  useEffect(() => {
    const props = {
      step: currentStep,
      step_index: stepIdx,
      role: currentStep === "role" ? "selecting" : (role || "unknown"),
      mode: isRegisterMode ? "register" : "auth",
    };
    posthog.capture("onboarding_step_viewed", props);
    posthog.capture(`onboarding_${currentStep}_viewed`, props);
    advancingRef.current = false;
    setLastClickedPain(null);
  }, [currentStep]);

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
      await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, trainingDays));
      await supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, level), { onConflict: "user_id,date" });
    }
    if (role === "coach") {
      const { data: demo } = await supabase
        .from("coach_athletes")
        .insert({ coach_id: uid, name: name.trim() || "Moi-même", sport, wellness_score: 74, user_id: null })
        .select("id").single();
      if (demo?.id) {
        await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, demo.id, sport));
      }
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const { error: codeErr } = await supabase.from("profiles").update({ invite_code: code }).eq("user_id", uid);
      if (!codeErr) setInviteCode(code);
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      if (isRegisterMode) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
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
        setEmailSent(!data.session);
        setSaving(false);
        next();
      } else {
        await saveData(userId!);
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

  async function goToApp() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    window.location.href = role === "coach" ? "/coach" : "/today";
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
      } catch {
        /* silently continue — user still sees reveal */
      } finally {
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
  const pricingRole = PRICING_ONBOARDING[role === "coach" ? "coach" : "athlete"];
  const annualSavings = pricingRole.monthly * 12 - pricingRole.annual;

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
      {showPaywall && (
        <PaywallModal mode={role} allowDismiss={true} onClose={() => setShowPaywall(false)} onSuccess={goToApp} initialBilling={recapBilling} />
      )}

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
                <div key={r} onClick={() => setRole(r)}
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
                <WellnessRingCoach score={88} size={36} />
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
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
                <Choice key={ans} icon="" title={ans} sub="" selected={lastClickedPain === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setLastClickedPain(ans));
                  }} />
              ))}
            </div>
            <button onClick={back} style={backOnlyBtn}>← Retour</button>
          </div>
        )}

        {/* ── 3. ACCOUNT ── */}
        {currentStep === "account" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Crée ton compte ThePerfClub</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>Pour sauvegarder ton profil et accéder à ton espace.</div>
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
                {wBehaviors.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 10, padding: "7px 12px", marginBottom: 12, fontSize: 12, background: "rgba(200,30,30,.08)", border: "0.5px solid rgba(200,30,30,.22)", color: "#c81e1e" }}>
                    ⚠ −{wBehaviorPenalty} pts sur le score
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {BEHAVIORS.map(b => {
                    const checked = wBehaviors.includes(b.key);
                    return (
                      <button key={b.key} onClick={() => toggleBehavior(b.key)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, border: checked ? "1px solid rgba(200,30,30,.40)" : "1px solid rgba(0,0,0,.10)", background: checked ? "rgba(200,30,30,.08)" : "#fff", color: checked ? "#c81e1e" : "#62686e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all .14s" }}>
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

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
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

        {/* ── SCORE REVEAL (athlete, après account) ── */}
        {currentStep === "readiness_4a" && (
          emailSent ? <EmailSentScreen email={email} /> : (
            <div>
              <div style={{ fontSize: 13, color: "#8a8f94", marginBottom: 12 }}>Voici ton score de départ — il évoluera chaque jour.</div>
              <div style={{ position: "relative", overflow: "hidden", borderRadius: 24, padding: 20, marginBottom: 16, background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)", border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 28px 72px rgba(0,0,0,0.28)", color: "#fff" }}>
                <div style={{ position: "absolute", right: "-12%", bottom: "-42%", width: 260, height: 200, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(32px)", pointerEvents: "none" }} />
                <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 18, marginBottom: 14 }}>
                  <WellnessRingDark score={wScore} size={88} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 4 }}>Score &amp; conseils</div>
                    <div style={{ fontSize: 22, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 4 }}>
                      {formLabel(wScore)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.07)", color: "#fff", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900 }}>
                        ✓ <strong style={{ color: "#ff8a55" }}>Autorégulation</strong> active
                      </span>
                    </div>
                  </div>
                </div>
                {wScore !== null && wScore < 55 && (
                  <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 7, background: "rgba(212,64,0,0.18)", border: "1px solid rgba(212,64,0,0.36)", borderRadius: 16, padding: "10px 14px", marginBottom: 12, fontSize: 11, color: "#ffd2bf" }}>
                    🔥 Wellness bas — pense à alléger ou reporter si la séance est intense
                  </div>
                )}
                {wScore !== null && (() => {
                  const adv = getWellnessAdvice(wScore);
                  return (
                    <div style={{ position: "relative", zIndex: 2, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>✦ Conseils</div>
                      <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>⚡ Entraînement</div>
                        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{adv.training}</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>🌿 Récupération</div>
                        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{adv.recovery}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const [sName, sNotes] = getSessionTemplates(sport)[0];
                const exos = sNotes.split("\n").filter(Boolean);
                const diff = wScore !== null ? (wScore >= 75 ? 7 : wScore >= 55 ? 5 : 3) : 5;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                      🎯 Séance de la semaine
                    </div>
                    <DemoSessionCard sessionName={sName} exercises={exos} difficulty={diff} />
                  </div>
                );
              })()}
              <div style={{ position: "sticky", bottom: 0, margin: "16px -18px -18px", padding: "14px 18px 20px", background: "linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.92) 28%,#fff 50%)" }}>
                <button onClick={next} style={ctaBtn}>Accéder à mon espace</button>
              </div>
            </div>
          )
        )}

        {/* ── 4B. COACH MISSION PREVIEW ── */}
        {currentStep === "preview_4b" && (
          emailSent ? <EmailSentScreen email={email} /> : (
            <div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>Ton espace coach est presque prêt</div>
              <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
                Voici ce que tu verras chaque matin pour chacun de tes sportifs.
              </div>
              <CoachMissionPreview sport={sport} />
              {(() => {
                const [sName, sNotes] = getSessionTemplates(sport)[0];
                const exos = sNotes.split("\n").filter(Boolean);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                      📋 Séance assignée — Thomas M.
                    </div>
                    <DemoSessionCard sessionName={sName} exercises={exos} difficulty={7} />
                  </div>
                );
              })()}
              <div style={{ position: "sticky", bottom: 0, margin: "16px -18px -18px", padding: "14px 18px 20px", background: "linear-gradient(180deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.92) 28%,#fff 50%)" }}>
                <button onClick={next} style={ctaBtn}>Accéder à mon espace</button>
              </div>
            </div>
          )
        )}

        {/* ── INVITE SHARE (coach) ── */}
        {currentStep === "invite_share" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>
              Ton lien d'invitation est prêt
            </div>
            <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.6, marginBottom: 20 }}>
              Partage-le à tes sportifs — ils peuvent s'inscrire maintenant, même avant que tu aies finalisé ton abonnement.
            </div>

            {inviteCode ? (
              <>
                <div style={{
                  background: "rgba(212,64,0,.06)", border: "1.5px solid rgba(212,64,0,.22)",
                  borderRadius: 14, padding: "14px 16px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#d44000", letterSpacing: "-0.01em", wordBreak: "break-all" }}>
                    go.theperfclub.com/join/{inviteCode}
                  </div>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2500);
                    posthog.capture("invite_link_copied", { invite_code: inviteCode });
                  }}
                  style={{ ...ctaBtn, marginBottom: 10, background: linkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", transition: "background .2s" }}
                >
                  {linkCopied ? "✓ Lien copié !" : "📋 Copier le lien"}
                </button>

                <button
                  onClick={() => {
                    const msg = encodeURIComponent(`Salut ! Je viens de m'inscrire sur ThePerfClub pour suivre notre entraînement. Rejoins mon espace ici : https://go.theperfclub.com/join/${inviteCode}`);
                    window.open(`https://wa.me/?text=${msg}`, "_blank");
                    posthog.capture("invite_link_whatsapp", { invite_code: inviteCode });
                  }}
                  style={{ width: "100%", height: 50, borderRadius: 14, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", color: "#1f2428", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12, boxSizing: "border-box" as const }}
                >
                  <span style={{ fontSize: 20 }}>📲</span> Envoyer via WhatsApp
                </button>

                <button
                  onClick={() => {
                    posthog.capture("invite_share_skipped", { invite_code: inviteCode });
                    next();
                  }}
                  style={{ width: "100%", height: 44, borderRadius: 12, border: "1.5px solid rgba(0,0,0,.12)", background: "transparent", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Passer pour l'instant
                </button>
              </>
            ) : (
              <button onClick={next} style={{ ...ctaBtn, marginBottom: 0 }}>Continuer →</button>
            )}
          </div>
        )}

        {/* ── SOCIAL PROOF ── */}
        {currentStep === "social_proof" && (
          <div>
            {/* Header */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2, marginBottom: 4 }}>
                Rejoignez les {role === "athlete" ? "sportifs" : "coachs"} comme vous
              </div>
              <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5 }}>Ils ont changé leur approche avec ThePerfClub.</div>
            </div>

            {/* Community counter */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 14px", background: "#f7f8f9", borderRadius: 16 }}>
              <div style={{ display: "flex" }}>
                {[
                  "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
                  "https://www.theperfclub.com/wp-content/uploads/2022/02/Rond_SC.jpeg",
                  "https://www.theperfclub.com/wp-content/uploads/2022/07/rugby-club-tarbes-768x768.jpeg",
                  "https://www.theperfclub.com/wp-content/uploads/2022/05/2toiles-92-natation.jpeg",
                  "https://www.theperfclub.com/wp-content/uploads/2021/03/halte%CC%81rophilie-Thibault-cortes.png",
                ].map((src, i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #f7f8f9", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#171b1f", lineHeight: 1.2 }}>+300 sportifs, coachs et clubs</div>
                <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>font confiance à ThePerfClub</div>
              </div>
            </div>

            {/* Single testimonial */}
            {role === "athlete" ? (
              <div style={{ background: "#f7f8f9", borderRadius: 20, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ height: 130, overflow: "hidden" }}>
                  <img src="https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png" alt="Franck G." style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", display: "block" }} />
                </div>
                <div style={{ padding: "16px 16px 14px" }}>
                  <div style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.65, fontStyle: "italic", marginBottom: 12 }}>
                    "ThePerfClub a totalement changé la façon dont je structure mes entraînements. Je suis passé de « plus c'est mieux » à une vraie autorégulation — et mes résultats ont suivi."
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                      <img src="https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>Franck G.</div>
                      <div style={{ fontSize: 11, color: "#8a8f94" }}>Sportif · Membre ThePerfClub</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      {[0,1,2,3,4].map(i => <span key={i} style={{ color: "#f04a08", fontSize: 12 }}>★</span>)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: "#f7f8f9", borderRadius: 20, overflow: "hidden", marginBottom: 20 }}>
                <div style={{ height: 130, overflow: "hidden" }}>
                  <img src="https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png" alt="Killian Anno" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                </div>
                <div style={{ padding: "16px 16px 14px" }}>
                  <div style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.65, fontStyle: "italic", marginBottom: 12 }}>
                    "Je pensais que ThePerfClub était encore un outil pour créer des séances. Cela va bien plus loin : gestion du volume, de la fatigue, autorégulation — un véritable tableau de bord d'un groupe d'entraînement."
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                      <img src="https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>Killian Anno</div>
                      <div style={{ fontSize: 11, color: "#8a8f94" }}>Préparateur physique · Rugby Club Bassin d'Arcachon</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      {[0,1,2,3,4].map(i => <span key={i} style={{ color: "#f04a08", fontSize: 12 }}>★</span>)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button onClick={next} style={ctaBtn}>Continuer →</button>
          </div>
        )}

        {/* ── 5. RECAP + PRICING TIMELINE ── */}
        {currentStep === "recap_5" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🚀</div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2 }}>
                {role === "athlete" ? "Débloquez les progrès" : "Coachez comme un pro"}
              </div>
              <div style={{ fontSize: 13, color: "#62686e", marginTop: 6, lineHeight: 1.5 }}>
                Commence ton essai gratuit de 7 jours. Annule à tout moment.
              </div>
            </div>

            {/* Timeline */}
            <div style={{ position: "relative", paddingLeft: 32, marginBottom: 22 }}>
              <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "rgba(212,64,0,0.20)", borderRadius: 1 }} />
              {[
                { title: "Accès complet dès le premier jour", sub: "Toutes les fonctionnalités débloquées immédiatement." },
                { title: "Rappel 2 jours avant la fin de l'essai", sub: "On te préviendra avant tout prélèvement." },
                { title: "Annule à tout moment, sans condition", sub: "Pas d'engagement, pas de frais cachés." },
              ].map((node, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < 2 ? 16 : 0 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: "rgba(212,64,0,0.10)", border: "1.5px solid #d44000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#d44000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1f2428", lineHeight: 1.3 }}>{node.title}</div>
                    <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.4, marginTop: 2 }}>{node.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Plan cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {/* Monthly card */}
              <div
                onClick={() => { setRecapBilling("monthly"); posthog.capture("onboarding_recap_billing_selected", { role, billing: "monthly" }); }}
                style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: recapBilling === "monthly" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: recapBilling === "monthly" ? "#171b1f" : "#fff", transition: "all .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: recapBilling === "monthly" ? "rgba(255,255,255,0.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em" }}>Mensuel</div>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${recapBilling === "monthly" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {recapBilling === "monthly" && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: recapBilling === "monthly" ? "#fff" : "#171b1f", lineHeight: 1 }}>
                  {pricingRole.monthly}€
                </div>
                <div style={{ fontSize: 11, color: recapBilling === "monthly" ? "rgba(255,255,255,0.45)" : "#8a8f94", marginTop: 3 }}>/mois</div>
              </div>

              {/* Annual card */}
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#d44000", color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", letterSpacing: "0.06em", zIndex: 1 }}>
                  7 JOURS GRATUITS
                </div>
                <div
                  onClick={() => { setRecapBilling("annual"); posthog.capture("onboarding_recap_billing_selected", { role, billing: "annual" }); }}
                  style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: recapBilling === "annual" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: recapBilling === "annual" ? "#171b1f" : "#fff", transition: "all .15s", height: "100%", boxSizing: "border-box" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: recapBilling === "annual" ? "rgba(255,255,255,0.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em" }}>Annuel</div>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: recapBilling === "annual" ? "#d44000" : "transparent", border: `1.5px solid ${recapBilling === "annual" ? "#d44000" : "rgba(0,0,0,.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {recapBilling === "annual" && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: recapBilling === "annual" ? "#fff" : "#171b1f", lineHeight: 1 }}>
                    {pricingRole.annualMonthly}€
                  </div>
                  <div style={{ fontSize: 11, color: recapBilling === "annual" ? "rgba(255,255,255,0.45)" : "#8a8f94", marginTop: 3 }}>/mois · {pricingRole.annual}€/an</div>
                </div>
              </div>
            </div>

            {/* No payment note */}
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: recapBilling === "annual" ? "#2f9e44" : "#8a8f94", marginBottom: 14 }}>
              {recapBilling === "annual" ? "✓ Aucun prélèvement maintenant" : "Sans engagement"}
            </div>

            <button
              onClick={() => { posthog.capture("paywall_opened", { role, billing: recapBilling }); setShowPaywall(true); }}
              style={ctaBtn}>
              {recapBilling === "annual" ? "Commencer l'essai gratuit →" : "Commencer maintenant →"}
            </button>
            <button onClick={() => { posthog.capture("paywall_skipped", { role, billing: recapBilling }); goToApp(); }} style={skipBtn}>Accéder sans abonnement →</button>
          </div>
        )}

      </div>
    </AuthBackground>
  );
}
