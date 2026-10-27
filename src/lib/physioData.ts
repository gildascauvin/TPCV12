"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { type DeviceInputs, type HealthRow } from "@/lib/deviceWellness";
import { heartResults, physioVerdictAt, HEART_FAMILY_LABEL, type HeartResult, type PhysioSession, type PhysioWorkout } from "@/lib/physioCompare";

/* Données de "Ressenti vs physiologie" (2026-10-11), lues côté client par le sportif lui-même (RLS :
   health_daily / health_workouts ne sont lisibles que par leur propriétaire, jamais par le coach).
   Cache module : une seule lecture partagée par les cartes, les tiroirs et les cartes d'indice. */

export const PHYSIO_HISTORY_DAYS = 120;
export const PHYSIO_CHANGED = "tpc-physio-changed";
export const PHYSIO_REVEAL = "tpc-physio-reveal";

export type PhysioCheckinRow = { date: string; sleep: number; stress: number; recovery: number; motivation: number; bedtime: string | null } & DeviceInputs;
export type PhysioData = {
  sessions: PhysioSession[];
  workouts: PhysioWorkout[];
  health: HealthRow[];
  checkins: PhysioCheckinRow[];
  heart: Record<string, HeartResult>;
};

/* Révélation après saisie, affichée par PhysioRevealHost (le tiroir qui a enregistré se ferme). */
export type PhysioRevealDetail =
  | { kind: "session"; date: string; duration: number; rpe: number; sessionId: string }
  | { kind: "wellness"; date: string; sleep: number; stress: number; recovery: number; motivation: number };

export function requestPhysioReveal(detail: PhysioRevealDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHYSIO_REVEAL, { detail }));
}

/* Relecture (2026-10-17) : le même écran de fin, rouvert après coup — par les gestes de modification
   (taper le résultat d'une séance faite, « Modifier mon ressenti ») et par un jour des charts
   "Ressenti vs physiologie" — avec des flèches pour passer à la séance / au matin précédent ou
   suivant. `onEdit` = le formulaire d'origine, proposé par le bouton « Modifier » de l'écran (sur
   l'élément ouvert seulement). */
export const PHYSIO_REPLAY = "tpc-physio-replay";
export type PhysioReplayDetail = ({ kind: "session"; sessionId: string } | { kind: "wellness"; date: string }) & { onEdit?: () => void };
export function requestPhysioReplay(detail: PhysioReplayDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHYSIO_REPLAY, { detail }));
}

const isoDaysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let cache: { userId: string; promise: Promise<PhysioData> } | null = null;

export async function fetchPhysioData(supabase: SupabaseClient, userId: string): Promise<PhysioData> {
  const since = isoDaysAgo(PHYSIO_HISTORY_DAYS);
  const sinceHealth = isoDaysAgo(PHYSIO_HISTORY_DAYS + 28);
  const [s, w, h, c] = await Promise.all([
    supabase.from("sessions").select("id, date, duration, rpe, done, name").eq("user_id", userId).eq("done", true).gte("date", since),
    supabase.from("health_workouts").select("date, start_at, duration_min, workout_type, trimp").eq("user_id", userId).gte("date", since),
    supabase.from("health_daily").select("date, resting_hr, sleep_minutes, hrv_ms").eq("user_id", userId).gte("date", sinceHealth),
    supabase.from("wellness_daily").select("date, sleep, stress, recovery, motivation, bedtime, device_sleep_minutes, device_resting_hr, device_rhr_baseline, device_hrv_ms, device_hrv_baseline").eq("user_id", userId).gte("date", since),
  ]);
  [s, w, h, c].forEach((r) => { if (r.error) console.error("[physio] lecture:", r.error.message); });
  // Doublons Garmin (même séance, plusieurs UUID) : une ligne par début de séance.
  const byStart = new Map<string, PhysioWorkout>();
  ((w.data ?? []) as PhysioWorkout[]).forEach((x) => {
    const prev = byStart.get(x.start_at);
    if (!prev || (prev.trimp == null && x.trimp != null)) byStart.set(x.start_at, { ...x, trimp: x.trimp == null ? null : Number(x.trimp) });
  });
  const sessions = (s.data ?? []) as PhysioSession[];
  const workouts = Array.from(byStart.values());
  const health = ((h.data ?? []) as HealthRow[]).map((r) => ({
    date: r.date,
    resting_hr: r.resting_hr == null ? null : Number(r.resting_hr),
    sleep_minutes: r.sleep_minutes,
    hrv_ms: r.hrv_ms == null ? null : Number(r.hrv_ms),
  }));
  return { sessions, workouts, health, checkins: (c.data ?? []) as PhysioCheckinRow[], heart: heartResults(sessions, workouts) };
}

