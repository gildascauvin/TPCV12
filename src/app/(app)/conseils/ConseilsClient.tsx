"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import SparkLineClient, { FORM_ZONES, formToChartPosition } from "@/components/conseils/SparkLineClient";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import ShareButton from "@/components/sessions/ShareButton";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import { usePaywall } from "@/hooks/usePaywall";
import { BEHAVIOR_META } from "@/lib/behaviors";
import type { ConseilsData, BehaviorCorrelation } from "@/lib/conseilsData";
import { METRIC_DEFINITIONS } from "@/lib/fatigueSignature";
import type { SubscriptionStatus } from "@/types";

function BehaviorImpactCard({ correlations, filledDays }: { correlations: BehaviorCorrelation[]; filledDays: number }) {
  const MIN_DAYS = 10;

  if (filledDays < MIN_DAYS || correlations.length === 0) {
    const remaining = Math.max(0, MIN_DAYS - filledDays);
    return (
      <div data-tour="conseils-chart" style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 28, padding: 22, marginBottom: 14, color: "#fff", position: "relative" as const, overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>Impact comportements</div>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", marginBottom: 8 }}>Données en cours de collecte</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.60)", lineHeight: 1.5, marginBottom: 18 }}>
            {remaining > 0
              ? `Renseigne ta récupération ${remaining} jour${remaining > 1 ? "s" : ""} de plus pour voir l'impact réel de tes comportements.`
              : "Continue à renseigner ta récupération — les corrélations apparaîtront bientôt."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {["🧘 Stretching", "🧊 Douche froide", "📖 Lecture", "💧 Hydratation", "🍷 Alcool", "📱 Écran tard"].map(b => (
              <div key={b} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: "5px 11px", fontSize: 13, color: "rgba(255,255,255,.50)" }}>{b}</div>
            ))}
          </div>
          <div style={{ marginTop: 14, height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(filledDays / MIN_DAYS * 100, 100)}%`, background: "#d44000", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 6 }}>{filledDays}/{MIN_DAYS} jours collectés</div>
        </div>
      </div>
    );
  }

  const maxAbs = Math.max(...correlations.map(c => Math.abs(c.impact)), 3);
  const bestHelper  = correlations.find(c => c.impact > 0.5);
  const worstHurt   = [...correlations].reverse().find(c => c.impact < -0.5);

  return (
    <div data-tour="conseils-chart" style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 28, padding: 22, marginBottom: 14, color: "#fff", position: "relative" as const, overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em" }}>Ce qui t'aide ou te pénalise</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.50)", marginTop: 3 }}>Effet des comportements de la veille sur ta récupération</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>

        {/* En-têtes colonnes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 52px", gap: 8, alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.35)" }}>Comportement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2px 1fr", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#d10000", textAlign: "right" as const }}>Pénalise</div>
            <div />
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#2f9e44" }}>Aide</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.35)", textAlign: "right" as const }}>Impact</div>
        </div>

        {/* Lignes */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
          {correlations.map(c => {
            const pct = Math.min(Math.abs(c.impact) / maxAbs * 100, 100);
            const isPositive = c.impact > 0;
            const isNeutral  = Math.abs(c.impact) < 0.3;
            const barColor   = isPositive ? "#2f9e44" : "#d10000";
            const impactStr  = isNeutral ? "0" : `${c.impact > 0 ? "+" : ""}${c.impact.toFixed(1)}`;
            const textColor  = isNeutral ? "rgba(255,255,255,.35)" : barColor;
            return (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "1fr 120px 52px", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{c.emoji}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "rgba(255,255,255,.85)" }}>{c.label}</span>
                </div>
                <div style={{ position: "relative" as const, height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3 }}>
                  <div style={{ position: "absolute" as const, left: "50%", top: -3, width: 1, height: 12, background: "rgba(255,255,255,.20)", transform: "translateX(-50%)" }} />
                  {!isNeutral && (
                    <div style={{ position: "absolute" as const, top: 0, height: "100%", borderRadius: 3, background: barColor, width: `${pct / 2}%`, ...(isPositive ? { left: "50%" } : { right: "50%" }) }} />
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: textColor, textAlign: "right" as const, letterSpacing: "-0.02em" }}>{impactStr} pts</div>
              </div>
            );
          })}
        </div>

        {/* Conseil personnalisé */}
        {(bestHelper || worstHurt) && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {bestHelper && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 900, color: "#2f9e44" }}>✓ Continue : </span>
                <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span>
                {" "}améliore ta récupération de{" "}
                <span style={{ fontWeight: 900, color: "#2f9e44" }}>+{bestHelper.impact.toFixed(1)} pts</span> en moyenne.
              </div>
            )}
            {worstHurt && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 900, color: "#d10000" }}>✗ Évite : </span>
                <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span>
                {" "}pénalise ta récupération de{" "}
                <span style={{ fontWeight: 900, color: "#d10000" }}>{worstHurt.impact.toFixed(1)} pts</span> en moyenne.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.28)", lineHeight: 1.5 }}>Basé sur tes {filledDays} derniers jours · veille → jour même</div>
      </div>
    </div>
  );
}

export default function ConseilsClient({ initialData, subscriptionStatus, hasActiveCoach }: { initialData: ConseilsData; subscriptionStatus: SubscriptionStatus; hasActiveCoach: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, handleDismiss, isActive } = usePaywall(subscriptionStatus, hasActiveCoach);

  async function handleDateChange(date: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/conseils?date=${date}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const {
    sig, timeSeries, loadInfo, monotonyInfo, strainInfo, recoveryInfo, formInfo, fitnessTrendInfo, fatigueTrendInfo, chargeInsight, recoveryInsight,
    recoveryAlert, done7Count, avgRpe, freqTarget, sessionStatus,
    loadTrend, trendText, trendEmoji, trendAction, loadAdviceShort, correlations, filledDays,
    recentBehaviors, allRecentBehaviorKeys,
  } = data;

  const dotMap: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
  const wellnessMap: Record<string, number | null> = {};
  for (const p of timeSeries) {
    wellnessMap[p.date] = p.recovery;
    if (p.load > 600) dotMap[p.date] = "done-high";
    else if (p.load > 300) dotMap[p.date] = "done-med";
    else if (p.load > 0) dotMap[p.date] = "done-light";
  }

  // Charge et Récupération sur la même fenêtre — 7 derniers jours ou 4 dernières semaines (toggle
  // Sem./Mois) — dérivées côté client de `timeSeries` (42j calculés côté serveur, dont 14j de pur
  // recul pour l'ACWR — voir conseilsData.ts), jamais un nouveau fetch. On affiche toujours au plus
  // 28j (jamais les 42 calculés), sinon les 14j de recul apparaîtraient dans le chart lui-même.
  // last7Series (nom conservé) = la fenêtre courante, pas toujours 7j.
  const last7Series = rangeMode === "month" ? timeSeries.slice(-28) : timeSeries.slice(-7);
  const zoneAcwr = last7Series.map(p => p.acwr);
  const zoneLoads = last7Series.map(p => p.load);
  const zoneDates = last7Series.map(p => p.date);
  const zoneMonotony = last7Series.map(p => p.monotony);
  const zoneStrain = last7Series.map(p => p.strain);

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          message="Mode démo · débloque le suivi complet de ta récupération."
          onAction={() => setPaywallStep("priming")}
        />
      )}
      <CalendarHeader
        selectedDate={data.referenceDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={wellnessMap}
        extraControls={<RangeToggle mode={rangeMode} onChange={setRangeMode} />}
      />

      <div className="page-shell" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>

        {/* Signature de fatigue + Entraînement */}
        <div data-tour="fatigue-signature" style={{
          background: "linear-gradient(135deg,#161616,#333 64%,#111)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 28, padding: 22, marginBottom: 14,
          color: "#fff", boxShadow: "0 28px 72px rgba(0,0,0,.20)",
          position: "relative" as const, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: -80, bottom: -90, width: 240, height: 210, background: "rgba(212,64,0,.18)", borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none" }} />

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 6, position: "relative" as const, zIndex: 2 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.045em" }}>Ta signature de fatigue</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginTop: 4 }}>
                Charge et Récupération sur les 7 derniers jours
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ background: sig.signals ? "#d44000" : "rgba(255,255,255,.10)", color: "#fff", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 1000, whiteSpace: "nowrap" as const }}>
                {sig.signals ? `${sig.signals} séances` : "À construire"}
              </div>
              {sig.signals !== 0 && trendText && (
                <ShareButton
                  resourceType="signature"
                  variant="dark"
                  buildSnapshot={() => ({
                    emoji: trendEmoji, action: trendAction, insight: trendText,
                    chargePoints: zoneAcwr, recoveryPoints: last7Series.map(p => p.recovery),
                    recoveryPoints2: last7Series.map(p => p.form !== null ? formToChartPosition(p.form) : null),
                    dates: zoneDates, weekLabels: rangeMode === "month",
                  })}
                  title="Ma signature de fatigue"
                  text={trendText}
                />
              )}
            </div>
          </div>

          {sig.signals === 0 ? (
            <div style={{ position: "relative" as const, zIndex: 2, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: "16px 18px", marginTop: 14, fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>
              Termine des séances avec RPE + durée pour construire ta signature de fatigue.
            </div>
          ) : (
            <div style={{ position: "relative" as const, zIndex: 2 }}>
              {/* Insight croisé charge/récupération/RPE — l'insight le plus actionnable, en tête */}
              {trendText && (
                <div style={{ marginTop: 14, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "13px 15px", fontSize: 14, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>
                  {trendEmoji} {trendAction && <span style={{ textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55" }}>{trendAction} — </span>}{trendText}
                </div>
              )}

              {/* Alerte récup */}
              {recoveryAlert && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(242,138,0,.12)", border: "1px solid rgba(242,138,0,.35)", borderRadius: 14, padding: "10px 14px", marginTop: 14, marginBottom: 16 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                  <div style={{ fontSize: 14, color: "#f28a00", lineHeight: 1.45, fontWeight: 600 }}>
                    Séance planifiée demain — ta récupération est fragile. Considère de réduire l'intensité.
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column" as const, gap: 20, marginTop: 18 }}>

                {/* Charge — titre + badges sur la même ligne, insight croisé dessous, chart ensuite */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.70)" }}>
                      ⚡ Charge
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                      <ZoneBadge label={monotonyInfo.label} color={monotonyInfo.color} definition={METRIC_DEFINITIONS.monotony} />
                      {strainInfo && <ZoneBadge label={strainInfo.label} color={strainInfo.color} definition={METRIC_DEFINITIONS.strain} />}
                      {fitnessTrendInfo && <ZoneBadge label={fitnessTrendInfo.label} color={fitnessTrendInfo.color} definition={METRIC_DEFINITIONS.fitness} />}
                      {fatigueTrendInfo && <ZoneBadge label={fatigueTrendInfo.label} color={fatigueTrendInfo.color} definition={METRIC_DEFINITIONS.fatigue} />}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                    {chargeInsight}
                  </div>
                  <ZoneSparkline points={zoneAcwr} dates={zoneDates} loads={zoneLoads} monotony={zoneMonotony} strain={zoneStrain} weekLabels={rangeMode === "month"} />
                </div>

                {/* Récupération + Form (Fitness − Fatigue, readiness du jour) */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.70)" }}>
                      🌿 Récupération
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                      <ZoneBadge label={recoveryInfo.label} color={recoveryInfo.color} definition={METRIC_DEFINITIONS.recovery} />
                      {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={METRIC_DEFINITIONS.form} />}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                    {recoveryInsight}
                  </div>
                  <div style={{ borderRadius: 10, overflow: "visible", marginBottom: 6 }}>
                    <SparkLineClient
                      points={last7Series.map(p => p.recovery)} dates={zoneDates} color={recoveryInfo.color}
                      maxVal={100} height={168} animDelay={300}
                      metricType="recovery" uid="recovery" chartType="line" sequentialFill
                      points2={last7Series.map(p => p.form !== null ? formToChartPosition(p.form) : null)}
                      points2Raw={last7Series.map(p => p.form)} zones2={FORM_ZONES}
                      weekLabels={rangeMode === "month"}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontStyle: "italic" as const, textAlign: "right" as const }}>Dégradé bleu = récupération (clair = en forme) · Pointillé coloré = Forme</div>
                </div>
              </div>

              {/* Séparateur + bloc "Cette semaine" */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,.10)", marginTop: 20, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.38)", marginBottom: 12 }}>
                  7 derniers jours
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 38, fontWeight: 1000, letterSpacing: "-0.055em", lineHeight: 1, color: sessionStatus.color }}>
                      {done7Count}
                    </span>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,.45)" }}>
                      / {freqTarget} séances
                    </span>
                    {avgRpe !== null && (
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,.38)" }}>
                        · RPE moy. {avgRpe}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: sessionStatus.color, background: `${sessionStatus.color}22`, border: `1px solid ${sessionStatus.color}44`, borderRadius: 999, padding: "4px 10px", letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
                      {sessionStatus.label}
                    </div>
                    {loadTrend !== null && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: Math.abs(loadTrend) < 15 ? "rgba(255,255,255,.38)" : loadTrend > 0 ? "#f28a00" : "#2f9e44", whiteSpace: "nowrap" as const }}>
                        {Math.abs(loadTrend) < 15 ? "→ Stable" : loadTrend > 0 ? `↑ +${loadTrend}%` : `↓ ${loadTrend}%`} vs 7j préc.
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.62)", lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 800, color: "#d44000" }}>→</span> {loadAdviceShort}
                </div>
                {sig.acwr.hasEnoughHistory && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,.35)" }}>
                    Charge 7j vs 28j ×{sig.acwr.value}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Impact comportements (WHOOP + conseil personnalisé) */}
        <BehaviorImpactCard correlations={correlations} filledDays={filledDays} />

        {/* Comportements — 7 jours */}
        {allRecentBehaviorKeys.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 18, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".10em", textTransform: "uppercase" as const, color: "#62686e", marginBottom: 12 }}>
              🔍 Comportements — 7 jours
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
              {allRecentBehaviorKeys.map(b => {
                const count = recentBehaviors.filter(r => r.behaviors.includes(b)).length;
                const meta  = BEHAVIOR_META[b];
                const accentColor = meta?.positive ? "#2f9e44" : "#d44000";
                return (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${accentColor}44`, background: `${accentColor}0d`, borderRadius: 20, padding: "7px 13px" }}>
                    <span style={{ fontSize: 15 }}>{meta?.emoji ?? "•"}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>{meta?.label ?? b}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, background: accentColor, color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{count}×</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: "#8a8f94", marginTop: 12, lineHeight: 1.45 }}>
              Renseigné {recentBehaviors.length} jour{recentBehaviors.length > 1 ? "s" : ""} sur 7.
            </div>
          </div>
        )}

      </div>
      {paywallStep === "priming" && (
        <PrimingJourneyModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
          onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
      )}
      {paywallStep === "paywall" && (
        <PaywallModal mode="athlete" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
