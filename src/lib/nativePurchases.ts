import type { PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";

/* Abonnement Apple dans l'app iOS (2026-10-01). Apple interdit de vendre un abonnement numérique
   hors de son système de paiement dans l'app (guideline 3.1.1) : dans la coque Capacitor, le
   formulaire Stripe est remplacé par l'achat in-app, via RevenueCat. Le web garde Stripe.

   Après un achat (ou une restauration), /api/revenuecat/sync relit le client chez RevenueCat et
   écrit profiles.subscription_status, comme le webhook Stripe : un abonnement Apple débloque aussi
   le web. Le webhook RevenueCat (/api/revenuecat/webhook) couvre ensuite renouvellements,
   résiliations et expirations.

   L'app user id RevenueCat = l'id Supabase de l'utilisateur, pour relier achat et profil.
   Plugin importé dynamiquement : rien de tout ça n'entre dans le bundle web. */

export type Plan = "athlete" | "coach";
export type Billing = "monthly" | "annual";

// IDs des 4 produits, à créer à l'identique dans App Store Connect (groupe d'abonnements unique).
export const PRODUCT_IDS: Record<Plan, Record<Billing, string>> = {
  athlete: { monthly: "tpc_athlete_monthly", annual: "tpc_athlete_annual" },
  coach:   { monthly: "tpc_coach_monthly",   annual: "tpc_coach_annual" },
};

// Clé publique iOS RevenueCat (pas un secret).
const REVENUECAT_IOS_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "appl_vhcyRQNdfWsPRCBPsjRpfuBxgcj";

let configuredFor: string | null = null;

/* Piège Capacitor : un plugin natif est un Proxy qui répond à n'importe quelle propriété, y compris
   "then". Le renvoyer tel quel depuis une fonction async le fait passer pour une promesse, que
   JavaScript attend sans fin (bug vu sur TestFlight build 3). On le renvoie donc dans un objet. */
async function plugin() {
  const mod = await import("@revenuecat/purchases-capacitor");
  return { Purchases: mod.Purchases };
}

// Diagnostic : chaque étape a son propre délai, pour savoir laquelle bloque.
function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${step} : délai dépassé`)), ms))]);
}

async function ensureConfigured(userId: string) {
  if (!REVENUECAT_IOS_KEY) throw new Error("Achat indisponible dans l'app pour le moment.");
  const { Purchases } = await withTimeout(plugin(), 10000, "chargement du module");
  if (configuredFor === null) {
    await withTimeout(Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: userId }), 10000, "configuration RevenueCat");
  } else if (configuredFor !== userId) {
    await withTimeout(Purchases.logIn({ appUserID: userId }), 10000, "connexion RevenueCat");
  }
  configuredFor = userId;
  return { Purchases }; // jamais le Proxy nu depuis une fonction async (voir plugin())
}

const productCache = new Map<string, PurchasesStoreProduct>();

/* Prix affichés : ceux de l'App Store (devise et montant du pays de l'utilisateur), jamais nos
   constantes PRICING, qui peuvent différer des paliers de prix Apple. */
export async function getStoreProducts(userId: string): Promise<Record<string, PurchasesStoreProduct>> {
  const { Purchases } = await ensureConfigured(userId);
  const ids = Object.values(PRODUCT_IDS).flatMap(p => Object.values(p));
  if (ids.some(id => !productCache.has(id))) {
    const { products } = await withTimeout(Purchases.getProducts({ productIdentifiers: ids }), 45000, "produits App Store");
    products.forEach(p => productCache.set(p.identifier, p));
  }
  return Object.fromEntries(productCache);
}

async function syncServer() {
  const res = await fetch("/api/revenuecat/sync", { method: "POST" });
  const body = await res.json().catch(() => null);
  return { status: (body?.status as string | undefined) ?? null };
}

/* null = l'utilisateur a fermé la fenêtre Apple (pas une erreur à afficher). */
export async function purchasePlan(userId: string, plan: Plan, billing: Billing): Promise<{ ok: true } | { ok: false; error: string } | null> {
  try {
    const products = await getStoreProducts(userId);
    const product = products[PRODUCT_IDS[plan][billing]];
    if (!product) return { ok: false, error: "Offre introuvable sur l'App Store. Réessaie plus tard." };
    const { Purchases } = await ensureConfigured(userId);
    await Purchases.purchaseStoreProduct({ product });
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) return null;
    console.error("[iap] purchase", err?.message ?? e);
    return { ok: false, error: "L'achat n'a pas abouti. Réessaie." };
  }
  const { status } = await syncServer();
  if (status !== "athlete" && status !== "coach") {
    // L'achat est passé chez Apple mais le serveur ne l'a pas encore vu : le webhook rattrapera.
    console.error("[iap] sync après achat", status);
  }
  return { ok: true };
}

export async function restorePurchases(userId: string): Promise<{ restored: boolean; error?: string }> {
  try {
    const { Purchases } = await ensureConfigured(userId);
    await Purchases.restorePurchases();
  } catch (e) {
    console.error("[iap] restore", e);
    return { restored: false, error: "Restauration impossible. Réessaie." };
  }
  const { status } = await syncServer();
  return { restored: status === "athlete" || status === "coach" };
}
