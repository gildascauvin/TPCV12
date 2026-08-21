"use client";

/* Bandeau sticky "pas encore sauvegardé" (2026-08-19, chantier gating save) — au-dessus de l'app
   (avant CalendarHeader dans chaque page cliente), en flux normal (jamais position:fixed) donc
   ne recouvre rien quand on est en haut de page, puis reste visible au scroll via
   position:sticky. Affiché en permanence pour un compte free/expired (jamais pour athlete/coach
   actifs) — rend visible en continu ce que le mur au clic sur "Enregistrer" ne dit qu'au moment
   où on le déclenche.

   Réutilisée telle quelle par la sandbox (2026-08-19, visiteurs non connectés) — `onAction`
   pointe vers /register au lieu de setPaywallStep("priming"), et le nouveau prop optionnel
   `roleToggle` (absent partout ailleurs dans l'app) ajoute un petit sélecteur Sportif/Coach pour
   basculer entre les 2 URLs de la sandbox sans changer de structure. */
interface Props {
  message?: string;
  ctaLabel?: string;
  onAction: () => void;
  roleToggle?: { role: "athlete" | "coach"; onToggle: (role: "athlete" | "coach") => void };
}

export default function UnsavedBanner({
  message = "Mode démo · rien de ce que tu fais n'est encore sauvegardé.",
  ctaLabel = "Débloquer →",
  onAction,
  roleToggle,
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
      {roleToggle && (
        <div style={{ display: "flex", flexShrink: 0, gap: 2, background: "rgba(255,255,255,.08)", borderRadius: 999, padding: 2 }}>
          {(["athlete", "coach"] as const).map(r => (
            <button
              key={r}
              onClick={() => roleToggle.onToggle(r)}
              style={{
                height: 22, padding: "0 10px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 10.5, fontWeight: 900, letterSpacing: "0.02em",
                background: roleToggle.role === r ? "#fff" : "transparent",
                color: roleToggle.role === r ? "#171b1f" : "rgba(255,255,255,.6)",
              }}
            >
              {r === "athlete" ? "Sportif" : "Coach"}
            </button>
          ))}
        </div>
      )}
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
