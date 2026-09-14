import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* 2026-09-13 — sportif→coach "comme un programme claimé" (voir CLAUDE.md) : appelée depuis
   completeProfile() (OnboardingFlow.tsx) juste après la création d'un compte coach dont
   GET /api/programs/[id] a identifié un vrai sportif propriétaire pas encore coaché
   (claimedAthleteUserId). Symétrique de /api/invite/join (coach invite sportif) mais initiée par
   le coach — même pattern d'écriture (coach_athletes + profiles.invited_by_coach_id), sans la
   logique de placeholder (aucune invitation en attente à fusionner ici, le sportif a déjà un vrai
   compte). Revérifie tout côté serveur (jamais confiance dans le state client, potentiellement
   périmé si le sportif a été coaché entre-temps par quelqu'un d'autre). */
export async function POST(request: Request) {
  const { athleteUserId } = await request.json();
  if (!athleteUserId) return NextResponse.json({ error: "athleteUserId manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (athleteUserId === user.id) return NextResponse.json({ ok: false });

  const admin = createAdminClient();

  const { data: athleteProfile } = await admin
    .from("profiles")
    .select("name, sport, mode, invited_by_coach_id")
    .eq("user_id", athleteUserId)
    .maybeSingle();

  if (!athleteProfile || athleteProfile.mode !== "athlete" || athleteProfile.invited_by_coach_id) {
    return NextResponse.json({ ok: false }); // déjà coaché ou plus un sportif — pas d'erreur, juste rien à lier
  }

  const { data: existing } = await admin
    .from("coach_athletes")
    .select("id")
    .eq("coach_id", user.id)
    .eq("user_id", athleteUserId)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, already_linked: true });

  const { data: wellness } = await admin
    .from("wellness_daily")
    .select("score")
    .eq("user_id", athleteUserId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  await Promise.all([
    admin.from("coach_athletes").insert({
      coach_id: user.id,
      user_id: athleteUserId,
      name: athleteProfile.name || "Sportif",
      sport: athleteProfile.sport || "",
      wellness_score: wellness?.score ?? 70,
    }),
    admin.from("profiles").update({ invited_by_coach_id: user.id }).eq("user_id", athleteUserId),
  ]);

  return NextResponse.json({ ok: true });
}
