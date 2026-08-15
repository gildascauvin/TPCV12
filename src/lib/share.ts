"use client";

import { createClient } from "@/lib/supabase/client";

/* Partage générique — snapshot figé au moment du clic (jamais un pointeur live vers la ligne
   source), stocké dans `shares` (013_shares.sql). Lecture publique volontaire par design (aucune
   donnée sensible dans les 6 types ci-dessous — décision explicite, voir CLAUDE.md). */
/* "programme" volontairement absent : le partage d'un programme passe par le mécanisme public
   existant (/p/[id], is_public) plutôt que par ce système de snapshot générique — décision
   explicite de Gildas, pour ne pas dupliquer deux façons de partager la même chose. */
/* "signature" (2026-08-16) : remplace les 2 boutons de partage séparés Charge/Récupération sur
   /conseils et /coach/athletes par un seul lien combiné (insight croisé global + les 2 charts, sans
   les badges d'indicateurs) — retour explicite de Gildas après avoir vu les 2 partages séparés :
   "je préfère qu'un lien de partage... avec les infos : insight croisé global, charge + graph,
   récupération + graph". "charge"/"recuperation" restent des types valides (rendus toujours
   supportés dans ShareView.tsx/opengraph-image.tsx) pour ne pas casser d'anciens liens déjà
   partagés, mais plus aucun nouveau bouton ne les crée. */
export type ShareResourceType = "wellness" | "session" | "charge" | "recuperation" | "coach_athlete" | "signature";

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
