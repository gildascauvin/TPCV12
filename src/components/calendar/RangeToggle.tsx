"use client";

import ViewToggleButton from "./ViewToggleButton";

export type RangeMode = "week" | "month";

/* Toggle 7 jours / 4 semaines pour la fenêtre des graphiques Charge/Récupération sur /conseils et
   /coach/athletes — même bouton unique dynamique que CalendarHeader.tsx (ViewToggleButton.tsx,
   2026-09-01), mais indépendant : ne pilote ni la navigation par jour ni l'affichage du strip de
   jours (contrairement à CalendarHeader.viewMode, qui bascule vers une grille calendaire mensuelle
   sur /week et /coach/planning — sémantique différente, pas réutilisable telle quelle ici). Rendu
   via le slot `extraControls` de CalendarHeader, même emplacement (haut-droite). */
export default function RangeToggle({ mode, onChange }: { mode: RangeMode; onChange: (m: RangeMode) => void }) {
  return <ViewToggleButton mode={mode} onChange={onChange} />;
}
