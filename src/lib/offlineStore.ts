import { Capacitor } from "@capacitor/core";
import { format } from "date-fns";
import {
  OFFLINE_QUEUE_KEY, OFFLINE_SNAPSHOT_KEY,
  type OfflineAction, type OfflineFlushResult, type OfflineSnapshot,
} from "@/lib/offlineTypes";

/* Stockage hors ligne (2026-10-02). Web : localStorage (lu par public/offline.html, même origine).
   App iOS : stockage natif Capacitor Preferences — la page hors ligne embarquée dans l'app
   (capacitor-www/offline.html) a une autre origine que go.theperfclub.com et ne pourrait pas lire le
   localStorage du site ; Preferences est commun aux deux.
   Piège Capacitor : ne jamais renvoyer le plugin (Proxy) depuis une fonction async → déstructuré. */

async function getItem(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key })).value;
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

async function setItem(key: string, value: string) {
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    return;
  }
  try { localStorage.setItem(key, value); } catch { /* stockage plein ou bloqué : rien d'autre à faire */ }
}

async function readQueue(): Promise<OfflineAction[]> {
  try { return JSON.parse((await getItem(OFFLINE_QUEUE_KEY)) || "[]"); } catch { return []; }
}

/* Envoie les actions faites hors ligne. Retire de la file celles traitées ("ok") ou sans objet
   ("skipped"), garde les erreurs pour la prochaine tentative. Renvoie le nombre d'actions appliquées. */
export async function flushOfflineQueue(): Promise<number> {
  const queue = await readQueue();
  if (!queue.length) return 0;
  const res = await fetch("/api/offline/flush", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actions: queue }),
  });
  if (!res.ok) return 0;
  const { results } = (await res.json()) as { results: OfflineFlushResult[] };
  const done = new Set(results.filter(r => r.status !== "error").map(r => r.id));
  // Relit la file : une action a pu être ajoutée pendant l'envoi (page hors ligne d'un autre onglet).
  const latest = await readQueue();
  await setItem(OFFLINE_QUEUE_KEY, JSON.stringify(latest.filter(a => !done.has(a.id))));
  return results.filter(r => r.status === "ok").length;
}

export async function refreshOfflineSnapshot() {
  const today = format(new Date(), "yyyy-MM-dd");
  const res = await fetch(`/api/offline/snapshot?today=${today}`, { cache: "no-store" });
  if (!res.ok) return;
  const snapshot = (await res.json()) as OfflineSnapshot;
  await setItem(OFFLINE_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

/* À l'ouverture / retour au premier plan / retour du réseau : d'abord la file (pour que l'instantané
   rafraîchi reflète les séances terminées hors ligne), puis l'instantané. */
export async function syncOffline(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  const applied = await flushOfflineQueue().catch(e => { console.error("[offline] flush", e); return 0; });
  await refreshOfflineSnapshot().catch(e => console.error("[offline] snapshot", e));
  return applied;
}
