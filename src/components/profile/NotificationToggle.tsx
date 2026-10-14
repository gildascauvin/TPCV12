"use client";

import { useEffect, useState } from "react";
import { notificationSupport, notificationsEnabled, enableNotifications, disableNotifications, type NotifSupport } from "@/lib/notifications";

/* Notifications dans le profil (2026-07-13, app iOS le 2026-10-14) : ON/OFF par appareil + heure du
   rappel du matin. Web push dans un navigateur, APNs dans l'app iPhone. */
export default function NotificationToggle({ role = "athlete", initialHour = 8 }: { role?: "athlete" | "coach"; initialHour?: number }) {
  const [support, setSupport] = useState<NotifSupport | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hour, setHour] = useState(initialHour);

  useEffect(() => {
    const s = notificationSupport();
    setSupport(s);
    if (s === "native" || s === "web") notificationsEnabled().then(setOn).catch(() => {});
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    if (on) setOn(!(await disableNotifications()));
    else setOn(await enableNotifications(hour));
    setBusy(false);
  }

  async function changeHour(h: number) {
    setHour(h);
    if (on) await enableNotifications(h);
  }

  const usable = support === "native" || support === "web";
  const desc = role === "coach"
    ? "Alerte quand un sportif a besoin de toi, résumé chaque matin"
    : "Rappel du check-in chaque matin, séance ajustée à ta forme";

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: "16px 16px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, color: "#171b1f" }}>🔔 Notifications</div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>
            {support === null && "Vérification…"}
            {support === "unsupported" && "Non disponible sur cet appareil"}
            {support === "install-needed" && "Ajoute ThePerfClub à ton écran d'accueil pour les activer"}
            {usable && desc}
          </div>
        </div>
        {usable && (
          <button
            onClick={toggle}
            disabled={busy}
            aria-label="Activer ou désactiver les notifications"
            style={{
              width: 46, height: 28, borderRadius: 999, border: "none", flexShrink: 0, cursor: busy ? "default" : "pointer",
              padding: 3, background: on ? "#d44000" : "rgba(0,0,0,.12)", opacity: busy ? 0.6 : 1,
              transition: "background .2s", position: "relative",
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform .2s",
            }} />
          </button>
        )}
      </div>
      {usable && on && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,.06)" }}>
          <span style={{ fontSize: 13, color: "#3b4046" }}>Rappel du matin</span>
          <HourSelect value={hour} onChange={changeHour} />
        </div>
      )}
    </div>
  );
}

export function HourSelect({ value, onChange, dark = false }: { value: number; onChange: (h: number) => void; dark?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Heure du rappel du matin"
      style={{
        fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono), monospace", borderRadius: 12, padding: "6px 10px",
        border: dark ? "1px solid rgba(255,255,255,.18)" : "1px solid rgba(0,0,0,.12)",
        background: dark ? "rgba(255,255,255,.08)" : "#f7f8f9", color: dark ? "#fff" : "#171b1f",
      }}
    >
      {[5, 6, 7, 8, 9, 10, 11, 12].map((h) => <option key={h} value={h}>{h}h</option>)}
    </select>
  );
}
