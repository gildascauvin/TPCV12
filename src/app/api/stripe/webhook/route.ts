import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS for webhook writes
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

  const supabase = getServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan ?? "athlete";
      if (userId) {
        await supabase
          .from("profiles")
          .update({ subscription_status: plan as "athlete" | "coach" })
          .eq("user_id", userId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customer = await stripe.customers.retrieve(sub.customer as string);
      if (!customer.deleted) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("stripe_customer_id", customer.id);
        if (profiles?.length) {
          await supabase
            .from("profiles")
            .update({ subscription_status: "expired" })
            .eq("stripe_customer_id", customer.id);
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
