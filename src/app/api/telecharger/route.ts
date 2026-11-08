import { APP_STORE_URL, storeForUserAgent } from "@/lib/storeLinks";

/* Cible des QR codes « Télécharger l'app » (2026-10-28) : un seul QR pour les deux téléphones.
   Mesure (08/11, Gildas) : chaque passage envoie `app_download_redirect` à PostHog (source, téléphone,
   store), et une ligne dans les logs Vercel. Le téléphone qui scanne n'a pas de session : l'identifiant est
   anonyme, on compte des scans, pas des personnes. `?src=` permet de distinguer les emplacements. */
export async function GET(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  const store = storeForUserAgent(ua);
  const target = store?.url ?? (/Android/.test(ua) ? "https://go.theperfclub.com/register" : APP_STORE_URL);
  const src = new URL(req.url).searchParams.get("src") ?? "qr";
  const os = store?.os ?? (/Android/.test(ua) ? "android" : "other");
  console.log(`[telecharger] src=${src} os=${os}`);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (key) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 800);
    await fetch("https://eu.i.posthog.com/capture/", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ api_key: key, event: "app_download_redirect", distinct_id: `anon_qr_${crypto.randomUUID()}`, properties: { src, os, store: store?.name ?? null, $process_person_profile: false } }),
    }).catch(() => {}).finally(() => clearTimeout(t));
  }
  return Response.redirect(target, 302);
}
