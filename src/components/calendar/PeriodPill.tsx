"use client";

import type { ReactNode } from "react";

/* Pilule « ‹ période › » : sélecteur de date du Planning (CalendarHeader, fond sombre) et sélecteur
   de semaine de l'éditeur de programme (fond clair). Même composant, même gabarit. */
export default function PeriodPill({ children, onPrev, onNext, prevDisabled, nextDisabled, tone = "dark", bare = false }: {
  children: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  tone?: "dark" | "light";
  /* Titre seul (CalendarHeader mode "title") : ni fond ni flèches. */
  bare?: boolean;
}) {
  const dark = tone === "dark";
  const arrow = (disabled?: boolean): React.CSSProperties => ({
    width: 28, height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    color: dark ? "rgba(255,255,255,.6)" : "#62686e", fontSize: 17, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? .3 : 1, background: "transparent", border: "none", padding: 0,
  });
  return (
    <div style={{
      display: "flex", alignItems: "center", height: 36, borderRadius: 999,
      background: bare ? "transparent" : dark ? "rgba(255,255,255,.08)" : "#f0efed",
      border: bare ? "none" : dark ? "1px solid rgba(255,255,255,.14)" : "1px solid rgba(0,0,0,.08)",
    }}>
      {!bare && onPrev && <button onClick={onPrev} disabled={prevDisabled} aria-label="Précédent" style={arrow(prevDisabled)}>‹</button>}
      {children}
      {!bare && onNext && <button onClick={onNext} disabled={nextDisabled} aria-label="Suivant" style={arrow(nextDisabled)}>›</button>}
    </div>
  );
}
