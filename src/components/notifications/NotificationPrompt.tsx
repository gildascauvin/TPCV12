"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { notificationSupport, notificationsEnabled, enableNotifications } from "@/lib/notifications";
import { HourSelect } from "@/components/profile/NotificationToggle";

/* Demande d'activation des notifications avec une promesse concrète (2026-10-14). Sportif : affichée
   une fois le point forme du jour fait (« demain à 8h, ta séance ajustée »). Coach : dès qu'il a au moins
   un sportif. Jamais si non disponible, déjà activé, ou fermé il y a moins de 14 jours. */

const SNOOZE_DAYS = 14;
const key = (userId: string) => `tpc_notif_prompt_${userId}`;

export default function NotificationPrompt({ userId, role, show = true }: { userId: string; role: "athlete" | "coach"; show?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [hour, setHour] = useState(8);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!show) return;
    const s = notificationSupport();
    if (s !== "native" && s !== "web") return;
    try {
      const at = Number(localStorage.getItem(key(userId)) || 0);
      if (at && Date.now() - at < SNOOZE_DAYS * 86_400_000) return;
    } catch { /* stockage bloqué : on affiche */ }
    notificationsEnabled().then((on) => {
      if (on) return;
      setVisible(true);
      posthog.capture("notif_prompt_viewed", { role });
    }).catch(() => {});
  }, [userId, role, show]);

  if (!visible) return null;

  function snooze() {
    try { localStorage.setItem(key(userId), String(Date.now())); } catch { /* ignore */ }
    posthog.capture("notif_prompt_dismissed", { role });
    setVisible(false);
  }

  async function enable() {
    setBusy(true);
    const ok = await enableNotifications(hour);
    setBusy(false);
    posthog.capture("notif_prompt_enabled", { role, ok, hour });
    if (ok) setVisible(false);
    else setDenied(true);
  }

  const title = role === "coach" ? "Sois prévenu quand un sportif a besoin de toi" : `Demain à ${hour}h, ta séance ajustée à ta forme`;
  const body = role === "coach"
    ? "Une alerte dès qu'un sportif est en récup fragile avant une séance dure, et un résumé chaque matin."
    : "Un rappel chaque matin pour ton point forme : ta séance s'ajuste à ta réponse.";

  return (
    <div style={{ borderRadius: 16, padding: "14px 15px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", margin: "0 0 16px" }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#fff", lineHeight: 1.35 }}>🔔 {title}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", marginTop: 4, lineHeight: 1.45 }}>{body}</div>
      {denied ? (
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", marginTop: 10 }}>
          Notifications refusées. Tu peux les autoriser dans les réglages de ton téléphone, puis dans ton profil.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <HourSelect value={hour} onChange={setHour} dark />
          <button onClick={enable} disabled={busy} style={{ flex: 1, minWidth: 120, height: 40, borderRadius: 12, border: "none", background: "#d44000", color: "#fff", fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "..." : "Me prévenir"}
          </button>
          <button onClick={snooze} style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "none", background: "transparent", color: "rgba(255,255,255,.6)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Plus tard
          </button>
        </div>
      )}
    </div>
  );
}
