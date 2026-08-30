import { notFound } from "next/navigation";
import ProfilClient from "@/app/(app)/profil/ProfilClient";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";
import type { Profile } from "@/types";

export default function SandboxProfilPage({ params }: { params: { role: string } }) {
  if (params.role === "athlete") {
    const { profile, sessions, wellnessByDate } = buildAthleteFixture();
    const doneSessions = sessions.filter(s => s.done && s.rpe);
    const avgRpe = doneSessions.length
      ? Math.round(doneSessions.reduce((a, s) => a + (s.rpe || 0), 0) / doneSessions.length * 10) / 10
      : null;
    const wellnessValues = Object.values(wellnessByDate);
    const avgWellness = wellnessValues.length
      ? Math.round(wellnessValues.reduce((a, w) => a + (w.score ?? w.base_score ?? 0), 0) / wellnessValues.length)
      : null;
    const allBehaviors = Array.from(new Set(wellnessValues.flatMap(w => w.behaviors || [])));

    return (
      <ProfilClient
        profile={profile}
        email="demo@theperfclub.com"
        doneSessions={doneSessions}
        avgRpe={avgRpe}
        avgWellness={avgWellness}
        allBehaviors={allBehaviors}
        hasActiveCoach={false}
        sandboxMode
      />
    );
  }

  if (params.role === "coach") {
    const { coachName } = buildCoachFixture();
    const profile: Profile = {
      id: "sandbox-coach-profile", user_id: "sandbox-coach", name: coachName, sport: null, objective: null,
      freq_target: null, mode: "coach", subscription_status: "free", stripe_customer_id: null,
      onboarding_done: true, invite_code: null, training_days: null, free_training_label: {},
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    return (
      <ProfilClient
        profile={profile}
        email="demo@theperfclub.com"
        doneSessions={[]}
        avgRpe={null}
        avgWellness={null}
        allBehaviors={[]}
        hasActiveCoach={false}
        sandboxMode
      />
    );
  }

  notFound();
}
