export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachPlanningClient from "./CoachPlanningClient";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import { WELLNESS_BASELINE_WINDOW_DAYS } from "@/lib/wellnessBaseline";
import { buildSyntheticWellnessHistory } from "@/lib/sandboxFixtures";
import { startOfWeek, addDays, subDays, format } from "date-fns";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, WellnessDaily } from "@/types";

export default async function CoachPlanningPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("mode, name, subscription_status").eq("user_id", user.id).maybeSingle();
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

  // Pour un vrai sportif, le label "Séances libres" est le sien (profiles.free_training_label,
  // qu'il édite lui-même sur /week) — pas la colonne coach_athletes, qui ne sert qu'aux démo.
  if (realUserIds.length) {
    const { data: labelRows } = await admin.from("profiles").select("user_id, free_training_label").in("user_id", realUserIds);
    const byUserId = new Map((labelRows || []).map(r => [r.user_id, r.free_training_label]));
    for (const a of athletes) {
      if (a.user_id && byUserId.has(a.user_id)) a.free_training_label = byUserId.get(a.user_id) ?? {};
    }
  }

  // Ancré sur la semaine DEMANDÉE (searchParams.date si présent, sinon aujourd'hui) — pas
  // "aujourd'hui" en dur : un lien direct vers une semaine passée doit avoir assez de recul pour
  // CETTE semaine dès le premier rendu SSR, même logique que handleDateChange()/loadMonth() côté
  // client (CoachPlanningClient.tsx) qui refetchent à chaque navigation.
  const requestedBase = searchParams.date ? new Date(searchParams.date + "T12:00:00") : new Date();
  const requestedWeekStart = startOfWeek(requestedBase, { weekStartsOn: 1 });
  const requestedWeekEnd = format(addDays(requestedWeekStart, 6), "yyyy-MM-dd");
  const sinceBaseline = format(subDays(requestedWeekStart, WELLNESS_BASELINE_WINDOW_DAYS), "yyyy-MM-dd");

  const [realSessionsRes, coachSessionsRes, wellnessRes, wellnessBaselineRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as Session[] }),
    allAthleteIds.length
      ? admin.from("coach_sessions").select("*").eq("coach_id", user.id).in("athlete_id", allAthleteIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as CoachSession[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("user_id, date, score, base_score").in("user_id", realUserIds).gte("date", sinceStr).lte("date", untilStr)
      : Promise.resolve({ data: [] as { user_id: string; date: string; score: number | null; base_score: number | null }[] }),
    // Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — fenêtre glissante ~21j avant
    // aujourd'hui, indépendante de sinceStr/untilStr (calendrier navigable), batchée sur tous les
    // sportifs réels d'un coup.
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", sinceBaseline).lte("date", requestedWeekEnd)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
  ]);

  const initialSessions: CoachViewSession[] = [
    ...(realSessionsRes.data || []).map(s => realToView(s as Session, athletes)),
    ...(coachSessionsRes.data || []).map(s => demoToView(s as CoachSession)),
  ];

  const wellnessMap = buildWellnessMap(
    (wellnessRes.data || []) as { user_id: string; date: string; score: number | null; base_score: number | null }[]
  );

  const wellnessBaselineHistory: Record<string, WellnessDaily[]> = {};
  for (const row of (wellnessBaselineRes.data || []) as WellnessDaily[]) {
    (wellnessBaselineHistory[row.user_id] ??= []).push(row);
  }
  // Sportifs démo (user_id null) : historique synthétique déterministe (coachWellnessScoreFor, même
  // fonction que /coach et /coach/athletes), clé = athlete.id — voir dayWellness()/
  // wellnessBaselineHistory dans CoachPlanningClient.tsx.
  for (const a of athletes) {
    if (a.user_id) continue;
    wellnessBaselineHistory[a.id] = buildSyntheticWellnessHistory(a.wellness_score, a.id, 42, requestedBase);
  }

  return (
    <CoachPlanningClient
      userId={user.id}
      coachName={profile.name}
      athletes={athletes}
      initialSessions={initialSessions}
      initialWellnessMap={wellnessMap}
      subscriptionStatus={profile.subscription_status ?? "free"}
      initialDate={searchParams.date}
      wellnessBaselineHistory={wellnessBaselineHistory}
    />
  );
}
