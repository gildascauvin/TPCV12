import { notFound } from "next/navigation";
import TodayClient from "@/app/(app)/today/TodayClient";
import CoachClient from "@/app/(app)/coach/CoachClient";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";
import { demoToView } from "@/lib/coachSessions";
import { computeWeekOverWeekTrend } from "@/lib/trainingLoad";

/* Page d'accueil de la sandbox (2026-08-19) — /sandbox/athlete = Today, /sandbox/coach = Coach
   Control, les 2 URL copiables-collables demandées par Gildas. Zéro fetch Supabase : tout vient
   de sandboxFixtures.ts (données fictives, dates relatives à "aujourd'hui"). */
export default function SandboxHomePage({ params }: { params: { role: string } }) {
  if (params.role === "athlete") {
    const { profile, todayStr, sessions, wellnessByDate } = buildAthleteFixture();
    return (
      <TodayClient
        userId={profile.user_id}
        profile={profile}
        initialDate={todayStr}
        initialWellness={wellnessByDate[todayStr] ?? null}
        initialSessions={sessions}
        subscriptionStatus="free"
        hasCoach={false}
        hasActiveCoach={false}
        activeProgram={null}
        sandboxMode
        sandboxWellnessByDate={wellnessByDate}
      />
    );
  }

  if (params.role === "coach") {
    const { coachName, todayStr, athletes, sessionsByDate } = buildCoachFixture();
    const todaySessions = (sessionsByDate[todayStr] ?? []).map(demoToView);
    const trends: Record<string, ReturnType<typeof computeWeekOverWeekTrend>["code"]> = {};
    athletes.forEach(a => { trends[a.id] = null; }); // démo — pas assez d'historique réel pour une vraie tendance
    return (
      <CoachClient
        coachName={coachName}
        athletes={athletes}
        todaySessions={todaySessions}
        today={todayStr}
        userId="sandbox-coach"
        subscriptionStatus="free"
        inviteCode={null}
        trends={trends}
        sandboxMode
        sandboxSessionsByDate={Object.fromEntries(Object.entries(sessionsByDate).map(([d, s]) => [d, s.map(demoToView)]))}
      />
    );
  }

  notFound();
}
