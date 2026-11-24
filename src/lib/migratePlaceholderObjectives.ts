import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/* Objectifs fixés par le coach à un sportif SANS compte (objectives.coach_athlete_id, migration 050) :
   quand il s'inscrit et que sa fiche est reliée à son compte, ils passent sur son compte (user_id),
   sinon ni lui ni son coach ne les verraient plus (l'app lit ceux du compte dès qu'il existe).
   Un objectif qu'il suit déjà sur son compte n'est pas dupliqué : la copie de la fiche est supprimée.
   Appelé à la liaison (/api/invite/link, /api/invite/join) et, par sécurité, à chaque lecture coach. */
export async function migratePlaceholderObjectives(admin: AdminClient, coachAthleteId: string, userId: string): Promise<{ ok: boolean }> {
  const { data: rows, error } = await admin.from("objectives").select("id,objective_id").eq("coach_athlete_id", coachAthleteId);
  if (error) { console.error("[objectives] lecture fiche", coachAthleteId, error.message); return { ok: false }; }
  if (!rows?.length) return { ok: true };
  const { data: own, error: ownErr } = await admin.from("objectives").select("objective_id").eq("user_id", userId);
  if (ownErr) { console.error("[objectives] lecture compte", userId, ownErr.message); return { ok: false }; }
  const already = new Set((own ?? []).map(o => o.objective_id as string));
  const dupes = rows.filter(r => already.has(r.objective_id as string)).map(r => r.id as string);
  const moves = rows.filter(r => !already.has(r.objective_id as string)).map(r => r.id as string);
  if (dupes.length) {
    const { error: e } = await admin.from("objectives").delete().in("id", dupes);
    if (e) { console.error("[objectives] doublons", e.message); return { ok: false }; }
  }
  if (moves.length) {
    const { error: e } = await admin.from("objectives").update({ user_id: userId, coach_athlete_id: null }).in("id", moves);
    if (e) { console.error("[objectives] transfert", e.message); return { ok: false }; }
  }
  return { ok: true };
}
