import { useState } from "react";
import type { SubscriptionStatus } from "@/types";

export function usePaywall(subscriptionStatus: SubscriptionStatus) {
  const [paywallStep, setPaywallStep] = useState<"idle" | "priming" | "paywall">("idle");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  const isActive = subscriptionStatus === "athlete" || subscriptionStatus === "coach";
  const allowDismiss = subscriptionStatus !== "expired";

  function requireSubscription(fn: () => void) {
    if (isActive) fn();
    else setPaywallStep("priming");
  }

  function handleDismiss() {
    setPaywallStep("idle");
  }

  return { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss };
}
