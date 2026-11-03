"use client";

/* Argumentaire avant paywall (2026-10-27, POC https://claude.ai/artifact/Ma3E6NB8dAAhd7HwjjuVF7).
   Rejeu : les 30 jours d'Apple Santé / Health Connect rejoués dans ob_health (apps). ob_insight : juste après le check-in, un carrousel
   d'écrans du bilan en données réelles d'un sportif ThePerfClub, le premier choisi par sa réponse la
   plus basse (« Nos données indiquent qu'un sportif stressé… »).
   Les cartes sont les vrais écrans du bilan (SlideBody de BilanCarousel), dans un cadre réduit. */

import { useEffect, useRef, useState } from "react";
import { SlideBody, KICKER, KICKER_COACH, PhotoBanner, photoFor, sportPhotoFor, ExampleCtx, ExamplePromise, EXAMPLE_N } from "@/components/bilan/BilanCarousel";
import { SCALE_WORDS, type ScaleKey } from "@/lib/wellnessWords";
import type { Bilan, BilanSlide } from "@/lib/bilan";
import { catalogEntry, findCatalogEntry } from "@/lib/sportCatalog";
import { workoutLabel } from "@/lib/healthWorkouts";
import { replayDownCount, replayUpCount, type Replay } from "@/lib/healthReplay";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };
const BOX: React.CSSProperties = { background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16 };
const DOWN = "#6da7ec", UP = "#ff8a5c";

/* ── Réponses du check-in ── */
export type Answers = { sleep: number; stress: number; recovery: number; motivation: number; behaviors?: string[] | null };
const ORDER: ScaleKey[] = ["sleep", "stress", "recovery", "motivation"];
const QLABEL: Record<ScaleKey, string> = { sleep: "Sommeil", stress: "Stress", recovery: "Récupération", motivation: "Motivation" };
/* Les mots de l'échelle sont au masculin (« douloureux », « lourd ») : « corps » pour la récupération. */
const QPHRASE: Record<ScaleKey, string> = { sleep: "sommeil", stress: "stress", recovery: "corps", motivation: "motivation" };
const good = (k: ScaleKey, v: number) => (SCALE_WORDS[k].inverted ? 11 - v : v);
/* La réponse la plus basse, seulement si elle est franchement basse (sinon : bon matin). */
export function lowestAnswer(a: Answers): ScaleKey | null {
  let best: { k: ScaleKey; g: number } | null = null;
  for (const k of ORDER) { const g = good(k, a[k]); if (g <= 5 && (!best || g < best.g)) best = { k, g }; }
  return best?.k ?? null;
}
export const answerWord = (k: ScaleKey, v: number) => SCALE_WORDS[k].labels[v].toLowerCase();
/* Les 4 réponses du point forme, relues sur l'écran de lecture (31/10). g = niveau « bon » sur 10. */
export function answerRows(a: Answers): { label: string; word: string; g: number }[] {
  return ORDER.map(k => ({ label: QLABEL[k], word: SCALE_WORDS[k].labels[a[k]] ?? "", g: good(k, a[k]) }));
}
/* « stress marqué, récupération lourde » : les deux réponses les plus basses, pour le sous-titre coach. */
export function lowWords(a: Answers): string {
  return [...ORDER].sort((x, y) => good(x, a[x]) - good(y, a[y])).slice(0, 2).filter(k => good(k, a[k]) <= 6)
    .map(k => `${QLABEL[k].toLowerCase()} ${answerWord(k, a[k])}`).join(", ");
}

/* ── Titres (écran insight et paywall), par réponse la plus basse ── */
/* sessionName : la séance de sa jauge, pour que le titre reprenne celle qu'il vient de voir. */
export function payHeadline(a: Answers, replayDown: number, sport = "", sessionName?: string): string {
  const ses = sessionName ? `séance « ${sessionName} »` : FAM[sportFamily(sport)].ses;
  // Rejeu de la montre (2026-11-02) : le vrai nombre de séances faites un jour à alléger.
  if (replayDown >= 2) return `Ce mois-ci, ${replayDown} jours à alléger sont passés inaperçus. Le prochain, ThePerfClub le voit avant ta séance.`;
  if (replayDown === 1) return "Ce mois-ci, un jour à alléger est passé inaperçu. Le prochain, ThePerfClub le voit avant ta séance.";
  const k = lowestAnswer(a);
  return {
    sleep: "Ta prochaine nuit courte ne te coûtera plus ta séance.",
    stress: `Ta prochaine journée de stress ne te coûtera plus ta ${ses}.`,
    recovery: "Tes jambes lourdes auront une explication. Et ta séance, le bon dosage.",
    motivation: "Quand l'envie baisse, ta charge se recale avant que tu décroches.",
  }[k as ScaleKey] ?? "Les bons jours, tu pousses. Les autres, ta séance s'allège avant de se rater.";
}
export function payHeadlineCoach(a: Answers, name: string, sport = "", sessionName?: string): string {
  const ses = sessionName ? `séance « ${sessionName} »` : FAM[sportFamily(sport)].ses;
  const k = lowestAnswer(a);
  return {
    sleep: `La prochaine nuit courte de ${name} ne lui coûtera plus sa séance.`,
    stress: `La prochaine journée de stress de ${name} ne lui coûtera plus sa ${ses}.`,
    recovery: `Les jambes lourdes de ${name} auront une explication. Et sa séance, le bon dosage.`,
    motivation: `Quand l'envie de ${name} baisse, sa charge se recale avant qu'il décroche.`,
  }[k as ScaleKey] ?? `Les bons jours, ${name} pousse. Les autres, tu allèges avant la séance.`;
}

