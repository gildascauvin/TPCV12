/* Autorégulation qui apprend (2026-10-23, POC Qx548NQG7ZrWgwQA28DYpp, pistes 1 et 2).

   Deux réglages personnels s'ajoutent au moteur générique (computeAutoregSuggestion) :
   - `shift` (piste 1) : seuil recalé, accepté par le sportif dans son bilan (« Me recaler »), stocké
     dans profiles.autoreg_shift. Points ajoutés à la récupération effective : positif = alléger moins
     souvent.
   - `penalty` (piste 2) : signal appris sur le sportif. Par type de séance (depuis le 2026-10-24 :
     la qualité physique dominante de ses lignes, les 8 qualités des tests (testQualities.ts) + la
     technique de son sport ; avant : force vs vitesse-explosivité, l'endurance n'avait aucun type),
     jamais le nom de séance qui change d'une semaine à l'autre, la dimension du check-in qui rend
     ses séances plus dures que prévu. Quand elle est
     basse ce matin et que la séance du jour est de cette famille : même malus que la charge
     chronique « à surveiller » (−10).
   Validé avant activation sur 5 mois de données de Gildas, jour par jour sans regarder l'avenir :
   quand le signal se déclenche, séance plus dure que prévu 11 fois sur 18 (61 %), contre 8 sur 30
   pour les « Alléger » du moteur générique (27 %).

   La reco du matin est figée au check-in dans sessions.autoreg_proposal (avec ces réglages), pour
   que le coach voie la même décision et que le verdict de fin de séance la relise. */

import { bestExerciseMatch, type ExerciseCategory } from "@/lib/exerciseBank";
import { parseLine } from "@/lib/exerciseParser";
import type { AutoregDir } from "@/lib/autoregulation";
import { QUALITY_META, QUALITY_ORDER, type Quality } from "@/lib/testQualities";

/* Type de séance, sur deux niveaux (2026-10-24) :
   - la QUALITÉ dominante de ses lignes : les 8 des tests (testQualities.ts) ou la technique du sport
     (foot, tennis, BMX, escalade, combat…) ;
   - le GROUPE, plus large, quand une qualité seule n'a pas assez de séances : force + puissance
     (une séance d'haltéro mêle arraché et squats), vitesse + réactivité + agilité ; les autres
     qualités sont leur propre groupe.
   Le signal est appris d'abord sur la qualité, sinon sur le groupe. « force » et « vitesse » existaient
   avant comme familles : les recos figées avant cette date restent lisibles. */
export type SessionQuality = Quality | "technique";
export type SessionGroup = "force_puissance" | "vitesse_reactivite";
export type SessionFamily = SessionQuality | SessionGroup;
export const SESSION_QUALITIES: SessionQuality[] = [...QUALITY_ORDER, "technique"];
const GROUP_OF: Partial<Record<SessionQuality, SessionGroup>> = { force: "force_puissance", puissance: "force_puissance", vitesse: "vitesse_reactivite", reactivite: "vitesse_reactivite", agilite: "vitesse_reactivite" };
export const SESSION_FAMILIES: SessionFamily[] = [...SESSION_QUALITIES, "force_puissance", "vitesse_reactivite"];
export const FAMILY_LABEL: Record<SessionFamily, string> = {
  ...Object.fromEntries(QUALITY_ORDER.map(q => [q, QUALITY_META[q].label])) as Record<Quality, string>,
  technique: "Technique / sport", force_puissance: "Force et puissance", vitesse_reactivite: "Vitesse et explosivité",
};
export type PersonalDim = "stress" | "sleep" | "recovery" | "motivation";

export type PersonalSignal = { family: SessionFamily; dim: PersonalDim; low: { part: number; total: number }; high: { part: number; total: number } };

/* shiftHigh (2026-10-24) : curseur « pousser » séparé (profiles.autoreg_shift_high), absent des recos
   figées avant cette date (lu comme 0). */
export type PersonalAdjust = { shift: number; shiftHigh?: number; penalty: number; dim: PersonalDim | null; family: SessionFamily | null };

