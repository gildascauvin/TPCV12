/* Séances en série dans un programme (2026-11-01), façon événement récurrent Google Agenda.
   Une série n'existe que si elle a été créée comme telle : « Répéter chaque semaine jusqu'à Sx »,
   Reconduire, ou un programme généré/importé (séances qui reviennent chaque semaine). Les séances
   d'avant la fonctionnalité sont des séances seules : on ne devine jamais une série par le nom.

   Une série partage la STRUCTURE (nom, jour, exercices et leur ordre), pas la DOSE (séries, reps,
   charges, %) qui suit la progression. « Celle-ci et les suivantes » reporte donc des changements,
   jamais des valeurs :
   - ajout / retrait / ordre d'exercices : reportés ; un exercice ajouté reçoit la progression de la
     série (series_step × écart de semaines) quand elle en a une ;
   - dose modifiée sur une ligne : l'écart est reporté (+1 série, +5 points), sur une ligne de même
     écriture seulement ; sinon la ligne de la semaine cible reste telle quelle ;
   - difficulté prévue : l'écart est reporté ;
   - séances déjà faites : jamais touchées (le Planning ; un template n'en a pas). */
import type { ProgramTemplate, SessionTemplate } from "@/types";
import { parseLine, rewriteLine, type LineEdits } from "./exerciseParser";
import { adjustNotesCharge, adjustLineCharge, adjustDifficultyCharge, type ChargeAdjust } from "./chargeAdjust";
import { exerciseChange, alignSession, occKeys, sessionKey } from "./propagateSessionEdit";
import { mediaForAssignment } from "./programMedia";

export interface Occurrence { weekIdx: number; day: string; sIdx: number }

export const newSeriesId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const scaled = (step: ChargeAdjust | null | undefined, k: number): ChargeAdjust | null =>
  step && (step.inten || step.vol) && k ? { inten: step.inten * k, vol: step.vol * k } : null;

export function occurrences(t: ProgramTemplate, seriesId: string | null | undefined): Occurrence[] {
  if (!seriesId) return [];
  const out: Occurrence[] = [];
  t.weeks.forEach((w, wi) => {
    for (const [day, list] of Object.entries(w)) {
      ((list ?? []) as SessionTemplate[]).forEach((s, si) => { if (s.series_id === seriesId) out.push({ weekIdx: wi, day, sIdx: si }); });
    }
  });
  return out.sort((a, b) => a.weekIdx - b.weekIdx);
}

export const following = (t: ProgramTemplate, seriesId: string | null | undefined, fromWeekIdx: number) =>
  occurrences(t, seriesId).filter(o => o.weekIdx > fromWeekIdx);

const mapSessions = (t: ProgramTemplate, fn: (s: SessionTemplate, o: Occurrence) => SessionTemplate | null): ProgramTemplate => ({
  ...t,
  weeks: t.weeks.map((w, wi) => {
    const nw: typeof w = {};
    for (const [day, list] of Object.entries(w)) {
      nw[day] = ((list ?? []) as SessionTemplate[]).map((s, si) => fn(s, { weekIdx: wi, day, sIdx: si })).filter((x): x is SessionTemplate => x !== null);
    }
    return nw;
  }),
});

/** « Répéter chaque semaine jusqu'à Sx » : la séance devient la 1re d'une série, copiée le même jour
 *  dans chaque semaine suivante, avec la progression appliquée k fois (S+1 = 1 pas, S+2 = 2 pas…). */
export function repeatSession(t: ProgramTemplate, at: Occurrence, untilWeekIdx: number, step: ChargeAdjust): ProgramTemplate {
  const src = (t.weeks[at.weekIdx]?.[at.day] as SessionTemplate[] | undefined)?.[at.sIdx];
  if (!src) return t;
  const series_id = src.series_id ?? newSeriesId();
  const series_step = step.inten || step.vol ? step : null;
  const weeks = t.weeks.map((w, wi) => {
    if (wi === at.weekIdx) return { ...w, [at.day]: ((w[at.day] ?? []) as SessionTemplate[]).map((s, si) => si === at.sIdx ? { ...s, series_id, series_step } : s) };
    if (wi <= at.weekIdx || wi > untilWeekIdx) return w;
    const adj = scaled(step, wi - at.weekIdx);
    const copy: SessionTemplate = {
      // Vidéos et photos suivent la copie (même ligne = même index), jamais les commentaires.
      ...src, series_id, series_step, exercise_media: mediaForAssignment(src.exercise_media, false),
      notes: adj ? adjustNotesCharge(src.notes, adj) : src.notes,
      target_difficulty: adj ? adjustDifficultyCharge(src.target_difficulty ?? 6, adj) : src.target_difficulty,
    };
    return { ...w, [at.day]: [...((w[at.day] ?? []) as SessionTemplate[]), copy] };
  });
  return { ...t, weeks };
}

