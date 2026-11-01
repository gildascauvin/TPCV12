import type { ProgramTemplate, SessionTemplate, ExerciseAttachments } from "@/types";
import { parseLine } from "@/lib/exerciseParser";

/* « Appliquer aussi aux semaines suivantes » (2026-11-01) — retour d'un sportif : il avait ajouté
   son échauffement et des exercices dans la S1 de son programme, puis lancé « Mettre à jour mes
   séances à venir »… et rien n'avait bougé, parce que chaque semaine du template est indépendante.

   Règle : on ne propage que les exercices AJOUTÉS ou RETIRÉS d'une séance, jamais les
   prescriptions modifiées (séries, %, charges) — chaque semaine garde sa progression. La séance
   cible = même nom de séance dans chaque semaine suivante (le jour peut changer d'une semaine à
   l'autre). Un exercice déjà présent dans la cible n'est pas ajouté une seconde fois. */

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

export interface LineDiff {
  /** Lignes ajoutées, avec la clé des lignes qui les précèdent (pour les placer au même endroit). */
  added: { line: string; prevKeys: string[] }[];
  removedKeys: string[];
}

export function diffSessionLines(before: string | null, after: string | null): LineDiff {
  const b = linesOf(before), a = linesOf(after);
  const bKeys = new Set(b.map(exerciseKey));
  const aKeys = a.map(exerciseKey);
  const aSet = new Set(aKeys);
  const added = a.flatMap((line, i) => bKeys.has(aKeys[i]) ? [] : [{ line, prevKeys: aKeys.slice(0, i).reverse() }]);
  const removedKeys = Array.from(new Set(b.map(exerciseKey).filter(k => !aSet.has(k))));
  return { added, removedKeys };
}

export const isEmptyDiff = (d: LineDiff) => d.added.length === 0 && d.removedKeys.length === 0;

/** Applique le diff à une séance, en recalant exercise_media (clé = index de ligne). */
export function applyDiffToSession(s: SessionTemplate, diff: LineDiff): SessionTemplate {
  // Chaque ligne garde son media pendant les insertions/suppressions, réindexé à la fin.
  let rows = linesOf(s.notes).map((line, i) => ({ line, key: exerciseKey(line), media: s.exercise_media?.[String(i)] as ExerciseAttachments | undefined }));
  const removed = new Set(diff.removedKeys);
  rows = rows.filter(r => !removed.has(r.key));
  for (const { line, prevKeys } of diff.added) {
    const key = exerciseKey(line);
    if (rows.some(r => r.key === key)) continue;
    let at = prevKeys.length === 0 ? 0 : rows.length;
    for (const pk of prevKeys) {
      const idx = rows.map(r => r.key).lastIndexOf(pk);
      if (idx >= 0) { at = idx + 1; break; }
    }
    rows.splice(at, 0, { line, key, media: undefined });
  }
  const media: MediaMap = {};
  rows.forEach((r, i) => { if (r.media) media[String(i)] = r.media; });
  const hadMedia = s.exercise_media != null;
  return { ...s, notes: rows.map(r => r.line).join("\n") || null, ...(hadMedia || Object.keys(media).length ? { exercise_media: media } : {}) };
}

/** Séances des semaines après `fromWeekIdx` portant le même nom que la séance éditée. */
export function followingTargets(template: ProgramTemplate, fromWeekIdx: number, sessionName: string): { weekIdx: number; day: string; sIdx: number }[] {
  const key = sessionKey(sessionName);
  if (!key) return [];
  const out: { weekIdx: number; day: string; sIdx: number }[] = [];
  template.weeks.forEach((w, wi) => {
    if (wi <= fromWeekIdx) return;
    for (const [day, list] of Object.entries(w)) {
      ((list ?? []) as SessionTemplate[]).forEach((s, si) => { if (sessionKey(s.name) === key) out.push({ weekIdx: wi, day, sIdx: si }); });
    }
  });
  return out;
}

export function applyDiffToFollowingWeeks(template: ProgramTemplate, fromWeekIdx: number, sessionName: string, diff: LineDiff): ProgramTemplate {
  const targets = followingTargets(template, fromWeekIdx, sessionName);
  const hit = new Set(targets.map(t => `${t.weekIdx}|${t.day}|${t.sIdx}`));
  return {
    ...template,
    weeks: template.weeks.map((w, wi) => {
      if (wi <= fromWeekIdx) return w;
      const nw: typeof w = { ...w };
      for (const [day, list] of Object.entries(w)) {
        nw[day] = ((list ?? []) as SessionTemplate[]).map((s, si) => hit.has(`${wi}|${day}|${si}`) ? applyDiffToSession(s, diff) : s);
      }
      return nw;
    }),
  };
}
