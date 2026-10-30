import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

// Doit rester en phase avec TRIAL_DAYS dans PricingPriming.tsx/PaywallModal.tsx (copie affichée).
const TRIAL_DAYS = 14;

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setupIntentId, paymentMethodId: walletPaymentMethodId, plan, billing, promo } = await request.json();

  const priceId = billing === "annual"
    ? (plan === "coach" ? process.env.STRIPE_PRICE_COACH_ANNUAL : process.env.STRIPE_PRICE_ATHLETE_ANNUAL)
    : (plan === "coach" ? process.env.STRIPE_PRICE_COACH : process.env.STRIPE_PRICE_ATHLETE);

  if (!priceId) return NextResponse.json({ error: "Invalid plan or missing annual price" }, { status: 400 });

  /* Offre de sortie (src/lib/exitOffer.ts) : code DEPART30, annuel seulement. Code introuvable ou inactif =
     erreur plutôt qu'un abonnement au plein tarif alors que l'écran affichait le prix remisé. */
  let promotionCodeId: string | null = null;
  if (promo) {
    if (promo !== "DEPART30" || billing !== "annual") return NextResponse.json({ error: "Cette offre n'est valable que sur l'abonnement annuel." }, { status: 400 });
    const codes = await stripe.promotionCodes.list({ code: promo, active: true, limit: 1 });
    promotionCodeId = codes.data[0]?.id ?? null;
    if (!promotionCodeId) return NextResponse.json({ error: "Cette offre n'est plus disponible." }, { status: 400 });
  }

  let paymentMethodId: string;
  const isWallet = !!walletPaymentMethodId;
  if (isWallet) {
    paymentMethodId = walletPaymentMethodId;
  } else {
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    paymentMethodId = setupIntent.payment_method as string;
  }
  if (!paymentMethodId) return NextResponse.json({ error: "No payment method" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  const customerId = profile?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No customer" }, { status: 400 });

  // Wallet PMs (Apple Pay / Google Pay) are not attached to the customer automatically
  if (isWallet) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      trial_period_days: TRIAL_DAYS,
      ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
      metadata: { user_id: user.id, plan, ...(promo ? { promo } : {}) },
    });
  } catch (e) {
    // Code réservé à un 1er abonnement : Stripe refuse un client qui a déjà payé.
    if (promotionCodeId) return NextResponse.json({ error: "Cette offre est réservée à un premier abonnement." }, { status: 400 });
    throw e;
  }

  // 2026-09-13, retour de l'essai (14j, voir CLAUDE.md) : Stripe ne tente jamais de prélèvement à
  // la création avec trial_period_days posé, status="trialing" garanti — le check restait
  // nécessaire quand l'essai avait été retiré (08/08, prélèvement synchrone immédiat pouvant
  // renvoyer status="incomplete" sans exception). Gardé mais élargi à "trialing" : filet de
  // sécurité si l'essai est un jour retiré à nouveau sans qu'on pense à retoucher ce check.
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return NextResponse.json({ error: "Le paiement n'a pas pu être confirmé. Vérifie ta carte et réessaie." }, { status: 402 });
  }

  await supabase
    .from("profiles")
    .update({ subscription_status: plan as "athlete" | "coach" })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
