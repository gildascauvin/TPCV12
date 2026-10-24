import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRecal, type RecalEvent } from "@/lib/bilan";
import { BILAN_SESSION_COLS } from "@/lib/bilanCols";

/* Recalage automatique (2026-10-24). Trois usages :
   - { sessionId } : après une séance notée (écran post-séance, sportif ou coach lié) — vérifie les
     comptes du sportif et applique le recalage s'il est dû (≥ 10 conseils jugés d'un type, confirmés
     < 35 %, seuil qui fait monter le taux global). Le sportif voit l'annonce et peut annuler.
   - { undo: true } : le sportif annule le dernier recalage (jamais reproposé à l'identique).
   - { apply: { dir, shift } } : « Me recaler » manuel du bilan.
   Chaque changement est journalisé dans profiles.autoreg_recal_events. */
const CHECKIN_COLS = "date,sleep,stress,recovery,motivation,score,base_score,behaviors,bedtime,device_sleep_minutes,device_hrv_ms,device_resting_hr,device_rhr_baseline,device_hrv_baseline,created_at";
const today = () => new Date().toISOString().slice(0, 10);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { sessionId?: string; undo?: boolean; apply?: { dir: "low" | "high"; shift: number } };
  const admin = createAdminClient();

  let target = user.id;
  if (typeof body.sessionId === "string") {
    const { data: s, error } = await admin.from("sessions").select("user_id").eq("id", body.sessionId).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!s) return Response.json({ applied: null });
    if (s.user_id !== user.id) {
      const { data: link } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", s.user_id).limit(1).maybeSingle();
      if (!link) return Response.json({ error: "Séance introuvable" }, { status: 404 });
    }
    target = s.user_id;
  }

  const { data: prof, error: pErr } = await admin.from("profiles").select("created_at, autoreg_shift, autoreg_shift_high, autoreg_recal_events").eq("user_id", target).maybeSingle();
  if (pErr || !prof) return Response.json({ error: pErr?.message ?? "Profil introuvable" }, { status: 500 });
  const events = (prof.autoreg_recal_events ?? []) as RecalEvent[];
  const cur = { low: (prof.autoreg_shift as number) ?? 0, high: (prof.autoreg_shift_high as number) ?? 0 };
  const save = async (dir: "low" | "high", to: number, nextEvents: RecalEvent[]) => {
    const { error } = await admin.from("profiles").update({ [dir === "low" ? "autoreg_shift" : "autoreg_shift_high"]: to, autoreg_recal_events: nextEvents }).eq("user_id", target);
    if (error) throw new Error(error.message);
  };

  try {
    if (body.undo) {
      if (target !== user.id) return Response.json({ error: "Seul le sportif annule son recalage" }, { status: 403 });
      const i = events.map((e, k) => ({ e, k })).reverse().find(x => !x.e.undone && x.e.source !== "seed")?.k;
      if (i === undefined) return Response.json({ undone: null });
      const e = events[i];
      const next = events.map((x, k) => (k === i ? { ...x, undone: true } : x));
      await save(e.dir, e.from, next);
      return Response.json({ undone: e });
    }
    if (body.apply) {
      if (target !== user.id) return Response.json({ error: "Seul le sportif se recale" }, { status: 403 });
      const { dir, shift } = body.apply;
      if ((dir !== "low" && dir !== "high") || ![0, 5, 10, 15].includes(shift)) return Response.json({ error: "Paramètres invalides" }, { status: 400 });
      const e: RecalEvent = { at: today(), dir, from: cur[dir], to: shift, source: "manual" };
      await save(dir, shift, [...events, e]);
      return Response.json({ applied: e });
    }
    const [s, w] = await Promise.all([
      admin.from("sessions").select(BILAN_SESSION_COLS).eq("user_id", target).eq("done", true).lte("date", today()),
      admin.from("wellness_daily").select(CHECKIN_COLS).eq("user_id", target).lte("date", today()),
    ]);
    if (s.error || w.error) throw new Error(s.error?.message ?? w.error?.message);
    const r = checkRecal({ sessions: (s.data ?? []) as never, checkins: (w.data ?? []) as never, signupAt: prof.created_at as string, shift: cur.low, shiftHigh: cur.high, events });
    if (!r) return Response.json({ applied: null });
    const e: RecalEvent = { at: today(), dir: r.dir, from: cur[r.dir], to: r.shift, rateBefore: r.rateNow, rateAfter: r.rateThen, source: "auto" };
    await save(r.dir, r.shift, [...events, e]);
    return Response.json({ applied: e });
  } catch (err) {
    console.error("[recalage]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