/* Écart de dose entre deux écritures d'une même ligne, reporté sur la ligne d'une autre semaine
   quand elle s'écrit pareil (mêmes tokens). */
function numeric(v: string | undefined): number | null {
  if (v == null || !/^\d+(?:[.,]\d+)?$/.test(v.trim())) return null;
  return parseFloat(v.replace(",", "."));
}
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const shape = (l: string) => parseLine(l).toks.map(t => t.k).join(",");

export function carryDelta(before: string, after: string, target: string): string {
  if (before === after) return target;
  const b = parseLine(before), a = parseLine(after), tg = parseLine(target);
  if (b.kind !== "full" || a.kind !== "full" || tg.kind !== "full" || tg.ambiguous) return target;
  if (shape(before) !== shape(after) || shape(before) !== shape(target)) return target;
  const edits: LineEdits = new Map();
  b.toks.forEach((tb, i) => {
    const ta = a.toks[i], tt = tg.toks[i];
    tb.g.forEach((gv, gi) => {
      const vb = numeric(gv), va = numeric(ta.g[gi]), vt = numeric(tt.g[gi]);
      if (vb == null || va == null || vt == null || va === vb) return;
      const o = (edits.get(tt) as Record<number, string> | undefined) || {};
      o[gi] = fmt(Math.max(0, vt + (va - vb))); edits.set(tt, o);
    });
  });
  return edits.size ? rewriteLine(tg, edits) : target;
}

export interface SessionState { name: string; notes: string | null; target_difficulty: number | null }

/** Reporte une édition (avant → après) sur une autre séance de la série, `k` semaines plus loin.
 *  Commun à l'éditeur de programme et au Planning (route /api/sessions/series). */
export function applySeriesEdit<T extends { name: string; notes: string | null; target_difficulty: number | null; exercise_media?: SessionTemplate["exercise_media"] }>(
  target: T, before: SessionState, after: SessionState, step: ChargeAdjust | null | undefined, k: number,
): T {
  const change = exerciseChange(before.notes, after.notes);
  const bLines = (before.notes ?? "").split("\n").filter(Boolean), aLines = (after.notes ?? "").split("\n").filter(Boolean);
  const bk = occKeys(bLines), ak = occKeys(aLines);
  const pairs = new Map<string, { b: string; a: string }>();
  ak.forEach((key, i) => { const j = bk.indexOf(key); if (j >= 0 && bLines[j] !== aLines[i]) pairs.set(key, { b: bLines[j], a: aLines[i] }); });
  const dDiff = (after.target_difficulty ?? 6) - (before.target_difficulty ?? 6);
  const adj = scaled(step, k);
  const aligned = alignSession({ ...target, target_difficulty: target.target_difficulty ?? 6, load: 2, type: "volume" } as SessionTemplate, after.notes, change.removedKeys, {
    newLine: line => adj ? adjustLineCharge(line, adj) : line,
    commonLine: (key, line) => { const p = pairs.get(key); return p ? carryDelta(p.b, p.a, line) : line; },
  });
  return {
    ...target,
    notes: aligned.notes,
    exercise_media: aligned.exercise_media ?? target.exercise_media,
    name: before.name !== after.name ? after.name : target.name,
    target_difficulty: dDiff ? Math.max(1, Math.min(10, (target.target_difficulty ?? 6) + dDiff)) : target.target_difficulty,
  };
}

/** « Celle-ci et les suivantes » après une édition dans un programme (jusqu'à `untilWeekIdx` inclus). */
export function propagateEdit(t: ProgramTemplate, seriesId: string, fromWeekIdx: number, untilWeekIdx: number, before: SessionState, after: SessionState, step: ChargeAdjust | null | undefined): ProgramTemplate {
  return mapSessions(t, (s, o) => {
    if (s.series_id !== seriesId || o.weekIdx <= fromWeekIdx || o.weekIdx > untilWeekIdx) return s;
    return applySeriesEdit(s, before, after, step, o.weekIdx - fromWeekIdx);
  });
}

