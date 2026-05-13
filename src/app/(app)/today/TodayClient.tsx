"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import WellnessModal from "@/components/wellness/WellnessModal";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import CompleteModal from "@/components/sessions/CompleteModal";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { Profile, WellnessDaily, Session } from "@/types";

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
}

export default function TodayClient({ userId, profile, initialDate, initialWellness, initialSessions }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [wellness, setWellness] = useState<WellnessDaily | null>(initialWellness);
  const [allSessions, setAllSessions] = useState<Session[]>(initialSessions);

  const [showWellness, setShowWellness] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);

  const todaySessions = allSessions.filter((s) => s.date === selectedDate);
  const score = wellness?.score ?? null;
  const advice = getAdvice(wellness, todaySessions);
  const dotMap = buildDotMap(allSessions, selectedDate);

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
    if (saved) setWellness(saved as WellnessDaily);
    setShowWellness(false);
    router.refresh();
  }, [supabase, userId, selectedDate, router]);

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number }) => {
    const { data: saved } = await supabase
      .from("sessions").insert({ user_id: userId, ...data, done: false }).select().single();
    if (saved) setAllSessions((prev) => [...prev, saved as Session]);
    setShowAddSession(false);
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
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} />

      <div style={{ padding: `14px ${pad}px 18px`, maxWidth: isLg ? 1000 : isMd ? 720 : "100%", margin: "0 auto" }}>
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
            onClick={() => setShowWellness(true)}
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
              <WellnessRingPOC score={score} size={ringSize} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 6 }}>
                  Score &amp; conseils
                </div>
                <div style={{ fontSize: "clamp(22px, 7vw, 34px)", fontWeight: 1000, color: "#fff", marginBottom: 8, lineHeight: 1.08, letterSpacing: "-0.04em" }}>
                  {formLabel(score)}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.76)" }}>
                  {wellness ? "Rempli aujourd'hui" : "Non rempli · Appuie pour remplir"}
                </div>
                {wellness && wellness.behaviors.length > 0 && (
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

            {score !== null && score < 55 && (
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

            <div id="day-sessions-container">
              {todaySessions.length === 0 && (
                <div style={{ border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: "var(--radius)", padding: 12, textAlign: "center", color: "var(--muted)", fontSize: 12, marginBottom: 9 }}>
                  Repos ou séance libre
                </div>
              )}
              {todaySessions.map((s) => (
                <TodaySessionCard
                  key={s.id}
                  session={s}
                  onComplete={setCompleting}
                  onEdit={setEditing}
                  onDelete={deleteSession}
                />
              ))}
            </div>

            <div
              onClick={() => setShowAddSession(true)}
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
        <WellnessModal date={selectedDate} onSave={saveWellness} onClose={() => setShowWellness(false)} />
      )}
      {showAddSession && (
        <AddSessionModal date={selectedDate} onSave={addSession} onClose={() => setShowAddSession(false)} />
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
    </>
  );
}
