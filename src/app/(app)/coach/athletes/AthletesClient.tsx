"use client";

import LockedBlur from "@/components/paywall/LockedBlur";
import { useState, useRef, useEffect, useMemo } from "react";
import { buildAthleteFixture, buildTestFixture } from "@/lib/sandboxFixtures";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { format, addDays, subDays } from "date-fns";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import CoachPageBg from "@/components/calendar/CoachPageBg";
import type { WellnessBaselineResult } from "@/lib/wellnessBaseline";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import AthleteFilterBar, { useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";

/* Modales/drawers + TestsPanel (1800+ lignes, ne s'affiche que carte dépliée sur l'onglet
   Tests) ouverts sur demande — même traitement next/dynamic que les autres pages coach
   (2026-09-17). */
const InviteModal = dynamic(() => import("@/components/coach/InviteModal"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));
const TestsPanel = dynamic(() => import("@/components/tests/TestsPanel"));
import type { CoachAthlete, SubscriptionStatus } from "@/types";
import type { AthleteSignature } from "@/lib/fatigueSignature";
import type { TrendCode } from "@/lib/trainingLoad";
import { wellnessColor } from "@/lib/wellness";
import type { AthleteTrendInsight } from "@/lib/athletesData";
import type { LastTestByAthlete, AthleteTestVerdictByAthlete } from "@/lib/testSummary";
import type { Verdict } from "@/lib/testNorms";

// Reste en Status (rouge/orange/vert) — colore le badge d'état "Disponible"/"Stable"/"À
// surveiller", pas un ring : job Status légitime (texte+couleur = état, pas magnitude).
// AthleteRing plus bas utilise wellnessColor (Sequential bleu) pour le ring lui-même.
// Label ET couleur dans une seule fonction (pas 2 séparées) — bug réel trouvé par Gildas sinon :
// l'ancienne scoreColor(s) ignorait le paramètre trend, donc un score élevé (vert) avec un trend
// "accumulation"/"fatigue_persistante" affichait "À surveiller" en vert au lieu de rouge.
const TREND_WATCH: ReadonlySet<TrendCode> = new Set<TrendCode>(["accumulation", "fatigue_persistante"]);
// Exportée : réutilisée telle quelle par l'illustration onboarding "3 sportifs" (DecisionStep,
// via FrisePreviews.tsx) — même règle produit, pas une réimplémentation locale (2026-09-04).
export function athleteStatus(s: number | null, trend?: TrendCode | null): { label: string; color: string } {
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

// Exportée pour la même raison qu'athleteStatus ci-dessus.
export function AthleteRing({ score }: { score: number | null }) {
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
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color }}>{score !== null ? score : "—"}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
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
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "rgba(255,255,255,.45)", marginBottom: 2 }}>Dernier test</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
        {summary.name}{" "}
        <span style={{ fontFamily: "var(--font-mono), monospace", color, fontWeight: 700 }}>{arrow}{summary.deltaPct !== null ? ` ${summary.deltaPct > 0 ? "+" : ""}${summary.deltaPct}%` : ""}</span>
      </span>
    </div>
  );
}

/* Insight forces/faiblesses TOUS TESTS confondus (2026-09-25, retour de Gildas — "/coach/athletes
   pas adapté aux tests, faudrait afficher l'insight des forces/faiblesses pour tous les tests du
   sportif") — remplace l'ancien panneau déplié Charge/Tests par un simple encadré, même format que
   l'encadré `insight` (trendInsights) déjà juste au-dessus : `verdict` vient de buildVerdict()
   (testNorms.ts), le MÊME calcul que le titre de TestsPanel.tsx pour ce sportif — un seul point de
   vérité, jamais un résumé réinventé ici. `null` = aucun test loggué pour ce sportif, rien à
   afficher (pas de placeholder — le badge "Dernier test" déjà présent au-dessus suffit à signaler
   l'absence). */
