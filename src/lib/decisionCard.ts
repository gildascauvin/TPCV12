import { personalReason, type PersonalAdjust } from "@/lib/autoregPersonal";
import type { Session } from "@/types";
import { daysAgoStr, dailyLoad, partialChargeReady, monotony, strain, acwr, formPercentSeries, fitnessFatigueTrend, type LoadPoint, type TrendDirection, type TrendCode, type TrendInput, type TrendPerspective } from "@/lib/trainingLoad";
import { sigDimInfo, trendDimInfo, crossTrendInsight, type Severity as PhaseSeverity } from "@/lib/fatigueSignature";
import { CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import { Z_SWC, DIMENSION_KEYS, type WellnessBaselineResult, type DimensionKey } from "@/lib/wellnessBaseline";
import { NEGATIVE_BEHAVIOR_TIPS } from "@/lib/wellness";
import { computeAutoregSuggestion, autoregHeadline, autoregAdvice, autoregStatusLabel, autoregDetail, qualitativeDifficulty, absoluteFeel, zoneRange, pctToPoints, type AutoregSuggestion } from "@/lib/autoregulation";
import { decisionSummary, feltLine, type AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";

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
    const base = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline, 0, (params as { personal?: PersonalAdjust | null }).personal?.shift ?? 0, (params as { personal?: PersonalAdjust | null }).personal?.shiftHigh ?? 0);
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
  /* Séance faite (2026-10-04) : zone proposée ce jour-là (décision enregistrée, sinon reco recalculée
     depuis le point forme), pour que l'anneau "Faite" situe le RPE réel par rapport à elle. */
  doneZone?: { low: number; high: number } | null;
  /* Titre affiché sous l'anneau de décision, à la place de la 1re ligne de `text` (2026-10-12,
     Gildas) — repos et séance faite seulement ; une séance à ajuster prend le texte vivant de
     l'anneau (Dans / Sous / Au-dessus de la zone). `text` reste inchangé pour les autres usages. */
  title?: string;
  /* Ligne 2 affichée avec `title` (séance faite, 2026-10-12) : sans la comparaison, que le titre
     porte déjà. Absente = la ligne 2 de `text` est gardée telle quelle ; "" = plus de ligne 2. */
  titleDetail?: string;
}

/* Remplace la 1re ligne (headline) de `text` par `title`, si fourni — et la 2e par `detail`, si fourni. */
export function withTitle(text: string, title: string | null | undefined, detail?: string): string {
  if (!title) return text;
  const lines = text.split("\n");
  const rest = detail === undefined ? lines.slice(1) : [detail, ...lines.slice(2)];
  return [title, ...rest.filter(Boolean)].join("\n");
}

/* État de la journée vu par la carte (2026-09-29). `planned` = une séance reste à faire ;
   `done` = toutes faites, `rpe`/`planned` de la principale ; `rest` = aucune séance ce jour-là.
   `tomorrowDifficulty` : difficulté de la séance de demain, null = rien de prévu, undefined = inconnu
   (on ne parle alors pas de demain). */
export type DecisionDay =
  | { kind: "planned"; tomorrowDifficulty?: number | null }
  | { kind: "done"; rpe: number | null; planned: number | null; tomorrowDifficulty?: number | null; decision?: AutoregDecisionRecord | null }
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

/* Jour de repos, ressenti renseigné : la Phase parle de la charge (tendance chronique 42j) et de ce
   que ce repos change, jamais du niveau de récupération ni de demain, que la ligne 2 dit déjà
   (2026-10-11, Gildas : pas de redite entre les deux lignes). La ligne 2 reste autonome : le Planning
   n'affiche pas la Phase. */
