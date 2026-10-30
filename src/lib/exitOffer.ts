/* Offre de sortie du paywall (2026-10-30, POC Ma3E6NB8) : à la 1re fermeture du paywall (onboarding ou app,
   même composant), un écran propose -30 % pendant 12 mois, en mensuel comme en annuel (mensuel ajouté le
   2026-10-30 : 9 € → 6,30 €/mois, coach 39 € → 27,30 €), essai de 14 jours inchangé.
   Code promo Stripe DEPART30 (coupon pzCyxdmB : -30 %, 12 mois, produits sportif et coach, 1er abonnement
   seulement ; « 12 mois » et pas « une fois » : une remise « une fois » partirait sur la facture à 0 € de l'essai).
   Web seulement : dans les apps iOS / Android, l'achat passe par Apple / Google (codes d'offre des stores, lot 3).
   Une seule fois par appareil (localStorage). Une fois acceptée, l'offre reste appliquée au formulaire de
   paiement jusqu'au rechargement de la page (état de module, comme primingSource). */

import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { PRICING } from "@/components/paywall/PaywallModal";

export const EXIT_PROMO = "DEPART30";
const DISCOUNT = 0.3;
const SEEN_KEY = "tpc_exit_offer_seen";

export function exitOfferEligible(): boolean {
  if (isNativeApp()) return false;
  try {
    // Mode test (?dbgstep) : l'offre revient à chaque fermeture, pour pouvoir la revoir.
    if (new URLSearchParams(window.location.search).has("dbgstep")) return true;
    return !localStorage.getItem(SEEN_KEY);
  } catch { return false; }
}
export function markExitOfferSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* stockage bloqué */ }
}

let accepted = false;
export function acceptExitOffer() { accepted = true; }
export function exitOfferAccepted(): boolean { return accepted; }

/* Prix réellement facturé pendant les 12 mois de remise (Stripe arrondit au centime) : annuel 78 € → 54,60 €,
   348 € → 243,60 € ; mensuel 9 € → 6,30 €, 39 € → 27,30 €. */
export function exitPrice(mode: "athlete" | "coach", billing: "monthly" | "annual" = "annual") {
  const was = billing === "annual" ? PRICING[mode].annual : PRICING[mode].monthly;
  const now = Math.round(was * (1 - DISCOUNT) * 100) / 100;
  return { was, now, perMonth: billing === "annual" ? Math.round((now / 12) * 100) / 100 : now };
}
export const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
