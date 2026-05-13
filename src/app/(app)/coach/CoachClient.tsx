"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView } from "@/lib/coachSessions";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus } from "@/types";

interface Props {
  coachName: string | null;
  athletes: CoachAthlete[];
  todaySessions: CoachViewSession[];
  today: string;
  userId: string;
  subscriptionStatus: SubscriptionStatus;
}

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }

function WellnessRing({ score, size = 72 }: { score: number; size?: number }) {
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

function maxDiffToday(athleteId: string, sessions: CoachViewSession[]) {
  const s = sessions.filter(x => x.athlete_id === athleteId);
  return s.length ? Math.max(...s.map(x => x.target_difficulty ?? 6)) : 0;
}

function attention(a: CoachAthlete, maxDiff: number) {
  return a.wellness_score < 65 || maxDiff >= 8 || (a.wellness_score < 72 && maxDiff >= 6);
}

function decisionText(a: CoachAthlete, maxDiff: number) {
  if (a.wellness_score < 55 && maxDiff >= 7) return "Wellness bas + séance difficile : alléger maintenant.";
  if (maxDiff >= 8) return "Séance dure prévue : vérifier qu'il n'enchaîne pas dur.";
  if (a.wellness_score < 65) return "Wellness à surveiller : réduire volume ou vérifier la difficulté réelle.";
  return "Plan cohérent : suivre la difficulté réelle.";
}

function MissionCard({ athlete, sessions, isPriority, onDecide }: {
  athlete: CoachAthlete;
  sessions: CoachViewSession[];
  isPriority: boolean;
  onDecide: () => void;
}) {
  const maxDiff = maxDiffToday(athlete.id, sessions);
  const todaySessions = sessions.filter(s => s.athlete_id === athlete.id);
  const decision = decisionText(athlete, maxDiff);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
      background: isPriority ? "linear-gradient(180deg,#fff,#fff5ef)" : "#fff",
      border: isPriority ? "1px solid rgba(212,64,0,.34)" : "1px solid rgba(0,0,0,.08)",
      borderRadius: 26, padding: 18,
      boxShadow: isPriority ? "0 18px 46px rgba(212,64,0,.10)" : "0 14px 36px rgba(0,0,0,.065)",
    }}>
      <WellnessRing score={athlete.wellness_score} size={72} />

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 950, color: "#1f2428", letterSpacing: "-0.02em" }}>{athlete.name}</div>
        <div style={{ fontSize: 11, color: "#6b7277", marginTop: 2 }}>
          {athlete.sport} · {todaySessions.length} séance{todaySessions.length !== 1 ? "s" : ""} · difficulté prévue {maxDiff || "—"}/10
        </div>
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.35, marginTop: 6 }}>{decision}</div>
        {maxDiff >= 8 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, borderRadius: 999, padding: "6px 9px", background: "#fff0e9", color: "#d44000", border: "1px solid rgba(212,64,0,.18)", fontSize: 10, fontWeight: 1000 }}>
            Séance dure à valider
          </div>
        )}
        <div style={{ display: "inline-flex", marginTop: 8, borderRadius: 999, padding: "6px 9px", background: isPriority ? "#fff0e9" : "#eef8f1", color: isPriority ? "#d44000" : "#166534", fontSize: 11, fontWeight: 1000 }}>
          {isPriority ? "Décision requise" : "Plan cohérent"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          onClick={onDecide}
          style={{ height: 36, paddingLeft: 14, paddingRight: 14, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)", whiteSpace: "nowrap" }}
        >
          {isPriority ? "Décider" : "Voir"}
        </button>
      </div>
    </div>
  );
}