/* ── Écrans du bilan ── */
const PERIOD = { kind: "week" as const, start: "2026-11-02", end: "2026-11-08" };
const BILAN: Bilan = { period: PERIOD, slides: [], title: "" };
const RECAL = { state: "kept" as const, apply: () => {}, keep: () => {} };

/* Écrans du bilan en illustration (assumé, 2026-10-27) : chiffres du bilan réel d'un sportif ThePerfClub
   quand on les a, inventés sinon. Un cas par réponse la plus basse du matin (ou « tout est bon »), décliné
   par famille de sport (2026-10-29 : pas de séance de force pour un traileur), avec sa phrase ;
   `n` = prénom côté coach (3e personne). Les autres écrans suivent dans le carrousel, avec une ligne courte. */
type CaseKey = ScaleKey | "ok";
type Card = { key: string; says?: (n?: string) => string; slide: BilanSlide };
export type SportFamily = "force" | "endurance" | "mixte" | "collectif";
export function sportFamily(sport: string): SportFamily {
  const s = sport.toLowerCase();
  if (/halt|power|muscu|force|hypertroph|strong/.test(s)) return "force";
  if (/course|trail|marath|running|run|vélo|velo|cycl|triath|natation|swim|ultra|endurance|ski/.test(s)) return "endurance";
  if (/foot|rugby|basket|hand|volley|tennis|padel|hockey|combat|boxe|judo|mma/.test(s)) return "collectif";
  return "mixte";
}
const FAM: Record<SportFamily, { ses: string; block: string; noun: string; stress: [number, number, number, number]; heavy: [number, number, number, number] }> = {
  force: { ses: "séance de force", block: "Force", noun: "force", stress: [17, 26, 13, 38], heavy: [14, 20, 12, 44] },
  endurance: { ses: "séance de fractionné", block: "Fractionné", noun: "fractionné", stress: [15, 22, 11, 34], heavy: [13, 18, 10, 41] },
  mixte: { ses: "séance la plus intense", block: "Metcon", noun: "haute intensité", stress: [16, 24, 12, 36], heavy: [14, 19, 11, 42] },
  collectif: { ses: "séance la plus intense", block: "Séance intense", noun: "haute intensité", stress: [14, 21, 10, 33], heavy: [12, 17, 9, 38] },
};
const DATES = ["2026-06-02", "2026-07-07", "2026-08-25", "2026-10-06"];
/* Sommeil bas (2026-11-03, Gildas : « Son ressenti vaut une montre » jamais dans l'onboarding) : l'écran
   « deux mauvaises nuits d'affilée », chiffres illustratifs. */
const S_SLEEP: BilanSlide = { kind: "rythmes", days: null, worst: null, next: null, soireeShare: 0, nights: { one: { part: 1, total: 5 }, two: { part: 4, total: 5 } } };
const S_FATIGUE: BilanSlide = { kind: "fatigue", soirees: 12, normScore: 71, nextScore: 62, afterScore: null, hrv: { norm: 63, next: 45 }, hard: { easy: 71, hard: 68 } };
const S_CHARGE: BilanSlide = { kind: "charge", pctInZone: 64, daysHigh: 3, daysCounted: 7, daysLow: 0, daysAbove: 3 };
const sStress = (f: SportFamily): BilanSlide => { const [a, b, c, d] = FAM[f].stress; return { kind: "predit", lead: { dim: "stress", noun: FAM[f].noun }, blocks: [{ title: `${FAM[f].block} · stress élevé`, rows: [{ label: "Les jours de stress", part: a, total: b, highlight: true }, { label: "Les autres jours", part: c, total: d }] }] }; };
/* Cartes de fond (2026-11-03, Gildas : « au pire les insights type 1 nuit pour récupérer selon son
   sport », « 124 sur 141 jours dans ta zone ») : vraies valeurs du bilan du sportif d'exemple
   (force récupérée en une nuit, vitesse en 2 jours ; 124 jours sur 141 dans sa zone). Endurance :
   fractionné / sortie longue, illustratif. */
