/* Données montre dans la récupération (2026-09-30, Gildas : "si pas de données, wellness subjectif, si
   des données, les 2"). Le sommeil mesuré COMPLÈTE le sommeil déclaré (moyenne des deux), la FC au repos
   s'ajoute comme 5e composante. Tout est ramené sur l'échelle 0-10 des curseurs, plus haut = mieux.
   Module sans import : partagé par wellness.ts ET wellnessBaseline.ts, qui s'importent déjà l'un
   l'autre dans un sens. */

export type DeviceInputs = {
  device_sleep_minutes?: number | null;
  device_resting_hr?: number | null;
  device_rhr_baseline?: number | null;
  device_hrv_ms?: number | null;
  device_hrv_baseline?: number | null;
};

// 5h de sommeil → 0, 8h → 10 (linéaire, borné).
export function sleepMinutesScore(minutes: number): number {
  return Math.max(0, Math.min(10, (minutes - 300) / 18));
}

/* FC au repos vs la norme perso (moyenne des jours précédents) : dans la norme → 7,5 ; +4 bpm, le seuil
   de fatigue classique → 2,5 ; 2 bpm sous la norme → 10. Sans norme, pas de composante. */
export function rhrScore(rhr: number, baseline: number): number {
  return Math.max(0, Math.min(10, 7.5 - 1.25 * (rhr - baseline)));
}

/* VFC vs la norme perso, sur le log du ratio (la VFC varie en proportion, pas en valeur absolue — même
   convention que le suivi ln rMSSD en science du sport) : dans la norme → 7,5 ; −20 % → ~4,7 ; −30 % → ~3 ;
   +10 % → ~8,7. Plus haut = mieux, comme toutes les composantes. Ne compare que la montre du sportif à
   elle-même : SDNN (Apple Watch) et rMSSD (WHOOP) ne sont pas comparables entre eux, mais chacun l'est
   à sa propre norme. */
export function hrvScore(hrv: number, baseline: number): number {
  if (hrv <= 0 || baseline <= 0) return 7.5;
  return Math.max(0, Math.min(10, 7.5 + 12.5 * Math.log(hrv / baseline)));
}

export function hrvComponent(device?: DeviceInputs | null): number | null {
  const h = device?.device_hrv_ms, b = device?.device_hrv_baseline;
  return h != null && b != null ? hrvScore(Number(h), Number(b)) : null;
}

// Sommeil utilisé dans le score : moyenne déclaré + mesuré si la montre a la nuit, sinon le déclaré.
export function effectiveSleep(sleep: number, device?: DeviceInputs | null): number {
  const m = device?.device_sleep_minutes;
  return m != null ? (sleep + sleepMinutesScore(Number(m))) / 2 : sleep;
}

export function rhrComponent(device?: DeviceInputs | null): number | null {
  const r = device?.device_resting_hr, b = device?.device_rhr_baseline;
  return r != null && b != null ? rhrScore(Number(r), Number(b)) : null;
}

export const RHR_BASELINE_MIN_DAYS = 5;
const MIN_NIGHT_MINUTES = 180;
const RHR_BASELINE_WINDOW = 28;

export type HealthRow = {
  date: string; resting_hr: number | null; sleep_minutes: number | null; hrv_ms?: number | null;
  /* Garmin seulement (Daily Summaries, 2026-10-23) : affichage, n'entrent pas dans le score. */
  stress_avg?: number | null; body_battery_charged?: number | null; body_battery_drained?: number | null;
};

/* Ce que la montre apporte au jour `date` : sommeil de la nuit, FC au repos, et sa norme = moyenne des
   FC des 28 jours précédents (au moins 5). `days` = lignes health_daily, n'importe quel ordre. */
export function deviceInputsFor(date: string, days: HealthRow[]): DeviceInputs {
  const today = days.find(d => d.date === date);
  const prior = days
    .filter(d => d.date < date && d.resting_hr != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RHR_BASELINE_WINDOW)
    .map(d => Number(d.resting_hr));
  const baseline = prior.length >= RHR_BASELINE_MIN_DAYS ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  const priorHrv = days
    .filter(d => d.date < date && d.hrv_ms != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RHR_BASELINE_WINDOW)
    .map(d => Number(d.hrv_ms));
  const hrvBaseline = priorHrv.length >= RHR_BASELINE_MIN_DAYS ? priorHrv.reduce((a, b) => a + b, 0) / priorHrv.length : null;
  return {
    // Moins de 3 h = nuit incomplète côté montre (sieste seule, synchro partielle) : ignorée plutôt que
    // de tirer le sommeil vers 0.
    device_sleep_minutes: today?.sleep_minutes != null && today.sleep_minutes >= MIN_NIGHT_MINUTES ? today.sleep_minutes : null,
    device_resting_hr: today?.resting_hr != null ? Number(today.resting_hr) : null,
    device_rhr_baseline: baseline != null ? Math.round(baseline * 10) / 10 : null,
    device_hrv_ms: today?.hrv_ms != null ? Math.round(Number(today.hrv_ms) * 10) / 10 : null,
    device_hrv_baseline: hrvBaseline != null ? Math.round(hrvBaseline * 10) / 10 : null,
  };
}

