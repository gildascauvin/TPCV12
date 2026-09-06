"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, addDays, subDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval } from "date-fns";
import { fr } from "date-fns/locale";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useHorizontalScrollNav } from "@/hooks/useHorizontalScrollNav";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import UnsavedBanner from "@/components/paywall/UnsavedBanner";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import WelcomeModal from "@/components/onboarding/WelcomeModal";

import CalendarHeader, { type ViewMode } from "@/components/calendar/CalendarHeader";
import PlanningRingShared from "@/components/calendar/PlanningRing";
import DiffGaugeShared from "@/components/calendar/DiffGauge";
import DayColumn from "@/components/calendar/DayColumn";
import { DroppableDay, DraggableSessionCard, makePlanningDragEndHandler } from "@/components/calendar/DraggablePlanning";
import CoachSessionModal from "@/components/coach/CoachSessionModal";
import CoachCompleteModal from "@/components/coach/CoachCompleteModal";
import DuplicateModal from "@/components/sessions/DuplicateModal";
import ReconduireModal from "@/components/sessions/ReconduireModal";
import EmptySessionState from "@/components/sessions/EmptySessionState";
import ProgramLibraryPage from "@/components/programs/ProgramLibraryPage";
import ProgramBanner from "@/components/programs/ProgramBanner";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, SubscriptionStatus, Program, ExerciseAttachments, WellnessDaily } from "@/types";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import { dailyLoad } from "@/lib/trainingLoad";
import { coachAlertFor } from "@/lib/alerts";
import { maxDiffToday } from "@/components/coach/CoachAthleteCard";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AdjustSessionModal, { type AdjustSessionTarget } from "@/components/sessions/AdjustSessionModal";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, setAutoregDecision, suggestionSeverityColor } from "@/lib/autoregulation";
import { pickRelevantAssignment, findProgramForWeek } from "@/lib/programAssignment";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { computeWellnessBaselineAt, relativeZoneLabel, wellnessSignal, WELLNESS_BASELINE_WINDOW_DAYS, type WellnessBaselineResult } from "@/lib/wellnessBaseline";

function dayWellness(
  athlete: CoachAthlete,
  dateStr: string,
  wellnessMap: Record<string, Record<string, number>>,
  demoHistory?: Record<string, WellnessDaily[]>
): number | null {
  if (athlete.user_id) {
    // Vrai sportif : uniquement la ligne wellness_daily réelle de ce jour, jamais de repli
    // sur athlete.wellness_score (denormalisé, peut dater de plusieurs jours).
    return wellnessMap[athlete.user_id]?.[dateStr] ?? null;
  }
  // Démo : historique synthétique déterministe (coachWellnessScoreFor, src/lib/sandboxFixtures.ts —
  // même fonction que /coach et /coach/athletes) si disponible pour ce jour précis ; repli sur le
  // score statique du profil pour les jours hors de la fenêtre construite (ex. futur, jamais
  // synthétisé — même convention que les vrais sportifs, pas de wellness futur).
  const row = demoHistory?.[athlete.id]?.find(w => w.date === dateStr);
  return row ? (row.base_score ?? row.score ?? athlete.wellness_score) : athlete.wellness_score;
}


/* DiffGauge — alias du composant partagé, encore utilisé par la vue mois. */
const DiffGauge = DiffGaugeShared;

interface Props {
  userId: string;
  coachName: string | null;
  athletes: CoachAthlete[];
  initialSessions: CoachViewSession[];
  initialWellnessMap: Record<string, Record<string, number>>;
  subscriptionStatus: SubscriptionStatus;
  initialDate?: string;
  /* Sandbox uniquement (2026-08-19) — voir TodayClient.tsx pour le détail du mécanisme. */
  sandboxMode?: boolean;
  /* Historique wellness pour la baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — clé =
     user_id pour un vrai sportif (~21j glissants avant aujourd'hui), clé = athlete.id pour un
     sportif démo (historique synthétique déterministe, coachWellnessScoreFor — même fonction que
     /coach et /coach/athletes, pas de calcul séparé). Absent/pas d'entrée pour ce jour = repli
     cold-start automatique, comme partout ailleurs. */
  wellnessBaselineHistory?: Record<string, WellnessDaily[]>;
}

