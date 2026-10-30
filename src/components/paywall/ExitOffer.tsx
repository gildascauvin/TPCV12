"use client";

/* Écran d'offre de sortie (voir src/lib/exitOffer.ts) : par-dessus le paywall, à sa 1re fermeture. Rendu dans
   <body> : la modale du paywall (animation, flou d'arrière-plan) piégerait un `position: fixed`.
   Mensuel ou annuel (2026-10-30) : les deux formules remisées l'une sous l'autre (OfferRows, comme le paywall),
   la formule choisie sur le paywall reprise. */

import { createPortal } from "react-dom";
import { exitPrice, euros, EXIT_PROMO } from "@/lib/exitOffer";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { OfferRows, paywallSimIos, type OfferRow } from "./PricingPriming";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };

type Billing = "monthly" | "annual";

export default function ExitOffer({ mode, billing, setBilling, onAccept, onDecline }: { mode: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; onAccept: () => void; onDecline: () => void }) {
  // Les deux formules remisées l'une sous l'autre, comme sur le paywall.
  const ios = isNativeApp() || paywallSimIos();
  const pa = exitPrice(mode, "annual"), pm = exitPrice(mode, "monthly");
  const rows: OfferRow[] = [
    { b: "annual", label: "Annuel", badge: "-30 %", tag: "Meilleur prix", big: ios ? euros(pa.now) : euros(pa.perMonth), unit: ios ? "/an" : "/mois",
      small: <><s style={{ opacity: .6 }}>{euros(pa.was)}</s> {ios ? "la 1re année" : `${euros(pa.now)} la 1re année`}</> },
    { b: "monthly", label: "Mensuel", badge: "-30 %", big: euros(pm.now), unit: "/mois",
      small: <><s style={{ opacity: .6 }}>{euros(pm.was)}</s> pendant 12 mois</> },
  ];
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "#070a0d", backgroundImage: "radial-gradient(ellipse 120% 55% at 50% -5%, rgba(240,74,8,.35) 0%, transparent 65%)", color: "#fff", display: "flex", flexDirection: "column", padding: "max(28px, env(safe-area-inset-top)) 20px 24px", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
      <button onClick={onDecline} aria-label="Fermer" style={{ alignSelf: "flex-end", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.75)", fontSize: 19, cursor: "pointer" }}>×</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, maxWidth: 460, margin: "0 auto", width: "100%" }}>
        <div style={{ ...MONO, color: "#ff8a55" }}>Avant de partir</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>Ta 1re année à -30 %.</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.65)" }}>
          {mode === "coach" ? "Tes sportifs restent gratuits. " : ""}Tes 14 jours offerts sont toujours là, l&apos;annulation se fait en 1 clic. Cette offre n&apos;existe que sur cet écran.
        </div>
        <OfferRows rows={rows} billing={billing} setBilling={setBilling} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono), monospace", fontSize: 11.5, fontWeight: 700, color: "#7fdb8f", background: "rgba(47,158,68,.18)", padding: "5px 10px", borderRadius: 999 }}>✓ Code {EXIT_PROMO} appliqué</span>
          <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)" }}>0 € aujourd&apos;hui.</span>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 460, margin: "18px auto 0", width: "100%" }}>
        <button onClick={onAccept} style={{ height: 56, borderRadius: 999, border: 0, background: "#d44000", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Prendre l&apos;offre, 14 jours offerts</button>
        {/* Refus formulé comme une perte et en retrait (Gildas 2026-10-30) ; la croix en haut reste l'autre sortie. */}
        <button onClick={onDecline} style={{ border: 0, background: "none", color: "rgba(255,255,255,.4)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 6 }}>Non merci, je laisse passer -30 %</button>
      </div>
    </div>,
    document.body,
  );
}
