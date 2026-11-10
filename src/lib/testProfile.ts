/* Profil de tests de l'onglet Performance (POC « Parcours détente » v11, 10/11/2026) : groupes de
   qualités, repère CMJ par sport (Haugen 2021), test conseillé et verdict à un seul axe.
   Pas d'anneau ici : l'anneau reste réservé à l'autorégulation (décision du jour). */

import { METRIC_DISPLAY, type CardInsight, type MetricKey, type Sexe, type Verdict } from "@/lib/testNorms";
import { TEST_BATTERIES, BATTERY_TEST_METRICS } from "@/lib/testBattery";
import { METRIC_QUALITY, BATTERY_TEST_QUALITY, type Quality } from "@/lib/testQualities";
import { CMJ_NORMS, CMJ_NORMS_SOURCE, type CmjSexe } from "@/lib/cmjNorms";

export type ProfileGroup = "vitesse" | "puissance" | "reactivite" | "force" | "endurance" | "autres";

export const PROFILE_GROUPS: { key: Exclude<ProfileGroup, "autres">; label: string; emoji: string; qualities: Quality[] }[] = [
  { key: "vitesse", label: "Vitesse", emoji: "🏃", qualities: ["vitesse", "agilite"] },
  { key: "puissance", label: "Puissance", emoji: "⚡", qualities: ["puissance"] },
  { key: "reactivite", label: "Réactivité", emoji: "🔁", qualities: ["reactivite"] },
  { key: "force", label: "Force", emoji: "🏋️", qualities: ["force"] },
  { key: "endurance", label: "Endurance", emoji: "🫀", qualities: ["endurance"] },
];
export const OTHER_GROUP = { key: "autres" as const, label: "Autres tests", emoji: "🧪" };

export function groupOfQualities(qs: readonly Quality[] | null | undefined): ProfileGroup {
  const q = qs?.[0];
  if (!q) return "autres";
  return PROFILE_GROUPS.find(g => g.qualities.includes(q))?.key ?? "autres";
}
export const groupOfMetric = (m: MetricKey): ProfileGroup => groupOfQualities(METRIC_QUALITY[m]);
export const groupOfBatteryTest = (name: string): ProfileGroup => groupOfQualities(BATTERY_TEST_QUALITY[name]);
export function groupMeta(g: ProfileGroup) {
  return g === "autres" ? OTHER_GROUP : PROFILE_GROUPS.find(x => x.key === g)!;
}

/* ── Repère CMJ par sport (Haugen et al. 2021) ────────────────────────────────────────────────── */

const CMJ_SPORT_PATTERNS: [RegExp, string][] = [
  [/beach/, "Beach-volley"],
  [/foot|soccer/, "Football"],
  [/hand/, "Handball"],
  [/volley/, "Volley"],
  [/hockey/, "Hockey sur glace"],
  [/longueur|triple/, "Longueur et triple saut"],
  [/lancer|poids|disque|javelot|marteau/, "Lancers (athlétisme)"],
  [/sprint|100 ?m|200 ?m|athl[ée]tisme/, "Sprint (100 et 200 m)"],
  [/halt[ée]ro/, "Haltérophilie"],
  [/powerlift|force athl/, "Powerlifting"],
  [/ski/, "Ski alpin"],
  [/snowboard/, "Snowboard"],
  [/lutte/, "Lutte"],
  [/judo/, "Judo"],
  [/karat[ée]/, "Karaté"],
  [/taekwondo/, "Taekwondo"],
  [/boxe/, "Boxe"],
  [/escrime/, "Escrime"],
  [/natation|nage/, "Natation"],
  [/aviron/, "Aviron"],
  [/cyclisme|v[ée]lo/, "Cyclisme sur route"],
  [/tennis de table|ping/, "Tennis de table"],
  [/golf/, "Golf"],
];
const CMJ_SHORT: Record<string, string> = {
  "Football": "foot", "Handball": "hand", "Volley": "volley", "Beach-volley": "beach-volley",
  "Hockey sur glace": "hockey", "Sprint (100 et 200 m)": "sprint", "Longueur et triple saut": "sauts",
  "Lancers (athlétisme)": "lancers", "Haltérophilie": "haltéro", "Ski alpin": "ski", "Cyclisme sur route": "cyclisme",
  "Tennis de table": "tennis de table",
};

