import type { ProgramTemplate } from "@/types";
import type { MetricKey } from "@/lib/testNorms";
import { METRIC_DISPLAY } from "@/lib/testNorms";

/* « Il sert » (P2, 24/11/2026) : ce qu'un programme travaille, lu dans le contenu de ses séances (nom
   + exercices), avec la même idée que les « séances avec du squat » d'un objectif. Rien n'est étiqueté
   à la main. Seuls les objectifs dont le mouvement se reconnaît sans ambiguïté sont proposés. */

const RULES: { metric: MetricKey; re: RegExp; word: string; not?: RegExp }[] = [
  { metric: "backSquat", re: /back squat|squat arri[èe]re|(?<!(front|overhead|goblet|split|pistol|sissy|sumo|box|wall|chaise|air|jump) )\bsquat\b(?! ?(jump|saut|saut[ée]|bulgare|bulgarian|goblet|sumo|pistol|split|unilat|au poids|poids du corps|isom))/i, word: "avec du squat" },
  { metric: "frontSquat", re: /front squat|squat avant/i, word: "avec du front squat" },
  { metric: "deadlift", re: /soulev[ée] de terre|deadlift|\bsdt\b/i, word: "avec du soulevé de terre" },
  { metric: "bench", re: /d[ée]velopp[ée] couch[ée]|bench/i, word: "avec du développé couché" },
  { metric: "pressOh", re: /d[ée]velopp[ée] militaire|overhead press|push press/i, word: "avec du développé militaire" },
  { metric: "snatch", re: /arrach[ée]|snatch|overhead squat|squat bras tendus/i, word: "avec de l'arraché", not: /tirage arrach|snatch pull|soulev[ée] de terre arrach|snatch deadlift/i },
  /* Tirages d'haltérophilie (clean / snatch deadlift, tirages) : jamais les tirages de dos (vertical, horizontal). */
  { metric: "cleanPull", re: /tirage (d'|de l')?([ée]paul[ée]|arrach[ée])|clean pull|snatch pull|high pull|soulev[ée] de terre (d'|de l')?([ée]paul[ée]|arrach[ée])|clean deadlift|snatch deadlift/i, word: "avec des tirages d'haltérophilie" },
  /* Épaulé-jeté : ses parties comptent (épaulé, jeté, tirage épaulé), comme pour l'objectif (SERVES). */
  /* « épaulé » (é final) = le mouvement ; « épaule(s) » = l'articulation, exclue. */
  { metric: "cleanJerk", re: /[ée]paulé|(?<![a-zà-ÿ])jet[ée](?![a-zà-ÿ])|power clean|hang clean|\bclean\b|\bjerk\b/i, word: "avec de l'épaulé-jeté", not: /tirage (d'|de l')?[ée]paul|clean pull|clean deadlift|soulev[ée] de terre (d'|de l')?[ée]paul/i },
  { metric: "cmjHeight", re: /pliom|\bsauts?\b|jump|bondissement|\bbonds?\b/i, word: "avec des sauts" },
  { metric: "sprint10m", re: /sprint|acc[ée]l[ée]ration|d[ée]part arr[êe]t[ée]/i, word: "avec des sprints" },
  { metric: "kneeToWall", re: /mobilit|souplesse|flexibilit|[ée]tirement|cheville|hanches|ouverture/i, word: "avec de la mobilité" },
  { metric: "test505", re: /agilit|changement(s)? de direction|appuis|navette|zig.?zag|\b505\b|illinois|shuttle|d[ée]placements? lat/i, word: "avec des changements de direction" },
  { metric: "time5k", re: /footing|course [àa] pied|\brun\b|running|sortie longue|endurance fondamentale|\bvma\b|allure (marathon|semi|10 ?k|5 ?k)|fractionn[ée] course|côtes/i, word: "de course", not: /v[ée]lo|cycl|home.?trainer|natation|nage|rameur|bike|ski|aviron/i },
];

/* Ce qui sert un objectif (24/11, revu avec Gildas : « pertinent et exhaustif ») : sa famille principale
   (poids 1) et des familles voisines qui le travaillent en partie (poids 0,5). Ex. clean deadlift = tirages
   d'haltérophilie, puis soulevé de terre et épaulé-jeté ; front squat = front squat, puis squat et épaulé-jeté. */
