import { notFound } from "next/navigation";
import ProgramLibraryStandalone from "@/components/programs/ProgramLibraryStandalone";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";

export default function SandboxProgrammesPage({ params, searchParams }: { params: { role: string }; searchParams?: { step?: string; focus?: string } }) {
  const initialStep = searchParams?.step === "import" ? "import" : searchParams?.step === "new" ? "new" : undefined;
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
        initialStep={initialStep}
        focusProgramId={searchParams?.focus}
        userSport={profile.sport}
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
        initialStep={initialStep}
        focusProgramId={searchParams?.focus}
      />
    );
  }

  notFound();
}
