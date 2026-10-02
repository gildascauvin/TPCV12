import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeWellnessScore } from "@/lib/wellness";
import { withDeviceScore } from "@/lib/deviceWellnessDb";
import type { OfflineAction, OfflineFlushResult } from "@/lib/offlineTypes";

/* Envoi des actions faites hors ligne (2026-10-02), au retour du réseau.
   - "complete" : séance terminée (RPE + durée). Sportif : sa propre séance. Coach : séance d'un de
     ses sportifs, après vérification du lien (même règle que /api/coach/session). Si la séance a été
     supprimée entre-temps → "skipped".
   - "wellness" : check-in du matin. Le score est calculé ici avec la même fonction que l'app
     (computeWellnessScore + données montre). Un check-in déjà fait en ligne pour ce jour n'est
     jamais écrasé → "skipped".
   Chaque action est traitée indépendamment ; le client retire de sa file les "ok" et "skipped". */

const BEDTIMES = new Set(["before22", "22to23", "23to00", "00to01", "after01"]);
const clamp10 = (n: unknown) => Math.max(1, Math.min(10, Math.round(Number(n) || 0)));

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const actions: OfflineAction[] = Array.isArray(body?.actions) ? body.actions.slice(0, 50) : [];
  const admin = createAdminClient();
  const results: OfflineFlushResult[] = [];

  for (const a of actions) {
    try {
      if (a.type === "complete") {
        const update = { done: true, rpe: clamp10(a.rpe), duration: Math.max(1, Math.min(600, Math.round(Number(a.duration) || 0))) };
        let target: "own" | { table: "sessions"; userId: string } | { table: "coach_sessions"; athleteId: string };
        if (!a.athleteId) {
          target = "own";
        } else {
          const { data: link } = await supabase.from("coach_athletes").select("id, user_id")
            .eq("id", a.athleteId).eq("coach_id", user.id).maybeSingle();
          if (!link) { results.push({ id: a.id, status: "skipped", reason: "sportif introuvable" }); continue; }
          target = a.table === "sessions" && link.user_id
            ? { table: "sessions", userId: link.user_id }
            : { table: "coach_sessions", athleteId: link.id };
        }
        const q = target === "own"
          ? supabase.from("sessions").update(update).eq("id", a.sessionId).eq("user_id", user.id)
          : target.table === "sessions"
            ? admin.from("sessions").update(update).eq("id", a.sessionId).eq("user_id", target.userId)
            : admin.from("coach_sessions").update(update).eq("id", a.sessionId).eq("athlete_id", target.athleteId);
        const { data, error } = await q.select("id");
        if (error) throw new Error(error.message);
        results.push({ id: a.id, status: data?.length ? "ok" : "skipped", reason: data?.length ? undefined : "séance supprimée" });
      } else if (a.type === "wellness") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) { results.push({ id: a.id, status: "skipped", reason: "date invalide" }); continue; }
        const { data: existing } = await supabase.from("wellness_daily").select("bedtime")
          .eq("user_id", user.id).eq("date", a.date).maybeSingle();
        if (existing?.bedtime) { results.push({ id: a.id, status: "skipped", reason: "check-in déjà fait" }); continue; }
        const input = {
          sleep: clamp10(a.sleep), stress: clamp10(a.stress), recovery: clamp10(a.recovery), motivation: clamp10(a.motivation),
          behaviors: Array.isArray(a.behaviors) ? a.behaviors.filter(b => typeof b === "string").slice(0, 20) : [],
          bedtime: BEDTIMES.has(a.bedtime) ? a.bedtime : "23to00",
        };
        const { base_score, score } = computeWellnessScore(input.sleep, input.stress, input.recovery, input.motivation, input.behaviors);
        const payload = await withDeviceScore(supabase, user.id, a.date, { ...input, base_score, score });
        const { error } = await supabase.from("wellness_daily")
          .upsert({ user_id: user.id, date: a.date, ...payload }, { onConflict: "user_id,date" });
        if (error) throw new Error(error.message);
        results.push({ id: a.id, status: "ok" });
      } else {
        results.push({ id: (a as { id: string }).id, status: "skipped", reason: "action inconnue" });
      }
    } catch (e) {
      console.error("[offline/flush]", a.type, e);
      results.push({ id: a.id, status: "error", reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
