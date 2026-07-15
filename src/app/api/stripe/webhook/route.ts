import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function markBrevoClient(userId: string) {
  if (!process.env.BREVO_API_KEY) return;
  const supabase = getServiceClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return;
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/brevo/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, status: "client" }),
  }).catch(() => {});
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
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const plan = sub.metadata?.plan;
      if (userId && plan && (sub.status === "trialing" || sub.status === "active") && !sub.cancel_at_period_end) {
        await supabase
          .from("profiles")
          .update({ subscription_status: plan as "athlete" | "coach" })
          .eq("user_id", userId);
        markBrevoClient(userId);
      } else if (userId && ["past_due", "canceled", "unpaid"].includes(sub.status)) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "expired" })
          .eq("user_id", userId);
      } else if (userId && sub.status === "trialing" && sub.cancel_at_period_end) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "expired" })
          .eq("user_id", userId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "expired" })
          .eq("user_id", userId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
