import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { setupIntentId, plan, billing } = await request.json();

  const priceId = billing === "annual"
    ? (plan === "coach" ? process.env.STRIPE_PRICE_COACH_ANNUAL : process.env.STRIPE_PRICE_ATHLETE_ANNUAL)
    : (plan === "coach" ? process.env.STRIPE_PRICE_COACH : process.env.STRIPE_PRICE_ATHLETE);

  if (!priceId) return NextResponse.json({ error: "Invalid plan or missing annual price" }, { status: 400 });

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = setupIntent.payment_method as string;
  if (!paymentMethodId) return NextResponse.json({ error: "No payment method" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  const customerId = profile?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No customer" }, { status: 400 });

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    default_payment_method: paymentMethodId,
    trial_period_days: 7,
    metadata: { user_id: user.id, plan },
  });

  await supabase
    .from("profiles")
    .update({ subscription_status: plan as "athlete" | "coach" })
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
