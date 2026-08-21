import { notFound } from "next/navigation";
import CoachPlanningClient from "@/app/(app)/coach/planning/CoachPlanningClient";
import { buildCoachFixture } from "@/lib/sandboxFixtures";
import { demoToView } from "@/lib/coachSessions";

export default function SandboxPlanningPage({ params }: { params: { role: string } }) {
  if (params.role !== "coach") notFound();
  const { coachName, athletes, sessionsByDate } = buildCoachFixture();
  const initialSessions = Object.values(sessionsByDate).flat().map(demoToView);

  return (
    <CoachPlanningClient
      userId="sandbox-coach"
      coachName={coachName}
      athletes={athletes}
      initialSessions={initialSessions}
      initialWellnessMap={{}}
      subscriptionStatus="free"
      sandboxMode
    />
  );
}
