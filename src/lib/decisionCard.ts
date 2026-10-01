import type { Session } from "@/types";
import { daysAgoStr, dailyLoad, partialChargeReady, monotony, strain, acwr, formPercentSeries, fitnessFatigueTrend, type LoadPoint, type TrendDirection, type TrendCode, type TrendInput, type TrendPerspective } from "@/lib/trainingLoad";
import { sigDimInfo, trendDimInfo, crossTrendInsight, type Severity as PhaseSeverity } from "@/lib/fatigueSignature";
import { CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import type { WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { computeAutoregSuggestion, autoregHeadline, autoregAdvice, qualitativeDifficulty, absoluteFeel, type AutoregSuggestion } from "@/lib/autoregulation";

/* Carte décision unifiée /today + Coach Control + Planning (2026-09, 2e itération — remplace la
   compétition todaySug/chargeRecupSug de la 1re itération) : UN SEUL calcul, toujours contre la
   difficulté RÉELLEMENT prévue aujourd'hui. Le signal chronique (ACWR/monotonie/contrainte/tendance
   Fitness/Forme, 42j) ne produit plus JAMAIS sa propre suggestion séparée — il MODULE le seuil de
   déclenchement du signal du jour (chronicPenalty, voir computeAutoregSuggestion dans
   autoregulation.ts), il ne peut plus jamais gagner tout seul sur un jour sans rapport avec le plan
   réel (séance déjà légère, voire aucune séance prévue). Retour de Gildas : "le chronique doit
   moduler le journalier, pas le concurrencer sans jamais regarder le plan du jour".

   Titre = verbe (2026-09, 2e itération — "Alléger recommandé"/"Surcharger recommandé", reprend
   l'ancien principe "titre=diagnostic" en le nuançant) : le risque d'origine (un titre-verbe
   sonnant comme une consigne pour un état en réalité POSITIF, ex. "Récupérer" pour une tendance qui
   allait bien) ne peut plus se reproduire ici — un titre n'apparaît que pour une suggestion
   RÉELLEMENT actionnable (dir low/high, donc un verbe est honnête) ou "Plan cohérent" (jamais un
   verbe). Le CTA (AutoregButtons) porte le même verbe — titre et action ne peuvent plus diverger. */

type Severity = "good" | "watch" | "alert";
function severityOf(color: string): Severity {
  if (color === "#d10000") return "alert";
  if (color === "#f28a00") return "watch";
  return "good";
}
function worstOf(...sevs: Severity[]): Severity {
  if (sevs.includes("alert")) return "alert";
  if (sevs.includes("watch")) return "watch";
  return "good";
}

// `n` derniers jours de charge quotidienne jusqu'à `anchor` inclus — 7j pour monotonie/contrainte
// (Foster), 42j pour le calcul chronique (ACWR 28j + Fitness EWMA 42j + Forme).
function lastNLoadPoints(sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[], anchor: Date, n: number): LoadPoint[] {
  const pts: LoadPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = daysAgoStr(i, anchor);
    pts.push({ date, load: dailyLoad(sessions.filter(s => s.date === date)) });
  }
  return pts;
}

/* Exportée (2026-09) — pour que attention()/riskScore() (CoachAthleteCard.tsx, le tri "À décider
   maintenant"/"Plan cohérent" de Coach Control) utilisent EXACTEMENT le même calcul que la carte
   décision elle-même, plutôt qu'une 2e formule séparée qui pourrait diverger. */
export function monotonyStrainFor(sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[], anchor: Date = new Date()): { monotonyVal: number | null; strainVal: number | null } {
  const load7 = lastNLoadPoints(sessions, anchor, 7);
  return { monotonyVal: monotony(load7), strainVal: strain(load7) };
}

/* Couleur pour N'IMPORTE LEQUEL des 6 icônes possibles de la carte décision — étend
   suggestionSeverityColor() (autoregulation.ts, 3 icônes seulement : 🚨/⚠️/🚀, pour le cas
   `suggestion` non-null) aux 3 icônes purement informatives (🔴/🟡/🟢, cas `suggestion` null). Même
   teintes que leurs équivalents actionnables (🔴↔🚨 registre alerte, 🟡↔⚠️ watch, 🟢↔🚀 bon signe) —
   jamais une couleur inventée. */
export function decisionCardColor(icon: string): string {
  if (icon === "🚨" || icon === "🔴") return icon === "🚨" ? "#dc2626" : "#d44000";
  if (icon === "⚠️" || icon === "🟡") return "#f28a00";
  if (icon === "🚀" || icon === "🟢") return "#2f9e44";
  if (icon === "⚪") return "#8a8f94"; // pas encore de ressenti (carte avec phase) : neutre, jamais une sévérité
  return "#d44000";
}

/* Ligne de contexte chronique (2026-09) — n'apparaît QUE si `chronicPenalty` a réellement pesé sur
   le calcul (jamais un doublon d'information déjà donnée par `reason`, qui couvre uniquement le
   signal du JOUR).

   Bug réel trouvé par Gildas en testant : la 1re version générait sa propre phrase générique
   ("Ta charge chronique est élevée cette semaine... seuil resserré par prudence") quelle que soit la
   métrique en cause et sa DIRECTION — fausse dès que la métrique la plus sévère est `fitness`/`form`
   (une tendance qui peut être "en BAISSE", pas "élevée") : contredisait littéralement /conseils sur
   le même chargement ("Ta charge chronique est en baisse : possible perte de forme si ça dure.").
   Fix : réutilise TEL QUEL le texte déjà écrit et directionnellement correct pour cette métrique
   précise (loadInfo/monotonyInfo/strainInfo/fitnessTrendInfo/formInfo — mêmes objets que la carte
   ⚡ Charge de /conseils, jamais un 2e texte réinventé).

   Suffixe "Seuil du jour resserré en conséquence." retiré (2026-09-25, retour explicite de Gildas :
   "je veux pas de ce wording") — le texte source suffit déjà à expliquer la métrique, ce suffixe
   n'apportait qu'un jargon interne ("seuil"/"resserré") jamais utile côté utilisateur. */
function chronicContextLine(worst: { text: string } | null): string | null {
  if (!worst || !worst.text) return null;
  return worst.text;
}

/* Ligne 2 d'une carte avec suggestion — dit la VRAIE cause :
   - Alléger déclenché par le seul chronique (sans la pénalité, rien ou seulement la règle séance
     dure) → la charge ;
   - Alléger "norm_hard" (récup dans la norme + séance dure, autoregulation.ts) → la séance ;
   - sinon le texte habituel (récup basse / forme optimale). */
function adviceLine(suggestion: AutoregSuggestion, chronicPenalty: number, params: { wellnessScore: number | null; plannedDifficulty: number | null; baseline?: WellnessBaselineResult | null; subject?: string }): string {
  const planned = params.plannedDifficulty ?? 6;
  if (suggestion.dir === "low" && chronicPenalty !== 0 && suggestion.kind !== "norm_hard") {
    const base = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline, 0);
    if (!base || base.kind === "norm_hard") return chronicOnlyAdvice(planned, params.subject);
  }
  if (suggestion.kind === "norm_hard") {
    return params.subject
      ? `Récupération de ${params.subject} dans sa norme : sur une séance ${qualitativeDifficulty(planned)} comme celle-ci, garder un point de marge suffit.`
      : `Récupération dans ta norme : sur une séance ${qualitativeDifficulty(planned)} comme celle-ci, garde un point de marge.`;
  }
  return autoregAdvice(suggestion.dir, planned, params.subject, params.baseline);
}

