"use client";

import type { ReactNode } from "react";
import { DARK_CARD_BG } from "@/lib/theme";

/* Wrapper partagé pour les 3 pages coach (/coach, /coach/planning, /coach/athletes, 2026-09-25) —
   même trick minHeight/marginBottom/paddingBottom (étend le fond sous la clearance bottom nav de
   132px réservée par (app)/layout.tsx) que /today (TodayClient.tsx). Extrait en composant partagé
   plutôt que dupliqué : /coach/planning et /coach/athletes ont plusieurs branches de retour (empty
   state, vue "Tous", vue sportif) qui doivent chacune l'appliquer. Chaque appelant doit encore
   penser à passer `seamless` à son propre CalendarHeader — ce wrapper ne fait que peindre le fond.

   DARK_CARD_BG (glow cyan) depuis le 2026-09-26, demande de Gildas : "update l'app coach avec le
   même couleur de BG que le sportif avec le cyan". Remplace COACH_PAGE_BG (glow orange clair) —
   l'app coach abandonne donc sa convention "page claire + cartes sombres" pour la même convention
   que le sportif (page sombre + cartes claires), voir les adaptations de typo/surfaces dans les 3
   pages coach, AthleteFilterBar et CoachAthleteCard. COACH_PAGE_BG reste exporté dans theme.ts mais
   n'a plus d'appelant. */
export default function CoachPageBg({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: DARK_CARD_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      {children}
    </div>
  );
}
