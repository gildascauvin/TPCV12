"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, addDays, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePaywall } from "@/hooks/usePaywall";
import PaywallModal from "@/components/paywall/PaywallModal";

import CalendarHeader from "@/components/calendar/CalendarHeader";
import CoachSessionModal from "@/components/coach/CoachSessionModal";
import CoachCompleteModal from "@/components/coach/CoachCompleteModal";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus } from "@/types";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }
function formLabel(s: number) { return s >= 82 ? "Zone optimale" : s >= 65 ? "Zone stable" : s >= 45 ? "Zone prudente" : "Zone récupération"; }

function dayWellness(
  athlete: CoachAthlete,
  dateStr: string,
  wellnessMap: Record<string, Record<string, number>>
): number {
  if (athlete.user_id && wellnessMap[athlete.user_id]?.[dateStr] !== undefined) {
    return wellnessMap[athlete.user_id][dateStr];
  }
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

function PlanningRing({ score }: { score: number }) {
  const r = 22;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 8px 18px rgba(0,0,0,.12))" }}>
      <svg width="58" height="58" viewBox="0 0 58 58" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="29" cy="29" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="6" />
        <circle cx="29" cy="29" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.28s ease, stroke 0.28s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.04em", color: "#fff" }}>{score}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,0.56)", marginTop: 2, textTransform: "uppercase" }}>well</span>
      </div>
    </div>
  );
}

function DiffGauge({ value, height = 11 }: { value: number | null; height?: number }) {
  if (!value) return null;
  const bg = value >= 8 ? "linear-gradient(90deg,#ffb5a7,#d44000)" : value >= 5 ? "linear-gradient(90deg,#ffe0a0,#f28a00)" : "linear-gradient(90deg,#bfeec8,#2f9e44)";
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ width: "100%", height, borderRadius: 999, background: "#e7e4df", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${w}%`, background: bg }} />
    </div>
  );
}

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
  const { showPaywall, setShowPaywall, allowDismiss, requireSubscription } = usePaywall(subscriptionStatus);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const defaultAthleteId = searchParams.get("athlete") ?? athletes[0]?.id ?? "";
  const [selectedAthleteId, setSelectedAthleteId] = useState(defaultAthleteId);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sessions, setSessions] = useState<CoachViewSession[]>(initialSessions);
  const [wellnessMap, setWellnessMap] = useState(initialWellnessMap);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<CoachViewSession | null>(null);
  const [completing, setCompleting] = useState<CoachViewSession | null>(null);

  useEffect(() => {
    const id = searchParams.get("athlete");
    if (id && athletes.find(a => a.id === id)) setSelectedAthleteId(id);
  }, [searchParams, athletes]);

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

  if (!athlete) {
    return (
      <>
        <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} />
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
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} />

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

      {/* 7-column scrollable grid — full-width, always scrolls horizontally */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
        gap: isMd ? 12 : 10,
        overflowX: "auto",
        padding: isMd ? "14px 24px 18px" : "14px 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
      }}>
        {weekDates.map(date => {
          const dstr = format(date, "yyyy-MM-dd");
          const isToday = dstr === todayStr;
          const daySessions = sessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
          const wellness = dayWellness(athlete, dstr, wellnessMap);
          const rule = loadRule(daySessions);
          const tagColor = ruleTagColors[rule.cls];

          return (
            <div key={dstr} className="week-col-width" style={{
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
      </div>

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

      {showPaywall && (
        <PaywallModal
          mode="coach"
          allowDismiss={allowDismiss}
          onClose={() => setShowPaywall(false)}
          onSuccess={() => { setShowPaywall(false); router.refresh(); }}
        />
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