function chronicOnlyAdvice(plannedDifficulty: number, subject?: string): string {
  const qualif = qualitativeDifficulty(plannedDifficulty);
  return subject
    ? `La récupération de ${subject} seule ne justifie pas d'alléger, mais sa charge récente pèse : la séance ${qualif} prévue est un peu trop élevée.`
    : `Ta récupération seule ne justifie pas d'alléger, mais ta charge récente pèse : la séance ${qualif} prévue est un peu trop élevée.`;
}

export interface DecisionCard {
  suggestion: AutoregSuggestion | null; // null = informatif seul, pas de jauge
  icon: string;
  // "headline\ndetail[\ncontexte chronique]" — voir AlertText (AlertBox.tsx), qui rend chaque ligne
  // séparément. headline = verbe si une suggestion existe ("Alléger recommandé"), "Plan cohérent"
  // sinon — jamais un verbe pour un état non-actionnable.
  text: string;
  /* Ligne "Phase" (2026-09-29, POC `insight-du-jour`) — présente seulement si l'appelant passe
     `day`. Remplace la 3e ligne chronique de `text` (qui n'est alors plus ajoutée).
     `title` = phase croisée (crossTrendInsight, 9 codes) ; null tant que le ressenti du jour manque.
     `lockedText` = phrase floutée derrière le CTA "Renseigner mon ressenti" (flou plutôt que
     cadenas) : jamais lue, elle donne seulement l'avant-goût. */
  phase?: { title: string | null; text: string; severity: PhaseSeverity | null; lockedText: string | null;
    /* Historique trop court pour une vraie phase (2026-10-01) : ACWR non calculable, ou ressenti du jour
       rempli mais pas encore de norme personnelle. L'appelant montre alors la phase de l'exemple, comme
       les onglets Charge/Récup (demoAnalytics). */
    insufficient?: boolean };
}

