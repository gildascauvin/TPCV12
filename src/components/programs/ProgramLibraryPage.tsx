"use client";

import { Skel } from "@/components/ui/Skeleton";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Program, CoachAthlete, ProgramAssignment } from "@/types";
import ProgramCriteriaModal, { type ProgramMeta } from "./ProgramCriteriaModal";
import ProgramCreatePicker from "./ProgramCreatePicker";
import ProgramLibraryBrowser, { type LibraryProgram, fetchLibraryTemplate } from "./ProgramLibraryBrowser";
import { CreateTiles, TemplateSections, Cover, Carousel, SectionHeader } from "./ProgramStoreSections";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";
import ProgramTemplateDetail from "./ProgramTemplateDetail";
import { programWeekIndex } from "@/lib/programAssignment";
import ProgramBuilderModal from "./ProgramBuilderModal";
import ProgramAssignModal from "./ProgramAssignModal";
import type { ProgramTemplate } from "@/types";
import { programSportEmoji } from "@/lib/sportCategories";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function weekAvgRpes(program: Program): number[] {
  return program.template.weeks.map(week => {
    const sessions = DAYS.flatMap(d => (week[d] ?? []) as { target_difficulty: number }[]);
    if (!sessions.length) return 0;
    return sessions.reduce((s, x) => s + (x.target_difficulty ?? 5), 0) / sessions.length;
  });
}

