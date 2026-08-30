import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { athleteId, monday, label } = await req.json();
  if (!athleteId || !monday) return Response.json({ error: "athleteId et monday requis" }, { status: 400 });

  const { data: athlete } = await supabase
    .from("coach_athletes")
    .select("id, user_id")
    .eq("id", athleteId)
    .eq("coach_id", user.id)
    .single();
  if (!athlete) return Response.json({ error: "Sportif introuvable" }, { status: 404 });

  const admin = createAdminClient();
  const value = label?.trim();
  const table = athlete.user_id ? "profiles" : "coach_athletes";
  const matchCol = athlete.user_id ? "user_id" : "id";
  const matchVal = athlete.user_id ?? athlete.id;

  const { data: row } = await admin.from(table).select("free_training_label").eq(matchCol, matchVal).single();
  const current = (row?.free_training_label as Record<string, string> | null) ?? {};
  const next = { ...current };
  if (value) next[monday] = value; else delete next[monday];

  const { error } = await admin.from(table).update({ free_training_label: next }).eq(matchCol, matchVal);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, labels: next });
}
