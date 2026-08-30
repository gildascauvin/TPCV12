"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";
import { SessionTemplateCard } from "@/components/programs/ProgramBuilderModal";
import PlanningRing from "@/components/calendar/PlanningRing";
import AlertBox from "@/components/calendar/AlertBox";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { computeAutoregSuggestion, qualitativeDifficulty, autoregAdvice, autoregHeadline, suggestionSeverityColor } from "@/lib/autoregulation";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import type { ProgramTemplate, ProgramFocus, SessionTemplate, WeekTemplate } from "@/types";

/* Écran "programme prêt" — aperçu du programme réellement généré, désormais fusionné avec le
   concept d'autorégulation (2026-08-28, remplace l'ancien step séparé `wellness_check_2a/2b` —
   voir OnboardingFlow.tsx, StepId toujours présent mais plus référencé par aucun path actif, même
   convention que les autres steps dépréciés de ce fichier). Réutilise les composants réels au
   maximum : `SessionTemplateCard` (import direct depuis ProgramBuilderModal.tsx), `PlanningRing`
   (même ring que /week et /coach/planning), même "+ Ajouter une séance"/icône dupliquer (inertes
   ici, aucune édition possible sur un aperçu onboarding — mais visuellement fidèles).

   Simulation de forme : un slider continu (0-100) interpole entre 3 semaines-types ancrées
   (Pas en forme / OK / En forme, deltas -28/0/+22 appliqués à une base variée par jour, jamais un
   score plat identique sur les 7 jours) — validé sur plusieurs itérations de POC avant portage ici
   (voir historique de conversation). Chaque jour passe par la MÊME baseline Z-score que le reste de
   l'app (syntheticBaselineFor(), src/lib/sandboxFixtures.ts — historique synthétique déterministe,
   aucune formule séparée) : le ring, "Fatigué/Équilibré/Frais" (relativeZoneLabel) et la reco
   viennent tous de ce même calcul, jamais un score absolu affiché à part. La reco par jour utilise
   la VRAIE fonction `computeAutoregSuggestion` (déjà utilisée par DecisionStep/AutoregButtons en
   prod), jamais une
   heuristique de chaînage (l'ancienne boîte `loadRule` est retirée de cet écran — elle démontrait
   l'enchaînement des séances, indépendant de la forme, ce qui n'est plus le sujet ici ; deux boîtes
   de reco par carte × 7 colonnes aurait surchargé visuellement cet écran). Quand une suggestion se
   déclenche, les lignes d'exercice affichent l'ancienne valeur barrée au-dessus de la nouvelle en
   gras orange via `renderExerciseLine` (même convention déjà utilisée par ReconduireModal/
   AutoregButtons ailleurs dans l'app) — c'est un APERÇU passif de l'effet, jamais une action : zéro
   bouton cliquable ici, l'ajustement réel reste sur `decision_2a/2b`, l'étape suivante. */

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DOW_MAP: Record<string, number> = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6 };

/* Base de forme simulée, variée par jour (déterministe — jamais Math.random, pour rester stable
   entre re-renders/hydratation) + 3 ancres de delta (mêmes valeurs que le POC validé). Le slider
   interpole entre ces 3 ancres plutôt que de calculer un delta libre. */
const SIM_BASE = [62, 70, 75, 58, 66, 60, 72]; // Lun..Dim
const ANCHOR_DELTA = { low: -28, ok: 0, high: 22 };
function deltaFromSlider(v: number): number {
  if (v <= 50) return ANCHOR_DELTA.low + (ANCHOR_DELTA.ok - ANCHOR_DELTA.low) * (v / 50);
  return ANCHOR_DELTA.ok + (ANCHOR_DELTA.high - ANCHOR_DELTA.ok) * ((v - 50) / 50);
}
function sliderStateLabel(v: number): { emoji: string; text: string } {
  if (v < 34) return { emoji: "😴", text: "Pas en forme" };
  if (v > 66) return { emoji: "⚡", text: "En forme" };
  return { emoji: "😐", text: "Forme OK" };
}

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

/* Choisit la semaine réellement affichée dans l'aperçu — pas toujours la semaine 1. Vérifié en
   direct sur /api/programs/generate (pas supposé) : la semaine 1 (bloc MEV de la périodisation)
   plafonne à 6/10 sur plusieurs sports/nombres de jours testés (Powerlifting, Sprint, CrossFit,
   Endurance), jamais 8+ — la reco "Alléger" (computeAutoregSuggestion exige diff≥8, "dure") ne se
   déclencherait donc quasiment jamais si on restait figé sur la semaine 1, quel que soit l'état de
   forme simulé. Cherche la première semaine (ordre chronologique, jamais un index codé en dur —
   la position de la semaine la plus dure dépend du sport/de la durée) qui contient un vrai jour
   difficile (diff≥8). Les séances "test" (bilan de cycle) COMPTENT désormais comme les autres
   (2026-08-30, retour explicite de Gildas — la reco doit se déclencher "sans exception", même si le
   texte du test lui-même n'a pas de token numérique à faire varier visiblement : la jauge de
   difficulté et l'encart de suggestion restent pertinents). Repli sur la semaine 1 si aucune
   semaine n'atteint ce seuil (ex. programmes de rééducation, plafonnés à 5/10 par design —
   l'absence de séance dure y est le comportement correct, pas un bug). */
