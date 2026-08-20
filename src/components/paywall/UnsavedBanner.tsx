"use client";

/* Bandeau sticky "pas encore sauvegardé" (2026-08-19, chantier gating save) — au-dessus de l'app
   (avant CalendarHeader dans chaque page cliente), en flux normal (jamais position:fixed) donc
   ne recouvre rien quand on est en haut de page, puis reste visible au scroll via
   position:sticky. Affiché en permanence pour un compte free/expired (jamais pour athlete/coach
   actifs) — rend visible en continu ce que le mur au clic sur "Enregistrer" ne dit qu'au moment
   où on le déclenche.

   Conçue pour être réutilisée telle quelle par la sandbox (visiteurs non connectés, chantier
   séparé, pas encore construit) — seuls `message`/`ctaLabel`/`onAction` changeraient (ex.
   "Crée ton compte pour sauvegarder" au lieu de "Débloque ton compte"), la structure reste
   identique. */
interface Props {
  message?: string;
  ctaLabel?: string;
  onAction: () => void;
}

export default function UnsavedBanner({
  message = "Mode démo · rien de ce que tu fais n'est encore sauvegardé.",
  ctaLabel = "Débloquer →",
  onAction,
}: Props) {
  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 40,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        flexWrap: "wrap",
        background: "#171b1f",
        padding: "9px 16px",
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.88)", lineHeight: 1.4 }}>
        🔓 {message}
      </span>
      <button
        onClick={onAction}
        style={{
          flexShrink: 0, height: 26, padding: "0 12px", borderRadius: 999, border: "none",
          background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
          fontSize: 11.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
