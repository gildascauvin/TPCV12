"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import Link from "next/link";
import AuthBackground from "@/components/auth/AuthBackground";
import PaywallModal from "@/components/paywall/PaywallModal";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "role"
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "freq_2a"
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"
  | "wellness_q"
  | "account"
  | "readiness_4a" | "preview_4b"
  | "recap_5";

interface Props { userId?: string }

const ATHLETE_PATH: StepId[] = [
  "role",
  "sport_2a", "level_2a", "goal_2a", "frustration_2a", "freq_2a",
  "wellness_q", "account", "readiness_4a", "recap_5",
];
const COACH_PATH: StepId[] = [
  "role",
  "context_2b", "sport_2b", "count_2b", "challenge_2b", "tool_2b",
  "account", "preview_4b", "recap_5",
];
const ATHLETE_PATH_AUTH: StepId[] = ["role", "sport_2a", "level_2a", "goal_2a", "frustration_2a", "freq_2a"];
const COACH_PATH_AUTH: StepId[]   = ["role", "context_2b", "sport_2b", "count_2b", "challenge_2b", "tool_2b"];

const POST_PROGRESS: StepId[] = ["wellness_q", "readiness_4a", "preview_4b", "recap_5"];

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

function getSessionTemplates(sport: string): [string, string][] {
  const s = sport.toLowerCase();
  if (s.includes("force") || s.includes("puissance")) return [
    ["Snatch technique",   "Complexe : high pull + hang snatch\n5 séries @ 70–80%\nFocus vitesse sous la barre"],
    ["Clean & Jerk lourd", "Clean + jerk 5x1\nFront squat 3x3\nDifficulté cible contrôlée"],
    ["Squat + tirages",    "Back squat 5x5\nSnatch pull 4x3\nGainage 8 min"],
    ["Technique légère",   "Power snatch 6x2\nJerk footwork\nMobilité épaules/hanches"],
  ];
  if (s.includes("athlé") || s.includes("vitesse")) return [
    ["Accélération 20m",    "Échauffement complet\n6x20m départ arrêté\nRécup 3 min\nFocus : sortie de bloc"],
    ["Vitesse max fly 30m", "4x30m lancé\nRécup complète 4–5 min\nQualité > volume"],
    ["Tempo + mobilité",    "8x100m facile\nMobilité hanches/chevilles\nRespiration 5 min"],
    ["Renforcement sprint", "Squat 4x4\nNordic curl 3x5\nGainage anti-rotation"],
  ];
  if (s.includes("collectif")) return [
    ["Puissance terrain",       "Échauffement 10 min\nSprints courts 6x20m\nChangements de direction\nRenforcement membres inférieurs"],
    ["Endurance collective",    "Jeu réduit 4vs4 × 4 sets\nRécup active 2 min\nFocus pressing et transition"],
    ["Renforcement prévention", "Gainage 3x1min\nNordic curl 3x6\nMobilité hanches\nSauts amortis"],
    ["Récupération active",     "Footing facile 20 min\nMobilité globale\nÉtirements doux"],
  ];
  if (s.includes("endurance")) return [
    ["Sortie longue facile",    "Effort aérobie continu 45–60 min\nAllure conversationnelle\nFocus : respiration et économie"],
    ["Fractionné court",        "Échauffement 15 min\n8x200m @ allure rapide\nRécup 90s entre chaque\nRetour au calme 10 min"],
    ["Seuil progressif",        "Montée en allure progressive\n20 min @ seuil\nRetour au calme\nFocus : régularité"],
    ["Renforcement spécifique", "Gainage 3 séries\nSquat unipodal 3x10\nMontées de marche\nMobilité chevilles/hanches"],
  ];
  if (s.includes("martial") || s.includes("combat")) return [
    ["Travail technique",    "Échauffement cardio 10 min\nTechniques de base × séries\nCombination × 5 séries\nÉtirements actifs"],
    ["Conditionnement",      "HIIT 5x2min effort\nRécup 1 min entre chaque\nExercices pliométriques\nGainage fonctionnel"],
    ["Sparring / Randori",   "Échauffement complet\nSparring technique 3x3min\nDebriefing\nMobilité ciblée"],
    ["Renforcement général", "Exercices poids de corps\nCore stability 20 min\nMobilité épaules/hanches\nRécupération"],
  ];
  return [
    ["Séance qualité",          "Bloc principal technique\n3–5 séries propres\nDifficulté maîtrisée"],
    ["Séance volume",           "Travail continu modéré\nVolume progressif\nRespiration contrôlée"],
    ["Mobilité + récupération", "20–30 min facile\nMobilité globale\nMarche ou vélo doux"],
    ["Renforcement général",    "Mouvements de base\nCore\nPrévention blessures"],
  ];
}

