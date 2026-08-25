export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getConseilsData } from "@/lib/conseilsData";
import { coachIsPaying } from "@/lib/access";
import type { SubscriptionStatus } from "@/types";
import ConseilsClient from "./ConseilsClient";

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const [data, { data: profile }] = await Promise.all([
    getConseilsData(supabase, user!.id, today),
    supabase.from("profiles").select("subscription_status, invited_by_coach_id").eq("user_id", user!.id).single(),
  ]);

  const subscriptionStatus = ((profile as { subscription_status?: SubscriptionStatus } | null)?.subscription_status ?? "free") as SubscriptionStatus;
  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  return <ConseilsClient initialData={data} subscriptionStatus={subscriptionStatus} hasActiveCoach={hasActiveCoach} userId={user!.id} />;
}
