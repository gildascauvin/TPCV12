import { useState } from "react";
import type { SubscriptionStatus } from "@/types";

export function usePaywall(subscriptionStatus: SubscriptionStatus) {
  const [showPaywall, setShowPaywall] = useState(false);

  const isActive = subscriptionStatus === "athlete" || subscriptionStatus === "coach";
  const allowDismiss = subscriptionStatus !== "expired";

  function requireSubscription(fn: () => void) {
    if (isActive) {
      fn();
    } else {
      setShowPaywall(true);
    }
  }

  return { showPaywall, setShowPaywall, allowDismiss, requireSubscription };
}
