/* Photo de sport d'un sportif (public/illustrations), partagée par les bilans, l'anneau de l'Accueil et la
   carte coach (2026-11-04) : sortie de BilanCarousel pour ne pas charger tout le carrousel sur /today. */
export const SPORT_ILLU: [RegExp, string][] = [
  [/vitesse|sprint/, "sprint"], [/saut|pliom|puissance|explosiv/, "pliometrie"], [/halt/, "halterophilie"], [/power/, "powerlifting"], [/hyrox/, "hyrox"], [/muscu|crossfit|fitness/, "crossfit"],
  [/calisth|gymnast/, "gym"], [/hyrox|perte de poids|police|gendarm|pompier|gign|arm[ée]e/, "circuit"], [/trail/, "trail"],
  [/\bv[ée]lo\b|cyclis|bmx/, "velo"], [/natation/, "natation"], [/aviron/, "aviron"], [/ski/, "ski"], [/hockey/, "hockey"],
  [/martia|combat|\bmma\b/, "mma"], [/boxe/, "boxe"], [/judo/, "judo"],
  /* Sport tapé dans la recherche IA (« Autre - X ») ou famille large (2026-11-04) : chaque sport collectif a sa
     photo (un handballeur voyait du foot), tennis/padel/surf ont la leur, la prépa physique générale va au cross-training. */
  [/tennis/, "tennis"], [/padel/, "padel"], [/surf/, "surf"],
  [/pr[ée]paration physique|polyvalent|cross-training|hybrid|d[ée]velopp[ée]/, "crossfit"],
  [/escalade/, "escalade"], [/golf/, "golf"], [/voile/, "voile"], [/[ée]quitation/, "equitation"],
  [/hand/, "handball"], [/basket/, "basket"], [/rugby/, "rugby"], [/volley/, "volley"],
  [/collectif|baseball|foot/, "collectif"], [/pr[ée]vention|r[ée][ée]ducation|mobilit/, "mobilite"], [/endurance|triathlon|course/, "course"],
];
/* Cadrage vertical des illustrations en portrait (2026-11-03) : le bandeau est large, il faut viser le
   sportif, pas le haut de l'image (le filet au-dessus de l'athlète de crossfit). */
export const ILLU_Y: Record<string, string> = { halterophilie: "55%", crossfit: "62%", sprint: "48%", pliometrie: "58%", course: "42%", velo: "68%", circuit: "60%", collectif: "45%", mobilite: "45%", escalade: "40%", equitation: "30%" };
export const illuPos = (src: string) => { const k = src.match(/illustrations\/([a-z]+)\.jpg/)?.[1]; return `center ${(k && ILLU_Y[k]) || "35%"}`; };
export function sportIllustration(sport: string | null | undefined): string | null {
  const v = (sport ?? "").toLowerCase();
  const hit = v ? SPORT_ILLU.find(([re]) => re.test(v)) : undefined;
  return hit ? `/illustrations/${hit[1]}.jpg` : null;
}
