import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/types";
import { enqueueOfflineAction, readOfflineQueue } from "@/lib/offlineStore";
import type { OfflineSessionPatch } from "@/lib/offlineTypes";

/* Vraie app hors ligne sur /today (2026-10-02) : la page est servie depuis le cache du service worker
   telle qu'à la dernière ouverture ; les écritures sur ses propres séances (démarrer / pause / terminer
   la séance en cours, Terminer, exercices modifiés) passent par updateOwnSession(). Avec réseau : écriture
   directe, comme avant. Sans réseau (ou requête qui échoue faute de réseau) : mise en file d'attente
   (envoyée par OfflineSync au retour du réseau) et séance à jour renvoyée tout de suite pour l'affichage. */

export const OFFLINE_QUEUED_EVENT = "tpc-offline-queued";
const LIVE_KEY = "tpc_offline_live";

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNetworkFailure(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? "").toLowerCase();
  return isOffline() || m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror") || m.includes("network request failed");
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function notifyQueued() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_QUEUED_EVENT));
}

/* Renvoie la séance à jour (écrite en base, ou mise en attente hors ligne), ou null si l'écriture a
   échoué pour une autre raison que le réseau (erreur déjà journalisée). */
export async function updateOwnSession(supabase: SupabaseClient, session: Session, patch: OfflineSessionPatch): Promise<Session | null> {
  if (!isOffline()) {
    const { data, error } = await supabase.from("sessions").update(patch).eq("id", session.id).select().single();
    if (!error) return data as Session;
    if (!isNetworkFailure(error)) { console.error("[sessions] écriture", error); return null; }
  }
  await enqueueOfflineAction({ id: newId(), type: "patch", at: new Date().toISOString(), sessionId: session.id, patch });
  notifyQueued();
  return { ...session, ...patch } as Session;
}

/* Rejoue sur des séances (données de la page en cache) les modifications encore en attente, pour que
   la page rouverte hors ligne montre l'état réel (séance démarrée, terminée...). */
export async function applyPendingPatches<T extends { id: string }>(sessions: T[]): Promise<T[]> {
  const queue = await readOfflineQueue();
  const patches = queue.filter(a => a.type === "patch");
  if (!patches.length) return sessions;
  return sessions.map(s => patches.reduce((acc, a) => (a.type === "patch" && a.sessionId === s.id ? { ...acc, ...a.patch } : acc), s));
}

/* Séance en cours gardée sur l'appareil : sans réseau, la barre "En cours" et l'écran de séance la
   relisent ici au lieu de la base. */
export function rememberLive(s: Session | null) {
  try {
    if (s && s.started_at && !s.done) localStorage.setItem(LIVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(LIVE_KEY);
  } catch { /* stockage indisponible : rien d'autre à faire */ }
}
export function recallLive(): Session | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s && s.started_at && !s.done ? s : null;
  } catch { return null; }
}