/* État de la journée vu par la carte (2026-09-29). `planned` = une séance reste à faire ;
   `done` = toutes faites, `rpe`/`planned` de la principale ; `rest` = aucune séance ce jour-là.
   `tomorrowDifficulty` : difficulté de la séance de demain, null = rien de prévu, undefined = inconnu
   (on ne parle alors pas de demain). */
export type DecisionDay =
  | { kind: "planned"; tomorrowDifficulty?: number | null }
  | { kind: "done"; rpe: number | null; planned: number | null; tomorrowDifficulty?: number | null }
  | { kind: "rest"; tomorrowDifficulty?: number | null };

type Voice = { coach: boolean; subject?: string };
const v = (voice: Voice, athlete: string, coach: string) => (voice.coach || voice.subject ? coach : athlete);

/* Moitié charge seule (avant le ressenti du jour) — mêmes directions que crossTrendInsight (fatigue
   EWMA 7j, fitness EWMA 42j), jamais un autre calcul. */
function chargeHalfText(fatigue: TrendDirection | null, fitness: TrendDirection | null, voice: Voice, rest: boolean): string {
  const Ta = v(voice, "Ta", "Sa");
  if (rest) {
    return v(voice, "Journée sans séance : ta fatigue accumulée continue de baisser.", "Journée sans séance : sa fatigue accumulée continue de baisser.");
  }
  if (fatigue === null) {
    return v(voice, "Termine des séances avec RPE pour suivre ta charge.", "Pas encore assez de séances avec RPE pour suivre sa charge.");
  }
  const short = fatigue === "up" ? "pèse plus que d'habitude" : fatigue === "down" ? "se relâche" : "est stable";
  if (!fitness || fitness === "stable") {
    return fatigue === "stable"
      ? `${Ta} charge récente et ${v(voice, "ta", "sa")} charge chronique sont stables : ${v(voice, "ton", "son")} ressenti dira si le rythme convient.`
      : `${Ta} charge récente ${short}, ${v(voice, "ta", "sa")} charge chronique est stable.`;
  }
  const long = fitness === "up" ? "monte" : "baisse";
  return `${Ta} charge récente ${short}, et ${v(voice, "ta", "sa")} charge chronique ${long}.`;
}

type Feel = "bad" | "mid" | "good";
function feelOf(label: string): Feel {
  if (label === "RÉCUP FRAGILE" || label === "FATIGUÉ") return "bad";
  if (label === "BONNE RÉCUP" || label === "FRAIS") return "good";
  return "mid";
}

/* Jour de repos, ressenti renseigné : l'insight croisé ne parle jamais d'un jour sans séance, d'où
   ces phrases dédiées. Entrées : ressenti (même lecture que crossTrendInsight), tendance fitness
   42j, séance de demain. */
