import { useState } from "react";
import type { SubscriptionStatus } from "@/types";

export function usePaywall(subscriptionStatus: SubscriptionStatus, hasCoach = false) {
  const [paywallStep, setPaywallStep] = useState<"idle" | "priming" | "paywall">("idle");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  const isActive = subscriptionStatus === "athlete" || subscriptionStatus === "coach" || (subscriptionStatus === "free" && hasCoach);
  const allowDismiss = hasCoach;

  function requireSubscription(fn: () => void) {
    if (isActive) fn();
    else setPaywallStep("priming");
  }

  function handleDismiss() {
    setPaywallStep("idle");
  }

  return { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss };
}
