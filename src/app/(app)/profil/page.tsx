export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import ProfilClient from "./ProfilClient";
import type { Session, WellnessDaily } from "@/types";

export default async function ProfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const [{ data: profile }, { data: rawSessions }, { data: rawWellness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).gte("date", weekStartStr).lte("date", todayStr),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", weekStartStr).lte("date", todayStr).order("date", { ascending: false }),
  ]);

  const sessions = (rawSessions || []) as Session[];
  const wellness = (rawWellness || []) as WellnessDaily[];

  const doneSessions = sessions.filter(s => s.done && s.rpe);
  const avgRpe = doneSessions.length
    ? Math.round(doneSessions.reduce((a, s) => a + (s.rpe || 0), 0) / doneSessions.length * 10) / 10
    : null;
  const avgWellness = wellness.length
    ? Math.round(wellness.reduce((a, w) => a + (w.score ?? w.base_score ?? 0), 0) / wellness.length)
    : null;
  const allBehaviors = Array.from(new Set(wellness.flatMap(w => w.behaviors || [])));
  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  return (
    <ProfilClient
      profile={profile!}
      email={user!.email || ""}
      doneSessions={doneSessions}
      avgRpe={avgRpe}
      avgWellness={avgWellness}
      allBehaviors={allBehaviors}
      hasActiveCoach={hasActiveCoach}
    />
  );
}
