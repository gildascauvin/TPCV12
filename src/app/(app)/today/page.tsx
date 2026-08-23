import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import { pickRelevantAssignment } from "@/lib/programAssignment";
import TodayClient from "./TodayClient";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profileCheck } = await supabase.from("profiles").select("mode, subscription_status").eq("user_id", user!.id).maybeSingle();
  if (profileCheck?.mode === "coach") redirect("/coach");

  const today = format(new Date(), "yyyy-MM-dd");

  const [{ data: profile }, { data: wellness }, { data: sessions }, { data: activeAssignments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).order("date").order("created_at"),
    supabase.from("program_assignments").select("start_date, programs(name, weeks_count)").eq("user_id", user!.id).eq("status", "active"),
  ]);

  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasCoach = !!invitedByCoachId;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  type ActiveProgram = { start_date: string; name: string } | null;
  // Un sportif peut avoir plusieurs programmes actifs enchaînés (futurs) — on prend
  // celui pertinent pour aujourd'hui, pas juste le premier trouvé.
  const pickedAssignment = pickRelevantAssignment(activeAssignments ?? []);
  const programsData = pickedAssignment?.programs;
  const programName = Array.isArray(programsData)
    ? (programsData[0]?.name ?? "")
    : ((programsData as unknown as { name: string } | null)?.name ?? "");
  const activeProgram: ActiveProgram = pickedAssignment
    ? { start_date: pickedAssignment.start_date, name: programName }
    : null;

  return (
    <TodayClient
      userId={user!.id}
      profile={profile!}
      initialDate={today}
      initialWellness={wellness ?? null}
      initialSessions={sessions ?? []}
      subscriptionStatus={profileCheck?.subscription_status ?? "free"}
      hasCoach={hasCoach}
      hasActiveCoach={hasActiveCoach}
      activeProgram={activeProgram}
    />
  );
}
