import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendCoachInviteEmail } from "@/lib/email/inviteEmail";
import { buildCoachDemoSessions } from "@/lib/coachDemoSessions";

// Calibré pour déclencher un vrai mismatch Alléger (2026-09-03, demande explicite de Gildas :
// "séance démo" garantie sur le jour de l'inscription, y compris pour un invité pas-encore-rejoint —
// avant, un score neutre 68/5 ne franchissait jamais le seuil de computeAutoregSuggestion, donc le
// coach ne voyait jamais le vrai geste Alléger/Surcharger sur cette carte tant que le sportif n'avait
// pas rejoint). Même paire que le sportif démo unique (Thomas M., OnboardingFlow.tsx) — un seul
// mapping calibré, réutilisé partout où un profil démo/placeholder doit démontrer le geste réel.
const PLACEHOLDER_WELLNESS_SCORE = 35;
const PLACEHOLDER_RPE_BASE = 9;

async function linkAthleteToCoach(admin: ReturnType<typeof createAdminClient>, coachId: string, athleteUserId: string) {
  const [{ data: athleteProfile }, { data: wellness }] = await Promise.all([
    admin.from("profiles").select("name, sport").eq("user_id", athleteUserId).single(),
    admin.from("wellness_daily").select("score").eq("user_id", athleteUserId).order("date", { ascending: false }).limit(1).single(),
  ]);
  await Promise.all([
    admin.from("profiles").update({ invited_by_coach_id: coachId }).eq("user_id", athleteUserId),
    admin.from("coach_athletes").insert({
      coach_id: coachId,
      user_id: athleteUserId,
      name: athleteProfile?.name || "Sportif",
      sport: athleteProfile?.sport || "",
      wellness_score: wellness?.score ?? 70,
    }),
  ]);
}

export async function POST(req: Request) {
  const { athleteEmail, athleteName } = await req.json();
  if (!athleteEmail) return Response.json({ error: "Email manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();

  const { data: coach } = await supabase.from("profiles").select("mode, name, invite_code, sport").eq("user_id", user.id).single();
  if (!coach || coach.mode !== "coach") return Response.json({ error: "Accès réservé aux coachs" }, { status: 403 });

  const email = athleteEmail.trim().toLowerCase();

  // Vérifie si un compte existe déjà — l'API admin Supabase ne supporte pas de filtre ?email=
  // côté serveur (renvoie juste la 1ère page, 50 users par défaut), d'où un listUsers explicite.
  const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = users.find(u => u.email?.toLowerCase() === email);

  if (existing) {
    const { data: profile } = await admin.from("profiles").select("invited_by_coach_id").eq("user_id", existing.id).single();
    if (profile?.invited_by_coach_id && profile.invited_by_coach_id !== user.id) {
      return Response.json({ error: "Ce sportif est déjà lié à un autre coach." }, { status: 409 });
    }
    const { data: existingRecord } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", existing.id).maybeSingle();
    if (!existingRecord) {
      await linkAthleteToCoach(admin, user.id, existing.id);
    }
    return Response.json({ ok: true, linked: true });
  }

  // Pas encore inscrit → invite en attente + placeholder dans coach_athletes
  const { error } = await admin.from("coach_invites").insert({ coach_id: user.id, email });
  if (error) return Response.json({ error: "Erreur lors de la création de l'invitation." }, { status: 500 });

  const placeholderSport = coach.sport || "";
  const { data: placeholder } = await admin.from("coach_athletes").insert({
    coach_id: user.id,
    user_id: null,
    name: (athleteName as string | undefined)?.trim() || email.split("@")[0],
    sport: placeholderSport,
    wellness_score: PLACEHOLDER_WELLNESS_SCORE,
    invite_email: email,
  }).select("id").single();

  // Histoire synthétique immédiate (même mécanisme que les sportifs démo, buildCoachDemoSessions)
  // pour que la carte du coach ne soit jamais vide en attendant que le sportif rejoigne réellement.
  if (placeholder) {
    const sessions = buildCoachDemoSessions(user.id, placeholder.id, placeholderSport, PLACEHOLDER_RPE_BASE);
    const { error: sessionsError } = await admin.from("coach_sessions").insert(sessions);
    if (sessionsError) console.error("[invite/create] seed coach_sessions échoué", sessionsError);
  }

  if (coach.invite_code) {
    try {
      await sendCoachInviteEmail(email, coach.name || "Ton coach", coach.invite_code);
    } catch (err) {
      console.error("[invite/create] envoi email échoué", err);
    }
  }

  return Response.json({ ok: true, linked: false });
}
