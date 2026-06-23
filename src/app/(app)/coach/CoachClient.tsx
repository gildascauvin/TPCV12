"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView } from "@/lib/coachSessions";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import CoachSessionModal from "@/components/coach/CoachSessionModal";
import ReviewCompleteModal from "@/components/coach/ReviewCompleteModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import WelcomeReveal from "@/components/onboarding/WelcomeReveal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import PaywallModal from "@/components/paywall/PaywallModal";
import { usePaywall } from "@/hooks/usePaywall";
import DiffGauge from "@/components/calendar/DiffGauge";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus } from "@/types";

interface Props {
  coachName: string | null;
  athletes: CoachAthlete[];
  todaySessions: CoachViewSession[];
  today: string;
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
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
  return a.wellness_score < 55 ||
    (a.wellness_score < 65 && maxDiff >= 5) ||
    maxDiff >= 8 ||
    (a.wellness_score < 72 && maxDiff >= 6);
}

function riskScore(a: CoachAthlete, maxDiff: number): number {
  let score = 0;
  if (a.wellness_score < 55) score += 4;
  else if (a.wellness_score < 65) score += 2;
  if (maxDiff >= 8) score += 3;
  else if (maxDiff >= 6) score += 1;
  return score;
}

function decisionText(a: CoachAthlete, maxDiff: number) {
  if (a.wellness_score < 55 && maxDiff >= 7) return "Wellness bas + séance difficile : alléger maintenant.";
  if (maxDiff >= 8) return "Séance dure prévue : vérifier qu'il n'enchaîne pas dur.";
  if (a.wellness_score < 65 && maxDiff <= 4) return "Wellness légèrement bas, séance légère : rien à changer, surveiller demain.";
  if (a.wellness_score < 65) return "Wellness à surveiller : réduire le volume ou vérifier la difficulté réelle.";
  return "Plan cohérent : suivre la difficulté réelle.";
}

