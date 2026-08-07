"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import posthog from "posthog-js";

let _stripePromise: ReturnType<typeof loadStripe> | null = null;
export function getStripePromise() {
  if (!_stripePromise) _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  return _stripePromise;
}

export type Billing = "monthly" | "annual";

interface PaywallModalProps {
  mode: "athlete" | "coach";
  allowDismiss?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  initialBilling?: "monthly" | "annual";
  /** Titre affiché sous l'eyebrow, au-dessus des cartes de prix. Défaut générique si absent. */
  headline?: string;
  /** Tag l'event trial_started pour l'A/B test onboarding court — absent hors onboarding (gating in-app). */
  abVariant?: string;
}

export const PRICING = {
  athlete: { monthly: 9,  annual: 78,  annualMonthly: 6.50 },
  coach:   { monthly: 39, annual: 348, annualMonthly: 29.00 },
};

/* CTA final (soumission Stripe) — plus d'essai gratuit (retiré 2026-08-07), garantie remboursé
   14 jours à la place. Reste le seul écran qui déclenche un vrai paiement, contrairement à l'écran
   priming qui ne fait qu'avancer vers celui-ci (voir PricingPriming.tsx / Actions "Continuer →"). */
export const PAYWALL_CTA_LABEL: Record<"athlete" | "coach", string> = {
  athlete: "Débloquer mon programme",
  coach: "Débloquer mon espace coach",
};

/* Preuve sociale — partagée entre l'onboarding (paywall_form) et le paywall in-app
   (usePaywall/PrimingJourneyModal), pour rester "exactement les mêmes écrans". */
export const PAYWALL_AVATARS = [
  "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
  "https://www.theperfclub.com/wp-content/uploads/2022/02/Rond_SC.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/07/rugby-club-tarbes-768x768.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/05/2toiles-92-natation.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2021/03/halte%CC%81rophilie-Thibault-cortes.png",
];

export const PAYWALL_TESTIMONIALS = {
  athlete: {
    quote: "ThePerfClub a totalement changé la façon dont je structure mes entraînements. Je suis passé de « plus c'est mieux » à une vraie autorégulation. Mes résultats ont suivi.",
    name: "Franck G.",
    role: "Sportif · Membre ThePerfClub",
    photo: "https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png",
  },
  coach: {
    quote: "Je pensais que ThePerfClub était encore un outil pour créer des séances. Cela va bien plus loin : gestion du volume, de la fatigue, autorégulation. Un véritable tableau de bord.",
    name: "Killian Anno",
    role: "Préparateur physique · Rugby Club d'Arcachon",
    photo: "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
  },
};

/* Exporté pour réutilisation par les 2 écrans plein-page de l'onboarding (paywall_priming/
   paywall_form dans OnboardingFlow.tsx) — même logique Stripe, pas de duplication. */
export function CheckoutForm({
  mode, billing, footerPortalNode, onSuccess, abVariant, ctaLabel, showBillingLegal = true,
}: {
  mode: "athlete" | "coach";
  billing: Billing;
  footerPortalNode: HTMLDivElement | null;
  onSuccess: () => void;
  abVariant?: string;
  /** Libellé du CTA — défaut role-aware ("Débloquer mon programme"/"Débloquer mon espace coach") si absent. */
  ctaLabel?: string;
  /** Désactivé sur l'onboarding (2026-07-30) : le reçu "Dû aujourd'hui / Renouvellement..." rendu juste au-dessus
      (OnboardingFlow.tsx) dit déjà tout ça, plus précisément — répéter la phrase ici ferait doublon. */
  showBillingLegal?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [elementReady, setElementReady] = useState(false);

  const p = PRICING[mode];

  useEffect(() => {
    if (!stripe) return;
    const amount = billing === "annual" ? p.annual * 100 : p.monthly * 100;
    const pr = stripe.paymentRequest({
      country: "FR",
      currency: "eur",
      total: { label: `ThePerfClub — ${billing === "annual" ? "Annuel" : "Mensuel"}`, amount },
      requestPayerName: false,
      requestPayerEmail: false,
    });
    pr.canMakePayment().then(result => { if (result) setPaymentRequest(pr); });
    pr.on("paymentmethod", async (ev) => {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: ev.paymentMethod.id, plan: mode, billing }),
      });
      if (!res.ok) {
        ev.complete("fail");
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Erreur lors de la création de l'abonnement. Réessaie.");
        setLoading(false);
      } else {
        ev.complete("success");
        posthog.capture("trial_started", { plan: mode, billing, method: "wallet", ...(abVariant ? { ab_variant: abVariant } : {}) });
        onSuccess();
      }
    });
  }, [stripe, billing]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceStr = billing === "annual" ? `${p.annual}€/an` : `${p.monthly}€/mois`;
  const effectiveCtaLabel = ctaLabel ?? PAYWALL_CTA_LABEL[mode];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !elementReady) return;
    setLoading(true);
    setError(null);

    try {
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (confirmError) {
        setError(confirmError.message ?? "Erreur de paiement");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/stripe/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: setupIntent?.id, plan: mode, billing }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Erreur lors de la création de l'abonnement. Réessaie.");
        setLoading(false);
        return;
      }

      posthog.capture("trial_started", { plan: mode, billing, ...(abVariant ? { ab_variant: abVariant } : {}) });
      onSuccess();
    } catch {
      setError("Le formulaire de paiement n'est pas encore prêt. Réessaie dans un instant.");
      setLoading(false);
    }
  }

  return (
    <>
      <form id="checkout-form" onSubmit={handleSubmit}>
        {paymentRequest && (
          <>
            <PaymentRequestButtonElement
              options={{
                paymentRequest,
                style: { paymentRequestButton: { type: "default", theme: "dark", height: "48px" } },
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.1)" }} />
              <span style={{ fontSize: 11, color: "#8a8f94", fontWeight: 600 }}>ou payer par carte</span>
              <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,.1)" }} />
            </div>
          </>
        )}
        <PaymentElement
          options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }}
          onReady={() => setElementReady(true)}
        />

        {error && (
          <div style={{ color: "#d10000", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(209,0,0,.06)", borderRadius: 10 }}>
            {error}
          </div>
        )}
      </form>

      {footerPortalNode && createPortal(
        <div style={{ padding: "20px 28px 20px", background: "#fff" }}>
          {showBillingLegal && (
            <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>
              Facturé aujourd&apos;hui : {priceStr}.<br />Remboursable sous 14 jours si besoin, sans justification.
            </div>
          )}

          <button
            type="submit"
            form="checkout-form"
            disabled={!stripe || !elementReady || loading}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none",
              background: loading ? "#ccc" : "linear-gradient(180deg,#f04a08,#d44000)",
              color: "#fff", fontSize: 14, fontWeight: 900, cursor: loading ? "default" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? "Traitement..." : effectiveCtaLabel}
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, marginBottom: showBillingLegal ? 4 : 0 }}>
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
              <rect x="1" y="5" width="10" height="8" rx="2" stroke="#8a8f94" strokeWidth="1.2" />
              <path d="M4 5V3.5a2 2 0 114 0V5" stroke="#8a8f94" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 11, color: "#8a8f94" }}>Paiement sécurisé{!showBillingLegal && " · Résiliable à tout moment"}</span>
          </div>
        </div>,
        footerPortalNode
      )}
    </>
  );
}

