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
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import PaywallModal from "@/components/paywall/PaywallModal";
import { usePaywall } from "@/hooks/usePaywall";
import DiffGauge from "@/components/calendar/DiffGauge";
import { CoachCard, WellnessRing, maxDiffToday, attention, riskScore } from "@/components/coach/CoachAthleteCard";
import InviteModal from "@/components/coach/InviteModal";
import type { TrendCode } from "@/lib/trainingLoad";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus } from "@/types";

interface Props {
  coachName: string | null;
  athletes: CoachAthlete[];
  todaySessions: CoachViewSession[];
  today: string;
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
  trends: Record<string, TrendCode | null>;
}

function greeting() { const h = new Date().getHours(); return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; }

function getCoachAdvice(athletes: CoachAthlete[], sessions: CoachViewSession[], avgWellness: number, avgDifficulty: number | null): string {
  function names(list: CoachAthlete[]) {
    const ns = list.map(a => a.name);
    if (ns.length === 1) return ns[0];
    if (ns.length === 2) return `${ns[0]} et ${ns[1]}`;
    return `${ns[0]}, ${ns[1]} et ${ns.length - 2} autre${ns.length - 2 > 1 ? "s" : ""}`;
  }
  function verb(list: CoachAthlete[], sing: string, plur: string) { return list.length > 1 ? plur : sing; }

  const inRed = athletes.filter(a => a.wellnessFilledToday !== false && a.wellness_score < 55);
  const withHard = athletes.filter(a => sessions.some(s => s.athlete_id === a.id && (s.target_difficulty ?? 0) >= 8));
  const critical = athletes.filter(a => a.wellnessFilledToday !== false && a.wellness_score < 55 && sessions.some(s => s.athlete_id === a.id && (s.target_difficulty ?? 0) >= 8));

  if (critical.length > 0)
    return `${names(critical)} ${verb(critical, "est dans le rouge", "sont dans le rouge")} avec une séance difficile prévue. Allège ou reporte avant ${verb(critical, "qu'il", "qu'ils")} s'entraîne${verb(critical, "", "nt")}.`;
  if (inRed.length > 0 && withHard.length > 0)
    return `${names(inRed)} ${verb(inRed, "est dans le rouge", "sont dans le rouge")}. ${names(withHard)} ${verb(withHard, "a", "ont")} une séance difficile prévue. Vérifie les charges avant de valider.`;
  if (inRed.length > 0)
    return `${names(inRed)} ${verb(inRed, "est dans le rouge", "sont dans le rouge")} (score < 55). Réduis l'intensité ou propose une récupération active.`;
  if (withHard.length > 0 && avgWellness < 65)
    return `${names(withHard)} ${verb(withHard, "a", "ont")} une séance difficile prévue avec un niveau de forme bas. Surveille et adapte si nécessaire.`;
  if (withHard.length > 0 && avgWellness >= 80)
    return `${names(withHard)} ${verb(withHard, "a", "ont")} une séance difficile prévue — équipe en forme (${avgWellness}/100). Fenêtre idéale, valide les charges.`;
  if (withHard.length > 0)
    return `${names(withHard)} ${verb(withHard, "a", "ont")} une séance difficile (≥8/10) prévue. Wellness équipe à ${avgWellness}/100 — surveille les réponses après séance.`;
  if (avgWellness < 55)
    return `Wellness équipe bas (${avgWellness}/100). Réduis les intensités et favorise la récupération aujourd'hui.`;
  if (avgWellness < 70)
    return `Forme correcte (${avgWellness}/100)${avgDifficulty ? ` · RPE prévu ${avgDifficulty}/10` : ""}. Les charges planifiées sont adaptées, pas besoin d'intervenir.`;
  return `Équipe en forme (${avgWellness}/100)${avgDifficulty ? ` · RPE prévu ${avgDifficulty}/10` : ""}. Conditions optimales — tes sportifs peuvent s'entraîner à pleine intensité.`;
}

