/* Repères CMJ par sport : Haugen TA, Breitschädel F, Wiig H, Seiler S (2021). Countermovement Jump Height
   in National-Team Athletes of Various Sports: A Framework for Practitioners and Scientists.
   Int J Sports Physiol Perform 16(2):184-189. doi:10.1123/ijspp.2019-0964, PMID 33217727.
   Tableau 1 : moyenne ± écart-type (cm) et effectif, internationaux norvégiens testés de 1995 à 2018,
   mains sur les hanches, plateforme de force (méthode d'impulsion). null = pas de donnée pour ce sexe. */

export type CmjSexe = "h" | "f";
export type CmjNormRow = { mean: number; sd: number; n: number };
export type CmjSportNorm = { sport: string; h: CmjNormRow | null; f: CmjNormRow | null };

const r = (mean: number, sd: number, n: number): CmjNormRow => ({ mean, sd, n });

export const CMJ_NORMS: CmjSportNorm[] = [
  { sport: "Football", h: r(39.9, 3.3, 21), f: r(31.8, 4.2, 95) },
  { sport: "Handball", h: r(42.1, 5.4, 83), f: r(35.5, 4.7, 68) },
  { sport: "Volley", h: r(44.5, 5.8, 43), f: r(33.0, 4.9, 19) },
  { sport: "Beach-volley", h: r(48.1, 6.7, 38), f: r(35.7, 6.6, 20) },
  { sport: "Hockey sur glace", h: r(41.2, 5.6, 136), f: r(28.5, 4.8, 29) },
  { sport: "Sprint (100 et 200 m)", h: r(62.7, 4.8, 13), f: r(48.4, 6.0, 11) },
  { sport: "Longueur et triple saut", h: r(56.2, 7.4, 9), f: r(44.1, 5.2, 11) },
  { sport: "Lancers (athlétisme)", h: r(48.5, 9.3, 20), f: r(35.6, 4.6, 13) },
  { sport: "Haltérophilie", h: r(47.4, 7.4, 27), f: r(35.8, 4.9, 15) },
  { sport: "Powerlifting", h: null, f: r(35.0, 7.8, 9) },
  { sport: "Ski alpin", h: r(44.9, 5.5, 25), f: r(36.1, 4.5, 29) },
  { sport: "Snowboard", h: r(41.0, 5.6, 42), f: r(33.8, 3.7, 5) },
  { sport: "Lutte", h: r(42.0, 6.6, 30), f: r(28.2, 6.6, 12) },
  { sport: "Judo", h: r(41.7, 4.8, 5), f: r(28.8, 4.9, 5) },
  { sport: "Karaté", h: r(40.4, 6.0, 32), f: r(30.5, 3.2, 5) },
  { sport: "Taekwondo", h: r(39.9, 3.9, 30), f: r(28.5, 4.9, 12) },
  { sport: "Boxe", h: r(36.0, 4.6, 11), f: r(25.1, 3.0, 17) },
  { sport: "Escrime", h: r(38.0, 4.6, 6), f: r(30.7, 5.1, 5) },
  { sport: "Natation", h: r(39.7, 4.1, 15), f: r(31.1, 4.5, 5) },
  { sport: "Aviron", h: r(36.8, 7.4, 11), f: null },
  { sport: "Cyclisme sur route", h: r(31.8, 4.5, 7), f: null },
  { sport: "Tennis de table", h: r(35.9, 4.5, 19), f: null },
  { sport: "Golf", h: r(35.0, 5.0, 21), f: r(25.7, 3.9, 13) },
];

/* Sports fréquents chez nous mais absents de l'étude : proposés dans la liste pour afficher
   « pas de repère publié » plutôt qu'un chiffre emprunté à un autre sport. */
export const CMJ_SPORTS_WITHOUT_NORM = ["Basket", "Rugby", "Tennis", "Course à pied, trail", "CrossFit, Hyrox", "BMX", "Autre"];

export const CMJ_NORMS_SOURCE = {
  short: "Haugen et al., IJSPP 2021",
  full: "Haugen TA, Breitschädel F, Wiig H, Seiler S. Countermovement Jump Height in National-Team Athletes of Various Sports: A Framework for Practitioners and Scientists. Int J Sports Physiol Perform. 2021;16(2):184-189.",
  url: "https://pubmed.ncbi.nlm.nih.gov/33217727/",
};

export function cmjNormFor(sport: string, sexe: CmjSexe): CmjNormRow | null {
  return CMJ_NORMS.find(x => x.sport === sport)?.[sexe] ?? null;
}