function restText(feel: Feel, relative: boolean, fitness: TrendDirection | null, tomorrow: number | null | undefined, voice: Voice): string {
  const hasTomorrow = typeof tomorrow === "number" && tomorrow > 0;
  const ta = v(voice, "ta", "sa"), Ta = v(voice, "Ta", "Sa");
  if (feel === "bad") {
    return `Repos bien placé : ${ta} récupération ${relative ? `est sous ${ta} norme` : "est basse"} et une journée sans séance fait baisser ${ta} fatigue accumulée.`
      + (hasTomorrow ? v(voice, " Si ton ressenti ne remonte pas demain, allège la séance prévue.", " Si son ressenti ne remonte pas demain, allège la séance prévue.") : "");
  }
  if (feel === "good") {
    const head = fitness === "down"
      ? `${Ta} récupération ${relative ? `est au-dessus de ${ta} norme` : "est bonne"} et ${ta} charge chronique baisse : ce repos n'était pas indispensable.`
      : `${Ta} récupération ${relative ? `est au-dessus de ${ta} norme` : "est bonne"} : ce repos a bien fait son travail.`;
    return head + (hasTomorrow ? " Demain, la séance prévue est le bon moment pour pousser." : "");
  }
  return `${Ta} récupération ${relative ? `est dans ${ta} norme` : "est correcte"} et ${ta} fatigue accumulée baisse avec ce repos.`
    + (fitness === "down"
      ? (hasTomorrow
        ? ` ${Ta} charge chronique baisse aussi : la séance de demain tombe bien pour la relancer.`
        : ` Attention, ${ta} charge chronique baisse aussi : possible perte de forme si ça dure.`)
      : "");
}

/* Après la séance : ce que la journée implique pour demain. */
function afterText(feel: Feel, rpeGap: number | null, tomorrow: number | null | undefined): string {
  if (tomorrow === undefined) return "";
  if (tomorrow === null || tomorrow <= 0) {
    return feel === "bad" || (rpeGap ?? 0) >= 1 ? " Demain repos, il tombe bien." : " Demain repos : bon moment pour assimiler.";
  }
  const q = qualitativeDifficulty(tomorrow);
  return feel === "bad" || (rpeGap ?? 0) >= 1
    ? ` Demain : séance ${q} prévue, refais le point au réveil.`
    : ` Demain : séance ${q} prévue.`;
}

