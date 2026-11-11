import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalMetricKey } from "@/lib/testNorms";

/* FC max et FC de repos saisies en test (11/11/2026, outils /o/fcmax, zones, zone2 et onglet Performance).
   Elles servent au TRIMP SEULEMENT pour les séances datées du jour du test ou après : une séance passée
   n'est jamais recalculée avec une valeur apprise plus tard (healthSync relit 30 jours à chaque synchro,
   garminIngest recalcule à chaque envoi Garmin : sans ce filtre par date, l'historique bougerait).
   Le test le plus récent à la date de la séance s'applique ; avant le 1er test, rien ne change. */

export interface HeartTestPoint { date: string; value: number }
export interface HeartTests { max: HeartTestPoint[]; rest: HeartTestPoint[] }

export const EMPTY_HEART_TESTS: HeartTests = { max: [], rest: [] };

/** Résultats « FC max » / « FC de repos » du sportif (tests reconnus par leur nom, voir testNorms ALIASES). */
export async function fetchHeartTests(supabase: SupabaseClient, userId: string): Promise<HeartTests> {
  const { data, error } = await supabase
    .from("test_results")
    .select("date, value, tests(name_key)")
    .eq("subject_user_id", userId)
    .order("date");
  if (error) { console.error("[heartRefs] lecture des tests FC a échoué :", error); return EMPTY_HEART_TESTS; }
  const out: HeartTests = { max: [], rest: [] };
  for (const r of (data ?? []) as { date: string; value: number | string; tests: { name_key: string } | { name_key: string }[] | null }[]) {
    const t = Array.isArray(r.tests) ? r.tests[0] : r.tests;
    const key = t?.name_key ? canonicalMetricKey(t.name_key) : null;
    const v = Number(r.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (key === "hrMax" && v >= 120 && v < 260) out.max.push({ date: r.date, value: v });
    else if (key === "hrRest" && v >= 25 && v < 120) out.rest.push({ date: r.date, value: v });
  }
  return out;
}

/** Valeur du dernier test fait au plus tard le jour de la séance (dates AAAA-MM-JJ), sinon null. */
export function heartTestAt(points: HeartTestPoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of points) if (p.date <= date) v = p.value;
  return v;
}

/** FC de repos et FC max à utiliser pour le TRIMP d'une séance ; `fallback` = le calcul d'avant (inchangé avant le 1er test). */
export function heartRefsForWorkout(tests: HeartTests, date: string, fallback: { rest: number; max: number }, sessionPeak?: number | null) {
  const rest = heartTestAt(tests.rest, date) ?? fallback.rest;
  const measuredMax = heartTestAt(tests.max, date);
  // Un pic de séance au-dessus de la FC max testée : le test sous-estimait, le pic prime (jamais de fraction > 1).
  const max = measuredMax != null ? Math.max(measuredMax, sessionPeak ?? 0) : fallback.max;
  return { rest, max };
}
