"use client";

import { useState, useEffect, useRef } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import Actions from "@/components/onboarding/Actions";
import DayColumn from "@/components/calendar/DayColumn";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AdjustSessionModal, { type AdjustSessionTarget } from "@/components/sessions/AdjustSessionModal";
import { CoachCard, attention, maxDiffToday } from "@/components/coach/CoachAthleteCard";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { loadRule, type LoadContext } from "@/lib/loadRule";
import { getRecoveryAdvice } from "@/lib/wellness";
import { computeAutoregSuggestion, autoregAdvice, setAutoregDecision, type AutoregDir } from "@/lib/autoregulation";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ProgramTemplate, ProgramFocus, Session, WellnessDaily, CoachAthlete, CoachViewSession } from "@/types";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function loadBarColor(avg: number): string {
  if (!avg) return "#e5e7eb";
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}
const DOW_MAP: Record<string, number> = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6 };

function getSportEmoji(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes("course") || s.includes("marathon") || s.includes("trail") || s.includes("endurance")) return "🏃";
  if (s.includes("vélo") || s.includes("cyclisme") || s.includes("triathlon")) return "🚴";
  if (s.includes("collectif") || s.includes("football") || s.includes("basket") || s.includes("rugby")) return "🏉";
  if (s.includes("combat") || s.includes("martial") || s.includes("judo") || s.includes("boxe")) return "🥋";
  if (s.includes("force") || s.includes("puissance") || s.includes("musculation") || s.includes("powerlifting")) return "💪";
  return "⚡";
}

function toDisplayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function adjustDiff(base: number, level: Level): number {
  if (level === "beginner") return Math.max(1, base - 4);
  if (level === "elite") return Math.min(10, base + 1);
  return base;
}

/* Aperçu wellness (conseil récupération dans chaque DayColumn) : contenu illustratif, pas de calcul réel — mais
   dérivé de la difficulté réelle de la séance du jour sélectionné pour que le score (et donc la
   zone via zoneLabel(), et le conseil via getRecoveryAdvice() — les mêmes fonctions qu'en prod)
   varie d'un jour à l'autre au lieu d'être figé. Seuls score/comportements sont illustratifs ;
   sleep/stress/recovery/motivation restent à des valeurs neutres "bonnes" car aucun vrai check-in
   n'existe encore à ce stade — c'est le comportement négatif (s'il y en a un) qui pilote alors le
   texte, exactement comme en prod. */
function wellnessPreviewFor(diff: number): { score: number; behaviors: string[] } {
  if (diff <= 4) return { score: 88, behaviors: ["hydration", "stretching"] };
  if (diff <= 6) return { score: 74, behaviors: ["walk"] };
  if (diff <= 8) return { score: 58, behaviors: ["late_sleep"] };
  return { score: 40, behaviors: ["late_sleep", "screen_late"] };
}

/* 3 situations de forme sur la carte "Aujourd'hui" (sportif uniquement) — seul le wellness varie,
   jamais la difficulté réelle de la séance (même principe que athleteAlertFor()/coachAlertFor(),
   voir src/lib/alerts.ts). Reprend le vrai mécanisme d'autorégulation (computeAutoregSuggestion,
   déjà en prod sur /today, /week, Coach Control) — jusque-là jamais branché sur l'onboarding. */
const SITUATIONS: { icon: string; label: string; wellness: number; behaviors: string[] }[] = [
  { icon: "😔", label: "Pas en forme", wellness: 45, behaviors: ["late_sleep", "screen_late"] },
  { icon: "🙂", label: "Normal",       wellness: 70, behaviors: ["walk"] },
  { icon: "💪", label: "En forme",     wellness: 88, behaviors: ["hydration"] },
];

type Level = "beginner" | "intermediate" | "elite";
type Role = "athlete" | "coach";

interface FetchedProgram {
  name: string;
  sport: string;
  level: Level;
  template: ProgramTemplate;
}

const LEVEL_TO_DB: Record<Level, string> = { beginner: "debutant", intermediate: "intermediaire", elite: "elite" };
const DOW_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]; // même convention que generateAndAssignProgram() dans OnboardingFlow.tsx (index = JS getDay())