export function computeDecisionCard(params: {
  wellnessScore: number | null; // absolu (score composite du jour) — pour le garde-fou de computeAutoregSuggestion
  plannedDifficulty: number | null;
  baseline?: WellnessBaselineResult | null;
  wellnessFilledToday: boolean;
  // Plus consommés en interne (2026-09) — gardés dans l'interface pour ne pas casser les 4 appelants
  // qui les calculent/passent encore pour leurs propres besoins.
  trendCode?: TrendCode | null;
  trendInput?: TrendInput | null;
  sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[]; // historique — 42j idéalement (ACWR 28j + Fitness EWMA 42j + Forme), 7j minimum pour monotonie/contrainte seules
  anchor?: Date;
  perspective: TrendPerspective;
  subject?: string; // prénom — absent = 2e personne (Coach Control passe le prénom, /today rien)
  // Plus consommé en interne (2026-09) — déjà porté par les chips de comportements affichées sur la
  // carte. Gardé dans l'interface pour ne pas casser les appelants qui le passent encore.
  behaviorTip?: string | null;
  // Présent = carte avec ligne "Phase" (/today, Coach Control). Absent = comportement inchangé.
  day?: DecisionDay;
  /* Ce que dit la montre avant le check-in (2026-09-30, deviceSummary) : ajouté à "Plan à confirmer"
     et au jour de repos non renseigné, avec l'invitation à faire le check-in. Sportif seul (le coach ne
     lit pas health_daily). */
  deviceNote?: string | null;
}): DecisionCard {
  const anchor = params.anchor ?? new Date();
  const coach = params.perspective === "coach";

  /* Signal chronique — ACWR/monotonie/contrainte (Foster, 7j) + tendance Fitness/Forme (EWMA 42j) —
     100% dérivé de l'historique de séances, ZÉRO recouvrement avec le wellness du jour (déjà géré
     directement par computeAutoregSuggestion via wellnessScore/baseline) : jamais un double comptage
     du même signal. */
  const { monotonyVal, strainVal } = monotonyStrainFor(params.sessions, anchor);
  const load42 = lastNLoadPoints(params.sessions, anchor, 42);
  const emptyZone = { label: "", color: "#8a8f94", text: "" };
  const loadZone = acwr(load42);
  const loadInfo = loadZone.value !== null ? sigDimInfo("load", loadZone.value, params.perspective) : emptyZone;
  const monotonyInfo = monotonyVal !== null ? sigDimInfo("monotony", monotonyVal, params.perspective) : emptyZone;
  const strainInfo = strainVal !== null ? sigDimInfo("strain", strainVal, params.perspective) : emptyZone;
  const formSeries = formPercentSeries(load42);
  const formValue = formSeries.length ? formSeries[formSeries.length - 1].value : null;
  const formInfo = formValue !== null ? sigDimInfo("form", formValue, params.perspective) : emptyZone;

  /* Tendance Fitness retirée des candidats (2026-09-29, bug trouvé par Gildas : "Alléger
     recommandé" sur un wellness "Équilibré", déclenché par "Ta charge chronique est en baisse") :
     son seul état non-vert est la BAISSE, un risque de perte de forme, donc l'inverse d'une fatigue.
     La compter ici resserrait le seuil d'allègement précisément quand le sportif en fait moins.
     Seuls restent les signaux orientés fatigue (ACWR haut, monotonie, contrainte, Forme négative) ;
     la sous-charge ACWR (jaune) est déjà "good" pour severityOf, même logique. */
  // Chaque candidat porte son propre objet `{text,...}` déjà écrit et directionnellement correct
  // (mêmes objets que la carte ⚡ Charge de /conseils) — jamais juste un nom de métrique, pour que
  // chronicContextLine() puisse réutiliser TEL QUEL le texte du candidat gagnant (voir plus bas).
  const chronicCandidates: { info: { text: string }; sev: Severity }[] = [
    { info: loadInfo, sev: severityOf(loadInfo.color) },
    { info: monotonyInfo, sev: severityOf(monotonyInfo.color) },
    { info: strainInfo, sev: severityOf(strainInfo.color) },
    { info: formInfo, sev: severityOf(formInfo.color) },
  ];
  const chargeSeverity = worstOf(...chronicCandidates.map(c => c.sev));
  const worstChronic = chronicCandidates
    .filter(c => c.sev !== "good")
    .sort((a, b) => (b.sev === "alert" ? 2 : 1) - (a.sev === "alert" ? 2 : 1))[0]?.info ?? null;

  // -10/-20 points sur le score effectif AVANT le calcul du mismatch (voir autoregulation.ts) —
  // même magnitude que le garde-fou watch/alert déjà en place ailleurs, pas une nouvelle échelle.
  const chronicPenalty = chargeSeverity === "alert" ? -20 : chargeSeverity === "watch" ? -10 : 0;

  const suggestion = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline, chronicPenalty);
  const ctxLine = chronicContextLine(worstChronic);

  if (params.day) return withPhase({ ...params, day: params.day }, suggestion, chronicPenalty);

  if (suggestion) {
    /* Allègement déclenché par le seul chronique (2026-09-29) : sans la pénalité, le wellness du jour
       n'aurait rien déclenché. autoregAdvice() écrirait alors "Récupération basse", faux à côté d'un
       cercle "Équilibré" : la cause réelle est la charge, nommée juste en dessous par ctxLine. */
    return {
      suggestion, icon: suggestion.icon,
      text: [
        autoregHeadline(suggestion.dir),
        adviceLine(suggestion, chronicPenalty, params),
        ctxLine,
      ].filter((l): l is string => !!l).join("\n"),
    };
  }

  if (!params.wellnessFilledToday) {
    return { suggestion: null, icon: "🟢", text: `Plan cohérent\nRenseigne ta récupération pour des conseils personnalisés.${deviceNoteLine(params.deviceNote)}` };
  }
  return { suggestion: null, icon: "🟢", text: ctxLine ? `Plan cohérent\n${ctxLine}` : "Plan cohérent" };
}

