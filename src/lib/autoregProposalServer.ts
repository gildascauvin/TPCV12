/* Reco du matin calculée et figée CÔTÉ SERVEUR (2026-10-23), juste après le point forme, d'où qu'il
   vienne (Accueil, Planning, onboarding). Même calcul que la carte décision de /today
   (computeDecisionCard) : score du matin (wellnessSignal), norme personnelle (42 j), charge chronique
   avec les entraînements montre non notés, seuil personnel (profiles.autoreg_shift) et signal appris
   (autoregPersonal). Le coach est prévenu ici, depuis la reco figée : la notification ne peut plus
   contredire ce que montrent les deux cartes. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAutoregSuggestion, zoneRange, pctToPoints, qualitativeDifficulty } from "@/lib/autoregulation";
import { computeWellnessBaselineAt, wellnessSignal } from "@/lib/wellnessBaseline";
import { chronicPenaltyFor } from "@/lib/decisionCard";
import { withWatchEstimates } from "@/lib/watchEstimates";
import { learnSignals, personalAdjust, personalReason, type AutoregProposal } from "@/lib/autoregPersonal";
import { sendOnce } from "@/lib/pushSend";
import type { PhysioWorkout } from "@/lib/physioCompare";

const shift = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Result = { sessionId: string; proposal: AutoregProposal; frozen: boolean } | null;

type TopSession = { id: string; date: string; notes: string | null; target_difficulty: number | null; autoreg_proposal?: unknown };

/* Le calcul de la carte de /today pour une séance donnée, avec les seules données d'avant ce jour-là.
   Partagé par le figeage du matin et par le rejeu des séances faites sans reco figée (2026-10-24 :
   avant, le rejeu prenait le moteur générique, sans seuils personnels ni signal appris). */
export async function computeProposalFor(admin: SupabaseClient, userId: string, date: string, top: TopSession): Promise<AutoregProposal | null> {
  if (!top.target_difficulty) return null;
  const [done, wellness, workouts, profile] = await Promise.all([
    admin.from("sessions").select("id, date, notes, rpe, duration, target_difficulty, done").eq("user_id", userId).eq("done", true).gte("date", shift(date, -200)).lt("date", date),
    admin.from("wellness_daily").select("date, score, base_score, sleep, stress, recovery, motivation, bedtime, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline").eq("user_id", userId).gte("date", shift(date, -200)).lte("date", date),
    admin.from("health_workouts").select("date, start_at, duration_min, workout_type, trimp").eq("user_id", userId).gte("date", shift(date, -60)).lte("date", date),
    admin.from("profiles").select("autoreg_shift, autoreg_shift_high").eq("user_id", userId).maybeSingle(),
  ]);
  for (const r of [done, wellness, workouts, profile]) if (r.error) throw new Error(r.error.message);

  type Row = { date: string; score: number | null; base_score: number | null; bedtime: string | null; sleep: number; stress: number; recovery: number; motivation: number };
  const rows = (wellness.data ?? []) as Row[];
  const today = rows.find(r => r.date === date);
  if (!today || today.bedtime == null) return null;
  const baseline = computeWellnessBaselineAt(rows.filter(r => r.date < date && r.date >= shift(date, -42)) as never, today as never);

  const doneRows = (done.data ?? []) as { id: string; date: string; notes: string | null; rpe: number | null; duration: number | null; target_difficulty: number | null; done: boolean }[];
  const recent = withWatchEstimates(doneRows.filter(s => s.date >= shift(date, -60)), (workouts.data ?? []) as PhysioWorkout[], date);
  const anchor = new Date(date + "T12:00:00");
  const chronic = chronicPenaltyFor(recent, anchor, "athlete").chronicPenalty;

  const signals = learnSignals(doneRows, rows);
  const prof = profile.data as { autoreg_shift?: number | null; autoreg_shift_high?: number | null } | null;
  const personal = personalAdjust(signals, prof?.autoreg_shift ?? 0, top.notes, today, prof?.autoreg_shift_high ?? 0);
  const sug = computeAutoregSuggestion(wellnessSignal(today), top.target_difficulty, baseline, chronic + personal.penalty, personal.shift, personal.shiftHigh ?? 0);
  const zone = sug ? zoneRange(Math.round(top.target_difficulty + pctToPoints(sug.reco)), sug.dir) : null;
  return {
    proposed: sug?.dir ?? null, reco: sug?.reco ?? null, zoneLow: zone?.zoneLow ?? null, zoneHigh: zone?.zoneHigh ?? null,
    original_difficulty: top.target_difficulty, original_notes: top.notes ?? null, personal, date,
  };
}

