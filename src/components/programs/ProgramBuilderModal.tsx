"use client";

import DayColumn, { WeekSessionCard } from "@/components/calendar/DayColumn";
import { useState, useEffect, useRef } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { ProgramTemplate, SessionTemplate, WeekTemplate, Session } from "@/types";
import AddSessionModal from "@/components/sessions/AddSessionModal";
import ReconduireModal, { type ReconduireOutputRow } from "@/components/sessions/ReconduireModal";
import { NO_ADJUST, adjustNotesCharge, adjustDifficultyCharge, type ChargeAdjust } from "@/lib/chargeAdjust";
import ChargeAdjustPicker, { chargePreviewLine } from "@/components/sessions/ChargeAdjustPicker";
import { SeriesChoiceModal, RepeatModal, SeriesRow } from "@/components/sessions/SeriesModals";
import { ExerciseLineView, type ExerciseLineViewData } from "@/components/sessions/ExerciseLineView";
import { moveExerciseLine } from "@/lib/exerciseMediaReindex";
import { newSeriesId, editSummary, following, propagateEdit, moveFollowing, deleteFollowing, repeatSession, seriesLabel, hasSessionChange, type SessionState } from "@/lib/sessionSeries";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { avgWeekRpe, loadBarColor } from "@/components/programs/SessionTemplateCard";
import PeriodPill from "@/components/calendar/PeriodPill";
import { computeAutoregSuggestion, suggestionSeverityColor, autoregHeadline, autoregAdvice, applyAutoregDifficulty, zoneRange } from "@/lib/autoregulation";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import WellnessRing from "@/components/wellness/WellnessRing";
import { WELLNESS_RAMP } from "@/lib/wellness";

// Même rampe que WellnessRing/wellnessColor (wellness.ts) — la jauge horizontale du simulateur
// reste visuellement identique au ring, jamais une couleur dupliquée à l'œil (même construction
// que PublicProgramView.tsx).
const WELLNESS_TRACK_GRADIENT = `linear-gradient(to right, ${WELLNESS_RAMP.map(s => `${s.hex} ${s.stop * 100}%`).join(", ")})`;
const DAY_NAMES: Record<string, string> = { Lun: "Lundi", Mar: "Mardi", Mer: "Mercredi", Jeu: "Jeudi", Ven: "Vendredi", Sam: "Samedi", Dim: "Dimanche" };

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ─── Drag & drop local au template (aucune écriture DB — setTemplate direct, tant que le
   programme n'est pas enregistré). Séances entre jours (Lun..Dim) de la semaine affichée +
   réordonnancement des exercices dans une séance. ─── */

function DroppableProgramDay({ day, children }: { day: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { type: "day", day } });
  return (
    <div ref={setNodeRef} style={{ borderRadius: 24, outline: isOver ? "2px dashed rgba(212,64,0,.55)" : "2px dashed transparent", outlineOffset: 4, transition: "outline-color .15s" }}>
      {children}
    </div>
  );
}

function DraggableProgramSession({ day, sIdx, session, onClick, autoregReco }: {
  day: string; sIdx: number; session: SessionTemplate; onClick: () => void;
  /* Simulateur d'autorégulation (2026-09-18) — voir ProgramBuilderModal, calcul daySuggestions.
     autoregReco (le %, signé) pilote le rendu barré/gras des lignes d'exercice (voir
     DraggableProgramExercise) — tous absents = comportement in-app inchangé. */
  autoregReco?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `sess:${day}:${sIdx}`, data: { type: "session", day, sIdx } });
  /* Droppable "séance" — reçoit un exercice glissé depuis une AUTRE séance du template (drag
     cross-séance, 2026-09-17), uniquement quand cette séance est vide (sinon chaque ligne
     d'exercice a déjà son propre droppable plus précis, cf. DraggableProgramExercise). */
  const { setNodeRef: setDropRef } = useDroppable({ id: `sess-drop:${day}:${sIdx}`, data: { type: "session", day, sIdx } });
  const exerciseCount = session.notes ? session.notes.split("\n").filter(Boolean).length : 0;
  const cardRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (exerciseCount === 0) setDropRef(el);
  };
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 30 : undefined,
  };
  /* Même carte que le Planning (06/11, Gildas : mêmes composants partout) ; la reco du simulateur se lit
     dans l'anneau du jour et les lignes ajustées. */
  return (
    <WeekSessionCard
      session={asDaySession(session, day, sIdx)}
      onEdit={onClick}
      onComplete={() => {}}
      hideActions
      dragHandleProps={{ ...attributes, ...listeners }}
      cardRef={cardRef}
      cardStyle={style}
      adjustPct={autoregReco ?? null}
      renderExerciseLine={(_line, exIdx, view) => (
        <DraggableProgramExercise key={exIdx} day={day} sIdx={sIdx} exIdx={exIdx} view={view} />
      )}
    />
  );
}

/* Séance de modèle → forme d'une séance du Planning (pas de date : lundi fictif 2001 calé sur le jour). */
function dayDate(day: string) { return `2001-01-${String(1 + Math.max(0, DAYS.indexOf(day))).padStart(2, "0")}`; }
function asDaySession(s: SessionTemplate, day: string, sIdx: number, concealed: string | null = null) {
  return { id: `${day}-${sIdx}`, date: dayDate(day), name: s.name, notes: s.notes, duration: null, rpe: null, done: false, target_difficulty: s.target_difficulty ?? null, exercise_media: s.exercise_media ?? null, concealed };
}

function DraggableProgramExercise({ day, sIdx, exIdx, view }: { day: string; sIdx: number; exIdx: number; view: ExerciseLineViewData }) {
  const dragId = `ex:${day}:${sIdx}:${exIdx}`;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: dragId, data: { type: "exercise", day, sIdx, exIdx } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data: { type: "exercise", day, sIdx, exIdx } });
  return (
    <div
      ref={el => { setDragRef(el); setDropRef(el); }}
      style={{
        padding: "6px 9px", borderTop: exIdx > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
        background: isOver ? "#fff5f2" : "#fff", display: "flex", alignItems: "flex-start", gap: 6, opacity: isDragging ? 0.4 : 1,
      }}
    >
      <span
        {...attributes} {...listeners}
        style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 11, flexShrink: 0, userSelect: "none" as const, lineHeight: 1.4, marginTop: 3 }}
      >⠿</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <ExerciseLineView text={view.text} original={view.original} ctx={view.ctx} adjusting={view.adjusting} compact />
      </span>
    </div>
  );
}