const sRecup = (f: SportFamily): BilanSlide => f === "endurance"
  ? { kind: "recup", norm: 69, families: [{ noun: "fractionné", days: 1, n: 9, steps: [{ label: "Le lendemain", felt: 67, back: true }] }, { noun: "sortie longue", days: 2, n: 6, steps: [{ label: "Le lendemain", felt: 61, back: false }, { label: "2 jours après", felt: 68, back: true }] }] }
  : { kind: "recup", norm: 69, families: [{ noun: "force", days: 1, n: 8, steps: [{ label: "Le lendemain", felt: 67, back: true }] }, { noun: "vitesse", days: 2, n: 6, steps: [{ label: "Le lendemain", felt: 61, back: false }, { label: "2 jours après", felt: 68, back: true }] }] };
const S_ZONE: BilanSlide = { kind: "charge", pctInZone: 88, daysHigh: 8, daysCounted: 141, daysLow: 9, daysAbove: 8 };
const sHeavy = (f: SportFamily): BilanSlide => { const [a, b, c, d] = FAM[f].heavy; return { kind: "predit", lead: { dim: "recovery", noun: FAM[f].noun }, blocks: [{ title: `${FAM[f].block} · corps fatigué`, rows: [{ label: "Les jours corps fatigué", part: a, total: b, highlight: true }, { label: "Les autres jours", part: c, total: d }] }] }; };
/* Test d'exemple dans le vocabulaire du sport (31/10, Gildas : « Burpees en 3 min » trop vague, squat jump
   réservé aux sports explosifs). Clé = valeur du catalogue ; sport hors catalogue : test de la famille. */
type TestEx = { name: string; unit: string; pct: number; values: number[] };
const T = (name: string, unit: string, values: number[]): TestEx => ({ name, unit, values, pct: Math.round((values[3] / values[0] - 1) * 100) });
const VMA = T("VMA", "km/h", [16, 16.4, 16.8, 17]);
const SJ = T("Squat jump", "cm", [38, 40.5, 42.2, 44.8]);
const SPORT_TESTS: Record<string, TestEx> = {
  "Haltérophilie": T("Arraché", "kg", [70, 72, 74, 76]),
  "Powerlifting": T("Squat", "kg", [140, 145, 150, 155]),
  "Musculation / Hypertrophie": T("Développé couché", "kg", [80, 82.5, 85, 87.5]),
  "Calisthenics": T("Tractions strictes", "reps", [12, 13, 14, 16]),
  "Gymnastique": T("Tractions strictes", "reps", [12, 13, 14, 16]),
  "Puissance & explosivité": SJ, "Pliométrie": SJ, "Ski": SJ, "BMX": SJ, "Hockey sur glace": SJ, "Arts martiaux & combat": SJ,
  "Perte de poids": T("Pompes en 1 min", "reps", [20, 23, 26, 28]),
  "Fitness / CrossFit": T("Épaulé-jeté", "kg", [70, 73, 76, 79]),
  "Hyrox": VMA, "Endurance": VMA, "Trail": VMA, "Triathlon": VMA,
  "Vélo / Cyclisme": T("FTP", "W", [230, 238, 245, 252]),
  "Natation": T("Nage en 12 min", "m", [700, 730, 760, 790]),
  "Aviron": T("Puissance sur 2 000 m", "W", [250, 258, 265, 272]),
  "Athlétisme & vitesse": T("Vitesse max", "km/h", [32, 32.6, 33.1, 33.8]),
  "Athlétisme — Sauts": T("Détente verticale", "cm", [45, 47, 48.5, 50.5]),
  "Sports collectifs": T("Détente verticale", "cm", [41, 42.5, 44, 46]),
  "Baseball": T("Lancer de médecine-ball", "m", [9, 9.5, 10, 10.4]),
  "Golf": T("Lancer en rotation", "m", [8, 8.4, 8.9, 9.3]),
  "Escalade": T("Suspension à la poutre", "s", [20, 24, 27, 30]),
  "Voile": T("Gainage latéral", "s", [60, 70, 78, 85]),
  "Équitation": T("Gainage", "s", [60, 70, 78, 85]),
  "Prevention/Reeducation — Cheville": T("Montées sur pointes", "reps", [12, 15, 18, 21]),
  "Prevention/Reeducation — Tendon Achille": T("Montées sur pointes", "reps", [12, 15, 18, 21]),
  "Prevention/Reeducation — Périostite": T("Montées sur pointes", "reps", [12, 15, 18, 21]),
  "Prevention/Reeducation — Genou": T("Chaise contre le mur", "s", [30, 40, 50, 60]),
  "Prevention/Reeducation — Genou LCA": T("Chaise contre le mur", "s", [30, 40, 50, 60]),
  "Prevention/Reeducation — Genou Rotulien": T("Chaise contre le mur", "s", [30, 40, 50, 60]),
  "Prevention/Reeducation — Lombaire": T("Gainage", "s", [40, 50, 60, 70]),
  "Prevention/Reeducation — Épaule": T("Rotation externe", "reps", [12, 14, 16, 18]),
  "Police Nationale": T("Luc Léger", "palier", [8, 8.5, 9.5, 10]),
  "Gendarmerie": T("Luc Léger", "palier", [8, 8.5, 9.5, 10]),
  "Sapeur-Pompier": T("Luc Léger", "palier", [8, 8.5, 9.5, 10]),
  "GIGN": T("Luc Léger", "palier", [8, 8.5, 9.5, 10]),
  "Armée de Terre — TAP": T("Luc Léger", "palier", [8, 8.5, 9.5, 10]),
};
const FAMILY_TEST: Record<SportFamily, TestEx> = { force: T("Squat", "kg", [100, 104, 108, 112]), endurance: VMA, mixte: T("Squat", "kg", [80, 84, 88, 92]), collectif: T("Détente verticale", "cm", [41, 42.5, 44, 46]) };
export function testFor(sport: string, f: SportFamily): TestEx {
  const e = catalogEntry(sport) ?? findCatalogEntry(sport);
  return (e && SPORT_TESTS[e.value]) || FAMILY_TEST[f];
}
const sTests = (t: TestEx): BilanSlide => { return { kind: "tests", main: { name: t.name, unit: t.unit, pct: t.pct, points: t.values.map((value, i) => ({ date: DATES[i], value })) }, others: [] }; };

