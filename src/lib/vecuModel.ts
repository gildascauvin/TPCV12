/* Onboarding vécu (2026-11-15, POC https://claude.ai/artifact/61zkoU967UzqLb2dSTYGko v40) : calculs purs
   des écrans « Ce que tes réponses disent » et « Ce que tu gagnes », à partir de ses réponses. Les chiffres
   sont des estimations tirées de ses réponses (heures, semaine type, part des séances à ajuster), jamais
   présentés comme des mesures. */
import type { ObGoal } from "@/components/onboarding/PostSignupSteps";
import { parseAndApply } from "./loadAdjust";

export type VecuFamily = "force" | "endurance" | "collectif" | "mixte";
export type VecuHabits = { sleep: number | null; stress: number | null; recovery: number | null };

export const FREQ_OPTIONS: { label: string; value: number }[] = [
  { label: "2 séances", value: 2 }, { label: "3 séances", value: 3 }, { label: "4 séances", value: 4 }, { label: "5 ou plus", value: 5 },
];
export const STAG_OPTIONS: { label: string; months: number }[] = [
  { label: "Elles progressent encore", months: 0 }, { label: "Depuis 1 à 3 mois", months: 2 },
  { label: "Depuis 3 à 6 mois", months: 4.5 }, { label: "Plus de 6 mois", months: 6 },
];