function CoachCard({ athlete, sessions, isPriority, isReviewed, onDecide, tourId }: {
  athlete: CoachAthlete;
  sessions: CoachViewSession[];
  isPriority: boolean;
  isReviewed: boolean;
  onDecide: () => void;
  tourId?: string;
}) {
  const maxDiff = maxDiffToday(athlete.id, sessions);
  const todaySessions = sessions.filter(s => s.athlete_id === athlete.id);
  const decision = decisionText(athlete, maxDiff);
  const showBadge = isPriority && !isReviewed;
  const showReviewed = isPriority && isReviewed;

  let cardBg = "#fff";
  let cardBorder = "1px solid rgba(0,0,0,.08)";
  let cardShadow = "0 14px 36px rgba(0,0,0,.065)";

  if (showBadge) {
    cardBg = "linear-gradient(180deg,#fff,#fff5ef)";
    cardBorder = "1.5px solid rgba(212,64,0,.45)";
    cardShadow = "0 18px 46px rgba(212,64,0,.13)";
  } else if (showReviewed) {
    cardBg = "linear-gradient(180deg,#fff,#f4fbf6)";
    cardBorder = "1.5px solid rgba(47,158,68,.30)";
    cardShadow = "0 14px 36px rgba(47,158,68,.07)";
  }

  return (
    <div data-tour={tourId} style={{
      position: "relative", overflow: "hidden",
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
      background: cardBg, border: cardBorder, borderRadius: 26, padding: 18,
      boxShadow: cardShadow,
      transition: "border 0.3s ease, box-shadow 0.3s ease",
    }}>
      {/* Pulsing badge top-right */}
      {showBadge && (
        <>
          <style>{`
            @keyframes perf-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(1.35); }
            }
          `}</style>
          <div style={{
            position: "absolute", top: 14, right: 14,
            width: 9, height: 9, borderRadius: "50%", background: "#d44000",
            animation: "perf-pulse 1.8s ease-in-out infinite",
          }} />
        </>
      )}

      <WellnessRing score={athlete.wellness_score} size={72} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 950, color: "#1f2428", letterSpacing: "-0.02em" }}>{athlete.name}</div>
          {showBadge && (
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: "#d44000", color: "#fff", borderRadius: 999, padding: "3px 8px" }}>
              Attention requise
            </div>
          )}
          {showReviewed && (
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: "#eef8f1", color: "#166534", border: "1px solid rgba(47,158,68,.22)", borderRadius: 999, padding: "3px 8px" }}>
              Traité ✓
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#6b7277", marginTop: 2 }}>
          {athlete.sport} · {todaySessions.length} séance{todaySessions.length !== 1 ? "s" : ""}
        </div>
        {todaySessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {todaySessions.map(s => {
              const exercises = s.notes ? s.notes.split("\n").filter(Boolean) : [];
              const extra = exercises.length - 3;
              return (
                <div key={s.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: exercises.length ? 4 : 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#2c3236", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em" }}>
                      {s.name}
                    </span>
                    <div style={{ width: 64, flexShrink: 0 }}>
                      <DiffGauge value={s.target_difficulty} height={7} />
                    </div>
                  </div>
                  {exercises.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingLeft: 2 }}>
                      {exercises.slice(0, 3).map((ex, i) => (
                        <div key={i} style={{ fontSize: 11, color: "#4a5057", fontWeight: 500 }}>· {ex}</div>
                      ))}
                      {extra > 0 && (
                        <div style={{ fontSize: 11, color: "#8a8f94" }}>+{extra} autre{extra > 1 ? "s" : ""}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 12,
          background: isPriority ? "#fff0e9" : "#eef8f1",
          border: `1px solid ${isPriority ? "rgba(212,64,0,.18)" : "rgba(47,158,68,.22)"}`,
          fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          color: isPriority ? "#d44000" : "#166534",
        }}>
          {decision}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          data-tour={tourId ? "decider-btn" : undefined}
          onClick={onDecide}
          style={{
            height: 36, paddingLeft: 14, paddingRight: 14, borderRadius: 12,
            background: showReviewed
              ? "linear-gradient(180deg,#2f9e44,#166534)"
              : "linear-gradient(180deg,#f04a08,#d44000)",
            color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
            cursor: "pointer",
            boxShadow: showReviewed ? "0 6px 16px rgba(47,158,68,.22)" : "0 6px 16px rgba(212,64,0,.22)",
            whiteSpace: "nowrap",
          }}
        >
          {isPriority ? (showReviewed ? "Revoir" : "Décider") : "Voir"}
        </button>
      </div>
    </div>
  );
}

export default function CoachClient({ coachName, athletes: initialAthletes, todaySessions, today, userId, subscriptionStatus, inviteCode: initialInviteCode }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus);

  const [selectedDate, setSelectedDate] = useState(today);
  const [sessions, setSessions] = useState<CoachViewSession[]>(todaySessions);
  const [athletes, setAthletes] = useState(initialAthletes);

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewAthlete, setReviewAthlete] = useState<CoachAthlete | null>(null);
  const [reviewSession, setReviewSession] = useState<CoachViewSession | null>(null);
  const [showReviewComplete, setShowReviewComplete] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [inviteCode, setInviteCode] = useState<string | null>(initialInviteCode);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1" && !localStorage.getItem(`welcome_shown_coach_${userId}`)) setShowWelcome(true);
    if (!localStorage.getItem(`activation_shown_coach_${userId}`)) { setShowActivation(true); posthog.capture("activation_banner_viewed", { mode: "coach" }); }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted reviewed IDs after hydration to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem("perf_reviewed");
      if (stored) {
        const { date, ids } = JSON.parse(stored);
        if (date === today) setReviewedIds(new Set(ids as string[]));
      }
    } catch {}
  }, []);

  // Persist reviewed IDs keyed by today's date — resets automatically the next day
  useEffect(() => {
    try {
      localStorage.setItem("perf_reviewed", JSON.stringify({
        date: today,
        ids: Array.from(reviewedIds),
      }));
    } catch {}
  }, [reviewedIds, today]);

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

  async function callSessionAPI(body: object): Promise<{ ok: boolean; session?: any; _real?: boolean }> {
    const res = await fetch("/api/coach/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function handleEmptyInvite() {
    if (!inviteEmail.trim()) return;
    setInviteStatus("loading");
    setInviteError("");
    try {
      const res = await fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteEmail: inviteEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json.error || "Erreur. Réessaie depuis ton espace.");
        setInviteStatus("error");
      } else {
        setInviteStatus("sent");
      }
    } catch {
      setInviteError("Erreur réseau. Réessaie.");
      setInviteStatus("error");
    }
  }

  const priority = athletes.filter(a => attention(a, maxDiffToday(a.id, sessions)));
  const stable = athletes.filter(a => !attention(a, maxDiffToday(a.id, sessions)));
  const sortedPriority = [...priority].sort((a, b) =>
    riskScore(b, maxDiffToday(b.id, sessions)) - riskScore(a, maxDiffToday(a.id, sessions))
  );

  const avgWellness = athletes.length
    ? Math.round(athletes.reduce((s, a) => s + a.wellness_score, 0) / athletes.length)
    : 0;
  const totalSessions = athletes.reduce((n, a) => n + sessions.filter(s => s.athlete_id === a.id).length, 0);

  function getTopSession(athleteId: string): CoachViewSession | null {
    return sessions
      .filter(s => s.athlete_id === athleteId && s.date === selectedDate)
      .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  }

  function handleDecide(athlete: CoachAthlete) {
    const topSession = getTopSession(athlete.id);
    setReviewedIds(prev => { const s = new Set(Array.from(prev)); s.add(athlete.id); return s; });
    setReviewAthlete(athlete);
    setReviewSession(topSession);
  }

  async function handleSaveReview(data: { name: string; notes: string; date: string; target_difficulty: number }, _athleteIds: string[]) {
    if (!reviewAthlete) return;

    if (reviewSession) {
      const result = await callSessionAPI({ action: "update", athleteId: reviewAthlete.id, sessionId: reviewSession.id, data });
      if (result.ok) {
        setSessions(prev => prev.map(s => s.id === reviewSession.id ? { ...s, ...data } : s));
      }
    } else {
      const result = await callSessionAPI({ action: "add", athleteId: reviewAthlete.id, data });
      if (result.ok && result.session) {
        const newS: CoachViewSession = result._real
          ? realToView(result.session as Session, athletes)
          : demoToView(result.session as CoachSession);
        setSessions(prev => [...prev, newS]);
      }
    }

    const newReviewed = new Set(Array.from(reviewedIds)); newReviewed.add(reviewAthlete.id);
    setReviewedIds(newReviewed);

    const next = sortedPriority.find(a => !newReviewed.has(a.id));

    if (next) {
      const nextSession = getTopSession(next.id);
      const nextReviewed = new Set(Array.from(newReviewed)); nextReviewed.add(next.id); setReviewedIds(nextReviewed);
      setReviewAthlete(next);
      setReviewSession(nextSession);
    } else {
      setReviewAthlete(null);
      setReviewSession(null);
      if (sortedPriority.length > 0) {
        setShowReviewComplete(true);
      }
    }
  }

  function handleCloseReview() {
    setReviewAthlete(null);
    setReviewSession(null);
  }

  const reviewedPriorityCount = sortedPriority.filter(a => reviewedIds.has(a.id)).length;

  return (
    <>
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} />

      <div style={{ padding: isLg ? "20px 40px 100px" : isMd ? "18px 24px 100px" : "16px 16px 100px", maxWidth: isLg ? 1000 : isMd ? 720 : 600, margin: "0 auto" }}>

        {/* ── Welcome overlay handled below ── */}

        {/* ── Bandeau d'activation coach (J0) ── */}
        {showActivation && inviteCode && (
          <div style={{ background: "#fff", borderRadius: 24, padding: "18px 18px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.08)", border: "1px solid rgba(212,64,0,.14)", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 4 }}>
              Invite ton premier sportif 🎯
            </div>
            <div style={{ fontSize: 12, color: "#62686e", marginBottom: 10, lineHeight: 1.5 }}>
              Envoie le lien, il rejoint ton espace en 30 secondes.
            </div>
            <div style={{ background: "rgba(212,64,0,.06)", border: "1px solid rgba(212,64,0,.18)", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#d44000", wordBreak: "break-all" }}>
              go.theperfclub.com/join/{inviteCode}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => requireSubscription(() => {
                  posthog.capture("activation_banner_cta_clicked", { mode: "coach", cta_type: "copy_link" });
                  navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                  localStorage.setItem(`activation_shown_coach_${userId}`, "1");
                  setShowActivation(false);
                })}
                style={{ flex: 1, height: 42, borderRadius: 12, background: linkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)", transition: "background .2s" }}
              >
                {linkCopied ? "✓ Lien copié !" : "📋 Copier le lien"}
              </button>
              <button
                onClick={() => requireSubscription(() => {
                  posthog.capture("activation_banner_cta_clicked", { mode: "coach", cta_type: "whatsapp" });
                  const msg = encodeURIComponent(`Salut ! Rejoins mon espace ThePerfClub ici : https://go.theperfclub.com/join/${inviteCode}`);
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                })}
                style={{ height: 42, width: 42, borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                📲
              </button>
              <button
                onClick={() => { localStorage.setItem(`activation_shown_coach_${userId}`, "1"); setShowActivation(false); }}
                style={{ height: 42, paddingLeft: 12, paddingRight: 12, borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "transparent", color: "#8a8f94", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Plus tard
              </button>
            </div>
          </div>
        )}

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
              Coach Control
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.78)" }}>
              Wellness + difficulté attendue : les sportifs qui demandent une décision maintenant.
            </div>
          </div>
        </div>

        {athletes.length > 0 && (
          <div className="stats-grid-3" style={{ margin: "12px 0" }}>
            {[
              { value: sortedPriority.filter(a => !reviewedIds.has(a.id)).length, label: "Décisions restantes" },
              { value: avgWellness || "—", label: "Wellness équipe" },
              { value: totalSessions, label: "Séances prévues" },
            ].map(({ value, label }) => (
              <div key={label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: 13, textAlign: "center", boxShadow: "0 12px 34px rgba(0,0,0,.055)" }}>
                <div style={{ fontSize: 34, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.05em", lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#73787c", marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {athletes.length === 0 ? (
          <>
            <div style={{
              position: "relative", overflow: "hidden",
              background: "linear-gradient(135deg,#111 0%,#303030 70%,#151515 100%)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 22, padding: 24,
              boxShadow: "0 18px 44px rgba(0,0,0,.20)",
              marginBottom: 14,
            }}>
              <div style={{ position: "absolute", right: -52, top: -52, width: 180, height: 180, borderRadius: "50%", background: "rgba(212,64,0,.24)", filter: "blur(18px)", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏋️</div>
                <div style={{ fontSize: 26, fontWeight: 1000, letterSpacing: "-0.04em", color: "#fff", marginBottom: 8, lineHeight: 1.1 }}>
                  Invite ton premier sportif
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
                  Ton espace est prêt. Partage une invitation pour commencer à suivre le wellness et les séances de tes sportifs.
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 22, padding: 24, boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", marginBottom: 12 }}>Email du sportif</div>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(""); setInviteStatus("idle"); }}
                placeholder="athlete@email.com"
                style={{ width: "100%", height: 48, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", padding: "0 16px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
              />
              <button
                data-tour="invite-btn"
                onClick={handleEmptyInvite}
                disabled={inviteStatus === "loading" || !inviteEmail.trim()}
                style={{
                  width: "100%", height: 48, borderRadius: 14,
                  background: "linear-gradient(180deg,#f04a08,#d44000)",
                  color: "#fff", border: "none", fontSize: 15, fontWeight: 800,
                  cursor: inviteStatus === "loading" || !inviteEmail.trim() ? "not-allowed" : "pointer",
                  opacity: !inviteEmail.trim() ? 0.6 : 1,
                  boxShadow: "0 10px 24px rgba(212,64,0,.24)",
                }}
              >
                {inviteStatus === "loading" ? "Envoi en cours..." : "Envoyer l'invitation →"}
              </button>
              {inviteStatus === "sent" && (
                <div style={{ textAlign: "center", color: "#2f9e44", fontSize: 14, fontWeight: 700, marginTop: 12 }}>
                  ✅ Invitation envoyée à {inviteEmail} !
                </div>
              )}
              {inviteError && (
                <div style={{ textAlign: "center", color: "#d44000", fontSize: 13, marginTop: 10 }}>
                  {inviteError}
                </div>
              )}
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  onClick={() => router.push("/coach/athletes")}
                  style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                >
                  Gérer les sportifs →
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ margin: "13px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 9 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428" }}>À décider maintenant</div>
                  <div style={{ fontSize: 12, color: "#687075", lineHeight: 1.4, marginTop: 2 }}>Le coach voit d'abord ce qui mérite une action.</div>
                </div>
                {sortedPriority.length > 0 && reviewedPriorityCount > 0 && reviewedPriorityCount < sortedPriority.length && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#d44000", flexShrink: 0 }}>
                    {reviewedPriorityCount}/{sortedPriority.length} traités
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {sortedPriority.length > 0 ? sortedPriority.map((a, idx) => (
                  <CoachCard key={a.id} athlete={a} sessions={sessions} isPriority={true}
                    isReviewed={reviewedIds.has(a.id)}
                    tourId={idx === 0 ? "coach-card-alert" : undefined}
                    onDecide={() => requireSubscription(() => handleDecide(a))} />
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
                  <CoachCard key={a.id} athlete={a} sessions={sessions} isPriority={false}
                    isReviewed={false}
                    onDecide={() => requireSubscription(() => router.push(`/coach/planning?athlete=${a.id}`))} />
                )) : (
                  <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "18px 16px", textAlign: "center", fontSize: 13, color: "#687075", boxShadow: "0 4px 12px rgba(0,0,0,.04)", gridColumn: isLg ? "1 / -1" : undefined }}>
                    Tous les sportifs nécessitent une attention aujourd'hui.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => requireSubscription(() => { setInviteEmail(""); setInviteStatus("idle"); setInviteError(""); setShowInviteModal(true); })}
            style={{ width: "100%", height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
          >
            + Inviter des sportifs
          </button>
        </div>
      </div>

      {reviewAthlete && (
        <CoachSessionModal
          athleteName={reviewAthlete.name}
          date={selectedDate}
          session={reviewSession ? {
            id: reviewSession.id,
            coach_id: userId,
            athlete_id: reviewSession.athlete_id,
            date: reviewSession.date,
            name: reviewSession.name,
            notes: reviewSession.notes,
            done: reviewSession.done,
            rpe: reviewSession.rpe,
            duration: reviewSession.duration,
            target_difficulty: reviewSession.target_difficulty,
            created_at: reviewSession.created_at,
          } : null}
          athletes={[]}
          initialAthleteId={reviewAthlete.id}
          reviewContext={{
            wellness: reviewAthlete.wellness_score,
            maxDiff: maxDiffToday(reviewAthlete.id, sessions),
            queueCurrent: reviewedPriorityCount,
            queueTotal: sortedPriority.length,
          }}
          onSave={handleSaveReview}
          onClose={handleCloseReview}
        />
      )}

      {showReviewComplete && (
        <ReviewCompleteModal onClose={() => setShowReviewComplete(false)} />
      )}

      {showInviteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 2147483100, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 24px" }}
          onClick={e => { if (e.target === e.currentTarget) setShowInviteModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f" }}>Inviter un sportif</div>
              <button onClick={() => setShowInviteModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#8a8f94", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.5, marginBottom: 16 }}>
              Entre l'email de ton sportif. S'il a déjà un compte, il sera lié immédiatement. Sinon, il recevra une invitation.
            </div>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteError(""); setInviteStatus("idle"); }}
              placeholder="athlete@email.com"
              style={{ width: "100%", height: 48, borderRadius: 14, border: "1px solid rgba(0,0,0,.12)", padding: "0 16px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />
            {inviteStatus === "sent" && (
              <div style={{ color: "#2f9e44", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>✅ Invitation envoyée à {inviteEmail} !</div>
            )}
            {inviteError && (
              <div style={{ color: "#d44000", fontSize: 13, marginBottom: 10 }}>{inviteError}</div>
            )}
            <div style={{ position: "sticky", bottom: 0, margin: "16px -28px 0", padding: "14px 28px 20px", background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)" }}>
              <button
                onClick={handleEmptyInvite}
                disabled={inviteStatus === "loading" || !inviteEmail.trim()}
                style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 800, cursor: inviteStatus === "loading" || !inviteEmail.trim() ? "not-allowed" : "pointer", opacity: !inviteEmail.trim() ? 0.6 : 1, boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
              >
                {inviteStatus === "loading" ? "Envoi en cours..." : "Envoyer l'invitation →"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showWelcome && (
        <WelcomeReveal
          name={coachName}
          sport={null}
          mode="coach"
          onDismiss={() => {
            localStorage.setItem(`welcome_shown_coach_${userId}`, "1");
            setShowWelcome(false);
          }}
        />
      )}
      {paywallStep === "priming" && (
        <PrimingJourneyModal mode="coach" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
          onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
      )}
      {paywallStep === "paywall" && (
        <PaywallModal mode="coach" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
