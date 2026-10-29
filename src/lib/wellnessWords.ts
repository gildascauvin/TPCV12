/* Libellés des 4 questions du point forme, un par note (partagés par le formulaire et par les insights
   de fin de point forme, qui parlent en mots, jamais en chiffres). */
/* Échelles 1-10 (ScaleBars) : un libellé par note, extrémités reprises des anciens curseurs.
   Le stress est la seule question où 10 = mauvais : sa palette bleue est inversée. */
const L = (...w: string[]) => Object.fromEntries(w.map((x, i) => [i + 1, x])) as Record<number, string>;
export const SCALE_WORDS = {
  sleep: { labels: L("Très mauvais", "Mauvais", "Médiocre", "Passable", "Moyen", "Correct", "Bon", "Très bon", "Reposant", "Excellent"), inverted: false },
  stress: { labels: L("Zen total", "Très calme", "Calme", "Léger", "Modéré", "Présent", "Marqué", "Fort", "Élevé", "Très élevé"), inverted: true },
  recovery: { labels: L("Courbatures sévères", "Très douloureux", "Douloureux", "Lourd", "Raide", "Correct", "Bien", "Frais", "Très frais", "Frais et dispo"), inverted: false },
  motivation: { labels: L("Pas du tout", "Très faible", "Faible", "Peu", "Moyenne", "Correcte", "Bonne", "Forte", "Très forte", "Au max"), inverted: false },
} as const;
export type ScaleKey = keyof typeof SCALE_WORDS;
