import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function daysBefore(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

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
  if (!userIds.length) return Response.json({ wellness: [], baselineHistory: {} });

  const admin = createAdminClient();
  /* Fenêtre 42j se terminant AU jour demandé (inclus) — sert à la fois à répondre `wellness` (le
     score/comportements du jour, usage historique de cette route) et à fournir `baselineHistory`
     (toutes les dimensions, groupées par sportif) pour que le client recalcule la baseline Z-score
     (computeWellnessBaselineAt, wellnessBaseline.ts) pour CE jour précis — pas seulement
     "aujourd'hui". Fix (2026-09) : /coach gardait jusqu'ici une baseline figée sur "aujourd'hui"
     (calculée une seule fois côté serveur au premier chargement) même en naviguant vers un jour
     passé — score/conseil faux dès qu'on regardait un autre jour que celui du chargement initial. */
  const since = daysBefore(date, 42);
  const { data, error } = await admin
    .from("wellness_daily")
    .select("*")
    .in("user_id", userIds)
    .gte("date", since)
    .lte("date", date);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const baselineHistory: Record<string, typeof rows> = {};
  for (const row of rows) {
    (baselineHistory[row.user_id] ??= []).push(row);
  }
  const wellness = rows.filter(r => r.date === date);

  return Response.json({ wellness, baselineHistory });
}
