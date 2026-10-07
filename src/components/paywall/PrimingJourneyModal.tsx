"use client";

import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { NativePurchasePanel } from "./NativeCheckout";
import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { ElitePlanCard, FreePlanCard, PrimingExtras, PricingSideLink, PRICING_PRIMING_GUARANTEE_CAPTION } from "./PricingPriming";
import { PAYWALL_CTA_LABEL } from "./PaywallModal";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";
import {
  clearPrimingSource, getCachedPrimingContext, loadPrimingContext, peekPrimingSource,
  primingHitIndex, primingTitles, type PrimingContext,
} from "@/lib/primingSource";

interface Props {
  mode: "athlete" | "coach";
  billing: "monthly" | "annual";
  setBilling: (b: "monthly" | "annual") => void;
  allowDismiss: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  /** App iOS : le bouton déclenche directement l'achat Apple. Par défaut la page se recharge. */
  onPurchased?: () => void;
  /** Titre forcé (sinon calculé depuis le déclencheur, voir src/lib/primingSource.ts). */
  headline?: string;
  sub?: string | null;
  /** Prénom affiché dans « Inviter mon coach » (repli sur le prénom du profil). */
  name?: string;
  /** Sportif : id du compte, pour « Inviter mon coach ». */
  athleteSelfId?: string;
}

/* Priming Elite (2026-10-07, POC https://claude.ai/artifact/MgsQY4Fncy8XtVgmNBA9Q5) : modale
   centrée sur desktop (Gratuit et Elite côte à côte), plein écran sur mobile (Elite d'abord,
   Gratuit dessous, CTA fixé en bas). Remplace le drawer docké à droite du 2026-09-16. Le titre
   suit ce que l'utilisateur essayait de faire (déclencheur) puis son prénom, son sport et, côté
   coach, ses sportifs. */
