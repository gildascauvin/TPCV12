import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freezeMorningProposal, notifyCoachesIfLighten } from "@/lib/autoregProposalServer";

/* Fige la reco du matin de la séance du jour (migration 042) et prévient le coach si elle dit
   d'alléger. Appelé juste après le check-in (WellnessModal, partout) et par /today en secours. Le
   calcul est fait ICI, jamais pris du client : une seule source pour la carte du sportif, celle du
   coach et la notification. Une seule fois par séance et par jour : un check-in corrigé ensuite ne
   réécrit pas la reco que le sportif a vue. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { date } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Date invalide" }, { status: 400 });

  const admin = createAdminClient();
  try {
    const r = await freezeMorningProposal(admin, user.id, date);
    if (!r) return Response.json({ ok: true, proposal: null });
    const sent = r.frozen ? await notifyCoachesIfLighten(admin, user.id, date, r) : 0;
    return Response.json({ ok: true, sessionId: r.sessionId, proposal: r.proposal, frozen: r.frozen, sent });
  } catch (e) {
    console.error("[reco du matin]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
