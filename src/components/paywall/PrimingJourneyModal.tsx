"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PricingPrimingContent, PRICING_PRIMING_GUARANTEE_CAPTION } from "./PricingPriming";
import { PAYWALL_CTA_LABEL } from "./PaywallModal";

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

/* Shell modal (dismissible) autour du contenu partagé PricingPrimingContent — voir
   PricingPriming.tsx pour le détail (badge garantie, prix, bullets, frise, témoignage, FAQ).
   Décision explicite de Gildas (2026-08-07) : ce composant et l'étape paywall_priming de
   l'onboarding (OnboardingFlow.tsx) doivent rester "exactement le même composant" — toute
   modification de contenu se fait uniquement dans PricingPriming.tsx. */
export default function PrimingJourneyModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss }: Props) {
  useEffect(() => {
    posthog.capture("paywall_priming_viewed", { plan: mode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const headline = mode === "coach" ? "Améliore ton coaching maintenant." : "Améliore tes performances maintenant.";

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 14, border: "none",
    background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
    fontSize: 14, fontWeight: 900, cursor: "pointer",
    boxShadow: "0 8px 20px rgba(212,64,0,.26)", marginBottom: 10,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: "#f1f0ee", overflowY: "auto" }}>
      {allowDismiss && (
        <button onClick={onDismiss} style={{ position: "fixed", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "1px solid rgba(0,0,0,.08)", cursor: "pointer", fontSize: 20, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,.08)" }}>×</button>
      )}

      <div style={{ minHeight: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 640, padding: "36px 20px 140px" }}>
          <PricingPrimingContent role={mode} billing={billing} setBilling={setBilling} headline={headline} />
        </div>
      </div>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#f1f0ee", padding: "16px 20px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <button onClick={() => { posthog.capture("paywall_priming_value_next", { plan: mode }); onContinue(); }} style={ctaBtn}>
            {PAYWALL_CTA_LABEL[mode]}
          </button>
          <div style={{ textAlign: "center", fontSize: 11.5, color: "#8a8f94", fontWeight: 600 }}>
            {PRICING_PRIMING_GUARANTEE_CAPTION}
          </div>
        </div>
      </div>
    </div>
  );
}
