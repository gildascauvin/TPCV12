import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/* Abonnement aux notifications : web push (PWA/navigateur, { subscription }) ou app iOS
   ({ apnsToken }, 2026-10-14) ou app Android ({ fcmToken }, 2026-10-28). Optionnel : heure du rappel du matin (0-23) et fuseau. */
export async function POST(req: Request) {
  const { subscription, apnsToken, fcmToken, hour, tz } = await req.json();
  const isApns = typeof apnsToken === "string" && /^[0-9a-f]{32,200}$/i.test(apnsToken);
  // Jeton Firebase de l'app Android (2026-10-28).
  const isFcm = typeof fcmToken === "string" && /^[\w:-]{100,400}$/.test(fcmToken);
  if (!isApns && !isFcm && (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth)) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    isApns
      ? { user_id: user.id, kind: "apns", endpoint: apnsToken, p256dh: null, auth: null }
      : isFcm
      ? { user_id: user.id, kind: "fcm", endpoint: fcmToken, p256dh: null, auth: null }
      : { user_id: user.id, kind: "web", endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("[push/subscribe]", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const prefs: Record<string, unknown> = {};
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) prefs.push_hour = hour;
  if (typeof tz === "string" && tz.length < 64 && tz.includes("/")) prefs.push_tz = tz;
  if (Object.keys(prefs).length) {
    const { error: pErr } = await admin.from("profiles").update(prefs).eq("user_id", user.id);
    if (pErr) console.error("[push/subscribe] préférences", pErr);
  }

  // Brevo : NOTIFS=OUI coupe le rappel notifs du J+2. Un échec n'empêche pas l'abonnement.
  if (process.env.BREVO_API_KEY && user.email) {
    try {
      const r = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(user.email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
        body: JSON.stringify({ attributes: { NOTIFS: "OUI" } }),
      });
      if (!r.ok && r.status !== 204) console.error("[push/subscribe] brevo", r.status, await r.text());
    } catch (e) { console.error("[push/subscribe] brevo", e); }
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json();
  if (!endpoint) return Response.json({ error: "Requête invalide" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);

  return Response.json({ ok: true });
}
