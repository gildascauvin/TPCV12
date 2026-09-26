"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import DayColumn from "@/components/calendar/DayColumn";
import { DroppableDay, DraggableSessionCard, makePlanningDragEndHandler } from "@/components/calendar/DraggablePlanning";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useHorizontalScrollNav } from "@/hooks/useHorizontalScrollNav";
import type { LoadContext } from "@/lib/loadRule";
import { computeDecisionCard, decisionCardColor } from "@/lib/decisionCard";
import { computeWeekOverWeekTrend } from "@/lib/trainingLoad";
import { personalizedBehaviorTip } from "@/lib/conseilsData";
import { computeWellnessBaselineAt, relativeZoneLabel, relativeWellnessByDate, wellnessSignal, wellnessZByDate, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { pickRelevantAssignment, findProgramForWeek } from "@/lib/programAssignment";
import { programSportEmoji } from "@/lib/sportCategories";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { moveExerciseLine } from "@/lib/exerciseMediaReindex";
import { DARK_CARD_BG } from "@/lib/theme";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import ProgramBanner from "@/components/programs/ProgramBanner";
import ShareButton from "@/components/sessions/ShareButton";

/* Modales/drawers ouverts sur demande (état local, jamais montés au premier rendu) — next/dynamic
   déplace leur JS (dont AddSessionModal → ExerciseBlockEditor 1500+ lignes + dnd-kit d'autocomplete,
   ProgramLibraryPage → ProgramBuilderModal → tout le program builder) dans des chunks séparés,
   chargés seulement au clic plutôt que dans le bundle initial de /week. Même principe déjà en place
   sur /today (2026-07-28) — étendu ici (2026-09-17) sur la 2e page la plus visitée de l'app. */
const AddSessionModal = dynamic(() => import("@/components/sessions/AddSessionModal"));
const CompleteModal = dynamic(() => import("@/components/sessions/CompleteModal"));
const DuplicateModal = dynamic(() => import("@/components/sessions/DuplicateModal"));
const ReconduireModal = dynamic(() => import("@/components/sessions/ReconduireModal"));
const WellnessModal = dynamic(() => import("@/components/wellness/WellnessModal"));
const ProfileDrawer = dynamic(() => import("@/components/profile/ProfileDrawer"));
const PaywallModal = dynamic(() => import("@/components/paywall/PaywallModal"));
const PrimingJourneyModal = dynamic(() => import("@/components/paywall/PrimingJourneyModal"));
const SandboxGateModal = dynamic(() => import("@/components/paywall/SandboxGateModal"));
const ProgramLibraryPage = dynamic(() => import("@/components/programs/ProgramLibraryPage"));
import type { Session, WellnessDaily, SubscriptionStatus, Program, ExerciseAttachments } from "@/types";

/* ─── helpers ─── */
function getWeekDates(base: Date): Date[] {
  const mon = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/* ─── Main ─── */
interface Props { userId: string; userName?: string | null; initialSessions: Session[]; initialWellness: WellnessDaily[]; subscriptionStatus: SubscriptionStatus; hasCoach?: boolean; hasActiveCoach?: boolean; initialDate?: string; sandboxMode?: boolean; initialFreeLabels?: Record<string, string>;
  /* Historique wellness (~42j glissants avant aujourd'hui, indépendant de la semaine affichée) pour
     la baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — carte "Aujourd'hui" uniquement.
     Absent par défaut (sandbox, données synthétiques) = repli cold-start automatique. */
  wellnessBaselineHistory?: WellnessDaily[];
  /* Historique de séances (~42j glissants avant aujourd'hui, indépendant de la semaine affichée) —
     pour la tendance/monotonie de la carte décision unifiée (decisionCard.ts, 2026-09) sur la carte
     "Aujourd'hui". Jamais refetché à la navigation (semaine/mois) : cette carte n'apparaît que dans
     la semaine calendaire réelle, la fenêtre reste donc toujours valable. Absent par défaut = signal
     tendance/monotonie simplement indisponible (repli gracieux). */
  sessionsHistory?: Session[];
}

export default function WeekClient({ userId, userName, initialSessions, initialWellness, subscriptionStatus, hasCoach = false, hasActiveCoach = false, initialDate, sandboxMode = false, initialFreeLabels = {}, wellnessBaselineHistory: initialWellnessBaselineHistory = [], sessionsHistory = [] }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate("athlete");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekBase, setWeekBase] = useState(initialDate ? new Date(initialDate + "T12:00:00") : new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [navKey, setNavKey] = useState(0);
  const slideDirRef  = useRef<"left" | "right">("left");
  const lastWheelNav = useRef(0);
  const weekGridRef  = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [wellnessList, setWellnessList] = useState<WellnessDaily[]>(initialWellness);
  // Historique glissant pour la baseline personnelle (Z-score) — ANCRÉ SUR LA SEMAINE AFFICHÉE, pas
  // sur "aujourd'hui" (même bug/fix que TodayClient.tsx : sans ça, naviguer vers une semaine passée
  // réduit progressivement l'historique disponible jusqu'à retomber à tort sur l'ancien libellé
  // absolu malgré des mois de données réelles). Refetchée dans loadWeek(), remplacée entièrement à
  // chaque semaine (pas de merge/dédup — contrairement à wellnessList, qui reste borné à la semaine
  // affichée pour le rendu des cartes).
  const [wellnessBaselineHistory, setWellnessBaselineHistory] = useState<WellnessDaily[]>(initialWellnessBaselineHistory);
  // Historique COMPLET (pas de filtre de date), dédié au calendrier popup uniquement — jamais
  // refetché à la navigation semaine/mois (2026-09-26, fix : "je n'ai pas toujours tous les
  // wellness rings quand je vais dans le passé"). `wellnessBaselineHistory` ci-dessus est ANCRÉ
  // SUR LA SEMAINE AFFICHÉE (voir loadWeek/loadMonth, `.lte("date", sun)`) — naviguer vers une
  // semaine passée en réduisait donc la fenêtre à "sinceBaseline..sun", laissant tout jour entre
  // cette semaine et aujourd'hui sans aucune donnée pour la ring. Ce 2e état, séparé, ne sert QUE
  // le popup — n'affecte jamais la baseline/tendance calculée ailleurs dans ce fichier.
  // Initialisé sur le même fixture que wellnessBaselineHistory (sandbox : -41/+21j, jamais
  // refetché) — pour un vrai compte, écrasé par le fetch complet ci-dessous dès le montage.
  const [popupWellnessHistory, setPopupWellnessHistory] = useState<WellnessDaily[]>(initialWellnessBaselineHistory);
  const [monthSessions, setMonthSessions] = useState<Session[]>([]);
  const [monthWellness, setMonthWellness] = useState<WellnessDaily[]>([]);
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Session | null>(null);
  const [pendingCompleteSession, setPendingCompleteSession] = useState<Session | null>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  const [duplicating, setDuplicating] = useState<Session | null>(null);
  const [showWellness, setShowWellness] = useState(false);
  // Uniquement le "+" central (quickadd=program) — s'ouvre toujours directement sur le picker de
  // création ("new"), jamais sur l'écran liste (voir ProgramLibraryPage.tsx : la liste n'est plus
  // jamais affichée depuis cette modale, seule /programmes — via la bottom nav — la montre).
  const [showLibrary, setShowLibrary] = useState(false);
  const [showReconduire, setShowReconduire] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [decisionTick, setDecisionTick] = useState(0);
  // Aperçu live de la décharge/surcharge en cours de sélection sur la jauge de décision (2026-09-24,
  // fix — même mécanisme que TodayClient.tsx, manquait ici : la jauge existait déjà en Planning mais
  // ne répercutait jamais son drag sur les lignes d'exercice en dessous).
  const [autoregPreview, setAutoregPreview] = useState<{ sessionId: string; pct: number } | null>(null);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [activeProgramWeek, setActiveProgramWeek] = useState<number>(-1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [activeProgramStartDate, setActiveProgramStartDate] = useState<string | null>(null);
  // Tous les assignments actifs du sportif (il peut en enchaîner plusieurs dans le futur) —
  // sert à trouver quel programme couvre la semaine réellement affichée (navigation),
  // distinct de `activeProgram` ci-dessus qui reste "le programme pertinent aujourd'hui".
  const [activeAssignments, setActiveAssignments] = useState<{ id: string; start_date: string; programs: Program | Program[] | null }[]>([]);
  // Label "Séances libres" — par semaine (clé = lundi "yyyy-MM-dd"), pas global.
  const [freeLabels, setFreeLabels] = useState<Record<string, string>>(initialFreeLabels);

  /* "+" central de la nav (2026-08-31) : ?quickadd=session|program ouvre directement le bon
     flow, puis nettoie l'URL — sinon revenir en arrière rouvrirait la modale. Déps sur
     `searchParams` (pas `[]`) : cliquer le "+" depuis /week lui-même (déjà monté) ne remonte
     pas le composant, un effet à `[]` ne se redéclencherait donc jamais et le clic resterait
     silencieusement sans effet (perçu comme un lag, cf. retour utilisateur). */
  useEffect(() => {
    const quickAdd = searchParams.get("quickadd");
    if (!quickAdd) return;
    if (quickAdd === "session") setAddingDate(todayStr);
    else if (quickAdd === "program") setShowLibrary(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quickadd");
    router.replace(params.toString() ? `/week?${params.toString()}` : "/week");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function fetchActiveProgram() {
    const { data } = await supabase
      .from("program_assignments")
      .select("*, programs(*)")
      .eq("user_id", userId)
      .eq("status", "active");
    setActiveAssignments(data ?? []);
    const picked = pickRelevantAssignment(data ?? []);
    if (picked?.programs) {
      const prog = (Array.isArray(picked.programs) ? picked.programs[0] : picked.programs) as Program;
      setActiveProgram(prog);
      setActiveAssignmentId(picked.id);
      setActiveProgramStartDate(picked.start_date);
      const startDate = new Date(picked.start_date + "T12:00:00");
      const diffMs = Date.now() - startDate.getTime();
      const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
      setActiveProgramWeek(weekIdx >= 0 && weekIdx < prog.weeks_count ? weekIdx : -1);
    } else {
      setActiveProgram(null);
      setActiveProgramWeek(-1);
      setActiveAssignmentId(null);
      setActiveProgramStartDate(null);
    }
  }

  useEffect(() => { if (!sandboxMode) fetchActiveProgram(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref pour les closures realtime (évite staleness sur weekBase)
  const weekBaseRef = useRef(weekBase);
  useEffect(() => { weekBaseRef.current = weekBase; }, [weekBase]);

  // Realtime — sessions + wellness_daily
  useEffect(() => {
    const sessionsCh = supabase
      .channel(`week-sessions-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${userId}` }, (payload) => {
        const base = weekBaseRef.current;
        const mon = format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const sun = format(addDays(startOfWeek(base, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
        if (payload.eventType === "INSERT") {
          const s = payload.new as Session;
          if (s.date >= mon && s.date <= sun) {
            setSessions(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s]);
          }
        } else if (payload.eventType === "UPDATE") {
          setSessions(prev => prev.map(s => s.id === (payload.new as Session).id ? payload.new as Session : s));
        } else if (payload.eventType === "DELETE") {
          setSessions(prev => prev.filter(s => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    const wellnessCh = supabase
      .channel(`week-wellness-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const w = payload.new as WellnessDaily;
          setWellnessList(prev => { const out = prev.filter(x => x.date !== w.date); return [...out, w]; });
          setPopupWellnessHistory(prev => { const out = prev.filter(x => x.date !== w.date); return [...out, w]; });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsCh);
      supabase.removeChannel(wellnessCh);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch unique, indépendant de la navigation — voir le commentaire sur l'état plus haut.
  useEffect(() => {
    if (sandboxMode) return;
    supabase.from("wellness_daily").select("*").eq("user_id", userId).then(({ data }) => {
      if (data) setPopupWellnessHistory(data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const dates = getWeekDates(weekBase);

  async function loadWeek(base: Date) {
    // Sandbox : le fixture initial couvre déjà -41/+21 jours (voir sandboxFixtures.ts) — un
    // refetch réseau écraserait cette fenêtre avec un résultat vide pour un userId fictif.
    if (sandboxMode) return;
    const mon = format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const sun = format(addDays(startOfWeek(base, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
    const sinceBaseline = format(subDays(startOfWeek(base, { weekStartsOn: 1 }), 42), "yyyy-MM-dd");
    const [{ data: s }, { data: w }, { data: bh }] = await Promise.all([
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", mon).lte("date", sun).order("created_at"),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", mon).lte("date", sun),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", sinceBaseline).lte("date", sun),
    ]);
    if (s) setSessions(prev => { const out = prev.filter(x => x.date < mon || x.date > sun); return [...out, ...s]; });
    if (w) setWellnessList(prev => { const out = prev.filter(x => x.date < mon || x.date > sun); return [...out, ...w]; });
    if (bh) setWellnessBaselineHistory(bh);
  }

  async function loadMonth(anchor: string) {
    if (sandboxMode) return;
    const base = new Date(anchor + "T12:00:00");
    // La grille Mois affiche aussi les jours de bord des semaines qui chevauchent le mois
    // (eachWeekOfInterval) — le fetch doit couvrir la même plage, pas le mois strict,
    // sinon les séances de ces jours de bord n'apparaissent jamais.
    const gridStart = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const gridEnd = addDays(startOfWeek(endOfMonth(base), { weekStartsOn: 1 }), 6);
    const start = format(gridStart, "yyyy-MM-dd");
    const end = format(gridEnd, "yyyy-MM-dd");
    const sinceBaseline = format(subDays(gridStart, 42), "yyyy-MM-dd");
    const [{ data: s }, { data: w }, { data: bh }] = await Promise.all([
      supabase.from("sessions").select("*").eq("user_id", userId).gte("date", start).lte("date", end).order("created_at"),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", start).lte("date", end),
      supabase.from("wellness_daily").select("*").eq("user_id", userId).gte("date", sinceBaseline).lte("date", end),
    ]);
    setMonthSessions(s ?? []);
    setMonthWellness(w ?? []);
    if (bh) setWellnessBaselineHistory(bh);
  }

  // Label "Séances libres" valable uniquement pour la semaine dont `mondayStr` est le lundi.
  async function setFreeLabelForWeek(mondayStr: string, label: string) {
    const value = label.trim();
    const next = { ...freeLabels };
    if (value) next[mondayStr] = value; else delete next[mondayStr];
    setFreeLabels(next);
    if (sandboxMode) return;
    await supabase.from("profiles").update({ free_training_label: next }).eq("user_id", userId);
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    const nb = new Date(date + "T12:00:00");
    setWeekBase(nb);
    if (viewMode === "week") loadWeek(nb);
    else loadMonth(date);
  }

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "month") loadMonth(selectedDate);
  }

  function navigatePeriod(dir: "next" | "prev") {
    slideDirRef.current = dir === "next" ? "left" : "right";
    setNavKey(k => k + 1);
    const base = viewMode === "week"
      ? (dir === "next" ? addDays(weekBase, 7) : subDays(weekBase, 7))
      : (dir === "next" ? addMonths(weekBase, 1) : subMonths(weekBase, 1));
    handleDateChange(format(base, "yyyy-MM-dd"));
  }

  // Scroll vers le jour sélectionné (ring du header cliqué, ou "Aujourd'hui" par défaut au montage/
  // changement de semaine — selectedDate vaut todayStr initialement et à chaque navigation).
  useEffect(() => {
    if (viewMode !== "week") return;
    const idx = dates.findIndex(d => format(d, "yyyy-MM-dd") === selectedDate);
    if (idx >= 0) {
      dayRefs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [weekBase, selectedDate, viewMode]);

  useEffect(() => {
    const el = weekGridRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Une modale ouverte (édition/ajout/dupliquer/reconduire/ajustement) ne doit jamais laisser
      // un scroll rapide sur la grille sous-jacente changer de semaine — le contenu affilié à la
      // modale (session référencée par id) devient alors incohérent avec la semaine affichée
      // dessous, provoquant un "saut" visuel de la modale.
      if (addingDate || completing || pendingCompleteSession || editing || duplicating || showReconduire) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaY) < 60) return;
      const now = Date.now();
      if (now - lastWheelNav.current < 600) return;
      lastWheelNav.current = now;
      navigatePeriod(e.deltaY > 0 ? "next" : "prev");
    };
    el.addEventListener("wheel", handler, { passive: true });
    return () => el.removeEventListener("wheel", handler);
  });

  // Scroll horizontal de la grille 7 jours = change de semaine, mais uniquement une fois le scroll
  // interne déjà à son extrémité dans le sens du geste (sinon on navigue simplement entre les jours
  // de la semaine affichée, comme d'habitude) — mêmes gardes que la navigation verticale ci-dessus.
  useHorizontalScrollNav(weekScrollRef, {
    onPrev: () => navigatePeriod("prev"),
    onNext: () => navigatePeriod("next"),
    mode: "boundary",
    enabled: viewMode === "week" && !addingDate && !completing && !pendingCompleteSession && !editing && !duplicating && !showReconduire,
  });

  const saveComplete = useCallback(async (data: { rpe: number; duration: number }) => {
    if (!completing) return;
    const { data: saved } = await supabase.from("sessions").update({ done: true, ...data }).eq("id", completing.id).select().single();
    if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
    setCompleting(null);
    router.refresh();
  }, [supabase, completing, router]);

  /* Autosave universel (2026-09-06) — création ET édition, un seul upsert : `id` absent = créer
     (1er autosave d'une séance neuve), `id` fourni = mettre à jour cette même ligne. Ne ferme jamais
     le drawer — c'est `onClose` qui s'en charge, séparément, avec le `router.refresh()`. */
  const saveSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, id?: string) => {
    if (id) {
      const { data: saved, error } = await supabase.from("sessions").update(data).eq("id", id).select().single();
      if (error) throw error;
      if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
      return saved ? { id: saved.id } : undefined;
    }
    const { data: saved, error } = await supabase.from("sessions").insert({ user_id: userId, ...data, done: false }).select().single();
    if (error) throw error;
    if (saved) setSessions(prev => [...prev, saved as Session]);
    return saved ? { id: saved.id } : undefined;
  }, [supabase, userId]);

  const deleteSession = useCallback(async (session: Session) => {
    await supabase.from("sessions").delete().eq("id", session.id);
    setSessions(prev => prev.filter(s => s.id !== session.id));
    setEditing(null);
    router.refresh();
  }, [supabase, router]);

  const moveSessionToDate = useCallback(async (session: Session, newDate: string) => {
    if (session.date === newDate) return;
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: newDate } : s));
    const { error } = await supabase.from("sessions").update({ date: newDate }).eq("id", session.id);
    if (error) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: session.date } : s));
      return;
    }
    router.refresh();
  }, [supabase, router]);

  /* Déplace une ligne d'exercice — réordonnancement dans la même séance, ou drag cross-séance
     (2026-09-17) : `toSessionId` peut différer de `fromSessionId`, `toIdx: null` = ajout en fin de
     séance cible. `moveExerciseLine` (src/lib/exerciseMediaReindex.ts) recale aussi `exercise_media`
     des deux séances pour que vidéos/photos/commentaires suivent la ligne déplacée. */
  const moveExercise = useCallback(async (fromSessionId: string, fromIdx: number, toSessionId: string, toIdx: number | null) => {
    const sameSession = fromSessionId === toSessionId;
    if (sameSession && toIdx === fromIdx) return;
    const fromSession = sessions.find(s => s.id === fromSessionId);
    const toSession = sameSession ? fromSession : sessions.find(s => s.id === toSessionId);
    if (!fromSession || !toSession) return;
    const result = moveExerciseLine({
      fromNotes: fromSession.notes, fromMedia: fromSession.exercise_media, fromIdx,
      toNotes: toSession.notes, toMedia: toSession.exercise_media, toIdx,
      sameSession,
    });
    if (!result) return;
    const prevFrom = { notes: fromSession.notes, exercise_media: fromSession.exercise_media };
    const prevTo = { notes: toSession.notes, exercise_media: toSession.exercise_media };
    setSessions(prev => prev.map(s => {
      if (s.id === fromSessionId) return { ...s, notes: result.source.notes, exercise_media: result.source.media };
      if (s.id === toSessionId) return { ...s, notes: result.target.notes, exercise_media: result.target.media };
      return s;
    }));
    if (sameSession) {
      const { error } = await supabase.from("sessions").update({ notes: result.source.notes, exercise_media: result.source.media }).eq("id", fromSessionId);
      if (error) setSessions(prev => prev.map(s => s.id === fromSessionId ? { ...s, ...prevFrom } : s));
      return;
    }
    const [r1, r2] = await Promise.all([
      supabase.from("sessions").update({ notes: result.source.notes, exercise_media: result.source.media }).eq("id", fromSessionId),
      supabase.from("sessions").update({ notes: result.target.notes, exercise_media: result.target.media }).eq("id", toSessionId),
    ]);
    if (r1.error || r2.error) {
      setSessions(prev => prev.map(s => {
        if (s.id === fromSessionId) return { ...s, ...prevFrom };
        if (s.id === toSessionId) return { ...s, ...prevTo };
        return s;
      }));
    }
  }, [supabase, sessions]);

  const handleDragEnd = makePlanningDragEndHandler({ sessions, moveSession: moveSessionToDate, moveExercise }) as (event: DragEndEvent) => void;

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const duplicateSession = useCallback(async (newDate: string, pct: number = 0) => {
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
    if (saved) setSessions(prev => [...prev, saved as Session]);
    setDuplicating(null);
    router.refresh();
  }, [supabase, userId, duplicating, router]);

  const saveWellness = useCallback(async (data: {
    sleep: number; stress: number; recovery: number; motivation: number;
    behaviors: string[]; bedtime: string; base_score: number; score: number;
  }) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: saved } = await supabase.from("wellness_daily")
      .upsert({ user_id: userId, date: today, ...data }, { onConflict: "user_id,date" })
      .select().single();
    if (saved) setWellnessList(prev => { const w = prev.filter(x => x.date !== today); return [...w, saved as WellnessDaily]; });
    setShowWellness(false);
    if (pendingCompleteSession) {
      const pending = pendingCompleteSession;
      setPendingCompleteSession(null);
      setCompleting(pending);
    }
  }, [supabase, userId, pendingCompleteSession]);

  function handleTerminer(session: Session) {
    const wellnessTodayFilled = wellnessList.some(w => w.date === todayStr && w.bedtime != null);
    if (session.date === todayStr && !wellnessTodayFilled) {
      setPendingCompleteSession(session);
      setShowWellness(true);
    } else {
      setCompleting(session);
    }
  }

  // Programme + semaine correspondant à la semaine actuellement affichée (navigation) —
  // un sportif pouvant enchaîner plusieurs programmes actifs, celui pertinent pour la
  // semaine affichée n'est pas forcément `activeProgram` (qui reste "pertinent aujourd'hui").
  const viewedMatch = findProgramForWeek(activeAssignments, format(dates[0], "yyyy-MM-dd"));
  const viewedProgram = viewedMatch?.program ?? null;
  const viewedProgramWeek = viewedMatch?.week ?? -1;
  const isViewingCurrentWeek = dates.some(d => format(d, "yyyy-MM-dd") === todayStr);
  // S1 du planning réel visible pour tout le monde, S2+ flouté tant que non abonné — même
  // pattern que ProgramBuilderModal.tsx (weekLocked), étendu ici au vrai planning assigné :
  // "assigner" n'est plus le gate (peut se faire gratuitement pendant le wizard post-signup),
  // le gate est désormais "voir/utiliser le planning complet au quotidien".
  const weekLocked = !isActive && viewedProgramWeek > 0;

  // Rings + points de séance + titre semaine/programme dans le calendrier popup (2026-09-26,
  // "revoir le design du datepicker pour que ça fasse comme la vue mois quand on est dans le
  // planning") — même principe déjà en place sur /today/CoachClient.tsx/CoachPlanningClient.tsx,
  // manquait ici. `sessions` (semaine affichée) ∪ `sessionsHistory` (~42j glissants avant
  // aujourd'hui, jamais refetché à la navigation) pour une couverture de dots plus large qu'une
  // seule semaine ; les jours hors de ces deux fenêtres restent nus (dégradation déjà acceptée
  // ailleurs).
  const DOT_RANK: Record<"planned" | "done-light" | "done-med" | "done-high", number> = { planned: 0, "done-light": 1, "done-med": 2, "done-high": 3 };
  const headerDotMap = [...sessions, ...sessionsHistory].reduce<Record<string, "done-light" | "done-med" | "done-high" | "planned">>((map, s) => {
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
  const headerWellnessMap = relativeWellnessByDate(popupWellnessHistory, 400);
  function weekTitleForPopup(mondayIso: string): string | null {
    const match = findProgramForWeek(activeAssignments, mondayIso);
    if (match) return `${programSportEmoji(match.program.sport)} ${match.program.name} · S${match.week + 1}/${match.program.weeks_count}`;
    return freeLabels[mondayIso] || null;
  }

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          role="athlete"
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "athlete", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      {/* Fond sombre plein-page (2026-09-26, "je veux que toute la page ait la même couleur avec le
         même bg" — même traitement que /today) : CalendarHeader déplacé À L'INTÉRIEUR de ce wrapper
         (`seamless`), qui peint ainsi le header ET tout le reste de la page en continu. Même trick
         marginBottom/paddingBottom que /today (CoachPageBg.tsx) pour étendre ce fond sous la
         clearance bottom nav de 132px réservée par (app)/layout.tsx. */}
      <div style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      <CalendarHeader
        mode="period"
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onProfileClick={() => setProfileOpen(true)}
        showRings dotMap={headerDotMap} wellnessMap={headerWellnessMap}
        weekTitleFor={weekTitleForPopup}
        seamless
      />
      {profileOpen && <ProfileDrawer onClose={() => setProfileOpen(false)} sandboxMode={sandboxMode} sandboxRole="athlete" />}

      <ProgramBanner
        dark
        program={viewedProgram}
        currentWeek={viewedProgramWeek}
        onEdit={viewedProgram ? () => router.push(sandboxMode ? "/sandbox/athlete/programmes" : "/programmes") : undefined}
        onReconduire={() => setShowReconduire(true)}
        freeLabel={freeLabels[format(dates[0], "yyyy-MM-dd")] ?? null}
        onEditFreeLabel={label => setFreeLabelForWeek(format(dates[0], "yyyy-MM-dd"), label)}
        /* Sportif→coach "comme un programme claimé" (2026-09-13, voir CLAUDE.md) — absent en
           sandbox (aucun vrai programme à rendre public). getShareUrl garantit is_public=true
           avant de renvoyer /p/[id], même logique que shareProgram() dans ProgramLibraryPage.tsx. */
        inviteCoachAction={!sandboxMode && viewedProgram ? (
          <ShareButton
            title="Hey coach, regarde le programme que j'ai fait avec ThePerfClub, viens me l'ajuster !"
            getShareUrl={async () => {
              if (!viewedProgram.is_public) {
                await fetch(`/api/programs/${viewedProgram.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ is_public: true }),
                });
              }
              return `${window.location.origin}/p/${viewedProgram.id}`;
            }}
          />
        ) : undefined}
      />

      {activeProgram && activeProgramWeek === -1 && activeProgramStartDate
        && new Date(activeProgramStartDate + "T12:00:00").getTime() > Date.now()
        && isViewingCurrentWeek && (
        <div style={{ margin: isMd ? "14px 20px 0" : "14px 14px 0" }}>
          <div style={{
            textAlign: "center", padding: "28px 20px",
            border: "0.5px dashed rgba(212,64,0,.28)",
            borderRadius: 20, background: "#fff",
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "#171b1f", marginBottom: 4, letterSpacing: "-0.02em" }}>
              Ta semaine 1 démarre lundi
            </div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>
              {activeProgram.name} t&apos;attend.
            </div>
            <button
              onClick={() => navigatePeriod("next")}
              style={{
                width: "100%", height: 48, borderRadius: 14,
                background: "linear-gradient(180deg,#f04a08,#d44000)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 900,
                cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)",
              }}
            >
              Voir la semaine 1 →
            </button>
          </div>
        </div>
      )}

      <div ref={weekGridRef} data-tour="week-sessions">
        <div key={`cal-${navKey}`} style={{
          animation: navKey > 0
            ? `${slideDirRef.current === "left" ? "calSlideFromRight" : "calSlideFromLeft"} 220ms ease-out`
            : undefined,
        }}>

      {/* ── Vue semaine ── */}
      {viewMode === "week" && (
        <div style={{ position: "relative" }}>
        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
        <div ref={weekScrollRef} style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
          gap: isMd ? 12 : 10,
          overflowX: "auto",
          padding: isMd ? "14px 20px 18px" : "14px 14px 18px",
          scrollSnapType: "x proximity",
          scrollbarWidth: "thin",
          filter: weekLocked ? "blur(7px)" : "none",
          pointerEvents: weekLocked ? "none" : "auto",
          userSelect: weekLocked ? "none" : "auto",
        }}>
          {dates.map((date, idx) => {
            const dstr = format(date, "yyyy-MM-dd");
            const prevStr = idx > 0 ? format(dates[idx - 1], "yyyy-MM-dd") : null;
            const nextStr = idx < dates.length - 1 ? format(dates[idx + 1], "yyyy-MM-dd") : null;
            const prevSess = prevStr ? sessions.filter(s => s.date === prevStr) : [];
            const nextSess = nextStr ? sessions.filter(s => s.date === nextStr) : [];
            const ctx: LoadContext = {
              prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
              nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.rpe ?? s.target_difficulty ?? 6)) : 0,
            };
            // Carte décision unifiée (2026-09, decisionCard.ts) — uniquement sur la carte "Aujourd'hui",
            // même moteur que /today et Coach Control (jour × tendance 7j/7j × monotonie/contrainte),
            // jamais vide. `sessionsHistory` (≥14j avant aujourd'hui, indépendant de la semaine
            // affichée) alimente la tendance/monotonie ; l'aperçu onboarding n'a jamais de valeur forcée.
            let alert;
            let decisionGaugeNode: React.ReactNode;
            let autoregTargetId: string | null = null;
            if (dstr === todayStr) {
              const todaySessions = sessions.filter(s => s.date === todayStr);
              const wellnessToday = wellnessList.find(w => w.date === todayStr) ?? null;
              const wellnessFilledToday = wellnessToday !== null && wellnessToday.bedtime != null;
              const baseline = wellnessFilledToday
                ? computeWellnessBaselineAt(wellnessBaselineHistory.filter(w => w.date < todayStr), wellnessToday)
                : null;
              const autoregTarget = [...todaySessions].filter(s => !s.done)
                .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
              const trendAnchor = new Date(todayStr + "T12:00:00");
              const { code: trendCode, input: trendInput } = computeWeekOverWeekTrend(
                sessionsHistory, wellnessBaselineHistory, trendAnchor, wellnessZByDate(wellnessBaselineHistory, 14, trendAnchor),
              );
              const behaviorTip = wellnessFilledToday ? personalizedBehaviorTip(wellnessToday?.behaviors, wellnessBaselineHistory, sessionsHistory) : null;
              const decision = computeDecisionCard({
                wellnessScore: wellnessToday ? wellnessSignal(wellnessToday) : null,
                plannedDifficulty: autoregTarget?.target_difficulty ?? null,
                baseline, wellnessFilledToday, trendCode, trendInput,
                sessions: sessionsHistory, anchor: trendAnchor, perspective: "athlete", behaviorTip,
              });
              const severityColor = decisionCardColor(decision.icon);
              alert = { border: `${severityColor}66`, glow: severityColor, text: decision.text };
              if (autoregTarget) {
                autoregTargetId = autoregTarget.id;
                // Jauge de décision montée DIRECTEMENT dans la carte séance ciblée (2026-09, 2e
                // itération — plus de modale AdjustSessionModal pour ce flux : "l'ajustement se fait
                // directement sur la carte", retour de Gildas) — même écriture Supabase que l'ancien
                // onConfirm de la modale, gatée par isActive comme /today/Coach Control. Montée même
                // sans suggestion (2026-09-25, "même quand ya pas de reco, je veux pouvoir bouger la
                // jauge et avoir le range") — dir/reco undefined = mode libre, voir AutoregButtons.tsx.
                decisionGaugeNode = (
                  <AutoregButtons
                    key={`${autoregTarget.id}-${decisionTick}`}
                    sessionId={autoregTarget.id}
                    dir={decision.suggestion?.dir}
                    reco={decision.suggestion?.reco}
                    advice=""
                    plannedDifficulty={autoregTarget.target_difficulty ?? 6}
                    sessionLabel={autoregTarget.name}
                    variant="light"
                    severityColor={decision.suggestion ? severityColor : undefined}
                    isActive={isActive}
                    onPreviewChange={pct => setAutoregPreview(pct != null ? { sessionId: autoregTarget.id, pct } : null)}
                    onMaintenir={() => setDecisionTick(t => t + 1)}
                    onApply={async (pct) => {
                      if (!isActive) { setPaywallStep("priming"); return; }
                      const original = { notes: autoregTarget.notes, target_difficulty: autoregTarget.target_difficulty };
                      const notes = autoregTarget.notes ? autoregTarget.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : autoregTarget.notes;
                      const target_difficulty = adjustDifficulty(autoregTarget.target_difficulty ?? 6, pct);
                      const { data: saved } = await supabase.from("sessions").update({ notes, target_difficulty }).eq("id", autoregTarget.id).select().single();
                      if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
                      setAutoregPreview(null);
                      return original;
                    }}
                    onUndo={async (original) => {
                      if (!original) return;
                      const { data: saved } = await supabase.from("sessions").update({ notes: original.notes, target_difficulty: original.target_difficulty }).eq("id", autoregTarget.id).select().single();
                      if (saved) setSessions(prev => prev.map(s => s.id === saved.id ? saved as Session : s));
                      setAutoregPreview(null);
                      setDecisionTick(t => t + 1);
                    }}
                  />
                );
              }
            }
            // Score + zone relatifs ("Équilibré"...) sur CHAQUE jour de la semaine affichée, pas
            // seulement "Aujourd'hui" — réutilise le même historique déjà rechargé par semaine
            // (wellnessBaselineHistory, voir loadWeek/loadMonth) ; un jour sans historique suffisant
            // retombe silencieusement sur le score/libellé absolus (DayColumn, comportement inchangé).
            // Le ring affiché ici doit rester identique au ring de /today et de CalendarHeader pour
            // le même jour — un seul calcul (computeWellnessBaselineAt), jamais 3 chiffres différents.
            const dayRow = wellnessList.find(w => w.date === dstr) ?? null;
            const dayBaseline = dayRow?.bedtime != null
              ? computeWellnessBaselineAt(wellnessBaselineHistory.filter(w => w.date < dstr), dayRow)
              : null;
            const dayZoneLabel = dayBaseline?.hasEnoughHistory ? relativeZoneLabel(dayBaseline, "athlete") : undefined;
            const dayRelativeScore = dayBaseline?.hasEnoughHistory ? dayBaseline.relativeScore : (dayRow ? wellnessSignal(dayRow) : null);
            return (
              <div key={dstr} ref={el => { dayRefs.current[idx] = el; }}>
              <DroppableDay dstr={dstr}>
              <DayColumn
                date={date}
                sessions={sessions.filter(s => s.date === dstr)}
                wellness={dayRow ? { ...dayRow, score: dayRelativeScore, zoneLabel: dayZoneLabel } : null}
                todayStr={todayStr}
                ctx={ctx}
                alert={alert}
                renderSession={(s) => (
                  <DraggableSessionCard
                    key={s.id}
                    session={s}
                    viewerRole="athlete"
                    onComplete={(sess) => handleTerminer(sess)}
                    onEdit={(sess) => setEditing(sess)}
                    onDuplicate={(sess) => setDuplicating(sess)}
                    decisionGauge={s.id === autoregTargetId ? decisionGaugeNode : undefined}
                    previewPct={autoregPreview?.sessionId === s.id ? autoregPreview.pct : null}
                  />
                )}
                onAddSession={(d) => setAddingDate(d)}
                onComplete={(s) => handleTerminer(s)}
                onEdit={(s) => setEditing(s)}
                onDuplicate={(s) => setDuplicating(s)}
                onWellness={() => setShowWellness(true)}
              />
              </DroppableDay>
              </div>
            );
          })}
        </div>
        </DndContext>
        {weekLocked && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(241,240,238,.55)" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: "20px 22px", maxWidth: 300, textAlign: "center", boxShadow: "0 14px 34px rgba(0,0,0,.14)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", marginBottom: 6, color: "#171b1f" }}>Débloque les semaines suivantes</div>
              <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.5, marginBottom: 14 }}>Ton programme est bien assigné — l&apos;abonnement débloque le reste de ton planning.</div>
              <button onClick={() => requireSubscription(() => {})} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                Débloquer →
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {/* ── Vue mois ── */}
      {viewMode === "month" && (() => {
        const anchor = new Date(selectedDate + "T12:00:00");
        const weeks = eachWeekOfInterval(
          { start: startOfMonth(anchor), end: endOfMonth(anchor) },
          { weekStartsOn: 1 }
        );
        const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
        return (
          <div style={{ padding: isMd ? "14px 20px 100px" : "8px 8px 100px" }}>
            {/* En-têtes colonnes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: 4 }}>
              {dayLabels.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.06em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", paddingBottom: 2 }}>
                  {isMd ? d : d[0]}
                </div>
              ))}
            </div>
            {/* Grille semaines — une mini-bannière programme/label par semaine, façon événement
                multi-jours au-dessus de la ligne (comme un bandeau Google Calendar). */}
            {weeks.map(weekMonday => {
              const mondayStr = format(weekMonday, "yyyy-MM-dd");
              const weekMatch = findProgramForWeek(activeAssignments, mondayStr);
              return (
              <div key={weekMonday.toISOString()} style={{ marginBottom: isMd ? 6 : 4 }}>
                {weekMatch ? (
                  <ProgramBanner compact program={weekMatch.program} currentWeek={weekMatch.week} />
                ) : (
                  <ProgramBanner
                    compact
                    freeLabel={freeLabels[mondayStr] ?? null}
                    onEditFreeLabel={label => setFreeLabelForWeek(mondayStr, label)}
                  />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginTop: 4 }}>
                {Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)).map(date => {
                  const dstr = format(date, "yyyy-MM-dd");
                  const isToday = dstr === todayStr;
                  const inMonth = date.getMonth() === anchor.getMonth();
                  const daySessions = monthSessions.filter(s => s.date === dstr);
                  const wellness = monthWellness.find(w => w.date === dstr) ?? null;
                  /* Score relatif (baseline Z-score), pas absolu — vue Mois oubliée lors de
                     l'unification wellness relatif (2026-08-30/31), seule surface encore sur
                     wellnessSignal() brut alors que loadMonth() fetch déjà wellnessBaselineHistory
                     pour ça (bug réel trouvé par Gildas : ring différent entre header/chart et
                     grille Mois pour le même jour). Même calcul que la vue Semaine ci-dessus
                     (dayRelativeScore) — un seul chiffre, jamais deux. */
                  const monthDayBaseline = wellness?.bedtime != null
                    ? computeWellnessBaselineAt(wellnessBaselineHistory.filter(w => w.date < dstr), wellness)
                    : null;
                  const score = monthDayBaseline?.hasEnoughHistory
                    ? monthDayBaseline.relativeScore
                    : (wellness ? wellnessSignal(wellness) : null);

                  return (
                    <div
                      key={dstr}
                      style={{
                        background: inMonth ? "#fff" : "rgba(255,255,255,.45)",
                        border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,.08)",
                        borderRadius: isMd ? 14 : 10,
                        padding: isMd ? "8px 8px 6px" : "6px 5px 6px",
                        minHeight: isMd ? 100 : 90,
                        opacity: inMonth ? 1 : 0.4,
                        boxShadow: isToday ? "0 4px 14px rgba(212,64,0,.10)" : "0 2px 6px rgba(0,0,0,.04)",
                        display: "flex", flexDirection: "column",
                      }}
                    >
                      {/* Desktop : date + ring côte à côte */}
                      {isMd && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 8, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#8a8f94", letterSpacing: "0.08em", lineHeight: 1.2 }}>
                              {format(date, "EEE", { locale: fr }).slice(0, 3)}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1 }}>
                              {date.getDate()}
                            </div>
                          </div>
                          {score !== null && <PlanningRing score={score} size={44} />}
                        </div>
                      )}

                      {/* Mobile : numéro + ring empilés verticalement, dots dessous */}
                      {!isMd && (
                        <>
                          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1, textAlign: "center", marginBottom: 4 }}>
                            {date.getDate()}
                          </div>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                            {score !== null
                              ? <PlanningRing score={score} size={40} />
                              : <div style={{ width: 40, height: 40 }} />}
                          </div>
                          {daySessions.length > 0 && (
                            <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                              {daySessions.slice(0, 3).map(s => (
                                <div key={s.id} style={{ width: 6, height: 6, borderRadius: "50%", background: s.done ? "#2f9e44" : "#d44000", flexShrink: 0 }} />
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Desktop : séances + bouton ajouter */}
                      {isMd && (
                        <>
                          {daySessions.slice(0, 2).map(s => {
                            const gaugeVal = s.done ? (s.rpe ?? null) : (s.target_difficulty ?? null);
                            return (
                              <div
                                key={s.id}
                                onClick={e => { e.stopPropagation(); setEditing(s); }}
                                style={{ background: "#f7f8f9", borderRadius: 8, padding: "4px 6px", marginBottom: 3, cursor: "pointer" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                    {s.name}
                                  </div>
                                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: s.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.10)", color: s.done ? "#2f9e44" : "#d44000" }}>
                                    {s.done ? "Terminé" : "Prévu"}
                                  </span>
                                </div>
                                <DiffGauge value={gaugeVal} height={5} />
                              </div>
                            );
                          })}
                          {daySessions.length > 2 && (
                            <div style={{ fontSize: 9, color: "#8a8f94", textAlign: "center" }}>+{daySessions.length - 2}</div>
                          )}
                          {inMonth && (
                            <div
                              onClick={e => { e.stopPropagation(); setAddingDate(dstr); }}
                              style={{ marginTop: "auto", border: "0.5px dashed rgba(212,64,0,.28)", borderRadius: 7, textAlign: "center", fontSize: 10, color: "#d44000", cursor: "pointer", fontWeight: 700, padding: "4px 2px" }}
                            >
                              +
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
              );
            })}
          </div>
        );
      })()}

        </div>{/* animation wrapper */}
      </div>{/* weekGridRef */}
      </div>{/* fond sombre plein-page */}

      {/* Modals — ouverture toujours libre (voir onClick plus haut), seule la persistance réelle
          (onSave/onConfirm/onDuplicate/onDelete) est gatée derrière requireSubscription()
          (2026-08-19). */}
      {addingDate && (
        <AddSessionModal date={addingDate} userId={userId} userName={userName ?? "Toi"} onSave={(data, id) => requireSubscription(() => saveSession(data, id))} onClose={() => { setAddingDate(null); router.refresh(); }} />
      )}
      {showReconduire && (
        <ReconduireModal
          daySlots={dates.map(d => ({ sessions: sessions.filter(s => s.date === format(d, "yyyy-MM-dd")) }))}
          onClose={() => setShowReconduire(false)}
          onConfirm={weeksOut => requireSubscription(async () => {
            const inserts = weeksOut.flatMap((rows, w) => rows.map(r => ({
              user_id: userId,
              name: r.name,
              notes: r.notes,
              target_difficulty: r.target_difficulty,
              date: format(addDays(dates[r.dayIndex], 7 * (w + 1)), "yyyy-MM-dd"),
              done: false,
            })));
            const { data: saved } = await supabase.from("sessions").insert(inserts).select();
            if (saved) setSessions(prev => [...prev, ...(saved as Session[])]);
            setShowReconduire(false);
            if (inserts.length) handleDateChange(inserts[0].date);
            router.refresh();
          })}
        />
      )}
      {completing && (
        <CompleteModal session={completing} onSave={data => requireSubscription(() => saveComplete(data))} onClose={() => setCompleting(null)} />
      )}
      {editing && (
        <AddSessionModal
          date={editing.date} session={editing} userId={userId} userName={userName ?? "Toi"}
          onSave={(data, id) => requireSubscription(() => saveSession(data, id ?? editing.id))}
          onDelete={() => requireSubscription(() => deleteSession(editing))}
          onClose={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {duplicating && (
        <DuplicateModal session={duplicating} onDuplicate={(date, _targetAthleteIds, pct) => requireSubscription(() => duplicateSession(date, pct))} onClose={() => setDuplicating(null)} />
      )}
      {showWellness && (
        <WellnessModal date={todayStr} onSave={data => requireSubscription(() => saveWellness(data))} onClose={() => { setShowWellness(false); setPendingCompleteSession(null); }} />
      )}
      {showLibrary && (
        <ProgramLibraryPage
          athletes={[]}
          selfUserId={userId}
          activeProgram={activeProgram}
          activeProgramWeek={activeProgramWeek}
          requireSubscription={requireSubscription}
          isActive={isActive}
          sandboxMode={sandboxMode}
          initialStep="new"
          onClose={async () => { setShowLibrary(false); if (!sandboxMode) { await fetchActiveProgram(); router.refresh(); } }}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="athlete" page="week" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
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
