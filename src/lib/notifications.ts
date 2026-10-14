"use client";

import { Capacitor } from "@capacitor/core";
import { isPushSupported, needsInstallForPush, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

/* Notifications, un seul point d'entrée pour l'app iOS (APNs, @capacitor/push-notifications) et le
   web (web push) (2026-10-14). L'app iOS publiée avant le build 1.1 n'a pas le plugin :
   `Capacitor.isPluginAvailable` le détecte et on retombe alors sur "non disponible", jamais un crash. */

export type NotifSupport = "native" | "web" | "install-needed" | "unsupported";

export function notificationSupport(): NotifSupport {
  if (typeof window === "undefined") return "unsupported";
  if (Capacitor.isNativePlatform()) return Capacitor.isPluginAvailable("PushNotifications") ? "native" : "unsupported";
  if (!isPushSupported()) return "unsupported";
  if (needsInstallForPush()) return "install-needed";
  return "web";
}

const localTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Paris"; }
};

async function postApnsToken(token: string, hour?: number) {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apnsToken: token, hour, tz: localTz() }),
  });
}

/* Enregistre l'appareil auprès d'Apple et renvoie le jeton (ou null en cas d'échec / délai). */
async function registerNative(): Promise<string | null> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return new Promise((resolve) => {
    let done = false;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const finish = (t: string | null) => {
      if (done) return;
      done = true;
      handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      resolve(t);
    };
    handles.push(PushNotifications.addListener("registration", (t) => finish(t.value)));
    handles.push(PushNotifications.addListener("registrationError", () => finish(null)));
    PushNotifications.register().catch(() => finish(null));
    setTimeout(() => finish(null), 10_000);
  });
}

export async function notificationsEnabled(): Promise<boolean> {
  const s = notificationSupport();
  if (s === "native") {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const p = await PushNotifications.checkPermissions().catch(() => null);
    return p?.receive === "granted";
  }
  if (s === "web") return isSubscribedToPush();
  return false;
}

/* Demande la permission (boîte native) et enregistre l'appareil. `hour` = heure locale du rappel du
   matin, enregistrée sur le profil. Vrai si les notifs sont actives à la fin. */
export async function enableNotifications(hour?: number): Promise<boolean> {
  const s = notificationSupport();
  if (s === "native") {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return false;
      const token = await registerNative();
      if (!token) return false;
      await postApnsToken(token, hour);
      return true;
    } catch {
      return false;
    }
  }
  if (s === "web") return subscribeToPush(hour, localTz());
  return false;
}

export async function disableNotifications(): Promise<boolean> {
  const s = notificationSupport();
  if (s === "native") {
    // iOS ne laisse pas une app retirer sa propre permission : on supprime le jeton côté serveur.
    try {
      const token = await registerNative();
      if (token) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: token }) });
      }
      return true;
    } catch {
      return false;
    }
  }
  if (s === "web") return unsubscribeFromPush();
  return false;
}

/* À l'ouverture de l'app : le jeton APNs peut changer (réinstallation, restauration) ; s'il y a déjà
   la permission, on le renvoie au serveur. Et un tap sur une notif ouvre la bonne page. */
let listening = false;
export async function initNativeNotifications(navigate: (url: string) => void) {
  if (listening || notificationSupport() !== "native") return;
  listening = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const url = (a.notification.data as { url?: string } | undefined)?.url;
    if (url && url.startsWith("/")) navigate(url);
  });
  const perm = await PushNotifications.checkPermissions().catch(() => null);
  if (perm?.receive === "granted") {
    const token = await registerNative();
    if (token) postApnsToken(token).catch(() => {});
  }
}
