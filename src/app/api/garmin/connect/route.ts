import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GARMIN_AUTHORIZE_URL, GARMIN_NOT_CONFIGURED, PKCE_COOKIE, createPkce, garminConfig } from "@/lib/garmin";

export const dynamic = "force-dynamic";

/* Étape 1 d'OAuth2 PKCE : le verifier et le state vivent 10 min dans un cookie httpOnly (SameSite=Lax :
   renvoyé par le navigateur au retour de Garmin, navigation de premier niveau). `?next=` = page où
   revenir une fois connecté. */
export async function GET(req: NextRequest) {
  const cfg = garminConfig();
  if (!cfg) return new NextResponse(GARMIN_NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const nextParam = req.nextUrl.searchParams.get("next") ?? "/today";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/today";
  const { verifier, challenge, state } = createPkce();

  const url = new URL(GARMIN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state, uid: user.id, next }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/garmin", maxAge: 600,
  });
  return res;
}
