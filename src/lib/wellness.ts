import type { WellnessDaily, Session } from "@/types";

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

export function getContextualInsight(wellness: Pick<WellnessDaily, "sleep" | "stress" | "recovery" | "motivation" | "score">): string {
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

export function getAdvice(wellness: Pick<WellnessDaily, "score"> | null, sessions: Session[]): { training: string; recovery: string } {
  const done = sessions.filter((s) => s.done && s.rpe && s.duration);
  const planned = sessions.filter((s) => !s.done && s.target_difficulty);
  const score = wellness?.score ?? null;
  const plannedDiff = planned.length ? Math.max(...planned.map(s => s.target_difficulty!)) : null;

  if (!wellness && !done.length) {
    return {
      training: "Remplis ton wellness pour obtenir tes recommandations.",
      recovery: "Les conseils apparaîtront ici.",
    };
  }
  if (done.length) {
    const load = done.reduce((a, s) => a + s.rpe! * s.duration!, 0);
    const avgRpe = +(done.reduce((a, s) => a + s.rpe!, 0) / done.length).toFixed(1);
    const mins = done.reduce((a, s) => a + s.duration!, 0);
    return {
      training: `${done.length} séance${done.length > 1 ? "s" : ""} terminée${done.length > 1 ? "s" : ""} · Effort moy. ${avgRpe}/10 · ${mins} min. ${load > 600 ? "Charge haute : récupération prioritaire." : load > 300 ? "Charge modérée : évite d'ajouter de l'intensité." : "Charge légère : progression possible."}`,
      recovery: load > 600 ? "Hydratation + glucides/protéines post-séance, coucher tôt et mobilité douce." : load > 300 ? "Hydrate-toi bien, 10 min de mobilité et sommeil régulier." : "Routine simple : hydratation, marche légère et sommeil stable.",
    };
  }
  if (score !== null && plannedDiff !== null) {
    const diff = plannedDiff;
    const expectedScore = (diff / 10) * 100;
    if (plannedDiff >= 8 && score < 65) return {
      training: `Séance dure prévue (${plannedDiff}/10) · Score aujourd'hui ${score} — allège à 6/10 ou reporte si possible.`,
      recovery: "Wellness bas + séance intense : priorité hydratation, sommeil avant 23h, pas d'effort max.",
    };
    if (plannedDiff >= 8 && score >= 80) return {
      training: `Séance dure prévue (${plannedDiff}/10) · Score excellent (${score}) — fenêtre idéale, vas-y !`,
      recovery: "Maintiens les bons signaux : hydratation, protéines et coucher régulier.",
    };
    if (plannedDiff >= 8) return {
      training: `Séance dure prévue (${plannedDiff}/10) · Score ${score} — reste attentif à ta récupération après.`,
      recovery: "Post-séance intense : protéines 1,6–2g/kg/j et coucher avant 23h.",
    };
    if (Math.abs(score - expectedScore) <= 15) return {
      training: `Séance à ${diff}/10 · Cohérent avec ton score du jour (${score}) — go !`,
      recovery: score >= 75 ? "Maintiens les bons signaux : hydratation, protéines et coucher régulier." : "Hydrate-toi bien et vise un coucher avant 23h.",
    };
  }
  return {
    training: score! >= 80 ? `Score excellent (${score}/100). Fenêtre idéale pour une séance qualitative.` : score! >= 65 ? `Forme correcte (${score}/100). Intensité normale.` : score! >= 45 ? `Fatigue modérée (${score}/100). Allège légèrement l'intensité.` : `Score bas (${score}/100). Réduis l'intensité de 20–30%.`,
    recovery: score! >= 75 ? "Maintiens les bons signaux : hydratation, protéines et coucher régulier." : score! >= 55 ? "Priorise hydratation 35ml/kg, protéines 1,6–2g/kg/j et coucher avant 23h." : "Récupération prioritaire : sommeil, nutrition simple, pas d'effort max.",
  };
}
