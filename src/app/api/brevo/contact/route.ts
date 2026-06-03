import { NextResponse } from "next/server";

const BREVO_API = "https://api.brevo.com/v3";
const API_KEY = () => process.env.BREVO_API_KEY!;
const LIST_ID = () => process.env.BREVO_ONBOARDING_LIST_ID
  ? parseInt(process.env.BREVO_ONBOARDING_LIST_ID, 10)
  : undefined;

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

export async function POST(request: Request) {
  const { email, name, role, status } = await request.json() as {
    email: string;
    name?: string;
    role?: string;
    status?: string;
  };

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (!process.env.BREVO_API_KEY) return NextResponse.json({ error: "Brevo not configured" }, { status: 500 });

  const listId = LIST_ID();
  const attributes: Record<string, string> = { STATUS: (status ?? "free").toUpperCase() };
  if (name) attributes.PRENOM = name;
  if (role) attributes.ROLE = role.toUpperCase();

  try {
    if (status === "client") {
      // Met à jour les attributs + retire de la liste onboarding → stoppe la séquence Brevo
      await upsertContact(email, attributes);
      if (listId) await removeFromList(email, listId);
    } else {
      // Nouvel inscrit → crée le contact et l'ajoute à la liste onboarding
      await upsertContact(email, attributes, listId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[brevo/contact]", err);
    return NextResponse.json({ error: "Brevo sync failed" }, { status: 500 });
  }
}
