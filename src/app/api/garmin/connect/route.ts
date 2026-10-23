import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GARMIN_AUTHORIZE_URL, GARMIN_NOT_CONFIGURED, createPkce, garminConfig } from "@/lib/garmin";

export const dynamic = "force-dynamic";

/* Étape 1 d'OAuth2 PKCE. Le verifier et le state sont enregistrés en base (garmin_oauth_states, 10 min,
   usage unique), liés au sportif connecté : le retour de Garmin le retrouve même sans session, ce qui
   arrive dans l'app iPhone (la page Garmin s'ouvre dans Safari, voir migration 041).
   `?next=` = page où revenir une fois connecté (web). `?json=1` : renvoie { url } au lieu de rediriger,
   pour que l'app ouvre la page Garmin elle-même dans Safari. */
export async function GET(req: NextRequest) {
  const cfg = garminConfig();
  if (!cfg) return new NextResponse(GARMIN_NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  const wantsJson = req.nextUrl.searchParams.get("json") === "1";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return wantsJson ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : NextResponse.redirect(new URL("/login", req.url));

  const nextParam = req.nextUrl.searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";
  const { verifier, challenge, state } = createPkce();

  const admin = createAdminClient();
  // Ménage des liens expirés au passage (aucune tâche planifiée pour si peu).
  await admin.from("garmin_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("garmin_oauth_states").insert({
    state, user_id: user.id, verifier, next, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) {
    console.error("[garmin] connect:", error.message);
    return wantsJson ? NextResponse.json({ error: "Erreur" }, { status: 500 }) : NextResponse.redirect(new URL(`${next}?garmin=error`, req.url));
  }

  const url = new URL(GARMIN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  return wantsJson ? NextResponse.json({ url: url.toString() }) : NextResponse.redirect(url);
}
