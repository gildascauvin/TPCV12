"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { notifyOnboardingProgressSoon } from "@/lib/onboardingProgress";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import { DARK_CARD_BG } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { withDeviceScore } from "@/lib/deviceWellnessDb";
import { useDeviceNote } from "@/hooks/useDeviceNote";
import { useFirstDecision } from "@/hooks/useFirstDecision";
import LockedBlur from "@/components/paywall/LockedBlur";
import AnalyticsCollecting, { PhaseCollecting, phaseProgress } from "@/components/conseils/AnalyticsCollecting";
import { analyticsReady } from "@/lib/demoAnalytics";
import { computeWeekOverWeekTrend } from "@/lib/trainingLoad";
import { computeDecisionCard, decisionCardColor, type DecisionDay } from "@/lib/decisionCard";
import PhaseLine from "@/components/calendar/PhaseLine";
import { personalizedBehaviorTip } from "@/lib/conseilsData";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import EmptyDayCard from "@/components/sessions/EmptyDayCard";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { programWeekIndex } from "@/lib/programAssignment";
import ProfileDrawer from "@/components/profile/ProfileDrawer";
import DuplicateModal from "@/components/sessions/DuplicateModal";
import { hasUnseenAttachment } from "@/components/sessions/UnseenDot";
import { DraggableExerciseLine } from "@/components/calendar/DraggablePlanning";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import { RestDecisionRing, DoneDecisionRing, decisionRingState } from "@/components/sessions/DecisionRing";
import ShareButton from "@/components/sessions/ShareButton";
import { computeWellnessBaselineAt, wellnessSignal, wellnessZByDate, relativeWellnessByDate, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import AlertBox from "@/components/calendar/AlertBox";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { applyAutoregDifficulty } from "@/lib/autoregulation";
import { aggregateFor } from "@/lib/metricCards";
import type { Profile, WellnessDaily, Session, SubscriptionStatus, ExerciseAttachments, Program } from "@/types";
import HomeTabs, { type HomeTab } from "@/components/today/HomeTabs";
import { ChargeSection, RecuperationSection } from "@/components/conseils/HomeAnalyticsSections";
import type { RangeMode } from "@/components/calendar/RangeToggle";
import type { ConseilsData } from "@/lib/conseilsData";

const WellnessModal = dynamic(() => import("@/components/wellness/WellnessModal"));
import { PLANNED_RPE, PLANNED_LABEL, type PlannedIntensity } from "@/lib/plannedIntensity";
import { isLive, liveElapsedMs, formatChrono, startLiveSession, openLiveSession, LIVE_SESSION_CHANGED } from "@/lib/liveSession";
const AddSessionModal = dynamic(() => import("@/components/sessions/AddSessionModal"));
const CompleteModal = dynamic(() => import("@/components/sessions/CompleteModal"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));

/* ─── helpers ─── */
/* Jauge de difficulté statique — mêmes paliers/couleurs que la constante de design du projet. */
function DiffGauge({ value, height = 12 }: { value: number | null; height?: number }) {
  if (!value) return null;
  const cls = value >= 8 ? "hard" : value >= 5 ? "moderate" : "easy";
  const bg: Record<string, string> = {
    hard: "linear-gradient(90deg,#ffb5a7,#d44000)",
    moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)",
    easy: "linear-gradient(90deg,#bfeec8,#2f9e44)",
  };
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ width: "100%", height, borderRadius: 999, background: "#e7e4df", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${w}%`, background: bg[cls], transition: "width .22s ease" }} />
    </div>
  );
}

/* ─── Today session card — reste CLAIRE (2026-09-24, redesign "bg dark, plus de card" — voir POC
   `poc-coach-context_4.html`) : le "plus de card" ne s'applique qu'à l'en-tête ring/décision (voir
   plus bas, devenu flush sur le fond sombre de la page) — la carte séance, elle, reste un vrai bloc
   blanc posé SUR ce fond sombre, exactement comme le `.session`/`.ath-session` du POC (jamais
   retiré par `body.ath-dark`, contrairement à `.card`/`.ana-card`) : contraste volontaire, contenu
   actionnable qui doit "ressortir" du fond sombre ambiant. Retour explicite de Gildas : "les
   background des séances doivent rester light (même dans le wellness card, partout)". ─── */
function TodaySessionCard({ session, onComplete, onEdit, previewPct, onReorderExercises, authorName, hideGauge, onStart }: {
  session: Session;
  onComplete: (s: Session) => void;
  /* Séance en direct (2026-10-02) : Démarrer / Reprendre, seulement pour une séance du jour à faire. */
  onStart?: (s: Session) => void;
  onEdit: (s: Session) => void;
  authorName: string;
  /* Décharge/surcharge en cours de sélection ou déjà appliquée (autorégulation) — surligne en
     orange les lignes réellement modifiées, undefined/null partout ailleurs (comportement inchangé). */
  previewPct?: number | null;
  /* Drag & drop des exercices — même composant/geste que /week et /coach/planning
     (DraggableExerciseLine, DraggablePlanning.tsx). DndContext scopé à cette carte (une seule
     séance ici, contrairement au Planning qui en gère plusieurs sur une grille de jours). */
  onReorderExercises: (sessionId: string, fromIdx: number, toIdx: number) => void;
  /* Vrai pour la SEULE séance dont la jauge a été promue en tête de l'onglet (3e itération
     2026-09-29) : son curseur y affiche déjà la difficulté prévue, une DiffGauge ici serait la
     deuxième jauge de la même séance — exactement ce que "la jauge de décision EST la jauge de la
     séance, pas 2 jauges" écartait. Les autres séances du jour (et toute séance terminée, qui
     affiche son RPE réel) gardent la leur. */
  hideGauge?: boolean;
}) {
  const live = isLive(session);
  const isFuture = session.date > format(new Date(), "yyyy-MM-dd");
  const [, setLiveTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLiveTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);
  const exerciseSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function handleExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    const overData = over.data.current as { type?: string; sessionId?: string; index?: number } | undefined;
    if (activeData?.type !== "exercise" || overData?.type !== "exercise" || overData.sessionId !== activeData.sessionId) return;
    onReorderExercises(activeData.sessionId!, activeData.index!, overData.index!);
  }
  const [justDone, setJustDone] = useState(false);
  const prevDoneRef = useRef(session.done);
  useEffect(() => {
    if (!prevDoneRef.current && session.done) {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), 700);
      return () => clearTimeout(t);
    }
    prevDoneRef.current = session.done;
  }, [session.done]);

  return (
    <div
      data-tour="session-card"
      className="mb-2 cursor-pointer"
      style={{
        background: "#fff",
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
        padding: 18, borderRadius: 24,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        animation: justDone ? "sessionDone 0.7s ease" : undefined,
      }}
      onClick={() => onEdit(session)}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
          {session.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <span style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
            background: session.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,0.10)",
            color: session.done ? "#2f9e44" : "#d44000",
          }}>
            {session.done ? "Terminé" : live ? `● En cours · ${formatChrono(liveElapsedMs(session))}` : "Prévu"}
          </span>
          <ShareButton
            resourceType="session"
            buildSnapshot={() => ({
              name: session.name,
              done: session.done,
              difficulty: gaugeValue,
              exercises,
              authorName,
            })}
            title={session.name}
            text={exercises.length ? `${exercises.length} exercice${exercises.length > 1 ? "s" : ""}` : undefined}
          />
        </div>
      </div>

      {/* 2. Single difficulty gauge (no label) — masquée pour la séance dont la jauge de décision a
         été promue en tête de l'onglet, voir `hideGauge`. */}
      {!hideGauge && gaugeValue && (
        <div style={{ marginBottom: 12 }}>
          <DiffGauge value={gaugeValue} height={12} />
        </div>
      )}

      {/* 3. Exercise display list — drag & drop, même composant que /week et /coach/planning */}
      {exercises.length > 0 && (
        <div style={{ marginBottom: 12, border: "1px solid rgba(0,0,0,.075)", borderRadius: 16, overflow: "hidden" }}>
          <DndContext sensors={exerciseSensors} onDragEnd={handleExerciseDragEnd}>
            {exercises.map((ex, i) => {
              const modified = previewPct != null ? parseAndApply(ex, previewPct) : ex;
              const unseen = hasUnseenAttachment(session.exercise_media?.[String(i)], "athlete", session.viewed_by_athlete_at);
              return (
                <DraggableExerciseLine key={i} sessionId={session.id} index={i} text={modified} originalText={ex} unseen={unseen} />
              );
            })}
          </DndContext>
        </div>
      )}

      {/* 4. Résultat (séance faite) : durée et difficulté réelle, sans bouton — un tap dessus rouvre
          la saisie du résultat pour le corriger (2026-10-02). */}
      {session.done && (session.duration || session.rpe) ? (
        <div onClick={e => { e.stopPropagation(); onComplete(session); }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, cursor: "pointer" }}>
          {session.duration ? (
            <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#d44000", letterSpacing: "-0.02em", lineHeight: 1 }}>{session.duration}</div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>MIN</div>
            </div>
          ) : <div />}
          {session.rpe ? (
            <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "9px 8px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#d44000", letterSpacing: "-0.02em", lineHeight: 1 }}>{session.rpe}</div>
              <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>DIFF.</div>
            </div>
          ) : <div />}
        </div>
      ) : session.done ? null : isFuture ? null : (
        /* 5. Actions — aujourd'hui : Démarrer (+ « Déjà faite ? ») ; jour passé : Terminer. Jamais
           sur un jour futur (on ne termine pas une séance qui n'a pas eu lieu). Dupliquer vit
           désormais dans le tiroir d'édition (2026-10-02). */
        <div onClick={e => e.stopPropagation()}>
          {onStart ? (
            <button
              onClick={() => onStart(session)}
              style={{
                width: "100%", height: 46, borderRadius: 16, fontSize: 14, fontWeight: 800, cursor: "pointer", border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 8px 20px rgba(212,64,0,.22)",
              }}
            >
              {live ? "Reprendre la séance" : "▶ Démarrer la séance"}
            </button>
          ) : (
            <button
              data-tour="terminer-btn"
              onClick={() => onComplete(session)}
              style={{
                width: "100%", height: 46, borderRadius: 16, fontSize: 14, fontWeight: 800, cursor: "pointer", border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 8px 20px rgba(212,64,0,.22)",
              }}
            >
              Terminer<span className="tour-lock">🔒</span>
            </button>
          )}
          {onStart && !live && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button onClick={() => onComplete(session)} style={{ border: "none", background: "none", color: "#8a8f94", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                Déjà faite ? Noter le résultat
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─── */
interface Props {
  userId: string;
  profile: Profile;
  initialDate: string;
  initialWellness: WellnessDaily | null;
  initialSessions: Session[];
  subscriptionStatus: SubscriptionStatus;
  hasCoach?: boolean;
  /* Distinct de hasCoach (qui reste "un coach existe", utilisé pour le rattrapage d'invitation
     plus bas) — hasActiveCoach = "ce coach paie", seule condition qui débloque un accès gratuit
     réel désormais (voir src/lib/access.ts, 2026-08-19). */
  hasActiveCoach?: boolean;
  activeProgram?: { start_date: string; name: string; program?: Program } | null;
  /* Sandbox uniquement (2026-08-19) : quand true, remplace usePaywall par useSandboxGate (même
     interface, destination = signup au lieu de priming/paywall) et neutralise les effets qui
     rafraîchiraient les données via Supabase (le fixture initial couvre déjà toute la fenêtre
     navigable, voir sandboxWellnessByDate). Aucun impact sur l'app réelle (prop absente partout
     ailleurs). */
  sandboxMode?: boolean;
  sandboxWellnessByDate?: Record<string, WellnessDaily>;
  /* Historique wellness (~21j glissants avant `initialDate`) pour la baseline personnelle (Z-score,
     src/lib/wellnessBaseline.ts) — fetché une fois côté serveur (today/page.tsx). Filtré ici sur
     `date < selectedDate` avant d'être passé à computeWellnessBaselineAt() ; en cas de navigation
     vers un autre jour que celui du chargement de page, la fenêtre n'est pas re-fetchée pour ce
     nouveau jour (limite acceptée — computeWellnessBaselineAt() se dégrade proprement, moins de
     jours disponibles = hasEnoughHistory peut retomber à false plutôt qu'un chiffre faux). Absent
     en sandbox (données synthétiques, pas d'historique réel) — repli cold-start automatique. */
  initialWellnessHistory?: WellnessDaily[];
  /* Sandbox uniquement (2026-09-24, "point 1") — équivalent ConseilsData déjà calculé côté serveur
     (computeConseilsData(), même fixture que /sandbox/athlete/conseils) pour les onglets Charge/
     Récupération/Comportements : évite un fetch réseau (le fixture n'a pas de vrai compte à
     interroger). Absent en app réelle — ces onglets y fetchent /api/conseils à la demande. */
  initialAnalyticsData?: ConseilsData;
}

export default function TodayClient({ userId, profile, initialDate, initialWellness, initialSessions, subscriptionStatus, hasCoach = false, hasActiveCoach = false, activeProgram, sandboxMode = false, sandboxWellnessByDate, initialWellnessHistory = [], initialAnalyticsData }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;
  /* Freemium (2026-09-30) : ce qui entre (check-in, séances) est libre, seule la sandbox (visiteur
     sans compte) garde sa porte d'inscription. Ce qui sort (décision, historique) passe par
     LockedBlur + canDecide plus bas. */
  const gateInput = sandboxMode ? requireSubscription : <T,>(fn: () => T | Promise<T>) => Promise.resolve(fn());
  const unlock = () => setPaywallStep("priming");

  const [selectedDate, setSelectedDate] = useState(initialDate);

  // Onglets Charge/Récupération/Comportements (2026-09-24, "point 1") — même ConseilsData que
  // /conseils ("Performance"), fetchée à la demande (jamais pour un compte qui ne quitte jamais
  // "Aujourd'hui") via le même endpoint GET /api/conseils déjà utilisé par la navigation de date
  // de cette page. En sandbox, le fixture est déjà calculé côté serveur (initialAnalyticsData),
  // aucun fetch réseau.
  const [homeTab, setHomeTab] = useState<HomeTab>("today");
  const [rangeMode, setRangeMode] = useState<RangeMode>("week");
  const [analyticsData, setAnalyticsData] = useState<ConseilsData | null>(sandboxMode ? initialAnalyticsData ?? null : null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  useEffect(() => {
    if (!sandboxMode) setAnalyticsData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, sandboxMode]);
  /* Fetch désormais déclenché dès le montage, plus seulement à l'ouverture d'un onglet analytique
     (2026-09-29) : les miniatures des onglets Charge/Récupération (HomeTabs.tsx) ont besoin des
     agrégats pour se dessiner, et leur raison d'être est justement de signaler au coup d'œil quel
     onglet décroche — absentes à l'arrivée sur la page, elles ne serviraient à rien. Le coût reste
     un `useEffect`, donc après le premier paint : les miniatures apparaissent un instant plus tard,
     rien n'est bloqué. */
  useEffect(() => {
    if (sandboxMode || analyticsData || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetch(`/api/conseils?date=${selectedDate}`)
      .then(res => (res.ok ? res.json() : null))
      .then(fresh => { if (fresh) setAnalyticsData(fresh); })
      .finally(() => setAnalyticsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeTab, selectedDate, sandboxMode, analyticsData, analyticsLoading]);

  const [wellness, setWellness] = useState<WellnessDaily | null>(initialWellness);
  const [allSessions, setAllSessions] = useState<Session[]>(initialSessions);
  // Historique glissant pour la baseline personnelle (Z-score) — ANCRÉ SUR LA SEMAINE AFFICHÉE, pas
  // sur "aujourd'hui" : sans ça, naviguer vers une semaine passée réduit progressivement l'historique
  // disponible (la fenêtre initiale ne couvrait que les 21j avant AUJOURD'HUI) jusqu'à retomber sous
  // le seuil minimal et afficher à tort l'ancien libellé absolu malgré des mois de données réelles
  // (bug réel signalé par Gildas). Refetchée à chaque changement de semaine, fenêtre = 21j avant le
  // LUNDI de la semaine affichée → toujours assez de recul pour n'importe quel jour de cette semaine.
  const [baselineHistory, setBaselineHistory] = useState<WellnessDaily[]>(initialWellnessHistory);

  const prevWeekRef = useRef("");

  // Rattrape une invitation coach en attente pour un compte déjà inscrit (créée après
  // l'onboarding, jamais consommée sinon — /api/invite/link n'était appelé qu'à l'inscription)
  useEffect(() => {
    if (sandboxMode || hasCoach) return;
    fetch("/api/invite/link", { method: "POST" })
      .then(r => r.json())
      .then(d => { if (d.ok) router.refresh(); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recharge wellness + sessions quand on change de semaine — pas en sandbox (le fixture initial
  // couvre déjà toute la fenêtre navigable, voir sandboxFixtures.ts, aucune donnée réelle à aller
  // chercher pour un userId fictif).
  useEffect(() => {
    if (sandboxMode) return;
    const weekStart = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (weekStart === prevWeekRef.current) return;
    prevWeekRef.current = weekStart;
    const dates = Array.from({ length: 7 }, (_, i) => format(addDays(new Date(weekStart + "T12:00:00"), i), "yyyy-MM-dd"));
    const sun = dates[6];
    // 42j (pas WELLNESS_BASELINE_WINDOW_DAYS=21) — sinon ce refetch écrase la fenêtre 42j du 1er
    // rendu serveur dès le 1er montage, avant que la tendance/Z-map (decisionCard.ts) n'ait assez
    // d'historique. Même convention que /conseils/athletesData.ts.
    const sinceBaseline = format(subDays(new Date(weekStart + "T12:00:00"), 42), "yyyy-MM-dd");
    Promise.all([
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", sinceBaseline).lte("date", sun),
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", weekStart).lte("date", sun).order("created_at"),
    ]).then(([{ data: wellData }, { data: sessData }]) => {
      setBaselineHistory((wellData ?? []) as WellnessDaily[]);
      if (sessData) setAllSessions(prev => [...prev.filter(s => s.date < weekStart || s.date > sun), ...(sessData as Session[])]);
    });
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showWellness, setShowWellness] = useState(false);
  const searchParams = useSearchParams();
  /* Checklist d'onboarding : ?checkin=1 (Renseigne ta forme) ouvre le check-in, ?today=1 (Ajuste et
     fais ta séance) ramène sur aujourd'hui — dans les deux cas, la page se recale sur aujourd'hui. */
  useEffect(() => {
    const checkin = searchParams.get("checkin") === "1";
    if (!checkin && searchParams.get("today") !== "1") return;
    const todayIso = format(new Date(), "yyyy-MM-dd");
    if (selectedDate !== todayIso) handleDateChange(todayIso);
    if (checkin) setShowWellness(true);
    router.replace(sandboxMode ? "/sandbox/athlete" : "/today");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [showAddSession, setShowAddSession] = useState(false);
  const [addSessionInitialName, setAddSessionInitialName] = useState<string | undefined>(undefined);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [pendingCompleteSession, setPendingCompleteSession] = useState<Session | null>(null);
  /* Séance en direct : Démarrer sans check-in du jour ouvre d'abord le check-in, puis démarre. */
  const [pendingStartSession, setPendingStartSession] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [autoregPreview, setAutoregPreview] = useState<{ sessionId: string; pct: number } | null>(null);
  /* Nœud des CTA d'ajustement, dans la carte décision (portail d'AutoregButtons, 2026-09-30). */
  const [autoregActionsSlot, setAutoregActionsSlot] = useState<HTMLDivElement | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);


  // Ref pour les closures realtime (évite staleness sur selectedDate)
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // Realtime — sessions + wellness_daily
  useEffect(() => {
    const sessionsCh = supabase
      .channel(`today-sessions-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          const s = payload.new as Session;
          setAllSessions(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s]);
        } else if (payload.eventType === "UPDATE") {
          setAllSessions(prev => prev.map(s => s.id === (payload.new as Session).id ? payload.new as Session : s));
        } else if (payload.eventType === "DELETE") {
          setAllSessions(prev => prev.filter(s => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    const wellnessCh = supabase
      .channel(`today-wellness-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const w = payload.new as WellnessDaily;
          if (w.date === selectedDateRef.current) {
            setWellness(w);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsCh);
      supabase.removeChannel(wellnessCh);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todaySessions = allSessions.filter((s) => s.date === selectedDate);
  const weekStart = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(weekStart + "T12:00:00"), 6), "yyyy-MM-dd");
  const weekSessions = allSessions.filter(s => s.date >= weekStart && s.date <= weekEnd);
  // `base_score` en priorité (jamais `score`, qui inclut le bonus/malus comportements) — voir
  // wellnessSignal() dans wellnessBaseline.ts pour le pourquoi. Nécessaire pour que ce "score du
  // jour" reste comparable à l'historique déjà bâti sur base_score dans wellnessBaseline plus bas.
  const score = wellness ? wellnessSignal(wellness) : null;
  const wellnessFilledToday = wellness !== null && wellness.bedtime != null;
  // Montre (Apple Santé) avant le check-in : affichée dans "Plan à confirmer" pour inviter à le faire.
  const deviceNote = useDeviceNote(userId, selectedDate, !sandboxMode && !wellnessFilledToday);
  /* Plus d'impact fatigue post-séance ici (retiré partout, pas seulement sur ce chart) : le garder
     sur une seule surface créait exactement le type de confusion inter-surfaces ("le score n'est pas
     le même sur /today qu'ailleurs pour le même jour") que toute cette refonte relative vise à
     éliminer — la charge du jour est déjà couverte par la carte décision (decisionCard.ts), qui n'a
     jamais eu besoin de ce mécanisme. `displayScore` = le score du matin, pur, identique partout. */
  const displayScore = wellnessFilledToday ? score : null;
  /* Baseline personnelle (Z-score) — comparée à `displayScore` (score brut du matin), la fenêtre de
     référence (mean/stdDev) restant bâtie sur les scores bruts stockés des jours précédents
     (`baselineHistory`, ancré sur la semaine affichée — voir l'effet de rechargement plus haut). */
  const wellnessBaseline: WellnessBaselineResult | null = wellnessFilledToday
    ? computeWellnessBaselineAt(
        baselineHistory.filter(w => w.date < selectedDate),
        wellness,
      )
    : null;
  /* Chiffre affiché (ring, headline "Score & conseils") — relatif dès que l'historique est
     suffisant, repli exact sur `displayScore` (absolu) sinon. `displayScore` lui-même reste inchangé
     et continue d'alimenter computeAutoregSuggestion()/row() ci-dessous : ces fonctions ont besoin du
     score ABSOLU pour leur garde-fou interne, même quand une baseline pilote déjà le déclenchement
     via le Z (voir wellnessBaseline?.guardRailTriggered). */
  /* Hissé ici (au lieu de recalculé dans l'IIFE plus bas) pour être accessible à la fois par la
     carte "Score & conseils" (halo pulsant sur le CONTOUR de la carte, même mécanisme que Coach
     Control/CoachAthleteCard.tsx — un seul signal de mouvement, pas un 2e sur l'encart interne) et
     par l'encart lui-même. */
  const autoregTargetTop = [...todaySessions].filter(s => !s.done)
    .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  /* Carte décision unifiée (2026-09, decisionCard.ts) — remplace l'ancien row() ad hoc (wellness du
     jour × diff du jour uniquement, pouvait ne rien afficher du tout) par 3 signaux combinés :
     le jour (wellness vs séance prévue), la tendance 7j/7j (même moteur que /conseils), la
     monotonie/contrainte (Foster 1998) — jamais vide, jamais une 4e dimension inventée. `baselineHistory`
     inclut déjà la ligne du jour (fetch inclusif, voir l'effet de rechargement plus haut) : passé tel
     quel, pas filtré, pour que la tendance compte bien le jour courant dans sa semaine "courante". */
  const trendAnchor = new Date(selectedDate + "T12:00:00");
  const { code: trendCode, input: trendInput } = computeWeekOverWeekTrend(
    allSessions, baselineHistory, trendAnchor, wellnessZByDate(baselineHistory, 14, trendAnchor),
  );
  // Conseil récup personnalisé (Impact comportements, conseilsData.ts) — comportement négatif loggué
  // hier uniquement, sinon rien. Passé à computeDecisionCard() comme ligne secondaire PRIORITAIRE
  // (2026-09) — sinon la carte pouvait citer une dimension wellness ("Motivation nettement au-dessus
  // de ta norme") PENDANT que ce conseil parle d'une dimension/un ton différent juste en dessous,
  // incohérent (retour explicite de Gildas). Plus jamais rendu séparément dans le JSX.
  const behaviorTip = wellnessFilledToday ? personalizedBehaviorTip(wellness?.behaviors, baselineHistory, allSessions) : null;
  /* État de la journée pour la ligne Phase (2026-09-29) : séance à faire, faite, ou repos. La séance
     "faite" de référence est la plus dure du jour, comme autoregTargetTop pour la séance à faire. */
  const doneTop = [...todaySessions].filter(s => s.done)
    .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  const phaseTomorrowDate = format(addDays(new Date(selectedDate + "T12:00:00"), 1), "yyyy-MM-dd");
  const tomorrowSessions = allSessions.filter(s => s.date === phaseTomorrowDate);
  const tomorrowDifficulty = tomorrowSessions.length
    ? Math.max(...tomorrowSessions.map(s => s.target_difficulty ?? 0)) : null;
  const decisionDay: DecisionDay = todaySessions.length === 0
    ? { kind: "rest", tomorrowDifficulty }
    : autoregTargetTop
    ? { kind: "planned", tomorrowDifficulty }
    : { kind: "done", rpe: doneTop?.rpe ?? null, planned: doneTop?.target_difficulty ?? null, tomorrowDifficulty };
  const decision = computeDecisionCard({
    day: decisionDay,
    wellnessScore: displayScore,
    plannedDifficulty: autoregTargetTop?.target_difficulty ?? null,
    baseline: wellnessBaseline,
    wellnessFilledToday,
    trendCode,
    trendInput,
    sessions: allSessions,
    anchor: trendAnchor,
    perspective: "athlete",
    behaviorTip,
    deviceNote,
  });
  const decisionColor = decisionCardColor(decision.icon);
  /* Freemium (2026-09-30) : 1re vraie décision (check-in fait + séance à ajuster, sur le jour réel)
     en clair, floutée dès le lendemain pour un compte gratuit. */
  const canDecide = useFirstDecision({
    userId, isActive, initial: profile.first_decision_on, today: initialDate,
    eligible: wellnessFilledToday && !!autoregTargetTop && selectedDate === initialDate,
    enabled: !sandboxMode,
  });
  // Tout le bloc décision, quel que soit le jour affiché ou son état (repos, séance faite, jours passés).
  const decisionLocked = !canDecide;
  /* Message du jour 2 (freemium) : rappelle son jour 1, sans jamais dire dans quel sens irait la
     décision d'aujourd'hui. */
  const lockedSub = (() => {
    const first = profile.first_decision_on;
    if (!first) return "Active l'ajustement pour continuer à ajuster tes séances.";
    const d = new Date(first + "T12:00:00"), y = new Date(initialDate + "T12:00:00"); y.setDate(y.getDate() - 1);
    const when = first === format(y, "yyyy-MM-dd") ? "hier" : `le ${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`;
    return autoregTargetTop
      ? `Comme ${when}, elle croise ton ressenti et ta charge récente pour ajuster ta séance. Active l'ajustement pour la lire.`
      : `Comme ${when}, elle croise ton ressenti et ta charge récente. Active l'ajustement pour la lire.`;
  })();
  /* Freemium v2 (2026-10-02, POC GBoj2wydy4kK8N8skjTAwW) : le jour de la 1re décision, un gratuit voit
     exactement l'écran Premium ; ensuite les analyses sont floutées comme la décision. */
  const historyLocked = decisionLocked && !sandboxMode;
  const chargeReady = !analyticsData || analyticsReady(analyticsData, "charge");
  const recupReady = !analyticsData || analyticsReady(analyticsData, "recup");
  /* Sans assez d'historique (gratuit ou Premium) : la collecte. Les mesures étant gratuites, elles se
     débloquent vraiment au bout, pour tout le monde ; jamais de données d'exemple. */

  /* Jauge de décision — 3e itération (2026-09-29, POC charge-variantes.html) : l'action SORT de la
     carte séance et passe EN TÊTE de l'onglet Aujourd'hui, au-dessus de l'encart insight. C'est la
     décision du jour, pas une propriété de la carte séance ; la carte séance qui suit n'a donc plus
     de jauge à elle. Annule le placement de la 2e itération ("la jauge de décision EST la jauge de
     la séance"), qui la montait dans TodaySessionCard — changement de cap assumé de Gildas.
     Reste propre à /today : Coach Control et Planning gardent la jauge dans leur carte séance. */
  // Montée dès qu'il y a une séance à ajuster, suggestion système ou non (2026-09-25, retour de
  // Gildas — "même quand ya pas de reco, je veux pouvoir bouger la jauge et avoir le range") :
  // dir/reco absents = jauge en mode libre (voir AutoregButtons.tsx).
  const decisionGaugeSlot: React.ReactNode = autoregTargetTop ? (
    <AutoregButtons
      sessionId={autoregTargetTop.id}
      /* Gratuit (2026-10-02) : réglage manuel sans zone ni reco, CTA sous l'anneau (la carte décision
         est floutée) ; c'est une entrée, donc enregistrée. */
      free={decisionLocked}
      onSetDifficulty={async (target_difficulty) => {
        const { data: saved } = await supabase.from("sessions").update({ target_difficulty }).eq("id", autoregTargetTop.id).select().single();
        if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
      }}
      dir={decisionLocked ? undefined : decision.suggestion?.dir}
      reco={decisionLocked ? undefined : decision.suggestion?.reco}
      advice=""
      plannedDifficulty={autoregTargetTop.target_difficulty ?? 6}
      sessionLabel={autoregTargetTop.name}
      variant="dark"
      shape="ring"
      actionsSlot={decisionLocked ? undefined : autoregActionsSlot}
      severityColor={decision.suggestion && !decisionLocked ? decisionColor : undefined}
      isActive={canDecide || decisionLocked}
      onPreviewChange={pct => setAutoregPreview(pct != null ? { sessionId: autoregTargetTop.id, pct } : null)}
      onApply={async (pct) => {
        /* Aperçu (onPreviewChange) reste libre — seule la persistance de la décision
           est gatée (voir chantier gating save, 2026-08-19). isActive vient
           directement de usePaywall() : requireSubscription() ne peut pas envelopper
           ce callback, qui doit retourner `original` pour le mécanisme "Annuler". */
        if (!canDecide) { setPaywallStep("priming"); return; }
        const original = { notes: autoregTargetTop.notes, target_difficulty: autoregTargetTop.target_difficulty };
        const notes = autoregTargetTop.notes ? autoregTargetTop.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : autoregTargetTop.notes;
        const target_difficulty = applyAutoregDifficulty(autoregTargetTop.target_difficulty ?? 6, pct);
        const { data: saved } = await supabase.from("sessions").update({ notes, target_difficulty }).eq("id", autoregTargetTop.id).select().single();
        if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
        return original;
      }}
      onUndo={async (original) => {
        if (!original) return;
        const { data: saved } = await supabase.from("sessions").update({ notes: original.notes, target_difficulty: original.target_difficulty }).eq("id", autoregTargetTop.id).select().single();
        if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
      }}
    />
  ) : todaySessions.length === 0 ? (
    /* Jour de repos : l'anneau reste affiché, en lecture seule, dans sa zone (2026-09-30). */
    <div style={{ display: "flex", justifyContent: "center" }}><RestDecisionRing /></div>
  ) : (() => {
    /* Séance(s) déjà faite(s), aujourd'hui ou dans le passé : anneau en lecture seule sur le RPE
       réel de la plus dure (2026-09-30). */
    const doneTop = [...todaySessions].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0];
    return <div style={{ display: "flex", justifyContent: "center" }}><DoneDecisionRing rpe={doneTop.rpe ?? null} planned={doneTop.target_difficulty ?? null} /></div>;
  })();

  useEffect(() => {
    // Par compte (2026-10-01) : une clé par date seule bloquait le check-in d'un nouveau compte
    // ouvert dans le même onglet qu'un autre le même jour (tests, appareil partagé).
    const key = `wellness_prompted_${userId}_${initialDate}`;
    // Freemium (2026-09-30) : le check-in est une entrée, il s'ouvre aussi pour un compte gratuit —
    // c'est lui qui déclenche la 1re décision en clair. Seule la sandbox reste exclue.
    if (
      !sandboxMode &&
      !wellnessFilledToday &&
      !sessionStorage.getItem(key)
    ) {
      sessionStorage.setItem(key, "1");
      setShowWellness(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    if (sandboxMode) {
      setWellness(sandboxWellnessByDate?.[date] ?? null);
      return;
    }
    const [{ data: w }] = await Promise.all([
      supabase.from("wellness_daily").select("*").eq("user_id", userId).eq("date", date).maybeSingle(),
    ]);
    setWellness(w ?? null);
  }


  async function handleStart(session: Session) {
    if (isLive(session)) { openLiveSession(session.id); return; }
    if (!wellnessFilledToday) { setPendingStartSession(session); setShowWellness(true); return; }
    const started = await startLiveSession(supabase, session);
    if (started) { setAllSessions(prev => prev.map(x => x.id === started.id ? started : x)); openLiveSession(started.id); }
  }
  // La séance en direct est modifiée ailleurs (écran plein, Terminer) : on relit les séances du jour.
  useEffect(() => {
    const onChanged = async () => {
      const { data } = await supabase.from("sessions").select("*").eq("user_id", userId).eq("date", initialDate);
      if (data) setAllSessions(prev => [...prev.filter(x => x.date !== initialDate), ...(data as Session[])]);
    };
    window.addEventListener(LIVE_SESSION_CHANGED, onChanged);
    return () => window.removeEventListener(LIVE_SESSION_CHANGED, onChanged);
  }, [supabase, userId, initialDate]);

  function handleTerminer(session: Session) {
    if (!wellnessFilledToday) {
      setPendingCompleteSession(session);
      setShowWellness(true);
    } else {
      setCompleting(session);
    }
  }

  /* Autosave universel (2026-09-06) — création ET édition, un seul upsert : `id` absent = créer
     (1er autosave d'une séance neuve), `id` fourni = mettre à jour cette même ligne. Ne ferme jamais
     le drawer — c'est `onClose` qui s'en charge, séparément, avec le `router.refresh()`. */
  const saveSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, id?: string) => {
    notifyOnboardingProgressSoon();
    if (id) {
      const { data: saved, error } = await supabase.from("sessions").update(data).eq("id", id).select().single();
      if (error) throw error;
      if (saved) setAllSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
      return saved ? { id: saved.id } : undefined;
    }
    const { data: saved, error } = await supabase
      .from("sessions").insert({ user_id: userId, ...data, done: false }).select().single();
    if (error) throw error;
    if (saved) setAllSessions((prev) => [...prev, saved as Session]);
    return saved ? { id: saved.id } : undefined;
  }, [supabase, userId]);

  const saveWellness = useCallback(async (data: {
    sleep: number; stress: number; recovery: number; motivation: number;
    behaviors: string[]; bedtime: string; base_score: number; score: number;
    plannedIntensity?: PlannedIntensity | null;
  }) => {
    notifyOnboardingProgressSoon();
    const { plannedIntensity, ...wellnessData } = data;
    data = wellnessData;
    // Montre (Apple Santé via l'app iOS) : sommeil mesuré + FC au repos du jour intégrés au score s'ils existent.
    const payload = await withDeviceScore(supabase, userId, selectedDate, data);
    const { data: saved } = await supabase
      .from("wellness_daily")
      .upsert({ user_id: userId, date: selectedDate, ...payload }, { onConflict: "user_id,date" })
      .select().single();
    if (saved) {
      setWellness(saved as WellnessDaily);
    }
    /* Séance prévue déclarée au check-in (2026-10-01) : une vraie séance, comme une autre, pour que
       la décision du jour existe même sans programme. Repos = rien. */
    if (plannedIntensity && plannedIntensity !== "rest") {
      try {
        await saveSession({ name: `Séance du jour ${PLANNED_LABEL[plannedIntensity]}`, notes: "", date: selectedDate, target_difficulty: PLANNED_RPE[plannedIntensity], exercise_media: {} });
      } catch (e) { console.error("[checkin] séance prévue non créée", e); }
    }
    setShowWellness(false);
    if (pendingStartSession) {
      const toStart = pendingStartSession;
      setPendingStartSession(null);
      const started = await startLiveSession(supabase, toStart);
      if (started) { setAllSessions(prev => prev.map(x => x.id === started.id ? started : x)); openLiveSession(started.id); }
    }
    if (pendingCompleteSession) {
      const pending = pendingCompleteSession;
      setPendingCompleteSession(null);
      setCompleting(pending);
    }
    router.refresh();
  }, [supabase, userId, selectedDate, router, pendingCompleteSession, pendingStartSession, saveSession]);

  const saveComplete = useCallback(async (data: { rpe: number; duration: number }) => {
    notifyOnboardingProgressSoon();
    if (!completing) return;
    const { data: saved } = await supabase
      .from("sessions").update({ done: true, ...data }).eq("id", completing.id).select().single();
    if (saved) setAllSessions((prev) => prev.map((s) => s.id === saved.id ? saved as Session : s));
    setCompleting(null);
    router.refresh();
  }, [supabase, completing, router]);

  const deleteSession = useCallback(async (session: Session) => {
    await supabase.from("sessions").delete().eq("id", session.id);
    setAllSessions((prev) => prev.filter((s) => s.id !== session.id));
    router.refresh();
  }, [supabase, router]);

  // Dupliquer une séance — même mécanique que WeekClient.tsx (DuplicateModal, décharge/maintien/
  // surcharge), déclenchée depuis "⎘ Dupliquer" du tiroir de séance.
  const [duplicating, setDuplicating] = useState<Session | null>(null);
  // "↻ Reconduire" du bandeau programme : même modale, date par défaut = même jour la semaine suivante.
  const [duplicateDefaultDate, setDuplicateDefaultDate] = useState<string | undefined>(undefined);
  // Libellé "Séances libres" par semaine (clé = lundi), même stockage que /week.
  const [freeLabels, setFreeLabels] = useState<Record<string, string>>((profile.free_training_label as Record<string, string> | null) ?? {});
  async function setFreeLabelForWeek(mondayStr: string, label: string) {
    const value = label.trim();
    const next = { ...freeLabels };
    if (value) next[mondayStr] = value; else delete next[mondayStr];
    setFreeLabels(next);
    if (sandboxMode) return;
    const { error } = await supabase.from("profiles").update({ free_training_label: next }).eq("user_id", userId);
    if (error) console.error("[today] free_training_label update error:", error);
  }
  const duplicateSession = useCallback(async (newDate: string, pct: number = 0) => {
    notifyOnboardingProgressSoon();
    if (!duplicating) return;
    const notes = duplicating.notes ? duplicating.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : duplicating.notes;
    const target_difficulty = adjustDifficulty(duplicating.target_difficulty ?? 6, pct);
    const { data: saved } = await supabase.from("sessions").insert({
      user_id: userId,
      name: duplicating.name,
      notes,
      date: newDate,
      target_difficulty,
      done: false,
    }).select().single();
    if (saved) setAllSessions((prev) => [...prev, saved as Session]);
    setDuplicating(null);
    router.refresh();
  }, [supabase, userId, duplicating, router]);

  // Réordonner les exercices d'une séance par drag & drop — même mécanique que WeekClient.tsx
  // (reorderExercises), pour que /today utilise le même composant/geste que le Planning.
  const reorderTodayExercises = useCallback(async (sessionId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const target = allSessions.find(s => s.id === sessionId);
    if (!target || !target.notes) return;
    const lines = target.notes.split("\n").filter(Boolean);
    if (fromIdx < 0 || fromIdx >= lines.length || toIdx < 0 || toIdx >= lines.length) return;
    const [moved] = lines.splice(fromIdx, 1);
    lines.splice(toIdx, 0, moved);
    const newNotes = lines.join("\n");
    const prevNotes = target.notes;
    setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: newNotes } : s));
    const { error } = await supabase.from("sessions").update({ notes: newNotes }).eq("id", sessionId);
    if (error) setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: prevNotes } : s));
  }, [supabase, allSessions]);

  // Agrandi (2026-09-24) — la zone ("Fatigué"...) vit désormais DANS le ring (plus de gros libellé
  // séparé en dessous, plus d'eyebrow "Score & conseils" au-dessus) : le ring redevient le seul
  // readout de ce bloc, il peut/doit prendre plus de place — même principe que CoachCard, à une
  const pad = isLg ? 32 : isMd ? 24 : 16;
  // Même largeur que le contenu ci-dessous — alignement CalendarHeader/
  // contenu (2026-09-24, "tout n'est pas bien aligné entre la top nav... et les contenus").
  const contentMaxWidth = isLg ? 1000 : isMd ? 720 : undefined;

  // Rings + points de séance dans le calendrier popup (2026-09-24, POC datepicker) — /today est
  // toujours un contexte "un seul sportif" (soi-même), showRings reste donc vrai en permanence ici
  // (contrairement au coach, qui ne l'active que filtré sur un athlète précis). dotMap couvre tout
  // l'historique réel (allSessions n'est jamais borné par date, cf. page.tsx) ; wellnessMap couvre
  // les ~42 derniers jours (baselineHistory) + aujourd'hui — un mois plus ancien affichera des
  // jours nus, dégradation déjà documentée comme acceptable.
  const DOT_RANK: Record<"planned" | "done-light" | "done-med" | "done-high", number> = { planned: 0, "done-light": 1, "done-med": 2, "done-high": 3 };
  const headerDotMap = allSessions.reduce<Record<string, "done-light" | "done-med" | "done-high" | "planned">>((map, s) => {
    let cls: "done-light" | "done-med" | "done-high" | "planned";
    if (s.done) {
      const diff = s.rpe ?? s.target_difficulty ?? 5;
      cls = diff >= 8 ? "done-high" : diff >= 5 ? "done-med" : "done-light";
    } else {
      cls = "planned";
    }
    if (!map[s.date] || DOT_RANK[cls] > DOT_RANK[map[s.date]]) map[s.date] = cls;
    return map;
  }, {});
  // Score RELATIF, pas absolu (2026-09-25, fix — "les wellness ring dans le calendar expanded sont
  // fausses") : toutes les autres rings de l'app affichent relativeScore (Z-score vs norme perso)
  // depuis le chantier "Wellness relatif", relativeWellnessByDate() est le seul point qui le calcule.
  const headerWellnessMap = relativeWellnessByDate(
    wellness ? [...baselineHistory, wellness] : baselineHistory,
    45,
  );

  return (
    <>
      {/* Bannière du haut retirée hors sandbox (onboarding in-app, 2026-10-01) : l'étape "Débloque…"
         de la checklist du header la remplace. En sandbox elle porte la bascule sportif/coach. */}
      {sandboxMode && !isActive && (
        <UnsavedBanner
          role="athlete"
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      {/* Fond sombre plein-page (2026-09-24, redesign "bg dark, plus de card" ; glow cyan repris du
         POC `~/Downloads/app-screen-bg-proposals-v2.html` le 2026-09-25, DARK_CARD_BG) : remplace le
         fond clair `bg-bg` hérité de (app)/layout.tsx sur cette page précise — seule cette page (et
         /conseils) devient dark, le reste de l'app garde son fond clair habituel (voir CLAUDE.md,
         convention établie). `minHeight:"100vh"` pour ne jamais laisser le fond clair de l'ancêtre
         transparaître sous un contenu court.
         CalendarHeader déplacé À L'INTÉRIEUR de ce wrapper (2026-09-25, `seamless`) — il avait avant
         son propre dégradé dark distinct, visible comme une bande séparée au-dessus de ce fond ; en
         `seamless`, il n'a plus de fond propre et ce SEUL dégradé peint continûment le header ET le
         reste de la page, "toute la page qui a le bg" plutôt que 2 fonds dark empilés. */}
      <div style={{
        background: DARK_CARD_BG,
        minHeight: "100vh",
        // (app)/layout.tsx réserve 132px de padding-bottom (clearance bottom nav) SUR L'ANCÊTRE, donc
        // physiquement après ce div peu importe son minHeight — sans ce couple margin/padding négatif,
        // ce padding laisse une bande de fond clair (bg-bg hérité) visible juste au-dessus de la
        // bottom nav flottante. Étend ce fond sombre pour couvrir cette zone au lieu de la laisser
        // apparaître nue.
        marginBottom: -132, paddingBottom: 132,
      }}>
      <CalendarHeader
        mode="day" contentMaxWidth={contentMaxWidth} seamless
        selectedDate={selectedDate} onDateChange={handleDateChange} onProfileClick={() => setProfileOpen(true)}
        showRings dotMap={headerDotMap} wellnessMap={headerWellnessMap}
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="athlete" />}
      <div style={{ padding: `14px ${pad}px 18px`, maxWidth: isLg ? 1000 : isMd ? 720 : "100%", margin: "0 auto" }}>

        <HomeTabs
          active={homeTab}
          onChange={setHomeTab}
          previews={{
            today: decisionRingState(todaySessions, decision.suggestion, autoregPreview && autoregTargetTop && autoregPreview.sessionId === autoregTargetTop.id ? autoregPreview.pct : null),
            /* Onglet en mode exemple → miniature de l'exemple (2026-09-30, Gildas : elle incite au clic,
               et le bandeau "Exemple" de l'onglet dit ensuite ce que c'est). */
            charge: analyticsData && chargeReady ? aggregateFor("charge", analyticsData) : null,
            recuperation: analyticsData && recupReady ? aggregateFor("recup", analyticsData) : null,
          }}
          locked={historyLocked}
          lockedTabs={["today"]}
        />

        {homeTab === "today" && (
        <>
        {/* ── Welcome handled by overlay modal below ── */}


        {/* ── Wellness + séance du jour — "plus de card" (2026-09-24, voir POC `poc-coach-context_4.html`,
            body.ath-dark .card{background:transparent;border:none;padding:0}) : cet en-tête ring/décision
            flotte désormais directement sur le fond sombre de la page (plus de bloc encadré/ombré) — SEULE
            la carte séance imbriquée plus bas (TodaySessionCard) reste un vrai bloc blanc (voir sa doc,
            "les background des séances doivent rester light, même dans le wellness card, partout"). Le
            halo orange décoratif reste, juste plus confiné à un cadre de carte. ── */}
        <div
          data-tour="wellness-card"
          style={{
            position: "relative",
            padding: isMd ? "8px 0 22px" : "4px 0 18px", marginBottom: 4,
            color: "#fff",
          }}
        >
          <div style={{ position: "absolute", right: "-12%", bottom: "-42%", width: 300, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(32px)", pointerEvents: "none" }} />

          {/* Bouton de partage retiré de ce bloc (2026-09-30, Gildas : "ça gêne") — il flottait en
             absolu au-dessus du score, qui n'existe plus ici de toute façon. Le partage du ressenti
             reste possible depuis l'onglet Récupération et les liens /share/[id] déjà émis
             continuent de fonctionner (rien n'a changé côté route ni snapshot). */}

          {/* UNE seule colonne, à toutes les largeurs (2026-09-30, Gildas : "je veux que l'affichage
             desktop soit le même que mobile, pas 2 colonnes, mais la séance dessous"). Remplace les
             2 colonnes côte à côte de md+ (décision à gauche, séance à droite), qui étaient là pour
             éviter un long scroll sur desktop — plus nécessaire depuis que le ring a disparu : la
             colonne de gauche ne contient plus qu'une ligne de ressenti, la jauge et l'insight. */}
          <div style={{ position: "relative", zIndex: 2 }}>
            <div>
              {/* Ring de fraîcheur retirée (2026-09-30) : le score est aperçu dans la miniature
                 de l'onglet Récupération, son détail vit dans cet onglet-là. La ligne "Ressenti du
                 jour ✎ + comportements" qui l'avait remplacée un temps est retirée aussi — la jauge
                 d'ajustement est le seul readout de ce bloc, donc le seul mis en avant.

                 Conséquence connue, signalée à Gildas : il n'y a plus d'entrée vers le formulaire de
                 ressenti quand il est DÉJÀ rempli. Les 3 déclencheurs restants (ouverture auto au
                 premier passage du jour, garde avant de terminer une séance, CTA flouté de la ligne
                 Phase) ne se déclenchent tous que tant qu'il ne l'est pas. */}

              {/* La jauge en tête, SANS encart (2026-09-30, Gildas) : elle se pose directement sur le
                 fond sombre de la page. Forme ronde R2 depuis le 2026-09-30 (DecisionRing.tsx),
                 la barre reste celle des cartes séance de Coach Control et du Planning. */}
              {/* Freemium (2026-09-30) : jauge + carte décision floutées ensemble pour un compte gratuit
                 après son jour 1 (le CTA Maintenir/Appliquer, porté dans la carte, l'est avec). */}
              {/* Freemium (2026-10-02) : les mesures sont gratuites, la décision payante. L'anneau
                  reste net (difficulté prévue seule, sans zone ni sens ; repos et séance faite tels
                  quels), seule la carte décision est floutée. */}
              {decisionGaugeSlot && decisionLocked && (
                <div onClick={e => e.stopPropagation()} style={{ position: "relative", zIndex: 2, marginBottom: 14 }}>
                  {decisionGaugeSlot}
                </div>
              )}
              <LockedBlur
                locked={decisionLocked}
                surface="today_decision"
                onUnlock={unlock}
                title={autoregTargetTop ? "Ta décision du jour est prête" : "Ton analyse du jour est prête"}
                sub={lockedSub}
                radius={16}
              >
              {decisionGaugeSlot && !decisionLocked && (
                <div onClick={e => e.stopPropagation()} style={{ position: "relative", zIndex: 2, marginBottom: 14 }}>
                  {decisionGaugeSlot}
                </div>
              )}

              {/* Carte décision, toujours affichée (2026-09, decisionCard.ts) — jour × tendance ×
                 monotonie/contrainte combinés, le signal le plus sévère gagne. Insight seul ici. */}
              <div style={{ position: "relative", zIndex: 2 }} onClick={e => e.stopPropagation()}>
                {/* Ligne Phase (2026-09-29) : son CTA flouté "Renseigner mon ressenti" remplace
                   l'ancien bouton "Comment tu vas ? →" sous la carte. */}
                <AlertBox
                  variant="darkColor"
                  centered
                  alert={{ border: `${decisionColor}66`, glow: decisionColor, text: decision.text }}
                  /* CTA d'ajustement juste sous le texte de la reco (2026-09-30), puis la ligne Phase. */
                  actions={(autoregTargetTop || decision.phase) ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {autoregTargetTop && <div ref={setAutoregActionsSlot} className="autoreg-slot" />}
                      {/* Pas assez d'historique : phase d'exemple derrière le flou (gratuit), ou
                          collecte (Premium / jour 1). Jamais de mention « Exemple ». */}
                      {decision.phase && analyticsData && (!chargeReady || !recupReady) ? (
                        <PhaseCollecting p={phaseProgress(analyticsData)} />
                      ) : decision.phase && (
                        <PhaseLine
                          phase={decision.phase}
                          onUnlock={() => setShowWellness(true)}
                          onEdit={wellnessFilledToday ? () => setShowWellness(true) : undefined}
                        />
                      )}
                    </div>
                  ) : undefined}
                />
              </div>
              </LockedBlur>
              {decisionLocked && (
                /* Le ressenti reste modifiable (c'est une entrée) ; aucun indice de la décision ne passe. */
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <button onClick={() => setShowWellness(true)} style={{ border: "none", background: "none", cursor: "pointer", color: "rgba(255,255,255,.55)", fontSize: 12, fontWeight: 700 }}>
                    {wellnessFilledToday ? "✎ Modifier mon ressenti" : "Renseigner mon ressenti"}
                  </button>
                </div>
              )}
            </div>

            {/* ── Séance(s) du jour — imbriquée dans la même carte, TOUJOURS en dessous ── */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
              <div id="day-sessions-container">
                {(() => {
                  /* Bandeau programme (onboarding in-app, 2026-10-01) — le même ProgramBanner que le
                     Planning, libellé "Séances libres" éditable par semaine. Programme actif →
                     "Modifier" (Programmes, sur ce programme) ; sinon séance du jour → "Reconduire" ;
                     sinon "Programmes →". */
                  const ap = activeProgram;
                  const prefix = sandboxMode ? "/sandbox/athlete" : "";
                  const monday = format(startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
                  return (
                    <div>
                      <ProgramBanner
                        dark
                        flush
                        hideBars
                        program={ap?.program ?? null}
                        currentWeek={ap ? programWeekIndex(ap.start_date, selectedDate) : -1}
                        onEdit={ap?.program ? () => router.push(`${prefix}/programmes?focus=${ap.program!.id}`) : undefined}
                        reconduireLabel="Reconduire"
                        onReconduire={!ap && todaySessions.length > 0 ? () => {
                          const d = new Date(selectedDate + "T12:00:00"); d.setDate(d.getDate() + 7);
                          setDuplicateDefaultDate(format(d, "yyyy-MM-dd"));
                          setDuplicating(todaySessions[0]);
                        } : undefined}
                        onLibrary={() => router.push(`${prefix}/programmes`)}
                        freeLabel={freeLabels[monday] ?? null}
                        onEditFreeLabel={label => setFreeLabelForWeek(monday, label)}
                      />
                    </div>
                  );
                })()}
                {/* Jour sans séance (onboarding in-app, 2026-10-01) : programme en attente (départ
                   futur, rien cette semaine) → encart d'attente ; sinon carte blanche "Aucune séance
                   aujourd'hui" avec Importer / Séance libre. Plus de séance démo. */}
                {todaySessions.length === 0 && (
                  weekSessions.length === 0 && activeProgram && activeProgram.start_date > initialDate ? (
                    <div style={{ background: "#f8faf3", border: "1px solid rgba(47,158,68,.18)", borderRadius: 16, padding: "18px 16px", marginBottom: 12 }}>
                      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, color: "#2f9e44", marginBottom: 4 }}>
                        Programme en attente
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#171b1f", marginBottom: 6 }}>
                        {activeProgram.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#62686e", lineHeight: 1.5 }}>
                        {(() => {
                          const [, m, d] = activeProgram.start_date.split("-").map(Number);
                          const MONTHS = ["jan.","fév.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
                          return `Tes séances arrivent le ${d} ${MONTHS[m - 1]}. Retrouve ton planning dans l'onglet Planning.`;
                        })()}
                      </div>
                    </div>
                  ) : (
                    <EmptyDayCard
                      onAddFree={() => { setAddSessionInitialName(undefined); setShowAddSession(true); }}
                      onProgram={sandboxMode ? undefined : () => router.push("/programmes")}
                    />
                  )
                )}
                {todaySessions.map((s) => (
                  <TodaySessionCard
                    key={s.id}
                    session={s}
                    onComplete={(s) => handleTerminer(s)}
                    onStart={!sandboxMode && s.date === initialDate && !s.done ? (s) => gateInput(() => handleStart(s)) : undefined}
                    onEdit={(s) => setEditing(s)}
                    previewPct={autoregPreview?.sessionId === s.id ? autoregPreview.pct : null}
                    onReorderExercises={reorderTodayExercises}
                    authorName={profile.name ?? "Toi"}
                    hideGauge={s.id === autoregTargetTop?.id}
                  />
                ))}
                {/* Rattachée à la pile des séances du jour, même traitement que DayColumn.tsx
                   (Planning) — "'ajouter une séance' doit être dans la carte de séance en bas,
                   comme le planning" (2026-09-24) : plus une boîte flottante séparée sous toute
                   la carte wellness, un continuateur de la même liste. */}
                {todaySessions.length > 0 && (
                  <div
                    data-tour="add-session-btn"
                    onClick={() => { setAddSessionInitialName(undefined); setShowAddSession(true); }}
                    style={{
                      border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff",
                      borderRadius: 24, padding: "9px 8px", textAlign: "center", fontSize: 11,
                      cursor: "pointer", fontWeight: 700, marginTop: todaySessions.length > 0 ? 6 : 0,
                      transition: "all .15s",
                    }}
                  >
                    + Ajouter une séance
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
        )}

        {homeTab !== "today" && (
          analyticsData ? (
            <>
              {homeTab === "charge" && (chargeReady
                ? <ChargeSection data={analyticsData} rangeMode={rangeMode} onRangeModeChange={setRangeMode} lockedHistory={historyLocked ? { onUnlock: unlock } : null} />
                : <AnalyticsCollecting data={analyticsData} group="charge" />)}
              {/* Comportements n'est plus un onglet (2026-09-29) : c'est un déterminant de la
                 récupération, il devient donc le dernier item de ce rapport-là. */}
              {homeTab === "recuperation" && <>
                {recupReady
                  ? <RecuperationSection data={analyticsData} rangeMode={rangeMode} onRangeModeChange={setRangeMode} lockedHistory={historyLocked ? { onUnlock: unlock } : null} />
                  : <AnalyticsCollecting data={analyticsData} group="recup" />}
              </>}
            </>
          ) : (
            <div style={{ color: "rgba(255,255,255,.5)", fontSize: 13, padding: "24px 0" }}>Chargement…</div>
          )
        )}
      </div>
      </div>

      {/* Modals — ouverture et enregistrement libres depuis le freemium (2026-09-30) : ce sont des
          entrées. gateInput() ne bloque plus que la sandbox (visiteur sans compte). */}
      {showWellness && (
        <WellnessModal date={selectedDate} askPlan={selectedDate === initialDate && todaySessions.length === 0} onSave={data => gateInput(() => saveWellness(data))} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); setPendingStartSession(null); }} />
      )}
      {showAddSession && (
        <AddSessionModal date={selectedDate} initialName={addSessionInitialName} userName={profile.name ?? "Toi"} sport={profile.sport} onSave={(data, id) => gateInput(() => saveSession(data, id))} onClose={() => { setShowAddSession(false); setAddSessionInitialName(undefined); router.refresh(); }} />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={data => gateInput(() => saveComplete(data))} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date}
          session={editing}
          sport={profile.sport}
          userName={profile.name ?? "Toi"}
          onSave={(data, id) => gateInput(() => saveSession(data, id ?? editing.id))}
          onDelete={() => gateInput(async () => { await deleteSession(editing); setEditing(null); })}
          onDuplicate={draft => { setDuplicating({ ...editing, ...draft }); setEditing(null); }}
          onClose={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {duplicating && (
        <DuplicateModal
          session={duplicating}
          onDuplicate={(date, _targetAthleteIds, pct) => gateInput(() => duplicateSession(date, pct))}
          defaultDate={duplicateDefaultDate}
          onClose={() => { setDuplicating(null); setDuplicateDefaultDate(undefined); }}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" page="today" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
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