export default function PrimingJourneyModal({ mode, billing, setBilling, allowDismiss, onContinue, onDismiss, onPurchased, headline, sub, name, athleteSelfId }: Props) {
  const { isMd, w } = useBreakpoint();
  const [{ source, athleteName }] = useState(peekPrimingSource);
  const [ctx, setCtx] = useState<PrimingContext | null>(getCachedPrimingContext);

  useEffect(() => {
    clearPrimingSource();
    posthog.capture("paywall_priming_viewed", { plan: mode, source });
    let alive = true;
    const fallback = setTimeout(() => { if (alive) setCtx(c => c ?? { name: null, sportDe: null, athleteNames: [] }); }, 1200);
    loadPrimingContext().then(c => { if (alive) setCtx(c); });
    return () => { alive = false; clearTimeout(fallback); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const backdrop: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 2147483100,
    background: "rgba(0,0,0,.62)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: isMd ? 24 : 0,
  };
  // Titre personnalisé : on attend le contexte (préchargé par usePaywall, quasi toujours prêt)
  // plutôt que d'afficher un titre générique qui changerait sous les yeux.
  if (!ctx) return <div style={backdrop} />;

  const titles = primingTitles(mode, source, ctx, athleteName);
  const title = headline ?? titles.title;
  const subText = headline ? (sub ?? null) : titles.sub;
  const hitIndex = primingHitIndex(source);
  const hitLabel = source === "first" ? "Ce que tu viens d'essayer" : "Ce que tu voulais faire";
  const displayName = name ?? ctx.name ?? undefined;
  const native = isNativeApp();
  const columns = isMd && w >= 900;

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 16, border: "none", background: "#D44000", color: "#fff",
    fontSize: 14.5, fontWeight: 900, cursor: "pointer",
  };
  const cta = native ? (
    <NativePurchasePanel mode={mode} billing={billing} ctaLabel={PAYWALL_CTA_LABEL[mode]}
      onSuccess={() => { if (onPurchased) onPurchased(); else window.location.reload(); }} />
  ) : (
    <>
      <button onClick={() => { posthog.capture("paywall_priming_value_next", { plan: mode, source }); onContinue(); }} style={ctaBtn}>
        {PAYWALL_CTA_LABEL[mode]}
      </button>
      <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.5)" }}>{PRICING_PRIMING_GUARANTEE_CAPTION}</div>
    </>
  );
  const freeBtn = allowDismiss ? (
    <button onClick={onDismiss} style={{ width: "100%", height: 46, borderRadius: 16, border: "1px solid rgba(255,255,255,.16)", background: "transparent", color: "rgba(255,255,255,.8)", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
      Continuer en Gratuit
    </button>
  ) : undefined;
  const sideLink = <PricingSideLink role={mode} athleteSelfId={athleteSelfId} name={displayName} />;

  const head = (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 12 }}>{titles.eyebrow}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: isMd ? 29 : 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.18, color: "#fff", textWrap: "balance" as React.CSSProperties["textWrap"], marginBottom: 10 }}>{title}</div>
      {subText && <div style={{ fontSize: isMd ? 14.5 : 13.5, lineHeight: 1.55, color: "rgba(255,255,255,.62)", maxWidth: 620 }}>{subText}</div>}
    </div>
  );
  const closeBtn = allowDismiss && (
    <button onClick={onDismiss} aria-label="Fermer" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", cursor: "pointer", fontSize: 19, color: "rgba(255,255,255,.75)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>×</button>
  );

  /* Mobile : plein écran, Elite puis Gratuit, achat dans le bas fixe. */
  if (!isMd) {
    return (
      <div style={backdrop}>
        <div style={{ position: "relative", width: "100%", height: "100dvh", background: DARK_CARD_BG, color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
          {closeBtn}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "44px 20px 4px" }}>{head}</div>
            <div style={{ padding: "18px 16px 6px", display: "flex", flexDirection: "column", gap: 14 }}>
              <ElitePlanCard role={mode} billing={billing} setBilling={setBilling} sportDe={ctx.sportDe} hitIndex={hitIndex} hitLabel={hitLabel} sideLink={sideLink} />
              <FreePlanCard role={mode} sportDe={ctx.sportDe} />
            </div>
            <div style={{ padding: "14px 16px 20px" }}><PrimingExtras role={mode} /></div>
          </div>
          <div style={{ flexShrink: 0, padding: "12px 16px 16px", background: "rgba(7,10,13,.88)", borderTop: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 8 }}>
            {cta}
            {allowDismiss && (
              <button onClick={onDismiss} style={{ border: "none", background: "none", color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 700, textDecoration: "underline", cursor: "pointer", alignSelf: "center", padding: 2 }}>
                Continuer en Gratuit
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* Desktop : modale centrée, les 2 offres côte à côte (empilées si la fenêtre est étroite). */
  return (
    <div style={backdrop} onClick={e => { if (allowDismiss && e.target === e.currentTarget) onDismiss(); }}>
      <div style={{
        position: "relative", width: "min(980px, 100%)", maxHeight: "calc(100dvh - 48px)",
        background: DARK_CARD_BG, color: "#fff", border: "1px solid rgba(255,255,255,.16)", borderRadius: 24,
        boxShadow: "0 40px 120px rgba(0,0,0,.55)", display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "modalIn 0.2s cubic-bezier(0.2,0,0,1)",
      }}>
        {closeBtn}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "34px 32px 6px" }}>{head}</div>
          <div style={{ padding: "22px 32px 8px", display: "grid", gap: 14, gridTemplateColumns: columns ? "0.85fr 1.15fr" : "1fr", alignItems: "stretch" }}>
            {columns ? (
              <>
                <FreePlanCard role={mode} sportDe={ctx.sportDe} footer={freeBtn} />
                <ElitePlanCard role={mode} billing={billing} setBilling={setBilling} sportDe={ctx.sportDe} hitIndex={hitIndex} hitLabel={hitLabel} cta={cta} sideLink={sideLink} />
              </>
            ) : (
              <>
                <ElitePlanCard role={mode} billing={billing} setBilling={setBilling} sportDe={ctx.sportDe} hitIndex={hitIndex} hitLabel={hitLabel} cta={cta} sideLink={sideLink} />
                <FreePlanCard role={mode} sportDe={ctx.sportDe} footer={freeBtn} />
              </>
            )}
          </div>
          <div style={{ padding: "18px 32px 28px" }}><PrimingExtras role={mode} /></div>
        </div>
      </div>
    </div>
  );
}
