"use client";

export type RangeMode = "week" | "month";

/* Toggle 7 jours / 4 semaines pour la fenêtre des graphiques Charge/Récupération sur /conseils et
   /coach/athletes — même style visuel que le toggle Semaine/Mois de CalendarHeader.tsx, mais
   indépendant : ne pilote ni la navigation par jour ni l'affichage du strip de jours (contrairement
   à CalendarHeader.viewMode, qui bascule vers une grille calendaire mensuelle sur /week et
   /coach/planning — sémantique différente, pas réutilisable telle quelle ici). Rendu via le slot
   `extraControls` de CalendarHeader, même emplacement (haut-droite). */
export default function RangeToggle({ mode, onChange }: { mode: RangeMode; onChange: (m: RangeMode) => void }) {
  return (
    <div style={{ display: "flex", background: "rgba(255,255,255,.10)", borderRadius: 10, padding: 3, gap: 2 }}>
      {(["week", "month"] as RangeMode[]).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{
            height: 28, paddingLeft: 10, paddingRight: 10, borderRadius: 8, border: "none",
            background: mode === m ? "#fff" : "transparent",
            color: mode === m ? "#111" : "rgba(255,255,255,.6)",
            fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all .15s",
          }}
        >
          {m === "week" ? "Sem." : "Mois"}
        </button>
      ))}
    </div>
  );
}
