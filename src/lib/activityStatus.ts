"use client";

import { useEffect, useSyncExternalStore } from "react";
import { format } from "date-fns";
import { ONBOARDING_REFRESH } from "@/lib/onboardingProgress";

/* Bandeau d'activité (2026-10-03, période affichée depuis 2026-10-04). Même mécanique que
   onboardingProgress.ts : un cache module (une entrée par période), relu au retour sur l'onglet et
   après chaque écriture (les handlers qui créent/suppriment une séance appellent déjà
   notifyOnboardingProgress → ONBOARDING_REFRESH). */

export interface ActivitySubject {
  id: string;
  name: string;
  /** État actuel : au moins une séance prévue à venir (aujourd'hui compris, pas encore faite). */
  active: boolean;
  /** Libellé court du sport (sportShortLabel), 9 caractères max. */
  label: string;
  emoji: string;
  program: { id: string; name: string; week: number; weeks: number } | null;
  weekDone: number;
  weekTotal: number;
  next: { date: string; name: string } | null;
  /** Période affichée (jour sur l'Accueil, semaine sur le Planning) : séance prévue à venir dedans. */
  periodActive: boolean;
  periodEmoji: string;
  /** Programme qui couvre la semaine affichée ; `week` en base 0, `loads` = difficulté moyenne par semaine. */
  periodProgram: { id: string; name: string; week: number; weeks: number; loads: number[] } | null;
  /** Lundi de la semaine affichée (clé du thème de semaine). */
  weekMonday: string;
  /** 7 jours de la semaine affichée : 0 rien, 1 prévue, 2 faite. */
  weekDays: (0 | 1 | 2)[];
  /** Thème de la semaine affichée (séances sans programme), null = "Séances libres". */
  freeLabel: string | null;
}
export interface ActivityStatus { role: "athlete" | "coach"; self: ActivitySubject | null; athletes: ActivitySubject[] }
export interface ActivityPeriod { from: string; to: string }
/* Requête réellement envoyée : toujours une semaine entière (le contenu du bandeau est celui de la
   semaine) + l'ancre du voyant (max(aujourd'hui, jour affiché)). L'Accueil et le Planning de la même
   semaine partagent donc la même entrée de cache, et naviguer de jour en jour dans une semaine passée
   ou en cours ne relance aucune requête. `subject` : sportif dont le bandeau affiche les barres (le
   contenu des programmes n'est chargé que pour lui). */
interface ActivityQuery { from: string; to: string; anchor: string; subject: string }

const cache = new Map<string, ActivityStatus>();
const queries = new Map<string, ActivityQuery>();
/* Périodes affichées en ce moment (compteur par entrée) : seules celles-ci sont relues après une
   écriture ; les autres sont oubliées et relues si on y revient. */
const inUse = new Map<string, number>();
const fetchedAt = new Map<string, number>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function mondayOf(d: string) {
  const x = new Date(d + "T12:00:00");
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return format(x, "yyyy-MM-dd");
}
function queryOf(p: ActivityPeriod, subject: string | null): ActivityQuery {
  const t = todayIso();
  const from = mondayOf(p.from);
  const end = new Date(from + "T12:00:00"); end.setDate(end.getDate() + 6);
  return { from, to: format(end, "yyyy-MM-dd"), anchor: p.from > t ? p.from : t, subject: subject ?? "" };
}
function keyOf(q: ActivityQuery) { return `${q.from}|${q.anchor}|${q.subject}`; }
function emit() { snapshotVersion++; listeners.forEach(l => l()); }

function todayIso() { return format(new Date(), "yyyy-MM-dd"); }
export function defaultPeriod(): ActivityPeriod { const t = todayIso(); return { from: t, to: t }; }

function run(q: ActivityQuery): Promise<void> {
  const key = keyOf(q);
  const running = inflight.get(key);
  if (running) return running;
  const url = `/api/activity/status?today=${todayIso()}&from=${q.from}&to=${q.to}&anchor=${q.anchor}${q.subject ? `&subject=${q.subject}` : ""}`;
  const p = fetch(url, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then((d: ActivityStatus | null) => { if (d && Array.isArray(d.athletes)) { cache.set(key, d); queries.set(key, q); fetchedAt.set(key, Date.now()); emit(); } })
    .catch(() => {})
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

export function refreshActivityStatus(period: ActivityPeriod = defaultPeriod(), subject: string | null = null): Promise<void> {
  return run(queryOf(period, subject));
}

/** Relit seulement si la dernière lecture de cette période date de plus de `maxAgeMs`. */
export function refreshActivityStatusIfStale(maxAgeMs: number, period: ActivityPeriod = defaultPeriod(), subject: string | null = null): Promise<void> | void {
  const q = queryOf(period, subject);
  if (Date.now() - (fetchedAt.get(keyOf(q)) ?? 0) < maxAgeMs) return;
  return run(q);
}

/** Relit toutes les périodes déjà chargées (après une écriture). */
function refreshAll() {
  queries.forEach((q, k) => {
    if (inUse.get(k)) run(q);
    else { cache.delete(k); queries.delete(k); fetchedAt.delete(k); }
  });
}
let soonTimer: ReturnType<typeof setTimeout> | null = null;
/** Après une écriture, sans rechargement : relit le bandeau (regroupé sur 400 ms). */
export function refreshActivitySoon() {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => { soonTimer = null; refreshAll(); }, 400);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** `enabled=false` (sandbox) : jamais de fetch, toujours null. `loading` : la période demandée
    n'est pas encore lue (le bandeau affiche alors un fantôme, jamais les données d'une autre semaine). */
export function useActivityStatus(enabled = true, period: ActivityPeriod = defaultPeriod(), subject: string | null = null): { status: ActivityStatus | null; loading: boolean } {
  const q = queryOf(period, subject);
  const key = keyOf(q);
  useSyncExternalStore(subscribe, () => snapshotVersion, () => 0);
  useEffect(() => {
    if (!enabled) return;
    if (!cache.has(key)) run(q);
    inUse.set(key, (inUse.get(key) ?? 0) + 1);
    const onVisible = () => { if (document.visibilityState === "visible") refreshAll(); };
    window.addEventListener(ONBOARDING_REFRESH, refreshActivitySoon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ONBOARDING_REFRESH, refreshActivitySoon);
      document.removeEventListener("visibilitychange", onVisible);
      inUse.set(key, Math.max(0, (inUse.get(key) ?? 1) - 1));
    };
  }, [enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) return { status: null, loading: false };
  const value = cache.get(key) ?? null;
  return { status: value, loading: !value };
}

/* Période affichée par la page : posée par CalendarHeader, lue par le bandeau et par la barre des
   sportifs (coach), qui vivent hors du header. */
let displayed: ActivityPeriod | null = null;
const periodListeners = new Set<() => void>();
export function setDisplayedPeriod(p: ActivityPeriod) {
  if (displayed && displayed.from === p.from && displayed.to === p.to) return;
  displayed = p;
  periodListeners.forEach(l => l());
}
export function useDisplayedPeriod(): ActivityPeriod {
  const p = useSyncExternalStore(
    l => { periodListeners.add(l); return () => { periodListeners.delete(l); }; },
    () => displayed,
    () => null,
  );
  return p ?? defaultPeriod();
}
