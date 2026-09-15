import { createClient } from "@/lib/supabase/server";

/* Lu par ProfileDrawer.tsx à l'ouverture (composant partagé, monté depuis 6+ pages) — évite de
   thread profile/email à travers chaque page.tsx serveur qui n'en avait pas déjà besoin. Remplace
   l'ancien /profil (page dédiée), retiré au profit de ce drawer unique. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();

  return Response.json({ profile, email: user.email || "" });
}