/* Les 8 comportements négatifs du point forme (mêmes clés que WellnessModal, libellés de la semaine). */
export const VECU_BEHAVIORS: { key: string; emoji: string; label: string }[] = [
  { key: "late_sleep", emoji: "🌙", label: "Couché tard" }, { key: "screen_late", emoji: "📱", label: "Écran tard" },
  { key: "alcohol", emoji: "🍷", label: "Alcool" }, { key: "social_out", emoji: "🎉", label: "Sorties" },
  { key: "caffeine_late", emoji: "☕", label: "Caféine tard" }, { key: "heavy_meal", emoji: "🍔", label: "Repas lourd" },
  { key: "travel", emoji: "✈️", label: "Voyages" }, { key: "tobacco", emoji: "🚬", label: "Tabac" },
];
export function behaviorLabels(keys: string[]): string[] {
  return VECU_BEHAVIORS.filter(b => keys.includes(b.key)).map(b => b.label);
}
/* « Couché tard, écran tard et 1 autre » : deux comportements nommés au plus. */
export function behaviorPhrase(keys: string[]): string {
  const l = behaviorLabels(keys).map((x, i) => (i ? x.toLowerCase() : x));
  if (l.length <= 2) return l.join(", ");
  const rest = l.length - 2;
  return `${l.slice(0, 2).join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
}

/* Réactions (16/11, Gildas : ton d'ingénieur de course, un constat court puis l'action ; « on » = ThePerfClub). */
export function sportReaction(_label: string, fam: VecuFamily): string {
  /* 18/11, Gildas : plus court. Constat, puis ce qu'on fait. */
  if (fam === "endurance") return "Ton allure est fixée, mais ton effort varie avec ta nuit. On ajuste tes séances.";
  if (fam === "collectif") return "Ta charge change chaque semaine. Ta prépa physique suit.";
  if (fam === "force") return "Ton programme est fixe, mais ta récupération varie. On ajuste tes séances.";
  return "Force, cardio, technique : tout puise dans ta récupération. On ajuste tes séances.";
}

export function goalReaction(goal: ObGoal, fam: VecuFamily): string {
  if (goal === "volume") return "Ton volume monte si ta récupération suit. On ajuste chaque semaine.";
  if (goal === "competition") return "Avant une échéance, une séance forcée se paie. On protège tes séances clés.";
  if (goal === "intensite") {
    if (fam === "force") return "Tes records se font frais. On les place les bons jours.";
    if (fam === "endurance") return "Ta vitesse se gagne frais. On place tes séances de qualité les bons jours.";
    return "L'explosivité se travaille frais. On la place les bons jours.";
  }
  return "La régularité prime. Un jour de fatigue : séance allégée, pas sautée.";
}

/* Réaction coach à l'objectif du groupe (18/11, Gildas : dire ce qui se joue, et pour qui). */
export function coachGoalReaction(goal: ObGoal, fam: VecuFamily): string {
  if (goal === "volume") return "Leur volume monte si leur récupération suit. On ajuste chaque semaine.";
  if (goal === "competition") return "Avant une échéance, une séance forcée se paie. On protège leurs séances clés.";
  if (goal === "intensite") {
    if (fam === "force") return "Leurs records se font frais. On les place les bons jours.";
    if (fam === "endurance") return "Leur vitesse se gagne frais. On place leurs séances de qualité les bons jours.";
    return "Leur explosivité se travaille frais. On la place les bons jours.";
  }
  return "La régularité prime. Un jour de fatigue : séance allégée, pas sautée.";
}

/* « Ton {objectif} se joue là » : groupe nominal de son objectif. */
export function goalPhrase(goal: ObGoal | null, fam: VecuFamily): string {
  if (goal === "volume") return "ta capacité de travail";
  if (goal === "competition") return "ton échéance";
  if (goal === "intensite") return fam === "force" ? "tes prochains records" : fam === "endurance" ? "ta vitesse" : "ton explosivité";
  return "ta progression";
}

export const FREQ_REACTIONS = [
  "Chaque séance doit tomber un bon jour. On ajuste celles qui n'y tombent pas.",
  "Trois séances, rarement trois jours de forme pareils. On ajuste chacune.",
  "À ce rythme, ta récupération décide. On ajuste tes séances sur elle.",
  "À ce volume, une semaine de fatigue fait reculer tout le cycle. On ajuste avant.",
];
export const STAG_REACTIONS = [
  "Tu progresses encore. On surveille ta charge pour que ça dure.",
  "Premier plateau. Souvent, des séances lourdes placées des jours de fatigue.",
  "Le volume est là. Il manque l'ajustement à ta récupération.",
  "Plus de 6 mois au même niveau. Il manque l'ajustement à ta forme réelle.",
];
/* Jours d'entraînement (0 = lundi) : la plus longue suite de jours d'affilée, semaine en boucle. */
export function longestRun(days: number[]): number {
  if (days.length >= 7) return 7;
  const set = new Set(days);
  let best = 0;
  for (const d of days) {
    if (set.has((d + 6) % 7)) continue;
    let n = 1;
    while (set.has((d + n) % 7)) n++;
    best = Math.max(best, n);
  }
  return best;
}
/* Semaine conseillée (illustration de la réaction aux jours) : dans chaque suite de jours d'affilée, on
   alterne dure, légère, dure… ; un jour isolé est une séance dure. */
export function dayPlan(days: number[]): Record<number, "dure" | "legere"> {
  const set = new Set(days), out: Record<number, "dure" | "legere"> = {};
  const starts = days.filter(d => !set.has((d + 6) % 7));
  const seeds = starts.length ? starts : [Math.min(...days)];
  for (const st of seeds) {
    for (let i = 0; i < 7 && set.has((st + i) % 7); i++) {
      const d = (st + i) % 7;
      if (out[d]) break;
      out[d] = i % 2 === 0 ? "dure" : "legere";
    }
  }
  return out;
}
/* Réaction aux jours : la récupération entre les séances, et le conseil d'alterner si elle manque. */
export function daysReaction(days: number[]): string {
  const n = days.length, run = longestRun(days);
  if (n >= 6) return `${n} jours sur 7, peu de marge de récupération. On alterne dur et léger.`;
  if (run >= 3) return `${run} jours d'affilée. Une séance dure, une légère, jamais deux dures de suite.`;
  if (run === 2) return "Deux jours qui se suivent : la séance dure le premier, la légère le lendemain.";
  if (n <= 1) return "Une séance par semaine. On la cale sur ta forme du jour pour qu'elle porte.";
  return "Une journée de récupération entre chaque séance. Reste à régler chacune sur ta forme du jour.";
}

