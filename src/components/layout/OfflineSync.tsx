"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncOffline } from "@/lib/offlineStore";

/* Mode hors ligne (2026-10-02) : envoie les actions faites hors ligne puis enregistre l'instantané
   des 7 prochains jours sur l'appareil — à l'ouverture, au retour au premier plan et au retour du
   réseau. Si des actions ont été appliquées, la page se recharge pour les afficher. Web et app iOS. */
export default function OfflineSync() {
  const router = useRouter();
  useEffect(() => {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const applied = await syncOffline();
        if (applied > 0) router.refresh();
      } finally {
        running = false;
      }
    };
    run();
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", run);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", run);
    };
  }, [router]);
  return null;
}
