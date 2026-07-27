"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useFeatureFlagVariantKey } from "posthog-js/react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { getSessionTemplates, nextDateForDow } from "@/lib/sessionTemplates";
import type { ProgramTemplate, WeekTemplate, SessionTemplate } from "@/types";
import Link from "next/link";
import OnboardingBackground from "@/components/onboarding/OnboardingBackground";
import WeekPreviewStep from "@/components/onboarding/WeekPreviewStep";
import AutoRegScoreStep from "@/components/onboarding/AutoRegScoreStep";
import AutoRegScoreStepCoach from "@/components/onboarding/AutoRegScoreStepCoach";
import CelebrationScreen from "@/components/onboarding/CelebrationScreen";
import { CheckoutForm, PRICING, PAYWALL_AVATARS, PAYWALL_TESTIMONIALS, stripePromise, type Billing } from "@/components/paywall/PaywallModal";
import { Elements } from "@stripe/react-stripe-js";
import Actions from "@/components/onboarding/Actions";
import WellnessRing from "@/components/wellness/WellnessRing";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { subscribeToPush, needsInstallForPush } from "@/lib/push";
import { zoneLabel, getContextualInsight, getAdvice } from "@/lib/wellness";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "role"
  | "value_intro"
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"
  | "overload_2a" | "planning_2a" | "fatigue_2a"
  | "autoreg_score"
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"
  | "autoreg_score_coach"
  | "week_preview_2a" | "week_preview_2b"
  | "wellness_q"
  | "wellness_reveal"
  | "account"
  | "celebration"
  | "concept_autoreg" | "profile_recap"
  | "invite_team"
  | "paywall_priming" | "paywall_form";

type PendingData = {
  role: Role; sport: string; sportPrecision: string; level: Level;
  goal: string; frustration: string; trainingDays: number[];
  coachingContext: string; athleteCount: string; coachingChallenge: string; currentTool: string;
  name: string; wSleep: number; wBedtime: string; wStress: number; wRecovery: number;
  wBehaviors: string[]; wMotivation: number; wScore: number | null;
};
interface Props { userId?: string; pendingData?: PendingData | null; initialRole?: Role }

/* Variante A : Signup juste après les pain points, avant le Score (voir plan onboarding v2). */
/* Paywall (2 écrans) → Célébration → Activation, identique dans toutes les variantes/paths
   (2026-07-19) : wellness_q/wellness_reveal (sportif) et invite_team (coach) ne sont plus dans
   les tableaux statiques ci-dessous — ce sont des étapes "payeurs seulement", insérées
   dynamiquement après celebration une fois trial_started réussi (voir getPath()/paidExtras). */
const ATHLETE_PATH: StepId[] = [
  "value_intro", "role",
  "frustration_2a",
  "overload_2a", "planning_2a", "fatigue_2a",
  "account",
  "autoreg_score",
  "concept_autoreg",
  "sport_2a", "level_2a", "goal_2a", "days_2a",
  "profile_recap",
  "week_preview_2a",
  "paywall_priming", "paywall_form",
  "celebration",
];
const COACH_PATH: StepId[] = [
  "value_intro", "role",
  "challenge_2b",
  "overload_2b", "planning_time_2b", "fatigue_2b",
  "account",
  "autoreg_score_coach",
  "concept_autoreg",
  "sport_2a", "level_2a", "goal_2a", "days_2a",
  "profile_recap",
  "week_preview_2b",
  "paywall_priming", "paywall_form",
  "celebration",
];

const POST_PROGRESS: StepId[] = ["value_intro", "wellness_q", "wellness_reveal", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "profile_recap", "invite_team", "paywall_priming", "paywall_form", "week_preview_2a", "week_preview_2b"];

const DARK_STEPS: StepId[] = ["value_intro", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "wellness_reveal"];
/* week_preview_2a/2b restent en fond clair (page) : leur héros sombre est géré localement par
   WeekPreviewStep, qui reçoit aussi la frise en prop pour l'afficher dans ce même bloc sombre. */
const FRISE_INLINE_STEPS: StepId[] = ["week_preview_2a", "week_preview_2b"];

/* Frise 3 étapes (Profil/Programme/Formule) — regroupe les steps réels par phase pour calculer
   une progression persistante même sur les écrans historiquement masqués par POST_PROGRESS
   (autoreg_score, profile_recap, week_preview, paywall_*). Filtré par le `path` actif pour rester
   cohérent avec les variantes (programme claimé, A/B court, etc.) qui sautent certains steps. */
const PHASE_1_STEPS: StepId[] = ["role", "frustration_2a", "challenge_2b", "overload_2a", "overload_2b", "planning_2a", "planning_time_2b", "fatigue_2a", "fatigue_2b", "account", "autoreg_score", "autoreg_score_coach", "concept_autoreg"];
const PHASE_2_STEPS: StepId[] = ["sport_2a", "level_2a", "goal_2a", "days_2a", "profile_recap", "week_preview_2a", "week_preview_2b"];
const PHASE_3_STEPS: StepId[] = ["paywall_priming", "paywall_form"];
const HIDE_FRISE_STEPS: StepId[] = ["value_intro", "celebration"];

/* Rendu de la frise, extrait en composant pour pouvoir être affiché soit à sa position par défaut
   (au-dessus du step), soit injecté par WeekPreviewStep dans son propre héros sombre. */
function ProgressFrise({ currentPhase, pct, dark }: { currentPhase: number; pct: number[]; dark: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
      {["Profil", "Programme", "Formule"].map((label, i) => (
        <div key={label} style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 8, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            color: i === currentPhase ? (dark ? "#ff8a55" : "#d44000") : (dark ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.35)"),
            opacity: i < currentPhase ? (dark ? 0.85 : 0.55) : 1,
          }}>
            {i + 1} · {label}
          </div>
          <div style={{ height: 3, borderRadius: 2, background: dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.10)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, background: "#d44000", width: `${Math.round(pct[i] * 100)}%`, transition: "width .3s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Variante A programme claimé : même repositionnement du Signup que ATHLETE_PATH/COACH_PATH. */
const PROGRAM_ATHLETE_PATH: StepId[] = [
  "value_intro", "role",
  "frustration_2a", "overload_2a", "planning_2a", "fatigue_2a",
  "account",
  "autoreg_score",
  "concept_autoreg",
  "profile_recap", "paywall_priming", "paywall_form", "celebration",
];
const PROGRAM_COACH_PATH: StepId[] = [
  "value_intro", "role",
  "challenge_2b", "overload_2b", "planning_time_2b", "fatigue_2b",
  "account",
  "autoreg_score_coach",
  "concept_autoreg",
  "profile_recap", "paywall_priming", "paywall_form", "celebration",
];

/* Variante B (bras "test" de l'A/B short-onboarding-signup) : Signup dès le tout début, juste
   après Rôle — profil encore vide à ce stade. Garde ensuite le diagnostic complet (contrairement
   à l'ancien bras test qui sautait direct au paywall) : voir plan onboarding v2, "Pivot A/B". */
const SHORT_ATHLETE_PATH: StepId[] = [
  "value_intro", "role", "account",
  "frustration_2a",
  "overload_2a", "planning_2a", "fatigue_2a",
  "autoreg_score",
  "concept_autoreg",
  "sport_2a", "level_2a", "goal_2a", "days_2a",
  "profile_recap",
  "week_preview_2a",
  "paywall_priming", "paywall_form",
  "celebration",
];
const SHORT_COACH_PATH: StepId[] = [
  "value_intro", "role", "account",
  "challenge_2b",
  "overload_2b", "planning_time_2b", "fatigue_2b",
  "autoreg_score_coach",
  "concept_autoreg",
  "sport_2a", "level_2a", "goal_2a", "days_2a",
  "profile_recap",
  "week_preview_2b",
  "paywall_priming", "paywall_form",
  "celebration",
];
/* Variante B + programme claimé : mêmes steps que PROGRAM_ATHLETE_PATH/PROGRAM_COACH_PATH
   (sport/niveau/objectif/jours déjà déduits du programme, donc absents), Signup déplacé juste
   après Rôle comme les paths courts ci-dessus. */
const SHORT_PROGRAM_ATHLETE_PATH: StepId[] = [
  "value_intro", "role", "account",
  "frustration_2a", "overload_2a", "planning_2a", "fatigue_2a",
  "autoreg_score",
  "concept_autoreg",
  "profile_recap", "paywall_priming", "paywall_form", "celebration",
];
const SHORT_PROGRAM_COACH_PATH: StepId[] = [
  "value_intro", "role", "account",
  "challenge_2b", "overload_2b", "planning_time_2b", "fatigue_2b",
  "autoreg_score_coach",
  "concept_autoreg",
  "profile_recap", "paywall_priming", "paywall_form", "celebration",
];

function getNextMonday(): string {
  const today = new Date();
  const dow = today.getDay();
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  return monday.toISOString().split("T")[0];
}

const LEVEL_DIFF_ADJ: Record<Level, number> = { beginner: -2, intermediate: 0, elite: 1 };
const LEVEL_TO_DB: Record<Level, string> = { beginner: "debutant", intermediate: "intermediaire", elite: "elite" };
const DB_TO_LEVEL: Record<string, Level> = { debutant: "beginner", intermediaire: "intermediate", avance: "elite", elite: "elite" };
const DOW_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function buildProgramTemplate(sport: string, level: Level, days: number[]): ProgramTemplate {
  const templates = getSessionTemplates(sport);
  const adj = LEVEL_DIFF_ADJ[level];
  const weeks: WeekTemplate[] = [0, 1, 2, 3].map(w => {
    const week: WeekTemplate = {};
    days.forEach((d, i) => {
      const tpl = templates[i % templates.length];
      const diff = Math.max(1, Math.min(10, tpl[2] + adj + (w === 3 ? -1 : w)));
      const dayName = DOW_NAMES[d] ?? "Lun";
      if (!week[dayName]) week[dayName] = [];
      const session: SessionTemplate = { name: tpl[0], notes: tpl[1], target_difficulty: diff, load: 2, type: "volume" };
      week[dayName].push(session);
    });
    return week;
  });
  return { weeks };
}

function computeWellnessTip(sleep: number, stress: number, recovery: number, score: number, claimed: boolean): string {
  if (score < 45) {
    return claimed
      ? "On a légèrement allégé ta première semaine pour laisser ta récupération remonter."
      : "Ta récupération est basse en ce moment — vise des séances plus courtes cette semaine, et laisse une vraie place au repos.";
  }
  const dims = [
    { value: sleep, low: "Priorise le sommeil ce soir : c'est le levier n°1 de ta récupération.", mid: "Ton sommeil est correct, mais quelques nuits plus longues t'aideraient à mieux encaisser les séances." },
    { value: 10 - stress, low: "Ton stress est élevé en ce moment — une séance plus courte ou plus douce peut suffire à souffler.", mid: "Garde un œil sur ton niveau de stress cette semaine, il pèse sur ta récupération." },
    { value: recovery, low: "Tes courbatures sont prises en compte : la progression sera douce cette semaine.", mid: "Tes muscles récupèrent doucement — un bon échauffement fera la différence." },
  ];
  const weakest = dims.reduce((a, b) => (b.value < a.value ? b : a));
  if (weakest.value <= 4) return weakest.low;
  if (weakest.value <= 6) return weakest.mid;
  if (score >= 80) return "Ta forme est excellente — ton programme démarre directement à pleine intensité.";
  return "Ton profil est équilibré : sommeil, stress et récupération sont sous contrôle. Continue comme ça.";
}

const DOW_FULL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function nextSessionDayLabel(trainingDays: number[]): string | null {
  if (!trainingDays.length) return null;
  const iso = trainingDays.map(d => nextDateForDow(d)).sort()[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "demain";
  return DOW_FULL[target.getDay()];
}

const SPORT_CATEGORIES = [
  { id: "Force & puissance",      icon: "💪", sub: "Haltérophilie, powerlifting, CrossFit…" },
  { id: "Athlétisme & vitesse",   icon: "🏃", sub: "Sprint, saut, lancer…" },
  { id: "Sports collectifs",      icon: "🏉", sub: "Rugby, handball, basket, foot…" },
  { id: "Endurance",              icon: "🚴", sub: "Course, cyclisme, natation…" },
  { id: "Arts martiaux & combat", icon: "🥋", sub: "Judo, MMA, boxe…" },
  { id: "Autre",                  icon: "⚡", sub: "Autre discipline" },
];

const SPORT_QUALITIES: Record<string, string> = {
  "Force & puissance":      "Force maximale, puissance explosive, technique de charge",
  "Athlétisme & vitesse":   "Vitesse, explosivité, technique de course",
  "Sports collectifs":      "Répétition d'efforts, agilité, puissance",
  "Endurance":               "Endurance aérobie, gestion du seuil, récupération active",
  "Arts martiaux & combat": "Endurance spécifique combat, explosivité, mobilité articulaire",
  "Autre":                   "Qualités physiques adaptées à ta discipline",
};

const SPORT_SESSION_TYPES: Record<string, string> = {
  "Force & puissance":      "Alternance de séances de charge lourde et de séances techniques ou explosives.",
  "Athlétisme & vitesse":   "Séances de vitesse pure, travail technique de course, et fond léger en complément.",
  "Sports collectifs":      "Séances à intensité variable : répétition d'efforts, agilité, et récupération active.",
  "Endurance":               "Alternance de sorties longues à allure modérée et de séances de fractionné plus intense.",
  "Arts martiaux & combat": "Séances techniques, travail au sac, et rounds à intensité croissante.",
  "Autre":                   "Séances variées, adaptées à ta discipline et à ton objectif.",
};

const BEDTIME_OPTIONS = [
  { value: "before22", label: "Avant 22h" },
  { value: "22to23",   label: "22h–23h" },
  { value: "23to00",   label: "23h–minuit" },
  { value: "00to01",   label: "Minuit–1h" },
  { value: "after01",  label: "Après 1h" },
];

const NEGATIVE_BEHAVIORS = [
  { key: "alcohol",       emoji: "🍷", label: "Alcool" },
  { key: "late_sleep",    emoji: "🌙", label: "Couché tardif" },
  { key: "tobacco",       emoji: "🚬", label: "Tabac" },
  { key: "screen_late",   emoji: "📱", label: "Écran tard" },
  { key: "heavy_meal",    emoji: "🍔", label: "Repas lourd" },
  { key: "caffeine_late", emoji: "☕", label: "Caféine tard" },
  { key: "social_out",    emoji: "🎉", label: "Sortie sociale" },
  { key: "travel",        emoji: "✈️", label: "Voyage" },
];

const POSITIVE_BEHAVIORS = [
  { key: "stretching",  emoji: "🧘",   label: "Stretching" },
  { key: "cold_shower", emoji: "🧊",   label: "Douche froide" },
  { key: "reading",     emoji: "📖",   label: "Lecture" },
  { key: "meditation",  emoji: "🧘‍♂️", label: "Méditation" },
  { key: "hydration",   emoji: "💧",   label: "Bonne hydratation" },
  { key: "walk",        emoji: "🚶",   label: "Marche détente" },
];

function buildAthleteSessions(userId: string, sport: string, level: Level, days: number[]) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, elite: 8 };
  const dow = days.length > 0 ? days : [1, 3, 5];

  // Planifier sur la semaine en cours ET la semaine suivante
  // Semaine en cours = lundi de cette semaine. Utilise les dates locales pour éviter le décalage UTC.
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;

  const dateForDow = (d: number, weekOffset: number): string => {
    const offsetFromMonday = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offsetFromMonday + weekOffset * 7);
    const y = result.getFullYear();
    const m = String(result.getMonth() + 1).padStart(2, "0");
    const day = String(result.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const sessions: object[] = [];
  for (const weekOffset of [0, 1]) {
    dow.forEach((d, i) => {
      const [name, notes] = templates[i % templates.length];
      sessions.push({ user_id: userId, date: dateForDow(d, weekOffset), name, notes: `${notes}\nDifficulté cible : ${rpe[level]}`, done: false, target_difficulty: rpe[level] });
    });
    if (days.length < 6) {
      const rec = dow.includes(0) ? 2 : 0;
      sessions.push({ user_id: userId, date: dateForDow(rec, weekOffset), name: "Récupération active", notes: "Marche ou vélo facile 25–35 min\nMobilité 10 min\nObjectif : faire redescendre la fatigue", done: false, target_difficulty: 3 });
    }
  }
  return sessions;
}

function buildWellnessBaseline(userId: string, level: Level) {
  const bonus = level === "elite" ? 4 : 0;
  const base  = Math.max(35, 74 + bonus);
  const today = new Date().toISOString().split("T")[0];
  return { user_id: userId, date: today, sleep: 7, stress: 5, recovery: 6, motivation: 7, base_score: base, score: base, behaviors: [] };
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildAthleteHistory(userId: string, sport: string, level: Level, days: number[]) {
  const templates = getSessionTemplates(sport);
  const rpe: Record<Level, number> = { beginner: 5, intermediate: 7, elite: 8 };
  const dow = days.length > 0 ? days : [1, 3, 5];
  const targetRpe = rpe[level];
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;

  const sessions: object[] = [];
  for (let weekOffset = -4; weekOffset <= -1; weekOffset++) {
    dow.forEach((d, i) => {
      const offsetFromMonday = d === 0 ? 6 : d - 1;
      const result = new Date(today);
      result.setDate(today.getDate() + daysToCurrentMonday + offsetFromMonday + weekOffset * 7);
      if (result >= today) return;
      const sessionRpe = Math.max(1, Math.min(10, targetRpe + Math.round((Math.random() - 0.5) * 4)));
      const duration = 45 + Math.round(Math.random() * 30);
      const [name, notes] = templates[i % templates.length];
      sessions.push({ user_id: userId, date: toIso(result), name, notes: `${notes}\nDifficulté cible : ${targetRpe}`, done: true, target_difficulty: targetRpe, rpe: sessionRpe, duration });
    });
  }

  const wellnessRows: object[] = [];
  const baseScore = level === "elite" ? 74 : level === "intermediate" ? 70 : 65;
  for (let i = 28; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const sleep = Math.max(4, Math.min(10, 7 + Math.round((Math.random() - 0.5) * 4)));
    const stress = Math.max(1, Math.min(10, 5 + Math.round((Math.random() - 0.5) * 4)));
    const recovery = Math.max(3, Math.min(10, 6 + Math.round((Math.random() - 0.5) * 4)));
    const motivation = Math.max(4, Math.min(10, 7 + Math.round((Math.random() - 0.5) * 4)));
    const variation = Math.round((Math.random() - 0.5) * 16);
    const score = Math.max(30, Math.min(95, baseScore + variation));
    wellnessRows.push({ user_id: userId, date: toIso(d), sleep, stress, recovery, motivation, behaviors: [], bedtime: "23to00", base_score: score, score });
  }

  return { sessions, wellnessRows };
}

function buildCoachDemoSessions(coachId: string, athleteId: string, sport: string, rpeBase: number) {
  const templates = getSessionTemplates(sport);
  const today = new Date();
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const dateForDow = (d: number, weekOffset: number): string => {
    const offset = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
    return toIso(result);
  };
  const sessions: object[] = [];

  // 4 semaines passées
  for (let weekOffset = -4; weekOffset <= -1; weekOffset++) {
    [1, 3, 5, 6].forEach((d, i) => {
      const offset = d === 0 ? 6 : d - 1;
      const result = new Date(today);
      result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
      if (result >= today) return;
      const sessionRpe = Math.max(1, Math.min(10, rpeBase + Math.round((Math.random() - 0.5) * 4)));
      const duration = 45 + Math.round(Math.random() * 30);
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: toIso(result), name, notes, done: true, target_difficulty: rpeBase, rpe: sessionRpe, duration });
    });
  }

  // 2 semaines futures (S0 + S1)
  const scheduledDays = [1, 3, 5, 6];
  for (const weekOffset of [0, 1]) {
    scheduledDays.forEach((d, i) => {
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: dateForDow(d, weekOffset), name, notes, done: false, target_difficulty: rpeBase });
    });
  }

  // Garantir une séance aujourd'hui pour le coach control (filtre hasSessions)
  if (!scheduledDays.includes(todayDow)) {
    const [name, notes] = templates[0];
    sessions.push({ coach_id: coachId, athlete_id: athleteId, date: today.toISOString().split("T")[0], name, notes, done: false, target_difficulty: rpeBase });
  }

  return sessions;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: "block", flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/* ── sub-components ── */
function Choice({ icon, title, sub, selected, onClick }: { icon: string; title: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer", borderRadius: 14, padding: "18px 16px", minHeight: 24, display: "flex", flexDirection: "column", justifyContent: "center", border: selected ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,.10)", background: selected ? "rgba(212,64,0,.05)" : "#fff", boxShadow: selected ? "none" : "0 2px 8px rgba(0,0,0,.03)", transition: "all .15s" }}>
      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: sub ? 4 : 0, color: selected ? "#d44000" : "#1f2428" }}>
        {icon}{icon ? " " : ""}{title}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