/* Temps de lecture d'une réaction : ~16 caractères par seconde, entre 3,5 et 6 s. Un tap passe. */
export function reactionMs(text: string): number {
  return Math.max(3500, Math.min(6000, Math.round(text.length / 16 * 1000)));
}

/* Part de chaque habitude défavorable (0..~0,8) : sommeil et corps bas, stress haut. */
function habP(h: VecuHabits, k: "sleep" | "stress" | "sore"): number {
  if (k === "sleep") return h.sleep == null ? 0 : (10 - h.sleep) / 10 * 0.8;
  if (k === "stress") return h.stress == null ? 0 : h.stress / 10 * 0.8;
  return h.recovery == null ? 0 : (10 - h.recovery) / 10 * 0.7;
}
export function soreShare(h: VecuHabits): number { return habP(h, "sore"); }

/* Score de forme habituel (même moyenne que l'anneau du point forme : stress inversé). */
export function habitsScore(h: VecuHabits): number | null {
  const v = [h.sleep, h.stress == null ? null : 10 - h.stress, h.recovery].filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / (v.length * 10) * 100) : null;
}

/* Semaine type (score sur 100 par jour) tirée des habitudes ; chaque comportement creuse un jour. */
const DAY_ORDER = { sleep: [0, 3, 5, 1, 6, 2, 4], stress: [1, 2, 3, 4, 0, 5, 6], sore: [2, 6, 5, 1, 3, 0, 4] } as const;
const DAY_COST = { sleep: 22, stress: 14, sore: 11 } as const;
export function weekForm(h: VecuHabits, behaviors: string[]): number[] {
  return Array.from({ length: 7 }, (_, d) => {
    let v = 88 - (d % 3) * 3;
    (["sleep", "stress", "sore"] as const).forEach(k => {
      const n = Math.round(habP(h, k) * 7);
      if (DAY_ORDER[k].slice(0, n).includes(d as never)) v -= DAY_COST[k];
    });
    behaviors.forEach((_, i) => { if (d === (4 + 2 * i) % 7) v -= 7; });
    return Math.max(22, Math.min(95, v));
  });
}

/* Part estimée des séances qui tombent un jour de forme basse (bornée 12-60 %), puis « 1 séance sur R ». */
export function lowShare(h: VecuHabits): number {
  return Math.max(0.12, Math.min(0.6, 0.35 * habP(h, "sleep") + 0.25 * habP(h, "stress") + 0.2 * habP(h, "sore")));
}
export function oneIn(h: VecuHabits): number { return Math.max(2, Math.round(1 / lowShare(h))); }

const SESSION_HOURS: Record<VecuFamily, number> = { force: 1.25, endurance: 1, collectif: 1.25, mixte: 1 };
/* Heures d'entraînement depuis qu'il stagne (sinon sur 3 mois). */
export function effortHours(freq: number, stagMonths: number, fam: VecuFamily): number {
  return Math.round((stagMonths || 3) * 4.33 * freq * SESSION_HOURS[fam]);
}
export function stagPeriod(months: number): string {
  return months >= 6 ? "plus de 6 mois" : months >= 4 ? "3 à 6 mois" : "1 à 3 mois";
}

