import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CoachClient from "./CoachClient";
import type { CoachAthlete, CoachSession } from "@/types";

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.mode !== "coach") redirect("/today");

  const today = new Date().toISOString().split("T")[0];

  const [{ data: rawAthletes }, { data: rawSessions }] = await Promise.all([
    supabase.from("coach_athletes").select("*").eq("coach_id", user.id).order("created_at"),
    supabase.from("coach_sessions").select("*").eq("coach_id", user.id).eq("date", today),
  ]);

  const athletes = (rawAthletes || []) as CoachAthlete[];
  const sessions = (rawSessions || []) as CoachSession[];

  return (
    <CoachClient
      coachName={profile.name}
      athletes={athletes}
      todaySessions={sessions}
      today={today}
      userId={user.id}
    />
  );
}
