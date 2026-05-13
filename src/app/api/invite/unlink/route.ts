import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { athleteId } = await req.json();
  if (!athleteId) return Response.json({ error: "athleteId manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  // Vérifie que l'athlète est bien lié à CE coach
  const { data: profile } = await admin
    .from("profiles")
    .select("invited_by_coach_id")
    .eq("user_id", athleteId)
    .single();

  if (!profile || profile.invited_by_coach_id !== user.id) {
    return Response.json({ error: "Action non autorisée." }, { status: 403 });
  }

  await admin.from("profiles").update({ invited_by_coach_id: null }).eq("user_id", athleteId);

  return Response.json({ ok: true });
}