function leadCard(k: CaseKey, f: SportFamily, test: TestEx): Card {
  const { ses, stress: [sa, sb], heavy: [ha, hb] } = FAM[f];
  return {
    stress: { key: "stress", slide: sStress(f), says: (n?: string) => n
      ? `Le stress de ${n} se paie sur sa ${ses} : plus dure que prévu ${sa} fois sur ${sb}.`
      : `Le stress se paie sur ta ${ses} : plus dure que prévu ${sa} fois sur ${sb}.` },
    sleep: { key: "sleep", slide: S_SLEEP, says: (n?: string) => n
      ? `Une mauvaise nuit passe. Deux d'affilée, la séance de ${n} est plus dure 4 fois sur 5.`
      : "Une mauvaise nuit passe. Deux d'affilée, ta séance est plus dure 4 fois sur 5." },
    recovery: { key: "heavy", slide: sHeavy(f), says: (n?: string) => n
      ? `Ces jours-là, sa ${ses} passe mal : plus dure que prévu ${ha} fois sur ${hb}.`
      : `Ces jours-là, ta ${ses} passe mal : plus dure que prévu ${ha} fois sur ${hb}.` },
    motivation: { key: "charge", slide: S_CHARGE, says: (n?: string) => n
      ? `Pas un manque de volonté : quand l'envie de ${n} baisse, la charge est souvent sortie de la zone.`
      : "Pas un manque de volonté : quand l'envie baisse, ta charge est souvent sortie de ta zone." },
    ok: { key: "tests", slide: sTests(test), says: () => `Les bons jours poussés s'additionnent : ${test.name} +${test.pct} %.` },
  }[k];
}
/* Comportements cochés au point forme (2026-11-03, Gildas : « si je mets des comportements dans
   l'onboarding je les retrouve pas dans mon bilan ») : la carte du comportement entre dans le
   carrousel, avec sa pastille. Soirée, stretching, marche, hydratation : chiffres réels du sportif
   d'exemple ; écran, caféine, repas, tabac, coucher tardif, voyage, lecture, méditation, douche
   froide : illustratifs. Un bon matin avec un comportement coché ouvre sur ce comportement : c'est le
   AHA du point forme unique, même sans historique. */
const lev = (key: string, label: string, unit: "sleep" | "score", w: string, wo: string, delta: string, positive: boolean): BilanSlide =>
  ({ kind: "leviers", unit, rows: [{ key, label, with: w, without: wo, delta, positive }] });
const BEHAVIOR_CARD: Record<string, { chip: string; slide: BilanSlide }> = {
  alcohol: { chip: "soirée", slide: S_FATIGUE }, social_out: { chip: "soirée", slide: S_FATIGUE },
  screen_late: { chip: "écran tard", slide: lev("screen_late", "Écran tard", "sleep", "7 h 16", "7 h 35", "−19 min", false) },
  caffeine_late: { chip: "caféine tard", slide: lev("caffeine_late", "Caféine tard", "sleep", "7 h 12", "7 h 35", "−23 min", false) },
  heavy_meal: { chip: "repas lourd", slide: lev("heavy_meal", "Repas lourd", "sleep", "7 h 20", "7 h 35", "−15 min", false) },
  tobacco: { chip: "tabac", slide: lev("tobacco", "Tabac", "score", "64", "71", "−7 points", false) },
  late_sleep: { chip: "couché tard", slide: lev("late_sleep", "Coucher tardif", "score", "64", "71", "−7 points", false) },
  travel: { chip: "voyage", slide: lev("travel", "Voyage", "score", "63", "71", "−8 points", false) },
  stretching: { chip: "stretching", slide: lev("stretching", "Stretching le soir", "sleep", "7 h 59", "7 h 35", "+24 min", true) },
  walk: { chip: "marche", slide: lev("walk", "La marche dans la journée", "sleep", "7 h 58", "7 h 29", "+29 min", true) },
  hydration: { chip: "bien hydraté", slide: lev("hydration", "Bien s'hydrater", "score", "79", "67", "+12 points", true) },
  reading: { chip: "lecture", slide: lev("reading", "Lecture", "sleep", "7 h 49", "7 h 35", "+14 min", true) },
  meditation: { chip: "méditation", slide: lev("meditation", "Méditation", "sleep", "7 h 46", "7 h 35", "+11 min", true) },
  cold_shower: { chip: "douche froide", slide: lev("cold_shower", "Douche froide", "score", "74", "68", "+6 points", true) },
};
const BEHAVIOR_ORDER = ["alcohol", "social_out", "tobacco", "late_sleep", "travel", "screen_late", "caffeine_late", "heavy_meal", "stretching", "walk", "hydration", "reading", "meditation", "cold_shower"];
/* Les cartes du carrousel (2026-11-03, Gildas) : d'abord ce qu'il a répondu ou coché ce matin (son moins
   bon critère toujours en tête, puis chaque autre réponse basse, puis chaque comportement : soirée > négatifs > positifs) ; rien à
   signaler : Récupération, Charge, puis la carte Tests de son sport. Sinon, puis les cartes de fond, intéressantes pour tous : sa
   récupération selon son sport et sa charge dans la zone. 5 cartes au plus. */
