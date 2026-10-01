import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Suppression de compte par l'utilisateur lui-même (2026-10-01) — exigée par Apple (guideline
   5.1.1(v)) dès qu'on peut créer un compte dans l'app, et utile au RGPD sur le web.

   La quasi-totalité des données part en cascade avec auth.users (profiles, sessions, wellness,
   santé, programmes, tests, coach_athletes/coach_sessions côté coach, partages, push...). Restent
   à traiter à la main, AVANT la suppression :
   - strength_reps : clés étrangères sans cascade, bloqueraient la suppression ;
   - la ligne du sportif dans le roster de son coach (coach_athletes.user_id passe à NULL sinon, et
     la ligne s'afficherait comme un "sportif démo") ;
   - program_assignments.user_id et coach_invites.email : pas de clé étrangère ;
   - les fichiers du bucket exercise-comments (dossier {user_id}/).
   Côté paiement : l'abonnement Stripe est résilié immédiatement ; un abonnement Apple ne peut pas
   l'être par nous (l'utilisateur est prévenu dans l'app de le résilier dans ses réglages Apple). */

async function step(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const uid = user.id;
  const email = user.email?.toLowerCase() ?? null;

  try {
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("user_id", uid).maybeSingle();

    // 1. Résilier l'abonnement Stripe (sinon le prélèvement continuerait sur un compte supprimé).
    if (profile?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: "all", limit: 20 });
      for (const s of subs.data) {
        if (!["canceled", "incomplete_expired"].includes(s.status)) await stripe.subscriptions.cancel(s.id);
      }
    }

    // 2. Lignes de roster où il est le sportif, et toutes celles dont il est le coach.
    const athleteRows = await admin.from("coach_athletes").select("id")
      .or(email ? `user_id.eq.${uid},invite_email.eq."${email}"` : `user_id.eq.${uid}`);
    if (athleteRows.error) throw new Error(`coach_athletes read: ${athleteRows.error.message}`);
    const coachRows = await admin.from("coach_athletes").select("id").eq("coach_id", uid);
    if (coachRows.error) throw new Error(`coach_athletes read: ${coachRows.error.message}`);
    const athleteRowIds = (athleteRows.data ?? []).map(r => r.id);
    const rosterIds = [...athleteRowIds, ...(coachRows.data ?? []).map(r => r.id)];

    // 3. strength_reps (pas de cascade) : à vider avant tout le reste.
    await step("strength_reps owner", admin.from("strength_reps").delete().eq("owner_id", uid));
    await step("strength_reps subject", admin.from("strength_reps").delete().eq("subject_user_id", uid));
    if (rosterIds.length) {
      await step("strength_reps roster", admin.from("strength_reps").delete().in("subject_coach_athlete_id", rosterIds));
    }

    // 4. Sa place dans le roster de son coach (coach_sessions et résultats de tests suivent en cascade).
    if (athleteRowIds.length) await step("coach_athletes", admin.from("coach_athletes").delete().in("id", athleteRowIds));

    // 5. Données sans clé étrangère.
    await step("program_assignments", admin.from("program_assignments").delete().eq("user_id", uid));
    if (email) await step("coach_invites", admin.from("coach_invites").delete().eq("email", email));

    // 6. Fichiers (vidéos/photos d'exercice).
    const { data: files } = await admin.storage.from("exercise-comments").list(uid, { limit: 1000 });
    if (files?.length) await admin.storage.from("exercise-comments").remove(files.map(f => `${uid}/${f.name}`));

    // 7. RevenueCat : effacer le client (best effort, ne bloque pas la suppression).
    if (process.env.REVENUECAT_SECRET_KEY) {
      await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` },
      }).catch(e => console.error("[account/delete] revenuecat", e));
    }

    // 8. Le compte lui-même : tout le reste part en cascade.
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw new Error(`auth delete: ${error.message}`);
  } catch (e) {
    console.error("[account/delete]", uid, e);
    return NextResponse.json({ error: "La suppression n'a pas pu aboutir. Réessaie ou écris-nous à contact@theperfclub.com." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
