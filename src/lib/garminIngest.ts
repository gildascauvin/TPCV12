import type { SupabaseClient } from "@supabase/supabase-js";
import { reapplyDeviceToRecentWellness } from "@/lib/deviceWellnessDb";

/* Données poussées par Garmin (Health API 2.0 / Activity API 2.0, push JSON) → health_daily et
   health_workouts, les mêmes tables que la synchro Apple Santé : tout ce qui lit déjà la montre
   (score du check-in, carte décision, onglet Récupération, ressenti vs cœur) en profite tel quel.
   Garmin renvoie le même résumé plusieurs fois dans la journée (sommeil complété, journée mise à jour) :
   le plus récent fait foi, d'où des upserts. */

export const GARMIN_SOURCE = "Garmin";

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/* Jour local du sportif : startTimeInSeconds (UTC) + startTimeOffsetInSeconds (heure affichée sur la
   montre). Les résumés quotidiens portent directement calendarDate, prioritaire. */
function localDate(r: Row): string | null {
  const cal = str(r.calendarDate);
  if (cal) return cal;
  const start = num(r.startTimeInSeconds);
  if (start == null) return null;
  return new Date((start + (num(r.startTimeOffsetInSeconds) ?? 0)) * 1000).toISOString().slice(0, 10);
}

type DayPatch = {
  hrv_ms?: number; resting_hr?: number; sleep_minutes?: number;
  stress_avg?: number; stress_max?: number; body_battery_charged?: number; body_battery_drained?: number;
};

/* Une ligne health_daily par jour : seules les colonnes reçues sont envoyées (une valeur absente ne
   remplace jamais ce qui est déjà en base), et "Garmin" s'ajoute aux sources existantes. */
async function upsertDays(admin: SupabaseClient, userId: string, patches: Map<string, DayPatch>) {
  if (!patches.size) return;
  const dates = Array.from(patches.keys());
  const { data: existing, error: readError } = await admin
    .from("health_daily").select("date, sources").eq("user_id", userId).in("date", dates);
  if (readError) throw new Error(`lecture health_daily: ${readError.message}`);
  const sourcesBy = new Map((existing ?? []).map((r) => [r.date as string, (r.sources as string[] | null) ?? []]));
  const now = new Date().toISOString();
  // Un upsert par combinaison de colonnes remplies (PostgREST met à jour exactement les colonnes envoyées).
  const groups = new Map<string, Row[]>();
  patches.forEach((p, date) => {
    const row: Row = { user_id: userId, date, updated_at: now, sources: Array.from(new Set([...(sourcesBy.get(date) ?? []), GARMIN_SOURCE])) };
    Object.entries(p).forEach(([k, v]) => { if (v != null) row[k] = v; });
    const key = Object.keys(row).sort().join(",");
    groups.set(key, (groups.get(key) ?? []).concat(row));
  });
  for (const rows of Array.from(groups.values())) {
    const { error } = await admin.from("health_daily").upsert(rows, { onConflict: "user_id,date" });
    if (error) throw new Error(`upsert health_daily: ${error.message}`);
  }
}

/* Types d'activité Garmin (Appendix A) → noms HealthKit déjà connus de physioCompare/healthWorkouts. */
function workoutType(garminType: string): string {
  const t = garminType.toUpperCase();
  if (/STRENGTH/.test(t)) return "traditionalStrengthTraining";
  if (/HIIT/.test(t)) return "highIntensityIntervalTraining";
  if (/TREADMILL/.test(t)) return "runningTreadmill";
  if (/TRACK_RUNNING/.test(t)) return "trackAndField";
  if (/RUN/.test(t)) return "running";
  if (/INDOOR_CYCLING|VIRTUAL_RIDE/.test(t)) return "bikingStationary";
  if (/CYCLING|BIKING|CYCLOCROSS|GRAVEL|E_BIKE|EBIKING|MTB/.test(t)) return "cycling";
  if (/OPEN_WATER/.test(t)) return "swimmingOpenWater";
  if (/LAP_SWIMMING/.test(t)) return "swimmingPool";
  if (/SWIM/.test(t)) return "swimming";
  if (/INDOOR_ROWING/.test(t)) return "rowingMachine";
  if (/ROWING/.test(t)) return "rowing";
  if (/ELLIPTICAL/.test(t)) return "elliptical";
  if (/INDOOR_CARDIO|CARDIO/.test(t)) return "mixedCardio";
  if (/HIKING|MOUNTAINEERING|RUCKING/.test(t)) return "hiking";
  if (/WALKING/.test(t)) return "walking";
  if (/YOGA/.test(t)) return "yoga";
  if (/PILATES/.test(t)) return "pilates";
  if (/CLIMBING|BOULDERING/.test(t)) return "climbing";
  if (/SKIING|SNOWBOARDING/.test(t)) return "snowSports";
  if (/MOBILITY/.test(t)) return "flexibility";
  return t.toLowerCase();
}

