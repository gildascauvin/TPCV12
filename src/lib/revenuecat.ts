import { createAdminClient } from "@/lib/supabase/admin";

/* Abonnements Apple (RevenueCat) → profiles.subscription_status (2026-10-01).
   Plutôt que d'interpréter chaque type d'événement du webhook, on relit l'état complet du client
   chez RevenueCat (API REST v1) et on en déduit le statut, avec les mêmes règles que le webhook
   Stripe :
   - entitlement "coach" actif → "coach", sinon "athlete" actif → "athlete" ;
   - essai en cours mais résilié (unsubscribe_detected_at pendant period_type "trial") → "expired"
     tout de suite, comme Stripe (trialing + cancel_at_period_end) ;
   - plus aucun entitlement actif alors qu'un abonnement App Store a existé → "expired".
   Garde-fou : un client sans aucun abonnement App Store n'est jamais touché (sinon un abonné
   Stripe qui ouvre l'app serait repassé en "expired"), et l'expiration n'écrase pas un compte
   qui a un client Stripe (le webhook Stripe reste maître de ce statut). */

type RcSubscription = {
  expires_date: string | null;
  period_type?: string;
  unsubscribe_detected_at?: string | null;
  store?: string;
};
type RcEntitlement = { expires_date: string | null; product_identifier: string };
type RcSubscriber = {
  entitlements: Record<string, RcEntitlement>;
  subscriptions: Record<string, RcSubscription>;
};

const isActive = (expires: string | null) => expires === null || new Date(expires).getTime() > Date.now();

async function fetchSubscriber(appUserId: string): Promise<RcSubscriber | null> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY manquante");
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  const body = await res.json();
  return body?.subscriber ?? null;
}

export function statusFromSubscriber(sub: RcSubscriber): "athlete" | "coach" | "expired" | null {
  const appStoreSubs = Object.entries(sub.subscriptions ?? {}).filter(([, s]) => !s.store || s.store === "app_store");
  if (appStoreSubs.length === 0) return null;

  for (const plan of ["coach", "athlete"] as const) {
    const ent = sub.entitlements?.[plan];
    if (!ent || !isActive(ent.expires_date)) continue;
    const s = sub.subscriptions?.[ent.product_identifier];
    if (s?.period_type === "trial" && s.unsubscribe_detected_at) return "expired";
    return plan;
  }
  return "expired";
}

async function markBrevoClient(userId: string) {
  if (!process.env.BREVO_API_KEY) return;
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return;
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/brevo/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, status: "client" }),
  }).catch(() => {});
}

/* Retourne le statut écrit, ou null si rien n'a été touché. */
export async function syncRevenueCatStatus(userId: string): Promise<string | null> {
  const sub = await fetchSubscriber(userId);
  if (!sub) return null;
  const status = statusFromSubscriber(sub);
  if (!status) return null;

  const admin = createAdminClient();
  const { data: profile, error: readErr } = await admin
    .from("profiles").select("subscription_status, stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (readErr) throw new Error(`profiles read: ${readErr.message}`);
  if (!profile) return null;
  if (status === "expired" && profile.stripe_customer_id) return null;
  if (profile.subscription_status === status) return status;

  const { error } = await admin.from("profiles").update({ subscription_status: status }).eq("user_id", userId);
  if (error) throw new Error(`profiles update: ${error.message}`);
  if (status !== "expired") markBrevoClient(userId);
  return status;
}
