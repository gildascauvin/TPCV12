import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Garmin Connect Developer Program (2026-10-23), côté serveur uniquement : le client secret ne doit
   jamais quitter le backend (spec OAuth2 PKCE de Garmin : pas de flow « public client »).
   Source : OAuth2PKCE 2.0.pdf (portail développeur Garmin). */

export const GARMIN_AUTHORIZE_URL = "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API = "https://apis.garmin.com/partner-gateway/rest";


export type GarminConfig = { clientId: string; clientSecret: string; redirectUri: string };

/* null si les clés ne sont pas encore posées (application en revue chez Garmin). */
export function garminConfig(): GarminConfig | null {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: process.env.GARMIN_REDIRECT_URI || "https://go.theperfclub.com/api/garmin/callback" };
}

export const GARMIN_NOT_CONFIGURED = "Garmin n'est pas encore configuré (GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET manquants).";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* code_verifier : 43-128 caractères parmi A-Z a-z 0-9 - . _ ~ ; challenge = base64url(sha256(verifier)). */
export function createPkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));
  return { verifier, challenge, state };
}

export type GarminTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

async function tokenRequest(cfg: GarminConfig, params: Record<string, string>): Promise<GarminTokens> {
  const body = new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Garmin token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as GarminTokens;
  if (!json.access_token || !json.refresh_token) throw new Error("Garmin token: réponse incomplète");
  return json;
}

export function exchangeCode(cfg: GarminConfig, code: string, verifier: string) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: cfg.redirectUri });
}

export function refreshTokens(cfg: GarminConfig, refreshToken: string) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/* Colonnes de garmin_connections dérivées d'une réponse token. Garmin recommande de rafraîchir au
   moins 600 s avant l'expiration annoncée. */
export function tokenColumns(t: GarminTokens) {
  const now = Date.now();
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    access_expires_at: new Date(now + (t.expires_in - 600) * 1000).toISOString(),
    refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
    scope: t.scope ?? null,
    updated_at: new Date(now).toISOString(),
  };
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Garmin ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchGarminUserId = (token: string) => apiGet<{ userId: string }>("/user/id", token).then((r) => r.userId);
export const fetchGarminPermissions = (token: string) =>
  apiGet<{ permissions: string[] }>("/user/permissions", token).then((r) => r.permissions ?? []);

/* À appeler quand le sportif se déconnecte depuis ThePerfClub (obligatoire selon la spec). Garmin
   envoie ensuite une notification de « deregistration », qui ne trouvera plus rien à supprimer. */
export async function deleteGarminRegistration(token: string) {
  const res = await fetch(`${API}/user/registration`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok && res.status !== 404) throw new Error(`Garmin DELETE registration HTTP ${res.status}`);
}

type ConnRow = { user_id: string; access_token: string; refresh_token: string; access_expires_at: string; refresh_expires_at: string | null };

/* Jeton valide pour cette connexion : rafraîchi (et réenregistré) s'il expire. null si Garmin refuse
   le rafraîchissement (refresh token expiré ou révoqué). */
export async function validAccessToken(admin: SupabaseClient, cfg: GarminConfig, conn: ConnRow): Promise<string | null> {
  if (new Date(conn.access_expires_at).getTime() > Date.now()) return conn.access_token;
  try {
    const t = await refreshTokens(cfg, conn.refresh_token);
    const { error } = await admin.from("garmin_connections").update(tokenColumns(t)).eq("user_id", conn.user_id);
    if (error) console.error("[garmin] enregistrement du jeton rafraîchi:", error.message);
    return t.access_token;
  } catch (e) {
    console.error("[garmin] rafraîchissement du jeton:", e);
    return null;
  }
}

/* Les refresh tokens expirent 3 mois après leur création : on les renouvelle quand il reste moins de
   30 jours (appelé à chaque push reçu pour ce sportif, donc tant qu'il synchronise sa montre). */
export async function keepConnectionAlive(admin: SupabaseClient, cfg: GarminConfig, conn: ConnRow) {
  const exp = conn.refresh_expires_at ? new Date(conn.refresh_expires_at).getTime() : 0;
  if (exp && exp - Date.now() > 30 * 86400_000) return;
  try {
    const t = await refreshTokens(cfg, conn.refresh_token);
    const { error } = await admin.from("garmin_connections").update(tokenColumns(t)).eq("user_id", conn.user_id);
    if (error) console.error("[garmin] renouvellement du refresh token:", error.message);
  } catch (e) {
    console.error("[garmin] renouvellement du refresh token:", e);
  }
}
