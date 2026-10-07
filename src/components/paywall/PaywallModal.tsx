"use client";

import { Skel } from "@/components/ui/Skeleton";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
import NativeCheckout from "@/components/paywall/NativeCheckout";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import posthog from "posthog-js";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";

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

/* CTA final (soumission Stripe) — essai 14 jours de retour (2026-09-13, voir CLAUDE.md), CB
   requise mais 0€ dû aujourd'hui (`trial_period_days` côté /api/stripe/subscribe). Reste le seul
   écran qui déclenche un vrai paiement (Stripe crée l'abonnement en statut "trialing"),
   contrairement à l'écran priming qui ne fait qu'avancer vers celui-ci (voir PricingPriming.tsx /
   Actions "Continuer →"). */
export const PAYWALL_CTA_LABEL: Record<"athlete" | "coach", string> = {
  // 2026-10-07 : l'offre s'appelle Elite (POC MgsQY4Fncy8XtVgmNBA9Q5), libellé choisi par Gildas.
  athlete: "Débloquer Elite — 14 jours offerts",
  coach: "Débloquer Elite — 14 jours offerts",
};

// Doit rester en phase avec TRIAL_DAYS dans /api/stripe/subscribe/route.ts et PricingPriming.tsx.
const TRIAL_DAYS = 14;

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

  const priceStr = billing === "annual" ? `${p.annualMonthly.toFixed(2).replace(".", ",").replace(",00", "")}€/mois (${p.annual}€/an)` : `${p.monthly}€/mois`;
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
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.12)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", fontWeight: 600 }}>ou payer par carte</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.12)" }} />
            </div>
          </>
        )}
        <PaymentElement
          options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }}
          onReady={() => setElementReady(true)}
        />

        {error && (
          <div style={{ color: "#ff8a8a", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(209,0,0,.14)", borderRadius: 12 }}>
            {error}
          </div>
        )}
      </form>

      {footerPortalNode && createPortal(
        <div style={{ padding: "20px 28px 20px", background: "rgba(7,10,13,.85)", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          {showBillingLegal && (
            /* Sur une seule ligne (2026-09-16, retour explicite de Gildas — "les écrans sont trop
               chargés") : la mention "sauf annulation en 1 clic..." est retirée d'ici — déjà dite
               par PRICING_PRIMING_GUARANTEE_CAPTION sur l'écran précédent (priming), pas la peine
               de la répéter une 2e fois juste avant de payer. */
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>
              0€ dû aujourd&apos;hui — {TRIAL_DAYS} jours offerts. Puis {priceStr}
            </div>
          )}

          <button
            type="submit"
            form="checkout-form"
            disabled={!stripe || !elementReady || loading}
            style={{
              width: "100%", height: 50, borderRadius: 16, border: "none",
              background: loading ? "#3a3f44" : "#D44000",
              color: "#fff", fontSize: 14, fontWeight: 900, cursor: loading ? "default" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {loading ? "Traitement..." : effectiveCtaLabel}
          </button>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, marginBottom: showBillingLegal ? 4 : 0 }}>
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
              <rect x="1" y="5" width="10" height="8" rx="2" stroke="rgba(255,255,255,.5)" strokeWidth="1.2" />
              <path d="M4 5V3.5a2 2 0 114 0V5" stroke="rgba(255,255,255,.5)" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Paiement sécurisé{!showBillingLegal && " · Résiliable à tout moment"}</span>
          </div>
        </div>,
        footerPortalNode
      )}
    </>
  );
}

export default function PaywallModal({ mode, allowDismiss = true, onClose, onSuccess, initialBilling, headline, abVariant }: PaywallModalProps) {
  const { isMd, w } = useBreakpoint();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [footerPortalNode, setFooterPortalNode] = useState<HTMLDivElement | null>(null);

  /* Plus de setter (2026-09-16) — le bloc "Facturé annuellement/Modifier" qui l'utilisait a été
     retiré (voir plus bas) : le choix mensuel/annuel se fait sur l'écran priming, avant celui-ci,
     et ne change plus une fois ici. */
  const [billing] = useState<Billing>(initialBilling ?? "annual");

  useEffect(() => {
    posthog.capture("paywall_form_viewed", { plan: mode, ...(abVariant ? { ab_variant: abVariant } : {}) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // App iOS : achat Apple (NativeCheckout), jamais de Stripe ni de setup-intent.
  const native = isNativeApp();

  useEffect(() => {
    if (native) { setLoadingIntent(false); return; }
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(r => r.json())
      .then((json) => {
        if (json.error) { setSetupError(`Erreur: ${json.error}`); setLoadingIntent(false); return; }
        setClientSecret(json.clientSecret);
        setLoadingIntent(false);
      })
      .catch(() => { setSetupError("Impossible de charger le formulaire."); setLoadingIntent(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Réassurance condensée en une ligne (2026-09-16, 2e itération — retour explicite de Gildas :
     "renforcer le testimonial" plutôt que la faire concurrencer par 3 blocs de réassurance) — sous
     le titre du form, sur desktop ET mobile (avant, seulement 3 lignes séparées, mobile only). */
  const testimonial = PAYWALL_TESTIMONIALS[mode];
  const p = PRICING[mode];
  const due = billing === "annual"
    ? `${p.annualMonthly.toFixed(2).replace(".", ",").replace(",00", "")}€/mois (${p.annual}€/an)`
    : `${p.monthly}€/mois`;
  const endDate = (() => { const d = new Date(); d.setDate(d.getDate() + TRIAL_DAYS); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); })();

  /* Même cadre que le priming (2026-10-07) : modale centrée sur desktop (récap + témoignage à
     gauche, formulaire à droite), plein écran sur mobile. Le footer Stripe (CheckoutForm, portail)
     reste un flex item non scrollable sous le formulaire. */
  const columns = isMd && w >= 860;
  const mono = "var(--font-mono), monospace";

  const recap = (
    <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "4px 16px" }}>
      {[
        { l: "Aujourd'hui", v: "0€", big: true },
        { l: `Le ${endDate}`, v: due },
        { l: "Annulation", v: "1 clic" },
      ].map((r, i) => (
        <div key={r.l} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 0", borderTop: i ? "1px solid rgba(255,255,255,.07)" : "none", fontSize: 13.5, color: "rgba(255,255,255,.85)" }}>
          <span>{r.l}</span>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: r.big ? 16 : 13.5, color: r.big ? "#7fdb8f" : "#fff", whiteSpace: "nowrap" }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
  const proof = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "14px 16px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.9)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>&ldquo;{testimonial.quote}&rdquo;</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <img src={testimonial.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#fff" }}>{testimonial.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{testimonial.role}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#f28a00", fontSize: 12 }}>★</span>)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex" }}>
          {PAYWALL_AVATARS.map((src, i) => (
            <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #070a0d", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>+600 sportifs, coachs et clubs</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 1 }}>font confiance à ThePerfClub</div>
        </div>
      </div>
    </div>
  );
  const backBtn = allowDismiss && onClose && (
    <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, alignSelf: "flex-start" }}>
      ← Retour aux offres
    </button>
  );
  const form = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!columns && backBtn}
      <span style={{ alignSelf: "flex-start", fontFamily: mono, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#7fdb8f", background: "rgba(47,158,68,.20)", padding: "5px 11px", borderRadius: 999 }}>
        🔓 {TRIAL_DAYS} jours offerts
      </span>
      <div style={{ fontFamily: "var(--font-display)", fontSize: isMd ? 24 : 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>{headline || "Active Elite"}</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: -4, marginBottom: 6 }}>0€ aujourd&apos;hui · Annulation en 1 clic · Sans engagement</div>
      {loadingIntent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" }}>
          <Skel dark h={46} r={12} /><div style={{ display: "flex", gap: 10 }}><Skel dark h={46} r={12} /><Skel dark h={46} r={12} /></div><Skel dark h={46} r={12} />
        </div>
      )}
      {setupError && <div style={{ color: "#ff8a8a", fontSize: 13, textAlign: "center", padding: "12px 0" }}>{setupError}</div>}
      {native && (
        <NativeCheckout mode={mode} billing={billing} footerPortalNode={footerPortalNode} onSuccess={onSuccess} abVariant={abVariant} ctaLabel={PAYWALL_CTA_LABEL[mode]} />
      )}
      {!native && clientSecret && (
        <Elements
          stripe={getStripePromise()}
          options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#D44000", colorBackground: "#12171c", borderRadius: "12px" } } }}
        >
          <CheckoutForm mode={mode} billing={billing} footerPortalNode={footerPortalNode} onSuccess={onSuccess} abVariant={abVariant} showBillingLegal={false} />
        </Elements>
      )}
    </div>
  );
  const closeBtn = allowDismiss && onClose && (
    <button onClick={onClose} aria-label="Fermer" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", cursor: "pointer", fontSize: 19, color: "rgba(255,255,255,.75)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>×</button>
  );
  const footer = <div ref={setFooterPortalNode} style={{ flexShrink: 0 }} />;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483100,
        background: "rgba(0,0,0,.62)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: isMd ? 24 : 0,
      }}
      onClick={e => { if (isMd && allowDismiss && onClose && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        position: "relative", color: "#fff", background: DARK_CARD_BG, overflow: "hidden",
        display: "flex", flexDirection: "column",
        ...(isMd
          ? { width: "min(980px, 100%)", maxHeight: "calc(100dvh - 48px)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 24, boxShadow: "0 40px 120px rgba(0,0,0,.55)", animation: "modalIn 0.2s cubic-bezier(0.2,0,0,1)" }
          : { width: "100%", height: "100dvh", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }),
      }}>
        {closeBtn}
        {columns ? (
          <div style={{ display: "grid", gridTemplateColumns: ".9fr 1.1fr", flex: 1, minHeight: 0 }}>
            <div style={{ padding: "34px 30px", borderRight: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
              {backBtn}
              <div>
                <div style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 10 }}>
                  Elite · {billing === "annual" ? "Annuel" : "Mensuel"}
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  {mode === "coach" ? "Tes sportifs, une décision chaque matin." : "Chaque séance ajustée à ta forme."}
                </div>
              </div>
              {recap}
              {proof}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "34px 32px 20px" }}>{form}</div>
              {footer}
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: isMd ? "34px 28px 20px" : "28px 16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
              {form}
              {recap}
              {proof}
            </div>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}
