import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GARMIN_NOT_CONFIGURED, exchangeCode, fetchGarminPermissions, fetchGarminUserId, garminConfig, tokenColumns,
} from "@/lib/garmin";

export const dynamic = "force-dynamic";

/* Étape 2 : Garmin renvoie ?code=&state= (ou rien si le sportif refuse). Le sportif est retrouvé par le
   state enregistré à l'étape 1 (garmin_oauth_states), pas par la session : depuis l'app iPhone, ce
   retour arrive dans Safari, sans session. Code échangé côté serveur, puis id Garmin et permissions.
   - Navigateur où le même sportif est connecté (web) : retour vers la page d'origine avec
     ?garmin=connected|denied|error (lu par le profil).
   - Sinon (Safari ouvert par l'app) : petite page « retourne dans l'app », que l'app relit en revenant
     au premier plan. */
export async function GET(req: NextRequest) {
  const cfg = garminConfig();
  if (!cfg) return new NextResponse(GARMIN_NOT_CONFIGURED, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const admin = createAdminClient();

  let saved: { user_id: string; verifier: string; next: string; expires_at: string } | null = null;
  if (state) {
    // Usage unique : la ligne est supprimée en la lisant.
    const { data, error } = await admin.from("garmin_oauth_states").delete().eq("state", state).select("user_id, verifier, next, expires_at").maybeSingle();
    if (error) console.error("[garmin] callback state:", error.message);
    if (data && new Date(data.expires_at).getTime() > Date.now()) saved = data;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const sameBrowser = !!user && !!saved && user.id === saved.user_id;

  const back = (status: "connected" | "denied" | "error") => {
    if (sameBrowser) {
      const url = new URL(saved!.next, req.url);
      url.searchParams.set("garmin", status);
      return NextResponse.redirect(url);
    }
    return resultPage(status);
  };

  if (!saved) return back("error");
  if (!code) return back("denied");

  try {
    const tokens = await exchangeCode(cfg, code, saved.verifier);
    const [garminUserId, permissions] = await Promise.all([
      fetchGarminUserId(tokens.access_token),
      fetchGarminPermissions(tokens.access_token).catch((e) => { console.error("[garmin] permissions:", e); return [] as string[]; }),
    ]);
    // Un compte Garmin ne peut être lié qu'à un seul compte ThePerfClub : la liaison la plus récente gagne.
    const { error: delError } = await admin.from("garmin_connections").delete().eq("garmin_user_id", garminUserId).neq("user_id", saved.user_id);
    if (delError) throw new Error(`liaison précédente: ${delError.message}`);
    const { error } = await admin.from("garmin_connections").upsert(
      { user_id: saved.user_id, garmin_user_id: garminUserId, permissions, connected_at: new Date().toISOString(), ...tokenColumns(tokens) },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`enregistrement: ${error.message}`);
    return back("connected");
  } catch (e) {
    console.error("[garmin] callback:", e);
    return back("error");
  }
}

const RESULT_TEXT = {
  connected: { title: "Garmin est connecté", body: "Retourne dans ThePerfClub : tes prochaines nuits et séances arriveront toutes seules." },
  denied: { title: "Connexion annulée", body: "Retourne dans ThePerfClub pour réessayer quand tu veux." },
  error: { title: "La connexion a échoué", body: "Retourne dans ThePerfClub et réessaie depuis ton profil." },
} as const;

function resultPage(status: keyof typeof RESULT_TEXT) {
  const t = RESULT_TEXT[status];
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.title} · ThePerfClub</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#070a0d;color:#fff;font-family:-apple-system,system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}
.c{max-width:340px}h1{font-size:22px;margin:0 0 10px}p{font-size:15px;line-height:1.5;color:rgba(255,255,255,.75);margin:0}.i{font-size:40px;margin-bottom:14px}</style></head>
<body><div class="c"><div class="i">${status === "connected" ? "⌚" : "↩︎"}</div><h1>${t.title}</h1><p>${t.body}</p></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
