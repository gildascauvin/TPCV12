import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { invite_code } = await request.json();
  if (!invite_code) return NextResponse.json({ error: "invite_code manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const { data: coachProfile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("invite_code", invite_code)
    .maybeSingle();

  if (!coachProfile) return NextResponse.json({ error: "Code invalide" }, { status: 404 });

  const coachId = coachProfile.user_id;
  if (coachId === user.id) return NextResponse.json({ ok: true });

  const [{ data: existing }, { data: placeholder }] = await Promise.all([
    admin.from("coach_athletes").select("id").eq("coach_id", coachId).eq("user_id", user.id).maybeSingle(),
    admin.from("coach_athletes").select("id").eq("coach_id", coachId).eq("invite_email", user.email ?? "").maybeSingle(),
  ]);

  if (existing) return NextResponse.json({ ok: true, already_linked: true });

  const [{ data: athleteProfile }, { data: wellness }] = await Promise.all([
    admin.from("profiles").select("name, sport").eq("user_id", user.id).single(),
    admin.from("wellness_daily").select("score").eq("user_id", user.id).order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  await Promise.all([
    placeholder
      ? admin.from("coach_athletes").update({
          user_id: user.id,
          name: athleteProfile?.name || "Sportif",
          sport: athleteProfile?.sport || "",
          wellness_score: wellness?.score ?? 70,
          invite_email: null,
        }).eq("id", placeholder.id)
      : admin.from("coach_athletes").insert({
          coach_id: coachId,
          user_id: user.id,
          name: athleteProfile?.name || "Sportif",
          sport: athleteProfile?.sport || "",
          wellness_score: wellness?.score ?? 70,
        }),
    admin.from("profiles").update({ invited_by_coach_id: coachId }).eq("user_id", user.id),
    // Le sportif a désormais ses propres vraies séances (table sessions) — les séances
    // synthétiques posées à l'invitation (coach_sessions, voir /api/invite/create) deviendraient
    // des doublons fantômes sur son planning coach si on les laissait.
    placeholder ? admin.from("coach_sessions").delete().eq("athlete_id", placeholder.id) : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
