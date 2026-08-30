import { notFound } from "next/navigation";
import AthletesClient from "@/app/(app)/coach/athletes/AthletesClient";
import { buildCoachFixture, buildAthleteSignatures } from "@/lib/sandboxFixtures";

/* Les 5 sportifs sandbox sont "démo" côté user_id (null) mais affichent quand même de vraies
   signatures de fatigue (Charge/Récupération), sur demande explicite de Gildas — dérogation
   assumée à la convention normale du vrai produit (user_id===null → toujours "manual", voir
   athletesData.ts) : ici, un historique fictif de 42 jours par sportif alimente les mêmes
   fonctions pures que /conseils, voir buildAthleteSignatures() dans sandboxFixtures.ts. */
export default function SandboxAthletesPage({ params }: { params: { role: string } }) {
  if (params.role !== "coach") notFound();
  const fixture = buildCoachFixture();
  const { signatures, trends, trendInsights, baselines, baselineSeries } = buildAthleteSignatures(fixture);

  return (
    <AthletesClient
      userId="sandbox-coach"
      initialAthletes={fixture.athletes}
      initialDate={fixture.todayStr}
      initialSignatures={signatures}
      initialTrends={trends}
      initialTrendInsights={trendInsights}
      initialBaselines={baselines}
      initialBaselineSeries={baselineSeries}
      initialLastTests={{}}
      subscriptionStatus="free"
      inviteCode={null}
      sandboxMode
    />
  );
}
