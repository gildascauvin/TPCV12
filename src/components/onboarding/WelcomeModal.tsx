"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

interface Props {
  mode: "athlete" | "coach";
  onClose: () => void;
}

export default function WelcomeModal({ mode, onClose }: Props) {
  useEffect(() => {
    posthog.capture("welcome_modal_viewed", { mode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    posthog.capture("welcome_modal_closed", { mode });
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)" }}>
      <div style={{ background: "#fff", borderRadius: 30, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 42px 120px rgba(0,0,0,.34)" }}>
        {mode === "athlete" ? (
          <>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>🎯</div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2, textAlign: "center", marginBottom: 14 }}>
              Ton espace est prêt
            </div>
            <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.65, marginBottom: 24, textAlign: "center" }}>
              On a pré-rempli ton historique avec des données réalistes — séances passées, wellness, séances à venir — calibrées sur ton niveau et ton sport.
              <br /><br />
              C&apos;est un point de départ pour que tu te projettes. Tout est remplaçable et personnalisable dès maintenant.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>🏆</div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", color: "#171b1f", lineHeight: 1.2, textAlign: "center", marginBottom: 14 }}>
              Bienvenue dans ton coach control
            </div>
            <div style={{ fontSize: 14, color: "#62686e", lineHeight: 1.65, marginBottom: 24, textAlign: "center" }}>
              On a peuplé ton espace avec 5 sportifs fictifs — différents niveaux, différentes alertes — pour que tu vois le produit en action dès maintenant.
              <br /><br />
              Ces sportifs disparaissent dès que tu invites les tiens. À toi de jouer.
            </div>
          </>
        )}
        <button
          onClick={handleClose}
          style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}
        >
          C&apos;est parti →
        </button>
      </div>
    </div>
  );
}
