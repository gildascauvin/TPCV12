"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteModal from "@/components/coach/InviteModal";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import SparkLineClient, { FORM_ZONES, formToChartPosition } from "@/components/conseils/SparkLineClient";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import { usePaywall } from "@/hooks/usePaywall";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { CoachAthlete, SubscriptionStatus } from "@/types";
import { sigDimInfo, trendDimInfo, chargeCrossInsight, recoveryCrossInsight, METRIC_DEFINITIONS, type AthleteSignature } from "@/lib/fatigueSignature";
import { fitnessFatigueTrend, type TrendCode } from "@/lib/trainingLoad";
import { wellnessColor } from "@/lib/wellness";
import type { AthleteTrendInsight } from "@/lib/athletesData";

// Reste en Status (rouge/orange/vert) — colore le libellé d'état "Disponible"/"Stable"/"À
// surveiller" (statusLabel), pas un ring : job Status légitime (texte+couleur = état, pas
// magnitude). AthleteRing plus bas utilise wellnessColor (Sequential bleu) pour le ring lui-même.
function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }
const TREND_WATCH: ReadonlySet<TrendCode> = new Set<TrendCode>(["accumulation", "fatigue_persistante"]);
function statusLabel(s: number, trend?: TrendCode | null) {
  if (trend && TREND_WATCH.has(trend)) return "À surveiller";
  return s >= 75 ? "Disponible" : s >= 60 ? "Stable" : "À surveiller";
}

// Mêmes charts que /conseils (ZoneSparkline + SparkLineClient) — un seul point de vérité, plus de
// mini-graphe bricolé séparément ici. Nichés dans une carte sombre (même traitement que
// "Ta signature de fatigue" sur /conseils et CoachCard) car ces 2 composants sont conçus pour un
// fond sombre (labels blancs semi-transparents) — la carte sportif elle-même reste blanche.
function AthleteSignatureBlock({ signature, athleteId }: { signature: AthleteSignature; athleteId: string }) {
  if (signature.kind === "manual") {
    return (
      <div style={{ paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(0,0,0,.08)", color: "#8a8f94", fontSize: 13, fontStyle: "italic" }}>
        Forme non renseignée — pas de signature de fatigue ni de récupération à afficher.
      </div>
    );
  }
  if (signature.kind === "no_data") {
    return (
      <div style={{ paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(0,0,0,.08)", color: "#8a8f94", fontSize: 13 }}>
        🕳️ Pas de wellness renseigné ces 28 derniers jours — pas de signature de fatigue à afficher.
      </div>
    );
  }

  const { isLg } = useBreakpoint();
  const { series, sig } = signature;
  // Charge et Récupération sur la même fenêtre (7 derniers jours glissants)
  const last7 = series.slice(-7);
  const zoneAcwr = last7.map(p => p.acwr);
  const zoneLoads = last7.map(p => p.load);
  const zoneDates = last7.map(p => p.date);
  const zoneMonotony = last7.map(p => p.monotony);
  const zoneStrain = last7.map(p => p.strain);

  const todayAcwr = series[series.length - 1]?.acwr ?? null;
  const loadInfo = todayAcwr !== null
    ? sigDimInfo("load", todayAcwr, "coach")
    : { label: "HISTORIQUE INSUFFISANT", color: "#8a8f94", text: "Pas assez d'historique pour l'ACWR." };
  const monotonyInfo = sig.monotony !== null
    ? sigDimInfo("monotony", sig.monotony, "coach")
    : { label: "PAS ASSEZ D'HISTORIQUE", color: "#8a8f94", text: "" };
  const strainInfo = sig.strain !== null ? sigDimInfo("strain", sig.strain, "coach") : null;
  const recoveryInfo = sigDimInfo("recovery", sig.recovery, "coach");
  const todayForm = series[series.length - 1]?.form ?? null;
  const formInfo = todayForm !== null ? sigDimInfo("form", todayForm, "coach") : null;
  const ffTrend = fitnessFatigueTrend(series);
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, "coach") : null;
  const fatigueTrendInfo = ffTrend.fatigue !== null ? trendDimInfo("fatigue", ffTrend.fatigue, "coach") : null;
  const chargeInsight = chargeCrossInsight(loadInfo, monotonyInfo, strainInfo ?? { label: "", color: "#8a8f94", text: "" }, "coach");
  const recoveryInsight = recoveryCrossInsight(recoveryInfo, todayForm, "coach");

  return (
    <div style={{
      marginTop: 14,
      background: "linear-gradient(145deg,#1a1a1a,#282828)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 20, padding: 16, color: "#fff",
      display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 20,
    }}>
      {/* Charge — titre + badges sur la même ligne, insight dessous, chart ensuite */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.65)" }}>⚡ Charge</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <ZoneBadge label={loadInfo.label} color={loadInfo.color} definition={METRIC_DEFINITIONS.acwr} size="sm" />
            <ZoneBadge label={monotonyInfo.label} color={monotonyInfo.color} definition={METRIC_DEFINITIONS.monotony} size="sm" />
            {strainInfo && <ZoneBadge label={strainInfo.label} color={strainInfo.color} definition={METRIC_DEFINITIONS.strain} size="sm" />}
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4 }}>{chargeInsight}</div>
        <ZoneSparkline points={zoneAcwr} dates={zoneDates} loads={zoneLoads} monotony={zoneMonotony} strain={zoneStrain} />
      </div>

      {/* Récupération + Form — titre + badges sur la même ligne, insight dessous, chart ensuite */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.65)" }}>🌿 Récupération</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <ZoneBadge label={recoveryInfo.label} color={recoveryInfo.color} definition={METRIC_DEFINITIONS.recovery} size="sm" />
            {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={METRIC_DEFINITIONS.form} size="sm" />}
            {fitnessTrendInfo && <ZoneBadge label={fitnessTrendInfo.label} color={fitnessTrendInfo.color} definition={METRIC_DEFINITIONS.fitness} size="sm" />}
            {fatigueTrendInfo && <ZoneBadge label={fatigueTrendInfo.label} color={fatigueTrendInfo.color} definition={METRIC_DEFINITIONS.fatigue} size="sm" />}
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4 }}>{recoveryInsight}</div>
        <SparkLineClient
          points={last7.map(p => p.recovery)} dates={zoneDates} color={recoveryInfo.color}
          maxVal={100} height={168} animDelay={0}
          metricType="recovery" uid={`athlete-recovery-${athleteId}`} chartType="line" sequentialFill
          points2={last7.map(p => p.form !== null ? formToChartPosition(p.form) : null)}
          points2Raw={last7.map(p => p.form)} zones2={FORM_ZONES}
        />
      </div>
    </div>
  );
}

