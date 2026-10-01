"use client";

import { useEffect, useSyncExternalStore } from "react";

/* Checklist d'onboarding dans l'app (2026-10-01) — état partagé entre la puce du header et les tags
   "À faire" des composants. Une seule source : GET /api/onboarding/progress (dérivé des données).
   Rafraîchi au montage, au retour sur l'onglet et sur l'événement ONBOARDING_REFRESH (posé après
   chaque action qui peut cocher une étape). Cache module : une page = un seul fetch. */

export type OnboardingStepKey = "form" | "build" | "adjust" | "unlock" | "invite";
export interface OnboardingStep { key: OnboardingStepKey; label: string; done: boolean }
export interface OnboardingProgress { userId?: string; role: "athlete" | "coach"; steps: OnboardingStep[]; complete: boolean }

export const ONBOARDING_REFRESH = "tpc:onboarding-refresh";
/** Ouvre le "+" de la nav (étape "Construis ton entraînement"). */
export const OPEN_QUICKADD = "tpc:open-quickadd";
/** Ouvre le priming de la page courante (étape "Débloque…", 1re décision). */
export const OPEN_PRIMING = "tpc:open-priming";

let current: OnboardingProgress | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

/* Lot C (2026-10-01) : un événement par étape au moment où elle se coche, une seule fois par compte
   (mémoire locale par utilisateur). Un seul nom d'événement, l'étape et le rôle en propriétés, plus
   un nom spécifique par étape pour les funnels (même convention que onboarding_step_viewed +
   onboarding_${step}_viewed). Une étape déjà faite à la 1re observation (ex. coach : Thomas compte
   pour "Invite tes sportifs") part aussi, avec `already_done_on_arrival`. */
async function trackCompletions(p: OnboardingProgress) {
  if (!p.userId || !p.steps.length) return;
  const key = `tpc_onb_tracked_${p.userId}`;
  let seen: string[] | null = null;
  try { const raw = localStorage.getItem(key); seen = raw ? JSON.parse(raw) : null; } catch { /* stockage indisponible */ }
  const firstObservation = seen === null;
  const tracked = new Set(seen ?? []);
  const newlyDone = p.steps.filter(s => s.done && !tracked.has(s.key));
  if (!newlyDone.length && !(p.complete && !tracked.has("__complete"))) return;
  const posthog = (await import("posthog-js")).default;
  for (const s of newlyDone) {
    const props = { role: p.role, step: s.key, step_index: p.steps.findIndex(x => x.key === s.key) + 1, steps_total: p.steps.length, already_done_on_arrival: firstObservation };
    posthog.capture("onboarding_checklist_step_completed", props);
    posthog.capture(`onboarding_checklist_${s.key}_completed`, props);
    tracked.add(s.key);
  }
  if (p.complete && !tracked.has("__complete")) {
    posthog.capture("onboarding_checklist_completed", { role: p.role, steps_total: p.steps.length });
    tracked.add("__complete");
  }
  try { localStorage.setItem(key, JSON.stringify(Array.from(tracked))); } catch { /* idem */ }
}

export function refreshOnboardingProgress(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/onboarding/progress", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((d: OnboardingProgress | null) => { if (d && Array.isArray(d.steps)) { current = d; emit(); trackCompletions(d); } })
    .catch(() => {})
    .finally(() => { inflight = null; });
  return inflight;
}

/** À appeler après une action qui peut cocher une étape (check-in, séance, décision, invitation…). */
export function notifyOnboardingProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONBOARDING_REFRESH));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** `enabled=false` (sandbox) : jamais de fetch, toujours null. */
export function useOnboardingProgress(enabled = true): OnboardingProgress | null {
  const value = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (!enabled) return;
    if (!current) refreshOnboardingProgress();
    const onRefresh = () => { refreshOnboardingProgress(); };
    const onVisible = () => { if (document.visibilityState === "visible") refreshOnboardingProgress(); };
    window.addEventListener(ONBOARDING_REFRESH, onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ONBOARDING_REFRESH, onRefresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return enabled ? value : null;
}

/** Vrai si `key` est LA prochaine étape à faire (un seul tag "À faire" visible à la fois).
    Faux tant que la progression n'est pas chargée. */
export function useStepTodo(key: OnboardingStepKey, enabled = true): boolean {
  const p = useOnboardingProgress(enabled);
  if (!p || p.complete) return false;
  return p.steps.find(s => !s.done)?.key === key;
}

/* 1re décision d'autorégulation prise (Appliquer ou Maintenir), quelle que soit la surface :
   enregistrée une seule fois (profiles.first_adjustment_at), coche l'étape "Ajuste" côté coach et
   ouvre le priming une seule fois si le compte n'est pas abonné. Sans compte (sandbox) : rien. */
let firstAdjustmentChecked = false;
export async function markFirstAdjustment() {
  if (firstAdjustmentChecked) return;
  firstAdjustmentChecked = true;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("first_adjustment_at, subscription_status").eq("user_id", user.id).maybeSingle();
    if (!profile || profile.first_adjustment_at) return;
    const { error } = await supabase.from("profiles").update({ first_adjustment_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) { console.error("[markFirstAdjustment] update error:", error); return; }
    notifyOnboardingProgress();
    const paid = profile.subscription_status === "athlete" || profile.subscription_status === "coach";
    if (!paid) {
      const posthog = (await import("posthog-js")).default;
      posthog.capture("priming_after_first_decision");
      // Laisse le temps de voir la décision appliquée avant d'ouvrir le priming.
      setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_PRIMING, { detail: { source: "first_decision" } })), 1200);
    }
  } catch (e) {
    console.error("[markFirstAdjustment]", e);
  }
}

/** Variante différée : appelée au début d'un handler d'écriture, rafraîchit une fois l'écriture faite. */
export function notifyOnboardingProgressSoon(delayMs = 1500) {
  if (typeof window !== "undefined") window.setTimeout(notifyOnboardingProgress, delayMs);
}
