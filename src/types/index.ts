export type SubscriptionStatus = "free" | "athlete" | "coach" | "expired";
export type UserMode = "athlete" | "coach";
export type Objective =
  | "performance"
  | "longevite"
  | "stress"
  | "composition"
  | "equilibre"
  | "rehab";

export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  sport: string | null;
  objective: Objective | null;
  freq_target: number | null;
  mode: UserMode;
  subscription_status: SubscriptionStatus;
  stripe_customer_id: string | null;
  onboarding_done: boolean;
  invite_code: string | null;
  training_days: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface WellnessDaily {
  id: string;
  user_id: string;
  date: string; // ISO date YYYY-MM-DD
  sleep: number;
  stress: number;
  recovery: number;
  motivation: number;
  base_score: number | null;
  score: number | null;
  behaviors: string[];
  bedtime: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  date: string;
  name: string;
  notes: string | null;
  duration: number | null;
  rpe: number | null;
  done: boolean;
  target_difficulty: number | null;
  created_at: string;
  program_assignment_id?: string | null;
  exercise_media?: Record<string, ExerciseAttachments> | null;
  viewed_by_athlete_at?: string | null;
  viewed_by_coach_at?: string | null;
}

export interface CoachAthlete {
  id: string;
  coach_id: string;
  name: string;
  sport: string | null;
  wellness_score: number;
  behaviors?: string[]; // comportements wellness du jour consulté — absent/[] si pas de ligne wellness_daily (démo, ou pas encore rempli)
  wellnessFilledToday?: boolean; // true si une ligne wellness_daily existe pour le jour consulté (toujours true pour les démo, sans notion de jour)
  user_id: string | null; // null = démo ou invite pending, string = vrai sportif lié
  invite_email: string | null; // non-null = invitation pending (sportif pas encore inscrit)
  created_at: string;
}

export interface CoachSession {
  id: string;
  coach_id: string;
  athlete_id: string;
  date: string;
  name: string;
  notes: string | null;
  done: boolean;
  rpe: number | null;
  duration: number | null;
  target_difficulty: number | null;
  created_at: string;
  program_assignment_id?: string | null;
  exercise_media?: Record<string, ExerciseAttachments> | null;
  viewed_by_athlete_at?: string | null;
  viewed_by_coach_at?: string | null;
}

export interface ExerciseComment {
  id: string;
  author: "coach" | "athlete";
  authorName: string;
  kind: "text" | "video";
  text?: string;
  url?: string;
  createdAt: string;
}

export interface ExerciseResult {
  value: string;
  unit: string;
}

export interface ExerciseAttachments {
  videoUrl?: string;
  photoUrl?: string;
  comments: ExerciseComment[];
  /* Résultat de test (valeur+unité) — présence = ligne marquée comme test, absence = exercice
     normal. Vit ici comme vidéo/photo (état local, sérialisé dans exercise_media au moment de la
     sauvegarde de la séance) ; en plus de ça, la séance écrit aussi une copie datée dans les tables
     `tests`/`test_results` pour permettre l'historique (voir src/lib/testResults.ts). */
  result?: ExerciseResult;
  /* Dernière modification (vidéo/photo ajoutée ou retirée, commentaire ajouté/modifié/supprimé) —
     pilote le point de notification sur la ligne dans les vues de lecture. */
  updatedAt?: string;
  updatedBy?: "coach" | "athlete";
}

// Unified session for coach views (real athlete → sessions table, demo → coach_sessions)
export interface CoachViewSession {
  id: string;
  athlete_id: string;      // coach_athletes.id
  date: string;
  name: string;
  notes: string | null;
  duration: number | null;
  rpe: number | null;
  done: boolean;
  target_difficulty: number | null;
  created_at: string;
  _real: boolean;          // true = sessions table, false = coach_sessions
  exercise_media?: Record<string, ExerciseAttachments> | null;
  viewed_by_athlete_at?: string | null;
  viewed_by_coach_at?: string | null;
}

export interface FatigueLog {
  id: string;
  user_id: string;
  date: string;
  total_impact: number;
  created_at: string;
}

export interface AIAdvice {
  training: string;
  recovery: string;
}

export type ProgramLevel = "debutant" | "intermediaire" | "avance" | "elite";
export type ProgramFocus = "mixte" | "technique" | "volume" | "intensite" | "competition" | "combat" | "autre";
export type SessionLoad = 1 | 2 | 3;
export type SessionType = "technique" | "volume" | "intensite" | "recuperation" | "test";

export interface SessionTemplate {
  name: string;
  notes: string | null;
  target_difficulty: number;
  load: SessionLoad;
  type: SessionType;
  exercise_media?: Record<string, ExerciseAttachments> | null;
}

export interface WeekTemplate {
  [day: string]: SessionTemplate[];
}

export interface ProgramTemplate {
  weeks: WeekTemplate[];
}

export interface Program {
  id: string;
  owner_id: string;
  name: string;
  sport: string | null;
  level: ProgramLevel | null;
  focus: ProgramFocus | null;
  weeks_count: number;
  sessions_per_week: number;
  template: ProgramTemplate;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProgramAssignment {
  id: string;
  program_id: string;
  coach_id: string;
  athlete_id: string | null;
  user_id: string | null;
  start_date: string;
  status: "active" | "paused" | "completed";
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      wellness_daily: { Row: WellnessDaily; Insert: Partial<WellnessDaily>; Update: Partial<WellnessDaily> };
      sessions: { Row: Session; Insert: Partial<Session>; Update: Partial<Session> };
      fatigue_log: { Row: FatigueLog; Insert: Partial<FatigueLog>; Update: Partial<FatigueLog> };
    };
  };
};
