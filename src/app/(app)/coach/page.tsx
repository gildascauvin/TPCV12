export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachClient from "./CoachClient";
import { realToView, demoToView } from "@/lib/coachSessions";
import type { CoachAthlete, CoachViewSession, Session, CoachSession } from "@/types";

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, name, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.mode !== "coach") redirect("/today");

  const today = new Date().toISOString().split("T")[0];
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

  const [liveWellnessRes, realSessionsRes, demoSessionsRes] = await Promise.all([
    realUserIds.length
      ? admin.from("wellness_daily").select("user_id, score").in("user_id", realUserIds).order("date", { ascending: false })
      : Promise.resolve({ data: [] as { user_id: string; score: number | null }[] }),
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).eq("date", today)
      : Promise.resolve({ data: [] as Session[] }),
    allAthleteIds.length
      ? admin.from("coach_sessions").select("*").eq("coach_id", user.id).in("athlete_id", allAthleteIds).eq("date", today)
      : Promise.resolve({ data: [] as CoachSession[] }),
  ]);

  const wellnessLatest = new Map<string, number>();
  (liveWellnessRes.data || []).forEach(w => {
    if (!wellnessLatest.has(w.user_id)) wellnessLatest.set(w.user_id, w.score ?? 70);
  });

  const updatedAthletes = athletes.map(a =>
    a.user_id && wellnessLatest.has(a.user_id)
      ? { ...a, wellness_score: wellnessLatest.get(a.user_id)! }
      : a
  );

  const todaySessions: CoachViewSession[] = [
    ...(realSessionsRes.data || []).map(s => realToView(s as Session, athletes)),
    ...(demoSessionsRes.data || []).map(s => demoToView(s as CoachSession)),
  ];

  return (
    <CoachClient
      coachName={profile.name}
      athletes={updatedAthletes}
      todaySessions={todaySessions}
      today={today}
      userId={user.id}
      subscriptionStatus={profile.subscription_status ?? "free"}
    />
  );
}
