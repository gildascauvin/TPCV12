import type { SupabaseClient } from "@supabase/supabase-js";

/* Entraînements de la montre (health_workouts, alimentée par healthSync.ts dans l'app iOS).
   Aucun import Capacitor : lu depuis le web comme depuis l'app pour pré-remplir la durée
   dans "Terminer la séance". */

export type HealthWorkout = {
  platform_id: string;
  date: string;
  start_at: string;
  duration_min: number;
  workout_type: string;
  source: string | null;
};

const LABELS: Record<string, string> = {
  traditionalStrengthTraining: "Musculation", functionalStrengthTraining: "Renfo fonctionnel",
  strengthTraining: "Musculation", weightlifting: "Haltérophilie", crossTraining: "Cross training",
  highIntensityIntervalTraining: "HIIT", coreTraining: "Gainage", running: "Course",
  runningTreadmill: "Course tapis", trackAndField: "Athlétisme", cycling: "Vélo",
  bikingStationary: "Vélo d'appartement", swimming: "Natation", swimmingPool: "Natation",
  swimmingOpenWater: "Eau libre", rowing: "Aviron", rowingMachine: "Rameur", walking: "Marche",
  hiking: "Randonnée", yoga: "Yoga", pilates: "Pilates", flexibility: "Mobilité", stretching: "Étirements",
  boxing: "Boxe", kickboxing: "Kickboxing", martialArts: "Arts martiaux", climbing: "Escalade",
  rockClimbing: "Escalade", soccer: "Football", basketball: "Basket", rugby: "Rugby", tennis: "Tennis",
  volleyball: "Volley", handball: "Handball", mixedCardio: "Cardio", elliptical: "Elliptique",
  jumpRope: "Corde à sauter", calisthenics: "Calisthenics", other: "Entraînement",
};

export const workoutLabel = (t: string) => LABELS[t] ?? "Entraînement";

export const workoutTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
};

// Les entraînements de moins de 5 min (échauffement lancé par erreur, marche auto-détectée) sont ignorés.
export async function fetchWorkoutsForDay(supabase: SupabaseClient, userId: string, date: string): Promise<HealthWorkout[]> {
  const { data, error } = await supabase
    .from("health_workouts")
    .select("platform_id, date, start_at, duration_min, workout_type, source")
    .eq("user_id", userId)
    .eq("date", date)
    .gte("duration_min", 5)
    .order("start_at");
  if (error) { console.error("[health_workouts] lecture:", error.message); return []; }
  return data ?? [];
}
