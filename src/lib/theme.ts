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

/* Fond de page CLAIR pour /coach (2026-09-25, tentative "en local" — POC
   `~/Downloads/coach-bg-proposals (2).html`, variante "1 · Soft orange radiant") : Coach Control
   garde son principe "page claire + cartes sombres" (CoachCard/DARK_CARD_BG inchangées) — seule la
   page passe d'un aplat clair (`bg-bg` hérité de (app)/layout.tsx) à ce glow orange marque, avec le
   même traitement "top nav sans fond propre, toute la page porte le fond" que /today (voir
   CalendarHeader.tsx `seamless`). À évaluer ensuite : basculer plutôt sur DARK_CARD_BG (thème dark
   complet, comme /today) une fois vu en conditions réelles — décision explicite de Gildas, pas
   encore tranchée. */
export const COACH_PAGE_BG =
  "radial-gradient(ellipse 90% 50% at 50% -5%, rgba(249,115,22,0.14) 0%, rgba(249,115,22,0.04) 40%, transparent 70%), " +
  "radial-gradient(ellipse 50% 30% at 90% 10%, rgba(249,115,22,0.06) 0%, transparent 50%), " +
  "#f4f4f5";