export default function PaywallModal({ mode, allowDismiss = true, onClose, onSuccess, initialBilling, headline, abVariant }: PaywallModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [footerPortalNode, setFooterPortalNode] = useState<HTMLDivElement | null>(null);

  const [billing, setBilling] = useState<Billing>(initialBilling ?? "annual");

  useEffect(() => {
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(r => r.json())
      .then((json) => {
        if (json.error) { setSetupError(`Erreur: ${json.error}`); setLoadingIntent(false); return; }
        setClientSecret(json.clientSecret);
        setLoadingIntent(false);
      })
      .catch(() => { setSetupError("Impossible de charger le formulaire."); setLoadingIntent(false); });
  }, []);

  const p = PRICING[mode];

  return (
    <div onClick={(e) => { if (allowDismiss && e.target === e.currentTarget) onClose?.(); }} style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 30, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
      <div style={{ overflowY: "auto", padding: 28 }}>

        {allowDismiss && onClose && (
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,.06)", border: "none", cursor: "pointer", fontSize: 20, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        )}

        {/* Back button */}
        {allowDismiss && onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 0 16px 0", display: "block" }}>
            ← Retour
          </button>
        )}

        {/* Contenu identique à l'étape paywall_form de l'onboarding (OnboardingFlow.tsx) —
            badge + titre + rappel prix compact + preuve sociale, avant le formulaire Stripe. */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#2f9e44", background: "rgba(47,158,68,.10)", display: "inline-block", padding: "5px 12px", borderRadius: 999, marginBottom: 16 }}>
          🔒 Garanti 14j
        </div>
        <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 20 }}>{headline || "Passe au niveau supérieur."}</div>
        <div
          onClick={() => setBilling(b => b === "monthly" ? "annual" : "monthly")}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid rgba(0,0,0,.10)", borderRadius: 14, padding: "14px 16px", marginBottom: 20, cursor: "pointer" }}>
          <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 700 }}>{billing === "monthly" ? "Facturé mensuellement" : "Facturé annuellement"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: "#171b1f" }}>{billing === "monthly" ? `${p.monthly}€/mois` : `${p.annualMonthly}€/mois · ${p.annual}€/an`}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#d44000", textDecoration: "underline" }}>Modifier</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 14px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
          <div style={{ display: "flex" }}>
            {PAYWALL_AVATARS.map((src, i) => (
              <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #f1f0ee", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
                <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1f2428", lineHeight: 1.2 }}>+600 sportifs, coachs et clubs</div>
            <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>font confiance à ThePerfClub</div>
          </div>
        </div>

        {loadingIntent && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#8a8f94", fontSize: 13 }}>
            Chargement du formulaire...
          </div>
        )}

        {setupError && (
          <div style={{ color: "#d10000", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
            {setupError}
          </div>
        )}

        {clientSecret && (
          <Elements
            stripe={getStripePromise()}
            options={{
              clientSecret,
              appearance: { theme: "stripe", variables: { colorPrimary: "#d44000", borderRadius: "12px" } },
            }}
          >
            <CheckoutForm mode={mode} billing={billing} footerPortalNode={footerPortalNode} onSuccess={onSuccess} abVariant={abVariant} />
          </Elements>
        )}
      </div>

      <div ref={setFooterPortalNode} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}
