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
    .select("id, coach_id, user_id")
    .eq("id", coachAthleteId)
    .eq("coach_id", user.id)
    .single();

  if (!record) return Response.json({ error: "Athlète introuvable." }, { status: 404 });

  // Si vrai athlète : délier le profil
  if (record.user_id) {
    await admin.from("profiles").update({ invited_by_coach_id: null }).eq("user_id", record.user_id);
  }

  // Supprimer le record coach_athletes (cascade supprime les coach_sessions)
  await admin.from("coach_athletes").delete().eq("id", coachAthleteId);

  return Response.json({ ok: true });
}