function pickPreviewWeek(template: ProgramTemplate | null): WeekTemplate | null {
  if (!template?.weeks?.length) return null;
  for (const week of template.weeks) {
    const hasHardDay = Object.values(week).some(sessions => sessions.some(s => (s.target_difficulty ?? 0) >= 8));
    if (hasHardDay) return week;
  }
  return template.weeks[0];
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
  /* Programme importé (photo/texte, sport_2a) — quand fourni, remplace entièrement l'appel à
     /api/programs/generate ci-dessous : le contenu vient déjà de l'utilisateur, rien à générer.
     sport/level/focus/weaknesses restent transmis mais ignorés par cet écran dans ce cas (jamais
     vidés côté appelant, pour ne pas perturber un retour arrière vers sport_2a). */
  importedTemplate?: ProgramTemplate | null;
  frise?: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, focus, weaknesses, duration, customExercises, customWeaknessMeta, customSessionLabels, programFlow, role, weaknessLabels, sportLabel, importedTemplate, frise, onNext, onBack }: Props) {
  const { isMd, isLg } = useBreakpoint();
  const heroMaxWidth = isLg ? 720 : isMd ? 640 : 560;
  const [fetchedProgram, setFetchedProgram] = useState<FetchedProgram | null>(null);
  const [generatedTemplate, setGeneratedTemplate] = useState<ProgramTemplate | null>(importedTemplate ?? null);
  const [formSlider, setFormSlider] = useState(50);
  const formDelta = deltaFromSlider(formSlider);
  const { emoji: sliderEmoji, text: sliderText } = sliderStateLabel(formSlider);

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
    // Programme importé : rien à générer, generatedTemplate est déjà seedé depuis importedTemplate
    // à l'initialisation du state ci-dessus. Garde explicite plutôt que de compter sur le fait que
    // trainingDays est vide sur ce chemin (sport_2a→week_preview saute days_2a) — coïncidence
    // fragile à ne pas laisser porter l'intention.
    if (importedTemplate) return;
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

  const week1 = pickPreviewWeek(generatedTemplate);
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
     de tout le flow, pas une adresse spécifiquement sportif) plutôt que "Ce programme".
     Repositionnement "zoom out / zoom in" (2026-08-28, retour explicite de Gildas) : week_preview
     est la vue large/immersive du programme (pas une simple annonce), decision_2a/2b est le moment
     resserré où une vraie décision se prend. "adaptatif" porte cette idée dans le titre sans
     dupliquer le message "s'adapte à ta forme" de DecisionStep (les deux écrans se marchaient
     dessus) — "programme" reste le mot utilisé partout ailleurs dans l'app (routes, nav,
     ProgramBuilderModal...), jamais renommé "système" (discuté et écarté avec Gildas : un vrai
     changement de terminologie produit ne se glisse pas dans un seul écran). headerSub reste un
     seul bloc de 2 phrases courtes (sport/faiblesses/jours + rappel données réelles) plutôt que
     dispersé entre le sous-titre et une légende séparée sous le slider — retour explicite de
     Gildas ("trop de texte partout"). */
  const headerTitle = programFlow
    ? (displayName ?? "Chargement…")
    : "Ton programme adaptatif est prêt.";
  // Mentionne le sport et les faiblesses réellement choisis, pas une paraphrase générique (retour
  // de Gildas, 2026-08-17). weaknessLabels vide (facultatif) → phrase sans cette partie.
  const sportForSentence = sportLabel || sport;
  const weaknessPart = weaknessLabels?.length ? weaknessLabels.join(" et ") : null;
  const headerSub = importedTemplate
    ? "Reconstruit à partir de ce que tu nous as envoyé. Ta vraie analyse s'appuiera sur tes données réelles."
    : programFlow
    ? (displayName ? "Personnalisable à tout moment selon l'avancée de tes sportifs." : "Chargement du programme…")
    : `${weaknessPart ? `Construit à partir de ${sportForSentence}, ${weaknessPart} et tes jours d'entraînement.` : `Construit à partir de ${sportForSentence} et tes jours d'entraînement.`} Ta vraie analyse s'appuiera sur tes données réelles.`;
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
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginBottom: 18 }}>
          {headerSub}
        </div>

        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 10 }}>
          Ta forme aujourd&apos;hui
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 24 }}>{sliderEmoji}</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{sliderText}</span>
        </div>
        <input
          type="range" min={0} max={100} value={formSlider}
          onChange={e => setFormSlider(Number(e.target.value))}
          style={{
            WebkitAppearance: "none", width: "100%", height: 6, borderRadius: 3,
            background: "linear-gradient(90deg, #2a78d6 0%, rgba(255,255,255,.18) 50%, #d44000 100%)",
            outline: "none", cursor: "pointer",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,.55)" }}>
          <span>😴 Pas en forme</span><span>⚡ En forme</span>
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
            // Les séances "test" participent à la reco comme les autres (2026-08-30, retour
            // explicite de Gildas, "sans exception") — seule la jauge de difficulté/l'encart de
            // suggestion changent visiblement pour ces séances, le texte lui-même n'ayant pas de
            // token numérique à faire varier (parseAndApply() ne trouve rien à remplacer dedans).
            const dayMaxDiff = daySessions.length ? Math.max(...daySessions.map(s => s.target_difficulty ?? 6)) : null;
            const score = Math.round(Math.max(5, Math.min(98, SIM_BASE[dayIdx] + formDelta)));
            // Baseline (Z-score, src/lib/wellnessBaseline.ts) sur historique synthétique — même
            // calcul que partout ailleurs dans l'app (sandbox, /coach, /coach/planning), pas un
            // seuil absolu séparé propre à cet aperçu. `ownerId` unique par jour : chaque appel est
            // une recomputation pure indépendante, pas une lecture d'un cache partagé.
            const baseline = syntheticBaselineFor(score, `preview-${day}`);
            const displayScore = baseline?.hasEnoughHistory ? baseline.relativeScore : score;
            const suggestion = computeAutoregSuggestion(score, dayMaxDiff, baseline);
            const pct = suggestion?.reco ?? 0;
            const needsAction = !!suggestion;

            let recoBox: React.ReactNode;
            if (suggestion) {
              // Réutilise le vrai AlertBox (variant "light" par défaut, palette pastel + halo/
              // pastille pulsants) — même composant que /week et /coach/planning pour ce type
              // d'alerte, glow/border dérivés de la vraie sévérité (suggestionSeverityColor —
              // 🚨 rouge / ⚠️ orange / 🚀 vert).
              const severityColor = suggestionSeverityColor(suggestion);
              recoBox = (
                <AlertBox alert={{
                  border: `${severityColor}66`,
                  glow: severityColor,
                  text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, dayMaxDiff ?? 6)}`,
                }} />
              );
            } else {
              // Pas de suggestion forme (Alléger/Surcharger) sur ce jour → repli sur la vraie
              // boîte de reco chaînage (loadRule, même moteur que /week — enchaînement des séances,
              // indépendant de la forme) plutôt qu'un texte générique inventé.
              const prevSess = sessionsByDay[DAYS[dayIdx - 1]] ?? [];
              const nextSess = sessionsByDay[DAYS[dayIdx + 1]] ?? [];
              const ctx = {
                prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
                nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
              };
              const rule = loadRule(daySessions.map(s => ({ target_difficulty: s.target_difficulty })), ctx);
              const tagColor = ruleTagColors[rule.cls];
              recoBox = (
                <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>{rule.tag}</div>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                </div>
              );
            }

            return (
              <div key={day} style={{
                scrollSnapAlign: "start", background: "#fff", borderRadius: 26, padding: 16,
                border: needsAction ? "1.5px solid rgba(212,64,0,.5)" : "1px solid rgba(0,0,0,.08)",
                boxShadow: needsAction ? "0 0 0 3px rgba(212,64,0,.1), 0 6px 18px rgba(0,0,0,.05)" : "0 6px 18px rgba(0,0,0,.05)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 9 }}>
                  <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>{day}</div>
                  <PlanningRing score={displayScore} size={58} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#687075", marginBottom: 7 }}>{relativeZoneLabel(baseline)}</div>

                {recoBox}

                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                  Séances · {daySessions.length}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {daySessions.length === 0 && (
                    <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,.12)", borderRadius: 10, padding: "11px 4px" }}>
                      Repos / libre
                    </div>
                  )}
                  {daySessions.map((s, sIdx) => {
                    const displaySession = suggestion ? { ...s, target_difficulty: adjustDifficulty(s.target_difficulty ?? 6, pct) } : s;
                    return (
                      <SessionTemplateCard
                        key={sIdx}
                        session={displaySession}
                        renderExerciseLine={suggestion ? (line, i) => {
                          const after = parseAndApply(line, pct);
                          const changed = after !== line;
                          return (
                            <div style={{ padding: "6px 9px", fontSize: 11, lineHeight: 1.4, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                              {changed && <div style={{ color: "#b3b8bc", textDecoration: "line-through", fontSize: 9.5, lineHeight: 1.3, fontWeight: 600 }}>{line}</div>}
                              <div style={changed ? { color: "#d44000", fontWeight: 800 } : { color: "#2c3236", fontWeight: 600 }}>{after}</div>
                            </div>
                          );
                        } : undefined}
                      />
                    );
                  })}
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
