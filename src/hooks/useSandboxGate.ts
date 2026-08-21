"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/* Miroir de l'interface retournée par usePaywall.ts (mêmes clés, mêmes types) — pour que
   TodayClient/WeekClient/CoachClient/CoachPlanningClient/AthletesClient/ConseilsClient/
   ProfilClient puissent être réutilisés tels quels en mode sandbox (composant sélectionne l'un ou
   l'autre hook selon `sandboxMode`, jamais un nouveau système de gating).

   2026-08-20 — la destination n'est plus une redirection immédiate vers /register (jugée "trop
   brutale comme transition" par Gildas) : `requireSubscription`/`setPaywallStep("priming")`
   passent `paywallStep` à "priming" comme le hook réel, mais chaque page cliente rend alors
   SandboxGateModal (fond flouté + carte, même langage visuel que le verrou S2+ du program
   builder) au lieu de PrimingJourneyModal — c'est ce composant qui appelle `goToSignup()` au clic
   sur son propre CTA. `goToSignup` est donc exposé ici pour que les pages n'aient pas à
   recalculer `/register?role=...` elles-mêmes. */
export function useSandboxGate(role: "athlete" | "coach") {
  const router = useRouter();
  const [paywallStep, setPaywallStepState] = useState<"idle" | "priming" | "paywall">("idle");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  function goToSignup() {
    router.push(`/register?role=${role}`);
  }

  function setPaywallStep(step: "idle" | "priming" | "paywall") {
    setPaywallStepState(step === "idle" ? "idle" : "priming");
  }

  async function requireSubscription<T>(fn: () => T | Promise<T>): Promise<T | void> {
    setPaywallStepState("priming");
  }

  function handleDismiss() {
    setPaywallStepState("idle");
  }

  return {
    paywallStep,
    setPaywallStep,
    billing,
    setBilling,
    allowDismiss: true,
    requireSubscription,
    handleDismiss,
    isActive: false,
    goToSignup,
  };
}
