/* Couleurs du ressenti face aux mesures, partagées par les cartes « ressenti vs montre » de l'onglet
   Récupération (PhysioIndexCards) et les mini bilans (2026-11-04, Gildas : mêmes couleurs partout).
   Séance : HARDER = ressentie plus dure que mesuré, EASIER = plus facile. Nuit : LESS = mesures moins
   bonnes que le ressenti, MORE = meilleures. */
export const HARDER = "#ff8a55", EASIER = "#6ede8a", NEUTRAL = "#fff";
export const LESS = "#ffb35c", MORE = "#6da7ec", MID = "rgba(255,255,255,.55)";
export const diffColor = (d: number) => (d >= 7.5 ? "#ff8a55" : d >= 4.5 ? "#ffd27a" : "#6ede8a");
