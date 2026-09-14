import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const supabaseError = searchParams.get("error") || searchParams.get("error_code");

  let exchangeFailed = false;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) exchangeFailed = true;
  }

  /* Lien à usage unique déjà consommé (souvent le scanner de liens de la messagerie qui
     pré-visite l'URL avant le vrai clic) ou expiré : Supabase ajoute ?error=.../error_code=...
     sans jamais fournir de `code`, ou l'exchange lui-même échoue. Avant ce fix, ce cas
     continuait silencieusement vers /reset-password sans session → le middleware (qui
     n'a pas /reset-password dans publicPaths) rebasculait sur /login sans aucune
     explication, ce qui ressemblait à un plantage muet plutôt qu'à un lien expiré. */
  if (supabaseError || exchangeFailed) {
    return NextResponse.redirect(`${origin}/login?expired=1`);
  }

  if (type === "recovery") {
    const first = searchParams.get("first");
    return NextResponse.redirect(`${origin}/reset-password${first ? "?first=1" : ""}`);
  }

  const d = searchParams.get("d");
  if (d) {
    return NextResponse.redirect(`${origin}/register?d=${d}`);
  }

  return NextResponse.redirect(`${origin}/today`);
}
