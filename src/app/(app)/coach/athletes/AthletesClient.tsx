"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteModal from "@/components/coach/InviteModal";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import SectionTabs, { type TestsSection } from "@/components/tests/SectionTabs";
import TestsPanel from "@/components/tests/TestsPanel";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import SparkLineClient, { FORM_ZONES, formToChartPosition, WELLNESS_ZONES } from "@/components/conseils/SparkLineClient";
import { dimensionBadgesSeries, DIMENSION_ARROW, dimensionBadgeColor, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import ShareButton from "@/components/sessions/ShareButton";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { CoachAthlete, SubscriptionStatus } from "@/types";
import { sigDimInfo, trendDimInfo, chargeCrossInsight, recoveryCrossInsight, METRIC_DEFINITIONS, type AthleteSignature } from "@/lib/fatigueSignature";
import { fitnessFatigueTrend, type TrendCode } from "@/lib/trainingLoad";
import { wellnessColor } from "@/lib/wellness";
import type { AthleteTrendInsight } from "@/lib/athletesData";
import type { LastTestByAthlete } from "@/lib/testSummary";

// Reste en Status (rouge/orange/vert) — colore le badge d'état "Disponible"/"Stable"/"À
// surveiller", pas un ring : job Status légitime (texte+couleur = état, pas magnitude).
// AthleteRing plus bas utilise wellnessColor (Sequential bleu) pour le ring lui-même.
// Label ET couleur dans une seule fonction (pas 2 séparées) — bug réel trouvé par Gildas sinon :
// l'ancienne scoreColor(s) ignorait le paramètre trend, donc un score élevé (vert) avec un trend
// "accumulation"/"fatigue_persistante" affichait "À surveiller" en vert au lieu de rouge.
const TREND_WATCH: ReadonlySet<TrendCode> = new Set<TrendCode>(["accumulation", "fatigue_persistante"]);
function athleteStatus(s: number | null, trend?: TrendCode | null): { label: string; color: string } {
  if (s === null) return { label: "Non renseigné", color: "#8a8f94" };
  if (trend && TREND_WATCH.has(trend)) return { label: "À surveiller", color: "#d10000" };
  if (s >= 75) return { label: "Disponible", color: "#2f9e44" };
  if (s >= 60) return { label: "Stable", color: "#f28a00" };
  return { label: "À surveiller", color: "#d10000" };
}

/* Bug réel signalé par Gildas : la ring affichait `coach_athletes.wellness_score`, une colonne
   dénormalisée qui garde la dernière valeur jamais écrite pour ce sportif, sans lien garanti avec
   le jour affiché (même classe de bug déjà trouvée et corrigée sur /coach et /coach/planning le
   2026-07-23 — cette page-ci n'avait jamais reçu le même correctif). `signature.series` (déjà
   calculé, wellness_daily réel sur 42j) donne le vrai score du jour, ou `null` — jamais un chiffre
   périmé. Pour un sportif démo (`user_id` null), `wellness_score` reste la valeur légitime : pas de
   notion de jour pour lui. */
function todayRecovery(athlete: CoachAthlete, signature: AthleteSignature): number | null {
  if (!athlete.user_id) return athlete.wellness_score;
  if (signature.kind !== "ok") return null;
  return signature.series[signature.series.length - 1]?.recovery ?? null;
}

// Mêmes charts que /conseils (ZoneSparkline + SparkLineClient) — un seul point de vérité, plus de
// mini-graphe bricolé séparément ici. Nichés dans une carte sombre (même traitement que
// "Ta signature de fatigue" sur /conseils et CoachCard) car ces 2 composants sont conçus pour un
// fond sombre (labels blancs semi-transparents) — la carte sportif elle-même reste blanche.
function AthleteSignatureBlock({ signature, athleteId, athleteName, rangeMode, trendInsight, baselineSeries }: { signature: AthleteSignature; athleteId: string; athleteName: string; rangeMode: RangeMode; trendInsight: AthleteTrendInsight; baselineSeries?: (WellnessBaselineResult | null)[] }) {
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
        🕳️ Pas de récupération renseignée ces 28 derniers jours — pas de signature de fatigue à afficher.
      </div>
    );
  }

  const { isLg } = useBreakpoint();
  const { series, sig } = signature;
  // Charge et Récupération sur la même fenêtre — 7 derniers jours ou 4 dernières semaines (toggle
  // Sem./Mois) — `series` est 42j calculés (athletesData.ts, dont 14j de pur recul pour l'ACWR),
  // jamais un nouveau fetch. On affiche toujours au plus 28j, jamais les 42 calculés. Nom `last7`
  // conservé, plus toujours 7j.
  const last7 = rangeMode === "month" ? series.slice(-28) : series.slice(-7);
  const zoneAcwr = last7.map(p => p.acwr);
  const zoneLoads = last7.map(p => p.load);
  const zoneDates = last7.map(p => p.date);
  const zoneMonotony = last7.map(p => p.monotony);
  const zoneStrain = last7.map(p => p.strain);
  const last7Baseline = baselineSeries ? (rangeMode === "month" ? baselineSeries.slice(-28) : baselineSeries.slice(-7)) : [];
  const todayBaseline = baselineSeries?.[baselineSeries.length - 1] ?? null;
  // Badges de dimension au survol — même principe que ConseilsClient.tsx (calculés sur toute la
  // série pour garder du recul de tendance, puis découpés avec le même slicing que last7Baseline).
  const dimensionBadgesFull = baselineSeries ? dimensionBadgesSeries(baselineSeries) : [];
  const last7DimensionBadges = rangeMode === "month" ? dimensionBadgesFull.slice(-28) : dimensionBadgesFull.slice(-7);
  const todayDimensionBadges = dimensionBadgesFull[dimensionBadgesFull.length - 1];

  const todayAcwr = series[series.length - 1]?.acwr ?? null;
  const loadInfo = todayAcwr !== null
    ? sigDimInfo("load", todayAcwr, "coach")
    : { label: "HISTORIQUE INSUFFISANT", color: "#8a8f94", text: "Pas assez d'historique pour l'ACWR." };
  const monotonyInfo = sig.monotony !== null
    ? sigDimInfo("monotony", sig.monotony, "coach")
    : { label: "PAS ASSEZ D'HISTORIQUE", color: "#8a8f94", text: "" };
  const strainInfo = sig.strain !== null ? sigDimInfo("strain", sig.strain, "coach") : null;
  const recoveryInfo = sigDimInfo("recovery", sig.recovery, "coach", todayBaseline);
  const todayForm = series[series.length - 1]?.form ?? null;
  const formInfo = todayForm !== null ? sigDimInfo("form", todayForm, "coach") : null;
  const ffTrend = fitnessFatigueTrend(series);
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, "coach") : null;
  const fatigueTrendInfo = ffTrend.fatigue !== null ? trendDimInfo("fatigue", ffTrend.fatigue, "coach") : null;
  const chargeInsight = chargeCrossInsight(loadInfo, monotonyInfo, strainInfo ?? { label: "", color: "#8a8f94", text: "" }, fitnessTrendInfo, fatigueTrendInfo, "coach");
  const recoveryInsight = recoveryCrossInsight(recoveryInfo, todayForm, "coach", todayBaseline);

  return (
    <div style={{
      marginTop: 14,
      background: "linear-gradient(145deg,#1a1a1a,#282828)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 20, padding: 16, color: "#fff",
    }}>
      {trendInsight && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <ShareButton
            resourceType="signature"
            variant="dark"
            buildSnapshot={() => ({
              emoji: trendInsight.emoji, action: trendInsight.action, insight: trendInsight.text,
              chargePoints: zoneAcwr, recoveryPoints: last7.map(p => p.recovery),
              recoveryPoints2: last7.map(p => p.form !== null ? formToChartPosition(p.form) : null),
              dates: zoneDates, weekLabels: rangeMode === "month", authorName: athleteName,
            })}
            title={`Signature de fatigue — ${athleteName}`}
            text={trendInsight.text}
          />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 20 }}>
      {/* Charge — titre + badges sur la même ligne, insight dessous, chart ensuite */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.65)" }}>⚡ Charge</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <ZoneBadge label={monotonyInfo.label} color={monotonyInfo.color} definition={METRIC_DEFINITIONS.monotony} size="sm" />
            {strainInfo && <ZoneBadge label={strainInfo.label} color={strainInfo.color} definition={METRIC_DEFINITIONS.strain} size="sm" />}
            {fitnessTrendInfo && <ZoneBadge label={fitnessTrendInfo.label} color={fitnessTrendInfo.color} definition={METRIC_DEFINITIONS.fitness} size="sm" />}
            {fatigueTrendInfo && <ZoneBadge label={fatigueTrendInfo.label} color={fatigueTrendInfo.color} definition={METRIC_DEFINITIONS.fatigue} size="sm" />}
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4 }}>{chargeInsight}</div>
        <ZoneSparkline points={zoneAcwr} dates={zoneDates} loads={zoneLoads} monotony={zoneMonotony} strain={zoneStrain} weekLabels={rangeMode === "month"} />
      </div>

      {/* Récupération + Form — titre + badges sur la même ligne, insight dessous, chart ensuite */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.65)" }}>🌿 Récupération</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {todayDimensionBadges?.map(b => (
              <ZoneBadge key={b.key} label={`${b.label} ${DIMENSION_ARROW[b.arrow]}`} color={dimensionBadgeColor(b.arrow)} size="sm" />
            ))}
            {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={METRIC_DEFINITIONS.form} size="sm" />}
          </div>
        </div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4 }}>{recoveryInsight}</div>
        <SparkLineClient
          points={last7Baseline.map(b => b?.hasEnoughHistory ? b.relativeScore : null)}
          pointsRaw={last7.map(p => p.recovery)} dates={zoneDates} color={recoveryInfo.color}
          maxVal={100} height={168} animDelay={0}
          metricType="recovery" uid={`athlete-recovery-${athleteId}`} chartType="line" sequentialFill
          zones1={WELLNESS_ZONES}
          dimensionBadgesAt={last7DimensionBadges}
          points2={last7.map(p => p.form !== null ? formToChartPosition(p.form) : null)}
          points2Raw={last7.map(p => p.form)} zones2={FORM_ZONES}
          weekLabels={rangeMode === "month"}
        />
      </div>
      </div>
    </div>
  );
}

