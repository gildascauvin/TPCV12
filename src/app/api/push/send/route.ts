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

/* Relance "essai non démarré" — jusqu'à 3 touches par compte (≈ H+4 / J+1 / J+3 en esprit),
   espacées d'au moins 18h. Basé sur un compteur + dernier envoi plutôt que des fenêtres
   d'heures fixes : le cron Hobby ne tourne qu'1x/jour, une fenêtre étroite type "H+4 à H+5"
   raterait la plupart des comptes selon l'heure de leur inscription. */
async function runWinback(admin: Admin): Promise<number> {
  const now = Date.now();
  const fourHoursAgo = new Date(now - 4 * 3600_000).toISOString();
  const eighteenHoursAgo = new Date(now - 18 * 3600_000).toISOString();

  const { data: candidates } = await admin
    .from("profiles")
    .select("user_id, mode, created_at, last_winback_push_at, winback_push_count")
    .eq("subscription_status", "free")
    .lt("created_at", fourHoursAgo)
    .or(`winback_push_count.is.null,winback_push_count.lt.3`);

  let sent = 0;
  for (const p of candidates ?? []) {
    if (p.last_winback_push_at && p.last_winback_push_at > eighteenHoursAgo) continue;
    const payload: Payload = p.mode === "coach"
      ? { title: "Tes sportifs t'attendent", body: "Invite-les en 1 clic pour démarrer.", url: "/coach", tag: "winback" }
      : { title: "Ta séance t'attend 💪", body: "Reprends là où tu t'es arrêté, ton programme est prêt.", url: "/today", tag: "winback" };
    const delivered = await sendToUser(admin, p.user_id, payload);
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

/* Rappel séance du jour — sportifs ayant opté in sur l'écran wellness_reveal de l'onboarding */
async function runSessionReminder(admin: Admin): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const { data: sessionOptins } = await admin.from("push_subscriptions").select("user_id").eq("reminder_type", "session");
  const uids = Array.from(new Set((sessionOptins ?? []).map(s => s.user_id)));

  let sent = 0;
  for (const uid of uids) {
    const { data: todaysSessions } = await admin.from("sessions").select("id, done").eq("user_id", uid).eq("date", today);
    const hasUndone = (todaysSessions ?? []).some(s => !s.done);
    if (hasUndone) {
      const delivered = await sendToUser(admin, uid, { title: "Ta séance du jour t'attend 💪", body: "2 minutes pour démarrer.", url: "/today", tag: "session-reminder" });
      if (delivered) sent++;
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

  const winbackSent = job === "winback" || !job ? await runWinback(admin) : 0;
  const sessionSent = job === "session" || !job ? await runSessionReminder(admin) : 0;

  return Response.json({ ok: true, winbackSent, sessionSent });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
