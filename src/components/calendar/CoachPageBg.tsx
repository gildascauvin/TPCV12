"use client";

import type { ReactNode } from "react";
import { COACH_PAGE_BG } from "@/lib/theme";

/* Wrapper partagé pour les 3 pages coach (/coach, /coach/planning, /coach/athletes, 2026-09-25) —
   même fond COACH_PAGE_BG + même trick minHeight/marginBottom/paddingBottom (étend le fond sous la
   clearance bottom nav de 132px réservée par (app)/layout.tsx) que /today (TodayClient.tsx). Extrait
   en composant partagé plutôt que dupliqué : /coach/planning et /coach/athletes ont plusieurs
   branches de retour (empty state, vue "Tous", vue sportif) qui doivent chacune l'appliquer. Chaque
   appelant doit encore penser à passer `seamless` (+ `theme="light"`) à son propre CalendarHeader —
   ce wrapper ne fait que peindre le fond, il ne touche pas au header. */
export default function CoachPageBg({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: COACH_PAGE_BG, minHeight: "100vh", marginBottom: -132, paddingBottom: 132 }}>
      {children}
    </div>
  );
}
