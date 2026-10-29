/* Insight après la note de fin de séance (2026-10-20, POC "Notes en un tap", même principe que le
   point forme) : une ligne seulement si c'est notable, jamais avant la note (pas d'ancrage).
   1. Écart au prévu d'au moins 2 points (dès la 1re séance, sans historique).
   2. Sinon, une note rare sur son historique : ≥ 12 séances notées sur 90 jours, |z| ≥ 1,6, et pas de
      note aussi extrême depuis au moins 7 jours.
   3. Sinon, rien. Pas de cas particulier quand la séance a une fréquence cardiaque : la note est déjà
      donnée, et la comparaison au cœur (écran suivant) dit autre chose (ressenti vs mesure). */

export interface RpeInsight { text: string; harder: boolean }
export interface RatedSession { date: string; rpe: number }

const MIN_SESSIONS = 12;
const Z = 1.6;

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
}
function sinceText(days: number) {
  if (days >= 84) return "depuis 3 mois";
  if (days >= 56) return "depuis 2 mois";
  if (days >= 28) return "depuis un mois";
  if (days >= 14) return `depuis ${Math.floor(days / 7)} semaines`;
  return `depuis ${days} jours`;
}

export function rpeInsight(rpe: number, planned: number | null, history: RatedSession[], date: string): RpeInsight | null {
  if (planned != null && planned > 0) {
    const gap = rpe - planned;
    if (gap >= 2) return { harder: true, text: `${gap >= 3 ? "Bien plus dure" : "Plus dure"} que prévu.` };
    if (gap <= -2) return { harder: false, text: `${gap <= -3 ? "Bien plus facile" : "Plus facile"} que prévu.` };
  }
  const rows = history.filter(h => h.date <= date && daysBetween(h.date, date) <= 90).sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length < MIN_SESSIONS) return null;
  const mean = rows.reduce((a, h) => a + h.rpe, 0) / rows.length;
  const sd = Math.max(0.75, Math.sqrt(rows.reduce((a, h) => a + (h.rpe - mean) ** 2, 0) / rows.length));
  const z = (rpe - mean) / sd;
  if (Math.abs(z) < Z) return null;
  const harder = z > 0;
  const last = rows.find(h => (harder ? h.rpe >= rpe : h.rpe <= rpe));
  const since = last ? daysBetween(last.date, date) : daysBetween(rows[rows.length - 1].date, date) + 1;
  if (since < 7) return null;
  const when = last ? sinceText(since) : since >= 85 ? "depuis plus de 3 mois" : "depuis le début de ton suivi";
  return { harder, text: `Ta séance la plus ${harder ? "dure" : "facile"} ${when}.` };
}