export function loadPhysioData(userId: string, fresh = false): Promise<PhysioData> {
  if (!cache || cache.userId !== userId || fresh) cache = { userId, promise: fetchPhysioData(createClient(), userId) };
  return cache.promise;
}

export function invalidatePhysio() {
  cache = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PHYSIO_CHANGED));
}

export function usePhysioData(userId: string | null | undefined, enabled = true): PhysioData | null {
  const [data, setData] = useState<PhysioData | null>(null);
  useEffect(() => {
    if (!userId || !enabled) return;
    let alive = true;
    const load = (fresh: boolean) => loadPhysioData(userId, fresh).then((d) => { if (alive) setData(d); }).catch(() => {});
    load(false);
    const onChange = () => load(false);
    window.addEventListener(PHYSIO_CHANGED, onChange);
    return () => { alive = false; window.removeEventListener(PHYSIO_CHANGED, onChange); };
  }, [userId, enabled]);
  return data;
}

/* Entrées de la carte décision pour un jour (2026-10-11) : désaccord du check-in (ligne 2) et écart
   au cœur répété sur les 2 dernières séances d'une même famille (Phase). */
export function physioDecisionInputs(data: PhysioData | null, date: string): { verdictTitle: string | null; heartRepeated: string | null; sessionHeart: string | null } | null {
  if (!data) return null;
  const checkins = data.checkins.filter(c => c.bedtime != null);
  const c = checkins.find(x => x.date === date);
  const v = c ? physioVerdictAt(date, c, checkins, data.health) : null;
  const ok = data.sessions
    .filter(s => s.date <= date && data.heart[s.id]?.kind === "ok")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => data.heart[s.id] as Extract<HeartResult, { kind: "ok" }>);
  const lastTwo = ok.slice(-2);
  const repeated = lastTwo.length === 2 && lastTwo.every(r => r.verdict === "harder") && lastTwo[0].family === lastTwo[1].family;
  const fam = repeated ? HEART_FAMILY_LABEL[lastTwo[1].family] : "";
  // Séance faite ce jour-là : son écart au cœur (rien quand ressenti et cœur sont d'accord).
  const todayOk = data.sessions.filter(s => s.date === date && data.heart[s.id]?.kind === "ok")
    .map(s => data.heart[s.id] as Extract<HeartResult, { kind: "ok" }>).pop();
  const p = todayOk ? Math.round(todayOk.predicted) : 0;
  const sessionHeart = !todayOk || todayOk.verdict === "agree" ? null
    : todayOk.verdict === "harder"
    ? `Pour ton cœur, elle valait environ ${p} : tu l'as sentie plus dure.`
    : `Pour ton cœur, elle valait environ ${p} : tu l'as sentie plus facile.`;
  return {
    sessionHeart,
    verdictTitle: v && v.kind !== "agree" ? v.title : null,
    heartRepeated: repeated ? `Tes 2 dernières séances${fam ? ` ${fam}` : ""} t'ont paru plus dures que ce qu'elles font monter ton cœur : la fatigue s'installe.` : null,
  };
}
