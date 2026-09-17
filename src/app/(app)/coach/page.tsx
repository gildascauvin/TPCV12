export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import CoachClient from "./CoachClient";
import { realToView, demoToView } from "@/lib/coachSessions";
import { computeWeekOverWeekTrend, daysAgoStr, type TrendCode } from "@/lib/trainingLoad";
import { computeWellnessBaselineAt, wellnessSignal, WELLNESS_BASELINE_WINDOW_DAYS, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import type { CoachAthlete, CoachViewSession, Session, CoachSession, WellnessDaily } from "@/types";

export default async function CoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().split("T")[0];
  const admin = createAdminClient();

  /* profil + liste des sportifs en parallèle (2026-09-18) — aucune dépendance entre les deux,
     toutes les deux ne dépendent que de user.id déjà connu. Avant : profil -> (check redirect) ->
     puis coach_athletes en série, un aller-retour réseau de plus sur chaque visite de /coach. Le
     check de redirection se fait maintenant après les deux — un coach mal routé (cas rare)
     déclenche quand même la requête coach_athletes avant de rediriger, accepté comme pour /today. */
  const [{ data: profile }, { data: rawAthletes }] = await Promise.all([
    supabase.from("profiles").select("mode, name, subscription_status, invite_code").eq("user_id", user.id).maybeSingle(),
    supabase.from("coach_athletes").select("*").eq("coach_id", user.id).order("created_at"),
  ]);

  if (!profile || profile.mode !== "coach") redirect("/today");

  // Generate invite_code server-side if missing
  let inviteCode = profile.invite_code as string | null;
  if (!inviteCode) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const code = "tpc-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const { error } = await supabase.from("profiles").update({ invite_code: code }).eq("user_id", user.id);
    if (!error) inviteCode = code;
  }

  const athletes = (rawAthletes || []) as CoachAthlete[];
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);
  const allAthleteIds = athletes.map(a => a.id);
  // Tendance charge/récupération 14j (7j courants vs 7j précédents) par sportif réel — alimente
  // decisionText()/attention() du Coach Control (voir src/lib/trainingLoad.ts). Fenêtre élargie à
  // max(14, WELLNESS_BASELINE_WINDOW_DAYS) pour servir aussi de fenêtre glissante à la baseline
  // personnelle (Z-score, src/lib/wellnessBaseline.ts) — même requête réutilisée pour les deux.
  const sinceHistory = daysAgoStr(Math.max(13, WELLNESS_BASELINE_WINDOW_DAYS));

  /* Les données "aujourd'hui" et l'historique 14j n'ont jamais eu de dépendance entre elles —
     seulement envers realUserIds/allAthleteIds/sinceHistory, déjà connus ici. Étaient dans 2
     Promise.all séparés l'un après l'autre (2 aller-retours en série) ; fusionnés en un seul
     (2026-09-18). */
  const [liveWellnessRes, realSessionsRes, demoSessionsRes, historySessionsRes, historyWellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("wellness_daily").select("user_id, score, base_score, behaviors").in("user_id", realUserIds).eq("date", today)
      : Promise.resolve({ data: [] as { user_id: string; score: number | null; base_score: number | null; behaviors: string[] | null }[] }),
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).eq("date", today)
      : Promise.resolve({ data: [] as Session[] }),
    allAthleteIds.length
      ? admin.from("coach_sessions").select("*").eq("coach_id", user.id).in("athlete_id", allAthleteIds).eq("date", today)
      : Promise.resolve({ data: [] as CoachSession[] }),
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", sinceHistory)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", sinceHistory)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
  ]);

  // base_score en priorité (jamais score, qui inclut le bonus/malus comportements) — voir
  // wellnessSignal() dans wellnessBaseline.ts.
  const wellnessToday = new Map<string, { score: number; behaviors: string[] }>();
  (liveWellnessRes.data || []).forEach(w => {
    wellnessToday.set(w.user_id, { score: wellnessSignal(w) ?? 70, behaviors: w.behaviors ?? [] });
  });

  const updatedAthletes = athletes.map(a => {
    if (!a.user_id) return { ...a, wellnessFilledToday: true }; // démo : score fixe, pas de notion de jour
    const w = wellnessToday.get(a.user_id);
    return w
      ? { ...a, wellness_score: w.score, behaviors: w.behaviors, wellnessFilledToday: true }
      : { ...a, wellnessFilledToday: false };
  });

  const historySessions = (historySessionsRes.data || []) as Session[];
  const historyWellness = (historyWellnessRes.data || []) as WellnessDaily[];

  const trends: Record<string, TrendCode | null> = {};
  const baselines: Record<string, WellnessBaselineResult | null> = {};
  for (const a of updatedAthletes) {
    if (!a.user_id) {
      // Sportif démo : pas de vraie tendance (pas d'historique réel de séances/wellness), mais une
      // baseline Z-score construite sur un historique synthétique déterministe (coachWellnessScoreFor,
      // même fonction que /coach/athletes et /coach/planning) — sinon la carte de ce sportif restait
      // en absolu ici alors qu'elle est en relatif partout ailleurs pour le même score.
      trends[a.id] = null;
      baselines[a.id] = syntheticBaselineFor(a.wellness_score, a.id);
      continue;
    }
    const mySessions = historySessions.filter(s => s.user_id === a.user_id);
    const myWellness = historyWellness.filter(w => w.user_id === a.user_id);
    trends[a.id] = computeWeekOverWeekTrend(mySessions, myWellness).code;
    const todayRow = a.wellnessFilledToday ? myWellness.find(w => w.date === today) ?? null : null;
    baselines[a.id] = todayRow
      ? computeWellnessBaselineAt(myWellness.filter(w => w.date < today), todayRow)
      : null;
  }

  const todaySessions: CoachViewSession[] = [
    ...(realSessionsRes.data || []).map(s => realToView(s as Session, athletes)),
    ...(demoSessionsRes.data || []).map(s => demoToView(s as CoachSession)),
  ];

  return (
    <CoachClient
      coachName={profile.name}
      athletes={updatedAthletes}
      todaySessions={todaySessions}
      today={today}
      userId={user.id}
      subscriptionStatus={profile.subscription_status ?? "free"}
      inviteCode={inviteCode}
      trends={trends}
      baselines={baselines}
    />
  );
}
