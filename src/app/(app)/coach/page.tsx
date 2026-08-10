export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachClient from "./CoachClient";
import { realToView, demoToView } from "@/lib/coachSessions";
import { computeWeekOverWeekTrend, daysAgoStr, type TrendCode } from "@/lib/trainingLoad";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, WellnessDaily } from "@/types";

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, name, subscription_status, invite_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.mode !== "coach") redirect("/today");

  // Generate invite_code server-side if missing
  let inviteCode = profile.invite_code as string | null;
  if (!inviteCode) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const { error } = await supabase.from("profiles").update({ invite_code: code }).eq("user_id", user.id);
    if (!error) inviteCode = code;
  }

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
      ? admin.from("wellness_daily").select("user_id, score, behaviors").in("user_id", realUserIds).eq("date", today)
      : Promise.resolve({ data: [] as { user_id: string; score: number | null; behaviors: string[] | null }[] }),
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).eq("date", today)
      : Promise.resolve({ data: [] as Session[] }),
    allAthleteIds.length
      ? admin.from("coach_sessions").select("*").eq("coach_id", user.id).in("athlete_id", allAthleteIds).eq("date", today)
      : Promise.resolve({ data: [] as CoachSession[] }),
  ]);

  const wellnessToday = new Map<string, { score: number; behaviors: string[] }>();
  (liveWellnessRes.data || []).forEach(w => {
    wellnessToday.set(w.user_id, { score: w.score ?? 70, behaviors: w.behaviors ?? [] });
  });

  const updatedAthletes = athletes.map(a => {
    if (!a.user_id) return { ...a, wellnessFilledToday: true }; // démo : score fixe, pas de notion de jour
    const w = wellnessToday.get(a.user_id);
    return w
      ? { ...a, wellness_score: w.score, behaviors: w.behaviors, wellnessFilledToday: true }
      : { ...a, wellnessFilledToday: false };
  });

  // Tendance charge/récupération 14j (7j courants vs 7j précédents) par sportif réel — alimente
  // decisionText()/attention() du Coach Control (voir src/lib/trainingLoad.ts). Fenêtre minimale
  // pour une comparaison semaine vs semaine, même fetch admin bypass que /coach/athletes.
  const since14 = daysAgoStr(13);
  const [historySessionsRes, historyWellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", since14)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", since14)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
  ]);
  const historySessions = (historySessionsRes.data || []) as Session[];
  const historyWellness = (historyWellnessRes.data || []) as WellnessDaily[];

  const trends: Record<string, TrendCode | null> = {};
  for (const a of updatedAthletes) {
    if (!a.user_id) { trends[a.id] = null; continue; }
    const mySessions = historySessions.filter(s => s.user_id === a.user_id);
    const myWellness = historyWellness.filter(w => w.user_id === a.user_id);
    trends[a.id] = computeWeekOverWeekTrend(mySessions, myWellness).code;
  }

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
      inviteCode={inviteCode}
      trends={trends}
    />
  );
}
