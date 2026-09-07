import { createAdminClient } from "@/lib/supabase/admin";

/* Bibliothèque publique complète (2026-09-04) — remplace le lien externe vers la page WordPress
   "Utiliser un modèle" du picker de création (ProgramCreatePicker.tsx) : au lieu d'ouvrir un nouvel
   onglet, ProgramLibraryBrowser.tsx liste nativement les programmes de la bibliothèque officielle.
   Public, sans auth (même posture que /api/sandbox/library et /p/[id] : ce contenu est déjà
   consultable publiquement via WordPress/liens partagés, bypass RLS via le client admin comme ces
   deux routes). Champs réduits (pas owner_id/is_public/updated_at, inutiles côté client) — `template`
   inclus, nécessaire pour charger le programme choisi directement dans le builder.

   `is_official_template` (2026-09-07, remplace le filtre `is_public` seul) — retour de Gildas :
   cliquer "🔗 Partager" sur un programme perso le rend `is_public=true` (comportement voulu, le
   lien /p/[id] doit fonctionner), mais ça le faisait AUSSI apparaître ici, dans la bibliothèque vue
   par tout le monde — deux programmes de test de son propre compte s'y étaient glissés ainsi.
   `is_official_template` découple les deux : seule cette colonne pilote ce qui s'affiche ici, jamais
   posée à `true` par un chemin de création/partage de l'app (uniquement via une action manuelle en
   base, comme le reste de la bibliothèque officielle) — donc plus jamais atteignable par erreur.

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
    .eq("is_official_template", true)
    .order("name", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ programs: data ?? [] });
}
