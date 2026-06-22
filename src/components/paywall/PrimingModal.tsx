"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const PRICING = {
  athlete: { monthly: 9,  annual: 59,  annualMonthly: "4,92" },
  coach:   { monthly: 49, annual: 179, annualMonthly: "14,92" },
};

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}

export default function PrimingModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss }: Props) {
  useEffect(() => { posthog.capture("paywall_viewed", { plan: mode }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = PRICING[mode];
  const annualSavings = p.monthly * 12 - p.annual;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🚀</div>
          <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2 }}>
            {mode === "athlete" ? "Débloquez les progrès" : "Coachez comme un pro"}
          </div>
          <div style={{ fontSize: 13, color: "#62686e", marginTop: 6, lineHeight: 1.5 }}>
            Commence ton essai gratuit de 7 jours. Annule à tout moment.
          </div>
        </div>

        {/* Timeline */}
        <div style={{ position: "relative", paddingLeft: 32, marginBottom: 22 }}>
          <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "rgba(212,64,0,0.20)", borderRadius: 1 }} />
          {[
            { title: "Accès complet dès le premier jour", sub: "Toutes les fonctionnalités débloquées immédiatement." },
            { title: "Rappel 2 jours avant la fin de l'essai", sub: "On te préviendra avant tout prélèvement." },
            { title: "Annule à tout moment, sans condition", sub: "Pas d'engagement, pas de frais cachés." },
          ].map((node, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < 2 ? 16 : 0 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: "rgba(212,64,0,0.10)", border: "1.5px solid #d44000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#d44000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1f2428", lineHeight: 1.3 }}>{node.title}</div>
                <div style={{ fontSize: 12, color: "#8a8f94", lineHeight: 1.4, marginTop: 2 }}>{node.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#171b1f", color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", letterSpacing: "0.06em", zIndex: 1 }}>
              ESSAI 7J GRATUITS
            </div>
            <div onClick={() => setBilling("monthly")}
              style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: billing === "monthly" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: billing === "monthly" ? "#171b1f" : "#fff", transition: "all .15s", height: "100%", boxSizing: "border-box" as const }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: billing === "monthly" ? "rgba(255,255,255,0.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em" }}>Mensuel</div>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${billing === "monthly" ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {billing === "monthly" && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff" }} />}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: billing === "monthly" ? "#fff" : "#171b1f", lineHeight: 1 }}>{p.monthly}€</div>
              <div style={{ fontSize: 11, color: billing === "monthly" ? "rgba(255,255,255,0.45)" : "#8a8f94", marginTop: 3 }}>/mois</div>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#d44000", color: "#fff", fontSize: 9, fontWeight: 900, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", letterSpacing: "0.06em", zIndex: 1 }}>
              ÉCONOMISEZ {annualSavings}€
            </div>
            <div onClick={() => setBilling("annual")}
              style={{ borderRadius: 16, padding: "14px 12px", cursor: "pointer", border: billing === "annual" ? "2px solid #171b1f" : "1.5px solid rgba(0,0,0,.12)", background: billing === "annual" ? "#171b1f" : "#fff", transition: "all .15s", height: "100%", boxSizing: "border-box" as const }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: billing === "annual" ? "rgba(255,255,255,0.6)" : "#8a8f94", textTransform: "uppercase", letterSpacing: "0.06em" }}>Annuel</div>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: billing === "annual" ? "#d44000" : "transparent", border: `1.5px solid ${billing === "annual" ? "#d44000" : "rgba(0,0,0,.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {billing === "annual" && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.03em", color: billing === "annual" ? "#fff" : "#171b1f", lineHeight: 1 }}>{p.annualMonthly}€</div>
              <div style={{ fontSize: 11, color: billing === "annual" ? "rgba(255,255,255,0.45)" : "#8a8f94", marginTop: 3 }}>/mois · {p.annual}€/an</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#2f9e44", marginBottom: 14 }}>
          ✓ Aucun prélèvement maintenant
        </div>

        <button onClick={() => { posthog.capture("paywall_opened", { plan: mode, billing }); onContinue(); }}
          style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)", marginBottom: 10 }}>
          Commencer l'essai gratuit →
        </button>

        {allowDismiss && (
          <button onClick={() => { posthog.capture("paywall_skipped", { plan: mode, billing }); onDismiss(); }}
            style={{ width: "100%", background: "none", border: "none", fontSize: 12, color: "#8a8f94", cursor: "pointer", padding: "4px 0" }}>
            Accéder sans abonnement →
          </button>
        )}
      </div>
    </div>
  );
}
