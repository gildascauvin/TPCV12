import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgramTemplate } from "@/types";
import { scheduleSessions } from "@/lib/programSchedule";

/* "Mettre à jour mes séances à venir" (onboarding in-app, 2026-10-01) — après édition d'un programme
   déjà assigné. Pour chaque assignment actif : les séances non terminées à partir d'aujourd'hui
   sont remplacées par celles du template édité, aux MÊMES dates qu'à l'assignation (même start_date,
   même ancre — pas de redémarrage en S1). Les séances terminées ne sont jamais touchées. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();
    const { data: program } = await admin.from("programs").select("id, template").eq("id", id).eq("owner_id", user.id).single();
    if (!program) return Response.json({ error: "Programme introuvable" }, { status: 404 });

    const { data: assignments, error: aErr } = await admin
      .from("program_assignments")
      .select("id, coach_id, athlete_id, user_id, start_date, day_anchor")
      .eq("program_id", id)
      .eq("status", "active");
    if (aErr) return Response.json({ error: aErr.message }, { status: 500 });

    const today = new Date().toISOString().split("T")[0];
    const template = program.template as ProgramTemplate;
    let updated = 0;

    for (const a of assignments ?? []) {
      // Même règle de table qu'à l'assignation : un sportif réel (user_id) a ses séances dans
      // `sessions`, un sportif sans compte (athlete_id seul) dans `coach_sessions`.
      const table = a.user_id ? "sessions" : "coach_sessions";

      const { data: doneToday } = await admin.from(table).select("id")
        .eq("program_assignment_id", a.id).eq("date", today).eq("done", true);
      const skipToday = (doneToday ?? []).length > 0;

      const { error: delErr } = await admin.from(table).delete()
        .eq("program_assignment_id", a.id).gte("date", today).eq("done", false);
      if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

      const rows = scheduleSessions(template, a.start_date, a.day_anchor)
        .filter(x => x.date > today || (x.date === today && !skipToday))
        .map(({ date, session: s }) => {
          const base = { date, name: s.name, notes: s.notes, target_difficulty: s.target_difficulty, done: false, program_assignment_id: a.id };
          return a.user_id ? { ...base, user_id: a.user_id } : { ...base, coach_id: a.coach_id, athlete_id: a.athlete_id };
        });
      if (rows.length) {
        const { error: insErr } = await admin.from(table).insert(rows);
        if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
      }
      updated++;
    }

    return Response.json({ ok: true, updated });
  } catch (e) {
    console.error("[resync] Unexpected error:", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
