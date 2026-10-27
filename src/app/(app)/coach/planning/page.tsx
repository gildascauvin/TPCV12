export const dynamic = "force-dynamic";

import { watchEstimatedSessions, type EstimatedSession } from "@/lib/watchEstimates";
import { dedupeWorkouts } from "@/lib/conseilsData";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachPlanningClient from "./CoachPlanningClient";
import { realToView, demoToView, buildWellnessMap } from "@/lib/coachSessions";
import { buildSyntheticWellnessHistory } from "@/lib/sandboxFixtures";
import { startOfWeek, addDays, subDays, format } from "date-fns";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, WellnessDaily } from "@/types";

export default async function CoachPlanningPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  /* profil + liste des sportifs en parallèle (2026-09-18) — même principe que /coach/page.tsx,
     aucune dépendance entre les deux, toutes deux ne dépendent que de user.id déjà connu. */
  const [{ data: profile }, { data: rawAthletes }] = await Promise.all([
    supabase.from("profiles").select("mode, name, subscription_status, first_decision_on").eq("user_id", user.id).maybeSingle(),
    supabase.from("coach_athletes").select("*").eq("coach_id", user.id).order("created_at"),
  ]);
  if (!profile || profile.mode !== "coach") redirect("/today");

  // 42j de recul (pas 7) — la carte décision unifiée (decisionCard.ts, 2026-09) a besoin de 14j de
  // tendance, chacun avec jusqu'à 21j d'historique perso derrière lui (wellnessZByDate), soit ~35j au
  // maximum ; 42j aligne sur /coach et /coach/athletes plutôt qu'un nouveau chiffre.
  const since = new Date();
  since.setDate(since.getDate() - 42);
  const until = new Date();
  until.setDate(until.getDate() + 21);
  const sinceStr = since.toISOString().split("T")[0];
  const untilStr = until.toISOString().split("T")[0];

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
  const sinceBaseline = format(subDays(requestedWeekStart, 42), "yyyy-MM-dd");

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const [realSessionsRes, coachSessionsRes, wellnessRes, wellnessBaselineRes, workoutsRes] = await Promise.all([
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
    // Entraînements montre : charge estimée, la même que le sportif et Coach Control (2026-10-23).
    realUserIds.length
      ? admin.from("health_workouts").select("user_id, platform_id, date, start_at, duration_min, workout_type, trimp").in("user_id", realUserIds).gte("date", sinceStr).lte("date", todayIso)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const watchEstimates: Record<string, EstimatedSession[]> = {};
  for (const a of athletes) {
    if (!a.user_id) continue;
    const est = watchEstimatedSessions(
      ((realSessionsRes.data || []) as Session[]).filter(s => s.user_id === a.user_id),
      dedupeWorkouts(((workoutsRes.data ?? []) as { user_id: string }[]).filter(w => w.user_id === a.user_id)),
      todayIso,
    );
    if (est.length) watchEstimates[a.id] = est;
  }

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
      watchEstimates={watchEstimates}
      firstDecisionOn={(profile as { first_decision_on?: string | null }).first_decision_on ?? null}
    />
  );
}
