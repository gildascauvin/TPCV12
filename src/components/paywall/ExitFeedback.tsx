"use client";

/* « Qu'est-ce qui te retient ? » (2026-11-15, remplace l'offre de sortie DEPART30) : à la 1re fermeture du
   paywall, web et apps. Chaque raison cochée reçoit sa réponse ; « C'est trop cher » pousse le mensuel.
   Rendu dans <body> : la modale du paywall (animation, flou) piégerait un `position: fixed`. */

import { useState } from "react";
import { createPortal } from "react-dom";
import posthog from "@/lib/ph";
import { isNativeApp } from "@/lib/nativeGoogleAuth";
import { isAndroidApp } from "@/lib/native";
import { PRICING } from "./PaywallModal";

const SEEN_KEY = "tpc_exit_feedback_seen";
export function exitFeedbackDue(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("dbgstep")) return true;
    return !localStorage.getItem(SEEN_KEY);
  } catch { return false; }
}
export function markExitFeedbackSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* stockage bloqué */ }
}

type Reason = "proof" | "price" | "card" | "feeling" | "other";
const REASONS: { key: Reason; label: string }[] = [
  { key: "proof", label: "Je veux d'abord voir si ça marche" },
  { key: "price", label: "C'est trop cher" },
  { key: "card", label: "Je ne veux pas donner ma carte" },
  { key: "feeling", label: "Je préfère mon ressenti" },
  { key: "other", label: "Autre chose" },
];

function chargeDay(): string {
  const d = new Date(); d.setDate(d.getDate() + 14);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function answer(k: Reason, mode: "athlete" | "coach"): string {
  const native = isNativeApp();
  if (k === "proof") return `14 jours pour juger sur tes vraies séances. Si ça ne t'apporte rien, tu annules avant le ${chargeDay()} : 0 €.`;
  if (k === "price") return mode === "coach"
    ? `Le mensuel à ${PRICING.coach.monthly} €, sans engagement, sportifs illimités. Tu passes à l'annuel quand tu veux.`
    : `Le mensuel à ${PRICING.athlete.monthly} €, sans engagement. Tu passes à l'annuel quand tu veux.`;
  if (k === "card") return `0 € aujourd'hui, rien avant le ${chargeDay()}. ${native ? `Annulation dans tes abonnements ${isAndroidApp() ? "Google Play" : "App Store"}.` : "Annulation en 1 clic depuis ton profil."}`;
  if (k === "feeling") return "Ton ressenti reste la référence. On le mesure : ton point forme cale la séance, chaque série recale la suivante.";
  return "Merci, ton retour nous aide à améliorer ThePerfClub.";
}

export default function ExitFeedback({ mode, name, source, onResume, onMonthly, onLeave }: {
  mode: "athlete" | "coach";
  name?: string | null;
  source?: string;
  /* Retour à l'offre (formule inchangée). */
  onResume: () => void;
  /* « C'est trop cher » : formule mensuelle choisie, retour à l'offre. */
  onMonthly: () => void;
  onLeave: () => void;
}) {
  const [picked, setPicked] = useState<Reason[]>([]);
  const toggle = (k: Reason) => setPicked(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k]));
  const send = (outcome: string) => posthog.capture("paywall_close_reason", { reasons: picked, outcome, plan: mode, source });
  const first = (name ?? "").trim().split(/\s+/)[0];
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483160, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(7,10,13,.55)" }}>
      <div role="dialog" aria-label="Qu'est-ce qui te retient ?" style={{ width: "100%", maxWidth: 520, maxHeight: "88dvh", overflowY: "auto", background: "#fff", color: "#171b1f", borderRadius: "22px 22px 0 0", padding: "10px 20px max(18px, env(safe-area-inset-bottom))", boxShadow: "0 -10px 30px rgba(0,0,0,.35)", animation: "modalIn .3s cubic-bezier(.2,0,0,1)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 9, background: "rgba(0,0,0,.14)", margin: "0 auto 14px" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Qu&apos;est-ce qui te retient{first ? `, ${first}` : ""} ?</div>
        <div style={{ fontSize: 14.5, color: "#6b7177", marginTop: 4 }}>Plusieurs choix possibles.</div>
        <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
          {REASONS.map(r => {
            const on = picked.includes(r.key);
            return (
              <div key={r.key}>
                <button type="button" onClick={() => toggle(r.key)} aria-pressed={on}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "13px 14px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#171b1f",
                    border: on ? "2px solid #d44000" : "1px solid rgba(0,0,0,.12)", background: on ? "rgba(212,64,0,.06)" : "#fff" }}>
                  <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 13, color: "#fff", background: on ? "#d44000" : "transparent", border: on ? "none" : "2px solid #c9ccd0" }}>{on ? "✓" : ""}</span>
                  {r.label}
                </button>
                {on && (
                  <div style={{ margin: "8px 4px 4px", fontSize: 14, lineHeight: 1.5, color: "#3d4247" }}>
                    {answer(r.key, mode)}
                    {r.key === "price" && (
                      <button type="button" onClick={() => { send("monthly"); posthog.capture("paywall_exit_monthly", { plan: mode, source }); onMonthly(); }}
                        style={{ display: "block", width: "100%", marginTop: 10, padding: "13px 16px", borderRadius: 14, border: "1.5px solid #d44000", background: "#fff", color: "#d44000", fontFamily: "inherit", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                        Essayer en mensuel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => { send("resume"); onResume(); }}
          style={{ display: "block", width: "100%", marginTop: 16, padding: 15, borderRadius: 999, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer" }}>
          Reprendre mes 14 jours offerts
        </button>
        <button type="button" onClick={() => { send("leave"); onLeave(); }}
          style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#8a8f94", textDecoration: "underline" }}>
          Quitter quand même
        </button>
      </div>
    </div>,
    document.body,
  );
}
