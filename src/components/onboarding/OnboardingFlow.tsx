"use client";

import { programCover, sportCover, DEFAULT_ONBOARDING_COVER } from "@/lib/programCovers";
import { catalogEntry, findCatalogEntry, weaknessKeyFor } from "@/lib/sportCatalog";
import { WEAKNESSES_BY_SPORT } from "@/lib/sportCategories";
import {
  QuestionShell, OptionCard, ChoiceChip, SportStepBody, ImportStepBody, DeadlineField,
  GOAL_OPTIONS, WEEK_DAY_LABELS, type ObHas, type ObGoal,
} from "@/components/onboarding/PostSignupSteps";
import { InviteForm, type InviteRow } from "@/components/coach/InviteModal";
import { sessionsComplement } from "@/lib/sportCategories";
import { isNativeApp, nativeGoogleSignIn, nativeAppleSignIn } from "@/lib/nativeGoogleAuth";
import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { buildCoachDemoSessions } from "@/lib/coachDemoSessions";
import type { ProgramTemplate, ProgramFocus, SessionTemplate } from "@/types";
import Link from "next/link";
import Image from "next/image";
import OnboardingBackground from "@/components/onboarding/OnboardingBackground";
import DecisionStep from "@/components/onboarding/DecisionStep";
import { PAYWALL_AVATARS } from "@/components/paywall/PaywallModal";
import Actions from "@/components/onboarding/Actions";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { wellnessColor } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "value_intro"
  | "decision_2a" | "decision_2b"
  | "account"
  // Questions post-signup (2026-10-05) : la configuration du « device » (le programme).
  | "ob_sport" | "ob_program" | "ob_import" | "ob_goal" | "ob_weak" | "ob_days" | "ob_invite";

type ObCustom =
  | { status: "matched"; sportLabel: string }
  | { status: "generated"; sportLabel: string; exercises: Record<string, string[]>; weaknessOptions: { key: string; label: string }[]; weaknessMeta: Record<string, { extraLine: string; typeHints: string[] }>; sessionLabels?: Record<string, string> }
  | { status: "failed"; text: string };

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Durée du programme déduite de la date d'échéance (départ = lundi qui suit, S0 avant) : la plus
   longue durée que le générateur accepte sans dépasser l'échéance. 8 semaines sans échéance. */
function durationFromDeadline(deadline: string): 4 | 6 | 8 | 12 | 16 {
  if (!deadline) return 8;
  const today = new Date(`${localTodayStr()}T12:00:00`);
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() + (dow === 0 ? 0 : 7 - dow) * 86400000);
  const weeks = Math.floor((new Date(`${deadline}T12:00:00`).getTime() - start.getTime()) / (7 * 86400000));
  const allowed = [16, 12, 8, 6, 4] as const;
  return allowed.find(w => w <= weeks) ?? 4;
}

type PendingData = {
  role: Role; sport: string; sportPrecision: string; level: Level; weaknesses: string[];
  goal: string; frustration: string; trainingDays: number[];
  coachingContext: string; athleteCount: string; coachingChallenge: string; currentTool: string; trainingStyle: string;
  name: string;
};
interface Props { userId?: string; pendingData?: PendingData | null; initialRole?: Role; resumeRole?: Role }

/* Retour à l'architecture POC (2026-09-02, voir plan /Users/Gildas/.claude/plans/
   optimized-drifting-sutton.md) — remplace le flow "zéro problem awareness" (2026-08-17→08-31,
   qui collectait déjà sport+faiblesses+jours+aperçu réel AVANT le signup) par le flow original du
   POC `theperfclub_poc_onboarding_builder_first_v1.html`, Option A, à la lettre (décision explicite
   de Gildas, y compris pour le trafic "programme claimé" — voir doc de PROGRAM_ATHLETE_PATH plus
   bas) :
     value_intro → sport_2a (léger, sport seul) → role → decision_2a/2b (AHA illustratif, sur
     getSessionTemplates(sport) — plus de génération réelle avant signup) → account (signup="
     Connecter") → [WIZARD post-signup, actions 100% libres] wizard_picker → wizard_criteria →
     wizard_builder (S2+ flouté visuellement, ajouté le 2026-09-03 — voir sa doc plus bas) →
     wizard_activate → wizard_assign → paywall_priming → paywall_form → app gated (S1 visible/S2+
     flouté, déjà construit sur /week et /coach/planning).

   Expérimentation "value+rôle fusionnés → AHA générique → signup" (2026-09-04, décidée sans A/B —
   même absence de test que les repositionnements précédents, voir doc du path plus bas) : `sport_2a`
   ET `role` sortent à leur tour des paths actifs. `value_intro` porte désormais lui-même le choix de
   rôle (ses 2 cartes deviennent son propre CTA — repli sur un CTA unique si le rôle est déjà connu à
   l'arrivée, `?role=`/programme claimé/reprise Google) ; `sport_2a` disparaît purement et simplement,
   le sport ne se demande plus qu'au wizard (`wizard_criteria`), comme faiblesses/jours déjà avant
   lui. Flow réel : value_intro (rôle inclus) → decision_2a/2b (AHA, désormais générique — `sport`
   reste "" tout du long, `getSessionTemplates("")` retombe sur sa banque par défaut, mouvements
   universels squats/pompes/gainage, wording explicite "marche pour tous les sports") → account →
   wizard. Faiblesses/jours/aperçu se collectent désormais DANS le wizard (vrais
   `ProgramCriteriaModal`/`ProgramBuilderModal`), l'activation via les vrais composants in-app montés
   directement dans le wizard (`WellnessModal`, `InviteModal`/`ProgramAssignModal`).
   `DecisionStep.tsx`/`ProgramCreatePicker.tsx`/`ProgramCriteriaModal.tsx`/`ProgramBuilderModal.tsx`/
   `InviteModal.tsx`/`WellnessModal.tsx`/`ProgramAssignModal.tsx` sont réutilisés tels quels (aucune
   duplication maison — règle enfreinte une fois par erreur pendant la conception de ce chantier,
   corrigée avant exécution, voir mémoire feedback-reuse-real-components-not-onboarding-duplicates).
   paywall_priming/paywall_form arrivent après le wizard. `onboarding_done` **n'est plus posé à
   l'activation** (2026-09-14, fix suite à un vrai compte gratuit constaté en prod —
   gobert.benjamin@gmail.com, entré dans l'app gated sans CB le jour même du passage à l'essai 14j) :
   `finishWizard()` ne le pose plus du tout, seul `handlePaymentSuccess()` (paiement/essai confirmé
   réellement, `trial_started`) le fait désormais. Root cause du bug : `middleware.ts` ne vérifie QUE
   `onboarding_done` pour laisser entrer dans l'app — poser ce flag avant l'écran de paywall (même
   non-dismissible dans l'UI React) suffisait à laisser filer quiconque fermait l'onglet/l'app à cet
   instant précis (bouton "×"/clic-fond retirés, mais fermer/naviguer ailleurs restait toujours
   possible). Modèle produit-gated du 2026-08-19/20 abandonné sur ce point précis : l'accès à l'app
   dépend à nouveau réellement du paiement, pas seulement de la fin du wizard. `paywall_priming` n'est
   plus dismissible depuis le retour de l'essai 14j avec CB (2026-09-14, `skipPaywall()` supprimée) —
   voir sa doc à l'endroit où il est rendu, plus bas dans ce fichier.
   Nettoyage 2026-09-05 : `role`, `sport_2a` et tous les autres steps dépréciés par les chantiers
   ci-dessus (`level_2a`, `goal_2a`, `frustration_2a`, `days_2a`, les pain points 2a/2b, `concept_
   autoreg`, `autoreg_score(_coach)`, `profile_recap`, `week_preview_2a/2b`, `wellness_check_2a/2b`,
   `wellness_q`, `wellness_reveal`, `celebration`, `invite_team`, et `context_2b`/`sport_2b`/
   `count_2b`/`challenge_2b`/`tool_2b` — jusque-là gardés en dead code par prudence — ont été
   supprimés du type `StepId`, de leur JSX et de tout le code qui ne servait qu'à eux (fonctions,
   state, tables de données), à la demande explicite de Gildas. Les 12 StepId encore actifs sont
   `value_intro`, `decision_2a`/`decision_2b`, `account`, les 6 `wizard_*`, `paywall_priming`/
   `paywall_form`. */
/* Aller-retour complet sur decision/account le 2026-09-04, 4 itérations successives de Gildas la
   même journée — retracé ici pour qu'un futur lecteur ne rejoue pas le même chemin :
     1. Fusion en un seul écran, toggle séquentiel démo→formulaire ("account" retiré de ces 4
        tableaux, DecisionStep rendait un carrousel puis cédait la place au formulaire).
     2. "c'est pas ça que je voulais... je veux que le form d'inscription soit à droite, et que le
        carousel soit à gauche" — split desktop, les deux visibles ensemble, "account" toujours
        retiré des tableaux (fondu dans decision_2a/2b).
     3. "je suis perdu... la démo avec le carrousel je suis pas convaincu... c'est trop chargé...
        en mobile ça passera jamais" — DecisionStep devient un bloc statique (3 points), toujours
        dans le même split fondu avec le formulaire.
     4. "finalement il vaut mieux avoir l'étape propre 'aha' avant le signup (Value, aha, signup)
        pour avoir de l'impact et de l'espace" — RETOUR à 3 steps séparés : "account" reprend sa
        place dans ces 4 tableaux (comme avant la fusion), `decision_2a`/`decision_2b` redevient un
        step à part entière (accordéon+illustration, voir DecisionStep.tsx), `renderAccountForm()`
        n'est plus jamais appelée qu'au step "account" standalone (son option `embedded` retirée,
        n'a plus d'appelant). Les 3 continuations (`inviteJoinFailed`/`googleInitDone`/
        `resumeRoleApplied`, plus bas) gardent leur repli `decisionStepIdFor(role)` en filet de
        sécurité (jamais atteint tant que "account" est dans le path résolu, mais inoffensif à
        laisser — évite de rouvrir ce fichier une 5e fois pour un simple retrait défensif). */
/* Onboarding dans l'app (2026-10-01) : le parcours s'arrête au compte — le produit fait
   l'onboarding (checklist dans le header, cartes "À faire"). Plus de wizard ni de paywall forcé :
   le priming s'ouvre après la 1re décision prise. Les steps wizard_* restent dans le type et le
   JSX (code mort assumé) le temps de valider le nouveau parcours. */
const ATHLETE_PATH: StepId[] = ["value_intro", "decision_2a", "account"];
/* Onboarding dans l'app (2026-10-01) : le parcours s'arrête au compte — le produit fait
   l'onboarding (checklist dans le header, cartes "À faire"). Plus de wizard ni de paywall forcé :
   le priming s'ouvre après la 1re décision prise. Les steps wizard_* restent dans le type et le
   JSX (code mort assumé) le temps de valider le nouveau parcours. */
const COACH_PATH: StepId[] = ["value_intro", "decision_2b", "account"];

/* DARK_STEPS ne contient plus que value_intro — les autres steps sombres (autoreg_score,
   celebration, concept_autoreg, wellness_reveal) ont disparu avec le nettoyage du code mort du
   flow "zéro problem awareness" (2026-09-05). */
const DARK_STEPS: StepId[] = ["value_intro"];

/* Frise de progression pré-signup entièrement retirée (2026-09-05) — le mécanisme (ProgressFrise,
   PHASE_1..4_STEPS, HIDE_FRISE_STEPS, FRISE_INLINE_STEPS, showFrise) ne pouvait plus jamais
   s'afficher pour aucun step vivant : `decision_2a`/`decision_2b` sont exclus depuis le
   2026-09-03 (leur propre heroBlock ne la rend plus non plus), et les 10 autres steps vivants
   (value_intro, account, wizard_*, paywall_*) devaient tous être ajoutés à HIDE_FRISE_STEPS pour
   ne jamais montrer une frise bloquée à 0% (les seuls steps qu'elle savait encore situer dans une
   phase — sport_2a/role/autoreg_score — sont morts). Seul le wizard post-signup garde un
   indicateur de progression (dots 1/2/3, voir WizardHero juste en dessous). */


