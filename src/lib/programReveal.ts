/* Programmes faits par ThePerfClub dévoilés à J+7 (2026-10-05, POC
   https://claude.ai/artifact/PQhiKbC6uJHMYJxaLMKNF3). Côté sportif uniquement : au-delà de 7 jours,
   une séance garde son nom, sa jauge et sa phase, ses exercices sont floutés jusqu'à J-7. Le coach
   (auteur) et les programmes importés/vierges voient tout. Masquage d'affichage seulement : les
   séances existent déjà en base dès l'assignation. */
import { addDaysStr } from "@/lib/programSchedule";

export const REVEAL_DAYS = 7;

export function isThePerfClubProgram(origin: string | null | undefined): boolean {
  return origin === "template" || origin === "generated";
}

function shortDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** Libellé de dévoilement d'une séance datée, null si elle est déjà dévoilée. */
export function revealLabel(sessionDate: string, todayStr: string): string | null {
  if (sessionDate <= addDaysStr(todayStr, REVEAL_DAYS)) return null;
  return `Se dévoile le ${shortDate(addDaysStr(sessionDate, -REVEAL_DAYS))}`;
}

export const NOT_STARTED_LABEL = "Se dévoile semaine après semaine une fois démarré";
