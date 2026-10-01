import type { ProgramTemplate, SessionTemplate } from "@/types";

/* Calcul des dates des séances d'un programme assigné — partagé par l'assignation et la mise à jour
   des séances à venir après édition (POST /api/programs/[id]/resync), pour qu'un même assignment
   retombe toujours sur les mêmes dates. */

const WEEK_ORDER = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Index Date.getDay() (0=Dimanche) → jour du template.
const DOW_TO_DAY = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** 1er jour de la semaine 1 qui porte une séance — ancre de "Démarrer aujourd'hui". */
export function firstTrainingDay(template: ProgramTemplate): string | null {
  const w0 = (template.weeks[0] ?? {}) as Record<string, SessionTemplate[]>;
  return WEEK_ORDER.find(d => (w0[d] ?? []).length > 0) ?? null;
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Ancre effective : celle mémorisée, sinon le jour de semaine réel de start_date (chaque jour du
    template garde alors son jour de semaine — comportement historique). */
export function effectiveAnchor(startDate: string, dayAnchor: string | null | undefined): string {
  return dayAnchor ?? DOW_TO_DAY[new Date(`${startDate}T12:00:00`).getDay()];
}

export interface ScheduledSession { date: string; weekIdx: number; session: SessionTemplate }

export function scheduleSessions(template: ProgramTemplate, startDate: string, dayAnchor: string | null | undefined): ScheduledSession[] {
  const anchor = effectiveAnchor(startDate, dayAnchor);
  const out: ScheduledSession[] = [];
  template.weeks.forEach((week, weekIdx) => {
    Object.entries(week).forEach(([day, raw]) => {
      if (!WEEK_ORDER.includes(day)) return;
      const offset = (WEEK_ORDER.indexOf(day) - WEEK_ORDER.indexOf(anchor) + 7) % 7;
      const date = addDaysStr(startDate, weekIdx * 7 + offset);
      (raw as SessionTemplate[]).forEach(session => out.push({ date, weekIdx, session }));
    });
  });
  return out;
}
