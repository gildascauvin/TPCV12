import { createClient } from "@/lib/supabase/server";
import { athleteOnboardingSteps } from "@/lib/athleteOnboardingSteps";
import { computeStreak, trainingRewards, REWARD_META, type Reward, type RewardKey, type StreakDayInput } from "@/lib/streak";

export const dynamic = "force-dynamic";

/* Série du jour du sportif (P1, 24/11/2026) : journées validées depuis l'inscription, record, semaine,
   récompenses (étapes d'onboarding puis entraînement). Tout est dérivé des données : points forme
   (wellness_daily avec bedtime, comme la checklist) et séances (faites, reco d'alléger figée au point forme).
   ?today=YYYY-MM-DD : jour local du sportif (le serveur est en UTC). */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("today");
  const today = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10);

  const { data: profile, error: pErr } = await supabase
    .from("profiles").select("mode, created_at, subscription_status, invited_by_coach_id").eq("user_id", user.id).maybeSingle();
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  if (!profile || profile.mode === "coach") return Response.json({ enabled: false });

  const since = (profile.created_at ?? new Date().toISOString()).slice(0, 10);
  const [wRes, sRes, steps] = await Promise.all([
    supabase.from("wellness_daily").select("date").eq("user_id", user.id).gte("date", since).lte("date", today).not("bedtime", "is", null),
    supabase.from("sessions").select("date, done, autoreg_proposal").eq("user_id", user.id).gte("date", since).lte("date", today),
    athleteOnboardingSteps(supabase, user.id, since, profile),
  ]);
  if (wRes.error) return Response.json({ error: wRes.error.message }, { status: 500 });
  if (sRes.error) return Response.json({ error: sRes.error.message }, { status: 500 });

  const byDate = new Map<string, StreakDayInput>();
  const day = (d: string) => { let x = byDate.get(d); if (!x) { x = { date: d, checkin: false, sessions: [] }; byDate.set(d, x); } return x; };
  for (const w of wRes.data ?? []) day(w.date).checkin = true;
  for (const s of sRes.data ?? []) {
    const p = s.autoreg_proposal as { proposed?: string | null; date?: string } | null;
    day(s.date).sessions.push({ done: !!s.done, lowProposal: !!p && p.proposed === "low" && (!p.date || p.date === s.date) });
  }
  const state = computeStreak(Array.from(byDate.values()), since, today);
  const tired = new Set((sRes.data ?? []).filter(s => s.done && (s.autoreg_proposal as { proposed?: string | null } | null)?.proposed === "low").map(s => s.date));

  const stepReward: Partial<Record<string, RewardKey>> = { form: "form", build: "build", adjust: "adjust", unlock: "unlock" };
  const first: Reward[] = steps.flatMap(st => { const k = stepReward[st.key]; return k ? [{ key: k, ...REWARD_META[k], earned: st.done, on: null }] : []; });
  const rewards = [...first, ...trainingRewards(state, tired)];

  return Response.json({
    enabled: true, today, current: state.current, record: state.record, saved: state.saved,
    todayState: state.today, week: state.week, rewards,
    next: nextReward(rewards),
  });
}

/* Prochaine récompense : une étape de démarrage d'abord (elle guide), sinon celle qui avance le plus
   (série, semaine parfaite), sinon la première non gagnée. */
function nextReward(rewards: Reward[]): Reward | null {
  const open = rewards.filter(r => !r.earned);
  const first = open.find(r => r.key === "form" || r.key === "build" || r.key === "adjust" || r.key === "unlock");
  if (first) return first;
  const withProgress = open.filter(r => r.progress && r.progress.total > 0).sort((a, b) => b.progress!.value / b.progress!.total - a.progress!.value / a.progress!.total);
  return withProgress[0] ?? open[0] ?? null;
}
