import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { replayProposalServer } from "@/lib/autoregProposalServer";

/* Reco rejouée d'une séance faite sans reco figée, pour l'écran de résultat du sportif (2026-10-24).
   Même calcul que le figeage du matin (seuils personnels, signal appris), côté serveur. Rien n'est
   écrit. Le coach a sa route (/api/coach/session-replay). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const { sessionId } = await req.json().catch(() => ({}));
  if (typeof sessionId !== "string") return Response.json({ error: "sessionId manquant" }, { status: 400 });
  const admin = createAdminClient();
  const { data: s, error } = await admin.from("sessions").select("id, user_id, date, notes, target_difficulty, done").eq("id", sessionId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!s || s.user_id !== user.id) return Response.json({ proposal: null });
  try {
    return Response.json({ proposal: s.done ? await replayProposalServer(admin, user.id, s) : null });
  } catch (e) {
    console.error("[rejeu séance]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