function restText(feel: Feel, fitness: TrendDirection | null, tomorrow: number | null | undefined, voice: Voice): string {
  const hasTomorrow = typeof tomorrow === "number" && tomorrow > 0;
  const ta = v(voice, "ta", "sa"), Ta = v(voice, "Ta", "Sa");
  const restFx = `une journée sans séance fait baisser ${ta} fatigue accumulée`;
  const RestFx = `Une journée sans séance fait baisser ${ta} fatigue accumulée`;
  if (feel === "bad") {
    if (fitness === "up") return `${Ta} charge chronique monte : les signaux de fatigue convergent, et ${restFx}.`;
    if (fitness === "down") return `${Ta} charge chronique baisse mais la fatigue n'est pas encore résorbée : ${restFx}.`;
    if (fitness === "stable") return `${Ta} charge chronique est stable : ${restFx}, priorité au sommeil avant d'enchaîner.`;
    return `${RestFx}.`;
  }
  if (feel === "good") {
    if (fitness === "up") return v(voice,
      "Ta charge chronique monte et tu l'assimiles bien : bon moment pour performer à la reprise.",
      "Sa charge chronique monte, assimilation en cours : bon moment pour performer à la reprise.");
    if (fitness === "down") return `${Ta} charge chronique baisse : ce repos n'était pas indispensable.`;
    if (fitness === "stable") return `${Ta} charge chronique est stable et bien tolérée : ${v(voice, "tu as", "il reste")} de la marge pour la suite.`;
    return v(voice, "Pas encore assez de séances pour lire ta charge.", "Pas encore assez de séances pour lire sa charge.");
  }
  if (fitness === "up") return `${Ta} charge chronique monte et ${v(voice, "ton", "son")} corps encaisse bien : ${restFx}.`;
  if (fitness === "down") return `${RestFx}, mais ${ta} charge chronique baisse aussi : `
    + (hasTomorrow ? `${ta} prochaine séance tombe bien pour la relancer.` : "possible perte de forme si ça dure.");
  if (fitness === "stable") return `${Ta} charge chronique est stable et ${restFx}.`;
  return `${RestFx}.`;
}

/* Ligne 2 d'une reco quand la carte porte une Phase (2026-10-11) : le niveau de récupération est dit
   ICI, avec la même lecture que la Phase (relative si norme, bande 60-80 sinon), et la Phase n'en
   reparle plus. Corrige au passage 2 libellés faux : "Forme optimale" sur une récup dans la norme
   (surcharge d'une séance très légère), "Récupération dans ta norme" sur un sportif frais (norm_hard). */
function phaseAdviceLine(
  suggestion: AutoregSuggestion, chronicOnly: boolean, feel: Feel, relative: boolean, voice: Voice,
  params: { plannedDifficulty: number | null; baseline?: WellnessBaselineResult | null; subject?: string },
): string {
  const planned = params.plannedDifficulty ?? 6;
  const q = qualitativeDifficulty(planned);
  const subj = params.subject;
  const of = subj ? ` de ${subj}` : "";
  const ta = v(voice, "ta", "sa");
  const level = relative
    ? ({ bad: `sous ${ta} norme`, mid: `dans ${ta} norme`, good: `au-dessus de ${ta} norme` } as const)[feel]
    : ({ bad: "basse", mid: "correcte", good: "bonne" } as const)[feel];
  const head = `Récupération${of} ${level}`;
  if (chronicOnly) {
    return `${head}, mais ${ta} charge récente pèse : la séance ${q} prévue est un peu trop élevée.`;
  }
  if (suggestion.kind === "norm_hard") {
    return `${head} : sur une séance ${q} comme celle-ci, ${subj ? "garder un point de marge suffit" : "garde un point de marge"}.`;
  }
  const standard = (suggestion.dir === "low" && feel === "bad") || (suggestion.dir === "high" && feel === "good");
  const label = standard ? autoregStatusLabel(suggestion.dir, params.baseline) : head;
  return `${label} : ${autoregDetail(suggestion.dir, planned, subj)}`;
}

function isChronicOnly(suggestion: AutoregSuggestion, chronicPenalty: number, params: { wellnessScore: number | null; plannedDifficulty: number | null; baseline?: WellnessBaselineResult | null }): boolean {
  if (suggestion.dir !== "low" || chronicPenalty === 0 || suggestion.kind === "norm_hard") return false;
  const base = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline, 0, (params as { personal?: PersonalAdjust | null }).personal?.shift ?? 0, (params as { personal?: PersonalAdjust | null }).personal?.shiftHigh ?? 0);
  return !base || base.kind === "norm_hard";
}

/* Après la séance : ce que la journée implique pour demain. Dit en ligne 2 depuis le 2026-10-13
   (comme le jour de repos), la Phase ne garde que la charge. Coach : pas de consigne, ses conseils
   de ligne 2 disent déjà « vérifie son ressenti au réveil ». */
