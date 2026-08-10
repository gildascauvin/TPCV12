import { createClient } from "@/lib/supabase/server";
import { getConseilsData } from "@/lib/conseilsData";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date requise" }, { status: 400 });

  const data = await getConseilsData(supabase, user.id, date);
  return Response.json(data);
}
