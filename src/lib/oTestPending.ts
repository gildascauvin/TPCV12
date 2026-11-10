"use client";

/* Résultat tapé dans un outil public /o/ puis « Enregistrer ce résultat » → /register?test=&v=&x=…
   Gardé en localStorage à l'arrivée sur l'inscription, enregistré dans test_results une fois le
   compte prêt (prepareOnboarding) : chez le sportif pour lui-même, chez le coach sur Thomas (démo). */

import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { upsertTestResult, type TestSubject } from "@/lib/testResults";
import { METRIC_DISPLAY, type MetricKey } from "@/lib/testNorms";
import { decodeOValues, isOTest } from "@/lib/oTests";

const KEY = "o_test_pending";
const DEMO_ATHLETE_NAME = "Thomas M. (démo)";

interface Pending { test: string; values: Partial<Record<MetricKey, number>>; sexe: "homme" | "femme" | null; poidsKg: number | null; at: number }

/** À l'arrivée sur /register : mémorise le résultat de l'outil (si l'URL en porte un). */
export function stashPendingOTest(params: URLSearchParams): string | null {
  const test = params.get("test");
  const x = params.get("x");
  if (!test || !x || !isOTest(test)) return null;
  const values = decodeOValues(x);
  const known = Object.fromEntries(Object.entries(values).filter(([k]) => k in METRIC_DISPLAY));
  if (!Object.keys(known).length) return null;
  const sx = params.get("sx");
  const kg = Number(params.get("kg"));
  const pending: Pending = {
    test, values: known, sexe: sx === "f" ? "femme" : sx === "h" ? "homme" : null,
    poidsKg: Number.isFinite(kg) && kg > 0 ? kg : null, at: Date.now(),
  };
  try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch { return null; }
  return test;
}

function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    // Un résultat de plus de 7 jours n'est plus « aujourd'hui » : on ne l'enregistre pas.
    if (!p?.values || Date.now() - p.at > 7 * 86400000) { localStorage.removeItem(KEY); return null; }
    return p;
  } catch { return null; }
}

function isoDay(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Enregistre le résultat en attente. Ne bloque jamais l'onboarding (best effort, erreurs loguées). */
export async function savePendingOTest(uid: string, role: "athlete" | "coach" | string | null, demoAthleteId: string | null): Promise<void> {
  const p = readPending();
  if (!p) return;
  const supabase = createClient();
  let subject: TestSubject | null = null;
  if (role === "coach") {
    let athleteId = demoAthleteId;
    if (!athleteId) {
      const { data, error } = await supabase.from("coach_athletes").select("id").eq("coach_id", uid).eq("name", DEMO_ATHLETE_NAME).is("user_id", null).limit(1);
      if (error) console.error("[oTest] lecture du sportif démo a échoué :", error);
      athleteId = data?.[0]?.id ?? null;
    }
    if (athleteId) subject = { subjectCoachAthleteId: athleteId };
  } else {
    subject = { subjectUserId: uid };
  }
  if (!subject) return;

  const date = isoDay(p.at);
  let ok = true;
  for (const [metric, value] of Object.entries(p.values) as [MetricKey, number][]) {
    const meta = METRIC_DISPLAY[metric];
    const saved = await upsertTestResult(uid, subject, { name: meta.name, unit: meta.unit, value, date });
    if (!saved) ok = false;
  }

  // Sexe et poids tapés dans l'outil : seulement s'ils manquent au profil du sportif (repères).
  if (role !== "coach" && (p.sexe || p.poidsKg)) {
    const { data: prof, error } = await supabase.from("profiles").select("sexe, poids_kg").eq("user_id", uid).maybeSingle();
    if (error) console.error("[oTest] lecture du profil a échoué :", error);
    const patch: Record<string, unknown> = {};
    if (p.sexe && !prof?.sexe) patch.sexe = p.sexe;
    if (p.poidsKg && prof?.poids_kg == null) patch.poids_kg = p.poidsKg;
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from("profiles").update(patch).eq("user_id", uid);
      if (upErr) console.error("[oTest] mise à jour du profil a échoué :", upErr);
    }
  }

  posthog.capture(ok ? "o_test_saved" : "o_test_save_failed", { tool: p.test, role, metrics: Object.keys(p.values) });
  if (ok) localStorage.removeItem(KEY);
}
