import type { WellnessDaily, Session } from "@/types";
import { describeDrivingDimension, type WellnessBaselineResult } from "@/lib/wellnessBaseline";

export const POSITIVE_BEHAVIOR_KEYS = new Set([
  "stretching", "cold_shower", "reading", "meditation", "hydration", "walk",
]);

export function computeWellnessScore(
  sleep: number,
  stress: number,
  recovery: number,
  motivation: number,
  behaviors: string[]
): { base_score: number; score: number } {
  const base_score = Math.round(
    ((sleep + (10 - stress) + recovery + motivation) / 40) * 100
  );
  const negatives = behaviors.filter(b => !POSITIVE_BEHAVIOR_KEYS.has(b));
  const positives = behaviors.filter(b => POSITIVE_BEHAVIOR_KEYS.has(b));
  const penalty = Math.min(negatives.length * 3, 15);
  const bonus = Math.min(positives.length * 2, 10);
  const score = Math.max(0, Math.min(100, base_score - penalty + bonus));
  return { base_score, score };
}

export function computeFatigueImpact(rpe: number, durationMinutes: number): number {
  return Math.min(Math.round((rpe * durationMinutes) / 60), 25);
}

export function computeDisplayScore(
  wellnessScore: number,
  dailyImpacts: number[]
): number {
  const totalImpact = dailyImpacts.reduce((a, b) => a + b, 0);
  return Math.max(0, wellnessScore - totalImpact);
}

export function scoreLabel(score: number): "s-great" | "s-ok" | "s-low" {
  if (score >= 70) return "s-great";
  if (score >= 45) return "s-ok";
  return "s-low";
}

export function zoneLabel(score: number | null): string {
  if (score === null) return "Non renseigné";
  if (score >= 82) return "Zone optimale";
  if (score >= 65) return "Zone stable";
  if (score >= 45) return "Zone prudente";
  return "Zone récupération";
}

/* Rampe séquentielle bleue pour toute couleur wellness dérivée d'un score (rings, tendances) —
   source unique, voir la doc complète dans SparkLineClient.tsx (skill dataviz : magnitude
   continue 0-100 = job "Sequential", pas "Status" rouge/orange/vert). Ancrage choisi par Gildas
   après test visuel (inverse de la 1ère version, elle-même déjà un choix délibéré vs la convention
   par défaut) : le foncé = en forme (score haut), le clair = fatigué (score bas) — sur les deux
   types de fond (cartes sombres ET la carte claire de CoachSessionModal), le foncé reste la couleur
   "prononcée"/qui ressort, le clair la couleur "discrète". Valeurs reprises telles quelles de la
   rampe séquentielle bleue documentée du skill dataviz (jamais de hex inventé à l'œil) ; le step le
   plus foncé (#184f95) reste calibré ≥2:1 sur fond sombre (voir palette.md du skill). */
const WELLNESS_RAMP: { stop: number; hex: string }[] = [
  { stop: 0,    hex: "#cde2fb" },
  { stop: 0.25, hex: "#b7d3f6" },
  { stop: 0.5,  hex: "#6da7ec" },
  { stop: 0.75, hex: "#2a78d6" },
  { stop: 1,    hex: "#184f95" },
];
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}
export function wellnessColor(score: number | null): string {
  if (score === null) return "#8a8f94";
  const t = Math.max(0, Math.min(1, score / 100));
  let lo = WELLNESS_RAMP[0], hi = WELLNESS_RAMP[WELLNESS_RAMP.length - 1];
  for (let i = 0; i < WELLNESS_RAMP.length - 1; i++) {
    if (t >= WELLNESS_RAMP[i].stop && t <= WELLNESS_RAMP[i + 1].stop) { lo = WELLNESS_RAMP[i]; hi = WELLNESS_RAMP[i + 1]; break; }
  }
  const localT = (t - lo.stop) / (hi.stop - lo.stop || 1);
  const [r1, g1, b1] = hexToRgb(lo.hex);
  const [r2, g2, b2] = hexToRgb(hi.hex);
  return rgbToHex([r1 + (r2 - r1) * localT, g1 + (g2 - g1) * localT, b1 + (b2 - b1) * localT]);
}
export { WELLNESS_RAMP };

