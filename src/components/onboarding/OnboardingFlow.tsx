"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { SPORT_CATEGORIES, guessSportChip } from "@/lib/sportCategories";
import { buildCoachDemoSessions } from "@/lib/coachDemoSessions";
import { computeAutoregSuggestion } from "@/lib/autoregulation";
import { computeWellnessBaselineAt, wellnessSignal } from "@/lib/wellnessBaseline";
import type { ProgramTemplate, ProgramFocus, SessionTemplate, CoachAthlete } from "@/types";
import Link from "next/link";
import OnboardingBackground from "@/components/onboarding/OnboardingBackground";
import DecisionStep from "@/components/onboarding/DecisionStep";
import PaywallModal, { PAYWALL_AVATARS, type Billing } from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import Actions from "@/components/onboarding/Actions";
import WellnessRing from "@/components/wellness/WellnessRing";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { subscribeToPush, needsInstallForPush } from "@/lib/push";
import { wellnessColor } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import ProgramCreatePicker from "@/components/programs/ProgramCreatePicker";
import ProgramCriteriaModal from "@/components/programs/ProgramCriteriaModal";
import ProgramLibraryBrowser from "@/components/programs/ProgramLibraryBrowser";
import ProgramBuilderModal from "@/components/programs/ProgramBuilderModal";
import ProgramAssignModal from "@/components/programs/ProgramAssignModal";
import InviteModal from "@/components/coach/InviteModal";
import WellnessModal from "@/components/wellness/WellnessModal";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";
type StepId =
  | "value_intro"
  | "decision_2a" | "decision_2b"
  | "account"
  | "wizard_picker" | "wizard_library" | "wizard_criteria" | "wizard_builder" | "wizard_activate" | "wizard_assign"
  | "paywall_priming" | "paywall_form";

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
   paywall_priming/paywall_form restent skippables (`skipPaywall()`, inchangé), juste repositionnés
   après le wizard — `onboarding_done` reste posé à l'activation (`finishWizard()`, en fin de
   wizard_assign), jamais gaté par ce paywall (modèle produit-gated du 2026-08-19/20 inchangé).
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
const ATHLETE_PATH: StepId[] = [
  "value_intro",
  "decision_2a",
  "account",
  "wizard_picker",
  "wizard_library",
  "wizard_criteria",
  "wizard_builder",
  "wizard_activate",
  "wizard_assign",
  "paywall_priming",
  "paywall_form",
];
const COACH_PATH: StepId[] = [
  "value_intro",
  "decision_2b",
  "account",
  "wizard_picker",
  "wizard_library",
  "wizard_criteria",
  "wizard_builder",
  "wizard_activate",
  "wizard_assign",
  "paywall_priming",
  "paywall_form",
];

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

/* Habillage du wizard post-signup (2026-09-03, retour à l'architecture POC — correction explicite
   de Gildas : les vrais composants (ProgramCreatePicker/ProgramCriteriaModal/ProgramBuilderModal/
   InviteModal/WellnessModal/ProgramAssignModal) restent inchangés dans leur logique, mais chacun
   gagne un prop optionnel `wizardHero` (React.ReactNode) rendu au-dessus de leur propre en-tête —
   c'est ce bloc-ci. 2 variantes, fidèles au POC : `dark` (plein-bleed #141414, POC's
   `constructeur-hero`, utilisé sur Picker/Critères/Constructeur — "Étape 1/3, Programme") vs
   `light` (simple eyebrow+titre+sous-titre, POC's `.hdr`, utilisé sur Activer/Assigner). */
