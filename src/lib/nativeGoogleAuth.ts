import { Capacitor } from "@capacitor/core";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Connexion Google native dans l'app iOS (2026-10-01). Google refuse son écran de connexion dans
   une WebView (erreur disallowed_useragent), donc signInWithOAuth ne marche pas dans la coque
   Capacitor. On passe par le SDK Google natif (plugin @capgo/capacitor-social-login), puis on
   remet l'idToken à Supabase via signInWithIdToken : la session est posée dans les cookies comme
   après /auth/callback, donc la suite du parcours (register?d=..., /today) reste identique au web.

   iOSServerClientId = le client "Web" déjà configuré dans Supabase : l'idToken est alors émis pour
   ce client (claim aud), que Supabase accepte sans configuration supplémentaire. Les client IDs ne
   sont pas des secrets. */

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "874089773764-jqk4o3otggvrdgcoh5ipun5qiddbfnrk.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "874089773764-m2mn04jtvdjmta7orum5slp6ictojccl.apps.googleusercontent.com";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

let initialized = false;

/* Le SDK Google iOS met toujours un nonce dans l'idToken ; Supabase exige alors le nonce brut.
   Convention Supabase : Google reçoit le SHA-256 (hex) du nonce, Supabase reçoit le nonce brut.
   forcePrompt est indispensable : sans lui le plugin restaure la session Google en cache et renvoie
   l'ancien idToken, avec l'ancien nonce (erreur "nonces mismatch"). */
async function makeNonce() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

type SocialLoginPlugin = typeof import("@capgo/capacitor-social-login").SocialLogin;

// Initialisé une seule fois pour les deux fournisseurs (Google et Apple).
async function initSocialLogin(SocialLogin: SocialLoginPlugin) {
  if (initialized) return;
  await SocialLogin.initialize({
    google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, iOSServerClientId: GOOGLE_WEB_CLIENT_ID, mode: "online" },
    // iOS : Sign in with Apple passe par le système ; clientId sert juste à activer le fournisseur,
    // redirectUrl vide évite toute redirection web.
    apple: { clientId: "com.theperfclub.app", redirectUrl: "" },
  });
  initialized = true;
}

/* Renvoie null si l'utilisateur a fermé la fenêtre Google (pas une erreur à afficher). */
export async function nativeGoogleSignIn(supabase: SupabaseClient): Promise<{ ok: true } | { ok: false; error: string } | null> {
  if (!GOOGLE_IOS_CLIENT_ID || !GOOGLE_WEB_CLIENT_ID) {
    return { ok: false, error: "Connexion Google indisponible dans l'app pour le moment." };
  }
  // Import dynamique : le plugin n'a rien à faire dans le bundle web.
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await initSocialLogin(SocialLogin);

  const nonce = await makeNonce();
  let idToken: string | null = null;
  try {
    const res = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"], nonce: nonce.hashed, forcePrompt: true } });
    idToken = res.result && "idToken" in res.result ? res.result.idToken : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return null;
    console.error("[google-native]", msg);
    return { ok: false, error: "Connexion Google impossible. Réessaie ou utilise ton email." };
  }
  if (!idToken) return { ok: false, error: "Connexion Google impossible. Réessaie ou utilise ton email." };

  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: nonce.raw });
  if (error) {
    console.error("[google-native] supabase", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* Se connecter avec Apple (2026-10-01) — obligatoire sur iOS dès qu'on propose Google (guideline
   4.8). Même schéma que Google : nonce haché envoyé à Apple, nonce brut à Supabase. Côté Supabase,
   le fournisseur Apple doit être activé avec le bundle ID com.theperfclub.app dans ses Client IDs
   (pas de clé secrète nécessaire pour la connexion native).
   Apple ne transmet le nom qu'à la toute première connexion : on le pose alors dans les
   métadonnées (full_name), là où l'onboarding le lit déjà pour Google. */
export async function nativeAppleSignIn(supabase: SupabaseClient): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await initSocialLogin(SocialLogin);

  const nonce = await makeNonce();
  let idToken: string | null = null;
  let fullName = "";
  try {
    const res = await SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"], nonce: nonce.hashed } });
    const r = res.result as { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
    idToken = r?.idToken ?? null;
    fullName = [r?.profile?.givenName, r?.profile?.familyName].filter(Boolean).join(" ");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|1001/i.test(msg)) return null;
    console.error("[apple-native]", msg);
    return { ok: false, error: "Connexion Apple impossible. Réessaie ou utilise ton email." };
  }
  if (!idToken) return { ok: false, error: "Connexion Apple impossible. Réessaie ou utilise ton email." };

  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken, nonce: nonce.raw });
  if (error) {
    console.error("[apple-native] supabase", error.message);
    return { ok: false, error: error.message };
  }
  if (fullName) await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
  return { ok: true };
}
