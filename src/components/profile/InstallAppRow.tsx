"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { useInstallMode, runInstall } from "@/lib/pwaInstall";

/* Profil : accès permanent à l'installation (la checklist disparaît une fois terminée). */
export default function InstallAppRow() {
  const mode = useInstallMode();

  useEffect(() => {
    if (mode) posthog.capture("pwa_install_cta_viewed", { surface: "profile", mode });
  }, [mode]);

  if (!mode) return null;

  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: "16px 16px", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, color: "#171b1f" }}>📲 Application</div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>
            {mode === "app_store" ? "Télécharge ThePerfClub sur l'App Store" : "Installe ThePerfClub sur ton écran d'accueil"}
          </div>
        </div>
        <button
          onClick={() => runInstall("profile")}
          style={{
            height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 12, border: "none", flexShrink: 0, cursor: "pointer",
            background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 12, fontWeight: 800,
          }}
        >
          Installer
        </button>
      </div>
    </div>
  );
}
