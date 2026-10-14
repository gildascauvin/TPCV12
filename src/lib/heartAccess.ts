/* Lecture de la FC des séances (2026-10-14) : seuls les builds iOS qui l'annoncent dans leur texte
   d'autorisation Santé la demandent. Ces builds ajoutent "TPCHeart" au user agent (capacitor.config.ts,
   ios.appendUserAgent) ; l'app déjà publiée ne l'a pas et ne demande donc rien de nouveau. Web-safe. */
export const HEART_UA_MARKER = "TPCHeart";

export function canReadHeart() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes(HEART_UA_MARKER);
}
