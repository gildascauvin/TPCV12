import { createAdminClient } from "@/lib/supabase/admin";
import { runLifecycleEmails } from "@/lib/email/lifecycle";
import { sendOnce } from "@/lib/pushSend";
import { qualitativeDifficulty } from "@/lib/autoregulation";

/* Passage horaire des notifications (2026-10-14), déclenché par pg_cron (Supabase, gratuit) au lieu
   des 2 crons quotidiens Vercel. Chaque notif part à l'heure LOCALE de l'utilisateur
   (profiles.push_hour / push_tz) et une seule fois par jour (push_log, sendOnce) : relancer ce
   passage ne renvoie jamais rien. Au plus 2 notifs programmées par jour et par personne (matin, soir).

   Sportif : matin = check-in (1re séance ajustée à J1) ; 20 h = séance du jour pas encore notée.
   Coach : matin = résumé (séances trop dures hier, sportifs inactifs, programmes qui finissent) ;
   20 h = relance d'un coach gratuit qui n'a encore aucun vrai sportif (3 max). */

type Admin = ReturnType<typeof createAdminClient>;
type Profile = {
  user_id: string; name: string | null; mode: string | null; subscription_status: string | null;
  push_hour: number | null; push_tz: string | null; last_winback_push_at: string | null; winback_push_count: number | null;
};

const EVENING_HOUR = 20;

function localParts(tz: string) {
  const fmt = (o: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...o }).format(new Date()); }
    catch { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", ...o }).format(new Date()); }
  };
  const date = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
  const hour = Number(fmt({ hour: "2-digit", hourCycle: "h23" }));
  return { date, hour };
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

async function athleteMorning(admin: Admin, p: Profile, today: string) {
  const { data: todayWell } = await admin.from("wellness_daily").select("id").eq("user_id", p.user_id).eq("date", today).maybeSingle();
  if (todayWell) return false;
  const [{ data: first }, { data: sessions }] = await Promise.all([
    admin.from("wellness_daily").select("date").eq("user_id", p.user_id).not("bedtime", "is", null).order("date", { ascending: true }).limit(1).maybeSingle(),
    admin.from("sessions").select("name, target_difficulty, done").eq("user_id", p.user_id).eq("date", today),
  ]);
  // La séance la plus dure du jour donne son nom à la notif (POC onboarding v4).
  const planned = (sessions ?? []).filter((s) => !s.done).sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0));
  const main = planned[0];
  let title = "Comment tu te sens ce matin ?";
  let body = "10 secondes de check-in et ThePerfClub t'aide à ajuster ta séance.";
  if (first?.date === shiftDate(today, -1) && main) {
    title = "Ta 1re séance ajustée t'attend";
    body = "Fais ton check-in : ta séance s'adapte à ta forme du jour.";
  } else if (main) {
    // « Aujourd'hui : {nom} » : pas d'accord à faire, le nom d'une séance est souvent masculin.
    title = `Aujourd'hui : ${main.name || `séance ${main.target_difficulty ? qualitativeDifficulty(main.target_difficulty) : "prévue"}`}`;
    body = "10 secondes pour l'ajuster à ta forme.";
  }
  return sendOnce(admin, p.user_id, "morning", today, { title, body, url: "/today?checkin=1", tag: "morning" });
}

async function athleteEvening(admin: Admin, p: Profile, today: string) {
  const { data: sessions } = await admin.from("sessions").select("id, done, autoreg_proposal").eq("user_id", p.user_id).eq("date", today);
  if (!sessions?.length || sessions.every((s) => s.done)) return false;
  /* Jour de conseil (2026-10-24) : la notif annonce le verdict, qui n'existe que si la séance est
     notée. Registre impersonnel, comme l'écran post-séance. */
  const dir = sessions.map(s => s.autoreg_proposal as { proposed?: string | null; date?: string } | null).find(x => x?.date === today && (x.proposed === "low" || x.proposed === "high"))?.proposed;
  return sendOnce(admin, p.user_id, "evening", today, {
    title: dir ? `${dir === "low" ? "Alléger" : "Pousser"}, conseillé ce matin` : "Ta séance du jour, c'est fait ?",
    body: dir ? "Note ta séance en 10 secondes pour vérifier le conseil." : "Note-la en 10 secondes pour ajuster la suite.",
    url: "/today",
    tag: "evening",
  });
}

