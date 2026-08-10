export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AthletesClient from "./AthletesClient";
import type { CoachAthlete } from "@/types";
import { getAthletesSignatures } from "@/lib/athletesData";

export default async function CoachAthletesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("mode, subscription_status, invite_code").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.mode !== "coach") redirect("/today");

  const admin = createAdminClient();

  let { data: rawAthletes } = await supabase
    .from("coach_athletes")
    .select("*")
    .eq("coach_id", user.id)
    .order("created_at");

  // Créer les placeholders pour les invitations pending sans placeholder existant
  const { data: pendingInvites } = await admin
    .from("coach_invites")
    .select("email")
    .eq("coach_id", user.id)
    .eq("status", "pending");

  const existingEmails = new Set((rawAthletes || []).map((a: CoachAthlete) => a.invite_email).filter(Boolean));
  const missing = (pendingInvites || []).filter(i => !existingEmails.has(i.email));

  if (missing.length > 0) {
    await admin.from("coach_athletes").insert(
      missing.map(i => ({
        coach_id: user.id,
        user_id: null,
        name: i.email.split("@")[0],
        sport: "",
        wellness_score: 0,
        invite_email: i.email,
      }))
    );
    const { data: refreshed } = await admin
      .from("coach_athletes")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at");
    rawAthletes = refreshed;
  }

  const athletes = (rawAthletes || []) as CoachAthlete[];

  const today = new Date().toISOString().split("T")[0];
  const { signatures, trends, trendInsights } = await getAthletesSignatures(admin, athletes, today);

  return (
    <AthletesClient
      userId={user.id}
      initialAthletes={athletes}
      initialDate={today}
      initialSignatures={signatures}
      initialTrends={trends}
      initialTrendInsights={trendInsights}
      subscriptionStatus={profile.subscription_status ?? "free"}
      inviteCode={profile.invite_code as string | null ?? null}
    />
  );
}
