/* Séance prévue (2026-10-01, POC dispositif-éteint) : 1re question du check-in quand rien n'est au
   planning aujourd'hui. Choix en mots, jamais de chiffre, converti ici en RPE prévu. Repos = aucune
   séance créée. Module séparé pour ne pas tirer WellnessModal (chargé dynamiquement) dans le bundle. */
export type PlannedIntensity = "rest" | "easy" | "mod" | "hard";
export const PLANNED_RPE: Record<Exclude<PlannedIntensity, "rest">, number> = { easy: 3, mod: 6, hard: 8 };
export const PLANNED_LABEL: Record<Exclude<PlannedIntensity, "rest">, string> = { easy: "légère", mod: "modérée", hard: "dure" };
