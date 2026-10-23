import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GARMIN_NOT_CONFIGURED, PKCE_COOKIE, exchangeCode, fetchGarminPermissions, fetchGarminUserId, garminConfig, tokenColumns,
} from "@/lib/garmin";

export const dynamic = "force-dynamic";

/* Étape 2 : Garmin renvoie ?code=&state= (ou rien si le sportif refuse). Code échangé côté serveur,
   puis id Garmin et permissions accordées enregistrés. Retour vers la page d'origine avec
   ?garmin=connected|denied|error (lu par le profil pour l'event PostHog et le message). */
export async function GET(req: NextRequest) {
  const cfg = garminConfig();
  if (!cfg) return new NextResponse(GARMIN_NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });

  let saved: { verifier: string; state: string; uid: string; next: string } | null = null;
  try { saved = JSON.parse(req.cookies.get(PKCE_COOKIE)?.value ?? "null"); } catch { saved = null; }
  const back = (status: string) => {
    const url = new URL(saved?.next ?? "/today", req.url);
    url.searchParams.set("garmin", status);
    const res = NextResponse.redirect(url);
    res.cookies.set(PKCE_COOKIE, "", { path: "/api/garmin", maxAge: 0 });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!saved || !state || state !== saved.state) return back("error");
  if (!code) return back("denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== saved.uid) return back("error");

  try {
    const tokens = await exchangeCode(cfg, code, saved.verifier);
    const [garminUserId, permissions] = await Promise.all([
      fetchGarminUserId(tokens.access_token),
      fetchGarminPermissions(tokens.access_token).catch(() => [] as string[]),
    ]);
    const admin = createAdminClient();
    // Un compte Garmin ne peut être lié qu'à un seul compte ThePerfClub : la liaison la plus récente gagne.
    const { error: delError } = await admin.from("garmin_connections").delete().eq("garmin_user_id", garminUserId).neq("user_id", user.id);
    if (delError) throw new Error(`liaison précédente: ${delError.message}`);
    const { error } = await admin.from("garmin_connections").upsert(
      { user_id: user.id, garmin_user_id: garminUserId, permissions, connected_at: new Date().toISOString(), ...tokenColumns(tokens) },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`enregistrement: ${error.message}`);
    return back("connected");
  } catch (e) {
    console.error("[garmin] callback:", e);
    return back("error");
  }
}
