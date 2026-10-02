/* Fond des cartes/surfaces "thème dark" de l'app — glow cyan scientifique (2026-09-25, retour de
   Gildas, POC `~/Downloads/app-screen-bg-proposals-v2.html`, variante "2 · Glow scientifique cyan
   fort"). Remplace les différents dégradés neutres ad hoc utilisés jusqu'ici (`#141414`,
   `linear-gradient(145deg,#1a1a1a,#282828)`, `#050505→#171717→#101010`...) par une seule source de
   vérité, réutilisée partout où une surface "dark theme" neutre (pas teintée par une sévérité —
   voir AlertBox.tsx DARK_COLOR_PALETTE, qui reste séparée) est affichée : top nav (CalendarHeader),
   Coach Control (CoachCard), cartes dark de /conseils et Charge/Récup côté coach. Valeur EXACTE
   fournie par Gildas, jamais une approximation. */
export const DARK_CARD_BG =
  "radial-gradient(ellipse 105% 65% at 50% -10%, rgba(56,189,248,0.32) 0%, rgba(125,211,252,0.12) 40%, transparent 65%), " +
  "radial-gradient(ellipse 55% 35% at 15% 25%, rgba(14,165,233,0.1) 0%, transparent 55%), " +
  "#070a0d";

/* Échelle d'arrondis (2026-10-02) : 5 valeurs seulement, appliquées à toute l'app. Règle : deux
   éléments posés côte à côte ou l'un sur l'autre prennent le même rayon (ex. « + Ajouter une séance »
   = rayon de la carte séance juste au-dessus ; barre « En cours » = pilule comme la navigation).
   Les cercles gardent "50%". Ne pas réintroduire d'autres valeurs. */
export const RADIUS = {
  pill: 999, // navigation, barre « En cours », badges, puces, onglets
  card: 24,  // grandes cartes, carte décision, tiroirs, modales
  block: 16, // blocs dans une carte, boutons pleine largeur, bandeaux
  control: 12, // boutons compacts, champs, petites tuiles
  chip: 8,   // valeurs dans une ligne d'exercice, mini-éléments
} as const;