/** Copies hebdomadaires d'une séance (Planning) : dates S+1… jusqu'à `untilDate` (et pas avant `minDate`), progression k fois. */
export function weeklyCopies(src: SessionState & { date: string }, untilDate: string, step: ChargeAdjust | null | undefined, minDate?: string): (SessionState & { date: string })[] {
  const out: (SessionState & { date: string })[] = [];
  const d0 = new Date(src.date + "T12:00:00Z");
  for (let k = 1; k <= 52; k++) {
    const d = new Date(d0.getTime() + k * 7 * 86400000).toISOString().slice(0, 10);
    if (d > untilDate) break;
    // Séance passée répétée : les copies démarrent à partir d'aujourd'hui, la progression compte depuis la source.
    if (minDate && d < minDate) continue;
    const adj = scaled(step, k);
    out.push({ date: d, name: src.name, notes: adj ? adjustNotesCharge(src.notes, adj) : src.notes, target_difficulty: adj ? adjustDifficultyCharge(src.target_difficulty ?? 6, adj) : src.target_difficulty });
  }
  return out;
}

/** Résumé d'une édition pour la question « Celle-ci et les suivantes » (« + Box jump · ↕ Ordre »). */
export function editSummary(before: SessionState, after: SessionState): string {
  const c = exerciseChange(before.notes, after.notes);
  const parts = [...c.added.map(x => `+ ${x}`), ...c.removed.map(x => `− ${x}`), ...(c.reordered ? ["↕ Ordre"] : [])];
  if (!c.added.length && !c.removed.length && (before.notes ?? "") !== (after.notes ?? "")) parts.push("Dose modifiée");
  if (before.name !== after.name) parts.push("Nom");
  if (before.target_difficulty !== after.target_difficulty) parts.push("Difficulté");
  return parts.length <= 4 ? parts.join(" · ") : `${parts.slice(0, 3).join(" · ")} · +${parts.length - 3}`;
}

export function hasSessionChange(before: SessionState, after: SessionState): boolean {
  return before.name !== after.name || (before.notes ?? "") !== (after.notes ?? "") || before.target_difficulty !== after.target_difficulty;
}

/** Déplacer « celle-ci et les suivantes » vers un autre jour. */
export function moveFollowing(t: ProgramTemplate, seriesId: string, fromWeekIdx: number, toDay: string): ProgramTemplate {
  const moved: { wi: number; s: SessionTemplate }[] = [];
  const cleared = mapSessions(t, (s, o) => {
    if (s.series_id !== seriesId || o.weekIdx <= fromWeekIdx || o.day === toDay) return s;
    moved.push({ wi: o.weekIdx, s });
    return null;
  });
  return { ...cleared, weeks: cleared.weeks.map((w, wi) => {
    const add = moved.filter(m => m.wi === wi).map(m => m.s);
    return add.length ? { ...w, [toDay]: [...((w[toDay] ?? []) as SessionTemplate[]), ...add] } : w;
  }) };
}

/** Supprimer « celle-ci et les suivantes » (la série s'arrête avant cette semaine). */
export function deleteFollowing(t: ProgramTemplate, seriesId: string, fromWeekIdx: number): ProgramTemplate {
  return mapSessions(t, (s, o) => s.series_id === seriesId && o.weekIdx >= fromWeekIdx ? null : s);
}

/** Programme généré, importé ou reconduit : chaque séance qui revient le même jour sous le même nom
 *  dans plusieurs semaines devient une série (créée comme telle, jamais devinée après coup). */
export function seriesFromRepeats(t: ProgramTemplate): ProgramTemplate {
  const groups = new Map<string, number>();
  t.weeks.forEach(w => {
    for (const [day, list] of Object.entries(w)) {
      const seen = new Set<string>();
      for (const s of (list ?? []) as SessionTemplate[]) {
        const k = `${day}|${sessionKey(s.name)}`;
        if (seen.has(k) || s.series_id) continue;
        seen.add(k);
        groups.set(k, (groups.get(k) ?? 0) + 1);
      }
    }
  });
  const ids = new Map<string, string>();
  groups.forEach((n, k) => { if (n >= 2) ids.set(k, newSeriesId()); });
  if (!ids.size) return t;
  return mapSessions(t, (s, o) => {
    if (s.series_id) return s;
    const id = ids.get(`${o.day}|${sessionKey(s.name)}`);
    return id ? { ...s, series_id: id } : s;
  });
}

/** Libellé du tiroir : « ↻ Chaque lundi · S1 à S4 », ou null pour une séance seule. */
export function seriesLabel(t: ProgramTemplate, seriesId: string | null | undefined, dayName: (d: string) => string): string | null {
  const occ = occurrences(t, seriesId);
  if (occ.length < 2) return null;
  const days = Array.from(new Set(occ.map(o => o.day)));
  const first = occ[0].weekIdx + 1, last = occ[occ.length - 1].weekIdx + 1;
  return `↻ ${days.length === 1 ? `Chaque ${dayName(days[0]).toLowerCase()}` : "Chaque semaine"} · S${first} à S${last}`;
}
