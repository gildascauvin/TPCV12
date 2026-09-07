import { createAdminClient } from "@/lib/supabase/admin";

/* Bibliothèque publique complète (2026-09-04) — remplace le lien externe vers la page WordPress
   "Utiliser un modèle" du picker de création (ProgramCreatePicker.tsx) : au lieu d'ouvrir un nouvel
   onglet, ProgramLibraryBrowser.tsx liste nativement tous les programmes `is_public=true`, quel
   qu'en soit le propriétaire (les 49 programmes de la bibliothèque publique appartiennent tous au
   compte coach de Gildas, mais rien ne le suppose ici — n'importe quel programme partagé apparaît).
   Public, sans auth (même posture que /api/sandbox/library et /p/[id] : ce contenu est déjà
   consultable publiquement via WordPress/liens partagés, bypass RLS via le client admin comme ces
   deux routes). Champs réduits (pas owner_id/is_public/updated_at, inutiles côté client) — `template`
   inclus, nécessaire pour charger le programme choisi directement dans le builder.

   `dynamic = "force-dynamic"` (2026-09-07) — bug réel trouvé par Gildas : un programme supprimé
   ("Maxi aita test", confirmé absent en base par requête SQL directe) restait visible dans la
   bibliothèque. Cette route n'utilise aucune fonction dynamique (pas de cookies/headers/params),
   donc Next.js la traite comme un Route Handler statique par défaut — mise en cache côté build/CDN,
   jamais revalidée après une écriture en base. Cette liste doit refléter l'état réel à chaque
   requête (créations/suppressions de programmes publics fréquentes), jamais une snapshot figée. */
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("programs")
    .select("id, name, sport, level, focus, weeks_count, sessions_per_week, template, created_at")
    .eq("is_public", true)
    .order("name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ programs: data ?? [] });
}
