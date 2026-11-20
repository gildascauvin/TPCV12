import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOnce } from "@/lib/pushSend";

/* Notification de fin d'essai (2026-11-15, onboarding vécu) : une seule par essai (push_log, clé = date de fin). */
export async function sendTrialPush(admin: SupabaseClient, userId: string, trialEnd: Date, daysLeft: number): Promise<boolean> {
  const endLabel = trialEnd.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
  return sendOnce(admin, userId, "trial_end", trialEnd.toISOString().slice(0, 10), {
    title: `Il te reste ${daysLeft} jours d'essai`,
    body: `Annule avant le ${endLabel} si tu veux arrêter. Sinon, rien à faire.`,
    url: "/today",
    tag: "trial_end",
  });
}

/* Rappels programmés à J-2 (trial_push_at posé par le webhook Stripe) : au passage de 9 h (Paris). */
export async function trialReminderPushes(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const now = Date.now();
  let sent = 0;
  for (const u of data.users) {
    const at = u.user_metadata?.trial_push_at as string | undefined;
    const end = u.user_metadata?.trial_end_at as string | undefined;
    if (!at || !end || new Date(at).getTime() > now + 12 * 3600_000) continue;
    if (new Date(end).getTime() > now && await sendTrialPush(admin, u.id, new Date(end), 2)) sent++;
    const { trial_push_at: _a, trial_end_at: _b, ...rest } = u.user_metadata ?? {};
    const { error: e } = await admin.auth.admin.updateUserById(u.id, { user_metadata: { ...rest, trial_push_at: null, trial_end_at: null } });
    if (e) console.error("[trial-push] metadata", e.message);
  }
  return sent;
}