function AthleteRing({ score }: { score: number | null }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = score === null ? circ : +(circ * (1 - score / 100)).toFixed(1);
  const color = score === null ? "rgba(255,255,255,0.28)" : wellnessColor(score);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color }}>{score !== null ? score : "—"}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

/* Badge "Charge" compact pour la ligne repliée — reprend sigDimInfo("load",...) déjà calculé pour
   le chart détaillé (AthleteSignatureBlock), juste le libellé de zone ACWR du jour, pas de chiffre
   0-100 inventé (contrairement au POC dont les scores "Charge 72/91/58" sont des exemples fictifs
   sans équivalent direct dans notre modèle réel). */
function loadBadge(signature: AthleteSignature): { label: string; color: string } | null {
  if (signature.kind !== "ok") return null;
  const todayAcwr = signature.series[signature.series.length - 1]?.acwr ?? null;
  if (todayAcwr === null) return null;
  return sigDimInfo("load", todayAcwr, "coach");
}

/* Badge "Dernier test" visible même carte repliée (principe POC : scan rapide sans ouvrir la
   carte) — nom du test + tendance ↑/↓/→, couleur dérivée de "amélioration" (tient déjà compte du
   sens de l'unité côté testSummary.ts), pas du sens brut de la valeur. */
function TestBadge({ summary }: { summary: LastTestByAthlete[string] }) {
  if (!summary) return null;
  const arrow = summary.improved === true ? "↑" : summary.improved === false ? "↓" : "→";
  const color = summary.improved === true ? "#2f9e44" : summary.improved === false ? "#d10000" : "#8a8f94";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 78 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 2 }}>Dernier test</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#1f2428" }}>
        {summary.name}{" "}
        <span style={{ color, fontWeight: 800 }}>{arrow}{summary.deltaPct !== null ? ` ${summary.deltaPct > 0 ? "+" : ""}${summary.deltaPct}%` : ""}</span>
      </span>
    </div>
  );
}

