import { Capacitor } from "@capacitor/core";

/* Demande de note native (2026-11-02, lot natif de l'argumentaire avant paywall) : la fenêtre système
   de l'App Store (SKStoreReviewController) ou de Google Play (In-App Review), jamais une fenêtre maison.
   Apple et Google décident seuls de l'afficher (Apple : 3 fois par an au plus) et ne disent pas si la
   personne a noté : rien à attendre en retour.
   Seuls les builds qui embarquent le plugin portent « TPCReview » dans leur user agent
   (capacitor.config.ts) : les builds déjà publiés n'appellent rien. Une fois par appareil. */
export const REVIEW_UA_MARKER = "TPCReview";
const ASKED_KEY = "tpc_store_review_asked";

export function canRequestStoreReview() {
  return Capacitor.isNativePlatform() && typeof navigator !== "undefined" && navigator.userAgent.includes(REVIEW_UA_MARKER);
}

export async function requestStoreReview(): Promise<boolean> {
  if (!canRequestStoreReview()) return false;
  try { if (localStorage.getItem(ASKED_KEY)) return false; localStorage.setItem(ASKED_KEY, String(Date.now())); } catch { /* stockage bloqué */ }
  try {
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
    return true;
  } catch (e) {
    console.error("[store-review]", e);
    return false;
  }
}