function deckFor(answers: Answers, sport: string): (Card & { chip?: string })[] {
  const f = sportFamily(sport);
  const test = testFor(sport, f);
  // Le moins bon critère du point forme toujours en premier, même s'il n'est pas franchement bas
  // (Gildas, 2026-11-03) ; puis les autres réponses basses.
  const lows = ORDER.map(k => ({ k, g: good(k, answers[k]) })).sort((x, y) => x.g - y.g).filter((x, i) => i === 0 || x.g <= 5)
    .map(x => ({ ...leadCard(x.k, f, test), chip: `${QPHRASE[x.k]} ${answerWord(x.k, answers[x.k])}` }));
  const anyLow = ORDER.some(k => good(k, answers[k]) <= 5);
  const seen = new Set<BilanSlide>();
  const bcs = BEHAVIOR_ORDER.filter(b => (answers.behaviors ?? []).includes(b) && !seen.has(BEHAVIOR_CARD[b].slide) && seen.add(BEHAVIOR_CARD[b].slide))
    .map(b => ({ key: `b_${b}`, slide: BEHAVIOR_CARD[b].slide, chip: BEHAVIOR_CARD[b].chip }));
  const mine: (Card & { chip?: string })[] = [...lows, ...bcs];
  const fond: Card[] = [{ key: "recup", slide: sRecup(f) }, { key: "zone", slide: S_ZONE }];
  // Une seule carte de charge : celle de la motivation si elle est déjà là.
  const rest = fond.filter(c => !(c.key === "zone" && mine.some(m => m.key === "charge")));
  // Rien de bas, rien de coché : son moins bon critère, Récupération, Charge, puis Tests.
  if (!anyLow && !bcs.length) return [lows[0], ...rest, leadCard("ok", f, test)];
  return [...mine, ...rest].slice(0, 5);
}

/* Premier bilan dans l'app (2026-11-03) : les mêmes cartes que l'étape bilan de l'onboarding, la
   première choisie par sa réponse la plus basse du matin, avec sa réponse en pastille. */
export function previewSlides(answers: Answers, sport = ""): { slide: BilanSlide; says: string; chip: string | null }[] {
  const cap = (t: string) => (t.charAt(0).toUpperCase() + t.slice(1)).replace(/ ([:;!?])/g, "\u00a0$1");
  return deckFor(answers, sport).slice(0, 3)
    .map(c => ({ slide: c.slide, says: cap(c.says ? c.says() : ""), chip: c.chip ?? null }));
}

/* Les cartes parlent au sportif (« ta charge ») ; côté coach, au prénom de son sportif. */
/* Même mise en page que le bilan dans l'app (2026-11-03, Gildas) : pas de carte encadrée, la photo du
   thème est derrière tout l'écran (voir InsightStepBody), l'écran du bilan posé dessus. */
function SlideFrame({ slide, name }: { slide: BilanSlide; name?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,.85)", textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>Bilan · {(name && KICKER_COACH[slide.kind]) || KICKER[slide.kind]}</div>
      <div aria-hidden="true" style={{ height: 56 }} />
      <ExampleCtx.Provider value={true}>
        <SlideBody s={slide} bilan={BILAN} onShare={() => {}} shared={false} recal={RECAL} n={EXAMPLE_N} />
      </ExampleCtx.Provider>
      <ExamplePromise n={name} />
    </div>
  );
}

