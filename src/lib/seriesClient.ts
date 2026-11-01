import type { ChargeAdjust } from "@/lib/chargeAdjust";
import type { SessionState } from "@/lib/sessionSeries";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/* Appels à /api/sessions/series depuis le Planning sportif (athleteId absent) ou coach. */
export interface SeriesInfo { following: number; dates: string[]; lastDate: string | null; seriesId: string | null }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/sessions/series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Série : échec");
  return j as T;
}

export const seriesApi = (athleteId?: string) => ({
  info: (sessionId: string, afterDate?: string) => call<SeriesInfo>({ action: "info", athleteId, sessionId, afterDate }),
  repeat: <R>(sessionId: string, untilDate: string, step: ChargeAdjust) => call<{ created: R[]; seriesId: string }>({ action: "repeat", athleteId, sessionId, untilDate, step }),
  edit: <R>(sessionId: string, before: SessionState, after: SessionState, untilDate: string | null) => call<{ updated: R[] }>({ action: "edit", athleteId, sessionId, before, after, untilDate: untilDate ?? undefined }),
  move: <R>(sessionId: string, fromDate: string, toDate: string) => call<{ updated: R[] }>({ action: "move", athleteId, sessionId, fromDate, toDate }),
  remove: (sessionId: string) => call<{ deletedIds: string[] }>({ action: "delete", athleteId, sessionId }),
});

export const dayNameOf = (iso: string) => format(new Date(iso + "T12:00:00"), "EEEE", { locale: fr });
export const shortDate = (iso: string) => format(new Date(iso + "T12:00:00"), "d MMM", { locale: fr });

/** « ↻ Chaque lundi jusqu'au 30 nov. » */
export function seriesRowLabel(date: string, info: SeriesInfo | null): string | null {
  if (!info?.seriesId || !info.lastDate) return null;
  return `↻ Chaque ${dayNameOf(date)} jusqu'au ${shortDate(info.lastDate)}`;
}

/** Fin proposée pour « Répéter » : 4 semaines après la séance, ou après aujourd'hui si elle est passée. */
export function defaultRepeatUntil(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const base = date > today ? date : today;
  return new Date(new Date(base + "T12:00:00Z").getTime() + 28 * 86400000).toISOString().slice(0, 10);
}
