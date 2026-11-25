/* Mesure de l'ouverture de l'app native (25/11) : l'Accueil met ~5 s à s'afficher dans l'app iOS contre
   ~0,8 s dans Safari ($web_vitals PostHog). Un seul événement `app_boot_timing` par ouverture, envoyé une fois
   la synchro Santé finie (ou au bout de 20 s), avec chaque étape en ms depuis le début du chargement de la page.
   `blocked_*` : temps où le fil principal n'a pas répondu (sondage toutes les 50 ms démarré dans le <head>,
   voir bootProbe.ts). À retirer quand le coupable est trouvé et corrigé. */
import posthog from "@/lib/ph";

type Probe = { blocked: number; maxGap: number; samples: [number, number][] };
declare global { interface Window { __tpcBoot?: Probe } }


const marks: Record<string, number> = {};
let sent = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function markBoot(name: string) {
  if (!(name in marks)) marks[name] = Math.round(performance.now());
}

function blockedBefore(t: number, p?: Probe) {
  if (!p) return null;
  return Math.round(p.samples.reduce((a, [start, gap]) => a + (start + gap <= t ? gap - 50 : start < t ? t - start : 0), 0));
}

function send() {
  if (sent) return;
  sent = true;
  if (timer) clearTimeout(timer);
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = res.filter(r => r.name.includes("/_next/static/") && r.name.endsWith(".js"));
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const r = (v?: number) => (v == null ? null : Math.round(v));
    const p = window.__tpcBoot;
    const hydrated = marks.hydrated;
    posthog.capture("app_boot_timing", {
      path: location.pathname,
      redirect_ms: r(nav && nav.redirectEnd - nav.redirectStart),
      worker_start_ms: r(nav?.workerStart || undefined),
      request_start_ms: r(nav?.requestStart),
      ttfb_ms: r(nav?.responseStart),
      html_end_ms: r(nav?.responseEnd),
      dom_interactive_ms: r(nav?.domInteractive),
      dcl_ms: r(nav?.domContentLoadedEventEnd),
      load_ms: r(nav?.loadEventEnd || undefined),
      fcp_ms: r(fcp?.startTime),
      js_files: js.length,
      js_last_end_ms: r(js.length ? Math.max(...js.map(x => x.responseEnd)) : undefined),
      js_from_cache: js.filter(x => x.transferSize === 0).length,
      ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [`${k}_ms`, v])),
      blocked_before_hydrated_ms: hydrated != null ? blockedBefore(hydrated, p) : null,
      blocked_total_ms: p ? Math.round(p.blocked) : null,
      max_freeze_ms: p ? Math.round(p.maxGap) : null,
      freezes: p ? p.samples.slice(0, 15).map(([s, g]) => `${s}+${g}`).join(" ") : null,
    });
  } catch { /* mesure best-effort */ }
}

/* Appelé à l'hydratation (NativeShell) : l'envoi attend la fin de la synchro Santé (20 s au plus), 8 s sans synchro,
   ou part dès que l'app passe en arrière-plan. */
export function scheduleBootReport(waitHealth: boolean) {
  if (timer || sent) return;
  timer = setTimeout(send, waitHealth ? 20000 : 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send(); });
}

export function bootStepDone(name: string) {
  markBoot(name);
  if (name === "health_sync_end") setTimeout(send, 500);
}
