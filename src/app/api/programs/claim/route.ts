import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { programId } = await req.json();
  if (!programId) return Response.json({ error: "programId requis" }, { status: 400 });

  const admin = createAdminClient();
  const { data: source } = await admin
    .from("programs")
    .select("name, sport, level, focus, weeks_count, sessions_per_week, template")
    .eq("id", programId)
    .eq("is_public", true)
    .maybeSingle();

  if (!source) return Response.json({ error: "Programme introuvable ou non public" }, { status: 404 });

  const { data: copy, error } = await supabase
    .from("programs")
    .insert({
      owner_id: user.id,
      name: source.name,
      sport: source.sport,
      level: source.level,
      focus: source.focus,
      weeks_count: source.weeks_count,
      sessions_per_week: source.sessions_per_week,
      template: source.template,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ programId: copy.id });
}
