import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Historique récent d'un sportif pour l'autocomplete d'exercices côté coach (CoachSessionModal).
// Même garde d'accès que /api/coach/session (RLS bloque la lecture cross-user directe, même en
// lecture — un vrai sportif n'a pas de policy "coach peut lire" sur `sessions`).
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const athleteId = searchParams.get("athleteId");
  if (!athleteId) return Response.json({ error: "athleteId requis" }, { status: 400 });

  const { data: athlete } = await supabase
    .from("coach_athletes")
    .select("id, user_id, coach_id")
    .eq("id", athleteId)
    .eq("coach_id", user.id)
    .single();
  if (!athlete) return Response.json({ error: "Sportif introuvable" }, { status: 404 });

  const admin = createAdminClient();

  if (athlete.user_id) {
    const { data } = await admin.from("sessions").select("notes,date")
      .eq("user_id", athlete.user_id).eq("done", true)
      .order("date", { ascending: false }).limit(60);
    return Response.json({ ok: true, sessions: data ?? [] });
  }

  const { data } = await admin.from("coach_sessions").select("notes,date")
    .eq("athlete_id", athlete.id).eq("done", true)
    .order("date", { ascending: false }).limit(60);
  return Response.json({ ok: true, sessions: data ?? [] });
}