/* TRIMP de Banister, même formule que healthSync.ts (synchro Apple Santé) : chaque échantillon pèse le
   temps jusqu'au suivant (plafonné à 2 min), moins de 5 échantillons ou 5 min mesurées = pas de calcul. */
function trimpOf(samples: { t: number; v: number }[], endMs: number, rest: number, max: number): number | null {
  const pts = samples.filter((p) => Number.isFinite(p.v) && p.v > 30).sort((a, b) => a.t - b.t);
  if (pts.length < 5 || max <= rest) return null;
  let trimp = 0, wsum = 0;
  pts.forEach((p, i) => {
    const next = i < pts.length - 1 ? pts[i + 1].t : endMs;
    const dtMin = Math.min(2, Math.max(0, (Math.min(next, endMs) - p.t) / 60000));
    const r = Math.min(1, Math.max(0, (p.v - rest) / (max - rest)));
    trimp += dtMin * r * 0.64 * Math.exp(1.92 * r);
    wsum += dtMin;
  });
  return wsum < 5 ? null : Math.round(trimp * 10) / 10;
}

/* FC repos = médiane des 30 derniers jours (comme healthSync), FC max = la plus haute vue, jamais < 180. */
async function heartRefs(admin: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [rhr, mx] = await Promise.all([
    admin.from("health_daily").select("resting_hr").eq("user_id", userId).gte("date", since).not("resting_hr", "is", null),
    admin.from("health_workouts").select("max_hr").eq("user_id", userId).not("max_hr", "is", null).order("max_hr", { ascending: false }).limit(1),
  ]);
  const vals = (rhr.data ?? []).map((r) => Number(r.resting_hr)).filter(Number.isFinite).sort((a, b) => a - b);
  return { rest: vals.length ? vals[Math.floor(vals.length / 2)] : 60, max: Math.max(180, Number(mx.data?.[0]?.max_hr ?? 0)) };
}

type WorkoutRow = Row & { start_at: string };

