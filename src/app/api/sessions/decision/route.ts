import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Écrit (ou efface) la décision d'autorégulation d'une séance (migration 030). Une seule route pour
   les deux rôles : le serveur déduit qui décide (propriétaire de la séance = sportif, coach lié =
   coach) et pose `by`/`by_name`/`date`, jamais pris du client. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { sessionId, decision } = await req.json();
  if (typeof sessionId !== "string") return Response.json({ error: "sessionId manquant" }, { status: 400 });
  const admin = createAdminClient();

  let table: "sessions" | "coach_sessions" | null = null;
  let by: "athlete" | "coach" = "athlete";
  let date: string | null = null;

  const { data: s } = await admin.from("sessions").select("id, user_id, date").eq("id", sessionId).maybeSingle();
  if (s) {
    if (s.user_id === user.id) { table = "sessions"; by = "athlete"; }
    else {
      const { data: link } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", s.user_id).limit(1).maybeSingle();
      if (link) { table = "sessions"; by = "coach"; }
    }
    date = s.date;
  } else {
    const { data: cs } = await admin.from("coach_sessions").select("id, coach_id, date").eq("id", sessionId).maybeSingle();
    if (cs && cs.coach_id === user.id) { table = "coach_sessions"; by = "coach"; date = cs.date; }
  }
  if (!table) return Response.json({ error: "Séance introuvable" }, { status: 404 });

  let value: Record<string, unknown> | null = null;
  if (decision && typeof decision === "object") {
    const { data: prof } = await admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle();
    value = { ...decision, by, by_name: prof?.name ?? null, date, decided_at: new Date().toISOString() };
  }
  const { error } = await admin.from(table).update({ autoreg_decision: value }).eq("id", sessionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, decision: value });
}
