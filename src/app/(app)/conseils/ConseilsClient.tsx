"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { format, addDays, subDays } from "date-fns";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { useHorizontalScrollNav } from "@/hooks/useHorizontalScrollNav";
import SparkLineClient, { FORM_ZONES, formToChartPosition, WELLNESS_ZONES } from "@/components/conseils/SparkLineClient";
import { dimensionBadgesSeries, DIMENSION_ARROW, dimensionBadgeColor, type DimensionKey } from "@/lib/wellnessBaseline";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import ShareButton from "@/components/sessions/ShareButton";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import SectionTabs, { type TestsSection } from "@/components/tests/SectionTabs";
import type { MergedTest, TestResultRow } from "@/lib/testResults";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import type { ConseilsData, BehaviorCorrelation } from "@/lib/conseilsData";
import { METRIC_DEFINITIONS } from "@/lib/fatigueSignature";
import type { SubscriptionStatus } from "@/types";

/* Modales/drawers + TestsPanel (1800+ lignes, seulement affiché sous l'onglet "Tests") ouverts sur
   demande — même traitement next/dynamic que les autres pages (2026-09-17). */
const TestsPanel = dynamic(() => import("@/components/tests/TestsPanel"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));

/* Statut d'un comportement (2026-09, suite) — calcul pur partagé entre le badge (rendu sur la même
   ligne que le nom, voir BehaviorImpactCard) et la barre (BehaviorGauge), pour ne jamais dupliquer le
   seuil de neutralité/la couleur entre les deux. */
function behaviorStatus(impact: number) {
  const isPositive = impact > 0;
  const isNeutral  = Math.abs(impact) < 0.3;
  const color      = isNeutral ? "rgba(255,255,255,.35)" : isPositive ? "#2f9e44" : "#d10000";
  const impactStr  = isNeutral ? "0 pt" : `${impact > 0 ? "+" : ""}${impact.toFixed(1)} pts`;
  const statusLabel = isNeutral ? "Neutre" : isPositive ? "Aide" : "Pénalise";
  return { isPositive, isNeutral, color, impactStr, statusLabel };
}

/* Wording "profil par dimension" (2026-09, suite — retour de Gildas, "Surtout via motivation (+1.0)"
   pas clair) : phrase explicite avec article accordé au genre du nom plutôt qu'un simple label brut
   collé après "via" — DIMENSION_LABELS (wellnessBaseline.ts) reste la source du libellé affiché
   ailleurs (badges du chart Récupération), cette table-ci ne sert qu'à cette phrase précise. */
const DIMENSION_PHRASE: Record<DimensionKey, string> = {
  sleep: "le sommeil",
  stress: "le stress",
  recovery: "la récupération musculaire",
  motivation: "la motivation",
};

/* Jauge par comportement (2026-09, suite — retour de Gildas, "applique les mêmes composants de
   jauges qu'on a fait pour les tests mais pour les comportements") : même langage visuel que
   PrimaryGauge (TestsPanel.tsx) — tick central, barre qui part du centre vers la droite (aide, vert)
   ou la gauche (pénalise, rouge), texte de repère centré en dessous. Le badge lui-même vit désormais
   sur la ligne du nom (2026-09, suite — retour de Gildas, "aligne 🧘 Stretching et Aide +10.5 pts
   horizontalement"), pas ici — cette jauge ne rend plus que la barre + le repère. Le centre représente
   ici un impact nul, pas une cible sourcée — donc la barre est toujours relative à `maxAbs`
   (comportement le plus marqué de la liste), pas à une norme externe. */
