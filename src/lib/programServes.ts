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
  { metric: "snatch", re: /arrach[ée]|snatch/i, word: "avec de l'arraché" },
  { metric: "cleanJerk", re: /[ée]paul[ée].?jet[ée]|clean (and|&) jerk|\bjerk\b/i, word: "avec de l'épaulé-jeté" },
  { metric: "cmjHeight", re: /pliom|\bsauts?\b|jump|bondissement|\bbonds?\b/i, word: "avec des sauts" },
  { metric: "sprint10m", re: /sprint|acc[ée]l[ée]ration|d[ée]part arr[êe]t[ée]/i, word: "avec des sprints" },
  { metric: "time5k", re: /footing|course [àa] pied|\brun\b|running|sortie longue|endurance fondamentale|\bvma\b|allure (marathon|semi|10 ?k|5 ?k)|fractionn[ée] course|côtes/i, word: "de course", not: /v[ée]lo|cycl|home.?trainer|natation|nage|rameur|bike|ski|aviron/i },
];

export interface ProgramServe { metric: MetricKey; label: string; word: string; perWeek: number; sessionsPerWeek: number }

/** Objectifs servis par un programme : part des séances qui travaillent le mouvement ≥ 30 %, 3 au plus. */
export function programServes(template: ProgramTemplate | null | undefined): ProgramServe[] {
  const weeks = template?.weeks ?? [];
  if (!weeks.length) return [];
  const sessions = weeks.flatMap(w => Object.values(w).flat()).filter(s => s && s.type !== "recuperation");
  if (!sessions.length) return [];
  const perWeekTotal = sessions.length / weeks.length;
  const out: ProgramServe[] = [];
  for (const r of RULES) {
    const n = sessions.filter(s => { const t = `${s.name ?? ""}\n${s.notes ?? ""}`; return r.re.test(t) && !(r.not && r.not.test(t)); }).length;
    if (n / sessions.length < 0.3) continue;
    out.push({ metric: r.metric, label: METRIC_DISPLAY[r.metric]?.name ?? r.metric, word: r.word, perWeek: Math.round((n / weeks.length) * 10) / 10, sessionsPerWeek: Math.round(perWeekTotal * 10) / 10 });
  }
  return out.sort((a, b) => b.perWeek - a.perWeek).slice(0, 3);
}

/** « 3 séances sur 4 chaque semaine avec du squat » (arrondis à la séance). */
export function serveLine(s: ProgramServe): string {
  const n = Math.max(1, Math.round(s.perWeek)), t = Math.max(n, Math.round(s.sessionsPerWeek));
  return `${n} séance${n > 1 ? "s" : ""} sur ${t} chaque semaine ${s.word}`;
}
