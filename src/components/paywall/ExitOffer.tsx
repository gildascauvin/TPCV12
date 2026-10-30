"use client";

/* Écran d'offre de sortie (voir src/lib/exitOffer.ts) : par-dessus le paywall, à sa 1re fermeture. Rendu dans
   <body> : la modale du paywall (animation, flou d'arrière-plan) piégerait un `position: fixed`. */

import { createPortal } from "react-dom";
import { exitPrice, euros, EXIT_PROMO } from "@/lib/exitOffer";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };

export default function ExitOffer({ mode, onAccept, onDecline }: { mode: "athlete" | "coach"; onAccept: () => void; onDecline: () => void }) {
  const p = exitPrice(mode);
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "#070a0d", backgroundImage: "radial-gradient(ellipse 120% 55% at 50% -5%, rgba(240,74,8,.35) 0%, transparent 65%)", color: "#fff", display: "flex", flexDirection: "column", padding: "max(28px, env(safe-area-inset-top)) 20px 24px", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
      <button onClick={onDecline} aria-label="Fermer" style={{ alignSelf: "flex-end", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.75)", fontSize: 19, cursor: "pointer" }}>×</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, maxWidth: 460, margin: "0 auto", width: "100%" }}>
        <div style={{ ...MONO, color: "#ff8a55" }}>Avant de partir</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Ta 1re année à {euros(p.now)}, au lieu de {euros(p.was)}.</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.65)" }}>
          {mode === "coach" ? "Tes sportifs restent gratuits. " : ""}Tes 14 jours offerts sont toujours là, l&apos;annulation se fait en 1 clic. Cette offre n&apos;existe que sur cet écran.
        </div>
        <div style={{ borderRadius: 20, padding: "18px 18px", border: "1px solid rgba(255,138,85,.45)", background: "rgba(240,74,8,.10)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, color: "rgba(255,255,255,.45)", textDecoration: "line-through" }}>{euros(p.was)}</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700 }}>{euros(p.now)}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>la 1re année</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, color: "#0b0e11", background: "#ff8a55", padding: "4px 9px", borderRadius: 999 }}>-30 %</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 6 }}>Soit {euros(p.perMonth)}/mois. 0 € aujourd&apos;hui, puis {euros(p.was)}/an à partir de la 2e année.</div>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono), monospace", fontSize: 11.5, fontWeight: 700, color: "#7fdb8f", background: "rgba(47,158,68,.18)", padding: "5px 10px", borderRadius: 999 }}>✓ Code {EXIT_PROMO} appliqué</div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 460, margin: "18px auto 0", width: "100%" }}>
        <button onClick={onAccept} style={{ height: 56, borderRadius: 999, border: 0, background: "#d44000", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Prendre l&apos;offre, 14 jours offerts</button>
        <button onClick={onDecline} style={{ border: 0, background: "none", color: "rgba(255,255,255,.6)", fontSize: 13.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 6 }}>Non merci, rester en Gratuit</button>
        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.45)" }}>En Gratuit, ton programme, tes séances et ton point forme restent.</div>
      </div>
    </div>,
    document.body,
  );
}
