import { createClient } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import { pickRelevantAssignment } from "@/lib/programAssignment";
import { WELLNESS_BASELINE_WINDOW_DAYS } from "@/lib/wellnessBaseline";
import { daysAgoStr } from "@/lib/trainingLoad";
import TodayClient from "./TodayClient";
import { format } from "date-fns";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = format(new Date(), "yyyy-MM-dd");
  // Fenêtre glissante pour la baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) — jours
  // strictement antérieurs à aujourd'hui, filtrés côté client (TodayClient) avant le calcul.
  const sinceBaseline = daysAgoStr(WELLNESS_BASELINE_WINDOW_DAYS);

  /* profiles fetché une seule fois ici (select("*")) — un 2e aller-retour "mode, subscription_status"
     en amont du Promise.all existait avant (2026-09-18) uniquement pour le check de redirection
     coach, alors que cette même donnée est déjà dans ce résultat. Le check est fait juste après le
     Promise.all plutôt qu'avant, sur cette même donnée — un coach ayant un lien direct vers /today
     déclenche encore les 4 autres requêtes en parallèle avant de rediriger, mais c'est un cas rare
     comparé au coût, sur chaque visite, d'un aller-retour série en plus pour tout le monde. */
  const [{ data: profile }, { data: wellness }, { data: sessions }, { data: activeAssignments }, { data: wellnessHistory }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).order("date").order("created_at"),
    supabase.from("program_assignments").select("start_date, programs(name, weeks_count)").eq("user_id", user!.id).eq("status", "active"),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", sinceBaseline).lt("date", today),
  ]);

  if (profile?.mode === "coach") redirect("/coach");

  const invitedByCoachId = (profile as { invited_by_coach_id?: string | null } | null)?.invited_by_coach_id ?? null;
  const hasCoach = !!invitedByCoachId;
  const hasActiveCoach = await coachIsPaying(invitedByCoachId);

  type ActiveProgram = { start_date: string; name: string } | null;
  // Un sportif peut avoir plusieurs programmes actifs enchaînés (futurs) — on prend
  // celui pertinent pour aujourd'hui, pas juste le premier trouvé.
  const pickedAssignment = pickRelevantAssignment(activeAssignments ?? []);
  const programsData = pickedAssignment?.programs;
  const programName = Array.isArray(programsData)
    ? (programsData[0]?.name ?? "")
    : ((programsData as unknown as { name: string } | null)?.name ?? "");
  const activeProgram: ActiveProgram = pickedAssignment
    ? { start_date: pickedAssignment.start_date, name: programName }
    : null;

  return (
    <TodayClient
      userId={user!.id}
      profile={profile!}
      initialDate={today}
      initialWellness={wellness ?? null}
      initialSessions={sessions ?? []}
      subscriptionStatus={profile?.subscription_status ?? "free"}
      hasCoach={hasCoach}
      hasActiveCoach={hasActiveCoach}
      activeProgram={activeProgram}
      initialWellnessHistory={wellnessHistory ?? []}
    />
  );
}
