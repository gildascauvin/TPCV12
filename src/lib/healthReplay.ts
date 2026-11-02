import type { SupabaseClient } from "@supabase/supabase-js";
import { deviceInputsFor, sleepMinutesScore, rhrComponent, hrvComponent, type HealthRow } from "@/lib/deviceWellness";

/* Rejeu des 30 derniers jours de la montre (2026-11-02, lot natif de l'argumentaire avant paywall) :
   juste après la connexion d'Apple Santé / Health Connect, on rejoue chaque matin avec les seules
   données de la montre (sommeil mesuré, FC au repos et VFC vs la norme perso, mêmes composantes que le
   point forme) et on repère les séances faites un matin nettement sous la norme (« aurait allégé ») ou
   nettement au-dessus (« aurait poussé »).
   Pas de ressenti dans le rejeu (on ne l'a pas), donc pas le moteur complet : seuils fixes sur l'échelle
   0-10 des composantes, où la norme vaut 7,5. Pur, testable. */

export type ReplayWorkout = { date: string; duration_min: number; workout_type: string };
export type ReplayFlag = "down" | "up";
export type ReplayDay = {
  date: string;
  /* Forme physiologique 0-100 (norme = 75), null sans aucune mesure ce jour-là. */
  v: number | null;
  ses: boolean;
  flag?: ReplayFlag;
  rows: string[];
  workout?: ReplayWorkout;
};
export type Replay = { days: ReplayDay[]; scored: number; down: ReplayDay[]; up: ReplayDay[] };

// Sous 4,5 : VFC ~20 % sous la norme, ou FC au repos ~2,5 bpm au-dessus, ou nuit d'environ 6 h.
export const REPLAY_DOWN = 4.5;
// À partir de 9, et seulement avec une composante comparée à la norme (pas sur une longue nuit seule).
export const REPLAY_UP = 9;
// En dessous, pas assez de matins mesurés pour que le rejeu dise quelque chose : parcours sans données.
export const REPLAY_MIN_SCORED = 7;
const WINDOW = 30;

const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nightLabel = (m: number) => `${Math.floor(m / 60)} h ${pad(Math.round(m % 60))}`;

export function buildReplay(health: HealthRow[], workouts: ReplayWorkout[], today: Date = new Date()): Replay {
  const days: ReplayDay[] = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const d = new Date(today); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const date = dayStr(d);
    const inp = deviceInputsFor(date, health);
    const sleep = inp.device_sleep_minutes != null ? sleepMinutesScore(Number(inp.device_sleep_minutes)) : null;
    const rhr = rhrComponent(inp), hrv = hrvComponent(inp);
    const comps = [sleep, rhr, hrv].filter((x): x is number => x != null);
    const score = comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : null;
    // La séance la plus longue du jour (une marche de 10 min ne compte pas).
    const w = workouts.filter(x => x.date === date && x.duration_min >= 20)
      .sort((a, b) => b.duration_min - a.duration_min)[0];
    let flag: ReplayFlag | undefined;
    if (score != null && w) {
      if (score <= REPLAY_DOWN) flag = "down";
      else if (score >= REPLAY_UP && (rhr != null || hrv != null)) flag = "up";
    }
    const rows: string[] = [];
    if (inp.device_sleep_minutes != null) rows.push(`Nuit de ${nightLabel(Number(inp.device_sleep_minutes))}`);
    if (inp.device_resting_hr != null && inp.device_rhr_baseline != null) {
      const delta = Math.round(Number(inp.device_resting_hr) - Number(inp.device_rhr_baseline));
      if (delta >= 2) rows.push(`Fréquence cardiaque au repos : ${delta} bpm au-dessus de ta norme`);
      else if (delta <= -2) rows.push(`Fréquence cardiaque au repos : ${-delta} bpm sous ta norme`);
    }
    if (inp.device_hrv_ms != null && inp.device_hrv_baseline != null) {
      const h = Math.round(Number(inp.device_hrv_ms)), b = Math.round(Number(inp.device_hrv_baseline));
      if (h <= b * 0.92) rows.push(`VFC à ${h} ms, ta norme est à ${b} ms`);
      else if (h >= b * 1.08) rows.push(`VFC à ${h} ms, au-dessus de ta norme (${b} ms)`);
    }
    days.push({ date, v: score == null ? null : Math.round(score * 10), ses: !!w, flag, rows, workout: w });
  }
  const scored = days.filter(d => d.v != null).length;
  // Les plus marqués d'abord (pour les cartes), puis remis dans l'ordre du calendrier.
  const pick = (f: ReplayFlag, n: number) => days.filter(d => d.flag === f)
    .sort((a, b) => (f === "down" ? a.v! - b.v! : b.v! - a.v!)).slice(0, n)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { days, scored, down: pick("down", 3), up: pick("up", 2) };
}

export const replayDownCount = (r: Replay) => r.days.filter(d => d.flag === "down").length;
export const replayUpCount = (r: Replay) => r.days.filter(d => d.flag === "up").length;
export const replayUsable = (r: Replay | null | undefined): r is Replay => !!r && r.scored >= REPLAY_MIN_SCORED;

/* Lecture après la synchro : 60 jours de health_daily (les normes du 1er jour rejoué ont besoin des
   jours d'avant, quand la base en a) et les entraînements des 30 derniers jours. */
export async function fetchReplay(supabase: SupabaseClient, userId: string, today: Date = new Date()): Promise<Replay | null> {
  const since = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return dayStr(d); };
  const [h, w] = await Promise.all([
    supabase.from("health_daily").select("date,resting_hr,sleep_minutes,hrv_ms").eq("user_id", userId).gte("date", since(60)),
    supabase.from("health_workouts").select("date,duration_min,workout_type").eq("user_id", userId).gte("date", since(31)),
  ]);
  if (h.error) { console.error("[replay] health_daily", h.error); return null; }
  if (w.error) console.error("[replay] health_workouts", w.error);
  return buildReplay((h.data ?? []) as HealthRow[], (w.data ?? []) as ReplayWorkout[], today);
}

/* Mode test sans compte (?dbgstep…&dbghealth=1&dbgreplay=1) : 45 jours de montre inventés, 3 jours
   nettement sous la norme et 2 au-dessus, chacun avec un entraînement. */
export function demoReplay(today: Date = new Date()): Replay {
  const health: HealthRow[] = [], workouts: ReplayWorkout[] = [];
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const special: Record<number, "down" | "up"> = { 24: "down", 13: "down", 8: "down", 20: "up", 4: "up" };
  for (let i = 44; i >= 0; i--) {
    const d = new Date(today); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const date = dayStr(d), f = special[i];
    health.push({
      date,
      resting_hr: f === "down" ? 58 + Math.round(rnd() * 3) : f === "up" ? 50 : 52 + Math.round(rnd() * 2),
      hrv_ms: f === "down" ? 40 + Math.round(rnd() * 4) : f === "up" ? 66 : 56 + Math.round(rnd() * 6),
      sleep_minutes: f === "down" ? 335 + Math.round(rnd() * 30) : f === "up" ? 485 : 410 + Math.round(rnd() * 50),
    });
    if (f || i % 7 === 0 || i % 7 === 2 || i % 7 === 4) workouts.push({ date, duration_min: 45 + Math.round(rnd() * 30), workout_type: ["running", "traditionalStrengthTraining", "crossTraining"][i % 3] });
  }
  return buildReplay(health, workouts, today);
}
