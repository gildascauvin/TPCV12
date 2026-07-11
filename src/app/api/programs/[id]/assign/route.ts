import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgramTemplate, SessionTemplate } from "@/types";

const DAY_OFFSETS: Record<string, number> = {
  Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6,
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { athlete_id, user_id, start_date, wellnessAdjustment } = await req.json();
    const admin = createAdminClient();

    const { data: program } = await admin
      .from("programs")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    if (!program) return Response.json({ error: "Programme introuvable" }, { status: 404 });

    // Check for existing active assignment — use let to properly chain immutable builders
    let existingQuery = admin
      .from("program_assignments")
      .select("id")
      .eq("program_id", id)
      .eq("status", "active");
    if (athlete_id) existingQuery = existingQuery.eq("athlete_id", athlete_id);
    if (user_id) existingQuery = existingQuery.eq("user_id", user_id);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) return Response.json({ error: "Un assignment actif existe déjà" }, { status: 409 });

    const { data: assignment, error: assignError } = await admin
      .from("program_assignments")
      .insert({ program_id: id, coach_id: user.id, athlete_id: athlete_id ?? null, user_id: user_id ?? null, start_date })
      .select()
      .single();

    if (assignError) {
      console.error("[assign] program_assignments insert error:", assignError);
      return Response.json({ error: assignError.message }, { status: 500 });
    }

    const template: ProgramTemplate = program.template;
    const sessionsToInsert: object[] = [];
    const coachSessionsToInsert: object[] = [];

    template.weeks.forEach((week, weekIdx) => {
      Object.entries(week).forEach(([day, daySessionsRaw]) => {
        const daySessions = daySessionsRaw as SessionTemplate[];
        const dayOffset = DAY_OFFSETS[day] ?? 0;
        const date = addDays(start_date, weekIdx * 7 + dayOffset);

        daySessions.forEach((s) => {
          // Semaine 1 seulement : ajuste la difficulté à la récupération réelle déclarée à l'inscription
          const target_difficulty = weekIdx === 0 && typeof wellnessAdjustment === "number"
            ? Math.max(1, Math.min(10, s.target_difficulty + wellnessAdjustment))
            : s.target_difficulty;
          const base = {
            date,
            name: s.name,
            notes: s.notes,
            target_difficulty,
            done: false,
          };

          if (user_id) {
            sessionsToInsert.push({ ...base, user_id, program_assignment_id: assignment.id });
          } else if (athlete_id) {
            coachSessionsToInsert.push({ ...base, coach_id: user.id, athlete_id, program_assignment_id: assignment.id });
          }
        });
      });
    });

    if (sessionsToInsert.length > 0) {
      const { error } = await admin.from("sessions").insert(sessionsToInsert);
      if (error) {
        console.error("[assign] sessions insert error:", error);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    if (coachSessionsToInsert.length > 0) {
      const { error } = await admin.from("coach_sessions").insert(coachSessionsToInsert);
      if (error) {
        console.error("[assign] coach_sessions insert error:", error);
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    return Response.json({ assignment }, { status: 201 });
  } catch (e) {
    console.error("[assign] Unexpected error:", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
