import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConseilsData, computeConseilsData, CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import { chargeByDay } from "@/lib/metricCards";
import { analyticsReady } from "@/lib/demoAnalytics";
import type { Session } from "@/types";

/* Charge jour par jour pour l'anneau des jours de repos du Planning (06/11). Sans athleteId : le sportif
   connecté ; avec : un sportif du coach (même garde que /api/coach/session-history). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const athleteId = searchParams.get("athleteId");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date requise" }, { status: 400 });

  if (!athleteId) {
    const data = await getConseilsData(supabase, user.id, date);
    return Response.json({ ok: true, days: chargeByDay(data, analyticsReady(data, "charge")) });
  }

  const { data: athlete } = await supabase.from("coach_athletes").select("id, user_id, coach_id")
    .eq("id", athleteId).eq("coach_id", user.id).single();
  if (!athlete) return Response.json({ error: "Sportif introuvable" }, { status: 404 });
  const admin = createAdminClient();
  const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - CONSEILS_HISTORY_DAYS);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data: rows, error } = athlete.user_id
    ? await admin.from("sessions").select("*").eq("user_id", athlete.user_id).gte("date", sinceStr).lte("date", date)
    : await admin.from("coach_sessions").select("*").eq("athlete_id", athlete.id).gte("date", sinceStr).lte("date", date);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const data = computeConseilsData(date, null, (rows ?? []) as unknown as Session[], [], "coach");
  return Response.json({ ok: true, days: chargeByDay(data, analyticsReady(data, "charge")) });
}
