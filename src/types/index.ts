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
