"use client";

import { useRouter } from "next/navigation";
import ProgramLibraryPage from "./ProgramLibraryPage";
import PaywallModal from "@/components/paywall/PaywallModal";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import SandboxGateModal from "@/components/paywall/SandboxGateModal";
import { usePaywall } from "@/hooks/usePaywall";
import { useSandboxGate } from "@/hooks/useSandboxGate";
import type { CoachAthlete, SubscriptionStatus } from "@/types";

interface Props {
  mode: "athlete" | "coach";
  userId: string;
  subscriptionStatus: SubscriptionStatus;
  hasActiveCoach?: boolean;
  athletes?: CoachAthlete[];
  backHref: string;
  sandboxMode?: boolean;
}

/* Onglet "Programmes" de la bottom nav (2026-08-31) — ProgramLibraryPage.tsx est déjà un
   overlay plein écran auto-suffisant (fetch ses propres données, son propre header/back button)
   utilisé jusqu'ici comme modale depuis WeekClient.tsx/CoachPlanningClient.tsx. Ce wrapper le
   rend accessible comme vraie page (/programmes, /coach/programmes), avec le même câblage
   paywall (usePaywall/useSandboxGate → PrimingJourneyModal/PaywallModal/SandboxGateModal) que
   ces deux fichiers, pour ne jamais bypasser le gating "Enregistrer en librairie"/"Assigner". */
export default function ProgramLibraryStandalone({ mode, userId, subscriptionStatus, hasActiveCoach = false, athletes = [], backHref, sandboxMode = false }: Props) {
  const router = useRouter();
  const realPaywall = usePaywall(subscriptionStatus, hasActiveCoach);
  const sandboxPaywall = useSandboxGate(mode);
  const { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive } = sandboxMode ? sandboxPaywall : realPaywall;

  return (
    <>
      <ProgramLibraryPage
        athletes={mode === "coach" ? athletes : []}
        selfUserId={mode === "athlete" ? userId : undefined}
        requireSubscription={requireSubscription}
        isActive={isActive}
        sandboxMode={sandboxMode}
        onClose={() => router.push(backHref)}
      />
      {paywallStep === "priming" && (
        sandboxMode ? (
          <SandboxGateModal role={mode} page="programmes" onClose={handleDismiss} onSignup={sandboxPaywall.goToSignup} />
        ) : (
          <PrimingJourneyModal mode={mode} billing={billing} setBilling={setBilling} allowDismiss={allowDismiss}
            onContinue={() => setPaywallStep("paywall")} onDismiss={handleDismiss} />
        )
      )}
      {!sandboxMode && paywallStep === "paywall" && (
        <PaywallModal mode={mode} allowDismiss={allowDismiss} initialBilling={billing}
          onClose={() => setPaywallStep("priming")}
          onSuccess={() => { setPaywallStep("idle"); router.refresh(); }} />
      )}
    </>
  );
}
