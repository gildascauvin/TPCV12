import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncRevenueCatStatus } from "@/lib/revenuecat";

/* Appelée par l'app iOS juste après un achat ou une restauration Apple, pour débloquer tout de
   suite sans attendre le webhook. L'utilisateur ne peut synchroniser que lui-même. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const status = await syncRevenueCatStatus(user.id);
    return NextResponse.json({ status });
  } catch (e) {
    console.error("[revenuecat/sync]", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
