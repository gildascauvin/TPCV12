"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Objectifs suivis par le sportif connecté, côté client (P2, 24/11/2026) : pour marquer 🎯 ce qu'un
   programme sert parmi tes objectifs, et proposer de suivre les autres au démarrage. Cache module,
   invalidé par `refreshFollowedObjectives()` après une écriture. */

let cache: Promise<string[]> | null = null;
const listeners = new Set<(ids: string[]) => void>();

export function loadFollowedObjectives(): Promise<string[]> {
  if (!cache) {
    cache = (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from("objectives").select("objective_id").eq("user_id", user.id);
      if (error) { console.error("[objectifs] lecture", error.message); return []; }
      return (data ?? []).map(r => r.objective_id as string);
    })();
    cache.then(ids => listeners.forEach(l => l(ids)));
  }
  return cache;
}

export function refreshFollowedObjectives() { cache = null; return loadFollowedObjectives(); }

/** Identifiants suivis (« metric:backSquat »…), null pendant le chargement ; [] hors connexion. */
export function useFollowedObjectives(enabled = true): string[] | null {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const l = (v: string[]) => { if (alive) setIds(v); };
    listeners.add(l);
    loadFollowedObjectives().then(l);
    return () => { alive = false; listeners.delete(l); };
  }, [enabled]);
  return ids;
}
