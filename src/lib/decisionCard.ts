import type { Session } from "@/types";
import { daysAgoStr, dailyLoad, monotony, strain, acwr, formPercentSeries, fitnessFatigueTrend, type LoadPoint, type TrendCode, type TrendInput, type TrendPerspective } from "@/lib/trainingLoad";
import { sigDimInfo, trendDimInfo } from "@/lib/fatigueSignature";
import type { WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { computeAutoregSuggestion, autoregHeadline, autoregAdvice, type AutoregSuggestion } from "@/lib/autoregulation";

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

export interface DecisionCard {
  suggestion: AutoregSuggestion | null; // null = informatif seul, pas de jauge
  icon: string;
  // "headline\ndetail[\ncontexte chronique]" — voir AlertText (AlertBox.tsx), qui rend chaque ligne
  // séparément. headline = verbe si une suggestion existe ("Alléger recommandé"), "Plan cohérent"
  // sinon — jamais un verbe pour un état non-actionnable.
  text: string;
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
  const ffTrend = fitnessFatigueTrend(load42);
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, params.perspective) : null;
  const formSeries = formPercentSeries(load42);
  const formValue = formSeries.length ? formSeries[formSeries.length - 1].value : null;
  const formInfo = formValue !== null ? sigDimInfo("form", formValue, params.perspective) : emptyZone;

  // Chaque candidat porte son propre objet `{text,...}` déjà écrit et directionnellement correct
  // (mêmes objets que la carte ⚡ Charge de /conseils) — jamais juste un nom de métrique, pour que
  // chronicContextLine() puisse réutiliser TEL QUEL le texte du candidat gagnant (voir plus bas).
  const chronicCandidates: { info: { text: string }; sev: Severity }[] = [
    { info: loadInfo, sev: severityOf(loadInfo.color) },
    { info: monotonyInfo, sev: severityOf(monotonyInfo.color) },
    { info: strainInfo, sev: severityOf(strainInfo.color) },
    { info: fitnessTrendInfo ?? emptyZone, sev: fitnessTrendInfo ? severityOf(fitnessTrendInfo.color) : "good" },
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

  if (suggestion) {
    return {
      suggestion, icon: suggestion.icon,
      text: [
        autoregHeadline(suggestion.dir),
        autoregAdvice(suggestion.dir, params.plannedDifficulty ?? 6, params.subject, params.baseline),
        ctxLine,
      ].filter((l): l is string => !!l).join("\n"),
    };
  }

  if (!params.wellnessFilledToday) {
    return { suggestion: null, icon: "🟢", text: "Plan cohérent\nRenseigne ta récupération pour des conseils personnalisés." };
  }
  return { suggestion: null, icon: "🟢", text: ctxLine ? `Plan cohérent\n${ctxLine}` : "Plan cohérent" };
}
