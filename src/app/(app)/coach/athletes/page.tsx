export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AthletesClient from "./AthletesClient";
import type { CoachAthlete, Session, WellnessDaily } from "@/types";
import { daysAgoStr, buildDailyTimeSeries, type AthleteSignature } from "@/lib/fatigueSignature";

export default async function CoachAthletesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("mode, subscription_status, invite_code").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.mode !== "coach") redirect("/today");

  const admin = createAdminClient();

  let { data: rawAthletes } = await supabase
    .from("coach_athletes")
    .select("*")
    .eq("coach_id", user.id)
    .order("created_at");

  // Créer les placeholders pour les invitations pending sans placeholder existant
  const { data: pendingInvites } = await admin
    .from("coach_invites")
    .select("email")
    .eq("coach_id", user.id)
    .eq("status", "pending");

  const existingEmails = new Set((rawAthletes || []).map((a: CoachAthlete) => a.invite_email).filter(Boolean));
  const missing = (pendingInvites || []).filter(i => !existingEmails.has(i.email));

  if (missing.length > 0) {
    await admin.from("coach_athletes").insert(
      missing.map(i => ({
        coach_id: user.id,
        user_id: null,
        name: i.email.split("@")[0],
        sport: "",
        wellness_score: 0,
        invite_email: i.email,
      }))
    );
    const { data: refreshed } = await admin
      .from("coach_athletes")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at");
    rawAthletes = refreshed;
  }

  const athletes = (rawAthletes || []) as CoachAthlete[];
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id!);

  // Signature de fatigue condensée par sportif (mêmes seuils/formules que /conseils, voir
  // src/lib/fatigueSignature.ts) : 10 jours de courbe pour rester lisible dans une liste dense
  // (la vraie page /conseils utilise 28 jours pour son propre graphe, plus détaillé).
  const since10 = daysAgoStr(9);

  const [sessionsRes, wellnessRes] = await Promise.all([
    realUserIds.length
      ? admin.from("sessions").select("*").in("user_id", realUserIds).gte("date", since10)
      : Promise.resolve({ data: [] as Session[] }),
    realUserIds.length
      ? admin.from("wellness_daily").select("*").in("user_id", realUserIds).gte("date", since10)
      : Promise.resolve({ data: [] as WellnessDaily[] }),
  ]);
  const allSessions = (sessionsRes.data || []) as Session[];
  const allWellness = (wellnessRes.data || []) as WellnessDaily[];

  const signatures: Record<string, AthleteSignature> = {};
  for (const a of athletes) {
    if (!a.user_id) { signatures[a.id] = { kind: "manual" }; continue; }
    const myWellness = allWellness.filter(w => w.user_id === a.user_id);
    if (myWellness.length === 0) { signatures[a.id] = { kind: "no_data" }; continue; }
    const mySessions = allSessions.filter(s => s.user_id === a.user_id);
    const series = buildDailyTimeSeries(mySessions, myWellness, 10);
    signatures[a.id] = {
      kind: "ok",
      nervous: series.map(p => p.nervousLoad),
      muscular: series.map(p => p.muscularLoad),
      recovery: series.map(p => p.recovery),
    };
  }

  return (
    <AthletesClient
      userId={user.id}
      initialAthletes={athletes}
      signatures={signatures}
      subscriptionStatus={profile.subscription_status ?? "free"}
      inviteCode={profile.invite_code as string | null ?? null}
    />
  );
}
