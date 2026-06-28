import { createClient } from "@/lib/supabase/server";
import { startOfWeek, endOfWeek, format } from "date-fns";
import WeekClient from "./WeekClient";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: { date?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const base = searchParams.date ? new Date(searchParams.date + "T12:00:00") : new Date();
  const start = format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const end = format(endOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [{ data: sessions }, { data: wellness }, { data: profile }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end).order("created_at"),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end),
    supabase.from("profiles").select("subscription_status").eq("user_id", user!.id).single(),
  ]);

  return (
    <WeekClient
      userId={user!.id}
      initialSessions={sessions ?? []}
      initialWellness={wellness ?? []}
      subscriptionStatus={profile?.subscription_status ?? "free"}
      initialDate={searchParams.date}
    />
  );
}
