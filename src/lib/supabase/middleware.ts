import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  /* /p/* est public et à fort trafic anonyme (iframe WP + liens directs) — aucun besoin
     de résoudre l'utilisateur ni de rafraîchir son cookie de session pour cette route,
     l'aller-retour Auth Supabase pesait directement sur le TTFB/LCP (mesuré jusqu'à 18s
     mobile p90). Restreint à /p/ (pas tous les publicPaths) pour limiter le risque.
     /share/* suit le même principe : public par design (snapshot sans donnée sensible,
     ouvert directement quel que soit le statut de connexion, voir CLAUDE.md). */
  if (request.nextUrl.pathname.startsWith("/p/") || request.nextUrl.pathname.startsWith("/share/")) {
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
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/register", "/auth/callback", "/api/", "/join/", "/p/", "/share/"];
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