function ProfileRecapStep({
  role, sport, sportLabel, sportIcon, showLevel, level, goalLower, showDays, trainingDays, claimedProgramName, hasPreviewNext, onNext,
}: {
  role: Role; sport: string; sportLabel: string; sportIcon: string; showLevel: boolean; level: Level; goalLower: string;
  showDays: boolean; trainingDays: number[]; claimedProgramName?: string | null;
  hasPreviewNext: boolean; onNext: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "reveal">("loading");
  useEffect(() => {
    const t = setTimeout(() => setPhase("reveal"), 1400);
    return () => clearTimeout(t);
  }, []);
  const accent: React.CSSProperties = { color: "#d44000", fontWeight: 800 };
  const qualities = SPORT_QUALITIES[sport] || SPORT_QUALITIES["Autre"];
  const sessionTypes = SPORT_SESSION_TYPES[sport] || SPORT_SESSION_TYPES["Autre"];

  return (
    <div>
      <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 16 }}>{sportIcon}</div>
      <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 16 }}>Ton programme d&apos;entraînement</div>
      <div style={{ fontSize: 16, color: "#3a3f44", lineHeight: 1.65, marginBottom: 20 }}>
        {role === "coach" ? "On prépare un premier programme " : "On prépare ton programme "}
        <span style={accent}>{claimedProgramName || sportLabel}</span>
        {showLevel && <>, niveau <span style={accent}>{LEVEL_LABELS[level]}</span></>}
        {goalLower && <>, pour <span style={accent}>{goalLower}</span></>}
        {showDays && <> — à raison de <span style={accent}>{trainingDays.length} jour{trainingDays.length > 1 ? "s" : ""} par semaine</span></>}
        .
      </div>
      <div style={{ background: "#fff", borderRadius: 18, padding: "18px 18px 16px", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 2px 12px rgba(0,0,0,.04)", marginBottom: 28, textAlign: "left" }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: "#d44000", textTransform: "uppercase", marginBottom: 8 }}>
          Ce que ce programme travaille
        </div>
        <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428", marginBottom: 8 }}>
          {qualities}
        </div>
        <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.55 }}>
          Réparti sur {trainingDays.length || 4} jour{(trainingDays.length || 4) > 1 ? "s" : ""} par semaine, avec une charge qui s&apos;ajuste {role === "coach" ? "au niveau de forme de tes sportifs" : "à ton niveau de forme"} au fil des séances. {sessionTypes}
        </div>
      </div>
      {phase === "loading" ? (
        <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#62686e" }}>
            {role === "coach" ? "Génération du programme…" : "Génération de ton programme…"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#d44000", animation: `profileRecapPulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.7 }} />
            ))}
          </div>
          <style>{`
            @keyframes profileRecapPulse {
              0%, 100% { transform: scale(1); opacity: 0.5; }
              50% { transform: scale(1.4); opacity: 1; }
            }
          `}</style>
        </div>
      ) : (
        <div style={{ animation: "modalIn 0.3s cubic-bezier(0.2,0,0,1)" }}>
          <Actions onNext={onNext} nextLabel={hasPreviewNext ? "Voir mon programme →" : "Continuer →"} />
        </div>
      )}
    </div>
  );
}

function ProgressComparisonChart() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);
  const withoutPath = "M0,100 C30,96 55,92 85,94 C115,96 140,85 165,88 C195,91 225,80 255,82 C280,84 300,74 320,72";
  const withPath = "M0,100 C40,92 70,60 110,48 C150,36 190,20 230,14 C260,10 290,4 320,2";
  return (
    <div style={{ marginBottom: 28 }}>
      <svg width="100%" viewBox="0 0 320 130" style={{ display: "block", overflow: "visible" }}>
        <path d={withoutPath} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={2.5} strokeDasharray="5 4" strokeLinecap="round" />
        <path
          d={withPath} fill="none" stroke="#ff6b2b" strokeWidth={3.5} strokeLinecap="round"
          style={{
            strokeDasharray: 460,
            strokeDashoffset: visible ? 0 : 460,
            transition: "stroke-dashoffset 1.1s cubic-bezier(0.4,0,0.2,1)",
            filter: "drop-shadow(0 0 6px rgba(255,107,43,.5))",
          }}
        />
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff6b2b" }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.75)" }}>Avec ThePerfClub</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,.3)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)" }}>Programme rigide</span>
        </div>
      </div>
    </div>
  );
}

