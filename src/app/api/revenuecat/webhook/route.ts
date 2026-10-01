import { NextResponse } from "next/server";
import { syncRevenueCatStatus } from "@/lib/revenuecat";

/* Webhook RevenueCat (renouvellement, résiliation, expiration, remboursement...). RevenueCat envoie
   l'en-tête Authorization configuré dans son dashboard : il doit valoir REVENUECAT_WEBHOOK_AUTH.
   On ne lit que l'app_user_id (= id Supabase) et on resynchronise l'état complet du client. */
export async function POST(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const event = body?.event;
  if (!event || event.type === "TEST") return NextResponse.json({ received: true });

  const ids: string[] = [event.app_user_id, ...(event.transferred_to ?? [])]
    .filter((id: unknown): id is string => typeof id === "string" && !id.startsWith("$RCAnonymousID"));
  try {
    for (const id of Array.from(new Set(ids))) await syncRevenueCatStatus(id);
  } catch (e) {
    console.error("[revenuecat/webhook]", event.type, e);
    // 500 : RevenueCat réessaie plus tard.
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
