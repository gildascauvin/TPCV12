import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CoachPlanningClient from "./CoachPlanningClient";
import type { CoachAthlete, CoachSession } from "@/types";

export default async function CoachPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("mode").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.mode !== "coach") redirect("/today");

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const until = new Date();
  until.setDate(until.getDate() + 21);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = until.toISOString().split("T")[0];

  const [{ data: rawAthletes }, { data: rawSessions }] = await Promise.all([
    supabase.from("coach_athletes").select("*").eq("coach_id", user.id).order("created_at"),
    supabase.from("coach_sessions").select("*").eq("coach_id", user.id).gte("date", sinceStr).lte("date", untilStr),
  ]);

  return (
    <CoachPlanningClient
      userId={user.id}
      athletes={(rawAthletes || []) as CoachAthlete[]}
      initialSessions={(rawSessions || []) as CoachSession[]}
    />
  );
}
