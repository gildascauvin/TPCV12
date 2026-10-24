"use client";

import { createClient } from "@/lib/supabase/client";
import type { BilanCheckin, BilanSession, RecalEvent } from "@/lib/bilan";

/* Données du bilan et des comptes de l'écran post-séance (2026-10-24) : une seule lecture, côté
   sportif (RLS, ses lignes) ou côté coach (GET /api/coach/bilan, lien vérifié). */
export type BilanRaw = {
  profile: { created_at?: string; autoreg_shift?: number | null; autoreg_shift_high?: number | null; autoreg_recal_events?: RecalEvent[] | null } | null;
  sessions: BilanSession[]; checkins: BilanCheckin[];
  tests: { date: string; value: number; unit: string; tests: { name: string } | { name: string }[] | null }[];
};

import { BILAN_SESSION_COLS } from "@/lib/bilanCols";
const CHECKIN_COLS = "date,sleep,stress,recovery,motivation,score,base_score,behaviors,bedtime,device_sleep_minutes,device_hrv_ms,device_resting_hr,device_rhr_baseline,device_hrv_baseline,created_at";

export async function loadBilanRaw(opts: { userId: string; today: string; athleteId?: string }): Promise<BilanRaw> {
  if (opts.athleteId) {
    const r = await fetch(`/api/coach/bilan?athleteId=${encodeURIComponent(opts.athleteId)}&today=${opts.today}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
    return { profile: j.profile ?? null, sessions: j.sessions ?? [], checkins: j.checkins ?? [], tests: j.tests ?? [] };
  }
  const supabase = createClient();
  const [p, s, w, t] = await Promise.all([
    supabase.from("profiles").select("created_at, autoreg_shift, autoreg_shift_high, autoreg_recal_events").eq("user_id", opts.userId).maybeSingle(),
    supabase.from("sessions").select(BILAN_SESSION_COLS).eq("user_id", opts.userId).eq("done", true).lte("date", opts.today),
    supabase.from("wellness_daily").select(CHECKIN_COLS).eq("user_id", opts.userId).lte("date", opts.today),
    supabase.from("test_results").select("date,value,unit,tests(name)").eq("subject_user_id", opts.userId),
  ]);
  const err = p.error || s.error || w.error || t.error;
  if (err) throw new Error(err.message);
  return { profile: p.data, sessions: (s.data ?? []) as BilanSession[], checkins: (w.data ?? []) as BilanCheckin[], tests: (t.data ?? []) as BilanRaw["tests"] };
}
