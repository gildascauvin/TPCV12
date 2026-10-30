import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addBrevoSignup } from "@/lib/email/brevoContact";

/* Appelée par l'onboarding juste après la création du compte. L'email vient de la session, jamais
   du corps de la requête : la route était publique et acceptait n'importe quel email et
   `status: "client"`. Le passage en client se fait côté serveur (webhooks Stripe et RevenueCat). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, role, sport, claimProgramId, platform } = await request.json() as {
    platform?: string;
    name?: string;
    role?: string;
    sport?: string | null;
    claimProgramId?: string | null;
  };

  if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: "Brevo not configured" }, { status: 500 });

  try {
    await addBrevoSignup({ email: user.email, name, role, platform, sport, claimProgramId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[brevo/contact]", err);
    return NextResponse.json({ error: "Brevo sync failed" }, { status: 500 });
  }
}