export type AutoregProposal = {
  proposed: AutoregDir | null;
  reco: number | null;
  zoneLow: number | null;
  zoneHigh: number | null;
  original_difficulty: number;
  /* Texte de la séance au moment du conseil (2026-10-24) : comparé au texte final (le réalisé) pour
     savoir si la séance a été allégée, gardée ou poussée. Absent des recos d'avant. */
  original_notes?: string | null;
  personal?: PersonalAdjust | null;
  date: string;
  recorded_at?: string;
};

export const PERSONAL_PENALTY = -10;

type CheckinDims = { sleep: number; stress: number; recovery: number; motivation: number };

/* Bas = la moitié « moins bien » de l'échelle du check-in, aux mêmes seuils que le bilan. */
export const DIM_LOW: Record<PersonalDim, (c: CheckinDims) => boolean> = {
  stress: c => c.stress >= 4,
  sleep: c => c.sleep <= 6,
  recovery: c => c.recovery <= 6,
  motivation: c => c.motivation <= 6,
};

const CATEGORY_QUALITY: Record<ExerciseCategory, SessionQuality | null> = {
  halt: "puissance", legs: "force", push: "force", pull: "force", plio: "puissance", sprint: "vitesse",
  cardio: "endurance", core: "mobilite", warm: "mobilite", skill: "technique", test: null,
};
const POLY_RE = /\b(circuit|wod|amrap|emom|hyrox|metcon|crossfit|for time|chipper)\b/;
const AGIL_RE = /\b(navette|navettes|shuttle|changement de direction|changements de direction|change of direction|cod|agilite|agility|echelle de rythme|ladder|5 10 5|pro agility|illinois|slalom|zig zag|zigzag)\b/;
const REACT_RE = /\b(drop|depth|pogo|pogos|hop|hops|bound|bounds|bounding|rebond|rebonds|reactif|reactive|reactivite|haies basses|mini haies)\b/;

/* Qualité d'une ligne : circuit / agilité reconnus au texte, sinon d'après la catégorie du parseur. */
export function lineQuality(line: string): SessionQuality | null {
  const n = " " + line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";
  if (POLY_RE.test(n)) return "polyvalence";
  if (AGIL_RE.test(n)) return "agilite";
  const m = bestExerciseMatch(line);
  if (!m) {
    // « 2x20m Lesté », « 1x30m » : une distance seule. Courte = vitesse, longue = endurance.
    const dist = parseLine(line).schemes.reduce((a, sc) => Math.max(a, sc.dist ?? 0), 0);
    return dist && dist <= 150 ? "vitesse" : dist >= 400 ? "endurance" : null;
  }
  if (m.cat === "plio") return REACT_RE.test(n) ? "reactivite" : "puissance";
  return CATEGORY_QUALITY[m.cat];
}

/* Majoritaire parmi des clés (égalité = null) ; la mobilité ne compte que s'il n'y a rien d'autre. */
function majority<K extends string>(keys: K[]): K | null {
  const count = new Map<K, number>();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  const main = Array.from(count).filter(([k]) => k !== "mobilite");
  const pool = (main.length ? main : Array.from(count)).sort((x, y) => y[1] - x[1]);
  if (!pool.length || (pool.length > 1 && pool[0][1] === pool[1][1])) return null;
  return pool[0][0];
}

/* Qualité et groupe d'une séance. */
export function sessionTypes(notes: string | null | undefined): { quality: SessionQuality | null; group: SessionFamily | null } {
  const qs = (notes ?? "").split("\n").map(l => (l.trim() ? lineQuality(l) : null)).filter((q): q is SessionQuality => !!q);
  return { quality: majority(qs), group: majority(qs.map(q => GROUP_OF[q] ?? q)) };
}

type HistSession = { date: string; notes: string | null; rpe: number | null; target_difficulty: number | null; done: boolean };

/* Signaux appris : pour chaque famille (≥ 12 séances notées avec check-in), la dimension dont le
   « bas » rend les séances plus dures que prévu (≥ 8 séances de chaque côté, écart ≥ 20 points). */