export async function freezeMorningProposal(admin: SupabaseClient, userId: string, date: string): Promise<Result> {
  const planned = await admin.from("sessions").select("id, date, notes, target_difficulty, done, autoreg_proposal").eq("user_id", userId).eq("date", date).eq("done", false);
  if (planned.error) throw new Error(planned.error.message);
  // Séance à ajuster = la plus dure du jour pas encore faite (même règle que /today).
  const top = [...(planned.data ?? [])].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0];
  if (!top || !top.target_difficulty) return null;
  const existing = top.autoreg_proposal as AutoregProposal | null;
  if (existing && existing.date === date) return { sessionId: top.id, proposal: existing, frozen: false };
  const computed = await computeProposalFor(admin, userId, date, top);
  if (!computed) return null;
  const proposal: AutoregProposal = { ...computed, recorded_at: new Date().toISOString() };
  const { error } = await admin.from("sessions").update({ autoreg_proposal: proposal }).eq("id", top.id);
  if (error) throw new Error(error.message);
  return { sessionId: top.id, proposal, frozen: true };
}

/* Coach(s) lié(s) prévenu(s) une seule fois par sportif et par jour, si la reco figée dit d'alléger. */
export async function notifyCoachesIfLighten(admin: SupabaseClient, userId: string, date: string, r: NonNullable<Result>): Promise<number> {
  if (r.proposal.proposed !== "low") return 0;
  const { data: links, error } = await admin.from("coach_athletes").select("coach_id, name").eq("user_id", userId);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const l of links ?? []) {
    const first = (l.name ?? "").trim().split(/\s+/)[0] || "Un sportif";
    const reason = personalReason(r.proposal.personal, first);
    const q = qualitativeDifficulty(r.proposal.original_difficulty);
    const ok = await sendOnce(admin, l.coach_id, "recovery_alert", `${userId}:${date}`, reason
      ? { title: `${first} : séance ${q} à alléger`, body: `${reason} Tu valides ?`, url: "/coach", tag: `recovery-${userId}` }
      : { title: `${first} : récup fragile, séance ${q} prévue`, body: "ThePerfClub recommande d'alléger. Tu valides ?", url: "/coach", tag: `recovery-${userId}` },
    ).catch(() => false);
    if (ok) sent++;
  }
  return sent;
}

/* Séance faite sans reco figée (avant le 2026-10-23, ou point forme après la séance) : le calcul du
   matin rejoué ce jour-là, côté serveur, avec les réglages personnels (computeProposalFor). Pas de
   texte figé : le réalisé ne peut pas être comparé au prévu (séance gardée par défaut). Rien n'est
   écrit. Utilisé par l'écran de résultat du coach et du sportif. */
export async function replayProposalServer(admin: SupabaseClient, userId: string, s: { id?: string; date: string; notes?: string | null; target_difficulty: number | null }): Promise<AutoregProposal | null> {
  if (!s.target_difficulty) return null;
  const p = await computeProposalFor(admin, userId, s.date, { id: s.id ?? "", date: s.date, notes: s.notes ?? null, target_difficulty: s.target_difficulty });
  return p ? { ...p, original_notes: null } : null;
}
