"use client";

import { useState, useRef } from "react";

/* Badge coloré (zone ACWR/Monotonie/Strain/Récupération) avec définition au survol OU au tap —
   un `title` HTML natif est peu fiable (délai variable, invisible sur mobile tactile), donc un
   vrai petit composant, cliquable pour rester accessible sans souris. Partagé entre /conseils et
   /coach/athletes (2 tailles via `size`, mêmes couleurs/style sinon). */
export default function ZoneBadge({ label, color, definition, size = "md" }: {
  label: string; color: string; definition?: string; size?: "md" | "sm";
}) {
  const [show, setShow] = useState(false);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const ref = useRef<HTMLSpanElement>(null);
  const fontSize = size === "sm" ? 9 : 11;
  const padding = size === "sm" ? "2px 7px" : "3px 9px";

  // Le tooltip est toujours centré sur le badge par défaut — pour un badge proche du bord droit
  // (ou gauche) d'une carte, ça le fait déborder et se faire couper. On mesure sa position réelle
  // dans le viewport pour ancrer le tooltip sur le bon côté au lieu de toujours centrer.
  function updateAlign() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const xPct = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    setAlign(xPct < 30 ? "left" : xPct > 70 ? "right" : "center");
  }

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => { if (definition) { updateAlign(); setShow(true); } }}
      onMouseLeave={() => setShow(false)}
      onClick={() => { if (definition) { updateAlign(); setShow(s => !s); } }}
    >
      <span style={{
        fontSize, fontWeight: 900, color, background: `${color}22`, border: `1px solid ${color}44`,
        borderRadius: 999, padding, letterSpacing: "0.05em", textTransform: "uppercase" as const,
        whiteSpace: "nowrap" as const, display: "inline-block", cursor: definition ? "help" : undefined,
      }}>
        {label}
      </span>
      {show && definition && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)",
          zIndex: 30, background: "rgba(18,18,18,0.96)", color: "#fff", fontSize: 11, fontWeight: 600,
          padding: "9px 11px", borderRadius: 10, width: 210, lineHeight: 1.45,
          border: "1px solid rgba(255,255,255,0.13)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          whiteSpace: "normal" as const, textTransform: "none" as const, letterSpacing: "normal",
          ...(align === "left" ? { left: 0 } : align === "right" ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
        }}>
          {definition}
        </div>
      )}
    </span>
  );
}
