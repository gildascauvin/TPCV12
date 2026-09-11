export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AthletesClient from "./AthletesClient";
import type { CoachAthlete } from "@/types";
import { getAthletesSignatures } from "@/lib/athletesData";
import { getAthletesLastTests } from "@/lib/testSummary";

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

  // Sexe/poids d'un vrai sportif lié viennent de SON profil (jamais coach_athletes.sexe/poids_kg,
  // qui ne sert que pour les démo) — même pattern déjà en place pour free_training_label, voir
  // coach/planning/page.tsx. Uniquement pour l'insight "vs littérature" de TestsPanel ; aucun autre
  // champ de coach_athletes n'est concerné.
  const realUserIds = athletes.map(a => a.user_id).filter((id): id is string => !!id);
  if (realUserIds.length > 0) {
    const { data: profileRows } = await admin.from("profiles").select("user_id, sexe, poids_kg").in("user_id", realUserIds);
    const byUserId = new Map((profileRows || []).map(r => [r.user_id, r]));
    for (const a of athletes) {
      const p = a.user_id ? byUserId.get(a.user_id) : null;
      if (p) { a.sexe = p.sexe; a.poids_kg = p.poids_kg; }
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const [{ signatures, trends, trendInsights, baselines, baselineSeries }, lastTests] = await Promise.all([
    getAthletesSignatures(admin, athletes, today),
    getAthletesLastTests(admin, user.id, athletes),
  ]);

  return (
    <AthletesClient
      userId={user.id}
      initialAthletes={athletes}
      initialDate={today}
      initialSignatures={signatures}
      initialTrends={trends}
      initialTrendInsights={trendInsights}
      initialBaselines={baselines}
      initialBaselineSeries={baselineSeries}
      initialLastTests={lastTests}
      subscriptionStatus={profile.subscription_status ?? "free"}
      inviteCode={profile.invite_code as string | null ?? null}
    />
  );
}
