"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";
import DiffGauge from "@/components/calendar/DiffGauge";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import { zoneLabel, getRecoveryAdvice } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { CoachCard, attention } from "@/components/coach/CoachAthleteCard";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ProgramTemplate, ProgramFocus, CoachAthlete, CoachViewSession } from "@/types";

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

function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return score >= 75 ? "#2f9e44" : score >= 55 ? "#f28a00" : "#d10000";
}

/* Ring wellness — copie de WellnessRingPOC (TodayClient.tsx) pour un rendu identique à la prod. */
function WellnessRingPreview({ score, size = 96 }: { score: number | null; size?: number }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  const r = Math.round(size * 0.423);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const color = scoreColor(score);
  const sw = Math.round(size * 0.077);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={animated ? offset : circ} strokeLinecap="round"
          style={{ transition: "all 0.6s cubic-bezier(0.2,0,0.38,0.9)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.307), fontWeight: 1000, color, lineHeight: 1, letterSpacing: "-0.055em" }}>
          {score !== null ? score : "—"}
        </span>
        <span style={{ fontSize: Math.round(size * 0.077), fontWeight: 1000, color: "rgba(255,255,255,0.58)", letterSpacing: "0.14em", marginTop: 2, textTransform: "uppercase" }}>
          wellness
        </span>
      </div>
    </div>
  );
}

/* Aperçu wellness (carte "Score & conseils") : contenu illustratif, pas de calcul réel — mais
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
  programFlow?: boolean;
  role: Role;
  goalLower: string;
  frise?: React.ReactNode;
  coachFirstName?: string;
  onNext: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, focus, weaknesses, duration, programFlow, role, goalLower, frise, coachFirstName, onNext }: Props) {
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
      body: JSON.stringify({ sport, level: LEVEL_TO_DB[level], days: dayStrings, duration: duration ?? 4, focus: focus ?? "mixte", weaknesses: weaknesses ?? [] }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: { template: ProgramTemplate } | null) => {
        if (!cancelled && data?.template) setGeneratedTemplate(data.template);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, level, JSON.stringify(trainingDays), focus, JSON.stringify(weaknesses), duration]);

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

  const defaultDay = displayDays[0] ?? 0;
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);

  // Keep selected day in sync when real data loads
  useEffect(() => {
    if (displayDays.length > 0 && !displayDays.includes(selectedDay)) {
      setSelectedDay(displayDays[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week1]);

  const shownSession = sessionForDay[selectedDay] ?? sessionForDay[displayDays[0]] ?? { name: "Séance", notes: null, diff: 6 };
  const currentDiff = shownSession.diff;
  const selIdx = displayDays.indexOf(selectedDay);
  const allDiffs = displayDays.map(d => sessionForDay[d]?.diff ?? 6);
  const prevMax = selIdx > 0 ? (allDiffs[selIdx - 1] ?? 0) : 0;
  const nextMax = selIdx < displayDays.length - 1 ? (allDiffs[selIdx + 1] ?? 0) : 0;
  const rule = loadRule([{ target_difficulty: currentDiff }], { prevMax, nextMax });
  const tagColor = ruleTagColors[rule.cls];
  const wellnessPreview = wellnessPreviewFor(currentDiff);
  const recoveryAdvice = getRecoveryAdvice(
    { sleep: 7, stress: 3, recovery: 7, motivation: 7, behaviors: wellnessPreview.behaviors },
    rule.cls
  );

  /* Aperçu Coach Control (role coach) — le sportif "démo" porte le nom du coach lui-même (aucun
     vrai sportif n'existe encore à ce stade). Réutilise le vrai composant CoachCard pour un rendu
     identique à Coach Control, isPriority calculé avec la vraie fonction attention(). */
  const previewAthlete: CoachAthlete = {
    id: "preview", coach_id: "preview",
    name: coachFirstName || "Toi",
    sport: displaySport,
    wellness_score: wellnessPreview.score,
    behaviors: wellnessPreview.behaviors,
    wellnessFilledToday: true,
    user_id: null, invite_email: null,
    created_at: new Date().toISOString(),
  };
  const previewSession: CoachViewSession = {
    id: "preview-session", athlete_id: "preview",
    date: new Date().toISOString().slice(0, 10),
    name: shownSession.name, notes: shownSession.notes,
    duration: null, rpe: null, done: false,
    target_difficulty: currentDiff,
    created_at: new Date().toISOString(), _real: true,
  };
  const previewIsPriority = attention(previewAthlete, currentDiff);

  const loading = programFlow && !fetchedProgram;

  const headerTitle = programFlow
    ? (displayName ?? "Chargement…")
    : `Voici comment ThePerfClub ${role === "coach" ? "aide tes sportifs" : "t'aide"} à ${goalLower || "progresser"}.`;
  const headerSub = programFlow
    ? (displayName ? "Personnalisable à tout moment selon l'avancée de tes sportifs." : "Chargement du programme…")
    : (role === "coach"
        ? "Chaque séance enregistrée est analysée en détail — tu identifies enfin ce qui freine leur progression et ce qui favorise leur récupération."
        : "Chaque séance enregistrée est analysée en détail — tu identifies enfin ce qui freine ta progression et ce qui favorise ta récupération.");

  return (
    <div>
      {/* Plein écran (largeur + jusqu'en haut) : casse le maxWidth (responsive, voir
          OnboardingBackground.tsx)/padding-top:36 imposés par OnboardingBackground. Sûr d'annuler
          ce padding ici car la frise est désormais rendue à l'intérieur de ce bloc (juste en
          dessous, via {frise}) et non plus au-dessus par OnboardingFlow — plus de risque de la
          faire disparaître sous ce bloc. Même formule de largeur que OnboardingBackground.tsx/
          Actions.tsx pour rester aligné avec le reste de la page sur desktop/tablette. */}
      <div style={{
        background: "#141414",
        width: "100vw", position: "relative", left: "50%", right: "50%", marginLeft: "-50vw", marginRight: "-50vw",
        marginTop: -36, paddingTop: 24, marginBottom: 20,
      }}>
        <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: "0 20px 24px" }}>
        {frise}
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4, color: "#fff" }}>
          {sportEmoji} {headerTitle}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginBottom: 18 }}>
          {headerSub}
        </div>

        {/* Sélecteur de jours — style app réelle (contour discret, rond blanc plein pour le
            sélectionné), point sous le rond coloré par difficulté. Jour en texte dans le rond
            (pas de quantième, gardé volontairement). */}
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
        </div>
      </div>

      {role === "coach" ? (
        /* Aperçu Coach Control — réutilise le vrai composant CoachCard (celui de la vraie page
           Coach Control) avec un sportif "démo" au nom du coach lui-même, plus une étiquette
           "Aperçu" ajoutée par-dessus (le composant lui-même n'en a pas besoin en prod). */
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 8 }}>
            Ton analyse réelle s&apos;appuierait sur les données d&apos;entraînement de tes sportifs.
          </div>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", top: 14, right: 34, zIndex: 3,
              fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
              background: "rgba(255,255,255,.14)", color: "rgba(255,255,255,.75)",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Aperçu
            </span>
            <CoachCard
              athlete={previewAthlete}
              sessions={[previewSession]}
              isPriority={previewIsPriority}
              isReviewed={false}
              onDecide={() => {}}
            />
          </div>
          <div style={{ fontSize: 12, color: "#8a8f94", textAlign: "center", lineHeight: 1.45, marginTop: 14, padding: "0 12px" }}>
            Tes autres sportifs apparaîtront plus bas, dans ton Coach Control complet.
          </div>
        </div>
      ) : (
        <>
          {/* Aperçu wellness — reprend exactement la carte réelle de TodayClient.tsx (ring, zone,
              tags de comportements, encart conseil récupération) ; seuls score/comportements sont
              illustratifs, étiquetés "Aperçu" pour ne pas être confondus avec un vrai calcul. */}
          <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 8 }}>
            Ton analyse réelle s&apos;appuierait sur tes données d&apos;entraînement.
          </div>
          <div
            style={{
              position: "relative", overflow: "hidden",
              borderRadius: 30, padding: 22, marginBottom: 12,
              background: "radial-gradient(circle at 87% 5%,rgba(212,64,0,.32),transparent 30%), linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: "0 28px 72px rgba(0,0,0,0.28)",
              color: "#fff",
            }}
          >
            <div style={{ position: "absolute", right: "-12%", bottom: "-42%", width: 300, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(32px)", pointerEvents: "none" }} />
            <span style={{
              position: "absolute", top: 14, right: 14, zIndex: 3,
              fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
              background: "rgba(255,255,255,.14)", color: "rgba(255,255,255,.75)",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Aperçu
            </span>

            <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
              <WellnessRingPreview score={wellnessPreview.score} size={88} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 6 }}>
                  Score &amp; conseils
                </div>
                <div style={{ fontSize: "clamp(20px, 6vw, 28px)", fontWeight: 1000, color: "#fff", marginBottom: 8, lineHeight: 1.08, letterSpacing: "-0.04em" }}>
                  {zoneLabel(wellnessPreview.score)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {wellnessPreview.behaviors.map(b => (
                    <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(212,64,0,0.22)", color: "#ffd2bf" }}>
                      {BEHAVIOR_META[b] ? `${BEHAVIOR_META[b].emoji} ${BEHAVIOR_META[b].label}` : b}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 1000, color: "#ff6b2b", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
                ✦ Conseils
              </div>
              <div style={{ background: "rgba(255,255,255,.052)", border: "1px solid rgba(255,255,255,.075)", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 1000, color: "rgba(255,255,255,0.62)", letterSpacing: "0.11em", textTransform: "uppercase", marginBottom: 5 }}>🌿 Récupération</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: "#fff" }}>{recoveryAdvice}</div>
              </div>
            </div>
          </div>

          {/* Carte séance sélectionnée */}
          {!loading && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>
                🎯 {DOW_LABELS[selectedDay]} · Séance planifiée
              </div>
              <div style={{
                border: "1px solid rgba(212,64,0,0.16)", background: "#fff",
                borderRadius: 16, padding: "14px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.03em" }}>
                    {shownSession.name}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "rgba(212,64,0,0.10)", color: "#d44000", whiteSpace: "nowrap", flexShrink: 0 }}>
                    Prévu
                  </span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <DiffGauge value={currentDiff} height={10} />
                </div>

                <div style={{ padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)", marginBottom: shownSession.notes ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
                      {rule.tag}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                </div>

                {shownSession.notes && (
                  <div style={{ border: "1px solid rgba(0,0,0,.075)", borderRadius: 12, overflow: "hidden" }}>
                    {shownSession.notes.split("\n").filter(Boolean).map((ex, i) => (
                      <div key={i} style={{
                        padding: "8px 10px", fontSize: 12, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
                        borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff",
                      }}>
                        {ex}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <Actions onNext={onNext} nextLabel="Personnaliser ce programme →" />
    </div>
  );
}
