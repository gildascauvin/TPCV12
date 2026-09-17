import { createAdminClient } from "@/lib/supabase/admin";

/* Un sportif invité par un coach n'a un accès gratuit débloqué que si CE coach paie
   (subscription_status === "coach") — décision explicite de Gildas (2026-08-19, chantier gating
   save) : avant, `hasCoach` (lien existant, peu importe si le coach paie) suffisait à débloquer
   `isActive` côté sportif via usePaywall(). Distinct de `hasCoach` (qui reste utilisé ailleurs,
   ex. TodayClient.tsx pour rattraper une invitation en attente) — ne jamais réutiliser `hasCoach`
   seul pour un check de paywall, toujours passer par cette fonction.

   Bug corrigé le 2026-09-17 : cette fonction prenait auparavant le client de session (RLS-bound)
   en paramètre pour lire le profil du COACH — `profiles` n'a qu'une seule policy RLS
   (`auth.uid() = user_id`), donc cette lecture cross-user renvoyait toujours `null` en silence,
   quel que soit le vrai statut du coach. `hasActiveCoach` valait donc systématiquement `false`
   en pratique : un sportif gratuit lié à un coach payant restait gated. Passe désormais par le
   client admin pour cette seule lecture (même pattern que /api/invite/validate). */
export async function coachIsPaying(coachId: string | null | undefined): Promise<boolean> {
  if (!coachId) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("subscription_status").eq("user_id", coachId).maybeSingle();
  return data?.subscription_status === "coach";
}