export default function CoachClient({ coachName, athletes: initialAthletes, todaySessions, today, userId, subscriptionStatus, inviteCode: initialInviteCode, trends }: Props) {
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
  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
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
            if (row?.score != null && row?.date === today) {
              setAthletes(prev => prev.map(x =>
                x.user_id === a.user_id ? { ...x, wellness_score: row.score, behaviors: row.behaviors ?? [], wellnessFilledToday: true } : x
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

    const [realRes, demoRes, wellnessRes] = await Promise.all([
      realUserIds.length
        ? supabase.from("sessions").select("*").in("user_id", realUserIds).eq("date", date)
        : Promise.resolve({ data: [] }),
      demoAthleteIds.length
        ? supabase.from("coach_sessions").select("*").eq("coach_id", userId).in("athlete_id", demoAthleteIds).eq("date", date)
        : Promise.resolve({ data: [] }),
      fetch(`/api/coach/wellness?date=${date}`).then(r => r.json()).catch(() => ({ wellness: [] })),
    ]);

    const unified: CoachViewSession[] = [
      ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
      ...(demoRes.data || []).map(s => demoToView(s as CoachSession)),
    ];
    setSessions(unified);

    const wellnessByUser = new Map<string, { score: number; behaviors: string[] }>();
    (wellnessRes.wellness || []).forEach((w: { user_id: string; score: number | null; behaviors: string[] | null }) => {
      wellnessByUser.set(w.user_id, { score: w.score ?? 70, behaviors: w.behaviors ?? [] });
    });
    setAthletes(prev => prev.map(a => {
      if (!a.user_id) return a; // démo : pas de notion de jour, wellnessFilledToday déjà true
      const w = wellnessByUser.get(a.user_id);
      return w
        ? { ...a, wellness_score: w.score, behaviors: w.behaviors, wellnessFilledToday: true }
        : { ...a, wellnessFilledToday: false };
    }));
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

  const priority = athletes.filter(a => {
    const hasSessions = sessions.some(s => s.athlete_id === a.id);
    return hasSessions && attention(a, maxDiffToday(a.id, sessions), trends[a.id]);
  });
  const stable = athletes.filter(a => {
    const hasSessions = sessions.some(s => s.athlete_id === a.id);
    return !hasSessions || !attention(a, maxDiffToday(a.id, sessions), trends[a.id]);
  });
  const sortedPriority = [...priority].sort((a, b) =>
    riskScore(b, maxDiffToday(b.id, sessions), trends[b.id]) - riskScore(a, maxDiffToday(a.id, sessions), trends[a.id])
  );

  const filledAthletes = athletes.filter(a => a.wellnessFilledToday !== false);
  const avgWellness = filledAthletes.length
    ? Math.round(filledAthletes.reduce((s, a) => s + a.wellness_score, 0) / filledAthletes.length)
    : 0;
  const sessionsWithDiff = sessions.filter(s => s.target_difficulty != null);
  const avgDifficulty = sessionsWithDiff.length
    ? Math.round(sessionsWithDiff.reduce((acc, s) => acc + (s.target_difficulty ?? 0), 0) / sessionsWithDiff.length * 10) / 10
    : null;

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
          <div data-tour="activation-banner" style={{ background: "#fff", borderRadius: 24, padding: "18px 18px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.08)", border: "1px solid rgba(212,64,0,.14)", marginBottom: 14 }}>
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

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: isMd ? 17 : 15, fontWeight: 600 }}>
            {greeting()} {coachName ?? ""} 👋
          </div>
        </div>

        {athletes.length > 0 && (() => {
          const decisionCount = sortedPriority.filter(a => !reviewedIds.has(a.id)).length;
          const advice = getCoachAdvice(athletes, sessions, avgWellness, avgDifficulty);
          const label: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.38)", marginTop: 5 };
          const divider = <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,.10)", margin: "0 4px" }} />;
          return (
            <div style={{ margin: "12px 0", background: "linear-gradient(145deg,#1a1a1a,#282828)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: "14px 10px", boxShadow: "0 12px 34px rgba(0,0,0,.28)" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: 34, fontWeight: 1000, color: decisionCount > 0 ? "#f04a08" : "#2f9e44", letterSpacing: "-0.05em", lineHeight: 1 }}>{decisionCount}</div>
                  <div style={label}>Décisions restantes</div>
                </div>
                {divider}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {typeof avgWellness === "number" && avgWellness > 0
                    ? <WellnessRing score={avgWellness} size={52} />
                    : <div style={{ fontSize: 34, fontWeight: 1000, color: "rgba(255,255,255,.3)", letterSpacing: "-0.05em", lineHeight: 1 }}>—</div>
                  }
                  <div style={label}>Wellness équipe</div>
                </div>
                {divider}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {avgDifficulty !== null ? (
                    <>
                      <div style={{ fontSize: 30, fontWeight: 1000, letterSpacing: "-0.05em", lineHeight: 1, color: avgDifficulty >= 8 ? "#d44000" : avgDifficulty >= 5 ? "#f28a00" : "#2f9e44", marginBottom: 5 }}>
                        {avgDifficulty}
                      </div>
                      <div style={{ width: "70%" }}>
                        <DiffGauge value={avgDifficulty} height={5} />
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 30, fontWeight: 1000, color: "rgba(255,255,255,.3)", letterSpacing: "-0.05em", lineHeight: 1 }}>—</div>
                  )}
                  <div style={label}>RPE prévu</div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,.10)", marginTop: 14, paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                  ✦ Lecture d&apos;équipe
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,.88)" }}>
                  {advice}
                </div>
                {decisionCount > 0 && (() => {
                  const first = sortedPriority.find(a => !reviewedIds.has(a.id));
                  return first ? (
                    <button
                      data-tour="decider-btn"
                      onClick={() => requireSubscription(() => handleDecide(first))}
                      style={{ marginTop: 12, width: "100%", height: 44, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 20px rgba(212,64,0,.35)", letterSpacing: "-0.01em" }}
                    >
                      Traiter les décisions ({decisionCount}) →<span className="tour-lock">🔒</span>
                    </button>
                  ) : null;
                })()}
              </div>
            </div>
          );
        })()}

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
                    trend={trends[a.id]}
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
                    trend={trends[a.id]}
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

        <div data-tour="invite-section" style={{ marginTop: 16 }}>
          <button
            data-tour="invite-btn"
            onClick={() => requireSubscription(() => setShowInviteModal(true))}
            style={{ width: "100%", height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
          >
            + Inviter des sportifs<span className="tour-lock">🔒</span>
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
            wellness: reviewAthlete.wellnessFilledToday === false ? null : reviewAthlete.wellness_score,
            maxDiff: maxDiffToday(reviewAthlete.id, sessions),
            queueCurrent: reviewedPriorityCount,
            queueTotal: sortedPriority.length,
            trend: trends[reviewAthlete.id],
          }}
          onSave={handleSaveReview}
          onClose={handleCloseReview}
        />
      )}

      {showReviewComplete && (
        <ReviewCompleteModal onClose={() => setShowReviewComplete(false)} />
      )}

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onLinked={() => router.refresh()}
          inviteCode={inviteCode}
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
