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

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

let initialized = false;

/* Renvoie null si l'utilisateur a fermé la fenêtre Google (pas une erreur à afficher). */
export async function nativeGoogleSignIn(supabase: SupabaseClient): Promise<{ ok: true } | { ok: false; error: string } | null> {
  if (!GOOGLE_IOS_CLIENT_ID || !GOOGLE_WEB_CLIENT_ID) {
    return { ok: false, error: "Connexion Google indisponible dans l'app pour le moment." };
  }
  // Import dynamique : le plugin n'a rien à faire dans le bundle web.
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  if (!initialized) {
    await SocialLogin.initialize({
      google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, iOSServerClientId: GOOGLE_WEB_CLIENT_ID, mode: "online" },
    });
    initialized = true;
  }

  let idToken: string | null = null;
  try {
    const res = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
    idToken = res.result && "idToken" in res.result ? res.result.idToken : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return null;
    console.error("[google-native]", msg);
    return { ok: false, error: "Connexion Google impossible. Réessaie ou utilise ton email." };
  }
  if (!idToken) return { ok: false, error: "Connexion Google impossible. Réessaie ou utilise ton email." };

  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) {
    console.error("[google-native] supabase", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
