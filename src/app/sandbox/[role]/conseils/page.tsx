import { notFound } from "next/navigation";
import ConseilsClient from "@/app/(app)/conseils/ConseilsClient";
import { buildAthleteFixture, buildTestFixture } from "@/lib/sandboxFixtures";

export default function SandboxConseilsPage({ params }: { params: { role: string } }) {
  if (params.role !== "athlete") notFound();
  const { profile } = buildAthleteFixture();
  const testsFixture = buildTestFixture();

  return (
    <ConseilsClient
      subscriptionStatus="free" hasActiveCoach={false} sandboxMode
      sport={profile.sport} sexe={profile.sexe} poidsKg={profile.poids_kg}
      testsFixture={testsFixture}
    />
  );
}
