"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";

/* Freemium (2026-09-30) : un compte gratuit voit sa 1re vraie décision en clair, puis les sorties
   se floutent dès le lendemain. Pas d'essai, pas de date de fin : juste ce jour-là.
   `eligible` = une vraie décision est à l'écran (check-in fait + séance à ajuster). La date n'est
   posée qu'à ce moment, pour qu'un jour sans décision ne "consomme" pas le jour 1.
   Renvoie true si les sorties sont lisibles (abonné, jour 1, ou pas encore de 1re décision). */
export function useFirstDecision({ userId, isActive, initial, today, eligible, enabled = true }: {
  userId: string | undefined;
  isActive: boolean;
  initial: string | null | undefined;
  today: string;
  eligible: boolean;
  enabled?: boolean;
}): boolean {
  const [firstOn, setFirstOn] = useState<string | null>(initial ?? null);

  useEffect(() => {
    if (!enabled || isActive || firstOn || !eligible || !userId) return;
    setFirstOn(today);
    posthog.capture("first_decision_shown");
    createClient().from("profiles").update({ first_decision_on: today }).eq("user_id", userId)
      .then(({ error }) => { if (error) console.error("first_decision_on", error); });
  }, [enabled, isActive, firstOn, eligible, userId, today]);

  if (!enabled || isActive) return true;
  return firstOn === null || firstOn === today;
}