function WizardHero({ step, dark, eyebrow, title, sub }: { step: 1 | 2 | 3; dark: boolean; eyebrow: string; title: string; sub: string }) {
  const dotInactive = dark ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.10)";
  return (
    <div style={{ padding: dark ? "22px 28px 24px" : "26px 28px 6px", background: dark ? "#141414" : "transparent" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i <= step ? "#d44000" : dotInactive }} />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: dark ? "rgba(255,255,255,.4)" : "#d44000", marginBottom: 9 }}>
        {eyebrow}
      </div>
      <div style={{ fontSize: dark ? 26 : 18, fontWeight: 950, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 8, color: dark ? "#fff" : "#171b1f" }}>
        {title}
      </div>
      <div style={{ fontSize: 15, color: dark ? "rgba(255,255,255,.6)" : "#8a8f94", lineHeight: 1.5 }}>
        {sub}
      </div>
    </div>
  );
}

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
      border: "1.5px solid rgba(255,255,255,.28)", borderRadius: isMd ? 18 : 14, padding: isMd ? "14px 16px" : "10px 12px",
      maxWidth: isMd ? 270 : 208, boxShadow: "0 10px 28px rgba(0,0,0,.4)",
    }}>
      <div style={{ fontSize: isMd ? 10 : 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8a70", marginBottom: isMd ? 10 : 7 }}>
        Signal du jour
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: isMd ? 12 : 9, marginBottom: isMd ? 12 : 9 }}>
        <div style={{ position: "relative", width: ringSize, height: ringSize, flexShrink: 0 }}>
          <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={sw} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke={ringColor} strokeWidth={sw} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: isMd ? 15 : 12, fontWeight: 1000, color: "#fff" }}>{score}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: isMd ? 15 : 13, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>Fatigué</div>
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
      <div style={{ fontSize: isMd ? 9.5 : 8.5, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 5 }}>
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
   du programme claimé, role suit directement. Le contenu réel du programme claimé n'est montré
   qu'après signup, dans wizard_builder (pré-rempli avec le template claimé, fetch existant
   `GET /api/programs/[id]`) — wizard_picker/wizard_criteria sont sautés eux aussi, wizard_builder
   garde un `onBack` vers wizard_picker pour l'utilisateur claimed qui préfère finalement importer/
   générer son propre programme plutôt que garder le claim (échappatoire non prévue par le POC mais
   qui évite de perdre une fonctionnalité réelle sans bonne raison). */
const PROGRAM_ATHLETE_PATH: StepId[] = [
  "value_intro",
  "decision_2a",
  "account",
  "wizard_builder", "wizard_activate", "wizard_assign",
  "paywall_priming", "paywall_form",
];
const PROGRAM_COACH_PATH: StepId[] = [
  "value_intro",
  "decision_2b",
  "account",
  "wizard_builder", "wizard_activate", "wizard_assign",
  "paywall_priming", "paywall_form",
];

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
/* Wizard post-signup (2026-09-02) — même valeur que ProgramLibraryPage.tsx/ProgramCriteriaModal.tsx
   (BLANK_PROGRAM_DAYS), pas partagée entre les fichiers (même choix déjà fait pour
   SPORTS/WEAKNESSES_BY_SPORT avant ce chantier). */
const WIZARD_BLANK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// Mêmes 9 sports, mêmes labels/icônes que ProgramCriteriaModal.tsx (in-app) — garantit le même
// routage getSportCategory(). Remplace l'ancien bucket générique "Force & puissance" qui matchait
// toujours le mot-clé power/force, impossible d'atteindre le curriculum haltérophilie/musculation
// depuis l'onboarding (même bug déjà corrigé côté in-app le 2026-08-05).
// SPORT_CATEGORIES/guessSportChip extraits dans src/lib/sportCategories.ts (2026-09-04) — partagés
// avec ProgramLibraryBrowser.tsx (filtres de la bibliothèque publique native), voir sa doc.

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