export function getContextualInsight(
  wellness: Pick<WellnessDaily, "sleep" | "stress" | "recovery" | "motivation" | "score">,
  postSession?: { displayScore: number; totalImpact: number }
): string {
  if (postSession && postSession.totalImpact > 0) {
    const { displayScore, totalImpact } = postSession;
    if (displayScore >= 65) return `Séance encaissée (−${totalImpact} pts) — récupération encore confortable`;
    if (displayScore >= 45) return `Séance qui pèse (−${totalImpact} pts) — hydratation et sommeil ce soir`;
    return `Charge élevée aujourd'hui (−${totalImpact} pts) — récupération prioritaire ce soir`;
  }
  const { sleep, stress, recovery, motivation } = wellness;
  const signals = [
    { value: sleep, low: sleep < 5, msg: "Sommeil court — intensité réduite recommandée" },
    { value: 10 - stress, low: stress > 6, msg: "Stress élevé — favorise la récupération aujourd'hui" },
    { value: recovery, low: recovery < 5, msg: "Récupération insuffisante — séance légère ou repos" },
    { value: motivation, low: motivation < 5, msg: "Motivation en berne — commence doucement, ça viendra" },
  ];
  const weakest = signals.filter(s => s.low).sort((a, b) => a.value - b.value)[0];
  if (weakest) return weakest.msg;
  if ((wellness.score ?? 0) >= 82) return "Tous les signaux au vert — fenêtre idéale pour t'entraîner";
  return "Signaux stables — bon entraînement possible";
}

function yesterdayNote(doneYesterday: Session[]): string {
  if (!doneYesterday.length) return "Hier : repos.";
  const maxRpe = Math.max(...doneYesterday.map(s => s.rpe!));
  return `Hier : séance à ${maxRpe}/10.`;
}

function trainingChainAdvice(doneToday: Session[], plannedToday: Session[], doneYesterday: Session[]): string {
  const note = yesterdayNote(doneYesterday);
  if (doneToday.length) {
    const avgRpe = +(doneToday.reduce((a, s) => a + s.rpe!, 0) / doneToday.length).toFixed(1);
    const mins = doneToday.reduce((a, s) => a + s.duration!, 0);
    return `${doneToday.length} séance${doneToday.length > 1 ? "s" : ""} terminée${doneToday.length > 1 ? "s" : ""} · Effort moy. ${avgRpe}/10 · ${mins} min. ${note}`;
  }
  if (plannedToday.length) {
    const diff = Math.max(...plannedToday.map(s => s.target_difficulty!));
    return `Séance à ${diff}/10 prévue aujourd'hui. ${note}`;
  }
  return `Aucune séance prévue aujourd'hui. ${note}`;
}

function recoveryAdvice(
  wellness: Pick<WellnessDaily, "score" | "sleep" | "stress" | "recovery" | "motivation"> | null,
  doneToday: Session[],
  postSession?: { totalImpact: number }
): string {
  if (!wellness) return "Remplis ta récupération pour voir ton état de forme.";
  const score = wellness.score ?? 0;

  if (doneToday.length && postSession && postSession.totalImpact > 0) {
    const load = doneToday.reduce((a, s) => a + s.rpe! * s.duration!, 0);
    const loadTip = load > 600 ? "Hydratation + glucides/protéines post-séance, coucher tôt et mobilité douce."
      : load > 300 ? "Hydrate-toi bien, 10 min de mobilité et sommeil régulier."
      : "Routine simple : hydratation, marche légère et sommeil stable.";
    return `Récupération −${postSession.totalImpact} pts après l'effort. ${loadTip}`;
  }

  const { sleep, stress, recovery, motivation } = wellness;
  const signals = [
    { value: sleep, low: sleep < 5, msg: "Sommeil court", tip: "vise un coucher avant 23h ce soir" },
    { value: 10 - stress, low: stress > 6, msg: "Stress élevé", tip: "priorise la récupération aujourd'hui" },
    { value: recovery, low: recovery < 5, msg: "Récupération insuffisante", tip: "mobilité douce et hydratation prioritaires" },
    { value: motivation, low: motivation < 5, msg: "Motivation en berne", tip: "sommeil et charge mentale à surveiller" },
  ];
  const weakest = signals.filter(s => s.low).sort((a, b) => a.value - b.value)[0];
  if (weakest) return `${weakest.msg} (${score}/100) — ${weakest.tip}.`;

  if (score >= 82) return `Tous les signaux au vert (${score}/100) — hydratation et sommeil réguliers suffisent.`;
  if (score >= 65) return `Signaux stables (${score}/100) — routine simple : hydratation, sommeil régulier.`;
  if (score >= 45) return `Récupération prudente (${score}/100) — priorise hydratation et sommeil ce soir.`;
  return `Récupération fragile (${score}/100) — sommeil, nutrition simple, pas d'effort intense.`;
}

