import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date requise" }, { status: 400 });

  const { data: athletes } = await supabase
    .from("coach_athletes")
    .select("user_id")
    .eq("coach_id", user.id);

  const userIds = (athletes || []).map(a => a.user_id).filter((id): id is string => !!id);
  if (!userIds.length) return Response.json({ wellness: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("wellness_daily")
    .select("user_id, score, behaviors")
    .in("user_id", userIds)
    .eq("date", date);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ wellness: data ?? [] });
}
