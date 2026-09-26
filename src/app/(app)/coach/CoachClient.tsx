"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import posthog from "posthog-js";
import { format, addDays, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView } from "@/lib/coachSessions";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useHorizontalScrollNav } from "@/hooks/useHorizontalScrollNav";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import { CoachCard, maxDiffToday, attention, riskScore } from "@/components/coach/CoachAthleteCard";
import AthleteFilterBar, { useCoachAthleteFilterStorage } from "@/components/coach/AthleteFilterBar";
import { computeAutoregSuggestion } from "@/lib/autoregulation";
import { monotonyStrainFor } from "@/lib/decisionCard";
import { DARK_CARD_BG } from "@/lib/theme";
import CoachPageBg from "@/components/calendar/CoachPageBg";
import HomeTabs, { type HomeTab } from "@/components/today/HomeTabs";
import { CrossInsightBanner, ChargeSection, RecuperationSection, BehaviorImpactCard, TeamAnalyticsList } from "@/components/conseils/HomeAnalyticsSections";
import type { RangeMode } from "@/components/calendar/RangeToggle";
import { computeConseilsData, type ConseilsData } from "@/lib/conseilsData";

/* Modales/drawers ouverts sur demande — même traitement next/dynamic que /week et
   /coach/planning (2026-09-17) : leur JS part dans des chunks séparés, chargés au clic
   plutôt que dans le bundle initial de /coach. */