async function coachMorning(admin: Admin, p: Profile, today: string) {
  const { data: athletes } = await admin.from("coach_athletes").select("id, name, user_id").eq("coach_id", p.user_id).not("user_id", "is", null);
  const real = (athletes ?? []).filter((a) => a.user_id) as { id: string; name: string; user_id: string }[];
  if (!real.length) return false;
  const ids = real.map((a) => a.user_id);
  const yesterday = shiftDate(today, -1);
  const since = shiftDate(today, -3);
  const [{ data: yest }, { data: recentSess }, { data: recentWell }, { data: assigns }] = await Promise.all([
    admin.from("sessions").select("user_id, rpe, target_difficulty").in("user_id", ids).eq("date", yesterday).eq("done", true),
    admin.from("sessions").select("user_id").in("user_id", ids).gte("date", since).eq("done", true),
    admin.from("wellness_daily").select("user_id").in("user_id", ids).gte("date", since),
    admin.from("program_assignments").select("user_id, athlete_id, start_date, programs(weeks_count)").eq("coach_id", p.user_id).eq("status", "active"),
  ]);
  const reasons = new Map<string, string>();
  (yest ?? []).forEach((s) => {
    if (s.rpe != null && s.target_difficulty != null && s.rpe >= s.target_difficulty + 2) reasons.set(s.user_id, "séance bien plus dure que prévu");
  });
  const active = new Set([...(recentSess ?? []).map((s) => s.user_id), ...(recentWell ?? []).map((w) => w.user_id)]);
  ids.forEach((id) => { if (!active.has(id) && !reasons.has(id)) reasons.set(id, "rien noté depuis 3 jours"); });
  (assigns ?? []).forEach((a) => {
    const prog = Array.isArray(a.programs) ? a.programs[0] : a.programs;
    const weeks = (prog as { weeks_count?: number } | null)?.weeks_count;
    const who = a.user_id ?? real.find((r) => r.id === a.athlete_id)?.user_id;
    if (!who || !weeks || reasons.has(who)) return;
    const end = shiftDate(a.start_date, weeks * 7);
    if (end >= today && end <= shiftDate(today, 7)) reasons.set(who, "programme qui se termine cette semaine");
  });
  if (!reasons.size) return false;
  const names = Array.from(reasons.entries()).map(([id, why]) => `${firstName(real.find((r) => r.user_id === id)?.name) || "Un sportif"} : ${why}`);
  const n = reasons.size;
  return sendOnce(admin, p.user_id, "coach_digest", today, {
    title: n === 1 ? "1 sportif à regarder ce matin" : `${n} sportifs à regarder ce matin`,
    body: names.slice(0, 3).join(" · ") + (n > 3 ? ` · +${n - 3}` : ""),
    url: "/coach",
    tag: "coach-digest",
  });
}

async function coachWinback(admin: Admin, p: Profile, today: string) {
  if (p.subscription_status !== "free") return false;
  if ((p.winback_push_count ?? 0) >= 3) return false;
  if (p.last_winback_push_at && Date.now() - new Date(p.last_winback_push_at).getTime() < 18 * 3600_000) return false;
  const { count } = await admin.from("coach_athletes").select("id", { count: "exact", head: true }).eq("coach_id", p.user_id).or("user_id.not.is.null,invite_email.not.is.null");
  if ((count ?? 0) > 0) return false;
  const ok = await sendOnce(admin, p.user_id, "winback", today, {
    title: "Tes sportifs t'attendent",
    body: "Invite-les en 1 clic : leur forme arrive dans ton Coach Control.",
    url: "/coach",
    tag: "winback",
  });
  if (ok) {
    await admin.from("profiles").update({ last_winback_push_at: new Date().toISOString(), winback_push_count: (p.winback_push_count ?? 0) + 1 }).eq("user_id", p.user_id);
  }
  return ok;
}

async function runHourly(admin: Admin) {
  const { data: subs, error } = await admin.from("push_subscriptions").select("user_id");
  if (error) throw error;
  const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
  const sent = { morning: 0, evening: 0, coach_digest: 0, winback: 0 };
  if (!userIds.length) return sent;
  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("user_id, name, mode, subscription_status, push_hour, push_tz, last_winback_push_at, winback_push_count")
    .in("user_id", userIds);
  if (pErr) throw pErr;
  for (const p of (profiles ?? []) as Profile[]) {
    const { date, hour } = localParts(p.push_tz || "Europe/Paris");
    const morningHour = p.push_hour ?? 8;
    try {
      if (p.mode === "coach") {
        if (hour === morningHour && await coachMorning(admin, p, date)) sent.coach_digest++;
        if (hour === EVENING_HOUR && await coachWinback(admin, p, date)) sent.winback++;
      } else {
        if (hour === morningHour && await athleteMorning(admin, p, date)) sent.morning++;
        if (hour === EVENING_HOUR && await athleteEvening(admin, p, date)) sent.evening++;
      }
    } catch (e) {
      console.error("[push/send]", p.user_id, e);
    }
  }
  return sent;
}

async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  const secrets = [process.env.CRON_SECRET, process.env.PUSH_CRON_SECRET].filter(Boolean);
  if (!secrets.some((s) => auth === `Bearer ${s}`)) return Response.json({ error: "Non autorisé" }, { status: 401 });

  const admin = createAdminClient();
  const sent = await runHourly(admin);
  // Emails déclenchés par l'activité : une fois par jour, au passage de 9 h (Paris).
  const parisHour = localParts("Europe/Paris").hour;
  const lifecycleSent = parisHour === 9
    ? await runLifecycleEmails(admin).catch((err) => { console.error("[lifecycle]", err); return null; })
    : null;
  return Response.json({ ok: true, sent, lifecycleSent });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
