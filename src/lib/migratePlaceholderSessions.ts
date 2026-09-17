import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/* Au moment où un sportif invité par un coach s'inscrit réellement, ses éventuelles coach_sessions
   (rattachées au placeholder coach_athletes.id) doivent être traitées différemment selon leur
   origine (colonne is_demo, migration 020) :
   - Synthétiques (posées par buildCoachDemoSessions à l'invitation) : supprimées, redondantes une
     fois que le sportif a ses propres vraies séances.
   - Réelles (programme assigné via /api/programs/[id]/assign avant l'inscription, ou séance
     ajoutée manuellement par le coach) : migrées vers `sessions` (la table du sportif, jamais lue
     par le coach) avec le nouveau user_id, pour que le sportif les voie enfin sur /today et /week.
     Les program_assignments concernées sont mises à jour pour porter aussi ce user_id, sinon
     l'assignation resterait invisible pour tout code qui la cherche par user_id plutôt que par
     athlete_id. Les coach_sessions réelles déjà migrées sont ensuite supprimées, pour éviter un
     doublon si le tableau de bord du coach venait à lire les deux tables pour un athlète devenu réel.

   Bug corrigé le 2026-09-16 : avant ce correctif, TOUTES les coach_sessions du placeholder (démo
   ET réelles) étaient supprimées sans distinction au moment du join — un coach qui avait déjà
   construit un planning/programme pour un sportif en attente le perdait intégralement dès que
   celui-ci rejoignait réellement. */
export async function migratePlaceholderSessions(
  admin: AdminClient,
  placeholderAthleteId: string,
  newUserId: string
): Promise<{ ok: boolean }> {
  const { data: rows, error: readError } = await admin
    .from("coach_sessions")
    .select("*")
    .eq("athlete_id", placeholderAthleteId);

  if (readError) {
    console.error("[migratePlaceholderSessions] lecture coach_sessions échouée", placeholderAthleteId, readError);
    return { ok: false };
  }
  if (!rows || rows.length === 0) return { ok: true };

  const demoRows = rows.filter((r) => r.is_demo);
  const realRows = rows.filter((r) => !r.is_demo);

  if (realRows.length > 0) {
    const sessionsToInsert = realRows.map((r) => ({
      user_id: newUserId,
      date: r.date,
      name: r.name,
      notes: r.notes,
      duration: r.duration,
      rpe: r.rpe,
      done: r.done,
      target_difficulty: r.target_difficulty,
      program_assignment_id: r.program_assignment_id,
      exercise_media: r.exercise_media,
    }));
    const { error: insertError } = await admin.from("sessions").insert(sessionsToInsert);
    if (insertError) {
      console.error("[migratePlaceholderSessions] migration vers sessions échouée", placeholderAthleteId, insertError);
      // Ne pas supprimer les coach_sessions réelles si la migration a échoué — mieux vaut un
      // doublon visible (récupérable) qu'une perte de données silencieuse.
      if (demoRows.length > 0) {
        await admin.from("coach_sessions").delete().in("id", demoRows.map((r) => r.id));
      }
      return { ok: false };
    }

    const assignmentIds = Array.from(new Set(realRows.map((r) => r.program_assignment_id).filter(Boolean)));
    if (assignmentIds.length > 0) {
      const { error: assignError } = await admin
        .from("program_assignments")
        .update({ user_id: newUserId })
        .in("id", assignmentIds);
      if (assignError) {
        console.error("[migratePlaceholderSessions] mise à jour program_assignments.user_id échouée", assignmentIds, assignError);
      }
    }
  }

  const idsToDelete = [...demoRows, ...realRows].map((r) => r.id);
  const { error: deleteError } = await admin.from("coach_sessions").delete().in("id", idsToDelete);
  if (deleteError) {
    console.error("[migratePlaceholderSessions] suppression coach_sessions échouée", idsToDelete, deleteError);
    return { ok: false };
  }

  return { ok: true };
}
