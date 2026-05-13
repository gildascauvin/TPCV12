import { createClient } from "@/lib/supabase/server";
import TodayClient from "./TodayClient";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profileCheck } = await supabase.from("profiles").select("mode").eq("user_id", user!.id).maybeSingle();
  if (profileCheck?.mode === "coach") redirect("/coach");

  const today = format(new Date(), "yyyy-MM-dd");

  const [{ data: profile }, { data: wellness }, { data: sessions }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).order("date").order("created_at"),
  ]);

  return (
    <TodayClient
      userId={user!.id}
      profile={profile!}
      initialDate={today}
      initialWellness={wellness ?? null}
      initialSessions={sessions ?? []}
    />
  );
}