interface Props {
  sport: string;
  level: Level;
  trainingDays: number[];
  focus?: ProgramFocus;
  weaknesses?: string[];
  duration?: 4 | 6 | 8 | 12 | 16;
  customExercises?: Record<string, string[]>;
  customWeaknessMeta?: Record<string, { extraLine: string; typeHints: string[] }>;
  customSessionLabels?: Record<string, string>;
  programFlow?: boolean;
  role: Role;
  goalLower: string;
  frise?: React.ReactNode;
  onNext: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, focus, weaknesses, duration, customExercises, customWeaknessMeta, customSessionLabels, programFlow, role, goalLower, frise, onNext }: Props) {
  const { isMd, isLg } = useBreakpoint();
  const heroMaxWidth = isLg ? 720 : isMd ? 640 : 560;
  const [fetchedProgram, setFetchedProgram] = useState<FetchedProgram | null>(null);
  const [generatedTemplate, setGeneratedTemplate] = useState<ProgramTemplate | null>(null);

  // Chemin "programme claimé" : ce fetch ne sert plus qu'à afficher le NOM du programme claimé
  // (displayName, dans headerTitle/headerSub) — le contenu réel des séances (week1) vient
  // désormais toujours de generatedTemplate ci-dessous, personnalisé selon faiblesses/objectif/
  // jours (2026-08-05, chantier "personnaliser les programmes claimed"). Avant ce chantier, ce
  // fetch fournissait aussi le contenu (copie statique du template public, invariant aux choix
  // faits sur les nouveaux écrans) — remplacé pour la même raison que le fix du chemin classique
  // juste en dessous : l'aperçu doit refléter les vrais choix, pas un template figé.
  useEffect(() => {
    if (!programFlow) return;
    const claimId = localStorage.getItem("claim_program_id");
    if (!claimId) return;
    fetch(`/api/programs/${claimId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: FetchedProgram | null) => {
        if (data?.name) setFetchedProgram(data);
      });
  }, [programFlow]);

  // Aperçu généré par le VRAI générateur (/api/programs/generate, pur/déterministe) avec les choix
  // réels déjà faits par l'utilisateur — tourne pour les 2 chemins (classique ET programme claimé
  // personnalisé, sport/niveau déjà déduits du claim dans ce cas). Remplace l'ancien aperçu
  // générique getSessionTemplates() qui ne reflétait pas sport/faiblesses/objectif du bloc, trouvé
  // en décalage par Gildas après le portage de ces champs dans l'onboarding (2026-08-05). Même
  // appel que generateAndAssignProgram() (mêmes sport/level/days/focus/weaknesses/duration) : le
  // programme réellement créé plus tard dans le flow sera donc identique à cet aperçu.
  useEffect(() => {
    if (!trainingDays.length) return;
    const dayStrings = trainingDays.map(d => DOW_NAMES[d]).filter(Boolean);
    if (!dayStrings.length) return;
    let cancelled = false;
    fetch("/api/programs/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport, level: LEVEL_TO_DB[level], days: dayStrings, duration: duration ?? 4, focus: focus ?? "mixte", weaknesses: weaknesses ?? [],
        ...(customExercises ? { customExercises, customWeaknessMeta, customSessionLabels } : {}),
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { template: ProgramTemplate } | null) => {
        if (!cancelled && data?.template) setGeneratedTemplate(data.template);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, level, JSON.stringify(trainingDays), focus, JSON.stringify(weaknesses), duration, JSON.stringify(customExercises)]);

  // Contenu réel des séances : toujours le template généré en direct (jamais une copie statique).
  const week1 = generatedTemplate?.weeks?.[0] ?? null;

  const displaySport = sport;
  const displayLevel = level;
  const displayName  = fetchedProgram?.name;
  const sportEmoji   = getSportEmoji(displaySport);

  // Days + sessions: real template if available, generic if not
  let displayDays: number[];
  let sessionForDay: Record<number, { name: string; notes: string | null; diff: number }>;

  if (week1) {
    displayDays = Object.keys(week1).map(d => DOW_MAP[d] ?? 0).sort((a, b) => a - b);
    sessionForDay = {};
    Object.entries(week1).forEach(([dayKey, sessions]) => {
      const di = DOW_MAP[dayKey] ?? 0;
      const s = sessions[0];
      if (s) sessionForDay[di] = { name: s.name, notes: s.notes ?? null, diff: s.target_difficulty };
    });
  } else {
    const templates = getSessionTemplates(displaySport);
    displayDays = Array.from(new Set(trainingDays.map(toDisplayIndex))).sort((a, b) => a - b);
    sessionForDay = {};
    displayDays.forEach((d, i) => {
      const tpl = templates[i % templates.length];
      sessionForDay[d] = { name: tpl[0], notes: tpl[1], diff: adjustDiff(tpl[2], displayLevel) };
    });
  }

  /* Jour réellement "aujourd'hui" (vraie date calendaire). */
  const todayIndex = toDisplayIndex(new Date().getDay());

  /* Jour qui porte le sélecteur de forme + la mécanique d'autorégulation interactive — "aujourd'hui"
     s'il s'entraîne aujourd'hui, sinon le prochain jour d'entraînement de la semaine affichée,
     sinon (aucun jour d'entraînement restant cette semaine) le premier jour choisi. Sans ce repli,
     un sportif dont aucun jour choisi ne tombe sur "aujourd'hui" (ex. il s'inscrit un jour où il ne
     s'entraîne pas) ne voyait jamais l'aha moment — trouvé par Gildas en testant, 2026-08-14.
     Le badge "Aujourd'hui" (todayStr passé à DayColumn) reste volontairement sur le vrai jour
     calendaire — jamais déplacé sur ce jour démo, pour ne pas afficher un mensonge de date. Seul le
     texte du sélecteur change (voir plus bas, "avant ta prochaine séance") quand demoIndex diffère
     de todayIndex — retour de Gildas, 2026-08-14 (2e itération). */
  const demoIndex = displayDays.includes(todayIndex)
    ? todayIndex
    : displayDays.find(d => d > todayIndex) ?? displayDays[0] ?? todayIndex;

  // Le carrousel s'ouvre directement sur le jour démo (pas juste le premier jour choisi), pour que
  // l'aha moment soit visible sans avoir à scroller le trouver.
  const defaultDay = displayDays.includes(demoIndex) ? demoIndex : (displayDays[0] ?? 0);
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* 3 situations de forme sur le jour démo (sportif) — voir SITUATIONS plus haut. */
  const [situationIdx, setSituationIdx] = useState(0);
  const [previewOverrides, setPreviewOverrides] = useState<Record<number, { notes: string | null; diff: number }>>({});
  const [adjustCtx, setAdjustCtx] = useState<{ dir: AutoregDir; reco: number } | null>(null);
  const [demoTick, setDemoTick] = useState(0);

  /* Présélectionne la situation qui fait vraiment apparaître un ajustement (Alléger/Surcharger) sur
     le jour démo, quand c'est possible — plutôt que "Pas en forme" par défaut, qui tombe parfois
     sur "Plan cohérent" selon la difficulté réelle du jour et laisse le sportif sans rien à voir au
     premier coup d'œil (retour de Gildas, 2026-08-14). Une seule fois, dès que la vraie difficulté
     du jour démo est connue (chargement du template réel) — n'écrase jamais un choix déjà fait par
     le sportif lui-même sur les pills.
     "Normal" (wellness 70) ne déclenche jamais de suggestion par construction (ni <60 ni ≥80), donc
     findIndex ne peut retomber que sur "Pas en forme" (diff≥7) ou "En forme" (diff≤4). */
  const autoSelectedSituationRef = useRef(false);
  useEffect(() => {
    if (role === "coach" || autoSelectedSituationRef.current) return;
    const demoDiff = sessionForDay[demoIndex]?.diff;
    if (demoDiff == null) return;
    autoSelectedSituationRef.current = true;
    const idx = SITUATIONS.findIndex(sit => !!computeAutoregSuggestion(sit.wellness, demoDiff));
    if (idx !== -1) setSituationIdx(idx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionForDay[demoIndex]?.diff]);

  /* Coach Control — 3 sportifs démo (mêmes prénoms que ceux réellement créés par completeProfile()
     à la fin de l'onboarding coach : Thomas M./Emma L./Pierre D.), le vrai CoachCard de /coach.
     Séances cherchées sur TOUT le template généré (pas juste sa 1re semaine) — un bloc de
     périodisation complet (MEV/Surcharge/MRV/Deload) contient forcément une semaine dure et une
     semaine légère, jamais une difficulté inventée, juste cherchée plus largement pour que Thomas
     (wellness bas) et Pierre (wellness haut) déclenchent chacun une vraie suggestion de façon
     fiable (retour de Gildas, 2026-08-14 : "Pierre est censé avoir l'alerte et halo"). Emma reste
     "cohérent" quelle que soit sa séance — son wellness (70) ne franchit ni le seuil bas (<60) ni
     le seuil haut (≥80) de computeAutoregSuggestion(), par construction. */
  const [demoAthletes, setDemoAthletes] = useState<CoachAthlete[]>([]);
  const [demoSessions, setDemoSessions] = useState<CoachViewSession[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  function flattenTemplateSessions(template: ProgramTemplate | null): { name: string; notes: string | null; diff: number }[] {
    if (!template?.weeks) return [];
    const out: { name: string; notes: string | null; diff: number }[] = [];
    template.weeks.forEach(week => {
      Object.values(week).forEach(daySessions => {
        daySessions.forEach(s => out.push({ name: s.name, notes: s.notes ?? null, diff: s.target_difficulty }));
      });
    });
    return out;
  }

  useEffect(() => {
    if (role !== "coach") return;
    const pool = flattenTemplateSessions(generatedTemplate);
    const source = pool.length ? pool : Object.values(sessionForDay);
    if (!source.length) return;
    const sorted = [...source].sort((a, b) => b.diff - a.diff);
    const hardest = sorted.find(s => s.diff >= 7) ?? sorted[0];
    const lightest = [...sorted].reverse().find(s => s.diff <= 4) ?? sorted[sorted.length - 1];
    const middle = sorted[Math.floor(sorted.length / 2)] ?? sorted[0];
    const defs: { id: string; name: string; wellness: number; behaviors: string[]; tpl: { name: string; notes: string | null; diff: number } }[] = [
      { id: "preview-thomas", name: "Thomas M.", wellness: 45, behaviors: ["late_sleep", "screen_late"], tpl: hardest },
      { id: "preview-emma",   name: "Emma L.",   wellness: 70, behaviors: ["walk"],                      tpl: middle },
      { id: "preview-pierre", name: "Pierre D.", wellness: 88, behaviors: ["hydration"],                 tpl: lightest },
    ];
    setDemoAthletes(defs.map(d => ({
      id: d.id, coach_id: "preview", name: d.name, sport: displaySport,
      wellness_score: d.wellness, behaviors: d.behaviors, wellnessFilledToday: true,
      user_id: null, invite_email: null, created_at: new Date().toISOString(),
    })));
    setDemoSessions(defs.map(d => ({
      id: `preview-session-${d.id}`, athlete_id: d.id, date: format(new Date(), "yyyy-MM-dd"),
      name: d.tpl.name, notes: d.tpl.notes, duration: null, rpe: null, done: false,
      target_difficulty: d.tpl.diff, created_at: new Date().toISOString(), _real: false,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, generatedTemplate, JSON.stringify(sessionForDay), displaySport]);

  async function handleCoachApplyAdjust(session: CoachViewSession, pct: number) {
    const notes = session.notes ? session.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : session.notes;
    const target_difficulty = adjustDifficulty(session.target_difficulty ?? 6, pct);
    setDemoSessions(prev => prev.map(s => s.id === session.id ? { ...s, notes, target_difficulty } : s));
  }
  async function handleCoachUndoAdjust(session: CoachViewSession, original: { notes: string | null; target_difficulty: number | null }) {
    setDemoSessions(prev => prev.map(s => s.id === session.id ? { ...s, ...original } : s));
  }
  function markCoachReviewed(athleteId: string) {
    setReviewedIds(prev => { const s = new Set(prev); s.add(athleteId); return s; });
  }
  function unmarkCoachReviewed(athleteId: string) {
    setReviewedIds(prev => { const s = new Set(prev); s.delete(athleteId); return s; });
  }
  /* Priorité démo : la vraie attention() (jamais "priorité" pour une opportunité de surcharge, par
     design) est complétée par "a une suggestion active" — pour que Pierre (surcharge) rejoigne
     Thomas (alléger) en section "À décider maintenant" avec le halo, comme demandé par Gildas. Une
     vraie surcharge reste un cas moins urgent qu'une alerte, mais les deux méritent une décision. */
  function demoIsPriority(a: CoachAthlete, maxDiff: number): boolean {
    return attention(a, maxDiff) || !!computeAutoregSuggestion(a.wellnessFilledToday === false ? null : a.wellness_score, maxDiff);
  }

  // Keep selected day in sync when real data loads (préfère le jour démo, cf. defaultDay plus haut)
  useEffect(() => {
    if (displayDays.length > 0 && !displayDays.includes(selectedDay)) {
      setSelectedDay(displayDays.includes(demoIndex) ? demoIndex : displayDays[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week1]);

  const allDiffs = displayDays.map(d => sessionForDay[d]?.diff ?? 6);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i));

  /* Score de forme illustratif — palette fixe couvrant les 4 zones (88/40/58/74), assignée par
     position dans la semaine, sur les jours de repos ET d'entraînement (jours ≠ aujourd'hui
     uniquement — "aujourd'hui" utilise SITUATIONS ci-dessus). loadRule()/le texte de charge
     restent TOUJOURS calculés sur le vrai target_difficulty de la séance, jamais décalés. */
  const REST_DIFF_PALETTE = [3, 10, 7, 5];
  const WELLNESS_SEED = [6, 3, 8, 5, 2, 9, 4]; // Lun..Dim, seed arbitraire pour la variété de score
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !displayDays.includes(d));

  function dayColumnData(d: number): { date: Date; sessions: Session[]; wellness: WellnessDaily | null; ctx: LoadContext; recoveryAdvice?: string; alert?: { border: string; glow: string; text: string }; alertActions?: React.ReactNode } {
    const date = weekDates[d];
    const dstr = format(date, "yyyy-MM-dd");
    const s = sessionForDay[d];
    const idx = displayDays.indexOf(d);
    const prevMax = idx > 0 ? (allDiffs[idx - 1] ?? 0) : 0;
    const nextMax = idx < displayDays.length - 1 ? (allDiffs[idx + 1] ?? 0) : 0;
    const isPast = d < todayIndex;
    const isDemoDay = d === demoIndex;
    // Le jour démo garde son traitement interactif même s'il tombe chronologiquement dans le futur
    // (ex. "aujourd'hui" est un jour de repos, la démo se rattache au prochain jour d'entraînement).
    const isFuture = d > todayIndex && !isDemoDay;

    if (!s) {
      if (isFuture) return { date, sessions: [], wellness: null, ctx: { prevMax, nextMax } };
      const restIdx = restDays.indexOf(d);
      const restDiff = REST_DIFF_PALETTE[restIdx % REST_DIFF_PALETTE.length];
      const wp = wellnessPreviewFor(restDiff);
      const wellness: WellnessDaily = {
        id: `preview-w-${d}`, user_id: "preview", date: dstr,
        sleep: 7, stress: 3, recovery: 7, motivation: 7,
        base_score: wp.score, score: wp.score, behaviors: wp.behaviors, bedtime: null,
        created_at: new Date().toISOString(),
      };
      const rule = loadRule([], { prevMax, nextMax });
      const advice = getRecoveryAdvice(
        { sleep: 7, stress: 3, recovery: 7, motivation: 7, behaviors: wp.behaviors },
        rule.cls
      );
      return { date, sessions: [], wellness, ctx: { prevMax, nextMax }, recoveryAdvice: advice };
    }

    // Jour démo : diff/notes potentiellement remplacés par la décharge/surcharge appliquée pour la
    // situation en cours (previewOverrides, keyé par situationIdx — chaque situation garde sa
    // propre décision, jamais mélangée avec les autres). Toujours "Prévu" (jamais "Terminé"), même
    // si ce jour tombe chronologiquement dans le passé cette semaine — rien à décider sur une
    // séance déjà faite.
    const override = isDemoDay ? previewOverrides[situationIdx] : undefined;
    const effNotes = override ? override.notes : s.notes;
    const effDiff  = override ? override.diff  : s.diff;

    const session: Session = {
      id: `preview-${d}`, user_id: "preview", date: dstr,
      name: s.name, notes: effNotes, duration: null,
      rpe: isDemoDay ? null : (isPast ? effDiff : null),
      done: isDemoDay ? false : isPast,
      target_difficulty: effDiff, created_at: new Date().toISOString(),
    };
    if (isFuture) return { date, sessions: [session], wellness: null, ctx: { prevMax, nextMax } };

    if (!isDemoDay) {
      const wp = wellnessPreviewFor(WELLNESS_SEED[d]);
      const rule = loadRule([{ target_difficulty: s.diff }], { prevMax, nextMax });
      const advice = getRecoveryAdvice(
        { sleep: 7, stress: 3, recovery: 7, motivation: 7, behaviors: wp.behaviors },
        rule.cls
      );
      const wellness: WellnessDaily = {
        id: `preview-w-${d}`, user_id: "preview", date: dstr,
        sleep: 7, stress: 3, recovery: 7, motivation: 7,
        base_score: wp.score, score: wp.score, behaviors: wp.behaviors, bedtime: null,
        created_at: new Date().toISOString(),
      };
      return { date, sessions: [session], wellness, ctx: { prevMax, nextMax }, recoveryAdvice: advice };
    }

    // "Aujourd'hui" — situation de forme choisie via le sélecteur, vraie mécanique d'autorégulation
    // (computeAutoregSuggestion/AutoregButtons, déjà en prod sur /today, /week, Coach Control).
    // Seul le wellness varie, jamais s.diff (la vraie difficulté prévue) — même principe que
    // athleteAlertFor()/coachAlertFor() (voir src/lib/alerts.ts).
    const situation = SITUATIONS[situationIdx];
    const wellness: WellnessDaily = {
      id: `preview-w-${d}`, user_id: "preview", date: dstr,
      sleep: 7, stress: 3, recovery: 7, motivation: 7,
      base_score: situation.wellness, score: situation.wellness, behaviors: situation.behaviors, bedtime: null,
      created_at: new Date().toISOString(),
    };
    const suggestion = computeAutoregSuggestion(situation.wellness, s.diff);
    let alert: { border: string; glow: string; text: string } | undefined;
    let alertActions: React.ReactNode | undefined;
    if (suggestion) {
      alert = {
        border: suggestion.dir === "low" ? "rgba(242,138,0,.4)" : "rgba(47,158,68,.4)",
        glow: suggestion.dir === "low" ? "#f28a00" : "#2f9e44",
        text: `${suggestion.icon} ${autoregAdvice(suggestion.dir, s.diff)}`,
      };
      alertActions = (
        <AutoregButtons
          key={`preview-today-${situationIdx}-${demoTick}`}
          sessionId={`preview-today-${situationIdx}`}
          dir={suggestion.dir}
          reco={suggestion.reco}
          advice=""
          sessionLabel={s.name}
          onMaintenir={() => {}}
          onOpenModal={() => setAdjustCtx({ dir: suggestion.dir, reco: suggestion.reco })}
          onUndo={() => {
            setPreviewOverrides(prev => {
              const next = { ...prev };
              delete next[situationIdx];
              return next;
            });
            setDemoTick(t => t + 1);
          }}
        />
      );
    } else {
      // Pas de suggestion : jamais le texte numérique d'athleteAlertFor() (X/10) — un message neutre,
      // mots uniquement, cohérent avec autoregAdvice() (retour de Gildas, 2026-08-14).
      alert = { border: "rgba(47,158,68,.3)", glow: "#2f9e44", text: "🟢 Plan cohérent — suis la séance prévue." };
    }
    return { date, sessions: [session], wellness, ctx: { prevMax, nextMax }, alert, alertActions };
  }

  async function handleConfirmAdjust(pct: number) {
    if (!adjustCtx) return;
    const demoSession = sessionForDay[demoIndex];
    if (!demoSession) return;
    const notes = demoSession.notes ? demoSession.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : demoSession.notes;
    const diff = adjustDifficulty(demoSession.diff, pct);
    setPreviewOverrides(prev => ({ ...prev, [situationIdx]: { notes, diff } }));
    setAutoregDecision(`preview-today-${situationIdx}`, adjustCtx.dir, pct, { notes: demoSession.notes, target_difficulty: demoSession.diff });
    setDemoTick(t => t + 1);
    setAdjustCtx(null);
  }

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>(`[data-day="${selectedDay}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDay]);

  // Wording de l'aha moment (2026-08-14) — remplace l'ancien texte générique "aide à {objectif}"
  // par un texte centré sur le mécanisme (alléger/maintenir/surcharger) qu'on vient de rendre
  // interactif, retour de Gildas. Reste propre au chemin classique — le programme claimé garde son
  // propre texte (displayName), pas concerné par ce changement.
  const headerTitle = programFlow
    ? (displayName ?? "Chargement…")
    : (role === "coach"
        ? "⚡ Voici comment ThePerfClub simplifie tes décisions de coaching."
        : "⚡ Voici comment ton programme s'adapte à ta forme.");
  const headerSub = programFlow
    ? (displayName ? "Personnalisable à tout moment selon l'avancée de tes sportifs." : "Chargement du programme…")
    : (role === "coach"
        ? "Ton Coach Control fait ressortir les sportifs qui nécessitent ton attention et t'aide à ajuster leur charge au bon moment."
        : "Maintiens, allège ou augmente ta charge selon ton état du jour. ThePerfClub t'aide à prendre la bonne décision sans perdre de vue ton objectif.");
  const headerTitleDisplay = programFlow ? `${sportEmoji} ${headerTitle}` : headerTitle;
  const nextLabel = role === "coach" ? "Continuer avec mes sportifs →" : "Continuer avec mon programme →";

  const heroBlock = (
    <div style={{
      background: "#141414",
      width: "100vw", position: "relative", left: "50%", right: "50%", marginLeft: "-50vw", marginRight: "-50vw",
      marginTop: -36, paddingTop: 24, paddingBottom: role === "coach" ? 24 : 0,
    }}>
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: role === "coach" ? "0 20px" : "0 20px 24px" }}>
        {frise}
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4, color: "#fff" }}>
          {headerTitleDisplay}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginBottom: role === "coach" ? 0 : 18 }}>
          {headerSub}
        </div>

        {role !== "coach" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {DOW_LABELS.map((label, i) => {
              const hasSession = displayDays.includes(i);
              const isSelected = i === selectedDay;
              const dayDiff = sessionForDay[i]?.diff;
              return (
                <div
                  key={i}
                  onClick={() => hasSession ? setSelectedDay(i) : undefined}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: hasSession ? "pointer" : "default" }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: isSelected ? "#fff" : "transparent",
                    border: isSelected ? "none" : `1.5px solid ${hasSession ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: isSelected ? "#171b1f" : hasSession ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: hasSession ? loadBarColor(dayDiff ?? 0) : "transparent" }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (role === "coach") {
    // Même découpage que /coach (CoachClient.tsx) : "À décider maintenant" (grille 2 colonnes en
    // desktop, isLg) au-dessus de "Plan cohérent" — pas une simple liste empilée.
    const priorityList = demoAthletes.filter(a => demoIsPriority(a, maxDiffToday(a.id, demoSessions)));
    const stableList = demoAthletes.filter(a => !demoIsPriority(a, maxDiffToday(a.id, demoSessions)));
    return (
      <div>
        {heroBlock}

        {/* Largeur réelle de /coach (CoachClient.tsx), pas la colonne étroite du reste de l'onboarding
           (OnboardingBackground.tsx plafonne toute la page à 720px max) — un maxWidth simple ici
           restait invisible, bridé par ce parent plus étroit. Même technique d'évasion "plein-bleed"
           que le carrousel sportif juste en dessous (100vw + marges négatives), pour que la grille 2
           colonnes ait vraiment la place du dashboard, pas celle de la colonne d'onboarding. */}
        <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <div style={{ maxWidth: isLg ? 1000 : isMd ? 720 : 600, margin: "0 auto", padding: isLg ? "20px 40px 0" : isMd ? "18px 24px 0" : "16px 16px 0" }}>
          <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 14 }}>
            Ton analyse réelle s'appuierait sur les données d'entraînement de tes sportifs.
          </div>

          {priorityList.length > 0 && (
            <div style={{ margin: "13px 0" }}>
              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428" }}>À décider maintenant</div>
                <div style={{ fontSize: 12, color: "#687075", lineHeight: 1.4, marginTop: 2 }}>Le coach voit d&apos;abord ce qui mérite une action.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {priorityList.map(a => (
                  <CoachCard
                    key={a.id}
                    athlete={a}
                    sessions={demoSessions}
                    isPriority={true}
                    isReviewed={reviewedIds.has(a.id)}
                    onDecide={() => markCoachReviewed(a.id)}
                    onApplyAdjust={handleCoachApplyAdjust}
                    onUndoAdjust={handleCoachUndoAdjust}
                    onAutoregDecided={() => markCoachReviewed(a.id)}
                    onAutoregUndone={() => unmarkCoachReviewed(a.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {stableList.length > 0 && (
            <div style={{ margin: "13px 0 20px" }}>
              <div style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428" }}>Plan cohérent</div>
                <div style={{ fontSize: 12, color: "#687075", lineHeight: 1.4, marginTop: 2 }}>Pas d&apos;intervention immédiate.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {stableList.map(a => (
                  <CoachCard
                    key={a.id}
                    athlete={a}
                    sessions={demoSessions}
                    isPriority={false}
                    isReviewed={false}
                    onDecide={() => markCoachReviewed(a.id)}
                    onApplyAdjust={handleCoachApplyAdjust}
                    onUndoAdjust={handleCoachUndoAdjust}
                    onAutoregDecided={() => markCoachReviewed(a.id)}
                    onAutoregUndone={() => unmarkCoachReviewed(a.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        </div>

        <Actions onNext={onNext} nextLabel={nextLabel} />
      </div>
    );
  }

  return (
    <div>
      {heroBlock}

      {/* Sélecteur de situation — sportif uniquement, agit uniquement sur la carte démo du carrousel
         (jamais sur les autres jours). Vraie mécanique d'autorégulation, jamais un chiffre de
         difficulté inventé — seul le wellness varie ici, voir dayColumnData(). Libellé adapté quand
         le jour démo n'est pas vraiment "aujourd'hui" (aucun entraînement prévu ce jour-là) — le
         badge "Aujourd'hui" du carrousel reste honnête, seul ce texte change (retour de Gildas,
         2026-08-14, 2e itération). */}
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: isMd ? "14px 24px 0" : "14px 16px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 8 }}>
          {demoIndex === todayIndex ? "Simule ta forme du jour" : "Simule ta forme avant ta prochaine séance"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {SITUATIONS.map((sit, i) => (
            <button
              key={sit.label}
              onClick={() => setSituationIdx(i)}
              style={{
                flex: 1, padding: "9px 4px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: i === situationIdx ? "1.5px solid #d44000" : "1.5px solid rgba(0,0,0,.08)",
                background: i === situationIdx ? "#fff4f0" : "#fff",
                color: i === situationIdx ? "#d44000" : "#8a8f94",
                fontSize: 12, fontWeight: 800,
              }}
            >
              {sit.icon} {sit.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, margin: "14px 20px 8px" }}>
        Ton analyse réelle s'appuierait sur tes données d'entraînement.
      </div>

      <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <div
          ref={scrollRef}
          style={{
            display: "grid", gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
            gap: isMd ? 12 : 10, overflowX: "auto", marginBottom: 12,
            padding: isMd ? "2px 24px 14px" : "2px 16px 14px", scrollSnapType: "x proximity", scrollbarWidth: "thin",
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map(d => {
            const { date, sessions, wellness, ctx, recoveryAdvice, alert, alertActions } = dayColumnData(d);
            return (
              <div key={d} data-day={d} onClick={() => setSelectedDay(d)}>
                <DayColumn
                  date={date}
                  sessions={sessions}
                  wellness={wellness}
                  todayStr={format(weekDates[todayIndex], "yyyy-MM-dd")}
                  ctx={ctx}
                  recoveryAdvice={recoveryAdvice}
                  alert={alert}
                  alertActions={alertActions}
                  onAddSession={() => {}}
                  onComplete={() => {}}
                  onEdit={() => {}}
                  onDuplicate={() => {}}
                  onWellness={() => setSelectedDay(d)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {adjustCtx && sessionForDay[demoIndex] && (
        <AdjustSessionModal
          session={{
            id: "preview-today",
            name: sessionForDay[demoIndex].name,
            notes: sessionForDay[demoIndex].notes,
            target_difficulty: sessionForDay[demoIndex].diff,
          } as AdjustSessionTarget}
          dir={adjustCtx.dir}
          reco={adjustCtx.reco}
          wellnessScore={SITUATIONS[situationIdx].wellness}
          behaviors={SITUATIONS[situationIdx].behaviors}
          advice={autoregAdvice(adjustCtx.dir, sessionForDay[demoIndex].diff)}
          onClose={() => setAdjustCtx(null)}
          onConfirm={handleConfirmAdjust}
        />
      )}

      <Actions onNext={onNext} nextLabel={nextLabel} />
    </div>
  );
}
