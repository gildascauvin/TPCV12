/* Liens des stores (2026-10-28), sans dépendance navigateur : utilisables côté serveur (redirection
   /api/telecharger) comme côté client (bannière, inscription, carte montre). */

export const APP_STORE_URL = "https://apps.apple.com/fr/app/theperfclub/id6817809833";

/** Lien Google Play, vide tant que l'app Android n'est pas publique : Android garde alors l'installation web
    et les écrans ne parlent que de l'iPhone. À remplir le jour de la publication. */
export const PLAY_STORE_URL = "";

/** Cible des QR codes : redirige vers le bon store selon le téléphone qui scanne. */
export const APP_DOWNLOAD_URL = "https://go.theperfclub.com/api/telecharger";

export type Store = { url: string; name: "l'App Store" | "Google Play"; os: "iphone" | "android" };

/** Store du téléphone qui navigue sur le site, null sur ordinateur (ou Android avant publication). */
export function storeForUserAgent(ua: string): Store | null {
  if (/iPhone|iPod|iPad/.test(ua)) return { url: APP_STORE_URL, name: "l'App Store", os: "iphone" };
  if (/Android/.test(ua) && PLAY_STORE_URL) return { url: PLAY_STORE_URL, name: "Google Play", os: "android" };
  return null;
}