export default function CoachClient({ athletes: initialAthletes, todaySessions, today, userId, subscriptionStatus }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();

  const [selectedDate, setSelectedDate] = useState(today);
  const [sessions, setSessions] = useState<CoachViewSession[]>(todaySessions);
  const [athletes, setAthletes] = useState(initialAthletes);

  // Realtime: update wellness scores as athletes fill in their daily wellness
  useEffect(() => {
    const realAthletes = athletes.filter(a => a.user_id);
    if (!realAthletes.length) return;

    const channels = realAthletes.map(a =>
      supabase
        .channel(`dash-wellness-${a.user_id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${a.user_id}` },
          (payload) => {
            const row = payload.new as any;
            if (row?.score != null) {
              setAthletes(prev => prev.map(x =>
                x.user_id === a.user_id ? { ...x, wellness_score: row.score } : x
              ));
            }
          })
        .subscribe()
    );

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, []);

  const handleDateChange = useCallback(async (date: string) => {
    setSelectedDate(date);

    const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
    const demoAthleteIds = athletes.filter(a => !a.user_id).map(a => a.id);

    const [realRes, demoRes] = await Promise.all([
      realUserIds.length
        ? supabase.from("sessions").select("*").in("user_id", realUserIds).eq("date", date)
        : Promise.resolve({ data: [] }),
      demoAthleteIds.length
        ? supabase.from("coach_sessions").select("*").eq("coach_id", userId).in("athlete_id", demoAthleteIds).eq("date", date)
        : Promise.resolve({ data: [] }),
    ]);

    const unified: CoachViewSession[] = [
      ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
      ...(demoRes.data || []).map(s => demoToView(s as CoachSession)),
    ];
    setSessions(unified);
  }, [supabase, userId, athletes]);

  const priority = athletes.filter(a => attention(a, maxDiffToday(a.id, sessions)));
  const stable = athletes.filter(a => !attention(a, maxDiffToday(a.id, sessions)));
  const avgWellness = athletes.length
    ? Math.round(athletes.reduce((s, a) => s + a.wellness_score, 0) / athletes.length)
    : 0;
  const totalSessions = athletes.reduce((n, a) => n + sessions.filter(s => s.athlete_id === a.id).length, 0);

  return (
    <>
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} />

      <div style={{ padding: isLg ? "20px 40px 100px" : isMd ? "18px 24px 100px" : "16px 16px 100px", maxWidth: isLg ? 1000 : isMd ? 720 : 600, margin: "0 auto" }}>

        <div style={{
          position: "relative", overflow: "hidden",
          background: "linear-gradient(135deg,#111 0%,#303030 70%,#151515 100%)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 22, padding: 16,
          boxShadow: "0 18px 44px rgba(0,0,0,.20)",
          marginBottom: 14,
        }}>
          <div style={{ position: "absolute", right: -52, top: -52, width: 180, height: 180, borderRadius: "50%", background: "rgba(212,64,0,.24)", filter: "blur(18px)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ fontSize: 32, fontWeight: 1000, letterSpacing: "-0.05em", lineHeight: 1.02, color: "#fff", marginBottom: 6 }}>
              Mission Control
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.78)" }}>
              Wellness + difficulté attendue : les sportifs qui demandent une décision maintenant.
            </div>
          </div>
        </div>

        <div className="stats-grid-3" style={{ margin: "12px 0" }}>
          {[
            { value: priority.length, label: "Décisions à prendre" },
            { value: avgWellness || "—", label: "Wellness équipe" },
            { value: totalSessions, label: "Séances prévues" },
          ].map(({ value, label }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: 13, textAlign: "center", boxShadow: "0 12px 34px rgba(0,0,0,.055)" }}>
              <div style={{ fontSize: 34, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.05em", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#73787c", marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏋️</div>
            <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", marginBottom: 8 }}>Aucun sportif pour le moment</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Ajoute tes premiers sportifs pour commencer à suivre leur wellness et leurs séances.
            </div>
            <button
              onClick={() => router.push("/coach/athletes")}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Gérer les athlètes →
            </button>
          </div>
        ) : (
          <>
            <div style={{ margin: "13px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 9 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428" }}>À décider maintenant</div>
                  <div style={{ fontSize: 12, color: "#687075", lineHeight: 1.4, marginTop: 2 }}>Le coach voit d'abord ce qui mérite une action.</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {priority.length > 0 ? priority.map(a => (
                  <MissionCard key={a.id} athlete={a} sessions={sessions} isPriority={true}
                    onDecide={() => router.push(`/coach/planning?athlete=${a.id}`)} />
                )) : (
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "18px 16px", textAlign: "center", fontSize: 13, color: "#687075", boxShadow: "0 4px 12px rgba(0,0,0,.04)", gridColumn: isLg ? "1 / -1" : undefined }}>
                    Aucune décision urgente. L'équipe peut suivre le plan.
                  </div>
                )}
              </div>
            </div>

            <div style={{ margin: "13px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 9 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428" }}>Plan cohérent</div>
                  <div style={{ fontSize: 12, color: "#687075", lineHeight: 1.4, marginTop: 2 }}>Pas d'intervention immédiate.</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {stable.length > 0 ? stable.map(a => (
                  <MissionCard key={a.id} athlete={a} sessions={sessions} isPriority={false}
                    onDecide={() => router.push(`/coach/planning?athlete=${a.id}`)} />
                )) : (
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "18px 16px", textAlign: "center", fontSize: 13, color: "#687075", boxShadow: "0 4px 12px rgba(0,0,0,.04)", gridColumn: isLg ? "1 / -1" : undefined }}>
                    Tous les sportifs nécessitent une attention aujourd'hui.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => router.push("/coach/athletes")}
            style={{ flex: 1, height: 46, borderRadius: 14, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#171b1f", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Gérer les athlètes
          </button>
          <button onClick={() => router.push("/coach/planning")}
            style={{ flex: 1, height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}>
            Planning →
          </button>
        </div>
      </div>
    </>
  );
}