/** Sport du profil (texte libre) ou sport de l'étude → ligne de l'étude, `null` si absent de l'étude. */
export function cmjNormSport(sport: string | null | undefined): string | null {
  if (!sport) return null;
  if (CMJ_NORMS.some(x => x.sport === sport)) return sport;
  const s = sport.toLowerCase();
  return CMJ_SPORT_PATTERNS.find(([re]) => re.test(s))?.[1] ?? null;
}
export const cmjSportShort = (normSport: string) => CMJ_SHORT[normSport] ?? normSport.toLowerCase();

/** Puissance de pointe estimée (Sayers et al. 1999), en W. */
export function sayersWatts(heightCm: number, massKg: number): number {
  return 60.7 * heightCm + 45.3 * massKg - 2055;
}

/* Échelle 0-100 commune aux cartes : 52,5 à la moyenne, 12,5 points par écart-type. La bande
   « Proche » de la prod (40 à 65) correspond donc à ±1 écart-type autour de la moyenne. */
export function cmjHaugenInsight(sport: string | null | undefined, sexe: Sexe, latestCm: number | null): CardInsight | null {
  const normSport = cmjNormSport(sport);
  if (!normSport || !sexe) return null;
  const row = CMJ_NORMS.find(x => x.sport === normSport)?.[(sexe === "femme" ? "f" : "h") as CmjSexe];
  if (!row) return null;
  const { mean, sd } = row;
  const norms: [number, number] = [mean - 4.2 * sd, mean + 3.8 * sd];
  const score = latestCm == null ? null : Math.max(0, Math.min(100, 52.5 + 12.5 * (latestCm - mean) / sd));
  const fr1 = (v: number) => `${(Math.round(v * 10) / 10).toString().replace(".", ",")} cm`;
  return {
    id: "cmjHaugen", kind: "absolute", primaryMetric: "cmjHeight", label: METRIC_DISPLAY.cmjHeight.name,
    compareLabel: `internationaux ${cmjSportShort(normSport)}`,
    targetPrefix: `Moyenne internationaux ${cmjSportShort(normSport)}`,
    targetInfo: `Internationaux norvégiens, ${sexe === "femme" ? "femmes" : "hommes"} (${row.n}). Mesurés sur plateforme de force, mains sur les hanches : au temps de vol, c'est un ordre de grandeur. ${CMJ_NORMS_SOURCE.short}.`,
    desc: `Ton saut face à la moyenne des internationaux de ton sport (${CMJ_NORMS_SOURCE.short}).`,
    advice: "Un saut sous ton repère se travaille avec de la force lourde (squat) puis de la pliométrie (sauts, rebonds) en fin de bloc.",
    fmt: fr1, norms, refValue: mean, refValueDisplay: fr1(mean),
    value: latestCm, score, status: score == null ? null : score >= 65 ? "green" : score >= 40 ? "amber" : "red",
    locked: latestCm == null ? { kind: "primary" } : null,
  };
}

/* ── Test conseillé ───────────────────────────────────────────────────────────────────────────── */

const BATTERY_PATTERNS: [RegExp, string][] = [
  [/foot|soccer/, "football"], [/basket/, "basketball"], [/rugby/, "rugby"], [/hand/, "handball"],
  [/volley/, "basketball_volley"], [/trail/, "trail"], [/course|running|marathon|semi|10 ?k|5 ?k|endurance/, "endurance"],
  [/v[ée]lo|cyclisme/, "velo"], [/natation|nage/, "natation"], [/halt[ée]ro/, "haltero"], [/powerlift/, "powerlifting"],
  [/muscu|force|hypertroph/, "musculation"], [/sprint|athl[ée]tisme/, "sprint_athle"], [/crossfit|cross-training|hyrox|fitness/, "crossfit"],
  [/boxe|combat|judo|mma|lutte|karat|taekwondo/, "combat"], [/escalade|grimpe/, "escalade"],
];
export function batteryKeyForSport(sport: string | null | undefined): string | null {
  if (!sport) return null;
  const s = sport.toLowerCase();
  return BATTERY_PATTERNS.find(([re]) => re.test(s))?.[1] ?? null;
}

