/* Prototype Garmin Personal API → health_daily (2026-10-23), sur le compte de Gildas uniquement.
   La Personal API est prévue pour un usage perso (« not intended for commercial applications serving
   multiple end users ») : ce script sert à tester sur de vraies données ce que la VFC Garmin change,
   en attendant l'accès Garmin Connect Developer Program (Health API) pour tous les sportifs.

   Garmin n'écrit pas la VFC dans Apple Santé : la synchro iOS remplit déjà FC repos + sommeil, pas
   hrv_ms. Ici : hrv_ms = VFC moyenne de la nuit (RMSSD, `lastNightAvg`) toujours ; FC repos et sommeil
   seulement là où la ligne est vide (jours d'avant l'app iOS). Puis recalcule les check-ins déjà faits
   pour qu'ils intègrent la VFC (même chemin qu'après une synchro Santé).

   Usage : PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx -y tsx --env-file=.env.local scripts/garmin-personal-sync.mts [--days=90] [--apply]
   Sans --apply : affiche ce qui serait écrit, n'écrit rien. */
import { createClient } from "@supabase/supabase-js";
import { reapplyDeviceToRecentWellness } from "../src/lib/deviceWellnessDb";

const USER_ID = "286499a5-bccf-4965-99fa-abecf4a85b6b"; // Gildas — jamais un autre compte avec sa clé perso
const API = "https://personal.connectapi.garmin.com";
const DAYS = Number(process.argv.find(a => a.startsWith("--days="))?.slice(7) ?? 90);
const APPLY = process.argv.includes("--apply");
const SOURCE = "Garmin API";

const key = process.env.GARMIN_PERSONAL_API_KEY;
if (!key) throw new Error("GARMIN_PERSONAL_API_KEY manquante (.env.local)");

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const end = new Date(), start = new Date(); start.setDate(start.getDate() - DAYS);
const from = dayStr(start), to = dayStr(end);

// La clé s'échange contre un jeton de 24 h (pas de refresh : on en redemande un à chaque lancement).
const tokenRes = await fetch(`${API}/personalapitoken-service/personal-api/personal-api-key/token`, {
  method: "POST", headers: { Authorization: `ApiKey ${key}` },
});
if (!tokenRes.ok) throw new Error(`jeton Garmin : HTTP ${tokenRes.status}`);
const token = (await tokenRes.text()).trim();

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path} : HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

type Hrv = { calendarDate: string; lastNightAvg: number | null };
type Sleep = { calendarDate: string; sleepTimeSeconds: number | null };

// Le sommeil refuse une plage de plus de ~31 jours (HTTP 400) : découpage par tranches de 30 jours.
async function sleepChunks(): Promise<Sleep[]> {
  const out: Sleep[] = [];
  for (let s = new Date(start); s <= end; s.setDate(s.getDate() + 30)) {
    const e = new Date(s); e.setDate(e.getDate() + 29);
    out.push(...await get<Sleep[]>(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${dayStr(s)}&endDate=${dayStr(e > end ? end : e)}`));
  }
  return out;
}
type Summary = { calendarDate: string; heartRate?: { restingValue?: number | null } };
const [hrv, sleep, summaries] = await Promise.all([
  get<{ hrvSummaries: Hrv[] }>(`/hrv-service/hrv/daily/${from}/${to}`).then(r => r.hrvSummaries ?? []),
  sleepChunks(),
  get<{ data: Summary[] }>(`/usersummary-service/v2/dailysummaries?startDate=${from}&endDate=${to}`).then(r => r.data ?? []),
]);

type Garmin = { hrv: number | null; rhr: number | null; sleep: number | null };
const garmin = new Map<string, Garmin>();
const at = (date: string) => garmin.get(date) ?? garmin.set(date, { hrv: null, rhr: null, sleep: null }).get(date)!;
hrv.forEach(h => { if (h.lastNightAvg) at(h.calendarDate).hrv = h.lastNightAvg; });
sleep.forEach(s => { if (s.sleepTimeSeconds) at(s.calendarDate).sleep = Math.round(s.sleepTimeSeconds / 60); });
summaries.forEach(s => { if (s.heartRate?.restingValue) at(s.calendarDate).rhr = s.heartRate.restingValue; });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: existing, error: readError } = await supabase.from("health_daily")
  .select("date, resting_hr, hrv_ms, sleep_minutes, sources").eq("user_id", USER_ID).gte("date", from).lte("date", to);
if (readError) throw new Error(`lecture health_daily : ${readError.message}`);
const byDate = new Map((existing ?? []).map(r => [r.date as string, r]));

const now = new Date().toISOString();
const rows = Array.from(garmin.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, g]) => {
  const e = byDate.get(date);
  return {
    user_id: USER_ID,
    date,
    hrv_ms: g.hrv ?? (e?.hrv_ms == null ? null : Number(e.hrv_ms)),
    resting_hr: e?.resting_hr != null ? Number(e.resting_hr) : g.rhr,
    sleep_minutes: e?.sleep_minutes ?? g.sleep,
    sources: Array.from(new Set([...((e?.sources as string[] | undefined) ?? []), SOURCE])),
    updated_at: now,
  };
});

console.log(`Garmin ${from} → ${to} : ${hrv.length} nuits VFC, ${sleep.length} nuits, ${summaries.length} jours`);
console.table(rows.slice(-14).map(r => ({ date: r.date, vfc: r.hrv_ms, fc_repos: r.resting_hr, sommeil: r.sleep_minutes, deja_en_base: byDate.has(r.date) })));
console.log(`${rows.length} lignes, dont ${rows.filter(r => !byDate.has(r.date)).length} nouvelles, ${rows.filter(r => r.hrv_ms != null).length} avec VFC`);

if (!APPLY) {
  console.log("Simulation : relancer avec --apply pour écrire.");
} else {
  const { error } = await supabase.from("health_daily").upsert(rows, { onConflict: "user_id,date" });
  if (error) throw new Error(`upsert health_daily : ${error.message}`);
  const updated = await reapplyDeviceToRecentWellness(supabase, USER_ID, DAYS);
  console.log(`Écrit : ${rows.length} jours health_daily, ${updated} check-ins recalculés avec la VFC.`);
}
