"use client";

import type { DecisionCard } from "@/lib/decisionCard";

/* Ligne "Phase" de la carte décision (2026-09-29, POC `insight-du-jour`) — rendue dans le slot
   `actions` d'AlertBox, sous le titre et la ligne 2. Avant le ressenti du jour : moitié charge en
   clair, puis la vraie phrase floutée derrière le CTA (flou plutôt que cadenas). `onUnlock` absent
   (Coach Control : le coach ne remplit pas le ressenti à la place du sportif) = pas de flou ni de CTA. */
export default function PhaseLine({ phase, onUnlock, onEdit }: {
  phase: NonNullable<DecisionCard["phase"]>;
  onUnlock?: () => void;
  /* Retour au formulaire de ressenti quand il est DÉJÀ rempli (2026-09-30) — un ✎ discret au bout
     de l'eyebrow. Nécessaire depuis que le ring et la ligne "Ressenti du jour" ont disparu de
     /today : tous les autres déclencheurs (ouverture auto du matin, garde avant de terminer une
     séance, le CTA flouté ci-dessous) ne partent que tant que le ressenti n'est PAS rempli, donc
     plus rien ne permettait de corriger un check-in après coup. Absent = rien de rendu (Coach
     Control : le coach ne remplit pas le ressenti à la place du sportif). */
  onEdit?: () => void;
}) {
  return (
    <div style={{ borderTop: "1px dashed rgba(255,255,255,.2)", paddingTop: 10, textAlign: "center" }}>
      {(phase.title || onEdit) && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 5, fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,.6)" }}>
          {phase.title && <>
            Phase
            <span style={{ color: "#fff", background: "rgba(255,255,255,.14)", borderRadius: 999, padding: "1px 7px", letterSpacing: "0.04em" }}>{phase.title}</span>
          </>}
          {onEdit && (
            <button
              onClick={onEdit}
              title="Modifier mon ressenti du jour"
              style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "rgba(255,255,255,.45)", fontSize: 11, lineHeight: 1 }}
            >
              ✎
            </button>
          )}
        </div>
      )}
      <div style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: "rgba(255,255,255,.92)" }}>{phase.text}</div>
      {phase.lockedText && onUnlock && (
        <div style={{ position: "relative", marginTop: 8, borderRadius: 12, overflow: "hidden" }}>
          <div aria-hidden="true" style={{ filter: "blur(5px)", userSelect: "none", fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: "rgba(255,255,255,.85)", padding: "4px 2px" }}>
            {phase.lockedText}
          </div>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", background: "rgba(7,10,13,.35)" }}>
            <button
              onClick={onUnlock}
              style={{ border: "none", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800, borderRadius: 999, padding: "9px 16px", background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.35)" }}
            >
              Renseigner mon ressenti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
