import crypto from "node:crypto";

/* Envoi aux téléphones Android via Firebase Cloud Messaging, API HTTP v1 (2026-10-28). Serveur
   uniquement. FCM_SERVICE_ACCOUNT = le JSON du compte de service Firebase (projet theperfclub) :
   on signe un JWT avec sa clé, échangé contre un jeton d'accès OAuth valable une heure. */

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

let account: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    const a = raw ? JSON.parse(raw) : null;
    account = a?.client_email && a?.private_key && a?.project_id ? a : null;
  } catch {
    account = null;
  }
  return account ?? null;
}

export function fcmConfigured() {
  return !!serviceAccount();
}

const b64url = (x: Buffer | string) => Buffer.from(x).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cached && Date.now() < cached.exp) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${head}.${body}`), sa.private_key.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${b64url(sig)}` }),
  });
  if (!res.ok) { console.error("[fcm] jeton OAuth", res.status, await res.text()); return null; }
  const j = await res.json() as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 300) * 1000 };
  return cached.token;
}

/* "ok" envoyé ; "gone" jeton mort (à supprimer) ; "error" autre échec (on garde le jeton). */
export async function sendFcm(deviceToken: string, n: { title: string; body: string; url: string; tag: string }): Promise<"ok" | "gone" | "error"> {
  const sa = serviceAccount();
  if (!sa) return "error";
  const token = await accessToken(sa);
  if (!token) return "error";
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title: n.title, body: n.body },
        data: { url: n.url },
        android: { priority: "high", collapse_key: n.tag.slice(0, 64), notification: { tag: n.tag.slice(0, 64) } },
      },
    }),
  });
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || text.includes("UNREGISTERED")) return "gone";
  console.error("[fcm]", res.status, text.slice(0, 300));
  return "error";
}