async function upsertWorkouts(admin: SupabaseClient, rows: WorkoutRow[]) {
  if (!rows.length) return;
  // Une ligne par début de séance (unicité user_id,start_at, migration 035). Le résumé « activities »
  // n'a pas de TRIMP : colonnes vides retirées, un upsert par combinaison de colonnes, pour qu'il
  // n'efface jamais le TRIMP calculé depuis « activityDetails ».
  const byStart = new Map<string, WorkoutRow>();
  rows.forEach((r) => {
    const key = `${r.user_id}|${r.start_at}`;
    byStart.set(key, { ...(byStart.get(key) ?? {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) } as WorkoutRow);
  });
  const groups = new Map<string, WorkoutRow[]>();
  byStart.forEach((r) => {
    const k = Object.keys(r).sort().join(",");
    groups.set(k, (groups.get(k) ?? []).concat(r));
  });
  for (const g of Array.from(groups.values())) {
    const { error } = await admin.from("health_workouts").upsert(g, { onConflict: "user_id,start_at" });
    if (error) throw new Error(`upsert health_workouts: ${error.message}`);
  }
}

function activityRow(userId: string, a: Row): WorkoutRow | null {
  const start = num(a.startTimeInSeconds);
  const dur = num(a.durationInSeconds);
  const id = str(a.summaryId) ?? (a.activityId != null ? String(a.activityId) : null);
  if (start == null || dur == null || !id || a.isParent === true) return null;
  const date = localDate(a);
  if (!date) return null;
  const avg = num(a.averageHeartRateInBeatsPerMinute);
  const max = num(a.maxHeartRateInBeatsPerMinute);
  return {
    user_id: userId,
    platform_id: `garmin:${String(a.activityId ?? id).replace(/-detail$/, "")}`,
    date,
    start_at: new Date(start * 1000).toISOString(),
    end_at: new Date((start + dur) * 1000).toISOString(),
    duration_min: Math.max(0, Math.round(dur / 60)),
    workout_type: workoutType(str(a.activityType) ?? "OTHER"),
    energy_kcal: num(a.activeKilocalories) == null ? null : Math.round(num(a.activeKilocalories)!),
    source: GARMIN_SOURCE,
    avg_hr: avg == null ? null : Math.round(avg),
    max_hr: max == null ? null : Math.round(max),
    updated_at: new Date().toISOString(),
  };
}

/* Traite le contenu d'un push pour un sportif. `payload` = le corps entier (une ou plusieurs listes
   par type de résumé) déjà filtré sur ce sportif. Retourne le nombre d'éléments traités. */
export async function ingestGarminPush(admin: SupabaseClient, userId: string, payload: Record<string, Row[]>): Promise<number> {
  const days = new Map<string, DayPatch>();
  const patch = (date: string, p: DayPatch) => days.set(date, { ...(days.get(date) ?? {}), ...p });
  let count = 0;

  for (const h of payload.hrv ?? []) {
    const date = localDate(h), v = num(h.lastNightAvg);
    if (date && v != null) { patch(date, { hrv_ms: v }); count++; }
  }
  for (const d of payload.dailies ?? []) {
    const date = localDate(d);
    if (!date) continue;
    // Stress : 1-100, -1/-2 = pas assez de mesures (Health API 2.0, Daily Summaries) → jamais écrit.
    const stress = (v: number | null) => (v != null && v > 0 ? Math.round(v) : undefined);
    const p: DayPatch = {
      resting_hr: num(d.restingHeartRateInBeatsPerMinute) ?? undefined,
      stress_avg: stress(num(d.averageStressLevel)),
      stress_max: stress(num(d.maxStressLevel)),
      body_battery_charged: num(d.bodyBatteryChargedValue) ?? undefined,
      body_battery_drained: num(d.bodyBatteryDrainedValue) ?? undefined,
    };
    if (Object.values(p).some((v) => v != null)) { patch(date, p); count++; }
  }
  for (const s of payload.sleeps ?? []) {
    // durationInSeconds = temps de sommeil, éveils exclus (Health API 2.0, Sleep Summaries).
    const date = localDate(s), v = num(s.durationInSeconds);
    if (date && v != null && v > 0) { patch(date, { sleep_minutes: Math.round(v / 60) }); count++; }
  }

  const workouts: WorkoutRow[] = [];
  for (const a of [...(payload.activities ?? []), ...(payload.manuallyUpdatedActivities ?? [])]) {
    const row = activityRow(userId, a);
    if (row) { workouts.push(row); count++; }
  }
  const details = payload.activityDetails ?? [];
  if (details.length) {
    const refs = await heartRefs(admin, userId);
    for (const d of details) {
      const summary = (d.summary as Row | undefined) ?? d;
      const row = activityRow(userId, { ...summary, activityId: d.activityId ?? summary.activityId, summaryId: d.summaryId ?? summary.summaryId });
      if (!row) continue;
      const samples = ((d.samples as Row[] | undefined) ?? [])
        .map((s) => ({ t: (num(s.startTimeInSeconds) ?? 0) * 1000, v: num(s.heartRate) ?? NaN }))
        .filter((s) => s.t > 0 && Number.isFinite(s.v));
      const hrMax = Math.max(refs.max, ...samples.map((s) => s.v));
      row.trimp = trimpOf(samples, new Date(row.end_at as string).getTime(), refs.rest, hrMax);
      workouts.push(row);
      count++;
    }
  }

  await upsertDays(admin, userId, days);
  await upsertWorkouts(admin, workouts);
  // Les check-ins déjà faits intègrent la nouvelle nuit (même chemin qu'après une synchro Santé).
  if (days.size) await reapplyDeviceToRecentWellness(admin, userId);
  return count;
}

/* Suppression des données Garmin d'un sportif (déconnexion, ou retrait du consentement côté Garmin).
   Séances : toutes celles venues de Garmin. Jours : une ligne qui ne vient que de Garmin est supprimée ;
   une ligne partagée avec Apple Santé perd sa VFC (Apple Santé n'en écrit jamais pour un porteur de
   Garmin) et la source "Garmin" ; FC repos et sommeil y restent (Apple Santé les réécrit). */
export async function deleteGarminData(admin: SupabaseClient, userId: string) {
  const { error: wErr } = await admin.from("health_workouts").delete().eq("user_id", userId).like("platform_id", "garmin:%");
  if (wErr) throw new Error(`suppression health_workouts: ${wErr.message}`);
  const { data, error: rErr } = await admin.from("health_daily").select("date, sources").eq("user_id", userId).contains("sources", [GARMIN_SOURCE]);
  if (rErr) throw new Error(`lecture health_daily: ${rErr.message}`);
  const only = (data ?? []).filter((r) => ((r.sources as string[]) ?? []).every((s) => s === GARMIN_SOURCE)).map((r) => r.date as string);
  const shared = (data ?? []).filter((r) => !only.includes(r.date as string));
  if (only.length) {
    const { error } = await admin.from("health_daily").delete().eq("user_id", userId).in("date", only);
    if (error) throw new Error(`suppression health_daily: ${error.message}`);
  }
  for (const r of shared) {
    const { error } = await admin.from("health_daily")
      .update({ hrv_ms: null, sources: ((r.sources as string[]) ?? []).filter((s) => s !== GARMIN_SOURCE), updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("date", r.date as string);
    if (error) throw new Error(`nettoyage health_daily ${r.date}: ${error.message}`);
  }
  await reapplyDeviceToRecentWellness(admin, userId, 120);
}
