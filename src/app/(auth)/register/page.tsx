import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ d?: string; role?: string }> }) {
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

  if (user) {
    /* User connecté + pendingData → complétion onboarding Google */
    if (pendingData) {
      return <OnboardingFlow userId={user.id} pendingData={pendingData} />;
    }
    /* User connecté sans pendingData : si l'onboarding n'est pas vraiment fini
       (paywall jamais atteint), on le fait rentrer à nouveau dans le flow plutôt que
       de forcer onboarding_done=true — sinon un compte créé mais jamais payé bascule
       en accès gratuit permanent sans jamais voir le paywall obligatoire.
       Bug réel corrigé (2026-09-03) : ce cas couvre aussi bien un email de confirmation
       (session pas immédiate à l'inscription) qu'un clic tardif sur le lien "crée ton mot
       de passe" (resetPasswordForEmail → /reset-password → /today) — le middleware
       (src/lib/supabase/middleware.ts) renvoie alors ce user vers /register nu dès que
       onboarding_done est encore false. Sans resumeRole, OnboardingFlow repartait de zéro
       (value_intro/sport_2a/role/decision rejoués en entier) — resumeRole (déjà connu via
       profiles.mode, écrit par createAccount() lors du vrai signup) saute directement
       dans le wizard, où l'utilisateur était réellement resté. */
    const { data: profile } = await supabase
      .from("profiles")
      .select("mode, onboarding_done")
      .eq("user_id", user.id)
      .single();
    if (!profile?.onboarding_done) {
      return <OnboardingFlow userId={user.id} resumeRole={profile?.mode === "coach" ? "coach" : "athlete"} />;
    }
    redirect(profile?.mode === "coach" ? "/coach" : "/today");
  }

  /* User non connecté → flow d'inscription complet */
  const initialRole = params?.role === "coach" ? "coach" : params?.role === "athlete" ? "athlete" : undefined;
  return (
    <>
      {!initialRole && (
        <link
          rel="preload"
          as="image"
          href="https://www.theperfclub.com/wp-content/uploads/2022/06/lathle%CC%80te-scaled.jpg"
          {...{ fetchpriority: "high" }}
        />
      )}
      <OnboardingFlow initialRole={initialRole} />
    </>
  );
}
