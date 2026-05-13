export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachPlanningClient from "./CoachPlanningClient";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import type { CoachAthlete, CoachViewSession, Session, CoachSession } from "@/types";

export default async function CoachPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("mode, subscription_status").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.mode !== "coach") redirect("/today");

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const until = new Date();
  until.setDate(until.getDate() + 21);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = until.toISOString().split("T")[0];

  const admin = createAdminClient();

  // Use regular client for coach_athletes — RLS allows coach to read own records
  const { data: rawAthletes } = await supabase
    .from("coach_athletes")
    .select("*")
    .eq("coach_id", user.id)
    .order("created_at");

  const athletes = (rawAthletes || []) as CoachAthlete[];
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const allAthleteIds = athletes.map(a => a.id);

  const [realSessionsRes, coachSessionsRes, wellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as Session[] }),
    allAthleteIds.length
      ? admin.from("coach_sessions").select("*").eq("coach_id", user.id).in("athlete_id", allAthleteIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as CoachSession[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("user_id, date, score").in("user_id", realUserIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as { user_id: string; date: string; score: number | null }[] }),
  ]);

  const initialSessions: CoachViewSession[] = [
    ...(realSessionsRes.data || []).map(s => realToView(s as Session, athletes)),
    ...(coachSessionsRes.data || []).map(s => demoToView(s as CoachSession)),
  ];

  const wellnessMap = buildWellnessMap(
    (wellnessRes.data || []) as { user_id: string; date: string; score: number | null }[]
  );

  return (
    <CoachPlanningClient
      userId={user.id}
      athletes={athletes}
      initialSessions={initialSessions}
      initialWellnessMap={wellnessMap}
      subscriptionStatus={profile.subscription_status ?? "free"}
    />
  );
}