/* Résumé de ce que dit la montre pour un jour, 2e personne — pour la carte "Plan à confirmer" avant le
   point forme (2026-09-30). null si la montre n'a rien ce jour-là. */
export function deviceSummary(d: DeviceInputs): string | null {
  const parts: string[] = [];
  if (d.device_sleep_minutes != null) {
    const m = Math.round(Number(d.device_sleep_minutes));
    parts.push(`Nuit ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
  }
  if (d.device_resting_hr != null) {
    const r = Number(d.device_resting_hr), b = d.device_rhr_baseline != null ? Number(d.device_rhr_baseline) : null;
    const delta = b != null ? Math.round(r - b) : null;
    parts.push(delta == null ? `FC au repos ${Math.round(r)} bpm`
      : delta >= 2 ? `FC ${delta} bpm au-dessus de ta norme`
      : delta <= -2 ? `FC ${-delta} bpm sous ta norme`
      : "FC dans ta norme");
  }
  if (d.device_hrv_ms != null) {
    const h = Number(d.device_hrv_ms), b = d.device_hrv_baseline != null ? Number(d.device_hrv_baseline) : null;
    const pct = b ? Math.round((h / b - 1) * 100) : null;
    parts.push(pct == null ? `VFC ${Math.round(h)} ms`
      : pct >= 8 ? `VFC ${pct} % au-dessus de ta norme`
      : pct <= -8 ? `VFC ${-pct} % sous ta norme`
      : "VFC dans ta norme");
  }
  return parts.length ? parts.join(" · ") : null;
}

/* Valeurs montre d'un jour, pour les charts FC repos / VFC (2026-10-11). `rhr`/`hrv` = mesure brute,
   `rhrNorm`/`hrvNorm` = norme perso de ce jour-là (moyenne des 28 jours précédents, au moins 5). */
export type DeviceDay = {
  rhr: number | null; rhrNorm: number | null; hrv: number | null; hrvNorm: number | null;
  /* Nuit mesurée (≥ 3 h, même filtre que le score). `sleepZ` n'est rempli que les jours SANS point forme :
     écart à la norme sommeil calculé sur la durée seule, pour que le chart Sommeil ait son point. */
  sleepMin: number | null; sleepZ: number | null;
  /* Garmin (2026-10-23) : stress moyen de la journée (1-100) et Body Battery rechargée / dépensée. */
  stress?: number | null; bbCharged?: number | null; bbDrained?: number | null;
};

type DeviceCols = { date: string } & DeviceInputs;

/* Série jour par jour alignée sur `dates`. Source prioritaire : health_daily (la montre), pour qu'un
   jour sans point forme ait quand même son point. Repli : les colonnes device_* de wellness_daily (côté
   coach, qui ne peut pas lire health_daily, ou sandbox) — un point seulement les jours de point forme. */
export function buildDeviceSeries(dates: string[], health: HealthRow[] | null | undefined, wellness: DeviceCols[]): DeviceDay[] {
  const num = (v: unknown) => (v == null ? null : Number(v));
  if (health && health.length) {
    const byDate = new Map(health.map(h => [h.date, h]));
    return dates.map(date => {
      const d = deviceInputsFor(date, health);
      const h = byDate.get(date);
      return {
        rhr: num(d.device_resting_hr), rhrNorm: num(d.device_rhr_baseline), hrv: num(d.device_hrv_ms), hrvNorm: num(d.device_hrv_baseline), sleepMin: num(d.device_sleep_minutes), sleepZ: null,
        stress: num(h?.stress_avg), bbCharged: num(h?.body_battery_charged), bbDrained: num(h?.body_battery_drained),
      };
    });
  }
  const byDate = new Map(wellness.map(w => [w.date, w]));
  return dates.map(date => {
    const w = byDate.get(date);
    return { rhr: num(w?.device_resting_hr), rhrNorm: num(w?.device_rhr_baseline), hrv: num(w?.device_hrv_ms), hrvNorm: num(w?.device_hrv_baseline), sleepMin: num(w?.device_sleep_minutes), sleepZ: null };
  });
}
