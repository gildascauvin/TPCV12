import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

type Admin = ReturnType<typeof createAdminClient>;
type Payload = { title: string; body: string; url: string; tag: string };

async function sendToUser(admin: Admin, userId: string, payload: Payload): Promise<boolean> {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs?.length) return false;
  let delivered = false;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      delivered = true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }));
  return delivered;
}

async function subscribedProfiles(admin: Admin, mode: "athlete" | "coach") {
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = Array.from(new Set((subs ?? []).map(s => s.user_id)));
  if (!userIds.length) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, mode, subscription_status, last_winback_push_at, winback_push_count")
    .eq("mode", mode)
    .in("user_id", userIds);
  return profiles ?? [];
}

/* 9h — sportif gratuit : rappel séance du jour si non terminée.
   sportif payant : rappel de remplir son wellness si pas encore fait aujourd'hui. */
async function runSessionJob(admin: Admin): Promise<{ session: number; wellness: number }> {
  const today = new Date().toISOString().split("T")[0];
  const athletes = await subscribedProfiles(admin, "athlete");

  let sessionSent = 0;
  let wellnessSent = 0;
  for (const p of athletes) {
    if (p.subscription_status === "free") {
      const { data: todaysSessions } = await admin.from("sessions").select("id, done").eq("user_id", p.user_id).eq("date", today);
      const hasUndone = (todaysSessions ?? []).some(s => !s.done);
      if (hasUndone) {
        const delivered = await sendToUser(admin, p.user_id, { title: "Ta séance du jour t'attend 💪", body: "2 minutes pour démarrer.", url: "/today", tag: "session-reminder" });
        if (delivered) sessionSent++;
      }
    } else if (p.subscription_status === "athlete") {
      const { data: wellnessToday } = await admin.from("wellness_daily").select("id").eq("user_id", p.user_id).eq("date", today).maybeSingle();
      if (!wellnessToday) {
        const delivered = await sendToUser(admin, p.user_id, { title: "Comment tu te sens aujourd'hui ?", body: "2 minutes pour ton bilan de forme du matin.", url: "/today", tag: "wellness-reminder" });
        if (delivered) wellnessSent++;
      }
    }
  }
  return { session: sessionSent, wellness: wellnessSent };
}

/* 20h — coach gratuit uniquement : relance pour inviter ses premiers sportifs.
   Jusqu'à 3 touches par compte, espacées d'au moins 18h (cron 2x/jour, pas de fenêtre d'heure fixe). */
async function runWinbackJob(admin: Admin): Promise<number> {
  const now = Date.now();
  const coaches = await subscribedProfiles(admin, "coach");

  let sent = 0;
  for (const p of coaches) {
    if (p.subscription_status !== "free") continue;
    if ((p.winback_push_count ?? 0) >= 3) continue;
    if (p.last_winback_push_at && new Date(p.last_winback_push_at).getTime() > now - 18 * 3600_000) continue;

    const delivered = await sendToUser(admin, p.user_id, {
      title: "Tes sportifs t'attendent",
      body: "Invite-les en 1 clic pour démarrer.",
      url: "/coach",
      tag: "winback",
    });
    if (delivered) {
      await admin.from("profiles").update({
        last_winback_push_at: new Date().toISOString(),
        winback_push_count: (p.winback_push_count ?? 0) + 1,
      }).eq("user_id", p.user_id);
      sent++;
    }
  }
  return sent;
}

async function handle(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const job = new URL(req.url).searchParams.get("job");

  const sessionResult = job === "session" || !job ? await runSessionJob(admin) : { session: 0, wellness: 0 };
  const winbackSent = job === "winback" || !job ? await runWinbackJob(admin) : 0;

  return Response.json({ ok: true, sessionSent: sessionResult.session, wellnessSent: sessionResult.wellness, winbackSent });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
