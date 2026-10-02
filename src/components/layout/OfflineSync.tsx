"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readOfflineQueue, syncOffline } from "@/lib/offlineStore";
import { OFFLINE_QUEUED_EVENT } from "@/lib/offlineSessions";

/* Mode hors ligne (2026-10-02) : envoie les actions faites hors ligne puis enregistre l'instantané
   des 7 prochains jours sur l'appareil — à l'ouverture, au retour au premier plan et au retour du
   réseau. Si des actions ont été appliquées, la page se recharge pour les afficher. Web et app iOS.
   Affiche aussi un bandeau discret : "Hors ligne" et/ou le nombre d'actions en attente d'envoi. */
export default function OfflineSync() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let running = false;
    const countPending = async () => setPending((await readOfflineQueue()).length);
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const applied = await syncOffline();
        if (applied > 0) router.refresh();
      } finally {
        running = false;
        countPending();
      }
    };
    setOffline(navigator.onLine === false);
    run();
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    const onOnline = () => { setOffline(false); run(); };
    const onOffline = () => setOffline(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUED_EVENT, countPending);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUED_EVENT, countPending);
    };
  }, [router]);

  if (!offline && pending === 0) return null;
  const text = offline
    ? pending > 0 ? `Hors ligne · ${pending} action${pending > 1 ? "s" : ""} en attente d'envoi` : "Hors ligne · tu peux faire ta séance, tout sera envoyé au retour du réseau"
    : `${pending} action${pending > 1 ? "s" : ""} en attente d'envoi…`;
  return (
    <div style={{
      position: "fixed", top: "calc(env(safe-area-inset-top,0px) + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 2147483000,
      background: "rgba(20,20,22,.92)", color: "#fdba74", border: "1px solid rgba(253,186,116,.35)", borderRadius: 999,
      padding: "6px 14px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", maxWidth: "calc(100vw - 24px)", overflow: "hidden", textOverflow: "ellipsis",
      pointerEvents: "none",
    }}>
      ● {text}
    </div>
  );
}
