import { Capacitor } from "@capacitor/core";
import type { PurchasesStoreProduct, SubscriptionOption } from "@revenuecat/purchases-capacitor";

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

/* Offre de sortie dans les apps (2026-11-02, DEPART30 du web) :
   - iOS : 4 produits « départ » dans un groupe d'abonnements À PART (« ThePerfClub Départ »), prix -30 %
     sans fin de remise + essai 14 j. Groupe séparé : un abonné plein tarif ne les voit pas dans
     Réglages → Abonnements (un même groupe y liste tous ses produits). Mêmes entitlements athlete/coach.
   - Android : offre « depart30 » sur les forfaits des 4 abonnements existants (essai 14 j puis -30 %
     pendant 12 mois), marquée « rc-ignore-offer » pour que RevenueCat ne la choisisse jamais par défaut. */
export const EXIT_PRODUCT_IDS_IOS: Record<Plan, Record<Billing, string>> = {
  athlete: { monthly: "tpc_athlete_monthly_depart", annual: "tpc_athlete_annual_depart" },
  coach:   { monthly: "tpc_coach_monthly_depart",   annual: "tpc_coach_annual_depart" },
};
export const EXIT_OFFER_ID_ANDROID = "depart30";

// Clés publiques RevenueCat (pas des secrets). Android (Google Play) : 2026-10-28, mêmes IDs produits.
const REVENUECAT_IOS_KEY = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY ?? "appl_vhcyRQNdfWsPRCBPsjRpfuBxgcj";
const REVENUECAT_ANDROID_KEY = process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_KEY ?? "goog_apYGqaPtuRafehtlkkWuymTJdox";
const revenueCatKey = () => (Capacitor.getPlatform() === "android" ? REVENUECAT_ANDROID_KEY : REVENUECAT_IOS_KEY);

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
  if (!revenueCatKey()) throw new Error("Achat indisponible dans l'app pour le moment.");
  const { Purchases } = await withTimeout(plugin(), 10000, "chargement du module");
  if (configuredFor === null) {
    await withTimeout(Purchases.configure({ apiKey: revenueCatKey(), appUserID: userId }), 10000, "configuration RevenueCat");
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
  const ids = Object.values(PRODUCT_IDS).flatMap(p => Object.values(p))
    .concat(Capacitor.getPlatform() === "ios" ? Object.values(EXIT_PRODUCT_IDS_IOS).flatMap(p => Object.values(p)) : []);
  if (ids.some(id => !productCache.has(id))) {
    const { products } = await withTimeout(Purchases.getProducts({ productIdentifiers: ids }), 45000, "produits App Store");
    /* Google Play renvoie « abonnement:forfait » (tpc_athlete_monthly:monthly) : on range sous l'ID
       de l'abonnement, comme sur l'App Store. */
    products.forEach(p => productCache.set(p.identifier.split(":")[0], p));
  }
  return Object.fromEntries(productCache);
}

async function syncServer() {
  const res = await fetch("/api/revenuecat/sync", { method: "POST" });
  const body = await res.json().catch(() => null);
  return { status: (body?.status as string | undefined) ?? null };
}

/* Offre de sortie du store pour une formule : produit « départ » sur iOS, offre depart30 du forfait sur
   Android. null = pas (encore) disponible (produits iOS pas encore validés par Apple, offre Play
   inactive, ou déjà consommée : Google ne renvoie que les offres auxquelles le client a droit). */
export type ExitStoreOffer = { product: PurchasesStoreProduct; option?: SubscriptionOption; price: string; trial: number | null };

export function exitStoreOffer(products: Record<string, PurchasesStoreProduct>, plan: Plan, billing: Billing): ExitStoreOffer | null {
  if (Capacitor.getPlatform() === "ios") {
    const product = products[EXIT_PRODUCT_IDS_IOS[plan][billing]];
    return product ? { product, price: product.priceString, trial: trialDays(product) } : null;
  }
  const product = products[PRODUCT_IDS[plan][billing]];
  const option = product?.subscriptionOptions?.find(o => o.id.split(":").pop() === EXIT_OFFER_ID_ANDROID);
  if (!product || !option) return null;
  const free = option.pricingPhases.find(ph => ph.price.amountMicros === 0);
  const paid = option.pricingPhases.find(ph => ph.price.amountMicros > 0 && ph.recurrenceMode !== 1)
    ?? option.pricingPhases.find(ph => ph.price.amountMicros > 0);
  if (!paid) return null;
  const trial = free ? free.billingPeriod.value * (free.billingCycleCount || 1) * (free.billingPeriod.unit === "WEEK" ? 7 : free.billingPeriod.unit === "MONTH" ? 30 : 1) : null;
  return { product, option, price: paid.price.formatted, trial };
}

/* null = l'utilisateur a fermé la fenêtre Apple (pas une erreur à afficher).
   `exit` : achète l'offre de sortie (exitStoreOffer) au lieu de la formule normale. */
export async function purchasePlan(userId: string, plan: Plan, billing: Billing, exit = false): Promise<{ ok: true } | { ok: false; error: string } | null> {
  try {
    const products = await getStoreProducts(userId);
    const offer = exit ? exitStoreOffer(products, plan, billing) : null;
    if (exit && !offer) return { ok: false, error: "Cette offre n'est plus disponible." };
    const product = offer?.product ?? products[PRODUCT_IDS[plan][billing]];
    if (!product) return { ok: false, error: "Offre introuvable dans la boutique. Réessaie plus tard." };
    const { Purchases } = await ensureConfigured(userId);
    if (offer?.option) await Purchases.purchaseSubscriptionOption({ subscriptionOption: offer.option });
    else await Purchases.purchaseStoreProduct({ product });
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

/* Jours d'essai lus dans le produit du store (partagé par l'écran d'offre et le bloc d'achat). */
export function trialDays(p: PurchasesStoreProduct | undefined): number | null {
  // Google Play (2026-10-28) : l'essai est la phase gratuite de l'offre par défaut du forfait.
  const free = p?.defaultOption?.freePhase;
  if (free) {
    const n = free.billingPeriod.value * (free.billingCycleCount || 1);
    const u = free.billingPeriod.unit;
    return u === "DAY" ? n : u === "WEEK" ? n * 7 : u === "MONTH" ? n * 30 : null;
  }
  const intro = p?.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits * (intro.cycles || 1);
  const unit = intro.periodUnit;
  return unit === "DAY" ? n : unit === "WEEK" ? n * 7 : unit === "MONTH" ? n * 30 : null;
}
