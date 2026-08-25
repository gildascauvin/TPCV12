"use client";

export type TestsSection = "load" | "tests";

/* Tabs "Charge & Récupération / Tests de performance" — mêmes libellés et même structure des deux
   côtés (inspiré d'un POC UX fourni par Gildas, principe "cohérence inter-rôles") : posées en haut
   de page sur /conseils (sportif, un seul "sujet"), et à l'intérieur de chaque carte dépliée sur
   /coach/athletes (une paire par athlète, pas un mode global — deux athlètes peuvent être chacun
   sur un onglet différent). Remplace l'ancien DataModeToggle (toggle de page unique). */
export default function SectionTabs({ active, onChange }: { active: TestsSection; onChange: (s: TestsSection) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(0,0,0,.08)", marginBottom: 16 }}>
      {([
        { key: "load" as const, label: "⚡ Charge & Récupération" },
        { key: "tests" as const, label: "🧪 Tests de performance" },
      ]).map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            border: "none", background: "transparent", cursor: "pointer",
            padding: "11px 14px", marginBottom: -1,
            borderBottom: active === t.key ? "2px solid #d44000" : "2px solid transparent",
            color: active === t.key ? "#d44000" : "#62686e",
            fontSize: 13, fontWeight: 800, whiteSpace: "nowrap",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
