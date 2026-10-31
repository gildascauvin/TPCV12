import type { WellnessDaily } from "@/types";
import { computeWellnessScore } from "@/lib/wellness";

/* Point forme fait hors ligne, en attente d'envoi : reconstruit pour l'affichage (le serveur recalcule
   le score à l'envoi, montre comprise). Partagé par l'accueil et la semaine (31/10). */
export function localWellness(d: { sleep: number; stress: number; recovery: number; motivation: number; behaviors: string[]; bedtime: string }, date: string): WellnessDaily {
  const { base_score, score } = computeWellnessScore(d.sleep, d.stress, d.recovery, d.motivation, d.behaviors);
  return {
    id: `offline-${date}`, user_id: "", date, sleep: d.sleep, stress: d.stress, recovery: d.recovery, motivation: d.motivation,
    base_score, score, behaviors: d.behaviors, bedtime: d.bedtime, created_at: new Date().toISOString(),
  };
}