export function InsightStepBody({ answers, name, sport = "", onIndex }: { answers: Answers; name?: string; sport?: string; onIndex?: (i: number) => void }) {
  const slides = deckFor(answers, sport);
  const [idx, setIdx] = useState(0);
  // Retour sur l'étape : le carrousel repart de la 1re carte, le titre de l'étape aussi.
  useEffect(() => { onIndex?.(0); }, [onIndex]);
  const track = useRef<HTMLDivElement>(null);
  const go = (i: number) => track.current?.scrollTo({ left: i * (track.current.clientWidth + 16), behavior: "smooth" });
  const cur = slides[Math.min(idx, slides.length - 1)]?.slide;
  const photo = cur ? photoFor(cur) : null;
  return (
    <div>
      {/* Photo du thème de la carte visible, derrière tout l'écran (fixed, sous le contenu de QuestionShell). */}
      {cur && photo && (
        <div aria-hidden="true" style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 600, height: "min(52vh, 440px)", zIndex: -1, pointerEvents: "none" }}>
          <PhotoBanner photo={photo} height="100%" sportPhoto={sportPhotoFor(cur, sport)} />
        </div>
      )}
      <div ref={track} onScroll={e => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / (el.clientWidth + 16)); setIdx(i); onIndex?.(i); }}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", gap: 16, alignItems: "flex-start" }}>
        {slides.map(c => (
          <div key={c.key} style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
            <SlideFrame slide={c.slide} name={name} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }} role="tablist" aria-label="Écrans du bilan">
        {slides.map((c, i) => (
          <button key={c.key} type="button" onClick={() => go(i)} aria-label={`Écran ${i + 1}`} aria-selected={i === idx}
            style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", background: i === idx ? "#ff8a55" : "rgba(255,255,255,.25)", transition: "width .2s" }} />
        ))}
      </div>
    </div>
  );
}

/* ── Rejeu des 30 derniers jours de la montre (2026-11-02) : vraies données d'Apple Santé / Health
   Connect, lues juste après la connexion (src/lib/healthReplay.ts). ── */
