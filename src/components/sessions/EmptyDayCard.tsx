"use client";

/* Jour sans séance (onboarding in-app, 2026-10-01) : plus de séance démo, le jour vide devient une
   carte séance blanche (même habillage que TodaySessionCard) avec "+ Séance libre" (le bouton
   Importer a été retiré à la demande de Gildas). Utilisée sur /today,
   la carte "aujourd'hui" du Planning (variante `inline`, la colonne est déjà une carte blanche) et
   les cartes Coach Control. */
export default function EmptyDayCard({ onAddFree, perspective = "athlete", inline = false, todo }: {
  onAddFree: () => void;
  perspective?: "athlete" | "coach";
  /** Sans habillage de carte : posée dans un conteneur déjà blanc (colonne du Planning). */
  inline?: boolean;
  /** Tag "À faire" de la checklist d'onboarding, posé au-dessus du titre. */
  todo?: React.ReactNode;
}) {
  const hint = perspective === "coach"
    ? "Repos ou séance libre. Ajoute-lui une séance, ou assigne-lui un programme depuis Programmes."
    : "Repos ou séance libre. Ajoute une séance, ou démarre un programme depuis Programmes.";
  const btn: React.CSSProperties = {
    border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff",
    borderRadius: 12, padding: "9px 8px", textAlign: "center", fontSize: 11, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  };
  return (
    <div style={inline ? undefined : {
      background: "#fff", color: "#171b1f", border: "1px solid rgba(212,64,0,.16)",
      boxShadow: "0 10px 28px rgba(0,0,0,.06)", borderRadius: 24, padding: 16, marginBottom: 9,
    }}>
      {todo}
      <div style={{ fontFamily: "var(--font-display)", fontSize: inline ? 14 : 17, fontWeight: 700, letterSpacing: "-0.02em", color: "#171b1f", marginBottom: 2 }}>
        Aucune séance aujourd'hui
      </div>
      <div style={{ fontSize: inline ? 11 : 12, color: "#62686e", marginBottom: 12, lineHeight: 1.45 }}>{hint}</div>
      <button type="button" onClick={e => { e.stopPropagation(); onAddFree(); }} style={{ ...btn, width: "100%" }}>+ Séance libre</button>
    </div>
  );
}
