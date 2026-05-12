"use client";

import type { AIAdvice } from "@/types";

interface AgentCardProps {
  advice: AIAdvice | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export default function AgentCard({ advice, loading, onRefresh }: AgentCardProps) {
  return (
    <div
      className="rounded-[22px] p-4 mb-3"
      style={{
        background: "linear-gradient(135deg,#222622 0%,#3d443d 48%,#1d211e 100%)",
        border: "1px solid rgba(255,255,255,0.13)",
        boxShadow: "0 18px 44px rgba(24,28,24,0.22)",
        color: "#fff",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[10px] font-semibold tracking-[0.1em] uppercase flex items-center gap-[5px]"
          style={{ color: "#d44000" }}
        >
          ⚡ Agent IA
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-[11px] px-3 py-1 rounded-full border border-white/16 text-white/72 hover:text-white transition-colors"
          >
            {loading ? "..." : "Actualiser"}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          <div className="h-3 bg-white/10 rounded-full animate-pulse w-3/4" />
          <div className="h-3 bg-white/10 rounded-full animate-pulse w-full" />
          <div className="h-3 bg-white/10 rounded-full animate-pulse w-2/3" />
        </div>
      )}

      {!loading && advice && (
        <>
          <div className="mb-[7px]">
            <div
              className="text-[9px] font-semibold tracking-[0.09em] uppercase mb-[3px]"
              style={{ color: "rgba(212,64,0,0.70)" }}
            >
              Entraînement
            </div>
            <p className="text-[11.5px] leading-[1.58]" style={{ color: "#f4f4f4" }}>
              {advice.training}
            </p>
          </div>
          <div>
            <div
              className="text-[9px] font-semibold tracking-[0.09em] uppercase mb-[3px]"
              style={{ color: "rgba(212,64,0,0.70)" }}
            >
              Récupération
            </div>
            <p className="text-[11.5px] leading-[1.58]" style={{ color: "#f4f4f4" }}>
              {advice.recovery}
            </p>
          </div>
        </>
      )}

      {!loading && !advice && (
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          Renseigne ton wellness pour obtenir des conseils personnalisés.
        </p>
      )}
    </div>
  );
}