function BehaviorGauge({ c, maxAbs }: { c: BehaviorCorrelation; maxAbs: number }) {
  const { isPositive, isNeutral, color } = behaviorStatus(c.impact);
  const width = Math.min(50, Math.abs(c.impact) / maxAbs * 50);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative" as const, height: 12, background: "rgba(255,255,255,.10)", borderRadius: 6 }}>
        <div style={{ position: "absolute" as const, left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
        {!isNeutral && (
          <div style={{ position: "absolute" as const, top: 0, height: "100%", borderRadius: 6, background: color, ...(isPositive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }) }} />
        )}
      </div>
      <div style={{ marginTop: 6, textAlign: "center" as const, fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
        loggué <b style={{ color: "#fff", fontWeight: 700 }}>{c.occurrences}×</b> sur la période
      </div>
    </div>
  );
}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em" }}>Ce qui t'aide ou te pénalise</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>

        {/* Encadré d'insight (2026-09, suite — retour de Gildas, "enlève le [sous-titre générique] et
            mets [la recommandation] dans un encadré d'insight à la place") : remplace le sous-titre
            fixe ET le bloc "Conseil personnalisé" qui vivait tout en bas de la carte — une seule
            phrase actionnable, en haut, jamais répétée deux fois sur la même carte. */}
        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.5, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {bestHelper && (
            <div>
              <span style={{ fontWeight: 900, color: "#2f9e44" }}>✓ Continue : </span>
              <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span>
              {" "}améliore ta récupération de{" "}
              <span style={{ fontWeight: 900, color: "#2f9e44" }}>+{bestHelper.impact.toFixed(1)} pts</span> en moyenne.
            </div>
          )}
          {worstHurt && (
            <div>
              <span style={{ fontWeight: 900, color: "#d10000" }}>✗ Évite : </span>
              <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span>
              {" "}pénalise ta récupération de{" "}
              <span style={{ fontWeight: 900, color: "#d10000" }}>{worstHurt.impact.toFixed(1)} pts</span> en moyenne.
            </div>
          )}
          {!bestHelper && !worstHurt && (
            <div style={{ color: "rgba(255,255,255,.60)" }}>Aucun comportement n&apos;a d&apos;effet marqué sur ta récupération pour l&apos;instant.</div>
          )}
        </div>

        {/* Lignes — même layout que UnifiedRow (TestsPanel.tsx) : badge emoji carré, puis nom + badge
            de statut sur UNE MÊME ligne (2026-09, suite — retour de Gildas, "aligne 🧘 Stretching et
            Aide +10.5 pts horizontalement" — avant, le badge vivait dans BehaviorGauge, sur sa propre
            ligne en dessous), la jauge en pleine largeur ensuite. */}
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          {correlations.map(c => {
            const { color, statusLabel, impactStr } = behaviorStatus(c.impact);
            // Profil par dimension (2026-09) : n'affiche la dimension dominante que si elle a un
            // impact réel (>= 0.3 pt, même seuil de neutralité que behaviorStatus ci-dessus) — sinon
            // "surtout via ta motivation (0 pt)" serait une fausse précision.
            const dd = c.dominantDimension;
            const showDominant = dd && Math.abs(dd.impact) >= 0.3;
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{c.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.label}</div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" as const, color, background: `${color}26` }}>
                      {statusLabel} {impactStr}
                    </span>
                  </div>
                  {showDominant && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
                      Impacte {dd!.impact > 0 ? "positivement" : "négativement"} <b style={{ color: "rgba(255,255,255,.65)" }}>{DIMENSION_PHRASE[dd!.key]}</b> ({dd!.impact > 0 ? "+" : ""}{dd!.impact.toFixed(1)})
                    </div>
                  )}
                  <BehaviorGauge c={c} maxAbs={maxAbs} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.28)", lineHeight: 1.5 }}>Basé sur tes {filledDays} derniers jours · veille → jour même</div>
      </div>
    </div>
  );
}

export default function ConseilsClient({ initialData, subscriptionStatus, hasActiveCoach, userId, sandboxMode = false, isDemoData = false, sport = null, sexe = null, poidsKg = null, testsFixture }: { initialData: ConseilsData; subscriptionStatus: SubscriptionStatus; hasActiveCoach: boolean; userId?: string; sandboxMode?: boolean; isDemoData?: boolean; sport?: string | null; sexe?: "homme" | "femme" | null; poidsKg?: number | null; testsFixture?: { merged: MergedTest[]; results: TestResultRow[] } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const [section, setSection] = useState<TestsSection>(searchParams.get("section") === "tests" ? "tests" : "load");
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  async function handleDateChange(date: string) {
    // Sandbox : le fixture initial couvre déjà 42 jours (computeConseilsData), pas de refetch réseau
    // pour un userId fictif — la navigation par date de /conseils reste donc figée sur "aujourd'hui".
    if (sandboxMode) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/conseils?date=${date}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  /* Temps réel (2026-09-17) — jusqu'ici cette page ne se rafraîchissait qu'au chargement initial
     ou via une navigation manuelle, contrairement à /today et /week qui écoutent déjà sessions/
     wellness_daily. Réutilise le même endpoint que la navigation de date (GET /api/conseils, déjà
     recalcule computeConseilsData côté serveur) plutôt qu'un router.refresh() — évite de re-render
     tout le server component (paywall, profil...) pour une simple mise à jour de données. */
  const referenceDateRef = useRef(data.referenceDate);
  referenceDateRef.current = data.referenceDate;
  useEffect(() => {
    if (!userId || sandboxMode) return;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetch(`/api/conseils?date=${referenceDateRef.current}`)
          .then(res => (res.ok ? res.json() : null))
          .then(fresh => { if (fresh) setData(fresh); });
      }, 400);
    };
    const channel = supabase
      .channel(`conseils-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${userId}` }, refetch)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, sandboxMode]);

  // Scroll horizontal (trackpad) = change de jour avant/après — coupé pendant un fetch en cours.
  useHorizontalScrollNav(dayScrollRef, {
    onPrev: () => handleDateChange(format(subDays(new Date(data.referenceDate + "T12:00:00"), 1), "yyyy-MM-dd")),
    onNext: () => handleDateChange(format(addDays(new Date(data.referenceDate + "T12:00:00"), 1), "yyyy-MM-dd")),
    enabled: !loading,
  });

  const {
    sig, timeSeries, loadInfo, monotonyInfo, strainInfo, recoveryInfo, formInfo, fitnessTrendInfo, fatigueTrendInfo, chargeInsight, recoveryInsight,
    recoveryAlert, wellnessBaselineSeries,
    trendText, trendEmoji, trendAction, correlations, filledDays,
  } = data;

  const dotMap: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
  // Score relatif (baseline Z-score) sur le ring du header quand l'historique de ce jour est
  // suffisant — repli sur le score absolu sinon. Même chiffre que /today et /week pour le même jour
  // (un seul calcul, jamais l'absolu affiché ici pendant que les autres surfaces montrent le relatif
  // — bug réel trouvé par Gildas, tous les jours du header /conseils étaient encore en absolu).
  // wellnessBaselineSeries et timeSeries sont alignés index à index (même longueur/fenêtre, voir
  // conseilsData.ts).
  const wellnessMap: Record<string, number | null> = {};
  for (let i = 0; i < timeSeries.length; i++) {
    const p = timeSeries[i];
    const b = wellnessBaselineSeries[i];
    wellnessMap[p.date] = b?.hasEnoughHistory ? b.relativeScore : p.recovery;
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
  // Baseline personnelle (Z-score) alignée sur la même fenêtre que last7Series (même slicing,
  // wellnessBaselineSeries porte 42j calculés côté serveur comme timeSeries). Un jour sans
  // historique suffisant devient un trou dans la courbe (null) plutôt qu'une valeur absolue
  // classée à tort dans les zones relatives — voir SparkLineClient.tsx.
  const last7Baseline = rangeMode === "month" ? wellnessBaselineSeries.slice(-28) : wellnessBaselineSeries.slice(-7);
  const recoveryRelativePoints = last7Baseline.map(b => b?.hasEnoughHistory ? b.relativeScore : null);
  const recoveryRawPoints = last7Series.map(p => p.recovery);
  // Badges de dimension au survol (ex. "SOMMEIL −1,82 ↓") — calculés sur toute la série 42j (pour
  // que la tendance 7j des badges ait du recul même en tout début de fenêtre affichée), puis
  // découpés avec le même slicing que last7Baseline pour rester aligné index à index avec le chart.
  const dimensionBadgesFull = dimensionBadgesSeries(wellnessBaselineSeries);
  const last7DimensionBadges = rangeMode === "month" ? dimensionBadgesFull.slice(-28) : dimensionBadgesFull.slice(-7);
  // Toujours le dernier point de la série complète (= aujourd'hui), indépendant du toggle Sem./Mois.
  const todayDimensionBadges = dimensionBadgesFull[dimensionBadgesFull.length - 1];

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          role="athlete"
          onAction={() => setPaywallStep("priming")}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}
      <CalendarHeader
        selectedDate={data.referenceDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={wellnessMap}
        extraControls={section === "load" ? <RangeToggle mode={rangeMode} onChange={setRangeMode} /> : undefined}
        onProfileClick={() => setProfileOpen(true)}
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="athlete" />}

      <div ref={dayScrollRef} className="page-shell" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>

        <SectionTabs active={section} onChange={setSection} />

        {section === "tests" ? (
          userId ? (
            <TestsPanel
              ownerId={userId} subject={{ subjectUserId: userId }} mergeCoach
              sport={sport} sexe={sexe} poidsKg={poidsKg}
              onEditProfile={() => setProfileOpen(true)}
            />
          ) : testsFixture ? (
            <TestsPanel
              ownerId="sandbox-athlete" subject={{ subjectUserId: "sandbox-athlete" }}
              sport={sport} sexe={sexe} poidsKg={poidsKg}
              fixture={testsFixture}
            />
          ) : (
            <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, padding: "8px 2px" }}>Le suivi de tests n'est pas disponible en mode démo.</div>
          )
        ) : (
        <>
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
                {isDemoData ? "Exemple — ton historique réel remplacera ceci dès tes premières séances" : "Charge et Récupération sur les 7 derniers jours"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {isDemoData && (
                <div style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.85)", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" as const }}>
                  🔎 Exemple
                </div>
              )}
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
                      {/* 4 badges de dimension (Sommeil/Stress/Récup./Motivation) à la place du
                          badge composite "Fatigué/Équilibré/Frais" — flèche de tendance 7j
                          uniquement, jamais l'indice Z brut (2026-08-31, retour explicite de
                          Gildas). Repli sur rien si l'historique du jour est insuffisant (comme
                          au survol du chart, même donnée). */}
                      {todayDimensionBadges?.map(b => (
                        <ZoneBadge key={b.key} label={`${b.label} ${DIMENSION_ARROW[b.arrow]}`} color={dimensionBadgeColor(b.arrow)} />
                      ))}
                      {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={METRIC_DEFINITIONS.form} />}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                    {recoveryInsight}
                  </div>
                  <div style={{ borderRadius: 10, overflow: "visible", marginBottom: 6 }}>
                    <SparkLineClient
                      points={recoveryRelativePoints} pointsRaw={recoveryRawPoints} dates={zoneDates} color={recoveryInfo.color}
                      maxVal={100} height={168} animDelay={300}
                      metricType="recovery" uid="recovery" chartType="line" sequentialFill
                      zones1={WELLNESS_ZONES}
                      dimensionBadgesAt={last7DimensionBadges}
                      points2={last7Series.map(p => p.form !== null ? formToChartPosition(p.form) : null)}
                      points2Raw={last7Series.map(p => p.form)} zones2={FORM_ZONES}
                      weekLabels={rangeMode === "month"}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontStyle: "italic" as const, textAlign: "right" as const }}>Trait dégradé = récupération (clair = en forme) · Pointillé coloré = Forme · Bande = écart entre les deux</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Impact comportements + charge (séance fatigante / jour de récup la veille) — même liste,
            même layout, 2026-09 */}
        <BehaviorImpactCard correlations={correlations} filledDays={filledDays} />
        </>
        )}

      </div>
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" page="conseils" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
        ) : (
          <PrimingJourneyModal mode="athlete" billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
            onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss}
            athleteSelfId={userId} />
        )
      )}
      {!sandboxMode && paywallStep === "paywall" && (
        <PaywallModal mode="athlete" allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
