import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Lu par ProfileDrawer.tsx à l'ouverture (composant partagé, monté depuis 6+ pages) — évite de
   thread profile/email à travers chaque page.tsx serveur qui n'en avait pas déjà besoin. Remplace
   l'ancien /profil (page dédiée), retiré au profit de ce drawer unique. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();

  // Client admin nécessaire : `profiles` n'a qu'une seule policy RLS (`auth.uid() = user_id`),
  // le client de session ne peut donc jamais lire la ligne d'un autre utilisateur — même pattern
  // déjà utilisé par /api/invite/validate pour résoudre le nom d'un coach cross-user.
  let coachName: string | null = null;
  if (profile?.invited_by_coach_id) {
    const admin = createAdminClient();
    const { data: coach } = await admin
      .from("profiles")
      .select("name")
      .eq("user_id", profile.invited_by_coach_id)
      .maybeSingle();
    coachName = coach?.name ?? null;
  }

  return Response.json({ profile, email: user.email || "", coachName });
}