const P = 1, S = 0.5;
const SERVED_BY: { re: RegExp; by: [MetricKey, number][] }[] = [
  { re: /^backSquat$/, by: [["backSquat", P], ["frontSquat", S]] },
  { re: /^(frontSquat)$/, by: [["frontSquat", P], ["backSquat", S], ["cleanJerk", S]] },
  { re: /^(ohSquat|ohSquatPushPress|snatchBalance|sotsPress|snatchSotsPress)$/, by: [["snatch", P], ["pressOh", S]] },
  { re: /^(deadlift|goodMorning)$/, by: [["deadlift", P], ["cleanPull", S]] },
  { re: /^(cleanDeadlift|snatchDeadlift|cleanPull|snatchPull|snatchPullBlock|boxCleanPull|highPull)$/, by: [["cleanPull", P], ["deadlift", S], ["cleanJerk", S], ["snatch", S]] },
  { re: /^(bench)$/, by: [["bench", P]] },
  { re: /^(pressOh|press|pressBtn|pushPress|btnPressInSplit)$/, by: [["pressOh", P], ["cleanJerk", S]] },
  { re: /snatch/i, by: [["snatch", P], ["cleanPull", S]] },
  { re: /clean|jerk/i, by: [["cleanJerk", P], ["cleanPull", S], ["frontSquat", S]] },
  { re: /^(sprint|fly)/, by: [["sprint10m", P], ["cmjHeight", S]] },
  { re: /^(cmj|squatJump|dropJump|broadJump|singleLegBroadJump|tripleBroadJump)/, by: [["cmjHeight", P], ["sprint10m", S]] },
  { re: /^(test505|illinoisAgility|proAgility)$/, by: [["test505", P], ["sprint10m", S]] },
  /* Cardio (FC max, FC repos, VFC) : servis par l'endurance, comme leur qualité dans l'onglet (Gildas, 25/11). */
  { re: /^(time5k|time10k|timeSemi|timeMarathon|vma|vo2max|bronco|hrMax|hrRest|hrv)$/, by: [["time5k", P]] },
  { re: /^(ankleDorsiflexion|kneeToWall|hipInternalRotation|hipExternalRotation|shoulderFlexion|apleyScratchTest|thomasTest|activeStraightLegRaise)$/, by: [["kneeToWall", P]] },
];
/** Familles lues dans les programmes qui servent cet objectif, avec leur poids. [] si rien ne le vise. */
export function servedBy(metric: MetricKey): [MetricKey, number][] {
  return SERVED_BY.find(f => f.re.test(metric))?.by ?? (RULES.some(r => r.metric === metric) ? [[metric, P]] : []);
}
/** Famille principale (préparation du test dans une séance, tags). */
export function serveFamily(metric: MetricKey): MetricKey | null {
  return servedBy(metric)[0]?.[0] ?? null;
}

function lineMatches(r: { re: RegExp; not?: RegExp }, line: string): boolean {
  return !!line.trim() && r.re.test(line) && !(r.not && r.not.test(line));
}

export interface ProgramServe { metric: MetricKey; label: string; word: string; perWeek: number; sessionsPerWeek: number }

/** Mouvements travaillés par un programme : au moins ~1 séance par semaine (un 5/3/1 ou un programme de
    powerlifting travaille chaque mouvement une fois par semaine : un seuil en part des séances les ratait). */
export function programServes(template: ProgramTemplate | null | undefined): ProgramServe[] {
  const weeks = template?.weeks ?? [];
  if (!weeks.length) return [];
  const sessions = weeks.flatMap(w => Object.values(w).flat()).filter(s => s && s.type !== "recuperation");
  if (!sessions.length) return [];
  const perWeekTotal = sessions.length / weeks.length;
  const out: ProgramServe[] = [];
  for (const r of RULES) {
    /* Ligne par ligne : une séance « Arraché » + « Tirage arraché » compte pour l'arraché (l'exclusion des
       tirages ne vaut que pour SA ligne, bug 25/11 qui sous-comptait l'haltérophilie). */
    const n = sessions.filter(s => [s.name ?? "", ...(s.notes ?? "").split("\n")].some(l => lineMatches(r, l))).length;
    if (n / weeks.length < 0.75) continue;
    out.push({ metric: r.metric, label: METRIC_DISPLAY[r.metric]?.name ?? r.metric, word: r.word, perWeek: Math.round((n / weeks.length) * 10) / 10, sessionsPerWeek: Math.round(perWeekTotal * 10) / 10 });
  }
  return out.sort((a, b) => b.perWeek - a.perWeek);
}

/** « 3 séances sur 4 chaque semaine avec du squat » (arrondis à la séance). */
export function serveLine(s: ProgramServe): string {
  const n = Math.max(1, Math.round(s.perWeek)), t = Math.max(n, Math.round(s.sessionsPerWeek));
  return `${n} séance${n > 1 ? "s" : ""} sur ${t} chaque semaine ${s.word}`;
}

/** Le mouvement d'une mesure se reconnaît-il dans ce texte (ligne ou séance) ? Mêmes motifs que « Il sert ». */
export function lineServesMetric(metric: MetricKey, text: string): boolean {
  const fam = serveFamily(metric);
  const r = RULES.find(x => x.metric === fam);
  return !!r && text.split("\n").some(l => lineMatches(r, l));
}
export const SERVE_METRICS = new Set<MetricKey>(RULES.map(r => r.metric));
