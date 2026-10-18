import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return Response.json({ valid: false }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("user_id, name, subscription_status").eq("invite_code", code).maybeSingle();

  if (!data) return Response.json({ valid: false });
  // coachPaying : même règle que coachIsPaying() (lib/access.ts), pour savoir dès l'onboarding si le
  // sportif invité aura un accès gratuit (pas de paywall dans le parcours).
  return Response.json({ valid: true, coachId: data.user_id, coachName: data.name, coachPaying: data.subscription_status === "coach" });
}