const FR_DAY = (date: string) => {
  const s = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function Strip({ replay }: { replay: Replay }) {
  const W = 320, H = 96, n = replay.days.length, bw = W / n;
  const y = (v: number) => H - (Math.max(5, Math.min(100, v)) / 100) * H;
  const ny = y(75);
  return (
    <div style={{ ...BOX, borderRadius: 18, padding: "14px 12px 10px", marginBottom: 14 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Forme mesurée par ta montre sur tes 30 derniers jours">
        <line x1={0} x2={W} y1={ny} y2={ny} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
        <text x={W} y={ny - 4} textAnchor="end" fontSize={8.5} fill="rgba(255,255,255,.45)" fontFamily="var(--font-mono), monospace">ta norme</text>
        {replay.days.map((p, i) => {
          const x = i * bw + 1.5, cx = x + (bw - 3) / 2;
          const c = p.flag === "down" ? DOWN : p.flag === "up" ? UP : "rgba(255,255,255,.22)";
          return (
            <g key={p.date}>
              {p.v != null
                ? <rect x={x} y={y(p.v)} width={bw - 3} height={H - y(p.v)} rx={2} fill={c} />
                : <rect x={x} y={H - 2} width={bw - 3} height={2} rx={1} fill="rgba(255,255,255,.12)" />}
              {p.ses && <circle cx={cx} cy={H + 7} r={2} fill="rgba(255,255,255,.55)" />}
              {p.flag && <text x={cx} y={H + 19} textAnchor="middle" fontSize={9} fill={c}>{p.flag === "down" ? "▼" : "▲"}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 11.5, color: "rgba(255,255,255,.58)", padding: "8px 4px 0" }}>
        <span>▼ à alléger</span><span>▲ à pousser</span><span>• entraînement enregistré</span>
      </div>
    </div>
  );
}
const pill = (down: boolean): React.CSSProperties => ({ ...MONO, fontSize: 10, letterSpacing: ".06em", padding: "5px 9px", borderRadius: 999, whiteSpace: "nowrap", background: down ? "rgba(109,167,236,.18)" : "rgba(255,138,92,.16)", color: down ? DOWN : UP });
const ROW_ICON = (t: string) => (t.startsWith("Nuit") ? "🌙" : t.startsWith("VFC") ? "〰" : "♥");

export function replayConclusion(r: Replay): string {
  const down = replayDownCount(r), up = replayUpCount(r);
  if (down >= 2) return `Ta montre a vu ${down} séances faites un jour où ton corps demandait d'alléger. Dès demain, ThePerfClub le voit avant ta séance.`;
  if (down === 1) return "Une séance faite un jour où ton corps demandait d'alléger. Dès demain, ThePerfClub le voit avant ta séance.";
  if (up >= 1) return `Aucune séance à alléger ce mois-ci, mais ${up > 1 ? `${up} jours` : "un jour"} où tu pouvais pousser. Dès demain, ThePerfClub te le dit avant ta séance.`;
  return "Ton corps est resté dans ta norme les jours de séance. Dès demain, ThePerfClub le vérifie avant chaque séance.";
}

export function ReplayStepBody({ replay }: { replay: Replay }) {
  const up = replay.up;
  return (
    <div>
      <style>{`@keyframes obIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.ob-in{animation:none!important}}`}</style>
      <Strip replay={replay} />
      {replay.down.map((d, i) => (
        <div key={d.date} className="ob-in" style={{ ...BOX, padding: "13px 14px", marginBottom: 8, animation: `obIn .45s ease ${0.25 + i * 0.35}s both` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ ...MONO, fontSize: 11.5, letterSpacing: ".06em", color: "rgba(255,255,255,.58)" }}>{FR_DAY(d.date)}</span>
            <span style={pill(true)}>▼ Aurait allégé</span>
          </div>
          {d.rows.map(t => (
            <div key={t} style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)", padding: "2px 0" }}><span style={{ width: 16, textAlign: "center", color: "rgba(255,255,255,.58)" }}>{ROW_ICON(t)}</span><span>{t}</span></div>
          ))}
          {d.workout && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.10)", fontSize: 13.5, color: "#fff" }}>{workoutLabel(d.workout.workout_type)}, {d.workout.duration_min} min <span style={{ color: "rgba(255,255,255,.58)" }}>· faite quand même</span></div>}
        </div>
      ))}
      {up.length > 0 && (
        <div className="ob-in" style={{ ...BOX, padding: "13px 14px", marginBottom: 14, animation: `obIn .45s ease ${0.25 + replay.down.length * 0.35}s both` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ ...MONO, fontSize: 11.5, letterSpacing: ".06em", color: "rgba(255,255,255,.58)" }}>{up.map(d => FR_DAY(d.date)).join(" et ")}</span>
            <span style={pill(false)}>▲ Aurait poussé</span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)" }}>{up.length > 1 ? "Au-dessus de ta norme ces deux jours" : "Au-dessus de ta norme ce jour-là"}, séance faite sans rien ajouter.</div>
        </div>
      )}
      <p className="ob-in" style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,.75)", margin: "14px 0 0", paddingLeft: 12, borderLeft: "3px solid #d44000", animation: `obIn .45s ease ${0.4 + (replay.down.length + (up.length ? 1 : 0)) * 0.35}s both` }}>{replayConclusion(replay)}</p>
    </div>
  );
}

/* La frise sans risque de l'essai vit avec le paywall (commune à l'onboarding et à l'app). */
export { RiskTimeline } from "@/components/paywall/RiskTimeline";

/* ── ob_decide : après le check-in, sa vraie situation de ce matin. Remplace ob_when + ob_mirror (POC
   2026-10-28) : la question n'est plus hypothétique, et la réponse est confrontée à l'ajustement deux
   écrans plus loin. Réponse à enregistrer dans profiles.frustration (emails Brevo). ── */
export type Pick = "force" | "feeling" | "saute" | "pousse";
export function decideOptions(a: Answers): { value: Pick; label: string }[] {
  return lowestAnswer(a)
    ? [{ value: "force", label: "Je la fais comme prévu" }, { value: "feeling", label: "J'allège au ressenti" }, { value: "saute", label: "Je la saute" }]
    : [{ value: "force", label: "Je la fais comme prévu" }, { value: "pousse", label: "Je pousse un peu" }];
}
export function decideLead(a: Answers): string {
  const k = lowestAnswer(a);
  return k ? `Ce matin, ${QPHRASE[k]} ${answerWord(k, a[k])}` : "Tout est bon ce matin";
}
/* Titre de l'écran séance ajustée : son choix face à la règle. Pas de chiffre ici : la carte de prod juste
   dessous dit déjà « -3 points » et réécrit les séries, un % dans le titre ne collait pas avec elle. */
export function contrastTitle(pick: Pick | null, sug: { dir: "low" | "high"; reco: number } | null): string {
  /* Question passée (31/10) : pas de « ton ressenti avait raison » pour une réponse jamais donnée. */
  if (!pick) return !sug ? "Ta forme colle à ta séance\u00a0: on la garde comme prévu." : sug.dir === "low" ? "Ta forme est en dessous\u00a0: ThePerfClub allège ta séance, série par série." : "Ta forme le permet\u00a0: ThePerfClub pousse ta séance, série par série.";
  const p = pick;
  if (!sug) return { force: "Ton ressenti avait raison\u00a0: on la garde comme prévu.", feeling: "Tu aurais allégé au ressenti. Ton état permet de la garder telle quelle.", saute: "Tu l'aurais sautée. Ton état permet de la faire, telle quelle.", pousse: "Tu aurais poussé. Ton état dit de la garder comme prévu." }[p];
  if (sug.dir === "low") return { force: "Tu l'aurais faite comme prévu. ThePerfClub l'allège, série par série.", feeling: "Tu aurais allégé au ressenti. ThePerfClub te dit de combien, série par série.", saute: "Tu l'aurais sautée. ThePerfClub la garde, allégée série par série.", pousse: "Tu aurais poussé. ThePerfClub l'allège, série par série." }[p];
  return { force: "Tu l'aurais faite comme prévu. Ton état permet de pousser, série par série.", pousse: "Ton ressenti avait raison. ThePerfClub te dit de combien pousser, série par série.", feeling: "Tu aurais allégé. Ton état permet de pousser, série par série.", saute: "Tu l'aurais sautée. Ton état permet même de pousser." }[p];
}
export const pickWords: Record<Pick, string> = { force: "Tu fais la séance quand même.", feeling: "Tu allèges au ressenti.", saute: "Tu sautes la séance.", pousse: "Tu pousses au ressenti." };

/* ── Coach, mêmes étapes que le sportif (POC 2026-10-28) : remplace ob_when coach, ob_mirror coach et le
   radar. Le coach saisit le check-in qu'un de ses sportifs lui enverrait (vraie fonction depuis le 26/10),
   dit ce qu'il lui dirait, puis voit la règle sur la séance de ce sportif avec la jauge. ── */
export type PickCoach = "garde" | "oeil" | "aveugle" | "pousse";
export function decideOptionsCoach(a: Answers): { value: PickCoach; label: string }[] {
  return lowestAnswer(a)
    ? [{ value: "garde", label: "« Fais-la comme prévu »" }, { value: "oeil", label: "« Allège un peu »" }, { value: "aveugle", label: "Rien : je ne l'aurais pas su avant la séance" }]
    : [{ value: "garde", label: "« Fais-la comme prévu »" }, { value: "pousse", label: "« Pousse un peu »" }];
}
export function decideLeadCoach(a: Answers, name: string): string {
  const k = lowestAnswer(a);
  return k ? `${name} : ${QPHRASE[k]} ${answerWord(k, a[k])}` : `${name} est en forme`;
}
export function contrastTitleCoach(pick: PickCoach | null, sug: { dir: "low" | "high" } | null, n: string): string {
  if (!pick) return !sug ? `Sa forme colle à la séance\u00a0: ${n} la garde comme prévu.` : sug.dir === "low" ? `Sa forme est en dessous\u00a0: ThePerfClub allège ${n}, série par série.` : `Sa forme le permet\u00a0: ${n} peut pousser, série par série.`;
  const p = pick;
  if (p === "aveugle") return sug?.dir === "low" ? `Sans point forme, tu l'aurais vu pendant la séance. Là, tu allèges ${n} avant.` : `Sans point forme, tu ne l'aurais pas su. Là, tu sais où en est ${n} avant la séance.`;
  if (!sug) return { garde: `Ton instinct avait raison\u00a0: la séance de ${n} reste comme prévu.`, oeil: `Tu aurais allégé. ${n} peut la faire telle quelle.`, pousse: `Tu l'aurais poussé. Son état dit de garder la séance.` }[p];
  if (sug.dir === "low") return { garde: `Tu aurais gardé la séance de ${n}. ThePerfClub l'allège, série par série.`, oeil: `Tu aurais allégé à l'œil. ThePerfClub te dit de combien pour ${n}.`, pousse: `Tu l'aurais poussé. ThePerfClub allège ${n}, série par série.` }[p];
  return { garde: `Tu aurais gardé la séance. ${n} peut pousser, série par série.`, pousse: `Ton instinct avait raison. ThePerfClub te dit de combien pousser ${n}.`, oeil: `Tu aurais allégé. ${n} peut pousser, série par série.` }[p];
}
export const pickWordsCoach: Record<PickCoach, string> = { garde: "Tu gardes la séance prévue.", oeil: "Tu allèges à l'œil.", aveugle: "Tu le découvres pendant la séance.", pousse: "Tu pousses à l'instinct." };

/* ── ob_week, sous-titre (2026-10-31, chantier douleur, skill storytelling-tpc) : ce que son réflexe coûte,
   porté par le programme figé, le ressenti ou l'œil, jamais par la personne. Le titre (contrastTitle) reste :
   c'est la preuve de valeur. Vide si la séance ne bouge pas ou si la question a été passée. ── */
export function weekCostLine(pick: Pick | PickCoach | null, dir: "low" | "high" | null): string {
  if (!pick || !dir) return "";
  const low: Record<string, string> = {
    force: "Un programme figé te l'aurait fait faire quand même.",
    feeling: "Au ressenti, on allège trop ou pas assez.",
    saute: "Un programme figé ne te laisse que ce choix : la faire ou la sauter.",
    pousse: "Au ressenti, on pousse parfois un jour où il faut alléger.",
    garde: "Un programme figé la lui aurait fait faire quand même.",
    oeil: "À l'œil, on allège trop ou pas assez.",
    aveugle: "Sinon, on le découvre à la blessure.",
  };
  const high: Record<string, string> = {
    force: "Un programme figé t'aurait laissé en dessous de ta forme.",
    feeling: "Au ressenti, on allège trop ou pas assez.",
    saute: "Une séance sautée un bon jour, c'est une séance perdue.",
    pousse: "Au ressenti, on pousse trop ou pas assez.",
    garde: "Un programme figé l'aurait laissé en dessous de sa forme.",
    oeil: "À l'œil, on allège trop ou pas assez.",
    aveugle: "Sinon, il passe à côté d'un bon jour.",
  };
  return (dir === "low" ? low : high)[pick] ?? "";
}
