import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freezeMorningProposal, notifyCoachesIfLighten } from "@/lib/autoregProposalServer";

/* Fige la reco du matin de la séance du jour (migration 042) et prévient le coach si elle dit
   d'alléger. Appelé juste après le point forme (WellnessModal, partout) et par /today en secours. Le
   calcul est fait ICI, jamais pris du client : une seule source pour la carte du sportif, celle du
   coach et la notification. Une seule fois par séance et par jour : un point forme corrigé ensuite ne
   réécrit pas la reco que le sportif a vue. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { date, athleteUserId } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Date invalide" }, { status: 400 });

  const admin = createAdminClient();
  /* Rattrapage (2026-10-24) : le coach qui envoie une séance du jour après le point forme de son sportif
     la fait figer tout de suite (coach lié vérifié), sans attendre que le sportif rouvre l'Accueil. */
  let target = user.id;
  if (typeof athleteUserId === "string" && athleteUserId !== user.id) {
    const { data: link } = await admin.from("coach_athletes").select("id").eq("coach_id", user.id).eq("user_id", athleteUserId).limit(1).maybeSingle();
    if (!link) return Response.json({ error: "Sportif non lié" }, { status: 403 });
    target = athleteUserId;
  }
  try {
    const r = await freezeMorningProposal(admin, target, date);
    if (!r) return Response.json({ ok: true, proposal: null });
    const sent = r.frozen ? await notifyCoachesIfLighten(admin, target, date, r) : 0;
    return Response.json({ ok: true, sessionId: r.sessionId, proposal: r.proposal, frozen: r.frozen, sent });
  } catch (e) {
    console.error("[reco du matin]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
