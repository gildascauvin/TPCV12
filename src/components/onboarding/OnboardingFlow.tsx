"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import AuthBackground from "@/components/auth/AuthBackground";
import PaywallModal from "@/components/paywall/PaywallModal";

/* ─── types ─── */
type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "advanced" | "elite";
type StepId =
  | "welcome" | "role"
  | "sport_a" | "level_a" | "freq_a"
  | "sport_c"
  | "account" | "reveal";

/* userId = already logged-in (onboarding page fallback). Omit = register mode (account step included). */
interface Props { userId?: string }

const ATHLETE_PATH: StepId[] = ["welcome", "role", "sport_a", "level_a", "freq_a", "account", "reveal"];
const COACH_PATH: StepId[]   = ["welcome", "role", "sport_c", "account", "reveal"];
const ATHLETE_PATH_AUTH: StepId[] = ["welcome", "role", "sport_a", "level_a", "freq_a"];
const COACH_PATH_AUTH: StepId[]   = ["welcome", "role", "sport_c"];

const ATHLETE_SPORTS = [
  { id: "Haltérophilie",        icon: "🏋️", sub: "Force, technique, charges" },
  { id: "Sprint",               icon: "⚡", sub: "Vitesse, puissance, récupérations" },
  { id: "Préparation physique", icon: "💪", sub: "Force, mobilité, conditioning" },
  { id: "CrossFit",             icon: "🔥", sub: "WOD, force, volume" },
  { id: "Fitness",              icon: "🏃", sub: "Routine, progression, forme" },
  { id: "Rugby",                icon: "🏉", sub: "Terrain, force, prévention" },
];
const COACH_SPORTS = [
  { id: "Préparation physique", icon: "💪", sub: "Force, vitesse, prévention" },
  { id: "Haltérophilie",        icon: "🏋️", sub: "Technique, force, compétition" },
  { id: "Sprint",               icon: "⚡", sub: "Accélération, vitesse max" },
  { id: "CrossFit",             icon: "🔥", sub: "Volume, WOD, force" },
  { id: "Rugby",                icon: "🏉", sub: "Terrain, puissance, contact" },
  { id: "Football",             icon: "⚽", sub: "Vitesse, appuis, récup" },
];

/* ─── session templates ─── */
function getSessionTemplates(sport: string): [string, string][] {
  const s = sport.toLowerCase();
  if (s.includes("sprint")) return [
    ["Accélération 20m",    "Échauffement complet\n6x20m départ arrêté\nRécup 3 min\nFocus : sortie de bloc"],
    ["Vitesse max fly 30m", "4x30m lancé\nRécup complète 4–5 min\nQualité > volume"],
    ["Tempo + mobilité",    "8x100m facile\nMobilité hanches/chevilles\nRespiration 5 min"],
    ["Renforcement sprint", "Squat 4x4\nNordic curl 3x5\nGainage anti-rotation"],
  ];
  if (s.includes("halt") || s.includes("force")) return [
    ["Snatch technique",   "Complexe : high pull + hang snatch\n5 séries @ 70–80%\nFocus vitesse sous la barre"],
    ["Clean & Jerk lourd", "Clean + jerk 5x1\nFront squat 3x3\nDifficulté cible contrôlé"],
    ["Squat + tirages",    "Back squat 5x5\nSnatch pull 4x3\nGainage 8 min"],
    ["Technique légère",   "Power snatch 6x2\nJerk footwork\nMobilité épaules/hanches"],
  ];
  if (s.includes("crossfit")) return [
    ["WOD Conditioning",    "Échauffement 10 min\nFor time : 3 rounds\n15 thrusters – 10 pull-ups\nCore 8 min"],
    ["Strength day",        "Back squat 5x5\nDeadlift 3x3\nAccessoire : GHD, KB"],
    ["Gymnastics",          "EMOM 16 min : HS walk / row\nDouble-unders, ring muscle-up"],
    ["Recovery + mobilité", "Row facile 20 min\nMobilité hanches, épaules\nBreathing work"],
  ];
  return [
    ["Séance qualité",          "Bloc principal technique\n3–5 séries propres\nDifficulté maîtrisée"],
    ["Séance volume",           "Travail continu modéré\nVolume progressif\nRespiration contrôlée"],
    ["Mobilité + récupération", "20–30 min facile\nMobilité globale\nMarche ou vélo doux"],
    ["Renforcement général",    "Mouvements de base\nCore\nPrévention blessures"],
  ];
}

