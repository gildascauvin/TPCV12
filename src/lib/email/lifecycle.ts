/* Emails déclenchés par l'activité réelle (2026-10-06), envoyés une fois par jour depuis le cron
   push (`/api/push/send`, job session) : Vercel Hobby limite à 2 crons, déjà pris.

   Envoi transactionnel Brevo (`POST /v3/smtp/email` + templateId) : templates créés par API, jamais
   attachés à l'automation, donc modifiables par API. Chaque envoi est réservé en base AVANT l'appel
   (`lifecycle_emails`, clé user/kind/ref) : un double déclenchement du cron n'envoie jamais deux fois.
   Si l'envoi échoue, la réservation est retirée pour retenter au prochain passage.

   Ne cible que les comptes créés à partir de LIFECYCLE_START : sans ça, toute la base existante
   déjà au-delà des seuils recevrait « Tes analyses sont prêtes » le jour du déploiement. */
import type { SupabaseClient } from "@supabase/supabase-js";

const BREVO_API = "https://api.brevo.com/v3";
const LIFECYCLE_START = "2026-10-07";

export const LIFECYCLE_TEMPLATES = {
  recup_ready: 45,
  charge_ready: 46,
  decision_next: 47,
  no_checkin: 48,
  coach_first_checkin: 49,
} as const;
export type LifecycleKind = keyof typeof LIFECYCLE_TEMPLATES;

const RECUP_READY_DAYS = 5;      // même seuil que la norme provisoire de récupération
const CHARGE_READY_DAYS = 7;     // même seuil que partialChargeReady (trainingLoad.ts)
const NO_CHECKIN_GAP = 3;        // jours sans check-in avant la relance
const NO_CHECKIN_COOLDOWN = 21;  // une relance au plus toutes les 3 semaines

function parisDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86_400_000);
}
function firstName(name: string | null | undefined): string {
  const f = (name ?? "").trim().split(/\s+/)[0];
  return f || "à toi";
}

type Admin = SupabaseClient;
type Profile = {
  user_id: string; name: string | null; mode: string | null; subscription_status: string | null;
  created_at: string; first_decision_on: string | null; invited_by_coach_id: string | null;
};

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) { console.error("[lifecycle] fetch", error); break; }
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function isBlacklisted(email: string, apiKey: string): Promise<boolean> {
  const res = await fetch(`${BREVO_API}/contacts/${encodeURIComponent(email)}`, { headers: { "api-key": apiKey } });
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const c = await res.json() as { emailBlacklisted?: boolean };
  return !!c.emailBlacklisted;
}

async function sendOnce(
  admin: Admin, apiKey: string, emails: Map<string, string>,
  userId: string, kind: LifecycleKind, ref: string, params: Record<string, string>,
): Promise<boolean> {
  const email = emails.get(userId);
  if (!email) return false;
  const { error: claimError } = await admin.from("lifecycle_emails").insert({ user_id: userId, kind, ref });
  if (claimError) return false; // déjà envoyé (clé primaire) ou table indisponible
  try {
    if (await isBlacklisted(email, apiKey)) return false; // réservation gardée : on ne réessaie pas
    const res = await fetch(`${BREVO_API}/smtp/email`, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: LIFECYCLE_TEMPLATES[kind],
        to: [{ email, name: params.PRENOM }],
        params,
        tags: ["lifecycle", kind],
      }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
    return true;
  } catch (err) {
    console.error("[lifecycle] send", kind, userId, err);
    await admin.from("lifecycle_emails").delete().eq("user_id", userId).eq("kind", kind).eq("ref", ref);
    return false;
  }
}

