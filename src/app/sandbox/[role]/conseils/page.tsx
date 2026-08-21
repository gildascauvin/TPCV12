import { notFound } from "next/navigation";
import ConseilsClient from "@/app/(app)/conseils/ConseilsClient";
import { buildAthleteFixture } from "@/lib/sandboxFixtures";
import { computeConseilsData } from "@/lib/conseilsData";

export default function SandboxConseilsPage({ params }: { params: { role: string } }) {
  if (params.role !== "athlete") notFound();
  const { profile, todayStr, sessions, wellnessByDate } = buildAthleteFixture();
  const data = computeConseilsData(todayStr, profile, sessions, Object.values(wellnessByDate));

  return <ConseilsClient initialData={data} subscriptionStatus="free" hasActiveCoach={false} sandboxMode />;
}