/* Panneau déplié — tabs "Charge & Récupération / Tests de performance" propres à CET athlète (état
   local, se réinitialise naturellement à chaque ouverture puisque démonté à la fermeture — un seul
   panneau ouvert à la fois, voir expandedId dans AthletesClient). */
function ExpandedAthletePanel({ userId, athlete, signature, rangeMode, trendInsight, baselineSeries }: {
  userId: string; athlete: CoachAthlete; signature: AthleteSignature; rangeMode: RangeMode; trendInsight: AthleteTrendInsight; baselineSeries?: (WellnessBaselineResult | null)[];
}) {
  const [section, setSection] = useState<TestsSection>("load");
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <SectionTabs active={section} onChange={setSection} />
      {section === "tests" ? (
        <TestsPanel
          ownerId={userId} subject={{ subjectCoachAthleteId: athlete.id }} linkedUserId={athlete.user_id}
          emptyHint={`Aucun test enregistré pour ${athlete.name} — marque une ligne d'exercice comme test (menu ⋯) dans une de ses séances.`}
        />
      ) : (
        <AthleteSignatureBlock signature={signature} athleteId={athlete.id} athleteName={athlete.name} rangeMode={rangeMode} trendInsight={trendInsight} baselineSeries={baselineSeries} />
      )}
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
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) par sportif — série 42j alignée sur
     `initialSignatures[id].series`. Absent (sandbox) = repli absolu automatique. */
  initialBaselines?: Record<string, WellnessBaselineResult | null>;
  initialBaselineSeries?: Record<string, (WellnessBaselineResult | null)[]>;
  initialLastTests: LastTestByAthlete;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
  /* Sandbox uniquement (2026-08-19) — voir TodayClient.tsx pour le détail du mécanisme. */
  sandboxMode?: boolean;
}

