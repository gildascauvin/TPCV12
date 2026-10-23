import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { garminConfig } from "@/lib/garmin";

export const dynamic = "force-dynamic";

/* Statut pour le profil, sans jamais exposer les jetons (garmin_connections n'a aucune policy RLS). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configured = !!garminConfig();
  const { data, error } = await createAdminClient()
    .from("garmin_connections").select("connected_at, permissions").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configured, connected: !!data, connectedAt: data?.connected_at ?? null, permissions: data?.permissions ?? [] });
}
