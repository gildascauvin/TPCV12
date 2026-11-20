/* Événements PostHog envoyés depuis le serveur (2026-11-20) : ce que le téléphone ne voit jamais
   (résiliation depuis Stripe, Google Play ou l'App Store, fin d'abonnement, suppression de compte).
   distinct_id = id Supabase, le même que posthog.identify() côté app : l'événement atterrit sur la
   bonne personne. Best effort : jamais bloquant, 1,5 s max, une erreur ne casse pas le webhook. */
export async function captureServer(userId: string, event: string, properties: Record<string, unknown> = {}) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !userId) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch("https://eu.i.posthog.com/capture/", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ api_key: key, event, distinct_id: userId, properties: { ...properties, source: "server" } }),
    });
  } catch (e) {
    console.error("[posthog/server]", event, e);
  } finally {
    clearTimeout(t);
  }
}

/** Heures écoulées depuis le début de l'abonnement (une décimale) : distingue « annulé dans la minute » de « annulé après usage ». */
export function hoursSince(startMs: number | null | undefined): number | null {
  if (!startMs) return null;
  return Math.round(((Date.now() - startMs) / 3600_000) * 10) / 10;
}