export default function AthletesClient({ userId, initialAthletes, initialDate, initialSignatures, initialTrends, initialTrendInsights, initialBaselines = {}, initialBaselineSeries = {}, initialLastTests, subscriptionStatus, inviteCode, sandboxMode = false }: Props) {
  const router = useRouter();
  const { isMd } = useBreakpoint();
  const [athletes, setAthletes] = useState(initialAthletes);
  const [showInvite, setShowInvite] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [signatures, setSignatures] = useState(initialSignatures);
  const [trends, setTrends] = useState(initialTrends);
  const [trendInsights, setTrendInsights] = useState(initialTrendInsights);
  const [baselineSeriesByAthlete, setBaselineSeriesByAthlete] = useState(initialBaselineSeries);
  const [lastTests] = useState(initialLastTests);
  // Une seule carte ouverte à la fois (évite le chaos — principe repris d'un POC UX fourni par
  // Gildas) : remplace l'ancien Set multi-expand. Les tabs Charge/Tests vivent maintenant PAR carte
  // (ExpandedAthletePanel, état local) — plus de mode de page unique à gérer ici.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const realPaywall = usePaywall(subscriptionStatus);
  const sandboxPaywall = useSandboxGate("coach");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  function toggleExpanded(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    if (sandboxMode) return;
    const res = await fetch(`/api/coach/athletes?date=${date}`);
    if (res.ok) {
      const { signatures: s, trends: t, trendInsights: ti, baselineSeries: bs } = await res.json();
      setSignatures(s);
      setTrends(t);
      setTrendInsights(ti);
      setBaselineSeriesByAthlete(bs ?? {});
    }
  }

  async function handleDelete(athlete: CoachAthlete) {
    await requireSubscription(async () => {
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
    });
  }

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          message="Mode démo · le suivi de tes sportifs n'est pas encore sauvegardé."
          onAction={() => setPaywallStep("priming")}
          roleToggle={sandboxMode ? { role: "coach", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}
      <CalendarHeader
        selectedDate={selectedDate} onDateChange={handleDateChange}
        extraControls={<RangeToggle mode={rangeMode} onChange={setRangeMode} />}
        profileHref={sandboxMode ? "/sandbox/coach/profil" : "/profil"}
      />

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
            onClick={() => setShowInvite(true)}
            style={{ height: 40, paddingLeft: 18, paddingRight: 18, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", flexShrink: 0, marginTop: 4 }}
          >
            + Inviter
          </button>
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#171b1f", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Invite un sportif pour commencer à suivre sa récupération et ses séances.
            </div>
            <button
              data-tour="invite-btn"
              onClick={() => setShowInvite(true)}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Inviter un sportif →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {athletes.map(a => {
              const isPending = !a.user_id && !!a.invite_email;
              const recovery = todayRecovery(a, signatures[a.id] ?? { kind: "manual" });
              return (
              <div key={a.id} style={{
                background: a.user_id ? "#fff" : isPending ? "rgba(255,245,230,.85)" : "rgba(255,255,255,.72)",
                border: a.user_id ? "1px solid rgba(47,158,68,.20)" : isPending ? "1px solid rgba(242,138,0,.25)" : "1px solid rgba(34,54,38,.12)",
                borderRadius: 26, padding: 18,
                boxShadow: a.user_id ? "0 8px 24px rgba(47,158,68,.07)" : "0 12px 32px rgba(32,59,43,.08)",
              }}>
                <div
                  onClick={isPending ? undefined : () => toggleExpanded(a.id)}
                  style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap", cursor: isPending ? "default" : "pointer" }}
                >
                  <AthleteRing score={recovery} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isPending ? (
                        <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{a.name}</div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(sandboxMode ? "/sandbox/coach/planning" : `/coach/planning?athlete=${a.id}`); }}
                          style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(31,36,40,.18)", textUnderlineOffset: 3 }}
                        >
                          {a.name}<span className="tour-lock">🔒</span>
                        </button>
                      )}
                      {a.user_id && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(47,158,68,.12)", color: "#2f9e44", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>RÉEL</div>
                      )}
                      {isPending && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(242,138,0,.12)", color: "#f28a00", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>EN ATTENTE</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>
                      {isPending ? <span style={{ color: "#f28a00" }}>{a.invite_email}</span> : a.sport}
                    </div>
                  </div>
                  {isMd && !isPending && (() => {
                    const badge = loadBadge(signatures[a.id] ?? { kind: "manual" });
                    const test = lastTests[a.id];
                    const status = athleteStatus(recovery, trends[a.id]);
                    return (
                      <div style={{ display: "flex", gap: 40, flexShrink: 0 }}>
                        {badge && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 2 }}>Charge</span>
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 2 }}>Récupération</span>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: status.color, whiteSpace: "nowrap" }}>{status.label}</span>
                        </div>
                        <TestBadge summary={test} />
                      </div>
                    );
                  })()}
                  {!isPending && (
                    <span style={{ color: "#8a8f94", fontSize: 13, flexShrink: 0, transform: expandedId === a.id ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                  )}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpenId(prev => (prev === a.id ? null : a.id)); }}
                      aria-label="Options"
                      style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(0,0,0,.08)", background: "#fff", cursor: "pointer", fontSize: 18, fontWeight: 900, color: "#8a8f94", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      ⋯
                    </button>
                    {menuOpenId === a.id && (
                      <>
                        <div onClick={e => { e.stopPropagation(); setMenuOpenId(null); }} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 40, right: 0, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 12, boxShadow: "0 10px 28px rgba(0,0,0,.16)", zIndex: 20, minWidth: 150, overflow: "hidden" }}>
                          <button
                            data-tour="supprimer-btn"
                            onClick={() => { setMenuOpenId(null); handleDelete(a); }}
                            disabled={deleting === a.id}
                            style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#c81e1e", opacity: deleting === a.id ? 0.5 : 1 }}
                          >
                            {a.user_id ? "Retirer" : isPending ? "Annuler" : "Supprimer"}<span className="tour-lock">🔒</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!isPending && (() => {
                  const insight = trendInsights[a.id];
                  const isExpanded = expandedId === a.id;
                  return (
                    <>
                      {insight && (
                        <div style={{ marginTop: 4, padding: "9px 13px", borderRadius: 12, background: "rgba(0,0,0,.035)", fontSize: 12.5, color: "#3a3f43", lineHeight: 1.45 }}>
                          {insight.emoji} <span style={{ textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#d44000", fontWeight: 800 }}>{insight.action} — </span>{insight.text}
                        </div>
                      )}
                      {isExpanded && (
                        <ExpandedAthletePanel
                          userId={userId} athlete={a} signature={signatures[a.id] ?? { kind: "manual" }}
                          rangeMode={rangeMode} trendInsight={insight} baselineSeries={baselineSeriesByAthlete[a.id]}
                        />
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
          sandboxMode={sandboxMode}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="coach" page="athletes" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
        ) : (
          <PrimingJourneyModal mode="coach" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
            onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
        )
      )}
      {!sandboxMode && paywallStep === "paywall" && (
        <PaywallModal mode="coach" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
