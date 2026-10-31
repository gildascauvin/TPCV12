import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) { console.error("[stripe/setup-intent] STRIPE_SECRET_KEY manquant"); return NextResponse.json({ error: "unavailable" }, { status: 500 }); }

    const stripe = new Stripe(secretKey);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) { console.error("[stripe/setup-intent] profil", profileError); return NextResponse.json({ error: "unavailable" }, { status: 500 }); }

    let customerId = profile?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      const { error: custErr } = await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
      if (custErr) console.error("[stripe/setup-intent] stripe_customer_id", custErr);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err: unknown) {
    // Détail dans les logs, jamais à l'écran (31/10) : le message est traduit côté PaywallModal.
    console.error("[stripe/setup-intent]", err);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
