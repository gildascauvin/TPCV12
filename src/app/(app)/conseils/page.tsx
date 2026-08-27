export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getConseilsData, computeConseilsData } from "@/lib/conseilsData";
import { buildAthleteFixture } from "@/lib/sandboxFixtures";
import { coachIsPaying } from "@/lib/access";
import type { Profile, SubscriptionStatus } from "@/types";
import ConseilsClient from "./ConseilsClient";

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const [realData, { data: profileRow }] = await Promise.all([
    getConseilsData(supabase, user!.id, today),
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
  ]);
  const profile = profileRow as (Profile & { invited_by_coach_id?: string | null }) | null;

  /* Compte frais sans assez d'historique réel (même seuil que l'ACWR, acuteChronicAt() dans
     trainingLoad.ts — 14j + 4 séances, reflété par loadInfo.label déjà calculé) : montre un aperçu
     réaliste (fixture sandbox, buildAthleteFixture()/computeConseilsData(), zéro écriture DB) plutôt
     qu'un graphe vide. Garde le vrai profil (nom/sport/objectif/freq_target) — jamais le profil
     fictif de la fixture, qui afficherait le mauvais sport. Bascule automatiquement vers les vraies
     données dès que ce même seuil est franchi ; jamais liée au statut de paiement (signaux
     découplés — un compte payant sans historique réel doit continuer à voir l'exemple). */
  let data = realData;
  let isDemoData = false;
  if (realData.loadInfo.label === "HISTORIQUE INSUFFISANT") {
    const fixture = buildAthleteFixture();
    data = computeConseilsData(today, profile, fixture.sessions, Object.values(fixture.wellnessByDate));
    isDemoData = true;
  }

  const subscriptionStatus = (profile?.subscription_status ?? "free") as SubscriptionStatus;
  const invitedByCoachId = profile?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(supabase, invitedByCoachId);

  return <ConseilsClient initialData={data} subscriptionStatus={subscriptionStatus} hasActiveCoach={hasActiveCoach} userId={user!.id} isDemoData={isDemoData} />;
}
