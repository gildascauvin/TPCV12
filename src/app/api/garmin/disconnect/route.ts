import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteGarminRegistration, garminConfig, validAccessToken } from "@/lib/garmin";
import { deleteGarminData } from "@/lib/garminIngest";

export const dynamic = "force-dynamic";

/* Déconnexion depuis ThePerfClub : DELETE /user/registration chez Garmin (obligatoire selon la spec dès
   qu'on offre un bouton « Déconnecter »), puis suppression de la liaison ET des données Garmin (engagement
   pris dans le dossier Garmin et la politique de confidentialité). Si Garmin ne répond pas, on supprime
   quand même chez nous : le sportif doit toujours pouvoir couper. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: conn, error: readError } = await admin
    .from("garmin_connections").select("user_id, access_token, refresh_token, access_expires_at, refresh_expires_at")
    .eq("user_id", user.id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const cfg = garminConfig();
  if (conn && cfg) {
    const token = await validAccessToken(admin, cfg, conn);
    if (token) await deleteGarminRegistration(token).catch((e) => console.error("[garmin] deregistration:", e));
  }

  try {
    await deleteGarminData(admin, user.id);
  } catch (e) {
    console.error("[garmin] suppression des données:", e);
    return NextResponse.json({ error: "Suppression des données Garmin impossible" }, { status: 500 });
  }
  const { error } = await admin.from("garmin_connections").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