/* Illustration "Signal du jour" sur value_intro (2026-09-03, demande explicite de Gildas — 2
   benchmarks publicitaires fournis, "qui marchent pas mal") : reprend la structure de la 1re pub
   (petite carte compacte, ring + zone + conseil court), placée en `position:fixed` en haut de
   l'écran (2e passe, même jour — en flux normal elle ajoutait de la hauteur au document, poussant le
   bloc titre sous le footer CTA sur les viewports courts ; en fixed, elle ne participe plus au
   calcul de hauteur du reste de l'écran).
   2e passe également sur le contenu, pour rester fidèle au vrai produit plutôt qu'au rouge d'alerte
   de la pub d'origine — retour explicite de Gildas :
   - Ring : VRAI `wellnessColor()` (@/lib/wellness, le même dégradé séquentiel bleu que
     `PlanningRing.tsx` en prod) au lieu d'une couleur rouge inventée pour l'effet pub.
   - Comportements : VRAIS badges `BEHAVIOR_META` (@/lib/behaviors, même style exact que
     `CoachAthleteCard.tsx` — fond teinté vert/orange selon `positive`) au lieu d'un texte "Fatigue
     élevée" fixe.
   - "Fatigué" reprend le vocabulaire réel des zones relatives (`relativeZoneLabel()`,
     wellnessBaseline.ts — Fatigué/Équilibré/Frais), pas "Zone basse" (wording pub, absent du
     vocabulaire produit).
   Rétrécit sur mobile (`isMd`, prop dérivé de `colIsMd` déjà résolu plus haut dans le composant) —
   padding/tailles réduits, jamais juste zoomé/dézoomé en bloc.
   4e passe (même jour) : carte poussée SOUS le voile dégradé de la photo (retour explicite,
   "sous l'overlay de l'image") — la rendre plus lisible sans toucher au voile lui-même s'est donc
   fait uniquement en renforçant la carte : fond plus opaque (.6→.85), bordure plus visible
   (.16→.28), + une ombre portée propre pour la détacher visuellement du fond assombri. */
