import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import { startOfWeek, endOfWeek, format, subDays } from "date-fns";
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
  // côté client (WeekClient.tsx) qui refetche à chaque navigation. 42j (pas 21) : la carte décision
  // (decisionCard.ts, 2026-09) a besoin de 14j de tendance, chacun avec jusqu'à 21j d'historique perso
  // derrière lui (wellnessZByDate) — même convention que /today/coach.
  const sinceBaseline = format(subDays(weekStart, 42), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");
  // Historique de séances (≥14j avant AUJOURD'HUI, pas la semaine affichée) pour la tendance/monotonie
  // de la carte "Aujourd'hui" (decisionCard.ts) — indépendant de la navigation semaine/mois, jamais
  // besoin d'être refetché (la carte "Aujourd'hui" n'apparaît que dans la semaine calendaire réelle).
  const sinceSessionsHistory = format(subDays(new Date(), 42), "yyyy-MM-dd");

  const [{ data: sessions }, { data: wellness }, { data: profile }, { data: wellnessBaselineHistory }, { data: sessionsHistory }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end).order("created_at"),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end),
    supabase.from("profiles").select("subscription_status, invited_by_coach_id, name, free_training_label").eq("user_id", user!.id).single(),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", sinceBaseline).lte("date", end),
    supabase.from("sessions").select("*").eq("user_id", user!.id)
      .gte("date", sinceSessionsHistory).lte("date", today),
  ]);

  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasCoach = !!invitedByCoachId;
  const hasActiveCoach = await coachIsPaying(invitedByCoachId);

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
      sessionsHistory={sessionsHistory ?? []}
    />
  );
}