/* Montre avant le check-in : " Ta montre : Nuit 5h40 · FC 4 bpm au-dessus de ta norme. Fais ton
   check-in pour confirmer." — le ressenti reste la décision, la montre n'est qu'un signal d'appel. */
function deviceNoteLine(note?: string | null): string {
  return note ? ` Ta montre : ${note}. Fais ton check-in pour confirmer.` : "";
}

/* Carte "avec phase" (2026-09-29) : titre + ligne 2 selon l'état de la journée, puis la ligne Phase.
   La phase est crossTrendInsight() tel quel (mêmes entrées que la carte ⚡ Charge / 🌿 Récupération,
   sur la même fenêtre CONSEILS_HISTORY_DAYS pour que la tendance 6 semaines ne diverge pas de
   l'onglet Charge). */
function withPhase(
  params: Parameters<typeof computeDecisionCard>[0] & { day: DecisionDay },
  suggestion: AutoregSuggestion | null,
  chronicPenalty: number,
): DecisionCard {
  const anchor = params.anchor ?? new Date();
  const day = params.day;
  const voice: Voice = { coach: params.perspective === "coach", subject: params.subject };
  const perspective = params.perspective;

  const loadLong = lastNLoadPoints(params.sessions, anchor, CONSEILS_HISTORY_DAYS);
  const ff = fitnessFatigueTrend(loadLong);
  const fitnessTrendInfo = ff.fitness !== null ? trendDimInfo("fitness", ff.fitness, perspective) : null;
  const { monotonyVal, strainVal } = monotonyStrainFor(params.sessions, anchor);
  const acwrZone = acwr(lastNLoadPoints(params.sessions, anchor, 42));
  const emptyZone = { label: "", color: "#8a8f94", text: "" };
  const loadInfo = acwrZone.value !== null ? sigDimInfo("load", acwrZone.value, perspective) : emptyZone;
  const monotonyInfo = monotonyVal !== null ? sigDimInfo("monotony", monotonyVal, perspective) : emptyZone;
  const strainInfo = strainVal !== null ? sigDimInfo("strain", strainVal, perspective) : emptyZone;
  // Sans ressenti du jour, 75 = même repli que computeConseilsData() : ne sert qu'à la phrase floutée.
  const scoreForPhase = params.wellnessFilledToday && params.wellnessScore !== null ? params.wellnessScore : 75;
  const baselineForPhase = params.wellnessFilledToday ? params.baseline : null;
  const relative = !!(baselineForPhase?.hasEnoughHistory && baselineForPhase.composite.z !== null);
  // Relatif : mêmes zones Z que la reco (Z_SWC). Absolu : bande 60-80 de la reco (absoluteFeel),
  // jamais les seuils 50/70 de sigDimInfo, sinon ligne 2 et phase se contredisent.
  const recoveryInfo = relative
    ? sigDimInfo("recovery", scoreForPhase, perspective, baselineForPhase)
    : { label: ({ bad: "RÉCUP FRAGILE", mid: "RÉCUP STABLE", good: "BONNE RÉCUP" } as const)[absoluteFeel(scoreForPhase)], color: "", text: "" };
  const cross = crossTrendInsight(loadInfo, monotonyInfo, strainInfo, ff.fitness, fitnessTrendInfo, ff.fatigue, recoveryInfo, perspective);
  const feel = feelOf(recoveryInfo.label);
  const tomorrow = day.tomorrowDifficulty;

  const insufficient = (!acwrZone.hasEnoughHistory && !partialChargeReady(lastNLoadPoints(params.sessions, anchor, 42))) || (params.wellnessFilledToday && !params.baseline?.hasEnoughHistory);
  const phaseCore: Omit<NonNullable<DecisionCard["phase"]>, "insufficient"> = !params.wellnessFilledToday
    ? { title: null, text: chargeHalfText(ff.fatigue, ff.fitness, voice, day.kind === "rest"), severity: null, lockedText: day.kind === "rest" ? restText(feel, relative, ff.fitness, tomorrow, voice) : cross.text }
    : day.kind === "rest"
    ? { title: cross.title, text: restText(feel, relative, ff.fitness, tomorrow, voice), severity: cross.severity, lockedText: null }
    : day.kind === "done"
    ? { title: cross.title, text: cross.text + afterText(feel, day.rpe !== null && day.planned !== null ? day.rpe - day.planned : null, tomorrow), severity: cross.severity, lockedText: null }
    : { title: cross.title, text: cross.text, severity: cross.severity, lockedText: null };
  const phase: NonNullable<DecisionCard["phase"]> = { ...phaseCore, insufficient };

  const tomorrowLine = tomorrow === undefined ? ""
    : typeof tomorrow === "number" && tomorrow > 0 ? ` Demain : séance ${qualitativeDifficulty(tomorrow)}.` : " Demain : repos.";

  if (day.kind === "rest") {
    /* La ligne 2 commente le ressenti du jour (2026-09-30, Gildas) au lieu de redire "aucune séance
       prévue", que le titre dit déjà. Même lecture que la reco : zones relatives si la baseline le
       permet, bande 60-80 sinon (feel). */
    const ta = v(voice, "ta", "sa"), Ta = v(voice, "Ta", "Sa");
    const feelLine = !params.wellnessFilledToday
      ? (params.deviceNote && !voice.coach
          ? `Ta montre : ${params.deviceNote}. Fais ton check-in pour confirmer ta récupération.`
          : v(voice, "Renseigne ton ressenti pour savoir comment tu récupères.", "Ressenti du jour pas encore renseigné."))
      : feel === "bad"
      ? `${Ta} récupération est ${relative ? `sous ${ta} norme` : "basse"} : ce repos tombe bien.`
      : feel === "good"
      ? `${Ta} récupération est ${relative ? `au-dessus de ${ta} norme` : "bonne"} : le repos consolide.`
      : `${Ta} récupération est ${relative ? `dans ${ta} norme` : "correcte"}.`;
    // Repos déclaré ou subi (2026-10-01) : une piste douce, jamais imposée.
    const restNudge = params.wellnessFilledToday ? v(voice, " Une marche de 20 à 30 min ou 10 min d'étirements aident à récupérer.", " Une marche ou des étirements l'aideraient à récupérer.") : "";
    return { suggestion: null, icon: params.wellnessFilledToday ? "🟢" : "⚪", text: `Jour de repos\n${feelLine}${restNudge}${tomorrowLine}`, phase };
  }
  if (day.kind === "done") {
    const gap = day.rpe !== null && day.planned !== null ? day.rpe - day.planned : null;
    const felt = day.rpe === null
      ? v(voice, "Pense à noter ton RPE.", "RPE pas encore noté.")
      : gap === null ? `RPE ${day.rpe}.`
      : gap >= 1 ? `Ressentie plus dure que prévu (${day.rpe} pour ${day.planned}).`
      : gap <= -1 ? `Ressentie plus facile que prévu (${day.rpe} pour ${day.planned}).`
      : "Ressentie comme prévu.";
    return { suggestion: null, icon: "🟢", text: `Séance faite\n${felt}`, phase };
  }

  const planned = params.plannedDifficulty ?? 6;
  const qualif = qualitativeDifficulty(planned);
  if (!params.wellnessFilledToday) {
    const montre = deviceNoteLine(params.deviceNote);
    return { suggestion: null, icon: "⚪", text: `Plan à confirmer\nSéance ${qualif} prévue.${montre}`, phase };
  }
  if (suggestion) {
    return {
      suggestion, icon: suggestion.icon, phase,
      text: `${autoregHeadline(suggestion.dir)}\n${adviceLine(suggestion, chronicPenalty, params)}`,
    };
  }
  return {
    suggestion: null, icon: "🟢", phase,
    text: `Plan cohérent\n${v(voice, `La séance ${qualif} prévue colle à ta récupération du jour.`, `La séance ${qualif} prévue colle à sa récupération du jour.`)}`,
  };
}
