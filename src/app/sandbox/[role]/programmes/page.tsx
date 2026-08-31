import { notFound } from "next/navigation";
import ProgramLibraryStandalone from "@/components/programs/ProgramLibraryStandalone";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";

export default function SandboxProgrammesPage({ params }: { params: { role: string } }) {
  if (params.role === "athlete") {
    const { profile } = buildAthleteFixture();
    return (
      <ProgramLibraryStandalone
        mode="athlete"
        userId={profile.user_id}
        subscriptionStatus="free"
        hasActiveCoach={false}
        backHref="/sandbox/athlete/week"
        sandboxMode
      />
    );
  }

  if (params.role === "coach") {
    const { athletes } = buildCoachFixture();
    return (
      <ProgramLibraryStandalone
        mode="coach"
        userId="sandbox-coach"
        subscriptionStatus="free"
        athletes={athletes}
        backHref="/sandbox/coach/planning"
        sandboxMode
      />
    );
  }

  notFound();
}