/** Tests de secours quand la batterie du sport n'a rien pour la qualité filtrée (noms exacts de testBattery.ts). */
export const FALLBACK_TEST_BY_QUALITY: Partial<Record<Quality, string>> = {
  puissance: "Squat Jump",
  vitesse: "10m départ arrêté",
  force: "1RM Back Squat",
  endurance: "Yo-Yo Intermittent Recovery Test",
  reactivite: "Drop Jump (RSI)",
  agilite: "Test T (agilité)",
};
const GROUP_RANK: Record<ProfileGroup, number> = { vitesse: 0, puissance: 1, reactivite: 2, force: 3, endurance: 4, autres: 5 };

/**
 * Le prochain test à faire : dans la batterie du sport, d'abord ceux qui ont un repère (une jauge
 * dès le 1er résultat), puis par qualité (vitesse → endurance). Suit le filtre qualité ; sinon test
 * de secours de la qualité.
 */
export function pickAdvisedTest(opts: {
  sport: string | null | undefined;
  activeQuality: Quality | null;
  isDone: (testName: string) => boolean;
  hasReference: (testName: string) => boolean;
}): string | null {
  const { sport, activeQuality, isDone, hasReference } = opts;
  const key = batteryKeyForSport(sport);
  const matchesQuality = (name: string) => !activeQuality || (BATTERY_TEST_QUALITY[name] ?? []).includes(activeQuality);
  const pool = (key ? TEST_BATTERIES[key]?.tests ?? [] : []).map(t => t.name).filter(n => matchesQuality(n) && !isDone(n));
  if (pool.length) {
    return [...pool].sort((a, b) =>
      (hasReference(b) ? 1 : 0) - (hasReference(a) ? 1 : 0) || GROUP_RANK[groupOfBatteryTest(a)] - GROUP_RANK[groupOfBatteryTest(b)]
    )[0];
  }
  const fallbacks = activeQuality
    ? [FALLBACK_TEST_BY_QUALITY[activeQuality]]
    : (["puissance", "reactivite", "vitesse", "force", "endurance", "agilite"] as Quality[]).map(q => FALLBACK_TEST_BY_QUALITY[q]);
  return fallbacks.find((n): n is string => !!n && !isDone(n)) ?? null;
}

export function sportBatteryTestNames(sport: string | null | undefined): string[] {
  const key = batteryKeyForSport(sport);
  return key ? (TEST_BATTERIES[key]?.tests ?? []).map(t => t.name) : [];
}
export const batteryTestMetrics = (name: string): MetricKey[] => BATTERY_TEST_METRICS[name] ?? [];

/* ── Profil par qualité et verdict ────────────────────────────────────────────────────────────── */

export interface GroupScore { group: ProfileGroup; score: number; weakest: CardInsight & { score: number } }

/** Une valeur par qualité = sa comparaison la plus basse (même convention que buildVerdict). */
export function groupScores(insights: CardInsight[]): GroupScore[] {
  const byGroup = new Map<ProfileGroup, CardInsight & { score: number }>();
  for (const i of insights) {
    if (i.score == null) continue;
    const g = groupOfMetric(i.primaryMetric);
    if (g === "autres") continue;
    const prev = byGroup.get(g);
    if (!prev || i.score < prev.score) byGroup.set(g, i as CardInsight & { score: number });
  }
  return Array.from(byGroup.entries()).map(([group, weakest]) => ({ group, score: weakest.score, weakest }));
}

