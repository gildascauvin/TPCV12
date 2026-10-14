import http2 from "node:http2";
import crypto from "node:crypto";

/* Envoi direct au service de notifications d'Apple (2026-10-14), gratuit avec le compte développeur :
   HTTP/2 + jeton JWT signé par la clé .p8 (APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID). Serveur uniquement.
   Production d'abord (TestFlight, App Store) ; un jeton refusé là (BadDeviceToken) est retenté en
   sandbox (build lancé depuis Xcode). */

const TOPIC = process.env.APNS_TOPIC || "com.theperfclub.app";
const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;

let cached: { token: string; at: number } | null = null;

function b64url(x: Buffer | string) {
  return Buffer.from(x).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function providerToken(): string | null {
  const key = process.env.APNS_KEY?.replace(/\\n/g, "\n");
  const kid = process.env.APNS_KEY_ID, iss = process.env.APNS_TEAM_ID;
  if (!key || !kid || !iss) return null;
  // Apple refuse un jeton de plus d'une heure et en limite le renouvellement : 50 min de cache.
  if (cached && Date.now() - cached.at < 50 * 60_000) return cached.token;
  const head = b64url(JSON.stringify({ alg: "ES256", kid }));
  const body = b64url(JSON.stringify({ iss, iat: Math.floor(Date.now() / 1000) }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  cached = { token: `${head}.${body}.${b64url(sig)}`, at: Date.now() };
  return cached.token;
}

export function apnsConfigured() {
  return !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

type ApnsResult = { status: number; reason?: string };

function post(host: string, deviceToken: string, jwt: string, payload: object, collapseId?: string): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const client = http2.connect(host);
    client.on("error", (e) => resolve({ status: 0, reason: e.message }));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
    });
    let status = 0, data = "";
    req.on("response", (h) => { status = Number(h[":status"]); });
    req.setEncoding("utf8");
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      try { reason = data ? JSON.parse(data).reason : undefined; } catch { /* corps vide */ }
      resolve({ status, reason });
    });
    req.on("error", (e) => { client.close(); resolve({ status: 0, reason: e.message }); });
    req.end(JSON.stringify(payload));
  });
}

/* "ok" envoyé ; "gone" jeton mort (à supprimer) ; "error" autre échec (on garde le jeton). */
export async function sendApns(deviceToken: string, n: { title: string; body: string; url: string; tag: string }): Promise<"ok" | "gone" | "error"> {
  const jwt = providerToken();
  if (!jwt) return "error";
  const payload = { aps: { alert: { title: n.title, body: n.body }, sound: "default" }, url: n.url };
  let r = await post(HOSTS.production, deviceToken, jwt, payload, n.tag);
  if (r.status === 400 && r.reason === "BadDeviceToken") r = await post(HOSTS.sandbox, deviceToken, jwt, payload, n.tag);
  if (r.status === 200) return "ok";
  if (r.status === 410 || r.reason === "Unregistered" || r.reason === "BadDeviceToken") return "gone";
  console.error("[apns]", r.status, r.reason);
  return "error";
}
