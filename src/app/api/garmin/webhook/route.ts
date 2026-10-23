import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { garminConfig, keepConnectionAlive } from "@/lib/garmin";
import { deleteGarminData, ingestGarminPush } from "@/lib/garminIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Une seule URL pour tous les types de push Garmin (le type est la clé de liste du corps :
   dailies, sleeps, hrv, activities, activityDetails, manuallyUpdatedActivities, deregistrations,
   userPermissionsChange). À configurer dans https://apis.garmin.com/tools/endpoints, avec
   ?token=GARMIN_WEBHOOK_TOKEN si cette variable est posée.
   Garmin coupe à 30 s et attend un 200 : on répond toujours 200 (une erreur de notre côté ne doit pas
   faire réessayer Garmin en boucle), seul un appel non authentifié reçoit 401. Le traitement est court
   (quelques upserts par sportif), fait avant de répondre. */

type Row = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const cfg = garminConfig();
  if (!cfg) return NextResponse.json({ error: "Garmin non configuré" }, { status: 503 });

  const expectedToken = process.env.GARMIN_WEBHOOK_TOKEN;
  if (expectedToken && req.nextUrl.searchParams.get("token") !== expectedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientHeader = req.headers.get("garmin-client-id");
  if (clientHeader && clientHeader !== cfg.clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, Row[]>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true, ignored: "json" }); }

  const admin = createAdminClient();
  let processed = 0;

  try {
    // Regroupe par sportif Garmin (un push peut contenir plusieurs utilisateurs et plusieurs types).
    const byUser = new Map<string, Record<string, Row[]>>();
    for (const [type, list] of Object.entries(body)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const gid = typeof item?.userId === "string" ? item.userId : null;
        if (!gid) continue;
        const slot = byUser.get(gid) ?? {};
        (slot[type] ??= []).push(item);
        byUser.set(gid, slot);
      }
    }
    if (!byUser.size) return NextResponse.json({ ok: true, processed: 0 });

    const { data: conns, error } = await admin
      .from("garmin_connections").select("user_id, garmin_user_id, access_token, refresh_token, access_expires_at, refresh_expires_at")
      .in("garmin_user_id", Array.from(byUser.keys()));
    if (error) throw new Error(`lecture garmin_connections: ${error.message}`);

    for (const conn of conns ?? []) {
      const payload = byUser.get(conn.garmin_user_id as string)!;
      try {
        if (payload.deregistrations?.length) {
          // Consentement retiré côté Garmin Connect : mêmes suppressions qu'une déconnexion chez nous.
          await deleteGarminData(admin, conn.user_id as string);
          const { error: delError } = await admin.from("garmin_connections").delete().eq("user_id", conn.user_id as string);
          if (delError) throw new Error(`suppression liaison: ${delError.message}`);
          processed++;
          continue;
        }
        const permList = payload.userPermissionsChange ?? [];
        const perm = permList[permList.length - 1];
        if (perm && Array.isArray(perm.permissions)) {
          const { error: pErr } = await admin.from("garmin_connections")
            .update({ permissions: perm.permissions as string[], updated_at: new Date().toISOString() }).eq("user_id", conn.user_id as string);
          if (pErr) throw new Error(`permissions: ${pErr.message}`);
          processed++;
        }
        processed += await ingestGarminPush(admin, conn.user_id as string, payload);
        await keepConnectionAlive(admin, cfg, conn as never);
      } catch (e) {
        console.error("[garmin] webhook sportif", conn.user_id, e);
      }
    }
  } catch (e) {
    console.error("[garmin] webhook:", e);
  }
  return NextResponse.json({ ok: true, processed });
}
