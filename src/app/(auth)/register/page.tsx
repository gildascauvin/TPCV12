import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export const dynamic = "force-dynamic";

type SearchParams = { d?: string; utm_campaign?: string };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let pendingData = null;
  if (params?.d) {
    try {
      pendingData = JSON.parse(Buffer.from(decodeURIComponent(params.d), "base64").toString("utf-8"));
    } catch {
      /* param invalide — on ignore */
    }
  }

  /* UTM campaign → bypass role step et aller direct aux value slides */
  const utm = params?.utm_campaign?.toLowerCase();
  const initialRole = utm === "coach" ? "coach" : utm === "sportif" ? "athlete" : undefined;
  const initialStepIdx = initialRole ? 1 : undefined;

  if (user) {
    /* User connecté + pendingData → complétion onboarding Google */
    if (pendingData) {
      return <OnboardingFlow userId={user.id} pendingData={pendingData} />;
    }
    /* User connecté sans pendingData → rediriger vers son espace.
       Force onboarding_done=true pour éviter une boucle middleware si nécessaire. */
    const { data: profile } = await supabase
      .from("profiles")
      .select("mode, onboarding_done")
      .eq("user_id", user.id)
      .single();
    if (!profile?.onboarding_done) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", user.id);
    }
    redirect(profile?.mode === "coach" ? "/coach" : "/today");
  }

  /* User non connecté → flow d'inscription complet */
  return <OnboardingFlow initialRole={initialRole} initialStepIdx={initialStepIdx} />;
}
