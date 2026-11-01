import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applySeriesEdit, weeklyCopies, newSeriesId, type SessionState } from "@/lib/sessionSeries";
import type { ChargeAdjust } from "@/lib/chargeAdjust";
import { mediaForAssignment } from "@/lib/programMedia";
import { notifyCoachUpdate } from "@/lib/pushSend";

/* Séries du Planning (2026-11-01, migration 047), façon Google Agenda. Une route pour le sportif
   (sur ses séances, sans athleteId) et le coach (athleteId : sportif inscrit → `sessions`, sans
   compte → `coach_sessions`). Les séances déjà faites ne sont jamais touchées.
   Actions :
   - info    { sessionId, afterDate? }            → { following, dates, lastDate } (séances à venir de la série)
   - repeat  { sessionId, untilDate, step }        → crée les copies hebdomadaires, { created }
   - edit    { sessionId, before, after, untilDate } → reporte l'édition sur les suivantes, { updated }
   - move    { sessionId, fromDate, toDate }       → décale les suivantes d'autant de jours, { updated }
   - delete  { sessionId }                         → supprime celle-ci et les suivantes, { deletedIds } */

const addDays = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
    const body = await req.json();
    const { action, athleteId, sessionId } = body as { action: string; athleteId?: string; sessionId: string };
    if (!sessionId) return Response.json({ error: "sessionId manquant" }, { status: 400 });

    // Portée : table + filtre propriétaire.
    let table: "sessions" | "coach_sessions" = "sessions";
    let owner: { col: "user_id" | "athlete_id"; val: string } = { col: "user_id", val: user.id };
    let extra: Record<string, string> = { user_id: user.id };
    const admin = createAdminClient();
    if (athleteId) {
      const { data: a } = await supabase.from("coach_athletes").select("id, user_id, coach_id").eq("id", athleteId).eq("coach_id", user.id).single();
      if (!a) return Response.json({ error: "Sportif introuvable" }, { status: 404 });
      if (a.user_id) { owner = { col: "user_id", val: a.user_id }; extra = { user_id: a.user_id }; }
      else { table = "coach_sessions"; owner = { col: "athlete_id", val: a.id }; extra = { coach_id: user.id, athlete_id: a.id }; }
    }
    const db = athleteId ? admin : supabase;
    // Coach → sportif inscrit : même notification « programme mis à jour » qu'une modification simple.
    const notify = async () => {
      if (!athleteId || table !== "sessions" || owner.val === user.id) return;
      try {
        const { data: coach } = await admin.from("profiles").select("name").eq("user_id", user.id).maybeSingle();
        await notifyCoachUpdate(admin, owner.val, coach?.name ?? null);
      } catch (e) { console.error("[sessions/series] notif", e); }
    };

    const { data: src, error: srcErr } = await db.from(table).select("*").eq("id", sessionId).eq(owner.col, owner.val).single();
    if (srcErr || !src) return Response.json({ error: "Séance introuvable" }, { status: 404 });

    const followingRows = async (afterDate: string) => {
      if (!src.series_id) return [];
      const { data, error } = await db.from(table).select("*").eq(owner.col, owner.val).eq("series_id", src.series_id).eq("done", false).gt("date", afterDate).order("date");
      if (error) throw error;
      return data ?? [];
    };

    if (action === "info") {
      // afterDate : après un déplacement, les suivantes se comptent depuis la date d'origine.
      const { afterDate } = body as { afterDate?: string };
      const rows = (await followingRows(afterDate ?? src.date)).filter(r => r.id !== src.id);
      return Response.json({ following: rows.length, dates: rows.map(r => r.date), lastDate: rows.length ? rows[rows.length - 1].date : null, seriesId: src.series_id ?? null });
    }

    if (action === "repeat") {
      const { untilDate, step } = body as { untilDate: string; step: ChargeAdjust | null };
      if (!untilDate || untilDate <= src.date) return Response.json({ error: "Date de fin invalide" }, { status: 400 });
      const series_id = src.series_id ?? newSeriesId();
      const series_step = step && (step.inten || step.vol) ? step : null;
      const { error: upErr } = await db.from(table).update({ series_id, series_step }).eq("id", src.id).eq(owner.col, owner.val);
      if (upErr) throw upErr;
      const today = new Date().toISOString().slice(0, 10);
      const copies = weeklyCopies({ date: src.date, name: src.name, notes: src.notes, target_difficulty: src.target_difficulty }, untilDate, series_step, today);
      if (!copies.length) return Response.json({ created: [], seriesId: series_id });
      // Vidéos et photos suivent la copie (même ligne = même index), jamais les commentaires.
      const media = mediaForAssignment(src.exercise_media, false);
      const rows = copies.map(c => ({ ...extra, ...c, done: false, series_id, series_step, exercise_media: media }));
      const { data: created, error } = await db.from(table).insert(rows).select();
      if (error) throw error;
      await notify();
      return Response.json({ created: created ?? [], seriesId: series_id });
    }

    if (action === "edit") {
      const { before, after, untilDate } = body as { before: SessionState; after: SessionState; untilDate?: string };
      const rows = (await followingRows(src.date)).filter(r => !untilDate || r.date <= untilDate);
      const updated = [];
      for (const r of rows) {
        const k = Math.round((new Date(r.date + "T12:00:00Z").getTime() - new Date(src.date + "T12:00:00Z").getTime()) / (7 * 86400000));
        const next = applySeriesEdit({ name: r.name, notes: r.notes, target_difficulty: r.target_difficulty, exercise_media: r.exercise_media }, before, after, src.series_step, Math.max(1, k));
        const { data, error } = await db.from(table).update({ name: next.name, notes: next.notes, target_difficulty: next.target_difficulty, exercise_media: next.exercise_media ?? r.exercise_media ?? {} }).eq("id", r.id).eq(owner.col, owner.val).select().single();
        if (error) throw error;
        if (data) updated.push(data);
      }
      if (updated.length) await notify();
      return Response.json({ updated });
    }

    if (action === "move") {
      const { fromDate, toDate } = body as { fromDate: string; toDate: string };
      const delta = Math.round((new Date(toDate + "T12:00:00Z").getTime() - new Date(fromDate + "T12:00:00Z").getTime()) / 86400000);
      if (!delta) return Response.json({ updated: [] });
      // La séance source a déjà été déplacée par le Planning : les suivantes sont après sa date d'origine.
      const rows = (await followingRows(fromDate)).filter(r => r.id !== src.id);
      const updated = [];
      for (const r of rows) {
        const { data, error } = await db.from(table).update({ date: addDays(r.date, delta) }).eq("id", r.id).eq(owner.col, owner.val).select().single();
        if (error) throw error;
        if (data) updated.push(data);
      }
      if (updated.length) await notify();
      return Response.json({ updated });
    }

    if (action === "delete") {
      const rows = await followingRows(src.date);
      const ids = [src.id, ...rows.map(r => r.id)];
      const { error } = await db.from(table).delete().in("id", ids).eq(owner.col, owner.val);
      if (error) throw error;
      await notify();
      return Response.json({ deletedIds: ids });
    }

    return Response.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    console.error("[sessions/series]", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
