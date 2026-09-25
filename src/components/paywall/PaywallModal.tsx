"use client";

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
  athlete: "Débloquer mon programme",
  coach: "Débloquer mon espace coach",
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
            /* Sur une seule ligne (2026-09-16, retour explicite de Gildas — "les écrans sont trop
               chargés") : la mention "sauf annulation en 1 clic..." est retirée d'ici — déjà dite
               par PRICING_PRIMING_GUARANTEE_CAPTION sur l'écran précédent (priming), pas la peine
               de la répéter une 2e fois juste avant de payer. */
            <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>
              0€ dû aujourd&apos;hui — {TRIAL_DAYS} jours offerts. Puis {priceStr}
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
  const { isMd } = useBreakpoint();
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

  /* Réassurance condensée en une ligne (2026-09-16, 2e itération — retour explicite de Gildas :
     "renforcer le testimonial" plutôt que la faire concurrencer par 3 blocs de réassurance) — sous
     le titre du form, sur desktop ET mobile (avant, seulement 3 lignes séparées, mobile only). */
  const reassuranceLine = "0€ aujourd'hui · Annulation en 1 clic · Sans engagement";
  const testimonial = PAYWALL_TESTIMONIALS[mode];

  /* Drawer docké à droite sur desktop, plein écran mobile (2026-09-04, même shell que
     PrimingJourneyModal.tsx — demande explicite de Gildas, "le paywall aussi en drawer"). Le portail
     du footer Stripe (form="checkout-form", voir CheckoutForm ci-dessus) n'a plus besoin de
     position:fixed plein viewport : simple flex item flexShrink:0 après la région scrollable, comme
     tous les autres drawers du repo (convention "Footer non-scrollable des modales").
     Panneau gauche dark sur desktop (2026-09-16) : ne garde plus que le témoignage + la bande
     "+600" (réassurance déplacée en sous-titre du form, voir reassuranceLine) — sur mobile, ce même
     contenu reste affiché sous le formulaire (pas de 2e colonne). */
  const heroOnLeft = isMd;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: heroOnLeft ? "flex-start" : "stretch",
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (allowDismiss && onClose && e.target === e.currentTarget) onClose(); }}
    >
      {heroOnLeft && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px", background: DARK_CARD_BG }}>
          <div style={{ maxWidth: 380, width: "100%" }}>
            <div style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,.4)", marginBottom: 10 }}>
              Ce que disent des {mode === "coach" ? "coachs" : "sportifs"} comme vous
            </div>
            <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.9)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
                &ldquo;{testimonial.quote}&rdquo;
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  <img src={testimonial.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, color: "#fff" }}>{testimonial.name}</div>
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
                  <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #070a0d", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
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
        </div>
      )}
      <div style={{
        position: "relative",
        background: "#f1f0ee",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {allowDismiss && onClose && (
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "1px solid rgba(0,0,0,.08)", cursor: "pointer", fontSize: 20, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,.08)" }}>×</button>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", padding: "36px 20px 20px" }}>

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
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#2f9e44", background: "rgba(47,158,68,.10)", display: "inline-block", padding: "5px 12px", borderRadius: 999, marginBottom: 16 }}>
            🔓 {TRIAL_DAYS} jours offerts
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 6 }}>{headline || "Passe au niveau supérieur."}</div>
          {/* Sous-titre condensé (2026-09-16, retour explicite de Gildas) — remplace les 3 blocs
              de réassurance séparés, visible sur desktop ET mobile (avant, mobile only). */}
          <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 24 }}>{reassuranceLine}</div>

          {/* Bloc "Facturé annuellement/Modifier" retiré (2026-09-16, retour explicite de Gildas —
              "on peut modifier en faisant retour") : le choix mensuel/annuel se change en revenant
              à l'écran priming (bouton "← Retour" ci-dessus), plus besoin d'un contrôle dupliqué
              ici. `billing` reste figé à sa valeur d'entrée (initialBilling) pour toute la durée de
              cet écran — voir le useState plus haut, `setBilling` n'a plus d'appelant. */}

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

          {/* Témoignage + bande "+600" — mobile uniquement, sous le formulaire (retour explicite
              de Gildas : "en mobile, on le met dessous"). Sur desktop ce même contenu vit dans le
              panneau de gauche (heroOnLeft, voir plus haut) — jamais dupliqué. */}
          {!heroOnLeft && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a8f94", marginBottom: 10 }}>
                Ce que disent des {mode === "coach" ? "coachs" : "sportifs"} comme vous
              </div>
              <div style={{ padding: "14px 16px 12px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "#3a3f44", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
                  &ldquo;{testimonial.quote}&rdquo;
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                    <img src={testimonial.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, color: "#1f2428" }}>{testimonial.name}</div>
                    <div style={{ fontSize: 11, color: "#8a8f94" }}>{testimonial.role}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                    {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#f28a00", fontSize: 12 }}>★</span>)}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
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
            </div>
          )}
        </div>
        </div>

        <div ref={setFooterPortalNode} style={{ flexShrink: 0, background: "#f1f0ee" }} />
      </div>
    </div>
  );
}
