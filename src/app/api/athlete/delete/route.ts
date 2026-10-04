import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { coachAthleteId } = await req.json();
  if (!coachAthleteId) return Response.json({ error: "coachAthleteId manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const { data: record } = await supabase
    .from("coach_athletes")
    .select("id, coach_id, user_id, invite_email")
    .eq("id", coachAthleteId)
    .eq("coach_id", user.id)
    .single();

  if (!record) return Response.json({ error: "Sportif introuvable." }, { status: 404 });

  // Si vrai sportif : délier le profil
  if (record.user_id) {
    const { error: unlinkErr } = await admin.from("profiles").update({ invited_by_coach_id: null }).eq("user_id", record.user_id);
    if (unlinkErr) return Response.json({ error: unlinkErr.message }, { status: 500 });
  }

  // Si invitation pending : annuler l'invite pour éviter la re-création du placeholder
  if (record.invite_email) {
    const { error: inviteErr } = await admin.from("coach_invites")
      .delete()
      .eq("coach_id", user.id)
      .eq("email", record.invite_email)
      .eq("status", "pending");
    if (inviteErr) return Response.json({ error: inviteErr.message }, { status: 500 });
  }

  // Supprimer le record coach_athletes (cascade supprime les coach_sessions)
  const { error: deleteErr } = await supabase.from("coach_athletes").delete().eq("id", coachAthleteId);
  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 });

  return Response.json({ ok: true });
}
