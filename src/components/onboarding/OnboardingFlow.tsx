"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import AuthBackground from "@/components/auth/AuthBackground";

/* ─── types ─── */
type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "advanced" | "elite";
type Readiness = "fresh" | "normal" | "tired";
type StepId =
  | "welcome" | "role"
  | "sport_a" | "level_a" | "freq_a" | "readiness_a"
  | "sport_c" | "level_c" | "count_c"
  | "account";

/* userId = already logged-in (onboarding page fallback). Omit = register mode (account step included). */
interface Props { userId?: string }

const ATHLETE_PATH: StepId[] = ["welcome", "role", "sport_a", "level_a", "freq_a", "readiness_a", "account"];
const COACH_PATH: StepId[]   = ["welcome", "role", "sport_c", "level_c", "count_c", "account"];
const ATHLETE_PATH_AUTH: StepId[] = ["welcome", "role", "sport_a", "level_a", "freq_a", "readiness_a"];
const COACH_PATH_AUTH: StepId[]   = ["welcome", "role", "sport_c", "level_c", "count_c"];

const ATHLETE_SPORTS = [
  { id: "Haltérophilie",       icon: "🏋️", sub: "Force, technique, charges" },
  { id: "Sprint",              icon: "⚡", sub: "Vitesse, puissance, récupérations" },
  { id: "Préparation physique",icon: "💪", sub: "Force, mobilité, conditioning" },
  { id: "CrossFit",            icon: "🔥", sub: "WOD, force, volume" },
  { id: "Fitness",             icon: "🏃", sub: "Routine, progression, forme" },
  { id: "Rugby",               icon: "🏉", sub: "Terrain, force, prévention" },
];
const COACH_SPORTS = [
  { id: "Préparation physique",icon: "💪", sub: "Force, vitesse, prévention" },
  { id: "Haltérophilie",       icon: "🏋️", sub: "Technique, force, compétition" },
  { id: "Sprint",              icon: "⚡", sub: "Accélération, vitesse max" },
  { id: "CrossFit",            icon: "🔥", sub: "Volume, WOD, force" },
  { id: "Rugby",               icon: "🏉", sub: "Terrain, puissance, contact" },
  { id: "Football",            icon: "⚽", sub: "Vitesse, appuis, récup" },
];