function afterText(feel: Feel | null, rpeGap: number | null, tomorrow: number | null | undefined, coach = false): string {
  if (tomorrow === undefined) return "";
  const heavy = feel === "bad" || (rpeGap ?? 0) >= 1;
  if (tomorrow === null || tomorrow <= 0) return heavy ? " Demain repos, il tombe bien." : " Demain repos pour consolider.";
  const q = qualitativeDifficulty(tomorrow);
  return heavy && !coach ? ` Demain : séance ${q} prévue, refais le point au réveil.` : ` Demain : séance ${q} prévue.`;
}

/* Ressenti vs prévu, en mots (2026-10-13, Gildas : on peut être dans la zone et avoir trouvé la
   séance plus dure que prévu ; des mots plutôt que des chiffres). Repère = la difficulté prévue de
   la séance (après ajustement éventuel), pas la zone que dit déjà le titre. */
function feltVsPlanned(rpe: number | null, planned: number | null): string {
  if (rpe === null || planned === null) return "";
  const gap = Math.round(rpe) - Math.round(planned);
  if (gap === 0) return "Séance ressentie comme prévu.";
  const how = Math.abs(gap) === 1 ? "un peu" : Math.abs(gap) === 2 ? "modérément" : "beaucoup";
  return `Séance ressentie ${how} plus ${gap > 0 ? "dure" : "facile"} que prévu.`;
}

/* Pénalité chronique (charge récente, monotonie, contrainte, Forme négative) — extraite le
   2026-10-05 pour que le radar du Coach Control place chaque sportif EXACTEMENT là où la reco le
   voit (récupération effective = récupération − pénalité, voir recoveryAxisX/computeAutoregSuggestion). */
export function chronicPenaltyFor(sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[], anchor: Date = new Date(), perspective: TrendPerspective = "athlete") {
  const { monotonyVal, strainVal } = monotonyStrainFor(sessions, anchor);
  const load42 = lastNLoadPoints(sessions, anchor, 42);
  const emptyZone = { label: "", color: "#8a8f94", text: "" };
  const loadZone = acwr(load42);
  const loadInfo = loadZone.value !== null ? sigDimInfo("load", loadZone.value, perspective) : emptyZone;
  const monotonyInfo = monotonyVal !== null ? sigDimInfo("monotony", monotonyVal, perspective) : emptyZone;
  const strainInfo = strainVal !== null ? sigDimInfo("strain", strainVal, perspective) : emptyZone;
  const formSeries = formPercentSeries(load42);
  const formValue = formSeries.length ? formSeries[formSeries.length - 1].value : null;
  const formInfo = formValue !== null ? sigDimInfo("form", formValue, perspective) : emptyZone;

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
  return { chronicPenalty, worstChronic };
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
  /* Ce que dit la montre avant le point forme (2026-09-30, deviceSummary) : ajouté à "Plan à confirmer"
     et au jour de repos non renseigné, avec l'invitation à faire le point forme. Sportif seul (le coach ne
     lit pas health_daily). */
  deviceNote?: string | null;
  /* Ressenti vs physiologie (2026-10-11), sportif seul (le coach ne lit pas health_*).
     `verdict` = point forme du jour vs données de la nuit : c'est du niveau de récup du jour, donc
     ligne 2 (jamais la Phase). `heartRepeated` = 2 dernières séances d'une même famille plus dures
     que ce que dit le cœur : une tendance, donc Phase. `sessionHeart` = la séance faite ce jour-là vs
     son cœur : une fois la séance faite, c'est elle que commente la ligne 2, plus le point forme du matin. */
  physio?: { verdictTitle?: string | null; heartRepeated?: string | null; sessionHeart?: string | null } | null;
  /* Comportements cochés au point forme du jour (2026-10-12) : un comportement négatif est le 1er
     signal cité par le conseil après séance (doneAdvice). */
  behaviors?: string[] | null;
  /* Réglages personnels (2026-10-23, autoregPersonal.ts) : seuil recalé + signal appris. Sportif :
     calculés en direct ; coach : relus dans la reco figée au point forme (autoreg_proposal), pour que
     les deux voient la même décision. */
  personal?: PersonalAdjust | null;
}): DecisionCard {
  const anchor = params.anchor ?? new Date();

  /* Signal chronique — ACWR/monotonie/contrainte (Foster, 7j) + tendance Fitness/Forme (EWMA 42j) —
     100% dérivé de l'historique de séances, ZÉRO recouvrement avec le wellness du jour (déjà géré
     directement par computeAutoregSuggestion via wellnessScore/baseline) : jamais un double comptage
     du même signal. */
  const { chronicPenalty: chronicOnlyPenalty, worstChronic } = chronicPenaltyFor(params.sessions, anchor, params.perspective);
  const shift = params.personal?.shift ?? 0;
  const shiftHigh = params.personal?.shiftHigh ?? 0;
  const personalPenalty = params.personal?.penalty ?? 0;
  const chronicPenalty = chronicOnlyPenalty + personalPenalty;

  const suggestion = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline, chronicPenalty, shift, shiftHigh);
  /* Le signal appris pèse dans l'alerte « Alléger » : la ligne 2 dit cette cause-là, plus parlante
     qu'une récup générique (Gildas, 2026-10-23 : « Appris sur toi »). */
  const personalLine = suggestion?.dir === "low" && personalPenalty ? personalReason(params.personal, params.subject) : null;
  const ctxLine = chronicContextLine(worstChronic);

  if (params.day) return withPhase({ ...params, day: params.day }, suggestion, chronicPenalty, personalLine, shift, shiftHigh);

  if (suggestion) {
    /* Allègement déclenché par le seul chronique (2026-09-29) : sans la pénalité, le wellness du jour
       n'aurait rien déclenché. autoregAdvice() écrirait alors "Récupération basse", faux à côté d'un
       cercle "Équilibré" : la cause réelle est la charge, nommée juste en dessous par ctxLine. */
    return {
      suggestion, icon: suggestion.icon,
      text: [
        autoregHeadline(suggestion.dir),
        personalLine ? `Appris sur toi : ${personalLine}` : adviceLine(suggestion, chronicPenalty, params),
        ctxLine,
      ].filter((l): l is string => !!l).join("\n"),
    };
  }

  if (!params.wellnessFilledToday) {
    return { suggestion: null, icon: "🟢", text: `Plan cohérent\nRenseigne ta récupération pour des conseils personnalisés.${deviceNoteLine(params.deviceNote)}` };
  }
  return { suggestion: null, icon: "🟢", text: ctxLine ? `Plan cohérent\n${ctxLine}` : "Plan cohérent" };
}