export interface TestProfile {
  scores: GroupScore[];
  /** Verdict seulement à partir de 2 qualités avec repère. */
  verdictOn: boolean;
  /** Axe de travail général, calculé sur tous les tests (jamais sur le filtre). */
  axis: ProfileGroup | null;
  avg: number | null;
}
export function buildTestProfile(insights: CardInsight[]): TestProfile {
  const scores = groupScores(insights);
  const verdictOn = scores.length >= 2;
  const avg = scores.length ? scores.reduce((s, g) => s + g.score, 0) / scores.length : null;
  const axis = verdictOn && avg != null && avg < 65 ? [...scores].sort((a, b) => a.score - b.score)[0].group : null;
  return { scores, verdictOn, axis, avg };
}

/** Mot affiché dans l'en-tête d'une qualité. `null` = pas de mot (verdict pas encore disponible). */
export function groupWord(p: TestProfile, g: ProfileGroup, tested: boolean): { word: string; tone: "axis" | "strong" | "neutral" | "off" } | null {
  if (g === "autres") return null;
  if (!tested) return { word: "À tester", tone: "off" };
  if (!p.verdictOn) return null;
  const s = p.scores.find(x => x.group === g);
  if (!s) return { word: "Pas de repère", tone: "neutral" };
  if (p.axis === g) return { word: "Axe de travail", tone: "axis" };
  return s.score >= 65 ? { word: "Point fort", tone: "strong" } : { word: "Proche", tone: "neutral" };
}

const titleOf = (avg: number) => avg >= 65
  ? { title: "Profil solide et équilibré", emoji: "🟢", action: "Maintenir" }
  : avg >= 40 ? { title: "Une priorité claire se dégage", emoji: "🟠", action: "Prioriser" }
  : { title: "Profil en construction", emoji: "🔴", action: "Construire" };

/** Verdict « Tous » : un seul axe prioritaire, la qualité la plus faible, avec le conseil de son test le plus faible. */
export function buildAxisVerdict(p: TestProfile): (Verdict & { focus: string | null }) | null {
  if (!p.verdictOn || p.avg == null) return null;
  const t = titleOf(p.avg);
  const desc = [...p.scores].sort((a, b) => b.score - a.score);
  if (!p.axis) {
    return { ...t, focus: null, sub: `Point fort : ${groupMeta(desc[0].group).label}.` };
  }
  const axis = p.scores.find(s => s.group === p.axis)!;
  const appui = desc.find(s => s.group !== p.axis);
  return {
    ...t,
    focus: `${groupMeta(p.axis).label} (${axis.weakest.label})`,
    sub: `${axis.weakest.advice}${appui ? ` Point d'appui : ${groupMeta(appui.group).label}.` : ""}`,
  };
}

/** Verdict filtré sur une qualité : ses tests du plus faible au plus fort, conseil du plus faible. */
export function buildQualityVerdict(insights: CardInsight[], quality: Quality, qualityLabel: string): (Verdict & { focus: string | null }) | null {
  const byMetric = new Map<MetricKey, CardInsight & { score: number }>();
  for (const i of insights) {
    if (i.score == null || !METRIC_QUALITY[i.primaryMetric].includes(quality)) continue;
    const prev = byMetric.get(i.primaryMetric);
    if (!prev || i.score < prev.score) byMetric.set(i.primaryMetric, i as CardInsight & { score: number });
  }
  const ranked = Array.from(byMetric.values()).sort((a, b) => a.score - b.score);
  if (!ranked.length) return null;
  const t = titleOf(ranked.reduce((s, c) => s + c.score, 0) / ranked.length);
  // Une seule priorité (le test le plus faible de la qualité), son conseil, au plus un point d'appui :
  // le classement détaillé est déjà dans la liste de droite, filtrée.
  const appui = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  return {
    title: `${qualityLabel} : ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`, emoji: t.emoji,
    action: `${t.action} dans ${qualityLabel.toLowerCase()}`, focus: ranked[0].label,
    sub: `${ranked[0].advice}${appui ? ` Point d'appui : ${appui.label}.` : ""}`,
  };
}

/** Prochain test conseillé : 4 semaines après le dernier résultat. */
export const RETEST_DAYS = 28;
export function nextTestDate(lastIso: string): Date {
  const d = new Date(`${lastIso}T12:00:00`);
  d.setDate(d.getDate() + RETEST_DAYS);
  return d;
}
