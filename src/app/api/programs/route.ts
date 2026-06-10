import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const [programsRes, assignmentsRes] = await Promise.all([
    supabase.from("programs").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("program_assignments").select("*").eq("coach_id", user.id).eq("status", "active"),
  ]);

  if (programsRes.error) return Response.json({ error: programsRes.error.message }, { status: 500 });
  return Response.json({ programs: programsRes.data, assignments: assignmentsRes.data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { name, sport, level, focus, weeks_count, sessions_per_week, template } = body;

  if (!name || !template) return Response.json({ error: "Champs manquants" }, { status: 400 });

  const { data, error } = await supabase
    .from("programs")
    .insert({ owner_id: user.id, name, sport, level, focus, weeks_count, sessions_per_week, template })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ program: data }, { status: 201 });
}
