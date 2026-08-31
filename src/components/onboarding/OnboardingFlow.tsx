"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useFeatureFlagVariantKey } from "posthog-js/react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { computeWellnessScore } from "@/lib/wellness";
import { getSessionTemplates, nextDateForDow } from "@/lib/sessionTemplates";
import type { ProgramTemplate, ProgramFocus, SessionTemplate } from "@/types";
import Link from "next/link";
import OnboardingBackground from "@/components/onboarding/OnboardingBackground";
import WeekPreviewStep from "@/components/onboarding/WeekPreviewStep";
import DecisionStep from "@/components/onboarding/DecisionStep";
import WellnessCheckStep from "@/components/onboarding/WellnessCheckStep";
import AutoRegScoreStep, { computeAthleteAutoregProfile } from "@/components/onboarding/AutoRegScoreStep";
import AutoRegScoreStepCoach, { computeCoachAutoregProfile } from "@/components/onboarding/AutoRegScoreStepCoach";
import CelebrationScreen from "@/components/onboarding/CelebrationScreen";
import PaywallModal, { PAYWALL_AVATARS, type Billing } from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
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
  | "wellness_check_2a" | "wellness_check_2b"
  | "decision_2a" | "decision_2b"
  | "wellness_q"
  | "wellness_reveal"
  | "account"
  | "celebration"
  | "concept_autoreg" | "profile_recap"
  | "invite_team"
  | "paywall_priming" | "paywall_form";

type PendingData = {
  role: Role; sport: string; sportPrecision: string; level: Level; weaknesses: string[];
  goal: string; frustration: string; trainingDays: number[];
  coachingContext: string; athleteCount: string; coachingChallenge: string; currentTool: string; trainingStyle: string;
  name: string; wSleep: number; wBedtime: string; wStress: number; wRecovery: number;
  wBehaviors: string[]; wMotivation: number; wScore: number | null;
};
interface Props { userId?: string; pendingData?: PendingData | null; initialRole?: Role }

/* Refonte "zéro problem awareness" (2026-08-17) — remplace l'ancien diagnostic self-report
   (pain points → score → concept) par une construction directe : sport+faiblesses (un seul écran,
   fusionnés) → jours → programme réel (aperçu éphémère, aucun compte requis) → rôle → décision
   d'autorégulation vécue (week_preview_2a/2b, déjà l'aha réel depuis le 2026-08-14) → compte →
   célébration → formule (paywall obligatoire-mais-skippable, réintroduit le 2026-08-31 après
   celebration — voir doc juste avant les 4 tableaux de path plus bas). Rôle et Signup repositionnés
   le 2026-08-18/19 (voir discussion funnel du 2026-08-16→19) :
   le rôle attend d'avoir montré un programme concret ("Pour moi / Pour mes sportifs" plutôt qu'une
   catégorisation à froid), le signup attend le vrai AHA (decision_2a/2b) — seul moment où il y a
   quelque chose de réel à vouloir sauvegarder. Ancienne distinction control/test "position du
   signup" abandonnée pour tous (plus de bras A/B sur cette question, tranché sans test formel —
   volume historiquement trop faible pour en tirer une conclusion propre sur ce funnel, voir les 2
   tests précédents `short-onboarding-signup`/`skip-value-intro`).
   Les anciens écrans (frustration_2a/overload_2a/planning_2a/fatigue_2a, autoreg_score,
   concept_autoreg, profile_recap, goal_2a, et leurs équivalents coach) restent dans le fichier
   (JSX + state) mais ne sont plus référencés par aucun path actif — dead code assumé, même
   principe que context_2b/sport_2b/count_2b/tool_2b déjà toléré ailleurs dans ce fichier. */
/* wellness_reveal / invite_team retirés des paths (2026-08-27) — leur contenu unique (rappel
   notification, formulaire d'invitation) est désormais dans celebration elle-même, voir son rendu
   plus bas. JSX/state des deux steps gardés intacts mais jamais atteints (dead code assumé, même
   principe que context_2b/sport_2b déjà toléré ailleurs dans ce fichier) — pas supprimés pour
   limiter le risque de ce changement. */
/* wellness_check_2a/2b retiré des paths actifs (2026-08-28) — fusionné dans week_preview_2a/2b
   (simulation de forme + reco déjà intégrées à l'aperçu du programme, voir WeekPreviewStep.tsx).
   StepId/JSX/state gardés intacts (dead code assumé, même principe que les autres steps dépréciés
   documentés en tête de ce bloc). */
/* paywall_priming/paywall_form réintroduits dans les 4 paths actifs (2026-08-31), APRÈS celebration
   — pas avant comme avant le retrait du 2026-08-19. Différence structurelle avec l'ancien modèle
   CB-obligatoire : ce paywall est vu par 100% de ceux qui terminent l'onboarding (obligatoire dans
   le sens "sur le chemin", jamais sauté silencieusement) mais **skippable** — voir skipPaywall(),
   câblé sur le "×" de PrimingJourneyModal/PaywallModal (les 2 écrans sont désormais rendus en
   important directement ces composants du gating in-app, "exactement le même habillage", demande
   explicite de Gildas — plus une copie parallèle "Plus tard →" spécifique à l'onboarding, tentée
   puis retirée le jour même). onboarding_done reste posé à l'activation
   (createAccount/finishAthleteActivation/finishCoachActivation), jamais gaté par ce paywall — payer
   ou fermer n'a aucun effet sur l'accès (modèle produit-gated du 2026-08-19/20 inchangé, seul un
   save ultérieur reste gaté). Position choisie précisément pour que fermer laisse toujours une
   suite naturelle : wellness_q côté sportif (déjà le dernier step), /coach côté coach (déjà la
   sortie normale) — jamais un cul-de-sac. */
const ATHLETE_PATH: StepId[] = [
  "value_intro",
  "sport_2a",
  "level_2a",
  "days_2a",
  "week_preview_2a",
  "role",
  "decision_2a",
  "account",
  "celebration",
  "paywall_priming",
  "paywall_form",
  "wellness_q",
];
const COACH_PATH: StepId[] = [
  "value_intro",
  "sport_2a",
  "level_2a",
  "days_2a",
  "week_preview_2b",
  "role",
  "decision_2b",
  "account",
  "celebration",
  "paywall_priming",
  "paywall_form",
];

const POST_PROGRESS: StepId[] = ["value_intro", "wellness_q", "wellness_reveal", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "profile_recap", "invite_team", "paywall_priming", "paywall_form", "week_preview_2a", "week_preview_2b"];

const DARK_STEPS: StepId[] = ["value_intro", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "wellness_reveal"];
/* week_preview_2a/2b restent en fond clair (page) : leur héros sombre est géré localement par
   WeekPreviewStep, qui reçoit aussi la frise en prop pour l'afficher dans ce même bloc sombre. */
const FRISE_INLINE_STEPS: StepId[] = ["week_preview_2a", "week_preview_2b", "decision_2a", "decision_2b"];

/* Frise 4 étapes (Programme/Aperçu/Adaptation/Formule, 2026-08-19 — remplace le regroupement
   Profil/Programme/Adaptation/Formule du 2026-08-17) — regroupe les steps réels par phase pour
   calculer une progression persistante. Réordonnancement rôle/signup (voir doc des paths
   ci-dessus) : "role" rejoint la phase "Aperçu" (juste après avoir vu le programme, avant de
   vivre l'adaptation) et "account" rejoint "Formule" (juste avant le paywall, plus au tout début)
   — les deux restent de toute façon masqués de la frise elle-même (HIDE_FRISE_STEPS), ce
   regroupement ne pilote que le calcul de progression affiché sur les écrans adjacents. Filtré
   par le `path` actif pour rester cohérent avec les variantes (programme claimé, etc.) qui sautent
   des steps. */
const PHASE_1_STEPS: StepId[] = ["sport_2a", "level_2a", "days_2a"];
const PHASE_2_STEPS: StepId[] = ["week_preview_2a", "week_preview_2b", "role"];
const PHASE_3_STEPS: StepId[] = ["decision_2a", "decision_2b"];
const PHASE_4_STEPS: StepId[] = ["account", "paywall_priming", "paywall_form"];
const HIDE_FRISE_STEPS: StepId[] = ["value_intro", "celebration", "role", "account"];

/* Rendu de la frise, extrait en composant pour pouvoir être affiché soit à sa position par défaut
   (au-dessus du step), soit injecté par WeekPreviewStep dans son propre héros sombre. */
function ProgressFrise({ currentPhase, pct, dark }: { currentPhase: number; pct: number[]; dark: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      {pct.map((p, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, height: 3, borderRadius: 2, background: dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.10)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, background: "#d44000", width: `${Math.round(p * 100)}%`, transition: "width .3s" }} />
        </div>
      ))}
    </div>
  );
}

/* Transition automatique entre le dernier écran d'input et week_preview_2a/2b (2026-08-17) —
   cascade spinner→check sur 3 lignes, ~1,7s, purement cosmétique (voir advanceMaybeGenerating()).
   Rendu comme un early-return plein écran (même pattern que le bloc `initializing` juste avant
   dans OnboardingFlow), pas comme un step navigable — n'a pas de StepId, n'apparaît jamais dans
   un path ni dans la frise. */
function GenerationLoadingScreen({ role }: { role: Role | null }) {
  const [doneCount, setDoneCount] = useState(0);
  useEffect(() => {
    const labels = 3;
    const timers = Array.from({ length: labels }, (_, i) =>
      setTimeout(() => setDoneCount(i + 1), 220 + (i + 1) * 420)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  const labels = role === "coach"
    ? ["Analyse du profil de tes sportifs", "Construction du cycle d'entraînement", "Génération des séances"]
    : ["Analyse de ton profil", "Construction du cycle d'entraînement", "Génération de tes séances"];
  return (
    <OnboardingBackground variant="dark" center>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 260, margin: "0 auto" }}>
        {labels.map((label, i) => {
          const done = doneCount > i;
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 13, opacity: done ? 1 : 0.4, transition: "opacity .3s" }}>
              {done ? (
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#237a35", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, flex: "none" }}>✓</div>
              ) : (
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,.18)", borderTopColor: "#d44000", flex: "none", animation: "genLoadingSpin .7s linear infinite" }} />
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: done ? "#fff" : "rgba(255,255,255,.55)", transition: "color .3s" }}>{label}</div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes genLoadingSpin { to { transform: rotate(360deg); } }`}</style>
    </OnboardingBackground>
  );
}

/* Transition automatique entre le programme (pur) et l'écran de décision (2026-08-17) — vend la
   valeur de la reconduction automatique de charge semaine après semaine SANS jamais nommer la
   fonctionnalité elle-même (demande explicite de Gildas). Purement cosmétique/minutée, même
   pattern que GenerationLoadingScreen — voir advanceMaybeReconduction(). */
function ReconductionTeaserScreen({ role }: { role: Role | null }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 200);
    return () => clearTimeout(t);
  }, []);
  const bars = [42, 64, 88];
  return (
    <OnboardingBackground variant="dark" center>
      <div style={{ textAlign: "center", maxWidth: 280, margin: "0 auto" }}>
        <div style={{ fontSize: 19, fontWeight: 950, letterSpacing: "-0.03em", color: "#fff", marginBottom: 8 }}>
          Et ton programme continue d&apos;évoluer.
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.5, marginBottom: 28 }}>
          {role === "coach"
            ? "Chaque semaine, la charge de tes sportifs s'ajuste toute seule à leur progression — jamais figée, jamais à reprendre de zéro."
            : "Chaque semaine, ta charge s'ajuste toute seule à ta progression — jamais figée, jamais à reprendre de zéro."}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", justifyContent: "center", height: 90 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, width: 44 }}>
              <div style={{
                width: "100%", borderRadius: "8px 8px 0 0", background: "linear-gradient(180deg,#ff8a54,#d44000)",
                height: grown ? h : 0, transition: `height .6s cubic-bezier(.2,.8,.2,1) ${i * 0.12}s`,
              }} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,.5)" }}>S{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </OnboardingBackground>
  );
}

/* Programme claimé : "sport_2a" réintégré le 2026-08-29 — le sport reste pré-rempli depuis le
   claim (setSport(data.sport) dans l'effet de claim plus bas), la chip correspondante s'affiche
   donc déjà sélectionnée. L'user peut confirmer telle quelle (clic direct sur "Suivant →", même
   sport que le programme claimé), changer de sport (choisit une autre chip), ou importer son
   propre programme (remplace le programme claimé — même mécanisme que le chemin classique,
   advanceToWeekPreviewViaImport() saute alors level_2a/days_2a). Raison : le trafic "programme
   claimé" est un profil qui cherche activement des programmes en ligne, donc un candidat naturel
   à l'import de son propre contenu — sans ça, ce chemin ne voyait jamais l'option. "level_2a" ne
   sert plus que d'écran faiblesses seul (voir son rendu, réécrit le 2026-08-17 pour ne plus
   brancher sur le rôle). Convergé avec la version courte : plus de distinction control/test, une
   seule forme par rôle. */
const PROGRAM_ATHLETE_PATH: StepId[] = [
  "value_intro",
  "sport_2a", "level_2a", "days_2a",
  "week_preview_2a", "role", "decision_2a", "account", "celebration",
  "paywall_priming", "paywall_form", "wellness_q",
];
const PROGRAM_COACH_PATH: StepId[] = [
  "value_intro",
  "sport_2a", "level_2a", "days_2a",
  "week_preview_2b", "role", "decision_2b", "account", "celebration",
  "paywall_priming", "paywall_form",
];

/* Anciennes variantes "courtes" de l'A/B test short-onboarding-signup — désormais identiques aux
   paths ci-dessus (plus qu'une seule position de signup, sans bras de test — voir doc des paths
   plus haut), conservées comme alias pour ne pas toucher getPath()/assignedVariant qui continuent
   de résoudre un bras sans effet observable. */
const SHORT_ATHLETE_PATH: StepId[] = ATHLETE_PATH;
const SHORT_COACH_PATH: StepId[] = COACH_PATH;
const SHORT_PROGRAM_ATHLETE_PATH: StepId[] = PROGRAM_ATHLETE_PATH;
const SHORT_PROGRAM_COACH_PATH: StepId[] = PROGRAM_COACH_PATH;

/* Sportif invité par un coach (coach_invite_code en localStorage, posé par /join/[code]) : le lien
   coach→sportif est confirmé au submit d'"account" via /api/invite/join (voir handleFinish()), donc
   ni diagnostic ni paywall n'ont de sens ici — l'accès est gratuit tant que le lien tient, même
   logique que hasCoach dans usePaywall.ts/(app)/layout.tsx. Priorité absolue sur assignedVariant ET
   hasClaimedProgram dans getPath() : une invitation coach est plus spécifique qu'un bras A/B ou un
   programme claimé. */
const INVITE_ATHLETE_PATH: StepId[] = ["value_intro", "account", "celebration"];

function getNextMonday(): string {
  const today = new Date();
  const dow = today.getDay();
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMonday);
  return monday.toISOString().split("T")[0];
}

const LEVEL_TO_DB: Record<Level, string> = { beginner: "debutant", intermediate: "intermediaire", elite: "elite" };
const DB_TO_LEVEL: Record<string, Level> = { debutant: "beginner", intermediaire: "intermediate", avance: "elite", elite: "elite" };
const DOW_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

// Remplace l'ancien buildProgramTemplate() (banque statique getSessionTemplates(), 4 semaines
// fixes, target_difficulty par simple décalage, type "volume" partout) — appelle désormais le
// vrai générateur (/api/programs/generate, périodisation par blocs MEV/Surcharge/MRV/Deload,
// curriculum sportif par archétypes) plutôt que de dupliquer sa logique. duration/focus figés
// (4 semaines, "mixte") faute d'un champ dédié dans l'onboarding — reste identique au comportement
// actuel (déjà toujours 4 semaines) côté durée ; "mixte" est le même repli "focus inconnu" déjà
// utilisé pour les 48 programmes de bibliothèque sans focus renseigné.
// Ne bloque jamais la suite du signup (parcours critique) — échec = false, logué, jamais throw.
async function generateAndAssignProgram(
  uid: string,
  opts: { sport: string; level: Level; days: number[]; target: { athlete_id: string } | { user_id: string }; wellnessAdjustment?: number; focus?: ProgramFocus; weaknesses?: string[]; duration?: 4 | 6 | 8 | 12 | 16; customExercises?: Record<string, string[]>; customWeaknessMeta?: Record<string, { extraLine: string; typeHints: string[] }>; customSessionLabels?: Record<string, string>; startDate?: string; template?: ProgramTemplate }
): Promise<boolean> {
  try {
    const dayStrings = opts.days.map(d => DOW_NAMES[d]).filter(Boolean);
    if (!dayStrings.length) return false;
    const focus = opts.focus ?? "mixte";

    let template: ProgramTemplate;
    let duration: number;
    let programName: string;
    if (opts.template) {
      /* Programme importé (photo/texte, sport_2a — 2026-08-29) : une seule semaine reconstruite
         fidèlement, jamais générée — on saute /api/programs/generate entièrement et on persiste ce
         template tel quel. weeks_count reflète sa vraie longueur (1), pas opts.duration (qui ne
         s'applique qu'à un programme généré). Extension sur plusieurs semaines : Reconduire, déjà
         construit, pas une génération ici. */
      template = opts.template;
      duration = template.weeks.length || 1;
      programName = `Programme importé — ${opts.sport || "sport à préciser"}`;
    } else {
      // Durée dynamique (2026-08-05) : le chemin "programme claimé" personnalisé passe la vraie
      // durée du programme claimé (claimedProgramWeeks) plutôt que de la tronquer silencieusement à
      // 4 semaines — le chemin classique reste sur 4 (opts.duration jamais fourni dans ce cas).
      duration = opts.duration ?? 4;
      const genRes = await fetch("/api/programs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: opts.sport, level: LEVEL_TO_DB[opts.level], days: dayStrings, duration, focus, weaknesses: opts.weaknesses ?? [],
          ...(opts.customExercises ? { customExercises: opts.customExercises, customWeaknessMeta: opts.customWeaknessMeta, customSessionLabels: opts.customSessionLabels } : {}),
        }),
      });
      if (!genRes.ok) throw new Error(`generate ${genRes.status}`);
      ({ template } = await genRes.json() as { template: ProgramTemplate });
      programName = `Programme ${opts.sport} — ${duration} semaines`;
    }

    const progRes = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: programName,
        sport: opts.sport || "Importé",
        level: LEVEL_TO_DB[opts.level],
        focus,
        weeks_count: duration,
        sessions_per_week: opts.days.length,
        template,
      }),
    });
    if (!progRes.ok) throw new Error(`programs ${progRes.status}`);
    const { program } = await progRes.json() as { program: { id: string } };

    const assignBody: Record<string, unknown> = {
      start_date: opts.startDate ?? getNextMonday(),
      ...("athlete_id" in opts.target ? { athlete_id: opts.target.athlete_id } : { user_id: opts.target.user_id }),
      ...(typeof opts.wellnessAdjustment === "number" ? { wellnessAdjustment: opts.wellnessAdjustment } : {}),
    };
    const assignRes = await fetch(`/api/programs/${program.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignBody),
    });
    if (!assignRes.ok) throw new Error(`assign ${assignRes.status}`);
    return true;
  } catch (err) {
    console.error(`[onboarding] generateAndAssignProgram failed for ${uid}:`, err);
    return false;
  }
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

