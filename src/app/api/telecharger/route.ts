import { APP_STORE_URL, storeForUserAgent } from "@/lib/storeLinks";

/* Cible des QR codes « Télécharger l'app » (2026-10-28) : un seul QR pour les deux téléphones. */
export function GET(req: Request) {
  const store = storeForUserAgent(req.headers.get("user-agent") ?? "");
  const target = store?.url ?? (/Android/.test(req.headers.get("user-agent") ?? "") ? "https://go.theperfclub.com/register" : APP_STORE_URL);
  return Response.redirect(target, 302);
}
