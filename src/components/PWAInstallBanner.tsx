"use client";

import { useEffect, useState } from "react";

type IOSState = "idle" | "instructions";

export default function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [iosState, setIosState] = useState<IOSState>("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (sessionStorage.getItem("pwa-dismissed")) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;

    if (ios) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as Event & { prompt?: () => Promise<void> });
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem("pwa-dismissed", "1");
    setVisible(false);
  }

  async function install() {
    if (!prompt?.prompt) return;
    await prompt.prompt();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", bottom: 90, left: 12, right: 12, zIndex: 2147483200,
      background: "linear-gradient(135deg,#161616 0%,#2a2a2a 100%)",
      border: "1px solid rgba(255,255,255,.10)",
      borderRadius: 20, padding: "16px 18px",
      boxShadow: "0 20px 60px rgba(0,0,0,.45)",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {iosState === "instructions" ? (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>
              Appuie sur{" "}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "1px 6px", fontSize: 13 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4da3ff" }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Partager
              </span>
              {" "}puis{" "}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "1px 6px", fontSize: 13 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4da3ff" }}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                Sur l'écran d'accueil
              </span>
            </div>
            <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.4)", padding: 0, flexShrink: 0, lineHeight: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* App icon */}
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(180deg,#f04a08,#d44000)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#fff" />
            </svg>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>ThePerfClub</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.50)", marginTop: 1 }}>Ajouter à l'écran d'accueil</div>
          </div>

          {isIOS ? (
            <button
              onClick={() => setIosState("instructions")}
              style={{
                height: 36, padding: "0 16px", borderRadius: 10, border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)",
                color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Installer
            </button>
          ) : (
            <button
              onClick={install}
              style={{
                height: 36, padding: "0 16px", borderRadius: 10, border: "none",
                background: "linear-gradient(180deg,#f04a08,#d44000)",
                color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Installer
            </button>
          )}

          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.35)", padding: 0, flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
