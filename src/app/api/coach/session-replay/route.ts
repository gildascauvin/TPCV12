import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replayProposalServer } from "@/lib/autoregProposalServer";

/* Reco rejouée d'une séance faite d'un sportif, pour l'écran de résultat du coach (2026-10-23).
   Réservée au coach lié à ce sportif (même vérification que /api/coach/wellness). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const { sessionId } = await req.json().catch(() => ({}));
  if (typeof sessionId !== "string") return Response.json({ error: "sessionId manquant" }, { status: 400 });

  const admin = createAdminClient();
  const { data: s, error } = await admin.from("sessions").select("user_id, date, target_difficulty, done, rpe").eq("id", sessionId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!s) return Response.json({ proposal: null });
  const { data: link } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", s.user_id).limit(1).maybeSingle();
  if (!link) return Response.json({ error: "Sportif non lié" }, { status: 403 });
  try {
    return Response.json({ proposal: s.done ? await replayProposalServer(admin, s.user_id, s) : null });
  } catch (e) {
    console.error("[coach] rejeu", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
