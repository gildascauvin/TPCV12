"use client";

/* "point 1" (2026-09-24) — tabs de l'Accueil sportif, voir POC `poc-coach-context_4.html` :
   Entraînement/Charge/Récupération/Comportements (tabsHtml()). Même style visuel que SectionTabs.tsx
   (soulignement orange, fond dark), mais 4 entrées au lieu de 2 et un libellé propre à ce fichier —
   SectionTabs.tsx reste inchangé (toujours utilisé tel quel par /coach/athletes, hors périmètre). */
export type HomeTab = "today" | "charge" | "recuperation" | "comportements";

const TABS: { key: HomeTab; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "charge", label: "Charge" },
  { key: "recuperation", label: "Récupération" },
  { key: "comportements", label: "Comportements" },
];

export default function HomeTabs({ active, onChange, dark = true }: { active: HomeTab; onChange: (t: HomeTab) => void; dark?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "nowrap" as const, marginBottom: 16 }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            border: "none", background: "transparent", cursor: "pointer",
            padding: "11px 8px", marginBottom: -1, flexShrink: 0,
            borderBottom: active === t.key ? "2px solid #d44000" : "2px solid transparent",
            color: active === t.key ? "#ff8a55" : dark ? "rgba(255,255,255,.5)" : "#62686e",
            fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" as const,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
