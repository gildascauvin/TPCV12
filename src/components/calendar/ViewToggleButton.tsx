"use client";

/* Bouton unique dynamique Semaine/Mois (2026-09-01) — remplace le toggle à 2 boutons partout où
   un choix binaire "vue semaine / vue mois" existe (CalendarHeader.tsx pour /week+/coach/planning,
   RangeToggle.tsx pour /conseils+/coach/athletes) : affiche le mode VERS lequel basculer (icône +
   libellé), pas le mode courant — beaucoup plus compact, nécessaire pour tenir sur mobile. Extrait
   en composant partagé pour que les 2 usages restent visuellement identiques par construction. */
export default function ViewToggleButton({ mode, onChange }: { mode: "week" | "month"; onChange: (m: "week" | "month") => void }) {
  return (
    <button
      onClick={() => onChange(mode === "week" ? "month" : "week")}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        height: 32, paddingLeft: 10, paddingRight: 12, borderRadius: 10,
        background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)",
        color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {mode === "week" ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          Mois
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4v16M12 4v16M18 4v16"/>
          </svg>
          Sem.
        </>
      )}
    </button>
  );
}