/* Données physiologiques avant le point forme (2026-10-13) : on dit seulement qu'elles sont arrivées,
   jamais leurs valeurs, pour ne pas biaiser le ressenti (saisie à l'aveugle, cf. Ressenti vs physiologie). */
function deviceNoteLine(note?: string | null): string {
  return note ? " Tes données physiologiques de la nuit sont arrivées : fais ton point forme pour les comparer à ton ressenti." : "";
}

/* Carte "avec phase" (2026-09-29) : titre + ligne 2 selon l'état de la journée, puis la ligne Phase.
   La phase est crossTrendInsight() tel quel (mêmes entrées que la carte ⚡ Charge / 🌿 Récupération,
   sur la même fenêtre CONSEILS_HISTORY_DAYS pour que la tendance 6 semaines ne diverge pas de
   l'onglet Charge). */
/* ── Conseil après séance (ligne 2 de la carte, 2026-10-12, Gildas) ─────────────────────────────
   Une phrase, sans le mot « zone » (le titre le dit) ni « demain » (la Phase le dit). Elle rebondit
   sur le signal du matin qui ressort le plus : comportement négatif, puis dimension la plus loin de
   la norme (ou sous les seuils fixes sans historique), sinon la récup globale. */
type Outcome = "below" | "in" | "above";
type MorningSignal = { kind: "behavior"; label: string; tip: string } | { kind: "dim"; dim: DimensionKey; low: boolean };

