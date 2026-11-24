export const dynamic = "force-dynamic";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { coachIsPaying } from "@/lib/access";
import type { Profile, SubscriptionStatus, WellnessDaily } from "@/types";
import { normalizeObjectives, type ObjectiveData } from "@/lib/objectives";
import ConseilsClient from "./ConseilsClient";
import type { TestRow, TestResultRow, StrengthRepRow } from "@/lib/testResults";

/* Cette page ("Performance" dans la bottom nav) ne porte plus que le suivi de tests physiques
   (2026-09-24, "point 1" — Charge/Récupération/Comportements ont déménagé dans les onglets de
   /today, voir TodayClient.tsx) — plus besoin de ConseilsData ici, uniquement le profil pour
   TestsPanel (sport/sexe/poids) et le statut d'abonnement. */
export default async function ConseilsPage({ searchParams }: { searchParams?: Promise<{ open?: string }> }) {
  /* ?open=metric:backSquat : ouvre directement la fiche (lien depuis « Il sert » d'un programme, 24/11). */
  const openParam = (await searchParams)?.open ?? null;
  const supabase = await createClient();
  const user = await getAuthUser();

  /* Perf (2026-10-04) : profil, tests, résultats et séries lus en parallèle, et passés à TestsPanel
     (initialData) pour un affichage immédiat, au lieu d'attendre le composant puis ses requêtes. */
  /* Objectifs (22/11/2026) : séances et points forme des 120 derniers jours pour mesurer régularité,
     forme et récupération (src/lib/objectives.ts). */
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const [{ data: profileRow }, { data: ownTests }, { data: ownResults }, { data: strengthReps }, { data: objSessions }, { data: objWellness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("tests").select("id,name,name_key,unit,qualities").eq("owner_id", user!.id).order("name"),
    supabase.from("test_results").select("id,test_id,date,value,unit,video_url").eq("subject_user_id", user!.id).order("date"),
    supabase.from("strength_reps").select("id,test_id,date,reps,weight").eq("subject_user_id", user!.id).order("date"),
    supabase.from("sessions").select("date,done,rpe,duration,name,notes").eq("user_id", user!.id).gte("date", since),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", since).order("date"),
  ]);
  const profile = profileRow as (Profile & { invited_by_coach_id?: string | null }) | null;

  const subscriptionStatus = (profile?.subscription_status ?? "free") as SubscriptionStatus;
  const meta = (user?.user_metadata ?? {}) as { objectives?: unknown; ob_vecu?: { weak?: string[] } };
  /* Objectifs (table 049). Reprise une fois des objectifs de la v1 locale (user_metadata.objectives). */
  const { data: objRows, error: objErr } = await supabase.from("objectives").select("objective_id,start_date,deadline").eq("user_id", user!.id).order("created_at");
  if (objErr) console.error("[objectifs] lecture", objErr.message);
  let objectiveItems = (objRows ?? []).map(r => ({ id: r.objective_id as string, start: r.start_date as string, deadline: r.deadline as string }));
  const legacy = normalizeObjectives(meta.objectives);
  if (!objErr && !objectiveItems.length && legacy.length) {
    const { error: migErr } = await supabase.from("objectives").insert(legacy.map(l => ({ user_id: user!.id, objective_id: l.id, start_date: l.start, deadline: l.deadline })));
    if (migErr) console.error("[objectifs] reprise v1", migErr.message); else objectiveItems = legacy;
  }
  const invitedByCoachId = profile?.invited_by_coach_id ?? null;
  const hasActiveCoach = await coachIsPaying(invitedByCoachId);

  /* Plus de tests d'exemple pour un nouveau compte (24/11, Gildas : « très confus », valeurs de démo
     mêlées à ses vrais objectifs) : la page montre ses vrais tests à renseigner. */

  return (
    <ConseilsClient
      subscriptionStatus={subscriptionStatus} hasActiveCoach={hasActiveCoach} userId={user!.id}
      sport={profile?.sport ?? null} sexe={profile?.sexe ?? null} poidsKg={profile?.poids_kg ?? null}
      openMetric={openParam && openParam.startsWith("metric:") ? openParam.slice(7) : null}
      objectives={{
        initial: objectiveItems,
        weak: Array.isArray(meta.ob_vecu?.weak) ? meta.ob_vecu.weak : null,
        goal: (profile?.objective as string | null | undefined) ?? null,
        data: {
          tests: (ownTests ?? []) as TestRow[], results: (ownResults ?? []) as TestResultRow[], strengthReps: (strengthReps ?? []) as StrengthRepRow[],
          sessions: (objSessions ?? []) as ObjectiveData["sessions"], wellness: (objWellness ?? []) as WellnessDaily[],
          freqTarget: (profile as { freq_target?: number | null } | null)?.freq_target ?? 3,
        },
      }}
      initialTests={{ ownTests: (ownTests ?? []) as TestRow[], ownResults: (ownResults ?? []) as TestResultRow[], strengthReps: (strengthReps ?? []) as StrengthRepRow[] }}
    />
  );
}
