"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ONBOARDING_REFRESH } from "@/lib/onboardingProgress";
import type { DayKind, Reward } from "@/lib/streak";

/* Série du jour côté client (P1, 24/11/2026) : une source, GET /api/streak, partagée par la puce du
   header et la page « série » du mini bilan. Rafraîchie au montage, au retour sur l'onglet et après
   chaque action qui peut valider la journée (même événement que la checklist : ONBOARDING_REFRESH). */

export interface StreakPayload {
  enabled: boolean;
  today?: string;
  current: number;
  record: number;
  saved: number;
  todayState: { checkin: boolean; planned: boolean; done: boolean; validated: boolean; kind: DayKind };
  week: { date: string; kind: DayKind; validated: boolean }[];
  rewards: Reward[];
  next: Reward | null;
}

let current: StreakPayload | null = null;
let inflight: Promise<StreakPayload | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function refreshStreak(): Promise<StreakPayload | null> {
  if (inflight) return inflight;
  inflight = fetch(`/api/streak?today=${localToday()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((d: StreakPayload | null) => { if (d && typeof d.enabled === "boolean") { current = d; emit(); } return current; })
    .catch(() => current)
    .finally(() => { inflight = null; });
  return inflight;
}

export function useStreak(enabled = true): StreakPayload | null {
  const value = useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current, () => null,
  );
  useEffect(() => {
    if (!enabled) return;
    if (!current) refreshStreak();
    const on = () => { refreshStreak(); };
    const vis = () => { if (document.visibilityState === "visible") refreshStreak(); };
    window.addEventListener(ONBOARDING_REFRESH, on);
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener(ONBOARDING_REFRESH, on); document.removeEventListener("visibilitychange", vis); };
  }, [enabled]);
  return enabled ? value : null;
}

/* Récompenses déjà montrées (révélation une seule fois par récompense, mémoire de l'appareil). Au tout
   premier passage, celles déjà gagnées sont marquées vues sans être révélées (pas de rafale). */
const SEEN_KEY = "tpc_rewards_seen";
export function unseenRewards(s: StreakPayload | null): StreakPayload["rewards"] {
  if (!s?.enabled) return [];
  let seen: string[] | null = null;
  try { const raw = localStorage.getItem(SEEN_KEY); seen = raw ? JSON.parse(raw) : null; } catch { /* stockage indisponible */ }
  if (seen === null) { markRewardsSeen(s.rewards.filter(r => r.earned).map(r => r.key)); return []; }
  return s.rewards.filter(r => r.earned && !seen!.includes(r.key));
}
export function markRewardsSeen(keys: string[]) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const seen = new Set<string>(raw ? JSON.parse(raw) : []);
    keys.forEach(k => seen.add(k));
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch { /* idem */ }
}