export default function CoachPlanningClient({ userId, coachName, athletes, initialSessions, initialWellnessMap, subscriptionStatus, initialDate, sandboxMode = false, wellnessBaselineHistory: initialWellnessBaselineHistory = {} }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMd, isLg } = useBreakpoint();
  useRefreshOnFocus();
  const realPaywall = usePaywall(subscriptionStatus);
  const sandboxPaywall = useSandboxGate("coach");
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const defaultAthleteId = searchParams.get("athlete") ?? athletes[0]?.id ?? "";
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedAthleteId, setSelectedAthleteId] = useState(defaultAthleteId);
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayStr);
  const [navKey, setNavKey] = useState(0);
  const slideDirRef  = useRef<"left" | "right">("left");
  const lastWheelNav = useRef(0);
  const calGridRef   = useRef<HTMLDivElement>(null);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayRefs      = useRef<(HTMLDivElement | null)[]>([]);
  const [sessions, setSessions] = useState<CoachViewSession[]>(initialSessions);
  const [wellnessMap, setWellnessMap] = useState(initialWellnessMap);
  // Historique glissant par sportif pour la baseline personnelle (Z-score) — ANCRÉ SUR LA SEMAINE/
  // LE MOIS AFFICHÉS, pas sur "aujourd'hui" (même bug/fix que WeekClient.tsx/TodayClient.tsx : sans
  // ça, naviguer vers une période passée réduit progressivement l'historique disponible jusqu'à
  // retomber à tort sur l'ancien libellé absolu malgré des mois de données réelles). Refetché dans
  // handleDateChange()/loadMonth(), remplacé entièrement à chaque navigation.
  const [wellnessBaselineHistory, setWellnessBaselineHistory] = useState<Record<string, WellnessDaily[]>>(initialWellnessBaselineHistory);
  const [monthSessions, setMonthSessions] = useState<CoachViewSession[]>([]);
  const [monthWellnessMap, setMonthWellnessMap] = useState<Record<string, Record<string, number>>>({});
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<CoachViewSession | null>(null);
  const [completing, setCompleting] = useState<CoachViewSession | null>(null);
  const [duplicating, setDuplicating] = useState<CoachViewSession | null>(null);
  const [showReconduire, setShowReconduire] = useState(false);
  const [adjustCtx, setAdjustCtx] = useState<{ session: CoachViewSession; dir: "low" | "high"; reco: number; baseline: WellnessBaselineResult | null } | null>(null);
  const [decisionTick, setDecisionTick] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  // Uniquement le "+" central (quickadd=program) — s'ouvre toujours directement sur le picker de
  // création ("new"), jamais sur l'écran liste (voir ProgramLibraryPage.tsx : la liste n'est plus
  // jamais affichée depuis cette modale, seule /coach/programmes — via la bottom nav — la montre).
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeProgram, setActiveProgram] = useState<Program | null>(null);
  const [activeProgramWeek, setActiveProgramWeek] = useState<number>(-1);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [activeProgramStartDate, setActiveProgramStartDate] = useState<string | null>(null);
  // Tous les assignments actifs de l'athlète (il peut en enchaîner plusieurs dans le futur) —
  // sert à trouver quel programme couvre la semaine réellement affichée (navigation).
  const [activeAssignments, setActiveAssignments] = useState<{ id: string; start_date: string; programs: Program | Program[] | null }[]>([]);
  // Label "Séances libres" par semaine (clé = lundi) : édité par le coach ici, ou par le sportif
  // sur /week — valeur de base sur athlete.free_training_label (mergée server-side, page.tsx),
  // override local par athleteId le temps que la donnée serveur se resynchronise.
  const [freeLabelOverrides, setFreeLabelOverrides] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const id = searchParams.get("athlete");
    if (id && athletes.find(a => a.id === id)) setSelectedAthleteId(id);
    // `athletes` volontairement absent des deps : cet effet ne doit resynchroniser la
    // sélection que sur un vrai changement d'URL (?athlete=), jamais quand seule la
    // référence du tableau change (ex. router.refresh() au retour de focus fenêtre) —
    // sinon un clic manuel sur un autre onglet sportif se fait silencieusement écraser.
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fromOnboarding = searchParams.get("welcome") === "1";
    const alreadySeen = localStorage.getItem(`welcome_shown_coach_${userId}`);
    if (fromOnboarding && !alreadySeen) setShowWelcome(true);
  }, [userId, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /* "+" central de la nav (2026-08-31) : ?quickadd=session|program ouvre directement le bon
     flow, puis nettoie l'URL — sinon revenir en arrière rouvrirait la modale. Déps sur
     `searchParams` (pas `[]`) : cliquer le "+" depuis /coach/planning lui-même (déjà monté) ne
     remonte pas le composant, un effet à `[]` ne se redéclencherait donc jamais et le clic
     resterait silencieusement sans effet (perçu comme un lag, cf. retour utilisateur). */
  useEffect(() => {
    const quickAdd = searchParams.get("quickadd");
    if (!quickAdd) return;
    if (quickAdd === "session") setAddingDate(todayStr);
    else if (quickAdd === "program") setShowLibrary(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quickadd");
    router.replace(params.toString() ? `/coach/planning?${params.toString()}` : "/coach/planning");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const athlete = athletes.find(a => a.id === selectedAthleteId) ?? athletes[0] ?? null;

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

  // Fetch active program for selected athlete
  useEffect(() => {
    if (!athlete) { setActiveProgram(null); setActiveProgramWeek(-1); setActiveProgramStartDate(null); setActiveAssignments([]); return; }
    async function fetchAthleteProgram() {
      let q = supabase
        .from("program_assignments")
        .select("*, programs(*)")
        .eq("status", "active");
      if (athlete!.user_id) q = q.eq("user_id", athlete!.user_id);
      else q = q.eq("athlete_id", athlete!.id);
      const { data } = await q;
      setActiveAssignments(data ?? []);
      const picked = pickRelevantAssignment(data ?? []);
      if (picked?.programs) {
        const prog = (Array.isArray(picked.programs) ? picked.programs[0] : picked.programs) as Program;
        setActiveProgram(prog);
        setActiveAssignmentId(picked.id);
        setActiveProgramStartDate(picked.start_date);
        const diffMs = Date.now() - new Date(picked.start_date + "T12:00:00").getTime();
        const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
        setActiveProgramWeek(weekIdx >= 0 && weekIdx < prog.weeks_count ? weekIdx : -1);
      } else {
        setActiveProgram(null); setActiveProgramWeek(-1); setActiveAssignmentId(null); setActiveProgramStartDate(null);
      }
    }
    fetchAthleteProgram();
  }, [athlete?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: sync athlete's sessions and wellness as they change
  useEffect(() => {
    if (!athlete?.user_id) return;
    const uid = athlete.user_id;

    const channel = supabase
      .channel(`coach-watch-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${uid}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const s = realToView(payload.new as Session, athletes);
            if (s.athlete_id) setSessions(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s]);
          } else if (payload.eventType === "UPDATE") {
            const s = realToView(payload.new as Session, athletes);
            setSessions(prev => prev.map(x => x.id === s.id ? { ...s, athlete_id: x.athlete_id } : x));
          } else if (payload.eventType === "DELETE") {
            setSessions(prev => prev.filter(x => x.id !== (payload.old as any).id));
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "wellness_daily", filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.score != null) {
            setWellnessMap(prev => ({
              ...prev,
              [uid]: { ...(prev[uid] ?? {}), [row.date]: row.score },
            }));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [athlete?.user_id]);

  const weekStart = startOfWeek(new Date(selectedDate + "T12:00:00"), { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  async function handleDateChange(date: string) {
    setSelectedDate(date);
    // Sandbox : le fixture initial couvre déjà -14/+14 jours (voir sandboxFixtures.ts) — un
    // refetch réseau écraserait cette fenêtre avec un résultat vide pour un coach_id fictif.
    if (sandboxMode) return;
    // En vue Mois, naviguer (flèches ‹/›) doit recharger `monthSessions` pour le nouveau
    // mois — sinon la grille affiche un mois différent avec les données de l'ancien
    // (jamais rafraîchies par le fetch semaine ci-dessous, qui ignore `viewMode`).
    if (viewMode === "month") {
      if (athlete) await loadMonth(date, athlete);
      return;
    }
    const mon = format(startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const sun = format(addDays(startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
    const sinceBaseline = format(subDays(startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 }), WELLNESS_BASELINE_WINDOW_DAYS), "yyyy-MM-dd");

    const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
    const allAthleteIds = athletes.map(a => a.id);

    const [realRes, coachRes, wellnessRes, baselineRes] = await Promise.all([
      realUserIds.length
        ? supabase.from("sessions").select("*").in("user_id", realUserIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
      allAthleteIds.length
        ? supabase.from("coach_sessions").select("*").eq("coach_id", userId).in("athlete_id", allAthleteIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
      realUserIds.length
        ? supabase.from("wellness_daily").select("user_id, date, score, base_score").in("user_id", realUserIds).gte("date", mon).lte("date", sun)
        : Promise.resolve({ data: [] }),
      realUserIds.length
        ? supabase.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", sinceBaseline).lte("date", sun)
        : Promise.resolve({ data: [] as WellnessDaily[] }),
    ]);

    const newSessions: CoachViewSession[] = [
      ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
      ...(coachRes.data || []).map(s => demoToView(s as CoachSession)),
    ];

    setSessions(prev => {
      const out = prev.filter(s => s.date < mon || s.date > sun);
      return [...out, ...newSessions];
    });

    const newWellness = buildWellnessMap(
      (wellnessRes.data || []) as { user_id: string; date: string; score: number | null; base_score: number | null }[]
    );
    setWellnessMap(prev => {
      const merged = { ...prev };
      for (const uid of Object.keys(newWellness)) {
        merged[uid] = { ...(merged[uid] ?? {}), ...newWellness[uid] };
      }
      return merged;
    });

    const newBaselineHistory: Record<string, WellnessDaily[]> = {};
    for (const row of (baselineRes.data || []) as WellnessDaily[]) {
      (newBaselineHistory[row.user_id] ??= []).push(row);
    }
    setWellnessBaselineHistory(newBaselineHistory);
  }

  const dotMap = (() => {
    if (!athlete) return {};
    const map: Record<string, "done-light" | "done-med" | "done-high" | "planned"> = {};
    weekDates.forEach(d => {
      const dstr = format(d, "yyyy-MM-dd");
      const ds = sessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
      const charge = dailyLoad(ds);
      if (charge > 600) map[dstr] = "done-high";
      else if (charge > 300) map[dstr] = "done-med";
      else if (charge > 0) map[dstr] = "done-light";
      else if (ds.some(s => !s.done)) map[dstr] = "planned";
    });
    return map;
  })();

  async function callSessionAPI(body: object): Promise<{ ok: boolean; session?: any; _real?: boolean }> {
    const res = await fetch("/api/coach/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  const addSession = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, athleteIds: string[]) => {
    const results = await Promise.all(
      athleteIds.map(aid => callSessionAPI({ action: "add", athleteId: aid, data }))
    );
    const newSessions: CoachViewSession[] = results
      .filter(r => r.ok && r.session)
      .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
    setSessions(prev => [...prev, ...newSessions]);
    setAddingDate(null);
  }, [athletes]);

  const saveEdit = useCallback(async (data: { name: string; notes: string; date: string; target_difficulty: number; exercise_media: Record<string, ExerciseAttachments> }, athleteIds: string[]) => {
    if (!editingSession || !athlete) return;
    const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: editingSession.id, data });
    if (result.ok) {
      const updated: CoachViewSession = { ...editingSession, ...data };
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    const extras = athleteIds.filter(id => id !== athlete.id);
    if (extras.length > 0) {
      const results = await Promise.all(extras.map(aid => callSessionAPI({ action: "add", athleteId: aid, data })));
      const newSessions: CoachViewSession[] = results
        .filter(r => r.ok && r.session)
        .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
      setSessions(prev => [...prev, ...newSessions]);
    }
    setEditingSession(null);
  }, [editingSession, athlete, athletes]);

  const deleteSession = useCallback(async () => {
    if (!editingSession || !athlete) return;
    await callSessionAPI({ action: "delete", athleteId: athlete.id, sessionId: editingSession.id });
    setSessions(prev => prev.filter(s => s.id !== editingSession.id));
    setEditingSession(null);
  }, [editingSession, athlete]);

  const completeSession = useCallback(async (data: { rpe: number; duration: number }) => {
    if (!completing || !athlete) return;
    const result = await callSessionAPI({ action: "complete", athleteId: athlete.id, sessionId: completing.id, data });
    if (result.ok) {
      const updated: CoachViewSession = { ...completing, done: true, rpe: data.rpe, duration: data.duration };
      setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    }
    setCompleting(null);
  }, [completing, athlete]);

  const moveSessionToDate = useCallback(async (session: CoachViewSession, newDate: string) => {
    if (session.date === newDate || !athlete) return;
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: newDate } : s));
    const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: session.id, data: { date: newDate } });
    if (!result.ok) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, date: session.date } : s));
  }, [athlete]);

  const reorderExercises = useCallback(async (sessionId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !athlete) return;
    const target = sessions.find(s => s.id === sessionId);
    if (!target || !target.notes) return;
    const lines = target.notes.split("\n").filter(Boolean);
    if (fromIdx < 0 || fromIdx >= lines.length || toIdx < 0 || toIdx >= lines.length) return;
    const [moved] = lines.splice(fromIdx, 1);
    lines.splice(toIdx, 0, moved);
    const newNotes = lines.join("\n");
    const prevNotes = target.notes;
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: newNotes } : s));
    const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId, data: { notes: newNotes } });
    if (!result.ok) setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes: prevNotes } : s));
  }, [athlete, sessions]);

  const duplicateSessionToDate = useCallback(async (newDate: string, targetAthleteIds?: string[], pct: number = 0) => {
    if (!duplicating || !athlete) return;
    const recipientIds = targetAthleteIds && targetAthleteIds.length > 0 ? targetAthleteIds : [athlete.id];
    const notes = duplicating.notes ? duplicating.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : (duplicating.notes ?? "");
    const target_difficulty = adjustDifficulty(duplicating.target_difficulty ?? 6, pct);
    const data = { name: duplicating.name, notes, target_difficulty, date: newDate };
    const results = await Promise.all(recipientIds.map(aid => callSessionAPI({ action: "add", athleteId: aid, data })));
    const created: CoachViewSession[] = results
      .filter(r => r.ok && r.session)
      .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
    setSessions(prev => [...prev, ...created]);
    setDuplicating(null);
  }, [duplicating, athlete, athletes]);

  const handleDragEnd = makePlanningDragEndHandler({ sessions, moveSession: moveSessionToDate, reorderExercises }) as (event: DragEndEvent) => void;
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function loadMonth(anchor: string, athleteObj: CoachAthlete) {
    if (sandboxMode) return;
    const base = new Date(anchor + "T12:00:00");
    // La grille Mois affiche aussi les jours de bord des semaines qui chevauchent le mois
    // (eachWeekOfInterval) — le fetch doit couvrir la même plage, pas le mois strict,
    // sinon les séances de ces jours de bord n'apparaissent jamais.
    const gridStart = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
    const gridEnd = addDays(startOfWeek(endOfMonth(base), { weekStartsOn: 1 }), 6);
    const start = format(gridStart, "yyyy-MM-dd");
    const end = format(gridEnd, "yyyy-MM-dd");

    if (athleteObj.user_id) {
      const sinceBaseline = format(subDays(gridStart, WELLNESS_BASELINE_WINDOW_DAYS), "yyyy-MM-dd");
      const [realRes, demoRes, wellRes, baselineRes] = await Promise.all([
        supabase.from("sessions").select("*").eq("user_id", athleteObj.user_id).gte("date", start).lte("date", end),
        supabase.from("coach_sessions").select("*").eq("coach_id", userId).eq("athlete_id", athleteObj.id).gte("date", start).lte("date", end),
        supabase.from("wellness_daily").select("date, score, base_score").eq("user_id", athleteObj.user_id).gte("date", start).lte("date", end),
        supabase.from("wellness_daily").select("*").eq("user_id", athleteObj.user_id).gte("date", sinceBaseline).lte("date", end),
      ]);
      const unified: CoachViewSession[] = [
        ...(realRes.data || []).map(s => realToView(s as Session, athletes)),
        ...(demoRes.data || []).map(s => demoToView(s as CoachSession)),
      ];
      setMonthSessions(unified);
      const wm: Record<string, Record<string, number>> = {};
      (wellRes.data || []).forEach((w: { date: string; score: number | null; base_score: number | null }) => {
        const v = wellnessSignal(w);
        if (v != null) {
          if (!wm[athleteObj.user_id!]) wm[athleteObj.user_id!] = {};
          wm[athleteObj.user_id!][w.date] = v;
        }
      });
      setMonthWellnessMap(wm);
      setWellnessBaselineHistory(prev => ({ ...prev, [athleteObj.user_id!]: (baselineRes.data || []) as WellnessDaily[] }));
    } else {
      const { data } = await supabase.from("coach_sessions").select("*").eq("coach_id", userId).eq("athlete_id", athleteObj.id).gte("date", start).lte("date", end);
      setMonthSessions((data || []).map(s => demoToView(s as CoachSession)));
      setMonthWellnessMap({});
    }
  }

  function navigatePeriod(dir: "next" | "prev") {
    slideDirRef.current = dir === "next" ? "left" : "right";
    setNavKey(k => k + 1);
    const base = new Date(selectedDate + "T12:00:00");
    const newBase = viewMode === "week"
      ? (dir === "next" ? addDays(base, 7) : subDays(base, 7))
      : (dir === "next" ? addMonths(base, 1) : subMonths(base, 1));
    handleDateChange(format(newBase, "yyyy-MM-dd"));
  }

  // Scroll vers le jour sélectionné (ring du header cliqué, ou "Aujourd'hui" par défaut au montage/
  // changement de semaine — selectedDate vaut todayStr initialement et à chaque navigation).
  useEffect(() => {
    if (viewMode !== "week") return;
    const idx = weekDates.findIndex(d => format(d, "yyyy-MM-dd") === selectedDate);
    if (idx >= 0) {
      dayRefs.current[idx]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    const el = calGridRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Même garde que WeekClient.tsx : une modale ouverte ne doit jamais laisser un scroll rapide
      // sous-jacent changer de semaine et désynchroniser la modale de la séance qu'elle édite.
      if (addingDate || editingSession || completing || duplicating || showReconduire || adjustCtx) return;
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

  // Scroll horizontal de la grille 7 jours = change de semaine, uniquement une fois le scroll
  // interne déjà à son extrémité dans le sens du geste — mêmes gardes que la navigation verticale.
  useHorizontalScrollNav(weekScrollRef, {
    onPrev: () => navigatePeriod("prev"),
    onNext: () => navigatePeriod("next"),
    mode: "boundary",
    enabled: viewMode === "week" && !addingDate && !editingSession && !completing && !duplicating && !showReconduire && !adjustCtx,
  });

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "month" && athlete) loadMonth(selectedDate, athlete);
  }

  // Même calcul que le ring de chaque DayColumn ci-dessous — un seul chiffre par (sportif, jour),
  // jamais un écart entre le header et la carte du jour. Clé user_id pour un vrai sportif, athlete.id
  // pour un sportif démo (voir dayWellness()/wellnessBaselineHistory plus haut).
  const coachWellnessHeader: Record<string, number | null> = {};
  if (athlete) {
    const athleteHistoryForHeader = wellnessBaselineHistory[athlete.user_id ?? athlete.id] ?? [];
    weekDates.forEach(d => {
      const iso = format(d, "yyyy-MM-dd");
      const raw = dayWellness(athlete, iso, wellnessMap, wellnessBaselineHistory);
      const filledThisDay = athlete.user_id ? wellnessMap[athlete.user_id]?.[iso] !== undefined : true;
      if (raw === null || !filledThisDay) { coachWellnessHeader[iso] = raw; return; }
      const b = computeWellnessBaselineAt(
        athleteHistoryForHeader.filter(w => w.date < iso),
        { score: raw, base_score: raw, sleep: 7, stress: 5, recovery: 7, motivation: 7 },
      );
      coachWellnessHeader[iso] = b?.hasEnoughHistory ? b.relativeScore : raw;
    });
  }
  // Baseline du jour "aujourd'hui" pour AdjustSessionModal (déclenché depuis les chips Alléger/
  // Surcharger de la carte "Aujourd'hui") — même calcul que coachWellnessHeader/dayBaseline
  // ci-dessus, jamais l'ancien zoneLabel() absolu affiché à part dans cette modale.
  const todayWellness = athlete ? dayWellness(athlete, todayStr, wellnessMap, wellnessBaselineHistory) : null;
  const todayFilledForBaseline = athlete?.user_id ? wellnessMap[athlete.user_id]?.[todayStr] !== undefined : true;
  const todayBaseline = athlete && todayFilledForBaseline && todayWellness !== null
    ? computeWellnessBaselineAt(
        (wellnessBaselineHistory[athlete.user_id ?? athlete.id] ?? []).filter(w => w.date < todayStr),
        { score: todayWellness, base_score: todayWellness, sleep: 7, stress: 5, recovery: 7, motivation: 7 },
      )
    : null;

  if (!athlete) {
    return (
      <>
        <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} wellnessMap={coachWellnessHeader} viewMode={viewMode} onViewModeChange={handleViewModeChange} onSwipe={navigatePeriod} profileHref={sandboxMode ? "/sandbox/coach/profil" : "/profil"} />
        <div className="page-shell" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#171b1f", marginBottom: 16 }}>Aucun sportif encore</div>
          <button onClick={() => router.push(sandboxMode ? "/sandbox/coach/athletes" : "/coach/athletes")}
            style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}>
            Ajouter un sportif →
          </button>
        </div>
      </>
    );
  }

  // Programme + semaine correspondant à la semaine réellement affichée (pas juste
  // `activeProgram`, "pertinent aujourd'hui") — hissé ici (au lieu de l'IIFE locale au
  // ProgramBanner) pour être aussi utilisable par le lock S2+ de la grille plus bas.
  // `weekStart` tombe à minuit heure locale — findProgramForWeek reparse en "T12:00:00" en
  // interne, cohérent avec les dates de démarrage des programmes (convention anti-DST déjà
  // utilisée partout ailleurs dans ce fichier).
  const viewedMondayStr = format(weekStart, "yyyy-MM-dd");
  const viewedMatch = findProgramForWeek(activeAssignments, viewedMondayStr);
  const viewedProgram = viewedMatch?.program ?? null;
  const viewedWeek = viewedMatch?.week ?? -1;
  // S1 visible pour tout le monde, S2+ flouté tant que non abonné — même principe que /week
  // (WeekClient.tsx) et ProgramBuilderModal.tsx : assigner n'est plus le gate, voir/utiliser
  // le planning complet au quotidien l'est.
  const weekLocked = !isActive && viewedWeek > 0;

  return (
    <>
      {!isActive && (
        <UnsavedBanner
          message="Mode démo · l'ajustement des séances n'est pas encore sauvegardé."
          onAction={() => requireSubscription(() => {})}
          roleToggle={sandboxMode ? { role: "coach", onToggle: r => router.push(`/sandbox/${r}`) } : undefined}
        />
      )}

      <CalendarHeader selectedDate={selectedDate} onDateChange={handleDateChange} dotMap={dotMap} wellnessMap={coachWellnessHeader} viewMode={viewMode} onViewModeChange={handleViewModeChange} onSwipe={navigatePeriod} profileHref={sandboxMode ? "/sandbox/coach/profil" : "/profil"} />

      {/* Athlete tabs bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)",
        display: "flex", alignItems: "stretch", overflowX: "auto",
        gap: 0,
      }}>
        {athletes.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedAthleteId(a.id)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: selectedAthleteId === a.id ? 700 : 600,
              background: "none", border: "none", cursor: "pointer",
              color: selectedAthleteId === a.id ? "#171b1f" : "#8a8f94",
              borderBottom: selectedAthleteId === a.id ? "2.5px solid #d44000" : "2.5px solid transparent",
              whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {a.name}
          </button>
        ))}
      </div>

      {/* Programme banner — full width. Un athlète peut enchaîner plusieurs programmes actifs :
          on cherche celui qui couvre la semaine réellement affichée, pas juste `activeProgram`
          (qui reste "le programme pertinent aujourd'hui"). */}
      {athlete && (() => {
        return (
          <ProgramBanner
            program={viewedProgram}
            currentWeek={viewedWeek}
            onEdit={viewedProgram ? () => router.push(sandboxMode ? "/sandbox/coach/programmes" : "/coach/programmes") : undefined}
            onReconduire={() => setShowReconduire(true)}
            freeLabel={freeLabelsFor(athlete)[viewedMondayStr] ?? null}
            onEditFreeLabel={label => setFreeLabelForWeek(athlete, viewedMondayStr, label)}
          />
        );
      })()}

      {(() => {
        const isViewingCurrentWeek = weekDates.some(d => format(d, "yyyy-MM-dd") === todayStr);
        const programPending = !!activeProgram && activeProgramWeek === -1 && !!activeProgramStartDate
          && new Date(activeProgramStartDate + "T12:00:00").getTime() > Date.now()
          && isViewingCurrentWeek;
        if (viewMode === "week" && athlete && programPending) {
          return (
            <div style={{ padding: isMd ? "0 24px 4px" : "0 16px 4px" }}>
              <div style={{
                textAlign: "center", padding: "28px 20px",
                border: "0.5px dashed rgba(212,64,0,.28)",
                borderRadius: 20, background: "#fff",
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📅</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#171b1f", marginBottom: 4, letterSpacing: "-0.02em" }}>
                  La semaine 1 de {athlete.name.split(" ")[0]} démarre lundi
                </div>
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 16 }}>
                  {activeProgram!.name} l&apos;attend.
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
          );
        }
        if (viewMode === "week" && athlete && !programPending && sessions.filter(s => s.athlete_id === athlete.id).length === 0) {
          return (
            <div style={{ padding: isMd ? "0 24px 4px" : "0 16px 4px" }}>
              <EmptySessionState
                sport={athlete.sport}
                label={`Créer une séance pour ${athlete.name}`}
                onAdd={() => setAddingDate(todayStr)}
              />
            </div>
          );
        }
        return null;
      })()}

      <div ref={calGridRef} data-tour="coach-planning">
      <div key={`cal-${navKey}`} style={{
        animation: navKey > 0
          ? `${slideDirRef.current === "left" ? "calSlideFromRight" : "calSlideFromLeft"} 220ms ease-out`
          : undefined,
      }}>

      {/* ── Vue mois coach ── */}
      {viewMode === "month" && athlete && (() => {
        const anchor = new Date(selectedDate + "T12:00:00");
        const weeks = eachWeekOfInterval(
          { start: startOfMonth(anchor), end: endOfMonth(anchor) },
          { weekStartsOn: 1 }
        );
        const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
        return (
          <div style={{ padding: isMd ? "14px 24px 100px" : "8px 8px 100px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginBottom: 4 }}>
              {dayLabels.map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 900, color: "#8a8f94", letterSpacing: "0.06em", textTransform: "uppercase", paddingBottom: 2 }}>
                  {isMd ? d : d[0]}
                </div>
              ))}
            </div>
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
                    freeLabel={freeLabelsFor(athlete)[mondayStr] ?? null}
                    onEditFreeLabel={label => setFreeLabelForWeek(athlete, mondayStr, label)}
                  />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: isMd ? 4 : 2, marginTop: 4 }}>
                {Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)).map(date => {
                  const dstr = format(date, "yyyy-MM-dd");
                  const isToday = dstr === todayStr;
                  const inMonth = date.getMonth() === anchor.getMonth();
                  const daySessions = monthSessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
                  const wellRaw = dayWellness(athlete, dstr, monthWellnessMap, wellnessBaselineHistory);
                  /* Score relatif (baseline Z-score), pas absolu — vue Mois oubliée lors de
                     l'unification wellness relatif (2026-08-30/31), même bug que côté sportif
                     (WeekClient.tsx) trouvé par Gildas : ring différent entre header/vue Semaine et
                     grille Mois pour le même jour, alors que loadMonth() fetch déjà
                     wellnessBaselineHistory pour ce calcul. Même pattern que la vue Semaine
                     ci-dessous (dayRelativeScore, ~ligne 856) — un seul chiffre, jamais deux. */
                  const monthAthleteHistory = wellnessBaselineHistory[athlete.user_id ?? athlete.id] ?? [];
                  const monthDayBaseline = wellRaw !== null
                    ? computeWellnessBaselineAt(
                        monthAthleteHistory.filter(w => w.date < dstr),
                        { score: wellRaw, base_score: wellRaw, sleep: 7, stress: 5, recovery: 7, motivation: 7 },
                      )
                    : null;
                  const wellScore = monthDayBaseline?.hasEnoughHistory ? monthDayBaseline.relativeScore : wellRaw;

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
                            <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", color: "#8a8f94", letterSpacing: "0.08em", lineHeight: 1.2 }}>
                              {format(date, "EEE", { locale: fr }).slice(0, 3)}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 1000, letterSpacing: "-0.04em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1 }}>
                              {date.getDate()}
                            </div>
                          </div>
                          {inMonth && <PlanningRingShared score={wellScore} size={44} />}
                        </div>
                      )}

                      {/* Mobile : numéro + ring empilés, dots dessous */}
                      {!isMd && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 1000, letterSpacing: "-0.04em", color: isToday ? "#d44000" : "#171b1f", lineHeight: 1, textAlign: "center", marginBottom: 4 }}>
                            {date.getDate()}
                          </div>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                            {inMonth
                              ? <PlanningRingShared score={wellScore} size={40} />
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
                                onClick={e => { e.stopPropagation(); setEditingSession(s); }}
                                style={{ background: "#f7f8f9", borderRadius: 8, padding: "4px 6px", marginBottom: 3, cursor: "pointer" }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 3 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name}</div>
                                  <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: s.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.10)", color: s.done ? "#2f9e44" : "#d44000" }}>
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
                              style={{ marginTop: "auto", border: "0.5px dashed rgba(212,64,0,.28)", borderRadius: 7, textAlign: "center", fontSize: 11, color: "#d44000", cursor: "pointer", fontWeight: 700, padding: "4px 2px" }}
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

      {/* 7-column scrollable grid — semaine — même DayColumn générique que /week (WeekClient.tsx) */}
      {viewMode === "week" && (
        <div style={{ position: "relative" }}>
        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
        <div ref={weekScrollRef} style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
          gap: isMd ? 12 : 10,
          overflowX: "auto",
          padding: isMd ? "14px 24px 18px" : "14px 16px 18px",
          scrollSnapType: "x proximity",
          scrollbarWidth: "thin",
          filter: weekLocked ? "blur(7px)" : "none",
          pointerEvents: weekLocked ? "none" : "auto",
          userSelect: weekLocked ? "none" : "auto",
        }}>
          {weekDates.map((date, idx) => {
            const dstr = format(date, "yyyy-MM-dd");
            const isToday = dstr === todayStr;
            const daySessions = sessions.filter(s => s.athlete_id === athlete.id && s.date === dstr);
            const wellness = dayWellness(athlete, dstr, wellnessMap, wellnessBaselineHistory);
            const prevStr = idx > 0 ? format(weekDates[idx - 1], "yyyy-MM-dd") : null;
            const nextStr = idx < weekDates.length - 1 ? format(weekDates[idx + 1], "yyyy-MM-dd") : null;
            const prevSess = prevStr ? sessions.filter(s => s.athlete_id === athlete.id && s.date === prevStr) : [];
            const nextSess = nextStr ? sessions.filter(s => s.athlete_id === athlete.id && s.date === nextStr) : [];
            const ctx = {
              prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
              nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
            };
            // Alerte "jour prioritaire" — uniquement sur la carte "Aujourd'hui" du sportif sélectionné,
            // avec le vrai wellness/la vraie difficulté du jour (attention()/decisionText() réels de
            // CoachAthleteCard.tsx). Le score doit venir de `wellness` (dayWellness() via wellnessMap,
            // déjà utilisé pour la ring affichée) et non de `athlete.wellness_score` (dénormalisé au
            // chargement de la page, peut être périmé pour un vrai sportif dont le check-in est arrivé
            // après coup — bug trouvé par Gildas en test réel : score 30 visible sur la ring mais
            // aucune alerte).
            const wellnessFilledToday = athlete.user_id ? wellnessMap[athlete.user_id]?.[dstr] !== undefined : true;
            // Baseline personnelle — calculée pour CHAQUE jour affiché (pas seulement "Aujourd'hui",
            // pour que la zone relative "Équilibré" s'affiche sur toute la semaine, pas juste la
            // carte du jour). Fonctionne aussi pour un sportif démo désormais (historique synthétique
            // déterministe indexé par athlete.id, même calcul que /coach et /coach/athletes — voir
            // dayWellness()/wellnessBaselineHistory plus haut) : plus de repli absolu systématique
            // pour les démo. `todayRow` synthétisé depuis `wellness` (composite déjà résolu via
            // dayWellness()) — seul `composite`/`guardRailTriggered` sont exploités, jamais
            // `.dimensions` (pas de vraies valeurs par dimension disponibles sur cette surface,
            // wellnessMap ne porte que le score composite).
            const athleteHistory = wellnessBaselineHistory[athlete.user_id ?? athlete.id] ?? [];
            const dayBaseline = wellnessFilledToday && wellness !== null
              ? computeWellnessBaselineAt(
                  athleteHistory.filter(w => w.date < dstr),
                  { score: wellness, base_score: wellness, sleep: 7, stress: 5, recovery: 7, motivation: 7 },
                )
              : null;
            const dayZoneLabel = dayBaseline?.hasEnoughHistory ? relativeZoneLabel(dayBaseline, "coach") : undefined;
            // Même chiffre que le header (coachWellnessHeader) et que /today du sportif — un seul
            // calcul, jamais 3 valeurs différentes pour le même jour.
            const dayRelativeScore = dayBaseline?.hasEnoughHistory ? dayBaseline.relativeScore : wellness;
            let alert;
            let alertActions;
            if (isToday) {
              const baseline = dayBaseline;
              const autoregTarget = [...daySessions].filter(s => !s.done)
                .sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
              const suggestion = wellnessFilledToday && autoregTarget
                ? computeAutoregSuggestion(wellness, autoregTarget.target_difficulty, baseline)
                : null;
              if (suggestion && autoregTarget) {
                const severityColor = suggestionSeverityColor(suggestion);
                alert = {
                  border: `${severityColor}66`,
                  glow: severityColor,
                  text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, autoregTarget.target_difficulty ?? 0, athlete.name.split(" ")[0], baseline)}`,
                };
                alertActions = (
                  <AutoregButtons
                    key={`${autoregTarget.id}-${decisionTick}`}
                    sessionId={autoregTarget.id}
                    dir={suggestion.dir}
                    reco={suggestion.reco}
                    advice=""
                    sessionLabel={autoregTarget.name}
                    variant="light"
                    severityColor={severityColor}
                    onMaintenir={() => setDecisionTick(t => t + 1)}
                    onOpenModal={() => setAdjustCtx({ session: autoregTarget, dir: suggestion.dir, reco: suggestion.reco, baseline })}
                    onUndo={async (original) => {
                      if (!original) return;
                      const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: autoregTarget.id, data: original });
                      if (result.ok) setSessions(prev => prev.map(s => s.id === autoregTarget.id ? { ...s, ...original } : s));
                      setDecisionTick(t => t + 1);
                    }}
                  />
                );
              } else {
                alert = coachAlertFor(
                  { ...athlete, wellness_score: wellness ?? 0, wellnessFilledToday },
                  maxDiffToday(athlete.id, sessions.filter(s => s.date === todayStr)),
                  baseline
                ) ?? undefined;
              }
            }

            return (
              <div key={dstr} ref={el => { dayRefs.current[idx] = el; }}>
              <DroppableDay dstr={dstr}>
              <DayColumn
                date={date}
                sessions={daySessions}
                wellness={wellness !== null ? { score: dayRelativeScore, zoneLabel: dayZoneLabel } : null}
                todayStr={todayStr}
                ctx={ctx}
                alert={alert}
                alertActions={alertActions}
                renderSession={(s) => (
                  <DraggableSessionCard
                    key={s.id}
                    session={s}
                    viewerRole="coach"
                    onComplete={(sess) => setCompleting(sess)}
                    onEdit={(sess) => setEditingSession(sess)}
                    onDuplicate={(sess) => setDuplicating(sess)}
                  />
                )}
                onAddSession={(d) => setAddingDate(d)}
                onComplete={(s) => setCompleting(s)}
                onEdit={(s) => setEditingSession(s)}
                onDuplicate={(s) => setDuplicating(s)}
                onWellness={() => {}}
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
              <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: "-0.02em", marginBottom: 6, color: "#171b1f" }}>Débloque les semaines suivantes</div>
              <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.5, marginBottom: 14 }}>Ce programme est bien assigné — l&apos;abonnement débloque le reste du planning.</div>
              <button onClick={() => requireSubscription(() => {})} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
                Débloquer →
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {(addingDate || editingSession) && athlete && (
        <CoachSessionModal
          athleteName={athlete.name}
          coachName={coachName ?? "Coach"}
          date={addingDate ?? editingSession!.date}
          session={editingSession ? {
            id: editingSession.id,
            coach_id: userId,
            athlete_id: editingSession.athlete_id,
            date: editingSession.date,
            name: editingSession.name,
            notes: editingSession.notes,
            done: editingSession.done,
            rpe: editingSession.rpe,
            duration: editingSession.duration,
            target_difficulty: editingSession.target_difficulty,
            created_at: editingSession.created_at,
            exercise_media: editingSession.exercise_media,
          } : null}
          athletes={athletes}
          initialAthleteId={athlete.id}
          onSave={(data, athleteIds) => requireSubscription(() => (editingSession ? saveEdit(data, athleteIds) : addSession(data, athleteIds)))}
          onDelete={editingSession ? (() => requireSubscription(() => deleteSession())) : undefined}
          onClose={() => { setAddingDate(null); setEditingSession(null); }}
          onMarkViewed={() => {
            if (!editingSession) return;
            callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: editingSession.id, data: { viewed_by_coach_at: new Date().toISOString() } });
          }}
        />
      )}

      {duplicating && athlete && (
        <DuplicateModal session={duplicating} onDuplicate={(date, targetAthleteIds, pct) => requireSubscription(() => duplicateSessionToDate(date, targetAthleteIds, pct))} onClose={() => setDuplicating(null)} athletes={athletes} sourceAthleteId={athlete.id} />
      )}
      {showReconduire && athlete && (
        <ReconduireModal
          daySlots={weekDates.map(d => ({ sessions: sessions.filter(s => s.athlete_id === athlete.id && s.date === format(d, "yyyy-MM-dd")) }))}
          athletes={athletes}
          sourceAthleteId={athlete.id}
          onClose={() => setShowReconduire(false)}
          onConfirm={(weeksOut, targetAthleteIds) => requireSubscription(async () => {
            const recipientIds = targetAthleteIds && targetAthleteIds.length > 0 ? targetAthleteIds : [athlete.id];
            const allRows = weeksOut.flatMap((rows, w) => rows.map(r => ({
              name: r.name, notes: r.notes, target_difficulty: r.target_difficulty,
              date: format(addDays(weekDates[r.dayIndex], 7 * (w + 1)), "yyyy-MM-dd"),
            })));
            const results = await Promise.all(
              recipientIds.flatMap(aid => allRows.map(r => callSessionAPI({ action: "add", athleteId: aid, data: r })))
            );
            const created: CoachViewSession[] = results
              .filter(r => r.ok && r.session)
              .map(r => r._real ? realToView(r.session as Session, athletes) : demoToView(r.session as CoachSession));
            setSessions(prev => [...prev, ...created]);
            setShowReconduire(false);
          })}
        />
      )}

      {adjustCtx && athlete && (
        <AdjustSessionModal
          session={adjustCtx.session as AdjustSessionTarget}
          dir={adjustCtx.dir}
          reco={adjustCtx.reco}
          wellnessScore={dayWellness(athlete, todayStr, wellnessMap, wellnessBaselineHistory)}
          baseline={todayBaseline}
          behaviors={athlete.behaviors ?? []}
          advice={autoregAdvice(adjustCtx.dir, adjustCtx.session.target_difficulty ?? 6, athlete.name.split(" ")[0], adjustCtx.baseline)}
          onClose={() => setAdjustCtx(null)}
          onConfirm={pct => requireSubscription(async () => {
            const notes = adjustCtx.session.notes ? adjustCtx.session.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : adjustCtx.session.notes;
            const target_difficulty = adjustDifficulty(adjustCtx.session.target_difficulty ?? 6, pct);
            const result = await callSessionAPI({ action: "update", athleteId: athlete.id, sessionId: adjustCtx.session.id, data: { notes, target_difficulty } });
            if (result.ok) {
              setSessions(prev => prev.map(s => s.id === adjustCtx.session.id ? { ...s, notes, target_difficulty } : s));
            }
            setAutoregDecision(adjustCtx.session.id, adjustCtx.dir, pct, { notes: adjustCtx.session.notes, target_difficulty: adjustCtx.session.target_difficulty });
            setDecisionTick(t => t + 1);
            setAdjustCtx(null);
          })}
        />
      )}

      </div>{/* animation wrapper */}
      </div>{/* calGridRef */}

      {showWelcome && (
        <WelcomeModal mode="coach" onClose={() => { localStorage.setItem(`welcome_shown_coach_${userId}`, "1"); setShowWelcome(false); }} />
      )}
      {showLibrary && (
        <ProgramLibraryPage
          athletes={athletes}
          requireSubscription={requireSubscription}
          isActive={isActive}
          sandboxMode={sandboxMode}
          initialStep="new"
          onClose={() => setShowLibrary(false)}
        />
      )}
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role="coach" page="planning" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
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

      {completing && athlete && (
        <CoachCompleteModal
          session={{
            id: completing.id,
            coach_id: userId,
            athlete_id: completing.athlete_id,
            date: completing.date,
            name: completing.name,
            notes: completing.notes,
            done: completing.done,
            rpe: completing.rpe,
            duration: completing.duration,
            target_difficulty: completing.target_difficulty,
            created_at: completing.created_at,
          }}
          athleteName={athlete.name}
          onSave={data => requireSubscription(() => completeSession(data))}
          onClose={() => setCompleting(null)}
        />
      )}

    </>
  );
}
