import type { Session } from "@/types";
import { daysAgoStr, dailyLoad, monotony, strain, describeTrend, trendSeverity, acwr, formPercentSeries, fitnessFatigueTrend, type LoadPoint, type TrendCode, type TrendInput, type TrendPerspective } from "@/lib/trainingLoad";
import { sigDimInfo, trendDimInfo, chargeCrossInsight, recoveryCrossInsight } from "@/lib/fatigueSignature";
import { Z_SEVERE, Z_MODERATE, WELLNESS_ABSOLUTE_GUARD_SCORE, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { computeAutoregSuggestion, autoregStatusLabel, autoregDetail, autoregCtaWordLabel, type AutoregSuggestion } from "@/lib/autoregulation";

/* Carte décision unifiée /today + Coach Control (2026-09) — remplace 2 mécanismes séparés
   (row() de TodayClient.tsx, ad hoc wellness×diff du jour ; l'usage binaire de classifyTrend() dans
   CoachAthleteCard.tsx qui n'affichait jamais sa propre phrase) par UN SEUL calcul, toujours non-null,
   qui combine 3 sources de signal — jamais une 4e dimension inventée :
     1. le jour (computeAutoregSuggestion, wellness vs séance prévue — inchangé)
     2. la tendance 7j/7j (classifyTrend/describeTrend, déjà utilisée sur /conseils)
     3. la monotonie/contrainte (Foster 1998, déjà sourcées dans fatigueSignature.ts)
   Le signal le plus sévère gagne, peu importe la source — jamais un mélange de textes de 2 sources
   différentes. Les chips (±%) ciblent toujours la séance du jour, quelle que soit la source qui a
   déclenché — c'est le seul objet concret sur lequel agir. */

// Magnitudes fixes pour les sources #2/#3 (pas de mismatch continu comme le signal du jour) —
// "réduire un peu" pour recuperation_insuffisante (🟡 watch), sévérité franche pour le reste.
const TREND_SUGGESTION: Partial<Record<TrendCode, AutoregSuggestion>> = {
  accumulation: { dir: "low", reco: -15, icon: "⚠️" },
  fatigue_persistante: { dir: "low", reco: -15, icon: "⚠️" },
  recuperation_insuffisante: { dir: "low", reco: -5, icon: "⚠️" },
  supercompensation: { dir: "high", reco: 10, icon: "🚀" },
};

/* Titre = diagnostic, CTA = verbe (2026-09, retour de Gildas — "Récupérer" en titre pour le code
   `recuperation` (phase de récupération qui va BIEN) sonnait comme une consigne à faire, alors que
   c'est un constat positif). TREND_STATUS_LABEL couvre les 9 codes (nom humain de la tendance,
   toujours utilisé comme titre — remplace trendActionWord() dans decisionCard.ts, qui reste
   inchangée pour ses autres appelants : /conseils, /coach/athletes). TREND_CTA_WORD ne couvre que
   les 4 codes réellement actionnables (mêmes clés que TREND_SUGGESTION) — le verbe précis affiché
   sur le bouton, jamais dans le titre. */
const TREND_STATUS_LABEL: Record<TrendCode, string> = {
  accumulation: "Accumulation",
  fatigue_persistante: "Fatigue persistante",
  recuperation_insuffisante: "Récupération insuffisante",
  adaptation: "Adaptation",
  recuperation: "Récupération",
  recuperation_legere: "Récupération légère",
  tolerance_stable: "Tolérance stable",
  supercompensation: "Supercompensation",
  stable: "Stable",
};
const TREND_CTA_WORD: Partial<Record<TrendCode, string>> = {
  accumulation: "Réduire",
  fatigue_persistante: "Récupérer",
  recuperation_insuffisante: "Réduire",
  supercompensation: "Augmenter",
};

function monotonySuggestion(m: number | null): AutoregSuggestion | null {
  if (m === null) return null;
  if (m >= 2.5) return { dir: "low", reco: -15, icon: "🚨" };
  if (m >= 2) return { dir: "low", reco: -10, icon: "⚠️" };
  return null;
}
function strainSuggestion(s: number | null): AutoregSuggestion | null {
  if (s === null) return null;
  if (s >= 10000) return { dir: "low", reco: -15, icon: "🚨" };
  if (s >= 6000) return { dir: "low", reco: -10, icon: "⚠️" };
  return null;
}

// 🚨 > ⚠️ > 🚀, et à icône égale "low" (alléger) passe toujours devant "high" (surcharger) — jamais
// l'inverse (une opportunité de surcharge ne doit jamais masquer un vrai signal de prudence).
const ICON_RANK: Record<string, number> = { "🚨": 3, "⚠️": 2, "🚀": 1 };
function severer(a: AutoregSuggestion | null, b: AutoregSuggestion | null): AutoregSuggestion | null {
  if (!a) return b;
  if (!b) return a;
  const ra = ICON_RANK[a.icon] + (a.dir === "low" ? 10 : 0);
  const rb = ICON_RANK[b.icon] + (b.dir === "low" ? 10 : 0);
  return ra >= rb ? a : b;
}

// `n` derniers jours de charge quotidienne jusqu'à `anchor` inclus — 7j pour monotonie/contrainte
// (Foster), 42j pour le calcul charge/récup ci-dessous (ACWR 28j + Fitness EWMA 42j).
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
   `suggestion` non-null) aux 3 icônes purement informatives (🔴/🟡/🟢, cas `suggestion` null — voir
   le fallback tendance de computeDecisionCard ci-dessous). Même teintes que leurs équivalents
   actionnables (🔴↔🚨 registre alerte, 🟡↔⚠️ watch, 🟢↔🚀 bon signe) — jamais une couleur inventée. */
