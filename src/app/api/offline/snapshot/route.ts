import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFFLINE_SNAPSHOT_VERSION, type OfflineSessionItem, type OfflineSnapshot } from "@/lib/offlineTypes";

/* Instantané hors ligne (2026-10-02) : séances d'aujourd'hui et des 6 jours suivants, enregistrées
   sur l'appareil à chaque ouverture avec réseau (voir offlineStore.ts).
   - Sportif : ses propres séances (table sessions) + check-in du jour fait ou non.
   - Coach : les séances de tous ses sportifs (vrais comptes → sessions ; sans compte → coach_sessions),
     lues via le client admin après vérification que chaque sportif est bien le sien (même règle que
     /coach/planning).
   ?today=yyyy-mm-dd : la date locale de l'appareil (le serveur est en UTC). */

const DAYS = 7;

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const param = new URL(req.url).searchParams.get("today");
  const today = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : format(new Date(), "yyyy-MM-dd");
  const dates = Array.from({ length: DAYS }, (_, i) => format(addDays(new Date(`${today}T12:00:00`), i), "yyyy-MM-dd"));
  const until = dates[dates.length - 1];

  const { data: profile } = await supabase.from("profiles").select("name, mode").eq("user_id", user.id).maybeSingle();
  const role: "athlete" | "coach" = profile?.mode === "coach" ? "coach" : "athlete";
  const items: (OfflineSessionItem & { date: string })[] = [];
  let checkinDone = false;

  const pick = (s: { id: string; date: string; name: string; notes: string | null; target_difficulty: number | null; done: boolean; rpe: number | null; duration: number | null }) =>
    ({ id: s.id, date: s.date, name: s.name, notes: s.notes, target_difficulty: s.target_difficulty, done: !!s.done, rpe: s.rpe, duration: s.duration });

  if (role === "athlete") {
    const [sessionsRes, wellnessRes] = await Promise.all([
      supabase.from("sessions").select("id, date, name, notes, target_difficulty, done, rpe, duration")
        .eq("user_id", user.id).gte("date", today).lte("date", until).order("date"),
      supabase.from("wellness_daily").select("bedtime").eq("user_id", user.id).eq("date", today).maybeSingle(),
    ]);
    if (sessionsRes.error) return NextResponse.json({ error: sessionsRes.error.message }, { status: 500 });
    (sessionsRes.data ?? []).forEach(s => items.push({ ...pick(s), table: "sessions" }));
    checkinDone = !!wellnessRes.data?.bedtime;
  } else {
    const { data: roster, error } = await supabase.from("coach_athletes").select("id, name, user_id").eq("coach_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const admin = createAdminClient();
    const real = (roster ?? []).filter(a => a.user_id);
    const nameByUser = new Map(real.map(a => [a.user_id as string, a]));
    const allIds = (roster ?? []).map(a => a.id);
    const nameById = new Map((roster ?? []).map(a => [a.id, a.name as string]));
    const [realRes, coachRes] = await Promise.all([
      real.length
        ? admin.from("sessions").select("id, user_id, date, name, notes, target_difficulty, done, rpe, duration")
            .in("user_id", real.map(a => a.user_id as string)).gte("date", today).lte("date", until)
        : Promise.resolve({ data: [], error: null }),
      allIds.length
        ? admin.from("coach_sessions").select("id, athlete_id, date, name, notes, target_difficulty, done, rpe, duration")
            .eq("coach_id", user.id).in("athlete_id", allIds).gte("date", today).lte("date", until)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (realRes.error || coachRes.error) return NextResponse.json({ error: (realRes.error ?? coachRes.error)!.message }, { status: 500 });
    (realRes.data ?? []).forEach((s: { user_id: string } & Parameters<typeof pick>[0]) => {
      const a = nameByUser.get(s.user_id);
      if (a) items.push({ ...pick(s), table: "sessions", athleteId: a.id, athleteName: a.name });
    });
    (coachRes.data ?? []).forEach((s: { athlete_id: string } & Parameters<typeof pick>[0]) => {
      items.push({ ...pick(s), table: "coach_sessions", athleteId: s.athlete_id, athleteName: nameById.get(s.athlete_id) ?? "Sportif" });
    });
  }

  const snapshot: OfflineSnapshot = {
    v: OFFLINE_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    role,
    name: profile?.name ?? null,
    today,
    checkinDone,
    days: dates.map(date => ({
      date,
      items: items.filter(i => i.date === date)
        .sort((a, b) => (a.athleteName ?? "").localeCompare(b.athleteName ?? ""))
        .map(({ date: _d, ...rest }) => rest),
    })),
  };
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
