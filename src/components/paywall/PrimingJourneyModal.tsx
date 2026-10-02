"use client";

import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { NativePurchasePanel } from "./NativeCheckout";
import { useEffect } from "react";
import posthog from "posthog-js";
import { PricingPrimingContent, PricingPrimingValue } from "./PricingPriming";
import { PAYWALL_CTA_LABEL } from "./PaywallModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  /** App iOS : le bouton déclenche directement l'achat Apple (pas d'écran de paiement intermédiaire).
      Appelé après un achat réussi ; par défaut la page se recharge (statut relu côté serveur). */
  onPurchased?: () => void;
  /** Personnalisation optionnelle (2026-08-31) — l'onboarding rend désormais ce composant tel
      quel pour paywall_priming (plus une copie parallèle) afin de garder "le même habillage" que
      le gating in-app, y compris le "×"/onDismiss. Ces 5 props restent absentes de tous les
      appelants in-app existants (repli sur le headline générique + PricingPrimingContent sans
      personnalisation, comportement inchangé pour eux) — seul l'onboarding les fournit, pour ne
      pas perdre le titre "Ton programme {nom} t'attend"/sport/faiblesses/prénom qu'il avait avant
      ce changement. Voir PricingPrimingProps (PricingPriming.tsx) pour le détail de chaque champ. */
  headline?: string;
  sub?: string | null;
  sport?: string;
  sessionCount?: number;
  weaknessLabels?: string[];
  name?: string;
  /** Voir PricingPrimingProps (PricingPriming.tsx) — pilote le bloc "Inviter mon coach →". */
  athleteSelfId?: string;
}

/* Shell modal (dismissible) autour du contenu partagé PricingPrimingContent — voir
   PricingPriming.tsx pour le détail (badge garantie, prix, bullets, frise, témoignage, FAQ).
   Décision explicite de Gildas (2026-08-07) : ce composant et l'étape paywall_priming de
   l'onboarding (OnboardingFlow.tsx) doivent rester "exactement le même composant" — toute
   modification de contenu se fait uniquement dans PricingPriming.tsx. */
export default function PrimingJourneyModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss, onPurchased, headline: headlineProp, sub, sport, sessionCount, weaknessLabels, name, athleteSelfId }: Props) {
  const { isMd } = useBreakpoint();
  useEffect(() => {
    posthog.capture("paywall_priming_viewed", { plan: mode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const headline = headlineProp ?? (mode === "coach" ? "Améliore ton coaching maintenant." : "Améliore tes performances maintenant.");

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 16, border: "none",
    background: "#D44000", color: "#fff",
    fontSize: 14, fontWeight: 900, cursor: "pointer", marginBottom: 10,
  };

  /* Premier jet (2026-09-16, demande explicite de Gildas) : split gauche (dark, la valeur —
     headline/sous-titre + illustration) / droite (l'offre — prix, bullets, preuve sociale, FAQ,
     CTA), même convention que le reste du wizard (WizardHero + illustration à gauche, formulaire/
     actions à droite dans un drawer docké — ProgramCreatePicker.tsx/ProgramCriteriaModal.tsx/
     WellnessModal.tsx/InviteModal.tsx/ProgramAssignModal.tsx). Mobile : pas de 2e colonne, la
     valeur reste affichée EN PREMIER dans le drawer (au-dessus de l'offre), jamais après — un
     split qui inverserait cet ordre sur mobile irait à l'encontre du but même de cet écran
     ("montrer la valeur avant le prix") sur la surface où la quasi-totalité du trafic arrive. */
  const heroOnLeft = isMd;
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: heroOnLeft ? "flex-start" : "stretch",
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={e => { if (allowDismiss && e.target === e.currentTarget) onDismiss(); }}
    >
      {heroOnLeft && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px", background: DARK_CARD_BG }}>
          <div style={{ maxWidth: 460, width: "100%" }}>
            <PricingPrimingValue role={mode} headline={headline} sub={sub} />
          </div>
        </div>
      )}
      <div style={{
        position: "relative",
        /* Charte de l'app (2026-10-02) : fond sombre cyan, cartes translucides, bouton #D44000. */
        background: DARK_CARD_BG, color: "#fff",
        borderLeft: isMd ? "1px solid rgba(255,255,255,.08)" : "none",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "24px 0 0 24px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {allowDismiss && (
          <button onClick={onDismiss} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", cursor: "pointer", fontSize: 20, color: "rgba(255,255,255,.75)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>×</button>
        )}

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "36px 20px 20px" }}>
            {/* Valeur affichée dans le drawer lui-même seulement sur mobile (heroOnLeft=false) —
                sur desktop, elle vit déjà dans le panneau de gauche ci-dessus. */}
            {!heroOnLeft && (
              <div style={{ marginBottom: 28 }}>
                <PricingPrimingValue role={mode} headline={headline} sub={sub} />
              </div>
            )}
            <PricingPrimingContent role={mode} billing={billing} setBilling={setBilling} sessionCount={sessionCount} weaknessLabels={weaknessLabels} name={name} athleteSelfId={athleteSelfId} />
          </div>
        </div>

        <div style={{ flexShrink: 0, background: "rgba(7,10,13,.85)", borderTop: "1px solid rgba(255,255,255,.08)", padding: "16px 20px 20px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {isNativeApp() ? (
              <NativePurchasePanel
                mode={mode}
                billing={billing}
                ctaLabel={PAYWALL_CTA_LABEL[mode]}
                onSuccess={() => { if (onPurchased) onPurchased(); else window.location.reload(); }}
              />
            ) : (
              <>
                <button onClick={() => { posthog.capture("paywall_priming_value_next", { plan: mode }); onContinue(); }} style={ctaBtn}>
                  {PAYWALL_CTA_LABEL[mode]}
                </button>
                {/* Sortie explicite (2026-10-02) : le gratuit reste une vraie option, le tableau
                    au-dessus dit ce qu'il garde. */}
                {allowDismiss && (
                  <button onClick={onDismiss} style={{ display: "block", margin: "10px auto 0", border: "none", background: "none", color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
                    Continuer gratuitement
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
