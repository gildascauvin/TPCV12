import { useState } from "react";
import type { SubscriptionStatus } from "@/types";

export function usePaywall(subscriptionStatus: SubscriptionStatus, hasCoach = false) {
  const [paywallStep, setPaywallStep] = useState<"idle" | "priming" | "paywall">("idle");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  const isActive = subscriptionStatus === "athlete" || subscriptionStatus === "coach" || (subscriptionStatus === "free" && hasCoach);
  /* Toujours fermable (2026-08-19, chantier gating save) — avant, allowDismiss = hasCoach : un
     user sans coach ne pouvait pas fermer priming/paywall, cohérent avec l'ancien modèle où toute
     la page était déjà verrouillée derrière (rien à "retourner voir"). Depuis que le gating porte
     uniquement sur les actions de sauvegarde (le reste de l'app est navigable librement), bloquer
     la fermeture casserait le principe même du nouveau modèle — l'utilisateur doit pouvoir
     continuer à explorer sans payer. */
  const allowDismiss = true;

  /* Générique + async (2026-08-19, chantier gating save) — beaucoup d'appelants sont des onSave
     de modale typés `(data) => Promise<void>` (parfois avec une vraie valeur de retour, ex.
     AutoregButtons.onApply) ; une signature `() => void` synchrone ne satisfaisait plus ces types
     stricts. Reste compatible avec les usages fire-and-forget existants (`onClick={() =>
     requireSubscription(() => setShow(true))}`) — TS accepte qu'une fonction renvoyant une
     Promise soit assignée à un slot `() => void`, tant que l'appelant n'utilise pas la valeur. */
  async function requireSubscription<T>(fn: () => T | Promise<T>): Promise<T | void> {
    if (isActive) return await fn();
    setPaywallStep("priming");
  }

  function handleDismiss() {
    setPaywallStep("idle");
  }

  return { paywallStep, setPaywallStep, billing, setBilling, allowDismiss, requireSubscription, handleDismiss, isActive };
}
