import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ ok: false });

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("coach_invites")
    .select("id, coach_id, expires_at")
    .eq("email", user.email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!invite || new Date(invite.expires_at) < new Date()) return Response.json({ ok: false });

  const [{ data: athleteProfile }, { data: wellness }] = await Promise.all([
    admin.from("profiles").select("name, sport").eq("user_id", user.id).single(),
    admin.from("wellness_daily").select("score").eq("user_id", user.id).order("date", { ascending: false }).limit(1).single(),
  ]);

  // Cherche un placeholder créé à l'invitation
  const { data: placeholder } = await admin
    .from("coach_athletes")
    .select("id")
    .eq("coach_id", invite.coach_id)
    .eq("invite_email", user.email)
    .maybeSingle();

  await Promise.all([
    admin.from("profiles").update({ invited_by_coach_id: invite.coach_id }).eq("user_id", user.id),
    admin.from("coach_invites").update({ status: "accepted" }).eq("id", invite.id),
    placeholder
      ? admin.from("coach_athletes").update({
          user_id: user.id,
          name: athleteProfile?.name || "Sportif",
          sport: athleteProfile?.sport || "",
          wellness_score: wellness?.score ?? 70,
          invite_email: null,
        }).eq("id", placeholder.id)
      : admin.from("coach_athletes").insert({
          coach_id: invite.coach_id,
          user_id: user.id,
          name: athleteProfile?.name || "Sportif",
          sport: athleteProfile?.sport || "",
          wellness_score: wellness?.score ?? 70,
        }),
  ]);

  return Response.json({ ok: true });
}
