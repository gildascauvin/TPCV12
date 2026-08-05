"use client";

import { useState, useEffect, useRef } from "react";
import { startOfWeek, addDays, format } from "date-fns";
import Actions from "@/components/onboarding/Actions";
import DayColumn from "@/components/calendar/DayColumn";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { loadRule, type LoadContext } from "@/lib/loadRule";
import { getRecoveryAdvice } from "@/lib/wellness";
import { attention, decisionText } from "@/components/coach/CoachAthleteCard";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ProgramTemplate, ProgramFocus, Session, WellnessDaily, CoachAthlete } from "@/types";

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

/* Aperçu wellness (conseil récupération dans chaque DayColumn) : contenu illustratif, pas de calcul réel — mais
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

/* Alerte wellness — copie exacte des seuils/couleurs/textes de la carte réelle de TodayClient.tsx
   (fonction row(), sportif). Calculée pour CHAQUE jour (pas seulement "aujourd'hui") à partir du
   score/diff réels de ce jour-là : sur une semaine, ça illustre naturellement les différents cas
   (🔥/⚠️/💛/✅) sans forcer aucun jour en particulier. Repli sur le conseil récupération si aucun cas
   ne matche (score 55-79), exactement comme en prod (le encart n'apparaît pas du tout dans ce cas). */
function athleteAlertFor(score: number, maxDiff: number): { border: string; glow: string; text: string } | null {
  if (score < 55 && maxDiff >= 8) return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `🔥 Wellness bas · Séance à ${maxDiff}/10 prévue — allège à 6/10` };
  if (score < 55 && maxDiff >= 5) return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `⚠️ Wellness bas · Séance à ${maxDiff}/10 — surveille ton effort` };
  if (score < 55) return { border: "rgba(242,138,0,.4)", glow: "#f28a00", text: "💛 Wellness bas — journée de récupération recommandée" };
  if (score >= 80 && maxDiff >= 8) return { border: "rgba(47,158,68,.4)", glow: "#2f9e44", text: `✅ Score ${score} · Séance à ${maxDiff}/10 — fenêtre idéale !` };
  return null;
}

/* Alerte coach — reprend telle quelle la logique/texte de l'encart décision de CoachCard
   (attention()/decisionText(), CoachAthleteCard.tsx). N'est affichée que quand isPriority est vrai
   (comme le badge "Attention requise" réel) — sinon repli sur le conseil récupération, pour ne pas
   marquer CHAQUE jour d'un encart alors que "Plan cohérent" n'a rien de notable à signaler. */