function morningSignal(b: WellnessBaselineResult | null, behaviors: string[] | null): MorningSignal | null {
  const neg = (behaviors ?? []).map(k => NEGATIVE_BEHAVIOR_TIPS[k]).find(Boolean);
  if (neg) return { kind: "behavior", label: neg.label, tip: neg.tip };
  if (!b) return null;
  if (b.hasEnoughHistory) {
    // z déjà orienté « positif = mieux » sur les 4 dimensions (stress inversé, dimensionRaw).
    let best: { dim: DimensionKey; z: number } | null = null;
    for (const dim of DIMENSION_KEYS) {
      const z = b.dimensions[dim].z;
      if (z !== null && (!best || Math.abs(z) > Math.abs(best.z))) best = { dim, z };
    }
    return best && Math.abs(best.z) >= Z_SWC ? { kind: "dim", dim: best.dim, low: best.z < 0 } : null;
  }
  // Sans historique : mêmes seuils fixes que getRecoveryAdvice() (raw stress = 10 - stress).
  const lows = DIMENSION_KEYS
    .map(dim => ({ dim, v: b.dimensions[dim].raw }))
    .filter(x => x.dim === "stress" ? x.v < 4 : x.v < 5)
    .sort((x, y) => x.v - y.v);
  return lows.length ? { kind: "dim", dim: lows[0].dim, low: true } : null;
}

const LOW_ADVICE: Record<DimensionKey, Record<Outcome, [athlete: string, coach: string]>> = {
  sleep: {
    below: ["Bien vu de lever le pied après une nuit courte.", "Bien vu de lever le pied après une nuit courte."],
    in: ["Nuit courte mais séance tenue : couche-toi tôt.", "Nuit courte mais séance tenue : vérifie son ressenti au réveil."],
    above: ["Effort lourd après une nuit courte : couche-toi tôt.", "Effort lourd après une nuit courte : vérifie son ressenti au réveil."],
  },
  stress: {
    below: ["Bien vu de lever le pied sous stress.", "Bien vu de lever le pied sous stress."],
    in: ["Stress élevé : coupe les écrans ce soir.", "Stress élevé : vérifie son ressenti au réveil."],
    above: ["Effort lourd sous stress : coupe les écrans ce soir.", "Effort lourd sous stress : vérifie son ressenti au réveil."],
  },
  recovery: {
    below: ["Bien vu de ménager tes douleurs.", "Bien vu de ménager ses douleurs."],
    in: ["Douleurs présentes : étirements ce soir.", "Douleurs présentes : vérifie son ressenti au réveil."],
    above: ["Effort lourd sur des douleurs : étirements ce soir.", "Effort lourd sur des douleurs : vérifie son ressenti au réveil."],
  },
  motivation: {
    below: ["Motivation basse : change de stimulus la prochaine fois.", "Motivation basse : propose un autre stimulus la prochaine fois."],
    in: ["Séance tenue malgré une motivation basse.", "Séance tenue malgré une motivation basse."],
    above: ["Bel effort malgré une motivation basse.", "Bel effort malgré une motivation basse."],
  },
};
const HIGH_LABEL: Record<DimensionKey, string> = { sleep: "Bonne nuit", stress: "Stress bas", recovery: "Corps frais", motivation: "Belle motivation" };

