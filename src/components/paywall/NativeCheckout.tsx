"use client";

import { Skel } from "@/components/ui/Skeleton";
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

/* Bloc d'achat Apple autonome (messages, mentions, bouton, restaurer, liens). Utilisé directement
   par l'écran d'offre (PrimingJourneyModal) sur iOS, où il remplace l'enchaînement offre → paiement :
   la feuille Apple fait office de formulaire, l'écran Stripe intermédiaire n'a plus de raison d'être. */
export function NativePurchasePanel({
  mode, billing, onSuccess, abVariant, ctaLabel,
}: {
  mode: "athlete" | "coach";
  billing: Billing;
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
        // Garde-fou : si le plugin natif est absent (ancien build) ou que l'App Store ne répond
        // pas, l'appel peut ne jamais se terminer. On affiche alors un message, avec le détail.
        const products = await Promise.race([
          getStoreProducts(user.id),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("délai global dépassé")), 70000)),
        ]);
        if (alive) setProduct(products[PRODUCT_IDS[mode][billing]]);
        if (alive && !products[PRODUCT_IDS[mode][billing]]) {
          const found = Object.keys(products);
          setLoadError(`Offre indisponible sur l'App Store pour le moment (${PRODUCT_IDS[mode][billing]} absent ; Apple a renvoyé ${found.length} produit(s)${found.length ? " : " + found.join(", ") : ""}).`);
        }
      } catch (e) {
        console.error("[iap] products", e);
        const detail = e instanceof Error ? e.message : String(e);
        if (alive) setLoadError(`Impossible de charger l'offre App Store (${detail}).`);
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
  /* Minimum exigé par Apple (guideline 3.1.2) près du bouton : durée, prix, essai, renouvellement
     automatique ; plus les liens Conditions/Confidentialité dans le parcours d'achat. Volontairement
     condensé sur une ligne. */
  const legal = product
    ? days ? `${days} jours offerts, puis ${product.priceString}/${period}, renouvelé automatiquement. Résiliable à tout moment.`
           : `${product.priceString}/${period}, renouvelé automatiquement. Résiliable à tout moment.`
    : null;

  return (
    <div>
      {loadError && (
        <div style={{ color: "#ff8a8a", fontSize: 12, textAlign: "center", margin: "0 0 10px", lineHeight: 1.45 }}>{loadError}</div>
      )}
      {!loadError && !product && (
        <Skel dark h={14} w="60%" style={{ margin: "0 auto 10px" }} />
      )}
      {error && (
        <div style={{ color: "#ff8a8a", fontSize: 12, margin: "0 0 10px", padding: "8px 12px", background: "rgba(209,0,0,.14)", borderRadius: 12 }}>{error}</div>
      )}
      {info && (
        <div style={{ color: "rgba(255,255,255,.8)", fontSize: 12, margin: "0 0 10px", padding: "8px 12px", background: "rgba(255,255,255,.06)", borderRadius: 12 }}>{info}</div>
      )}
      {legal && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", textAlign: "center", margin: "0 0 10px", lineHeight: 1.5 }}>{legal}</div>
      )}
      <button
        type="button"
        onClick={buy}
        disabled={!product || busy !== null}
        style={{
          width: "100%", height: 50, borderRadius: 16, border: "none",
          background: !product || busy ? "#3a3f44" : "#D44000",
          color: "#fff", fontSize: 14, fontWeight: 900, cursor: !product || busy ? "default" : "pointer",
          letterSpacing: "-0.01em",
        }}
      >
        {busy === "buy" ? "Traitement..." : ctaLabel}
      </button>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 11, color: "rgba(255,255,255,.5)" }}>
        <button type="button" onClick={restore} disabled={!userId || busy !== null}
          style={{ background: "none", border: "none", padding: 0, color: "rgba(255,255,255,.5)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
          {busy === "restore" ? "..." : "Restaurer mes achats"}
        </button>
        <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.5)" }}>Conditions</a>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.5)" }}>Confidentialité</a>
      </div>
    </div>
  );
}

/* Pendant iOS du formulaire Stripe dans PaywallModal (encore ouvert directement par « S'abonner »
   du profil) : le même bloc, porté dans le footer du drawer. */
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
  if (!footerPortalNode) return null;
  return createPortal(
    <div style={{ padding: "20px 28px 20px", background: "rgba(7,10,13,.85)", borderTop: "1px solid rgba(255,255,255,.08)" }}>
      <NativePurchasePanel mode={mode} billing={billing} onSuccess={onSuccess} abVariant={abVariant} ctaLabel={ctaLabel} />
    </div>,
    footerPortalNode
  );
}
