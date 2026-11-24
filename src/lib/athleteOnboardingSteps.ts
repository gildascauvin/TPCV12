import type { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import type { OnboardingStep } from "@/lib/onboardingProgress";

type Server = Awaited<ReturnType<typeof createClient>>;

/* Étapes « Lance ton autorégulation » du sportif (checklist d'onboarding, 2026-10-01), partagées par
   /api/onboarding/progress et /api/streak (24/11 : elles sont aussi les premières récompenses).
   « Depuis l'inscription » = date >= `since` : l'historique synthétique de l'inscription ne coche rien. */
export async function athleteOnboardingSteps(supabase: Server, userId: string, since: string, profile: { subscription_status?: string | null; invited_by_coach_id?: string | null }): Promise<OnboardingStep[]> {
  const invitedBy = profile.invited_by_coach_id ?? null;
  const [wRes, sRes, aRes, doneRes, coachPays] = await Promise.all([
    supabase.from("wellness_daily").select("id").eq("user_id", userId).gte("date", since).not("bedtime", "is", null).limit(1),
    // Une séance créée par le point forme ("Séance du jour …", 2026-10-01) ne compte pas : sinon le
    // point forme cocherait 2 étapes d'un coup et la checklist ne pousserait plus vers les programmes.
    supabase.from("sessions").select("id").eq("user_id", userId).gte("date", since).not("name", "like", "Séance du jour %").limit(1),
    supabase.from("program_assignments").select("id").eq("user_id", userId).eq("status", "active").limit(1),
    supabase.from("sessions").select("id").eq("user_id", userId).gte("date", since).eq("done", true).limit(1),
    coachIsPaying(invitedBy),
  ]);
  const paid = profile.subscription_status === "athlete" || profile.subscription_status === "coach";
  return [
    { key: "form", label: "Renseigne ta forme", done: (wRes.data?.length ?? 0) > 0 },
    { key: "build", label: "Construis ton entraînement", done: !!invitedBy || (sRes.data?.length ?? 0) > 0 || (aRes.data?.length ?? 0) > 0 },
    { key: "adjust", label: "Ajuste et fais ta séance", done: (doneRes.data?.length ?? 0) > 0 },
    ...(coachPays ? [] : [{ key: "unlock" as const, label: "Débloque tes performances", done: paid }]),
  ];
}
