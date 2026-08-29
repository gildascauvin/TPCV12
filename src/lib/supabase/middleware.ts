import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  /* /p/* est public et à fort trafic anonyme (iframe WP + liens directs) — aucun besoin
     de résoudre l'utilisateur ni de rafraîchir son cookie de session pour cette route,
     l'aller-retour Auth Supabase pesait directement sur le TTFB/LCP (mesuré jusqu'à 18s
     mobile p90). Restreint à /p/ (pas tous les publicPaths) pour limiter le risque.
     /share/* suit le même principe : public par design (snapshot sans donnée sensible,
     ouvert directement quel que soit le statut de connexion, voir CLAUDE.md). */
  /* /sandbox/* suit le même principe (2026-08-19) : visiteur anonyme par construction, jamais de
     session à résoudre, potentiellement fort trafic depuis WP (2 URL copiables-collées par rôle,
     voir CLAUDE.md "Sandbox PLG"). */
  if (request.nextUrl.pathname.startsWith("/p/") || request.nextUrl.pathname.startsWith("/share/") || request.nextUrl.pathname.startsWith("/sandbox/")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...(options as Parameters<typeof supabaseResponse.cookies.set>[2]),
              maxAge: 60 * 60 * 24 * 7,
            })
          );
        },
      },
    }
  );

  const {
    data: { user: fetchedUser },
    error: userError,
  } = await supabase.auth.getUser();

  let user = fetchedUser;

  /* Un refresh token invalide/déjà consommé (rotation Supabase, cookie périmé resté
     coincé sur un appareil) faisait échouer getUser() en silence — user retombait à
     null sans jamais nettoyer le cookie, donc le même échec se reproduisait à chaque
     requête suivante (confirmé en prod : 24 occurrences sur seulement 5 users en 8
     jours, pas un pic ponctuel). Ça laissait aussi le client (supabase-js navigateur)
     retenter indéfiniment un refresh avec le même token mort, plausible cause des
     "TypeError: Load failed" côté client. Fix : nettoyer le cookie dès qu'on détecte
     ce cas précis, pour casser la boucle et repartir sur un état anonyme propre.
     scope:"local" délibéré (pas le défaut "global") — ce message exact est aussi le
     symptôme classique d'une race de rotation de refresh token (deux requêtes
     concurrentes, ex. 2 onglets/prefetch/service worker, utilisent le même token :
     la 1re le fait tourner, la 2e se prend cette erreur alors que la session reste
     valide). "local" nettoie uniquement le cookie de CETTE réponse sans révoquer la
     session côté serveur Supabase — si c'était en fait une race bénigne, on n'éjecte
     pas une session par ailleurs valide. */
  if (userError?.message?.toLowerCase().includes("refresh token")) {
    await supabase.auth.signOut({ scope: "local" });
    user = null;
  }

  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/register", "/auth/callback", "/api/", "/join/", "/p/", "/share/", "/sandbox/"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_done")
      .eq("user_id", user.id)
      .single();

    if (!profile?.onboarding_done) {
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
