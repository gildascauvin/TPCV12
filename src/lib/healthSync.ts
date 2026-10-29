import { Capacitor } from "@capacitor/core";
import { Health, type HealthDataType, type HealthSample, type Workout } from "@capgo/capacitor-health";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HEALTH_SYNCED_EVENT, type HealthDay } from "@/lib/healthDays";
import { reapplyDeviceToRecentWellness } from "@/lib/deviceWellnessDb";
import { canReadHeart } from "@/lib/heartAccess";

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
  // FC des séances : seulement si ce build l'annonce dans son texte d'autorisation (heartAccess.ts).
  await Health.requestAuthorization({ read: [...TYPES, "workouts", ...(canReadHeart() ? ["heartRate" as const] : [])] });

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
  await syncWorkouts(supabase, userId, firstDay.toISOString(), endDate, now, medianValue(rhr.map((x) => x.value))).catch(e => console.error("[health-sync] workouts", e));
  if (!days.length) return 0;

  /* Une valeur vide côté Santé n'efface pas celle déjà en base (2026-10-23) : la VFC Garmin arrive par
     une autre source (scripts/garmin-personal-sync.mts, plus tard l'API Garmin), Santé ne l'a jamais.
     Les colonnes vides sont retirées de la ligne, et l'upsert ne met à jour que les colonnes envoyées :
     un upsert par combinaison de colonnes remplies. */
  const groups = new Map<string, Record<string, unknown>[]>();
  days.forEach((d) => {
    const row = Object.fromEntries(Object.entries({ ...d, user_id: userId, updated_at: now }).filter(([, v]) => v != null));
    const k = Object.keys(row).sort().join(",");
    groups.set(k, (groups.get(k) ?? []).concat(row));
  });
  for (const rows of Array.from(groups.values())) {
    const { error } = await supabase.from("health_daily").upsert(rows, { onConflict: "user_id,date" });
    if (error) throw new Error(`health_daily upsert: ${error.message}`);
  }
  // Les points forme déjà faits intègrent maintenant la montre (sommeil mesuré + FC au repos).
  await reapplyDeviceToRecentWellness(supabase, userId);
  return days.length;
}

/* Entraînements de la montre → health_workouts, pour pré-remplir la durée dans "Terminer la séance"
   et comparer le ressenti au cœur (2026-10-11). Même relecture de 30 jours que le reste : upsert sur
   l'UUID HealthKit. Garmin réécrit la même séance avec un nouvel UUID : une seule par début. */
async function syncWorkouts(supabase: SupabaseClient, userId: string, startDate: string, endDate: string, now: string, restHr: number | null) {
  const { workouts } = await Health.queryWorkouts({ startDate, endDate, limit: 500, ascending: true });
  const byStart = new Map<string, Workout>();
  workouts.filter((w: Workout) => !!w.platformId).forEach((w: Workout) => byStart.set(w.startDate, w));
  const unique = Array.from(byStart.values());
  // FC pendant chaque séance ; accès refusé ou séance sans FC = colonnes vides.
  const heart = canReadHeart();
  const hr = await Promise.all(unique.map((w) => heart && w.duration >= 600
    ? Health.readSamples({ dataType: "heartRate", startDate: w.startDate, endDate: w.endDate, limit: 10000 })
        .then((r) => r.samples).catch(() => [] as HealthSample[])
    : Promise.resolve([] as HealthSample[])));
  // FC max = la plus haute vue sur la fenêtre, jamais sous 180 : seule la comparaison d'une séance
  // à l'autre compte, pas la valeur absolue du TRIMP.
  const hrMax = Math.max(180, ...hr.flat().map((x) => x.value).filter(Number.isFinite));
  const rows = unique.map((w, i) => {
    const stats = workoutHeartStats(hr[i], w.startDate, w.endDate, restHr ?? 60, hrMax);
    return {
      user_id: userId,
      platform_id: w.platformId!,
      date: localDay(w.startDate),
      start_at: w.startDate,
      end_at: w.endDate,
      duration_min: Math.round(w.duration / 60),
      workout_type: w.workoutType,
      energy_kcal: w.totalEnergyBurned == null ? null : Math.round(w.totalEnergyBurned),
      source: w.sourceName ?? null,
      avg_hr: stats?.avg ?? null,
      max_hr: stats?.max ?? null,
      trimp: stats?.trimp ?? null,
      updated_at: now,
    };
  });
  if (!rows.length) return;
  // Une ligne par début de séance (migration 035) : la séance réécrite par Garmin sous un nouvel UUID
  // met à jour la ligne existante au lieu de s'empiler.
  const { error } = await supabase.from("health_workouts").upsert(rows, { onConflict: "user_id,start_at" });
  if (error) throw new Error(`health_workouts upsert: ${error.message}`);
}

function medianValue(xs: number[]): number | null {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

/* TRIMP de Banister (2026-10-11) : somme, sur la séance, de durée (min) × FC de réserve
   × 0,64·e^(1,92·FC de réserve). Chaque échantillon pèse le temps jusqu'au suivant, plafonné à 2 min
   (un trou de mesure ne compte pas comme de l'effort). Moins de 5 échantillons ou de 5 min mesurées :
   pas de calcul. */
function workoutHeartStats(samples: HealthSample[], start: string, end: string, rest: number, max: number) {
  const pts = samples
    .map((s) => ({ t: new Date(s.startDate).getTime(), v: s.value }))
    .filter((p) => Number.isFinite(p.v) && p.v > 30)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 5 || max <= rest) return null;
  const t0 = new Date(start).getTime(), t1 = new Date(end).getTime();
  let trimp = 0, wsum = 0, vsum = 0;
  pts.forEach((p, i) => {
    const next = i < pts.length - 1 ? pts[i + 1].t : t1;
    const dtMin = Math.min(2, Math.max(0, (Math.min(next, t1) - Math.max(p.t, t0)) / 60000));
    const r = Math.min(1, Math.max(0, (p.v - rest) / (max - rest)));
    trimp += dtMin * r * 0.64 * Math.exp(1.92 * r);
    wsum += dtMin;
    vsum += dtMin * p.v;
  });
  if (wsum < 5) return null;
  return { avg: Math.round(vsum / wsum), max: Math.round(Math.max(...pts.map((p) => p.v))), trimp: Math.round(trimp * 10) / 10 };
}
