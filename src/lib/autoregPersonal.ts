/* Autorégulation qui apprend (2026-10-23, POC Qx548NQG7ZrWgwQA28DYpp, pistes 1 et 2).

   Deux réglages personnels s'ajoutent au moteur générique (computeAutoregSuggestion) :
   - `shift` (piste 1) : seuil recalé, accepté par le sportif dans son bilan (« Me recaler »), stocké
     dans profiles.autoreg_shift. Points ajoutés à la récupération effective : positif = alléger moins
     souvent.
   - `penalty` (piste 2) : signal appris sur le sportif. Par famille de séance (force, vitesse et
     explosivité, d'après les catégories du parseur, jamais le nom de séance qui change d'une semaine
     à l'autre), la dimension du check-in qui rend ses séances plus dures que prévu. Quand elle est
     basse ce matin et que la séance du jour est de cette famille : même malus que la charge
     chronique « à surveiller » (−10).
   Validé avant activation sur 5 mois de données de Gildas, jour par jour sans regarder l'avenir :
   quand le signal se déclenche, séance plus dure que prévu 11 fois sur 18 (61 %), contre 8 sur 30
   pour les « Alléger » du moteur générique (27 %).

   La reco du matin est figée au check-in dans sessions.autoreg_proposal (avec ces réglages), pour
   que le coach voie la même décision et que le verdict de fin de séance la relise. */

import { bestExerciseMatch, CATEGORY_FAMILY } from "@/lib/exerciseBank";
import type { AutoregDir } from "@/lib/autoregulation";

export type SessionFamily = "force" | "vitesse";
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

/* Famille d'une séance : catégorie majoritaire de ses lignes (parseur). null = indécidable. */
export function sessionFamily(notes: string | null | undefined): SessionFamily | null {
  if (!notes) return null;
  let f = 0, e = 0;
  for (const line of notes.split("\n")) {
    const m = line.trim() ? bestExerciseMatch(line) : null;
    if (!m) continue;
    const fam = CATEGORY_FAMILY[m.cat];
    if (fam === "f") f++; else if (fam === "e") e++;
  }
  if (f === e) return null;
  return f > e ? "force" : "vitesse";
}

type HistSession = { date: string; notes: string | null; rpe: number | null; target_difficulty: number | null; done: boolean };

/* Signaux appris : pour chaque famille (≥ 12 séances notées avec check-in), la dimension dont le
   « bas » rend les séances plus dures que prévu (≥ 8 séances de chaque côté, écart ≥ 20 points). */
export function learnSignals(sessions: HistSession[], checkins: (CheckinDims & { date: string })[], before?: string): PersonalSignal[] {
  const byDate = new Map(checkins.map(c => [c.date, c]));
  const rows = sessions
    .filter(s => s.done && s.rpe != null && s.target_difficulty && (!before || s.date < before))
    .map(s => ({ c: byDate.get(s.date), fam: sessionFamily(s.notes), harder: s.rpe! > s.target_difficulty! }))
    .filter((r): r is { c: CheckinDims & { date: string }; fam: SessionFamily; harder: boolean } => !!r.c && !!r.fam);
  const out: PersonalSignal[] = [];
  for (const family of ["force", "vitesse"] as const) {
    const fam = rows.filter(r => r.fam === family);
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
  return out;
}

/* Ajustement du jour : malus si la séance prévue est d'une famille dont le signal est bas ce matin. */
export function personalAdjust(signals: PersonalSignal[], shift: number, notes: string | null | undefined, checkin: CheckinDims | null, shiftHigh = 0): PersonalAdjust {
  const family = sessionFamily(notes);
  const sig = checkin && family ? signals.find(s => s.family === family && DIM_LOW[s.dim](checkin)) : undefined;
  return { shift, shiftHigh, penalty: sig ? PERSONAL_PENALTY : 0, dim: sig?.dim ?? null, family: sig ? family : null };
}

const OPENING: Record<PersonalDim, [string, string]> = {
  stress: ["Ton stress n'est pas au calme ce matin.", "Son stress n'est pas au calme ce matin."],
  sleep: ["Ta nuit est moyenne.", "Sa nuit est moyenne."],
  recovery: ["Ton corps n'est pas frais ce matin.", "Son corps n'est pas frais ce matin."],
  motivation: ["Ta motivation est en retrait ce matin.", "Sa motivation est en retrait ce matin."],
};
const FAMILY_WORDS: Record<SessionFamily, string> = { force: "de force", vitesse: "de vitesse et d'explosivité" };

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
