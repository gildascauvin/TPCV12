"use client";

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

/* Freemium "dispositif éteint" (2026-09-30, POC https://claude.ai/artifact/GBoj2wydy4kK8N8skjTAwW) :
   ce qui entre (check-in, séances, programmes) est gratuit, ce qui sort (décision, analyses) est
   payant. Une sortie verrouillée garde son VRAI contenu, flouté, avec l'action par-dessus — jamais un
   cadenas sur la navigation (voir feedback flou plutôt que cadenas). `locked=false` = rendu brut. */
export default function LockedBlur({ locked, surface, onUnlock, title, sub, cta = "Activer l'ajustement", compact = false, light = false, bare = false, top = false, radius = 16, children }: {
  locked: boolean;
  /** Identifiant PostHog de l'emplacement (today_decision, coach_card, history…). */
  surface: string;
  onUnlock: () => void;
  title?: string;
  sub?: string;
  cta?: string;
  /** Bouton seul, plus petit — pour les blocs bas (chart, liste). */
  compact?: boolean;
  /** Posé sur une carte blanche (Planning) : voile et textes sombres. */
  light?: boolean;
  /** Flou seul, sans action — pour les éléments répétés (une ligne de liste) dont l'action vit
      déjà sur un bloc voisin, pour ne pas afficher N boutons identiques. */
  bare?: boolean;
  /** Bloc haut (onglet entier) : l'action se pose en haut plutôt qu'au milieu, hors écran. */
  top?: boolean;
  radius?: number;
  children: React.ReactNode;
}) {
  const tracked = useRef(false);
  useEffect(() => {
    if (locked && !tracked.current) {
      tracked.current = true;
      posthog.capture("locked_view", { surface });
    }
  }, [locked, surface]);

  if (!locked) return <>{children}</>;
  return (
    <div style={{ position: "relative", borderRadius: radius, overflow: "hidden" }}>
      <div aria-hidden="true" style={{ filter: "blur(14px)", opacity: .55, userSelect: "none", pointerEvents: "none" }}>
        {children}
      </div>
      {!bare && <div style={{
        position: "absolute", inset: 0, zIndex: 3, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: top ? "flex-start" : "center", gap: 8, padding: top ? "72px 14px 14px" : 14, textAlign: "center",
        /* Pancarte (2026-10-02, POC GBoj2wydy4kK8N8skjTAwW) : posée directement sur le flou, sans
           voile ni fond ; le titre garde une ombre pour rester lisible. */
        background: light ? "rgba(255,255,255,.4)" : "transparent",
      }}>
        {title && <div style={{ fontSize: 15, fontWeight: 800, color: light ? "#171b1f" : "#fff", lineHeight: 1.25, maxWidth: 280, textShadow: light ? undefined : "0 2px 12px rgba(0,0,0,.6)" }}>{title}</div>}
        {sub && <div style={{ fontSize: 12.5, fontWeight: 600, color: light ? "#62686e" : "rgba(255,255,255,.75)", lineHeight: 1.4, maxWidth: 260 }}>{sub}</div>}
        <button
          onClick={e => { e.stopPropagation(); posthog.capture("unlock_click", { surface }); onUnlock(); }}
          style={compact
            ? { border: "1px solid rgba(255,255,255,.25)", cursor: "pointer", color: "#fff", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "7px 13px", background: "rgba(7,10,13,.6)" }
            : { border: "none", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800, borderRadius: 999, padding: "9px 16px", background: "#D44000" }}
        >
          {cta}
        </button>
      </div>}
    </div>
  );
}
