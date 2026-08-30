import { notFound } from "next/navigation";
import WeekClient from "@/app/(app)/week/WeekClient";
import { buildAthleteFixture } from "@/lib/sandboxFixtures";
import type { WellnessDaily } from "@/types";

export default function SandboxWeekPage({ params }: { params: { role: string } }) {
  if (params.role !== "athlete") notFound();
  const { profile, sessions, wellnessByDate } = buildAthleteFixture();
  const wellness: WellnessDaily[] = Object.values(wellnessByDate);

  return (
    <WeekClient
      userId={profile.user_id}
      userName={profile.name}
      initialSessions={sessions}
      initialWellness={wellness}
      subscriptionStatus="free"
      hasCoach={false}
      hasActiveCoach={false}
      sandboxMode
      wellnessBaselineHistory={wellness}
    />
  );
}
