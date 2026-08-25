"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/* Sandbox uniquement (2026-08-20) — remplace la redirection directe vers /register par un palier
   plus doux, demandé explicitement par Gildas ("plutot que rediriger vers /register pour la gate,
   je préférerait une modale avec BG flouté comme on fait pour les iframes de programme après S1.
   Comme ca c'est moins brutal comme transition"). Même langage visuel que le verrou S2+ du
   program builder (fond flouté + carte blanche centrée, voir ProgramBuilderModal.tsx) mais en
   position:fixed plein écran puisque déclenché depuis n'importe quelle action gatée (Appliquer,
   Supprimer, Débloquer, S'abonner...), pas juste une zone de contenu localisée.

   2026-08-25 — tracking PostHog ("Leads from WP", dashboard 706709) : ce composant est le seul
   point de rendu des 7 gates de la sandbox (today/week/conseils/coach/athletes/planning/profil,
   même mécanisme partagé), donc le seul endroit à instrumenter pour couvrir "toutes les gates" en
   un coup — pas besoin de patcher chaque call site individuellement. `page` identifie la gate
   précise qui a déclenché l'ouverture. */
interface Props {
  role: "athlete" | "coach";
  page: string;
  onClose: () => void;
  onSignup: () => void;
}

export default function SandboxGateModal({ role, page, onClose, onSignup }: Props) {
  useEffect(() => {
    posthog.capture("sandbox_gate_viewed", { role, page, sandbox: true });
  }, [role, page]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2147483200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(241,240,238,.55)", backdropFilter: "blur(7px)", WebkitBackdropFilter: "blur(7px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 24, padding: "28px 24px", maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🔓</div>
        <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: "-0.03em", marginBottom: 8, color: "#171b1f" }}>
          Sauvegarde ce que tu viens de faire
        </div>
        <div style={{ fontSize: 13.5, color: "#62686e", lineHeight: 1.5, marginBottom: 20 }}>
          {role === "coach"
            ? "Crée ton compte gratuit pour garder cet ajustement et suivre réellement tes sportifs."
            : "Crée ton compte gratuit pour garder cet ajustement et suivre réellement ta progression."}
        </div>
        <button
          onClick={() => { posthog.capture("sandbox_gate_signup_clicked", { role, page, sandbox: true }); onSignup(); }}
          style={{ width: "100%", height: 46, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", marginBottom: 8 }}
        >
          Créer mon compte →
        </button>
        <button
          onClick={() => { posthog.capture("sandbox_gate_dismissed", { role, page, sandbox: true }); onClose(); }}
          style={{ width: "100%", height: 38, borderRadius: 12, border: "none", background: "none", color: "#8a8f94", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
        >
          Continuer en mode démo
        </button>
      </div>
    </div>
  );
}