function nextDateForDow(dow: number): string {
  const today = new Date();
  const diff = ((dow - today.getDay()) + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function buildAthleteSessions(userId: string, sport: string, level: Level, freq: number) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, elite: 8 };
  const days: Record<number, number[]> = {
    2: [1, 4], 3: [1, 3, 5], 4: [1, 3, 5, 6], 5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0],
  };
  const dow = days[freq] ?? days[3];
  const sessions = dow.map((d, i) => {
    const [name, notes] = templates[i % templates.length];
    return { user_id: userId, date: nextDateForDow(d), name, notes: `${notes}\nDifficulté cible : ${rpe[level]}`, done: false, target_difficulty: rpe[level] };
  });
  if (freq < 6) {
    const rec = dow.includes(0) ? 2 : 0;
    sessions.push({ user_id: userId, date: nextDateForDow(rec), name: "Récupération active", notes: "Marche ou vélo facile 25–35 min\nMobilité 10 min\nObjectif : faire redescendre la fatigue", done: false, target_difficulty: 3 });
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
  return [1, 3, 5, 6].map((d, i) => {
    const [name, notes] = templates[i % templates.length];
    return { coach_id: coachId, athlete_id: athleteId, date: nextDateForDow(d), name, notes, done: false, target_difficulty: 7 };
  });
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
          En temps réel, ThePerfClub te montre l'état de forme de chaque athlète — pour décider qui pousse et qui récupère.
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
export default function OnboardingFlow({ userId }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const isRegisterMode = !userId;

  const [stepIdx, setStepIdx] = useState(0);
  const [role, setRole]       = useState<Role>("athlete");

  /* questionnaire */
  const [sport, setSport]                         = useState("Force & puissance");
  const [level, setLevel]                         = useState<Level>("intermediate");
  const [goal, setGoal]                           = useState("");
  const [frustration, setFrustration]             = useState("");
  const [freq, setFreq]                           = useState(3);
  const [coachingContext, setCoachingContext]     = useState("");
  const [athleteCount, setAthleteCount]           = useState("");
  const [coachingChallenge, setCoachingChallenge] = useState("");
  const [currentTool, setCurrentTool]             = useState("");

  /* account */
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emailSent, setEmailSent]   = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  /* wellness sub-steps (readiness_4a) */
  const WQ_TOTAL = 5;
  const [wStep, setWStep]           = useState(0);
  const [wSleep, setWSleep]         = useState(7);
  const [wBedtime, setWBedtime]     = useState("23to00");
  const [wStress, setWStress]       = useState(5);
  const [wRecovery, setWRecovery]   = useState(7);
  const [wBehaviors, setWBehaviors] = useState<string[]>([]);
  const [wMotivation, setWMotivation] = useState(8);
  const [wScore, setWScore]           = useState<number | null>(null);
  const [wSaving, setWSaving]         = useState(false);

  function toggleBehavior(key: string) {
    setWBehaviors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const getPath = (r: Role): StepId[] => {
    if (!isRegisterMode) return r === "coach" ? COACH_PATH_AUTH : ATHLETE_PATH_AUTH;
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
  };
  const path        = getPath(role);
  const currentStep = path[stepIdx];
  const isLast      = stepIdx === path.length - 1;

  function next() { if (!isLast) setStepIdx(i => i + 1); }
  function back() { if (stepIdx > 0) setStepIdx(i => i - 1); }

  async function saveData(uid: string) {
    await supabase.from("profiles").update({
      ...(name.trim() ? { name: name.trim() } : {}),
      sport, mode: role, onboarding_done: true,
      freq_target:        role === "athlete" ? freq : null,
      objective:          role === "athlete" ? (goal || null) : null,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_context:   role === "coach"   ? (coachingContext || null) : null,
      athletes_count:     role === "coach"   ? (athleteCount || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
      current_tool:       role === "coach"   ? (currentTool || null) : null,
    }).eq("user_id", uid);

    if (role === "athlete") {
      await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, freq));
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
        await fetch("/api/invite/link", { method: "POST" });
        setEmailSent(!data.session);
        setSaving(false);
        next();
      } else {
        await saveData(userId!);
        router.push(role === "coach" ? "/coach" : "/today");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  function handleWellnessQuestions() {
    if (wStep < WQ_TOTAL - 1) { setWStep(s => s + 1); return; }
    /* Last question: compute score in state only, DB save happens in handleFinish after account creation */
    const { score } = computeWellnessScore(wSleep, wStress, wRecovery, wMotivation, wBehaviors);
    setWScore(score);
    next(); // → account
  }

  function goToApp() {
    router.push(role === "coach" ? "/coach" : "/today");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  const sessionCount  = freq + (freq < 6 ? 1 : 0);
  const progressSteps = path.filter(s => !POST_PROGRESS.includes(s));
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

  const wBehaviorPenalty = Math.min(wBehaviors.length * 3, 15);

  return (
    <AuthBackground>
      {showPaywall && (
        <PaywallModal mode={role} allowDismiss={true} onClose={() => setShowPaywall(false)} onSuccess={goToApp} />
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
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stepIdx ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
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
                { r: "athlete" as Role, icon: "🏋️", label: "Athlète",  sub: "Je suis mon propre entraînement" },
                { r: "coach"   as Role, icon: "📋", label: "Coach",    sub: "Je gère des athlètes" },
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

        {/* ── 2A-1. SPORT ATHLETE ── */}
        {currentStep === "sport_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On génère des séances adaptées à ta discipline.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id} onClick={() => setSport(s.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── 2A-2. LEVEL ── */}
        {currentStep === "level_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton niveau actuel ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Cela ajuste l'intensité des séances générées.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              <Choice icon="🌱" title="Débutant"      sub="Je structure mon entraînement" selected={level === "beginner"}     onClick={() => setLevel("beginner")} />
              <Choice icon="📈" title="Intermédiaire" sub="J'ai une pratique régulière"    selected={level === "intermediate"} onClick={() => setLevel("intermediate")} />
              <Choice icon="🏆" title="Compétiteur"   sub="Je prépare des compétitions"    selected={level === "elite"}        onClick={() => setLevel("elite")} />
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
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
              ].map(o => <Choice key={o.id} icon={o.icon} title={o.id} sub="" selected={goal === o.id} onClick={() => setGoal(o.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!goal} />
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
              ].map(f => <Choice key={f.id} icon={f.icon} title={f.id} sub="" selected={frustration === f.id} onClick={() => setFrustration(f.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!frustration} />
          </div>
        )}

        {/* ── 2A-5. FREQUENCY ── */}
        {currentStep === "freq_2a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Combien de séances par semaine ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Le planning sera prérempli avec ce rythme.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="" title="1–2 séances"       sub="Minimal et régulier" selected={freq === 2} onClick={() => setFreq(2)} />
              <Choice icon="" title="3–4 séances"       sub="Base solide"         selected={freq === 3} onClick={() => setFreq(3)} />
              <Choice icon="" title="5–6 séances"       sub="Rythme soutenu"      selected={freq === 5} onClick={() => setFreq(5)} />
              <Choice icon="" title="7 séances ou plus" sub="Volume élevé"        selected={freq === 7} onClick={() => setFreq(7)} />
            </div>
            {!isRegisterMode && isLast
              ? <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon planning"} nextDisabled={saving} />
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2B-1. COACHING CONTEXT ── */}
        {currentStep === "context_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton contexte de coaching ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour adapter les outils à ta réalité terrain.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              <Choice icon="👤" title="Coach individuel"             sub="Je suis des athlètes en one-to-one"    selected={coachingContext === "Coach individuel"}             onClick={() => setCoachingContext("Coach individuel")} />
              <Choice icon="🏟️" title="Préparateur physique de club" sub="Je gère une ou plusieurs équipes"      selected={coachingContext === "Préparateur physique de club"} onClick={() => setCoachingContext("Préparateur physique de club")} />
              <Choice icon="🎓" title="Formateur"                    sub="J'enseigne à des coachs en formation"  selected={coachingContext === "Formateur"}                    onClick={() => setCoachingContext("Formateur")} />
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingContext} />
          </div>
        )}

        {/* ── 2B-2. SPORT COACH ── */}
        {currentStep === "sport_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On paramètre les modèles de séances proposés.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id} onClick={() => setSport(s.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── 2B-3. ATHLETE COUNT ── */}
        {currentStep === "count_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Combien d'athlètes tu gères ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour dimensionner les outils de suivi collectif.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="" title="1–5 athlètes"   sub="Coaching rapproché" selected={athleteCount === "1–5 athlètes"}   onClick={() => setAthleteCount("1–5 athlètes")} />
              <Choice icon="" title="6–20 athlètes"  sub="Groupe moyen"       selected={athleteCount === "6–20 athlètes"}  onClick={() => setAthleteCount("6–20 athlètes")} />
              <Choice icon="" title="21–50 athlètes" sub="Large effectif"     selected={athleteCount === "21–50 athlètes"} onClick={() => setAthleteCount("21–50 athlètes")} />
              <Choice icon="" title="50+ athlètes"   sub="Structure club"     selected={athleteCount === "50+ athlètes"}   onClick={() => setAthleteCount("50+ athlètes")} />
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!athleteCount} />
          </div>
        )}

        {/* ── 2B-4. CHALLENGE ── */}
        {currentStep === "challenge_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton plus grand défi de coaching ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>On priorise les fonctionnalités qui t'aident le plus.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Suivre la charge collective de mes athlètes",  icon: "📊" },
                { id: "Personnaliser l'entraînement par athlète",      icon: "🎯" },
                { id: "Créer des programmes facilement",               icon: "📝" },
                { id: "Communiquer efficacement avec mes athlètes",    icon: "💬" },
                { id: "Trop d'outils différents, pas assez de temps",  icon: "⏱️" },
              ].map(c => <Choice key={c.id} icon={c.icon} title={c.id} sub="" selected={coachingChallenge === c.id} onClick={() => setCoachingChallenge(c.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingChallenge} />
          </div>
        )}

        {/* ── 2B-5. CURRENT TOOL ── */}
        {currentStep === "tool_2b" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Tu utilises quoi actuellement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 14 }}>Pour mieux comprendre ce que tu vas remplacer.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="📊" title="Excel / Sheets"   sub="Tableur"      selected={currentTool === "Excel / Sheets"}   onClick={() => setCurrentTool("Excel / Sheets")} />
              <Choice icon="📱" title="Une autre app"    sub="Coaching app"  selected={currentTool === "Une autre app"}    onClick={() => setCurrentTool("Une autre app")} />
              <Choice icon="📝" title="Papier / rien"    sub="Non structuré" selected={currentTool === "Papier / rien"}    onClick={() => setCurrentTool("Papier / rien")} />
              <Choice icon="🔀" title="Plusieurs outils" sub="En parallèle"  selected={currentTool === "Plusieurs outils"} onClick={() => setCurrentTool("Plusieurs outils")} />
            </div>
            {!isRegisterMode && isLast
              ? <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving || !currentTool} />
              : <Actions onBack={back} onNext={next} nextLabel="Suivant →" nextDisabled={!currentTool} />
            }
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
              <button onClick={next} style={ctaBtn}>Continuer →</button>
            </div>
          )
        )}

        {/* ── 4B. COACH MISSION PREVIEW ── */}
        {currentStep === "preview_4b" && (
          emailSent ? <EmailSentScreen email={email} /> : (
            <div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>Ton espace coach est presque prêt</div>
              <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
                Voici ce que tu verras chaque matin pour chacun de tes athlètes.
              </div>
              <CoachMissionPreview sport={sport} />
              <button onClick={next} style={ctaBtn}>Voir mon espace →</button>
            </div>
          )
        )}

        {/* ── 5. RECAP + PAYWALL CTA ── */}
        {currentStep === "recap_5" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em" }}>
                Ton espace est prêt{name.trim() ? `, ${name.trim()}` : ""} !
              </div>
            </div>

            <div style={{ background: "#f7f8f9", borderRadius: 14, padding: 14, marginBottom: 16, fontSize: 13, color: "#62686e", lineHeight: 1.7 }}>
              {role === "athlete" ? (
                <>
                  On a configuré ton espace pour un <strong>{LEVEL_LABELS[level]}</strong> en <strong>{sport}</strong>, avec <strong>{FREQ_LABELS[freq]}</strong>.<br />
                  Objectif : <strong>{goal}</strong>.<br />
                  <span style={{ color: "#1f2428" }}>{sessionCount} séance{sessionCount > 1 ? "s" : ""} prête{sessionCount > 1 ? "s" : ""} — chacune adaptée à ton état du jour.</span>
                </>
              ) : (
                <>
                  On a configuré ton espace pour <strong>{athleteCount}</strong> en <strong>{sport}</strong>.<br />
                  {coachingContext && <>Profil : <strong>{coachingContext}</strong>.<br /></>}
                  {coachingChallenge && <>Défi prioritaire : <strong>{coachingChallenge}</strong>.<br /></>}
                  <span style={{ color: "#1f2428" }}>Tu pourras créer des programmes, suivre la charge collective et adapter en temps réel.</span>
                </>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <CheckItem text="Accès complet dès le premier jour" />

              <CheckItem text="Annule à tout moment, sans condition" />
            </div>

            <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", marginBottom: 16, padding: "8px 12px", background: "rgba(0,0,0,.03)", borderRadius: 10, lineHeight: 1.5 }}>
              L'essai gratuit 7 jours est disponible uniquement sur le plan annuel.
            </div>

            <button onClick={() => setShowPaywall(true)} style={ctaBtn}>Essayer gratuitement</button>
            <button onClick={goToApp} style={skipBtn}>Accéder sans abonnement →</button>
          </div>
        )}

      </div>
    </AuthBackground>
  );
}
