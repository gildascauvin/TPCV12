import type { ExerciseAttachments } from "@/types";

type MediaMap = Record<string, ExerciseAttachments>;

/* Ré-indexe `exercise_media` (JSONB clé = position texte de la ligne) quand une ligne d'exercice
   est retirée/insérée dans `notes` — sans ce recalage, un déplacement (drag & drop) décale
   silencieusement les vidéos/photos/commentaires attachés aux lignes suivantes. */

function mediaAfterRemove(media: MediaMap | null | undefined, removedIdx: number): MediaMap {
  const out: MediaMap = {};
  if (!media) return out;
  for (const [k, v] of Object.entries(media)) {
    const i = Number(k);
    if (i === removedIdx) continue;
    out[String(i > removedIdx ? i - 1 : i)] = v;
  }
  return out;
}

function mediaAfterInsert(media: MediaMap | null | undefined, insertIdx: number): MediaMap {
  const out: MediaMap = {};
  if (!media) return out;
  for (const [k, v] of Object.entries(media)) {
    const i = Number(k);
    out[String(i >= insertIdx ? i + 1 : i)] = v;
  }
  return out;
}

/** Déplace une ligne d'exercice (texte + media attaché) d'une position vers une autre — dans la
 *  même séance (réordonnancement) ou entre deux séances distinctes (drag cross-séance). Fonction
 *  pure : ne mute rien, retourne les nouvelles paires {notes, media} pour la source et la cible
 *  (identiques quand `sameSession`). `toIdx: null` = ajout en fin de séance cible. */
export function moveExerciseLine(opts: {
  fromNotes: string | null;
  fromMedia: MediaMap | null | undefined;
  fromIdx: number;
  toNotes: string | null;
  toMedia: MediaMap | null | undefined;
  toIdx: number | null;
  sameSession: boolean;
}): { source: { notes: string; media: MediaMap }; target: { notes: string; media: MediaMap } } | null {
  const fromLines = opts.fromNotes ? opts.fromNotes.split("\n").filter(Boolean) : [];
  if (opts.fromIdx < 0 || opts.fromIdx >= fromLines.length) return null;

  if (opts.sameSession) {
    const lines = [...fromLines];
    const [moved] = lines.splice(opts.fromIdx, 1);
    const toIdx = opts.toIdx === null ? lines.length : Math.max(0, Math.min(opts.toIdx, lines.length));
    lines.splice(toIdx, 0, moved);
    const movedMedia = opts.fromMedia?.[String(opts.fromIdx)];
    const media = mediaAfterInsert(mediaAfterRemove(opts.fromMedia, opts.fromIdx), toIdx);
    if (movedMedia) media[String(toIdx)] = movedMedia;
    const notes = lines.join("\n");
    return { source: { notes, media }, target: { notes, media } };
  }

  const fLines = [...fromLines];
  const [moved] = fLines.splice(opts.fromIdx, 1);
  const movedMedia = opts.fromMedia?.[String(opts.fromIdx)];
  const sourceMedia = mediaAfterRemove(opts.fromMedia, opts.fromIdx);
  const sourceNotes = fLines.join("\n");

  const tLines = opts.toNotes ? opts.toNotes.split("\n").filter(Boolean) : [];
  const toIdx = opts.toIdx === null ? tLines.length : Math.max(0, Math.min(opts.toIdx, tLines.length));
  tLines.splice(toIdx, 0, moved);
  const targetMedia = mediaAfterInsert(opts.toMedia, toIdx);
  if (movedMedia) targetMedia[String(toIdx)] = movedMedia;
  const targetNotes = tLines.join("\n");

  return { source: { notes: sourceNotes, media: sourceMedia }, target: { notes: targetNotes, media: targetMedia } };
}
