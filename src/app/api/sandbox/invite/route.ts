import { sendSandboxInviteEmail } from "@/lib/email/inviteEmail";

/* Sandbox uniquement (2026-08-19) — invitation depuis un coach NON authentifié (aucun compte réel,
   donc aucun coach_id à écrire). Décision explicite de Gildas après avoir jugé une approche par
   staging localStorage trop complexe : on envoie juste un email "comme si le sportif s'était
   inscrit lui-même" (lien vers /register, jamais de coach_invite_code/coach_athletes créé). Route
   publique, aucune écriture DB — voir sendSandboxInviteEmail() pour le contenu de l'email. */
export async function POST(req: Request) {
  const { athleteEmail } = await req.json();
  if (!athleteEmail || typeof athleteEmail !== "string") {
    return Response.json({ error: "Email manquant" }, { status: 400 });
  }
  const email = athleteEmail.trim().toLowerCase();
  if (!email.includes("@")) return Response.json({ error: "Email invalide" }, { status: 400 });

  try {
    await sendSandboxInviteEmail(email);
  } catch (err) {
    console.error("[sandbox/invite] envoi email échoué", err);
    return Response.json({ error: "Erreur lors de l'envoi de l'invitation." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