/* ─── date helpers ─── */
function nextDateForDow(dow: number): string {
  const today = new Date();
  const diff = ((dow - today.getDay()) + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/* ─── data builders ─── */
function buildAthleteSessions(userId: string, sport: string, level: Level, freq: number) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, advanced: 8, elite: 8 };
  const days: Record<number, number[]> = {
    2: [1, 4], 3: [1, 3, 5], 4: [1, 3, 5, 6], 5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0],
  };
  const dow = days[freq] ?? days[4];
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
  const bonus = level === "elite" ? 4 : level === "advanced" ? 2 : 0;
  const base  = Math.max(35, 74 + bonus);
  const today = new Date().toISOString().split("T")[0];
  return {
    user_id: userId, date: today,
    sleep: 7, stress: 5, recovery: 6, motivation: 7,
    base_score: base, score: base, behaviors: [],
  };
}

function buildCoachDemoSessions(coachId: string, athleteId: string, sport: string) {
  const templates = getSessionTemplates(sport);
  const dows = [1, 3, 5, 6];
  return dows.map((d, i) => {
    const [name, notes] = templates[i % templates.length];
    return { coach_id: coachId, athlete_id: athleteId, date: nextDateForDow(d), name, notes, done: false, target_difficulty: 7 };
  });
}

