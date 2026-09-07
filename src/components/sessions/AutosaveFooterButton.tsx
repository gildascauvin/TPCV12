"use client";

export type AutosaveFooterState = "idle" | "saving" | "saved" | "error";

/* Bouton unique du footer des drawers de séance (AddSessionModal/CoachSessionModal) — porte tout le
   feedback d'autosave à lui seul (2026-09-06) : plus de statut séparé dans le header (retiré, n'était
   plus sticky et dupliquait ce que ce bouton dit désormais). "Fermer" en idle ; spinner +
   "Enregistrement…" pendant l'écriture ; "✓ Enregistré" 1,8s puis retour à idle ; "⚠ Erreur —
   Réessayer" si l'écriture a échoué (un nouveau clic relance, voir `onClick` côté appelant).
   Jamais `disabled` — reste cliquable dans tous les états (fermeture ou retry immédiats). */
const STATE_STYLE: Record<AutosaveFooterState, { color: string; border: string; background: string }> = {
  idle: { color: "#62686e", border: "rgba(0,0,0,.12)", background: "#fff" },
  saving: { color: "#b96500", border: "#fcd34d", background: "#fffbeb" },
  saved: { color: "#16a34a", border: "#86efac", background: "#f0fdf4" },
  error: { color: "#dc2626", border: "#fecaca", background: "#fef2f2" },
};

interface Props {
  state: AutosaveFooterState;
  onClick: () => void;
  idleLabel?: string;
  style?: React.CSSProperties;
}

export default function AutosaveFooterButton({ state, onClick, idleLabel = "Fermer", style }: Props) {
  const s = STATE_STYLE[state];
  const label = state === "saving" ? "Enregistrement…" : state === "saved" ? "✓ Enregistré" : state === "error" ? "⚠ Erreur — Réessayer" : idleLabel;
  return (
    <button
      onClick={onClick}
      style={{
        height: 46, borderRadius: 14, border: `1px solid ${s.border}`, background: s.background, color: s.color,
        fontSize: 14, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        transition: "background .15s ease, border-color .15s ease, color .15s ease",
        ...style,
      }}
    >
      {state === "saving" && (
        <span style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spinBtn 0.7s linear infinite", flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}
