"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import type { PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";
import { createClient } from "@/lib/supabase/client";
import { getStoreProducts, purchasePlan, restorePurchases, PRODUCT_IDS, type Billing } from "@/lib/nativePurchases";

/* Pendant iOS de CheckoutForm (PaywallModal.tsx) : même emplacement (footer porté dans le drawer),
   même onSuccess, mais l'achat passe par Apple (feuille système, Face ID). Le montant affiché vient
   de l'App Store (prix et devise du pays de l'utilisateur), l'essai offert de l'offre d'introduction
   du produit. "Restaurer mes achats" + liens Conditions/Confidentialité : exigés par Apple pour un
   abonnement auto-renouvelable. */

const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://www.theperfclub.com/politique-de-confidentialite/";

function trialDays(p: PurchasesStoreProduct | undefined): number | null {
  const intro = p?.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits * (intro.cycles || 1);
  const unit = intro.periodUnit;
  return unit === "DAY" ? n : unit === "WEEK" ? n * 7 : unit === "MONTH" ? n * 30 : null;
}

export default function NativeCheckout({
  mode, billing, footerPortalNode, onSuccess, abVariant, ctaLabel,
}: {
  mode: "athlete" | "coach";
  billing: Billing;
  footerPortalNode: HTMLDivElement | null;
  onSuccess: () => void;
  abVariant?: string;
  ctaLabel: string;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [product, setProduct] = useState<PurchasesStoreProduct | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await createClient().auth.getUser();
      if (!alive) return;
      if (!user) { setLoadError("Connecte-toi pour activer ton abonnement."); return; }
      setUserId(user.id);
      try {
        const products = await getStoreProducts(user.id);
        if (alive) setProduct(products[PRODUCT_IDS[mode][billing]]);
        if (alive && !products[PRODUCT_IDS[mode][billing]]) setLoadError("Offre indisponible sur l'App Store pour le moment.");
      } catch (e) {
        console.error("[iap] products", e);
        if (alive) setLoadError("Impossible de charger l'offre App Store.");
      }
    })();
    return () => { alive = false; };
  }, [mode, billing]);

  async function buy() {
    if (!userId) return;
    setBusy("buy"); setError(null); setInfo(null);
    const res = await purchasePlan(userId, mode, billing);
    setBusy(null);
    if (res === null) return;
    if (!res.ok) { setError(res.error); return; }
    posthog.capture("trial_started", { plan: mode, billing, method: "app_store", ...(abVariant ? { ab_variant: abVariant } : {}) });
    onSuccess();
  }

  async function restore() {
    if (!userId) return;
    setBusy("restore"); setError(null); setInfo(null);
    const res = await restorePurchases(userId);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    if (res.restored) { onSuccess(); return; }
    setInfo("Aucun abonnement App Store actif à restaurer sur ce compte Apple.");
  }

  const days = trialDays(product);
  const period = billing === "annual" ? "an" : "mois";
  const legal = product
    ? days ? `${days} jours offerts, puis ${product.priceString}/${period}. Renouvellement automatique, annulable dans les réglages de ton compte Apple.`
           : `${product.priceString}/${period}. Renouvellement automatique, annulable dans les réglages de ton compte Apple.`
    : null;

  return (
    <>
      {loadError && (
        <div style={{ color: "#d10000", fontSize: 13, textAlign: "center", padding: "12px 0" }}>{loadError}</div>
      )}
      {!loadError && !product && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#8a8f94", fontSize: 13 }}>Chargement de l&apos;offre...</div>
      )}
      {error && (
        <div style={{ color: "#d10000", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(209,0,0,.06)", borderRadius: 10 }}>{error}</div>
      )}
      {info && (
        <div style={{ color: "#3a3f44", fontSize: 12, marginTop: 10, padding: "8px 12px", background: "rgba(0,0,0,.04)", borderRadius: 10 }}>{info}</div>
      )}

      {footerPortalNode && createPortal(
        <div style={{ padding: "20px 28px 20px", background: "#fff" }}>
          {legal && (
            <div style={{ fontSize: 11, color: "#8a8f94", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>{legal}</div>
          )}
          <button
            type="button"
            onClick={buy}
            disabled={!product || busy !== null}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none",
              background: !product || busy ? "#ccc" : "linear-gradient(180deg,#f04a08,#d44000)",
              color: "#fff", fontSize: 14, fontWeight: 900, cursor: !product || busy ? "default" : "pointer",
              letterSpacing: "-0.01em",
            }}
          >
            {busy === "buy" ? "Traitement..." : ctaLabel}
          </button>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 11, color: "#8a8f94" }}>
            <button type="button" onClick={restore} disabled={!userId || busy !== null}
              style={{ background: "none", border: "none", padding: 0, color: "#8a8f94", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
              {busy === "restore" ? "..." : "Restaurer mes achats"}
            </button>
            <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: "#8a8f94" }}>Conditions</a>
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={{ color: "#8a8f94" }}>Confidentialité</a>
          </div>
        </div>,
        footerPortalNode
      )}
    </>
  );
}