const CoachSessionModal = dynamic(() => import("@/components/coach/CoachSessionModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));
const InviteModal = dynamic(() => import("@/components/coach/InviteModal"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import type { TrendCode, TrendInput } from "@/lib/trainingLoad";
import { computeWellnessBaselineAt, wellnessSignal, dimensionRaw, DIMENSION_KEYS, DIMENSION_LABELS, relativeWellnessByDate, type WellnessBaselineResult, type DimensionKey } from "@/lib/wellnessBaseline";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus, ExerciseAttachments, WellnessDaily } from "@/types";

interface Props {
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
  /* Sandbox uniquement (2026-08-19) — voir TodayClient.tsx pour le détail du mécanisme. */
  sandboxMode?: boolean;
  sandboxSessionsByDate?: Record<string, CoachViewSession[]>;
}

function greeting() { const h = new Date().getHours(); return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"; }

export default function CoachClient({ coachName, athletes: initialAthletes, todaySessions, today, userId, subscriptionStatus, inviteCode: initialInviteCode, trends, trendInputs = {}, baselines: demoBaselines = {}, wellnessBaselineHistory: initialWellnessBaselineHistory = {}, recentSessions = {}, sandboxMode = false, sandboxSessionsByDate }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { isMd, isLg } = useBreakpoint();
  // Même largeur que le contenu de la page (voir plus bas) — alignement CalendarHeader/sélecteur de
  // sportif/contenu (2026-09-24, "tout n'est pas bien aligné entre la top nav, le sélecteur... et
  // les contenus").
  const coachContentMaxWidth = isLg ? 1180 : isMd ? 720 : 600;
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus);
  const sandboxPaywall = useSandboxGate("coach");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  const dayScrollRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [sessions, setSessions] = useState<CoachViewSession[]>(todaySessions);
  const [athletes, setAthletes] = useState(initialAthletes);
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
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [inviteCode, setInviteCode] = useState<string | null>(initialInviteCode);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showActivation, setShowActivation] = useState(false);

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

  // Scroll horizontal (trackpad) = change de jour avant/après — désactivé si une modale d'édition
  // est ouverte, même garde que les autres pages.
  useHorizontalScrollNav(dayScrollRef, {
    onPrev: () => handleDateChange(format(subDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd")),
    onNext: () => handleDateChange(format(addDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd")),
    enabled: !reviewAthlete && !showInviteModal,
  });

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

  // Score par sportif pour AthleteFilterBar (2026-09-25, fix "les scores... sont faux") — RELATIF
  // dès que la baseline a assez d'historique, exactement le même calcul que `displayScore` sur
  // CoachCard (CoachAthleteCard.tsx) : sans ça, le chip du sélecteur affichait l'absolu brut,
  // différent du chiffre affiché sur la carte du même sportif juste en dessous.
  const filterBarScores: Record<string, number | null> = {};
  for (const a of athletes) {
    const absoluteScore = a.wellnessFilledToday === false ? null : a.wellness_score;
    const baseline = baselines[a.id];
    filterBarScores[a.id] = baseline?.hasEnoughHistory ? baseline.relativeScore : absoluteScore;
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
  function hasSurchargeSuggestion(a: CoachAthlete): boolean {
    const topSession = getTopSession(a.id);
    if (!topSession || topSession.done) return false;
    const wellness = a.wellnessFilledToday === false ? null : a.wellness_score;
    return computeAutoregSuggestion(wellness, topSession.target_difficulty, baselines[a.id])?.dir === "high";
  }

  const priority = athletes.filter(a => {
    const hasSessions = sessions.some(s => s.athlete_id === a.id);
    const { monotonyVal, strainVal } = msFor(a.id);
    return hasSessions && (attention(a, maxDiffToday(a.id, sessions), trends[a.id], baselines[a.id], monotonyVal, strainVal) || hasSurchargeSuggestion(a));
  });
  const stable = athletes.filter(a => {
    const hasSessions = sessions.some(s => s.athlete_id === a.id);
    const { monotonyVal, strainVal } = msFor(a.id);
    return !hasSessions || !(attention(a, maxDiffToday(a.id, sessions), trends[a.id], baselines[a.id], monotonyVal, strainVal) || hasSurchargeSuggestion(a));
  });
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
  const displayedStable = (selectedAthleteId ? stable.filter(a => a.id === selectedAthleteId) : stable).filter(metricOk);

  function getTopSession(athleteId: string): CoachViewSession | null {
    return sessions
      .filter(s => s.athlete_id === athleteId && s.date === selectedDate)
      .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  }

  async function applyAutoregAdjust(athleteId: string, session: CoachViewSession, pct: number) {
    const notes = session.notes ? session.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : session.notes;
    const target_difficulty = adjustDifficulty(session.target_difficulty ?? 6, pct);
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

  /* Contrat autosave (2026-09-26, remplace l'ancien "save = ferme le drawer" — plus de reviewContext
     passé à CoachSessionModal, donc autosave s'active désormais aussi ici, voir openEditor() plus
     haut) : jamais de fermeture ici, persiste silencieusement et retourne l'id pour que les autosaves
     suivants mettent à jour la MÊME ligne au lieu d'en recréer une — même pattern exact que
     saveSession() dans CoachPlanningClient.tsx. */
  async function handleSaveReview(data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, _athleteIds: string[], id?: string) {
    if (!reviewAthlete) return;

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

  const reviewedPriorityCount = sortedPriority.filter(a => reviewedIds.has(a.id)).length;

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
      {!isActive && (
        <UnsavedBanner
          role="coach"
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "coach", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      {/* Fond de page COACH_PAGE_BG (2026-09-25, CoachPageBg.tsx — partagé avec /coach/planning et
         /coach/athletes) : remplace le `bg-bg` clair hérité de (app)/layout.tsx, même technique que
         /today — CalendarHeader n'a plus de fond propre (`seamless` + `theme="light"` pour l'icône
         profil, illisible en blanc sur ce fond clair sinon), déplacé À L'INTÉRIEUR de ce wrapper pour
         que ce seul dégradé peigne le top nav ET le reste de la page en continu. Coach garde son
         principe "page claire + cartes sombres" (CoachCard/DARK_CARD_BG inchangées, voir plus bas) —
         seule la page elle-même s'enrichit d'un glow orange marque au lieu d'un aplat #f1f0ee. */}
      <CoachPageBg>
      <CalendarHeader
        mode="day" contentMaxWidth={coachContentMaxWidth} seamless theme="light"
        selectedDate={selectedDate} onDateChange={handleDateChange} onProfileClick={() => setProfileOpen(true)}
        showRings={!!selectedAthleteForRings} dotMap={headerDotMap} wellnessMap={headerWellnessMap}
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="coach" />}
      <AthleteFilterBar athletes={athletes} selectedId={selectedAthleteId} onSelect={selectAthleteFilter} contentMaxWidth={coachContentMaxWidth} scores={filterBarScores} />
      {athletes.length > 0 && (
        <div style={{ maxWidth: isLg ? 1180 : isMd ? 720 : 600, margin: "0 auto", padding: isLg ? "0 40px" : isMd ? "0 24px" : "0 16px" }}>
          <HomeTabs active={homeTab} onChange={setHomeTab} dark={false} />
        </div>
      )}

      {/* Cartes sombres inchangées (CoachCard/DARK_CARD_BG plus bas) — 2026-09-24, clarification
         explicite de Gildas : "côté coach... ça affiche les cartes des sportifs avec bg light, cards
         dark comme le poc". Layout élargi à 1180px (au lieu de 1000) — même largeur que `.shell` du
         POC, pour que le carrousel 3 colonnes ait la place de respirer. */}
      <div ref={dayScrollRef} style={{ padding: isLg ? "20px 40px 100px" : isMd ? "18px 24px 100px" : "16px 16px 100px", maxWidth: isLg ? 1180 : isMd ? 720 : 600, margin: "0 auto" }}>

        {homeTab === "today" && (
        <>
        {/* ── Welcome overlay handled below ── */}

        {/* ── Bandeau d'activation coach (J0) ── */}
        {showActivation && inviteCode && (
          <div data-tour="activation-banner" style={{ background: "#fff", borderRadius: 24, padding: "18px 18px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.08)", border: "1px solid rgba(212,64,0,.14)", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>
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
                onClick={() => {
                  posthog.capture("activation_banner_cta_clicked", { mode: "coach", cta_type: "copy_link" });
                  navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                  localStorage.setItem(`activation_shown_coach_${userId}`, "1");
                  setShowActivation(false);
                }}
                style={{ flex: 1, height: 42, borderRadius: 12, background: linkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)", transition: "background .2s" }}
              >
                {linkCopied ? "✓ Lien copié !" : "📋 Copier le lien"}
              </button>
              <button
                onClick={() => {
                  posthog.capture("activation_banner_cta_clicked", { mode: "coach", cta_type: "whatsapp" });
                  const msg = encodeURIComponent(`Salut ! Rejoins mon espace ThePerfClub ici : https://go.theperfclub.com/join/${inviteCode}`);
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}
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
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", marginBottom: 8, lineHeight: 1.1 }}>
                  Invite ton premier sportif
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
                  Ton espace est prêt. Partage une invitation pour commencer à suivre la récupération et les séances de tes sportifs.
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 22, padding: 24, boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#171b1f", marginBottom: 12 }}>Email du sportif</div>
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
                  onClick={() => router.push(sandboxMode ? "/sandbox/coach/athletes" : "/coach/athletes")}
                  style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
                >
                  Gérer les sportifs →
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Filtre par métrique (2026-09-24, POC poc-coach-context_4.html, recapHtml()/filterBar()) —
               réservé au mode "Tous" (selectedAthleteId===null, comme dans le POC : mOK/filterBar n'ont
               de sens que pour une vue équipe). Moyenne + "N sportifs bas" par dimension, calculées sur
               les seuls sportifs avec une vraie ligne du jour (dayRows) — un sportif démo/sans check-in
               n'entre dans aucune moyenne, plutôt que de fausser silencieusement le chiffre affiché. */}
            {/* Light comme le POC (2026-09-25, retour de Gildas — `.mcard{background:#fff;
               border:1.5px solid #e4e4e7;color:#18181b}`, actif `.on{border-color:orange;
               background:#fff7ed}`, jamais une pastille filled). Remplace le 1er jet en gradient
               dark, qui reprenait à tort la convention des cartes CoachCard plutôt que celle du
               POC pour CE composant précis. */}
            {selectedAthleteId === null && (() => {
              const withData = athletes.filter(a => dayRows[a.id] !== null);
              return (
                <div style={{ margin: "13px 0 4px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${DIMENSION_KEYS.length + 1}, 1fr)`, gap: 8, overflowX: "auto" }}>
                    {DIMENSION_KEYS.map(dim => {
                      const withDim = withData;
                      const avg = withDim.length ? withDim.reduce((t, a) => t + dimensionRaw(dayRows[a.id]!, dim), 0) / withDim.length : null;
                      const low = withDim.filter(a => dimensionRaw(dayRows[a.id]!, dim) < 5).length;
                      const active = metricFilter === dim;
                      return (
                        <button
                          key={dim}
                          onClick={() => setMetricFilter(active ? null : dim)}
                          style={{
                            textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "10px 11px",
                            background: active ? "#fff7ed" : "#fff",
                            border: active ? "1.5px solid #d44000" : "1.5px solid #e4e4e7",
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#71717a" }}>
                            {DIMENSION_LABELS[dim]}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 20, fontWeight: 700, color: "#18181b", letterSpacing: "-0.02em", marginTop: 2 }}>
                            {avg !== null ? avg.toFixed(1).replace(".", ",") : "—"}
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#71717a" }}>/10</span>
                          </div>
                          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, marginTop: 3, color: low > 0 ? "#dc2626" : "#16a34a" }}>
                            {low > 0 ? `${low} sportif${low > 1 ? "s" : ""} bas` : "Tous OK"}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setShowInviteModal(true)}
                      style={{
                        textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "10px 11px",
                        background: "linear-gradient(120deg,#fff7ed,#fff)", border: "1.5px solid #fed7aa",
                        display: "flex", flexDirection: "column", justifyContent: "center",
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#71717a" }}>
                        {athletes.length} sportif{athletes.length > 1 ? "s" : ""}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#d44000", marginTop: 6 }}>
                        + Inviter →
                      </div>
                    </button>
                  </div>
                  {metricFilter && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#52525b" }}>
                      Filtre : <b style={{ color: "#171b1f" }}>{DIMENSION_LABELS[metricFilter]} bas</b>
                      <button
                        onClick={() => setMetricFilter(null)}
                        style={{ background: "#e4e4e7", border: "none", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#18181b", cursor: "pointer" }}
                      >
                        Effacer ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ margin: "13px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 9 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#1f2428" }}>À décider maintenant</div>
                </div>
                {sortedPriority.length > 0 && reviewedPriorityCount > 0 && reviewedPriorityCount < sortedPriority.length && (
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, color: "#d44000", flexShrink: 0 }}>
                    {reviewedPriorityCount}/{sortedPriority.length} traités
                  </div>
                )}
              </div>
              {/* Carrousel horizontal — TOUJOURS, y compris sur desktop (2026-09-24, retour explicite
                 de Gildas, "le carrousel coach control doit aussi être présent en desktop", fidèle au
                 POC `.queue-carousel` : `@media(min-width:900px){.card{flex:0 0 calc((100% - 32px)/3)}}`
                 — 3 cartes visibles à la fois sur desktop plutôt qu'une grille figée à 2, le scroll
                 horizontal reste disponible au-delà). */}
              {displayedPriority.length > 0 ? (
                <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "0 16px 4px", scrollbarWidth: "none" as const }}>
                  {displayedPriority.map((a, idx) => (
                    <div key={a.id} style={{ flex: isLg ? "0 0 calc((100% - 32px)/3)" : "0 0 min(340px,85vw)", scrollSnapAlign: "start" }}>
                      <CoachCard athlete={a} sessions={sessions} isPriority={true}
                        isReviewed={reviewedIds.has(a.id)}
                        tourId={idx === 0 ? "coach-card-alert" : undefined}
                        trend={trends[a.id]}
                        trendInput={trendInputs[a.id]}
                        baseline={baselines[a.id]}
                        recentSessions={recentSessions[a.id]}
                        coachName={coachName ?? "Coach"}
                        isActive={isActive}
                        onDecide={() => openEditor(a)}
                        onApplyAdjust={(session, pct) => requireSubscription(() => applyAutoregAdjust(a.id, session, pct))}
                        onUndoAdjust={(session, original) => requireSubscription(() => undoAutoregAdjust(a.id, session, original))}
                        onAutoregDecided={() => markAutoregDecided(a.id)}
                        onAutoregUndone={() => unmarkAutoregDecided(a.id)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background: "#121214", border: "1px dashed rgba(255,255,255,.15)", borderRadius: 16, padding: "18px 16px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.55)" }}>
                  {selectedAthleteId ? "Rien à décider pour ce sportif." : "Aucune décision urgente. L'équipe peut suivre le plan."}
                </div>
              )}
            </div>

            <div style={{ margin: "13px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 9 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#1f2428" }}>Plan cohérent</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr 1fr" : isMd ? "1fr 1fr" : "1fr", gap: 10 }}>
                {displayedStable.length > 0 ? displayedStable.map(a => (
                  <CoachCard key={a.id} athlete={a} sessions={sessions} isPriority={false}
                    isReviewed={false}
                    trend={trends[a.id]}
                    trendInput={trendInputs[a.id]}
                    baseline={baselines[a.id]}
                    recentSessions={recentSessions[a.id]}
                    coachName={coachName ?? "Coach"}
                    isActive={isActive}
                    onDecide={() => openEditor(a)}
                    onApplyAdjust={(session, pct) => requireSubscription(() => applyAutoregAdjust(a.id, session, pct))}
                    onUndoAdjust={(session, original) => requireSubscription(() => undoAutoregAdjust(a.id, session, original))}
                    onAutoregDecided={() => markAutoregDecided(a.id)}
                    onAutoregUndone={() => unmarkAutoregDecided(a.id)} />
                )) : (
                  <div style={{ background: "#121214", border: "1px dashed rgba(255,255,255,.15)", borderRadius: 16, padding: "18px 16px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.55)", gridColumn: isLg ? "1 / -1" : undefined }}>
                    {selectedAthleteId ? "Ce sportif est dans la file « À décider »." : "Tous les sportifs nécessitent une attention aujourd'hui."}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        </>
        )}

        {/* ── Onglets Charge/Récupération/Comportements (2026-09-24, "point 1", partie coach) —
           voir POC `poc-coach-context_6.html`, tabBody()/teamBody() : sportif sélectionné → mêmes
           sections que la propre Accueil du sportif (HomeAnalyticsSections.tsx, identique
           TodayClient.tsx), dans une carte sombre dédiée (Coach = page claire + carte sombre). "Tous"
           → liste classée par sévérité (TeamAnalyticsList), désormais SANS carte enveloppante
           (2026-09-25, retour de Gildas — "je veux pas le background qui entoure la liste des
           cards" : chaque ligne est déjà sa propre carte claire, un 2e cadre autour de la liste
           entière était redondant). ── */}
        {homeTab !== "today" && selectedAthleteId && (() => {
          const a = athletes.find(x => x.id === selectedAthleteId);
          const data = a ? athleteConseilsData[a.id] : undefined;
          if (!a || !data) return null;
          return (
            <div style={{ background: DARK_CARD_BG, border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: 16, boxShadow: "0 12px 34px rgba(0,0,0,.28)" }}>
              {homeTab !== "comportements" && <CrossInsightBanner data={data} isDemoData={!a.user_id} />}
              {homeTab === "charge" && <ChargeSection data={data} rangeMode={rangeMode} onRangeModeChange={setRangeMode} />}
              {homeTab === "recuperation" && <RecuperationSection data={data} rangeMode={rangeMode} onRangeModeChange={setRangeMode} perspective="coach" />}
              {homeTab === "comportements" && <BehaviorImpactCard correlations={data.correlations} filledDays={data.filledDays} />}
            </div>
          );
        })()}
        {homeTab !== "today" && !selectedAthleteId && (
          <TeamAnalyticsList
            rows={athletes.map(a => ({ athlete: a, data: athleteConseilsData[a.id] })).filter((r): r is { athlete: CoachAthlete; data: ConseilsData } => !!r.data)}
            metric={homeTab as "charge" | "recuperation" | "comportements"}
            onSelect={selectAthleteFilter}
          />
        )}

        <div data-tour="invite-section" style={{ marginTop: 16 }}>
          <button
            data-tour="invite-btn"
            onClick={() => setShowInviteModal(true)}
            style={{ width: "100%", height: 46, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}
          >
            + Inviter des sportifs
          </button>
        </div>
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
          onSave={(data, athleteIds, id) => requireSubscription(() => handleSaveReview(data, athleteIds, id))}
          onClose={handleCloseReview}
          onMarkViewed={() => {
            if (!reviewSession) return;
            callSessionAPI({ action: "update", athleteId: reviewAthlete.id, sessionId: reviewSession.id, data: { viewed_by_coach_at: new Date().toISOString() } });
          }}
        />
      )}


      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onLinked={() => router.refresh()}
          inviteCode={inviteCode}
          sandboxMode={sandboxMode}
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
