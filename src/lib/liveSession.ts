import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/types";
import { applyPendingPatches, isOffline, recallLive, rememberLive, updateOwnSession } from "@/lib/offlineSessions";
import { readOfflineQueue } from "@/lib/offlineStore";

/* Séance en direct (2026-10-02, POC seance-live) : chrono stocké en base (sessions.started_at,
   paused_at, paused_ms — migration 029) pour survivre au rechargement, à la fermeture de l'app et
   passer d'un appareil à l'autre. Une séance est "en cours" tant que started_at est posé et qu'elle
   n'est pas terminée. Une seule à la fois par sportif. */

export const OPEN_LIVE_SESSION = "tpc-open-live-session";
export const LIVE_SESSION_CHANGED = "tpc-live-session-changed";
/* Au-delà, on suppose un oubli : Terminer propose une durée à corriger plutôt que de compter la nuit. */
export const LIVE_MAX_MS = 3 * 60 * 60 * 1000;

type LiveFields = Pick<Session, "started_at" | "paused_at" | "paused_ms" | "done">;

export function isLive(s: LiveFields | null | undefined): boolean {
  return !!s?.started_at && !s.done;
}

export function liveElapsedMs(s: LiveFields, now: number = Date.now()): number {
  if (!s.started_at) return 0;
  const end = s.paused_at ? new Date(s.paused_at).getTime() : now;
  return Math.max(0, end - new Date(s.started_at).getTime() - (s.paused_ms ?? 0));
}

export function formatChrono(ms: number): string {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/* Durée à proposer dans Terminer : chrono arrondi à la minute, pauses déduites ; null si la séance
   n'a pas été démarrée ou si le chrono dépasse LIVE_MAX_MS (oubli probable). */
export function chronoMinutes(s: LiveFields): number | null {
  if (!s.started_at) return null;
  const ms = liveElapsedMs(s);
  if (ms > LIVE_MAX_MS) return null;
  return Math.max(1, Math.round(ms / 60000));
}

export function notifyLiveChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIVE_SESSION_CHANGED));
}
export function openLiveSession(id: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_LIVE_SESSION, { detail: { id } }));
}

/* Hors ligne (2026-10-02) : la séance en cours est aussi gardée sur l'appareil (rememberLive) ;
   sans réseau, on la relit là, et démarrer / pause passent par la file d'attente (updateOwnSession). */
export async function fetchLiveSession(supabase: SupabaseClient, userId: string): Promise<Session | null> {
  if (isOffline()) return recallLive();
  const { data, error } = await supabase.from("sessions").select("*")
    .eq("user_id", userId).eq("done", false).not("started_at", "is", null)
    .order("started_at", { ascending: false }).limit(1);
  if (error) { console.error("[live] lecture", error); return recallLive(); }
  const live = (data?.[0] as Session) ?? null;
  // Des modifications encore en attente (faites hors ligne) priment sur la base tant qu'elles ne sont pas envoyées.
  const local = recallLive();
  if (!live) {
    // Séance démarrée hors ligne dont le démarrage n'est pas encore envoyé : on la garde ; sinon la
    // copie locale est périmée (terminée ou annulée ailleurs).
    const pending = local && (await readOfflineQueue()).some(a => a.type === "patch" && a.sessionId === local.id);
    if (pending) return local;
    rememberLive(null);
    return null;
  }
  const [merged] = await applyPendingPatches([live]);
  const result = merged.started_at && !merged.done ? merged : null;
  rememberLive(result);
  return result;
}

/* Démarre la séance (ou rouvre celle déjà en cours : une seule à la fois). Renvoie la séance live. */
export async function startLiveSession(supabase: SupabaseClient, session: Session): Promise<Session | null> {
  const current = await fetchLiveSession(supabase, session.user_id);
  if (current) return current;
  const started = await updateOwnSession(supabase, session, { started_at: new Date().toISOString(), paused_at: null, paused_ms: 0 });
  if (!started) return null;
  rememberLive(started);
  notifyLiveChanged();
  return started;
}

export async function togglePauseLiveSession(supabase: SupabaseClient, s: Session): Promise<Session | null> {
  const patch = s.paused_at
    ? { paused_at: null, paused_ms: (s.paused_ms ?? 0) + (Date.now() - new Date(s.paused_at).getTime()) }
    : { paused_at: new Date().toISOString() };
  const updated = await updateOwnSession(supabase, s, patch);
  if (!updated) return null;
  rememberLive(updated);
  notifyLiveChanged();
  return updated;
}
