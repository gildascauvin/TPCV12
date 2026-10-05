"use client";
import { openInvite } from "@/components/coach/InviteHost";
import { validDecision } from "@/lib/autoregDecisionRecord";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import posthog from "posthog-js";
import { format, addDays, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView } from "@/lib/coachSessions";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { CoachCard, maxDiffToday, attention, riskScore } from "@/components/coach/CoachAthleteCard";
import AthleteFilterBar, { useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";
import { chronicPenaltyFor } from "@/lib/decisionCard";
import { applyAutoregDifficulty, suggestionSeverityColor, recoveryAxisX, effectiveRecoveryX } from "@/lib/autoregulation";
import { monotonyStrainFor, computeDecisionCard } from "@/lib/decisionCard";
import CoachPageBg from "@/components/calendar/CoachPageBg";
import HomeTabs, { type HomeTab } from "@/components/today/HomeTabs";
import { decisionRingState, DecisionRingMini } from "@/components/sessions/DecisionRing";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import CoachRadar, { type RadarPoint } from "@/components/coach/CoachRadar";
import type { DeckItem } from "@/components/coach/CoachDecisionDeck";
import { aggregateFor, AGG_BANDS, bandFor, type AggBand } from "@/lib/metricCards";
import { analyticsReady } from "@/lib/demoAnalytics";
import AnalyticsCollecting, { progressFromRaw } from "@/components/conseils/AnalyticsCollecting";
import { ChargeSection, RecuperationSection, TeamAnalyticsList } from "@/components/conseils/HomeAnalyticsSections";
import type { RangeMode } from "@/components/calendar/RangeToggle";
import { computeConseilsData, type ConseilsData } from "@/lib/conseilsData";

/* Modales/drawers ouverts sur demande — même traitement next/dynamic que /week et
   /coach/planning (2026-09-17) : leur JS part dans des chunks séparés, chargés au clic
   plutôt que dans le bundle initial de /coach. */
const CoachSessionModal = dynamic(() => import("@/components/coach/CoachSessionModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
const DuplicateModal = dynamic(() => import("@/components/sessions/DuplicateModal"));
const CoachDecisionDeck = dynamic(() => import("@/components/coach/CoachDecisionDeck"));
import { notifyOnboardingProgressSoon } from "@/lib/onboardingProgress";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { programWeekIndex, findProgramForWeek, type AthleteActiveProgram, programWeekTag } from "@/lib/programAssignment";
import { programSportEmoji } from "@/lib/sportCategories";
import { ACTIVITY_LABEL_CHANGED } from "@/components/layout/ActivityPill";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import type { TrendCode, TrendInput } from "@/lib/trainingLoad";
import { computeWellnessBaselineAt, wellnessSignal, dimensionRaw, DIMENSION_KEYS, DIMENSION_LABELS, relativeWellnessByDate, type WellnessBaselineResult, type DimensionKey } from "@/lib/wellnessBaseline";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus, ExerciseAttachments, WellnessDaily } from "@/types";

interface Props {
  firstDecisionOn?: string | null;
  coachName: string | null;
  athletes: CoachAthlete[];
  todaySessions: CoachViewSession[];
  today: string;
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  inviteCode: string | null;
  trends: Record<string, TrendCode | null>;
  /* Input brut de computeWeekOverWeekTrend (loadPct/wellnessDelta/rpeDelta) — nécessaire pour
     describeTrend() dans la carte décision unifiée (decisionCard.ts, 2026-09), `trends` seul
     (juste le code) ne suffit plus à produire le texte. `{}` par défaut = aucune donnée de tendance
     (repli sur le signal du jour seul), comportement inchangé pour tout appelant qui ne le fournit
     pas encore (sandbox). */
  trendInputs?: Record<string, TrendInput | null>;
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — désormais UNIQUEMENT pour les
     sportifs démo (statique, pas de notion de jour pour eux sur cette page). Pour un vrai sportif,
     la baseline est recalculée à chaque rendu depuis `wellnessBaselineHistory` ci-dessous, pour la
     date réellement affichée — voir le `const baselines` local plus bas (fix 2026-09 : ce prop
     restait figé sur "aujourd'hui" même en naviguant vers le passé). */
  baselines?: Record<string, WellnessBaselineResult | null>;
  /* Historique wellness (toutes dimensions, ~42j glissants) par sportif RÉEL — clé = user_id. Sert à
     recalculer la baseline Z-score pour n'importe quelle date navigée (computeWellnessBaselineAt),
     jamais seulement "aujourd'hui". `{}` par défaut = repli absolu (comportement inchangé). */
  wellnessBaselineHistory?: Record<string, WellnessDaily[]>;
  /* Historique récent (≥7j) par sportif — pour la monotonie/contrainte (Foster 1998) de la carte
     décision. `{}` par défaut = signal monotonie/contrainte simplement indisponible (repli gracieux,
     computeDecisionCard le tolère), comportement inchangé pour tout appelant qui ne le fournit pas
     encore (sandbox). */
  recentSessions?: Record<string, Session[]>;
  /** Programme actif par sportif (bandeau compact des cartes, 2026-10-01). */
  activePrograms?: Record<string, AthleteActiveProgram>;
  /* Sandbox uniquement (2026-08-19) — voir TodayClient.tsx pour le détail du mécanisme. */
  sandboxMode?: boolean;
  sandboxSessionsByDate?: Record<string, CoachViewSession[]>;
}

function greeting() { const h = new Date().getHours(); return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; }

export default function CoachClient({ coachName, athletes: initialAthletes, todaySessions, today, userId, subscriptionStatus, inviteCode: initialInviteCode, trends, trendInputs = {}, baselines: demoBaselines = {}, wellnessBaselineHistory: initialWellnessBaselineHistory = {}, recentSessions = {}, activePrograms = {}, sandboxMode = false, sandboxSessionsByDate, firstDecisionOn = null }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus);
  const sandboxPaywall = useSandboxGate("coach");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  const [selectedDate, setSelectedDate] = useState(today);
  /* Freemium (2026-09-30) : programmation, séances et invitations libres (seule la sandbox garde sa
     porte d'inscription). Les décisions ne se lisent qu'avec un abonnement — sauf la 1re décision de
     CHAQUE sportif (2026-10-01, avant : seule celle du sportif démo) : en clair le jour de son 1er
     affichage (coach_athletes.first_decision_on), floutée dès le lendemain. Chaque nouveau sportif
     invité apporte donc sa propre démonstration de la décision. */
  const gateInput = sandboxMode ? requireSubscription : <T,>(fn: () => T | Promise<T>) => Promise.resolve(fn());
  const [athleteFirstDecision, setAthleteFirstDecision] = useState<Record<string, string | null>>(
    () => Object.fromEntries(initialAthletes.map(a => [a.id, a.first_decision_on ?? null])),
  );
  const canDecideFor = (a: CoachAthlete) => {
    if (sandboxMode || isActive) return true;
    const first = athleteFirstDecision[a.id];
    return !first || first === today;
  };
  const coachFreeMode = !isActive && !sandboxMode;
  /* Collecte d'un sportif (2026-10-02) : progression vers ses premières analyses, à partir des
     séances avec charge et des jours de ressenti déjà en mémoire. */
  const collectFor = (a: CoachAthlete) => progressFromRaw(
    (recentSessions[a.id] ?? []).filter(x => x.done && (x.rpe ?? 0) > 0 && (x.duration ?? 0) > 0).map(x => x.date),
    a.user_id ? (wellnessBaselineHistory[a.user_id] ?? []).map(w => w.date) : [],
    today,
  );
  const unlock = () => setPaywallStep("priming");
  const [sessions, setSessions] = useState<CoachViewSession[]>(todaySessions);
  const [athletes, setAthletes] = useState(initialAthletes);
  /* Pose la 1re décision d'un sportif le jour où elle s'affiche vraiment (même règle que
     useFirstDecision côté sportif) : aujourd'hui, ressenti du jour connu, séance à ajuster. */
  useEffect(() => {
    if (sandboxMode || isActive || selectedDate !== today) return;
    const toMark = athletes.filter(a =>
      !athleteFirstDecision[a.id]
      && a.wellnessFilledToday !== false
      && sessions.some(x => x.athlete_id === a.id && x.date === today && !x.done));
    if (!toMark.length) return;
    setAthleteFirstDecision(prev => ({ ...prev, ...Object.fromEntries(toMark.map(a => [a.id, today])) }));
    toMark.forEach(a => {
      posthog.capture("first_decision_shown", { surface: "coach", demo_athlete: !a.user_id && !a.invite_email });
      supabase.from("coach_athletes").update({ first_decision_on: today }).eq("id", a.id)
        .then(({ error }) => { if (error) console.error("[coach] first_decision_on update error:", error); });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athletes, sessions, selectedDate, isActive]);
  const [wellnessBaselineHistory, setWellnessBaselineHistory] = useState<Record<string, WellnessDaily[]>>(initialWellnessBaselineHistory);

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  // Athlète/séance ouverts dans le drawer d'édition libre (CoachSessionModal) — voir openEditor()
  // plus bas. Le mode chaîné "Traiter les décisions" (modale décharge/surcharge AdjustSessionModal,
  // avance auto au sportif suivant) a été retiré (2026-09-26) : devenu redondant depuis que la jauge
  // de décision vit directement dans la carte séance (2026-09-24).
  const [reviewAthlete, setReviewAthlete] = useState<CoachAthlete | null>(null);
  const [reviewSession, setReviewSession] = useState<CoachViewSession | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);


  // Barre de filtre sportifs persistante (2026-09-24, redesign) — hydratée après montage (localStorage,
  // même précaution SSR que reviewedIds ci-dessus) plutôt qu'au useState initial. Écrite/lue via la
  // même clé partagée que /coach/planning (useCoachAthleteFilterStorage) : sélectionner un sportif ici
  // puis naviguer vers Planning y retrouve la même sélection, sans état React partagé (les 2 pages ne
  // sont jamais montées en même temps).
  const athleteFilterStorage = useCoachAthleteFilterStorage();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  // Filtre "métrique basse" (2026-09-24, POC poc-coach-context_4.html, recapHtml()/filterBar()) —
  // réservé au mode "Tous" (selectedAthleteId===null), comme dans le POC (mOK/filterBar n'y ont de
  // sens que pour la vue équipe). Reset dès qu'un sportif précis est sélectionné, pour ne jamais
  // laisser un filtre invisible restreindre silencieusement une vue à un seul sportif.
  const [metricFilter, setMetricFilter] = useState<DimensionKey | null>(null);
  useEffect(() => { if (selectedAthleteId !== null) setMetricFilter(null); }, [selectedAthleteId]);
  useEffect(() => { setSelectedAthleteId(athleteFilterStorage.read()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function selectAthleteFilter(id: string | null) {
    setSelectedAthleteId(id);
    athleteFilterStorage.write(id);
  }

  // Onglets Charge/Récupération/Comportements (2026-09-24, "point 1", partie coach) — même principe
  // que TodayClient.tsx, mais calculé CLIENT-SIDE sans nouveau fetch : recentSessions/
  // wellnessBaselineHistory couvrent déjà 42j par sportif réel (voir /coach/page.tsx, sinceHistory),
  // exactement la fenêtre attendue par computeConseilsData() (pure). Les sportifs démo (recentSessions
  // vide, pas d'entrée wellnessBaselineHistory) retombent gracieusement sur l'état "pas assez de
  // données" déjà géré par CrossInsightBanner/sections — limite acceptée, pas de séance/wellness
  // synthétique 42j construite pour eux ici (voir CLAUDE.md, même posture ailleurs dans le repo).
  const [homeTab, setHomeTab] = useState<HomeTab>("today");
  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const athleteConseilsData: Record<string, ConseilsData> = {};
  if (homeTab !== "today") {
    for (const a of athletes) {
      // "coach" (2026-09-25, fix wording) — "Ta charge"/"Ta récupération" n'a pas de sens affiché
      // à un coach au sujet d'un sportif qu'il consulte, doit être "Sa charge"/"Sa récupération".
      athleteConseilsData[a.id] = computeConseilsData(selectedDate, null, recentSessions[a.id] ?? [], a.user_id ? wellnessBaselineHistory[a.user_id] ?? [] : [], "coach");
    }
  }
  /* Données du sportif sélectionné, calculées même sur l'onglet Aujourd'hui (2026-09-29) : les
     miniatures des onglets (HomeTabs.tsx) en ont besoin pour se dessiner avant qu'on ouvre l'onglet.
     Un seul sportif, fonction pure sur des données déjà en mémoire — pas de fetch, contrairement à
     la boucle sur tout le roster ci-dessus, qui reste gardée par l'onglet. En mode "Tous" (aucun
     sportif sélectionné) il n'y a pas de miniature à montrer : un agrégat unique n'y voudrait rien
     dire, c'est la liste elle-même qui porte l'information par sportif. */
  const selectedTabLocked = (() => {
    const a = athletes.find(x => x.id === selectedAthleteId);
    return !!a && !canDecideFor(a) && !(!sandboxMode && !a.user_id && !a.invite_email);
  })();
  const selectedTabData = (() => {
    if (!selectedAthleteId) return undefined;
    if (athleteConseilsData[selectedAthleteId]) return athleteConseilsData[selectedAthleteId];
    const a = athletes.find(x => x.id === selectedAthleteId);
    if (!a) return undefined;
    return computeConseilsData(selectedDate, null, recentSessions[a.id] ?? [], a.user_id ? wellnessBaselineHistory[a.user_id] ?? [] : [], "coach");
  })();


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
            const rowValue = row ? wellnessSignal(row) : null;
            if (rowValue != null && row?.date === today) {
              setAthletes(prev => prev.map(x =>
                x.user_id === a.user_id ? { ...x, wellness_score: rowValue, behaviors: row.behaviors ?? [], wellnessFilledToday: true } : x
              ));
            }
          })
        .subscribe()
    );

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, []);

  const handleDateChange = useCallback(async (date: string) => {
    setSelectedDate(date);

    // Sandbox : le fixture initial fournit déjà toutes les séances par date (5 sportifs démo, voir
    // sandboxFixtures.ts) — aucun compte réel derrière userId/coach_id pour un refetch réseau.
    if (sandboxMode) {
      setSessions(sandboxSessionsByDate?.[date] ?? []);
      return;
    }

    const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
    const demoAthleteIds = athletes.filter(a => !a.user_id).map(a => a.id);

    const [realRes, demoRes, wellnessRes] = await Promise.all([
      realUserIds.length
        ? supabase.from("sessions").select("*").in("user_id", realUserIds).eq("date", date)
        : Promise.resolve({ data: [] }),
      demoAthleteIds.length
        ? supabase.from("coach_sessions").select("*").eq("coach_id", userId).in("athlete_id", demoAthleteIds).eq("date", date)
        : Promise.resolve({ data: [] }),
      fetch(`/api/coach/wellness?date=${date}`).then(r => r.json()).catch(() => ({ wellness: [], baselineHistory: {} })),
    ]);

    const unified: CoachViewSession[] = [
      ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
      ...(demoRes.data || []).map(s => demoToView(s as CoachSession)),
    ];
    setSessions(unified);

    const wellnessByUser = new Map<string, { score: number; behaviors: string[] }>();
    (wellnessRes.wellness || []).forEach((w: { user_id: string; score: number | null; base_score: number | null; behaviors: string[] | null }) => {
      wellnessByUser.set(w.user_id, { score: wellnessSignal(w) ?? 70, behaviors: w.behaviors ?? [] });
    });
    setAthletes(prev => prev.map(a => {
      if (!a.user_id) return a; // démo : pas de notion de jour, wellnessFilledToday déjà true
      const w = wellnessByUser.get(a.user_id);
      return w
        ? { ...a, wellness_score: w.score, behaviors: w.behaviors, wellnessFilledToday: true }
        : { ...a, wellnessFilledToday: false };
    }));
    // Fenêtre 42j se terminant à `date` (inclus), groupée par user_id — remplace l'historique de
    // baseline pour les sportifs concernés (voir `const baselines` plus bas, recalculé pour
    // `selectedDate` à chaque rendu — fix du score/conseil figés sur "aujourd'hui" en navigant).
    setWellnessBaselineHistory(prev => ({ ...prev, ...(wellnessRes.baselineHistory ?? {}) as Record<string, WellnessDaily[]> }));
  }, [supabase, userId, athletes]);

  /* Temps réel — séances (2026-09-17) : jusqu'ici seul wellness_daily était écouté ici, jamais
     sessions/coach_sessions — une séance ajustée/ajoutée ailleurs (Planning, Coach Control d'un
     autre appareil) ne se répercutait jamais en direct sur ce dashboard. RLS autorise bien un
     coach à lire les sessions de ses vrais sportifs liés (policy coach_read_athlete_sessions),
     donc l'abonnement direct fonctionne sans détour par une route admin. Réutilise handleDateChange
     (déjà le mécanisme de rechargement complet sessions+wellness pour une date) plutôt que de
     recomposer l'état à la main — seulement si la vue affichée est "aujourd'hui" (jamais de
     navigation forcée sur un coach en train de consulter un autre jour). Refs pour éviter une
     resouscription à chaque changement de selectedDate/athletes (même convention que l'effet
     wellness juste au-dessus, deps []). */
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const handleDateChangeRef = useRef(handleDateChange);
  handleDateChangeRef.current = handleDateChange;
  /* Étape "Ajuste leur séance" de la checklist d'onboarding : ?today=1 recale Coach Control sur
     aujourd'hui (la page peut être déjà montée sur un autre jour). */
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("today") !== "1") return;
    if (selectedDateRef.current !== today) handleDateChangeRef.current(today);
    router.replace(sandboxMode ? "/sandbox/coach" : "/coach");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  useEffect(() => {
    if (sandboxMode) return;
    const realAthletes = athletes.filter(a => a.user_id);
    const refetchIfToday = () => { if (selectedDateRef.current === today) handleDateChangeRef.current(today); };

    const channels = [
      ...realAthletes.map(a =>
        supabase
          .channel(`dash-sessions-${a.user_id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${a.user_id}` }, refetchIfToday)
          .subscribe()
      ),
      supabase
        .channel(`dash-coach-sessions-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "coach_sessions", filter: `coach_id=eq.${userId}` }, refetchIfToday)
        .subscribe(),
    ];

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* Baseline personnelle (Z-score) recalculée pour la date AFFICHÉE, jamais figée sur "aujourd'hui"
     (bug réel signalé par Gildas : score/conseil faux sur cauvingildas@gmail.com et
     contact@theperfclub.com, correct pour aujourd'hui mais reproductible sur les jours passés — le
     prop `baselines` du serveur n'était calculé qu'une fois, pour "aujourd'hui", jamais recalculé à
     la navigation). Pour un vrai sportif : la vraie ligne wellness_daily du jour affiché (toutes
     dimensions, via wellnessBaselineHistory) comparée à l'historique STRICTEMENT antérieur — même
     calcul que /coach/planning (dayBaseline). Pour un sportif démo : baseline statique du serveur
     (demoBaselines), pas de notion de jour pour lui sur cette page — limite préexistante, inchangée. */
  const baselines: Record<string, WellnessBaselineResult | null> = {};
  // Ligne wellness_daily brute du jour affiché, par sportif — même résolution que `baselines`
  // ci-dessus (recalculée à chaque render, jamais figée sur "aujourd'hui"), gardée à part pour la
  // barre de filtre par métrique (dimensionRaw a besoin du sommeil/stress/récup/motivation bruts,
  // pas seulement du score composite). `null` pour un sportif démo (pas de vraie ligne par jour).
  const dayRows: Record<string, WellnessDaily | null> = {};
  for (const a of athletes) {
    if (!a.user_id) { baselines[a.id] = demoBaselines[a.id] ?? null; dayRows[a.id] = null; continue; }
    const history = wellnessBaselineHistory[a.user_id] ?? [];
    const dayRow = history.find(w => w.date === selectedDate) ?? null;
    baselines[a.id] = dayRow ? computeWellnessBaselineAt(history.filter(w => w.date < selectedDate), dayRow) : null;
    dayRows[a.id] = dayRow;
  }

  /* Vue Groupe du Coach Control (2026-10-05) : récupération du jour sur l'axe de la reco
     (recoveryAxisX : percentile personnel, ou score absolu ramené sur la même échelle) — jauge des
     lignes — et récupération EFFECTIVE (avec la pénalité chronique) — position sur le radar. Les
     deux sortent des fonctions de autoregulation.ts, celles de computeAutoregSuggestion. */
  const groupRecup: Record<string, { pos: number; band: AggBand } | null> = {};
  const groupRadarX: Record<string, number | null> = {};
  if (homeTab === "today" && !selectedAthleteId) {
    for (const a of athletes) {
      const abs = a.wellnessFilledToday === false ? null : a.wellness_score;
      const x = recoveryAxisX(abs, baselines[a.id]);
      groupRecup[a.id] = x === null ? null : { pos: x / 100, band: bandFor("recup", x / 100) };
      groupRadarX[a.id] = effectiveRecoveryX(abs, baselines[a.id], chronicPenaltyFor(recentSessions[a.id] ?? []).chronicPenalty);
    }
  }


  // Monotonie/contrainte (Foster 1998) par sportif — même calcul que la carte décision elle-même
  // (decisionCard.ts), pour que le tri "À décider maintenant"/"Plan cohérent" ne contredise jamais
  // ce que la carte affiche (un sportif signalé seulement par sa monotonie doit être classé priorité).
  const msFor = (id: string) => monotonyStrainFor(recentSessions[id] ?? []);

  // Suggestion Surcharger (2026-09-26, retour de Gildas — "mets aussi bien ceux à alléger qu'à
  // surcharger dans 'À décider maintenant'") : attention() ne renvoie jamais true pour ce cas
  // (conçu uniquement pour détecter un signal négatif — récup basse/charge en accumulation/monotonie
  // élevée) alors qu'un Surcharger a bien un CTA actionnable dans la carte (AutoregButtons inline).
  // Même calcul que la carte décision elle-même (computeAutoregSuggestion), pour ne jamais classer
  // un sportif en "Plan cohérent" alors que sa carte affiche une vraie suggestion.
  /* Étendu à toute suggestion de la carte (2026-09-29) : un Alléger déclenché par le seul chronique
     (ACWR haut, Forme négative, via chronicPenalty) n'était vu ni par attention() ni par l'ancien
     test Surcharger seul, qui appelait computeAutoregSuggestion sans la pénalité. La carte disait
     "Alléger recommandé" dans la section "Plan cohérent". computeDecisionCard avec les mêmes
     entrées que CoachAthleteCard : les deux ne peuvent plus diverger. */
  /* Suggestion de la carte, extraite (2026-09-30) pour servir aussi la miniature de l'onglet
     Aujourd'hui quand un sportif est sélectionné — même source que la carte, jamais recalculée à part. */
  function cardSuggestion(a: CoachAthlete) {
    const topSession = getTopSession(a.id);
    if (!topSession || topSession.done) return null;
    return computeDecisionCard({
      wellnessScore: a.wellnessFilledToday === false ? null : a.wellness_score,
      plannedDifficulty: topSession.target_difficulty,
      baseline: baselines[a.id],
      wellnessFilledToday: a.wellnessFilledToday !== false,
      sessions: recentSessions[a.id] ?? [],
      perspective: "coach",
    }).suggestion;
  }
  const hasCardSuggestion = (a: CoachAthlete) => cardSuggestion(a) !== null;

  /* Une décision PRISE sort de "À décider maintenant" (2026-09-27, demande de Gildas — "que les
     décisions une fois faites partent dans 'plan cohérent'"). `reviewedIds` est indispensable ici :
     appliquer un ajustement résout souvent le signal de SURCHARGE tout seul (hasCardSuggestion
     recalcule depuis la nouvelle target_difficulty), mais jamais celui d'attention() — piloté par la
     récupération/la tendance/la monotonie, que l'ajustement de la séance ne change pas. Et
     "Maintenir" n'écrit rien du tout, donc ne change aucun signal. Sans cette règle, une carte
     traitée resterait indéfiniment dans la section des décisions à prendre. Annuler la décision
     (unmarkAutoregDecided) la fait donc revenir automatiquement. */
  const needsDecision = (a: CoachAthlete) => {
    const hasSessions = sessions.some(s => s.athlete_id === a.id);
    const { monotonyVal, strainVal } = msFor(a.id);
    return hasSessions && (attention(a, maxDiffToday(a.id, sessions), trends[a.id], baselines[a.id], monotonyVal, strainVal) || hasCardSuggestion(a));
  };
  /* Décision prise aujourd'hui, ici (reviewedIds) ou ailleurs (enregistrée sur la séance, migration
     030 : autre appareil, ou décidée par le sportif lui-même). */
  const isReviewed = (a: CoachAthlete) => reviewedIds.has(a.id)
    || (selectedDate === today && sessions.some(s => s.athlete_id === a.id && !s.done && s.date === today && !!validDecision(s)));
  const priority = athletes.filter(a => needsDecision(a) && !isReviewed(a));
  const stable = athletes.filter(a => !needsDecision(a) || isReviewed(a));
  const sortedPriority = [...priority].sort((a, b) => {
    const msA = msFor(a.id), msB = msFor(b.id);
    return riskScore(b, maxDiffToday(b.id, sessions), trends[b.id], baselines[b.id], msB.monotonyVal, msB.strainVal)
      - riskScore(a, maxDiffToday(a.id, sessions), trends[a.id], baselines[a.id], msA.monotonyVal, msA.strainVal);
  });

  // Filtre "métrique basse" (POC recapHtml()/mOK) — un sportif sans ligne du jour (démo, ou pas
  // encore rempli) ne peut être évalué sur aucune dimension, donc exclu dès qu'un filtre est actif
  // (même convention que le POC : `a.m` doit exister pour matcher `<5`).
  const metricOk = (a: CoachAthlete) => {
    if (!metricFilter) return true;
    const row = dayRows[a.id];
    return row !== null && dimensionRaw(row, metricFilter) < 5;
  };

  // Filtre par sportif (2026-09-24, barre persistante) — restreint les 2 sections à ce seul sportif
  // quand une sélection est active, sans changer où il apparaît (priorité vs plan cohérent reste
  // déterminé par attention(), pas par le filtre). Combiné au filtre métrique ci-dessus.
  const displayedPriority = (selectedAthleteId ? sortedPriority.filter(a => a.id === selectedAthleteId) : sortedPriority).filter(metricOk);
  /* Les sportifs qu'on vient de traiter en TÊTE de "Plan cohérent" — sans ça, la carte quitte un
     carrousel horizontal pour atterrir en bas d'une grille, et donne l'impression d'avoir disparu. */
  const sortedStable = [...stable].sort((a, b) => Number(isReviewed(b)) - Number(isReviewed(a)));
  const displayedStable = (selectedAthleteId ? sortedStable.filter(a => a.id === selectedAthleteId) : sortedStable).filter(metricOk);
  // Une seule pancarte par écran (2026-10-02) : sur la 1re carte floutée.
  const firstLockedCardId = [...displayedPriority, ...displayedStable].find(a => !canDecideFor(a))?.id ?? null;

  /* Revue du jour en swipe (2026-10-05) : file = "À décider maintenant" figée à l'ouverture ;
     un sportif hors de cette file s'ouvre seul (sa carte, sans geste à faire). */
  const [deck, setDeck] = useState<{ items: DeckItem[]; startId: string | null; title: string } | null>(null);
  function deckItemFor(a: CoachAthlete): DeckItem {
    const sug = canDecideFor(a) ? cardSuggestion(a) : null;
    return { id: a.id, name: a.name, verb: sug ? (sug.dir === "low" ? "Alléger" : "Surcharger") : null, color: sug ? suggestionSeverityColor(sug) : "#8a8f94" };
  }
  function openDeckFor(id: string | null) {
    const inQueue = id === null || displayedPriority.some(a => a.id === id);
    if (inQueue) setDeck({ items: displayedPriority.map(deckItemFor), startId: id, title: "Revue du jour" });
    else {
      const a = athletes.find(x => x.id === id);
      if (a) setDeck({ items: [{ ...deckItemFor(a), verb: null }], startId: a.id, title: a.name });
    }
  }

  function getTopSession(athleteId: string): CoachViewSession | null {
    return sessions
      .filter(s => s.athlete_id === athleteId && s.date === selectedDate)
      .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  }

  /* Gratuit (2026-10-02) : la jauge sans zone ne change que le RPE prévu, jamais les exercices. */
  async function setSessionDifficulty(athleteId: string, session: CoachViewSession, target_difficulty: number) {
    const result = await callSessionAPI({ action: "update", athleteId, sessionId: session.id, data: { target_difficulty } });
    if (result.ok) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, target_difficulty } : s));
  }
  async function applyAutoregAdjust(athleteId: string, session: CoachViewSession, pct: number) {
    const notes = session.notes ? session.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : session.notes;
    const target_difficulty = applyAutoregDifficulty(session.target_difficulty ?? 6, pct);
    const result = await callSessionAPI({ action: "update", athleteId, sessionId: session.id, data: { notes, target_difficulty } });
    if (result.ok) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, notes, target_difficulty } : s));
    }
  }

  async function undoAutoregAdjust(athleteId: string, session: CoachViewSession, original: { notes: string | null; target_difficulty: number | null }) {
    const result = await callSessionAPI({ action: "update", athleteId, sessionId: session.id, data: original });
    if (result.ok) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ...original } : s));
    }
  }

  function markAutoregDecided(athleteId: string) {
    setReviewedIds(prev => { const s = new Set(Array.from(prev)); s.add(athleteId); return s; });
  }

  function unmarkAutoregDecided(athleteId: string) {
    setReviewedIds(prev => { const s = new Set(Array.from(prev)); s.delete(athleteId); return s; });
    // La décision enregistrée en base est effacée par AutoregButtons ; on l'oublie aussi localement.
    setSessions(prev => prev.map(s => s.athlete_id === athleteId ? { ...s, autoreg_decision: null } : s));
  }

  /* Ouvre le drawer d'édition libre (CoachSessionModal) pour cet athlète — remplace l'ancien
     openDecision()/handleDecide() (2026-09-26, retour de Gildas : "quand je clic sur la séance ça
     doit ouvrir le drawer d'édition et non plus la modale de décision qui n'est plus utile") : depuis
     que la jauge de décision (AutoregButtons) est directement montée DANS la carte séance (2026-09-24,
     "la jauge de décision EST la jauge de la séance"), il n'y a plus besoin d'ouvrir une modale
     décharge/surcharge séparée au clic — Alléger/Surcharger se fait déjà en 1 clic sur la carte
     elle-même. Ce clic reste une simple consultation/édition, PAS une "décision traitée" (ne marque
     plus `reviewedIds` — seule la jauge inline le fait désormais, via onAutoregDecided). */
  function openEditor(athlete: CoachAthlete) {
    setReviewAthlete(athlete);
    setReviewSession(getTopSession(athlete.id));
  }

  /* "+ Ajouter une séance" d'une carte Coach Control (2026-09-30) : même drawer, sans séance, donc en
     création sur la date affichée — handleSaveReview crée puis met à jour la même ligne. */
  /* "↻ Reconduire" du bandeau programme (2026-10-01) : duplique la séance du jour vers la semaine
     suivante (date modifiable), même modale et même calcul que le Planning coach. */
  const [reconduire, setReconduire] = useState<{ athlete: CoachAthlete; session: CoachViewSession } | null>(null);
  async function reconduireTo(newDate: string, targetAthleteIds: string[] | undefined, pct: number) {
    if (!reconduire) return;
    const src = reconduire.session;
    const notes = src.notes ? src.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : (src.notes ?? "");
    const target_difficulty = adjustDifficulty(src.target_difficulty ?? 6, pct);
    const ids = targetAthleteIds?.length ? targetAthleteIds : [reconduire.athlete.id];
    await Promise.all(ids.map(athleteId => callSessionAPI({ action: "add", athleteId, data: { name: src.name, notes, target_difficulty, date: newDate } })));
    setReconduire(null);
  }
  /* Libellé "Séances libres" par sportif et par semaine — même stockage et même route que le
     Planning coach (athlete.free_training_label, POST /api/coach/free-label). */
  const [freeLabelOverrides, setFreeLabelOverrides] = useState<Record<string, Record<string, string>>>({});
  function freeLabelsFor(a: CoachAthlete): Record<string, string> {
    return freeLabelOverrides[a.id] ?? (a.free_training_label as Record<string, string> | undefined) ?? {};
  }
  async function setFreeLabelForWeek(a: CoachAthlete, mondayStr: string, label: string) {
    const value = label.trim();
    const next = { ...freeLabelsFor(a) };
    if (value) next[mondayStr] = value; else delete next[mondayStr];
    setFreeLabelOverrides(prev => ({ ...prev, [a.id]: next }));
    if (sandboxMode) return;
    await fetch("/api/coach/free-label", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId: a.id, monday: mondayStr, label: value }),
    });
  }

  // Thème de semaine modifié depuis le bandeau d'activité : calendrier et cartes à jour sans recharger.
  useEffect(() => {
    const onLabel = (e: Event) => {
      const d = (e as CustomEvent<{ monday: string; label: string | null; athleteId: string | null }>).detail;
      const a = athletes.find(x => x.id === d.athleteId);
      if (!a) return;
      setFreeLabelOverrides(prev => {
        const n = { ...freeLabelsFor(a), ...(prev[a.id] ?? {}) };
        if (d.label) n[d.monday] = d.label; else delete n[d.monday];
        return { ...prev, [a.id]: n };
      });
    };
    window.addEventListener(ACTIVITY_LABEL_CHANGED, onLabel);
    return () => window.removeEventListener(ACTIVITY_LABEL_CHANGED, onLabel);
  });

  /* Bandeau programme de chaque carte (onboarding in-app, 2026-10-01) — le même ProgramBanner que
     le Planning : programme actif → "Modifier", sinon séance du jour → "Reconduire", sinon
     "Programmes →". */
  function programPillFor(a: CoachAthlete) {
    const prefix = sandboxMode ? "/sandbox/coach" : "/coach";
    const ap = activePrograms[a.id];
    const mine = sessions.filter(s => s.athlete_id === a.id && s.date === selectedDate);
    const monday = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const s0 = !!ap && findProgramForWeek([{ start_date: ap.start_date, acclimatation: ap.acclimatation, programs: ap.program }], monday)?.acclimatation === true;
    return (
      <ProgramBanner
        dark
        flush
        hideBars
        program={ap?.program ?? null}
        currentWeek={ap ? programWeekIndex(ap.start_date, selectedDate) : -1}
        acclimatation={s0}
        onEdit={ap ? () => router.push(`${prefix}/programmes?focus=${ap.program.id}`) : undefined}
        reconduireLabel="Reconduire"
        onReconduire={!ap && mine.length ? () => setReconduire({ athlete: a, session: mine[0] }) : undefined}
        onLibrary={() => router.push(`${prefix}/programmes`)}
        freeLabel={freeLabelsFor(a)[monday] ?? null}
        onEditFreeLabel={label => setFreeLabelForWeek(a, monday, label)}
      />
    );
  }

  function openCreator(athlete: CoachAthlete) {
    setReviewAthlete(athlete);
    setReviewSession(null);
  }

  /* Contrat autosave (2026-09-26, remplace l'ancien "save = ferme le drawer" — plus de reviewContext
     passé à CoachSessionModal, donc autosave s'active désormais aussi ici, voir openEditor() plus
     haut) : jamais de fermeture ici, persiste silencieusement et retourne l'id pour que les autosaves
     suivants mettent à jour la MÊME ligne au lieu d'en recréer une — même pattern exact que
     saveSession() dans CoachPlanningClient.tsx. */
  async function handleSaveReview(data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, _athleteIds: string[], id?: string) {
    if (!reviewAthlete) return;
    notifyOnboardingProgressSoon();

    if (id) {
      const result = await callSessionAPI({ action: "update", athleteId: reviewAthlete.id, sessionId: id, data });
      if (!result.ok) throw new Error("update failed");
      setSessions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
      return { id };
    }
    const result = await callSessionAPI({ action: "add", athleteId: reviewAthlete.id, data });
    if (!result.ok || !result.session) throw new Error("create failed");
    const newS: CoachViewSession = result._real
      ? realToView(result.session as Session, athletes)
      : demoToView(result.session as CoachSession);
    setSessions(prev => [...prev, newS]);
    return { id: newS.id };
  }

  function handleCloseReview() {
    setReviewAthlete(null);
    setReviewSession(null);
  }

  // Nombre de décisions réellement prises aujourd'hui — sert au wording de l'état vide ci-dessous
  // (distinguer "rien à décider" de "tu as tout traité").
  const decidedTodayCount = athletes.filter(a => isReviewed(a)).length;

  // Rings + points de séance dans le calendrier popup (2026-09-24) — réservés au contexte "un seul
  // sportif" (Gildas : "quand on est... filtré sur un [athlète]"), jamais sur "Tous" (pas de score
  // unique à montrer pour une équipe entière). recentSessions/wellnessBaselineHistory couvrent déjà
  // ~42j par sportif réel (voir /coach/page.tsx, sinceHistory) — un sportif démo (recentSessions
  // vide, aucune entrée wellnessBaselineHistory) retombe gracieusement sur un calendrier nu.
  const selectedAthleteForRings = selectedAthleteId ? athletes.find(a => a.id === selectedAthleteId) ?? null : null;
  const DOT_RANK: Record<"planned" | "done-light" | "done-med" | "done-high", number> = { planned: 0, "done-light": 1, "done-med": 2, "done-high": 3 };
  const headerDotMap: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
  // Score RELATIF (2026-09-25, fix — "les wellness ring dans le calendar expanded sont fausses") :
  // relativeWellnessByDate() est le seul point qui calcule ce score, jamais wellness_daily.score brut.
  let headerWellnessMap: Record<string, number | null> = {};
  if (selectedAthleteForRings) {
    for (const s of recentSessions[selectedAthleteForRings.id] ?? []) {
      let cls: "done-light" | "done-med" | "done-high" | "planned";
      if (s.done) {
        const diff = s.rpe ?? s.target_difficulty ?? 5;
        cls = diff >= 8 ? "done-high" : diff >= 5 ? "done-med" : "done-light";
      } else {
        cls = "planned";
      }
      if (!headerDotMap[s.date] || DOT_RANK[cls] > DOT_RANK[headerDotMap[s.date]]) headerDotMap[s.date] = cls;
    }
    const wHistory = selectedAthleteForRings.user_id ? wellnessBaselineHistory[selectedAthleteForRings.user_id] ?? [] : [];
    headerWellnessMap = relativeWellnessByDate(wHistory, 45);
  }

  return (
    <>
      {/* Bannière du haut retirée hors sandbox (onboarding in-app, 2026-10-01) : l'étape "Débloque…"
         de la checklist du header la remplace. En sandbox elle porte la bascule sportif/coach. */}
      {sandboxMode && !isActive && (
        <UnsavedBanner
          role="coach"
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "coach", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      {/* Fond de page sombre (2026-09-26, CoachPageBg.tsx — partagé avec /coach/planning et
         /coach/athletes) : DARK_CARD_BG, le MÊME glow cyan que le sportif (/today, /week), sur
         demande de Gildas. L'app coach abandonne donc sa convention "page claire + cartes sombres"
         pour celle du sportif — page sombre, cartes claires (séances, listes) et surfaces
         translucides pour les panneaux (CoachCard). CalendarHeader n'a pas de fond propre
         (`seamless`), déplacé À L'INTÉRIEUR de ce wrapper pour que ce seul dégradé peigne le top nav
         ET le reste de la page en continu. */}
      <CoachPageBg>
      {/* Sélecteur de sportif TOUT EN HAUT, au-dessus du header de date (2026-09-26, demande de
         Gildas) — "qui" est la première décision d'un coach, "quand" ne vient qu'après ; c'est aussi
         la seule barre sticky de la page, donc celle qui doit rester accrochée au bord haut. */}
      <AthleteFilterBar athletes={athletes} selectedId={selectedAthleteId} onSelect={selectAthleteFilter} />
      <CalendarHeader
        mode="day" seamless
        selectedDate={selectedDate} onDateChange={handleDateChange} onProfileClick={() => setProfileOpen(true)}
        showRings={!!selectedAthleteForRings} dotMap={headerDotMap} wellnessMap={headerWellnessMap}
        /* Programme ou nom de semaine au-dessus de chaque semaine du calendrier (2026-10-04, comme le Planning). */
        weekTitleFor={selectedAthleteForRings ? (mondayIso => {
          const ap = activePrograms[selectedAthleteForRings.id];
          const match = ap ? findProgramForWeek([{ start_date: ap.start_date, acclimatation: ap.acclimatation, programs: ap.program }], mondayIso) : null;
          if (match) return `${programSportEmoji(match.program.sport)} ${match.program.name} · ${programWeekTag(match)}`;
          return freeLabelsFor(selectedAthleteForRings)[mondayIso] || null;
        }) : undefined}
      />
      {reconduire && (
        <DuplicateModal
          session={reconduire.session}
          defaultDate={format(addDays(new Date(selectedDate + "T12:00:00"), 7), "yyyy-MM-dd")}
          athletes={athletes}
          sourceAthleteId={reconduire.athlete.id}
          onDuplicate={(date, ids, pct) => gateInput(() => reconduireTo(date, ids, pct))}
          onClose={() => setReconduire(null)}
        />
      )}
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="coach" />}
      {deck && (
        <CoachDecisionDeck
          items={deck.items}
          startId={deck.startId}
          title={deck.title}
          isDecided={id => { const a = athletes.find(x => x.id === id); return !!a && isReviewed(a); }}
          onClose={() => setDeck(null)}
          renderCard={(id, action) => {
            const a = athletes.find(x => x.id === id);
            if (!a) return null;
            return (
              <CoachCard showPhase athlete={a} sessions={sessions} isPriority={needsDecision(a) && !isReviewed(a)}
                isReviewed={false}
                actionRequest={action}
                trend={trends[a.id]}
                trendInput={trendInputs[a.id]}
                baseline={baselines[a.id]}
                recentSessions={recentSessions[a.id]}
                coachName={coachName ?? "Coach"}
                isActive={canDecideFor(a)}
                locked={!canDecideFor(a)}
                collect={collectFor(a)}
                onSetDifficulty={(session, d) => setSessionDifficulty(a.id, session, d)}
                onUnlock={() => { setDeck(null); unlock(); }}
                onDecide={() => { setDeck(null); openEditor(a); }}
                onAddSession={() => { setDeck(null); openCreator(a); }}
                programPill={programPillFor(a)}
                onApplyAdjust={(session, pct) => canDecideFor(a) ? applyAutoregAdjust(a.id, session, pct) : Promise.resolve(unlock())}
                onUndoAdjust={(session, original) => undoAutoregAdjust(a.id, session, original)}
                onAutoregDecided={() => markAutoregDecided(a.id)}
                onAutoregUndone={() => unmarkAutoregDecided(a.id)} />
            );
          }}
        />
      )}
      {athletes.length > 0 && (
        <div style={{ maxWidth: isLg ? 1180 : isMd ? 720 : 600, margin: "0 auto", padding: isLg ? "0 40px" : isMd ? "0 24px" : "0 16px" }}>
          <HomeTabs
            active={homeTab}
            onChange={setHomeTab}
            previews={selectedTabData
              ? {
                  /* Même lecture que /today : l'ajustement conseillé en points de RPE, null = pas
                     de suggestion (arc sans curseur). */
                  today: (() => {
                    const a = athletes.find(x => x.id === selectedAthleteId);
                    if (!a) return null;
                    return decisionRingState(sessions.filter(s => s.athlete_id === a.id), cardSuggestion(a));
                  })(),
                  charge: analyticsReady(selectedTabData, "charge") ? aggregateFor("charge", selectedTabData) : null,
                  recuperation: analyticsReady(selectedTabData, "recup") ? aggregateFor("recup", selectedTabData) : null,
                }
              : undefined}
            locked={selectedTabLocked}
            lockedTabs={["today"]}
          />
        </div>
      )}

      {/* Layout élargi à 1180px (au lieu de 1000) — même largeur que `.shell` du POC, pour que le
         carrousel 3 colonnes ait la place de respirer. */}
      {/* Vue Groupe du Coach Control en pleine largeur (2026-10-05, comme le Planning). */}
      <div style={{ padding: isLg ? "20px 40px 100px" : isMd ? "18px 24px 100px" : "16px 16px 100px", maxWidth: (homeTab === "today" && !selectedAthleteId && athletes.length > 0) ? "none" : (isLg ? 1180 : isMd ? 720 : 600), margin: "0 auto" }}>

        {homeTab === "today" && (
        <>
        {/* ── Welcome overlay handled below ── */}


        {!selectedAthleteId && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: isMd ? 17 : 15, fontWeight: 600, color: "#fff" }}>
            {greeting()} {coachName ?? ""} 👋
          </div>
        </div>
        )}

        {athletes.length === 0 ? (
          <>
            <div style={{
              position: "relative", overflow: "hidden",
              background: "linear-gradient(135deg,#111 0%,#303030 70%,#151515 100%)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 24, padding: 24,
              boxShadow: "0 18px 44px rgba(0,0,0,.20)",
              marginBottom: 14,
            }}>
              <div style={{ position: "absolute", right: -52, top: -52, width: 180, height: 180, borderRadius: "50%", background: "rgba(212,64,0,.24)", filter: "blur(18px)", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 2 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏋️</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", marginBottom: 8, lineHeight: 1.1 }}>
                  Invite ton premier sportif
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
                  Ton espace est prêt. Partage une invitation pour commencer à suivre la récupération et les séances de tes sportifs.
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 24, boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#171b1f", marginBottom: 12 }}>Email du sportif</div>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(""); setInviteStatus("idle"); }}
                placeholder="athlete@email.com"
                style={{ width: "100%", height: 48, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", padding: "0 16px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
              />
              <button
                data-tour="invite-btn"
                onClick={handleEmptyInvite}
                disabled={inviteStatus === "loading" || !inviteEmail.trim()}
                style={{
                  width: "100%", height: 48, borderRadius: 16,
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
                  onClick={() => router.push(sandboxMode ? "/sandbox/coach/athletes" : "/coach/athletes")}
                  style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                >
                  Gérer les sportifs →
                </button>
              </div>
            </div>
          </>
        ) : selectedAthleteId && athletes.some(x => x.id === selectedAthleteId) ? (() => {
          /* Sportif sélectionné (2026-10-04) : même vue que l'Accueil du sportif — pas de sections
             « À décider / Plan cohérent », une seule carte en pleine page. */
          const a = athletes.find(x => x.id === selectedAthleteId)!;
          return (
            <div style={{ maxWidth: 600, margin: "0 auto", paddingTop: 4 }}>
              <CoachCard showPhase page athlete={a} sessions={sessions} isPriority={false}
                isReviewed={false}
                trend={trends[a.id]}
                trendInput={trendInputs[a.id]}
                baseline={baselines[a.id]}
                recentSessions={recentSessions[a.id]}
                coachName={coachName ?? "Coach"}
                isActive={canDecideFor(a)}
                locked={!canDecideFor(a)}
                collect={collectFor(a)}
                onSetDifficulty={(session, d) => setSessionDifficulty(a.id, session, d)}
                onUnlock={unlock}
                onDecide={() => openEditor(a)}
                onEditSession={sess => { setReviewAthlete(a); setReviewSession(sess); }}
                onAddSession={() => openCreator(a)}
                onApplyAdjust={(session, pct) => canDecideFor(a) ? applyAutoregAdjust(a.id, session, pct) : Promise.resolve(unlock())}
                onUndoAdjust={(session, original) => undoAutoregAdjust(a.id, session, original)}
                onAutoregDecided={() => markAutoregDecided(a.id)}
                onAutoregUndone={() => unmarkAutoregDecided(a.id)} />
            </div>
          );
        })() : (
          <>
            {/* Coach Control v2 (2026-10-05, POC https://claude.ai/artifact/LJKJb4nx5xuvPSFGUcCcP8) :
               radar + revue en swipe à gauche, lignes compactes à droite (récup + RPE prévu avec les
               vraies jauges de l'app). Remplace le carrousel de cartes et la grille "Plan cohérent" :
               les cartes ne s'ouvrent plus qu'une à la fois, dans la revue (CoachDecisionDeck). */}
            {(() => {
              const radarPoints: RadarPoint[] = athletes.filter(metricOk).map(a => {
                const t = getTopSession(a.id);
                const x = groupRadarX[a.id];
                const sug = canDecideFor(a) ? cardSuggestion(a) : null;
                return {
                  id: a.id, name: a.name, score: x === null || x === undefined ? null : Math.round(x), diff: t?.target_difficulty ?? null,
                  ring: t ? decisionRingState(sessions.filter(s => s.athlete_id === a.id), sug) : null, hideZone: !sug,
                };
              });
              const decidedRows = displayedStable.filter(a => isReviewed(a));
              const coherentRows = displayedStable.filter(a => !isReviewed(a));
              const row = (a: CoachAthlete, kind: "todo" | "done" | "rest", idx: number) => {
                const t = getTopSession(a.id);
                const sug = canDecideFor(a) ? cardSuggestion(a) : null;
                const pill = kind === "done"
                  ? { txt: "✓ Décidé", bg: "rgba(47,158,68,.18)", col: "#8fe0b0" }
                  : kind === "todo"
                    ? sug
                      ? { txt: sug.dir === "low" ? "⬇ Alléger" : "⬆ Surcharger", bg: sug.dir === "low" ? "#d44000" : "rgba(47,158,68,.18)", col: sug.dir === "low" ? "#fff" : "#8fe0b0" }
                      : { txt: canDecideFor(a) ? "À vérifier" : "À décider", bg: "rgba(242,138,0,.18)", col: "#f5b45a" }
                    : null;
                return (
                  <button key={a.id} type="button" onClick={() => openDeckFor(a.id)}
                    style={{
                      display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", width: "100%",
                      padding: "11px 16px", background: "none", border: "none", borderTop: idx ? "1px solid rgba(255,255,255,.08)" : "none",
                      color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t ? t.name : "Aucune séance aujourd'hui"}</span>
                      {pill && <span style={{ display: "inline-block", marginTop: 6, fontFamily: "var(--font-mono), monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px", borderRadius: 6, background: pill.bg, color: pill.col }}>{pill.txt}</span>}
                    </span>
                    <span style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}>
                        <AggregateGauge pos={groupRecup[a.id]?.pos ?? null} band={groupRecup[a.id]?.band ?? null} bands={AGG_BANDS.recup} size={58} showLabel={false} />
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: groupRecup[a.id]?.band.color ?? "rgba(255,255,255,.4)", whiteSpace: "nowrap" }}>{groupRecup[a.id]?.band.label ?? "Récup —"}</span>
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64 }}>
                        {t
                          ? <DecisionRingMini state={decisionRingState(sessions.filter(s => s.athlete_id === a.id), sug)} hideZone={!sug} showValue thin size={58} />
                          : <span style={{ height: 44, display: "grid", placeItems: "center", color: "rgba(255,255,255,.35)", fontFamily: "var(--font-mono), monospace" }}>—</span>}
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", whiteSpace: "nowrap" }}>RPE prévu</span>
                      </span>
                    </span>
                  </button>
                );
              };
              const section = (label: string, list: CoachAthlete[], kind: "todo" | "done" | "rest") => list.length > 0 && (
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", marginBottom: 9 }}>{label}</div>
                  <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: "4px 0" }}>
                    {list.map((a, k) => row(a, kind, k))}
                  </div>
                </div>
              );
              return (
                <div style={{ display: "grid", gridTemplateColumns: isLg ? "minmax(0,1.15fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 20, alignItems: "start", margin: "13px 0" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                    <div>
                      <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.5, color: "rgba(255,255,255,.75)" }}>
                        Chaque sportif est placé selon sa récupération du jour et la difficulté de sa séance prévue. La bande montre ce que sa récupération peut encaisser : au-dessus, on allège ; en dessous, on peut pousser.
                      </p>
                      <CoachRadar points={radarPoints} onSelect={openDeckFor} />
                    </div>
                    {displayedPriority.length > 0 ? (
                      <button type="button" onClick={() => openDeckFor(null)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", border: "none", borderRadius: 16, padding: "16px 18px", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 28px rgba(212,64,0,.35)", fontFamily: "inherit" }}>
                        Passer en revue · {displayedPriority.length} décision{displayedPriority.length > 1 ? "s" : ""}
                      </button>
                    ) : (
                      <div style={{ borderRadius: 16, padding: 15, textAlign: "center", background: "rgba(47,158,68,.14)", color: "#8fe0b0", border: "1px solid rgba(47,158,68,.3)", fontWeight: 700, fontSize: 14 }}>
                        {decidedTodayCount > 0 ? "✓ Toutes les décisions du jour sont prises" : "Aucune décision urgente. L'équipe peut suivre le plan."}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                    {section("À décider maintenant", displayedPriority, "todo")}
                    {section("Décidé aujourd'hui", decidedRows, "done")}
                    {section("Plan cohérent", coherentRows, "rest")}
                    <button type="button" onClick={openInvite}
                      style={{ borderRadius: 16, padding: "14px 16px", cursor: "pointer", fontFamily: "inherit", background: "transparent", border: "1.5px dashed rgba(255,255,255,.22)", color: "#ff8a55", fontSize: 13, fontWeight: 800 }}>
                      + Invite un sportif
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
        </>
        )}

        {/* ── Onglets Charge/Récupération/Comportements (2026-09-24, "point 1", partie coach) —
           voir POC `poc-coach-context_6.html`, tabBody()/teamBody() : sportif sélectionné → mêmes
           sections que la propre Accueil du sportif (HomeAnalyticsSections.tsx, identique
           TodayClient.tsx), SANS carte enveloppante — strictement le même rendu que /today (2026-09-26,
           retour de Gildas : "je veux plus les encadrés autour des charts, iso à l'app sportif").
           L'encadré n'avait de sens que tant que la page coach était claire (carte sombre sur page
           claire) ; depuis que la page porte elle-même le fond sombre du sportif (CoachPageBg), il ne
           faisait plus que dupliquer un cadre autour d'un contenu déjà sur le bon fond. "Tous" →
           liste classée par sévérité (TeamAnalyticsList), sans carte enveloppante non plus
           (2026-09-25, même retour : chaque ligne est déjà sa propre carte). ── */}
        {homeTab !== "today" && selectedAthleteId && (() => {
          const a = athletes.find(x => x.id === selectedAthleteId);
          const data = a ? athleteConseilsData[a.id] : undefined;
          if (!a || !data) return null;
          // Pas de mention en sandbox : tout y est démo par principe (2026-10-01).
          const demoAthlete = !sandboxMode && !a.user_id && !a.invite_email;
          /* Freemium v2 (2026-10-02) : mesures nettes, insights floutés comme la décision du sportif
             (sauf le jour de sa 1re décision, et le sportif démo) ; sans historique, la collecte. */
          const tabLocked = !canDecideFor(a) && !demoAthlete;
          return (
            <>
              {/* Données d'exemple (2026-10-01) : mention sur chaque chart, pas de bandeau en haut —
                 historique insuffisant, ou sportif de démo (historique fictif). */}
              {/* Pas assez d'historique → exemple en clair et étiqueté, comme côté sportif (freemium 2026-09-30). */}
              {homeTab === "charge" && (analyticsReady(data, "charge")
                ? <ChargeSection data={data} rangeMode={rangeMode} onRangeModeChange={setRangeMode} perspective="coach" example={demoAthlete} lockedHistory={tabLocked ? { onUnlock: unlock } : null} />
                : <AnalyticsCollecting data={data} group="charge" perspective="coach" />)}
              {/* Comportements n'est plus un onglet (2026-09-29) : dernier item du rapport de
                 récupération, dont il est un déterminant. Même changement que sur /today. */}
              {homeTab === "recuperation" && <>
                {analyticsReady(data, "recup")
                  ? <RecuperationSection data={data} rangeMode={rangeMode} onRangeModeChange={setRangeMode} perspective="coach" example={demoAthlete} lockedHistory={tabLocked ? { onUnlock: unlock } : null} />
                  : <AnalyticsCollecting data={data} group="recup" perspective="coach" />}
              </>}
            </>
          );
        })()}
        {/* `metric` ne vaut plus jamais "comportements" depuis que l'onglet a disparu
            (2026-09-29) : la branche correspondante de TeamAnalyticsList reste en place mais n'est
            plus atteignable d'ici, donc la vue "Groupe" n'a plus de colonne comportements.
            Signalé plutôt que réinventé — la remettre demanderait de l'intégrer aux lignes
            Récupération, ce qui n'a pas été demandé. */}
        {homeTab !== "today" && !selectedAthleteId && (
          <TeamAnalyticsList
            rows={athletes.map(a => ({ athlete: a, data: athleteConseilsData[a.id] })).filter((r): r is { athlete: CoachAthlete; data: ConseilsData } => !!r.data)}
            metric={homeTab as "charge" | "recuperation"}
            onSelect={selectAthleteFilter}
            locked={coachFreeMode}
            showExamples={!sandboxMode}
            onUnlock={unlock}
          />
        )}

        {/* CTA "+ Inviter des sportifs" retiré (2026-09-26) — l'invitation passe par le "+" de la
           bottom nav, qui route vers /coach/athletes?quickadd=invite. Le formulaire d'invitation de
           l'état vide (athletes.length === 0, plus haut) et le bandeau d'activation J0 restent :
           ce sont les seuls endroits où l'invitation EST l'action principale de l'écran. */}
      </div>
      </CoachPageBg>

      {reviewAthlete && (
        <CoachSessionModal
          athleteName={reviewAthlete.name}
          coachName={coachName ?? "Coach"}
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
            exercise_media: reviewSession.exercise_media,
          } : null}
          athletes={[]}
          initialAthleteId={reviewAthlete.id}
          onSave={(data, athleteIds, id) => gateInput(() => handleSaveReview(data, athleteIds, id))}
          onDuplicate={reviewSession ? (draft => { const a = reviewAthlete; const s = reviewSession; handleCloseReview(); setReconduire({ athlete: a, session: { ...s, ...draft } }); }) : undefined}
          onClose={handleCloseReview}
          onMarkViewed={() => {
            if (!reviewSession) return;
            callSessionAPI({ action: "update", athleteId: reviewAthlete.id, sessionId: reviewSession.id, data: { viewed_by_coach_at: new Date().toISOString() } });
          }}
        />
      )}

      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="coach" page="coach" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
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
