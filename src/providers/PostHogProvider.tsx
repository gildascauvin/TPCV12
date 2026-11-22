"use client";
import posthog from "@/lib/ph";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/* Init de PostHog déplacée dans src/lib/ph.ts (chargé après l'affichage, 22/11). Ici : identification à la connexion. */
export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();
    let wasSignedIn = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        wasSignedIn = true;
        posthog.identify(session.user.id, { email: session.user.email });
      } else if (event === "SIGNED_OUT" && wasSignedIn) {
        posthog.reset();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