function coachAlertFor(athlete: CoachAthlete, maxDiff: number): { border: string; glow: string; text: string } | null {
  if (!attention(athlete, maxDiff)) return null;
  return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `💛 ${decisionText(athlete, maxDiff)}` };
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

  /* TEST LOCAL — carrousel horizontal type /week, pas encore en prod. Réutilise exactement les
     mêmes fonctions/données réelles que le calcul de selectedDay ci-dessous (loadRule,
     wellnessPreviewFor, sessionForDay), juste étendu à tous les jours de la semaine. */
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Jour réellement "aujourd'hui" (vraie date calendaire) — distinct de selectedDay (qui ne sert
     plus qu'à centrer le carrousel au clic). Porte l'alerte wellness/décision, comme en prod. */
  const todayIndex = toDisplayIndex(new Date().getDay());

  /* TEST LOCAL — onglets sportifs (coach uniquement), même principe que les tabs réelles de
     /coach/planning (Thomas M. / Emma L. / ...). Un seul programme généré disponible ici : les
     autres sportifs démo réutilisent les mêmes séances. La carte "aujourd'hui" de chaque onglet force
     un SCORE différent (jamais un diff : le diff utilisé dans le texte de l'alerte est toujours le
     vrai target_difficulty de la séance du jour, jamais un chiffre inventé — sinon le texte peut
     contredire la jauge affichée juste en dessous, cf. retour Gildas). Les 3 paliers de score (<55,
     55-64, ≥65) sont ceux qui font vraiment bifurquer decisionText()/attention() : selon le vrai
     diff du jour, ils illustrent jusqu'à 2-3 cas réellement différents — jamais plus que ce que la
     vraie difficulté du jour permet, par construction. */
  const COACH_DEMO_NAMES = [coachFirstName || "Toi", "Sportif 2", "Sportif 3"];
  const COACH_TODAY_FORCE = [
    { score: 40, behaviors: ["late_sleep", "screen_late"] }, // score<55 : toujours prioritaire
    { score: 60, behaviors: ["late_sleep"] },                // 55-64 : prioritaire seulement si le vrai diff l'exige
    { score: 75, behaviors: ["walk"] },                      // ≥65 : "Plan cohérent" sauf vrai diff ≥8
  ];
  const ATHLETE_TODAY_FORCE = { score: 40, behaviors: ["late_sleep", "screen_late"] }; // score<55 : toujours un cas (💛 au minimum)
  const [activeAthleteIdx, setActiveAthleteIdx] = useState(0);

  // Keep selected day in sync when real data loads
  useEffect(() => {
    if (displayDays.length > 0 && !displayDays.includes(selectedDay)) {
      setSelectedDay(displayDays[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week1]);

  const allDiffs = displayDays.map(d => sessionForDay[d]?.diff ?? 6);

  /* TEST LOCAL — carrousel unique (sportif ET coach), dates de la semaine calendaire en cours
     (Lun→Dim, jamais de vraie date d'assignation à ce stade de l'onboarding). Réutilise DayColumn
     tel quel (props date/sessions/wellness/ctx), avec 2 props optionnelles propres à cet aperçu :
     hideDayNumber (les dates affichées ne correspondent à rien de réel) et recoveryAdvice (remplace
     le rule-box par le conseil récupération — amalgame /today+/week). */
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i));

  /* Score de forme illustratif — palette fixe couvrant les 4 zones (88/40/58/74), assignée par
     position dans la semaine, sur les jours de repos ET d'entraînement. Volontairement DÉCONNECTÉE
     de la vraie difficulté de la séance (WELLNESS_SEED n'alimente que wellnessPreviewFor(), jamais
     loadRule()) : la variation ne doit jouer que sur le wellness, jamais sur la caractérisation de
     charge, sinon le texte ("charge légère en ce moment"...) peut contredire la jauge réelle affichée
     juste en dessous. loadRule()/le texte de charge restent donc TOUJOURS calculés sur le vrai
     target_difficulty de la séance (ou vide pour un jour de repos), jamais décalés. */
  const REST_DIFF_PALETTE = [3, 10, 7, 5];
  const WELLNESS_SEED = [6, 3, 8, 5, 2, 9, 4]; // Lun..Dim, seed arbitraire pour la variété de score
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !displayDays.includes(d));

  function dayColumnData(d: number): { date: Date; sessions: Session[]; wellness: WellnessDaily | null; ctx: LoadContext; recoveryAdvice?: string; alert?: { border: string; glow: string; text: string } } {
    const date = weekDates[d];
    const dstr = format(date, "yyyy-MM-dd");
    const s = sessionForDay[d];
    const idx = displayDays.indexOf(d);
    const prevMax = idx > 0 ? (allDiffs[idx - 1] ?? 0) : 0;
    const nextMax = idx < displayDays.length - 1 ? (allDiffs[idx + 1] ?? 0) : 0;
    const isPast = d < todayIndex;
    const isToday = d === todayIndex;
    const isFuture = d > todayIndex;
    // "Aujourd'hui" force un cas précis (illustration du concept) — différent par onglet sportif
    // côté coach, pour montrer la variété des cas possibles d'un sportif à l'autre. Les jours après
    // aujourd'hui n'ont pas de wellness renseigné (aucun vrai check-in n'existe encore pour un jour
    // futur, comme en prod sur /week's DayColumn) — repli sur le rule-box classique, pas de conseil
    // récupération ni d'alerte pour ces jours-là.
    const forced = role === "coach" ? COACH_TODAY_FORCE[activeAthleteIdx] : ATHLETE_TODAY_FORCE;

    if (!s) {
      if (isFuture) return { date, sessions: [], wellness: null, ctx: { prevMax, nextMax } };
      const restIdx = restDays.indexOf(d);
      const restDiff = REST_DIFF_PALETTE[restIdx % REST_DIFF_PALETTE.length];
      const wp = isToday ? { score: forced.score, behaviors: forced.behaviors } : wellnessPreviewFor(restDiff);
      const wellness: WellnessDaily = {
        id: `preview-w-${d}`, user_id: "preview", date: dstr,
        sleep: 7, stress: 3, recovery: 7, motivation: 7,
        base_score: wp.score, score: wp.score, behaviors: wp.behaviors, bedtime: null,
        created_at: new Date().toISOString(),
      };
      const rule = loadRule([], { prevMax, nextMax });
      const advice = getRecoveryAdvice(
        { sleep: 7, stress: 3, recovery: 7, motivation: 7, behaviors: wp.behaviors },
        rule.cls
      );
      // maxDiff=0 : pas de séance réelle ce jour-là (jour de repos), jamais un chiffre inventé.
      const alert = !isToday ? undefined
        : role === "coach"
          ? coachAlertFor({ id: "preview", coach_id: "preview", name: COACH_DEMO_NAMES[activeAthleteIdx], sport: displaySport, wellness_score: wp.score, behaviors: wp.behaviors, wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString() }, 0) ?? undefined
          : athleteAlertFor(wp.score, 0) ?? undefined;
      return { date, sessions: [], wellness, ctx: { prevMax, nextMax }, recoveryAdvice: advice, alert };
    }

    // Passé = déjà "terminé" (bouton Résultat), aujourd'hui/à venir = "à faire" (bouton Terminer) —
    // rpe repris du diff prévu pour garder la jauge visible sur les jours passés.
    const session: Session = {
      id: `preview-${d}`, user_id: "preview", date: dstr,
      name: s.name, notes: s.notes, duration: null,
      rpe: isPast ? s.diff : null, done: isPast,
      target_difficulty: s.diff, created_at: new Date().toISOString(),
    };
    if (isFuture) return { date, sessions: [session], wellness: null, ctx: { prevMax, nextMax } };
    // Le texte de charge (rule.cls → "charge X en ce moment" dans getRecoveryAdvice) est TOUJOURS
    // calculé sur le vrai target_difficulty — seul le score wellness (wp) varie, via WELLNESS_SEED,
    // découplé de la difficulté réelle.
    const wp = isToday ? { score: forced.score, behaviors: forced.behaviors } : wellnessPreviewFor(WELLNESS_SEED[d]);
    const rule = loadRule([{ target_difficulty: s.diff }], { prevMax, nextMax });
    const advice = getRecoveryAdvice(
      { sleep: 7, stress: 3, recovery: 7, motivation: 7, behaviors: wp.behaviors },
      rule.cls
    );
    const wellness: WellnessDaily = {
      id: `preview-w-${d}`, user_id: "preview", date: dstr,
      sleep: 7, stress: 3, recovery: 7, motivation: 7,
      base_score: wp.score, score: wp.score, behaviors: wp.behaviors, bedtime: null,
      created_at: new Date().toISOString(),
    };
    // maxDiff = s.diff (vrai diff prévu, jamais un chiffre inventé) — seul le score wellness (wp) est forcé.
    const alert = !isToday ? undefined
      : role === "coach"
        ? coachAlertFor({ id: "preview", coach_id: "preview", name: COACH_DEMO_NAMES[activeAthleteIdx], sport: displaySport, wellness_score: wp.score, behaviors: wp.behaviors, wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString() }, s.diff) ?? undefined
        : athleteAlertFor(wp.score, s.diff) ?? undefined;
    return { date, sessions: [session], wellness, ctx: { prevMax, nextMax }, recoveryAdvice: advice, alert };
  }

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLDivElement>(`[data-day="${selectedDay}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDay]);

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
        marginTop: -36, paddingTop: 24, marginBottom: role === "coach" ? 0 : 20,
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

      {/* Carrousel horizontal unique (sportif ET coach) — le vrai DayColumn de /week et
         /coach/planning, réutilisé tel quel (même composant, pas une reconstruction). Le rule-box
         est remplacé par le conseil récupération (amalgame /today+/week, cf. échange avec Gildas) :
         plus besoin de carte wellness séparée au-dessus, le ring de chaque jour porte déjà
         l'information. Clic sur une carte = setSelectedDay, même state que le bandeau de ronds
         ci-dessus. Full-bleed (100vw) : /week n'est jamais contraint à la colonne étroite de
         l'onboarding, un carrousel de 7 colonnes a besoin de la largeur réelle de l'écran. */}
      {/* Onglets sportifs (coach uniquement) — markup identique à la vraie tab bar de
         CoachPlanningClient.tsx ("Athlete tabs bar") : collée directement sous le header sombre
         (aucun gap), pleine largeur (100vw) — jamais contrainte à la colonne étroite de
         l'onboarding, exactement comme en vrai. */}
      {role === "coach" && (
        <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw", marginBottom: 14 }}>
          <div style={{
            background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)",
            display: "flex", alignItems: "stretch", overflowX: "auto",
            gap: 0, padding: isMd ? "0 24px" : "0 16px",
          }}>
            {COACH_DEMO_NAMES.map((name, i) => (
              <button
                key={name}
                onClick={() => setActiveAthleteIdx(i)}
                style={{
                  padding: "10px 16px", fontSize: 13, fontWeight: activeAthleteIdx === i ? 700 : 600,
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  color: activeAthleteIdx === i ? "#171b1f" : "#8a8f94",
                  borderBottom: activeAthleteIdx === i ? "2.5px solid #d44000" : "2.5px solid transparent",
                  whiteSpace: "nowrap", flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.45, marginBottom: 8 }}>
        {role === "coach"
          ? "Ton analyse réelle s'appuierait sur les données d'entraînement de tes sportifs."
          : "Ton analyse réelle s'appuierait sur tes données d'entraînement."}
      </div>

      <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <div
          ref={scrollRef}
          style={{
            display: "grid", gridTemplateColumns: "repeat(7, var(--wk-col, 260px))",
            gap: isMd ? 12 : 10, overflowX: "auto", marginBottom: 12,
            padding: isMd ? "2px 24px 14px" : "2px 16px 14px", scrollSnapType: "x proximity", scrollbarWidth: "thin",
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map(d => {
            const { date, sessions, wellness, ctx, recoveryAdvice, alert } = dayColumnData(d);
            return (
              <div key={d} data-day={d} onClick={() => setSelectedDay(d)}>
                <DayColumn
                  date={date}
                  sessions={sessions}
                  wellness={wellness}
                  todayStr={format(weekDates[todayIndex], "yyyy-MM-dd")}
                  ctx={ctx}
                  recoveryAdvice={recoveryAdvice}
                  alert={alert}
                  onAddSession={() => {}}
                  onComplete={() => {}}
                  onEdit={() => {}}
                  onDuplicate={() => {}}
                  onWellness={() => setSelectedDay(d)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <Actions onNext={onNext} nextLabel="Personnaliser ce programme →" />
    </div>
  );
}