export function getAdvice(
  wellness: Pick<WellnessDaily, "score" | "sleep" | "stress" | "recovery" | "motivation"> | null,
  todaySessions: Session[],
  yesterdaySessions: Session[] = [],
  postSession?: { displayScore: number; totalImpact: number }
): { training: string; recovery: string } {
  const doneToday = todaySessions.filter(s => s.done && s.rpe && s.duration);
  const plannedToday = todaySessions.filter(s => !s.done && s.target_difficulty);
  const doneYesterday = yesterdaySessions.filter(s => s.done && s.rpe && s.duration);
  return {
    training: trainingChainAdvice(doneToday, plannedToday, doneYesterday),
    recovery: recoveryAdvice(wellness, doneToday, postSession),
  };
}

const NEGATIVE_BEHAVIOR_TIPS: Record<string, { label: string; tip: string }> = {
  alcohol:       { label: "Alcool hier soir",     tip: "hydrate-toi bien, évite d'en reprendre ce soir" },
  late_sleep:    { label: "Couché tard hier",     tip: "vise un coucher avant 23h ce soir" },
  tobacco:       { label: "Tabac hier",           tip: "espace les prochaines prises, ça pèse sur ta récup" },
  screen_late:   { label: "Écrans tard hier",     tip: "coupe les écrans 30 min avant de dormir ce soir" },
  heavy_meal:    { label: "Repas lourd hier",     tip: "privilégie un dîner léger ce soir" },
  caffeine_late: { label: "Caféine tardive hier", tip: "évite la caféine après 14h aujourd'hui" },
  social_out:    { label: "Sortie tardive hier",  tip: "priorise un coucher tôt ce soir pour compenser" },
  travel:        { label: "Voyage hier",          tip: "hydrate-toi bien, les trajets fatiguent plus qu'il n'y paraît" },
};

/* `baseline` (optionnel) : dès que l'historique du sportif est suffisant, la dimension "faible"
   citée devient celle qui dévie le plus de SA norme perso (drivingDimension/describeDrivingDimension,
   src/lib/wellnessBaseline.ts) plutôt que le seuil absolu (sleep<5/stress>6/recovery<5/motivation<5)
   — même repli exact sinon (comportement inchangé). Les comportements négatifs (alcool, écrans
   tard...) restent prioritaires et absolus dans les deux cas — pas de notion de "norme perso" pour
   un comportement ponctuel. */
export function getRecoveryAdvice(
  wellness: Pick<WellnessDaily, "sleep" | "stress" | "recovery" | "motivation" | "behaviors"> | null,
  loadCls: "hard" | "moderate" | "easy" | "rest",
  baseline?: WellnessBaselineResult | null
): string {
  if (!wellness) return "Remplis ta récupération pour voir ton état de forme.";
  const { sleep, stress, recovery, motivation, behaviors } = wellness;

  const charge = loadCls === "hard" ? "charge élevée en ce moment"
    : loadCls === "moderate" ? "charge modérée en ce moment"
    : "charge légère en ce moment";
  const isDemanding = loadCls === "hard";

  const negBehavior = behaviors.map(b => NEGATIVE_BEHAVIOR_TIPS[b]).find(Boolean);
  if (negBehavior) {
    return isDemanding
      ? `${negBehavior.label} — ${negBehavior.tip}. Avec une ${charge}, priorise le repos ce soir.`
      : `${negBehavior.label} — ${negBehavior.tip}.`;
  }

  if (baseline?.hasEnoughHistory) {
    const driving = describeDrivingDimension(baseline, "athlete");
    if (driving) return `${driving}, avec une ${charge} — hydratation et sommeil avant tout ce soir.`;
  } else {
    const signals = [
      { value: sleep, low: sleep < 5, label: "Sommeil court" },
      { value: 10 - stress, low: stress > 6, label: "Stress élevé" },
      { value: recovery, low: recovery < 5, label: "Récupération musculaire insuffisante" },
      { value: motivation, low: motivation < 5, label: "Motivation en berne" },
    ];
    const weakest = signals.filter(s => s.low).sort((a, b) => a.value - b.value)[0];
    if (weakest) return `${weakest.label}, avec une ${charge} — hydratation et sommeil avant tout ce soir.`;
  }

  if (isDemanding) return `Bons signaux, mais ${charge} — hydratation, protéines et sommeil pour bien récupérer.`;
  return `Bons signaux, ${charge} — routine simple : hydratation et sommeil réguliers.`;
}
