import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, mode")
    .eq("user_id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription found" }, { status: 400 });
  }

  // /profil retiré (2026-09-15, chantier drawer profil unique) — retour sur l'accueil du rôle,
  // le profil se rouvre désormais via l'icône du header plutôt qu'une page dédiée.
  const returnPath = profile.mode === "coach" ? "/coach" : "/today";
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}${returnPath}`,
  });

  return NextResponse.json({ url: session.url });
}