/* ─── sub-components ─── */
function Choice({ icon, title, sub, selected, onClick }: { icon: string; title: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer", borderRadius: 12, padding: 11, border: selected ? "1px solid #d44000" : "1px solid rgba(0,0,0,.10)", background: selected ? "rgba(212,64,0,.05)" : "#fff", transition: "all .15s" }}>
      <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 3, color: selected ? "#d44000" : "#1f2428" }}>
        {icon}{icon ? " " : ""}{title}
      </div>
      <div style={{ fontSize: 11, color: "#8a8f94", lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function Actions({ onBack, onNext, nextLabel, nextDisabled = false, backLabel = "← Retour" }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean; backLabel?: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onBack} style={{ flex: 1, height: 44, borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        {backLabel}
      </button>
      <button onClick={() => { if (!nextDisabled) onNext(); }} style={{ flex: 1, height: 44, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", opacity: nextDisabled ? 0.45 : 1 }}>
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

/* ─── main ─── */
export default function OnboardingFlow({ userId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isRegisterMode = !userId;

  const [stepIdx, setStepIdx]     = useState(0);
  const [role, setRole]           = useState<Role>("athlete");
  const [name, setName]           = useState("");
  const [sport, setSport]         = useState("Haltérophilie");
  const [level, setLevel]         = useState<Level>("intermediate");
  const [freq, setFreq]           = useState(4);
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [emailSent, setEmailSent]     = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError]   = useState<string | null>(null);

  const getPath = (r: Role): StepId[] => {
    if (!isRegisterMode) return r === "coach" ? COACH_PATH_AUTH : ATHLETE_PATH_AUTH;
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
  };
  const path        = getPath(role);
  const currentStep = path[stepIdx];
  const isLast      = stepIdx === path.length - 1;

  function next() { if (!isLast) setStepIdx(i => i + 1); }
  function back() { if (stepIdx > 0) setStepIdx(i => i - 1); }

  function goNextFromRole() {
    const newPath = getPath(role);
    setStepIdx(Math.min(2, newPath.length - 1));
  }

  async function saveData(uid: string) {
    await supabase.from("profiles").update({
      name: name.trim(), sport, mode: role, onboarding_done: true,
      freq_target: role === "athlete" ? freq : null,
      objective: role === "athlete" ? "performance" : null,
    }).eq("user_id", uid);

    if (role === "athlete") {
      await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, freq));
      await supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, level), { onConflict: "user_id,date" });
    }

    if (role === "coach") {
      const { data: demoAthlete } = await supabase
        .from("coach_athletes")
        .insert({ coach_id: uid, name: name.trim(), sport, wellness_score: 74, user_id: null })
        .select("id")
        .single();
      if (demoAthlete?.id) {
        await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, demoAthlete.id, sport));
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
        await fetch("/api/invite/link", { method: "POST" });
        setEmailSent(!data.session);
        setSaving(false);
        next(); // → reveal
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

  function goToApp() {
    router.push(role === "coach" ? "/coach" : "/today");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);
  const trialEndStr = trialEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const priceAfterTrial = role === "athlete" ? "9€/mois" : "49€/mois";
  const sessionCount = freq + (freq < 6 ? 1 : 0);

  /* Progress dots exclude the reveal step */
  const progressSteps = path.filter(s => s !== "reveal");

  return (
    <AuthBackground>
      {showPaywall && (
        <PaywallModal
          mode={role}
          allowDismiss={true}
          onClose={() => setShowPaywall(false)}
          onSuccess={goToApp}
        />
      )}

      <div style={{ width: "100%", maxWidth: 430, background: "rgba(255,255,255,.94)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 24, padding: 18, boxShadow: "0 26px 80px rgba(0,0,0,.40)" }}>

        {/* Badge — hidden on reveal */}
        {currentStep !== "reveal" && (
          <div style={{ display: "inline-flex", marginBottom: 10, padding: "6px 10px", borderRadius: 999, background: "rgba(212,64,0,.08)", color: "#d44000", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em" }}>
            Configuration
          </div>
        )}

        {/* Progress bar — hidden on reveal */}
        {currentStep !== "reveal" && (
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {progressSteps.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stepIdx ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
            ))}
          </div>
        )}

        {/* ── welcome ── */}
        {currentStep === "welcome" && (
          <div>
            <div style={{ fontSize: 25, marginBottom: 8 }}>👋</div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Bienvenue sur ThePerfClub</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
              On configure ton espace en quelques questions pour créer une première expérience utile.
            </div>
            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Ton prénom</div>
            <input
              type="text" value={name} onChange={e => { setName(e.target.value); setNameError(false); }}
              placeholder="ex: Alex" onKeyDown={e => { if (e.key === "Enter") { if (name.trim()) next(); else setNameError(true); } }}
              style={{ ...inputStyle, border: nameError ? "1.5px solid #d44000" : inputStyle.border }}
            />
            {nameError && <div style={{ fontSize: 11, color: "#d44000", marginBottom: 8, marginTop: -8 }}>Entre ton prénom pour continuer</div>}
            <button
              onClick={() => { if (name.trim()) next(); else setNameError(true); }}
              style={{ width: "100%", height: 46, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
            >
              Continuer →
            </button>
          </div>
        )}

        {/* ── role ── */}
        {currentStep === "role" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Tu es plutôt…</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Cette réponse détermine les données affichées et les écrans préparés.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="🏃" title="Athlète" sub="Je veux suivre mon entraînement, mon wellness et mon planning." selected={role === "athlete"} onClick={() => setRole("athlete")} />
              <Choice icon="🧢" title="Coach"   sub="Je veux suivre des sportifs et préparer leurs séances."        selected={role === "coach"}   onClick={() => setRole("coach")} />
            </div>
            <Actions onBack={back} onNext={goNextFromRole} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── sport athlete ── */}
        {currentStep === "sport_a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Quel est ton sport principal ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>On l'utilise pour générer des exemples de séances cohérents.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto", paddingRight: 2 }}>
              {ATHLETE_SPORTS.map(s => <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id} onClick={() => setSport(s.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── level athlete ── */}
        {currentStep === "level_a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton niveau général ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Cela ajuste l'intensité et le niveau de détail des séances.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="🌱" title="Débutant"       sub="Je construis mes bases"               selected={level === "beginner"}     onClick={() => setLevel("beginner")} />
              <Choice icon="⚙️" title="Intermédiaire" sub="Je m'entraîne déjà régulièrement"     selected={level === "intermediate"} onClick={() => setLevel("intermediate")} />
              <Choice icon="🚀" title="Avancé"         sub="Je veux optimiser mes séances"         selected={level === "advanced"}     onClick={() => setLevel("advanced")} />
              <Choice icon="🏆" title="Compétition"   sub="Objectifs et performances suivis"      selected={level === "elite"}        onClick={() => setLevel("elite")} />
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── freq ── */}
        {currentStep === "freq_a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Combien de séances par semaine ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Le planning sera prérempli avec ce rythme.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="" title="2 séances" sub="Minimal et régulier" selected={freq === 2} onClick={() => setFreq(2)} />
              <Choice icon="" title="3 séances" sub="Base solide"         selected={freq === 3} onClick={() => setFreq(3)} />
              <Choice icon="" title="4 séances" sub="Rythme complet"      selected={freq === 4} onClick={() => setFreq(4)} />
              <Choice icon="" title="5+ séances" sub="Volume élevé"       selected={freq === 5} onClick={() => setFreq(5)} />
            </div>
            {!isRegisterMode && isLast ? (
              <>
                <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", lineHeight: 1.4, margin: "10px 0 14px" }}>
                  Après cette étape, tu arrives dans une app déjà remplie avec un planning, des séances et des conseils personnalisés.
                </div>
                <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon planning"} nextDisabled={saving} />
              </>
            ) : (
              <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            )}
          </div>
        )}

        {/* ── sport coach ── */}
        {currentStep === "sport_c" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Quel sport coaches-tu principalement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>On s'en sert pour paramétrer les modèles de séances proposés.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto", paddingRight: 2 }}>
              {COACH_SPORTS.map(s => <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id} onClick={() => setSport(s.id)} />)}
            </div>
            {!isRegisterMode && isLast ? (
              <>
                <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", lineHeight: 1.4, margin: "10px 0 14px" }}>
                  Après cette étape, ton espace coach est prêt à accueillir tes athlètes.
                </div>
                <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving} />
              </>
            ) : (
              <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            )}
          </div>
        )}

        {/* ── account (register mode only) ── */}
        {currentStep === "account" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>
              Plus qu'un compte
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
              {role === "athlete"
                ? "Entre ton email pour sauvegarder ton programme et y accéder."
                : "Entre ton email pour sauvegarder ta configuration et accéder à ton espace."}
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" style={inputStyle} />

            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Mot de passe</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input
                type={showPwd ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="8 caractères minimum" minLength={8}
                style={{ ...inputStyle, marginBottom: 0, paddingRight: 48 }}
              />
              <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 13, padding: 0 }}>
                {showPwd ? "Masquer" : "Afficher"}
              </button>
            </div>

            <Actions
              onBack={back}
              onNext={handleFinish}
              nextLabel={saving ? "Création…" : "Créer mon compte →"}
              nextDisabled={saving || !email.trim() || password.length < 8}
            />

            <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94", marginTop: 14, lineHeight: 1.6 }}>
              Déjà un compte ?{" "}
              <Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>
                Se connecter
              </Link>
            </div>
          </div>
        )}

        {/* ── reveal ── */}
        {currentStep === "reveal" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>
                {role === "coach" ? "Ton espace coach est prêt !" : "Ton programme est prêt !"}
              </div>
              <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.5 }}>
                {role === "athlete"
                  ? `On a généré ${sessionCount} séance${sessionCount > 1 ? "s" : ""} de ${sport} pour démarrer.`
                  : "Invite tes athlètes pour démarrer le suivi wellness en temps réel."}
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: "#f7f8f9", borderRadius: 14, padding: 14, marginBottom: 16 }}>
              {role === "athlete" ? (
                <>
                  <CheckItem text={`${freq} séance${freq > 1 ? "s" : ""} de ${sport} générée${freq > 1 ? "s" : ""} cette semaine`} />
                  {freq < 6 && <CheckItem text="1 séance de récupération planifiée" />}
                  <CheckItem text="Score wellness initialisé" />
                </>
              ) : (
                <>
                  <CheckItem text="Tableau de bord configuré" />
                  <CheckItem text={`1 semaine type ${sport} générée`} />
                  <CheckItem text="Un aperçu de toi ajouté — invite tes vrais athlètes" />
                </>
              )}
            </div>

            {/* ── Email confirmation (when Supabase requires email confirmation) ── */}
            {emailSent ? (
              <div style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.08)", borderRadius: 14, padding: 16, marginBottom: 12, textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>📬</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2428", marginBottom: 6 }}>Vérifie tes emails</div>
                <div style={{ fontSize: 12, color: "#62686e", lineHeight: 1.6, marginBottom: 14 }}>
                  On a envoyé un lien à <strong>{email}</strong>.<br />
                  Clique dessus pour activer ton compte et accéder à ton espace.
                </div>
                <a
                  href="https://mail.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", padding: "10px 20px", borderRadius: 10, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}
                >
                  Ouvrir Gmail →
                </a>
              </div>
            ) : role === "athlete" ? (
              /* ── Trial offer (athlete, session active) ── */
              <div style={{ background: "rgba(212,64,0,.05)", border: "1px solid rgba(212,64,0,.18)", borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#1f2428", marginBottom: 4 }}>
                  Accède à tout — 7 jours gratuits
                </div>
                <div style={{ fontSize: 11, color: "#62686e", lineHeight: 1.6, marginBottom: 14 }}>
                  {priceAfterTrial} après l'essai · Résiliable à tout moment<br />
                  Aucun prélèvement avant le {trialEndStr}
                </div>
                <button
                  onClick={() => setShowPaywall(true)}
                  style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)", letterSpacing: "-0.01em" }}
                >
                  Commencer l'essai gratuit
                </button>
              </div>
            ) : (
              /* ── Coach: invite first athlete ── */
              <div style={{ background: "rgba(212,64,0,.05)", border: "1px solid rgba(212,64,0,.18)", borderRadius: 14, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#1f2428", marginBottom: 4 }}>
                  Invite ton premier athlète
                </div>
                <div style={{ fontSize: 11, color: "#62686e", lineHeight: 1.5, marginBottom: 12 }}>
                  Entre son email. Il recevra une invitation à rejoindre ton espace.
                </div>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteStatus("idle"); setInviteError(null); }}
                  placeholder="email@athlète.com"
                  style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: "1px solid rgba(0,0,0,.12)", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
                />
                {inviteStatus === "sent" && (
                  <div style={{ fontSize: 12, color: "#2f9e44", marginBottom: 8 }}>✓ Invitation envoyée !</div>
                )}
                {inviteStatus === "error" && (
                  <div style={{ fontSize: 12, color: "#d10000", marginBottom: 8 }}>{inviteError ?? "Erreur. Réessaie depuis ton espace."}</div>
                )}
                <button
                  disabled={inviteStatus === "sending" || !inviteEmail.trim()}
                  onClick={async () => {
                    setInviteStatus("sending");
                    const res = await fetch("/api/invite/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athleteEmail: inviteEmail.trim() }) });
                    if (res.ok) {
                      setInviteStatus("sent");
                    } else {
                      const json = await res.json().catch(() => ({}));
                      setInviteError(json.error ?? null);
                      setInviteStatus("error");
                    }
                  }}
                  style={{ width: "100%", height: 44, borderRadius: 10, border: "none", background: inviteStatus === "sending" || !inviteEmail.trim() ? "#ccc" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: inviteStatus === "sending" || !inviteEmail.trim() ? "default" : "pointer" }}
                >
                  {inviteStatus === "sending" ? "Envoi…" : "Inviter →"}
                </button>
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: "#62686e", lineHeight: 1.5, marginBottom: 8 }}>
                    Accès complet — 7 jours gratuits · {priceAfterTrial} ensuite
                  </div>
                  <button
                    onClick={() => setShowPaywall(true)}
                    style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid rgba(212,64,0,.3)", background: "rgba(212,64,0,.05)", color: "#d44000", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                  >
                    Commencer l'essai gratuit
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={goToApp}
              style={{ width: "100%", height: 42, borderRadius: 12, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {emailSent ? "J'ai activé mon compte →" : "Découvrir mon espace →"}
            </button>
          </div>
        )}

      </div>
    </AuthBackground>
  );
}
