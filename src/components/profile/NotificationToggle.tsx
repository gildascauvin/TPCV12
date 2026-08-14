"use client";

import { useEffect, useState } from "react";
import { isPushSupported, needsInstallForPush, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export default function NotificationToggle() {
  const [status, setStatus] = useState<"checking" | "unsupported" | "install-needed" | "on" | "off">("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) { setStatus("unsupported"); return; }
      if (needsInstallForPush()) { setStatus("install-needed"); return; }
      const subscribed = await isSubscribedToPush();
      setStatus(subscribed ? "on" : "off");
    })();
  }, []);

  async function toggle() {
    if (busy || status === "checking" || status === "unsupported" || status === "install-needed") return;
    setBusy(true);
    if (status === "on") {
      const ok = await unsubscribeFromPush();
      if (ok) setStatus("off");
    } else {
      const ok = await subscribeToPush();
      setStatus(ok ? "on" : "off");
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: "16px 16px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#171b1f" }}>🔔 Notifications</div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>
            {status === "unsupported" && "Non disponible sur ce navigateur"}
            {status === "install-needed" && "Ajoute ThePerfClub à ton écran d'accueil pour les activer"}
            {status === "checking" && "Vérification…"}
            {status === "on" && "Rappels séance et récupération activés"}
            {status === "off" && "Reçois des rappels pour ta séance et ta récupération"}
          </div>
        </div>
        {(status === "on" || status === "off") && (
          <button
            onClick={toggle}
            disabled={busy}
            aria-label="Activer ou désactiver les notifications"
            style={{
              width: 46, height: 28, borderRadius: 999, border: "none", flexShrink: 0, cursor: busy ? "default" : "pointer",
              padding: 3, background: status === "on" ? "#d44000" : "rgba(0,0,0,.12)", opacity: busy ? 0.6 : 1,
              transition: "background .2s", position: "relative",
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              transform: status === "on" ? "translateX(18px)" : "translateX(0)", transition: "transform .2s",
            }} />
          </button>
        )}
      </div>
    </div>
  );
}
