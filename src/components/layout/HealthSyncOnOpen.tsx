"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { canSyncHealth, syncHealthData, HEALTH_SYNCED_EVENT } from "@/lib/healthSync";

/* Lance la synchro Apple Santé à l'ouverture de l'app iOS et à chaque retour au premier plan.
   Invisible et sans effet dans un navigateur. Après une synchro, les check-ins récents sont recalculés
   avec la montre (deviceWellnessDb.ts), puis la page se recharge. */
export default function HealthSyncOnOpen({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!canSyncHealth()) return;
    const supabase = createClient();
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const n = await syncHealthData(supabase, userId);
        // Scores de récupération recalculés côté base : les pages serveur doivent se recharger.
        if (n) { window.dispatchEvent(new CustomEvent(HEALTH_SYNCED_EVENT)); router.refresh(); }
      } catch (e) {
        console.error("[health-sync]", e);
      } finally {
        running = false;
      }
    };
    run();
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, router]);
  return null;
}