export function decisionCardColor(icon: string): string {
  if (icon === "🚨" || icon === "🔴") return icon === "🚨" ? "#dc2626" : "#d44000";
  if (icon === "⚠️" || icon === "🟡") return "#f28a00";
  if (icon === "🚀" || icon === "🟢") return "#2f9e44";
  return "#d44000";
}

/* Signal récupération pure — jamais actionnable (pas de séance du jour à ajuster), mais informe même
   sans séance prévue. 2026-09, retour de Gildas : le signal #1 (jour) exige `plannedDifficulty` non
   null pour se déclencher — sans séance aujourd'hui, une dégradation aiguë de récupération ne
   déclenchait jusqu'ici rien, sauf si la tendance hebdo (lissée par construction, EWMA) avait eu le
   temps de la refléter. Mêmes seuils critique/bas que computeAutoregSuggestion() (garde-fou absolu,
   Z_SEVERE, Z_MODERATE) pour rester cohérent avec ce qui déclencherait une alerte SI une séance
   existait. `rank` sert à arbitrer contre la tendance informative (branche juste en dessous) — la
   plus sévère des deux gagne, jamais un mélange. */
function pureRecoverySignal(
  wellnessScore: number | null, baseline: WellnessBaselineResult | null | undefined, perspective: TrendPerspective,
): { rank: 1 | 2; icon: "🔴" | "🟡"; text: string } | null {
  if (wellnessScore === null) return null;
  const useZ = baseline?.hasEnoughHistory && baseline.composite.z !== null;
  const critical = (baseline?.guardRailTriggered ?? false) || wellnessScore < WELLNESS_ABSOLUTE_GUARD_SCORE || (useZ && baseline!.composite.z! <= Z_SEVERE);
  const low = useZ ? baseline!.composite.z! < -Z_MODERATE : wellnessScore < 55;
  if (!critical && !low) return null;
  const text = sigDimInfo("recovery", wellnessScore, perspective, baseline).text;
  return critical ? { rank: 2, icon: "🔴", text } : { rank: 1, icon: "🟡", text };
}

export interface DecisionCard {
  suggestion: AutoregSuggestion | null; // null = informatif seul, pas de chips
  icon: string;
  // "headline\ndetail[\nsecondaire]" — voir AlertText (AlertBox.tsx), qui rend chaque ligne séparément.
  // headline = TOUJOURS un diagnostic/statut (jamais un verbe) — voir `ctaLabel` pour l'action.
  text: string;
  /* Verbe précis du CTA (ex. "⬇ Réduire →") quand `suggestion` n'est pas null ET qu'un mot plus
     spécifique qu'Alléger/Surcharger existe (tendance nommée — TREND_CTA_WORD) — undefined = repli
     sur autoregCtaLabel(suggestion.dir) par AutoregButtons ("⬇ Alléger →"/"⬆ Surcharger →" générique),
     déjà correct pour todaySug/monotonie/contrainte (pas de verbe plus précis pour ces sources). */
  ctaLabel?: string;
}

