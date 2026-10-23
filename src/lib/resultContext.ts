"use client";

import { createClient } from "@/lib/supabase/client";
import { formAt, type CheckinRow, type DoneSession } from "@/lib/checkinInsight";
import { CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import type { ResultSession, WeekSession } from "@/lib/sessionInsight";
import { validDecision } from "@/lib/autoregDecisionRecord";
import { computeAutoregSuggestion, zoneRange, pctToPoints } from "@/lib/autoregulation";
import { computeWellnessBaselineAt } from "@/lib/wellnessBaseline";
import { chronicPenaltyFor } from "@/lib/decisionCard";
import type { AutoregProposal } from "@/lib/autoregPersonal";

/* Données des écrans de résultat (fin de check-in, fin de séance), lues une fois à la validation par
   le sportif lui-même (RLS : ses propres lignes). */

const HISTORY_DAYS = CONSEILS_HISTORY_DAYS; // même fenêtre que l'onglet Récupération

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function loadCheckinContext(userId: string, date: string): Promise<{ today: CheckinRow | null; history: CheckinRow[]; sessions: DoneSession[]; tomorrowDifficulty: number | null; form: number | null }> {
  const supabase = createClient();
  const since = shiftDate(date, -HISTORY_DAYS), tomorrow = shiftDate(date, 1);
  const [w, s, t] = await Promise.all([
    supabase.from("wellness_daily")
      .select("date, sleep, stress, recovery, motivation, score, base_score, behaviors, bedtime, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline")
      .eq("user_id", userId).gte("date", since).lte("date", date),
    // Séances faites sur la fenêtre de l'onglet Récupération : la Forme du score agrégé en dépend.
    supabase.from("sessions").select("date, rpe, duration, done").eq("user_id", userId).eq("done", true).gte("date", shiftDate(date, -120)).lte("date", date),
    supabase.from("sessions").select("target_difficulty").eq("user_id", userId).eq("date", tomorrow).eq("done", false),
  ]);
  [w, s, t].forEach(r => { if (r.error) console.error("[résultat check-in] lecture:", r.error.message); });
  const rows = (w.data ?? []) as CheckinRow[];
  const tomorrowDifficulty = ((t.data ?? []) as { target_difficulty: number | null }[]).reduce((m, x) => Math.max(m, x.target_difficulty ?? 0), 0) || null;
  const done = (s.data ?? []) as (DoneSession & { duration: number | null })[];
  return {
    form: formAt(done, date),
    today: rows.find(r => r.date === date) ?? null,
    history: rows.filter(r => r.date < date),
    sessions: done,
    tomorrowDifficulty,
  };
}

export async function loadSessionContext(userId: string, sessionId: string): Promise<{ session: ResultSession | null; week: WeekSession[] }> {
  const supabase = createClient();
  const one = await supabase.from("sessions").select("id, date, rpe, duration, target_difficulty, name, autoreg_decision, autoreg_proposal").eq("id", sessionId).maybeSingle();
  if (one.error) console.error("[résultat séance] lecture:", one.error.message);
  const row = one.data as ResultSession | null;
  if (!row) return { session: null, week: [] };
  /* Séance sans reco enregistrée (faite avant le 2026-10-23, ou check-in fait après la séance) : le
     moteur générique rejoué ce jour-là, avec le check-in et l'historique d'alors, pour que le verdict
     existe aussi en relecture. Rien n'est écrit en base. */
  if (row.rpe != null && !validDecision(row) && !(row.autoreg_proposal && row.autoreg_proposal.date === row.date)) {
    const replayed = await replayProposal(userId, row).catch(e => { console.error("[résultat séance] rejeu:", e); return null; });
    if (replayed) row.autoreg_proposal = replayed;
  }
  const d = new Date(`${row.date}T12:00:00`);
  const monday = shiftDate(row.date, -((d.getDay() + 6) % 7));
  const wk = await supabase.from("sessions").select("id, date, rpe, duration, done").eq("user_id", userId).gte("date", monday).lte("date", shiftDate(monday, 6));
  if (wk.error) console.error("[résultat séance] lecture:", wk.error.message);
  return { session: row.rpe != null ? row : null, week: (wk.data ?? []) as WeekSession[] };
}

async function replayProposal(userId: string, row: ResultSession): Promise<AutoregProposal | null> {
  if (!row.target_difficulty) return null;
  const supabase = createClient();
  const [w, s] = await Promise.all([
    supabase.from("wellness_daily")
      .select("date, sleep, stress, recovery, motivation, score, base_score, behaviors, bedtime, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline")
      .eq("user_id", userId).gte("date", shiftDate(row.date, -35)).lte("date", row.date),
    supabase.from("sessions").select("date, rpe, duration, done").eq("user_id", userId).eq("done", true).gte("date", shiftDate(row.date, -60)).lt("date", row.date),
  ]);
  if (w.error || s.error) throw new Error(w.error?.message ?? s.error?.message);
  const rows = (w.data ?? []) as { date: string; score: number | null; bedtime: string | null }[];
  const today = rows.find(r => r.date === row.date);
  if (!today || today.bedtime == null || today.score == null) return null;
  const base = computeWellnessBaselineAt(rows.filter(r => r.date < row.date) as never, today as never);
  const pen = chronicPenaltyFor((s.data ?? []) as { date: string; rpe: number | null; duration: number | null; done: boolean }[], new Date(row.date + "T12:00:00"), "athlete").chronicPenalty;
  const sug = computeAutoregSuggestion(today.score, row.target_difficulty, base, pen);
  const zone = sug ? zoneRange(Math.round(row.target_difficulty + pctToPoints(sug.reco)), sug.dir) : null;
  return { proposed: sug?.dir ?? null, reco: sug?.reco ?? null, zoneLow: zone?.zoneLow ?? null, zoneHigh: zone?.zoneHigh ?? null, original_difficulty: row.target_difficulty, date: row.date };
}
