import { Capacitor } from "@capacitor/core";
import { Health, type HealthDataType, type HealthSample, type Workout } from "@capgo/capacitor-health";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HEALTH_SYNCED_EVENT, type HealthDay } from "@/lib/healthDays";
import { reapplyDeviceToRecentWellness } from "@/lib/deviceWellnessDb";

/* Synchro Apple Santé → health_daily (2026-09-30). Ne fait rien hors de l'app iOS : Santé n'existe
   pas dans un navigateur. Relit les 30 derniers jours à chaque fois plutôt que de suivre un curseur :
   la montre écrit souvent en retard (Garmin pousse vers Santé seulement quand Garmin Connect s'ouvre),
   un jour déjà synchronisé peut donc se compléter après coup. L'upsert rend la relecture sans risque. */

const TYPES: HealthDataType[] = ["restingHeartRate", "heartRateVariability", "sleep"];
const SYNC_DAYS = 30;
export { HEALTH_SYNCED_EVENT };

// Jour local du téléphone (pas UTC) : une nuit finie à 7h appartient au jour où l'on se réveille.
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function groupByDay(samples: HealthSample[]) {
  const m = new Map<string, HealthSample[]>();
  samples.forEach((s) => {
    const k = localDay(s.endDate);
    m.set(k, (m.get(k) ?? []).concat(s));
  });
  return m;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function aggregateHealthDays(rhr: HealthSample[], hrv: HealthSample[], sleep: HealthSample[]): HealthDay[] {
  // Les phases éveillé / au lit ne comptent pas comme du sommeil.
  const asleep = sleep.filter((s) => !s.sleepState || !["inBed", "awake"].includes(s.sleepState));
  const rhrD = groupByDay(rhr), hrvD = groupByDay(hrv), sleepD = groupByDay(asleep);
  const days = Array.from(new Set(Array.from(rhrD.keys()).concat(Array.from(hrvD.keys()), Array.from(sleepD.keys())))).sort();
  return days.map((date) => {
    const all = (rhrD.get(date) ?? []).concat(hrvD.get(date) ?? [], sleepD.get(date) ?? []);
    const r = mean((rhrD.get(date) ?? []).map((s) => s.value));
    const h = mean((hrvD.get(date) ?? []).map((s) => s.value));
    const sl = (sleepD.get(date) ?? []).reduce((a, s) => a + s.value, 0);
    return {
      date,
      resting_hr: r == null ? null : Math.round(r * 10) / 10,
      hrv_ms: h == null ? null : Math.round(h * 10) / 10,
      sleep_minutes: sleepD.has(date) ? Math.round(sl) : null,
      sources: Array.from(new Set(all.map((s) => s.sourceName).filter((x): x is string => !!x))),
    };
  });
}

export function canSyncHealth() {
  return Capacitor.isNativePlatform();
}

/* Retourne le nombre de jours écrits, ou null si rien n'a été tenté (hors app, Santé indisponible). */
export async function syncHealthData(supabase: SupabaseClient, userId: string): Promise<number | null> {
  if (!canSyncHealth()) return null;
  const av = await Health.isAvailable();
  if (!av.available) return null;
  // Sur iOS, la fenêtre d'autorisation ne s'affiche qu'une fois ; les appels suivants rendent la main direct.
  // "workouts" ajouté après coup : iOS redemande l'accès pour ce seul type à la prochaine ouverture.
  await Health.requestAuthorization({ read: [...TYPES, "workouts"] });

  /* Fenêtre : minuit local il y a SYNC_DAYS jours, moins 12 h pour capter en entier la nuit qui se
     termine ce jour-là (sinon le 1er jour n'avait qu'un morceau de nuit — 9 min vus en test réel). */
  const firstDay = new Date(); firstDay.setHours(0, 0, 0, 0); firstDay.setDate(firstDay.getDate() - SYNC_DAYS);
  const startDate = new Date(firstDay.getTime() - 12 * 3600000).toISOString();
  const endDate = new Date().toISOString();
  const [rhr, hrv, sleep] = await Promise.all(
    TYPES.map((dataType) => Health.readSamples({ dataType, startDate, endDate, limit: 5000 }).then((r) => r.samples)),
  );
  const firstDayStr = localDay(firstDay.toISOString());
  const days = aggregateHealthDays(rhr, hrv, sleep).filter(d => d.date >= firstDayStr);
  const now = new Date().toISOString();
  // Entraînements à part : un échec ici (accès refusé) ne doit pas bloquer FC / VFC / sommeil.
  await syncWorkouts(supabase, userId, firstDay.toISOString(), endDate, now).catch(e => console.error("[health-sync] workouts", e));
  if (!days.length) return 0;

  const { error } = await supabase
    .from("health_daily")
    .upsert(days.map((d) => ({ ...d, user_id: userId, updated_at: now })), { onConflict: "user_id,date" });
  if (error) throw new Error(`health_daily upsert: ${error.message}`);
  // Les check-ins déjà faits intègrent maintenant la montre (sommeil mesuré + FC au repos).
  await reapplyDeviceToRecentWellness(supabase, userId);
  return days.length;
}

/* Entraînements de la montre → health_workouts, pour pré-remplir la durée dans "Terminer la séance".
   Même relecture de 30 jours que le reste : upsert sur l'UUID HealthKit. */
async function syncWorkouts(supabase: SupabaseClient, userId: string, startDate: string, endDate: string, now: string) {
  const { workouts } = await Health.queryWorkouts({ startDate, endDate, limit: 500, ascending: true });
  const rows = workouts
    .filter((w: Workout) => !!w.platformId)
    .map((w: Workout) => ({
      user_id: userId,
      platform_id: w.platformId!,
      date: localDay(w.startDate),
      start_at: w.startDate,
      end_at: w.endDate,
      duration_min: Math.round(w.duration / 60),
      workout_type: w.workoutType,
      energy_kcal: w.totalEnergyBurned == null ? null : Math.round(w.totalEnergyBurned),
      source: w.sourceName ?? null,
      updated_at: now,
    }));
  if (!rows.length) return;
  const { error } = await supabase.from("health_workouts").upsert(rows, { onConflict: "user_id,platform_id" });
  if (error) throw new Error(`health_workouts upsert: ${error.message}`);
}
