import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgramTemplate } from "@/types";
import { firstTrainingDay, scheduleSessions, addDaysStr } from "@/lib/programSchedule";
import { parseAndApply } from "@/lib/loadAdjust";

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Allègement de la semaine 0 : difficulté −2, charges et volumes −20 %.
const ACCLIMATATION_DIFF = -2;
const ACCLIMATATION_LOAD_PCT = -20;

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

    const body = await req.json();
    const { athlete_id, user_id, wellnessAdjustment, align_first_session } = body;
    let start_date: string = body.start_date;
    /* Semaine 0 d'acclimatation (onboarding post-signup uniquement, 2026-10-05) : `start_date` reçu
       = aujourd'hui (date locale du client). Un lundi, le programme démarre aujourd'hui, sans S0.
       Sinon il démarre lundi prochain et les séances de S1 des jours restants de la semaine (dont
       aujourd'hui) sont posées dès maintenant, allégées. */
    const todayIdx = (new Date(`${start_date}T12:00:00`).getDay() + 6) % 7; // 0 = lundi
    const acclimatation = body.acclimatation === true && todayIdx > 0;
    const acclimatationToday = start_date;
    if (acclimatation) start_date = addDaysStr(acclimatationToday, 7 - todayIdx);
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

    // Nettoie les assignments déjà terminés de ce sportif (hygiène) — jamais un programme
    // en cours ou programmé à l'avance, pour permettre d'enchaîner plusieurs programmes
    // futurs sans que le nouveau n'écrase un programme pas encore commencé/pas encore fini.
    if (athlete_id || user_id) {
      let staleQuery = admin
        .from("program_assignments")
        .select("id, start_date, programs(weeks_count)")
        .eq("status", "active");
      if (athlete_id) staleQuery = staleQuery.eq("athlete_id", athlete_id);
      if (user_id) staleQuery = staleQuery.eq("user_id", user_id);
      const { data: existingActive } = await staleQuery;
      const todayStr = new Date().toISOString().split("T")[0];
      const staleIds = (existingActive ?? [])
        .filter((a: { start_date: string; programs: { weeks_count: number } | { weeks_count: number }[] | null }) => {
          const weeksCount = Array.isArray(a.programs) ? a.programs[0]?.weeks_count : a.programs?.weeks_count;
          const endDate = addDays(a.start_date, (weeksCount ?? 0) * 7);
          return endDate <= todayStr;
        })
        .map((a: { id: string }) => a.id);
      if (staleIds.length > 0) {
        await admin.from("program_assignments").update({ status: "inactive" }).in("id", staleIds);
      }
    }

    /* "Démarrer aujourd'hui" (2026-10-01) : la 1re séance du programme tombe sur start_date, toute la
       semaine type est décalée d'autant (écarts gardés). L'ancre est mémorisée pour que la mise à
       jour des séances à venir retombe sur les mêmes dates (src/lib/programSchedule.ts). */
    const template: ProgramTemplate = program.template;
    const anchorDay = align_first_session ? firstTrainingDay(template) : null;

    const { data: assignment, error: assignError } = await admin
      .from("program_assignments")
      .insert({ program_id: id, coach_id: user.id, athlete_id: athlete_id ?? null, user_id: user_id ?? null, start_date, day_anchor: anchorDay, acclimatation })
      .select()
      .single();

    if (assignError) {
      console.error("[assign] program_assignments insert error:", assignError);
      return Response.json({ error: assignError.message }, { status: 500 });
    }

    const sessionsToInsert: object[] = [];
    const coachSessionsToInsert: object[] = [];

    scheduleSessions(template, start_date, anchorDay).forEach(({ date, weekIdx, session: s }) => {
      // Semaine 1 seulement : ajuste la difficulté à la récupération réelle déclarée à l'inscription
      const target_difficulty = weekIdx === 0 && typeof wellnessAdjustment === "number"
        ? Math.max(1, Math.min(10, s.target_difficulty + wellnessAdjustment))
        : s.target_difficulty;
      const base = { date, name: s.name, notes: s.notes, target_difficulty, done: false };
      if (user_id) {
        sessionsToInsert.push({ ...base, user_id, program_assignment_id: assignment.id });
      } else if (athlete_id) {
        coachSessionsToInsert.push({ ...base, coach_id: user.id, athlete_id, program_assignment_id: assignment.id });
      }
    });

    if (acclimatation) {
      const w0 = (template.weeks[0] ?? {}) as Record<string, ProgramTemplate["weeks"][number][string]>;
      WEEK_DAYS.forEach((day, idx) => {
        if (idx < todayIdx) return;
        (w0[day] ?? []).forEach(s => {
          const base = {
            date: addDaysStr(acclimatationToday, idx - todayIdx),
            name: `Acclimatation · ${s.name}`,
            notes: s.notes ? parseAndApply(s.notes, ACCLIMATATION_LOAD_PCT) : s.notes,
            target_difficulty: Math.max(1, s.target_difficulty + ACCLIMATATION_DIFF),
            done: false,
          };
          if (user_id) sessionsToInsert.push({ ...base, user_id, program_assignment_id: assignment.id });
          else if (athlete_id) coachSessionsToInsert.push({ ...base, coach_id: user.id, athlete_id, program_assignment_id: assignment.id });
        });
      });
    }

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
