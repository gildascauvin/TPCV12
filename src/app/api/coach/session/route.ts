import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyCoachUpdate } from "@/lib/pushSend";
import { freezeMorningProposal, notifyCoachesIfLighten } from "@/lib/autoregProposalServer";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { action, athleteId, sessionId, data } = body;

  const admin = createAdminClient();

  // Verify coach owns this athlete
  const { data: athlete } = await supabase
    .from("coach_athletes")
    .select("id, user_id, coach_id")
    .eq("id", athleteId)
    .eq("coach_id", user.id)
    .single();

  if (!athlete) return Response.json({ error: "Sportif introuvable" }, { status: 404 });

  const isReal = !!athlete.user_id;
  // Notif "programme mis à jour" au sportif inscrit (regroupée, 1 toutes les 6 h), jamais pour une
  // séance passée ni pour "Terminer" (le coach note un résultat, rien à annoncer).
  const todayIso = new Date().toISOString().slice(0, 10);
  const notifyAthlete = async (date: string | null | undefined) => {
    if (!isReal || !athlete.user_id || (date && date < todayIso)) return;
    const { data: coach } = await admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle();
    await notifyCoachUpdate(admin, athlete.user_id, coach?.name ?? null);
  };

  if (action === "add") {
    if (isReal) {
      const { data: row, error } = await admin
        .from("sessions")
        .insert({ user_id: athlete.user_id, done: false, ...data })
        .select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      await notifyAthlete(row?.date);
      /* Rattrapage (2026-10-24) : séance envoyée après le check-in du sportif → conseil figé tout de
         suite (sans check-in ce jour-là, rien à figer), coach prévenu s'il dit d'alléger. */
      let proposal = null;
      if (row?.date) {
        try {
          const r = await freezeMorningProposal(admin, athlete.user_id!, row.date);
          if (r?.frozen) await notifyCoachesIfLighten(admin, athlete.user_id!, row.date, r);
          if (r && r.sessionId === row.id) proposal = r.proposal;
        } catch (e) { console.error("[coach] figeage", e); }
      }
      return Response.json({ ok: true, session: proposal ? { ...row, autoreg_proposal: proposal } : row, _real: true });
    } else {
      const { data: row, error } = await admin
        .from("coach_sessions")
        .insert({ coach_id: user.id, athlete_id: athlete.id, done: false, ...data })
        .select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, session: row, _real: false });
    }
  }

  if (action === "update" || action === "complete") {
    const updateData = action === "complete" ? { done: true, ...data } : data;

    // For real athletes, verify the session belongs to this athlete
    if (isReal) {
      const { data: row, error } = await admin
        .from("sessions")
        .update(updateData)
        .eq("id", sessionId)
        .eq("user_id", athlete.user_id)
        .select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (action === "update") await notifyAthlete(row?.date);
      return Response.json({ ok: true, session: row, _real: true });
    } else {
      const { data: row, error } = await admin
        .from("coach_sessions")
        .update(updateData)
        .eq("id", sessionId)
        .eq("athlete_id", athlete.id)
        .select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, session: row, _real: false });
    }
  }

  if (action === "delete") {
    if (isReal) {
      await admin.from("sessions").delete().eq("id", sessionId).eq("user_id", athlete.user_id);
    } else {
      await admin.from("coach_sessions").delete().eq("id", sessionId).eq("athlete_id", athlete.id);
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
