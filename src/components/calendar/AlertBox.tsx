"use client";

import type { DayAlert } from "@/lib/alerts";

/* Encart alerte "jour prioritaire" — sombre avec halo + pastille pulsants, extrait de DayColumn.tsx
   pour être réutilisé à l'identique dans les vues qui n'utilisent pas DayColumn (CoachPlanningClient.tsx). */
export default function AlertBox({ alert }: { alert: DayAlert }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden", margin: "0 0 12px", padding: "12px 16px", borderRadius: 18,
      background: "linear-gradient(145deg,#1a1a1a,#282828)", border: `1.5px solid ${alert.border}`,
      fontSize: 13, lineHeight: 1.4, color: "#fff", fontWeight: 600,
      boxShadow: "0 10px 24px rgba(0,0,0,.18)",
      animation: "perf-border-pulse 1.8s ease-in-out infinite",
    }}>
      <style>{`
        @keyframes perf-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.35); }
        }
        @keyframes perf-border-pulse {
          0%, 100% { border-color: ${alert.border}; box-shadow: 0 10px 24px rgba(0,0,0,.18); }
          50% { border-color: ${alert.glow}; box-shadow: 0 0 16px 3px ${alert.glow}, 0 10px 24px rgba(0,0,0,.18); }
        }
      `}</style>
      <div style={{
        position: "absolute", top: 12, right: 12,
        width: 8, height: 8, borderRadius: "50%", background: alert.glow,
        animation: "perf-pulse 1.8s ease-in-out infinite",
      }} />
      <div style={{ paddingRight: 16 }}>{alert.text}</div>
    </div>
  );
}
