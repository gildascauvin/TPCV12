"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PricingPrimingContent } from "./PricingPriming";

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
  const skipBtn: React.CSSProperties = {
    width: "100%", background: "none", border: "none",
    fontSize: 12, color: "#8a8f94", cursor: "pointer", padding: "4px 0",
  };

  return (
    <div onClick={(e) => { if (allowDismiss && e.target === e.currentTarget) onDismiss(); }} style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 30, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
        {allowDismiss && (
          <button onClick={onDismiss} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,.06)", border: "none", cursor: "pointer", fontSize: 20, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>×</button>
        )}

        <div style={{ overflowY: "auto", padding: 28 }}>
          <PricingPrimingContent role={mode} billing={billing} setBilling={setBilling} headline={headline} />
        </div>

        <div style={{ padding: "20px 28px 20px", background: "#fff", flexShrink: 0 }}>
          <button onClick={() => { posthog.capture("paywall_priming_value_next", { plan: mode }); onContinue(); }} style={ctaBtn}>
            Continuer →
          </button>
          {allowDismiss && (
            <button onClick={() => { posthog.capture("paywall_skipped", { plan: mode, billing }); onDismiss(); }} style={skipBtn}>
              Accéder sans abonnement →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
