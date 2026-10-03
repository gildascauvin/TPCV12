"use client";

/* Jour sans séance (onboarding in-app, 2026-10-01) : plus de séance démo, le jour vide devient une
   carte séance blanche (même habillage que TodaySessionCard) avec "+ Séance libre" (le bouton
   Importer a été retiré à la demande de Gildas). Utilisée sur /today,
   la carte "aujourd'hui" du Planning (variante `inline`, la colonne est déjà une carte blanche) et
   les cartes Coach Control. */
export default function EmptyDayCard({ onAddFree, perspective = "athlete", inline = false, todo, onProgram }: {
  onAddFree: () => void;
  /* Lien discret vers Programmes sous le bouton principal (sportif). */
  onProgram?: () => void;
  perspective?: "athlete" | "coach";
  /** Sans habillage de carte : posée dans un conteneur déjà blanc (colonne du Planning). */
  inline?: boolean;
  /** Tag "À faire" de la checklist d'onboarding, posé au-dessus du titre. */
  todo?: React.ReactNode;
}) {
  const hint = perspective === "coach"
    ? "Repos, ou ajoute-lui une séance du jour."
    : "Repos, ou ajoute ta séance du jour.";
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
      <button type="button" onClick={e => { e.stopPropagation(); onAddFree(); }}
        style={{ width: "100%", height: inline ? 32 : 46, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: inline ? 12 : 14, fontWeight: 800, color: "#fff", background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.22)" }}>
        + Ajouter une séance
      </button>
      {onProgram && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button type="button" onClick={e => { e.stopPropagation(); onProgram(); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#8a8f94", fontSize: inline ? 10.5 : 12, fontWeight: 700, textDecoration: "underline", fontFamily: "inherit" }}>
            Ou démarrer un programme
          </button>
        </div>
      )}
    </div>
  );
}