/* Date du 1er prélèvement (aujourd'hui + n jours), « mardi 1 décembre ». */
export function dayLabel(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/* Charges d'exemple en kg pour les séances du déclic (17/11, Gildas : des séries sans poids, « ça la fout
   mal »). La banque du point forme écrit « Squat 5x5 @ 80% » ou rien : on affiche une charge plausible,
   que l'anneau ajuste en kg. Exemples d'onboarding seulement, jamais enregistrés. */
const DEMO_KG: [RegExp, string][] = [
  [/^soulevé de terre roumain/i, "90 kg"], [/^soulevé de terre/i, "130 kg"], [/^front squat|^squat avant/i, "80 kg"],
  [/^back squat|^squats?(?! au poids| à vide| unipodal| clair| sauté)/i, "100 kg"], [/^développé couché/i, "80 kg"], [/^développé militaire/i, "45 kg"],
  [/^leg press/i, "160 kg"], [/^hip thrust/i, "110 kg"], [/^fentes( bulgares)?/i, "2x20 kg"], [/^rowing/i, "70 kg"],
  [/^tirage (vertical|horizontal)/i, "60 kg"], [/^épaulé-jeté|^clean & jerk/i, "80 kg"], [/^arraché(?! à vide)/i, "60 kg"],
  [/^push press/i, "60 kg"], [/^thrusters/i, "40 kg"], [/^kettlebell swings/i, "24 kg"], [/^curl/i, "2x14 kg"],
  [/^élévations latérales/i, "2x8 kg"], [/^écarté/i, "15 kg"], [/^dips lestés/i, "15 kg"], [/^tirage (arraché|épaulé)/i, "90 kg"],
];
/* Charges de démo en % de la charge max (18/11, Gildas : on ne connaît pas son niveau, pas de kg). Une ligne qui a déjà
   un % le garde ; une ligne en kg ou un exercice chargé connu reçoit un % selon les reps (≤ 3 : 85 %, ≤ 6 : 80 %,
   ≤ 10 : 70 %, au-delà : 65 %). Poids du corps, durées et distances restent tels quels. */
export function demoLoads(line: string): string {
  if (/@\s*\d+(?:[.,]\d+)?\s*%/.test(line)) return line;
  const m = line.match(/(\d+)\s*[x×]\s*(\d+)/);
  if (!m || /\d\s*(min|m|s|km)\b/.test(line.replace(/\d+(?:[.,]\d+)?\s*kg/gi, ""))) return line;
  if (/poids du corps|\bpdc\b|à vide|sans charge|bodyweight|élastique/i.test(line)) return line;
  const hasKg = /\d\s*kg\b/i.test(line);
  if (!hasKg && !DEMO_KG.some(([re]) => re.test(line.trim()))) return line;
  const reps = +m[2], pc = reps <= 3 ? 85 : reps <= 6 ? 80 : reps <= 10 ? 70 : 65;
  const base = line.replace(/\s*(?:·\s*)?(?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*kg\b/gi, "").trim();
  return `${base} @ ${pc}%`;
}

/* Ajustements de démo de l'onboarding (18/11, Gildas) : seulement les charges (mode « loads » du moteur : mêmes séries),
   et seulement sur une ligne qui porte une charge (kg ou % de la max) ; durées, reps et consignes restent telles quelles. */
export function loadOf(line: string): { v: number; unit: "kg" | "%" } | null {
  const kg = line.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kg) return { v: parseFloat(kg[1].replace(",", ".")), unit: "kg" };
  const pc = line.match(/@\s*(\d+(?:[.,]\d+)?)\s*%/);
  return pc ? { v: parseFloat(pc[1].replace(",", ".")), unit: "%" } : null;
}
export function demoAdjust(line: string, pct: number): string {
  return pct && loadOf(line) ? parseAndApply(line, pct, { mode: "loads" }) : line;
}
/* Une séance de démo entière : si au moins une ligne porte une charge, seules ces lignes bougent ; sinon (endurance,
   poids du corps) le moteur ajuste intensité ou durée, avec au moins 15 % pour qu'une durée bouge d'un vrai pas
   (pas de « 20 → 19 min »). */
export function demoAdjustLines(lines: string[], pct: number): string[] {
  if (!pct) return lines;
  if (lines.some(l => loadOf(l))) return lines.map(l => demoAdjust(l, pct));
  const p = Math.sign(pct) * Math.max(15, Math.abs(pct));
  return lines.map(l => parseAndApply(l, p, { mode: "loads" }));
}
/* « −5 % » / « −2,5 kg » : l'écart de charge d'une ligne ajustée (jeton). null si rien n'a changé. */
export function loadDelta(before: string, after: string): string | null {
  const a = loadOf(before), b = loadOf(after);
  if (!a || !b || a.unit !== b.unit || a.v === b.v) return null;
  return `${b.v < a.v ? "−" : "+"}${String(Math.round(Math.abs(b.v - a.v) * 10) / 10).replace(".", ",")} ${a.unit}`;
}
