import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/types";

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

export async function fetchLiveSession(supabase: SupabaseClient, userId: string): Promise<Session | null> {
  const { data, error } = await supabase.from("sessions").select("*")
    .eq("user_id", userId).eq("done", false).not("started_at", "is", null)
    .order("started_at", { ascending: false }).limit(1);
  if (error) { console.error("[live] lecture", error); return null; }
  return (data?.[0] as Session) ?? null;
}

/* Démarre la séance (ou rouvre celle déjà en cours : une seule à la fois). Renvoie la séance live. */
export async function startLiveSession(supabase: SupabaseClient, session: Session): Promise<Session | null> {
  const current = await fetchLiveSession(supabase, session.user_id);
  if (current) return current;
  const { data, error } = await supabase.from("sessions")
    .update({ started_at: new Date().toISOString(), paused_at: null, paused_ms: 0 })
    .eq("id", session.id).select().single();
  if (error) { console.error("[live] démarrage", error); return null; }
  notifyLiveChanged();
  return data as Session;
}

export async function togglePauseLiveSession(supabase: SupabaseClient, s: Session): Promise<Session | null> {
  const patch = s.paused_at
    ? { paused_at: null, paused_ms: (s.paused_ms ?? 0) + (Date.now() - new Date(s.paused_at).getTime()) }
    : { paused_at: new Date().toISOString() };
  const { data, error } = await supabase.from("sessions").update(patch).eq("id", s.id).select().single();
  if (error) { console.error("[live] pause", error); return null; }
  notifyLiveChanged();
  return data as Session;
}