export function learnSignals(sessions: HistSession[], checkins: (CheckinDims & { date: string })[], before?: string): PersonalSignal[] {
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const rows = sessions
    .filter(s => s.done && s.rpe != null && s.target_difficulty && (!before || s.date < before))
    .map(s => ({ c: byDate.get(s.date), t: sessionTypes(s.notes), harder: s.rpe! > s.target_difficulty! }))
    .filter((r): r is { c: CheckinDims & { date: string }; t: ReturnType<typeof sessionTypes>; harder: boolean } => !!r.c && !!(r.t.quality || r.t.group));
  const out: PersonalSignal[] = [];
  for (const family of SESSION_FAMILIES) {
    const fam = rows.filter(r => r.t.quality === family || r.t.group === family);
    if (fam.length < 12) continue;
    let best: PersonalSignal | null = null, bestDiff = 0.2 - 1e-9;
    for (const dim of Object.keys(DIM_LOW) as PersonalDim[]) {
      const lo = fam.filter(r => DIM_LOW[dim](r.c)), hi = fam.filter(r => !DIM_LOW[dim](r.c));
      if (lo.length < 8 || hi.length < 8) continue;
      const lp = lo.filter(r => r.harder).length, hp = hi.filter(r => r.harder).length;
      const diff = lp / lo.length - hp / hi.length;
      if (diff > bestDiff) { bestDiff = diff; best = { family, dim, low: { part: lp, total: lo.length }, high: { part: hp, total: hi.length } }; }
    }
    if (best) out.push(best);
  }
  // Pas de doublon : un groupe dont une qualité porte déjà le même signal ne se répète pas.
  return out.filter(g => !out.some(q => q !== g && q.dim === g.dim && GROUP_OF[q.family as SessionQuality] === g.family));
}

/* Ajustement du jour : malus si la séance prévue est d'une famille dont le signal est bas ce matin. */
export function personalAdjust(signals: PersonalSignal[], shift: number, notes: string | null | undefined, checkin: CheckinDims | null, shiftHigh = 0): PersonalAdjust {
  const t = sessionTypes(notes);
  // Qualité d'abord (plus précis), sinon le groupe.
  const pick = (k: SessionFamily | null) => (checkin && k ? signals.find(s => s.family === k && DIM_LOW[s.dim](checkin)) : undefined);
  const sig = pick(t.quality) ?? (t.group !== t.quality ? pick(t.group) : undefined);
  return { shift, shiftHigh, penalty: sig ? PERSONAL_PENALTY : 0, dim: sig?.dim ?? null, family: sig ? sig.family : null };
}

const OPENING: Record<PersonalDim, [string, string]> = {
  stress: ["Ton stress n'est pas au calme ce matin.", "Son stress n'est pas au calme ce matin."],
  sleep: ["Ta nuit est moyenne.", "Sa nuit est moyenne."],
  recovery: ["Ton corps n'est pas frais ce matin.", "Son corps n'est pas frais ce matin."],
  motivation: ["Ta motivation est en retrait ce matin.", "Sa motivation est en retrait ce matin."],
};
const FAMILY_WORDS: Record<SessionFamily, string> = {
  force: "de force", puissance: "de puissance", reactivite: "de réactivité", vitesse: "de vitesse", agilite: "d'agilité",
  endurance: "d'endurance", mobilite: "de mobilité", polyvalence: "en circuit", technique: "techniques",
  force_puissance: "de force et de puissance", vitesse_reactivite: "de vitesse et d'explosivité",
};

/* Phrase « appris sur toi » de la carte décision. Coach : 3e personne, au prénom. */
export function personalReason(p: PersonalAdjust | null | undefined, subject?: string): string | null {
  if (!p || !p.penalty || !p.dim || !p.family) return null;
  const [mine, theirs] = OPENING[p.dim];
  return subject
    ? `${theirs} Chez ${subject}, c'est ce qui rend les séances ${FAMILY_WORDS[p.family]} plus dures que prévu.`
    : `${mine} Chez toi, c'est ce qui rend tes séances ${FAMILY_WORDS[p.family]} plus dures que prévu.`;
}

/* Réglages figés dans la reco du matin, s'ils concernent bien ce jour-là (le coach les relit). */
export function proposalPersonal(s: { date: string; autoreg_proposal?: AutoregProposal | null } | null | undefined): PersonalAdjust | null {
  const p = s?.autoreg_proposal;
  if (!p || p.date !== s!.date) return null;
  return p.personal ?? null;
}
