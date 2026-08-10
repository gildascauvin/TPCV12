import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAthletesSignatures } from "@/lib/athletesData";
import type { CoachAthlete } from "@/types";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date requise" }, { status: 400 });

  const { data: rawAthletes } = await supabase
    .from("coach_athletes")
    .select("*")
    .eq("coach_id", user.id);

  const athletes = (rawAthletes || []) as CoachAthlete[];
  const admin = createAdminClient();
  const { signatures, trends, trendInsights } = await getAthletesSignatures(admin, athletes, date);

  return Response.json({ signatures, trends, trendInsights });
}