// Mêmes 9 sports, mêmes labels/icônes que ProgramCriteriaModal.tsx (in-app) — garantit le même
// routage getSportCategory(). Remplace l'ancien bucket générique "Force & puissance" qui matchait
// toujours le mot-clé power/force, impossible d'atteindre le curriculum haltérophilie/musculation
// depuis l'onboarding (même bug déjà corrigé côté in-app le 2026-08-05).
const SPORT_CATEGORIES = [
  { id: "Haltérophilie",              icon: "🏋️", sub: "Arraché, épaulé-jeté" },
  { id: "Powerlifting",               icon: "🦍", sub: "Squat, développé couché, soulevé de terre" },
  { id: "Musculation / Hypertrophie", icon: "💪", sub: "Prise de masse, split par groupe musculaire" },
  { id: "Fitness / CrossFit",         icon: "🔥", sub: "Conditionnement croisé" },
  { id: "Athlétisme & vitesse",       icon: "🏃", sub: "Sprint, saut, lancer…" },
  { id: "Sports collectifs",          icon: "⚽", sub: "Rugby, handball, basket, foot…" },
  { id: "Endurance",                  icon: "🏊", sub: "Course, cyclisme, natation…" },
  { id: "Arts martiaux & combat",     icon: "🥋", sub: "Judo, MMA, boxe…" },
];

/* Devine à quelle chip de SPORT_CATEGORIES rattacher visuellement le sport déduit d'un programme
   claimé (2026-08-29) — programs.sport porte des libellés de bibliothèque bien plus fins que les 8
   catégories de cet écran (ex. "Musculation/Hypertrophie" sans espaces, "Course à pied/Endurance",
   des titres de spécialisation type "Powerlifting — Spécialisation Squat"...) : une égalité stricte
   sur `sport === s.id` ne matcherait quasiment jamais, et aucune chip n'apparaîtrait présélectionnée
   — silencieusement, sans erreur. Mots-clés plutôt qu'égalité, purement pour l'affichage : `sport`
   garde sa valeur précise déduite pour la génération réelle (/api/programs/generate re-catégorise
   déjà finement via getSportCategory() côté serveur), seul le rendu de la chip s'appuie sur ce
   repli. */
function guessSportChip(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/hypertroph|musculation/.test(s)) return "Musculation / Hypertrophie";
  if (/power(lifting)?|squat|bench|deadlift/.test(s)) return "Powerlifting";
  if (/halt[ée]rophil|arrach|[ée]paul|snatch|clean.?jerk/.test(s)) return "Haltérophilie";
  if (/crossfit|hyrox|fitness/.test(s)) return "Fitness / CrossFit";
  if (/sprint|athl[ée]tisme|\bsaut|vitesse/.test(s)) return "Athlétisme & vitesse";
  if (/collectif|rugby|foot|hand|basket|volley/.test(s)) return "Sports collectifs";
  if (/endurance|course|cyclisme|natation|trail|triathlon|aviron|v[ée]lo|marathon|semi/.test(s)) return "Endurance";
  if (/combat|martiaux|boxe|judo|\bmma\b/.test(s)) return "Arts martiaux & combat";
  return null;
}

const SPORT_QUALITIES: Record<string, string> = {
  "Haltérophilie":              "Explosivité, technique de mouvement, mobilité",
  "Powerlifting":                "Force maximale, technique de charge, récupération",
  "Musculation / Hypertrophie": "Volume d'entraînement, tension musculaire, progression continue",
  "Fitness / CrossFit":         "Conditionnement croisé, force générale, endurance",
  "Athlétisme & vitesse":       "Vitesse, explosivité, technique de course",
  "Sports collectifs":          "Répétition d'efforts, agilité, puissance",
  "Endurance":                   "Endurance aérobie, gestion du seuil, récupération active",
  "Arts martiaux & combat":     "Endurance spécifique combat, explosivité, mobilité articulaire",
  "Autre":                       "Qualités physiques adaptées à ta discipline",
};

