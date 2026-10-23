import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Fige la reco du matin sur la séance (migration 042, autoregPersonal.ts), que le sportif clique ou
   non. Écrite une seule fois par jour de séance : un check-in corrigé ensuite ne la réécrit pas
   (sinon le verdict du soir jugerait une reco que le sportif n'a jamais vue). Sportif seulement :
   c'est son check-in qui la produit. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { sessionId, proposal } = await req.json();
  if (typeof sessionId !== "string" || !proposal || typeof proposal !== "object") return Response.json({ error: "Paramètres manquants" }, { status: 400 });

  const admin = createAdminClient();
  const { data: s, error: readErr } = await admin.from("sessions").select("id, user_id, date, done, autoreg_proposal").eq("id", sessionId).maybeSingle();
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  if (!s || s.user_id !== user.id) return Response.json({ error: "Séance introuvable" }, { status: 404 });
  const existing = s.autoreg_proposal as { date?: string } | null;
  if (existing && existing.date === s.date) return Response.json({ ok: true, proposal: existing, frozen: true });
  if (s.done) return Response.json({ ok: true, skipped: "done" });

  const value = { ...proposal, date: s.date, recorded_at: new Date().toISOString() };
  const { error } = await admin.from("sessions").update({ autoreg_proposal: value }).eq("id", sessionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, proposal: value });
}
