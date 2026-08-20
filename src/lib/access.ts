import type { SupabaseClient } from "@supabase/supabase-js";

/* Un sportif invité par un coach n'a un accès gratuit débloqué que si CE coach paie
   (subscription_status === "coach") — décision explicite de Gildas (2026-08-19, chantier gating
   save) : avant, `hasCoach` (lien existant, peu importe si le coach paie) suffisait à débloquer
   `isActive` côté sportif via usePaywall(). Distinct de `hasCoach` (qui reste utilisé ailleurs,
   ex. TodayClient.tsx pour rattraper une invitation en attente) — ne jamais réutiliser `hasCoach`
   seul pour un check de paywall, toujours passer par cette fonction. */
export async function coachIsPaying(supabase: SupabaseClient, coachId: string | null | undefined): Promise<boolean> {
  if (!coachId) return false;
  const { data } = await supabase.from("profiles").select("subscription_status").eq("user_id", coachId).maybeSingle();
  return data?.subscription_status === "coach";
}
