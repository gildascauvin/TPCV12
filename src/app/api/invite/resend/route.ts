import { createClient } from "@/lib/supabase/server";
import { sendCoachInviteEmail } from "@/lib/email/inviteEmail";

/* Renvoyer l'email d'invitation d'un sportif pas encore inscrit (2026-10-04, tiroir profil coach). */
export async function POST(req: Request) {
  const { coachAthleteId } = await req.json();
  if (!coachAthleteId) return Response.json({ error: "coachAthleteId manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const [{ data: row }, { data: coach }] = await Promise.all([
    supabase.from("coach_athletes").select("id, user_id, invite_email").eq("id", coachAthleteId).eq("coach_id", user.id).maybeSingle(),
    supabase.from("profiles").select("name, invite_code").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!row) return Response.json({ error: "Sportif introuvable." }, { status: 404 });
  if (row.user_id || !row.invite_email) return Response.json({ error: "Ce sportif a déjà rejoint ton groupe." }, { status: 409 });
  if (!coach?.invite_code) return Response.json({ error: "Code d'invitation introuvable." }, { status: 500 });

  try {
    await sendCoachInviteEmail(row.invite_email, coach.name || "Ton coach", coach.invite_code);
  } catch (err) {
    console.error("[invite/resend] envoi email échoué", err);
    return Response.json({ error: "L'email n'a pas pu être envoyé." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