function doneAdvice(a: {
  outcome: Outcome | null; coach: boolean; recoDir: AutoregSuggestion["dir"] | null; maintained: boolean;
  signal: MorningSignal | null; feel: Feel | null; relative: boolean;
}): string {
  const { outcome, coach } = a;
  if (outcome === null) return coach ? "RPE pas encore noté." : "Note ton RPE pour affiner ta prochaine reco.";
  // Reco ignorée et le RPE lui donne raison : prioritaire, remplace le reste.
  if (a.maintained && a.recoDir === "low" && outcome === "above")
    return coach ? "La reco d'alléger était justifiée." : "La reco d'alléger était justifiée : soigne ta récup.";
  if (a.maintained && a.recoDir === "high" && outcome === "below")
    return coach ? "La surcharge était à sa portée." : "Tu pouvais surcharger, suis la reco la prochaine fois.";
  const sig = a.signal;
  if (sig?.kind === "behavior") {
    if (outcome === "below") return `${sig.label} : bien vu de lever le pied.`;
    if (coach) return `${sig.label} : vérifie son ressenti au réveil.`;
    return outcome === "above"
      ? `Effort lourd, ${sig.label.charAt(0).toLowerCase()}${sig.label.slice(1)} : ${sig.tip}.`
      : `${sig.label} : ${sig.tip}.`;
  }
  if (sig?.kind === "dim" && sig.low) return LOW_ADVICE[sig.dim][outcome][coach ? 1 : 0];
  if (sig?.kind === "dim") {
    const l = HIGH_LABEL[sig.dim];
    return outcome === "below" ? `${l} : marge pour pousser la prochaine fois.`
      : outcome === "in" ? `${l}, séance bien dosée.`
      : `${l} : ça encaisse, mais pas deux jours de suite.`;
  }
  if (a.feel === null) return coach ? "Sans point forme, difficile de juger cette séance." : "Fais ton point forme demain pour juger tes séances.";
  const ta = coach ? "sa" : "ta", Ta = coach ? "Sa" : "Ta";
  if (a.feel === "bad") {
    const R = a.relative ? `récup sous ${ta} norme` : "récup fragile";
    return outcome === "below" ? `Bien vu de lever le pied sur une ${R}.`
      : outcome === "in" ? `${R.charAt(0).toUpperCase()}${R.slice(1)} : ${coach ? "vérifie son ressenti au réveil" : "couche-toi tôt ce soir"}.`
      : `Effort lourd sur une ${R} : ${coach ? "vérifie son ressenti au réveil" : "dors bien ce soir"}.`;
  }
  if (a.feel === "good") {
    const R = a.relative ? `Récup au-dessus de ${ta} norme` : "Bonne récup";
    return outcome === "below" ? `${R} : marge pour pousser la prochaine fois.`
      : outcome === "in" ? `${R}, séance bien dosée.`
      : `${R} : ça encaisse, mais pas deux jours de suite.`;
  }
  return outcome === "below" ? `${Ta} récup permettait plus${coach ? "." : ", ose la prochaine fois."}`
    : outcome === "in" ? `Effort adapté à ${ta} récup, rien à changer.`
    : `Effort au-delà de ${ta} récup : ${coach ? "vérifie son ressenti au réveil" : "soigne ton sommeil"}.`;
}