function CoachBlindSpotWheel() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);
  const size = 200, r = 82, cx = size / 2, cy = size / 2, strokeWidth = 20;
  const circumference = 2 * Math.PI * r;
  const trainingLen = circumference / 6;
  const restLen = circumference - trainingLen;
  const dims = ["⚡ Énergie", "😴 Sommeil", "🍽️ Diet", "💭 Émotions", "😓 Stress"];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 18, marginBottom: 16, fontSize: 11, fontWeight: 800 }}>
        <span style={{ color: "rgba(255,255,255,.5)" }}>Ce que l&apos;athlète vit</span>
        <span style={{ color: "#ff6b2b" }}>Ce que le coach voit</span>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={strokeWidth}
          strokeDasharray={`${visible ? restLen : 0} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke="#ff6b2b" strokeWidth={strokeWidth}
          strokeDasharray={`${visible ? trainingLen : 0} ${circumference}`}
          strokeDashoffset={-restLen}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1) 0.2s", filter: "drop-shadow(0 0 8px rgba(255,107,43,.5))" }}
        />
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 16 }}>
        {dims.map(l => (
          <span key={l} style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.55)", background: "rgba(255,255,255,.06)", padding: "5px 10px", borderRadius: 999 }}>{l}</span>
        ))}
        <span style={{ fontSize: 11, fontWeight: 800, color: "#ff6b2b", background: "rgba(255,107,43,.12)", padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(255,107,43,.3)" }}>🏋️ Entraînement</span>
      </div>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(212,64,0,.10)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#d44000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function EmailSentScreen({ email }: { email: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
      <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 8 }}>Vérifie tes emails</div>
      <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.6, marginBottom: 18 }}>
        On a envoyé un lien à <strong>{email}</strong>.<br />
        Clique dessus pour activer ton compte et accéder à ton espace.
      </div>
      <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-block", padding: "12px 24px", borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        Ouvrir Gmail →
      </a>
    </div>
  );
}

const LEVEL_LABELS: Record<Level, string> = { beginner: "Débutant", intermediate: "Intermédiaire", elite: "Compétiteur" };
const FREQ_LABELS: Record<number, string>  = { 2: "1–2 séances/semaine", 3: "3–4 séances/semaine", 5: "5–6 séances/semaine", 7: "7 séances ou plus/semaine" };

/* Insights du comparatif paywall_priming (2026-07-27) — la colonne "avant" affichait le texte
   littéral des options de questionnaire (ex. "Non, je maîtrise toujours mon intensité"), qui n'a
   plus de sens hors du contexte de la question d'origine. Ces tables reformulent chaque réponse
   possible en une phrase d'insight autonome, compréhensible sans connaître la question posée. */
const FRUSTRATION_INSIGHTS: Record<string, string> = {
  "Les programmes sont trop rigides, pas adaptés à mon état du jour": "Tes programmes actuels restent rigides, sans s'adapter à ta forme du jour.",
  "Je ne sais pas quand forcer et quand récupérer": "Tu manques de repères clairs pour savoir quand pousser et quand récupérer.",
  "Je manque de structure et de suivi": "Ton entraînement manque de structure et de suivi dans la durée.",
  "Je perds du temps sans progresser vraiment": "Tu investis du temps à l'entraînement sans progression réelle à la clé.",
};
const OVERLOAD_INSIGHTS: Record<string, string> = {
  "Non, je maîtrise toujours mon intensité": "Tu gères ton intensité au feeling, sans donnée objective pour la confirmer.",
  "Parfois, mais je sais m'arrêter": "Il t'arrive de pousser au-delà du prévu, sans toujours mesurer l'écart.",
  "Souvent, je pousse quand j'y suis": "Tu pousses souvent plus fort que prévu, porté par le moment.",
  "Tout le temps, j'envoie tout à chaque fois": "Tu donnes tout à chaque séance, sans jauge pour savoir si c'est utile ou excessif.",
};
const FATIGUE_INSIGHTS: Record<string, string> = {
  "Non, je sais récupérer quand il le faut": "Tu sais lever le pied, mais sans repère objectif pour valider ce choix.",
  "Parfois, si la séance est importante": "Face à une séance importante, tu passes outre la fatigue sans mesurer l'impact réel.",
  "Souvent, la fatigue ne change pas mon plan": "La fatigue change rarement ton plan d'entraînement, même quand elle s'accumule.",
  "Tout le temps, je pousse quoi qu'il arrive": "Tu pousses systématiquement, quelle que soit ta fatigue du moment.",
};
const COACHING_CHALLENGE_INSIGHTS: Record<string, string> = {
  "Suivre la charge collective de mes sportifs": "Suivre la charge de chacun de tes sportifs au quotidien prend un temps que tu n'as pas toujours.",
  "Personnaliser l'entraînement par sportif": "Personnaliser vraiment l'entraînement de chaque sportif reste chronophage au quotidien.",
  "Créer des programmes facilement": "Construire des programmes sur mesure pour chaque sportif prend plus de temps que tu ne voudrais.",
  "Communiquer efficacement avec mes sportifs": "Communiquer efficacement avec chacun de tes sportifs, individuellement, reste difficile à tenir dans la durée.",
  "Trop d'outils différents, pas assez de temps": "Jongler entre plusieurs outils différents te fait perdre un temps précieux.",
};
const OVERLOAD_COACH_INSIGHTS: Record<string, string> = {
  "Rarement, ils respectent bien la charge prévue": "Tes sportifs respectent globalement la charge prévue, mais sans donnée pour le confirmer objectivement.",
  "Parfois, quelques cas isolés": "Quelques sportifs dépassent parfois la charge prévue, sans que tu le voies venir à chaque fois.",
  "Souvent, le RPE réel dépasse régulièrement": "Le RPE réel de tes sportifs dépasse régulièrement ce qui était prévu, souvent sans que tu le saches sur le moment.",
  "Très souvent, c'est un problème récurrent": "Le dépassement de charge est un problème récurrent chez tes sportifs, difficile à anticiper.",
};
const FATIGUE_COACH_INSIGHTS: Record<string, string> = {
  "Non, je m'adapte toujours au ressenti": "Tu t'adaptes déjà au ressenti de tes sportifs, mais sans données de récupération pour objectiver tes ajustements.",
  "Parfois, selon la période du cycle": "Selon la période du cycle, tu ajustes au ressenti, sans toujours voir la fatigue venir à temps.",
  "Souvent, difficile de modifier le plan en cours": "Modifier le plan en cours de cycle reste souvent difficile, faute de signal clair de fatigue.",
  "Oui, je préfère maintenir le programme prévu": "Tu préfères maintenir le programme prévu, même quand la fatigue d'un sportif mériterait un ajustement.",
};

/* ── main ── */
export default function OnboardingFlow({ userId, pendingData, initialRole }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  /* Une continuation Google (pendingData) a déjà un userId (compte créé), mais c'est toujours
     une inscription en cours — pas un ancien compte incomplet qui revient plus tard. Sans ce
     cas, ces sessions basculaient en "mode auth" (CTA explicite) sur les étapes de sélection
     qui suivent, au lieu de l'auto-advance au tap attendu en inscription. */
  const isRegisterMode = !userId || !!pendingData;
  /* Largeur de colonne responsive (2026-07-27) — même formule que OnboardingBackground.tsx/
     Actions.tsx, pour que les 2 footers fixed rendus directement ici (wellness_q, paywall_form)
     restent alignés avec le contenu au lieu de rester figés à 560px pendant que la page
     s'élargit sur desktop/tablette. */
  const { isMd: colIsMd, isLg: colIsLg } = useBreakpoint();
  const colMaxWidth = colIsLg ? 720 : colIsMd ? 640 : 560;
  const [hasClaimedProgram, setHasClaimedProgram] = useState<boolean | null>(null);

  /* A/B test "short-onboarding-signup" : bras "test" = SHORT_ATHLETE_PATH/SHORT_COACH_PATH,
     paywall immédiat après le compte. `null` tant que non verrouillé — getPath() retombe alors
     sur le comportement actuel (aucun risque de path indéterminé). Éligible dès qu'un nouveau
     compte est en train d'être créé (register direct ou continuation Google via pendingData) ;
     override dev/support via ?ab=test|control car posthog.init() est skip en dev (PostHogProvider.tsx). */
  const rawVariant = useFeatureFlagVariantKey("short-onboarding-signup");
  const [assignedVariant, setAssignedVariant] = useState<"control" | "test" | null>(null);
  const abEligible = isRegisterMode;
  useEffect(() => {
    if (assignedVariant || !abEligible) return;
    const forced = new URLSearchParams(window.location.search).get("ab");
    if (forced === "test" || forced === "control") { setAssignedVariant(forced); return; }
    if (rawVariant === "test" || rawVariant === "control") setAssignedVariant(rawVariant);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVariant, abEligible]);
  useEffect(() => {
    if (assignedVariant) posthog.setPersonProperties({ ab_variant: assignedVariant });
  }, [assignedVariant]);

  /* value_intro est désormais toujours l'étape 0 (avant role, étape 1) dans tous les paths —
     un ?role= prefill doit sauter le step Rôle (index 1) mais pas le pitch value (index 0). */
  /* ?dbgstep=N (outil de dev/support, comme ?ab=test|control) : démarre directement à l'index N
     du path courant plutôt que de rejouer tout le flow — pratique pour cibler un écran précis en
     local. Index = position dans le tableau du path actif (variante A/B, claimed ou non). */
  const [stepIdx, setStepIdx] = useState(() => {
    if (typeof window !== "undefined") {
      const dbg = new URLSearchParams(window.location.search).get("dbgstep");
      if (dbg) return parseInt(dbg, 10);
    }
    return initialRole ? 2 : 0;
  });
  /* Posé une seule fois, au succès de trial_started dans paywall_form — insère l'activation
     (wellness_q/wellness_reveal ou invite_team) après celebration, voir getPath(). */
  const [paidExtras, setPaidExtras] = useState<StepId[] | null>(null);
  const [role, setRole]       = useState<Role>(pendingData?.role || initialRole || "athlete");
  const [roleChosen, setRoleChosen] = useState(!!(pendingData?.role || initialRole));
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [claimedProgramName, setClaimedProgramName] = useState<string | null>(null);
  const [claimedProgramWeeks, setClaimedProgramWeeks] = useState<number | null>(null);

  /* invite_team */
  const [inviteEmail, setInviteEmail] = useState("");
  const [extraInviteEmails, setExtraInviteEmails] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<"linked" | "pending" | null>(null);
  const [inviteSentCount, setInviteSentCount] = useState(0);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  /* questionnaire */
  const [sport, setSport]                         = useState(pendingData?.sport || "Force & puissance");
  const [sportPrecision, setSportPrecision]       = useState(pendingData?.sportPrecision || "");
  const [level, setLevel]                         = useState<Level>(pendingData?.level || "intermediate");
  const [goal, setGoal]                           = useState(pendingData?.goal || "");
  const [frustration, setFrustration]             = useState(pendingData?.frustration || "");
  const [trainingDays, setTrainingDays]           = useState<number[]>(pendingData?.trainingDays ?? [1, 3, 5]);
  const [coachingContext, setCoachingContext]     = useState(pendingData?.coachingContext || "");
  const [athleteCount, setAthleteCount]           = useState(pendingData?.athleteCount || "");
  const [coachingChallenge, setCoachingChallenge] = useState(pendingData?.coachingChallenge || "");
  const [currentTool, setCurrentTool]             = useState(pendingData?.currentTool || "");

  /* account */
  const [name, setName]         = useState(pendingData?.name || "");
  const [email, setEmail]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emailSent, setEmailSent]   = useState(false);

  /* value_slides */
  const [vSlide, setVSlide] = useState(0);
  const vSlideSwipeStartX = useRef<number | null>(null);

  /* pain point answers — athlete */
  const [overloadAns, setOverloadAns] = useState("");
  const [planningAns, setPlanningAns] = useState("");
  const [fatigueAns, setFatigueAns]   = useState("");
  /* pain point answers — coach */
  const [overloadCoachAns, setOverloadCoachAns] = useState("");
  const [planningCoachAns, setPlanningCoachAns] = useState("");
  const [fatigueCoachAns, setFatigueCoachAns]   = useState("");

  /* wellness sub-steps */
  const WQ_TOTAL = 5;
  const [wStep, setWStep]           = useState(0);
  const [wSleep, setWSleep]         = useState(pendingData?.wSleep ?? 7);
  const [wBedtime, setWBedtime]     = useState(pendingData?.wBedtime || "23to00");
  const [wStress, setWStress]       = useState(pendingData?.wStress ?? 5);
  const [wRecovery, setWRecovery]   = useState(pendingData?.wRecovery ?? 7);
  const [wBehaviors, setWBehaviors] = useState<string[]>(pendingData?.wBehaviors || []);
  const [wMotivation, setWMotivation] = useState(pendingData?.wMotivation ?? 8);
  const [wScore, setWScore]           = useState<number | null>(pendingData?.wScore ?? null);
  const [wellnessTip, setWellnessTip] = useState<string | null>(null);
  const [wSaving, setWSaving]         = useState(false);

  /* initializing — true quand on arrive depuis Google OAuth avec pendingData */
  const [initializing, setInitializing] = useState(!!pendingData);
  const [googleInitDone, setGoogleInitDone] = useState(false);

  /* iOS Safari n'expose PushManager que si le site est ajouté à l'écran d'accueil — calculé
     une fois au montage (window/navigator indisponibles côté SSR malgré "use client"). */
  const [pushBlockedIOS, setPushBlockedIOS] = useState(false);
  useEffect(() => { setPushBlockedIOS(needsInstallForPush()); }, []);

  /* auto-advance guard */
  const advancingRef = useRef(false);
  /* guard contre double-clic sur les CTA de fin de step (finishAthleteActivation / invite_team) — évite un double claim+assign et un stepIdx qui dépasse path.length (écran blanc) */
  const finishGuardRef = useRef(false);
  /* guard contre un double déclenchement de completeProfile()/finishCoachClaim() à l'entrée de profile_recap (voir effet dédié plus bas) */
  const profileCompleteGuardRef = useRef(false);

  function toggleBehavior(key: string) {
    setWBehaviors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const getPath = (r: Role): StepId[] => {
    let base: StepId[];
    if (assignedVariant === "test") {
      base = hasClaimedProgram ? (r === "coach" ? SHORT_PROGRAM_COACH_PATH : SHORT_PROGRAM_ATHLETE_PATH) : (r === "coach" ? SHORT_COACH_PATH : SHORT_ATHLETE_PATH);
    } else if (hasClaimedProgram) {
      base = r === "coach" ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH;
    } else {
      base = r === "coach" ? COACH_PATH : ATHLETE_PATH;
    }
    /* Activation (wellness_q/wellness_reveal sportif, invite_team coach) réservée aux payeurs :
       insérée après "celebration" seulement une fois trial_started réussi (voir paidExtras,
       posé dans paywall_form au succès du paiement). */
    if (!paidExtras) return base;
    const celebIdx = base.indexOf("celebration");
    if (celebIdx === -1) return base;
    return [...base.slice(0, celebIdx + 1), ...paidExtras];
  };
  const path         = getPath(role);
  /* Filet de sécurité : si stepIdx dépasse jamais path.length (double-invocation d'un handler,
     changement de path non anticipé…), on ne rend jamais un currentStep undefined — écran
     blanc et irrécupérable sinon, confirmé en prod via des sessions PostHog qui s'arrêtaient
     net juste après account_created avec onboarding_undefined_viewed. */
  const safeStepIdx  = Math.min(stepIdx, path.length - 1);
  const currentStep  = path[safeStepIdx];
  const isLast       = safeStepIdx === path.length - 1;

  useEffect(() => {
    if (stepIdx > path.length - 1) setStepIdx(path.length - 1);
  }, [path.length, stepIdx]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimParam = params.get("claim");
    if (claimParam && !localStorage.getItem("claim_program_id")) {
      localStorage.setItem("claim_program_id", claimParam);
    }
    const claimId = localStorage.getItem("claim_program_id");
    const claimed = !!claimId;
    setHasClaimedProgram(claimed);
    if (claimed) {
      posthog.setPersonProperties({ onboarding_source: "program", claimed_program_id: claimId });
      posthog.capture("program_onboarding_start", { program_id: claimId });
      fetch(`/api/programs/${claimId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          if (data.sport) setSport(data.sport);
          if (data.level && DB_TO_LEVEL[data.level]) setLevel(DB_TO_LEVEL[data.level]);
          if (data.name) setClaimedProgramName(data.name);
          if (data.weeks_count) setClaimedProgramWeeks(data.weeks_count);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialRole) {
      const syntheticProps = { step: "role", step_index: 0, role: initialRole, mode: isRegisterMode ? "register" : "auth" };
      posthog.capture("onboarding_step_viewed", syntheticProps);
      posthog.capture("onboarding_role_viewed", syntheticProps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const props = {
      step: currentStep,
      step_index: stepIdx,
      role: currentStep === "role" ? "selecting" : (role || "unknown"),
      mode: isRegisterMode ? "register" : "auth",
      ab_variant: assignedVariant ?? "pending",
    };
    posthog.capture("onboarding_step_viewed", props);
    posthog.capture(`onboarding_${currentStep}_viewed`, props);
    advancingRef.current = false;
    finishGuardRef.current = false;
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== "value_intro") return;
    /* role pas encore connu à ce step (value_intro précède désormais role) — pas taggé ici. */
    posthog.capture("onboarding_value_intro_slide_viewed", { slide: vSlide });
  }, [vSlide, currentStep]);

  /* Le Signup (step "account") arrive désormais avant la fin du diagnostic dans les 2 variantes —
     sport/niveau/objectif/jours ne sont connus qu'à l'entrée de profile_recap. C'est ici que le
     profil est complété (sessions, wellness baseline, démo coach) et que finishCoachClaim() peut
     enfin trouver un coach_athlete à assigner (créés par completeProfile() juste avant). */
  useEffect(() => {
    if (currentStep !== "profile_recap" || profileCompleteGuardRef.current) return;
    profileCompleteGuardRef.current = true;
    const uid = userId || newUserId;
    if (!uid) return;
    (async () => {
      await completeProfile(uid);
      if (role === "coach") await finishCoachClaim(uid);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  /* Depuis le réordonnancement Paywall → Célébration → Activation, la dernière étape du path
     est désormais wellness_q/wellness_reveal (sportif) ou invite_team (coach) — plus celebration.
     Un appel à next() une fois sur cette dernière étape termine donc réellement l'onboarding. */
  function next() {
    if (!isLast) { setStepIdx(i => i + 1); return; }
    window.location.href = role === "coach" ? "/coach" : "/today";
  }

  function nextAfterChoice(setter: () => void) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setter();
    setTimeout(() => next(), 300);
  }

  /* Compte créé au step "account" — désormais positionné avant la fin du diagnostic dans les
     2 variantes (juste après les pain points en A, juste après Rôle en B) : sport/niveau/objectif/
     jours ne sont pas encore connus à ce moment-là. N'upsert que ce qui est déjà collecté ;
     complete Profile() referme le reste une fois le diagnostic terminé (déclenché à l'entrée de
     profile_recap, voir l'effet dédié plus bas). */
  async function createAccount(uid: string) {
    await supabase.from("profiles").upsert({
      user_id: uid,
      ...(name.trim() ? { name: name.trim() } : {}),
      mode: role,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
    }, { onConflict: "user_id" });
  }

  async function completeProfile(uid: string) {
    const sportValue = sport === "Autre" && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport;
    await supabase.from("profiles").upsert({
      user_id: uid,
      sport: sportValue, mode: role,
      freq_target:        trainingDays.length || null,
      training_days:      trainingDays.length ? trainingDays : null,
      objective:          goal || null,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
    }, { onConflict: "user_id" });

    if (role === "athlete") {
      const { sessions: pastSessions, wellnessRows } = buildAthleteHistory(uid, sportValue, level, trainingDays);
      await Promise.all([
        ...(!hasClaimedProgram ? [supabase.from("sessions").insert(buildAthleteSessions(uid, sportValue, level, trainingDays))] : []),
        supabase.from("sessions").insert(pastSessions),
        supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, level), { onConflict: "user_id,date" }),
        supabase.from("wellness_daily").upsert(wellnessRows, { onConflict: "user_id,date" }),
      ]);
    }
    if (role === "coach") {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      setInviteCode(code);
      await supabase.from("profiles").update({ invite_code: code }).eq("user_id", uid);

      const DEMO_ATHLETES = [
        { name: "Thomas M.", wellness_score: 82, rpeBase: 7 },
        { name: "Emma L.",   wellness_score: 67, rpeBase: 8 },
        { name: "Pierre D.", wellness_score: 43, rpeBase: 9 },
        { name: "Sofia R.",  wellness_score: 71, rpeBase: 7 },
        { name: "Lucas B.",  wellness_score: 28, rpeBase: 8 },
      ];
      const demoAthleteIds: string[] = [];
      for (const demo of DEMO_ATHLETES) {
        const { data: athlete } = await supabase
          .from("coach_athletes")
          .insert({ coach_id: uid, name: demo.name, sport: sportValue, wellness_score: demo.wellness_score, user_id: null })
          .select("id").single();
        if (athlete?.id) {
          demoAthleteIds.push(athlete.id);
          await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, athlete.id, sportValue, demo.rpeBase));
        }
      }

      // Auto-generate a program and assign to first demo athlete
      const firstAthleteId = demoAthleteIds[0];
      if (firstAthleteId && trainingDays.length > 0) {
        const template = buildProgramTemplate(sportValue, level, trainingDays);
        const { data: program } = await supabase
          .from("programs")
          .insert({
            owner_id: uid,
            name: `Programme ${sportValue} — 4 semaines`,
            sport: sportValue,
            level: LEVEL_TO_DB[level],
            weeks_count: 4,
            sessions_per_week: trainingDays.length,
            is_public: false,
            template,
          })
          .select("id")
          .single();
        if (program?.id) {
          await supabase.from("coach_sessions").delete().eq("coach_id", uid).eq("athlete_id", firstAthleteId);
          await fetch(`/api/programs/${program.id}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start_date: getNextMonday(), athlete_id: firstAthleteId }),
          });
          localStorage.setItem("program_start_date", getNextMonday());
        }
      }
    }
  }

  async function finishCoachClaim(uid: string) {
    const claimId = typeof window !== "undefined" ? localStorage.getItem("claim_program_id") : null;
    if (!claimId) return;
    try {
      const claimRes = await fetch("/api/programs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: claimId }),
      });
      if (!claimRes.ok) throw Object.assign(new Error("claim"), { status: claimRes.status });
      const { programId: copiedId } = await claimRes.json();
      const { data: firstAthlete } = await supabase.from("coach_athletes").select("id").eq("coach_id", uid).limit(1).maybeSingle();
      if (firstAthlete?.id) {
        await supabase.from("coach_sessions").delete().eq("coach_id", uid).eq("athlete_id", firstAthlete.id);
        await fetch(`/api/programs/${copiedId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start_date: getNextMonday(), athlete_id: firstAthlete.id }),
        });
        localStorage.setItem("program_start_date", getNextMonday());
      }
    } catch {
      /* coach a déjà un programme démo généré dans saveData(), pas de fallback nécessaire */
    } finally {
      localStorage.removeItem("claim_program_id");
    }
  }

  /* Claim + assign du programme claimé, partagé entre le flow classique (wellnessAdjustment réel,
     calculé à la fin de wellness_q) et le path court de l'A/B test (wellnessAdjustment=0, aucune
     donnée wellness collectée dans ce path — voir handleFinish()). */
  async function claimAndAssignProgram(uid: string, wellnessAdjustment: number) {
    const claimId = typeof window !== "undefined" ? localStorage.getItem("claim_program_id") : null;
    if (!claimId) return;
    try {
      const claimRes = await fetch("/api/programs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: claimId }),
      });
      if (!claimRes.ok) throw Object.assign(new Error("claim"), { status: claimRes.status });
      const { programId: copiedId } = await claimRes.json();
      const assignRes = await fetch(`/api/programs/${copiedId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: getNextMonday(), user_id: uid, wellnessAdjustment }),
      });
      if (!assignRes.ok) throw Object.assign(new Error("assign"), { status: assignRes.status });
    } catch (err: unknown) {
      const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 0;
      if (status !== 409) {
        await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, trainingDays));
      }
    } finally {
      localStorage.removeItem("claim_program_id");
    }
  }

  async function finishAthleteActivation(base_score: number, score: number) {
    const uid = userId || newUserId;
    if (uid) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("wellness_daily").upsert(
        { user_id: uid, date: today, sleep: wSleep, stress: wStress, recovery: wRecovery, motivation: wMotivation, behaviors: wBehaviors, bedtime: wBedtime, base_score, score },
        { onConflict: "user_id,date" }
      );
      const wellnessAdjustment = score < 45 ? -1 : 0;
      await claimAndAssignProgram(uid, wellnessAdjustment);
    }
    next();
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      if (isRegisterMode) {
        const emailRedirectTo = location.hostname === "localhost"
          ? undefined
          : `${location.origin}/auth/callback`;
        const randomPassword = crypto.randomUUID() + crypto.randomUUID();
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(), password: randomPassword,
          ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
        });
        if (signUpErr) { setError(signUpErr.message); setSaving(false); return; }
        const uid = data.user?.id;
        if (!uid) { setError("Erreur lors de la création du compte."); setSaving(false); return; }
        setNewUserId(uid);
        await createAccount(uid);
        posthog.identify(uid, { email: email.trim(), role });
        posthog.capture("account_created", { role, ab_variant: assignedVariant ?? "control" });
        fetch("/api/brevo/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), name: name.trim(), role, status: "free" }),
        });
        await fetch("/api/invite/link", { method: "POST" });
        if (role === "athlete") {
          const storedCode = typeof window !== "undefined" ? localStorage.getItem("coach_invite_code") : null;
          if (storedCode) {
            await fetch("/api/invite/join", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ invite_code: storedCode }),
            });
            localStorage.removeItem("coach_invite_code");
          }
        }
        if (!data.session) {
          setEmailSent(true);
          setSaving(false);
          return;
        }
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}/auth/callback?type=recovery&first=1`,
        }).catch(() => {});
        setSaving(false);
        next();
      } else {
        await createAccount(userId!);
        setSaving(false);
        next();
      }
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  function handleWellnessQuestions() {
    if (wStep < WQ_TOTAL - 1) { setWStep(s => s + 1); return; }
    if (finishGuardRef.current) return;
    finishGuardRef.current = true;
    const { base_score, score } = computeWellnessScore(wSleep, wStress, wRecovery, wMotivation, wBehaviors);
    setWScore(score);
    setWellnessTip(computeWellnessTip(wSleep, wStress, wRecovery, score, hasClaimedProgram === true));
    finishAthleteActivation(base_score, score);
  }

  async function handleInviteSend() {
    const emails = [inviteEmail, ...extraInviteEmails].map(e => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setInviteSending(true);
    const results = await Promise.all(emails.map(email =>
      fetch("/api/invite/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteEmail: email }),
      }).then(async res => ({ ok: res.ok, linked: (await res.json().catch(() => ({}))).linked }))
    ));
    setInviteSending(false);
    const sent = results.filter(r => r.ok);
    setInviteSentCount(sent.length);
    if (sent.length) setInviteResult(sent.some(r => r.linked) ? "linked" : "pending");
  }

  /* Paywall scindé en 2 écrans plein-page, dans le path comme tout le reste — plus un modal
     déclenché manuellement (voir Pivot A/B, "Réordonnancement Paywall → Célébration → Activation"). */
  const [billing, setBilling] = useState<Billing>("annual");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [footerPortalNode, setFooterPortalNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentStep !== "paywall_priming") return;
    /* Remplace l'ancien handleStartTrial() : la vue "priming" est désormais une entrée de path
       normale (voir onboarding_step_viewed émis par ailleurs), on garde cet event nommé pour la
       continuité analytique. celebration_cta_clicked n'a plus de sens (celebration ne mène plus
       au paywall) — abandonné, pas renommé pour ne pas laisser un event trompeur. */
    posthog.capture("paywall_priming_viewed", { plan: role, objective: goal, ab_variant: assignedVariant ?? "control" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== "paywall_form" || clientSecret || setupError) return;
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(r => r.json())
      .then((json) => {
        if (json.error) { setSetupError(`Erreur: ${json.error}`); setLoadingIntent(false); return; }
        setClientSecret(json.clientSecret);
        setLoadingIntent(false);
      })
      .catch(() => { setSetupError("Impossible de charger le formulaire."); setLoadingIntent(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  /* Paiement confirmé (trial_started, capturé dans CheckoutForm) : c'est ici, et seulement ici,
     que onboarding_done passe à true — payer est le vrai jalon qui débloque l'app, l'activation
     (wellness_q/invite_team) qui suit n'est pas bloquante si abandonnée après coup. */
  async function handlePaymentSuccess() {
    const uid = userId || newUserId;
    if (uid) await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
    setPaidExtras(role === "coach" ? ["invite_team"] : ["wellness_q", "wellness_reveal"]);
    next();
  }

  async function handleGoogleRegister() {
    const pending: PendingData = {
      role, sport, sportPrecision, level, goal, frustration, trainingDays,
      coachingContext, athleteCount, coachingChallenge, currentTool, name,
      wSleep, wBedtime, wStress, wRecovery, wBehaviors, wMotivation, wScore,
    };
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pending)))));
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?d=${encoded}` },
    });
    if (oauthErr) setError(oauthErr.message);
  }

  useEffect(() => {
    if (!pendingData || !userId) return;
    const init = async () => {
      try {
        /* Récupère le nom depuis les métadonnées Google si non renseigné */
        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email || "";
        const googleName = (user?.user_metadata?.full_name as string || "").split(" ")[0] || "";
        const finalName = pendingData.name?.trim() || googleName;
        /* Injecte le nom dans le state pour que saveData le prenne */
        if (finalName) setName(finalName);

        await createAccount(userId);

        /* Si le nom venait de Google, on force une mise à jour du profil */
        if (!pendingData.name?.trim() && finalName) {
          await supabase.from("profiles").update({ name: finalName }).eq("user_id", userId);
        }

        posthog.identify(userId, { email: userEmail, role: pendingData.role });
        posthog.capture("account_created", { role: pendingData.role, method: "google", ab_variant: assignedVariant ?? "control" });
        fetch("/api/brevo/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, name: finalName, role: pendingData.role, status: "free" }),
        });
        await fetch("/api/invite/link", { method: "POST" });
        setInitializing(false);
        setGoogleInitDone(true);
      } catch {
        setInitializing(false);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* `init()` ci-dessus est figé au premier render (deps []) — s'il appelait next() directement, il
     utiliserait un `isLast`/`path` calculé AVANT que hasClaimedProgram (qui se résout de façon
     asynchrone juste après le montage) n'ait sa valeur finale. Pour un compte Google venant d'un
     programme claimé, ça pouvait avancer sur le MAUVAIS path (plus long), donnant un stepIdx hors
     limites du VRAI path → écran blanc. Confirmé en prod via PostHog sur deux comptes Google réels.
     Ce useEffect séparé, retriggé par un state, capture toujours un `path` à jour au moment où il
     s'exécute. */
  useEffect(() => {
    if (!googleInitDone) return;
    /* next() suppose un stepIdx figé à 0 et avance d'une seule position — ça atterrissait
       systématiquement sur "role" (juste après value_intro) depuis que "account" a été
       repositionné plus tôt dans le path (variantes A/B, voir refonte onboarding v2). On saute
       directement juste après "account" dans le path résolu, quelle que soit sa position réelle. */
    const accountIdx = path.indexOf("account");
    setStepIdx(accountIdx >= 0 ? accountIdx + 1 : path.length - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleInitDone]);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  const sessionCount  = trainingDays.length + (trainingDays.length < 6 ? 1 : 0);
  const showFrise = !HIDE_FRISE_STEPS.includes(currentStep) && !FRISE_INLINE_STEPS.includes(currentStep);
  const frisePhases = [PHASE_1_STEPS, PHASE_2_STEPS, PHASE_3_STEPS].map(phaseSteps => path.filter(s => phaseSteps.includes(s)));
  const friseCurrentPhase = frisePhases.findIndex(steps => steps.includes(currentStep));
  const frisePct = frisePhases.map((steps, i) => {
    if (i < friseCurrentPhase) return 1;
    if (i > friseCurrentPhase) return 0;
    const idx = steps.indexOf(currentStep);
    return steps.length ? (idx + 1) / steps.length : 0;
  });

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 14, border: "none",
    background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
    fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)", marginBottom: 10,
  };
  const skipBtn: React.CSSProperties = {
    width: "100%", background: "none", border: "none",
    fontSize: 12, color: "#8a8f94", cursor: "pointer", padding: "4px 0",
  };
  const wBehaviorPenalty = Math.min(wBehaviors.length * 3, 15);

  if (hasClaimedProgram === null) {
    return <OnboardingBackground variant="dark"><div style={{ minHeight: 280 }} /></OnboardingBackground>;
  }

  if (initializing) {
    return (
      <OnboardingBackground variant="dark">
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Création de ton espace…</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
        </div>
      </OnboardingBackground>
    );
  }

  const isDarkStep = DARK_STEPS.includes(currentStep);

  return (
    <OnboardingBackground variant={isDarkStep ? "dark" : "light"}>
      <div>

        {showFrise && <ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark={isDarkStep} />}

        <div key={currentStep} style={{ animation: "stepIn 0.22s ease" }}>
        {/* ── 1. ROLE ── */}
        {currentStep === "role" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Essayer ThePerfClub en tant que</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.55, marginBottom: 24 }}>
              On personnalise ton expérience.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              {[
                { r: "athlete" as Role, icon: "🏋️", label: "Sportif",  sub: "Je suis mon propre entraînement", badgeBg: "linear-gradient(145deg, #fff0e8, #ffe0d0)" },
                { r: "coach"   as Role, icon: "📋", label: "Coach",    sub: "Je gère des sportifs", badgeBg: "linear-gradient(145deg, #eef1ff, #dde3ff)" },
              ].map(({ r, icon, label, sub, badgeBg }) => (
                <div key={r} onClick={() => nextAfterChoice(() => { setRole(r); setRoleChosen(true); posthog.setPersonProperties({ role: r }); if (abEligible && !assignedVariant) setAssignedVariant("control"); })}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 16, borderRadius: 18, padding: "18px 18px", border: roleChosen && role === r ? "2px solid #d44000" : "1.5px solid rgba(0,0,0,.08)", background: roleChosen && role === r ? "rgba(212,64,0,.05)" : "#fff", transition: "all .15s", boxShadow: roleChosen && role === r ? "none" : "0 2px 10px rgba(0,0,0,.04)" }}>
                  <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 16, background: badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.01em", color: roleChosen && role === r ? "#d44000" : "#171b1f", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.4 }}>{sub}</div>
                  </div>
                  <div style={{ flexShrink: 0, color: "rgba(0,0,0,.20)", fontSize: 18 }}>→</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VALUE INTRO (générique, avant le Rôle) ── */}
        {currentStep === "value_intro" && (() => {
          const journey = [
            {
              time: "La veille",
              img: "https://www.theperfclub.com/wp-content/uploads/2022/06/lathle%CC%80te-scaled.jpg",
              caption: hasClaimedProgram && claimedProgramName
                ? `Ton programme ${claimedProgramName} est prêt à personnaliser.`
                : "Crée ton programme simplement, ou choisis parmi 40+ modèles, tous sports.",
            },
            {
              time: "07h30",
              img: "https://www.theperfclub.com/wp-content/uploads/2023/03/massage-et-recuperation.jpeg",
              caption: "Le niveau de forme du jour ajuste la séance, avant même l'échauffement.",
            },
            {
              time: "Après la séance",
              img: "https://www.theperfclub.com/wp-content/uploads/2025/03/prevenir-et-guerir-dune-tendinite-au-genou-scaled.avif",
              caption: "Entraînement, habitudes de vie : sache ce qui impacte les performances.",
            },
          ];
          const j = journey[vSlide];
          return (
            <div>
              <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8, color: "#fff" }}>Un programme figé est déjà dépassé.</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.55, marginBottom: 22 }}>ThePerfClub ajuste les séances au niveau de forme, chaque jour.</div>
              <div style={{ borderRadius: 26, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
                <div
                  onPointerDown={(e) => { vSlideSwipeStartX.current = e.clientX; }}
                  onPointerUp={(e) => {
                    const startX = vSlideSwipeStartX.current;
                    vSlideSwipeStartX.current = null;
                    if (startX === null) return;
                    const delta = e.clientX - startX;
                    if (Math.abs(delta) > 30) {
                      if (delta < 0) setVSlide(v => Math.min(2, v + 1));
                      else setVSlide(v => Math.max(0, v - 1));
                    } else if (vSlide < 2) {
                      setVSlide(v => v + 1);
                    }
                  }}
                  style={{ position: "relative", height: "clamp(240px, calc(100vh - 330px), 600px)", cursor: "grab", overflow: "hidden", userSelect: "none", touchAction: "pan-y" }}>
                  <img src={j.img} alt={j.time} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", top: 14, left: 14, right: 14, display: "flex", justifyContent: "flex-end", gap: 6, zIndex: 4 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ height: 4, borderRadius: 2, background: i === vSlide ? "#fff" : "rgba(255,255,255,0.40)", width: i === vSlide ? 26 : 8, transition: "all 0.2s" }} />
                    ))}
                  </div>
                  {vSlide === 0 && (
                    <div style={{ position: "absolute", right: 16, bottom: 16, width: "54%", background: "#fff", borderRadius: 16, padding: "16px 17px", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
                      <div style={{ fontSize: 19, fontWeight: 950, color: "#171b1f", marginBottom: 10 }}>Renfo</div>
                      <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 11, padding: "10px 12px", marginBottom: 12 }}>
                        <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.45 }}>Montée d&apos;intensité bien placée. Récupère bien ce soir.</div>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: "#e7e4df", overflow: "hidden", marginBottom: 11 }}>
                        <div style={{ height: "100%", width: "62%", background: "linear-gradient(90deg,#ffb5a7,#d44000)", borderRadius: 999 }} />
                      </div>
                      {["Back squat — 5×5", "Snatch pull — 4×3", "Gainage — 8 min"].map((ex, i) => (
                        <div key={i} style={{ fontSize: 13, color: "#2c3236", fontWeight: 600, padding: "7px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>{ex}</div>
                      ))}
                    </div>
                  )}
                  {vSlide === 1 && (
                    <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, background: "rgba(10,10,10,.75)", backdropFilter: "blur(8px)", borderRadius: 18, padding: "18px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                        <div style={{ position: "relative", flexShrink: 0, width: 62, height: 62 }}>
                          <svg width={62} height={62} viewBox="0 0 62 62" style={{ transform: "rotate(-90deg)", display: "block" }}>
                            <circle cx={31} cy={31} r={26} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={5} />
                            <circle cx={31} cy={31} r={26} fill="none" stroke="#2f9e44" strokeWidth={5} strokeDasharray={163.4} strokeDashoffset={31} strokeLinecap="round" />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 18, fontWeight: 1000, color: "#fff", lineHeight: 1 }}>81</span>
                            <span style={{ fontSize: 6.5, fontWeight: 900, color: "rgba(255,255,255,.6)", letterSpacing: "0.08em" }}>WELLNESS</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 900, color: "#ff8a55", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Score &amp; conseils</div>
                          <div style={{ fontSize: 22, fontWeight: 950, color: "#fff", letterSpacing: "-0.02em" }}>Zone stable</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", lineHeight: 1.5, marginBottom: 14 }}>Signaux stables. Bon entraînement possible.</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {["🌙 Couché tardif", "📱 Écran tard", "🧘 Stretching"].map(c => (
                          <span key={c} style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)", background: "rgba(255,255,255,.10)", borderRadius: 999, padding: "6px 13px" }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {vSlide === 2 && (
                    <div style={{ position: "absolute", left: 16, right: 16, bottom: 16, background: "rgba(10,10,10,.75)", backdropFilter: "blur(8px)", borderRadius: 18, padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#ff8a55", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>ThePerfClub · Conseils</div>
                      <div style={{ fontSize: 20, fontWeight: 950, color: "#fff", letterSpacing: "-0.02em", marginBottom: 14 }}>Charge &amp; récupération</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.6)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>💪 Coût musculaire</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 30, marginBottom: 16 }}>
                        {[40, 65, 30, 80, 50, 35, 60].map((h, i) => (
                          <div key={i} style={{ flex: 1, height: `${h}%`, background: "#f04a08", borderRadius: 3 }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.6)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>🌿 Récupération</div>
                      <svg width="100%" height={26} viewBox="0 0 100 26" preserveAspectRatio="none">
                        <polyline points="0,21 15,12 30,16 45,7 60,10 75,5 100,4" fill="none" stroke="#2f9e44" strokeWidth={2.5} />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.4, letterSpacing: "-0.01em", margin: "22px 0 8px" }}>{j.caption}</div>
              <Actions variant="dark" onNext={next} nextLabel="Continuer →" />
            </div>
          );
        })()}

        {/* ── 2A-1. SPORT ── */}
        {currentStep === "sport_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              {role === "coach" ? "Le sport de tes sportifs ?" : "Ton sport principal ?"}
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>
              {role === "coach" ? "On génère les séances de ton premier programme." : "On génère des séances adaptées à ta discipline."}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => (
                <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id}
                  onClick={() => {
                    setSport(s.id);
                    if (s.id !== "Autre" && isRegisterMode) nextAfterChoice(() => {});
                  }} />
              ))}
            </div>
            {sport === "Autre" && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text" value={sportPrecision}
                  onChange={e => setSportPrecision(e.target.value)}
                  placeholder={role === "coach" ? "Précise le sport de tes sportifs (ex : rugby, natation…)" : "Précise ton sport (ex : rugby, yoga, escalade…)"}
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  autoFocus
                />
              </div>
            )}
            {isRegisterMode
              ? sport === "Autre" && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!sportPrecision.trim()} />
              : <Actions onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2A-2. LEVEL ── */}
        {currentStep === "level_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              {role === "coach" ? "Niveau de tes sportifs ?" : "Ton niveau actuel ?"}
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>
              {role === "coach" ? "L'intensité du programme s'ajuste en conséquence." : "Cela ajuste l'intensité des séances générées."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {([
                { key: "beginner" as Level, icon: "🌱", title: "Débutant",       subAthlete: "Je structure mon entraînement",    subCoach: "Bases sportives, progression douce" },
                { key: "intermediate" as Level, icon: "📈", title: "Intermédiaire", subAthlete: "J'ai une pratique régulière",      subCoach: "Pratique régulière, objectifs précis" },
                { key: "elite" as Level, icon: "🏆", title: "Compétiteur",    subAthlete: "Je prépare des compétitions",      subCoach: "Préparation compétitions, haute intensité" },
              ] as const).map(l => (
                <Choice key={l.key} icon={l.icon} title={l.title} sub={role === "coach" ? l.subCoach : l.subAthlete} selected={level === l.key}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setLevel(l.key)) : setLevel(l.key)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" />}
          </div>
        )}

        {/* ── 2A-3. GOAL ── */}
        {currentStep === "goal_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              {role === "coach" ? "L'objectif de tes sportifs ?" : "Ton objectif principal ?"}
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>
              {role === "coach" ? "Le programme sera orienté autour de cet objectif." : "ThePerfClub adapte son suivi à ce qui compte pour toi."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Progresser en performance",             icon: "🎯" },
                { id: "Éviter le surmenage et les blessures",  icon: "😴" },
                { id: "Mieux récupérer entre les séances",     icon: "🔄" },
                { id: "Structurer et suivre mon entraînement", icon: "📊" },
              ].map(o => (
                <Choice key={o.id} icon={o.icon} title={o.id} sub="" selected={goal === o.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setGoal(o.id)) : setGoal(o.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!goal} />}
          </div>
        )}

        {/* ── 2A-4. FRUSTRATION ── */}
        {currentStep === "frustration_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Ta plus grande frustration ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Ça nous aide à prioriser ce qui compte le plus.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Les programmes sont trop rigides, pas adaptés à mon état du jour", icon: "📋" },
                { id: "Je ne sais pas quand forcer et quand récupérer",                   icon: "😵" },
                { id: "Je manque de structure et de suivi",                               icon: "🗂️" },
                { id: "Je perds du temps sans progresser vraiment",                        icon: "⏱️" },
              ].map(f => (
                <Choice key={f.id} icon={f.icon} title={f.id} sub="" selected={frustration === f.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setFrustration(f.id)) : setFrustration(f.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!frustration} />}
          </div>
        )}

        {/* ── 2A-5. JOURS D'ENTRAÎNEMENT ── */}
        {currentStep === "days_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              {role === "coach" ? "Créons un premier programme" : "Quels sont tes jours d'entraînement ?"}
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 22 }}>
              {role === "coach" ? "Choisis les jours d'entraînement de tes sportifs." : "Tes séances seront planifiées sur ces jours."}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 8 }}>
              {([
                { dow: 1, full: "Lundi" },
                { dow: 2, full: "Mardi" },
                { dow: 3, full: "Mercredi" },
                { dow: 4, full: "Jeudi" },
                { dow: 5, full: "Vendredi" },
                { dow: 6, full: "Samedi" },
                { dow: 0, full: "Dimanche" },
              ] as const).map(({ dow, full }) => {
                const selected = trainingDays.includes(dow);
                return (
                  <div
                    key={dow}
                    onClick={() => setTrainingDays(prev => {
                      if (prev.includes(dow)) {
                        if (prev.length === 1) return prev;
                        return prev.filter(d => d !== dow);
                      }
                      const order = [1, 2, 3, 4, 5, 6, 0];
                      return [...prev, dow].sort((a, b) => order.indexOf(a) - order.indexOf(b));
                    })}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      borderRadius: 12, padding: "13px 16px", cursor: "pointer",
                      border: selected ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)",
                      background: selected ? "#171b1f" : "#fff",
                      transition: "all .12s",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 800, color: selected ? "#fff" : "#171b1f" }}>{full}</span>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      border: selected ? "none" : "1.5px solid rgba(0,0,0,.18)",
                      background: selected ? "#fff" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && (
                        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                          <path d="M1 4.5L4 7.5L10 1" stroke="#171b1f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#8a8f94", marginBottom: 14, textAlign: "center" }}>
              {trainingDays.length} jour{trainingDays.length > 1 ? "s" : ""} sélectionné{trainingDays.length > 1 ? "s" : ""}
            </div>
            <Actions onNext={next} nextLabel="Continuer →" nextDisabled={trainingDays.length === 0} />
          </div>
        )}

        {/* ── PAIN POINTS ATHLETE ── */}
        {currentStep === "overload_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que ça t'arrive de faire des séances plus dures que prévu ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Ça nous aide à calibrer ton suivi d'intensité.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je maîtrise toujours mon intensité",
                "Parfois, mais je sais m'arrêter",
                "Souvent, je pousse quand j'y suis",
                "Tout le temps, j'envoie tout à chaque fois",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={overloadAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setOverloadAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {currentStep === "planning_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que tu as des difficultés à prévoir ta charge d'entraînement ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>La planification adaptative, c'est le cœur de ThePerfClub.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, j'ai un plan clair que je respecte",
                "Un peu, je m'adapte souvent au ressenti",
                "Souvent, c'est flou d'une semaine à l'autre",
                "Complètement, je fais entièrement au feeling",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={planningAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setPlanningAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {currentStep === "fatigue_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que tu t'entraînes dur même quand tu es fatigué ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Le wellness score t'aide à prendre les bonnes décisions.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je sais récupérer quand il le faut",
                "Parfois, si la séance est importante",
                "Souvent, la fatigue ne change pas mon plan",
                "Tout le temps, je pousse quoi qu'il arrive",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={fatigueAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setFatigueAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {/* ── 2B-1. COACHING CONTEXT ── */}
        {currentStep === "context_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Ton contexte de coaching ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Pour adapter les outils à ta réalité terrain.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Coach",                                   icon: "👤", sub: "Individuel ou en groupe" },
                { id: "Préparateur physique",                    icon: "🏋️", sub: "Individuel ou collectif" },
                { id: "Kiné ou professionnel de la réhabilitation", icon: "🩺", sub: "Suivi santé & retour à l'effort" },
                { id: "Autre",                                   icon: "⚡", sub: "Coach wellness, nutritionniste…" },
              ].map(c => (
                <Choice key={c.id} icon={c.icon} title={c.id} sub={c.sub} selected={coachingContext === c.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCoachingContext(c.id)) : setCoachingContext(c.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!coachingContext} />}
          </div>
        )}

        {/* ── 2B-2. SPORT COACH ── */}
        {currentStep === "sport_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>On paramètre les modèles de séances proposés.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14, maxHeight: "42vh", overflowY: "auto" }}>
              {SPORT_CATEGORIES.map(s => (
                <Choice key={s.id} icon={s.icon} title={s.id} sub={s.sub} selected={sport === s.id}
                  onClick={() => {
                    setSport(s.id);
                    if (s.id !== "Autre" && isRegisterMode) nextAfterChoice(() => {});
                  }} />
              ))}
            </div>
            {sport === "Autre" && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text" value={sportPrecision}
                  onChange={e => setSportPrecision(e.target.value)}
                  placeholder="Précise le sport de tes sportifs (ex : rugby, natation…)"
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                  autoFocus
                />
              </div>
            )}
            {isRegisterMode
              ? sport === "Autre" && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!sportPrecision.trim()} />
              : <Actions onNext={next} nextLabel="Suivant →" />
            }
          </div>
        )}

        {/* ── 2B-3. ATHLETE COUNT ── */}
        {currentStep === "count_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Combien de sportifs tu gères ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Pour dimensionner les outils de suivi collectif.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                { v: "1–5 sportifs",   sub: "Coaching rapproché" },
                { v: "6–20 sportifs",  sub: "Groupe moyen" },
                { v: "21–50 sportifs", sub: "Large effectif" },
                { v: "50+ sportifs",   sub: "Structure club" },
              ].map(c => (
                <Choice key={c.v} icon="" title={c.v} sub={c.sub} selected={athleteCount === c.v}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setAthleteCount(c.v)) : setAthleteCount(c.v)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!athleteCount} />}
          </div>
        )}

        {/* ── 2B-4. CHALLENGE ── */}
        {currentStep === "challenge_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Ton plus grand défi de coaching ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>On priorise les fonctionnalités qui t'aident le plus.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Suivre la charge collective de mes sportifs",  icon: "📊" },
                { id: "Personnaliser l'entraînement par sportif",      icon: "🎯" },
                { id: "Créer des programmes facilement",               icon: "📝" },
                { id: "Communiquer efficacement avec mes sportifs",    icon: "💬" },
                { id: "Trop d'outils différents, pas assez de temps",  icon: "⏱️" },
              ].map(c => (
                <Choice key={c.id} icon={c.icon} title={c.id} sub="" selected={coachingChallenge === c.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCoachingChallenge(c.id)) : setCoachingChallenge(c.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!coachingChallenge} />}
          </div>
        )}

        {/* ── 2B-5. CURRENT TOOL ── */}
        {currentStep === "tool_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Tu utilises quoi actuellement ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Pour mieux comprendre ce que tu vas remplacer.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {[
                { id: "Excel / Sheets",   icon: "📊", sub: "Tableur" },
                { id: "Une autre app",    icon: "📱", sub: "Coaching app" },
                { id: "Papier / rien",    icon: "📝", sub: "Non structuré" },
                { id: "Plusieurs outils", icon: "🔀", sub: "En parallèle" },
              ].map(t => (
                <Choice key={t.id} icon={t.icon} title={t.id} sub={t.sub} selected={currentTool === t.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCurrentTool(t.id)) : setCurrentTool(t.id)} />
              ))}
            </div>
            {!isRegisterMode && (isLast
              ? <Actions onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving || !currentTool} />
              : <Actions onNext={next} nextLabel="Suivant →" nextDisabled={!currentTool} />
            )}
          </div>
        )}

        {/* ── PAIN POINTS COACH ── */}
        {currentStep === "overload_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que tes sportifs trouvent tes séances plus dures que prévu ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Le RPE réel vs prévu, ThePerfClub le suit automatiquement.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Rarement, ils respectent bien la charge prévue",
                "Parfois, quelques cas isolés",
                "Souvent, le RPE réel dépasse régulièrement",
                "Très souvent, c'est un problème récurrent",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={overloadCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setOverloadCoachAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {currentStep === "planning_time_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que la planification de la charge te prend trop de temps ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>ThePerfClub automatise cette partie.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, j'ai un process bien rodé",
                "Un peu, mais ça reste gérable",
                "Oui, c'est souvent chronophage",
                "Oui, c'est le principal frein de ma semaine",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={planningCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setPlanningCoachAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {currentStep === "fatigue_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Est-ce que tu maintiens des séances dures quand tes sportifs se sentent fatigués ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Les alertes wellness détectent ça en temps réel pour toi.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {[
                "Non, je m'adapte toujours au ressenti",
                "Parfois, selon la période du cycle",
                "Souvent, difficile de modifier le plan en cours",
                "Oui, je préfère maintenir le programme prévu",
              ].map(ans => (
                <Choice key={ans} icon="" title={ans} sub="" selected={fatigueCoachAns === ans}
                  onClick={() => {
                    posthog.capture("onboarding_pain_point_answered", { step: currentStep, answer: ans, role });
                    nextAfterChoice(() => setFatigueCoachAns(ans));
                  }} />
              ))}
            </div>
          </div>
        )}

        {/* ── CONCEPT AUTORÉGULATION (interstitiel avant le score) ── */}
        {currentStep === "concept_autoreg" && (
          <div style={{ position: "relative", padding: "12px 4px" }}>
            <div style={{ position: "absolute", right: "-10%", top: "-10%", width: 260, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(36px)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 16 }}>
                ✦ Autorégulation
              </div>
              <div style={{ fontSize: 30, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 18 }}>
                {role === "coach" ? "Le corps de tes sportifs parle" : "Ton corps parle. On l'écoute."}
              </div>
              {role === "coach" ? <CoachBlindSpotWheel /> : <ProgressComparisonChart />}
              <div style={{ fontSize: 15, color: "rgba(255,255,255,.68)", lineHeight: 1.7, marginBottom: 32 }}>
                {role === "coach"
                  ? "Fatigue, sommeil, stress : le corps de chaque sportif envoie des signaux avant la blessure ou la contre-performance. ThePerfClub les traduit en recommandations claires, pour toi et pour eux. C'est ce qu'on appelle l'autorégulation."
                  : "Fatigue, sommeil, stress : ton corps envoie des signaux avant la blessure ou la contre-performance. ThePerfClub les traduit en recommandations d'entraînement claires, jour après jour. C'est ce qu'on appelle l'autorégulation."}
              </div>
            </div>
            <Actions variant="dark" onNext={next} nextLabel="Continuer →" />
          </div>
        )}

        {/* ── SCORE AUTORÉGULATION SPORTIF ── */}
        {currentStep === "autoreg_score" && (
          <AutoRegScoreStep
            overloadAns={overloadAns}
            planningAns={planningAns}
            fatigueAns={fatigueAns}
            frustration={frustration}
            onNext={next}
          />
        )}

        {/* ── SCORE AUTORÉGULATION COACH ── */}
        {currentStep === "autoreg_score_coach" && (
          <AutoRegScoreStepCoach
            overloadCoachAns={overloadCoachAns}
            planningCoachAns={planningCoachAns}
            fatigueCoachAns={fatigueCoachAns}
            onNext={next}
          />
        )}

        {/* ── 3. ACCOUNT ── */}
        {currentStep === "account" && (emailSent ? <EmailSentScreen email={email} /> : (() => {
          /* Variante B (bras test) : Signup arrive juste après Rôle, profil encore vide — pas de
             "bilan" à promettre. Variante A : Signup arrive après les pain points, le bilan
             (Score/Concept) suit juste après — cadrage "débloque ton bilan" légitime ici. */
          const isVariantB = assignedVariant === "test";
          return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#d44000", background: "rgba(212,64,0,.08)", display: "inline-block", padding: "5px 12px", borderRadius: 999, marginBottom: 16 }}>
              {isVariantB ? "Ton compte" : "Ton bilan est prêt"}
            </div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Améliore {role === "coach" ? "ton coaching" : "tes performances"}.
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.55, marginBottom: 20 }}>
              Débloque ton profil d&apos;autorégulation et construis ton programme adaptatif personnalisé.
            </div>
            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                {error}{" "}
                {(error.toLowerCase().includes("déjà") || error.toLowerCase().includes("already") || error.toLowerCase().includes("registered")) && (
                  <Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Me connecter</Link>
                )}
              </div>
            )}

            <button
              type="button" onClick={handleGoogleRegister} disabled={saving}
              style={{ width: "100%", height: 48, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}
            >
              <GoogleIcon />
              Continuer avec Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
              <span style={{ fontSize: 12, color: "#8a8f94" }}>ou avec email</span>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
            </div>

            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Prénom</div>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Alex" style={inputStyle} />
            <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" style={{ ...inputStyle, marginBottom: 8 }} />
            <Actions onNext={handleFinish} nextLabel={saving ? "Création…" : (isVariantB ? "Créer mon compte →" : "Recevoir mon bilan →")} nextDisabled={saving || !name.trim() || !email.trim()} />
            <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94", marginTop: 14, lineHeight: 1.6 }}>
              Déjà un compte ?{" "}<Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Se connecter</Link>
            </div>
          </div>
          ); })()
        )}

        {/* ── RECAP PROFIL (interstitiel avant la preview du programme) ── */}
        {currentStep === "profile_recap" && (
          <ProfileRecapStep
            role={role}
            sport={sport}
            sportLabel={sport === "Autre" && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport}
            sportIcon={SPORT_CATEGORIES.find(s => s.id === sport)?.icon || "🏋️"}
            showLevel={path.includes("level_2a") || (hasClaimedProgram === true && !!level)}
            level={level}
            goalLower={goal ? goal.charAt(0).toLowerCase() + goal.slice(1) : ""}
            showDays={path.includes("days_2a")}
            trainingDays={trainingDays}
            claimedProgramName={claimedProgramName}
            hasPreviewNext={path.includes("week_preview_2a") || path.includes("week_preview_2b")}
            onNext={next}
          />
        )}

        {/* ── WEEK PREVIEW SPORTIF ── */}
        {currentStep === "week_preview_2a" && (
          <WeekPreviewStep sport={sport} level={level} trainingDays={trainingDays} role={role} goalLower={goal ? goal.charAt(0).toLowerCase() + goal.slice(1) : ""} coachFirstName={name} onNext={next} programFlow={hasClaimedProgram} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* ── WEEK PREVIEW COACH ── */}
        {currentStep === "week_preview_2b" && (
          <WeekPreviewStep sport={sport} level={level} trainingDays={trainingDays} role={role} goalLower={goal ? goal.charAt(0).toLowerCase() + goal.slice(1) : ""} coachFirstName={name} onNext={next} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* ── WELLNESS QUESTIONS (athlete, avant account) ── */}
        {currentStep === "wellness_q" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#d44000", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              💓 Wellness du jour
            </div>
            <div style={{ display: "flex", gap: 3, marginBottom: 20 }}>
              {Array.from({ length: WQ_TOTAL }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= wStep ? "#d44000" : "rgba(0,0,0,.10)", transition: "background .3s" }} />
              ))}
            </div>

            {wStep === 0 && (
              <div>
                <div style={{ fontSize: 23, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8 }}>😴 Comment as-tu dormi ?</div>
                <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>Qualité et récupération pendant le sommeil</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wSleep} step={1} onChange={e => setWSleep(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wSleep}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94", marginBottom: 16 }}>
                  <span>Très mauvais</span><span>Excellent</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#62686e", marginBottom: 6 }}>Heure de coucher</div>
                <select value={wBedtime} onChange={e => setWBedtime(e.target.value)} style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                  {BEDTIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}

            {wStep === 1 && (
              <div>
                <div style={{ fontSize: 23, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8 }}>🧠 Niveau de stress mental</div>
                <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>Travail, vie personnelle, charge mentale</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wStress} step={1} onChange={e => setWStress(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wStress}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Zen total</span><span>Très élevé</span>
                </div>
              </div>
            )}

            {wStep === 2 && (
              <div>
                <div style={{ fontSize: 23, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8 }}>💪 État physique aujourd'hui</div>
                <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>Ressenti musculaire, douleurs, lourdeur</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wRecovery} step={1} onChange={e => setWRecovery(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wRecovery}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Courbatures sévères</span><span>Frais et dispo</span>
                </div>
              </div>
            )}

            {wStep === 3 && (
              <div>
                <div style={{ fontSize: 23, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8 }}>🔍 Comportements d'hier soir</div>
                <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 16 }}>Coche tout ce qui s'applique</div>

                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c81e1e", marginBottom: 8 }}>
                  Ce qui m'a pénalisé
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
                  {NEGATIVE_BEHAVIORS.map(b => {
                    const checked = wBehaviors.includes(b.key);
                    return (
                      <button key={b.key} onClick={() => toggleBehavior(b.key)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, border: checked ? "1px solid rgba(200,30,30,.40)" : "1px solid rgba(0,0,0,.10)", background: checked ? "rgba(200,30,30,.08)" : "#fff", color: checked ? "#c81e1e" : "#62686e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all .14s" }}>
                        <span style={{ fontSize: 15 }}>{b.emoji}</span>{b.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2f9e44", marginBottom: 8 }}>
                  Ce que j'ai fait de bien
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {POSITIVE_BEHAVIORS.map(b => {
                    const checked = wBehaviors.includes(b.key);
                    return (
                      <button key={b.key} onClick={() => toggleBehavior(b.key)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10, border: checked ? "1px solid rgba(47,158,68,.40)" : "1px solid rgba(0,0,0,.10)", background: checked ? "rgba(47,158,68,.08)" : "#fff", color: checked ? "#2f9e44" : "#62686e", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all .14s" }}>
                        <span style={{ fontSize: 15 }}>{b.emoji}</span>{b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {wStep === 4 && (
              <div>
                <div style={{ fontSize: 23, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8 }}>⚡ As-tu envie de t'entraîner ?</div>
                <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>Motivation intrinsèque du moment</div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
                  <input type="range" min={1} max={10} value={wMotivation} step={1} onChange={e => setWMotivation(Number(e.target.value))} style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
                  <div style={{ fontSize: 32, fontWeight: 1000, color: "#d44000", minWidth: 42, textAlign: "center", lineHeight: 1 }}>{wMotivation}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8a8f94" }}>
                  <span>Pas du tout</span><span>Au max</span>
                </div>
              </div>
            )}

            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: "14px 20px 24px", background: "#f1f0ee" }}>
              <div style={{ display: "flex", gap: 8, maxWidth: colMaxWidth, margin: "0 auto" }}>
                {wStep > 0 && (
                  <button onClick={() => setWStep(s => s - 1)} aria-label="Question précédente"
                    style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 14, background: "#fff", border: "1px solid rgba(0,0,0,.10)", color: "#62686e", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>
                    ←
                  </button>
                )}
                <button onClick={handleWellnessQuestions}
                  style={{ flex: 1, height: 52, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}>
                  {wStep === WQ_TOTAL - 1 ? "Voir mon score →" : "Suivant →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── RÉVÉLATION NIVEAU DE FORME + ASK NOTIFICATION SÉANCE (sportif) ── */}
        {currentStep === "wellness_reveal" && (() => {
          const wellnessObj = { sleep: wSleep, stress: wStress, recovery: wRecovery, motivation: wMotivation, score: wScore };
          const advice = getAdvice(wScore != null ? wellnessObj : null, []);
          return (
          <div style={{ position: "relative", padding: "12px 4px" }}>
            <div style={{ position: "absolute", right: "-10%", top: "-10%", width: 260, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(36px)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 16 }}>
                ✦ Ton niveau de forme
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
                <WellnessRing dark score={wScore} size={84} strokeWidth={7} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "clamp(22px, 7vw, 30px)", fontWeight: 1000, color: "#fff", marginBottom: 6, lineHeight: 1.1, letterSpacing: "-0.04em" }}>
                    {zoneLabel(wScore)}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,0.76)" }}>
                    {wScore != null ? getContextualInsight(wellnessObj) : ""}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.07)", color: "#fff", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900 }}>
                  ✓ <strong style={{ color: "#ff8a55" }}>Autorégulation</strong> active
                </span>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16, marginBottom: 22 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                  ✦ Conseils
                </div>
                <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>⚡ Entraînement</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{advice.training}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>🌿 Récupération</div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{advice.recovery}</div>
                </div>
              </div>

              {nextSessionDayLabel(trainingDays) && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
                    Ta prochaine séance
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 22, textTransform: "capitalize" }}>
                    {nextSessionDayLabel(trainingDays)}
                  </div>
                </>
              )}
              <div style={{ fontSize: 15, color: "rgba(255,255,255,.68)", lineHeight: 1.6, marginBottom: 32 }}>
                {pushBlockedIOS
                  ? "📲 Ajoute ThePerfClub à ton écran d'accueil pour activer les rappels de séance."
                  : "Tu veux être prévenu pour ta prochaine séance ?"}
              </div>
            </div>
            <Actions
              variant="dark"
              onNext={() => {
                if (finishGuardRef.current) return;
                finishGuardRef.current = true;
                if (!pushBlockedIOS) subscribeToPush().catch(() => {});
                next();
              }}
              nextLabel={pushBlockedIOS ? "Continuer →" : "🔔 Oui, me prévenir"}
              onSkip={!pushBlockedIOS ? () => { if (finishGuardRef.current) return; finishGuardRef.current = true; next(); } : undefined}
              skipLabel="Passer"
            />
          </div>
          );
        })()}

        {/* ── INVITE TEAM (coach) ── */}
        {currentStep === "invite_team" && (
          <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
          <div style={{ position: "relative", background: "#fff", borderRadius: 30, width: "100%", maxWidth: 420, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
          <div style={{ overflowY: "auto", padding: 28 }}>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>
              Invite tes premiers sportifs
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>
              Ils rejoignent ton espace en un clic. Tu peux le faire plus tard aussi.
            </div>

            {inviteResult ? (
              <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: "20px 18px", textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>{inviteResult === "linked" ? "🔗" : "✅"}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: "#171b1f", marginBottom: 6 }}>
                  {inviteSentCount > 1 ? "Invitations enregistrées !" : inviteResult === "linked" ? "Sportif lié !" : "Invitation enregistrée !"}
                </div>
                <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.5 }}>
                  {inviteSentCount > 1
                    ? <>Tes <strong style={{ color: "#171b1f" }}>{inviteSentCount} sportifs</strong> rejoindront ton espace dès qu&apos;ils créeront leur compte.</>
                    : inviteResult === "linked"
                    ? <><strong style={{ color: "#171b1f" }}>{inviteEmail}</strong> avait déjà un compte — il est maintenant lié à ton espace.</>
                    : <>Dès que <strong style={{ color: "#171b1f" }}>{inviteEmail}</strong> créera son compte, il sera automatiquement lié à ton espace.</>}
                </div>
              </div>
            ) : (
              <>
                {inviteCode && (
                  <div style={{ background: "rgba(212,64,0,.05)", border: "1.5px solid rgba(212,64,0,.18)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#d44000", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                      Lien d&apos;invitation
                    </div>
                    <div style={{ fontSize: 12, color: "#d44000", fontWeight: 700, wordBreak: "break-all", marginBottom: 10 }}>
                      go.theperfclub.com/join/{inviteCode}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                          setInviteLinkCopied(true);
                          setTimeout(() => setInviteLinkCopied(false), 2500);
                        }}
                        style={{ flex: 1, height: 38, borderRadius: 11, background: inviteLinkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "background .2s" }}>
                        {inviteLinkCopied ? "✓ Copié !" : "📋 Copier le lien"}
                      </button>
                      <button
                        onClick={() => {
                          const msg = encodeURIComponent(`Salut ! Je viens de m'inscrire sur ThePerfClub pour suivre notre entraînement. Rejoins mon espace ici : https://go.theperfclub.com/join/${inviteCode}`);
                          window.open(`https://wa.me/?text=${msg}`, "_blank");
                        }}
                        style={{ height: 38, paddingLeft: 14, paddingRight: 14, borderRadius: 11, border: "1.5px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 18, cursor: "pointer" }}>
                        📲
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 8 }}>Ou par email</div>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="sportif@exemple.com"
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
                />
                {extraInviteEmails.map((email, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setExtraInviteEmails(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                      placeholder="sportif@exemple.com"
                      style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "13px 14px", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                    />
                    <button
                      onClick={() => setExtraInviteEmails(arr => arr.filter((_, idx) => idx !== i))}
                      style={{ width: 44, borderRadius: 14, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#8a8f94", fontSize: 16, cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setExtraInviteEmails(arr => [...arr, ""])}
                  style={{ background: "none", border: "none", color: "#d44000", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0, marginBottom: 20 }}
                >
                  + Inviter un autre sportif
                </button>
              </>
            )}
          </div>

            {inviteResult ? (
              <Actions
                variant="modal-light"
                nextLabel="Continuer →"
                onNext={() => { if (finishGuardRef.current) return; finishGuardRef.current = true; next(); }}
              />
            ) : (
              <div style={{ padding: "20px 28px 20px", background: "#fff", flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    if (finishGuardRef.current) return;
                    finishGuardRef.current = true;
                    const hasEmail = inviteEmail.trim() || extraInviteEmails.some(e => e.trim());
                    if (hasEmail && !inviteSending) await handleInviteSend();
                    next();
                  }}
                  disabled={inviteSending}
                  style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 900, cursor: inviteSending ? "default" : "pointer", opacity: inviteSending ? 0.45 : 1, boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}
                >
                  {inviteSending ? "Envoi…" : "Continuer →"}
                </button>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                  <button
                    onClick={() => {
                      if (finishGuardRef.current) return;
                      finishGuardRef.current = true;
                      if (!pushBlockedIOS) subscribeToPush().catch(() => {});
                      next();
                    }}
                    style={{ background: "none", border: "none", color: "#d44000", fontSize: 12, fontWeight: 800, cursor: "pointer", padding: "10px 0 0" }}
                  >
                    {pushBlockedIOS ? "📲 Me le rappeler plus tard" : "🔔 Plus tard — me le rappeler"}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── PAYWALL PRIMING (pricing + réassurance) ── */}
        {currentStep === "paywall_priming" && (() => {
          const p = PRICING[role === "coach" ? "coach" : "athlete"];
          const isClaimed = !!(hasClaimedProgram && claimedProgramName);
          const headline = isClaimed
            ? `Ton programme ${claimedProgramName} t'attend.`
            : (role === "coach"
                ? "Le manque de visibilité sur la récupération de tes sportifs freine leur progression."
                : "Ta charge d'entraînement irrégulière limite ta progression en endurance.");
          const sub = isClaimed ? "Aucun prélèvement avant la fin de l'essai." : null;
          const isMonthly = billing === "monthly";
          const perDay = (p.monthly / 30).toFixed(2).replace(".", ",");
          const annualSavings = p.monthly * 12 - p.annual;
          const faqItems = [
            { q: "Suis-je prélevé pendant l'essai gratuit ?", a: "Non. Aucun prélèvement avant la fin des 7 jours d'essai. En formule annuelle, on te prévient 2 jours avant la fin de l'essai." },
            { q: "Puis-je annuler à tout moment ?", a: "Oui, en un clic depuis ton profil, sans justification ni délai de préavis." },
            { q: "Puis-je changer de formule après ?", a: "Oui, tu peux basculer entre mensuel et annuel à tout moment depuis ton profil." },
            role === "coach"
              ? { q: "Puis-je ajouter autant de sportifs que je veux ?", a: "Oui, sans surcoût, quel que soit le nombre de sportifs que tu coaches." }
              : { q: "Le programme est-il vraiment personnalisé ?", a: "Oui : il est généré selon ton sport, ton niveau et ton objectif, puis ajusté automatiquement selon ton wellness." },
          ];
          const anchor = role === "coach"
            ? "Moins cher qu'un mois de logiciel de coaching classique — pour un nombre de sportifs illimités, ajoutés sans surcoût."
            : "Moins cher qu'une séance avec un coach particulier — pour un an de programme sur mesure avec 40+ modèles de programmes personnalisables.";
          /* Comparatif personnalisé (2026-07-27) — la colonne "avant" reformule en insight la
             réponse réelle donnée par l'utilisateur sur frustration_2a/challenge_2b, overload_2a/2b
             et fatigue_2a/2b (via les tables *_INSIGHTS ci-dessus, pas le texte littéral de l'option
             — hors contexte, la phrase brute du questionnaire ne se lit plus comme un constat).
             La colonne "après" répond au thème de cette même question. Fallback générique si une
             réponse manque ou n'est pas reconnue (ex. saut direct via ?dbgstep= en dev, ou path
             programme qui saute ces steps). */
          const compareRows = role === "coach"
            ? [
                {
                  before: COACHING_CHALLENGE_INSIGHTS[coachingChallenge] || "Tu manques de visibilité sur tes sportifs au quotidien.",
                  after: "ThePerfClub identifie précisément ce qui freine chacun de tes sportifs, sportif par sportif.",
                },
                {
                  before: OVERLOAD_COACH_INSIGHTS[overloadCoachAns] || "Tes sportifs poussent parfois plus dur que prévu, sans que tu le voies venir.",
                  after: "Le RPE réel de chaque sportif est comparé à la charge prévue, automatiquement.",
                },
                {
                  before: FATIGUE_COACH_INSIGHTS[fatigueCoachAns] || "Difficile de savoir quand un sportif fatigué ne devrait pas enchaîner une séance dure.",
                  after: "Les alertes wellness te préviennent avant qu'un sportif fatigué n'enchaîne une séance dure.",
                },
              ]
            : [
                {
                  before: FRUSTRATION_INSIGHTS[frustration] || "Tu manques de visibilité sur ta propre progression.",
                  after: "ThePerfClub analyse précisément ce qui freine ta progression, séance après séance.",
                },
                {
                  before: OVERLOAD_INSIGHTS[overloadAns] || "Tu pousses parfois plus dur que prévu, sans savoir si ça sert vraiment ta progression.",
                  after: "Ta charge réelle est suivie et comparée à ce qui est prévu, séance après séance.",
                },
                {
                  before: FATIGUE_INSIGHTS[fatigueAns] || "Difficile de savoir si pousser malgré la fatigue t'aide ou te freine.",
                  after: "Ton wellness est pris en compte pour ajuster tes séances à ta vraie récupération.",
                },
              ];
          return (
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d44000", marginBottom: 10 }}>
                🎯 Ta formule
              </div>
              <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10, lineHeight: 1.2 }}>{headline}</div>
              {sub && <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>{sub}</div>}

              {/* Hero offer — TEST fond sombre (2026-07-27, à comparer avec la version claire) —
                  même dégradé que les autres cartes "hero" de l'app (WeekPreviewStep, WellnessCard). */}
              <div style={{
                position: "relative", overflow: "hidden",
                background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
                border: "1px solid rgba(255,255,255,.13)", borderRadius: 16, padding: "18px 18px 16px",
                marginBottom: 22, marginTop: sub ? 0 : 18, boxShadow: "0 20px 48px rgba(0,0,0,.22)",
              }}>
                <div style={{ position: "absolute", top: 16, right: 16, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "#ff8a55", background: "rgba(255,107,43,.18)", padding: "5px 10px", borderRadius: 999 }}>
                  ✓ Essai 7j
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 12, paddingRight: 100 }}>
                  Basé sur ton objectif
                </div>
                <div style={{ fontSize: 42, fontWeight: 1000, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>
                  {isMonthly ? p.monthly : p.annualMonthly}€<span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.55)", marginLeft: 4 }}>/mois</span>
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,.55)", marginTop: 9, lineHeight: 1.5 }}>
                  {isMonthly
                    ? `Facturé mensuellement · soit ${perDay}€/jour`
                    : `Facturé annuellement · ${p.annual}€/an · Soit ${annualSavings}€ d'économie`}
                </div>
                <div style={{ display: "inline-flex", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999, padding: 3, marginTop: 12 }}>
                  <button type="button" onClick={() => setBilling("annual")} style={{ border: "none", background: !isMonthly ? "#d44000" : "transparent", color: !isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>Annuel</button>
                  <button type="button" onClick={() => setBilling("monthly")} style={{ border: "none", background: isMonthly ? "#d44000" : "transparent", color: isMonthly ? "#fff" : "rgba(255,255,255,.55)", fontSize: 13, fontWeight: 800, padding: "7px 15px", borderRadius: 999, cursor: "pointer" }}>Mensuel</button>
                </div>
                <div style={{ fontSize: 14.5, color: "#fff", fontWeight: 700, fontStyle: "italic", marginTop: 13, lineHeight: 1.5 }}>
                  {anchor}
                </div>
              </div>

              {/* Comparatif "Où tu en es / Ce que ThePerfClub change" — cartes (fond blanc, bordure)
                  dans les 2 cas ; sur desktop (≥640px) avant → après côte à côte (inspiré de la
                  section "Where Levels takes you" de Levels), sur mobile empilé dans la même carte
                  (une carte horizontale y serait trop étroite pour les 2 colonnes de texte). */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 12 }}>
                  <span>Où tu en es</span>
                  <span style={{ color: "#d44000" }}>Ce que ThePerfClub change</span>
                </div>
                {colIsMd ? (
                  compareRows.map((row, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16,
                      background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "18px 20px",
                      marginBottom: i < compareRows.length - 1 ? 12 : 0,
                    }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.06)", color: "#8a8f94", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
                        <span style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5 }}>{row.before}</span>
                      </div>
                      <span style={{ color: "#d44000", fontSize: 18 }}>→</span>
                      <span style={{ fontSize: 14, color: "#1f2428", fontWeight: 600, lineHeight: 1.5 }}>{row.after}</span>
                    </div>
                  ))
                ) : (
                  compareRows.map((row, i) => (
                    <div key={i} style={{
                      background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, padding: "14px 16px",
                      marginBottom: i < compareRows.length - 1 ? 12 : 0,
                    }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,.06)", color: "#8a8f94", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                        <span style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5 }}>{row.before}</span>
                      </div>
                      <div style={{ fontSize: 14, color: "#1f2428", fontWeight: 600, lineHeight: 1.5, paddingLeft: 28 }}>{row.after}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Témoignage */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 12 }}>
                  Ce que disent des {role === "coach" ? "coachs" : "sportifs"} comme vous
                </div>
                <div style={{ padding: "14px 16px 12px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
                  <div style={{ fontSize: 13, color: "#3a3f44", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
                    &ldquo;{PAYWALL_TESTIMONIALS[role === "coach" ? "coach" : "athlete"].quote}&rdquo;
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                      <img src={PAYWALL_TESTIMONIALS[role === "coach" ? "coach" : "athlete"].photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>{PAYWALL_TESTIMONIALS[role === "coach" ? "coach" : "athlete"].name}</div>
                      <div style={{ fontSize: 11, color: "#8a8f94" }}>{PAYWALL_TESTIMONIALS[role === "coach" ? "coach" : "athlete"].role}</div>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#f28a00", fontSize: 12 }}>★</span>)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bande de confiance "+600" — anciennement dans paywall_form (bloc "+300"), déplacée
                  ici et le chiffre remonté à jour (2026-07-27) : plus utile comme réassurance
                  pendant la décision du prix que sur l'écran de paiement, qu'on simplifie au max. */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, padding: "12px 14px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
                <div style={{ display: "flex" }}>
                  {PAYWALL_AVATARS.map((src, i) => (
                    <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #f1f0ee", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1f2428", lineHeight: 1.2 }}>+600 sportifs, coachs et clubs</div>
                  <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>font confiance à ThePerfClub</div>
                </div>
              </div>

              {/* FAQ */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 4 }}>
                  Questions fréquentes
                </div>
                <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, padding: "4px 16px" }}>
                  {faqItems.map((item, i) => (
                    <div key={i} style={{ padding: "14px 0", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2428", marginBottom: 6 }}>{item.q}</div>
                      <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.55 }}>{item.a}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Actions onNext={next} nextLabel="Continuer →" caption="Résiliable à tout moment." />
            </div>
          );
        })()}

        {/* ── PAYWALL FORM (carte Stripe, plein écran) ── */}
        {currentStep === "paywall_form" && (() => {
          const p = PRICING[role === "coach" ? "coach" : "athlete"];
          const isMonthly = billing === "monthly";
          return (
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#d44000", background: "rgba(212,64,0,.08)", display: "inline-block", padding: "5px 12px", borderRadius: 999, marginBottom: 16 }}>
                🔒 Essai 7j gratuit
              </div>
              <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 20 }}>Démarre ton essai gratuit</div>

              {/* Formulaire simplifié au max (2026-07-27) : bloc "+300" retiré (la réassurance
                  sociale vit désormais sur paywall_priming, cf. bande "+600" plus haut dans le
                  funnel) — remplacé par un rappel que le compte est déjà prêt, pour ne laisser
                  que ce qui reste vraiment à faire ici : le paiement. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "12px 14px", background: "rgba(212,64,0,.08)", border: "1px solid rgba(212,64,0,.18)", borderRadius: 14 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#171b1f", lineHeight: 1.4 }}>Ton compte est prêt.</span>
              </div>

              <div
                onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "14px 16px", marginBottom: 12, cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 700 }}>{isMonthly ? "Facturé mensuellement" : "Facturé annuellement"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#171b1f" }}>{isMonthly ? `${p.monthly}€/mois` : `${p.annualMonthly}€/mois · ${p.annual}€/an`}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#d44000", textDecoration: "underline" }}>Modifier</span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: "#8a8f94", textAlign: "center", marginBottom: 20 }}>
                {isMonthly ? "Annulation possible à tout moment, sans justification." : "On te prévient 2 jours avant la fin de l'essai."}
              </div>

              {loadingIntent && <div style={{ textAlign: "center", padding: "20px 0", color: "#8a8f94", fontSize: 13 }}>Chargement du formulaire...</div>}
              {setupError && <div style={{ color: "#d10000", fontSize: 13, textAlign: "center", padding: "12px 0" }}>{setupError}</div>}
              {clientSecret && (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#d44000", borderRadius: "12px" } } }}>
                  <CheckoutForm mode={role} billing={billing} footerPortalNode={footerPortalNode} onSuccess={handlePaymentSuccess} abVariant={assignedVariant ?? "control"} />
                </Elements>
              )}
              {/* Le footer sticky de CheckoutForm (récap + bouton + mention sécurité) est plus haut
                  que le footer 1-bouton standard des autres steps — le padding-bottom global de
                  OnboardingBackground (120px) ne suffit pas à empêcher le footer fixed de recouvrir
                  le texte légal Stripe juste au-dessus. Espace réservé en plus, propre à ce step. */}
              <div style={{ height: 80 }} />
              {/* Portail : le bouton submit Stripe doit rester lié au <form> (CheckoutForm) tout en
                  étant ancré au bas du viewport comme le footer de tous les autres steps — même
                  largeur de contenu que Actions.tsx "light" (maxWidth 560, centré), pas pleine
                  largeur de la page. */}
              <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: "#fff" }}>
                <div ref={setFooterPortalNode} style={{ maxWidth: colMaxWidth, margin: "0 auto" }} />
              </div>
            </div>
          );
        })()}

        {/* ── CÉLÉBRATION + UPGRADE PITCH ── */}
        {currentStep === "celebration" && (
          <CelebrationScreen
            role={role}
            name={name}
            sport={sport === "Autre" && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport}
            level={level}
            goal={goal}
            coachingChallenge={coachingChallenge}
            wScore={wScore}
            wellnessTip={wellnessTip}
            claimedProgramName={claimedProgramName}
            claimedProgramWeeks={claimedProgramWeeks}
            showProfile={path.includes("sport_2a")}
            showWellness={path.includes("wellness_q")}
            saving={saving}
            onNext={next}
          />
        )}

        </div>
      </div>
    </OnboardingBackground>
  );
}
