"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PRICING, PAYWALL_TESTIMONIALS } from "./PaywallModal";

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

/* Contenu identique à l'étape paywall_priming de l'onboarding (OnboardingFlow.tsx) — badge,
   titre, cartes de prix, frise de réassurance, témoignage — juste enveloppé dans le shell
   modal (dismissible) au lieu du plein-écran, pour rester cohérent avec le paywall in-app. */
export default function PrimingJourneyModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss }: Props) {
  useEffect(() => {
    posthog.capture("paywall_priming_viewed", { plan: mode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const p = PRICING[mode];
  const savings = p.monthly * 12 - p.annual;
  const headline = mode === "coach" ? "Améliore ton coaching maintenant." : "Améliore tes performances maintenant.";
  const testimonial = PAYWALL_TESTIMONIALS[mode];

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
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#d44000", background: "rgba(212,64,0,.08)", display: "inline-block", padding: "5px 12px", borderRadius: 999, marginBottom: 16 }}>
            🔒 Essai 7j gratuit
          </div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 8 }}>{headline}</div>
          <div style={{ fontSize: 14, color: "#8a8f94", marginBottom: 20 }}>Aucun prélèvement avant la fin de l&apos;essai.</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 26 }}>
            <div onClick={() => setBilling("monthly")} style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: billing === "monthly" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: billing === "monthly" ? "#171b1f" : "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: billing === "monthly" ? "rgba(255,255,255,.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Mensuel</div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: billing === "monthly" ? "#fff" : "#171b1f", lineHeight: 1 }}>{p.monthly}€</div>
              <div style={{ fontSize: 11, color: billing === "monthly" ? "rgba(255,255,255,.45)" : "#8a8f94", marginTop: 3 }}>/mois</div>
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#d44000", color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", zIndex: 1 }}>ÉCONOMISEZ {savings}€</div>
              <div onClick={() => setBilling("annual")} style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: billing === "annual" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: billing === "annual" ? "#171b1f" : "#fff", height: "100%", boxSizing: "border-box" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: billing === "annual" ? "rgba(255,255,255,.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Annuel</div>
                <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: billing === "annual" ? "#fff" : "#171b1f", lineHeight: 1 }}>{p.annualMonthly}€</div>
                <div style={{ fontSize: 11, color: billing === "annual" ? "rgba(255,255,255,.45)" : "#8a8f94", marginTop: 3 }}>/mois · {p.annual}€/an</div>
              </div>
            </div>
          </div>

          <div style={{ position: "relative", paddingLeft: 32, marginBottom: 26 }}>
            <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "rgba(212,64,0,0.20)", borderRadius: 1 }} />
            {[
              { title: "Compte créé", sub: "Il ne reste qu'à démarrer ton essai gratuit.", done: true },
              { title: "Rappel 2 jours avant la fin de l'essai", sub: "On te préviendra avant tout prélèvement.", done: false },
              { title: "Annule à tout moment, sans condition", sub: "Pas d'engagement, pas de frais cachés.", done: false },
            ].map((node, i, arr) => (
              <div key={node.title} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < arr.length - 1 ? 16 : 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: node.done ? "#2f9e44" : "rgba(212,64,0,0.10)",
                  border: node.done ? "none" : "1.5px solid #d44000",
                }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke={node.done ? "#fff" : "#d44000"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1f2428", lineHeight: 1.3 }}>{node.title}</div>
                  <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.4, marginTop: 2 }}>{node.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ padding: "14px 16px 12px", background: "#fff", border: "1px solid rgba(0,0,0,.07)", borderRadius: 16 }}>
              <div style={{ fontSize: 13, color: "#3a3f44", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
                &ldquo;{testimonial.quote}&rdquo;
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  <img src={testimonial.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>{testimonial.name}</div>
                  <div style={{ fontSize: 11, color: "#8a8f94" }}>{testimonial.role}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                  {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#f28a00", fontSize: 12 }}>★</span>)}
                </div>
              </div>
            </div>
          </div>
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