function SignalDuJourCard({ isMd }: { isMd: boolean }) {
  const score = 52;
  const ringSize = isMd ? 52 : 42;
  const r = isMd ? 20 : 16, sw = isMd ? 5 : 4;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  const ringColor = wellnessColor(score);
  const behaviorKeys = ["late_sleep", "stretching"];

  return (
    <div style={{
      display: "inline-block", background: "rgba(24,24,24,.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: "1.5px solid rgba(255,255,255,.28)", borderRadius: isMd ? 16 : 16, padding: isMd ? "14px 16px" : "10px 12px",
      maxWidth: isMd ? 270 : 208, boxShadow: "0 10px 28px rgba(0,0,0,.4)",
    }}>
      <div style={{ fontSize: isMd ? 10 : 9, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#ff8a70", marginBottom: isMd ? 10 : 7 }}>
        Signal du jour
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: isMd ? 12 : 9, marginBottom: isMd ? 12 : 9 }}>
        <div style={{ position: "relative", width: ringSize, height: ringSize, flexShrink: 0 }}>
          <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={sw} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke={ringColor} strokeWidth={sw} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: isMd ? 15 : 12, fontWeight: 700, color: "#fff" }}>{score}</span>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: isMd ? 15 : 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>Fatigué</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {behaviorKeys.map(b => {
              const meta = BEHAVIOR_META[b];
              return (
                <span key={b} style={{
                  fontSize: isMd ? 9 : 8, padding: "2px 6px", borderRadius: 999,
                  background: meta.positive ? "rgba(47,158,68,.18)" : "rgba(212,64,0,.22)",
                  color: meta.positive ? "#bfeec8" : "#ffd2bf",
                }}>
                  {meta.emoji} {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,.12)", marginBottom: isMd ? 10 : 7 }} />
      <div style={{ fontSize: isMd ? 9.5 : 8.5, fontWeight: 900, letterSpacing: "0.09em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 5 }}>
        ⚠ Conseil séance
      </div>
      <div style={{ fontSize: isMd ? 12 : 11, color: "rgba(255,255,255,.8)", lineHeight: 1.45 }}>
        Allège modérément la séance.
      </div>
    </div>
  );
}

/* Programme claimé (2026-09-02, retour à l'architecture POC — "aucune exception", décision
   explicite de Gildas) : "sport_2a" est SAUTÉ (contrairement au 2026-08-29 → 2026-09-01, où il
   restait accessible pour changer de sport/importer avant signup) — value_intro montre déjà le nom
   du programme claimé, role suit directement. wizard_picker/wizard_criteria sont sautés eux aussi.
   wizard_builder l'était ENCORE jusqu'au 2026-09-18 (pré-rempli avec le template claimé, avec un
   `onBack` vers wizard_picker pour l'échappatoire "changer de programme") — retiré du path à cette
   date, voir doc juste en dessous. */
/* wizard_builder sauté pour ce trafic (2026-09-18, retour explicite de Gildas) — le
   programme claimé est sauvegardé automatiquement en arrière-plan (voir runClaimedProgramAutoSave
   plus bas) et l'utilisateur atterrit directement sur wizard_activate. Justification : il a déjà vu
   ce programme en entier sur /p/[id] (avec le simulateur d'autorégulation) avant même de créer son
   compte — le lui remontrer dans wizard_builder serait une confirmation redondante, pas une vraie
   découverte, et c'est le moment de plus forte intention du funnel (CTA "Personnaliser CE
   programme" cliqué). Un event onboarding_wizard_builder_viewed synthétique est émis quand même à
   ce moment-là (même principe déjà utilisé pour onboarding_role_viewed lors de la fusion
   role/value_intro du 2026-07-31) — il l'a techniquement vu, sur /p/[id], juste avant ce funnel. */
const PROGRAM_ATHLETE_PATH: StepId[] = ["value_intro", "decision_2a", "account"];
const PROGRAM_COACH_PATH: StepId[] = ["value_intro", "decision_2b", "account"];

/* Sportif invité par un coach (coach_invite_code en localStorage, posé par /join/[code]) : le lien
   coach→sportif est confirmé au submit d'"account" via /api/invite/join (voir handleFinish()), donc
   ni diagnostic ni paywall n'ont de sens ici — l'accès est gratuit tant que le lien tient, même
   logique que hasCoach dans usePaywall.ts/(app)/layout.tsx. Priorité absolue sur hasClaimedProgram
   dans getPath() : une invitation coach est plus spécifique qu'un programme claimé. "celebration" retiré (2026-09-02, plus un step actif ailleurs — voir doc en
   tête de fichier) : ce trafic n'a jamais eu de wizard non plus (pas de programme à construire),
   next() après "account" redirige donc directement vers l'app réelle (/today ou /coach). */
const INVITE_ATHLETE_PATH: StepId[] = ["value_intro", "account"];

/* Fusion decision/account (2026-09-04, voir doc des paths plus haut) — les 3 continuations qui
   recalculaient un stepIdx "juste après account" (Google OAuth, reprise magic-link, invite coach
   échoué) doivent désormais viser juste après decision_2a/2b sur les paths où "account" a disparu. */
function decisionStepIdFor(r: Role): StepId {
  return r === "coach" ? "decision_2b" : "decision_2a";
}


const LEVEL_TO_DB: Record<Level, string> = { beginner: "debutant", intermediate: "intermediaire", elite: "elite" };
const DB_TO_LEVEL: Record<string, Level> = { debutant: "beginner", intermediaire: "intermediate", avance: "elite", elite: "elite" };
/* Wizard post-signup (2026-09-02) — même valeur que ProgramLibraryPage.tsx/ProgramCriteriaModal.tsx
   (BLANK_PROGRAM_DAYS), pas partagée entre les fichiers (même choix déjà fait pour
   SPORTS/WEAKNESSES_BY_SPORT avant ce chantier). */


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


function EmailSentScreen({ email }: { email: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Vérifie tes emails</div>
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

/* ── main ── */
export default function OnboardingFlow({ userId, pendingData, initialRole, resumeRole }: Props) {
  // Bouton "Continuer avec Apple" : app iOS uniquement, résolu après montage (pas d'écart SSR).
  const [nativeShell, setNativeShell] = useState(false);
  useEffect(() => { setNativeShell(isNativeApp()); }, []);
  const supabase = createClient();
  /* Une continuation Google (pendingData) a déjà un userId (compte créé), mais c'est toujours
     une inscription en cours — pas un ancien compte incomplet qui revient plus tard. Sans ce
     cas, ces sessions basculaient en "mode auth" (CTA explicite) sur les étapes de sélection
     qui suivent, au lieu de l'auto-advance au tap attendu en inscription. */
  const isRegisterMode = !userId || !!pendingData;
  /* Ancre neutre (2026-08-07) : capture_pageview est désactivé (PostHogProvider.tsx), donc rien ne
     se déclenchait avant la toute première étape réellement rendue. Déclenché une seule fois au
     montage, indépendamment de path/currentStep. */
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
  const [coachInviteName, setCoachInviteName] = useState<string | null>(null);
  const [inviteJoinFailed, setInviteJoinFailed] = useState(false);

  /* Les A/B tests "short-onboarding-signup" et "skip-value-intro" (control/test de la position du
     signup, et du retrait de value_intro) sont clos côté PostHog — plumbing de résolution de
     variante retiré (2026-09-05, nettoyage du code mort). */

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
  const [claimedProgramName, setClaimedProgramName] = useState<string | null>(null);
  // Couverture du programme claimé (page WP) pour le fond de value_intro ; null = image par défaut.
  const [claimedCover, setClaimedCover] = useState<string | null>(null);
  /* Sportif→coach (2026-09-14, voir CLAUDE.md — remplace une 1re version "comme un programme
     claimé" du 13/09, simplifiée le lendemain pour ne plus dépendre d'un programme existant).
     Posés directement depuis ?athleteId=/&athleteName= dans l'URL (lien /register partagé par le
     sportif). Pilotent le wording "Ton sportif {Prénom} t'attend" (value_intro/paywall_priming) et
     la création de coach_athletes dans completeProfile() à la création du compte coach. */
  const [claimedAthleteName, setClaimedAthleteName] = useState<string | null>(null);
  const [claimedAthleteUserId, setClaimedAthleteUserId] = useState<string | null>(null);
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

  /* questionnaire */
  const [sport, setSport]                         = useState(pendingData?.sport || "");
  const [sportPrecision]                          = useState(pendingData?.sportPrecision || "");
  // "level_2a" ne fait plus choisir de niveau (remplacé par les faiblesses, voir plus bas) —
  // `level`/`setLevel` restent réels (pas une constante) car `setLevel` est encore utilisé pour le
  // chemin "programme claimé" (ligne ~979, infère le niveau du programme réellement claimé, sans
  // rapport avec ce chantier). Pour le chemin classique, reste à sa valeur par défaut neutre.
  const [level, setLevel]                         = useState<Level>(pendingData?.level || "intermediate");
  const [weaknesses]               = useState<string[]>(pendingData?.weaknesses ?? []);
  const [goal]                           = useState(pendingData?.goal || "");
  const [frustration]             = useState(pendingData?.frustration || "");
  const [trainingDays]           = useState<number[]>(pendingData?.trainingDays ?? [1, 3, 5]);
  const [coachingContext]     = useState(pendingData?.coachingContext || "");
  const [athleteCount]           = useState(pendingData?.athleteCount || "");
  const [coachingChallenge] = useState(pendingData?.coachingChallenge || "");
  const [currentTool]             = useState(pendingData?.currentTool || "");
  const [trainingStyle]         = useState(pendingData?.trainingStyle || "");

  /* Questions post-signup (2026-10-05). Indépendantes du questionnaire historique ci-dessus. */
  const [obSport, setObSport] = useState("");
  const [obCustom, setObCustom] = useState<ObCustom | null>(null);
  const [obAnalyzing, setObAnalyzing] = useState(false);
  const [obHas, setObHas] = useState<ObHas>(null);
  const [obImportText, setObImportText] = useState("");
  const [obImportFile, setObImportFile] = useState<File | null>(null);
  const [obImportBusy, setObImportBusy] = useState(false);
  const [obImportError, setObImportError] = useState<string | null>(null);
  const [obImportTemplate, setObImportTemplate] = useState<ProgramTemplate | null>(null);
  const [obGoal, setObGoal] = useState<ObGoal | null>(null);
  const [obDeadline, setObDeadline] = useState("");
  const [obWeak, setObWeak] = useState<string[]>([]);
  const [obDays, setObDays] = useState<number[]>([0, 2, 4]); // 0 = lundi
  const [obInvites, setObInvites] = useState<InviteRow[]>([{ name: "", email: "" }]);
  const [obInviteCode, setObInviteCode] = useState<string | null>(null);
  const [obFinishing, setObFinishing] = useState(false);
  const [obError, setObError] = useState<string | null>(null);
  const savedProgramIdRef = useRef<string | null>(null);

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


  /* initializing — true quand on arrive depuis Google OAuth avec pendingData */
  const [initializing, setInitializing] = useState(!!pendingData);
  const [googleInitDone, setGoogleInitDone] = useState(false);
  /* Reprise après clic sur un lien reçu par email (2026-09-03, bug réel trouvé par Gildas) — un
     compte créé sans session immédiate (confirmation email requise) OU un utilisateur qui clique
     le lien "crée ton mot de passe" (resetPasswordForEmail) avant d'avoir fini le wizard atterrit
     authentifié sur une page non-publique avec `onboarding_done` encore false — le middleware
     (`src/lib/supabase/middleware.ts`) le renvoie alors vers `/register` nu, sans aucun moyen de
     reprendre. Avant ce fix, `register/page.tsx` montait `OnboardingFlow` à froid dans ce cas
     (`userId` seul, sans `pendingData`) — value_intro/sport_2a/role/decision étaient rejoués en
     entier avant de retomber sur "account" (déjà fait, no-op). `resumeRole` (posé par
     `register/page.tsx` via `profiles.mode`, déjà écrit par `createAccount()` lors du vrai signup)
     saute directement dans le wizard — même mécanique à 2 effets que la continuation Google
     ci-dessous (mount → applique le rôle, effet séparé → path à jour → jump), volontairement PAS
     la même continuation que pendingData (éviterait de redéclencher account_created/brevo/
     posthog.identify une 2e fois, faussement tagués "method:google"). */
  const [resuming, setResuming] = useState(!!resumeRole);
  const [resumeRoleApplied, setResumeRoleApplied] = useState(false);

  /* iOS Safari n'expose PushManager que si le site est ajouté à l'écran d'accueil — calculé
     une fois au montage (window/navigator indisponibles côté SSR malgré "use client"). */

  /* auto-advance guard */
  const advancingRef = useRef(false);
  /* guard contre un double déclenchement de completeProfile() à l'entrée de profile_recap (voir effet dédié plus bas) */
  const profileCompleteGuardRef = useRef(false);

  /* Wizard post-signup (2026-09-02, retour à l'architecture POC — voir doc en tête de fichier) :
     construction réelle du programme (wizard_picker/criteria/builder), gratuite, aucune écriture
     tant que le CTA de wizard_builder n'est pas cliqué. wizardTemplate est seedé directement par
     l'effet de claim ci-dessus pour le trafic "programme claimé". */
  const [wizardTemplate, setWizardTemplate] = useState<ProgramTemplate | null>(null);
  const [wizardProgramName, setWizardProgramName] = useState("Mon programme");
  const [wizardProgramId, setWizardProgramId] = useState<string | null>(null);
  /* Résultat réel du point forme saisi à wizard_activate (2026-09-14, retour explicite de Gildas :
     "la wellness card de l'étape 3 doit reprendre exactement le score qu'il a fait en étape 2") —
     jamais reconstruit depuis wellness_daily (RLS + latence d'écriture), juste le retour direct de
     WellnessModal.onSave, threadé jusqu'à wizard_assign (WellnessCardPreview). */
  /* Aha réactif wizard_activate (2026-09-14) : les ~28 jours d'historique wellness_daily synthétique
     déjà seedés par completeProfile() (buildAthleteHistory, appelée juste après la création du
     compte, bien avant ce step) — permet à WellnessModal de calculer la VRAIE baseline relative
     (computeWellnessBaselineAt/relativeZoneLabel, wellnessBaseline.ts) pendant la saisie, au lieu du
     repli zoneLabel() absolu qui s'affichait faute d'historique connu du composant. */
  /* CTA "Débloquer →" de l'overlay S2+ de wizard_builder (2026-09-03) — ouvre le même paywall
     skippable que paywall_priming/paywall_form, en overlay par-dessus le wizard (stepIdx inchangé,
     pas de navigation : wizard_activate/wizard_assign restent intacts derrière). Un paiement réussi
     lève wizardUnlocked, qui passe isActive=true à ProgramBuilderModal (le flou S2+ disparaît
     réellement, pas juste cosmétique). */
  /* Sauvegarde auto du programme claimé en arrière-plan (2026-09-18, wizard_builder sauté pour ce
     trafic — voir doc PROGRAM_ATHLETE_PATH/PROGRAM_COACH_PATH). claimedProgramSaveError pilote
     l'écran de transition affiché sur wizard_activate tant que wizardProgramId n'est pas résolu
     (ProgramAssignModal a besoin d'un vrai id). Guard non-idempotent (même règle que
     profileCompleteGuardRef/finishGuardRef ailleurs dans ce fichier) : évite un double POST
     /api/programs si l'effet se redéclenchait pendant l'appel en vol.
     claimedProgramMinDelayDone (retour explicite de Gildas, 2026-09-18 : "ça rassure que le
     programme soit bien pris en compte") — un vrai POST répond souvent en <300ms, trop rapide pour
     être visible ; la transition reste affichée au moins 2s côté succès, jamais côté erreur (l'user
     doit voir l'erreur/pouvoir retenter tout de suite, pas patienter sur un spinner inutile). */

  /* Après « account » : les questions post-signup. Claimé = programme déjà choisi, aucune question
     (coach : invitation seule). « Passer » la question programme (obHas = "later") retire les
     questions du programme. */
  const getPath = (r: Role, has: ObHas = obHas): StepId[] => {
    if (hasCoachInvite && r === "athlete") return INVITE_ATHLETE_PATH;
    const base = hasClaimedProgram ? (r === "coach" ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH) : (r === "coach" ? COACH_PATH : ATHLETE_PATH);
    const post: StepId[] = [];
    if (!hasClaimedProgram) {
      post.push("ob_sport", "ob_program");
      if (has === "import") post.push("ob_import");
      else if (has !== "later") post.push("ob_goal", "ob_weak", "ob_days");
    }
    if (r === "coach") post.push("ob_invite");
    return [...base, ...post];
  };
  const path         = getPath(role);
  // Tout parcours sauf INVITE_ATHLETE_PATH (sportif invité : ni profil généré ni sportif démo).
  const isFullPath   = path !== INVITE_ATHLETE_PATH;
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

  // Étape d'invitation : le lien a besoin du code d'invitation du coach.
  useEffect(() => {
    const uid = userId || newUserId;
    if (currentStep === "ob_invite" && !obInviteCode && uid) ensureInviteCode(uid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);



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
          } else {
            setCoachInviteName(data.coachName ?? null);
          }
        })
        .catch(() => {});
    }

    const params = new URLSearchParams(window.location.search);

    /* Sportif→coach (2026-09-14, voir CLAUDE.md) — simplifié : plus de dépendance à un programme
       existant ("le plus simple serait de ne pas partager le programme"). Le lien de partage
       (PricingPriming.tsx) pointe directement vers /register avec l'id + le prénom du sportif en
       clair dans l'URL — aucun fetch nécessaire, disponible dès la création du compte plutôt que
       seulement après wizard_builder. La vraie vérification (le propriétaire est-il un sportif
       pas encore coaché ?) reste côté serveur dans claim-athlete-link/route.ts, jamais fait
       confiance à l'URL seule pour l'écriture réelle. */
    const inviteAthleteId = params.get("athleteId");
    const inviteAthleteName = params.get("athleteName");
    if (inviteAthleteId) setClaimedAthleteUserId(inviteAthleteId);
    if (inviteAthleteName) setClaimedAthleteName(inviteAthleteName);

    const claimParam = params.get("claim");
    if (claimParam && !localStorage.getItem("claim_program_id")) {
      localStorage.setItem("claim_program_id", claimParam);
    }
    const claimId = localStorage.getItem("claim_program_id");
    const claimed = !!claimId;
    setHasClaimedProgram(claimed);
    if (claimed) {
      setClaimedCover(programCover(claimId));
      posthog.setPersonProperties({ onboarding_source: "program", claimed_program_id: claimId });
      posthog.capture("program_onboarding_start", { program_id: claimId });
      fetch(`/api/programs/${claimId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) {
            /* Programme introuvable (supprimé, lien périmé/erroné, is_public passé à false depuis) —
               même traitement que le code d'invitation coach invalide juste au-dessus : retombe sur
               le funnel standard plutôt que de laisser wizardTemplate/wizardProgramId ne jamais se
               résoudre. Sans ce fallback, hasClaimedProgram restait bloqué à `true` (posé uniquement
               depuis localStorage, indépendamment du succès de CE fetch) — PROGRAM_ATHLETE_PATH/
               PROGRAM_COACH_PATH sautent wizard_builder pour ce trafic (2026-09-18), donc plus rien
               ne pouvait jamais déclencher runClaimedProgramAutoSave() : coincé indéfiniment sur
               "Préparation de Mon programme…" (le nom par défaut jamais écrasé, faute de template).
               Bug trouvé en conditions réelles par Gildas, confirmé en base : la ligne `programs`
               correspondante n'existe tout simplement pas. */
            localStorage.removeItem("claim_program_id");
            setClaimedCover(null);
            setHasClaimedProgram(false);
            return;
          }
          if (data.sport) setSport(data.sport);
          if (data.level && DB_TO_LEVEL[data.level]) setLevel(DB_TO_LEVEL[data.level]);
          if (data.name) setClaimedProgramName(data.name);
          /* Contenu réel du programme claimé (2026-09-02, retour à l'architecture POC) — pré-remplit
             wizard_builder directement (skip picker/criteria pour ce trafic, voir PROGRAM_ATHLETE_PATH/
             PROGRAM_COACH_PATH). Même fetch que ci-dessus (GET /api/programs/[id] renvoie déjà le
             template complet) — pas de 2e appel réseau nécessaire. */
          if (data.template) { setWizardTemplate(data.template); setWizardProgramName(data.name || "Mon programme"); }
        })
        .catch(() => {
          localStorage.removeItem("claim_program_id");
          setClaimedCover(null);
          setHasClaimedProgram(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Bug trouvé le 2026-08-14 : cet effet dépend seulement de `currentStep`, calculé à CHAQUE render
     — y compris les tout premiers, avant que `hasClaimedProgram`/`hasCoachInvite`/
     `claimedNameResolved` soient connus, pendant lesquels le JSX plus bas affiche encore l'écran de
     chargement (voir ce même garde de rendu, `if (!flowReady)` plus bas). Sur ce premier render non
     résolu, `path` retombe sur son défaut (value_intro inclus) donc `currentStep === "value_intro"`
     — l'event `onboarding_value_intro_viewed` partait alors AVANT toute résolution, y compris pour
     des visiteurs qui n'ont jamais vu cet écran à l'affichage réel (masqué par l'écran de
     chargement). `flowReady` reprend exactement la même condition que le garde de rendu — aucun
     event de vue d'étape ne doit partir tant que le JSX correspondant n'est pas réellement affiché. */
  const flowReady = hasClaimedProgram !== null && hasCoachInvite !== null && claimedNameResolved;


  useEffect(() => {
    if (!flowReady) return;
    const props = {
      step: currentStep,
      step_index: stepIdx,
      role: currentStep === "value_intro" && !roleChosen && !initialRole && !pendingData?.role ? "selecting" : (role || "unknown"),
      mode: isRegisterMode ? "register" : "auth",
    };
    posthog.capture("onboarding_step_viewed", props);
    posthog.capture(`onboarding_${currentStep}_viewed`, props);
    advancingRef.current = false;
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
     "week_preview_2a"/"week_preview_2b"`, jamais atteint sur ce path).
     Marqueur `isFullPath` (pas "wizard_builder", 2026-09-18) : depuis que
     wizard_builder est sauté pour le trafic claimé (voir PROGRAM_ATHLETE_PATH/PROGRAM_COACH_PATH),
     "wizard_builder" n'est plus un marqueur fiable de "n'importe quel path sauf INVITE_ATHLETE_PATH"
     — "wizard_activate", lui, reste présent dans les 4 autres paths (ATHLETE_PATH/COACH_PATH/
     PROGRAM_ATHLETE_PATH/PROGRAM_COACH_PATH) et absent d'INVITE_ATHLETE_PATH, même garantie. */

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

  /* paywall_priming n'est plus dismissible (2026-09-14, retour de l'essai 14j avec CB — voir doc
     du path plus haut) : allowDismiss=false sur le PrimingJourneyModal du step, ni "×" ni clic
     backdrop. `skipPaywall()` (qui sautait paywall_priming ET paywall_form d'un coup vers l'app
     sans paiement) est donc supprimée, plus aucun appelant. paywall_form garde son "×"/"← Retour"
     (onClose de PaywallModal, câblé sur goBack) — ramène vers priming, jamais un skip complet.
     Ça ne suffisait PAS à garantir l'accès payant à soi seul (voir doc du path plus haut, bug réel
     2026-09-14) : `onboarding_done` était posé avant ce step, donc fermer l'onglet/l'app ici laissait
     quand même entrer. Le vrai verrou est maintenant `onboarding_done` posé uniquement dans
     `handlePaymentSuccess()` (voir plus bas) — retirer l'UI de sortie de cet écran reste une bonne
     chose (moins de tentation), mais ce n'est plus ce qui protège l'accès. */

  /* Transition "reconduction" retirée (2026-09-04, retour explicite de Gildas — "on peut dégager
     la transition") : appelée par le clic sur une carte de rôle de value_intro, avance désormais
     directement. Nom/signature gardés (pas de raison de toucher les 3 call sites) au cas où une
     future transition cosmétique voudrait ce même point d'accroche. */
  function advanceMaybeReconduction() {
    next();
  }

  /* Compte créé au step "account" — désormais positionné avant la fin du diagnostic dans les
     2 variantes (juste après les pain points en A, juste après Rôle en B) : sport/niveau/objectif/
     jours ne sont pas encore connus à ce moment-là. N'upsert que ce qui est déjà collecté ;
     complete Profile() referme le reste une fois le diagnostic terminé (déclenché à l'entrée de
     profile_recap, voir l'effet dédié plus bas). */
  /* Garde-fou anti-écrasement (2026-09-05) — trouvé sur le compte réel de Gildas : une session
     authentifiée retombée dans OnboardingFlow (reprise "auth mode", edge case Google OAuth déjà
     documenté ailleurs dans ce fichier — ou un simple `onboarding_done` repassé à `false` à la main
     pour retester l'écran, comme Gildas l'a fait lui-même) a réexécuté completeProfile() sur un
     compte qui avait déjà terminé son onboarding, écrasant silencieusement 28 jours de wellness_daily
     réel (comportements, scores) + le profil (sport/jours d'entraînement/objectif) avec les valeurs
     générées/placeholder de ces deux fonctions. `profileCompleteGuardRef` protège déjà contre un
     double appel DANS la même session ; `onboarding_done` seul ne suffit pas (contournable en 1 UPDATE
     SQL, ce que Gildas a fait explicitement pour prévisualiser l'écran) — la vraie garantie est donc
     posée sur la présence de données réelles déjà existantes (`wellness_daily`/`sessions` non vides
     pour ce `uid`), jamais sur un flag qui peut mentir. Ne bloque jamais un premier passage légitime
     (compte tout juste créé, aucune des deux tables n'a encore de ligne pour lui). */
  async function alreadyHasRealHistory(uid: string): Promise<boolean> {
    const [{ data: w }, { data: s }, { data: p }, { data: ca }] = await Promise.all([
      supabase.from("wellness_daily").select("id").eq("user_id", uid).limit(1),
      supabase.from("sessions").select("id").eq("user_id", uid).limit(1),
      supabase.from("profiles").select("onboarding_done").eq("user_id", uid).maybeSingle(),
      // Coach : pas de wellness/sessions à lui, mais son sportif démo prouve un 1er passage.
      supabase.from("coach_athletes").select("id").eq("coach_id", uid).limit(1),
    ]);
    return (w?.length ?? 0) > 0 || (s?.length ?? 0) > 0 || (ca?.length ?? 0) > 0 || p?.onboarding_done === true;
  }

  async function createAccount(uid: string) {
    if (await alreadyHasRealHistory(uid)) {
      console.error("[createAccount] refusé : compte avec historique réel, écriture bloquée", uid);
      return;
    }
    await supabase.from("profiles").upsert({
      user_id: uid,
      ...(name.trim() ? { name: name.trim() } : {}),
      mode: role,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
    }, { onConflict: "user_id" });
  }

  async function completeProfile(uid: string, opts?: { skipDemoProgram?: boolean }): Promise<string | null> {
    if (await alreadyHasRealHistory(uid)) {
      console.error("[completeProfile] refusé : compte avec historique réel, écriture bloquée (profil + wellness + sessions)", uid);
      return null;
    }
    const obSportValue = obChosenSport();
    const sportValue = obSportValue || (!sport && sportPrecision.trim() ? `Autre - ${sportPrecision.trim()}` : sport || "Autre");
    const obTrainingDays = obHas === "generate" ? obDays.map(d => (d + 1) % 7).sort((a, b) => a - b) : null;
    await supabase.from("profiles").upsert({
      user_id: uid,
      sport: sportValue, mode: role,
      freq_target:        (obTrainingDays ?? trainingDays).length || null,
      training_days:      (obTrainingDays ?? trainingDays).length ? (obTrainingDays ?? trainingDays) : null,
      objective:          obGoal || goal || null,
      frustration:        role === "athlete" ? (frustration || null) : null,
      coaching_challenge: role === "coach"   ? (coachingChallenge || null) : null,
    }, { onConflict: "user_id" });

    /* Sportif : plus aucun historique fictif à l'inscription (2026-10-01). Les 4 semaines de ressenti
       et de séances inventées entraient dans les vrais calculs (norme personnelle du score de forme,
       charge chronique, comportements, phase) et étaient affichées comme les données du sportif. Un
       compte neuf voit désormais l'exemple (bandeau "données d'exemple", demoAnalytics.ts) jusqu'à
       avoir ses propres données ; le score se lit sur l'échelle fixe tant que sa norme n'existe pas. */
    let demoAthleteId: string | null = null;
    if (role === "coach") {
      // Code d'invitation : déjà créé à l'étape d'invitation s'il y est passé.
      if (!obInviteCode) await ensureInviteCode(uid);

      // 1 seul profil démo (pas 3, 2026-09-03 — retour explicite de Gildas : "ça fait trop de bruit,
      // il doit les supprimer après"). Garde le cas Alléger (pas Maintenir/Surcharger) : un coach qui
      // découvre son Coach Control pour la 1re fois doit voir "quelqu'un a besoin de toi" — la vraie
      // proposition de valeur du produit — pas un cas "tout va bien". Même paire wellness/rpeBase que
      // le placeholder d'invitation (PLACEHOLDER_WELLNESS_SCORE/PLACEHOLDER_RPE_BASE,
      // invite/create/route.ts) : un seul mapping calibré, réutilisé partout où un sportif démo/
      // placeholder doit démontrer le geste réel dès aujourd'hui (voir buildCoachDemoSessions()).
      const DEMO_ATHLETES = [
        { name: "Thomas M. (démo)", wellness_score: 35, rpeBase: 9 },
      ];
      const demoAthleteIds: string[] = [];
      for (const demo of DEMO_ATHLETES) {
        const { data: athlete } = await supabase
          .from("coach_athletes")
          .insert({ coach_id: uid, name: demo.name, sport: sportValue, wellness_score: demo.wellness_score, user_id: null })
          .select("id").single();
        if (athlete?.id) {
          demoAthleteIds.push(athlete.id);
          demoAthleteId = athlete.id;
          /* Vrai programme assigné dès l'inscription (onboarding in-app, 2026-10-01) : Thomas a une
             séance aujourd'hui (1re séance alignée sur aujourd'hui) et la 1re décision est immédiate.
             Seul son historique passé reste synthétique (graphes Charge/Récupération). Repli sur les
             séances démo si la génération échoue. */
          await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, athlete.id, sportValue, demo.rpeBase, true, "past"));
          // Le coach a configuré son programme : c'est lui que suit Thomas (assigné en fin d'onboarding).
          if (opts?.skipDemoProgram) continue;
          const assigned = await assignDemoProgram(athlete.id, sportValue);
          if (!assigned) await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, athlete.id, sportValue, demo.rpeBase, true, "upcoming"));
        }
      }
      /* Plus d'auto-génération+assignation synchrone ici depuis le 2026-09-02 (retour à
         l'architecture POC) — le coach construit son vrai programme dans le wizard post-signup
         (wizard_builder) et l'assigne réellement (démo + invités réels) à wizard_assign. Le démo
         reste créé ici pour que Coach Control ne soit jamais vide entre-temps. */

      // Sportif→coach "comme un programme claimé" (2026-09-13, voir CLAUDE.md) — best-effort,
      // ne bloque jamais la création du compte coach si ça échoue.
      if (claimedAthleteUserId) {
        try {
          await fetch("/api/programs/claim-athlete-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ athleteUserId: claimedAthleteUserId }),
          });
        } catch { /* le coach garde quand même son compte + le programme pré-rempli du wizard */ }
      }
    }
    return demoAthleteId;
  }

  /* ───────── Questions post-signup : helpers ───────── */
  // Valeur envoyée au générateur : sport du catalogue, sinon sport libre analysé, sinon "".
  function obChosenSport(): string {
    if (obSport) return obSport;
    if (obCustom) return obCustom.status === "failed" ? obCustom.text : obCustom.sportLabel;
    return "";
  }
  function obSportLabel(): string {
    const e = catalogEntry(obSport);
    if (e) return e.label;
    if (obCustom) return obCustom.status === "failed" ? obCustom.text : obCustom.sportLabel;
    return "";
  }

  async function ensureInviteCode(uid: string): Promise<string | null> {
    const { data: prof } = await supabase.from("profiles").select("invite_code").eq("user_id", uid).maybeSingle();
    if (prof?.invite_code) { setObInviteCode(prof.invite_code); return prof.invite_code; }
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const { error } = await supabase.from("profiles").update({ invite_code: code }).eq("user_id", uid);
    if (error) { console.error("[ensureInviteCode] update error:", error); return null; }
    setObInviteCode(code);
    return code;
  }

  async function obAnalyzeSport(description: string) {
    setObSport(""); setObAnalyzing(true); setObWeak([]);
    let result: ObCustom = { status: "failed", text: description };
    try {
      const res = await fetch("/api/sports/custom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) });
      const data = res.ok ? await res.json() : null;
      if (data?.matched) result = { status: "matched", sportLabel: data.sportLabel };
      else if (data?.exercises) result = { status: "generated", sportLabel: data.sportLabel, exercises: data.exercises, weaknessOptions: data.weaknessOptions, weaknessMeta: data.weaknessMeta, sessionLabels: data.sessionLabels ?? undefined };
    } catch { /* repli générique */ } finally { setObAnalyzing(false); }
    setObCustom(result);
  }

  async function obRunImport() {
    if (obImportBusy) return;
    setObImportBusy(true); setObImportError(null);
    try {
      const body: { text?: string; imageBase64?: string; imageMediaType?: string } = {};
      if (obImportFile) {
        const dataUrl: string = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(obImportFile); });
        const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (!m) throw new Error("Fichier illisible");
        body.imageMediaType = m[1]; body.imageBase64 = m[2];
      } else body.text = obImportText.trim();
      const res = await fetch("/api/programs/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!data?.ok || !data?.template) { setObImportError(data?.error ?? "On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte."); return; }
      setObImportTemplate(data.template as ProgramTemplate);
      obAdvance();
    } catch {
      setObImportError("On n'a pas réussi à lire ce programme. Réessaie ou colle-le en texte.");
    } finally { setObImportBusy(false); }
  }

  /* Programme à créer en fin d'onboarding : claimé, importé ou généré. null = pas de programme
     (question passée, ou génération en échec : on n'empêche jamais d'entrer). */
  async function obBuildProgram(): Promise<{ template: ProgramTemplate; name: string; sport: string; focus: ProgramFocus } | null> {
    if (hasClaimedProgram && wizardTemplate) return { template: wizardTemplate, name: wizardProgramName, sport: sport || "Autre", focus: "mixte" };
    const label = obSportLabel();
    if (obHas === "import" && obImportTemplate) return { template: obImportTemplate, name: label ? `Mon programme ${label}` : "Mon programme", sport: obChosenSport() || "Programme importé", focus: "mixte" };
    if (obHas !== "generate") return null;
    const focus: ProgramFocus = obGoal ?? "mixte";
    try {
      const days = [...obDays].sort((a, b) => a - b).map(d => WEEK_DAY_LABELS[d]);
      const res = await fetch("/api/programs/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport: obChosenSport() || "Autre", level: "intermediaire", days: days.length ? days : ["Lun", "Mer", "Ven"],
          duration: durationFromDeadline(focus === "competition" ? obDeadline : ""), focus, weaknesses: obWeak,
          ...(obCustom?.status === "generated" ? { customExercises: obCustom.exercises, customWeaknessMeta: obCustom.weaknessMeta, customSessionLabels: obCustom.sessionLabels } : {}),
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (!data?.template) return null;
      return { template: data.template as ProgramTemplate, name: label ? `Programme ${label}` : "Mon programme", sport: obChosenSport() || "Autre", focus };
    } catch { return null; }
  }

  /* Fin de l'onboarding : profil (et sportif démo côté coach), programme enregistré puis assigné
     en démarrant aujourd'hui avec sa semaine 0 d'acclimatation (au sportif lui-même, ou au sportif
     démo du coach), invitations, puis l'app. */
  const finishGuardRef2 = useRef(false);
  async function finishOnboarding(uid: string) {
    if (finishGuardRef2.current) return;
    finishGuardRef2.current = true;
    setObFinishing(true); setObError(null);
    try {
      const built = isFullPath ? await obBuildProgram() : null;
      let demoAthleteId: string | null = null;
      if (!profileCompleteGuardRef.current && isFullPath) {
        profileCompleteGuardRef.current = true;
        demoAthleteId = await completeProfile(uid, { skipDemoProgram: role === "coach" && !!built });
      }
      if (built) {
        const week1 = built.template.weeks[0] ?? {};
        const res = await fetch("/api/programs", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: built.name, sport: built.sport, level: "intermediaire", focus: built.focus,
            weeks_count: built.template.weeks.length,
            sessions_per_week: Object.values(week1).filter(x => (x as unknown[]).length > 0).length,
            template: built.template,
          }),
        });
        const programId: string | undefined = res.ok ? (await res.json()).program?.id : undefined;
        if (programId) {
          savedProgramIdRef.current = programId;
          if (hasClaimedProgram) localStorage.removeItem("claim_program_id");
          const target = role === "coach" ? (demoAthleteId ? { athlete_id: demoAthleteId } : null) : { user_id: uid };
          if (target) {
            const a = await fetch(`/api/programs/${programId}/assign`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...target, start_date: localTodayStr(), acclimatation: true }),
            });
            if (!a.ok) console.error("[finishOnboarding] assign error:", await a.text().catch(() => ""));
            if (!a.ok && role === "coach" && demoAthleteId) {
              await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, demoAthleteId, built.sport, 9, true, "upcoming"));
            }
          }
        } else {
          console.error("[finishOnboarding] program save error");
          if (role === "coach" && demoAthleteId) await assignDemoProgram(demoAthleteId, built.sport);
        }
      }
      if (role === "coach") {
        const rows = obInvites.filter(r => /\S+@\S+\.\S+/.test(r.email.trim()));
        await Promise.all(rows.map(r => fetch("/api/invite/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ athleteEmail: r.email.trim(), athleteName: r.name.trim() || undefined }),
        }).catch(() => null)));
      }
      await enterApp(uid);
    } catch (e) {
      console.error("[finishOnboarding]", e);
      finishGuardRef2.current = false;
      setObFinishing(false);
      setObError("Impossible de préparer ton espace. Réessaie.");
    }
  }

  // Après la création du compte : questions post-signup s'il en reste, sinon fin.
  async function afterAccount(uid: string) {
    const accountIdx = path.indexOf("account");
    if (accountIdx >= 0 && accountIdx < path.length - 1) { setSaving(false); setStepIdx(accountIdx + 1); return; }
    await finishOnboarding(uid);
  }

  /* Récap du programme qu'on va créer (2026-10-05) : reprend les réponses, se met à jour en direct
     sur l'écran Jours et reste affiché pendant la préparation. Une réponse passée est omise. */
  function obRecap(): React.ReactNode {
    const label = obSportLabel();
    const options = obCustom?.status === "generated" ? obCustom.weaknessOptions
      : WEAKNESSES_BY_SPORT[weaknessKeyFor(obSport || (obCustom?.status === "matched" ? findCatalogEntry(obCustom.sportLabel)?.value : ""))] ?? WEAKNESSES_BY_SPORT["Autre"] ?? [];
    const weak = obWeak.map(k => options.find(o => o.key === k)?.label).filter(Boolean).map(l => l!.toLowerCase());
    const n = obDays.length;
    const deadline = obGoal === "competition" && obDeadline ? obDeadline : "";
    const dur = durationFromDeadline(deadline);
    const monday = (new Date(`${localTodayStr()}T12:00:00`).getDay() + 6) % 7 === 0;
    const b = (t: string) => <b style={{ color: "#171b1f" }}>{t}</b>;
    const dateLabel = deadline ? new Date(`${deadline}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
    return (
      <>
        On crée ton programme{label ? <> {b(label)}</> : null}
        {/* Objectif : échéance (avec sa date), volume, intensité ; « un peu de tout » = équilibré. */}
        {obGoal === "competition" ? (deadline ? <> pour préparer {b(`ton échéance du ${dateLabel}`)}</> : <> pour préparer {b("ton échéance")}</>)
          : obGoal === "volume" ? <> pour {b("gagner en volume")}</>
          : obGoal === "intensite" ? <> pour {b("monter en intensité")}</>
          : obGoal === "mixte" ? <> {b("équilibré")}</> : null}
        {weak.length ? <>, focus {b(weak[0])}{weak[1] ? <> et {b(weak[1])}</> : null}</> : null}
        {n ? <>, {b(`${n} jour${n > 1 ? "s" : ""} par semaine`)}</> : null}
        {deadline ? null : <>, sur {b(`${dur} semaines`)}, modifiable ensuite</>}.
        {/* Côté coach, le programme n'est assigné qu'au sportif démo : pas de date de départ à annoncer. */}
        {role === "coach" ? null : monday ? " Il démarre aujourd'hui." : " Il démarre aujourd'hui par une semaine d'acclimatation."}
      </>
    );
  }
  function obRecapCard(title: string) {
    return (
      <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 16, background: "rgba(212,64,0,.06)", border: "1px solid rgba(212,64,0,.22)", fontSize: 14, lineHeight: 1.55, color: "#3d4247", textAlign: "left" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#d44000", marginBottom: 6 }}>{title}</div>
        {obRecap()}
      </div>
    );
  }

  // Écran suivant du parcours post-signup (le parcours peut changer avec la réponse donnée).
  function obAdvance(has?: ObHas) {
    const p = getPath(role, has === undefined ? obHas : has);
    let i = p.indexOf(currentStep);
    if (i < 0) i = p.indexOf("ob_program");
    if (i + 1 < p.length) { setStepIdx(i + 1); return; }
    const uid = userId || newUserId;
    if (uid) finishOnboarding(uid);
  }

  /* Cœur de la sauvegarde réelle (POST /api/programs) — extrait de handleWizardSaveToLibrary
     (2026-09-18) pour être réutilisé aussi par runClaimedProgramAutoSave (déclenchée sans clic,
     wizard_builder sauté pour le trafic claimé — voir doc PROGRAM_ATHLETE_PATH). Ne navigue jamais
     elle-même (pas de next() ici) : chaque appelant décide de la suite. */
  async function saveWizardProgram(name: string, template: ProgramTemplate) {
    const week1 = template.weeks[0] ?? {};
    const sessionsPerWeek = Object.values(week1).filter(sessions => (sessions as unknown[]).length > 0).length;
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, sport: sport || "Autre", level: LEVEL_TO_DB[level], focus: GOAL_TO_FOCUS[goal] ?? "mixte",
        weeks_count: template.weeks.length, sessions_per_week: sessionsPerWeek, template,
      }),
    });
    if (!res.ok) throw new Error("Erreur lors de l'enregistrement du programme.");
    const { program } = await res.json() as { program: { id: string } };
    setWizardProgramId(program.id);
    /* Rattrape profiles.sport (2026-09-04) — completeProfile() l'a déjà écrit à "Autre" au signup
       (sport plus jamais connu à ce stade depuis le retrait de sport_2a), le vrai sport n'existe
       qu'à partir d'ici. Best-effort, ne bloque jamais la suite du wizard si ça échoue. */
    const uid = userId || newUserId;
    if (uid && sport) {
      const { error } = await supabase.from("profiles").update({ sport }).eq("user_id", uid);
      if (error) console.error("[saveWizardProgram] profiles.sport update error:", error);
    }
    if (hasClaimedProgram) localStorage.removeItem("claim_program_id");
  }




  /* Programme démo du sportif démo du coach (onboarding in-app, 2026-10-01) — remplace aussi la
     séance démo sportif (ensureTodayDemoSession, retirée : plus de séance démo côté sportif, le jour
     vide affiche la carte Importer / Séance libre). Génère un programme 4 semaines du sport du coach,
     l'enregistre dans sa bibliothèque et l'assigne au sportif démo en démarrant aujourd'hui. */
  async function assignDemoProgram(athleteId: string, sportValue: string): Promise<boolean> {
    try {
      const days = ["Lun", "Mer", "Ven", "Sam"];
      const gen = await fetch("/api/programs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: sportValue || "Autre", level: "intermediaire", days, duration: 4, focus: "mixte" }),
      });
      if (!gen.ok) return false;
      const { template } = await gen.json();
      const created = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Programme démo", sport: sportValue || null, level: "intermediaire", focus: "mixte", weeks_count: 4, sessions_per_week: days.length, template }),
      });
      if (!created.ok) return false;
      const programId = (await created.json()).program?.id;
      if (!programId) return false;
      const todayIso = new Date().toISOString().split("T")[0];
      const assign = await fetch(`/api/programs/${programId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: athleteId, start_date: todayIso, align_first_session: true }),
      });
      return assign.ok;
    } catch {
      return false;
    }
  }


  /* Fin du parcours (onboarding in-app, 2026-10-01) : compte créé → on entre dans l'app.
     Programme réclamé : enregistré dans la bibliothèque (section "Prêt à démarrer" de Programmes),
     jamais assigné d'office. `onboarding_done` posé ici, plus après paiement (freemium : l'app est
     utilisable sans payer, seules les sorties sont floutées). */
  const enterAppGuardRef = useRef(false);
  async function enterApp(uid: string) {
    if (enterAppGuardRef.current) return;
    enterAppGuardRef.current = true;
    if (hasClaimedProgram && wizardTemplate && !wizardProgramId && !savedProgramIdRef.current) {
      try { await saveWizardProgram(wizardProgramName, wizardTemplate); }
      catch (e) { console.error("[enterApp] claimed program save error:", e); }
    }
    /* Upsert, pas update : un compte peut n'avoir aucune ligne profiles (comptes orphelins dont
       createAccount() a été refusé par alreadyHasRealHistory) — un update ne toucherait rien et le
       middleware renverrait sur /register en boucle. */
    const { error } = await supabase.from("profiles").upsert(
      { user_id: uid, mode: role, onboarding_done: true, ...(name.trim() ? { name: name.trim() } : {}) },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[enterApp] profiles upsert error:", error);
      enterAppGuardRef.current = false;
      setError("Impossible d'ouvrir ton espace. Réessaie.");
      setSaving(false);
      return;
    }
    posthog.capture("onboarding_entered_app", { role });
    window.location.href = role === "coach" ? "/coach" : "/today";
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
        posthog.capture("account_created", { role });
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
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}/auth/callback?type=recovery&first=1`,
        }).catch(() => {});
        await afterAccount(uid);
      } else {
        await createAccount(userId!);
        await afterAccount(userId!);
      }
    } catch {
      setError("Une erreur est survenue. Réessaie.");
      setSaving(false);
    }
  }

  /* Rattrapage après un échec de /api/invite/join en cours de handleFinish() : `path` est ici
     recalculé par le render qui suit setHasCoachInvite(false), pas la closure figée de
     handleFinish(). Ne jamais utiliser next() ici — "account" n'est pas au même index dans
     ATHLETE_PATH/SHORT_ATHLETE_PATH que dans INVITE_ATHLETE_PATH (juste après "value_intro") ;
     c'est la même classe de bug que "atterrissage systématique sur role" déjà rencontrée sur la
     continuation Google OAuth. Repli sur `decisionStepIdFor(role)` (2026-09-04, fusion decision/
     account) : ATHLETE_PATH/COACH_PATH n'ont plus "account" comme step séparé — l'utilisateur
     atterrit directement juste après decision_2a/2b, wizard_picker, exactement l'équivalent de
     l'ancien "juste après account". */
  useEffect(() => {
    if (!inviteJoinFailed) return;
    const accountIdx = path.indexOf("account");
    const uid = userId || newUserId;
    if (uid && accountIdx === path.length - 1) {
      // Compte déjà créé, "account" est la fin du parcours : profil complété puis app.
      (async () => {
        if (!profileCompleteGuardRef.current && isFullPath) {
          profileCompleteGuardRef.current = true;
          await completeProfile(uid);
        }
        await enterApp(uid);
      })();
      return;
    }
    const decisionIdx = path.indexOf(decisionStepIdFor(role));
    setStepIdx(accountIdx >= 0 ? accountIdx + 1 : decisionIdx >= 0 ? decisionIdx + 1 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteJoinFailed]);

  /* Paywall scindé en 2 écrans plein-page (2026-08-31 : rendus directement via PrimingJourneyModal/
     PaywallModal, les mêmes composants que le gating in-app — voir doc du path plus haut). Tracking
     paywall_priming_viewed/paywall_form_viewed et setup-intent Stripe sont désormais internes à ces
     2 composants, plus besoin de les dupliquer ici — seul `billing` reste levé dans ce fichier
     (partagé entre les deux écrans, même pattern que usePaywall.ts). */


  /* Se connecter avec Apple (app iOS uniquement, guideline 4.8) : même atterrissage que Google
     (register?d=... reprend l'onboarding avec les réponses déjà données). */
  async function handleAppleRegister() {
    const pending: PendingData = {
      role, sport, sportPrecision, level, weaknesses, goal, frustration, trainingDays,
      coachingContext, athleteCount, coachingChallenge, currentTool, trainingStyle, name,
    };
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pending)))));
    const res = await nativeAppleSignIn(supabase);
    if (res?.ok) window.location.href = `/register?d=${encoded}`;
    else if (res) setError(res.error);
  }

  async function handleGoogleRegister() {
    const pending: PendingData = {
      role, sport, sportPrecision, level, weaknesses, goal, frustration, trainingDays,
      coachingContext, athleteCount, coachingChallenge, currentTool, trainingStyle, name,
    };
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(pending)))));
    // App iOS : SDK Google natif, puis même atterrissage que /auth/callback (register?d=...).
    if (isNativeApp()) {
      const res = await nativeGoogleSignIn(supabase);
      if (res?.ok) window.location.href = `/register?d=${encoded}`;
      else if (res) setError(res.error);
      return;
    }
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
        posthog.capture("account_created", { role: pendingData.role, method: "google" });
        fetch("/api/brevo/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail, name: finalName, role: pendingData.role, status: "free" }),
        });
        await fetch("/api/invite/link", { method: "POST" });

        /* Bug trouvé le 2026-09-14 (cas réel : va.cluzeau56@gmail.com invité par Jérémie Thiébaud
           via /join/[code], signup Google) : ce bloc vit dans un effet à deps:[] dont la closure
           `init()` est figée au tout premier render — `hasCoachInvite` y valait encore `null` (sa
           valeur initiale), même si l'effet séparé qui lit localStorage l'a mis à jour juste après
           dans le même render. Condition sur `hasCoachInvite` (state réactif) remplacée par une
           lecture directe de `storedCode` (localStorage, source de vérité stable) — même principe
           déjà appliqué ailleurs dans ce fichier pour ce type de bug (closure figée sur un state
           dérivé asynchrone). Un Google signup après un lien coach invalide/expiré ne posait donc
           jamais `onboarding_done`/`invited_by_coach_id` via /api/invite/join, et l'utilisateur
           traversait tout le wizard payant au lieu du raccourci gratuit INVITE_ATHLETE_PATH. */
        const storedCode = coachInviteCode ?? (typeof window !== "undefined" ? localStorage.getItem("coach_invite_code") : null);
        if (pendingData.role === "athlete" && storedCode) {
          let joinedCoach = false;
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
    if (userId && path.indexOf("account") === path.length - 1) {
      // "account" est la fin du parcours : profil complété puis entrée directe dans l'app.
      finishOnboarding(userId);
      return;
    }
    // Sinon les questions post-signup suivent : profil complété à la fin (finishOnboarding).
    /* next() suppose un stepIdx figé à 0 et avance d'une seule position — ça atterrissait
       systématiquement sur "role" (juste après value_intro) depuis que "account" a été
       repositionné plus tôt dans le path (variantes A/B, voir refonte onboarding v2). On saute
       directement juste après "account" dans le path résolu, quelle que soit sa position réelle —
       ou, depuis la fusion decision/account (2026-09-04), juste après decision_2a/2b quand
       "account" n'existe plus comme step séparé (ATHLETE_PATH/COACH_PATH/PROGRAM_*_PATH). */
    const accountIdx = path.indexOf("account");
    const decisionIdx = path.indexOf(decisionStepIdFor(role));
    setStepIdx(accountIdx >= 0 ? accountIdx + 1 : decisionIdx >= 0 ? decisionIdx + 1 : path.length - 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleInitDone]);

  /* Reprise post-email (voir doc de `resumeRole` plus haut) — mount effect : applique le rôle déjà
     connu (profiles.mode), un effet séparé (ci-dessous) capture un `path` à jour pour le jump —
     même raison que pour Google (closure figée sinon). */
  useEffect(() => {
    if (!resumeRole || !userId) return;
    setRole(resumeRole);
    setRoleChosen(true);
    setResumeRoleApplied(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!resumeRoleApplied || !userId) return;
    if (path.indexOf("account") === path.length - 1) {
      // Compte déjà créé qui reprend sans question à poser : directement dans l'app.
      finishOnboarding(userId);
      return;
    }
    /* Même repli que googleInitDone ci-dessus (fusion decision/account, 2026-09-04) — juste après
       decision_2a/2b quand "account" n'est plus un step séparé du path résolu. */
    const accountIdx = path.indexOf("account");
    const decisionIdx = path.indexOf(decisionStepIdFor(role));
    setStepIdx(accountIdx >= 0 ? accountIdx + 1 : decisionIdx >= 0 ? decisionIdx + 1 : path.length - 1);
    setResuming(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeRoleApplied]);

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)",
    borderRadius: 12, padding: "12px 14px", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12,
  };

  /* Formulaire de compte — reste une fonction (héritage du chantier fusion decision/account du
     2026-09-04, finalement abandonné le même jour — "finalement il vaut mieux avoir l'étape propre
     'aha' avant le signup... pour avoir de l'impact et de l'espace" — voir doc des paths en tête de
     fichier pour l'historique complet des 4 itérations) plutôt que redevenir un bloc JSX inline :
     ça ne change rien fonctionnellement (un seul appelant désormais, le step "account" standalone
     ci-dessous), mais réextraire manuellement n'aurait apporté aucun bénéfice. L'option `embedded`
     (footer confiné à une colonne de split) a été retirée avec elle — plus aucun appelant ne la
     demande. */
  function renderAccountForm(opts?: { onBack?: () => void; showBack?: boolean }) {
    const doBack = opts?.onBack ?? goBack;
    const showBack = opts?.showBack ?? canGoBack;
    /* Repositionné le 2026-08-19 (voir doc des paths en tête de fichier) : arrive désormais
       après decision_2a/2b (l'AHA vécu), plus juste après le rôle — le signup demande de
       sauvegarder ce qui vient d'être construit et décidé, pas de s'inscrire à froid pour
       débloquer un "bilan" pas encore construit (aucun A/B formel sur la position du signup —
       tranché sans test, voir la doc des paths).

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
       tout le reste du flow).

       Titre "Connecter" plutôt que "S'inscrire" (2026-09-02, retour à l'architecture POC,
       benchmark pages de connexion device-pairing) : l'inscription devient une formalité sur
       la next step, pas ce qu'on demande explicitement.

       Refonte 2026-09-05 (retour explicite de Gildas, POC signup v3 remis à plat) : le sous-titre
       de positionnement identitaire ("Le programme de ceux qui...") est remplacé par un titre
       générique unique ("Connecte tes séances à ThePerfClub", même libellé pour les 2 rôles).
       Une mini frise 1-2-3 (objectif : ressentir ce step comme un pairing d'appareil plutôt qu'un
       formulaire froid) a été essayée puis retirée le même jour — Gildas a jugé que `decision_2a/2b`
       juste avant montre déjà 3 temps forts (score de forme/ajuste tes séances/recommandations),
       une 2e frise juste après aurait fait doublon et surchargé un écran déjà dense (réassurance +
       Google + formulaire). Le titre reste seul, sans sous-titre ni frise.

       CTA à nouveau scindé en 2 contrôles distincts (retour sur le "CTA sticky unique adaptatif"
       du 2026-09-04) : bouton Google statique DANS la carte, au-dessus du séparateur "ou avec
       email" — toujours visible, jamais dépendant de la saisie (le POC place Google en clair,
       jugé plus lisible qu'un bouton qui change de forme selon ce qu'on tape). Le CTA sticky du
       bas ne sert plus qu'à l'email (`handleFinish`), désactivé tant que Prénom OU Email est
       vide — même garde qu'avant le 09-04. */
    const emailValid = name.trim().length > 0 && email.trim().length > 0;

    const content = (
      <>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 27, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 28, lineHeight: "normal", textAlign: "center" }}>
          {(() => {
            // Programme claimé : le sport est connu (fetch du claim), on le nomme. Sinon titre générique.
            const comp = hasClaimedProgram ? sessionsComplement(sport) : null;
            const of = comp ? ` ${comp}` : "";
            return role === "coach" ? `Connecte les séances${of} de tes sportifs à ThePerfClub` : `Connecte tes séances${of} à ThePerfClub`;
          })()}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "14px 16px", background: "#fff7f2", border: "1px solid rgba(212,64,0,.14)", borderRadius: 16 }}>
          <div style={{ display: "flex" }}>
            {PAYWALL_AVATARS.slice(0, 3).map((src, i) => (
              <div key={i} style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #fff7f2", marginLeft: i > 0 ? -10 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ))}
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #fff7f2", marginLeft: -10, background: "#1f2428", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0, position: "relative", zIndex: 1 }}>+</div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#1f2428", lineHeight: 1.2 }}>+600 sportifs, coachs et clubs</div>
            <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#f28a00", letterSpacing: 1 }}>★★★★★</span>
              <span>font confiance à ThePerfClub</span>
            </div>
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

        <div style={{ background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 2px 16px rgba(0,0,0,.06)" }}>
          {nativeShell && (
            <button
              type="button"
              onClick={() => { if (!saving) handleAppleRegister(); }}
              disabled={saving}
              style={{
                width: "100%", height: 48, borderRadius: 16, border: "none", background: "#000",
                color: "#fff", fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center",
                gap: 10, marginBottom: 10,
              }}
            >
              <svg width="16" height="18" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
                <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-157 124s-87-40-166-40c-77 0-104 41-167 41s-107-57-157-127C42 790 0 677 0 569c0-173 112-265 223-265 59 0 108 39 145 39 35 0 90-41 157-41 25 0 117 2 177 89zM554 159c28-33 48-79 48-125 0-6-1-13-2-18-45 2-99 30-131 68-25 29-49 75-49 122 0 7 1 14 2 16 3 1 8 1 12 1 41 0 92-27 120-64z"/>
              </svg>
              Continuer avec Apple
            </button>
          )}

          <button
            type="button"
            onClick={() => { if (!saving) handleGoogleRegister(); }}
            disabled={saving}
            style={{
              width: "100%", height: 48, borderRadius: 16, border: "none", background: "#171b1f",
              color: "#fff", fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, marginBottom: 18,
            }}
          >
            <GoogleIcon />
            Continuer avec Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
            <span style={{ fontSize: 11, color: "#8a8f94" }}>ou avec email</span>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.08)" }} />
          </div>

          <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Prénom</div>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ex : Alex" style={inputStyle} />
          <div style={{ fontSize: 11, color: "#62686e", fontWeight: 700, marginBottom: 6 }}>Email</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" style={{ ...inputStyle, marginBottom: 0 }} />
        </div>
      </>
    );

    const ctaButtons = (
      <>
        {showBack && (
          <button
            onClick={doBack} aria-label="Retour"
            style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, cursor: "pointer", fontSize: 17, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#171b1f" }}
          >←</button>
        )}
        <button
          type="button"
          onClick={() => { if (!saving && emailValid) handleFinish(); }}
          disabled={saving || !emailValid}
          style={{
            flex: 1, height: 52, borderRadius: 16, border: "none",
            background: "linear-gradient(180deg,#f04a08,#d44000)",
            color: "#fff", fontSize: 15, fontWeight: 900, cursor: (saving || !emailValid) ? "default" : "pointer",
            opacity: (saving || !emailValid) ? 0.5 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: (saving || !emailValid) ? "none" : "0 8px 20px rgba(212,64,0,.26)",
          }}
        >
          {saving
            ? "Création…"
            : role === "coach"
            ? "Activer mon espace coach →"
            : "Activer mon espace →"}
        </button>
      </>
    );

    return (
      <div>
        {content}
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: "14px 20px 24px", background: "#f1f0ee" }}>
          <div style={{ maxWidth: colMaxWidth, margin: "0 auto", display: "flex", gap: 10 }}>{ctaButtons}</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94", marginTop: 14, lineHeight: 1.6 }}>
          Déjà un compte ?{" "}<Link href="/login" style={{ color: "#d44000", fontWeight: 700, textDecoration: "none" }}>Se connecter</Link>
        </div>
      </div>
    );
  }


  /* Source de l'AHA (2026-09-04, expérimentation "rôle fusionné dans value_intro, sport_2a retiré,
     AHA générique" — voir doc des paths en tête de fichier) : `sport` reste "" tout le long du
     pré-signup désormais (plus de sport_2a avant decision), donc getSessionTemplates("") retombe
     systématiquement sur sa banque générique par défaut (mouvements universels squats/pompes/
     gainage, wording de DecisionStep explicite sur le "marche pour tous les sports") — plus un
     calcul sport-aware comme avant le 2026-09-04, mais toujours le même calcul synchrone, aucun
     appel réseau, aucun état de chargement. Le vrai sport n'est demandé qu'au wizard post-signup
     (wizard_criteria), qui construit le vrai programme. */
  const sessionTuples = getSessionTemplates(sport);
  function tupleToTemplate([name, notes, diff]: [string, string, number]): SessionTemplate {
    return { name, notes, target_difficulty: diff, load: 2, type: "volume" };
  }
  const demoHardest = tupleToTemplate(sessionTuples[0]);
  const demoLightest = tupleToTemplate(sessionTuples[1]);
  const demoMiddle = tupleToTemplate(sessionTuples[3]);

  if (!flowReady) {
    return <OnboardingBackground variant="dark"><div style={{ minHeight: 280 }} /></OnboardingBackground>;
  }

  if (initializing) {
    return (
      <OnboardingBackground variant="dark">
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Création de ton espace…</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
        </div>
      </OnboardingBackground>
    );
  }

  if (resuming) {
    return (
      <OnboardingBackground variant="dark">
        <div style={{ textAlign: "center", color: "#fff" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Reprise de ton inscription…</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
        </div>
      </OnboardingBackground>
    );
  }

  /* ───────── Questions post-signup (2026-10-05) ───────── */
  if (obFinishing) {
    return (
      <OnboardingBackground variant="light" center>
        <div style={{ textAlign: "center", color: "#171b1f" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {obHas === "later" && !hasClaimedProgram ? "Ouverture de ton espace…" : "Préparation de ton programme…"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
          {obHas === "generate" && !hasClaimedProgram && <div style={{ maxWidth: 420, margin: "0 auto" }}>{obRecapCard("Ton programme")}</div>}
        </div>
      </OnboardingBackground>
    );
  }
  if (currentStep.startsWith("ob_")) {
    const coach = role === "coach";
    const post = path.slice(path.indexOf("account") + 1);
    const idx = Math.max(0, post.indexOf(currentStep));
    const matched = obCustom?.status === "matched" ? findCatalogEntry(obCustom.sportLabel) : null;
    const back = idx > 0 ? () => setStepIdx(path.indexOf(post[idx - 1])) : undefined;
    // Bandeau photo : le sport choisi (ou reconnu), sinon le programme claimé, sinon l'image par défaut.
    const cover = sportCover(obSport || matched?.value) ?? claimedCover ?? DEFAULT_ONBOARDING_COVER;
    const common = { index: idx, total: post.length, cover, onBack: back };
    const errorLine = obError ? <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 12 }}>{obError}</p> : null;

    if (currentStep === "ob_sport") {
      const analyzed = obCustom && obCustom.status !== "failed";
      return (
        <QuestionShell {...common}
          title={coach ? "Quel sport pour ton programme ?" : "Quel est ton sport ?"}
          sub={coach ? "On personnalise ton programme selon le sport, les points forts et les faiblesses de tes sportifs." : "On personnalise tes séances selon ton sport, tes points forts et tes faiblesses."}
          onSkip={() => { setObSport(""); setObCustom(null); obAdvance(); }}
          cta={obCustom ? { label: "Continuer →", onClick: () => obAdvance(), busy: obAnalyzing } : undefined}>
          <SportStepBody
            value={obSport}
            customLabel={analyzed ? obCustom.sportLabel : null}
            analyzing={obAnalyzing}
            analysisFailed={obCustom?.status === "failed"}
            onSelect={v => { setObSport(v); setObCustom(null); setObWeak([]); obAdvance(); }}
            onAnalyze={t => { obAnalyzeSport(t); }}
          />
        </QuestionShell>
      );
    }
    if (currentStep === "ob_program") {
      return (
        <QuestionShell {...common}
          title="Tu as déjà un programme ?"
          onSkip={() => { setObHas("later"); obAdvance("later"); }}>
          <OptionCard icon="📷" label="Oui, je l'importe" hint="Une photo ou le texte suffit"
            on={obHas === "import"} onClick={() => { setObHas("import"); obAdvance("import"); }} />
          <OptionCard icon="✨" label="Non, crée-le moi" hint="Sur mesure, en 3 questions"
            on={obHas === "generate"} onClick={() => { setObHas("generate"); obAdvance("generate"); }} />
          {errorLine}
        </QuestionShell>
      );
    }
    if (currentStep === "ob_import") {
      return (
        <QuestionShell {...common}
          title="Importe ton programme"
          sub="Colle le texte, ou prends-le en photo."
          onSkip={() => { setObHas("later"); obAdvance("later"); }}
          cta={{ label: "Importer →", onClick: obRunImport, disabled: !obImportText.trim() && !obImportFile, busy: obImportBusy }}>
          <ImportStepBody text={obImportText} onText={setObImportText} file={obImportFile} onFile={setObImportFile} error={obImportError} />
        </QuestionShell>
      );
    }
    if (currentStep === "ob_goal") {
      const comp = obGoal === "competition";
      return (
        <QuestionShell {...common}
          title={coach ? "L'objectif de ton programme ?" : "Ton objectif pour les prochaines semaines ?"}
          onSkip={() => { setObGoal(null); obAdvance(); }}
          cta={comp ? { label: "Continuer →", onClick: () => obAdvance(), disabled: !obDeadline } : undefined}>
          {GOAL_OPTIONS.map(g => (
            <div key={g.value}>
              <OptionCard icon={g.icon} label={g.label} hint={g.hint} on={obGoal === g.value}
                onClick={() => { setObGoal(g.value); if (g.value !== "competition") obAdvance(); }} />
              {g.value === "competition" && comp && <DeadlineField value={obDeadline} onChange={setObDeadline} />}
            </div>
          ))}
        </QuestionShell>
      );
    }
    if (currentStep === "ob_weak") {
      const options = obCustom?.status === "generated" ? obCustom.weaknessOptions
        : WEAKNESSES_BY_SPORT[weaknessKeyFor(obSport || matched?.value)] ?? WEAKNESSES_BY_SPORT["Autre"] ?? [];
      return (
        <QuestionShell {...common}
          title={coach ? "Les points à travailler en priorité dans ton programme ?" : "Tes points à travailler en priorité ?"}
          sub="2 maximum, on personnalise ton programme selon tes réponses."
          onSkip={() => { setObWeak([]); obAdvance(); }}
          cta={{ label: "Continuer →", onClick: () => obAdvance() }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {options.map(w => {
              const on = obWeak.includes(w.key);
              return <ChoiceChip key={w.key} on={on} onClick={() => setObWeak(prev => on ? prev.filter(k => k !== w.key) : prev.length >= 2 ? prev : [...prev, w.key])}>{w.label}</ChoiceChip>;
            })}
          </div>
        </QuestionShell>
      );
    }
    if (currentStep === "ob_days") {
      return (
        <QuestionShell {...common}
          title={coach ? "Quels jours d'entraînement dans ton programme ?" : "Quels jours tu t'entraînes ?"}
          sub={"Plusieurs choix possibles." + (obGoal === "competition" && obDeadline ? " La durée se cale sur ton échéance." : "")}
          onSkip={() => obAdvance()}
          cta={{ label: "Créer mon programme →", onClick: () => obAdvance(), disabled: !obDays.length }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {WEEK_DAY_LABELS.map((d, k) => {
              const on = obDays.includes(k);
              return <ChoiceChip key={d} on={on} onClick={() => setObDays(prev => on ? prev.filter(x => x !== k) : [...prev, k])}>{d}</ChoiceChip>;
            })}
          </div>
          {obDays.length > 0 && obRecapCard("Ton programme")}
          {errorLine}
        </QuestionShell>
      );
    }
    if (currentStep === "ob_invite") {
      const hasEmail = obInvites.some(r => r.email.trim());
      return (
        <QuestionShell {...common}
          title="Invite tes sportifs"
          sub="Tu peux leur créer des séances avant même qu'ils arrivent."
          onSkip={() => { setObInvites([{ name: "", email: "" }]); obAdvance(); }}
          cta={{ label: hasEmail ? "Envoyer les invitations →" : "Continuer →", onClick: () => obAdvance() }}>
          <InviteForm inviteCode={obInviteCode} invites={obInvites} setInvites={setObInvites} error={obError} />
        </QuestionShell>
      );
    }
  }

  const isDarkStep = DARK_STEPS.includes(currentStep);

  return (
    <OnboardingBackground variant={isDarkStep ? "dark" : "light"}>
      <div>

        <div key={currentStep} style={{ animation: "stepIn 0.22s ease" }}>
        {/* ── VALUE INTRO — rôle fusionné dedans (2026-09-04, expérimentation "value+rôle → AHA
            générique → signup", voir doc des paths en tête de fichier) : plus de step "role" séparé
            juste après, les 2 cartes de rôle sont désormais le CTA de cet écran lui-même — même
            mécanique de choix qu'avant (jamais présélectionné, clic = avance direct avec la
            transition "reconduction" avant decision), juste fusionnée avec le pitch de valeur au
            lieu d'un clic supplémentaire pour l'atteindre. Repli sur un CTA unique (pas de cartes)
            quand le rôle est déjà connu à l'arrivée (`?role=`/programme claimé, ou reprise Google) —
            redemander un choix déjà fait ailleurs serait une friction gratuite. Photo en fond plein
            viewport (POC v62) inchangée. */}
        {currentStep === "value_intro" && (() => {
          const isClaimed = !!(hasClaimedProgram && claimedProgramName);
          const roleKnownUpfront = !!(pendingData?.role || initialRole);

          const headline = claimedAthleteName
            ? <>Ton sportif <em>{claimedAthleteName}</em> t&apos;attend.</>
            : coachInviteName
            ? <>Ton coach <em>{coachInviteName}</em> t&apos;attend.</>
            : isClaimed
            ? <>Ton programme <em>{claimedProgramName}</em> est prêt à être personnalisé.</>
            : "Un programme qui s'adapte enfin à toi, pas l'inverse.";

          const subhead = "Sommeil, stress, courbatures — ta forme du jour ajuste la charge de tes séances. Le plan, lui, ne bouge pas.";

          function chooseRole(r: Role) {
            if (advancingRef.current) return;
            advancingRef.current = true;
            setRole(r); setRoleChosen(true); posthog.setPersonProperties({ role: r });
            setTimeout(() => advanceMaybeReconduction(), 300);
          }

          const roleCards = [
            { r: "athlete" as Role, icon: "🏃", label: "Pour moi",         sub: "Un programme qui s'ajuste à ta forme du jour.", badgeBg: "linear-gradient(145deg, #fff0e8, #ffe0d0)" },
            { r: "coach"   as Role, icon: "🧑‍🏫", label: "Pour mes sportifs", sub: "Fais progresser toute ton équipe sans t'épuiser à tout replanifier.", badgeBg: "linear-gradient(145deg, #eef1ff, #dde3ff)" },
          ];

          return (
            <div>
              {/* Fond photo plein viewport, cadré haut (comme le POC : background-position center top)
                  pour garder la tête du sportif visible plutôt que le centre géométrique de la photo.
                  "Signal du jour" (2026-09-03, 3e passe) déplacée à DROITE et sous le voile dégradé
                  (entre l'img et l'overlay, pas au-dessus) — demande explicite de Gildas : "sous
                  l'overlay de l'image". Toujours en flux propre à ce calque `position:fixed, inset:0`
                  (donc `position:absolute` ici, pas `fixed` — plus besoin de son propre `position:
                  fixed`, elle hérite déjà du calque photo qui couvre tout le viewport), donc aucun
                  impact sur la hauteur du reste de l'écran (voir doc de SignalDuJourCard plus haut :
                  la raison d'être du passage en position hors-flux). Même colonne que le footer
                  "Comment vas-tu l'utiliser ?" (padding 20 + maxWidth:colMaxWidth) mais poussée à
                  droite via `justifyContent:"flex-end"` au lieu du texte, aligné à gauche, juste en
                  dessous — outer wrapper en `pointerEvents:"none"` (bande décorative, purement
                  illustrative). */}
              <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
                {/* next/image (2026-09-17) — remplace l'<img> brut qui servait l'original
                    3550x4438px tel quel : next/image redimensionne/reconvertit (WebP/AVIF)
                    automatiquement pour la taille d'écran réelle, `priority` préserve le
                    comportement `fetchPriority="high"`/`loading="eager"` d'origine (élément LCP
                    de cet écran, le 1er de l'onboarding). */}
                <Image
                  src={claimedCover ?? DEFAULT_ONBOARDING_COVER}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  style={{ objectFit: "cover", objectPosition: claimedCover ? "center" : "center 35%" }}
                />
                <div style={{ position: "absolute", left: 0, right: 0, top: colIsMd ? 72 : 56, padding: "0 20px", display: "flex", pointerEvents: "none" }}>
                  <div style={{ maxWidth: colMaxWidth, margin: "0 auto", width: "100%", display: "flex", justifyContent: "flex-end" }}>
                    <SignalDuJourCard isMd={colIsMd} />
                  </div>
                </div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,10,10,.6) 0%, rgba(10,10,10,.75) 40%, rgba(8,8,8,.95) 85%)" }} />
              </div>

              {/* Justifié à gauche + titre descendu (2026-09-03, demande explicite de Gildas, capture
                  de référence à l'appui) — `minHeight` monté 62vh→70vh pour que le bloc de texte,
                  ancré en bas de ce conteneur (`justifyContent:"flex-end"`), descende d'autant.
                  Alignement corrigé (3e passe, même jour — capture à l'appui montrant un vrai écart
                  entre ce bloc et le footer "Comment vas-tu l'utiliser ?", pas juste un problème de
                  cache) : la VRAIE cause n'était pas la formule de centrage elle-même mais l'endroit
                  où elle s'appliquait — ce bloc reste dans le flux normal, DANS la colonne déjà
                  centrée/paddée par `OnboardingBackground.tsx` (maxWidth 560/640/720 + padding
                  "36px 20px 120px", centrée via flex `justifyContent:center`), alors que le footer
                  juste en dessous y échappe entièrement via `position:fixed` et recalcule sa propre
                  colonne directement depuis la largeur du viewport. Deux bases de calcul différentes
                  = deux résultats différents, quelle que soit la formule utilisée à l'intérieur.
                  Fix : ce bloc échappe maintenant lui aussi à la colonne d'OnboardingBackground (même
                  technique "100vw + marges négatives" déjà utilisée ailleurs dans l'onboarding pour
                  sortir d'un parent paddé, ex. DecisionStep.tsx), puis applique EXACTEMENT la même
                  colonne que le footer (padding 20px + `maxWidth:colMaxWidth, margin:"0 auto"`) —
                  les deux blocs partent désormais de la même base (le viewport), garantissant un
                  alignement identique à toute largeur d'écran plutôt que deux formules qui ne
                  pouvaient que coïncider par hasard. */}
              <div style={{
                width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw", boxSizing: "border-box",
                zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: "70vh", paddingBottom: roleKnownUpfront ? 110 : 100, paddingLeft: 20, paddingRight: 20,
              }}>
                <div style={{ maxWidth: colMaxWidth, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 10 }}>ThePerfClub</div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.08, marginBottom: 14, color: "#fff" }}>{headline}</div>
                  <div style={{ fontSize: 15.5, color: "rgba(255,255,255,.62)", lineHeight: 1.55, maxWidth: 440, marginBottom: 8 }}>{subhead}</div>
                </div>
              </div>

              {roleKnownUpfront ? (
                <Actions
                  variant="dark"
                  onNext={() => {
                    if (advancingRef.current) return;
                    advancingRef.current = true;
                    setRoleChosen(true);
                    posthog.setPersonProperties({ role });
                    advanceMaybeReconduction();
                  }}
                  nextLabel={isClaimed ? "Voir mon programme personnalisé →" : "Commencer →"}
                />
              ) : (
                <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: "14px 20px 24px" }}>
                  <div style={{ maxWidth: colMaxWidth, margin: "0 auto" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.75)", marginBottom: 10 }}>
                      Comment vas-tu l&apos;utiliser ?
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {roleCards.map(({ r, icon, label, sub, badgeBg }) => {
                        const picked = roleChosen && role === r;
                        return (
                          <div key={r} onClick={() => chooseRole(r)}
                            style={{
                              cursor: "pointer", display: "flex", alignItems: "center", gap: 16, borderRadius: 16, padding: "16px 18px",
                              border: picked ? "2px solid #d44000" : "1.5px solid rgba(255,255,255,.16)",
                              background: picked ? "rgba(212,64,0,.16)" : "rgba(255,255,255,.08)",
                              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                              transition: "all .15s",
                            }}>
                            <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 16, background: badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: picked ? "#ff8a55" : "#fff", marginBottom: 2 }}>{label}</div>
                              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.35 }}>{sub}</div>
                            </div>
                            <div style={{ flexShrink: 0, color: "rgba(255,255,255,.35)", fontSize: 18 }}>→</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 3. ACCOUNT ── */}
        {currentStep === "account" && (emailSent ? <EmailSentScreen email={email} /> : renderAccountForm())}

        {/* ── DÉCISION — step propre à part entière (2026-09-04, retour final après 3 itérations la
             même journée — voir doc des paths en tête de fichier pour l'historique complet : fusion
             en toggle, puis split avec le carrousel, puis split avec un bloc statique, PUIS "il vaut
             mieux avoir l'étape propre 'aha' avant le signup... pour avoir de l'impact et de
             l'espace"). Accordéon+illustration (voir DecisionStep.tsx) — plein écran, son propre
             `onNext`/`onBack`, plus aucun lien avec le formulaire de compte. ── */}
        {currentStep === "decision_2a" && (
          <DecisionStep demoHardest={demoHardest} demoLightest={demoLightest} demoMiddle={demoMiddle} sport={sport} role={role} athleteName={name} onNext={next} onBack={canGoBack ? goBack : undefined} />
        )}

        {/* Même step propre que decision_2a ci-dessus, voir sa doc. */}
        {currentStep === "decision_2b" && (
          <DecisionStep demoHardest={demoHardest} demoLightest={demoLightest} demoMiddle={demoMiddle} sport={sport} role={role} onNext={next} onBack={canGoBack ? goBack : undefined} />
        )}


        </div>
      </div>
    </OnboardingBackground>
  );
}
