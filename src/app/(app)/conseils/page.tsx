export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import type { Profile, SubscriptionStatus } from "@/types";
import ConseilsClient from "./ConseilsClient";

/* Cette page ("Performance" dans la bottom nav) ne porte plus que le suivi de tests physiques
   (2026-09-24, "point 1" — Charge/Récupération/Comportements ont déménagé dans les onglets de
   /today, voir TodayClient.tsx) — plus besoin de ConseilsData ici, uniquement le profil pour
   TestsPanel (sport/sexe/poids) et le statut d'abonnement. */
export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
  const profile = profileRow as (Profile & { invited_by_coach_id?: string | null }) | null;

  const subscriptionStatus = (profile?.subscription_status ?? "free") as SubscriptionStatus;
  const invitedByCoachId = profile?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(invitedByCoachId);

  return (
    <ConseilsClient
      subscriptionStatus={subscriptionStatus} hasActiveCoach={hasActiveCoach} userId={user!.id}
      sport={profile?.sport ?? null} sexe={profile?.sexe ?? null} poidsKg={profile?.poids_kg ?? null}
    />
  );
}
