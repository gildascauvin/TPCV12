import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWellnessScore } from "@/lib/wellness";
import { deviceInputsFor, type DeviceInputs } from "@/lib/deviceWellness";

/* Écritures des données montre dans wellness_daily (2026-09-30). Les curseurs subjectifs ne sont jamais
   modifiés : base_score/score sont toujours recalculés à partir d'eux + les colonnes device_*. Sans ligne
   health_daily pour le jour, rien ne change (score 100 % subjectif). Aucun import Capacitor : utilisable
   depuis le web comme depuis l'app iOS. */

const LOOKBACK_DAYS = 70; // 28 j de norme FC + marge pour recalculer ~40 j de wellness

const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function fetchHealth(supabase: SupabaseClient, userId: string, until: string) {
  const since = new Date(`${until}T12:00:00`);
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from("health_daily")
    .select("date, resting_hr, sleep_minutes, hrv_ms")
    .eq("user_id", userId)
    .gte("date", dayStr(since))
    .lte("date", until);
  if (error) { console.error("[health_daily] lecture:", error.message); return []; }
  return (data ?? []).map(d => ({ ...d, resting_hr: d.resting_hr == null ? null : Number(d.resting_hr), hrv_ms: d.hrv_ms == null ? null : Number(d.hrv_ms) }));
}

const hasDevice = (d: DeviceInputs) => d.device_sleep_minutes != null || d.device_resting_hr != null || d.device_hrv_ms != null;

type WellnessInput = { sleep: number; stress: number; recovery: number; motivation: number; behaviors: string[] };

/* Au moment d'enregistrer un check-in : complète le payload avec les données montre du jour et recalcule
   le score. Renvoie le payload tel quel s'il n'y a pas de montre. */
export async function withDeviceScore<T extends WellnessInput & { base_score: number; score: number }>(
  supabase: SupabaseClient, userId: string, date: string, data: T,
): Promise<T & DeviceInputs> {
  const device = deviceInputsFor(date, await fetchHealth(supabase, userId, date));
  if (!hasDevice(device)) return { ...data, device_sleep_minutes: null, device_resting_hr: null, device_rhr_baseline: null, device_hrv_ms: null, device_hrv_baseline: null };
  const { base_score, score } = computeWellnessScore(data.sleep, data.stress, data.recovery, data.motivation, data.behaviors, device);
  return { ...data, ...device, base_score, score };
}

/* Après une synchro Santé : la montre écrit souvent en retard, donc les check-ins déjà enregistrés des
   derniers jours peuvent gagner (ou voir changer) leurs données montre. Recalcule et réécrit ceux qui
   ont bougé. Renvoie le nombre de jours mis à jour. */
export async function reapplyDeviceToRecentWellness(supabase: SupabaseClient, userId: string, days = 35): Promise<number> {
  const today = dayStr(new Date());
  const since = new Date(); since.setDate(since.getDate() - days);
  const [health, wellnessRes] = await Promise.all([
    fetchHealth(supabase, userId, today),
    supabase.from("wellness_daily")
      .select("date, sleep, stress, recovery, motivation, behaviors, base_score, score, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline")
      .eq("user_id", userId).gte("date", dayStr(since)).lte("date", today),
  ]);
  if (wellnessRes.error) { console.error("[wellness_daily] lecture:", wellnessRes.error.message); return 0; }
  if (!health.length) return 0;

  let updated = 0;
  for (const w of wellnessRes.data ?? []) {
    const device = deviceInputsFor(w.date, health);
    const same = (a: unknown, b: unknown) => (a == null ? null : Number(a)) === (b == null ? null : Number(b));
    const keys = ["device_sleep_minutes", "device_resting_hr", "device_rhr_baseline", "device_hrv_ms", "device_hrv_baseline"] as const;
    if (keys.every(k => same(w[k], device[k]))) continue;
    const { base_score, score } = computeWellnessScore(w.sleep, w.stress, w.recovery, w.motivation, w.behaviors ?? [], device);
    const { error } = await supabase.from("wellness_daily")
      .update({ ...device, base_score, score })
      .eq("user_id", userId).eq("date", w.date);
    if (error) console.error("[wellness_daily] mise à jour montre:", w.date, error.message);
    else updated++;
  }
  return updated;
}

/* Données montre d'un jour (avec leurs normes), sans check-in — pour la carte "Plan à confirmer". */
export async function fetchDeviceInputs(supabase: SupabaseClient, userId: string, date: string): Promise<DeviceInputs> {
  return deviceInputsFor(date, await fetchHealth(supabase, userId, date));
}
