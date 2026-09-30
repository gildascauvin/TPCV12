/* Types et événement partagés par la synchro Apple Santé (healthSync.ts, app iOS uniquement) et
   la carte "Montre" (DeviceRecoveryCard.tsx) — séparés pour que la carte n'embarque pas le plugin
   Capacitor dans le bundle web. */
export const HEALTH_SYNCED_EVENT = "tpc:health-synced";

export type HealthDay = {
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  sleep_minutes: number | null;
  sources: string[];
};
