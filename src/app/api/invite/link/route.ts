import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* Logging .error ajouté (2026-09-14) — cas réel trouvé en prod (kouirassbadr@gmail.com, invité par
   jeremie.thiebaud.pro@gmail.com) : cette route s'est déclenchée (200, aucune exception) mais n'a
   rien lié — coach_invites resté "pending", profiles.invited_by_coach_id resté null. Root cause
   jamais confirmée (transaction de test identique rejouée manuellement, aucun blocage constaté),
   précisément parce qu'aucune des lectures/écritures ci-dessous ne vérifiait `.error` — un échec
   Supabase ne lève pas d'exception JS, il repasse juste `data: null`/`error: {...}` en silence (voir
   feedback_supabase_silent_write_errors). Try/catch ajouté en plus, par précaution, pour qu'une
   vraie exception ne reste plus non plus invisible. */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return Response.json({ ok: false });

    const admin = createAdminClient();

    const { data: invite, error: inviteErr } = await admin
      .from("coach_invites")
      .select("id, coach_id, expires_at")
      .eq("email", user.email)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (inviteErr) console.error("[invite/link] lookup invite échoué", user.email, inviteErr);
    if (!invite || new Date(invite.expires_at) < new Date()) return Response.json({ ok: false });

    const [{ data: athleteProfile, error: profileErr }, { data: wellness, error: wellnessErr }] = await Promise.all([
      admin.from("profiles").select("name, sport").eq("user_id", user.id).single(),
      admin.from("wellness_daily").select("score").eq("user_id", user.id).order("date", { ascending: false }).limit(1).single(),
    ]);
    if (profileErr) console.error("[invite/link] lookup profile athlète échoué", user.id, profileErr);
    if (wellnessErr) console.error("[invite/link] lookup wellness échoué (normal si pas encore rempli)", user.id, wellnessErr);

    // Cherche un placeholder créé à l'invitation
    const { data: placeholder, error: placeholderErr } = await admin
      .from("coach_athletes")
      .select("id")
      .eq("coach_id", invite.coach_id)
      .eq("invite_email", user.email)
      .maybeSingle();
    if (placeholderErr) console.error("[invite/link] lookup placeholder échoué", invite.coach_id, user.email, placeholderErr);

    const results = await Promise.all([
      admin.from("profiles").update({ invited_by_coach_id: invite.coach_id }).eq("user_id", user.id),
      admin.from("coach_invites").update({ status: "accepted" }).eq("id", invite.id),
      placeholder
        ? admin.from("coach_athletes").update({
            user_id: user.id,
            name: athleteProfile?.name || "Sportif",
            sport: athleteProfile?.sport || "",
            wellness_score: wellness?.score ?? 70,
            invite_email: null,
          }).eq("id", placeholder.id)
        : admin.from("coach_athletes").insert({
            coach_id: invite.coach_id,
            user_id: user.id,
            name: athleteProfile?.name || "Sportif",
            sport: athleteProfile?.sport || "",
            wellness_score: wellness?.score ?? 70,
          }),
      // Le sportif a désormais ses propres vraies séances (table sessions) — les séances
      // synthétiques posées à l'invitation (coach_sessions, voir /api/invite/create) deviendraient
      // des doublons fantômes sur son planning coach si on les laissait.
      placeholder ? admin.from("coach_sessions").delete().eq("athlete_id", placeholder.id) : Promise.resolve(null),
    ]);
    const labels = ["profiles.invited_by_coach_id", "coach_invites.status", "coach_athletes", "coach_sessions cleanup"];
    const failed = results
      .map((r, i) => ({ label: labels[i], error: r && typeof r === "object" && "error" in r ? r.error : null }))
      .filter(f => f.error);
    if (failed.length > 0) {
      console.error("[invite/link] écriture(s) échouée(s)", user.id, invite.coach_id, failed);
      return Response.json({ ok: false, failed: failed.map(f => f.label) }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[invite/link] exception non gérée", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
