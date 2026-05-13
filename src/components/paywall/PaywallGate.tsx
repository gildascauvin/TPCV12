"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PaywallModal from "./PaywallModal";
import type { SubscriptionStatus } from "@/types";

interface Props {
  subscriptionStatus: SubscriptionStatus;
  mode: "athlete" | "coach";
}

export default function PaywallGate({ subscriptionStatus, mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get("upgrade") === "success") {
      setShowSuccess(true);
      router.replace(window.location.pathname);
      const t = setTimeout(() => setShowSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (subscriptionStatus === "athlete" || subscriptionStatus === "coach") return;
    if (subscriptionStatus === "expired") {
      setShowPaywall(true);
      return;
    }
    // free: check localStorage dismiss
    const dismissed = localStorage.getItem("paywall_dismissed");
    if (!dismissed || Date.now() > parseInt(dismissed)) {
      setShowPaywall(true);
    }
  }, [subscriptionStatus]);

  if (showSuccess) {
    return (
      <div style={{
        position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 2147483200, background: "#2f9e44", color: "#fff",
        padding: "13px 22px", borderRadius: 16, fontSize: 14, fontWeight: 800,
        boxShadow: "0 8px 28px rgba(0,0,0,.22)", whiteSpace: "nowrap",
      }}>
        Bienvenue ! Ton abonnement est actif.
      </div>
    );
  }

  if (!showPaywall) return null;

  const allowDismiss = subscriptionStatus !== "expired";

  return (
    <PaywallModal
      mode={mode}
      allowDismiss={allowDismiss}
      onClose={() => {
        localStorage.setItem("paywall_dismissed", String(Date.now() + 24 * 60 * 60 * 1000));
        setShowPaywall(false);
      }}
      onSuccess={() => setShowPaywall(false)}
    />
  );
}
