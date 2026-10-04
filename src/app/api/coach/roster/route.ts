import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/* Liste des sportifs du coach avec leur email (2026-10-04, onglet "Mes sportifs" du tiroir profil).
   L'email d'un sportif inscrit vit dans auth.users, illisible côté client : lu ici via l'admin, après
   avoir vérifié que la ligne coach_athletes appartient bien au coach connecté (client normal, RLS). */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("coach_athletes")
    .select("id, name, user_id, invite_email")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  const athletes = await Promise.all((rows ?? []).map(async r => {
    let email: string | null = r.invite_email;
    if (r.user_id) {
      const { data } = await admin.auth.admin.getUserById(r.user_id);
      email = data?.user?.email ?? null;
    }
    return { ...r, email };
  }));
  return Response.json({ athletes });
}
