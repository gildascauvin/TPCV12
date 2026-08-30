import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import { startOfWeek, endOfWeek, format, subDays } from "date-fns";
import { WELLNESS_BASELINE_WINDOW_DAYS } from "@/lib/wellnessBaseline";
import WeekClient from "./WeekClient";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const base = searchParams.date ? new Date(searchParams.date + "T12:00:00") : new Date();
  const weekStart = startOfWeek(base, { weekStartsOn: 1 });
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(endOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");

  // Fenêtre glissante pour la baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — ANCRÉE
  // SUR LA SEMAINE DEMANDÉE (pas "aujourd'hui") : un lien direct vers une semaine passée (searchParams.date)
  // doit avoir assez de recul pour CETTE semaine dès le premier rendu SSR, même logique que loadWeek()
  // côté client (WeekClient.tsx) qui refetche à chaque navigation.
  const sinceBaseline = format(subDays(weekStart, WELLNESS_BASELINE_WINDOW_DAYS), "yyyy-MM-dd");

  const [{ data: sessions }, { data: wellness }, { data: profile }, { data: wellnessBaselineHistory }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end).order("created_at"),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end),
    supabase.from("profiles").select("subscription_status, invited_by_coach_id, name, free_training_label").eq("user_id", user!.id).single(),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", sinceBaseline).lte("date", end),
  ]);

  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasCoach = !!invitedByCoachId;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  return (
    <WeekClient
      userId={user!.id}
      userName={(profile as { name?: string | null } | null)?.name ?? null}
      initialSessions={sessions ?? []}
      initialWellness={wellness ?? []}
      subscriptionStatus={profile?.subscription_status ?? "free"}
      hasCoach={hasCoach}
      hasActiveCoach={hasActiveCoach}
      initialDate={searchParams.date}
      initialFreeLabels={(profile as { free_training_label?: Record<string, string> | null } | null)?.free_training_label ?? {}}
      wellnessBaselineHistory={wellnessBaselineHistory ?? []}
    />
  );
}
