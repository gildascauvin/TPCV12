/* Séance prévue (2026-10-01, POC dispositif-éteint) : 1re question du check-in quand rien n'est au
   planning aujourd'hui. Choix en mots, jamais de chiffre, converti ici en RPE prévu. Repos = aucune
   séance créée. Module séparé pour ne pas tirer WellnessModal (chargé dynamiquement) dans le bundle. */
export type PlannedIntensity = "rest" | "easy" | "mod" | "hard";
export const PLANNED_RPE: Record<Exclude<PlannedIntensity, "rest">, number> = { easy: 3, mod: 6, hard: 8 };
export const PLANNED_LABEL: Record<Exclude<PlannedIntensity, "rest">, string> = { easy: "légère", mod: "modérée", hard: "dure" };

/* Exercice placeholder de la séance créée par le check-in (2026-10-07, POC « Séances, exos et
   ajustements ») : une ligne de texte simple terminée par « (à compléter) », pas de nouveau statut.
   La durée et le RPE donnent prise aux décisions (Alléger/Surcharger) et à la charge prévue. */
const PLANNED_MIN: Record<Exclude<PlannedIntensity, "rest">, number> = { easy: 30, mod: 45, hard: 60 };

function placeholderName(sport: string | null | undefined, intensity: Exclude<PlannedIntensity, "rest">): string {
  const s = (sport ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/halter/.test(s)) return intensity === "easy" ? "Technique haltéro" : "Séance haltéro";
  if (/velo|cycl|vtt/.test(s)) return "Sortie vélo";
  if (/course|endur|running|trail|marathon|semi|10 ?k|5 ?k/.test(s)) return { easy: "Footing", mod: "Course", hard: "Fractionné" }[intensity];
  if (/muscu|hypertroph|power|force|crossfit|fitness|hyrox/.test(s)) return "Séance muscu";
  return "Séance";
}

export function plannedPlaceholderLine(sport: string | null | undefined, intensity: Exclude<PlannedIntensity, "rest">): string {
  return `${placeholderName(sport, intensity)} ${PLANNED_MIN[intensity]} min @ RPE ${PLANNED_RPE[intensity]} (à compléter)`;
}
