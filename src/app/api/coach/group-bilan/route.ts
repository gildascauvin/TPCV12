import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BILAN_SESSION_COLS } from "@/lib/bilanCols";

/* Supabase plafonne une lecture à 1000 lignes : un groupe les dépasse vite (séances, check-ins). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}

/* Données du bilan du groupe (2026-10-26) : tous les sportifs inscrits du coach, mêmes lectures que
   /api/coach/bilan (client admin après lecture des liens par le coach lui-même, RLS). Toutes les
   séances, faites ou non : « qui décroche » compte les jours de séance sans check-in. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const today = new URL(req.url).searchParams.get("today");
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return Response.json({ error: "today requis" }, { status: 400 });

  const { data: links, error: linkErr } = await supabase.from("coach_athletes").select("id, name, user_id").eq("coach_id", user.id);
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  // Un même sportif lié deux fois (ancienne invitation + lien) ne compte qu'une fois.
  const real = (links ?? []).filter((l): l is { id: string; name: string; user_id: string } => !!l.user_id)
    .filter((l, i, all) => all.findIndex(x => x.user_id === l.user_id) === i);
  if (!real.length) return Response.json({ athletes: [] });
  const ids = Array.from(new Set(real.map(l => l.user_id)));

  const admin = createAdminClient();
  const [p, s, w] = await Promise.all([
    admin.from("profiles").select("user_id, created_at, autoreg_shift, autoreg_shift_high, autoreg_recal_events").in("user_id", ids),
    readAll<Record<string, unknown> & { user_id: string }>((a, b) => admin.from("sessions").select(`user_id,${BILAN_SESSION_COLS}`).in("user_id", ids).lte("date", today).order("id").range(a, b) as never),
    readAll<Record<string, unknown> & { user_id: string }>((a, b) => admin.from("wellness_daily").select("user_id,date,sleep,stress,recovery,motivation,score,base_score,behaviors,bedtime,device_sleep_minutes,device_hrv_ms,device_resting_hr,device_rhr_baseline,device_hrv_baseline,created_at").in("user_id", ids).lte("date", today).order("id").range(a, b) as never),
  ]);
  const err = p.error || s.error || w.error;
  if (err) return Response.json({ error: err.message }, { status: 500 });

  const athletes = real.map(l => {
    const prof = (p.data ?? []).find(x => x.user_id === l.user_id);
    return {
      id: l.id, name: l.name,
      profile: prof ? { created_at: prof.created_at, autoreg_shift: prof.autoreg_shift, autoreg_shift_high: prof.autoreg_shift_high, autoreg_recal_events: prof.autoreg_recal_events } : null,
      sessions: (s.data ?? []).filter(x => x.user_id === l.user_id),
      checkins: (w.data ?? []).filter(x => x.user_id === l.user_id),
    };
  });
  return Response.json({ athletes });
}
