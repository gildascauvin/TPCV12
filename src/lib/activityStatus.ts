"use client";

import { useEffect, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { ONBOARDING_REFRESH } from "@/lib/onboardingProgress";

/* Pilule d'activité du header (2026-10-03). Même mécanique que onboardingProgress.ts : un cache
   module, un fetch par page, rafraîchi au retour sur l'onglet et après chaque écriture (les handlers
   qui créent/suppriment une séance appellent déjà notifyOnboardingProgress → ONBOARDING_REFRESH). */

export interface ActivitySubject {
  id: string;
  name: string;
  /** Au moins une séance prévue à venir (aujourd'hui compris, pas encore faite). */
  active: boolean;
  /** Libellé court du sport (sportShortLabel), 9 caractères max. */
  label: string;
  emoji: string;
  program: { id: string; name: string; week: number; weeks: number } | null;
  weekDone: number;
  weekTotal: number;
  next: { date: string; name: string } | null;
}
export interface ActivityStatus { role: "athlete" | "coach"; self: ActivitySubject | null; athletes: ActivitySubject[] }

let current: ActivityStatus | null = null;
let lastFetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function refreshActivityStatus(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch(`/api/activity/status?today=${format(new Date(), "yyyy-MM-dd")}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((d: ActivityStatus | null) => { if (d && Array.isArray(d.athletes)) { current = d; lastFetchedAt = Date.now(); listeners.forEach(l => l()); } })
    .catch(() => {})
    .finally(() => { inflight = null; });
  return inflight;
}

/** Relit seulement si la dernière lecture date de plus de `maxAgeMs` (navigation entre pages). */
export function refreshActivityStatusIfStale(maxAgeMs: number): Promise<void> | void {
  if (Date.now() - lastFetchedAt < maxAgeMs) return;
  return refreshActivityStatus();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** `enabled=false` (sandbox) : jamais de fetch, toujours null. */
export function useActivityStatus(enabled = true): ActivityStatus | null {
  const value = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (!enabled) return;
    if (!current) refreshActivityStatus();
    const refresh = () => { refreshActivityStatus(); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener(ONBOARDING_REFRESH, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ONBOARDING_REFRESH, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return enabled ? value : null;
}
