import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendApns, apnsConfigured } from "@/lib/apns";
import { sendFcm, fcmConfigured } from "@/lib/fcm";

/* Envoi d'une notification à un utilisateur, tous appareils confondus (2026-10-14) : web push (PWA,
   navigateur), APNs (app iOS) et Firebase (app Android). Serveur uniquement, client admin. Les jetons morts sont supprimés. */

export type PushPayload = { title: string; body: string; url: string; tag: string };

let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  if (!process.env.VAPID_SUBJECT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  // Dans le handler, jamais au niveau module : le build Next.js n'a pas les variables (voir push/send).
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export async function sendToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<boolean> {
  const { data: subs, error } = await admin.from("push_subscriptions").select("id, kind, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) { console.error("[push] lecture abonnements", error); return false; }
  if (!subs?.length) return false;
  let delivered = false;
  await Promise.all(subs.map(async (sub) => {
    if (sub.kind === "apns") {
      if (!apnsConfigured()) return;
      const r = await sendApns(sub.endpoint, payload);
      if (r === "ok") delivered = true;
      if (r === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
      return;
    }
    if (sub.kind === "fcm") {
      if (!fcmConfigured()) return;
      const r = await sendFcm(sub.endpoint, payload);
      if (r === "ok") delivered = true;
      if (r === "gone") await admin.from("push_subscriptions").delete().eq("id", sub.id);
      return;
    }
    if (!ensureVapid() || !sub.p256dh || !sub.auth) return;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
      delivered = true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }));
  return delivered;
}

/* Réserve une notif (user, type, clé) AVANT l'envoi : le passage horaire peut tourner plusieurs fois
   ou en parallèle sans jamais envoyer deux fois. Faux = déjà envoyée. */
export async function claimPush(admin: SupabaseClient, userId: string, kind: string, ref: string): Promise<boolean> {
  const { error } = await admin.from("push_log").insert({ user_id: userId, kind, ref });
  if (!error) return true;
  if (error.code !== "23505") console.error("[push] réservation", kind, error);
  return false;
}

export async function releasePush(admin: SupabaseClient, userId: string, kind: string, ref: string) {
  await admin.from("push_log").delete().eq("user_id", userId).eq("kind", kind).eq("ref", ref);
}

/* Envoi unique par clé : réservation, envoi, et libération si rien n'est parti (pas d'appareil
   abonné, échec) pour qu'un appareil abonné plus tard reçoive quand même la prochaine occasion. */
export async function sendOnce(admin: SupabaseClient, userId: string, kind: string, ref: string, payload: PushPayload): Promise<boolean> {
  if (!(await claimPush(admin, userId, kind, ref))) return false;
  const ok = await sendToUser(admin, userId, payload);
  if (!ok) await releasePush(admin, userId, kind, ref);
  return ok;
}

/* Notifs "programme mis à jour par le coach" : une au plus toutes les 6 h par sportif, même si le
   coach enchaîne les modifications (regroupées en une seule). */
export async function notifyCoachUpdate(admin: SupabaseClient, athleteUserId: string, coachName: string | null) {
  const slot = Math.floor(Date.now() / (6 * 3600_000));
  const who = coachName?.trim().split(/\s+/)[0] || "Ton coach";
  await sendOnce(admin, athleteUserId, "coach_update", String(slot), {
    title: `${who} a mis à jour ton programme`,
    body: "Jette un œil à tes prochaines séances.",
    url: "/week",
    tag: "coach-update",
  }).catch((e) => console.error("[push] coach_update", e));
}

export async function notifyAthleteJoined(admin: SupabaseClient, coachId: string, athleteUserId: string, athleteName: string | null) {
  const first = athleteName?.trim().split(/\s+/)[0] || "Un sportif";
  await sendOnce(admin, coachId, "athlete_joined", athleteUserId, {
    title: `${first} a rejoint ton équipe`,
    body: "Sa forme et ses séances arrivent dans ton Coach Control.",
    url: "/coach",
    tag: "athlete-joined",
  }).catch((e) => console.error("[push] athlete_joined", e));
}
