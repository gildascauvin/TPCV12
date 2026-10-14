"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { isIOS, isStandalone } from "@/lib/push";
import { APP_STORE_URL } from "@/lib/pwaInstall";

/* Bannière « Télécharger l'app » (2026-10-14) : la nôtre plutôt que la Smart App Banner d'Apple,
   qui ne s'affiche que dans Safari (ni Chrome iOS, ni le navigateur intégré d'Instagram, d'où vient le
   trafic des réels) et n'envoie aucun événement. Visible sur iPhone seulement, jamais dans l'app ni
   en PWA installée, ni pour un compte qui utilise déjà l'app : une page web ne sait pas si l'app est
   installée, on le déduit d'un jeton APNs ou de données Apple Santé (deux choses que seule l'app écrit).
   Fermée = silence 14 jours. Rendue dans le flux de la page (pas en position fixe) : chaque page la
   place en haut de sa propre colonne, les pages de l'app étant presque toutes en plein écran fixe. */

const DISMISS_KEY = "tpc_app_banner_dismissed_at";
const SILENCE_MS = 14 * 86_400_000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < SILENCE_MS;
  } catch { return false; }
}

async function usesApp(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const [{ data: apns }, { data: health }] = await Promise.all([
      supabase.from("push_subscriptions").select("id").eq("user_id", user.id).eq("kind", "apns").limit(1),
      supabase.from("health_daily").select("id").eq("user_id", user.id).limit(1),
    ]);
    return (apns?.length ?? 0) > 0 || (health?.length ?? 0) > 0;
  } catch { return false; }
}

export default function AppBanner({ source, variant = "bar" }: { source: string; variant?: "bar" | "card" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!APP_STORE_URL || !isIOS() || Capacitor.isNativePlatform() || isStandalone() || dismissedRecently()) return;
    let alive = true;
    usesApp().then(has => {
      if (!alive || has) return;
      setShow(true);
      posthog.capture("app_banner_viewed", { source });
    });
    return () => { alive = false; };
  }, [source]);

  if (!show) return null;

  const close = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* stockage bloqué : on masque quand même */ }
    posthog.capture("app_banner_dismissed", { source });
    setShow(false);
  };
  const open = () => {
    posthog.capture("app_banner_clicked", { source });
    window.location.href = APP_STORE_URL;
  };

  const card = variant === "card";
  return (
    <div role="region" aria-label="Application iPhone" style={{
      display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      padding: card ? "10px 12px" : "9px 12px",
      background: card ? "rgba(255,255,255,.96)" : "#fff",
      borderBottom: card ? "none" : "1px solid rgba(0,0,0,.08)",
      border: card ? "1px solid rgba(0,0,0,.08)" : undefined,
      borderRadius: card ? 16 : 0, marginBottom: card ? 16 : 0,
      boxShadow: card ? "0 10px 30px rgba(0,0,0,.08)" : "none",
    }}>
      <button type="button" onClick={close} aria-label="Fermer"
        style={{ border: 0, background: "none", color: "#8a8f94", fontSize: 18, lineHeight: 1, padding: "2px 2px", cursor: "pointer", fontFamily: "inherit" }}>×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-touch-icon.png" alt="" width={38} height={38} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#171b1f", lineHeight: 1.2 }}>ThePerfClub</div>
        <div style={{ fontSize: 12, color: "#6b7177", lineHeight: 1.3 }}>Ta séance ajustée chaque matin, dans l&apos;app</div>
      </div>
      <button type="button" onClick={open}
        style={{ border: 0, borderRadius: 999, background: "#d44000", color: "#fff", fontSize: 13, fontWeight: 800, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
        Obtenir
      </button>
    </div>
  );
}
