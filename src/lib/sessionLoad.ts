/* Charge d'une séance en mots (2026-11-06) : effort ressenti (CR-10) × minutes, méthode de Foster.
   Repère absolu, le même pendant la notation (piste fine de l'anneau) et dans le bilan, nouveau compte
   compris. La comparaison à la semaine reste une ligne à part, quand il y a des séances avant. */
export const LOAD_FULL = 900;

export function sessionLoad(rpe: number, minutes: number) {
  const load = rpe * minutes;
  const word = load < 150 ? "Légère" : load < 350 ? "Modérée" : load < 550 ? "Élevée" : "Très élevée";
  return { load, word, fill: Math.min(100, Math.round((load / LOAD_FULL) * 100)) };
}
