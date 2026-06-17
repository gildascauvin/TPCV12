import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function linkAthleteToCoach(admin: ReturnType<typeof createAdminClient>, coachId: string, athleteUserId: string) {
  const [{ data: athleteProfile }, { data: wellness }] = await Promise.all([
    admin.from("profiles").select("name, sport").eq("user_id", athleteUserId).single(),
    admin.from("wellness_daily").select("score").eq("user_id", athleteUserId).order("date", { ascending: false }).limit(1).single(),
  ]);
  await Promise.all([
    admin.from("profiles").update({ invited_by_coach_id: coachId }).eq("user_id", athleteUserId),
    admin.from("coach_athletes").insert({
      coach_id: coachId,
      user_id: athleteUserId,
      name: athleteProfile?.name || "Sportif",
      sport: athleteProfile?.sport || "",
      wellness_score: wellness?.score ?? 70,
    }),
  ]);
}

export async function POST(req: Request) {
  const { athleteEmail } = await req.json();
  if (!athleteEmail) return Response.json({ error: "Email manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const { data: coach } = await supabase.from("profiles").select("mode").eq("user_id", user.id).single();
  if (!coach || coach.mode !== "coach") return Response.json({ error: "Accès réservé aux coachs" }, { status: 403 });

  const email = athleteEmail.trim().toLowerCase();

  // Vérifie si un compte existe déjà
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` } }
  );
  const { users } = await res.json();
  const existing = users?.find((u: { email: string }) => u.email === email);

  if (existing) {
    const { data: profile } = await admin.from("profiles").select("invited_by_coach_id").eq("user_id", existing.id).single();
    if (profile?.invited_by_coach_id && profile.invited_by_coach_id !== user.id) {
      return Response.json({ error: "Ce sportif est déjà lié à un autre coach." }, { status: 409 });
    }
    const { data: existingRecord } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", existing.id).maybeSingle();
    if (!existingRecord) {
      await linkAthleteToCoach(admin, user.id, existing.id);
    }
    return Response.json({ ok: true, linked: true });
  }

  // Pas encore inscrit → invite en attente + placeholder dans coach_athletes
  const { error } = await admin.from("coach_invites").insert({ coach_id: user.id, email });
  if (error) return Response.json({ error: "Erreur lors de la création de l'invitation." }, { status: 500 });

  await admin.from("coach_athletes").insert({
    coach_id: user.id,
    user_id: null,
    name: email.split("@")[0],
    sport: "",
    wellness_score: 0,
    invite_email: email,
  });

  return Response.json({ ok: true, linked: false });
}
