import { brevoSportAttributes } from "@/lib/email/brevoSport";

const BREVO_API = "https://api.brevo.com/v3";
const API_KEY = () => process.env.BREVO_API_KEY!;
const LIST_ID = () => process.env.BREVO_ONBOARDING_LIST_ID
  ? parseInt(process.env.BREVO_ONBOARDING_LIST_ID, 10)
  : undefined;

export type BrevoSignup = {
  email: string;
  name?: string;
  role?: string;
  platform?: string;
  sport?: string | null;
  claimProgramId?: string | null;
};

async function upsertContact(email: string, attributes: Record<string, string>, listId?: number) {
  const body: Record<string, unknown> = { email, attributes, updateEnabled: true };
  if (listId) body.listIds = [listId];

  const res = await fetch(`${BREVO_API}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY() },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok && res.status !== 204) {
    throw new Error(`Brevo ${res.status}: ${text}`);
  }
}

async function removeFromList(email: string, listId: number) {
  const res = await fetch(`${BREVO_API}/contacts/lists/${listId}/contacts/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY() },
    body: JSON.stringify({ emails: [email] }),
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Brevo remove error ${res.status}: ${await res.text()}`);
  }
}

/* Nouvel inscrit : crée le contact et l'ajoute à la liste onboarding (démarre la séquence). */
export async function addBrevoSignup({ email, name, role, platform, sport, claimProgramId }: BrevoSignup) {
  const attributes: Record<string, string> = { STATUS: "FREE" };
  if (name) attributes.PRENOM = name;
  if (role) attributes.ROLE = role.toUpperCase();
  // Appareil d'inscription : le J0 adapte son paragraphe app/notifs (bloc conditionnel du template).
  if (platform && ["IOS_APP", "IPHONE", "ANDROID", "DESKTOP"].includes(platform)) {
    attributes.PLATEFORME = platform;
    attributes.NOTIFS = "NON";
  }
  // Sport connu dès l'inscription (programme claimé) : l'email de bienvenue en profite.
  if (sport || claimProgramId) Object.assign(attributes, brevoSportAttributes(sport, claimProgramId));
  await upsertContact(email, attributes, LIST_ID());
}

/* Abonné (Stripe ou App Store) : passe en CLIENT et sort de la liste onboarding (stoppe la séquence).
   Serveur uniquement : la route publique ne permet plus de poser ce statut (n'importe qui pouvait
   sortir un email de la séquence). */
export async function markBrevoClient(email: string) {
  if (!process.env.BREVO_API_KEY) return;
  await upsertContact(email, { STATUS: "CLIENT" });
  const listId = LIST_ID();
  if (listId) await removeFromList(email, listId);
}

/* Suppression de compte : plus aucun email marketing (RGPD). 404 = contact déjà absent. */
export async function deleteBrevoContact(email: string) {
  if (!process.env.BREVO_API_KEY) return;
  const res = await fetch(`${BREVO_API}/contacts/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "api-key": API_KEY() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Brevo delete ${res.status}: ${await res.text()}`);
  }
}
