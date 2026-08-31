export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import ProgramLibraryStandalone from "@/components/programs/ProgramLibraryStandalone";

export default async function ProgrammesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, invited_by_coach_id")
    .eq("user_id", user!.id)
    .single();

  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  return (
    <ProgramLibraryStandalone
      mode="athlete"
      userId={user!.id}
      subscriptionStatus={profile?.subscription_status ?? "free"}
      hasActiveCoach={hasActiveCoach}
      backHref="/week"
    />
  );
}
