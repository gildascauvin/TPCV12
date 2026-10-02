/* Mode hors ligne (2026-10-02) — format partagé entre le serveur (/api/offline/*), la synchro dans
   l'app (offlineStore.ts) et la page hors ligne statique (public/offline.html, recopiée dans
   capacitor-www pour l'app iOS). La page statique n'importe pas ce fichier : si le format change,
   mettre à jour public/offline.html et incrémenter OFFLINE_SNAPSHOT_VERSION. */

export const OFFLINE_SNAPSHOT_VERSION = 1;
export const OFFLINE_SNAPSHOT_KEY = "tpc_offline_snapshot";
export const OFFLINE_QUEUE_KEY = "tpc_offline_queue";

export type OfflineSessionItem = {
  id: string;
  /** Table d'origine : "sessions" (séance d'un vrai compte) ou "coach_sessions" (sportif sans compte). */
  table: "sessions" | "coach_sessions";
  /** Côté coach : la ligne coach_athletes du sportif (absent pour ses propres séances côté sportif). */
  athleteId?: string;
  athleteName?: string;
  name: string;
  notes: string | null;
  target_difficulty: number | null;
  done: boolean;
  rpe: number | null;
  duration: number | null;
};

export type OfflineSnapshot = {
  v: number;
  savedAt: string;
  role: "athlete" | "coach";
  name: string | null;
  today: string;
  /** Sportif : check-in du jour déjà fait (le formulaire hors ligne est alors masqué). */
  checkinDone: boolean;
  days: { date: string; items: OfflineSessionItem[] }[];
};

export type OfflineAction =
  | {
      id: string; type: "complete"; at: string;
      table: "sessions" | "coach_sessions"; sessionId: string; athleteId?: string;
      rpe: number; duration: number;
    }
  | {
      /* Modification d'une de ses propres séances faite hors ligne depuis la vraie app (/today) :
         démarrer / pause / terminer la séance en cours, exercices modifiés pendant la séance. */
      id: string; type: "patch"; at: string; sessionId: string; patch: OfflineSessionPatch;
    }
  | {
      id: string; type: "wellness"; at: string; date: string;
      sleep: number; bedtime: string; stress: number; recovery: number; motivation: number; behaviors: string[];
    };

/* Champs qu'une modification hors ligne a le droit de toucher (liste blanche, côté serveur aussi). */
export const OFFLINE_PATCH_FIELDS = ["started_at", "paused_at", "paused_ms", "done", "rpe", "duration", "notes", "target_difficulty"] as const;
export type OfflineSessionPatch = Partial<{
  started_at: string | null; paused_at: string | null; paused_ms: number;
  done: boolean; rpe: number | null; duration: number | null; notes: string | null; target_difficulty: number | null;
}>;

export type OfflineFlushResult = { id: string; status: "ok" | "skipped" | "error"; reason?: string };