function withPhase(
  params: Parameters<typeof computeDecisionCard>[0] & { day: DecisionDay },
  suggestion: AutoregSuggestion | null,
  chronicPenalty: number,
  personalLine: string | null = null,
  shift = 0,
  shiftHigh = 0,
): DecisionCard {
  const anchor = params.anchor ?? new Date();
  const day = params.day;
  const voice: Voice = { coach: params.perspective === "coach", subject: params.subject };
  const perspective = params.perspective;

  /* Séance prévue pas encore faite (2026-10-07) : la charge du jour n'est pas connue, ce n'est pas
     un 0. Sans ça, la fatigue récente (EWMA 7j) chutait artificiellement chaque jour de séance prévue
     et un sportif fatigué lisait « ta charge récente se relâche pourtant » à tort. Les tendances de
     charge de la Phase sont donc lues jusqu'à la veille tant qu'aucune séance n'est faite aujourd'hui. */
  const todayStr = daysAgoStr(0, anchor);
  const doneToday = params.sessions.some(s => s.date === todayStr && s.done);
  const loadAnchor = day.kind === "planned" && !doneToday ? new Date(anchor.getTime() - 86_400_000) : anchor;
  const loadLong = lastNLoadPoints(params.sessions, loadAnchor, CONSEILS_HISTORY_DAYS);
  const ff = fitnessFatigueTrend(loadLong);
  const fitnessTrendInfo = ff.fitness !== null ? trendDimInfo("fitness", ff.fitness, perspective) : null;
  const { monotonyVal, strainVal } = monotonyStrainFor(params.sessions, loadAnchor);
  const acwrZone = acwr(lastNLoadPoints(params.sessions, loadAnchor, 42));
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

  const chronicOnly = !!suggestion && isChronicOnly(suggestion, chronicPenalty, params);
  const insufficient = (!acwrZone.hasEnoughHistory && !partialChargeReady(lastNLoadPoints(params.sessions, anchor, 42))) || (params.wellnessFilledToday && !params.baseline?.hasEnoughHistory);
  const phaseCore: Omit<NonNullable<DecisionCard["phase"]>, "insufficient"> = !params.wellnessFilledToday
    ? { title: null, text: chargeHalfText(ff.fatigue, ff.fitness, voice, day.kind === "rest"), severity: null, lockedText: day.kind === "rest" ? restText(feel, ff.fitness, tomorrow, voice) : cross.text }
    : day.kind === "rest"
    ? { title: cross.title, text: restText(feel, ff.fitness, tomorrow, voice), severity: cross.severity, lockedText: null }
    : day.kind === "done"
    // La ligne 2 dit le ressenti, le conseil du matin et demain : la Phase ne garde que la charge.
    ? { title: cross.title, text: cross.chargeText, severity: cross.severity, lockedText: null }
    : suggestion
    // La ligne 2 dit le niveau de récupération et l'action du jour : la Phase ne garde que la charge.
    ? { title: cross.title, text: chronicOnly ? cross.chargeTextNoRecent : cross.chargeText, severity: cross.severity, lockedText: null }
    : { title: cross.title, text: cross.text, severity: cross.severity, lockedText: null };
  const heartRepeated = params.wellnessFilledToday ? params.physio?.heartRepeated ?? null : null;
  const phase: NonNullable<DecisionCard["phase"]> = {
    ...phaseCore,
    text: heartRepeated ? `${phaseCore.text} ${heartRepeated}` : phaseCore.text,
    insufficient,
  };
  // Ligne 2 : désaccord ressenti / données de la nuit (rien quand ils sont d'accord).
  const physioLine = params.wellnessFilledToday && params.physio?.verdictTitle ? ` ${params.physio.verdictTitle}.` : "";
  // Séance faite : son écart au cœur, sauf s'il est déjà dit par la Phase (écart répété).
  const doneHeartLine = params.physio?.sessionHeart && !heartRepeated ? ` ${params.physio.sessionHeart}` : "";

  const tomorrowLine = tomorrow === undefined ? ""
    : typeof tomorrow === "number" && tomorrow > 0 ? ` Demain : séance ${qualitativeDifficulty(tomorrow)}.` : " Demain : repos.";

  if (day.kind === "rest") {
    /* La ligne 2 commente le ressenti du jour (2026-09-30, Gildas) au lieu de redire "aucune séance
       prévue", que le titre dit déjà. Même lecture que la reco : zones relatives si la baseline le
       permet, bande 60-80 sinon (feel). */
    const ta = v(voice, "ta", "sa"), Ta = v(voice, "Ta", "Sa");
    const feelLine = !params.wellnessFilledToday
      ? (params.deviceNote && !voice.coach
          ? "Tes données physiologiques de la nuit sont arrivées : fais ton point forme pour les comparer à ton ressenti."
          : v(voice, "Renseigne ton ressenti pour savoir comment tu récupères.", "Ressenti du jour pas encore renseigné."))
      : feel === "bad"
      ? `${Ta} récupération est ${relative ? `sous ${ta} norme` : "basse"} : ce repos tombe bien.`
      : feel === "good"
      ? `${Ta} récupération est ${relative ? `au-dessus de ${ta} norme` : "bonne"} : le repos consolide.`
      : `${Ta} récupération est ${relative ? `dans ${ta} norme` : "correcte"}.`;
    // Repos déclaré ou subi (2026-10-01) : une piste douce, jamais imposée.
    const restNudge = params.wellnessFilledToday ? v(voice, " Une marche de 20 à 30 min ou 10 min d'étirements aident à récupérer.", " Une marche ou des étirements l'aideraient à récupérer.") : "";
    // Demain, dit ici et seulement ici (la Phase n'en parle plus) : selon le ressenti, une consigne.
    const restTomorrow = params.wellnessFilledToday && typeof tomorrow === "number" && tomorrow > 0
      ? (feel === "bad"
        ? ` Demain : séance ${qualitativeDifficulty(tomorrow)}, ${v(voice, "si ton ressenti ne remonte pas, allège-la.", "si son ressenti ne remonte pas, allège-la.")}`
        : feel === "good"
        ? ` Demain : séance ${qualitativeDifficulty(tomorrow)}, le bon moment pour pousser.`
        : tomorrowLine)
      : tomorrowLine;
    const restTitle = !params.wellnessFilledToday ? "Récup à confirmer"
      : ({ bad: "Récup fragile", mid: "Récup stable", good: "Bonne récup" } as const)[feel];
    return { suggestion: null, icon: params.wellnessFilledToday ? "🟢" : "⚪", title: restTitle, text: `Jour de repos\n${feelLine}${physioLine}${restNudge}${restTomorrow}`, phase };
  }
  if (day.kind === "done") {
    /* Repère = la zone PROPOSÉE (2026-10-04, Gildas : "6 pour 5, plus dure que prévu" alors que la
       reco était 7-8), pas seulement le plan. Décision enregistrée d'abord ; sans elle (séance faite
       sans passer par la carte), reco recalculée depuis le point forme du matin. */
    const rec = day.decision ?? null;
    let recoDir: AutoregSuggestion["dir"] | null = rec?.proposed ?? null;
    let zone: { low: number; high: number } | null = rec?.proposed && rec.zoneLow != null && rec.zoneHigh != null
      ? { low: rec.zoneLow, high: rec.zoneHigh } : null;
    if (!rec && params.wellnessFilledToday && day.planned !== null) {
      const sug = computeAutoregSuggestion(params.wellnessScore, day.planned, params.baseline, chronicPenalty, shift, shiftHigh);
      if (sug) {
        recoDir = sug.dir;
        const z = zoneRange(Math.round(day.planned + pctToPoints(sug.reco)), sug.dir);
        zone = { low: z.zoneLow, high: z.zoneHigh };
      }
    }
    const coachVoice = voice.coach || !!voice.subject;
    const summary = rec ? decisionSummary(rec, { role: perspective === "coach" ? "coach" : "athlete", subjectName: params.subject }) : null;
    const felt = feltLine(day.rpe, day.planned, zone, coachVoice);
    /* Titre = même repère qu'avant la séance (2026-10-12) : la zone proposée, ou sans reco la même
       zone par défaut que l'anneau avant séance (prévu et le point en dessous, AutoregButtons). La
       ligne 2 ne garde que le résumé de la décision : toute comparaison y redisait le titre. */
    const shownZone = zone ?? (day.planned !== null
      ? (({ zoneLow, zoneHigh }) => ({ low: zoneLow, high: zoneHigh }))(zoneRange(Math.round(day.planned), "low"))
      : null);
    const r = day.rpe !== null ? Math.round(day.rpe) : null;
    const doneTitle = r === null ? "Difficulté non notée"
      : shownZone ? (r < shownZone.low ? "Sous la zone" : r > shownZone.high ? "Au-dessus de la zone" : "Dans la zone")
      : undefined;
    const outcome: Outcome | null = r === null || !shownZone ? null : r < shownZone.low ? "below" : r > shownZone.high ? "above" : "in";
    const advice = doneAdvice({
      outcome, coach: coachVoice, recoDir,
      maintained: !rec || Math.round(rec.applied_difficulty) === Math.round(rec.original_difficulty),
      signal: params.wellnessFilledToday ? morningSignal(params.baseline ?? null, params.behaviors ?? null) : null,
      feel: params.wellnessFilledToday ? feel : null, relative,
    });
    // Ligne 2 = ressenti vs prévu + conseil + demain (2026-10-13). RPE non noté : le conseil le dit déjà.
    const doneLine = [
      feltVsPlanned(day.rpe, day.planned),
      advice,
    ].filter(Boolean).join(" ") + doneHeartLine + (r === null ? "" : afterText(params.wellnessFilledToday ? feel : null, day.rpe !== null && day.planned !== null ? day.rpe - day.planned : null, tomorrow, coachVoice));
    return { suggestion: null, icon: "🟢", title: doneTitle, titleDetail: doneTitle ? doneLine : undefined, text: `Séance faite\n${summary ? `${summary} ` : ""}${felt}${doneHeartLine}`, phase, doneZone: shownZone };
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
      text: `${autoregHeadline(suggestion.dir)}\n${personalLine ? `Appris sur ${voice.subject ? voice.subject : "toi"} : ${personalLine}` : phaseAdviceLine(suggestion, chronicOnly, feel, relative, voice, params)}${physioLine}`,
    };
  }
  return {
    suggestion: null, icon: "🟢", phase,
    text: `Plan cohérent\n${v(voice, `La séance ${qualif} prévue colle à ta récupération du jour.`, `La séance ${qualif} prévue colle à sa récupération du jour.`)}${physioLine}`,
  };
}
