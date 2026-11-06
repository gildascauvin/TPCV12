"use client";

import { useEffect, useState } from "react";

/* Charge jour par jour (0-1) pour l'anneau des jours de repos du Planning (06/11). Une lecture jusqu'à
   aujourd'hui couvre les ~100 jours passés ; relue quand `refreshKey` change (séance notée, déplacée…).
   athleteId : sportif d'un coach ; null = le sportif connecté. */
export function useChargeDays(enabled: boolean, today: string, refreshKey: string, athleteId: string | null = null): Record<string, number> {
  const [days, setDays] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) { setDays({}); return; }
    let live = true;
    const t = window.setTimeout(() => {
      fetch(`/api/charge-days?date=${today}${athleteId ? `&athleteId=${encodeURIComponent(athleteId)}` : ""}`)
        .then(r => (r.ok ? r.json() : null))
        .then(j => { if (live && j?.days) setDays(j.days); })
        .catch(() => {});
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
  }, [enabled, today, refreshKey, athleteId]);
  return days;
}
