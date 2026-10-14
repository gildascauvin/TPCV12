import type { ExerciseAttachments } from "@/types";

/* Vidéos, photos et commentaires d'un programme recopiés sur les séances d'une assignation
   (2026-10-08). Un commentaire du coach suit le programme chez chaque sportif assigné ; un
   commentaire de sportif reste privé (n'est recopié que s'il s'assigne son propre programme).
   Un test garde son marquage mais jamais une valeur : chaque sportif note la sienne.
   Retourne toujours un objet (jamais null) : `exercise_media` est NOT NULL en base, un null explicite
   faisait échouer l'insert de TOUTES les séances d'une assignation (bug du 2026-10-09 au 10-13). */
export function mediaForAssignment(
  media: Record<string, ExerciseAttachments> | null | undefined,
  keepAthleteComments: boolean,
): Record<string, ExerciseAttachments> {
  if (!media) return {};
  const out: Record<string, ExerciseAttachments> = {};
  for (const [key, a] of Object.entries(media)) {
    if (!a) continue;
    const comments = (a.comments ?? []).filter(c => keepAthleteComments || c.author !== "athlete");
    const result = a.result ? { ...a.result, value: "" } : undefined;
    if (!a.videoUrl && !a.photoUrl && comments.length === 0 && !result) continue;
    out[key] = {
      ...a,
      comments,
      result,
      updatedBy: !keepAthleteComments && a.updatedBy === "athlete" ? "coach" : a.updatedBy,
    };
  }
  return out;
}
