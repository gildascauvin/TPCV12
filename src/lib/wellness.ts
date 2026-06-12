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