export async function runLifecycleEmails(admin: Admin): Promise<Record<LifecycleKind, number>> {
  const sent: Record<LifecycleKind, number> = { recup_ready: 0, charge_ready: 0, decision_next: 0, no_checkin: 0, coach_first_checkin: 0 };
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return sent;

  const today = parisDate();
  const yesterday = parisDate(-1);
  const since = parisDate(-60);

  const profiles = await fetchAll<Profile>((f, t) => admin.from("profiles")
    .select("user_id, name, mode, subscription_status, created_at, first_decision_on, invited_by_coach_id")
    .gte("created_at", LIFECYCLE_START).range(f, t));
  if (!profiles.length) return sent;

  const { data: usersPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emails = new Map<string, string>();
  for (const u of usersPage?.users ?? []) if (u.email) emails.set(u.id, u.email);

  const ids = profiles.map(p => p.user_id);
  const wellness = await fetchAll<{ user_id: string; date: string }>((f, t) => admin.from("wellness_daily")
    .select("user_id, date").in("user_id", ids).gte("date", since).range(f, t));
  const done = await fetchAll<{ user_id: string; date: string }>((f, t) => admin.from("sessions")
    .select("user_id, date").in("user_id", ids).eq("done", true).gte("date", since).range(f, t));
  const recentNoCheckin = await fetchAll<{ user_id: string }>((f, t) => admin.from("lifecycle_emails")
    .select("user_id").eq("kind", "no_checkin").gte("sent_at", new Date(Date.now() - NO_CHECKIN_COOLDOWN * 86_400_000).toISOString()).range(f, t));
  const cooled = new Set(recentNoCheckin.map(r => r.user_id));

  const wellnessDates = new Map<string, Set<string>>();
  for (const w of wellness) (wellnessDates.get(w.user_id) ?? wellnessDates.set(w.user_id, new Set()).get(w.user_id)!).add(w.date);
  const doneDates = new Map<string, Set<string>>();
  for (const s of done) (doneDates.get(s.user_id) ?? doneDates.set(s.user_id, new Set()).get(s.user_id)!).add(s.date);

  for (const p of profiles) {
    if (p.mode !== "athlete") continue;
    const params = { PRENOM: firstName(p.name) };
    const wDates = Array.from(wellnessDates.get(p.user_id) ?? new Set<string>()).sort();
    const dDates = Array.from(doneDates.get(p.user_id) ?? new Set<string>()).sort();

    if (wDates.length >= RECUP_READY_DAYS
      && await sendOnce(admin, apiKey, emails, p.user_id, "recup_ready", "", params)) sent.recup_ready++;

    if (dDates.length >= 2 && daysBetween(dDates[0], today) >= CHARGE_READY_DAYS
      && await sendOnce(admin, apiKey, emails, p.user_id, "charge_ready", "", params)) sent.charge_ready++;

    // Lendemain de la 1re décision offerte, uniquement pour un gratuit sans coach (un sportif invité
    // par un coach payant est débloqué, et ce n'est pas à lui de payer).
    if (p.first_decision_on === yesterday && p.subscription_status === "free" && !p.invited_by_coach_id
      && await sendOnce(admin, apiKey, emails, p.user_id, "decision_next", "", params)) sent.decision_next++;

    const last = wDates[wDates.length - 1];
    if (wDates.length >= 2 && last && daysBetween(last, today) === NO_CHECKIN_GAP && !cooled.has(p.user_id)
      && await sendOnce(admin, apiKey, emails, p.user_id, "no_checkin", last, params)) sent.no_checkin++;
  }

  // Coach : premier check-in d'un vrai sportif lié (hier ou aujourd'hui), une fois par sportif.
  const coaches = profiles.filter(p => p.mode === "coach");
  if (coaches.length) {
    const { data: links } = await admin.from("coach_athletes")
      .select("coach_id, user_id, name").in("coach_id", coaches.map(c => c.user_id)).not("user_id", "is", null);
    const athleteIds = (links ?? []).map(l => l.user_id as string);
    if (athleteIds.length) {
      const athleteWellness = await fetchAll<{ user_id: string; date: string }>((f, t) => admin.from("wellness_daily")
        .select("user_id, date").in("user_id", athleteIds).order("date", { ascending: true }).range(f, t));
      const firstCheckin = new Map<string, string>();
      for (const w of athleteWellness) if (!firstCheckin.has(w.user_id)) firstCheckin.set(w.user_id, w.date);
      const coachById = new Map(coaches.map(c => [c.user_id, c]));
      for (const l of links ?? []) {
        const first = firstCheckin.get(l.user_id as string);
        const coach = coachById.get(l.coach_id as string);
        if (!coach || !first || first < LIFECYCLE_START || (first !== today && first !== yesterday)) continue;
        const ok = await sendOnce(admin, apiKey, emails, coach.user_id, "coach_first_checkin", l.user_id as string,
          { PRENOM: firstName(coach.name), SPORTIF: firstName(l.name as string) });
        if (ok) sent.coach_first_checkin++;
      }
    }
  }
  return sent;
}
