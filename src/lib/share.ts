"use client";

import { createClient } from "@/lib/supabase/client";

/* Partage générique — snapshot figé au moment du clic (jamais un pointeur live vers la ligne
   source), stocké dans `shares` (013_shares.sql). Lecture publique volontaire par design (aucune
   donnée sensible dans les 6 types ci-dessous — décision explicite, voir CLAUDE.md). */
/* "programme" volontairement absent : le partage d'un programme passe par le mécanisme public
   existant (/p/[id], is_public) plutôt que par ce système de snapshot générique — décision
   explicite de Gildas, pour ne pas dupliquer deux façons de partager la même chose. */
export type ShareResourceType = "wellness" | "session" | "charge" | "recuperation" | "coach_athlete";

export async function createShare(resourceType: ShareResourceType, snapshot: Record<string, unknown>): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  const { data, error } = await supabase
    .from("shares")
    .insert({ resource_type: resourceType, snapshot, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Échec de la création du partage.");
  return `${window.location.origin}/share/${data.id}`;
}