export function computeDecisionCard(params: {
  wellnessScore: number | null; // absolu (score composite du jour) — pour le garde-fou de computeAutoregSuggestion
  plannedDifficulty: number | null;
  baseline?: WellnessBaselineResult | null;
  wellnessFilledToday: boolean;
  trendCode?: TrendCode | null;
  trendInput?: TrendInput | null;
  sessions: Pick<Session, "date" | "rpe" | "duration" | "done">[]; // historique — 42j idéalement (ACWR 28j + Fitness EWMA 42j pour les insights ⚡/🌿 ci-dessous), 7j minimum pour monotonie/contrainte seules
  anchor?: Date;
  perspective: TrendPerspective;
  subject?: string; // prénom — absent = 2e personne (Coach Control passe le prénom, /today rien)
  /* Plus consommé en interne (2026-09) — les branches charge/tendance utilisent désormais
     chargeCrossInsight()/recoveryCrossInsight() (mêmes textes que /conseils, voir plus bas), déjà
     porté par les chips de comportements affichées sur la carte, plus besoin de le répéter en texte
     ici. Gardé dans l'interface pour ne pas casser les appelants qui le passent encore. */
  behaviorTip?: string | null;
}): DecisionCard {
  const anchor = params.anchor ?? new Date();
  const { monotonyVal, strainVal } = monotonyStrainFor(params.sessions, anchor);

  const todaySug = computeAutoregSuggestion(params.wellnessScore, params.plannedDifficulty, params.baseline);
  const trendSug = params.trendCode ? TREND_SUGGESTION[params.trendCode] ?? null : null;
  const monoSug = monotonySuggestion(monotonyVal);
  const strainSug = strainSuggestion(strainVal);
  const winner = [todaySug, trendSug, monoSug, strainSug].reduce(severer, null);

  if (winner === todaySug && todaySug) {
    return {
      suggestion: todaySug, icon: todaySug.icon,
      text: `${autoregStatusLabel(todaySug.dir, params.baseline)}\n🌿 ${autoregDetail(todaySug.dir, params.plannedDifficulty ?? 6, params.subject)}`,
    };
  }

  /* Insights ⚡ charge / 🌿 récup — MÊMES fonctions et MÊMES textes que /conseils
     (chargeCrossInsight/recoveryCrossInsight, fatigueSignature.ts), calculés une seule fois et
     réutilisés tels quels par les 3 branches charge/tendance ci-dessous (jamais par le signal du
     jour ni la récup pure sans séance, restés spécifiques — voir leurs branches). 2026-09, retour de
     Gildas : "charge & récup entraînent le statut (et donc la décision)" — un seul vocabulaire entre
     la carte décision et /conseils, plus de texte bespoke (dimension dominante, behaviorTip...).
     Fenêtre 42j (couvre ACWR 28j + Fitness EWMA 42j) — déjà la largeur réelle de `sessions` chez les
     4 appelants actuels ; sinon repli gracieux (zones vides, jamais de "⚡ null"). */
  const load42 = lastNLoadPoints(params.sessions, anchor, 42);
  const emptyZone = { label: "", color: "#8a8f94", text: "" };
  const loadZone = acwr(load42);
  const loadInfo = loadZone.value !== null ? sigDimInfo("load", loadZone.value, params.perspective) : emptyZone;
  const monotonyInfo = monotonyVal !== null ? sigDimInfo("monotony", monotonyVal, params.perspective) : emptyZone;
  const strainInfo = strainVal !== null ? sigDimInfo("strain", strainVal, params.perspective) : emptyZone;
  const ffTrend = fitnessFatigueTrend(load42);
  const fitnessTrendInfo = ffTrend.fitness !== null ? trendDimInfo("fitness", ffTrend.fitness, params.perspective) : null;
  const fatigueTrendInfo = ffTrend.fatigue !== null ? trendDimInfo("fatigue", ffTrend.fatigue, params.perspective) : null;
  const chargeLine = `⚡ ${chargeCrossInsight(loadInfo, monotonyInfo, strainInfo, fitnessTrendInfo, fatigueTrendInfo, params.perspective)}`;

  const formSeries = formPercentSeries(load42);
  const formValue = formSeries.length ? formSeries[formSeries.length - 1].value : null;
  const recoveryZoneInfo = params.wellnessScore !== null ? sigDimInfo("recovery", params.wellnessScore, params.perspective, params.baseline) : null;
  const recoveryLine = recoveryZoneInfo ? `🌿 ${recoveryCrossInsight(recoveryZoneInfo, formValue, params.perspective, params.baseline)}` : null;
  // Réservé à la branche monotonie/contrainte (pas de code de tendance derrière ce titre-là,
  // chargeCrossInsight EN EST la source légitime — ses entrées incluent justement monotonie/strain).
  const chargeRecupBody = `\n${chargeLine}${recoveryLine ? `\n${recoveryLine}` : ""}`;
  /* Corps des branches PILOTÉES PAR UN CODE DE TENDANCE — jamais chargeCrossInsight() ici (2026-09,
     contradiction réelle trouvée par Gildas : titre "Récupération insuffisante" mais chargeCrossInsight
     répondait "tout est sain", les deux viennent de calculs différents — tendance 7j/7j glissante vs
     zones ACWR/monotonie/strain/Fitness-Fatigue EWMA 42j, qui peuvent légitimement diverger).
     describeTrend() est LA phrase qui a produit ce titre, donc garantie cohérente avec lui — jamais
     un texte d'une autre source pour la ligne ⚡ de ces branches. */
  const trendLine = params.trendCode && params.trendInput ? `⚡ ${describeTrend(params.trendCode, params.trendInput, params.perspective)}` : null;
  const trendBody = `\n${trendLine}${recoveryLine ? `\n${recoveryLine}` : ""}`;

  if (winner === trendSug && trendSug && params.trendCode && params.trendInput) {
    const ctaWord = TREND_CTA_WORD[params.trendCode];
    return {
      suggestion: trendSug, icon: trendSug.icon,
      ctaLabel: ctaWord ? autoregCtaWordLabel(trendSug.dir, ctaWord) : undefined,
      text: `${TREND_STATUS_LABEL[params.trendCode]}${trendBody}`,
    };
  }
  if ((monoSug && winner === monoSug) || (strainSug && winner === strainSug)) {
    // "élevée" (2026-09, retour de Gildas) — "Monotonie"/"Contrainte" seuls sont des noms de
    // métrique, pas un statut ; même règle que TREND_STATUS_LABEL (titre = diagnostic).
    const title = winner === monoSug ? "Monotonie élevée" : "Contrainte élevée";
    return { suggestion: winner, icon: winner!.icon, text: `${title}${chargeRecupBody}` };
  }

  /* Alerte pure récupération — seule source capable de signaler un vrai décrochage de récupération
     quand AUCUNE séance n'est prévue aujourd'hui (computeAutoregSuggestion ne peut alors jamais se
     déclencher, faute de difficulté à comparer au score : todaySug reste toujours null dans ce cas).
     Avant ce correctif, une charge dégradée sans séance au calendrier ne pouvait jamais alerter côté
     wellness — un vrai trou structurel (la charge, elle, alerte déjà sans séance via monotonie/
     contrainte) (2026-09, retour de Gildas). Jamais une "suggestion" actionnable (pas de séance à
     ajuster) — informatif seulement, icône/texte, jamais de chips. */
  const recoveryOnly = params.plannedDifficulty === null
    ? pureRecoverySignal(params.wellnessScore, params.baseline, params.perspective)
    : null;
  const recoveryOnlyLine = recoveryOnly
    ? `${recoveryOnly.icon === "🔴" ? "Récupération critique" : "Récupération à surveiller"}\n🌿 ${recoveryOnly.text}`
    : null;

  // Rien ne se déclenche — la carte reste toujours visible : tendance si dispo (même sans alerte),
  // sinon prompt wellness (jour non renseigné), sinon "Plan cohérent" générique.
  if (params.trendCode && params.trendInput) {
    const trendRank = trendSeverity(params.trendCode) === "alert" ? 2 : trendSeverity(params.trendCode) === "watch" ? 1 : 0;
    if (recoveryOnly && recoveryOnlyLine && recoveryOnly.rank >= trendRank) {
      return { suggestion: null, icon: recoveryOnly.icon, text: recoveryOnlyLine };
    }
    return {
      suggestion: null,
      icon: trendSeverity(params.trendCode) === "alert" ? "🔴" : trendSeverity(params.trendCode) === "watch" ? "🟡" : "🟢",
      text: `${TREND_STATUS_LABEL[params.trendCode]}${trendBody}`,
    };
  }
  if (!params.wellnessFilledToday) {
    return { suggestion: null, icon: "🟢", text: "Plan cohérent\n🌿 Pas encore assez d'historique pour dégager une tendance : renseigne ta récupération pour des conseils personnalisés." };
  }
  if (recoveryOnlyLine) {
    return { suggestion: null, icon: recoveryOnly!.icon, text: recoveryOnlyLine };
  }
  // Wellness rempli mais pas encore de tendance (historique <14j) : plutôt qu'une phrase méta qui ne
  // dit rien de l'état réel du jour ("on se base sur ta forme de ce matin" sans jamais dire laquelle),
  // affiche le VRAI repli — sigDimInfo("recovery",...) bascule déjà lui-même sur le Z-score perso dès
  // que l'historique JOURNALIER (12j, moins exigeant que la tendance 14j) est suffisant, sinon sur le
  // seuil absolu (comportement 100% inchangé pour un compte tout neuf) — jamais un nouveau texte
  // inventé ici, juste la même fonction déjà utilisée par /conseils et /coach/athletes.
  if (params.wellnessScore !== null) {
    return { suggestion: null, icon: "🟢", text: `Plan cohérent\n🌿 ${sigDimInfo("recovery", params.wellnessScore, params.perspective, params.baseline).text}` };
  }
  return { suggestion: null, icon: "🟢", text: "Plan cohérent\n🌿 Pas encore assez d'historique pour dégager une tendance, on se base sur ta forme de ce matin." };
}
