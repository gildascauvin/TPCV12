/* Libellé court d'un sport pour la pilule d'activité du header (2026-10-03) : 9 caractères visés pour
   que la date reste au centre exact du header sur un écran de 375 px. Déduit du sport du programme
   en cours, sinon du sport du profil. Règles dans l'ordre : la plus spécifique d'abord (zone de
   rééducation avant "genou" générique, Hyrox avant fitness, sauts avant athlétisme). Couvre les
   valeurs réellement présentes en base au 2026-10-03, y compris les anciennes ("Sprint/Athlétisme",
   "Force & puissance", "Autre - surf"…). */
const RULES: [RegExp, string][] = [
  [/achille/i, "Achille"],
  [/cheville|entorse/i, "Cheville"],
  [/lombaire|lombalgie/i, "Dos"],
  [/[ée]paule|coiffe/i, "Épaule"],
  [/genou|valgus|rotulien|\blca\b/i, "Genou"],
  [/p[ée]riostite|tibia/i, "Tibia"],
  [/tendon/i, "Tendons"],
  [/pr[ée]vention|r[ée][ée]ducation/i, "Rééduc"],
  [/sapeur|pompier/i, "Pompier"],
  [/police/i, "Police"],
  [/gign/i, "GIGN"],
  [/gendarm/i, "Gendarme"],
  [/arm[ée]e|\btap\b/i, "Armée"],
  [/rugby/i, "Rugby"],
  [/basket/i, "Basket"],
  [/handball/i, "Hand"],
  [/volley/i, "Volley"],
  [/hockey/i, "Hockey"],
  [/baseball|softball/i, "Baseball"],
  [/foot/i, "Foot"],
  [/collectif/i, "Sport co"],
  [/trail|ultra/i, "Trail"],
  [/triathlon|ironman/i, "Triathlon"],
  [/nata|swim|piscine/i, "Natation"],
  // "vélo" seulement en début de mot : "Dé-velo-ppé couché" le contient (piège déjà rencontré dans
  // sportCategories.ts).
  [/cycl|bike|vtt|(^|[^a-zà-ÿ])v[ée]lo/i, "Vélo"],
  [/aviron|rowing|rameur/i, "Aviron"],
  [/\bski/i, "Ski"],
  [/course|marathon|\bsemi\b|\b10 ?k\b|running|footing|endurance/i, "Course"],
  [/boxe/i, "Boxe"],
  [/\bmma\b/i, "MMA"],
  [/judo/i, "Judo"],
  [/lutte/i, "Lutte"],
  [/combat|martia|karat[ée]|jiu|kick/i, "Combat"],
  [/hyrox/i, "Hyrox"],
  [/musculation\s*\/\s*fitness/i, "Muscu"],
  [/cross.?training|polyvalent|hybrid/i, "Hybride"],
  [/crossfit|fitness|wod/i, "CrossFit"],
  [/halt[ée]ro|arrach|[ée]paul[ée]|snatch/i, "Haltéro"],
  [/power|squat|bench|deadlift|d[ée]velopp[ée] couch[ée]|soulev[ée] de terre/i, "Power"],
  [/calisth|street ?workout|poids du corps/i, "Calisthé"],
  [/plio/i, "Plio"],
  [/perte de poids|s[èe]che|recomposition|maigrir/i, "Sèche"],
  // Libellé complet assumé (Gildas, 2026-10-03), tronqué en "…" si la place manque.
  [/force\s*&\s*puissance/i, "Force & puissance"],
  [/explosiv|puissance/i, "Puissance"],
  [/force/i, "Force"],
  [/hypertroph|muscu|prise de masse|muscle|bodybuild/i, "Muscu"],
  [/saut/i, "Sauts"],
  [/sprint|athl[ée]tisme|vitesse/i, "Sprint"],
  [/escalade|grimpe|\bbloc\b/i, "Escalade"],
  [/golf/i, "Golf"],
  [/voile|r[ée]gate|sailing/i, "Voile"],
  [/bmx/i, "BMX"],
  [/[ée]quitation|cheval|[ée]questre|\bcso\b/i, "Équi"],
  [/gymnast|agr[èe]s/i, "Gym"],
  [/padel/i, "Padel"],
  [/tennis/i, "Tennis"],
  [/surf/i, "Surf"],
  [/mobilit|souplesse|flexibilit/i, "Mobilité"],
  [/pr[ée]pa(ration)? physique/i, "Prépa"],
];

export const DEFAULT_SHORT_LABEL = "Séances";

export function sportShortLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").replace(/^autre\s*-\s*/i, "").trim();
  if (!s || /^autre$/i.test(s) || /import/i.test(s)) return DEFAULT_SHORT_LABEL;
  for (const [re, label] of RULES) if (re.test(s)) return label;
  // Sport libre inconnu : son premier mot s'il est court, sinon le libellé générique.
  const first = s.split(/[\s/—-]+/)[0];
  return first.length <= 9 ? first.charAt(0).toUpperCase() + first.slice(1) : DEFAULT_SHORT_LABEL;
}
