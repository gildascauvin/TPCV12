/* Type de l'encart alerte "jour prioritaire" — utilisé par AlertBox.tsx/DayColumn.tsx.
   athleteAlertFor()/coachAlertFor() (l'ancien calcul ad hoc, dupliqué depuis TodayClient.tsx/
   CoachAthleteCard.tsx) ont été retirées (2026-09) : /week et /coach/planning utilisent désormais
   computeDecisionCard() (decisionCard.ts), le même moteur que /today et Coach Control, directement
   dans WeekClient.tsx/CoachPlanningClient.tsx — plus besoin d'une copie séparée ici. */
export type DayAlert = { border: string; glow: string; text: string };
