"use client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

if (typeof window !== "undefined" && process.env.NODE_ENV !== "development") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "https://eu.i.posthog.com",
    person_profiles: "always",
    capture_pageview: false,
  });
}

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

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
