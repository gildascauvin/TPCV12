import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { markBrevoClient } from "@/lib/email/brevoContact";
import { sendTrialReminderEmail } from "@/lib/email/trialReminderEmail";
import { sendTrialPush } from "@/lib/trialPush";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function markBrevoClientByUser(userId: string) {
  if (!process.env.BREVO_API_KEY) return;
  const supabase = getServiceClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return;
  await markBrevoClient(email).catch(e => console.error("[brevo] mark client", e));
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
        markBrevoClientByUser(userId);
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
    /* 3 jours avant la fin de l'essai : rappel par email et notification, tout de suite (3 jours) ou à J-2
       si c'est son choix (user_metadata.trial_reminder_days, onboarding vécu). L'événement doit être coché
       dans l'endpoint du Dashboard Stripe. Essai déjà résilié : rien à rappeler. */
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId || sub.cancel_at_period_end || sub.status !== "trialing" || !sub.trial_end) break;
      const { data } = await supabase.auth.admin.getUserById(userId);
      const user = data?.user;
      if (!user?.email) break;
      const days = user.user_metadata?.trial_reminder_days === 2 ? 2 : 3;
      const trialEnd = new Date(sub.trial_end * 1000);
      const remindAt = new Date(trialEnd.getTime() - days * 86400_000);
      remindAt.setUTCHours(8, 0, 0, 0);
      const later = days === 2 && remindAt.getTime() > Date.now() + 3600_000;
      const { data: prof, error: profErr } = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
      if (profErr) console.error("[trial-reminder] profile", profErr.message);
      const price = sub.items.data[0]?.price;
      await sendTrialReminderEmail(user.email, {
        first: (prof?.name as string | null)?.trim().split(/\s+/)[0] || null,
        trialEnd, amountCents: price?.unit_amount ?? null, interval: price?.recurring?.interval ?? null,
        daysLeft: days, sendAt: later ? remindAt : undefined,
      }).catch(e => console.error("[trial-reminder] send", e));
      if (later) {
        // Notification du jour J-2 : partie au passage de 9 h de /api/push/send (trialReminderPushes).
        const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, { user_metadata: { ...user.user_metadata, trial_push_at: remindAt.toISOString(), trial_end_at: trialEnd.toISOString() } });
        if (metaErr) console.error("[trial-reminder] metadata", metaErr.message);
      } else {
        await sendTrialPush(supabase, userId, trialEnd, days).catch(e => console.error("[trial-reminder] push", e));
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
