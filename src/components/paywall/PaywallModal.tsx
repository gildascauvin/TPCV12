"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import posthog from "posthog-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Billing = "monthly" | "annual";

interface PaywallModalProps {
  mode: "athlete" | "coach";
  allowDismiss?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  initialBilling?: "monthly" | "annual";
}

const PRICING = {
  athlete: { monthly: 9,  annual: 59,  annualMonthly: 4.92 },
  coach:   { monthly: 49, annual: 179, annualMonthly: 14.92 },
};

function CheckoutForm({
  mode, billing, allowDismiss, onClose, onSuccess,
}: {
  mode: "athlete" | "coach";
  billing: Billing;
  allowDismiss?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

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
        setError("Erreur lors de la création de l'abonnement. Réessaie.");
        setLoading(false);
      } else {
        ev.complete("success");
        posthog.capture("trial_started", { plan: mode, billing, method: "wallet" });
        onSuccess();
      }
    });
  }, [stripe]); // eslint-disable-line react-hooks/exhaustive-deps

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);
  const trialEndStr = trialEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const priceStr = billing === "annual" ? `${p.annual}€/an` : `${p.monthly}€/mois`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

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
      setError("Erreur lors de la création de l'abonnement. Réessaie.");
      setLoading(false);
      return;
    }

    posthog.capture("trial_started", { plan: mode, billing });
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
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
      <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />

      {error && (
        <div style={{ color: "#d10000", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(209,0,0,.06)", borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ position: "sticky", bottom: 0, margin: "16px -28px -28px", padding: "14px 28px 20px", background: "linear-gradient(180deg,rgba(255,255,255,0),#fff 38%)" }}>
        <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>
          Essai gratuit jusqu'au {trialEndStr}.<br />Ensuite {priceStr} · Résiliable à tout moment.
        </div>

        <button
          type="submit"
          disabled={!stripe || loading}
          style={{
            width: "100%", height: 50, borderRadius: 14, border: "none",
            background: loading ? "#ccc" : "linear-gradient(180deg,#f04a08,#d44000)",
            color: "#fff", fontSize: 14, fontWeight: 900, cursor: loading ? "default" : "pointer",
            letterSpacing: "-0.01em",
          }}
        >
          {loading ? "Traitement..." : "Commencer gratuitement"}
        </button>

        <div style={{ fontSize: 10, color: "#b0b5ba", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
          Tu ne seras débité qu'après 7 jours. Annule avant sans frais.
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, marginBottom: 4 }}>
          <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
            <rect x="1" y="5" width="10" height="8" rx="2" stroke="#8a8f94" strokeWidth="1.2" />
            <path d="M4 5V3.5a2 2 0 114 0V5" stroke="#8a8f94" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 11, color: "#8a8f94" }}>Paiement sécurisé · Résiliable à tout moment</span>
        </div>
      </div>

    </form>
  );
}

export default function PaywallModal({ mode, allowDismiss = true, onClose, onSuccess, initialBilling }: PaywallModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  const billing: Billing = initialBilling ?? "annual";

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
  const planLabel = mode === "coach" ? "Plan Coach" : "Plan Sportif";

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }} style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>

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

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>
            ThePerfClub — {planLabel}
          </div>
          <div style={{ fontSize: 21, fontWeight: 1000, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.15, marginBottom: 6 }}>
            {billing === "annual"
              ? <>{p.annualMonthly}€<span style={{ fontSize: 14, fontWeight: 700, color: "#62686e" }}>/mois</span> <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>· {p.annual}€ facturé annuellement</span></>
              : <>{p.monthly}€<span style={{ fontSize: 14, fontWeight: 700, color: "#62686e" }}>/mois</span></>
            }
          </div>
          <p style={{ fontSize: 13, color: "#62686e", lineHeight: 1.5, margin: 0 }}>
            <><strong>7 jours gratuits</strong> · Aucun prélèvement avant la fin de l'essai.</>

          </p>
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,.07)", marginBottom: 18 }} />

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
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe", variables: { colorPrimary: "#d44000", borderRadius: "12px" } },
            }}
          >
            <CheckoutForm mode={mode} billing={billing} allowDismiss={allowDismiss} onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
