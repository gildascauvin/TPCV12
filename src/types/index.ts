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
}

export interface CoachAthlete {
  id: string;
  coach_id: string;
  name: string;
  sport: string | null;
  wellness_score: number;
  user_id: string | null; // null = démo, string = vrai sportif lié
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
