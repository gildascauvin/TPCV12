import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    const { data: assignment } = await admin
      .from("program_assignments")
      .select("id, coach_id, user_id, athlete_id, start_date, programs(weeks_count)")
      .eq("id", id)
      .single();

    if (!assignment) return Response.json({ error: "Assignment introuvable" }, { status: 404 });

    const isCoach = assignment.coach_id === user.id;
    const isAthlete = assignment.athlete_id === user.id || assignment.user_id === user.id;
    if (!isCoach && !isAthlete) {
      return Response.json({ error: "Non autorisé" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weeksCount = (assignment.programs as any)?.weeks_count ?? 12;
    const endDate = addDays(assignment.start_date, weeksCount * 7);

    // Primary: delete by program_assignment_id (new assignments)
    // Fallback: delete by user/athlete + date range (assignments created before tracking)
    await Promise.all([
      admin.from("sessions")
        .delete()
        .eq("program_assignment_id", id)
        .gte("date", today)
        .eq("done", false),

      // Fallback for sessions without program_assignment_id
      assignment.user_id ? admin.from("sessions")
        .delete()
        .eq("user_id", assignment.user_id)
        .gte("date", today)
        .lte("date", endDate)
        .eq("done", false)
        .is("program_assignment_id", null) : Promise.resolve(),

      admin.from("coach_sessions")
        .delete()
        .eq("program_assignment_id", id)
        .gte("date", today)
        .eq("done", false),

      // Fallback for coach_sessions without program_assignment_id
      assignment.athlete_id ? admin.from("coach_sessions")
        .delete()
        .eq("athlete_id", assignment.athlete_id)
        .gte("date", today)
        .lte("date", endDate)
        .eq("done", false)
        .is("program_assignment_id", null) : Promise.resolve(),
    ]);

    const { error } = await admin
      .from("program_assignments")
      .update({ status: "inactive" })
      .eq("id", id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e) {
    console.error("[stop-program] Unexpected error:", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
