"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchDeviceInputs } from "@/lib/deviceWellnessDb";
import { deviceSummary } from "@/lib/deviceWellness";
import { HEALTH_SYNCED_EVENT } from "@/lib/healthDays";

/* Résumé montre d'un jour ("Nuit 5h40 · FC 4 bpm au-dessus de ta norme"), pour la carte décision avant
   le check-in (2026-09-30). Se relit après chaque synchro Apple Santé. null sans montre, et jamais
   chargé quand `enabled` est faux (check-in déjà fait, sandbox). */
export function useDeviceNote(userId: string, date: string, enabled: boolean): string | null {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setNote(null); return; }
    const supabase = createClient();
    let alive = true;
    const load = () => fetchDeviceInputs(supabase, userId, date).then(d => { if (alive) setNote(deviceSummary(d)); });
    load();
    window.addEventListener(HEALTH_SYNCED_EVENT, load);
    return () => { alive = false; window.removeEventListener(HEALTH_SYNCED_EVENT, load); };
  }, [userId, date, enabled]);
  return note;
}
