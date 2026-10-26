import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withDeviceScore } from "@/lib/deviceWellnessDb";

/* Check-in saisi par le coach pour un sportif inscrit (2026-10-26) : sportif en salle sans son
   téléphone, ou tablette du coach tendue au groupe. Même ligne wellness_daily que si le sportif
   l'avait fait lui-même (le coach ne peut pas l'écrire : RLS), donc client admin après vérification
   du lien, comme /api/coach/session. Sportifs sans compte : pas de wellness_daily possible, refusé. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { athleteId, date, data } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Date invalide" }, { status: 400 });
  if (!data || [data.sleep, data.stress, data.recovery, data.motivation].some(v => typeof v !== "number")) {
    return Response.json({ error: "Réponses incomplètes" }, { status: 400 });
  }

  const { data: link, error: linkErr } = await supabase
    .from("coach_athletes").select("user_id").eq("id", athleteId).eq("coach_id", user.id).maybeSingle();
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  if (!link?.user_id) return Response.json({ error: "Sportif introuvable ou sans compte" }, { status: 404 });

  const admin = createAdminClient();
  const row = {
    sleep: data.sleep, stress: data.stress, recovery: data.recovery, motivation: data.motivation,
    behaviors: Array.isArray(data.behaviors) ? data.behaviors : [],
    bedtime: data.bedtime ?? null, base_score: data.base_score, score: data.score,
  };
  // Montre du sportif (Apple Santé) intégrée au score comme dans son propre check-in.
  const payload = await withDeviceScore(admin, link.user_id, date, row);
  const { data: saved, error } = await admin
    .from("wellness_daily")
    .upsert({ user_id: link.user_id, date, ...payload }, { onConflict: "user_id,date" })
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, wellness: saved });
}
