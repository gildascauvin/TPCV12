import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOnce } from "@/lib/pushSend";
import { computeAutoregSuggestion, qualitativeDifficulty } from "@/lib/autoregulation";
import { computeWellnessBaselineAt } from "@/lib/wellnessBaseline";

/* Notifications déclenchées par une action du sportif (2026-10-14).
   checkin : dès qu'un sportif lié valide son check-in, si le moteur d'autorégulation recommande
   d'alléger sa séance du jour (même calcul que Coach Control), son coach est prévenu tout de suite. */
export async function POST(req: Request) {
  const { type, date } = await req.json().catch(() => ({}));
  if (type !== "checkin" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { data: links } = await admin.from("coach_athletes").select("coach_id, name").eq("user_id", user.id);
  if (!links?.length) return Response.json({ ok: true, sent: 0 });

  const since = new Date(date + "T12:00:00Z"); since.setUTCDate(since.getUTCDate() - 42);
  const [{ data: rows }, { data: sessions }] = await Promise.all([
    admin.from("wellness_daily")
      .select("date, score, base_score, sleep, stress, recovery, motivation, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline")
      .eq("user_id", user.id).gte("date", since.toISOString().slice(0, 10)).lte("date", date),
    admin.from("sessions").select("target_difficulty, done").eq("user_id", user.id).eq("date", date),
  ]);
  const today = (rows ?? []).find((r) => r.date === date);
  const hardest = (sessions ?? []).filter((s) => !s.done).reduce((m, s) => Math.max(m, s.target_difficulty ?? 0), 0);
  if (!today || !hardest) return Response.json({ ok: true, sent: 0 });

  const baseline = computeWellnessBaselineAt((rows ?? []).filter((r) => r.date < date), today);
  const score = baseline?.hasEnoughHistory ? baseline.relativeScore : (today.score ?? today.base_score ?? null);
  const sug = computeAutoregSuggestion(score, hardest, baseline);
  if (sug?.dir !== "low") return Response.json({ ok: true, sent: 0 });

  let sent = 0;
  for (const l of links) {
    const first = (l.name ?? "").trim().split(/\s+/)[0] || "Un sportif";
    const ok = await sendOnce(admin, l.coach_id, "recovery_alert", `${user.id}:${date}`, {
      title: `${first} : récup fragile, séance ${qualitativeDifficulty(hardest)} prévue`,
      body: "ThePerfClub recommande d'alléger. Tu valides ?",
      url: "/coach",
      tag: `recovery-${user.id}`,
    }).catch(() => false);
    if (ok) sent++;
  }
  return Response.json({ ok: true, sent });
}