function AthleteRing({ score }: { score: number }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={wellnessColor(score)} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color: wellnessColor(score) }}>{score}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  initialAthletes: CoachAthlete[];
  initialDate: string;
  initialSignatures: Record<string, AthleteSignature>;
  initialTrends: Record<string, TrendCode | null>;
  initialTrendInsights: Record<string, AthleteTrendInsight>;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
}

export default function AthletesClient({ userId, initialAthletes, initialDate, initialSignatures, initialTrends, initialTrendInsights, subscriptionStatus, inviteCode }: Props) {
  const router = useRouter();
  const [athletes, setAthletes] = useState(initialAthletes);
  const [showInvite, setShowInvite] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [signatures, setSignatures] = useState(initialSignatures);
  const [trends, setTrends] = useState(initialTrends);
  const [trendInsights, setTrendInsights] = useState(initialTrendInsights);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss } = usePaywall(subscriptionStatus);

  function toggleExpanded(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    const res = await fetch(`/api/coach/athletes?date=${date}`);
    if (res.ok) {
      const { signatures: s, trends: t, trendInsights: ti } = await res.json();
      setSignatures(s);
      setTrends(t);
      setTrendInsights(ti);
    }
  }

  async function handleDelete(athlete: CoachAthlete) {
    const label = athlete.user_id ? "Retirer ce sportif de ton espace ?" : "Supprimer ce sportif ?";
    if (!confirm(label)) return;
    setDeleting(athlete.id);
    await fetch("/api/athlete/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachAthleteId: athlete.id }),
    });
    setAthletes(prev => prev.filter(a => a.id !== athlete.id));
    setDeleting(null);
  }

  return (
    <>
      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} />

      <div className="page-shell">

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Coach</div>
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>Mes sportifs</div>
            <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
              {athletes.length} sportif{athletes.length !== 1 ? "s" : ""} suivi{athletes.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            data-tour="invite-btn"
            onClick={() => requireSubscription(() => setShowInvite(true))}
            style={{ height: 40, paddingLeft: 18, paddingRight: 18, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", flexShrink: 0, marginTop: 4 }}
          >
            + Inviter<span className="tour-lock">🔒</span>
          </button>
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#171b1f", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Invite un sportif pour commencer à suivre son wellness et ses séances.
            </div>
            <button
              data-tour="invite-btn"
              onClick={() => requireSubscription(() => setShowInvite(true))}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Inviter un sportif →<span className="tour-lock">🔒</span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {athletes.map(a => {
              const isPending = !a.user_id && !!a.invite_email;
              return (
              <div key={a.id} style={{
                background: a.user_id ? "#fff" : isPending ? "rgba(255,245,230,.85)" : "rgba(255,255,255,.72)",
                border: a.user_id ? "1px solid rgba(47,158,68,.20)" : isPending ? "1px solid rgba(242,138,0,.25)" : "1px solid rgba(34,54,38,.12)",
                borderRadius: 26, padding: 18,
                boxShadow: a.user_id ? "0 8px 24px rgba(47,158,68,.07)" : "0 12px 32px rgba(32,59,43,.08)",
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                  <AthleteRing score={a.wellness_score} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{a.name}</div>
                      {a.user_id && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(47,158,68,.12)", color: "#2f9e44", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>RÉEL</div>
                      )}
                      {isPending && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(242,138,0,.12)", color: "#f28a00", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>EN ATTENTE</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>
                      {isPending
                        ? <span style={{ color: "#f28a00" }}>{a.invite_email}</span>
                        : <>{a.sport}{a.sport ? " · " : ""}<span style={{ color: scoreColor(a.wellness_score), fontWeight: 700 }}>{statusLabel(a.wellness_score, trends[a.id])}</span></>
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      data-tour="voir-planning-btn"
                      onClick={() => router.push(`/coach/planning?athlete=${a.id}`)}
                      style={{ height: 34, paddingLeft: 13, paddingRight: 13, borderRadius: 10, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)", whiteSpace: "nowrap" }}
                    >
                      Voir planning<span className="tour-lock">🔒</span>
                    </button>
                    <button
                      data-tour="supprimer-btn"
                      onClick={() => handleDelete(a)}
                      style={{ height: 34, paddingLeft: 12, paddingRight: 12, borderRadius: 10, background: "#fff8f8", border: "1px solid rgba(200,30,30,.20)", color: "#c81e1e", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: deleting === a.id ? 0.5 : 1, whiteSpace: "nowrap" }}
                    >
                      {a.user_id ? "Retirer" : isPending ? "Annuler" : "Supprimer"}<span className="tour-lock">🔒</span>
                    </button>
                  </div>
                </div>

                {!isPending && (() => {
                  const insight = trendInsights[a.id];
                  const isExpanded = expandedIds.has(a.id);
                  return (
                    <>
                      {insight && (
                        <div style={{ marginTop: 4, padding: "9px 13px", borderRadius: 12, background: "rgba(0,0,0,.035)", fontSize: 12.5, color: "#3a3f43", lineHeight: 1.45 }}>
                          {insight.emoji} <span style={{ textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#d44000", fontWeight: 800 }}>{insight.action} — </span>{insight.text}
                        </div>
                      )}
                      <button
                        onClick={() => toggleExpanded(a.id)}
                        style={{ marginTop: 10, background: "none", border: "none", padding: 0, color: "#d44000", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
                      >
                        {isExpanded ? "Masquer le détail ▴" : "Voir charge & récupération ▾"}
                      </button>
                      {isExpanded && (
                        <AthleteSignatureBlock signature={signatures[a.id] ?? { kind: "manual" }} athleteId={a.id} />
                      )}
                    </>
                  );
                })()}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
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