function loadBarColor(avg: number): string {
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface Props {
  athletes: CoachAthlete[];
  selfUserId?: string;
  activeProgram?: Program | null;
  activeProgramWeek?: number;
  requireSubscription?: (fn: () => void) => void;
  /* Vue au-delà de S1 gatée dans le builder (2026-08-19) — même principe que /p/[id] (flou +
     overlay, jamais les onglets de semaine eux-mêmes) : sans ça, un free peut générer et
     consulter des programmes complets à l'infini. Absent = jamais floué (repli permissif,
     cohérent avec requireSubscription optionnel juste au-dessus). */
  isActive?: boolean;
  onClose: () => void;
  /* Sandbox uniquement (2026-08-20) : la bibliothèque ne peut pas être "la tienne" (visiteur
     anonyme) — fetchPrograms() lit /api/sandbox/library (8 programmes publics réels, un par
     grande famille de curriculum) au lieu de /api/programs (bibliothèque du compte courant).
     Aucun autre changement : même liste, même builder, mêmes gates (Enregistrer/Assigner). */
  sandboxMode?: boolean;
  /* Routage rapide depuis le "+" central de la nav (2026-08-31) : "new" saute directement
     l'écran liste pour ouvrir le picker de création (ProgramCreatePicker). */
  /* "import" (2026-10-01) : carte "Aucune séance aujourd'hui" → ouvre directement l'import. */
  initialStep?: "new" | "import";
  /* "Modifier →" du bandeau programme (2026-10-01) : la liste s'ouvre centrée sur ce programme. */
  focusProgramId?: string;
  /* Onglet "Programmes" de la bottom nav (2026-09-01) — true uniquement depuis
     ProgramLibraryStandalone (route /programmes). L'écran liste devient alors une page normale
     (plus de position:fixed plein écran, plus de flèche retour) pour laisser la bottom nav
     visible en dessous, comme n'importe quelle autre page. Les autres steps (new/criteria/
     builder/assign) restent des overlays plein écran dans tous les cas — cohérent avec le fait
     que le builder a déjà ses propres boutons sticky Enregistrer/Assigner, pas besoin de la nav
     à cet endroit. Absent/false = comportement modal historique inchangé (usage WeekClient.tsx/
     CoachPlanningClient.tsx via le "+" central, flèche retour + plein écran). */
  standalone?: boolean;
  /* Sport de l'utilisateur (profil) : section "Pour toi" des modèles, masquée s'il est inconnu. */
  userSport?: string | null;
}

type UIStep =
  | { type: "list" }
  | { type: "new" }
  | { type: "criteria"; mode: "criteria" | "import" }
  | { type: "library" }
  | { type: "detail"; program: LibraryProgram }
  | { type: "builder"; template: ProgramTemplate; meta: ProgramMeta; programId?: string; programName?: string; assignmentCount?: number }
  | { type: "assign"; programId: string; programName: string };

const BLANK_PROGRAM_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const NEUTRAL_LEVEL = "intermediaire" as const;

const AVATAR_COLORS = ["#d44000", "#2f9e44", "#1d6fdb", "#7c3aed", "#b96500"];

export default function ProgramLibraryPage({ athletes, selfUserId, activeProgram, activeProgramWeek, requireSubscription, isActive, onClose, sandboxMode = false, initialStep, focusProgramId, standalone = false, userSport }: Props) {
  const gate = (fn: () => void) => requireSubscription ? requireSubscription(fn) : fn();
  const router = useRouter();
  const { isMd } = useBreakpoint();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<UIStep>(initialStep === "new" ? { type: "new" } : initialStep === "import" ? { type: "criteria", mode: "import" } : { type: "list" });
  const [linkCopied, setLinkCopied] = useState<Record<string, boolean>>({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  /* Menus "⋯" en position fixe (2026-10-04) : la liste "Mes programmes" est un carrousel qui défile
     horizontalement, ce qui rognerait un menu en position absolue. Position = coin du bouton. */
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  function placeMenu(e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const up = r.bottom > window.innerHeight - 140;
    setMenuPos({ top: up ? r.top - 6 : r.bottom + 6, right: window.innerWidth - r.right, up });
  }
  // Choix après enregistrement d'un programme suivi : mettre à jour les séances à venir ou non.
  const [resyncPrompt, setResyncPrompt] = useState<{ programId: string; names: string[] } | null>(null);
  const [resyncBusy, setResyncBusy] = useState(false);
  // "✎ Changer la date de départ" — assignment en cours d'édition + nouvelle date.
  const [dateEdit, setDateEdit] = useState<{ assignmentId: string; date: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Menu "⋯" d'un sportif qui suit un programme (Changer la date / Arrêter).
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const todayStr = new Date().toISOString().split("T")[0];

  /* Sortie d'un step "création" (new/criteria/builder/assign) — 2026-09-01. En standalone
     (/programmes), revient à l'écran liste de CETTE page. En modal (WeekClient.tsx/
     CoachPlanningClient.tsx, ouvert via le "+" central) : l'écran liste n'est plus jamais
     affiché depuis ce contexte (position:fixed retirée uniquement pour le rendu standalone —
     le montrer non-fixed ici s'empilerait sous le contenu réel de /week) — fermer doit donc
     rendre la main à la page d'origine (onClose), jamais retomber sur "list". */
  const closeOrList = () => { if (standalone) setStep({ type: "list" }); else onClose(); };
  // Retour depuis un écran de création : sur la page, les tuiles "Crée le tien" remplacent le
  // tiroir "Créer un programme" → retour à la page ; en modale, retour au tiroir comme avant.
  const backToCreate = () => setStep(standalone ? { type: "list" } : { type: "new" });

  function createBlankProgram() {
    const week: Record<string, never[]> = {};
    BLANK_PROGRAM_DAYS.forEach(d => { week[d] = []; });
    const template: ProgramTemplate = { weeks: [week] };
    const meta: ProgramMeta = { sport: "Programme vierge", level: NEUTRAL_LEVEL, focus: "mixte", days: [], duration: 4 };
    setStep({ type: "builder", template, meta, programName: "Programme vierge" });
  }

  async function fetchPrograms() {
    const res = await fetch(sandboxMode ? "/api/sandbox/library" : "/api/programs");
    if (res.ok) {
      const d = await res.json();
      setPrograms(d.programs ?? []);
      setAssignments(d.assignments ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchPrograms(); }, []);
  useEffect(() => {
    if (loading || !focusProgramId) return;
    document.getElementById(`program-${focusProgramId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
  }, [loading, focusProgramId]);

  async function saveProgram(name: string, template: ProgramTemplate, meta: ProgramMeta): Promise<string | null> {
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sport: meta.sport || null, level: meta.level, focus: meta.focus, weeks_count: template.weeks.length, sessions_per_week: meta.days.length, template }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "Échec de la sauvegarde");
    }
    const d = await res.json();
    return d.program?.id ?? null;
  }

  async function updateProgram(id: string, name: string, template: ProgramTemplate) {
    const res = await fetch(`/api/programs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, template, weeks_count: template.weeks.length }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Erreur lors de la sauvegarde");
    }
    fetchPrograms();
  }

  async function deleteProgram(id: string) {
    if (!confirm("Supprimer ce programme ?")) return;
    await fetch(`/api/programs/${id}`, { method: "DELETE" });
    setPrograms(p => p.filter(x => x.id !== id));
  }

  async function stopAssignment(assignmentId: string) {
    if (!confirm("Arrêter ce programme ? Les séances futures non terminées seront supprimées.")) return;
    await fetch(`/api/program-assignments/${assignmentId}`, { method: "DELETE" });
    fetchPrograms();
  }

  /* Noms des sportifs qui suivent un programme (en cours ou à venir) — "Moi" pour le sportif lui-même. */
  function followerNames(programId: string): string[] {
    return assignments
      .filter(a => a.program_id === programId && a.status === "active")
      .map(a => (selfUserId && a.user_id === selfUserId) ? "Moi" : (athletes.find(x => x.id === a.athlete_id || (!!a.user_id && x.user_id === a.user_id))?.name ?? "—"));
  }

  async function runResync(programId: string) {
    setResyncBusy(true);
    await fetch(`/api/programs/${programId}/resync`, { method: "POST" }).catch(() => {});
    setResyncBusy(false);
    setResyncPrompt(null);
    closeOrList();
  }

  /* Changer la date de départ en un geste : arrêt (séances futures non faites retirées) + réassignation
     à la nouvelle date. Démarrer aujourd'hui aligne la 1re séance sur aujourd'hui. */
  async function changeStartDate(a: ProgramAssignment, newDate: string) {
    setRowBusy(a.id);
    try {
      const del = await fetch(`/api/program-assignments/${a.id}`, { method: "DELETE" });
      if (!del.ok) throw new Error();
      await fetch(`/api/programs/${a.program_id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: a.user_id ? undefined : a.athlete_id, user_id: a.user_id ?? undefined, start_date: newDate, align_first_session: newDate === todayStr }),
      });
    } finally {
      setRowBusy(null);
      setDateEdit(null);
      fetchPrograms();
    }
  }

  /* Partager — tous les programmes sont partageables par défaut (2026-09-05, simplifié à la
     demande de Gildas après un 1er design public/privé jugé inutilement compliqué — bug réel
     trouvé au passage : l'ancienne version "toggleShare" inversait is_public à chaque clic, donc
     re-cliquer "Partager" sur un programme déjà public — ex. les 64 de la bibliothèque du compte
     coach — le rendait privé). Aucune notion de public/privé exposée à l'user : le clic garantit
     juste que le lien existe (is_public reste un détail d'implémentation, requis par la route
     GET /p/[id] pour bypasser RLS) et le copie — jamais de bascule, jamais de "rendre privé". */
  async function shareProgram(p: Program) {
    if (!p.is_public) {
      await fetch(`/api/programs/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: true }),
      });
      fetchPrograms();
    }
    const url = `${window.location.origin}/p/${p.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setLinkCopied(c => ({ ...c, [p.id]: true }));
    setTimeout(() => setLinkCopied(c => ({ ...c, [p.id]: false })), 2000);
  }

  async function duplicateProgram(p: Program) {
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, name: `${p.name} (copie)`, id: undefined, owner_id: undefined, created_at: undefined, updated_at: undefined }),
    });
    if (res.ok) fetchPrograms();
  }

  async function openTemplate(p: LibraryProgram) {
    const template = p.template ?? await fetchLibraryTemplate(p.id);
    const meta: ProgramMeta = {
      sport: p.sport ?? "", level: p.level ?? "intermediaire", focus: p.focus ?? "mixte",
      days: ["Lun", "Mer", "Ven"], duration: p.weeks_count as ProgramMeta["duration"],
    };
    setStep({ type: "builder", template, meta, programName: p.name });
  }

  /* Programme suivi par le sportif lui-même, en cours : badge "En cours · S3/8" sur sa carte. */
  function selfProgress(p: Program): string | null {
    if (!selfUserId) return null;
    const a = assignments.find(x => x.program_id === p.id && x.status === "active" && x.user_id === selfUserId);
    if (!a) return null;
    const idx = programWeekIndex(a.start_date, todayStr);
    if (idx < 0) return "Démarre bientôt";
    if (idx >= p.weeks_count) return null;
    return `En cours · S${idx + 1}/${p.weeks_count}`;
  }

  const coachSide = !selfUserId;
  const resyncModal = resyncPrompt && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 2147483300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em", marginBottom: 6 }}>
          Programme enregistré
        </div>
        <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.5, marginBottom: 14 }}>
          {coachSide
            ? <>Suivi par {resyncPrompt.names.join(", ")}. Leurs séances déjà faites ne bougent pas, les dates restent les mêmes.</>
            : <>Tes séances déjà faites ne bougent pas, les dates restent les mêmes.</>}
        </div>
        <button
          disabled={resyncBusy}
          onClick={() => runResync(resyncPrompt.programId)}
          style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 8, opacity: resyncBusy ? .6 : 1 }}
        >
          {resyncBusy ? "Mise à jour…" : coachSide ? "Mettre à jour leurs séances à venir" : "Mettre à jour mes séances à venir"}
        </button>
        <button
          disabled={resyncBusy}
          onClick={() => { setResyncPrompt(null); closeOrList(); }}
          style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", color: "#555", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Garder {coachSide ? "le" : "mon"} planning actuel
        </button>
      </div>
    </div>
  );

  /* ─── Picker "+ Nouveau" (écran racine du flux de création, 4 cartes à plat) ─── */
  if (step.type === "new") {
    return (
      <ProgramCreatePicker
        onClose={closeOrList}
        onGenerate={() => setStep({ type: "criteria", mode: "criteria" })}
        onImport={() => setStep({ type: "criteria", mode: "import" })}
        onTemplate={() => setStep({ type: "library" })}
        onBlank={() => createBlankProgram()}
      />
    );
  }

  /* ─── Bibliothèque publique (2026-09-04, remplace le lien externe WordPress — "natif",
       demande explicite de Gildas) ─── */
  if (step.type === "library") {
    return (
      <ProgramLibraryBrowser
        onClose={closeOrList}
        onBack={backToCreate}
        onSelect={(template, meta, name) => setStep({ type: "builder", template, meta, programName: name })}
      />
    );
  }

  /* ─── Fiche d'un modèle (2026-10-03, V2) : démarrer/assigner = copie dans la bibliothèque puis
       assignation ; personnaliser = éditeur. Sandbox : la porte d'inscription. ─── */
  if (step.type === "detail") {
    const p = step.program;
    return (
      <ProgramTemplateDetail
        program={p}
        role={coachSide ? "coach" : "athlete"}
        onBack={() => setStep({ type: "list" })}
        onCustomize={() => openTemplate(p)}
        onStart={async () => {
          if (sandboxMode) { gate(() => {}); return; }
          const meta: ProgramMeta = { sport: p.sport ?? "", level: p.level ?? "intermediaire", focus: p.focus ?? "mixte", days: ["Lun", "Mer", "Ven"], duration: p.weeks_count as ProgramMeta["duration"] };
          const template = p.template ?? await fetchLibraryTemplate(p.id);
          const id = await saveProgram(p.name, template, meta);
          if (!id) throw new Error("Impossible d'enregistrer ce programme");
          await fetchPrograms();
          setStep({ type: "assign", programId: id, programName: p.name });
        }}
      />
    );
  }

  /* ─── Criteria / Import (même drawer, mode fixé par le picker "+ Nouveau") ─── */
  if (step.type === "criteria") {
    const mode = step.mode;
    return (
      <ProgramCriteriaModal
        mode={mode}
        onClose={closeOrList}
        onBack={backToCreate}
        onGenerate={(template, meta) => {
          const defaultName = mode === "import" ? "Programme importé" : (meta.sport ? `Programme ${meta.sport}` : "Mon programme");
          setStep({ type: "builder", template, meta, programName: defaultName });
        }}
      />
    );
  }

  /* ─── Builder ─── */
  if (step.type === "builder") {
    const isEdit = !!step.programId;
    return (
      <>
      {resyncModal}
      <ProgramBuilderModal
        programName={step.programName ?? (step.meta.sport ? `Programme ${step.meta.sport}` : "Mon programme")}
        template={step.template}
        assignmentCount={step.assignmentCount ?? 0}
        requireSubscription={requireSubscription}
        isActive={isActive}
        onBack={() => (isEdit ? setStep({ type: "list" }) : backToCreate())}
        onSaveToLibrary={async (name, template) => {
          if (isEdit) await updateProgram(step.programId!, name, template);
          else await saveProgram(name, template, step.meta);
          await fetchPrograms();
          const names = isEdit ? followerNames(step.programId!) : [];
          if (names.length) setResyncPrompt({ programId: step.programId!, names });
          else closeOrList();
        }}
        onSaveAndAssign={async (name, template) => {
          let id = step.programId;
          if (isEdit) await updateProgram(id!, name, template);
          else id = await saveProgram(name, template, step.meta) ?? undefined;
          await fetchPrograms();
          if (id) setStep({ type: "assign", programId: id, programName: name });
          else closeOrList();
        }}
        shareGated={sandboxMode}
        onShare={async (name, template) => {
          let id = step.programId;
          if (isEdit) await updateProgram(id!, name, template);
          else {
            id = await saveProgram(name, template, step.meta) ?? undefined;
            if (id) setStep(prev => prev.type === "builder" ? { ...prev, programId: id } : prev);
          }
          if (!id) throw new Error("Échec du partage");
          await fetch(`/api/programs/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_public: true }),
          });
          await fetchPrograms();
          return `${window.location.origin}/p/${id}`;
        }}
      />
      </>
    );
  }

  /* ─── Assign ─── */
  if (step.type === "assign") {
    return (
      <ProgramAssignModal
        programId={step.programId}
        programName={step.programName}
        athletes={athletes}
        selfUserId={selfUserId}
        onClose={closeOrList}
        onAssigned={() => { fetchPrograms(); closeOrList(); }}
      />
    );
  }

  /* ─── Liste (pleine page) — boutique (2026-10-03) : créer en premier, mes programmes, puis
       "Pour toi" et tous les modèles (ProgramStoreSections.tsx). ─── */
  const sortedPrograms = [...programs].sort((x, y) => Number(!!selfProgress(y)) - Number(!!selfProgress(x)));
  return (
    <div style={standalone
      /* Fond clair étendu sous la marge réservée à la navigation (même procédé que les autres pages),
         sinon le fond sombre de l'app apparaît en bas. */
      ? { background: "#f1f0ee", minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }
      : { position: "fixed", inset: 0, background: "#f1f0ee", zIndex: 2147483100, display: "flex", flexDirection: "column" }
    }>
      <div style={standalone ? undefined : { flex: 1, overflowY: "auto" }}>
      {/* En-tête sur le fond sombre de l'app (2026-10-04, demande de Gildas), le reste reste clair. */}
      <div style={{ background: DARK_CARD_BG }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: standalone ? "22px 20px 26px" : "16px 20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {/* Flèche retour seulement en modale : /programmes est une vraie page (bottom nav). */}
            {!standalone && (
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.7)", fontSize: 18, padding: "4px 8px 4px 0" }}>←</button>
            )}
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: isMd ? 30 : 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", margin: 0 }}>Programmes</h1>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 2 }}>Chaque séance s&apos;ajuste à la forme du jour.</div>
            </div>
          </div>
          <CreateTiles
            dark
            onGenerate={() => setStep({ type: "criteria", mode: "criteria" })}
            onImport={() => setStep({ type: "criteria", mode: "import" })}
            onBlank={() => createBlankProgram()}
          />
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 24px" }}>

        {loading ? (
          <div style={{ marginTop: 32 }}>
            <Skel w={170} h={18} style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 14, overflow: "hidden" }}>{[0, 1, 2].map(i => <Skel key={i} w={isMd ? "calc((100% - 28px) / 3)" : "86%"} h={300} r={16} />)}</div>
          </div>
        ) : programs.length === 0 ? null : (
          <>
          <div style={{ marginTop: 32 }}>
            <SectionHeader title="Mes programmes" sub={coachSide ? "Tes programmes et les sportifs qui les suivent" : "Tes programmes enregistrés"} count={programs.length} />
          </div>
          {/* Carrousel horizontal (2026-10-04) : flèche + points, cartes de même hauteur alignées sur le contenu. */}
          <Carousel itemWidth={isMd ? "calc((100% - 28px) / 3)" : "86%"}>
            {sortedPrograms.map(p => {
              const bars = weekAvgRpes(p);
              const progress = selfProgress(p);
              const maxBar = Math.max(...bars, 1);
              const emoji = programSportEmoji(p.sport);
              const programAssignments = assignments.filter(a => {
                if (a.program_id !== p.id || a.status !== "active") return false;
                // N'affiche que les sportifs dont le programme n'est pas encore terminé
                // (en cours ou à venir) — un programme déjà fait n'a plus d'intérêt ici.
                const start = new Date(a.start_date + "T12:00:00").getTime();
                const end = start + p.weeks_count * 7 * 24 * 60 * 60 * 1000;
                return Date.now() < end;
              });

              return (
                <div key={p.id} id={`program-${p.id}`} style={{ width: "100%", display: "flex", flexDirection: "column", position: "relative", overflow: "visible", background: "#fff", borderRadius: 16, padding: "18px 18px 14px", border: p.id === focusProgramId ? "2px solid #d44000" : "1px solid rgba(0,0,0,.07)", boxShadow: p.id === focusProgramId ? "0 8px 24px rgba(212,64,0,.12)" : "0 2px 12px rgba(0,0,0,.04)" }}>
                  {/* Partager — haut à droite de la carte (2026-09-05, demande explicite de
                      Gildas) — reste ici plutôt que dans la ligne d'actions du bas, qui ne garde
                      que les 2 CTA principaux + le menu "⋯" (Dupliquer/Supprimer). Style piloté
                      uniquement par la confirmation "Copié" (transitoire) — aucune notion de
                      public/privé exposée (voir `shareProgram`). */}
                  <button
                    onClick={() => gate(() => shareProgram(p))}
                    title="Copier le lien de partage"
                    style={{
                      position: "absolute", top: 14, right: 14, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
                      padding: "6px 10px", borderRadius: 999,
                      zIndex: 2, border: "none",
                      background: linkCopied[p.id] ? "#d44000" : "rgba(255,255,255,.92)",
                      color: linkCopied[p.id] ? "#fff" : "#171b1f", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {linkCopied[p.id] ? "✓ Copié" : "🔗 Partager"}
                  </button>

                  {/* Bandeau visuel : photo du programme officiel, sinon dégradé de la famille + emoji. */}
                  <Cover id={p.id} sport={p.sport} sizes="(min-width: 640px) 360px, 86vw" emojiSize={40} emojiAt="bottom-left" style={{ height: 110, margin: "-18px -18px 14px", borderRadius: "16px 16px 0 0" }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 40%, rgba(0,0,0,.35))" }} />
                    {(progress || (coachSide && programAssignments.length > 0)) && (
                      <div style={{ position: "absolute", left: 12, top: 12, fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, color: "#fff", background: progress ? "rgba(47,158,68,.92)" : "rgba(23,27,31,.75)", padding: "4px 9px", borderRadius: 999 }}>
                        {progress ?? `${programAssignments.length} sportif${programAssignments.length > 1 ? "s" : ""}`}
                      </div>
                    )}
                  </Cover>

                  {/* Name */}
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em", marginBottom: 4, lineHeight: 1.2 }}>
                    {p.name}
                  </div>

                  {/* Meta */}
                  <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 12 }}>
                    {[p.sport, `${p.weeks_count} semaines`, `${p.sessions_per_week}j/sem`].filter(Boolean).join(" · ")}
                  </div>

                  {/* Load bars + label inline */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 18, flexShrink: 0 }}>
                      {bars.map((b, i) => (
                        <div key={i} style={{ width: 6, borderRadius: "2px 2px 0 0", height: Math.max(3, Math.round((b / maxBar) * 16)), background: loadBarColor(b) }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: "#d44000", fontWeight: 700, cursor: "pointer" }}>Charge planifiée →</span>
                  </div>

                  {/* Athletes following */}
                  {programAssignments.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#8a8f94", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                        Suit ce programme ({programAssignments.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {programAssignments.map((a, ai) => {
                          const isSelf = selfUserId && a.user_id === selfUserId;
                          const athlete = athletes.find(x => x.id === a.athlete_id || (!!a.user_id && x.user_id === a.user_id));
                          const displayName = isSelf ? "Moi" : (athlete?.name ?? "—");
                          const color = AVATAR_COLORS[ai % AVATAR_COLORS.length];
                          return (
                            <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6, borderBottom: "1px solid rgba(0,0,0,.05)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, color }}>{initials(displayName)}</span>
                                </div>
                                <span
                                  onClick={() => { onClose(); router.push(isSelf ? (sandboxMode ? "/sandbox/athlete/week" : `/week?date=${a.start_date > todayStr ? a.start_date : todayStr}`) : `${sandboxMode ? "/sandbox" : ""}/coach/planning?athlete=${a.athlete_id}`); }}
                                  title="Voir le planning"
                                  style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#171b1f", cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,.2)", textUnderlineOffset: 3 }}
                                >{displayName}</span>
                                <span style={{ fontSize: 11, color: "#8a8f94" }}>{a.start_date > todayStr ? "Démarre" : "Démarré"} {fmtDate(a.start_date)}</span>
                                <div style={{ position: "relative" }}>
                                  <button
                                    onClick={e => { placeMenu(e); setRowMenuId(id => id === a.id ? null : a.id); }}
                                    aria-label="Actions"
                                    style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#f1f0ee", color: "#8a8f94", fontSize: 14, cursor: "pointer", lineHeight: 1 }}
                                  >⋯</button>
                                  {rowMenuId === a.id && (
                                    <>
                                      <div onClick={() => setRowMenuId(null)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                                      <div style={{ position: "fixed", top: menuPos?.top, right: menuPos?.right, transform: menuPos?.up ? "translateY(-100%)" : undefined, background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 8px 24px rgba(0,0,0,.14)", zIndex: 20, minWidth: 210, overflow: "hidden" }}>
                                        <button
                                          onClick={() => { setRowMenuId(null); setDateEdit({ assignmentId: a.id, date: todayStr }); }}
                                          style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#171b1f" }}
                                        >✎ Changer la date de départ</button>
                                        <button
                                          onClick={() => { setRowMenuId(null); gate(() => stopAssignment(a.id)); }}
                                          style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", borderTop: "1px solid rgba(0,0,0,.06)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#d44000" }}
                                        >⏹ Arrêter</button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                              {dateEdit?.assignmentId === a.id ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <button onClick={() => setDateEdit({ assignmentId: a.id, date: todayStr })} style={{ fontSize: 11, fontWeight: 700, color: dateEdit.date === todayStr ? "#fff" : "#d44000", background: dateEdit.date === todayStr ? "#d44000" : "rgba(212,64,0,0.08)", border: "none", borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}>Aujourd'hui</button>
                                  <input type="date" value={dateEdit.date} onChange={e => setDateEdit({ assignmentId: a.id, date: e.target.value })} style={{ fontSize: 16, border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, padding: "2px 6px", fontFamily: "inherit" }} />
                                  <button
                                    disabled={rowBusy === a.id || !dateEdit.date}
                                    onClick={() => gate(() => changeStartDate(a, dateEdit.date))}
                                    style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "linear-gradient(180deg,#f04a08,#d44000)", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", opacity: rowBusy === a.id ? .6 : 1 }}
                                  >{rowBusy === a.id ? "…" : "Valider"}</button>
                                  <button onClick={() => setDateEdit(null)} style={{ fontSize: 11, fontWeight: 600, color: "#8a8f94", background: "none", border: "none", cursor: "pointer" }}>Annuler</button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ marginTop: "auto", borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => gate(() => setStep({ type: "assign", programId: p.id, programName: p.name }))}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Assigner →
                    </button>
                    <button
                      onClick={() => {
                        const fakeMeta: ProgramMeta = { sport: p.sport ?? "", level: (p.level as ProgramMeta["level"]) ?? "intermediaire", focus: (p.focus as ProgramMeta["focus"]) ?? "mixte", days: ["Lun", "Mer", "Ven"], duration: p.weeks_count as ProgramMeta["duration"] };
                        const activeCount = assignments.filter(a => a.program_id === p.id && a.status === "active").length;
                        setStep({ type: "builder", template: p.template, meta: fakeMeta, programId: p.id, programName: p.name, assignmentCount: activeCount });
                      }}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#555" }}
                    >
                      ✏️ Modifier
                    </button>
                    {/* Dupliquer/Supprimer derrière "⋯" (2026-09-05, demande explicite de Gildas)
                        — seuls Assigner/Modifier restent des CTA visibles en permanence. */}
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={e => { placeMenu(e); setMenuOpenId(id => id === p.id ? null : p.id); }}
                        style={{ padding: "9px 10px", borderRadius: 12, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontSize: 14, cursor: "pointer", color: "#8a8f94" }}
                      >⋯</button>
                      {menuOpenId === p.id && (
                        <>
                          <div onClick={() => setMenuOpenId(null)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
                          <div style={{ position: "fixed", top: menuPos?.top, right: menuPos?.right, transform: menuPos?.up ? "translateY(-100%)" : undefined, background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 8px 24px rgba(0,0,0,.14)", zIndex: 20, minWidth: 150, overflow: "hidden" }}>
                            <button
                              onClick={() => { setMenuOpenId(null); gate(() => duplicateProgram(p)); }}
                              style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#171b1f" }}
                            >⎘ Dupliquer</button>
                            <button
                              onClick={() => { setMenuOpenId(null); gate(() => deleteProgram(p.id)); }}
                              style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", borderTop: "1px solid rgba(0,0,0,.06)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#d44000" }}
                            >🗑 Supprimer</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Carousel>
          </>
        )}

        <TemplateSections userSport={userSport} onSelect={p => setStep({ type: "detail", program: p })} />
      </div>
      </div>
      {resyncModal}
    </div>
  );
}