/* Dupliquer une séance de template — DuplicateModal.tsx (Planning) ne convient pas ici : il exige
   une vraie date calendaire (`<input type="date">`), alors qu'une séance de template n'a qu'une
   position (semaine + jour de la semaine "Lun".."Dim"), jamais de date réelle — même contrainte déjà
   contournée par Reconduire dans ce fichier (`daySlots` positionnel, `date: ""` factice). Modal
   locale dédiée, pas exportée : sélection semaine + jour au lieu d'un date picker. */

function DuplicateTemplateModal({ sessions, weeksCount, defaultWeekIdx, defaultDay, defaultSourceIdx = 0, onClose, onConfirm }: {
  /* Toutes les séances du jour source — un sélecteur "Séance" n'apparaît que si plusieurs.
     Ouvert depuis le pied du tiroir de séance (⎘ Dupliquer), comme au Planning. */
  sessions: SessionTemplate[];
  weeksCount: number;
  defaultWeekIdx: number;
  defaultDay: string;
  /* Ouvert depuis le tiroir d'une séance (⎘ Dupliquer, comme au Planning) : cette séance-là. */
  defaultSourceIdx?: number;
  onClose: () => void;
  onConfirm: (sourceIdx: number, targetWeekIdx: number, targetDay: string, adjust: ChargeAdjust) => void;
}) {
  const { isMd } = useBreakpoint();
  const { close, exitClass } = useExitAnimation(onClose);
  const [sourceIdx, setSourceIdx] = useState(defaultSourceIdx);
  const [targetWeek, setTargetWeek] = useState(defaultWeekIdx);
  const [targetDay, setTargetDay] = useState(defaultDay);
  const [adjust, setAdjust] = useState<ChargeAdjust>(NO_ADJUST);
  const session = sessions[sourceIdx];
  if (!session) return null;

  const newDiff = adjustDifficultyCharge(session.target_difficulty ?? 6, adjust);
  const previewSession: SessionTemplate = { ...session, target_difficulty: newDiff };

  return (
    <div
      className={exitClass}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: isMd ? "flex-end" : "stretch",
        zIndex: 2147483200, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "24px 0 0 24px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Dupliquer</div>
          <button onClick={close} style={{ width: 32, height: 32, borderRadius: 12, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 15, color: "#62686e", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 20px" }}>
          <div style={{ fontSize: 13, color: "#62686e", marginBottom: 18, lineHeight: 1.4 }}>
            Une copie de la séance sera ajoutée à l&apos;emplacement choisi.
          </div>

          {sessions.length > 1 ? (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Séance</div>
              <select
                value={sourceIdx} onChange={e => setSourceIdx(Number(e.target.value))}
                style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              >
                {sessions.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, padding: "10px 13px", marginBottom: 18, fontSize: 14, fontWeight: 700, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {session.name}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Semaine</div>
              <select
                value={targetWeek} onChange={e => setTargetWeek(Number(e.target.value))}
                style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              >
                {Array.from({ length: weeksCount }, (_, i) => <option key={i} value={i}>S{i + 1}</option>)}
                <option value={weeksCount}>+ Nouvelle semaine</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 7 }}>Jour</div>
              <select
                value={targetDay} onChange={e => setTargetDay(e.target.value)}
                style={{ width: "100%", background: "#f7f8f9", border: "1px solid rgba(0,0,0,.10)", borderRadius: 16, padding: "13px 14px", fontSize: 15, color: "#171b1f", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              >
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <ChargeAdjustPicker value={adjust} onChange={setAdjust} />

          {/* Aperçu : même carte que le builder et le Planning (WeekSessionCard), diff avant/après si la
              charge a été ajustée. */}
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>
            Aperçu de la copie
          </div>
          <WeekSessionCard
            session={asDaySession(previewSession, "Lun", 0)}
            hideActions onComplete={() => {}} onEdit={() => {}} cardStyle={{ cursor: "default" }}
            renderExerciseLine={chargePreviewLine(adjust)}
          />
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, alignItems: "center",
          padding: "16px 24px 20px", borderTop: "1px solid #f0f0f0", background: "#fff",
        }}>
          <button onClick={close} style={{ background: "#f5f5f5", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, cursor: "pointer", color: "#666" }}>
            Annuler
          </button>
          <button
            onClick={() => onConfirm(sourceIdx, targetWeek, targetDay, adjust)}
            style={{ flex: 1, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            ⎘ Dupliquer
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditingTarget { weekIdx: number; day: string; sessionIdx: number }

interface Props {
  /* Programmes ThePerfClub côté sportif (programReveal.ts, 2026-10-05) : renvoie le libellé de
     dévoilement d'une séance pas encore visible (semaine, jour), null sinon. Absent = tout en clair. */
  concealFrom?: (weekIdx: number, day: string) => string | null;
  programName: string;
  template: ProgramTemplate;
  assignmentCount?: number;
  userName?: string;
  /* Sport du programme : présélectionné dans Modèle / Générer de l'éditeur de séance. */
  sport?: string | null;
  requireSubscription?: (fn: () => void) => void;
  /* Vue au-delà de S1 gatée (2026-08-19) — voir doc dans ProgramLibraryPage.tsx. Absent = jamais
     floué (repli permissif). */
  isActive?: boolean;
  /* CTA "Débloquer →" de l'overlay S2+ (2026-09-03) : quand fourni, remplace le passthrough
     `gate(() => {})` par cet appel direct — permet à un appelant (le wizard onboarding) d'ouvrir
     son propre paywall sans jamais devoir passer `requireSubscription` (qui gaterait aussi les
     actions d'édition/enregistrement, qu'on veut garder libres dans le wizard). Absent = repli sur
     `gate(() => {})`, comportement in-app inchangé. */
  onUnlockClick?: () => void;
  onSaveToLibrary: (name: string, template: ProgramTemplate) => Promise<void>;
  onSaveAndAssign: (name: string, template: ProgramTemplate) => Promise<void>;
  onBack: () => void;
  /* Wizard onboarding (2026-09-02) : un seul CTA au lieu des 2 boutons habituels — réutilise
     `onSaveToLibrary` tel quel (vraie écriture POST /api/programs), l'assignation réelle se fait
     à l'étape suivante du wizard (ProgramAssignModal), pas ici. Absent = comportement inchangé
     (2 boutons), utilisé par ProgramLibraryPage.tsx. */
  footerVariant?: "default" | "wizardSingle";
  wizardSingleLabel?: string;
  /* Wizard onboarding (2026-09-03) : bande d'habillage (dots + eyebrow + titre + sous-titre)
     injectée au-dessus de la topbar réelle — absent = comportement inchangé (usage in-app). */
  wizardHero?: React.ReactNode;
  /* Lien de partage /p/[id] (2026-09-04) — sauvegarde/rend public le programme (via l'appelant,
     qui sait créer ou mettre à jour selon le contexte) et retourne l'URL à copier. Jamais gaté
     par abonnement (requireSubscription) pour un compte réel : seule S1 est visible pour un
     visiteur non connecté sur /p/[id] (PublicProgramView.tsx), donc partager reste utile — et
     souhaité — pour un compte gratuit (acquisition PLG). Absent = pas de bouton (repli permissif,
     aucun appelant n'est cassé). */
  onShare?: (name: string, template: ProgramTemplate) => Promise<string>;
  /* Sandbox uniquement (2026-09-05) : aucun compte n'existe encore, donc rien n'est réellement
     persistable — le clic doit passer par `gate()` (qui ouvre SandboxGateModal sans jamais
     appeler `onShare`, exactement le même comportement que "Enregistrer en librairie"/"Assigner"
     en sandbox) plutôt que d'appeler `onShare` directement (qui viserait des routes
     authentifiées et échouerait). Absent/false = comportement inchangé (in-app + wizard,
     partage jamais gaté). */
  shareGated?: boolean;
  /* Wizard onboarding (2026-09-06) : contrairement aux 6 autres écrans du wizard, cet écran ne
     reçoit jamais de `wizardHero` (son propre Topbar avec le nom éditable du programme sert déjà
     de titre — ajouter un bloc WizardHero décoratif au-dessus mangerait de l'espace de travail).
     `topOffset` est donc un signal séparé, explicite, pour laisser la place à la bannière fixe
     (UnsavedBanner) au lieu de dériver (à tort) ce calcul de `wizardHero`, toujours undefined ici. */
  topOffset?: number;
  /* Simulateur d'autorégulation touchable (2026-09-18), même mécanisme que PublicProgramView.tsx
     (/p/[id]) porté ici — mais réservé au wizard onboarding. Le job-to-be-done du builder in-app
     (/week, /coach/planning) est l'édition récurrente d'un programme réel : un slider de forme
     fictive y serait du bruit dès la 2e visite, en concurrence visuelle avec le vrai travail
     d'édition. `showAutoregSimulator` (absent = false) n'est donc passé `true` que par
     OnboardingFlow.tsx (wizard_builder), jamais par ProgramLibraryPage.tsx. */
  showAutoregSimulator?: boolean;
  /* Wording du bandeau ci-dessus (2e personne "ta forme" vs 3e personne "tes sportifs") — n'a
     d'effet que si showAutoregSimulator est vrai. Absent = "athlete". */
  role?: "athlete" | "coach";
}

export default function ProgramBuilderModal({ concealFrom, programName: initialName, template: initialTemplate, assignmentCount = 0, userName, sport, requireSubscription, isActive, onUnlockClick, onSaveToLibrary, onSaveAndAssign, onBack, footerVariant = "default", wizardSingleLabel = "Assigner ce programme →", wizardHero, onShare, shareGated = false, topOffset, showAutoregSimulator = false, role = "athlete" }: Props) {
  const gate = (fn: () => void) => requireSubscription ? requireSubscription(fn) : fn();
  const { isMd } = useBreakpoint();
  const [name, setName] = useState(initialName || "Mon programme");
  const [template, setTemplate] = useState<ProgramTemplate>(initialTemplate);
  const [weekIdx, setWeekIdx] = useState(0);
  const [showReconduire, setShowReconduire] = useState(false);
  const [weekMenu, setWeekMenu] = useState(false);
  const [confirmDeleteWeek, setConfirmDeleteWeek] = useState(false);
  // Le menu ⋯ des semaines se ferme quand on touche ailleurs.
  const weekMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!weekMenu) return;
    const onDown = (e: PointerEvent) => { if (!weekMenuRef.current?.contains(e.target as Node)) { setWeekMenu(false); setConfirmDeleteWeek(false); } };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [weekMenu]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  // État de la séance à l'ouverture du tiroir, pour proposer d'appliquer ajouts/retraits aux semaines suivantes.
  const [editSnapshot, setEditSnapshot] = useState<SessionState | null>(null);
  /* Séries (sessionSeries.ts) : question « Cette séance / Celle-ci et les suivantes » après une
     modification, un déplacement ou une suppression d'une séance de série. */
  const [recurPrompt, setRecurPrompt] = useState<{
    kind: "edit" | "move" | "delete"; weekIdx: number; day: string; sIdx: number; seriesId: string; sessionName: string;
    summary?: string; weeks: number[]; before?: SessionState; after?: SessionState; toDay?: string;
  } | null>(null);
  // « Répéter chaque semaine jusqu'à Sx » depuis le tiroir d'une séance seule.
  const [repeatFor, setRepeatFor] = useState<EditingTarget | null>(null);

  const [duplicateDay, setDuplicateDay] = useState<{ weekIdx: number; day: string; sIdx: number } | null>(null);
  const [saving, setSaving] = useState<"library" | "assign" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [simScore, setSimScore] = useState(72);

  async function handleShare() {
    if (!onShare || sharing) return;
    setSharing(true);
    setSaveError(null);
    try {
      const url = await onShare(name, template);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setSaveError("Erreur lors du partage.");
    } finally {
      setSharing(false);
    }
  }

  const week = template.weeks[weekIdx];
  /* Flou + overlay au-delà de S1 pour un compte non actif — même pattern que /p/[id]
     (PublicProgramView.tsx) : le contenu réel reste rendu (pas de troncature serveur), juste
     flouté/inerte visuellement, avec un CTA par-dessus. Les onglets de semaine restent cliquables
     (pas de raison de les cacher, seul le contenu se floute une fois dessus). */
  const weekLocked = isActive === false && weekIdx > 0;
  const weekAvgLoads = template.weeks.map(w => avgWeekRpe(w as WeekTemplate));
  const maxAvgLoad = Math.max(...weekAvgLoads, 0.01);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /* Simulateur d'autorégulation touchable (2026-09-18) — wizard uniquement (showAutoregSimulator),
     voir doc sur le prop. Même mécanisme, mêmes fonctions réelles que PublicProgramView.tsx
     (/p/[id]) : computeAutoregSuggestion sur la séance la plus dure de chaque jour de la semaine
     affichée, baseline synthétique via syntheticBaselineFor (même source que la sandbox/
     l'onboarding démo). Ancre stable (pas program.id, un programme en cours de création n'en a pas
     forcément un) — la simulation reste cohérente d'un render à l'autre. Désactivé (repli neutre,
     targetSession/suggestion toujours null) pour le builder in-app. */
  const simBaseline = showAutoregSimulator ? syntheticBaselineFor(simScore, "program-builder-sim") : null;
  const simDisplayScore = Math.round(simBaseline?.relativeScore ?? simScore);
  const simZoneLabel = relativeZoneLabel(simBaseline, role);
  const daySuggestions = DAYS.map(day => {
    if (!showAutoregSimulator) return { day, targetSession: null as SessionTemplate | null, suggestion: null };
    const sessions = (week[day] ?? []) as SessionTemplate[];
    const targetSession = sessions.reduce<SessionTemplate | null>((best, s) => {
      if (s.target_difficulty == null) return best;
      if (!best || (best.target_difficulty ?? 0) < s.target_difficulty) return s;
      return best;
    }, null);
    const suggestion = targetSession ? computeAutoregSuggestion(simScore, targetSession.target_difficulty ?? null, simBaseline) : null;
    return { day, targetSession, suggestion };
  });
  const impactedDays = daySuggestions.filter(d => d.suggestion).length;

  const editingSession: SessionTemplate | null = editingTarget
    ? (template.weeks[editingTarget.weekIdx]?.[editingTarget.day]?.[editingTarget.sessionIdx] ?? null)
    : null;

  function updateSession(wIdx: number, day: string, sIdx: number, updates: Partial<SessionTemplate>) {
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== wIdx ? w : {
        ...w, [day]: ((w[day] ?? []) as SessionTemplate[]).map((s, si) => si === sIdx ? { ...s, ...updates } : s),
      }),
    }));
  }

  function removeSession(wIdx: number, day: string, sIdx: number) {
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== wIdx ? w : {
        ...w, [day]: ((w[day] ?? []) as SessionTemplate[]).filter((_, si) => si !== sIdx),
      }),
    }));
  }

  function addSession(day: string) {
    const newIdx = ((week[day] ?? []) as SessionTemplate[]).length;
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => wi !== weekIdx ? w : {
        ...w, [day]: [...((w[day] ?? []) as SessionTemplate[]), { name: "Nouvelle séance", notes: null, target_difficulty: 6, load: 2, type: "technique" as const }],
      }),
    }));
    setEditingTarget({ weekIdx, day, sessionIdx: newIdx });
    setEditSnapshot(null);
  }

  function openEditor(t: EditingTarget) {
    const s = template.weeks[t.weekIdx]?.[t.day]?.[t.sessionIdx] as SessionTemplate | undefined;
    setEditSnapshot(s ? { name: s.name, notes: s.notes, target_difficulty: s.target_difficulty } : null);
    setEditingTarget(t);
  }

  /* Le tiroir enregistre sa dernière frappe juste avant de se fermer : on compare après le rendu
     suivant, sur le template à jour, pas dans la closure de onClose. */
  const [pendingCompare, setPendingCompare] = useState<{ t: EditingTarget; snap: SessionState } | null>(null);
  function closeEditor() {
    if (editingTarget && editSnapshot) setPendingCompare({ t: editingTarget, snap: editSnapshot });
    setEditingTarget(null);
    setEditSnapshot(null);
  }
  useEffect(() => {
    if (!pendingCompare) return;
    const { t, snap } = pendingCompare;
    setPendingCompare(null);
    const now = template.weeks[t.weekIdx]?.[t.day]?.[t.sessionIdx] as SessionTemplate | undefined;
    if (!now?.series_id) return;
    const after: SessionState = { name: now.name, notes: now.notes, target_difficulty: now.target_difficulty };
    if (!hasSessionChange(snap, after)) return;
    const weeks = Array.from(new Set(following(template, now.series_id, t.weekIdx).map(o => o.weekIdx)));
    if (!weeks.length) return;
    const summary = editSummary(snap, after);
    setRecurPrompt({ kind: "edit", weekIdx: t.weekIdx, day: t.day, sIdx: t.sessionIdx, seriesId: now.series_id, sessionName: snap.name, summary, weeks, before: snap, after });
  }, [pendingCompare, template]);

  function moveSessionToDay(fromDay: string, sIdx: number, toDay: string) {
    if (fromDay === toDay) return;
    const moving = (template.weeks[weekIdx]?.[fromDay] as SessionTemplate[] | undefined)?.[sIdx];
    if (moving?.series_id) {
      const weeks = Array.from(new Set(following(template, moving.series_id, weekIdx).map(o => o.weekIdx)));
      if (weeks.length) { setRecurPrompt({ kind: "move", weekIdx, day: fromDay, sIdx, seriesId: moving.series_id, sessionName: moving.name, weeks, toDay }); }
    }
    setTemplate(prev => ({
      weeks: prev.weeks.map((w, wi) => {
        if (wi !== weekIdx) return w;
        const fromArr = [...((w[fromDay] ?? []) as SessionTemplate[])];
        const [moved] = fromArr.splice(sIdx, 1);
        if (!moved) return w;
        const toArr = [...((w[toDay] ?? []) as SessionTemplate[]), moved];
        return { ...w, [fromDay]: fromArr, [toDay]: toArr };
      }),
    }));
  }

  /* Déplace une ligne d'exercice — réordonnancement dans la même séance, ou drag cross-séance
     (2026-09-17) : `toDay`/`toSIdx` peuvent désigner une autre séance (même jour ou un autre),
     `toExIdx: null` = ajout en fin de séance cible (drop sur une séance vide). Mutation locale
     pure sur `template` — aucune écriture DB tant que le programme n'est pas enregistré, comme le
     reste de l'éditeur. `moveExerciseLine` recale aussi `exercise_media` des deux séances. */
  function moveExerciseInTemplate(fromDay: string, fromSIdx: number, fromExIdx: number, toDay: string, toSIdx: number, toExIdx: number | null) {
    const sameSession = fromDay === toDay && fromSIdx === toSIdx;
    if (sameSession && toExIdx === fromExIdx) return;
    // Réordonner par glisser dans une séance propose aussi « Cette semaine et les suivantes ».
    const moved = (template.weeks[weekIdx]?.[fromDay] as SessionTemplate[] | undefined)?.[fromSIdx];
    if (sameSession && moved) setPendingCompare({ t: { weekIdx, day: fromDay, sessionIdx: fromSIdx }, snap: { name: moved.name, notes: moved.notes, target_difficulty: moved.target_difficulty } });
    setTemplate(prev => {
      const w = prev.weeks[weekIdx];
      if (!w) return prev;
      const fromSession = ((w[fromDay] ?? []) as SessionTemplate[])[fromSIdx];
      const toSession = sameSession ? fromSession : ((w[toDay] ?? []) as SessionTemplate[])[toSIdx];
      if (!fromSession || !toSession) return prev;
      const result = moveExerciseLine({
        fromNotes: fromSession.notes, fromMedia: fromSession.exercise_media, fromIdx: fromExIdx,
        toNotes: toSession.notes, toMedia: toSession.exercise_media, toIdx: toExIdx,
        sameSession,
      });
      if (!result) return prev;
      return {
        weeks: prev.weeks.map((week, wi) => {
          if (wi !== weekIdx) return week;
          const fromArr = [...((week[fromDay] ?? []) as SessionTemplate[])];
          fromArr[fromSIdx] = { ...fromSession, notes: result.source.notes, exercise_media: result.source.media };
          if (fromDay === toDay) {
            // Même tableau de jour édité deux fois (2 séances distinctes le même jour) — une
            // seule affectation `[fromDay]: fromArr` à la fin, sinon la 1ère écrase la 2nde.
            fromArr[toSIdx] = { ...toSession, notes: result.target.notes, exercise_media: result.target.media };
            return { ...week, [fromDay]: fromArr };
          }
          const toArr = [...((week[toDay] ?? []) as SessionTemplate[])];
          toArr[toSIdx] = { ...toSession, notes: result.target.notes, exercise_media: result.target.media };
          return { ...week, [fromDay]: fromArr, [toDay]: toArr };
        }),
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { type?: string; day?: string; sIdx?: number; exIdx?: number } | undefined;
    if (activeData?.type === "exercise") {
      const overData = over.data.current as { type?: string; day?: string; sIdx?: number; exIdx?: number } | undefined;
      if (overData?.type === "exercise" && overData.day !== undefined && overData.sIdx !== undefined) {
        moveExerciseInTemplate(activeData.day!, activeData.sIdx!, activeData.exIdx!, overData.day, overData.sIdx, overData.exIdx ?? null);
        return;
      }
      if (overData?.type === "session" && overData.day !== undefined && overData.sIdx !== undefined) {
        moveExerciseInTemplate(activeData.day!, activeData.sIdx!, activeData.exIdx!, overData.day, overData.sIdx, null);
        return;
      }
      return;
    }
    if (activeData?.type === "session") {
      const overData = over.data.current as { type?: string; day?: string } | undefined;
      if (overData?.type !== "day" || !overData.day) return;
      moveSessionToDay(activeData.day!, activeData.sIdx!, overData.day);
    }
  }

  function applyReconduire(weeksOut: ReconduireOutputRow[][]) {
    const startIdx = template.weeks.length;
    // Reconduire = répéter : chaque copie rejoint la série de sa séance d'origine (créée au besoin).
    const last = template.weeks[template.weeks.length - 1];
    const ids = new Map<string, string>();
    weeksOut.flat().forEach(r => {
      if (!r.sourceId || ids.has(r.sourceId)) return;
      const [d, i] = r.sourceId.split(":");
      const src = (last?.[d] as SessionTemplate[] | undefined)?.[Number(i)];
      if (src) ids.set(r.sourceId, src.series_id ?? newSeriesId());
    });
    const newWeeks: WeekTemplate[] = weeksOut.map(rows => {
      const w: WeekTemplate = {};
      DAYS.forEach(d => { w[d] = []; });
      rows.forEach(r => {
        (w[DAYS[r.dayIndex]] as SessionTemplate[]).push({
          name: r.name, notes: r.notes || null, target_difficulty: r.target_difficulty, load: 2, type: "volume",
          ...(r.sourceId && ids.get(r.sourceId) ? { series_id: ids.get(r.sourceId) } : {}),
        });
      });
      return w;
    });
    setTemplate(prev => {
      const lastIdx = prev.weeks.length - 1;
      const weeks = prev.weeks.map((w, wi) => wi !== lastIdx ? w : Object.fromEntries(Object.entries(w).map(([d, list]) => [d,
        ((list ?? []) as SessionTemplate[]).map((x, i) => { const id = ids.get(`${d}:${i}`); return id && !x.series_id ? { ...x, series_id: id } : x; }),
      ])) as WeekTemplate);
      return { weeks: [...weeks, ...newWeeks] };
    });
    setWeekIdx(startIdx);
    setShowReconduire(false);
  }

  function duplicateSession(source: { weekIdx: number; day: string }, sourceIdx: number, targetWeekIdx: number, targetDay: string, adjust: ChargeAdjust = NO_ADJUST) {
    const sourceSession = ((template.weeks[source.weekIdx]?.[source.day] ?? []) as SessionTemplate[])[sourceIdx];
    if (!sourceSession) return;
    const notes = adjustNotesCharge(sourceSession.notes, adjust);
    const target_difficulty = adjustDifficultyCharge(sourceSession.target_difficulty ?? 6, adjust);
    setTemplate(prev => {
      const weeks = targetWeekIdx >= prev.weeks.length
        ? [...prev.weeks, DAYS.reduce((w, d) => ({ ...w, [d]: [] }), {} as WeekTemplate)]
        : prev.weeks;
      return {
        weeks: weeks.map((w, wi) => wi !== targetWeekIdx ? w : {
          // Dupliquer = copie indépendante (comme Google Agenda) : jamais dans la série de l'original.
          ...w, [targetDay]: [...((w[targetDay] ?? []) as SessionTemplate[]), { ...sourceSession, notes, target_difficulty, series_id: null, series_step: null }],
        }),
      };
    });
    setWeekIdx(targetWeekIdx);
    setDuplicateDay(null);
  }

  function deleteWeek(idx: number) {
    if (template.weeks.length <= 1) return;
    setTemplate(prev => ({ weeks: prev.weeks.filter((_, i) => i !== idx) }));
    setWeekIdx(prev => Math.min(prev, template.weeks.length - 2));
  }

  async function handleSave(mode: "library" | "assign") {
    if (!name.trim() || saving) return;
    setSaving(mode);
    setSaveError(null);
    try {
      if (mode === "library") await onSaveToLibrary(name, template);
      else await onSaveAndAssign(name, template);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur inattendue");
      setSaving(null);
    }
  }

  const fakeSession: Session | undefined = editingSession ? {
    id: `tpl-${editingTarget!.day}-${editingTarget!.sessionIdx}`,
    user_id: "template",
    date: "2026-01-01",
    name: editingSession.name,
    notes: editingSession.notes,
    duration: null,
    rpe: null,
    done: false,
    target_difficulty: editingSession.target_difficulty,
    created_at: "",
    exercise_media: editingSession.exercise_media,
  } : undefined;

  const lowDays = daySuggestions.filter(d => d.suggestion?.dir === "low").map(d => DAY_NAMES[d.day] ?? d.day);
  const highDays = daySuggestions.filter(d => d.suggestion?.dir === "high").map(d => DAY_NAMES[d.day] ?? d.day);
  const dayList = (days: string[]) => days.map((d, i) => <span key={d}>{i > 0 && ", "}<b>{d}</b></span>);
  const effectLine: React.ReactNode = impactedDays === 0
    ? "Aucun ajustement recommandé cette semaine à ce niveau de forme."
    : (
      <>
        {lowDays.length > 0 && <>Alléger recommandé sur {dayList(lowDays)}.</>}
        {lowDays.length > 0 && highDays.length > 0 && " "}
        {highDays.length > 0 && <>Surcharger possible sur {dayList(highDays)}.</>}
      </>
    );

  const autoregBanner = !showAutoregSimulator ? null : (
    <div style={{ margin: "10px 16px 14px", background: "linear-gradient(135deg,#161616,#282828 64%,#111)", borderRadius: 16, padding: "14px 16px", color: "#fff", position: "relative", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", right: -40, top: -40, width: 130, height: 130, borderRadius: "50%", background: "rgba(212,64,0,.16)", filter: "blur(24px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: isMd ? "row" : "column", alignItems: isMd ? "center" : "stretch", gap: isMd ? 20 : 14 }}>

        {/* Pitch — 50/50 avec le simulateur en desktop. */}
        <div style={{ flex: isMd ? "1 1 50%" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <h3 style={{ fontFamily: "var(--font-display)", margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>Programme autorégulé</h3>
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>
            {role === "coach"
              ? "Chaque jour, ThePerfClub compare la forme de tes sportifs à la séance prévue et te propose de l'ajuster pour progresser mieux, plus longtemps et loin des blessures."
              : "Chaque jour, ThePerfClub compare ta forme à la séance prévue et te propose de l'ajuster pour progresser mieux, plus longtemps et loin des blessures."}
          </div>
        </div>

        {/* Simulateur — même encadré que PublicProgramView.tsx (/p/[id]). */}
        <div style={{ flex: isMd ? "1 1 50%" : undefined, minWidth: 0, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "13px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,.65)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {role === "coach" ? "Simule leur forme" : "Simule ta forme"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#fff" }}>{simZoneLabel}</div>
              <WellnessRing score={simDisplayScore} size={50} strokeWidth={5} dark />
            </div>
          </div>

          <input
            type="range" min={0} max={100} value={simScore}
            onChange={e => setSimScore(Number(e.target.value))}
            className="tpc-autoreg-slider"
            style={{ width: "100%", height: 7, borderRadius: 8, WebkitAppearance: "none", appearance: "none", background: WELLNESS_TRACK_GRADIENT, outline: "none", cursor: "pointer" }}
          />
          <style>{`
            .tpc-autoreg-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
            .tpc-autoreg-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
          `}</style>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.4)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <span>Fatigué</span>
            <span>Frais</span>
          </div>

          <div style={{ marginTop: 9, fontSize: 12.5, color: "rgba(255,255,255,.9)", lineHeight: 1.45 }}>{effectLine}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", top: topOffset ?? 0, right: 0, bottom: 0, left: 0, background: "#f1f0ee", display: "flex", flexDirection: "column", zIndex: 2147483100 }}>
      {wizardHero}
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 20, padding: "4px 6px", borderRadius: 8, flexShrink: 0 }}>←</button>
        <input
          value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#171b1f", border: "none", outline: "none", background: "transparent", letterSpacing: "-0.02em", minWidth: 0, fontFamily: "var(--font-display)" }}
          placeholder="Nom du programme"
        />
        {onShare && (
          <button
            onClick={() => (shareGated ? gate(handleShare) : handleShare())}
            disabled={sharing}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              padding: "7px 12px", borderRadius: 12, whiteSpace: "nowrap",
              border: `1.5px solid ${shareCopied ? "#d44000" : "rgba(0,0,0,.10)"}`,
              background: shareCopied ? "rgba(212,64,0,0.06)" : "#fff",
              color: shareCopied ? "#d44000" : "#8a8f94",
              fontSize: 13, fontWeight: 700, cursor: sharing ? "not-allowed" : "pointer", opacity: sharing ? 0.6 : 1,
            }}
          >
            {shareCopied ? "✓ Copié" : "🔗 Partager"}
          </button>
        )}
      </div>

      {(() => {
        const pill = (
          <PeriodPill tone="light"
            onPrev={() => setWeekIdx(i => Math.max(0, i - 1))} prevDisabled={weekIdx === 0}
            onNext={() => setWeekIdx(i => Math.min(template.weeks.length - 1, i + 1))} nextDisabled={weekIdx === template.weeks.length - 1}
          >
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 800, color: "#171b1f", padding: "0 4px", whiteSpace: "nowrap" }}>Semaine {weekIdx + 1} sur {template.weeks.length}</span>
          </PeriodPill>
        );
        const bars = (
          <div style={{ minWidth: 0, display: "flex", gap: 4, alignItems: "flex-end", height: 26, overflowX: "auto" }}>
            {template.weeks.map((_, i) => {
              const avg = weekAvgLoads[i];
              const on = i === weekIdx;
              return (
                <div key={i} onClick={() => setWeekIdx(i)} title={`Semaine ${i + 1}`} style={{ width: 14, flexShrink: 0, height: Math.max(4, Math.round((avg / maxAvgLoad) * 24)), borderRadius: "2px 2px 0 0", background: loadBarColor(avg), opacity: on ? 1 : 0.35, outline: on ? "2px solid #171b1f" : "none", outlineOffset: 1, cursor: "pointer" }} />
              );
            })}
          </div>
        );
        const actions = (
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
            <button onClick={() => setShowReconduire(true)} style={{ padding: "6px 11px", borderRadius: 12, border: "1px solid rgba(0,0,0,.12)", cursor: "pointer", background: "#fff", color: "#62686e", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
              Reconduire →
            </button>
            {template.weeks.length > 1 && (
              <div ref={weekMenuRef} style={{ position: "relative" }}>
                <button aria-label="Plus d'actions sur la semaine" onClick={() => { setWeekMenu(m => !m); setConfirmDeleteWeek(false); }} style={{ width: 30, height: 30, borderRadius: 10, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 15, cursor: "pointer" }}>⋯</button>
                {weekMenu && (
                  <div style={{ position: "absolute", right: 0, top: 36, zIndex: 20, background: "#fff", borderRadius: 14, boxShadow: "0 12px 32px rgba(0,0,0,.18)", border: "1px solid rgba(0,0,0,.08)", padding: 6, minWidth: 210 }}>
                    <button
                      onClick={() => {
                        if (!confirmDeleteWeek) { setConfirmDeleteWeek(true); return; }
                        deleteWeek(weekIdx); setWeekMenu(false); setConfirmDeleteWeek(false);
                      }}
                      style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: confirmDeleteWeek ? "#fee2e2" : "transparent", color: "#c81e1e", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
                    >
                      {confirmDeleteWeek ? `Confirmer : supprimer la semaine ${weekIdx + 1}` : `🗑 Supprimer la semaine ${weekIdx + 1}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
        /* Semaines (2026-11-01) : même pilule « ‹ … › » que le sélecteur de date du Planning, centrée ;
           barres de charge (cliquables) à gauche, dessous sur mobile. Supprimer une semaine passe par
           le menu ⋯ avec confirmation (un × à côté du titre était trop facile à toucher). */
        return (
          <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "10px 14px", flexShrink: 0 }}>
            {isMd ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
                {bars}{pill}{actions}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center" }}>{pill}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>{bars}</div>
                  {actions}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Warning: programme with active assignments */}
      {assignmentCount > 0 && (
        <div style={{ background: "#fff8f0", borderBottom: "1px solid rgba(212,64,0,.15)", padding: "8px 18px", fontSize: 12, color: "#b96500", fontWeight: 600, flexShrink: 0 }}>
          ⚠️ Ce programme est suivi ({assignmentCount}) : en enregistrant, tu choisiras de mettre à jour les séances à venir ou de garder le planning actuel.
        </div>
      )}

      {/* 7-column grid — same layout as planning. Flouté au-delà de S1 pour un compte non actif
          (même pattern que /p/[id]/PublicProgramView.tsx : contenu réel toujours rendu, juste
          flouté/inerte, overlay CTA par-dessus — jamais de troncature côté données). */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ overflowY: "auto", height: "100%" }}>
      {autoregBanner}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 280px))",
        alignItems: "start",
        gap: 10,
        overflowX: "auto",
        padding: "14px 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
        filter: weekLocked ? "blur(7px)" : "none",
        pointerEvents: weekLocked ? "none" : "auto",
        userSelect: weekLocked ? "none" : "auto",
      }}>
        {DAYS.map((day, dayIdx) => {
          const daySessions = (week[day] ?? []) as SessionTemplate[];
          const prevSess = (week[DAYS[dayIdx - 1]] ?? []) as SessionTemplate[];
          const nextSess = (week[DAYS[dayIdx + 1]] ?? []) as SessionTemplate[];
          const ctx = {
            prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
            nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
          };
          const { targetSession, suggestion } = daySuggestions[dayIdx];
          const lock = concealFrom?.(weekIdx, day) ?? null;
          const cols = daySessions.map((s, sIdx) => ({ ...asDaySession(s, day, sIdx, lock), sIdx, tpl: s }));
          const planned = targetSession?.target_difficulty ?? 5;
          const zr = suggestion ? zoneRange(applyAutoregDifficulty(planned, suggestion.reco), suggestion.dir) : null;
          /* La colonne du Planning (06/11, Gildas : mêmes composants) : date, anneau dans l'encadré, cartes. */
          return (
            <div key={day}>
            <DroppableProgramDay day={day}>
            <DayColumn
              date={new Date(2001, 0, 1 + dayIdx, 12)}
              sessions={cols}
              todayStr="2000-01-01" wellness={null} hideDayNumber
              ctx={ctx}
              hideAddSession={!!lock}
              onAddSession={() => addSession(day)}
              onComplete={() => {}} onEdit={() => {}} onWellness={() => {}}
              ringState={suggestion && zr && targetSession ? { value: planned, zone: { low: zr.zoneLow, high: zr.zoneHigh } } : undefined}
              alert={suggestion ? {
                glow: suggestionSeverityColor(suggestion),
                border: suggestionSeverityColor(suggestion),
                text: `${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, planned, role === "coach" ? "tes sportifs" : undefined, simBaseline)}`,
              } : undefined}
              columnStyle={{ border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 6px 18px rgba(0,0,0,0.05)" }}
              renderSession={c => lock
                ? <WeekSessionCard key={c.id} session={c} hideActions onComplete={() => {}} onEdit={() => {}} />
                : <DraggableProgramSession key={c.id} day={day} sIdx={c.sIdx} session={c.tpl}
                    onClick={() => openEditor({ weekIdx, day, sessionIdx: c.sIdx })}
                    autoregReco={suggestion && c.tpl === targetSession ? suggestion.reco : undefined} />}
            />
            </DroppableProgramDay>
            </div>
          );
        })}
      </div>
      </div>
      </DndContext>
      {weekLocked && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(241,240,238,.55)" }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "20px 22px", maxWidth: 300, textAlign: "center", boxShadow: "0 14px 34px rgba(0,0,0,.14)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", marginBottom: 6, color: "#171b1f" }}>Débloque les semaines suivantes</div>
            <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.5, marginBottom: 14 }}>Visualise et personnalise l&apos;intégralité du programme généré, pas seulement la première semaine.</div>
            <button onClick={() => onUnlockClick ? onUnlockClick() : gate(() => {})} style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>
              Débloquer →
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Bottom */}
      {saveError && (
        <div style={{ background: "rgba(212,64,0,.1)", padding: "8px 18px", fontSize: 12, color: "#d44000", fontWeight: 600 }}>
          ⚠️ {saveError}
        </div>
      )}
      <div style={{ background: "#fff", borderTop: "1px solid rgba(0,0,0,.08)", padding: "12px 18px 20px", display: "flex", gap: 10, flexShrink: 0 }}>
        {footerVariant === "wizardSingle" ? (
          <button onClick={() => gate(() => handleSave("library"))} disabled={!name.trim() || saving !== null} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", cursor: name.trim() && !saving ? "pointer" : "not-allowed", background: name.trim() && !saving ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df", color: name.trim() && !saving ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, boxShadow: name.trim() && !saving ? "0 4px 12px rgba(212,64,0,.20)" : "none" }}>
            {saving === "library" ? "Enregistrement…" : wizardSingleLabel}
          </button>
        ) : (
          <>
            <button onClick={() => gate(() => handleSave("library"))} disabled={!name.trim() || saving !== null} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "2px solid rgba(0,0,0,.10)", cursor: name.trim() && !saving ? "pointer" : "not-allowed", background: name.trim() && !saving ? "#faf9f7" : "#f5f5f5", color: name.trim() && !saving ? "#555" : "#aaa", fontWeight: 700, fontSize: 13 }}>
              {saving === "library" ? "Enregistrement…" : "💾 Enregistrer en librairie"}
            </button>
            <button onClick={() => gate(() => handleSave("assign"))} disabled={!name.trim() || saving !== null} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", cursor: name.trim() && !saving ? "pointer" : "not-allowed", background: name.trim() && !saving ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df", color: name.trim() && !saving ? "#fff" : "#aaa", fontWeight: 700, fontSize: 13, boxShadow: name.trim() && !saving ? "0 4px 12px rgba(212,64,0,.20)" : "none" }}>
              {saving === "assign" ? "Assignation…" : "👤 Assigner →"}
            </button>
          </>
        )}
      </div>

      {showReconduire && (() => {
        const lastWeek = template.weeks[template.weeks.length - 1];
        const daySlots = DAYS.map(day => ({
          sessions: ((lastWeek[day] ?? []) as SessionTemplate[]).map((s, idx) => ({
            id: `${day}:${idx}`, date: "", name: s.name, notes: s.notes,
            duration: null, rpe: null, done: false, target_difficulty: s.target_difficulty,
          })),
        }));
        return (
          <ReconduireModal
            daySlots={daySlots}
            title="Reconduire la dernière semaine"
            onClose={() => setShowReconduire(false)}
            onConfirm={async (weeksOut) => applyReconduire(weeksOut)}
            topOffset={topOffset}
          />
        );
      })()}

      {duplicateDay && (() => {
        const daySessions = (template.weeks[duplicateDay.weekIdx]?.[duplicateDay.day] ?? []) as SessionTemplate[];
        if (!daySessions.length) return null;
        return (
          <DuplicateTemplateModal
            sessions={daySessions}
            weeksCount={template.weeks.length}
            defaultWeekIdx={duplicateDay.weekIdx}
            defaultDay={duplicateDay.day}
            defaultSourceIdx={duplicateDay.sIdx}
            onClose={() => setDuplicateDay(null)}
            onConfirm={(sourceIdx, targetWeekIdx, targetDay, adjust) => duplicateSession(duplicateDay, sourceIdx, targetWeekIdx, targetDay, adjust)}
          />
        );
      })()}

      {editingSession && editingTarget && fakeSession && (
        <AddSessionModal
          date={fakeSession.date}
          session={fakeSession}
          hideDate
          userName={userName}
          authorRole={role}
          sport={sport}
          onSave={async (data) => {
            // Autosave (2026-09-06) — mutation locale du template à chaque frappe (aucune écriture
            // DB tant que le programme n'est pas enregistré/assigné), ne ferme plus le drawer :
            // onClose s'en charge séparément.
            updateSession(editingTarget.weekIdx, editingTarget.day, editingTarget.sessionIdx, { name: data.name, notes: data.notes || null, target_difficulty: data.target_difficulty, exercise_media: data.exercise_media });
          }}
          onDelete={async () => {
            const t = editingTarget;
            const sid = (template.weeks[t.weekIdx]?.[t.day] as SessionTemplate[] | undefined)?.[t.sessionIdx]?.series_id;
            const weeks = sid ? Array.from(new Set(following(template, sid, t.weekIdx).map(o => o.weekIdx))) : [];
            setEditingTarget(null); setEditSnapshot(null);
            if (sid && weeks.length) { setRecurPrompt({ kind: "delete", weekIdx: t.weekIdx, day: t.day, sIdx: t.sessionIdx, seriesId: sid, sessionName: editingSession.name, weeks }); return; }
            removeSession(t.weekIdx, t.day, t.sessionIdx);
          }}
          belowTitle={
            <SeriesRow
              label={seriesLabel(template, editingSession.series_id, d => DAY_NAMES[d] ?? d)}
              onRepeat={editingTarget.weekIdx < template.weeks.length - 1 ? () => setRepeatFor(editingTarget) : undefined}
            />
          }
          onDuplicate={() => {
            // Même pied de tiroir que le Planning : 🗑 · ⎘ Dupliquer · Fermer.
            setDuplicateDay({ weekIdx: editingTarget.weekIdx, day: editingTarget.day, sIdx: editingTarget.sessionIdx });
            setEditingTarget(null);
            setEditSnapshot(null);
          }}
          onClose={closeEditor}
          topOffset={topOffset}
        />
      )}

      {recurPrompt && (() => {
        const p = recurPrompt;
        const dayLow = (d: string) => (DAY_NAMES[d] ?? d).toLowerCase();
        const title = p.kind === "edit" ? `Modifier « ${p.sessionName} » du ${dayLow(p.day)}`
          : p.kind === "move" ? `Déplacer « ${p.sessionName} » au ${dayLow(p.toDay ?? p.day)}`
          : `Supprimer « ${p.sessionName} »`;
        return (
          <SeriesChoiceModal
            title={title}
            summary={p.summary}
            untilOptions={p.kind === "edit" ? p.weeks.map(i => ({ value: String(i), label: `S${i + 1}` })) : undefined}
            defaultAll={p.kind !== "delete"}
            confirmLabel={p.kind === "delete" ? "Supprimer" : "OK"}
            onCancel={p.kind === "delete" ? () => setRecurPrompt(null) : undefined}
            onConfirm={(all, until) => {
              if (all) {
                if (p.kind === "edit" && p.before && p.after) {
                  const step = (template.weeks[p.weekIdx]?.[p.day] as SessionTemplate[] | undefined)?.[p.sIdx]?.series_step;
                  const untilIdx = until != null ? Number(until) : p.weeks[p.weeks.length - 1];
                  setTemplate(prev => propagateEdit(prev, p.seriesId, p.weekIdx, untilIdx, p.before!, p.after!, step));
                }
                if (p.kind === "move" && p.toDay) setTemplate(prev => moveFollowing(prev, p.seriesId, p.weekIdx, p.toDay!));
                if (p.kind === "delete") setTemplate(prev => deleteFollowing(prev, p.seriesId, p.weekIdx));
              } else if (p.kind === "delete") removeSession(p.weekIdx, p.day, p.sIdx);
              setRecurPrompt(null);
            }}
          />
        );
      })()}

      {repeatFor && (() => {
        const t = repeatFor;
        const src = (template.weeks[t.weekIdx]?.[t.day] as SessionTemplate[] | undefined)?.[t.sessionIdx];
        if (!src) return null;
        const options = Array.from({ length: template.weeks.length - t.weekIdx - 1 }, (_, k) => t.weekIdx + 1 + k);
        return (
          <RepeatModal
            sessionName={src.name}
            dayLabel={(DAY_NAMES[t.day] ?? t.day).toLowerCase()}
            untilOptions={options.map(i => ({ value: String(i), label: `S${i + 1}` }))}
            onCancel={() => setRepeatFor(null)}
            onConfirm={(until, step) => {
              setTemplate(prev => repeatSession(prev, { weekIdx: t.weekIdx, day: t.day, sIdx: t.sessionIdx }, Number(until), step));
              // Le tiroir reste ouvert : sa comparaison repart de l'état répété (pas de question en double).
              setEditSnapshot({ name: src.name, notes: src.notes, target_difficulty: src.target_difficulty });
              setRepeatFor(null);
            }}
          />
        );
      })()}
    </div>
  );
}
