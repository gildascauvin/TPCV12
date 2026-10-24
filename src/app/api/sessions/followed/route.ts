import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* « J'ai allégé sans le noter » (2026-10-24, migration 043) : corrige le réalisé d'une séance dont le
   texte n'a pas bougé. Le sportif lui-même ou son coach lié. `followed` : true, false, ou null pour
   revenir à ce que dit le texte. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const { sessionId, followed } = await req.json().catch(() => ({}));
  if (typeof sessionId !== "string" || !(followed === true || followed === false || followed === null)) return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  const admin = createAdminClient();
  const { data: s, error } = await admin.from("sessions").select("user_id").eq("id", sessionId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!s) return Response.json({ error: "Séance introuvable" }, { status: 404 });
  if (s.user_id !== user.id) {
    const { data: link } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", s.user_id).limit(1).maybeSingle();
    if (!link) return Response.json({ error: "Séance introuvable" }, { status: 404 });
  }
  const { error: upErr } = await admin.from("sessions").update({ autoreg_followed: followed }).eq("id", sessionId);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  return Response.json({ ok: true, followed });
}
