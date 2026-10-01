import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachIsPaying } from "@/lib/access";
import type { OnboardingProgress, OnboardingStep } from "@/lib/onboardingProgress";

export const dynamic = "force-dynamic";

/* Checklist d'onboarding dans le header (2026-10-01) — dérivée des données réelles, jamais d'un
   état coché à la main. Sportif : forme → entraînement → séance faite → débloquer. Coach : invite →
   entraînement (programme assigné par lui, pas le programme démo) → décision → débloquer.
   "Depuis l'inscription" = date >= jour de création du profil : l'historique synthétique posé à
   l'inscription (ressenti et séances passés) ne coche jamais rien. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("mode, created_at, subscription_status, invited_by_coach_id, first_adjustment_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return Response.json({ userId: user.id, role: "athlete", steps: [], complete: true } satisfies OnboardingProgress);

  const since = (profile.created_at ?? new Date().toISOString()).split("T")[0];
  const role = profile.mode === "coach" ? "coach" : "athlete";
  let steps: OnboardingStep[];

  if (role === "athlete") {
    const invitedBy = (profile as { invited_by_coach_id?: string | null }).invited_by_coach_id ?? null;
    const [wRes, sRes, aRes, doneRes, coachPays] = await Promise.all([
      supabase.from("wellness_daily").select("id").eq("user_id", user.id).gte("date", since).not("bedtime", "is", null).limit(1),
      // Une séance créée par le check-in ("Séance du jour …", 2026-10-01) ne compte pas : sinon le
      // check-in cocherait 2 étapes d'un coup et la checklist ne pousserait plus vers les programmes.
      supabase.from("sessions").select("id").eq("user_id", user.id).gte("date", since).not("name", "like", "Séance du jour %").limit(1),
      supabase.from("program_assignments").select("id").eq("user_id", user.id).eq("status", "active").limit(1),
      supabase.from("sessions").select("id").eq("user_id", user.id).gte("date", since).eq("done", true).limit(1),
      coachIsPaying(invitedBy),
    ]);
    const paid = profile.subscription_status === "athlete" || profile.subscription_status === "coach";
    steps = [
      { key: "form", label: "Renseigne ta forme", done: (wRes.data?.length ?? 0) > 0 },
      { key: "build", label: "Construis ton entraînement", done: !!invitedBy || (sRes.data?.length ?? 0) > 0 || (aRes.data?.length ?? 0) > 0 },
      { key: "adjust", label: "Ajuste et fais ta séance", done: (doneRes.data?.length ?? 0) > 0 },
      ...(coachPays ? [] : [{ key: "unlock" as const, label: "Débloque tes performances", done: paid }]),
    ];
  } else {
    const admin = createAdminClient();
    const [athRes, assignRes] = await Promise.all([
      // Vrai sportif seulement (inscrit ou invité) : le sportif démo ne compte pas.
      supabase.from("coach_athletes").select("id").eq("coach_id", user.id).or("user_id.not.is.null,invite_email.not.is.null").limit(1),
      admin.from("program_assignments").select("id, programs(name)").eq("coach_id", user.id).eq("status", "active"),
    ]);
    const ownAssign = (assignRes.data ?? []).some(a => {
      const p = Array.isArray(a.programs) ? a.programs[0] : a.programs;
      return (p as { name?: string } | null)?.name !== "Programme démo";
    });
    steps = [
      // Toujours faite : la checklist ne part pas de 0 (2026-10-01).
      { key: "account", label: "Crée ton compte", done: true },
      { key: "invite", label: "Invite tes sportifs", done: (athRes.data?.length ?? 0) > 0 },
      { key: "build", label: "Construis leur entraînement", done: ownAssign },
      { key: "adjust", label: "Ajuste leur séance", done: !!(profile as { first_adjustment_at?: string | null }).first_adjustment_at },
      { key: "unlock", label: "Débloque leurs performances", done: profile.subscription_status === "coach" },
    ];
  }
  return Response.json({ userId: user.id, role, steps, complete: steps.every(s => s.done) } satisfies OnboardingProgress);
}
