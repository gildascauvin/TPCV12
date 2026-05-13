"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

type Billing = "monthly" | "annual";

interface PaywallModalProps {
  mode: "athlete" | "coach";
  allowDismiss?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

const BENEFITS: Record<"athlete" | "coach", string[]> = {
  athlete: [
    "Score wellness quotidien & conseils personnalisés",
    "Planification et suivi de toutes tes séances",
    "Analyse de fatigue sur 28 jours",
  ],
  coach: [
    "Tableau de bord wellness de tous tes athlètes en temps réel",
    "Planification et partage de séances multi-athlètes",
    "Alertes intelligentes : wellness bas + charge d'entraînement",
  ],
};

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

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);
  const trialEndStr = trialEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const p = PRICING[mode];
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

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />

      {error && (
        <div style={{ color: "#d10000", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(209,0,0,.06)", borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", margin: "14px 0 10px", lineHeight: 1.5 }}>
        Essai gratuit jusqu'au {trialEndStr}.<br />
        Ensuite {priceStr} · Résiliable à tout moment.
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
        {loading ? "Traitement..." : "Commencer l'essai gratuit — 7 jours"}
      </button>

      {allowDismiss && onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ width: "100%", background: "none", border: "none", fontSize: 12, color: "#8a8f94", cursor: "pointer", marginTop: 12, padding: 0 }}
        >
          Plus tard
        </button>
      )}
    </form>
  );
}

export default function PaywallModal({ mode, allowDismiss = true, onClose, onSuccess }: PaywallModalProps) {
  const [billing, setBilling] = useState<Billing>("annual");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

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
  const planLabel = mode === "coach" ? "Plan Coach" : "Plan Athlète";
  const savings = p.monthly * 12 - p.annual;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
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
            <strong>7 jours gratuits</strong> · Aucun prélèvement avant la fin de l'essai.
          </p>
        </div>

        {/* Billing toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "#f1f0ee", borderRadius: 14, padding: 4 }}>
          {(["monthly", "annual"] as Billing[]).map(b => (
            <button
              key={b}
              type="button"
              onClick={() => setBilling(b)}
              style={{
                flex: 1, height: 36, borderRadius: 11, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 800,
                background: billing === b ? "#fff" : "transparent",
                color: billing === b ? "#171b1f" : "#8a8f94",
                boxShadow: billing === b ? "0 2px 8px rgba(0,0,0,.10)" : "none",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}
            >
              {b === "monthly" ? "Mensuel" : "Annuel"}
              {b === "annual" && (
                <span style={{ background: "#d44000", color: "#fff", fontSize: 9, fontWeight: 900, padding: "2px 6px", borderRadius: 999, letterSpacing: "0.05em" }}>
                  -{savings}€
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Benefits */}
        <div style={{ marginBottom: 20 }}>
          {BENEFITS[mode].map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(212,64,0,.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#d44000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: 13, color: "#171b1f", lineHeight: 1.45 }}>{b}</span>
            </div>
          ))}
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