// Clés/labels identiques à WEAKNESSES_BY_SPORT dans ProgramCriteriaModal.tsx (in-app) — même table
// pas partagée entre les 2 fichiers (choix déjà fait pour SPORTS/FOCUSES avant ce chantier), mais
// gardée synchronisée manuellement. Biaise réellement la génération via generate/route.ts (2 niveaux
// : fréquence pour powerlifting/musculation/halterophilie, ligne ajoutée pour tous les sports).
const WEAKNESSES_BY_SPORT: Record<string, { key: string; label: string }[]> = {
  "Haltérophilie": [
    { key: "arrache", label: "Technique arraché" },
    { key: "epaule_jete", label: "Technique épaulé-jeté" },
    { key: "mobilite", label: "Mobilité hanches/chevilles" },
    { key: "explosivite", label: "Explosivité" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Powerlifting": [
    { key: "jambes", label: "Jambes" },
    { key: "dos_bras", label: "Dos & bras" },
    { key: "pecs_epaules", label: "Pectoraux & épaules" },
    { key: "technique", label: "Technique de mouvement" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Musculation / Hypertrophie": [
    { key: "jambes", label: "Jambes" },
    { key: "dos", label: "Dos" },
    { key: "pectoraux", label: "Pectoraux" },
    { key: "epaules", label: "Épaules" },
    { key: "bras", label: "Bras" },
  ],
  "Athlétisme & vitesse": [
    { key: "vitesse", label: "Vitesse pure" },
    { key: "endurance_vitesse", label: "Endurance de vitesse" },
    { key: "explosivite", label: "Explosivité" },
    { key: "technique_course", label: "Technique de course" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Endurance": [
    { key: "vitesse", label: "Vitesse" },
    { key: "endurance_fond", label: "Endurance de fond" },
    { key: "explosivite", label: "Explosivité" },
    { key: "technique_course", label: "Technique de course" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Sports collectifs": [
    { key: "puissance", label: "Puissance" },
    { key: "vitesse", label: "Vitesse" },
    { key: "explosivite", label: "Explosivité" },
    { key: "gainage", label: "Gainage / contact" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Fitness / CrossFit": [
    { key: "cardio", label: "Endurance cardio" },
    { key: "force_generale", label: "Force générale" },
    { key: "technique", label: "Technique des mouvements" },
    { key: "explosivite", label: "Explosivité" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Arts martiaux & combat": [
    { key: "frappe", label: "Puissance de frappe" },
    { key: "cardio", label: "Endurance cardio" },
    { key: "explosivite", label: "Explosivité" },
    { key: "gainage", label: "Gainage" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Autre": [
    { key: "force_generale", label: "Force générale" },
    { key: "cardio", label: "Endurance cardio" },
    { key: "technique", label: "Technique" },
    { key: "recuperation", label: "Récupération" },
  ],
};

// 4 options réelles qui pilotent ProgramFocus (remplace les 4 anciennes options narratives qui
// n'alimentaient que profiles.objective, jamais la génération) — wording/icônes identiques à
// ProgramCriteriaModal.tsx/POC. `lower` sert aux phrases interpolées (goalLower) : la dérivation
// mécanique (.charAt(0).toLowerCase()+slice(1)) donnait des phrases bancales pour "mixte" ("pour
// un peu de tout, rester régulier" après un "pour" déjà présent dans la phrase).
const GOAL_META: { label: string; icon: string; focus: ProgramFocus; lower: string }[] = [
  { label: "Augmenter mon volume d'entraînement", icon: "📈", focus: "volume",      lower: "augmenter ton volume d'entraînement" },
  { label: "Progresser en intensité",             icon: "🔥", focus: "intensite",   lower: "progresser en intensité" },
  { label: "Préparer une échéance précise",       icon: "🎯", focus: "competition", lower: "préparer ton échéance" },
  { label: "Un peu de tout, rester régulier",     icon: "⚖️", focus: "mixte",       lower: "rester régulier" },
];
const GOAL_TO_FOCUS: Record<string, ProgramFocus> = Object.fromEntries(GOAL_META.map(g => [g.label, g.focus]));
const GOAL_TO_LOWER: Record<string, string> = Object.fromEntries(GOAL_META.map(g => [g.label, g.lower]));

/* Contenu coach post-concept_autoreg (2026-08-14) — remplace level_2a/goal_2a/days_2a côté coach
   uniquement (le sportif garde faiblesses/objectif du bloc/jours inchangés) ; sport reste sport_2a,
   déjà coach-aware. Même step IDs/mêmes events PostHog — juste le contenu qui change, pas le
   nombre d'étapes. Reprend les options déjà écrites sous les step IDs morts count_2b/tool_2b
   (jamais dans un path actif) plutôt que d'en réinventer. */
const COACH_COUNT_OPTS = [
  { v: "1–5 sportifs",   sub: "Coaching rapproché" },
  { v: "6–20 sportifs",  sub: "Groupe moyen" },
  { v: "21–50 sportifs", sub: "Large effectif" },
  { v: "50+ sportifs",   sub: "Structure club" },
];
const COACH_TOOL_OPTS = [
  { id: "Excel / Google Sheets",      icon: "📊" },
  { id: "Application de suivi",       icon: "📱" },
  { id: "Questionnaire / formulaire", icon: "📋" },
  { id: "Plusieurs outils différents", icon: "🔀" },
  { id: "Principalement au feeling",  icon: "🤷" },
];
// "Ils suivent des programmes personnalisés" et "Chaque sportif a son propre programme" du brief
// initial disaient la même chose (programme individuel par sportif) — fusionnées, 3 options au
// lieu de 4 (retour de Gildas).
const COACH_STYLE_OPTS = [
  { id: "Tous suivent le même programme",                  icon: "🧑‍🤝‍🧑" },
  { id: "Programme commun avec adaptations individuelles", icon: "🔀" },
  { id: "Chaque sportif a son propre programme",           icon: "👤" },
];

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

// Badge compact (POC + ProgramCriteriaModal.tsx "Pill") — pour les sélecteurs qui prennent trop de
// place en cartes hautes (Choice) : sport (single-select) et faiblesses (multi-select, checkmark).
function Chip({ icon, label, selected, checkmark, title, onClick }: { icon?: string; label: string; selected: boolean; checkmark?: boolean; title?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: "10px 15px", borderRadius: 999, cursor: "pointer",
      border: selected ? "1.5px solid #d44000" : "1.5px solid rgba(0,0,0,.10)",
      background: selected ? "rgba(212,64,0,.06)" : "#fff",
      color: selected ? "#d44000" : "#3a3f44",
      fontWeight: 700, fontSize: 13, fontFamily: "inherit",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {checkmark && selected && (
        <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#d44000", color: "#fff", fontSize: 9, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
      )}
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function ProfileRecapStep({
  role, sport, sportLabel, sportIcon, showLevel, level, goalLower, showDays, trainingDays, claimedProgramName, hasPreviewNext, personaTitle, compareRows, onNext,
}: {
  role: Role; sport: string; sportLabel: string; sportIcon: string; showLevel: boolean; level: Level; goalLower: string;
  showDays: boolean; trainingDays: number[]; claimedProgramName?: string | null;
  hasPreviewNext: boolean; personaTitle: string; compareRows: { before: string; after: string }[]; onNext: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "reveal">("loading");
  useEffect(() => {
    const t = setTimeout(() => setPhase("reveal"), 1400);
    return () => clearTimeout(t);
  }, []);
  const accent: React.CSSProperties = { color: "#d44000", fontWeight: 800 };
  const qualities = SPORT_QUALITIES[sport] || SPORT_QUALITIES["Autre"];
  const shortTags = role === "coach" ? RECAP_SHORT_TAGS_COACH : RECAP_SHORT_TAGS_ATHLETE;

  return (
    <div>
      <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 16 }}>{sportIcon}</div>
      <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 16 }}>Ton programme d&apos;entraînement</div>
      {/* Paragraphe fusionné (2026-07-31) : reprenait avant un 2e paragraphe + une carte "Ce que ce
          programme travaille" séparée, qui faisaient doublon sur le nombre de jours par semaine —
          condensé en un seul paragraphe, qualités du sport incluses. */}
      <div style={{ fontSize: 16, color: "#3a3f44", lineHeight: 1.65, marginBottom: 20 }}>
        {role === "coach" ? "On prépare un premier programme " : "On prépare ton programme "}
        <span style={accent}>{claimedProgramName || sportLabel}</span>
        {showLevel && <>, niveau <span style={accent}>{LEVEL_LABELS[level]}</span></>}
        {goalLower && <>, pour <span style={accent}>{goalLower}</span></>}
        {" : "}{qualities}
        {showDays && <>, réparti sur <span style={accent}>{trainingDays.length} jour{trainingDays.length > 1 ? "s" : ""} par semaine</span></>}
        {" avec une charge qui s'ajuste "}{role === "coach" ? "à la forme du jour de chacun" : "à ta forme du jour"}.
      </div>

      {/* Carte empilée façon Superpower (2026-07-31) : carte grisée = écho du persona déjà révélé
          sur autoreg_score(_coach), tags courts génériques par dimension (pas de personnalisation
          ici, volontairement — la vraie personnalisation vit dans la carte du dessus via les
          tables *_INSIGHTS, cf. compareRows). */}
      <div style={{ position: "relative", marginTop: 14, marginBottom: 26, paddingTop: 14 }}>
        <div style={{ background: "#ececea", borderRadius: 18, padding: "16px 18px 26px", margin: "0 14px", opacity: 0.9 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#9a9d9c", marginBottom: 11 }}>Ton profil : {personaTitle}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {shortTags.map((t, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 500, color: "#9a9d9c", background: "#dedcd9", padding: "6px 11px", borderRadius: 999, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ position: "relative", background: "#fff", borderRadius: 20, padding: "18px 20px 20px", marginTop: -10, boxShadow: "0 16px 34px rgba(0,0,0,.10)", border: "1px solid rgba(0,0,0,.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, color: "#1f2428" }}>Avec ThePerfClub</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#d44000" }}>{compareRows.length} leviers activés</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {compareRows.map((row, i) => (
              <span key={i} style={{ fontSize: 11.5, fontWeight: 700, color: "#b83600", background: "rgba(212,64,0,.10)", borderRadius: 14, padding: "7px 12px", lineHeight: 1.35 }}>{row.after}</span>
            ))}
          </div>
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
/* Ajoutées le 2026-07-31 : la planification (planning_2a/planning_time_2b) était collectée et
   servait déjà à la jauge "Planification de la charge" d'autoreg_score, mais n'avait jamais son
   propre insight dans le comparatif — seules 3 des 4 questions du diagnostic y apparaissaient. */
const PLANNING_INSIGHTS: Record<string, string> = {
  "Non, j'ai un plan clair que je respecte": "Tu suis un plan clair, mais sans qu'il s'ajuste vraiment à ta forme du jour.",
  "Un peu, je m'adapte souvent au ressenti": "Tu ajustes souvent au ressenti, sans donnée pour confirmer ces choix.",
  "Souvent, c'est flou d'une semaine à l'autre": "Ta charge reste floue d'une semaine à l'autre, difficile à structurer seul.",
  "Complètement, je fais entièrement au feeling": "Tu avances entièrement au feeling, sans plan de charge pour te guider.",
};
const PLANNING_TIME_COACH_INSIGHTS: Record<string, string> = {
  "Non, j'ai un process bien rodé": "Ton process est rodé, mais construit à la main, sportif par sportif.",
  "Un peu, mais ça reste gérable": "C'est gérable aujourd'hui, mais ça prend du temps que tu pourrais utiliser ailleurs.",
  "Oui, c'est souvent chronophage": "Planifier la charge de chaque sportif te prend souvent trop de temps.",
  "Oui, c'est le principal frein de ma semaine": "La planification de la charge est le principal frein de ta semaine.",
};
/* Ajoutées le 2026-08-14 : nombre de sportifs/outil de suivi/style d'entraînement (level_2a/
   goal_2a/days_2a côté coach, voir plus haut) — même logique "after" que les tables ci-dessus,
   .before n'est jamais affiché (carte grisée générique), voir compareRows plus bas. */
const ATHLETE_COUNT_INSIGHTS: Record<string, string> = {
  "1–5 sportifs":   "Suivi individuel fin, sans effort de plus.",
  "6–20 sportifs":  "Toute l'équipe visible d'un coup d'œil.",
  "21–50 sportifs": "Priorisation automatique sur qui a besoin d'attention.",
  "50+ sportifs":   "Structure club sans perdre le suivi individuel.",
};
const TRACKING_TOOL_INSIGHTS: Record<string, string> = {
  "Excel / Google Sheets":      "Fini les tableurs à remplir à la main.",
  "Application de suivi":       "Récupération et charge dans un seul endroit.",
  "Questionnaire / formulaire": "Les réponses arrivent déjà analysées.",
  "Plusieurs outils différents": "Un seul endroit pour tout voir.",
  "Principalement au feeling":  "Le ressenti devient une vraie donnée.",
};
const TRAINING_STYLE_INSIGHTS: Record<string, string> = {
  "Tous suivent le même programme":                        "Chaque sportif garde sa propre récupération.",
  "Programme commun avec adaptations individuelles":       "Les adaptations se font automatiquement.",
  "Chaque sportif a son propre programme":                  "Chaque programme s'ajuste sans y repenser.",
};
/* Tags courts de la carte grisée "Ton profil : {persona}" (profile_recap) — un par dimension du
   diagnostic, pas par réponse individuelle (contrairement aux tables ci-dessus) : cette carte est
   volontairement générique/rapide à lire, la personnalisation réelle vit dans la carte "Avec
   ThePerfClub" juste en dessous (via les tables *_INSIGHTS). */
const RECAP_SHORT_TAGS_ATHLETE = ["Tu ignores ce qui freine", "Tu pousses à l'aveugle", "Ta charge, au feeling", "Ta fatigue, jamais écoutée"];
const RECAP_SHORT_TAGS_COACH = ["Tes sportifs peu visibles", "Le RPE t'échappe", "Planifié au feeling", "Fatigue jamais repérée"];

/* ── main ── */
export default function OnboardingFlow({ userId, pendingData, initialRole }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  /* Une continuation Google (pendingData) a déjà un userId (compte créé), mais c'est toujours
     une inscription en cours — pas un ancien compte incomplet qui revient plus tard. Sans ce
     cas, ces sessions basculaient en "mode auth" (CTA explicite) sur les étapes de sélection
     qui suivent, au lieu de l'auto-advance au tap attendu en inscription. */
  const isRegisterMode = !userId || !!pendingData;
  /* Ancre neutre pour les A/B tests (2026-08-07) : capture_pageview est désactivé
     (PostHogProvider.tsx), donc rien ne se déclenchait avant la toute première étape réellement
     rendue (value_intro OU role selon le flag skip-value-intro) — un funnel qui démarrerait sur
     l'un des deux tomberait à 0% pour l'autre bras. Déclenché une seule fois au montage,
     indépendamment de path/currentStep/valueVariantResolved, pour rester commun aux 4 combinaisons
     des 2 flags A/B en cours. */
  useEffect(() => {
    if (!isRegisterMode) return;
    posthog.capture("onboarding_flow_started");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* Largeur de colonne responsive (2026-07-27) — même formule que OnboardingBackground.tsx/
     Actions.tsx, pour que les 2 footers fixed rendus directement ici (wellness_q, paywall_form)
     restent alignés avec le contenu au lieu de rester figés à 560px pendant que la page
     s'élargit sur desktop/tablette. */
  const { isMd: colIsMd, isLg: colIsLg } = useBreakpoint();
  const colMaxWidth = colIsLg ? 720 : colIsMd ? 640 : 560;
  const [hasClaimedProgram, setHasClaimedProgram] = useState<boolean | null>(null);
  /* Sportif invité par un coach via /join/[code] (voir INVITE_ATHLETE_PATH). `coachInviteCode`
     reste la source de vérité pour l'appel à /api/invite/join dans handleFinish() ; `hasCoachInvite`
     peut être rétrogradé à false si /api/invite/validate juge le code invalide, ou si /api/invite/join
     échoue au moment de la soumission (voir inviteJoinFailed). */
  const [hasCoachInvite, setHasCoachInvite] = useState<boolean | null>(null);
  const [coachInviteCode, setCoachInviteCode] = useState<string | null>(null);
  const [inviteJoinFailed, setInviteJoinFailed] = useState(false);

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

  /* A/B test "skip-value-intro" (2026-08-07) : bras "test" = value_intro retiré du path, atterrit
     directement sur "role" (redevenu un step séparé depuis la défusion du 2026-08-06). Indépendant
     du flag ci-dessus (control/test de la position du signup) — Gildas a choisi de faire tourner
     les deux en parallèle malgré la dilution de volume, jugeant les deux questions sans interaction
     l'une sur l'autre. Override dev/support : ?value=test|control (nom différent de ?ab= pour ne
     pas collisionner avec l'autre test). Personne property `value_variant` posée pour le breakdown
     funnel, MAIS même limite documentée que `ab_variant` (feedback-ab-variant-bug) : croiser avec
     l'event property $feature/skip-value-intro avant de conclure quoi que ce soit, ne jamais faire
     confiance à la seule person property. */
  const rawValueVariant = useFeatureFlagVariantKey("skip-value-intro");
  const [assignedValueVariant, setAssignedValueVariant] = useState<"control" | "test" | null>(null);
  useEffect(() => {
    if (assignedValueVariant || !abEligible) return;
    const forced = new URLSearchParams(window.location.search).get("value");
    if (forced === "test" || forced === "control") { setAssignedValueVariant(forced); return; }
    if (rawValueVariant === "test" || rawValueVariant === "control") setAssignedValueVariant(rawValueVariant);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValueVariant, abEligible]);
  useEffect(() => {
    if (assignedValueVariant) posthog.setPersonProperties({ value_variant: assignedValueVariant });
  }, [assignedValueVariant]);
  /* Garde de premier rendu : value_intro est l'étape 0, donc si ce flag résout APRÈS le premier
     paint, path perdrait "value_intro" sous les yeux d'un visiteur déjà en train de le regarder
     (flash value_intro→role). Même mécanisme que claimedNameResolved plus bas (écran vide court,
     jamais bloquant indéfiniment) — seuls les visiteurs éligibles (isRegisterMode) sont concernés,
     une reprise de session n'a pas besoin d'attendre puisque son stepIdx n'est de toute façon pas 0.
     Bug trouvé le 2026-08-14 (voir mémoire project_ab_test_skip_value_intro) : un timeout fixe de
     700ms devinait la résolution du flag au lieu de l'observer — sur 20 personnes taguées "test",
     19 ont quand même vu value_intro (le timeout tombait avant que le flag ait réellement résolu,
     surtout en 1ère visite sans cache local PostHog). Fix : `posthog.onFeatureFlags()` est le
     signal réel de résolution (fire dès que les flags sont chargés, y compris si déjà en cache),
     le timeout ne sert plus que de filet de sécurité si l'appel réseau échoue/traîne. */
  const [valueVariantResolved, setValueVariantResolved] = useState(!abEligible);
  useEffect(() => {
    if (!abEligible || valueVariantResolved) return;
    if (assignedValueVariant) { setValueVariantResolved(true); return; }
    const unsubscribe = posthog.onFeatureFlags(() => setValueVariantResolved(true));
    const t = setTimeout(() => setValueVariantResolved(true), 2500);
    return () => { clearTimeout(t); unsubscribe(); };
  }, [abEligible, assignedValueVariant, valueVariantResolved]);

  /* value_intro est désormais toujours l'étape 0 dans tous les paths, pour tout le monde — "role"
     n'existe plus comme step séparé (fusionné dans le CTA de value_intro, voir plus bas). Un
     ?role= prefill n'a donc plus besoin de sauter d'index : value_intro s'affiche normalement
     (avec un wording déjà personnalisé), seul son CTA change (bouton unique au lieu du choix). */
  /* ?dbgstep=N (outil de dev/support, comme ?ab=test|control) : démarre directement à l'index N
     du path courant plutôt que de rejouer tout le flow — pratique pour cibler un écran précis en
     local. Index = position dans le tableau du path actif (variante A/B, claimed ou non). */
  const [stepIdx, setStepIdx] = useState(() => {
    if (typeof window !== "undefined") {
      const dbg = new URLSearchParams(window.location.search).get("dbgstep");
      if (dbg) return parseInt(dbg, 10);
    }
    return 0;
  });
  const [role, setRole]       = useState<Role>(pendingData?.role || initialRole || "athlete");
  /* roleChosen ne dérive plus de initialRole (2026-08-06) : le rôle pré-rempli par un ?role= dans
     l'URL (iframes programme, landing pages) mesurait nettement moins bien que le demander sur un
     vrai écran de choix (34,6% vs 65,0%, même canal, même semaine) — voir la restauration du step
     "role" ci-dessous. Seule une continuation Google (pendingData.role) reste un vrai choix déjà
     fait dans CETTE session (avant le redirect OAuth), donc reste dispensée de le refaire. */
  const [roleChosen, setRoleChosen] = useState(!!pendingData?.role);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [claimedProgramName, setClaimedProgramName] = useState<string | null>(null);
  const [claimedProgramWeeks, setClaimedProgramWeeks] = useState<number | null>(null);
  /* Sur réseau mobile réel, le fetch /api/programs/[id] (qui pose claimedProgramName) peut prendre
     assez longtemps pour que value_intro affiche d'abord le wording générique puis se corrige sous
     les yeux de l'utilisateur — invisible sur un réseau rapide (dev, wifi), repéré par Gildas
     uniquement sur téléphone réel. Attend la résolution avant de peindre value_intro, borné par un
     timeout pour ne jamais bloquer indéfiniment si l'API échoue ou si le programme a été supprimé. */
  const [claimedNameResolved, setClaimedNameResolved] = useState(false);
  useEffect(() => {
    if (hasClaimedProgram === null) return; // pas encore résolu (localStorage) — attendre
    if (!hasClaimedProgram || claimedProgramName) { setClaimedNameResolved(true); return; }
    const t = setTimeout(() => setClaimedNameResolved(true), 2500);
    return () => clearTimeout(t);
  }, [hasClaimedProgram, claimedProgramName]);

  /* invite_team */
  const [inviteEmail, setInviteEmail] = useState("");
  const [extraInviteEmails, setExtraInviteEmails] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<"linked" | "pending" | null>(null);
  const [inviteSentCount, setInviteSentCount] = useState(0);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  /* questionnaire */
  const [sport, setSport]                         = useState(pendingData?.sport || "");
  const [sportPrecision, setSportPrecision]       = useState(pendingData?.sportPrecision || "");
  // Sport libre analysé par Claude (2026-08-06, porté de ProgramCriteriaModal.tsx in-app une fois
  // validé) — sportPrecision sert de texte de description ET d'affichage ("Autre - <texte>" reste
  // le sport stocké/affiché partout, inchangé) ; customSport ne fournit QUE la banque d'exercices +
  // le menu de faiblesses en plus, injectés dans generateAndAssignProgram via customExercises/
  // customWeaknessMeta quand status === "generated". "failed"/absent = repli silencieux sur le
  // contenu générique "Autre" déjà existant, jamais d'écran cassé.
  type CustomSportState =
    | { status: "matched"; sportLabel: string }
    | { status: "generated"; sportLabel: string; exercises: Record<string, string[]>; weaknessOptions: { key: string; label: string }[]; weaknessMeta: Record<string, { extraLine: string; typeHints: string[] }>; sessionLabels?: Record<string, string> }
    | { status: "failed" };
  const [analyzingSport, setAnalyzingSport]       = useState(false);
  const [customSport, setCustomSport]             = useState<CustomSportState | null>(null);
  /* "Autre" redevient un chip dans la grille (2026-08-29) plutôt qu'un champ toujours visible —
     revient sur la décision du 2026-08-06, mais pour une vraie raison structurelle : avec l'import
     ci-dessous comme 3e chemin, garder "Autre" toujours visible ET import caché derrière un clic
     créait une asymétrie (2 mécaniques d'interaction différentes sur un même écran). Les deux sont
     maintenant symétriques : un déclencheur toujours visible (chip ou carte), un clic, une zone de
     révélation en dessous — jamais deux zones ouvertes en même temps (voir mutuelle exclusion sur
     les onClick des chips/carte plus bas). */
  const [autreChipSelected, setAutreChipSelected] = useState(false);
  /* Import de programme existant (photo/texte) sur sport_2a — si réussi, saute level_2a/days_2a
     directement vers week_preview (voir advanceToWeekPreviewViaImport ci-dessous) : jours et
     structure sont déjà dans l'import, imposer des faiblesses sur un programme déjà figé n'a pas
     de sens. Même route /api/programs/import que le program builder in-app (2026-08-29), rendue
     publique le même jour pour cette raison précise (account n'existe pas encore à ce stade). */
  const [importText, setImportText]               = useState("");
  const [importPhotoFile, setImportPhotoFile]     = useState<File | null>(null);
  const [importAnalyzing, setImportAnalyzing]     = useState(false);
  const [importError, setImportError]             = useState<string | null>(null);
  const [importedTemplate, setImportedTemplate]   = useState<ProgramTemplate | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  /* Transition de génération (2026-08-17) — voir advanceMaybeGenerating() et GenerationLoadingScreen. */
  const [genLoading, setGenLoading]               = useState(false);
  /* Transition "reconduction" (2026-08-17) — voir advanceMaybeReconduction() et ReconductionTeaserScreen. */
  const [reconLoading, setReconLoading]           = useState(false);
  // "level_2a" ne fait plus choisir de niveau (remplacé par les faiblesses, voir plus bas) —
  // `level`/`setLevel` restent réels (pas une constante) car `setLevel` est encore utilisé pour le
  // chemin "programme claimé" (ligne ~979, infère le niveau du programme réellement claimé, sans
  // rapport avec ce chantier). Pour le chemin classique, reste à sa valeur par défaut neutre.
  const [level, setLevel]                         = useState<Level>(pendingData?.level || "intermediate");
  const [weaknesses, setWeaknesses]               = useState<string[]>(pendingData?.weaknesses ?? []);
  const [goal, setGoal]                           = useState(pendingData?.goal || "");
  const [frustration, setFrustration]             = useState(pendingData?.frustration || "");
  const [trainingDays, setTrainingDays]           = useState<number[]>(pendingData?.trainingDays ?? [1, 3, 5]);
  const [coachingContext, setCoachingContext]     = useState(pendingData?.coachingContext || "");
  const [athleteCount, setAthleteCount]           = useState(pendingData?.athleteCount || "");
  const [coachingChallenge, setCoachingChallenge] = useState(pendingData?.coachingChallenge || "");
  const [currentTool, setCurrentTool]             = useState(pendingData?.currentTool || "");
  const [trainingStyle, setTrainingStyle]         = useState(pendingData?.trainingStyle || "");

  /* Ancien fallback "coach → 4 jours par défaut, pas de sélecteur" (2026-08-14) supprimé le
     2026-08-19 : déjà mort en pratique depuis la 3e itération du 2026-08-17 (days_2a redemande de
     vrais jours aux deux rôles, voir sa doc plus bas — "ce choix réel le remplace"), mais inoffensif
     tant que "role" restait choisi AVANT "days_2a" (l'effet ne se redéclenchait plus après coup).
     Depuis le repositionnement de "role" après "days_2a" (voir doc des paths en tête de fichier),
     cet effet serait redevenu actif et aurait écrasé les vrais jours choisis par un coach dès que
     son rôle serait confirmé — supprimé plutôt que réordonné, puisqu'il ne sert plus à rien. */

  /* account */
  const [name, setName]         = useState(pendingData?.name || "");
  const [email, setEmail]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [emailSent, setEmailSent]   = useState(false);

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
  /* guard contre un double déclenchement de completeProfile() à l'entrée de profile_recap (voir effet dédié plus bas) */
  const profileCompleteGuardRef = useRef(false);
  /* Sportif non-claimé : le programme n'est plus généré+assigné immédiatement dans completeProfile()
     (voir sa doc) — les opts sont mémorisées ici, le vrai appel generateAndAssignProgram() part à la
     fin de wellness_q (voir finishAthleteActivation), avec la date choisie en célébration. null pour
     le programme claimé (assigné via claimAndAssignProgram, même point d'appel, même date). */
  const pendingAthleteProgramOptsRef = useRef<Parameters<typeof generateAndAssignProgram>[1] | null>(null);
  const [chosenStartDate, setChosenStartDate] = useState<string>(() => getNextMonday());
  /* Toggle notif de la célébration sportif — actif par défaut (voir CelebrationScreen), lu au clic
     du CTA principal (handleCelebrationAthleteNext), jamais au montage. */
  const [wantsPushReminder, setWantsPushReminder] = useState(true);

  function toggleBehavior(key: string) {
    setWBehaviors(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const getPath = (r: Role): StepId[] => {
    let base: StepId[];
    if (hasCoachInvite && r === "athlete") {
      base = INVITE_ATHLETE_PATH;
    } else if (assignedVariant === "test") {
      base = hasClaimedProgram ? (r === "coach" ? SHORT_PROGRAM_COACH_PATH : SHORT_PROGRAM_ATHLETE_PATH) : (r === "coach" ? SHORT_COACH_PATH : SHORT_ATHLETE_PATH);
    } else if (hasClaimedProgram) {
      base = r === "coach" ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH;
    } else {
      base = r === "coach" ? COACH_PATH : ATHLETE_PATH;
    }
    /* A/B "skip-value-intro" : ne s'applique jamais à INVITE_ATHLETE_PATH (hors périmètre, comme
       l'autre test) — pour tous les autres, "value_intro" est toujours en position 0, un simple
       filtre suffit, "role" devient alors la première étape réellement rendue. */
    if (assignedValueVariant === "test" && base !== INVITE_ATHLETE_PATH) {
      base = base.filter(s => s !== "value_intro");
    }
    return base;
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
    const code = localStorage.getItem("coach_invite_code");
    setHasCoachInvite(!!code);
    if (code) {
      setCoachInviteCode(code);
      posthog.setPersonProperties({ onboarding_source: "coach_invite" });
      posthog.capture("coach_invite_onboarding_start", { invite_code: code });
      fetch(`/api/invite/validate?code=${encodeURIComponent(code)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data?.valid) {
            /* Code invalide/supprimé entre l'ouverture du lien et le montage du flow — retombe
               sur le funnel standard plutôt que de bloquer sur un path qui promet un accès gratuit
               qui n'aura jamais lieu. */
            localStorage.removeItem("coach_invite_code");
            setHasCoachInvite(false);
          }
        })
        .catch(() => {});
    }

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

  /* Bug trouvé le 2026-08-14 (voir mémoire project_ab_test_skip_value_intro) : cet effet dépend
     seulement de `currentStep`, calculé à CHAQUE render — y compris les tout premiers, avant que
     `hasClaimedProgram`/`hasCoachInvite`/`claimedNameResolved`/`valueVariantResolved` soient
     connus, pendant lesquels le JSX plus bas affiche encore l'écran de chargement (voir ce même
     garde de rendu ligne ~1785). Sur ce premier render non résolu, `path` retombe sur son défaut
     (value_intro inclus) donc `currentStep === "value_intro"` — l'event `onboarding_value_intro_viewed`
     partait alors AVANT toute résolution de flag, quel que soit le bras assigné ensuite, y compris
     pour des visiteurs qui n'ont jamais vu cet écran à l'affichage réel (masqué par l'écran de
     chargement). `flowReady` reprend exactement la même condition que le garde de rendu — aucun
     event de vue d'étape ne doit partir tant que le JSX correspondant n'est pas réellement affiché. */
  const flowReady = hasClaimedProgram !== null && hasCoachInvite !== null && claimedNameResolved && valueVariantResolved;
  useEffect(() => {
    if (!flowReady) return;
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
  }, [currentStep, flowReady]);

  /* Ancien effet synthétique "?role= saute le step role" supprimé le 2026-08-06 : "role" redevient
     un vrai step rendu (voir plus bas) et roleChosen ne dérive plus de initialRole (voir plus haut)
     — plus personne ne saute ce step via un simple ?role= dans l'URL, donc plus besoin de rejouer
     un event synthétique pour préserver la continuité du funnel. Seule l'invitation coach (
     INVITE_ATHLETE_PATH, qui exclut "role" de son tableau) saute encore réellement ce step, mais ce
     trafic est déjà filtré hors des funnels historiques (onboarding_source is_not "coach_invite") —
     pas besoin d'un synthétique dédié pour lui. */

  useEffect(() => {
    if (pendingData?.role && !initialRole) {
      /* Continuation Google (pendingData) : ce montage démarre à stepIdx=0, donc value_intro se
         déclenche normalement (effet ci-dessus) — mais l'effet plus bas (deps [googleInitDone])
         saute directement après "account" sans jamais re-render ce step sur cette passe, puisque
         cette réponse est déjà connue (le clic "Continuer avec Google" a eu lieu SUR l'écran
         "account" réel, dans la session précédant le redirect OAuth). Résultat : le funnel ordonné
         ...→Formulaire compte→Compte créé ne peut jamais se chaîner pour ces sessions (repéré sur
         un coach payant réel, mezghadsport@gmail.com, 2026-07-28). On rejoue l'event manqué juste
         après value_intro, avant que account_created (async, ~800ms plus tard dans l'effet
         pendingData/userId) ne parte.
         Depuis le repositionnement de "role" après week_preview (2026-08-19, voir doc des paths en
         tête de fichier), "role" n'est PLUS un step sauté par ce mécanisme — il a été réellement
         vu et cliqué dans la session AVANT le redirect OAuth (contrairement à l'ancien ordre, où
         "role" et "account" étaient adjacents et tous deux sautés ensemble) : son event
         onboarding_role_viewed part déjà normalement via l'effet générique plus haut, pendant
         cette session-là. Rejouer un 2e "role_viewed" synthétique ici le compterait en double —
         seul "account" reste synthétique. */
      const accountProps = { step: "account", step_index: 0, role: pendingData.role, mode: isRegisterMode ? "register" : "auth" };
      posthog.capture("onboarding_step_viewed", accountProps);
      posthog.capture("onboarding_account_viewed", accountProps);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* Le Signup (step "account") arrive désormais APRÈS week_preview/role/decision (2026-08-19,
     voir doc des paths en tête de fichier) — sport/faiblesses/jours/rôle sont donc
     déjà connus au moment où le compte est créé, plus besoin d'attendre un step ultérieur pour
     déclencher la vraie complétion de profil (sessions, wellness baseline, démo coach, génération
     réelle du programme). completeProfile() est appelée directement, une seule fois, juste après
     createAccount() dans handleFinish() (les 2 branches : nouvelle inscription et reprise
     "auth mode") et dans l'effet d'init de la continuation Google — gardée par profileCompleteGuardRef
     à chacun de ces 3 points d'appel plutôt que par un effet séparé sur currentStep. Pour le rôle
     coach, la branche coach de completeProfile() gère déjà le cas "programme claimé" (sport/niveau
     déduits du claim, faiblesses/jours collectés via les écrans dédiés). Ne s'exécute jamais pour
     INVITE_ATHLETE_PATH (aucun diagnostic sur ce chemin) — gardé par un simple `path.includes(...)`
     aux 3 points d'appel, qui reproduit exactement le gate de l'ancien effet (`currentStep ===
     "week_preview_2a"/"week_preview_2b"`, jamais atteint sur ce path). */

  /* Depuis le réordonnancement Paywall → Célébration → Activation, la dernière étape du path
     est désormais wellness_q/wellness_reveal (sportif) ou invite_team (coach) — plus celebration.
     Un appel à next() une fois sur cette dernière étape termine donc réellement l'onboarding. */
  function next() {
    if (!isLast) { setStepIdx(i => i + 1); return; }
    window.location.href = role === "coach" ? "/coach" : "/today";
  }

  /* Retour arrière (2026-08-17, 3e itération, retour explicite de Gildas) — réintroduit après avoir
     été supprimé partout le 2026-07-13 ("pour forcer l'avancement"). Volontairement minimal :
     navigation visuelle pure (décrémente stepIdx), ne défait aucun effet de bord déjà survenu
     (compte déjà créé, completeProfile() déjà exécuté à l'entrée de week_preview...) — même
     principe que l'ancien back() d'avant le 07-13, qui n'avait jamais annulé d'écriture non plus.
     Exclu sur les steps post-paiement (wellness_q/wellness_reveal/invite_team, activation réelle)
     et celebration (fin de flow) — reculer là n'a pas de sens. */
  function goBack() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }
  const canGoBack = stepIdx > 0 && !["celebration", "wellness_q", "wellness_reveal", "invite_team"].includes(currentStep);

  /* onDismiss du "×" de PrimingJourneyModal sur paywall_priming (2026-08-31, voir doc du path plus
     haut — même composant/même "×" que le gating in-app, demande explicite de Gildas). Saute
     paywall_priming ET paywall_form d'un coup, jamais juste le step courant — quelqu'un qui ferme
     l'offre ne doit jamais atterrir malgré lui sur le formulaire Stripe qu'il vient de refuser.
     paywall_form a son propre "×"/"← Retour" (onClose de PaywallModal) mais câblé sur goBack, pas
     celui-ci — comportement identique à l'in-app (onClose y renvoie vers priming, jamais un skip
     complet). Même filet que next() pour la redirection de fin de path (coach, qui n'a rien après
     paywall_form). */
  function skipPaywall() {
    posthog.capture("onboarding_paywall_skipped", { role, ab_variant: assignedVariant ?? "control" });
    const formIdx = path.indexOf("paywall_form");
    const targetIdx = formIdx === -1 ? stepIdx + 1 : formIdx + 1;
    if (targetIdx >= path.length) {
      window.location.href = role === "coach" ? "/coach" : "/today";
    } else {
      setStepIdx(targetIdx);
    }
  }

  /* Retour depuis week_preview atteint via import (advanceToWeekPreviewViaImport a sauté
     level_2a/days_2a) — goBack() décrémenterait stepIdx d'une seule position, ramenant sur
     days_2a, un step jamais réellement vu sur ce chemin. Cherche sport_2a en arrière dans le path
     résolu plutôt qu'un décalage fixe. */
  function backToSportAfterImport() {
    const idx = path.findIndex((s, i) => i < stepIdx && s === "sport_2a");
    setStepIdx(idx === -1 ? Math.max(0, stepIdx - 1) : idx);
  }

  function nextAfterChoice(setter: () => void) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setter();
    setTimeout(() => next(), 300);
  }

  /* Avance normalement, sauf si le step suivant dans le path résolu est week_preview_2a/2b — dans
     ce cas, joue d'abord la transition de génération (~1,7s, voir GenerationLoadingScreen) avant
     d'avancer réellement. Générique par construction (regarde path[stepIdx+1], pas le currentStep
     courant) : couvre days_2a→week_preview_2a (sportif), sport_2a→week_preview_2b (coach), et
     level_2a→week_preview_2b (coach, programme claimé) sans un branchement dédié par cas. */
  function advanceMaybeGenerating() {
    if (path[stepIdx + 1] === "week_preview_2a" || path[stepIdx + 1] === "week_preview_2b") {
      setGenLoading(true);
      setTimeout(() => { setGenLoading(false); next(); }, 1700);
    } else {
      next();
    }
  }

  /* Saute directement vers week_preview_2a/2b après un import réussi — contrairement à
     advanceMaybeGenerating() (avance d'une seule position), il faut ici sauter par-dessus
     level_2a/days_2a. Cherche l'index dans le path RÉSOLU plutôt qu'un décalage fixe (role n'est
     pas encore connu à ce stade, donc pas de moyen de savoir a priori si c'est 2a ou 2b). Filet de
     sécurité : si jamais aucun week_preview n'est trouvé après la position courante (ne devrait
     jamais arriver), avance normalement plutôt que de ne rien faire. */
  function advanceToWeekPreviewViaImport() {
    const idx = path.findIndex((s, i) => i > stepIdx && (s === "week_preview_2a" || s === "week_preview_2b"));
    if (idx === -1) { next(); return; }
    setGenLoading(true);
    setTimeout(() => { setGenLoading(false); setStepIdx(idx); }, 1700);
  }

  function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const match = result.match(/^data:([^;]+);base64,(.*)$/);
        if (!match) { reject(new Error("Fichier illisible")); return; }
        resolve({ mediaType: match[1], data: match[2] });
      };
      reader.onerror = () => reject(new Error("Fichier illisible"));
      reader.readAsDataURL(file);
    });
  }

  // Texte et fichier restent mutuellement exclusifs dans l'UI (voir sport_2a plus bas) — remplir
  // l'un vide toujours l'autre, donc au plus un des deux est jamais non-vide ici. Priorité au
  // fichier si jamais les deux étaient non-vides malgré tout (filet de sécurité, pas un cas normal).
  const canSubmitImport = importText.trim().length > 0 || !!importPhotoFile;

  async function handleImportNext() {
    if (!canSubmitImport || importAnalyzing) return;
    setImportAnalyzing(true);
    setImportError(null);
    try {
      const body: { text?: string; imageBase64?: string; imageMediaType?: string } = {};
      if (importPhotoFile) {
        const { data, mediaType } = await fileToBase64(importPhotoFile);
        body.imageBase64 = data;
        body.imageMediaType = mediaType;
      } else {
        body.text = importText.trim();
      }
      const res = await fetch("/api/programs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.template) {
        setImportError(data?.error ?? "On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte.");
        return;
      }
      setImportedTemplate(data.template as ProgramTemplate);
      advanceToWeekPreviewViaImport();
    } catch {
      setImportError("On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte.");
    } finally {
      setImportAnalyzing(false);
    }
  }

  /* Même principe qu'advanceMaybeGenerating(), pour la transition entre le choix du rôle et
     l'écran de décision — voir ReconductionTeaserScreen. Générique (regarde path[stepIdx+1], pas
     le step courant) : "role" précède désormais directement decision_2a/2b (2026-08-28,
     wellness_check_2a/2b fusionné dans week_preview et retiré des paths, voir doc en tête de
     fichier) — appelée par le clic sur une carte de l'écran "role". */
  function advanceMaybeReconduction() {
    if (path[stepIdx + 1] === "decision_2a" || path[stepIdx + 1] === "decision_2b") {
      setReconLoading(true);
      // 3,4s (retour de Gildas : 1,9s "tellement courte qu'on a pas le temps de lire") — assez pour
      // lire le texte + voir les 3 barres monter en cascade (dernière barre finit vers ~2,1s).
      setTimeout(() => { setReconLoading(false); next(); }, 3400);
    } else {
      next();
    }
  }

  // Même route/logique que ProgramCriteriaModal.tsx (in-app, validé le 2026-08-06) — sportPrecision
  // sert de description au lieu d'un champ séparé, portage direct une fois le comportement confirmé.
  // Retourne le résultat (pas seulement un effet de bord setState) : handleSportNext() doit
  // pouvoir utiliser la valeur immédiatement après l'avoir attendue, sans dépendre d'un re-render
  // pour lire customSport à jour (setState est asynchrone/batché).
  async function analyzeSport(): Promise<CustomSportState> {
    const description = sportPrecision.trim();
    if (!description) { const r: CustomSportState = { status: "failed" }; setCustomSport(r); return r; }
    setAnalyzingSport(true);
    setWeaknesses([]);
    try {
      const res = await fetch("/api/sports/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = res.ok ? await res.json() : null;
      let result: CustomSportState;
      if (data?.matched) {
        result = { status: "matched", sportLabel: data.sportLabel };
      } else if (data?.exercises) {
        result = { status: "generated", sportLabel: data.sportLabel, exercises: data.exercises, weaknessOptions: data.weaknessOptions, weaknessMeta: data.weaknessMeta, sessionLabels: data.sessionLabels ?? undefined };
      } else {
        result = { status: "failed" };
      }
      setCustomSport(result);
      return result;
    } catch {
      const result: CustomSportState = { status: "failed" };
      setCustomSport(result);
      return result;
    } finally {
      setAnalyzingSport(false);
    }
  }

  // Suivant sur l'écran sport (2026-08-06) : plie l'analyse dans l'action "Suivant" au lieu d'un
  // CTA "Analyser mon sport →" séparé — décision explicite de Gildas ("le badge Autre est inutile,
  // je veux que Suivant fasse cette action"). N'appelle l'API que si un texte libre est présent ET
  // pas déjà analysé (customSport déjà résolu pour ce texte, cf. reset au onChange) ; un sport
  // choisi via une des cartes ne déclenche jamais Claude (déjà un curriculum connu).
  async function handleSportNext() {
    if (sportPrecision.trim() && !customSport) await analyzeSport();
    advanceMaybeGenerating();
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
    const sportValue = !sport && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport || "Autre";
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
      /* Programme non-claimé : plus généré+assigné ici — l'assignation immédiate à "lundi prochain"
         empêchait tout choix de date réel en célébration (route assign INSERT-only, 409 si on la
         rappelait sur une assignation déjà active). Les opts sont mémorisées, le vrai appel part à
         la fin de wellness_q (finishAthleteActivation), même point d'appel et même date que le
         programme claimé (claimAndAssignProgram) — plus de différence entre les deux au-delà du
         sport déjà déduit ou non. */
      /* Importé (2026-08-29, suite) : prioritaire sur hasClaimedProgram — un programme importé
         remplace le programme claimé, pas l'inverse. Sans le `|| importedTemplate`, un claimed qui
         importe son propre programme n'aurait jamais ses opts mémorisées ici, et
         finishAthleteActivation() retomberait sur claimAndAssignProgram() (le claim, abandonné). */
      if (!hasClaimedProgram || importedTemplate) {
        pendingAthleteProgramOptsRef.current = {
          sport: sportValue, level, days: trainingDays, target: { user_id: uid }, focus: GOAL_TO_FOCUS[goal] ?? "mixte", weaknesses,
          duration: (claimedProgramWeeks ?? 4) as 4 | 6 | 8 | 12 | 16,
          ...(importedTemplate ? { template: importedTemplate } : {}),
          ...(!sport && !importedTemplate && customSport?.status === "generated" ? { customExercises: customSport.exercises, customWeaknessMeta: customSport.weaknessMeta, customSessionLabels: customSport.sessionLabels } : {}),
        };
      }
      const [sessionsRes, baselineRes, historyRes] = await Promise.all([
        supabase.from("sessions").insert(pastSessions),
        supabase.from("wellness_daily").upsert(buildWellnessBaseline(uid, level), { onConflict: "user_id,date" }),
        supabase.from("wellness_daily").upsert(wellnessRows, { onConflict: "user_id,date" }),
      ]);
      if (sessionsRes.error) console.error("[completeProfile] sessions insert error:", sessionsRes.error);
      if (baselineRes.error) console.error("[completeProfile] wellness_daily baseline upsert error:", baselineRes.error);
      if (historyRes.error) console.error("[completeProfile] wellness_daily history upsert error:", historyRes.error);
    }
    if (role === "coach") {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      setInviteCode(code);
      await supabase.from("profiles").update({ invite_code: code }).eq("user_id", uid);

      // 3 profils (pas 5) garantissant les 3 issues réelles de computeAutoregSuggestion
      // (Alléger/Maintenir/Surcharger) — même mapping wellness/difficulté que les 3 sportifs de
      // preview de DecisionStep.tsx (Thomas=alléger sévère, Emma=cohérent, Pierre=surcharger),
      // pour que le tableau de bord réel raconte la même histoire que l'aperçu déjà vu à l'onboarding.
      const DEMO_ATHLETES = [
        { name: "Thomas M. (démo)", wellness_score: 35, rpeBase: 9 },
        { name: "Emma L. (démo)",   wellness_score: 70, rpeBase: 6 },
        { name: "Pierre D. (démo)", wellness_score: 85, rpeBase: 3 },
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

      // Auto-generate a program and assign to first demo athlete — même appel pour un programme
      // claimé (sport/niveau/duration déjà déduits) ou non (duration retombe sur 4 par défaut).
      const firstAthleteId = demoAthleteIds[0];
      if (firstAthleteId && trainingDays.length > 0) {
        await supabase.from("coach_sessions").delete().eq("coach_id", uid).eq("athlete_id", firstAthleteId);
        const ok = await generateAndAssignProgram(uid, {
          sport: sportValue, level, days: trainingDays, target: { athlete_id: firstAthleteId }, focus: GOAL_TO_FOCUS[goal] ?? "mixte", weaknesses,
          duration: (claimedProgramWeeks ?? 4) as 4 | 6 | 8 | 12 | 16,
          // Importé (2026-08-29, suite) : remplace la génération/le claim, même principe que côté sportif.
          ...(importedTemplate ? { template: importedTemplate } : {}),
          ...(!sport && !importedTemplate && customSport?.status === "generated" ? { customExercises: customSport.exercises, customWeaknessMeta: customSport.weaknessMeta, customSessionLabels: customSport.sessionLabels } : {}),
        });
        if (ok) localStorage.setItem("program_start_date", getNextMonday());
      }
      if (hasClaimedProgram) localStorage.removeItem("claim_program_id");
    }
  }

  /* Claim + assign du programme claimé — appelé depuis finishAthleteActivation() (fin de
     wellness_q), avec un vrai wellnessAdjustment calculé à ce moment-là. Copie brute du template
     public → génération personnalisée (2026-08-05) : le programme claimé n'est plus recopié tel
     quel, il sert de seed (sport/niveau déjà déduits, voir l'effet qui lit ?claim=) — faiblesses/
     objectif/jours collectés via les nouveaux écrans (PROGRAM_ATHLETE_PATH etc.) pilotent une vraie
     régénération via generateAndAssignProgram(), exactement le même pipeline que le chemin
     non-claimé (voir finishAthleteActivation() — les deux appels partagent maintenant startDate ET
     wellnessAdjustment, plus d'asymétrie entre les deux chemins, 2026-08-27). */
  async function claimAndAssignProgram(uid: string, wellnessAdjustment: number) {
    const claimId = typeof window !== "undefined" ? localStorage.getItem("claim_program_id") : null;
    if (!claimId) return;
    try {
      const ok = await generateAndAssignProgram(uid, {
        sport, level, days: trainingDays, target: { user_id: uid },
        focus: GOAL_TO_FOCUS[goal] ?? "mixte", weaknesses, wellnessAdjustment, startDate: chosenStartDate,
        duration: (claimedProgramWeeks ?? 4) as 4 | 6 | 8 | 12 | 16,
      });
      if (!ok) throw new Error("generate");
    } catch {
      await supabase.from("sessions").insert(buildAthleteSessions(uid, sport, level, trainingDays));
    } finally {
      localStorage.removeItem("claim_program_id");
    }
  }

  async function finishAthleteActivation(base_score: number, score: number) {
    const uid = userId || newUserId;
    if (uid) {
      const today = new Date().toISOString().split("T")[0];
      const wellnessPayload = { user_id: uid, date: today, sleep: wSleep, stress: wStress, recovery: wRecovery, motivation: wMotivation, behaviors: wBehaviors, bedtime: wBedtime, base_score, score };
      let { error: wellnessError } = await supabase.from("wellness_daily").upsert(wellnessPayload, { onConflict: "user_id,date" });
      if (wellnessError) {
        console.error("[finishAthleteActivation] wellness_daily upsert error, retrying once:", wellnessError);
        ({ error: wellnessError } = await supabase.from("wellness_daily").upsert(wellnessPayload, { onConflict: "user_id,date" }));
        if (wellnessError) console.error("[finishAthleteActivation] wellness_daily upsert failed after retry — le score du jour reste le placeholder d'activation:", wellnessError);
      }
      const wellnessAdjustment = score < 45 ? -1 : 0;
      /* Importé (2026-08-29, suite) : prioritaire — un programme importé sur sport_2a (classique ou
         programme claimé) remplace ce qui aurait normalement été généré/claimé. Programme claimé
         sans import : claimAndAssignProgram (no-op si pas de claim_program_id). Programme non-claimé
         ni importé : opts mémorisées par completeProfile() (voir sa doc) — même wellnessAdjustment
         et même chosenStartDate pour les 3 cas, un seul point d'écriture (2026-08-27). */
      if (importedTemplate && pendingAthleteProgramOptsRef.current) {
        await generateAndAssignProgram(uid, { ...pendingAthleteProgramOptsRef.current, startDate: chosenStartDate, wellnessAdjustment });
        pendingAthleteProgramOptsRef.current = null;
        if (hasClaimedProgram) localStorage.removeItem("claim_program_id");
      } else if (hasClaimedProgram) {
        await claimAndAssignProgram(uid, wellnessAdjustment);
      } else if (pendingAthleteProgramOptsRef.current) {
        await generateAndAssignProgram(uid, { ...pendingAthleteProgramOptsRef.current, startDate: chosenStartDate, wellnessAdjustment });
        pendingAthleteProgramOptsRef.current = null;
      }
      /* onboarding_done posé ici, pas au paiement (2026-08-19, chantier gating save) — inchangé par
         la réintroduction du paywall obligatoire-mais-skippable du 2026-08-31 : ce paywall (juste
         après celebration désormais) n'a plus voix au chapitre sur l'accès, payer ou cliquer
         "Plus tard" ne change rien à onboarding_done. Ce premier wellness reste la seule sauvegarde
         gratuite du compte (voir requireSubscription() sur /today, /week — tout wellness suivant
         est gaté). */
      await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
    }
    next();
  }

  /* Appelé depuis la célébration coach (2026-08-27 — remplace l'ancien step "invite_team" séparé,
     désormais fondu dans celebration). L'invitation elle-même reste gratuite et illimitée (voir
     CoachClient.tsx/AthletesClient.tsx, aucun requireSubscription dessus). */
  async function finishCoachActivation() {
    const uid = userId || newUserId;
    if (uid) await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
    next();
  }

  /* CTA principal de la célébration coach : envoie l'invitation si un email a été saisi, puis
     termine — pas d'écran de confirmation séparé (contrairement à l'ancien invite_team), le coach
     verra le résultat directement sur /coach. Guardé par finishGuardRef. */
  async function handleCelebrationCoachNext() {
    if (finishGuardRef.current) return;
    finishGuardRef.current = true;
    const hasEmail = inviteEmail.trim() || extraInviteEmails.some(e => e.trim());
    if (hasEmail && !inviteSending) await handleInviteSend();
    finishCoachActivation();
  }

  /* CTA secondaire "🔔 Plus tard" — même mécanisme que l'ancien invite_team : saute l'envoi de
     l'invitation, active la notif à la place. Contrairement au sportif (wellness_q reste obligatoire
     quoi qu'il arrive, voir CelebrationScreen), ici il n'y a rien après célébration à forcer — le
     "OU" a du sens : sans lui, un coach pourrait ne rien faire du tout. */
  function handleCelebrationCoachSkip() {
    if (finishGuardRef.current) return;
    finishGuardRef.current = true;
    if (!pushBlockedIOS) subscribeToPush().catch(() => {});
    finishCoachActivation();
  }

  /* CTA principal de la célébration sportif — la demande de permission notification (déclenche la
     boîte native du navigateur) ne part que si le toggle est encore actif à ce moment-là, jamais au
     montage de l'écran ni au toggle lui-même. wellness_q suit dans tous les cas. Guardé comme les
     autres CTA de fin de step (double-clic rapide sinon = next() appelé 2x = saute wellness_q). */
  function handleCelebrationAthleteNext() {
    if (finishGuardRef.current) return;
    finishGuardRef.current = true;
    if (wantsPushReminder && !pushBlockedIOS) subscribeToPush().catch(() => {});
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
        if (role === "athlete" && hasCoachInvite) {
          const storedCode = coachInviteCode ?? (typeof window !== "undefined" ? localStorage.getItem("coach_invite_code") : null);
          let joinedCoach = false;
          if (storedCode) {
            try {
              const joinRes = await fetch("/api/invite/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invite_code: storedCode }),
              });
              const joinJson = await joinRes.json().catch(() => ({}));
              joinedCoach = joinRes.ok && joinJson.ok === true;
            } catch { joinedCoach = false; }
            localStorage.removeItem("coach_invite_code");
          }
          if (joinedCoach) {
            await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
            posthog.capture("coach_invite_joined", { role });
          } else {
            /* Code invalidé entre l'ouverture du lien et la soumission du formulaire — ne pas
               marquer onboarding_done : on bascule sur le funnel payant standard plutôt que de
               laisser un compte gratuit non lié en accès permanent sans détection. Le compte
               "account" créé ci-dessus reste valide, seul le path change (voir effet dédié sur
               inviteJoinFailed). */
            posthog.capture("coach_invite_join_failed", { role });
            setHasCoachInvite(false);
            setInviteJoinFailed(true);
            setSaving(false);
            return;
          }
        }
        if (!data.session) {
          /* Pas de session active tant que l'email n'est pas confirmé — completeProfile() écrit
             via le client Supabase normal (RLS auth.uid()), une tentative ici échouerait en
             silence sans session (voir feedback_supabase_silent_write_errors). Comportement déjà
             identique avant ce chantier : l'ancien déclenchement à l'entrée de week_preview_2a/2b
             n'était de toute façon jamais atteint dans ce cas (retour anticipé au même endroit,
             juste après createAccount()) — pas une régression introduite ici. */
          setEmailSent(true);
          setSaving(false);
          return;
        }
        if (!profileCompleteGuardRef.current && (path.includes("week_preview_2a") || path.includes("week_preview_2b"))) {
          profileCompleteGuardRef.current = true;
          await completeProfile(uid);
        }
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}/auth/callback?type=recovery&first=1`,
        }).catch(() => {});
        setSaving(false);
        next();
      } else {
        await createAccount(userId!);
        if (!profileCompleteGuardRef.current && (path.includes("week_preview_2a") || path.includes("week_preview_2b"))) {
          profileCompleteGuardRef.current = true;
          await completeProfile(userId!);
        }
        setSaving(false);
        next();
      }
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  /* Rattrapage après un échec de /api/invite/join en cours de handleFinish() : `path` est ici
     recalculé par le render qui suit setHasCoachInvite(false), pas la closure figée de
     handleFinish(). Ne jamais utiliser next() ici — "account" n'est pas au même index dans
     ATHLETE_PATH/SHORT_ATHLETE_PATH (après les pain points) que dans INVITE_ATHLETE_PATH (juste
     après "role") ; c'est la même classe de bug que "atterrissage systématique sur role" déjà
     rencontrée sur la continuation Google OAuth. */
  useEffect(() => {
    if (!inviteJoinFailed) return;
    const idx = path.indexOf("account");
    setStepIdx(idx >= 0 ? idx + 1 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteJoinFailed]);

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

  /* Paywall scindé en 2 écrans plein-page (2026-08-31 : rendus directement via PrimingJourneyModal/
     PaywallModal, les mêmes composants que le gating in-app — voir doc du path plus haut). Tracking
     paywall_priming_viewed/paywall_form_viewed et setup-intent Stripe sont désormais internes à ces
     2 composants, plus besoin de les dupliquer ici — seul `billing` reste levé dans ce fichier
     (partagé entre les deux écrans, même pattern que usePaywall.ts). */
  const [billing, setBilling] = useState<Billing>("annual");

  /* Paiement confirmé (trial_started, capturé dans CheckoutForm) — onboarding_done est déjà true
     depuis l'activation (voir createAccount()/finishAthleteActivation()/finishCoachActivation()),
     payer ne le repose ici que par défense en profondeur (idempotent), ce n'est plus le jalon qui
     débloque quoi que ce soit (paywall obligatoire-mais-skippable depuis le 2026-08-31, voir doc du
     path). wellness_q/coach reste la suite normale du path, next() suffit. */
  async function handlePaymentSuccess() {
    const uid = userId || newUserId;
    if (uid) await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
    next();
  }

  async function handleGoogleRegister() {
    const pending: PendingData = {
      role, sport, sportPrecision, level, weaknesses, goal, frustration, trainingDays,
      coachingContext, athleteCount, coachingChallenge, currentTool, trainingStyle, name,
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

        if (pendingData.role === "athlete" && hasCoachInvite) {
          const storedCode = coachInviteCode ?? (typeof window !== "undefined" ? localStorage.getItem("coach_invite_code") : null);
          let joinedCoach = false;
          if (storedCode) {
            try {
              const joinRes = await fetch("/api/invite/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invite_code: storedCode }),
              });
              const joinJson = await joinRes.json().catch(() => ({}));
              joinedCoach = joinRes.ok && joinJson.ok === true;
            } catch { joinedCoach = false; }
            localStorage.removeItem("coach_invite_code");
          }
          if (joinedCoach) {
            await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", userId);
            posthog.capture("coach_invite_joined", { role: pendingData.role, method: "google" });
          } else {
            /* Le useEffect [googleInitDone] plus bas recalcule path/accountIdx à partir de la
               valeur à jour de hasCoachInvite au moment où il s'exécute — pas besoin d'un effet
               dédié supplémentaire ici, contrairement au cas register mode (voir inviteJoinFailed). */
            posthog.capture("coach_invite_join_failed", { role: pendingData.role, method: "google" });
            setHasCoachInvite(false);
          }
        }

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
    /* completeProfile() ici plutôt que dans init() ci-dessus (deps []) — même raison que le saut
       de stepIdx juste en dessous : ce useEffect relit path/userId à jour au moment où il
       s'exécute, alors que la closure de init() est figée au tout premier render, avant que
       hasClaimedProgram ait pu résoudre. userId est garanti non-null ici (googleInitDone ne passe
       à true qu'après la fin de init(), qui a déjà créé le compte). */
    if (!profileCompleteGuardRef.current && userId && (path.includes("week_preview_2a") || path.includes("week_preview_2b"))) {
      profileCompleteGuardRef.current = true;
      completeProfile(userId);
    }
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
  /* Partagée entre l'écran sport_2a (fusion sport+faiblesses, 2026-08-17) et l'écran level_2a
     (faiblesses seul, programme claimé — sport déjà connu, pas de custom sport possible dans ce
     cas). Un seul point de vérité pour éviter une divergence entre les deux rendus. */
  const weaknessOptions = (!sport && customSport?.status === "generated") ? customSport.weaknessOptions : WEAKNESSES_BY_SPORT[sport] ?? WEAKNESSES_BY_SPORT["Autre"];
  /* Libellés réels des faiblesses choisies — un seul calcul, réutilisé partout où il faut les
     mentionner (WeekPreviewStep). */
  const weaknessLabels = weaknesses.map(k => weaknessOptions.find(w => w.key === k)?.label).filter((l): l is string => !!l);
  const sportSentenceLabel = sport || sportPrecision.trim() || undefined;

  /* Source unique du programme d'aperçu (2026-08-17, 3e itération) — auparavant WellnessCheckStep
     et DecisionStep faisaient chacun leur propre appel à /api/programs/generate : déterministe donc
     censé produire le même résultat, mais deux appels réseau indépendants plutôt qu'UNE vraie
     séance partagée entre les deux écrans (retour de Gildas : "je veux une vraie séance du
     programme créée... sinon ça defeat the purpose"). Un seul fetch ici, passé en prop aux deux
     composants — garantit la même référence d'objet, pas seulement "la même valeur en théorie".
     Depuis la fusion de wellness_check dans week_preview (2026-08-28), ce fetch n'alimente plus
     que DecisionStep (demoHardest/demoLightest/demoMiddle) — WeekPreviewStep.tsx fait son propre
     appel indépendant pour sa grille 7 jours (jamais consolidé avec celui-ci, cf. sa propre doc). */
  const [previewTemplate, setPreviewTemplate] = useState<ProgramTemplate | null>(null);
  useEffect(() => {
    if (!trainingDays.length) return;
    const dayStrings = trainingDays.map(d => DOW_NAMES[d]).filter(Boolean);
    if (!dayStrings.length) return;
    let cancelled = false;
    fetch("/api/programs/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport, level: LEVEL_TO_DB[level], days: dayStrings, duration: (claimedProgramWeeks ?? 4), focus: GOAL_TO_FOCUS[goal] ?? "mixte", weaknesses,
        ...(!sport && customSport?.status === "generated" ? { customExercises: customSport.exercises, customWeaknessMeta: customSport.weaknessMeta, customSessionLabels: customSport.sessionLabels } : {}),
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { template: ProgramTemplate } | null) => {
        if (!cancelled && data?.template) setPreviewTemplate(data.template);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, level, JSON.stringify(trainingDays), goal, JSON.stringify(weaknesses), claimedProgramWeeks, JSON.stringify(customSport)]);

  /* Sélection des séances démo pour DecisionStep — centralisée ici (2026-08-17, 5e itération,
     à l'origine pour que WellnessCheckStep et DecisionStep pointent vers EXACTEMENT le même objet ;
     WellnessCheckStep fusionné dans week_preview le 2026-08-28, seul DecisionStep consomme encore
     demoHardest/demoLightest/demoMiddle). Bug réel trouvé
     par Gildas en testant ("j'ai pas toujours un sportif à alléger et un sportif à surcharger") :
     restreindre la recherche à la semaine 1 (pour cette continuité) peut la priver d'un vrai jour
     difficile (diff≥8) ou léger (diff≤4) — computeAutoregSuggestion exige ces seuils réels, aucun
     wellness forcé ne peut compenser une difficulté qui ne les franchit pas. Repli en 2 temps :
     cherche d'abord dans la semaine 1 (préserve la continuité la plupart du temps), élargit à tout
     le programme SEULEMENT si la semaine 1 n'atteint pas le seuil requis — jamais l'inverse. */
  /* Les séances "test" comptent désormais comme les autres (2026-08-30, retour explicite de Gildas
     — "sans exception" : un test de fin de bloc reste une vraie séance avec une vraie difficulté,
     la reco Alléger/Surcharger doit s'y déclencher comme ailleurs, même si le texte lui-même n'a pas
     de token numérique à faire varier visiblement — voir WeekPreviewStep.tsx). Avant ce chantier,
     l'exclusion faisait qu'un "Bilan de cycle" pouvait devenir le SEUL jour dur de la semaine sans
     jamais déclencher la démo Alléger. */
  function flattenWeeks(t: ProgramTemplate | null, onlyFirst: boolean) {
    const out: SessionTemplate[] = [];
    const weeks = onlyFirst ? (t?.weeks?.[0] ? [t.weeks[0]] : []) : (t?.weeks ?? []);
    weeks.forEach(week => Object.values(week).forEach(sessions => (sessions as SessionTemplate[]).forEach(s => out.push(s))));
    return out;
  }
  const week1Pool = flattenWeeks(previewTemplate, true);
  const allPool = flattenWeeks(previewTemplate, false);
  function pickHardest(): SessionTemplate | null {
    const inWeek1 = [...week1Pool].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
    if (inWeek1 && (inWeek1.target_difficulty ?? 0) >= 8) return inWeek1;
    return [...allPool].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? inWeek1;
  }
  function pickLightest(): SessionTemplate | null {
    const inWeek1 = [...week1Pool].sort((a, b) => (a.target_difficulty ?? 0) - (b.target_difficulty ?? 0))[0] ?? null;
    if (inWeek1 && (inWeek1.target_difficulty ?? 0) <= 4) return inWeek1;
    return [...allPool].sort((a, b) => (a.target_difficulty ?? 0) - (b.target_difficulty ?? 0))[0] ?? inWeek1;
  }
  const demoHardest = pickHardest();
  const demoLightest = pickLightest();
  const demoMiddle = week1Pool.length ? week1Pool[Math.floor(week1Pool.length / 2)] : (allPool[0] ?? null);

  const frisePhases = [PHASE_1_STEPS, PHASE_2_STEPS, PHASE_3_STEPS, PHASE_4_STEPS].map(phaseSteps => path.filter(s => phaseSteps.includes(s)));
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

  if (!flowReady) {
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

  /* Transition automatique (2026-08-17, refonte "zéro problem awareness") entre le dernier écran
     d'input (days_2a, ou sport_2a côté coach/programme claimé) et week_preview_2a/2b — dramatise le
     moment où le vrai programme se construit plutôt qu'un simple changement d'écran instantané.
     Purement cosmétique/minutée (pas liée au vrai temps réseau) : WeekPreviewStep fait son propre
     appel à /api/programs/generate indépendamment, cf. sa doc. Voir advanceMaybeGenerating(). */
  if (genLoading) {
    return <GenerationLoadingScreen role={role} />;
  }

  if (reconLoading) {
    return <ReconductionTeaserScreen role={role} />;
  }


  const isDarkStep = DARK_STEPS.includes(currentStep);

  return (
    <OnboardingBackground variant={isDarkStep ? "dark" : "light"}>
      <div>

        {showFrise && <ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark={isDarkStep} />}

        <div key={currentStep} style={{ animation: "stepIn 0.22s ease" }}>
        {/* ── ROLE — repositionné le 2026-08-19 (voir doc des paths en tête de fichier) : n'arrive
            plus juste après value_intro, mais juste après avoir vu le programme (week_preview, qui
            intègre depuis le 2026-08-28 la simulation de forme — voir WeekPreviewStep.tsx),
            avant de vivre l'adaptation réelle (decision) — l'utilisateur choisit comment
            utiliser CE qu'il vient de voir, pas comment se catégoriser à froid. Wording changé en
            conséquence ("Pour moi"/"Pour mes sportifs", contextuel au programme déjà généré) —
            mécanique de cartes inchangée (toujours un vrai choix explicite, jamais présélectionné :
            l'enjeu prix 9€/49€ reste le même qu'avant ce repositionnement). L'avance après clic
            passe par advanceMaybeReconduction() (pas next() ni nextAfterChoice) pour jouer la
            transition "reconduction" juste avant decision — voir sa doc. */}
        {currentStep === "role" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 24 }}>Pour qui construis-tu ce programme ?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
              {[
                { r: "athlete" as Role, icon: "🏋️", label: "Pour moi",         sub: "Je veux adapter mes séances à mon niveau de forme.", badgeBg: "linear-gradient(145deg, #fff0e8, #ffe0d0)" },
                { r: "coach"   as Role, icon: "📋", label: "Pour mes sportifs", sub: "Je veux ajuster les séances de mes sportifs.", badgeBg: "linear-gradient(145deg, #eef1ff, #dde3ff)" },
              ].map(({ r, icon, label, sub, badgeBg }) => (
                <div key={r} onClick={() => {
                  if (advancingRef.current) return;
                  advancingRef.current = true;
                  setRole(r); setRoleChosen(true); posthog.setPersonProperties({ role: r });
                  if (abEligible && !assignedVariant) setAssignedVariant("control");
                  setTimeout(() => advanceMaybeReconduction(), 300);
                }}
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

        {/* ── VALUE INTRO — CTA générique unique (2026-08-06) : le choix du rôle vit à nouveau sur
            son propre step juste après (voir ci-dessus), value_intro ne le devine plus jamais via
            roleChosen/initialRole. Photo en fond plein viewport (POC v62), contenu neutre (pas de
            branche par rôle, puisque le rôle n'est plus connu ici pour un visiteur frais). */}
        {currentStep === "value_intro" && (() => {
          const isClaimed = !!(hasClaimedProgram && claimedProgramName);

          const headline = isClaimed
            ? <>Ton programme <em>{claimedProgramName}</em> est prêt à être personnalisé.</>
            : "Des séances qui s'adaptent enfin aux sportifs, pas l'inverse.";

          const subhead = "ThePerfClub ajuste les programmes selon la forme du jour. Plus de progrès, moins de blessures.";

          const steps = [
            { title: "Comprends ton profil", sub: "Tes préférences d'entraînement, habitudes de récupération ou celles de tes sportifs." },
            { title: isClaimed ? "Personnalise ton programme" : "Ajuste ton programme", sub: isClaimed ? `${claimedProgramName} s'ajuste à ta forme du jour.` : "Chaque séance évolue selon ta forme du jour ou celle de tes sportifs." },
            { title: "Progresse durablement", sub: "Des recommandations quotidiennes pour mieux performer et récupérer." },
          ];

          return (
            <div>
              {/* Fond photo plein viewport, cadré haut (comme le POC : background-position center top)
                  pour garder la tête du sportif visible plutôt que le centre géométrique de la photo. */}
              <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
                <img
                  src="https://www.theperfclub.com/wp-content/uploads/2026/07/value-intro-BG.jpeg"
                  alt=""
                  loading="eager"
                  fetchPriority="high"
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%", display: "block" }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,10,10,.6) 0%, rgba(10,10,10,.75) 40%, rgba(8,8,8,.95) 85%)" }} />
              </div>

              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.08, marginBottom: 14, color: "#fff", textAlign: "center" }}>{headline}</div>
                <div style={{ fontSize: 15.5, color: "rgba(255,255,255,.62)", lineHeight: 1.55, maxWidth: 440, margin: "0 auto 28px", textAlign: "center" }}>{subhead}</div>

                <div style={{
                  background: "radial-gradient(circle at 87% 5%, rgba(212,64,0,.32), transparent 30%), linear-gradient(135deg,#1d1d1d 0%,#2b2b2b 54%,#161616 100%)",
                  border: "1px solid rgba(255,255,255,.06)", borderRadius: 22, padding: "22px 22px 20px", marginBottom: 22,
                }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "13px 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,.08)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
                        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.75)" }}>{i + 1}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 3, color: "#fff" }}>{s.title}</div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.45 }}>{s.sub}</div>
                        </div>
                      </div>
                      {i === 0 && (
                        <div style={{ flexShrink: 0, width: 104, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "9px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0 }}>
                              <svg viewBox="0 0 44 44" width="26" height="26">
                                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={6} />
                                <circle cx="22" cy="22" r="18" fill="none" stroke="#f28a00" strokeWidth={6} strokeDasharray="113.1" strokeDashoffset="19" strokeLinecap="round" transform="rotate(-90 22 22)" />
                              </svg>
                              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 1000, color: "#fff" }}>73</span>
                            </div>
                            <div style={{ fontSize: 8, fontWeight: 800, color: "#fff" }}>Zone stable</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.8)", whiteSpace: "nowrap" }}>🌙 Couché tardif</span>
                            <span style={{ fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.8)", whiteSpace: "nowrap" }}>📱 Écran tard</span>
                          </div>
                        </div>
                      )}
                      {i === 1 && (
                        <div style={{ flexShrink: 0, width: 104, background: "#fff", borderRadius: 12, padding: "9px 9px" }}>
                          <div style={{ fontSize: 7.5, fontWeight: 800, color: "#171b1f", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Circuit modéré</div>
                          <div style={{ height: 4, borderRadius: 999, background: "#e7e4df", overflow: "hidden", marginBottom: 6 }}>
                            <div style={{ height: "100%", width: "55%", background: "linear-gradient(90deg,#ffe0a0,#f28a00)", borderRadius: 999 }} />
                          </div>
                          <div style={{ fontSize: 6.5, color: "#8a8f94", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>AMRAP 15min : wall balls...</div>
                          <div style={{ fontSize: 6.5, color: "#8a8f94", lineHeight: 1.3, marginTop: 2 }}>Mobilité épaules : 5 min</div>
                        </div>
                      )}
                      {i === 2 && (
                        <div style={{ flexShrink: 0, width: 104, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "9px 10px" }}>
                          <div style={{ fontSize: 7.5, fontWeight: 800, color: "#ffb37a" }}>⚡ Entraîn.</div>
                          <div style={{ fontSize: 6.5, color: "rgba(255,255,255,.5)", lineHeight: 1.3, marginBottom: 5 }}>Séance dure avant modérée...</div>
                          <div style={{ fontSize: 7.5, fontWeight: 800, color: "#b9e0a5" }}>🌿 Récup.</div>
                          <div style={{ fontSize: 6.5, color: "rgba(255,255,255,.5)", lineHeight: 1.3 }}>Charge élevée aujourd&apos;hui...</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Actions variant="dark" onNext={next} nextLabel="Continuer →" />
            </div>
          );
        })()}

        {/* ── SPORT — séparé des faiblesses depuis le 2026-08-17 (2e itération, l'écran combiné
             dépassait l'écran sur mobile). Chips sélectionnables + CTA explicite (pas d'avance auto
             au clic) depuis le 2026-08-29 — exception au pattern "clic = avance direct" des autres
             écrans à choix unique de l'onboarding, pour que le sport déduit d'un programme claimé
             puisse être présélectionné (voir PROGRAM_ATHLETE_PATH/PROGRAM_COACH_PATH plus haut) sans
             carte de confirmation dédiée : même chip, juste déjà sélectionnée à l'arrivée.
             Wording générique coach/sportif depuis le 2026-08-19 (plus de ternaire par rôle sur ce
             step, ni sur level_2a/days_2a/WeekPreviewStep juste après) — "role" n'est plus connu à
             ce stade, choisi après week_preview désormais (voir doc des paths en tête de fichier).
             "role" reste utilisé plus bas dans ce fichier (frise, decision...), ce n'est que sur
             ces écrans d'input pré-rôle que le ternaire a été retiré. ── */}
        {currentStep === "sport_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 10 }}>
              Crée ton programme
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>
              À partir de ton sport, ou importe celui que tu utilises déjà.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {SPORT_CATEGORIES.map(s => (
                <Chip key={s.id} icon={s.icon} label={s.id} title={s.sub} selected={sport === s.id || (!!sport && guessSportChip(sport) === s.id)}
                  onClick={() => {
                    const isSame = sport === s.id;
                    setSport(isSame ? "" : s.id);
                    setSportPrecision("");
                    setCustomSport(null);
                    setWeaknesses([]);
                    setAutreChipSelected(false);
                    setImportText("");
                    setImportPhotoFile(null);
                    setImportError(null);
                  }} />
              ))}
              {/* "Autre" redevient un chip (2026-08-29) — voir commentaire sur autreChipSelected
                  plus haut dans ce fichier pour le pourquoi (symétrie avec le champ import
                  ci-dessous, plutôt qu'un champ toujours visible). */}
              <Chip icon="✍️" label="Autre" selected={autreChipSelected}
                onClick={() => {
                  const next = !autreChipSelected;
                  setAutreChipSelected(next);
                  setSport("");
                  setWeaknesses([]);
                  setImportText("");
                  setImportPhotoFile(null);
                  setImportError(null);
                  if (!next) { setSportPrecision(""); setCustomSport(null); }
                }} />
            </div>

            {autreChipSelected && (
              <div style={{ marginBottom: 14 }}>
                <input
                  type="text" value={sportPrecision} autoFocus
                  onChange={e => { setSportPrecision(e.target.value); if (customSport) setCustomSport(null); }}
                  placeholder={role === "coach" ? "Précise le sport de tes sportifs (ex : rugby, kite-surf, cirque…)" : "Précise ton sport (ex : rugby, kite-surf, cirque…)"}
                  style={{ width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none" }}
                />
                {customSport?.status === "matched" && (
                  <p style={{ fontSize: 11, color: "#2f9e44", marginTop: 6 }}>Sport reconnu — utilise un programme déjà spécialisé pour &quot;{customSport.sportLabel}&quot;.</p>
                )}
                {customSport?.status === "generated" && (
                  <p style={{ fontSize: 11, color: "#2f9e44", marginTop: 6 }}>Contenu personnalisé généré pour &quot;{customSport.sportLabel}&quot;.</p>
                )}
                {customSport?.status === "failed" && (
                  <p style={{ fontSize: 11, color: "#c0392b", marginTop: 6 }}>Analyse indisponible — contenu générique utilisé à la place.</p>
                )}
              </div>
            )}

            {/* Diviseur "ou" — même style que le POC (theperfclub_poc_import_programme). */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#b5b0aa", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(23,27,31,.10)" }} />
              ou
              <div style={{ flex: 1, height: 1, background: "rgba(23,27,31,.10)" }} />
            </div>

            {/* Import — plus de carte cliquable ni de tabs (2026-08-29, 2e itération) : trop de
                bruit une fois révélé (tabs + dropzone bordée + erreur = 3 éléments). Benchmark
                Levels ("What did you eat last?") : un textarea directement visible + un simple
                badge pour le fichier, jamais de mode/tabs séparés. Le placeholder du textarea et
                le libellé du badge portent l'explication, pas de titre/sous-titre séparé. Texte et
                fichier restent mutuellement exclusifs (remplir l'un vide l'autre, même principe que
                sport/Autre) — /api/programs/import n'accepte qu'un seul des deux à la fois.
                Petit label ajouté au-dessus (2026-08-29, 2e retour) : contrairement au benchmark
                Levels (chips + texte parlent du même sujet, couvert par le H1 de la page), ici le
                H1 de sport_2a ne parle que du sport — passé le "ou" on change de sujet (le
                programme), sans que rien ne le signale sans ce label. Même typographie que les
                labels de section déjà utilisés ailleurs (petit, majuscules, discret). */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#171b1f", marginBottom: 8 }}>
                Importe ton programme
              </div>
              <textarea
                value={importText}
                onChange={e => {
                  setImportText(e.target.value);
                  setImportError(null);
                  if (e.target.value.trim()) {
                    setSport(""); setAutreChipSelected(false); setSportPrecision(""); setCustomSport(null);
                    if (importPhotoFile) setImportPhotoFile(null);
                  }
                }}
                placeholder={"Ou colle ton programme existant ici (ex : Lundi : Squat 5x5 @100kg...)"}
                rows={4}
                style={{ width: "100%", boxSizing: "border-box", padding: "14px", borderRadius: 16, border: "1.5px solid rgba(0,0,0,.12)", fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5, resize: "vertical", outline: "none" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999,
                    border: importPhotoFile ? "1.5px solid #2f9e44" : "1.5px solid rgba(212,64,0,.4)",
                    background: "#fff", color: importPhotoFile ? "#2f9e44" : "#d44000",
                    fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                  }}
                >
                  📷 {importPhotoFile ? importPhotoFile.name : "Importer un fichier"}
                </button>
                {importPhotoFile && (
                  <button
                    onClick={() => setImportPhotoFile(null)}
                    style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 15, cursor: "pointer", padding: 0 }}
                  >
                    ✕
                  </button>
                )}
                <input
                  ref={importFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setImportPhotoFile(f);
                      setImportError(null);
                      setSport(""); setAutreChipSelected(false); setSportPrecision(""); setCustomSport(null);
                      if (importText.trim()) setImportText("");
                    }
                  }}
                />
              </div>
              {importError && <p style={{ fontSize: 11, color: "#c0392b", marginTop: 8 }}>{importError}</p>}
            </div>

            {/* Exception au "clic = avance direct" des autres steps à choix unique (2026-08-29) :
                les chips sont sélectionnables, il faut cliquer le CTA pour avancer — même mécanique
                que level_2a (faiblesses). Décidé pour permettre la présélection du sport déduit d'un
                programme claimé (l'user garde la main pour la confirmer ou la changer) sans avoir à
                construire un composant de confirmation séparé. */}
            {canSubmitImport
              ? <Actions onBack={canGoBack ? goBack : undefined} onNext={handleImportNext} nextLabel={importAnalyzing ? "Analyse en cours…" : "Analyser mon programme →"} nextDisabled={importAnalyzing} />
              : <Actions onBack={canGoBack ? goBack : undefined} onNext={handleSportNext} nextLabel={analyzingSport ? "Analyse en cours…" : "Suivant →"} nextDisabled={analyzingSport || (!sport && !(autreChipSelected && sportPrecision.trim()))} />
            }
          </div>
        )}

        {/* ── FAIBLESSES — de nouveau un écran séparé pour tous les paths (2026-08-17, 2e itération),
             sport déjà connu (choisi sur sport_2a, ou déduit d'un programme claimé). ── */}
        {currentStep === "level_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 10 }}>
              Quelle priorité donner à ce programme ?
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>On adapte les séances pour cibler ces faiblesses — jusqu&apos;à 2, facultatif.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {weaknessOptions.map(w => (
                <Chip key={w.key} label={w.label} checkmark selected={weaknesses.includes(w.key)}
                  onClick={() => setWeaknesses(prev =>
                    prev.includes(w.key) ? prev.filter(k => k !== w.key) : prev.length >= 2 ? prev : [...prev, w.key]
                  )} />
              ))}
            </div>
            <Actions onBack={canGoBack ? goBack : undefined} onNext={advanceMaybeGenerating} nextLabel={path[stepIdx + 1] === "week_preview_2a" || path[stepIdx + 1] === "week_preview_2b" ? "Découvrir mon programme →" : "Continuer →"} />
          </div>
        )}

        {/* ── 2A-3. OBJECTIF DU BLOC (sportif) / SUIVI ACTUEL (coach) — même step ID goal_2a ── */}
        {currentStep === "goal_2a" && (role === "coach" ? (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Comment suis-tu actuellement tes sportifs ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Pour comprendre ce que Coach Control remplace concrètement.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {COACH_TOOL_OPTS.map(t => (
                <Choice key={t.id} icon={t.icon} title={t.id} sub="" selected={currentTool === t.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCurrentTool(t.id)) : setCurrentTool(t.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!currentTool} />}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>L&apos;objectif de ce bloc ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Change vraiment la façon dont ton programme est construit.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
              {GOAL_META.map(o => (
                <Choice key={o.label} icon={o.icon} title={o.label} sub="" selected={goal === o.label}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setGoal(o.label)) : setGoal(o.label)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!goal} />}
          </div>
        ))}

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
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!frustration} />}
          </div>
        )}

        {/* ── JOURS D'ENTRAÎNEMENT — même step ID days_2a pour les deux rôles, même sélecteur.
             Wording générique coach/sportif depuis le 2026-08-19 (voir sport_2a/level_2a plus haut,
             même principe) : "role" n'est pas encore connu à ce stade (choisi après week_preview
             désormais), donc plus de ternaire par rôle sur ce step non plus. ── */}
        {currentStep === "days_2a" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 10 }}>
              Quels jours d&apos;entraînement pour ce programme ?
            </div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 22 }}>Dernière étape avant de générer ce programme.</div>
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
            <Actions onBack={canGoBack ? goBack : undefined} onNext={advanceMaybeGenerating} nextLabel={role === "coach" ? "Découvrir leur programme →" : "Découvrir mon programme →"} nextDisabled={trainingDays.length === 0} />
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
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Le score de récupération t'aide à prendre les bonnes décisions.</div>
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
                { id: "Autre",                                   icon: "⚡", sub: "Coach bien-être, nutritionniste…" },
              ].map(c => (
                <Choice key={c.id} icon={c.icon} title={c.id} sub={c.sub} selected={coachingContext === c.id}
                  onClick={() => isRegisterMode ? nextAfterChoice(() => setCoachingContext(c.id)) : setCoachingContext(c.id)} />
              ))}
            </div>
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingContext} />}
          </div>
        )}

        {/* ── 2B-2. SPORT COACH ── */}
        {currentStep === "sport_2b" && (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 10 }}>Ton sport principal ?</div>
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>On paramètre les modèles de séances proposés.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {SPORT_CATEGORIES.map(s => (
                <Chip key={s.id} icon={s.icon} label={s.id} title={s.sub} selected={sport === s.id}
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
              ? sport === "Autre" && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!sportPrecision.trim()} />
              : <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" />
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
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!athleteCount} />}
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
            {!isRegisterMode && <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!coachingChallenge} />}
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
              ? <Actions onBack={canGoBack ? goBack : undefined} onNext={handleFinish} nextLabel={saving ? "Création…" : "Créer mon espace coach"} nextDisabled={saving || !currentTool} />
              : <Actions onBack={canGoBack ? goBack : undefined} onNext={next} nextLabel="Suivant →" nextDisabled={!currentTool} />
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
            <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 18 }}>Les alertes de récupération détectent ça en temps réel pour toi.</div>
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
          /* Repositionné le 2026-08-19 (voir doc des paths en tête de fichier) : arrive désormais
             après decision_2a/2b (l'AHA vécu), plus juste après le rôle — le signup demande de
             sauvegarder ce qui vient d'être construit et décidé, pas de s'inscrire à froid pour
             débloquer un "bilan" pas encore construit. `assignedVariant` continue de se résoudre
             (tagging analytics inchangé) mais ne pilote plus ce wording (aucun A/B formel sur la
             position du signup — tranché sans test, voir la doc des paths).

             Refonte visuelle 2026-08-18 (POC signup v3, theperfclub-signup-v3.html) : plus
             d'eyebrow pill ni de frise au-dessus (retirée via HIDE_FRISE_STEPS). Champs regroupés
             dans un unique bloc blanc (form-card) comme le reste des cartes de l'onboarding,
             réassurance = la même bande de confiance que paywall_priming (PAYWALL_AVATARS,
             réutilisée telle quelle plutôt que dupliquée), placée sous le titre — avant la carte,
             comme le "social-proof" du POC. Retirée de value_intro le même jour (redondante avec
             celle-ci).

             Titre = ligne de positionnement identitaire ("Le programme de ceux qui...", benchmark
             Claude "l'IA de ceux qui résolvent des problèmes"), pas une promesse produit — reste
             pertinent maintenant que ce step arrive après l'AHA plutôt que juste après le rôle
             (plus de risque de diluer le hook de value_intro, les deux sont maintenant séparés par
             tout le reste du flow). */
          return (
          <div>
            <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 16, lineHeight: "normal" }}>
              {role === "coach" ? "Le système d'entraînement des coachs professionnels." : "Le programme de ceux qui refusent de stagner."}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 14px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
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

            {error && (
              <div style={{ fontSize: 13, color: "#c81e1e", background: "rgba(200,30,30,.08)", border: "1px solid rgba(200,30,30,.18)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                {error}{" "}
                {(error.toLowerCase().includes("déjà") || error.toLowerCase().includes("already") || error.toLowerCase().includes("registered")) && (
                  <Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Me connecter</Link>
                )}
              </div>
            )}

            <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 2px 16px rgba(0,0,0,.06)" }}>
              <button
                type="button" onClick={handleGoogleRegister} disabled={saving}
                style={{ width: "100%", height: 48, borderRadius: 16, border: "none", background: "#171b1f", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}
              >
                <GoogleIcon />
                Continuer avec Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
                <span style={{ fontSize: 12, color: "#8a8f94" }}>ou avec email</span>
                <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
              </div>

              <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Prénom</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Alex" style={inputStyle} />
              <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Email</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" style={{ ...inputStyle, marginBottom: 0 }} />
            </div>

            <Actions onBack={canGoBack ? goBack : undefined} onNext={handleFinish} nextLabel={saving ? "Création…" : (role === "coach" ? "Créer mon espace coach →" : "Créer mon espace sportif →")} nextDisabled={saving || !name.trim() || !email.trim()} />
            <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94", marginTop: 14, lineHeight: 1.6 }}>
              Déjà un compte ?{" "}<Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Se connecter</Link>
            </div>
          </div>
          ); })()
        )}

        {/* ── RECAP PROFIL (interstitiel avant la preview du programme) ── */}
        {currentStep === "profile_recap" && (() => {
          /* Persona + comparatif (2026-07-31) : la carte grisée de ce step reprend mot pour mot
             le persona déjà révélé sur autoreg_score(_coach) — recalculé ici via les fonctions
             pures exportées plutôt que de faire remonter un state depuis ces composants. */
          const persona = role === "coach"
            ? computeCoachAutoregProfile(overloadCoachAns, planningCoachAns, fatigueCoachAns).persona
            : computeAthleteAutoregProfile(overloadAns, planningAns, fatigueAns).persona;
          /* "before" gardé (calculé à partir des vraies réponses via les tables *_INSIGHTS
             ci-dessus) même s'il n'est plus affiché nulle part depuis le passage aux tags courts
             ci-dessous — pas supprimé au cas où la personnalisation reviendrait sur cette carte,
             mais actuellement mort côté rendu, seul "after" est utilisé. */
          const compareRows = role === "coach"
            ? [
                { before: COACHING_CHALLENGE_INSIGHTS[coachingChallenge] || "Tu manques de visibilité sur tes sportifs au quotidien.", after: "Suivi individualisé par sportif." },
                { before: OVERLOAD_COACH_INSIGHTS[overloadCoachAns] || "Tes sportifs poussent parfois plus dur que prévu, sans que tu le voies venir.", after: "Le RPE réel est comparé au prévu." },
                { before: PLANNING_TIME_COACH_INSIGHTS[planningCoachAns] || "La planification de la charge de tes sportifs se fait au feeling.", after: "Un plan de charge généré par sportif." },
                { before: FATIGUE_COACH_INSIGHTS[fatigueCoachAns] || "Difficile de savoir quand un sportif fatigué ne devrait pas enchaîner une séance dure.", after: "Alertes de récupération avant la blessure." },
                // Avant/après ajouté le 2026-08-14 (level_2a/goal_2a/days_2a coach) — même pattern,
                // 3 lignes de plus plutôt qu'un écran séparé : profile_recap a déjà la carte
                // empilée grise/blanche, pas besoin d'en construire une seconde.
                { before: "Le suivi de la charge devient difficile à mesure que le groupe grandit.", after: ATHLETE_COUNT_INSIGHTS[athleteCount] || "Suivi individuel fin, sans effort de plus." },
                { before: "Les ajustements doivent être faits manuellement.", after: TRACKING_TOOL_INSIGHTS[currentTool] || "Un seul endroit pour tout voir." },
                { before: "La récupération varie d'un sportif à l'autre.", after: TRAINING_STYLE_INSIGHTS[trainingStyle] || "Chaque programme s'ajuste sans y repenser." },
              ]
            : [
                { before: FRUSTRATION_INSIGHTS[frustration] || "Tu manques de visibilité sur ta propre progression.", after: "Ta progression est analysée." },
                { before: OVERLOAD_INSIGHTS[overloadAns] || "Tu pousses parfois plus dur que prévu, sans savoir si ça sert vraiment ta progression.", after: "Ta charge réelle est comparée au prévu." },
                { before: PLANNING_INSIGHTS[planningAns] || "Ta charge est planifiée au feeling.", after: "Un plan de charge généré pour toi." },
                { before: FATIGUE_INSIGHTS[fatigueAns] || "Difficile de savoir si pousser malgré la fatigue t'aide ou te freine.", after: "Tes séances s'ajustent à ta récupération." },
              ];
          return (
            <ProfileRecapStep
              role={role}
              sport={sport}
              sportLabel={!sport && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport || "Autre"}
              sportIcon={SPORT_CATEGORIES.find(s => s.id === sport)?.icon || "🏋️"}
              // "level_2a" ne fait plus choisir de niveau (remplacé par les faiblesses) — ne
              // jamais prétendre qu'un niveau a été choisi sur ce chemin. Reste vrai uniquement
              // pour le programme claimé, où le niveau est réellement inféré du programme.
              showLevel={hasClaimedProgram === true && !!level}
              level={level}
              goalLower={GOAL_TO_LOWER[goal] ?? ""}
              showDays={path.includes("days_2a")}
              trainingDays={trainingDays}
              claimedProgramName={claimedProgramName}
              hasPreviewNext={path.includes("week_preview_2a") || path.includes("week_preview_2b")}
              personaTitle={persona.title}
              compareRows={compareRows}
              onNext={next}
            />
          );
        })()}

        {/* ── WEEK PREVIEW SPORTIF ── */}
        {currentStep === "week_preview_2a" && (
          <WeekPreviewStep sport={sport} level={level} trainingDays={trainingDays} focus={GOAL_TO_FOCUS[goal] ?? "mixte"} weaknesses={weaknesses} duration={(claimedProgramWeeks ?? 4) as 4 | 6 | 8 | 12 | 16}
            customExercises={!sport && customSport?.status === "generated" ? customSport.exercises : undefined}
            customWeaknessMeta={!sport && customSport?.status === "generated" ? customSport.weaknessMeta : undefined}
            customSessionLabels={!sport && customSport?.status === "generated" ? customSport.sessionLabels : undefined}
            role={role} goalLower={GOAL_TO_LOWER[goal] ?? ""} weaknessLabels={weaknessLabels} sportLabel={sportSentenceLabel} importedTemplate={importedTemplate}
            onNext={next} onBack={canGoBack ? (importedTemplate ? backToSportAfterImport : goBack) : undefined} programFlow={hasClaimedProgram} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* Dead code depuis le 2026-08-28 (fusionné dans week_preview_2a) — jamais atteint,
            "wellness_check_2a" n'est plus dans aucun path actif. */}
        {currentStep === "wellness_check_2a" && (
          <WellnessCheckStep demoSession={demoHardest} role={role} onNext={next} onBack={canGoBack ? goBack : undefined} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* ── DÉCISION — intégration wellness + aha d'autorégulation, écran séparé du programme
             (2026-08-17, voir DecisionStep.tsx) ── */}
        {currentStep === "decision_2a" && (
          <DecisionStep demoHardest={demoHardest} demoLightest={demoLightest} demoMiddle={demoMiddle} sport={sport} role={role} athleteName={name} onNext={next} onBack={canGoBack ? goBack : undefined} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* ── WEEK PREVIEW COACH ── */}
        {currentStep === "week_preview_2b" && (
          <WeekPreviewStep sport={sport} level={level} trainingDays={trainingDays} focus={GOAL_TO_FOCUS[goal] ?? "mixte"} weaknesses={weaknesses} duration={(claimedProgramWeeks ?? 4) as 4 | 6 | 8 | 12 | 16}
            customExercises={!sport && customSport?.status === "generated" ? customSport.exercises : undefined}
            customWeaknessMeta={!sport && customSport?.status === "generated" ? customSport.weaknessMeta : undefined}
            customSessionLabels={!sport && customSport?.status === "generated" ? customSport.sessionLabels : undefined}
            role={role} goalLower={GOAL_TO_LOWER[goal] ?? ""} weaknessLabels={weaknessLabels} sportLabel={sportSentenceLabel} importedTemplate={importedTemplate}
            onNext={next} onBack={canGoBack ? (importedTemplate ? backToSportAfterImport : goBack) : undefined} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* Dead code depuis le 2026-08-28 (fusionné dans week_preview_2b) — jamais atteint,
            "wellness_check_2b" n'est plus dans aucun path actif. */}
        {currentStep === "wellness_check_2b" && (
          <WellnessCheckStep demoSession={demoHardest} role={role} onNext={next} onBack={canGoBack ? goBack : undefined} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {currentStep === "decision_2b" && (
          <DecisionStep demoHardest={demoHardest} demoLightest={demoLightest} demoMiddle={demoMiddle} sport={sport} role={role} onNext={next} onBack={canGoBack ? goBack : undefined} frise={<ProgressFrise currentPhase={friseCurrentPhase} pct={frisePct} dark />} />
        )}

        {/* ── WELLNESS QUESTIONS (athlete, avant account) ── */}
        {currentStep === "wellness_q" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#d44000", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 8 }}>
              💓 Récupération du jour
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
                onNext={() => { if (finishGuardRef.current) return; finishGuardRef.current = true; finishCoachActivation(); }}
              />
            ) : (
              <div style={{ padding: "20px 28px 20px", background: "#fff", flexShrink: 0 }}>
                <button
                  onClick={async () => {
                    if (finishGuardRef.current) return;
                    finishGuardRef.current = true;
                    const hasEmail = inviteEmail.trim() || extraInviteEmails.some(e => e.trim());
                    if (hasEmail && !inviteSending) await handleInviteSend();
                    finishCoachActivation();
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
                      finishCoachActivation();
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

        {/* ── PAYWALL PRIMING — même composant que le gating in-app (2026-08-31) ── */}
        {currentStep === "paywall_priming" && (() => {
          const isClaimed = !!(hasClaimedProgram && claimedProgramName);
          const headline = isClaimed
            ? `Ton programme ${claimedProgramName} t'attend.`
            : undefined; // repli sur le headline générique par rôle de PrimingJourneyModal, identique à l'in-app
          const displaySport = !sport && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : (sport || undefined);
          const durationWeeks = claimedProgramWeeks ?? 4;
          const realSessionCount = trainingDays.length > 0 ? trainingDays.length * durationWeeks : undefined;
          return (
            <PrimingJourneyModal
              mode={role === "coach" ? "coach" : "athlete"}
              billing={billing}
              setBilling={setBilling}
              allowDismiss
              onContinue={next}
              onDismiss={skipPaywall}
              headline={headline}
              sport={displaySport}
              sessionCount={role === "coach" ? undefined : realSessionCount}
              weaknessLabels={role === "coach" ? undefined : weaknessLabels}
              name={name}
            />
          );
        })()}

        {/* ── PAYWALL FORM — même composant que le gating in-app (2026-08-31) ── */}
        {currentStep === "paywall_form" && (
          <PaywallModal
            mode={role === "coach" ? "coach" : "athlete"}
            allowDismiss
            onClose={goBack}
            onSuccess={handlePaymentSuccess}
            initialBilling={billing}
            abVariant={assignedVariant ?? "control"}
          />
        )}

        {/* ── CÉLÉBRATION + UPGRADE PITCH ── */}
        {currentStep === "celebration" && (() => {
          /* Formulaire d'invitation coach (2026-08-27, ex-step "invite_team") — composé ici, tout
             son state vit déjà dans ce fichier, plutôt que de le faire remonter via une dizaine de
             props individuelles vers CelebrationScreen. Restylé dark pour matcher la carte. */
          const coachInviteSlot = role === "coach" ? (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
                Invite tes premiers sportifs
              </div>
              {inviteCode && (
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 15px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#ff8a55", fontWeight: 700, wordBreak: "break-all", marginBottom: 10 }}>
                    go.theperfclub.com/join/{inviteCode}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`https://go.theperfclub.com/join/${inviteCode}`);
                        setInviteLinkCopied(true);
                        setTimeout(() => setInviteLinkCopied(false), 2500);
                      }}
                      style={{ flex: 1, height: 38, borderRadius: 11, background: inviteLinkCopied ? "linear-gradient(180deg,#2f9e44,#2a8a3c)" : "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      {inviteLinkCopied ? "✓ Copié !" : "📋 Copier le lien"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const msg = encodeURIComponent(`Salut ! Je viens de m'inscrire sur ThePerfClub pour suivre notre entraînement. Rejoins mon espace ici : https://go.theperfclub.com/join/${inviteCode}`);
                        window.open(`https://wa.me/?text=${msg}`, "_blank");
                      }}
                      style={{ height: 38, paddingLeft: 14, paddingRight: 14, borderRadius: 11, border: "1.5px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", fontSize: 18, cursor: "pointer" }}
                    >
                      📲
                    </button>
                  </div>
                </div>
              )}
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="sportif@exemple.com"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: "11px 13px", fontSize: 14, fontFamily: "inherit", outline: "none", color: "#fff", marginBottom: 8 }}
              />
              {extraInviteEmails.map((emailVal, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="email"
                    value={emailVal}
                    onChange={e => setExtraInviteEmails(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                    placeholder="sportif@exemple.com"
                    style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: "11px 13px", fontSize: 14, fontFamily: "inherit", outline: "none", color: "#fff" }}
                  />
                  <button
                    type="button"
                    onClick={() => setExtraInviteEmails(arr => arr.filter((_, idx) => idx !== i))}
                    style={{ width: 38, borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 15, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtraInviteEmails(arr => [...arr, ""])}
                style={{ background: "none", border: "none", color: "#ff8a55", fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 0 }}
              >
                + Inviter un autre sportif
              </button>
            </div>
          ) : undefined;

          return (
            <CelebrationScreen
              role={role}
              name={name}
              sport={!sport && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport || "Autre"}
              claimedProgramName={claimedProgramName}
              claimedProgramWeeks={claimedProgramWeeks}
              showDatePicker={role === "athlete"}
              startDate={chosenStartDate}
              onStartDateChange={setChosenStartDate}
              pushEnabled={wantsPushReminder}
              onPushEnabledChange={role === "athlete" ? setWantsPushReminder : undefined}
              coachInviteSlot={coachInviteSlot}
              nextLabel={role === "coach" ? "Inviter mes sportifs →" : "Renseigner mon état de forme →"}
              onSkip={role === "coach" ? handleCelebrationCoachSkip : undefined}
              skipLabel={role === "coach" ? "🔔 Plus tard — me le rappeler" : undefined}
              saving={saving || inviteSending}
              onNext={role === "coach" ? handleCelebrationCoachNext : handleCelebrationAthleteNext}
            />
          );
        })()}

        </div>
      </div>
    </OnboardingBackground>
  );
}
