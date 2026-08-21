"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Program, CoachAthlete, ProgramAssignment } from "@/types";
import ProgramCriteriaModal, { type ProgramMeta } from "./ProgramCriteriaModal";
import ProgramBuilderModal from "./ProgramBuilderModal";
import ProgramAssignModal from "./ProgramAssignModal";
import ProgramBanner from "./ProgramBanner";
import type { ProgramTemplate } from "@/types";

const LEVEL_LABELS: Record<string, string> = {
  debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", elite: "Élite",
};
const FOCUS_LABELS: Record<string, string> = {
  mixte: "Mixte", technique: "Technique", volume: "Volume", intensite: "Intensité",
  competition: "Compétition", combat: "Combat", autre: "Autre",
};
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

function sportEmoji(sport?: string | null): string {
  if (!sport) return "🏋️";
  const s = sport.toLowerCase();
  if (s.includes("halt") || s.includes("force") || s.includes("power")) return "🏋️";
  if (s.includes("sprint") || s.includes("athlé")) return "⚡";
  if (s.includes("combat") || s.includes("art")) return "🥊";
  if (s.includes("fitness") || s.includes("forme")) return "💪";
  if (s.includes("collectif")) return "⚽";
  return "🏃";
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
}

type UIStep =
  | { type: "list" }
  | { type: "criteria" }
  | { type: "builder"; template: ProgramTemplate; meta: ProgramMeta; programId?: string; programName?: string; assignmentCount?: number }
  | { type: "assign"; programId: string; programName: string };

const AVATAR_COLORS = ["#d44000", "#2f9e44", "#1d6fdb", "#7c3aed", "#b96500"];

