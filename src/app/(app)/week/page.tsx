import { createClient } from "@/lib/supabase/server";
import { startOfWeek, endOfWeek, format } from "date-fns";
import WeekClient from "./WeekClient";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();
  const start = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const end = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [{ data: sessions }, { data: wellness }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end).order("created_at"),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id)
      .gte("date", start).lte("date", end),
  ]);

  return (
    <WeekClient
      userId={user!.id}
      initialSessions={sessions ?? []}
      initialWellness={wellness ?? []}
    />
  );
}