/* ── main ── */
export default function OnboardingFlow({ userId, pendingData, initialRole, resumeRole }: Props) {
  const router   = useRouter();
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

  /* questionnaire */
  const [sport, setSport]                         = useState(pendingData?.sport || "");
  const [sportPrecision]                          = useState(pendingData?.sportPrecision || "");
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
  const [pushBlockedIOS, setPushBlockedIOS] = useState(false);
  useEffect(() => { setPushBlockedIOS(needsInstallForPush()); }, []);

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
  const [wizardCoachAthletes, setWizardCoachAthletes] = useState<CoachAthlete[]>([]);
  const [wizardCriteriaMode, setWizardCriteriaMode] = useState<"criteria" | "import">("criteria");
  /* CTA "Débloquer →" de l'overlay S2+ de wizard_builder (2026-09-03) — ouvre le même paywall
     skippable que paywall_priming/paywall_form, en overlay par-dessus le wizard (stepIdx inchangé,
     pas de navigation : wizard_activate/wizard_assign restent intacts derrière). Un paiement réussi
     lève wizardUnlocked, qui passe isActive=true à ProgramBuilderModal (le flou S2+ disparaît
     réellement, pas juste cosmétique). */
  const [wizardPaywallStage, setWizardPaywallStage] = useState<"priming" | "form" | null>(null);
  const [wizardUnlocked, setWizardUnlocked] = useState(false);

  const getPath = (r: Role): StepId[] => {
    if (hasCoachInvite && r === "athlete") return INVITE_ATHLETE_PATH;
    if (hasClaimedProgram) return r === "coach" ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH;
    return r === "coach" ? COACH_PATH : ATHLETE_PATH;
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

  /* wizard_assign (coach) : fresh fetch de coach_athletes juste avant de rendre ce step — inclut
     les 3 démo créées par completeProfile() ET les invités réels ajoutés à wizard_activate
     (InviteModal → /api/invite/create). Placé avant tout early-return (règle des hooks React). */
  useEffect(() => {
    if (currentStep !== "wizard_assign" || role !== "coach") return;
    const uid = userId || newUserId;
    if (!uid) return;
    supabase.from("coach_athletes").select("*").eq("coach_id", uid)
      .then(({ data }) => { if (data) setWizardCoachAthletes(data as CoachAthlete[]); });
  }, [currentStep, role, userId, newUserId]);

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
          /* Contenu réel du programme claimé (2026-09-02, retour à l'architecture POC) — pré-remplit
             wizard_builder directement (skip picker/criteria pour ce trafic, voir PROGRAM_ATHLETE_PATH/
             PROGRAM_COACH_PATH). Même fetch que ci-dessus (GET /api/programs/[id] renvoie déjà le
             template complet) — pas de 2e appel réseau nécessaire. */
          if (data.template) { setWizardTemplate(data.template); setWizardProgramName(data.name || "Mon programme"); }
        })
        .catch(() => {});
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
    posthog.capture("onboarding_paywall_skipped", { role });
    const formIdx = path.indexOf("paywall_form");
    const targetIdx = formIdx === -1 ? stepIdx + 1 : formIdx + 1;
    if (targetIdx >= path.length) {
      window.location.href = role === "coach" ? "/coach" : "/today";
    } else {
      setStepIdx(targetIdx);
    }
  }

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
      /* Programme (claimé ou non) : plus généré+assigné ici depuis le 2026-09-02 (retour à
         l'architecture POC) — se construit désormais DANS le wizard post-signup (wizard_builder,
         réel ProgramBuilderModal) puis s'assigne réellement à wizard_assign (réel
         ProgramAssignModal). L'ancien pipeline pré-signup (pendingAthleteProgramOptsRef,
         claimAndAssignProgram, generateAndAssignProgram) a été retiré du fichier (2026-09-05,
         nettoyage du code mort) — plus aucun appelant depuis que ce chemin n'existe plus. */
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
          await supabase.from("coach_sessions").insert(buildCoachDemoSessions(uid, athlete.id, sportValue, demo.rpeBase));
        }
      }
      /* Plus d'auto-génération+assignation synchrone ici depuis le 2026-09-02 (retour à
         l'architecture POC) — le coach construit son vrai programme dans le wizard post-signup
         (wizard_builder) et l'assigne réellement (démo + invités réels) à wizard_assign. Le démo
         reste créé ici pour que Coach Control ne soit jamais vide entre-temps. */
    }
  }

  /* wizard_builder (2026-09-02) — un seul CTA ("Assigner ce programme →"), réutilise le prop
     onSaveToLibrary de ProgramBuilderModal tel quel (vraie écriture POST /api/programs, capture
     l'id créé pour que wizard_assign puisse l'assigner réellement ensuite via ProgramAssignModal).
     Correction explicite de Gildas : pas de 2e bouton "Enregistrer en librairie" séparé dans le
     wizard, voir footerVariant="wizardSingle" sur ProgramBuilderModal. */
  async function handleWizardSaveToLibrary(name: string, template: ProgramTemplate) {
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
      if (error) console.error("[handleWizardSaveToLibrary] profiles.sport update error:", error);
    }
    if (hasClaimedProgram) localStorage.removeItem("claim_program_id");
    next();
  }

  /* Lien de partage /p/[id] sur wizard_builder (2026-09-04) — même geste que le bouton 🔗 de la
     librairie in-app (ProgramLibraryPage.tsx), mais sans jamais avancer le wizard (contrairement à
     handleWizardSaveToLibrary ci-dessus) : partager n'est pas terminer. Réutilise wizardProgramId
     s'il existe déjà (déjà sauvegardé une 1re fois, ex. via un partage précédent) au lieu de
     recréer un programme en double à chaque clic. */
  async function handleWizardShare(name: string, template: ProgramTemplate): Promise<string> {
    let id = wizardProgramId;
    if (id) {
      await fetch(`/api/programs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, template, weeks_count: template.weeks.length, is_public: true }),
      });
    } else {
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
      if (!res.ok) throw new Error("Erreur lors du partage.");
      const { program } = await res.json() as { program: { id: string } };
      id = program.id;
      setWizardProgramId(id);
      await fetch(`/api/programs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: true }),
      });
    }
    return `${window.location.origin}/p/${id}`;
  }

  /* Séance démo garantie le jour de l'inscription — sportif solo (2026-09-03, demande explicite de
     Gildas). Problème visé : le geste Alléger/Surcharger réel ne se déclenche que s'il existe une
     séance datée d'aujourd'hui avec un mismatch wellness/difficulté — or l'assignation à
     wizard_assign est skippable ("Plus tard") et sa date de départ, bien que par défaut aujourd'hui,
     reste éditable vers une date future. Si aucune vraie séance n'existe pour aujourd'hui à la fin du
     wizard, on en crée une explicitement titrée "Séance démo" — même principe que côté coach
     (buildCoachDemoSessions()/PLACEHOLDER_WELLNESS_SCORE, voir leur doc), pas un mécanisme différent.
     Contenu : un exemple réel du sport choisi (getSessionTemplates(sport)). Difficulté : choisie
     parmi 2 extrêmes (9 très dure / 2 très légère) en rejouant la VRAIE fonction
     computeAutoregSuggestion contre le wellness réel du jour (déjà écrit à wizard_activate,
     WellnessModal.onSave) — pas une paire fixe devinée comme côté coach (où le wellness est lui-même
     fictif) : ici le wellness est réel, donc la calibration doit l'être aussi pour garantir le
     déclenchement quel que soit le score entré. Repli neutre (7) si le wellness du jour est inconnu
     (WellnessModal skippée via "Annuler") — la séance existe quand même, juste sans garantie de
     mismatch ; ce gap-là (aha qui dépend aussi du wellness, pas seulement de la séance) reste
     assumé, distinct de ce que ce chantier corrige. */
  async function ensureTodayDemoSession(uid: string) {
    const todayIso = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase.from("sessions").select("id").eq("user_id", uid).eq("date", todayIso).limit(1);
    if (existing && existing.length > 0) return; // déjà une vraie séance aujourd'hui (assignation réelle à today)

    const { data: history } = await supabase
      .from("wellness_daily")
      .select("date, sleep, stress, recovery, motivation, base_score, score")
      .eq("user_id", uid)
      .order("date", { ascending: true });
    const todayRow = history?.find(r => r.date === todayIso) ?? null;
    const priorHistory = (history ?? []).filter(r => r.date < todayIso);
    const baseline = todayRow ? computeWellnessBaselineAt(priorHistory, todayRow) : null;
    const wellness = todayRow ? wellnessSignal(todayRow) : null;

    let difficulty = 7;
    for (const candidate of [9, 2]) {
      if (computeAutoregSuggestion(wellness, candidate, baseline)) { difficulty = candidate; break; }
    }

    const [, notes] = getSessionTemplates(sport || "Autre")[0];
    const { error } = await supabase.from("sessions").insert({
      user_id: uid, date: todayIso, name: "Séance démo", notes, done: false, target_difficulty: difficulty,
    });
    if (error) console.error("[ensureTodayDemoSession] insert error:", error);
  }

  /* Fin du wizard (2026-09-02) — remplace finishAthleteActivation()/finishCoachActivation() pour
     le nouveau flow : les deux rôles font désormais exactement la même chose à la fin de
     wizard_assign (marquer onboarding_done, avancer vers le paywall) — l'assignation réelle vient
     d'avoir lieu via ProgramAssignModal lui-même (onAssigned/onClose), la wellness réelle a déjà
     été écrite à wizard_activate (WellnessModal.onSave, sportif). */
  async function finishWizard() {
    const uid = userId || newUserId;
    if (uid) {
      if (role === "athlete") await ensureTodayDemoSession(uid);
      await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
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
        if (!profileCompleteGuardRef.current && path.includes("wizard_builder")) {
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
        if (!profileCompleteGuardRef.current && path.includes("wizard_builder")) {
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
     ATHLETE_PATH/SHORT_ATHLETE_PATH que dans INVITE_ATHLETE_PATH (juste après "value_intro") ;
     c'est la même classe de bug que "atterrissage systématique sur role" déjà rencontrée sur la
     continuation Google OAuth. Repli sur `decisionStepIdFor(role)` (2026-09-04, fusion decision/
     account) : ATHLETE_PATH/COACH_PATH n'ont plus "account" comme step séparé — l'utilisateur
     atterrit directement juste après decision_2a/2b, wizard_picker, exactement l'équivalent de
     l'ancien "juste après account". */
  useEffect(() => {
    if (!inviteJoinFailed) return;
    const accountIdx = path.indexOf("account");
    const decisionIdx = path.indexOf(decisionStepIdFor(role));
    setStepIdx(accountIdx >= 0 ? accountIdx + 1 : decisionIdx >= 0 ? decisionIdx + 1 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteJoinFailed]);

  /* Paywall scindé en 2 écrans plein-page (2026-08-31 : rendus directement via PrimingJourneyModal/
     PaywallModal, les mêmes composants que le gating in-app — voir doc du path plus haut). Tracking
     paywall_priming_viewed/paywall_form_viewed et setup-intent Stripe sont désormais internes à ces
     2 composants, plus besoin de les dupliquer ici — seul `billing` reste levé dans ce fichier
     (partagé entre les deux écrans, même pattern que usePaywall.ts). */
  const [billing, setBilling] = useState<Billing>("annual");

  /* Paiement confirmé (trial_started, capturé dans CheckoutForm) — onboarding_done est déjà true
     depuis l'activation (voir createAccount()/finishWizard()), payer ne le repose ici que par
     défense en profondeur (idempotent), ce n'est plus le jalon qui
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
        posthog.capture("account_created", { role: pendingData.role, method: "google" });
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
    if (!profileCompleteGuardRef.current && userId && path.includes("wizard_builder")) {
      profileCompleteGuardRef.current = true;
      completeProfile(userId);
    }
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
    if (!profileCompleteGuardRef.current && path.includes("wizard_builder")) {
      profileCompleteGuardRef.current = true;
      completeProfile(userId);
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
       la next step, pas ce qu'on demande explicitement — l'ancien titre de positionnement
       identitaire redescend en sous-titre, juste en dessous.

       CTA sticky unique, adaptatif (2026-09-04, retour explicite de Gildas) — remplace les 2
       CTA distincts (bouton Google dans la carte + Actions "Créer mon espace..." en dessous,
       désactivé tant que les 2 champs n'étaient pas remplis). Un seul contrôle, jamais
       caché/désactivé par la saisie : au repos (aucun champ touché) il porte le logo Google et
       lance `handleGoogleRegister` ; dès qu'un caractère existe dans Prénom OU Email, son
       libellé et son action basculent sur le formulaire email (`handleFinish`) — et repassent
       en état Google si les 2 champs sont revidés. Prénom/Email restent toujours visibles dans
       le contenu (jamais révélés par un clic). */
    const accountTyped = name.trim().length > 0 || email.trim().length > 0;

    const content = (
      <>
        <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 8, lineHeight: "normal" }}>
          {role === "coach" ? "Connecte l'entraînement de tes sportifs à ThePerfClub" : "Connecte tes entraînements à ThePerfClub"}
        </div>
        <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 16, lineHeight: 1.4 }}>
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
            style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, cursor: "pointer", fontSize: 17, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#171b1f" }}
          >←</button>
        )}
        <button
          type="button"
          onClick={() => { if (saving) return; if (accountTyped) handleFinish(); else handleGoogleRegister(); }}
          disabled={saving}
          style={{
            flex: 1, height: 52, borderRadius: 14, border: "none",
            background: accountTyped ? "linear-gradient(180deg,#f04a08,#d44000)" : "#171b1f",
            color: "#fff", fontSize: 15, fontWeight: 900, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: accountTyped ? "0 8px 20px rgba(212,64,0,.26)" : "none",
          }}
        >
          {!accountTyped && <GoogleIcon />}
          {saving
            ? (accountTyped ? "Création…" : "Connexion…")
            : accountTyped
            ? "Connecter mes séances"
            : "Continuer avec Google"}
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

  const sessionCount  = trainingDays.length + (trainingDays.length < 6 ? 1 : 0);
  const weaknessOptions = WEAKNESSES_BY_SPORT[sport] ?? WEAKNESSES_BY_SPORT["Autre"];
  /* Libellés réels des faiblesses choisies — un seul calcul, réutilisé partout où il faut les
     mentionner (bullet paywall, voir plus bas). */
  const weaknessLabels = weaknesses.map(k => weaknessOptions.find(w => w.key === k)?.label).filter((l): l is string => !!l);
  const sportSentenceLabel = sport || sportPrecision.trim() || undefined;

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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Création de ton espace…</div>
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Reprise de ton inscription…</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Ça prend quelques secondes</div>
        </div>
      </OnboardingBackground>
    );
  }

  /* ═══════════ WIZARD post-signup (2026-09-02, retour à l'architecture POC) ═══════════
     5 steps, montés en early-return plein écran, puisque les 6 composants réels réutilisés ici (ProgramCreatePicker/
     ProgramCriteriaModal/ProgramBuilderModal/InviteModal/WellnessModal/ProgramAssignModal) sont
     déjà des overlays position:fixed autonomes — les nester dans le wrapper OnboardingBackground/
     frise plus bas serait sans effet visuel, juste un rendu inutile derrière l'overlay.
     Actions 100% libres (aucun requireSubscription passé — gate() reste un passthrough partout) :
     éditer/enregistrer/assigner ne sont jamais bloqués. Seule exception, ajoutée le 2026-09-03
     (retour explicite de Gildas, hors POC) : `isActive={wizardUnlocked ? true : false}` sur
     wizard_builder floute visuellement S2+ (teaser) tant qu'aucun paiement n'a eu lieu dans le
     wizard, sans jamais gater d'action. Le bouton "Débloquer →" de l'overlay ouvre désormais le
     même paywall skippable (PrimingJourneyModal/PaywallModal) en overlay, sans changer `stepIdx` —
     wizard_activate/wizard_assign restent intacts derrière ; un paiement réussi lève wizardUnlocked
     et referme l'overlay, faisant réellement disparaître le flou. */

  if (currentStep === "wizard_picker") {
    return (
      <ProgramCreatePicker
        wizardHero={<WizardHero step={1} dark eyebrow="Étape 1/3 — Programme" title="Connecte tes séances" sub={role === "coach"
          ? "Le mécanisme que tu viens de voir s'applique au vrai programme de tes sportifs — choisis comment le construire."
          : "Le mécanisme que tu viens de voir s'applique à ton vrai entraînement — choisis comment le construire."} />}
        onClose={() => {}}
        hideClose
        onGenerate={() => { setWizardCriteriaMode("criteria"); const idx = path.indexOf("wizard_criteria"); setStepIdx(idx === -1 ? stepIdx + 1 : idx); }}
        onImport={() => { setWizardCriteriaMode("import"); const idx = path.indexOf("wizard_criteria"); setStepIdx(idx === -1 ? stepIdx + 1 : idx); }}
        onTemplate={() => { const idx = path.indexOf("wizard_library"); setStepIdx(idx === -1 ? stepIdx + 1 : idx); }}
        onBlank={() => {
          const week: Record<string, never[]> = {};
          WIZARD_BLANK_DAYS.forEach(d => { week[d] = []; });
          setWizardTemplate({ weeks: [week] });
          setWizardProgramName("Programme vierge");
          const idx = path.indexOf("wizard_builder");
          setStepIdx(idx === -1 ? stepIdx + 2 : idx);
        }}
      />
    );
  }

  /* Bibliothèque publique, native (2026-09-04, remplace le lien externe WordPress — demande
     explicite de Gildas, "que ça passe à une step suivante avec la liste des programmes avec des
     filtres, comme ça c'est natif"). Sélectionner un programme saute directement wizard_criteria
     (skip vers wizard_builder, même principe que onBlank ci-dessus) — le contenu de départ vient
     d'être choisi, wizard_builder reste éditable librement ensuite. */
  if (currentStep === "wizard_library") {
    return (
      <ProgramLibraryBrowser
        wizardHero={<WizardHero step={1} dark eyebrow="Étape 1/3 — Programme" title="Choisis un modèle" sub="Un programme existant de la bibliothèque, à personnaliser librement ensuite." />}
        onClose={() => setStepIdx(Math.max(0, path.indexOf("wizard_picker")))}
        onBack={() => setStepIdx(Math.max(0, path.indexOf("wizard_picker")))}
        hideClose
        onSelect={(template, meta, name) => {
          setWizardTemplate(template);
          setWizardProgramName(name);
          if (meta.sport) setSport(meta.sport);
          const idx = path.indexOf("wizard_builder");
          setStepIdx(idx === -1 ? stepIdx + 1 : idx);
        }}
      />
    );
  }

  if (currentStep === "wizard_criteria") {
    return (
      <ProgramCriteriaModal
        wizardHero={wizardCriteriaMode === "import"
          ? <WizardHero step={1} dark eyebrow="Étape 1/3 — Programme" title="Importe ton programme" sub="Colle le texte de ton programme, ou prends-le en photo. On le transforme automatiquement en programme éditable, personnalisable ensuite." />
          : <WizardHero step={1} dark eyebrow="Étape 1/3 — Programme" title="Calibre ton programme" sub="Spécifique à ton sport, avec une vraie périodisation et les priorités que tu choisis de travailler. Tout reste personnalisable ensuite." />}
        mode={wizardCriteriaMode}
        lockedSport={sport || sportPrecision.trim() || undefined}
        onClose={() => setStepIdx(Math.max(0, path.indexOf("wizard_picker")))}
        onBack={() => setStepIdx(Math.max(0, path.indexOf("wizard_picker")))}
        hideClose
        onGenerate={(template, meta) => {
          setWizardTemplate(template);
          setWizardProgramName(meta.sport ? `Programme ${meta.sport}` : "Mon programme");
          /* Sync vers le state top-level (2026-09-04) : depuis que sport_2a est retiré du path,
             `sport` n'est plus jamais renseigné avant le wizard — sans cette sync,
             handleWizardSaveToLibrary() (plus bas, POST /api/programs) retomberait toujours sur
             son repli "Autre" malgré un vrai sport choisi ici, dans wizard_criteria. */
          if (meta.sport) setSport(meta.sport);
          next();
        }}
      />
    );
  }

  if (currentStep === "wizard_builder") {
    if (hasClaimedProgram && !wizardTemplate) {
      return <OnboardingBackground variant="dark"><div style={{ minHeight: 280 }} /></OnboardingBackground>;
    }
    return (
      <>
        <ProgramBuilderModal
          programName={wizardProgramName}
          template={wizardTemplate ?? { weeks: [{}] }}
          isActive={wizardUnlocked ? true : false}
          onUnlockClick={() => setWizardPaywallStage("priming")}
          footerVariant="wizardSingle"
          wizardSingleLabel="Continuer avec ce programme →"
          onBack={() => {
            if (hasClaimedProgram) {
              setHasClaimedProgram(false);
              setWizardTemplate(null);
              const newPath = role === "coach" ? COACH_PATH : ATHLETE_PATH;
              setStepIdx(Math.max(0, newPath.indexOf("wizard_picker")));
            } else {
              const idx = path.indexOf("wizard_picker");
              setStepIdx(idx === -1 ? Math.max(0, stepIdx - 1) : idx);
            }
          }}
          onSaveToLibrary={handleWizardSaveToLibrary}
          onSaveAndAssign={handleWizardSaveToLibrary}
          onShare={handleWizardShare}
        />
        {wizardPaywallStage === "priming" && (
          <PrimingJourneyModal
            mode={role === "coach" ? "coach" : "athlete"}
            billing={billing}
            setBilling={setBilling}
            allowDismiss
            onContinue={() => setWizardPaywallStage("form")}
            onDismiss={() => setWizardPaywallStage(null)}
          />
        )}
        {wizardPaywallStage === "form" && (
          <PaywallModal
            mode={role === "coach" ? "coach" : "athlete"}
            allowDismiss
            onClose={() => setWizardPaywallStage("priming")}
            onSuccess={async () => {
              const uid = userId || newUserId;
              if (uid) await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", uid);
              setWizardUnlocked(true);
              setWizardPaywallStage(null);
            }}
            initialBilling={billing}
          />
        )}
      </>
    );
  }

  if (currentStep === "wizard_activate") {
    const notifCancelLabel = pushBlockedIOS ? "📲 Me le rappeler plus tard" : "🔔 Me le rappeler plus tard";
    if (role === "coach") {
      return (
        <InviteModal
          wizardHero={<WizardHero step={2} dark eyebrow="Étape 2/3 — Activer ton équipe" title="Ajoute tes sportifs" sub="Pas besoin qu'ils créent un compte pour que tu commences à utiliser ThePerfClub — ajoute-les et assigne-leur déjà un programme. C'est encore mieux quand ils rejoignent : tout se synchronise automatiquement." />}
          onClose={() => { if (!pushBlockedIOS) subscribeToPush().catch(() => {}); next(); }}
          onLinked={() => {}}
          inviteCode={inviteCode}
          cancelLabel={notifCancelLabel}
          onBack={() => setStepIdx(Math.max(0, path.indexOf("wizard_builder")))}
        />
      );
    }
    return (
      <WellnessModal
        wizardHero={<WizardHero step={2} dark eyebrow="Étape 2/3 — Ta forme" title="Ton point forme du jour" sub="Ton premier point forme active vraiment l'autorégulation sur ce programme." />}
        date={new Date().toISOString().split("T")[0]}
        onSave={async data => {
          const uid = userId || newUserId;
          if (uid) {
            const { error } = await supabase.from("wellness_daily").upsert({ user_id: uid, date: new Date().toISOString().split("T")[0], ...data }, { onConflict: "user_id,date" });
            if (error) console.error("[wizard_activate] wellness_daily upsert error:", error);
          }
          next();
        }}
        onClose={() => { if (!pushBlockedIOS) subscribeToPush().catch(() => {}); next(); }}
        cancelLabel={notifCancelLabel}
        onBack={() => setStepIdx(Math.max(0, path.indexOf("wizard_builder")))}
      />
    );
  }

  if (currentStep === "wizard_assign") {
    return (
      <ProgramAssignModal
        wizardHero={<WizardHero step={3} dark eyebrow="Étape 3/3 — Assigner" title={role === "coach" ? "Assigne le programme à tes sportifs" : "Choisis ta date de départ"} sub={role === "coach"
          ? "Le programme apparaît directement dans le planning de tes sportifs, prêt à suivre au jour le jour."
          : "Ton programme apparaît directement dans ton planning, prêt à suivre au jour le jour."} />}
        programId={wizardProgramId ?? ""}
        programName={wizardProgramName}
        athletes={role === "coach" ? wizardCoachAthletes : []}
        selfUserId={role === "athlete" ? (userId || newUserId || undefined) : undefined}
        initialSelectedIds={role === "coach" ? wizardCoachAthletes.map(a => a.id) : undefined}
        defaultStartDate="today"
        onAssigned={finishWizard}
        onClose={finishWizard}
        onSkip={finishWizard}
        hideClose
        onBack={() => setStepIdx(Math.max(0, path.indexOf("wizard_activate")))}
      />
    );
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

          const headline = isClaimed
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
                <img
                  src="https://www.theperfclub.com/wp-content/uploads/2026/07/value-intro-BG.jpeg"
                  alt=""
                  loading="eager"
                  fetchPriority="high"
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%", display: "block" }}
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
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 10 }}>ThePerfClub</div>
                  <div style={{ fontSize: "clamp(28px, 5vw, 40px)", fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.08, marginBottom: 14, color: "#fff" }}>{headline}</div>
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
                              cursor: "pointer", display: "flex", alignItems: "center", gap: 16, borderRadius: 18, padding: "16px 18px",
                              border: picked ? "2px solid #d44000" : "1.5px solid rgba(255,255,255,.16)",
                              background: picked ? "rgba(212,64,0,.16)" : "rgba(255,255,255,.08)",
                              backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                              transition: "all .15s",
                            }}>
                            <div style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 14, background: badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", color: picked ? "#ff8a55" : "#fff", marginBottom: 2 }}>{label}</div>
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
          />
        )}


        </div>
      </div>
    </OnboardingBackground>
  );
}
