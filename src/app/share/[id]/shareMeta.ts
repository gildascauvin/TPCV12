import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShareResourceType } from "@/lib/share";

export interface ShareRow { resource_type: ShareResourceType; snapshot: Record<string, unknown> }

/* Partagé entre page.tsx (metadata + rendu) et opengraph-image.tsx (crawler WhatsApp/réseaux) —
   cache() dédoublonne seulement à l'intérieur d'une même requête, jamais entre les deux (routes
   distinctes, fetchées séparément par un crawler), mais évite au moins l'appel en double entre
   generateMetadata() et le composant de page dans le même rendu. */
export const getShare = cache(async (id: string) => {
  const admin = createAdminClient();
  const { data } = await admin.from("shares").select("resource_type, snapshot").eq("id", id).maybeSingle();
  return data as ShareRow | null;
});

export function metaFor(row: ShareRow): { title: string; description?: string } {
  const s = row.snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (row.resource_type) {
    case "wellness": return { title: `${s.authorName} · ${s.zoneLabel}`, description: s.recoveryAdvice };
    case "session": return { title: s.name, description: Array.isArray(s.exercises) ? `${s.exercises.length} exercice${s.exercises.length > 1 ? "s" : ""}` : undefined };
    case "charge": return { title: "Charge d'entraînement", description: s.insight };
    case "recuperation": return { title: "Récupération", description: s.insight };
    case "coach_athlete": return { title: `${s.athleteName} · Coach control`, description: s.decision };
  }
}
