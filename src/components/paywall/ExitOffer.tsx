"use client";

/* Écran d'offre de sortie (voir src/lib/exitOffer.ts) : par-dessus le paywall, à sa 1re fermeture. Rendu dans
   <body> : la modale du paywall (animation, flou d'arrière-plan) piégerait un `position: fixed`.
   Mensuel ou annuel (2026-10-30) : les deux formules remisées l'une sous l'autre (OfferRows, comme le paywall),
   la formule choisie sur le paywall reprise. */

import { useState } from "react";
import { createPortal } from "react-dom";
import { exitPrice, euros, EXIT_PROMO } from "@/lib/exitOffer";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { isIosApp } from "@/lib/native";
import { createClient } from "@/lib/supabase/client";
import { purchasePlan, type ExitStoreOffer } from "@/lib/nativePurchases";
import { OfferRows, paywallSimIos, type OfferRow } from "./PricingPriming";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };

type Billing = "monthly" | "annual";

/* Apps (2026-11-02) : `storeOffers` = l'offre du store (prix du store, jamais nos constantes) et le bouton
   achète directement. iOS : la remise vaut tant que l'abonnement court (produits « départ », un 2e essai
   de 14 j ne se combine pas avec une remise limitée chez Apple) ; Android : 12 mois, comme le web. */
export default function ExitOffer({ mode, billing, setBilling, onAccept, onDecline, storeOffers, onPurchased }: { mode: "athlete" | "coach"; billing: Billing; setBilling: (b: Billing) => void; onAccept: () => void; onDecline: () => void; storeOffers?: Record<Billing, ExitStoreOffer> | null; onPurchased?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Les deux formules remisées l'une sous l'autre, comme sur le paywall.
  const ios = isNativeApp() || paywallSimIos();
  const store = isNativeApp() ? storeOffers ?? null : null;
  const forever = !!store && isIosApp();
  const pa = exitPrice(mode, "annual"), pm = exitPrice(mode, "monthly");
  const rows: OfferRow[] = [
    { b: "annual", label: "Annuel", badge: "-30 %", tag: "Meilleur prix", big: store ? store.annual.price : ios ? euros(pa.now) : euros(pa.perMonth), unit: ios ? "/an" : "/mois",
      small: <><s style={{ opacity: .6 }}>{euros(pa.was)}</s> {forever ? "par an, tant que tu restes abonné" : ios ? "la 1re année" : `${euros(pa.now)} la 1re année`}</> },
    { b: "monthly", label: "Mensuel", badge: "-30 %", big: store ? store.monthly.price : euros(pm.now), unit: "/mois",
      small: <><s style={{ opacity: .6 }}>{euros(pm.was)}</s> {forever ? "par mois, tant que tu restes abonné" : "pendant 12 mois"}</> },
  ];
  const trial = store ? store[billing].trial : 14;
  const buy = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const { data: { user } } = await createClient().auth.getUser();
    const res = user ? await purchasePlan(user.id, mode, billing, true) : { ok: false as const, error: "Connecte-toi pour activer ton abonnement." };
    setBusy(false);
    if (res === null) return;
    if (!res.ok) { setError(res.error); return; }
    onPurchased?.();
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "#070a0d", backgroundImage: "radial-gradient(ellipse 120% 55% at 50% -5%, rgba(240,74,8,.35) 0%, transparent 65%)", color: "#fff", display: "flex", flexDirection: "column", padding: "max(28px, env(safe-area-inset-top)) 20px 24px", overflowY: "auto", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
      <button onClick={onDecline} aria-label="Fermer" style={{ alignSelf: "flex-end", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.75)", fontSize: 19, cursor: "pointer" }}>×</button>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, maxWidth: 460, margin: "0 auto", width: "100%" }}>
        <div style={{ ...MONO, color: "#ff8a55" }}>Avant de partir</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{forever ? "-30 %, et ça ne bouge plus." : "Ta 1re année à -30 %."}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(255,255,255,.65)" }}>
          {mode === "coach" ? "Tes sportifs restent gratuits. " : ""}{trial ? `Tes ${trial} jours offerts sont toujours là, ` : ""}l&apos;annulation se fait en 1 clic. Cette offre n&apos;existe que sur cet écran.
        </div>
        <OfferRows rows={rows} billing={billing} setBilling={setBilling} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono), monospace", fontSize: 11.5, fontWeight: 700, color: "#7fdb8f", background: "rgba(47,158,68,.18)", padding: "5px 10px", borderRadius: 999 }}>✓ {store ? "Remise appliquée" : `Code ${EXIT_PROMO} appliqué`}</span>
          {trial ? <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.55)" }}>0 € aujourd&apos;hui.</span> : null}
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, maxWidth: 460, margin: "18px auto 0", width: "100%" }}>
        {error && <div style={{ color: "#ff8a8a", fontSize: 12.5, padding: "8px 12px", background: "rgba(209,0,0,.14)", borderRadius: 12 }}>{error}</div>}
        {/* Mention exigée par les stores près du bouton : essai, prix, renouvellement automatique. */}
        {store && <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", textAlign: "center", lineHeight: 1.5 }}>{trial ? `${trial} jours offerts, puis ` : ""}{store[billing].price}/{billing === "annual" ? "an" : "mois"}{forever ? "" : " pendant 12 mois, puis le prix normal"}, renouvelé automatiquement. Résiliable à tout moment.</div>}
        <button onClick={store ? buy : onAccept} disabled={busy} style={{ height: 56, borderRadius: 999, border: 0, background: busy ? "#3a3f44" : "#d44000", color: "#fff", fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>{busy ? "Traitement..." : trial ? `Prendre l'offre, ${trial} jours offerts` : "Prendre l'offre"}</button>
        {/* Refus formulé comme une perte et en retrait (Gildas 2026-10-30) ; la croix en haut reste l'autre sortie. */}
        <button onClick={onDecline} style={{ border: 0, background: "none", color: "rgba(255,255,255,.4)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 6 }}>Non merci, je laisse passer -30 %</button>
      </div>
    </div>,
    document.body,
  );
}