function TestVerdictBox({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict) return null;
  return (
    <div style={{ marginTop: 8, padding: "9px 13px", borderRadius: 12, background: "rgba(212,64,0,.14)", border: "1px solid rgba(212,64,0,.30)", fontSize: 12.5, color: "rgba(255,255,255,.85)", lineHeight: 1.45 }}>
      <span style={{ fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55", fontWeight: 800 }}>🧪 {verdict.title} — </span>{verdict.sub}
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
  initialLastTests: LastTestByAthlete;
  /* Verdict forces/faiblesses tous tests confondus, par sportif (2026-09-25) — absent (sandbox) =
     pas d'encadré affiché, comportement déjà géré par TestVerdictBox (verdict undefined/null). */
  initialTestVerdicts?: AthleteTestVerdictByAthlete;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
  /* Sandbox uniquement (2026-08-19) — voir TodayClient.tsx pour le détail du mécanisme. */
  sandboxMode?: boolean;
}

export default function AthletesClient({ userId, initialAthletes, initialDate, initialSignatures, initialTrends, initialTrendInsights, initialBaselines = {}, initialLastTests, initialTestVerdicts = {}, subscriptionStatus, inviteCode, sandboxMode = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMd, isLg } = useBreakpoint();
  // Même largeur que .page-shell ci-dessous (600/720/1000) — alignement CalendarHeader/sélecteur de
  // sportif/contenu (2026-09-24).
  const contentMaxWidth = isLg ? 1000 : isMd ? 720 : 600;
  const [athletes, setAthletes] = useState(initialAthletes);
  const [showInvite, setShowInvite] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [signatures, setSignatures] = useState(initialSignatures);
  const [trends, setTrends] = useState(initialTrends);
  const [trendInsights, setTrendInsights] = useState(initialTrendInsights);
  const [lastTests] = useState(initialLastTests);
  /* Tests d'exemple côté coach (2026-10-01, même règle que /conseils) : un sportif sans aucun test
     affiche l'exemple tant que le coach n'a pas choisi d'ajouter son 1er test. Jamais en sandbox. */
  const [exampleDismissed, setExampleDismissed] = useState<Record<string, boolean>>({});
  const exampleTests = useMemo(() => {
    const p = buildAthleteFixture().profile;
    return { ...buildTestFixture(), sport: p.sport, sexe: p.sexe, poidsKg: p.poids_kg };
  }, []);
  const [testVerdicts] = useState(initialTestVerdicts);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Sélecteur de sportif commun à tous les onglets/tabs (2026-09-24, "point 1", partie coach) —
  // même clé localStorage que /coach et /coach/planning. Cette page ("Performance" dans la bottom
  // nav, ex-"Sportifs") reste la liste complète quand rien n'est sélectionné ; un sportif choisi
  // affiche directement SA page de tests — même principe que /conseils côté sportif.
  const athleteFilterStorage = useCoachAthleteFilterStorage();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  useEffect(() => { setSelectedAthleteId(athleteFilterStorage.read()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* "+" central de la bottom nav, option "Inviter un sportif" (2026-09-26) : ?quickadd=invite ouvre
     directement InviteModal, puis nettoie l'URL — sinon revenir en arrière la rouvrirait. Même
     mécanisme (et même raison de dépendre de `searchParams` plutôt que de `[]` : cliquer le "+"
     depuis cette page, déjà montée, ne remonte pas le composant) que ?quickadd=session|program sur
     WeekClient.tsx/CoachPlanningClient.tsx. */
  useEffect(() => {
    if (searchParams.get("quickadd") !== "invite") return;
    setShowInvite(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quickadd");
    const base = sandboxMode ? "/sandbox/coach/athletes" : "/coach/athletes";
    router.replace(params.toString() ? `${base}?${params.toString()}` : base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectAthleteFilter(id: string | null) {
    setSelectedAthleteId(id);
    athleteFilterStorage.write(id);
  }
  const realPaywall = usePaywall(subscriptionStatus);
  const sandboxPaywall = useSandboxGate("coach");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    if (sandboxMode) return;
    const res = await fetch(`/api/coach/athletes?date=${date}`);
    if (res.ok) {
      const { signatures: s, trends: t, trendInsights: ti } = await res.json();
      setSignatures(s);
      setTrends(t);
      setTrendInsights(ti);
    }
  }

  /* Temps réel (2026-09-17) — cette page ne se rafraîchissait jusqu'ici qu'au chargement initial ;
     aucun abonnement, contrairement à /today, /week, /coach. RLS autorise le coach à lire les
     sessions/wellness_daily de ses vrais sportifs liés (policies coach_read_athlete_sessions/
     coach_read_athlete_wellness), donc l'abonnement direct fonctionne sans route admin. Réutilise
     le même endpoint que handleDateChange (GET /api/coach/athletes, recalcule déjà signatures/
     trends/baselines côté serveur) — refetch ciblé plutôt qu'un router.refresh() complet. */
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  useEffect(() => {
    if (sandboxMode) return;
    const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { handleDateChange(selectedDateRef.current); }, 400);
    };

    const channels = [
      ...realUserIds.map(uid =>
        supabase
          .channel(`athletes-sessions-${uid}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${uid}` }, refetch)
          .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${uid}` }, refetch)
          .subscribe()
      ),
      supabase
        .channel(`athletes-coach-sessions-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "coach_sessions", filter: `coach_id=eq.${userId}` }, refetch)
        .subscribe(),
    ];

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Freemium (2026-09-30) : gérer son roster est une entrée, libre ; l'analyse des tests est floutée. */
  const gateInput = sandboxMode ? requireSubscription : <T,>(fn: () => T | Promise<T>) => Promise.resolve(fn());
  const analysisLocked = !isActive && !sandboxMode;
  async function handleDelete(athlete: CoachAthlete) {
    await gateInput(async () => {
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
      {/* Bannière du haut retirée hors sandbox (onboarding in-app, 2026-10-01) : l'étape "Débloque…"
         de la checklist du header la remplace. En sandbox elle porte la bascule sportif/coach. */}
      {sandboxMode && !isActive && (
        <UnsavedBanner
          role="coach"
          onAction={() => setPaywallStep("priming")}
          roleToggle={sandboxMode ? { role: "coach", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}
      {/* Nav contextuelle (2026-09-24) : un sportif précis sélectionné → page Tests, non datée
         (mode "title", pas de pager) ; "Tous" → jour de référence pour l'instantané récup/charge de
         chaque sportif (mode "day"). Toggle 7j/28j/90j retiré du header (2026-09-25, retour de
         Gildas — "pas besoin de 7j/28j/90j dans le header sur performance, tous les sportifs") : il
         ne pilotait plus rien depuis le retrait du panneau Charge/Récupération déplié ci-dessous. */}
      <CoachPageBg>
      {/* Sélecteur de sportif au-dessus du header de date — voir CoachClient.tsx pour le pourquoi. */}
      <AthleteFilterBar athletes={athletes} selectedId={selectedAthleteId} onSelect={selectAthleteFilter} contentMaxWidth={contentMaxWidth} />
      <CalendarHeader
        mode={selectedAthleteId ? "title" : "day"} title="Performance" contentMaxWidth={contentMaxWidth}
        selectedDate={selectedDate} onDateChange={selectedAthleteId ? undefined : handleDateChange}
        onProfileClick={() => setProfileOpen(true)}
        seamless
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="coach" />}

      <div className="page-shell">

        {selectedAthleteId ? (() => {
          const a = athletes.find(x => x.id === selectedAthleteId);
          if (!a) return null;
          if (!sandboxMode && !lastTests[a.id] && !exampleDismissed[a.id]) {
            return (
              <>
                <TestsPanel
                  ownerId="example" subject={{ subjectUserId: "example" }}
                  sport={exampleTests.sport} sexe={exampleTests.sexe} poidsKg={exampleTests.poidsKg}
                  fixture={exampleTests}
                  onDarkPage
                  example
                  examplePerspective="coach"
                />
                <button
                  onClick={() => setExampleDismissed(prev => ({ ...prev, [a.id]: true }))}
                  style={{ display: "block", width: "100%", marginTop: 14, border: "none", cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 800, borderRadius: 12, padding: "12px 16px", background: "linear-gradient(180deg,#f04a08,#d44000)" }}
                >
                  Ajouter son 1er test →
                </button>
              </>
            );
          }
          return (
            <>
              {/* Pas de titre "Performance / {nom}" ici (2026-09-24, retour de Gildas) — le nom du
                 sportif est déjà visible via la puce active dans AthleteFilterBar juste au-dessus,
                 le répéter est redondant. */}
              <TestsPanel
                ownerId={userId} subject={{ subjectCoachAthleteId: a.id }} linkedUserId={a.user_id}
                emptyHint={`Aucun test enregistré pour ${a.name} — marque une ligne d'exercice comme test (menu ⋯) dans une de ses séances.`}
                sport={a.sport} sexe={a.sexe ?? null} poidsKg={a.poids_kg ?? null}
                onDarkPage
                lockedAnalysis={analysisLocked ? { onUnlock: () => setPaywallStep("priming") } : null}
              />
            </>
          );
        })() : (
        <>
        {/* En-tête "Coach / Mes sportifs / N sportifs suivis / + Inviter" retiré (2026-09-26,
           retour de Gildas) — redondant avec le titre "Performance" déjà posé par CalendarHeader
           et avec le compte déjà lisible en un coup d'œil sur la liste elle-même. Le bouton
           "+ Inviter" survit, déplacé en bas de liste (même convention que CoachClient.tsx). */}
        {athletes.length === 0 ? (
          <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 10px 26px rgba(0,0,0,.22)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", lineHeight: 1.5, marginBottom: 20 }}>
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
              // Liseré gauche — même grille que TeamAnalyticsList (HomeAnalyticsSections.tsx), mais
              // piloté par le dernier TEST (pas charge/récupération, 2026-09-26, retour de Gildas) :
              // vert/rouge si le dernier test s'est amélioré/dégradé, gris neutre sinon (y compris
              // aucun test loggué).
              const test = lastTests[a.id];
              const testColor = test?.improved === true ? "#2f9e44" : test?.improved === false ? "#d10000" : "#8a8f94";
              // Même surface que CoachCard (2026-09-26, "la même couleur que les coachcontrol
              // cards, pas blanche") — voile blanc translucide sur le fond sombre de la page. Seul
              // le liseré gauche (test / en attente) et la teinte de bordure distinguent encore les
              // états.
              return (
              <div key={a.id} style={{
                background: isPending ? "rgba(242,138,0,.10)" : "rgba(255,255,255,.055)",
                border: isPending ? "1px solid rgba(242,138,0,.28)" : "1px solid rgba(255,255,255,.10)",
                borderLeft: `3px solid ${isPending ? "#f28a00" : testColor}`,
                borderRadius: 16, padding: 18,
                boxShadow: "0 10px 26px rgba(0,0,0,.22)",
              }}>
                <div
                  onClick={isPending ? undefined : () => selectAthleteFilter(a.id)}
                  style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap", cursor: isPending ? "default" : "pointer" }}
                >
                  <AthleteRing score={recovery} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isPending ? (
                        <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#fff" }}>{a.name}</div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(sandboxMode ? "/sandbox/coach/planning" : `/coach/planning?athlete=${a.id}`); }}
                          style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#fff", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,.28)", textUnderlineOffset: 3 }}
                        >
                          {a.name}<span className="tour-lock">🔒</span>
                        </button>
                      )}
                      {a.user_id && (
                        <div style={{ fontFamily: "var(--font-mono), monospace", padding: "2px 7px", borderRadius: 999, background: "rgba(47,158,68,.12)", color: "#2f9e44", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>RÉEL</div>
                      )}
                      {isPending && (
                        <div style={{ fontFamily: "var(--font-mono), monospace", padding: "2px 7px", borderRadius: 999, background: "rgba(242,138,0,.12)", color: "#f28a00", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em" }}>EN ATTENTE</div>
                      )}
                    </div>
                    {isPending && (
                      <div style={{ fontSize: 11, color: "#f28a00", marginTop: 3 }}>{a.invite_email}</div>
                    )}
                  </div>
                  {isMd && !isPending && (
                    <TestBadge summary={test} />
                  )}
                  {!isPending && (
                    <span style={{ color: "rgba(255,255,255,.45)", fontSize: 15, flexShrink: 0 }} title="Voir le rapport de performance">›</span>
                  )}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpenId(prev => (prev === a.id ? null : a.id)); }}
                      aria-label="Options"
                      style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", cursor: "pointer", fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      ⋯
                    </button>
                    {menuOpenId === a.id && (
                      <>
                        <div onClick={e => { e.stopPropagation(); setMenuOpenId(null); }} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 40, right: 0, background: "#1c1c1e", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,.5)", zIndex: 20, minWidth: 150, overflow: "hidden" }}>
                          <button
                            data-tour="supprimer-btn"
                            onClick={() => { setMenuOpenId(null); handleDelete(a); }}
                            disabled={deleting === a.id}
                            style={{ width: "100%", textAlign: "left", padding: "11px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#ff6b6b", opacity: deleting === a.id ? 0.5 : 1 }}
                          >
                            {a.user_id ? "Retirer" : isPending ? "Annuler" : "Supprimer"}<span className="tour-lock">🔒</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Insight = uniquement celui des TESTS (verdict forces/faiblesses), jamais l'insight
                   croisé charge/récupération (2026-09-26, retour de Gildas — "ne mettre que
                   l'insight qui vient des tests... pas l'autre sur l'insight croisé charge/recup") :
                   cette page ("Performance") ne montre plus que le suivi de tests, l'insight doit
                   parler de ça, pas de charge/récup qui vivent désormais sur /today. */}
                {!isPending && testVerdicts[a.id] && (
                  <LockedBlur locked={analysisLocked} surface="athletes_verdict" onUnlock={() => setPaywallStep("priming")} cta="Voir l'analyse" compact radius={12}>
                    <TestVerdictBox verdict={testVerdicts[a.id]} />
                  </LockedBlur>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* CTA "+ Inviter des sportifs" retiré (2026-09-26) — l'invitation passe désormais par le
           "+" de la bottom nav, qui route ici avec ?quickadd=invite (voir l'effet plus haut). Le CTA
           de l'état vide (athletes.length === 0) reste : c'est la seule action possible sur cet
           écran tant qu'aucun sportif n'existe. */}
        </>
        )}
      </div>
      </CoachPageBg>

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