export default function ProgramLibraryPage({ athletes, selfUserId, activeProgram, activeProgramWeek, requireSubscription, isActive, onClose, sandboxMode = false }: Props) {
  const gate = (fn: () => void) => requireSubscription ? requireSubscription(fn) : fn();
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [assignments, setAssignments] = useState<ProgramAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<UIStep>({ type: "list" });
  const [linkCopied, setLinkCopied] = useState<Record<string, boolean>>({});

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

  async function saveProgram(name: string, template: ProgramTemplate, meta: ProgramMeta): Promise<string | null> {
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sport: meta.sport || null, level: meta.level, focus: meta.focus, weeks_count: meta.duration, sessions_per_week: meta.days.length, template }),
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

  async function toggleShare(p: Program) {
    const next = !p.is_public;
    await fetch(`/api/programs/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: next }),
    });
    if (next) {
      const url = `${window.location.origin}/p/${p.id}`;
      navigator.clipboard.writeText(url).catch(() => {});
      setLinkCopied(c => ({ ...c, [p.id]: true }));
      setTimeout(() => setLinkCopied(c => ({ ...c, [p.id]: false })), 2000);
    }
    fetchPrograms();
  }

  async function duplicateProgram(p: Program) {
    const res = await fetch("/api/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, name: `${p.name} (copie)`, id: undefined, owner_id: undefined, created_at: undefined, updated_at: undefined }),
    });
    if (res.ok) fetchPrograms();
  }

  /* ─── Criteria ─── */
  if (step.type === "criteria") {
    return (
      <ProgramCriteriaModal
        onClose={() => setStep({ type: "list" })}
        onGenerate={(template, meta) => {
          const defaultName = meta.sport ? `Programme ${meta.sport}` : "Mon programme";
          setStep({ type: "builder", template, meta, programName: defaultName });
        }}
      />
    );
  }

  /* ─── Builder ─── */
  if (step.type === "builder") {
    const isEdit = !!step.programId;
    return (
      <ProgramBuilderModal
        programName={step.programName ?? (step.meta.sport ? `Programme ${step.meta.sport}` : "Mon programme")}
        template={step.template}
        assignmentCount={step.assignmentCount ?? 0}
        requireSubscription={requireSubscription}
        isActive={isActive}
        onBack={() => setStep(isEdit ? { type: "list" } : { type: "criteria" })}
        onSaveToLibrary={async (name, template) => {
          if (isEdit) await updateProgram(step.programId!, name, template);
          else await saveProgram(name, template, step.meta);
          await fetchPrograms();
          setStep({ type: "list" });
        }}
        onSaveAndAssign={async (name, template) => {
          let id = step.programId;
          if (isEdit) await updateProgram(id!, name, template);
          else id = await saveProgram(name, template, step.meta) ?? undefined;
          await fetchPrograms();
          if (id) setStep({ type: "assign", programId: id, programName: name });
          else setStep({ type: "list" });
        }}
      />
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
        onClose={() => setStep({ type: "list" })}
        onAssigned={() => { fetchPrograms(); setStep({ type: "list" }); }}
      />
    );
  }

  /* ─── Library list (pleine page) ─── */
  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", zIndex: 2147483100, display: "flex", flexDirection: "column" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 18, padding: "4px 8px 4px 0", display: "flex", alignItems: "center" }}>←</button>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em" }}>Librairie de programmes</span>
        </div>
        {/* Générer/visualiser/modifier un programme reste libre (voir spec gating save,
            2026-08-19) — seuls "Enregistrer en librairie"/"Assigner" dans ProgramBuilderModal
            sont gatés (gate() y est déjà câblé). Ouvrir le générateur ne doit jamais bloquer,
            sinon un free ne voit jamais la valeur du générateur. */}
        <button
          onClick={() => setStep({ type: "criteria" })}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.25)" }}
        >
          + Nouveau
        </button>
      </div>

      {/* Programme actif (bandeau sportif) */}
      {activeProgram !== undefined && (
        <ProgramBanner program={activeProgram} currentWeek={activeProgramWeek ?? -1} />
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>

        {/* Encart bibliothèque externe */}
        <a
          href="https://www.theperfclub.com/bibliotheque-de-programmes-dentrainement-sportif/"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 16px", marginBottom: 16,
            background: "#fff3ef", borderRadius: 16,
            border: "1px solid rgba(212,64,0,.22)", textDecoration: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>📚</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.2 }}>36 programmes à explorer</div>
              <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 2 }}>Trail, vélo, fitness, sports co… →</div>
            </div>
          </div>
          <span style={{ fontSize: 18, color: "#d44000" }}>›</span>
        </a>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#8a8f94", fontSize: 13 }}>Chargement…</div>
        ) : programs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#171b1f", marginBottom: 6 }}>Aucun programme</div>
            <div style={{ fontSize: 13, color: "#8a8f94" }}>Crée ton premier programme avec le bouton "+ Nouveau".</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {programs.map(p => {
              const bars = weekAvgRpes(p);
              const maxBar = Math.max(...bars, 1);
              const emoji = sportEmoji(p.sport);
              const programAssignments = assignments.filter(a => a.program_id === p.id && a.status === "active");

              return (
                <div key={p.id} style={{ background: "#fff", borderRadius: 18, padding: "18px 18px 14px", border: "1px solid rgba(0,0,0,.07)", boxShadow: "0 2px 12px rgba(0,0,0,.04)" }}>
                  {/* Sport icon */}
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 10 }}>
                    {emoji}
                  </div>

                  {/* Name */}
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em", marginBottom: 4, lineHeight: 1.2 }}>
                    {p.name}
                  </div>

                  {/* Meta */}
                  <div style={{ fontSize: 12, color: "#8a8f94", marginBottom: 12 }}>
                    {[p.sport, p.level ? LEVEL_LABELS[p.level] : null, `${p.weeks_count} semaines`, `${p.sessions_per_week}j/sem`].filter(Boolean).join(" · ")}
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
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#8a8f94", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
                        Suit ce programme ({programAssignments.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {programAssignments.map((a, ai) => {
                          const isSelf = selfUserId && a.user_id === selfUserId;
                          const athlete = athletes.find(x => x.id === a.athlete_id || x.user_id === a.user_id);
                          const displayName = isSelf ? "Moi" : (athlete?.name ?? "—");
                          const color = AVATAR_COLORS[ai % AVATAR_COLORS.length];
                          return (
                            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color }}>{initials(displayName)}</span>
                              </div>
                              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#171b1f" }}>{displayName}</span>
                              <span style={{ fontSize: 11, color: "#8a8f94" }}>Démarre {fmtDate(a.start_date)}</span>
                              <button
                                onClick={() => gate(() => stopAssignment(a.id))}
                                style={{ fontSize: 11, fontWeight: 600, color: "#d44000", background: "rgba(212,64,0,0.08)", border: "none", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}
                              >Arrêter ×</button>
                              {!isSelf && (
                                <button
                                  onClick={() => { onClose(); router.push(`/coach/planning?athlete=${a.athlete_id}`); }}
                                  style={{ fontSize: 11, fontWeight: 600, color: "#8a8f94", background: "#f1f0ee", border: "none", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}
                                >Voir →</button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => gate(() => setStep({ type: "assign", programId: p.id, programName: p.name }))}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Assigner →
                    </button>
                    <button
                      onClick={() => {
                        const fakeMeta: ProgramMeta = { sport: p.sport ?? "", level: (p.level as ProgramMeta["level"]) ?? "intermediaire", focus: (p.focus as ProgramMeta["focus"]) ?? "mixte", days: ["Lun", "Mer", "Ven"], duration: p.weeks_count as ProgramMeta["duration"] };
                        const activeCount = assignments.filter(a => a.program_id === p.id && a.status === "active").length;
                        setStep({ type: "builder", template: p.template, meta: fakeMeta, programId: p.id, programName: p.name, assignmentCount: activeCount });
                      }}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#555" }}
                    >
                      ✏️ Modifier
                    </button>
                    <button onClick={() => gate(() => duplicateProgram(p))} style={{ padding: "9px 10px", borderRadius: 10, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontSize: 14, cursor: "pointer", color: "#8a8f94" }}>⎘</button>
                    <button
                      onClick={() => gate(() => toggleShare(p))}
                      title={p.is_public ? "Copier le lien" : "Partager ce programme"}
                      style={{ padding: "9px 10px", borderRadius: 10, border: `1.5px solid ${p.is_public ? "#d44000" : "rgba(0,0,0,.10)"}`, background: p.is_public ? "rgba(212,64,0,0.06)" : "#fff", fontSize: 14, cursor: "pointer", color: p.is_public ? "#d44000" : "#8a8f94" }}
                    >
                      {linkCopied[p.id] ? "✓" : "🔗"}
                    </button>
                    <button onClick={() => gate(() => deleteProgram(p.id))} style={{ padding: "9px 10px", borderRadius: 10, border: "1.5px solid rgba(0,0,0,.10)", background: "#fff", fontSize: 14, cursor: "pointer", color: "#d44000" }}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
