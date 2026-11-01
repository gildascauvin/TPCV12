import type { SessionTemplate, ExerciseAttachments } from "@/types";
import { parseLine } from "@/lib/exerciseParser";

/* Briques de comparaison et d'alignement de séances, utilisées par les séries (sessionSeries.ts) :
   clé d'exercice (nom sans prescription), différence entre deux versions d'une séance, alignement
   d'une séance sœur sur une autre (exercices + ordre) sans toucher aux prescriptions. */

type MediaMap = Record<string, ExerciseAttachments>;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Clé d'un exercice : nom sans prescription ni parenthèses, sans accents, mots triés (« Cosaque squat » =
 *  « Squat cosaque »), « par côté » ignoré. */
export function exerciseKey(line: string): string {
  const p = parseLine(line);
  const base = strip(p.name || line).replace(/\([^)]*\)/g, " ").replace(/\bpar\s+cotes?\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return base.split(" ").filter(Boolean).sort().join(" ") || strip(line).trim();
}

/** Nom lisible d'un exercice (sans séries ni charges), pour le résumé affiché. */
export function exerciseLabel(line: string): string {
  return parseLine(line).name || line.trim();
}

export const sessionKey = (name: string) => strip(name).replace(/[^a-z0-9]+/g, " ").trim();

const linesOf = (notes: string | null | undefined) => (notes ? notes.split("\n").filter(Boolean) : []);

/** Clés numérotées par occurrence : un exercice écrit deux fois dans la séance reste deux lignes. */
export function occKeys(lines: string[]): string[] {
  const seen = new Map<string, number>();
  return lines.map(l => { const k = exerciseKey(l); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return `${k}#${n}`; });
}

export interface ExerciseChange {
  added: string[];
  removed: string[];
  reordered: boolean;
  /** Clés (numérotées) retirées pendant cette édition. */
  removedKeys: string[];
}

export function exerciseChange(before: string | null, after: string | null): ExerciseChange {
  const b = linesOf(before), a = linesOf(after);
  const bk = occKeys(b), ak = occKeys(a);
  const bSet = new Set(bk), aSet = new Set(ak);
  const added = a.filter((_, i) => !bSet.has(ak[i]));
  const removedIdx = b.map((_, i) => i).filter(i => !aSet.has(bk[i]));
  const commonB = bk.filter(k => aSet.has(k)), commonA = ak.filter(k => bSet.has(k));
  return {
    added: added.map(exerciseLabel),
    removed: removedIdx.map(i => exerciseLabel(b[i])),
    reordered: commonB.join("|") !== commonA.join("|"),
    removedKeys: removedIdx.map(i => bk[i]),
  };
}

/** Aligne une séance sœur sur la liste source, en recalant exercise_media (clé = index de ligne). */
export interface AlignOptions {
  /** Ligne nouvelle dans la source : comment l'écrire dans cette séance (progression de la série). */
  newLine?: (line: string) => string;
  /** Ligne commune : réécriture à partir de la ligne de cette séance (report d'un écart de dose). */
  commonLine?: (key: string, targetLine: string) => string;
}

export function alignSession(s: SessionTemplate, sourceNotes: string | null, removedKeys: string[], opt: AlignOptions = {}): SessionTemplate {
  const src = linesOf(sourceNotes), sk = occKeys(src);
  const srcIdx = new Map(sk.map((k, i) => [k, i]));
  const tLines = linesOf(s.notes), tk = occKeys(tLines);
  const removed = new Set(removedKeys);
  let rows = tLines
    .map((line, i) => ({ line, key: tk[i], media: s.exercise_media?.[String(i)] as ExerciseAttachments | undefined }))
    .filter(r => !removed.has(r.key));

  // Ordre de la source ; chaque exercice propre à cette semaine reste collé à l'exercice qui le
  // précédait (en tête s'il n'en avait pas). Une ligne commune garde sa prescription à elle.
  type Row = typeof rows[number];
  const own = new Map<string | null, Row[]>();
  let anchor: string | null = null;
  for (const r of rows) {
    if (srcIdx.has(r.key)) { anchor = r.key; continue; }
    own.set(anchor, [...(own.get(anchor) ?? []), r]);
  }
  const byKey = new Map(rows.map(r => [r.key, r]));
  const ordered: Row[] = [...(own.get(null) ?? [])];
  src.forEach((line, i) => {
    const mine = byKey.get(sk[i]);
    ordered.push(mine
      ? (opt.commonLine ? { ...mine, line: opt.commonLine(sk[i], mine.line) } : mine)
      : { line: opt.newLine ? opt.newLine(line) : line, key: sk[i], media: undefined });
    ordered.push(...(own.get(sk[i]) ?? []));
  });
  rows = ordered;

  const media: MediaMap = {};
  rows.forEach((r, i) => { if (r.media) media[String(i)] = r.media; });
  const hadMedia = s.exercise_media != null;
  return { ...s, notes: rows.map(r => r.line).join("\n") || null, ...(hadMedia || Object.keys(media).length ? { exercise_media: media } : {}) };
}
