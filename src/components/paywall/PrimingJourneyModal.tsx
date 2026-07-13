"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { getPrimingHeadline } from "@/lib/primingCopy";

const PRICING = {
  athlete: { monthly: 9, annual: 59, annualMonthly: "4,92" },
  coach:   { monthly: 49, annual: 179, annualMonthly: "14,92" },
};

const AVATARS = [
  "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
  "https://www.theperfclub.com/wp-content/uploads/2022/02/Rond_SC.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/07/rugby-club-tarbes-768x768.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/05/2toiles-92-natation.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2021/03/halte%CC%81rophilie-Thibault-cortes.png",
];

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  objective?: string;
  frustration?: string;
  coachingChallenge?: string;
}

export default function PrimingJourneyModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss, objective = "", frustration = "", coachingChallenge = "" }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    posthog.capture("paywall_priming_viewed", { plan: mode, objective });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = PRICING[mode];
  const annualSavings = p.monthly * 12 - p.annual;

  const personalizedHeadline = (objective || coachingChallenge)
    ? getPrimingHeadline(
        mode === "athlete"
          ? { mode: "athlete", goal: objective, frustration }
          : { mode: "coach", coachingChallenge }
      )
    : null;

  const shield = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 }}>
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
        <path d="M7 0L0 3V7.5C0 11.47 3 15.2 7 16C11 15.2 14 11.47 14 7.5V3L7 0Z" fill="#2f9e44" />
        <path d="M4 8L6 10L10 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 900, color: "#2f9e44", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        AUCUN PAIEMENT MAINTENANT
      </span>
    </div>
  );

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

  const overlay = (children: React.ReactNode) => (
    <div onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }} style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)", maxHeight: "92vh", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
        <button onClick={onDismiss} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,.06)", border: "none", cursor: "pointer", fontSize: 20, color: "#62686e", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        <div key={step} style={{ animation: "stepIn 0.2s ease" }}>
          {children}
        </div>
      </div>
    </div>
  );

  /* ── Step 0: Valeur + preuve sociale ── */
  if (step === 0) return overlay(
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#d44000", padding: "5px 12px", border: "1px solid rgba(212,64,0,.2)", borderRadius: 999, background: "rgba(212,64,0,.06)" }}>
          ✦ L&apos;APP DE SUIVI DE PERFORMANCE
        </span>
      </div>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        {personalizedHeadline ? (
          <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.35, color: "#171b1f" }}>
            {personalizedHeadline}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.2, color: "#171b1f" }}>On veut que tu</div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.2 }}>
              essaies <span style={{ color: "#d44000" }}>ThePerfClub</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.2, color: "#d44000" }}>gratuitement</div>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 14px", background: "#f7f8f9", borderRadius: 16 }}>
        <div style={{ display: "flex" }}>
          {AVATARS.map((src, i) => (
            <div key={i} style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #f7f8f9", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#171b1f", lineHeight: 1.2 }}>+300 sportifs, coachs et clubs</div>
          <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>font confiance à ThePerfClub</div>
        </div>
      </div>

      {mode === "athlete" ? (
        <div style={{ background: "#f7f8f9", borderRadius: 20, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ height: 110, overflow: "hidden" }}>
            <img src="https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", display: "block" }} />
          </div>
          <div style={{ padding: "14px 16px 12px" }}>
            <div style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
              &ldquo;ThePerfClub a totalement changé la façon dont je structure mes entraînements. Je suis passé de « plus c'est mieux » à une vraie autorégulation — et mes résultats ont suivi.&rdquo;
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                <img src="https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>Franck G.</div>
                <div style={{ fontSize: 11, color: "#8a8f94" }}>Sportif · Membre ThePerfClub</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                {[0,1,2,3,4].map(i => <span key={i} style={{ color: "#f04a08", fontSize: 12 }}>★</span>)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#f7f8f9", borderRadius: 20, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ height: 110, overflow: "hidden" }}>
            <img src="https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
          </div>
          <div style={{ padding: "14px 16px 12px" }}>
            <div style={{ fontSize: 13, color: "#1f2428", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
              &ldquo;Je pensais que ThePerfClub était encore un outil pour créer des séances. Cela va bien plus loin : gestion du volume, de la fatigue, autorégulation — un véritable tableau de bord.&rdquo;
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                <img src="https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#1f2428" }}>Killian Anno</div>
                <div style={{ fontSize: 11, color: "#8a8f94" }}>Préparateur physique · Rugby Club d&apos;Arcachon</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                {[0,1,2,3,4].map(i => <span key={i} style={{ color: "#f04a08", fontSize: 12 }}>★</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "sticky", bottom: 0, margin: "16px 0 0", padding: "14px 0 0", background: "#fff" }}>
        {shield}
        <button onClick={() => { posthog.capture("paywall_priming_value_next", { plan: mode, objective }); setStep(1); }} style={ctaBtn}>
          Continuer gratuitement →
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94" }}>
          7 jours gratuits, puis {p.annualMonthly}€/mois · {p.annual}€/an
        </div>
      </div>
    </div>
  );

  /* ── Step 1: Rappel avant fin d'essai ── */
  if (step === 1) return overlay(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 27, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: 1.25, color: "#171b1f" }}>
          On te préviendra avant<br />la fin de ton essai gratuit
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 24 }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <div style={{ width: 150, height: 150, borderRadius: "50%", background: "linear-gradient(135deg, rgba(212,64,0,.07), rgba(212,64,0,.03))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 80, lineHeight: 1, display: "inline-block", animation: "bellBounce 0.7s ease 0.3s both" }}>🔔</span>
          </div>
          <div style={{ position: "absolute", top: 6, right: 6, width: 36, height: 36, borderRadius: "50%", background: "#e03131", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff", boxShadow: "0 4px 14px rgba(224,49,49,.45)", border: "3px solid #fff" }}>
            1
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, margin: "16px 0 0", padding: "14px 0 0", background: "#fff" }}>
        {shield}
        <button onClick={() => { posthog.capture("paywall_priming_notif_next", { plan: mode, objective }); setStep(2); }} style={ctaBtn}>
          Continuer gratuitement →
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: "#8a8f94" }}>
          7 jours gratuits, puis {p.annualMonthly}€/mois · {p.annual}€/an
        </div>
      </div>
    </div>
  );

  /* ── Step 2: Recap pricing ── */
  return overlay(
    <div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🚀</div>
        <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2 }}>
          {mode === "athlete" ? "Débloquez les progrès" : "Coachez comme un pro"}
        </div>
        <div style={{ fontSize: 13, color: "#62686e", marginTop: 6, lineHeight: 1.5 }}>
          Commence ton essai gratuit de 7 jours. Annule à tout moment.
        </div>
      </div>

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

      <div style={{ position: "sticky", bottom: 0, margin: "16px 0 0", padding: "14px 0 0", background: "#fff" }}>
        <button onClick={() => { posthog.capture("paywall_opened", { plan: mode, billing }); onContinue(); }} style={ctaBtn}>
          Commencer l&apos;essai gratuit →
        </button>
        {allowDismiss && (
          <button onClick={() => { posthog.capture("paywall_skipped", { plan: mode, billing }); onDismiss(); }} style={skipBtn}>
            Accéder sans abonnement →
          </button>
        )}
      </div>
    </div>
  );
}
