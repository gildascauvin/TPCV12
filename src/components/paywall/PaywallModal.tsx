"use client";

import { useState } from "react";

interface PaywallModalProps {
  onClose: () => void;
}

export default function PaywallModal({ onClose }: PaywallModalProps) {
  const [loading, setLoading] = useState<"athlete" | "coach" | null>(null);

  async function handleCheckout(plan: "athlete" | "coach") {
    setLoading(plan);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
    setLoading(null);
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(14px)" }}
    >
      <div className="bg-white rounded-[18px] border border-black/12 shadow-[0_26px_80px_rgba(0,0,0,0.28)] w-full max-w-[380px] p-6">
        <h2 className="text-[18px] font-black text-text mb-1">Passe au niveau supérieur</h2>
        <p className="text-[13px] text-muted mb-5 leading-snug">
          Ta période d'essai est terminée. Continue avec un plan payant pour garder l'accès complet.
        </p>

        {/* Athlete plan */}
        <div className="border border-black/8 rounded-[14px] p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[14px] font-black text-text">Plan Athlète</div>
              <div className="text-[11px] text-muted">Suivi complet + agent IA</div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-black text-accent">9€</div>
              <div className="text-[10px] text-muted">/mois</div>
            </div>
          </div>
          <button
            onClick={() => handleCheckout("athlete")}
            disabled={loading !== null}
            className="btn-primary w-full"
          >
            {loading === "athlete" ? "..." : "Choisir Athlète"}
          </button>
        </div>

        {/* Coach plan */}
        <div
          className="border rounded-[14px] p-4 mb-4"
          style={{ borderColor: "rgba(212,64,0,0.3)", background: "rgba(212,64,0,0.04)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[14px] font-black text-text">Plan Coach</div>
              <div className="text-[11px] text-muted">Gérer plusieurs athlètes</div>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-black text-accent">49€</div>
              <div className="text-[10px] text-muted">/mois</div>
            </div>
          </div>
          <button
            onClick={() => handleCheckout("coach")}
            disabled={loading !== null}
            className="btn-primary w-full"
          >
            {loading === "coach" ? "..." : "Choisir Coach"}
          </button>
        </div>

        <button onClick={onClose} className="w-full text-[12px] text-muted hover:text-text transition-colors">
          Plus tard
        </button>
      </div>
    </div>
  );
}