/* ─── session templates ─── */
function getSessionTemplates(sport: string): [string, string][] {
  const s = sport.toLowerCase();
  if (s.includes("sprint")) return [
    ["Accélération 20m",   "Échauffement complet\n6x20m départ arrêté\nRécup 3 min\nFocus : sortie de bloc"],
    ["Vitesse max fly 30m","4x30m lancé\nRécup complète 4–5 min\nQualité > volume"],
    ["Tempo + mobilité",   "8x100m facile\nMobilité hanches/chevilles\nRespiration 5 min"],
    ["Renforcement sprint","Squat 4x4\nNordic curl 3x5\nGainage anti-rotation"],
  ];
  if (s.includes("halt") || s.includes("force")) return [
    ["Snatch technique",  "Complexe : high pull + hang snatch\n5 séries @ 70–80%\nFocus vitesse sous la barre"],
    ["Clean & Jerk lourd","Clean + jerk 5x1\nFront squat 3x3\nDifficulté cible contrôlé"],
    ["Squat + tirages",   "Back squat 5x5\nSnatch pull 4x3\nGainage 8 min"],
    ["Technique légère",  "Power snatch 6x2\nJerk footwork\nMobilité épaules/hanches"],
  ];
  if (s.includes("crossfit")) return [
    ["WOD Conditioning",  "Échauffement 10 min\nFor time : 3 rounds\n15 thrusters – 10 pull-ups\nCore 8 min"],
    ["Strength day",      "Back squat 5x5\nDeadlift 3x3\nAccessoire : GHD, KB"],
    ["Gymnastics",        "EMOM 16 min : HS walk / row\nDouble-unders, ring muscle-up"],
    ["Recovery + mobilité","Row facile 20 min\nMobilité hanches, épaules\nBreathing work"],
  ];
  return [
    ["Séance qualité",       "Bloc principal technique\n3–5 séries propres\nDifficulté maîtrisée"],
    ["Séance volume",        "Travail continu modéré\nVolume progressif\nRespiration contrôlée"],
    ["Mobilité + récupération","20–30 min facile\nMobilité globale\nMarche ou vélo doux"],
    ["Renforcement général", "Mouvements de base\nCore\nPrévention blessures"],
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

function buildWellnessBaseline(userId: string, readiness: Readiness, level: Level) {
  const penalty = readiness === "tired" ? 18 : readiness === "fresh" ? 0 : 8;
  const bonus   = level === "elite" ? 4 : level === "advanced" ? 2 : 0;
  const base    = Math.max(35, 82 - penalty + bonus);
  const today   = new Date().toISOString().split("T")[0];
  return {
    user_id: userId, date: today,
    sleep: readiness === "tired" ? 5 : 7,
    stress: readiness === "tired" ? 7 : 5,
    recovery: base >= 70 ? 7 : 5,
    motivation: readiness === "fresh" ? 8 : 7,
    base_score: base, score: base, behaviors: [],
  };
}

const ATHLETE_NAMES = [
  "Lucas Martin","Emma Dubois","Thomas Bernard","Chloé Petit",
  "Maxime Richard","Inès Simon","Antoine Moreau","Manon Laurent",
  "Clément Garcia","Léa David","Nicolas Bertrand","Sarah Roux",
  "Julien Leroy","Marine Morel","Pierre Girard","Camille Fontaine",
  "Romain Bonnet","Julie Dupont","Alexandre Lambert","Laura Rousseau",
  "Théo Michel","Pauline Robert","Baptiste Lefevre","Amandine Simon",
];

function buildCoachAthletes(coachId: string, sport: string, count: number) {
  return ATHLETE_NAMES.slice(0, count).map((name, i) => ({
    coach_id: coachId, name, sport,
    wellness_score: Math.max(52, Math.min(94, 56 + ((i * 17 + name.length * 7) % 38))),
  }));
}

function buildCoachSessions(coachId: string, athletes: { id: string }[], sport: string) {
  const templates = getSessionTemplates(sport);
  const sessions: object[] = [];
  athletes.forEach((athlete, aIdx) => {
    const dow = aIdx % 3 === 0 ? [1, 4] : aIdx % 3 === 1 ? [2, 5] : [1, 3, 5];
    dow.forEach((d, sIdx) => {
      const [name, notes] = templates[(aIdx + sIdx) % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athlete.id, date: nextDateForDow(d), name, notes, done: false, target_difficulty: 5 + ((aIdx + sIdx) % 4) });
    });
  });
  return sessions;
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

/* ─── main ─── */
export default function OnboardingFlow({ userId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isRegisterMode = !userId;

  const [stepIdx, setStepIdx]   = useState(0);
  const [role, setRole]         = useState<Role>("athlete");
  const [name, setName]         = useState("");
  const [sport, setSport]       = useState("Haltérophilie");
  const [level, setLevel]       = useState<Level>("intermediate");
  const [freq, setFreq]         = useState(4);
  const [readiness, setReadiness] = useState<Readiness>("normal");
  const [coachCount, setCoachCount] = useState(8);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const getPath = (r: Role): StepId[] => {
    if (!isRegisterMode) return r === "coach" ? COACH_PATH_AUTH : ATHLETE_PATH_AUTH;
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
  };
  const path = getPath(role);
  const currentStep = path[stepIdx];
  const isLast  = stepIdx === path.length - 1;

  function next()  { if (!isLast) setStepIdx(i => i + 1); }
  function back()  { if (stepIdx > 0) setStepIdx(i => i - 1); }

  function goNextFromRole() {
    const newPath = getPath(role);
    const nextIdx = 2; // always go to index 2 = first sport step
    setStepIdx(Math.min(nextIdx, newPath.length - 1));
  }

  async function saveData(uid: string) {
    await supabase.from("profiles").update({
      name: name.trim(), sport, mode: role, onboarding_done: true,
      freq_target: role === "athlete" ? freq : null,
      objective: role === "athlete" ? "performance" : null,
    }).eq("user_id", uid);

    if (role === "athlete") {
      await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, freq));
      await supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, readiness, level), { onConflict: "user_id,date" });
    } else {
      const { data: savedAthletes } = await supabase.from("coach_athletes").insert(buildCoachAthletes(uid, sport, coachCount)).select("id");
      if (savedAthletes?.length) {
        await supabase.from("coach_sessions").insert(buildCoachSessions(uid, savedAthletes as { id: string }[], sport));
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
      } else {
        await saveData(userId!);
      }
      router.push(role === "coach" ? "/coach" : "/today");
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  return (
    <AuthBackground>
      <div style={{ width: "100%", maxWidth: 430, background: "rgba(255,255,255,.94)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(0,0,0,.12)", borderRadius: 24, padding: 18, boxShadow: "0 26px 80px rgba(0,0,0,.40)" }}>

        {/* Badge */}
        <div style={{ display: "inline-flex", marginBottom: 10, padding: "6px 10px", borderRadius: 999, background: "rgba(212,64,0,.08)", color: "#d44000", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.10em" }}>
          Configuration
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {path.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stepIdx ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
          ))}
        </div>

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
              placeholder="ex: Alex" onKeyDown={e => { if (e.key === "Enter") { if (name.trim()) { next(); } else { setNameError(true); } } }}
              style={{ ...inputStyle, border: nameError ? "1.5px solid #d44000" : inputStyle.border }}
            />
            {nameError && <div style={{ fontSize: 11, color: "#d44000", marginBottom: 8, marginTop: -8 }}>Entre ton prénom pour continuer</div>}
            <button
              onClick={() => { if (name.trim()) { next(); } else { setNameError(true); } }}
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
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── readiness ── */}
        {currentStep === "readiness_a" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Ton état en ce moment ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Cette estimation initialise le wellness et les premiers conseils.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="🟢" title="Bonne énergie" sub="Je me sens disponible"               selected={readiness === "fresh"}  onClick={() => setReadiness("fresh")} />
              <Choice icon="🟠" title="Correct"       sub="Je peux m'entraîner normalement"     selected={readiness === "normal"} onClick={() => setReadiness("normal")} />
              <Choice icon="🔴" title="Fatigué"       sub="Il faudra adapter la charge"          selected={readiness === "tired"}  onClick={() => setReadiness("tired")} />
            </div>
            {!isRegisterMode && (
              <>
                <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", lineHeight: 1.4, margin: "10px 0 14px" }}>
                  Après cette étape, tu arrives dans une app déjà remplie avec un planning, des séances et des conseils personnalisés.
                </div>
                <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon planning"} nextDisabled={saving} />
              </>
            )}
            {isRegisterMode && (
              <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            )}
          </div>
        )}

        {/* ── sport coach ── */}
        {currentStep === "sport_c" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Quel sport coaches-tu principalement ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Cela sert à générer des sportifs et séances de démonstration crédibles.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto", paddingRight: 2 }}>
              {COACH_SPORTS.map(s => <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id} onClick={() => setSport(s.id)} />)}
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── level coach ── */}
        {currentStep === "level_c" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Niveau général de tes sportifs ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Les séances de démo et les alertes seront ajustées à ce niveau.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="🌱" title="Débutants"      sub="Bases techniques et progressivité" selected={level === "beginner"}     onClick={() => setLevel("beginner")} />
              <Choice icon="⚙️" title="Intermédiaires" sub="Séances structurées"               selected={level === "intermediate"} onClick={() => setLevel("intermediate")} />
              <Choice icon="🚀" title="Avancés"        sub="Plus de précision et d'intensité"  selected={level === "advanced"}     onClick={() => setLevel("advanced")} />
              <Choice icon="🏆" title="Compétition"    sub="Suivi charge et performance"        selected={level === "elite"}        onClick={() => setLevel("elite")} />
            </div>
            <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
          </div>
        )}

        {/* ── count coach ── */}
        {currentStep === "count_c" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>Combien de sportifs veux-tu simuler ?</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>Tu pourras ajouter ou supprimer des sportifs depuis l'onglet Athlètes.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              <Choice icon="" title="3 sportifs"  sub="Petit groupe"      selected={coachCount === 3}  onClick={() => setCoachCount(3)} />
              <Choice icon="" title="8 sportifs"  sub="Équipe standard"   selected={coachCount === 8}  onClick={() => setCoachCount(8)} />
              <Choice icon="" title="15 sportifs" sub="Groupe large"      selected={coachCount === 15} onClick={() => setCoachCount(15)} />
              <Choice icon="" title="24 sportifs" sub="Structure complète" selected={coachCount === 24} onClick={() => setCoachCount(24)} />
            </div>
            {!isRegisterMode && (
              <>
                <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", lineHeight: 1.4, margin: "10px 0 14px" }}>
                  Après cette étape, tu arrives dans un espace coach avec sportifs, scores wellness, séances et planning déjà préremplis.
                </div>
                <Actions onBack={back} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving} />
              </>
            )}
            {isRegisterMode && (
              <Actions onBack={back} onNext={next} nextLabel="Suivant →" />
            )}
          </div>
        )}

        {/* ── account (register mode only) ── */}
        {currentStep === "account" && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 6 }}>
              {role === "coach" ? "Ton espace coach est prêt." : "Ton planning est prêt."}
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
              Crée ton compte pour y accéder maintenant.
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
              nextLabel={saving ? "Création…" : (role === "coach" ? "Créer mon espace coach" : "Créer mon planning")}
              nextDisabled={saving || !email.trim() || password.length < 8}
            />

            <div style={{ textAlign: "center", fontSize: 12, color: "#8a8f94", marginTop: 14 }}>
              Déjà un compte ?{" "}
              <Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>
                Se connecter
              </Link>
            </div>
          </div>
        )}

      </div>
    </AuthBackground>
  );
}
