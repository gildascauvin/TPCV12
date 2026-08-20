"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";
import { SessionTemplateCard } from "@/components/programs/ProgramBuilderModal";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ProgramTemplate, ProgramFocus, SessionTemplate } from "@/types";

/* Écran "programme prêt" — pure aperçu du programme réellement généré (2026-08-17, 2e itération :
   doit ressembler EXACTEMENT au vrai program builder, retour explicite de Gildas — mêmes
   composants réels : `SessionTemplateCard` (import direct depuis ProgramBuilderModal.tsx, pas une
   copie) pour la carte séance, même encart charge (loadRule), même "+ Ajouter une séance"/icône
   dupliquer (inertes ici, aucune édition possible sur un aperçu onboarding — mais visuellement
   fidèles). Jamais de ring, de numéro de jour ou de "Non renseigné" : ce n'est pas un planning
   calendaire, c'est un programme. */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
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

type Level = "beginner" | "intermediate" | "elite";
type Role = "athlete" | "coach";

interface FetchedProgram {
  name: string;
  sport: string;
  level: Level;
  template: ProgramTemplate;
}

const LEVEL_TO_DB: Record<Level, string> = { beginner: "debutant", intermediate: "intermediaire", elite: "elite" };
const DOW_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]; // même convention que generateAndAssignProgram()

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
  goalLower?: string;
  /* Libellés réels des faiblesses choisies (pas les clés) — pour les mentionner explicitement dans
     headerSub plutôt que "le point faible que tu viens de choisir" (retour de Gildas, 2026-08-17 :
     "mentionner le sport et les faiblesses"). */
  weaknessLabels?: string[];
  /* Nom de sport affichable, distinct de `sport` (qui reste vide pour un sport "Autre" personnalisé
     — `sport` est ce que consomme /api/programs/generate, pas forcément affichable tel quel). Repli
     sur `sport` si absent. */
  sportLabel?: string;
  frise?: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, focus, weaknesses, duration, customExercises, customWeaknessMeta, customSessionLabels, programFlow, role, weaknessLabels, sportLabel, frise, onNext, onBack }: Props) {
  const { isMd, isLg } = useBreakpoint();
  const heroMaxWidth = isLg ? 720 : isMd ? 640 : 560;
  const [fetchedProgram, setFetchedProgram] = useState<FetchedProgram | null>(null);
  const [generatedTemplate, setGeneratedTemplate] = useState<ProgramTemplate | null>(null);

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

  const week1 = generatedTemplate?.weeks?.[0] ?? null;
  const displayName = fetchedProgram?.name;
  const sportEmoji  = getSportEmoji(sport);

  // Sessions réelles par jour (SessionTemplate complet, load/type inclus) — repli sur la banque
  // générique le temps que /api/programs/generate réponde.
  const sessionsByDay: Record<string, SessionTemplate[]> = {};
  if (week1) {
    DAYS.forEach(d => { sessionsByDay[d] = (week1[d] as SessionTemplate[] | undefined) ?? []; });
  } else {
    const templates = getSessionTemplates(sport);
    const displayDays = Array.from(new Set(trainingDays.map(toDisplayIndex))).sort((a, b) => a - b);
    DAYS.forEach(d => { sessionsByDay[d] = []; });
    displayDays.forEach((d, i) => {
      const tpl = templates[i % templates.length];
      const dayKey = DAYS[d];
      if (dayKey) sessionsByDay[dayKey] = [{ name: tpl[0], notes: tpl[1], target_difficulty: adjustDiff(tpl[2], level), load: 2, type: "volume" }];
    });
  }

  /* Wording générique coach/sportif (2026-08-19) — "role" n'est pas encore connu à ce stade pour
     un visiteur sans ?role= (choisi après week_preview désormais, voir OnboardingFlow.tsx) : plus
     de ternaire par rôle sur les textes ci-dessous, même principe que sport_2a/level_2a/days_2a.
     headerTitle garde "Ton programme" (retour explicite de Gildas — "ton" reste l'adresse générique
     de tout le flow, pas une adresse spécifiquement sportif) plutôt que "Ce programme". headerSub
     précise que le programme reste modifiable, pour rassurer avant le choix de rôle qui suit
     immédiatement (pas encore de vrai éditeur accessible à ce stade de l'onboarding). */
  const headerTitle = programFlow
    ? (displayName ?? "Chargement…")
    : "Ton programme est prêt.";
  // Mentionne le sport et les faiblesses réellement choisis, pas une paraphrase générique (retour
  // de Gildas, 2026-08-17). weaknessLabels vide (facultatif) → phrase sans cette partie.
  const sportForSentence = sportLabel || sport;
  const weaknessPart = weaknessLabels?.length ? weaknessLabels.join(" et ") : null;
  const headerSub = programFlow
    ? (displayName ? "Personnalisable à tout moment selon l'avancée de tes sportifs." : "Chargement du programme…")
    : `${weaknessPart ? `Construit à partir de ${sportForSentence}, ${weaknessPart} et tes jours d'entraînement.` : `Construit à partir de ${sportForSentence} et tes jours d'entraînement.`} Personnalisable à tout moment.`;
  const nextLabel = "Personnaliser ce programme →";

  const heroBlock = (
    <div style={{
      background: "#141414",
      width: "100vw", position: "relative", left: "50%", right: "50%", marginLeft: "-50vw", marginRight: "-50vw",
      marginTop: -36, paddingTop: 24, paddingBottom: 24,
    }}>
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: "0 20px" }}>
        {frise}
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 4, color: "#fff" }}>
          {sportEmoji} {headerTitle}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45 }}>
          {headerSub}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {heroBlock}

      <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, var(--wk-col, 220px))", alignItems: "start",
          gap: isMd ? 12 : 10, overflowX: "auto",
          padding: isMd ? "18px 24px 14px" : "18px 16px 14px", scrollSnapType: "x proximity", scrollbarWidth: "thin",
        }}>
          {DAYS.map((day, dayIdx) => {
            const daySessions = sessionsByDay[day] ?? [];
            const prevSess = sessionsByDay[DAYS[dayIdx - 1]] ?? [];
            const nextSess = sessionsByDay[DAYS[dayIdx + 1]] ?? [];
            const ctx = {
              prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
              nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
            };
            const rule = loadRule(daySessions.map(s => ({ target_difficulty: s.target_difficulty })), ctx);
            const tagColor = ruleTagColors[rule.cls];
            return (
              <div key={day} style={{ scrollSnapAlign: "start", background: "#fff", borderRadius: 26, border: "1px solid rgba(0,0,0,.08)", padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,.05)" }}>
                <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 10 }}>{day}</div>

                {(daySessions.length > 0 || rule.cls !== "rest") && (
                  <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                      <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>{rule.tag}</div>
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                  </div>
                )}

                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                  Séances · {daySessions.length}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {daySessions.length === 0 && (
                    <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,.12)", borderRadius: 10, padding: "11px 4px" }}>
                      Repos / libre
                    </div>
                  )}
                  {daySessions.map((s, sIdx) => <SessionTemplateCard key={sIdx} session={s} />)}
                  <div style={{ display: "flex", gap: 5 }}>
                    <div style={{ flex: 1, border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 10, padding: "9px 8px", textAlign: "center", fontSize: 11, fontWeight: 700 }}>
                      + Ajouter une séance
                    </div>
                    {daySessions.length > 0 && (
                      <div title="Dupliquer" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(0,0,0,.09)", background: "#f7f8f9", color: "#8a8f94", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>⎘</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Actions onNext={onNext} onBack={onBack} nextLabel={nextLabel} />
    </div>
  );
}
