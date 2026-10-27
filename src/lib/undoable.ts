import { toast } from "@/lib/toast";

/* Suppression annulable (2026-10-27) : la séance disparaît tout de suite de l'écran, l'écriture en base
   attend 5 s derrière un toast « Annuler ». Timers au niveau du module : changer de page ne les annule
   pas, et un départ de la page (fermeture, app en arrière-plan) exécute aussitôt ce qui reste en
   attente plutôt que de le perdre. */
type Pending = { timer: number; commit: () => Promise<unknown> | void };
const pending = new Map<string, Pending>();

function flushAll() {
  pending.forEach((p, key) => { window.clearTimeout(p.timer); pending.delete(key); void p.commit(); });
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
}

export function isPendingDelete(key: string) { return pending.has(key); }

export function undoableDelete({ key, message, commit, undo, ms = 5000 }: {
  key: string; message: string; commit: () => Promise<unknown> | void; undo: () => void; ms?: number;
}) {
  const timer = window.setTimeout(() => { pending.delete(key); void commit(); }, ms);
  pending.set(key, { timer, commit });
  toast(message, {
    ms,
    action: {
      label: "Annuler",
      onClick: () => {
        const p = pending.get(key);
        if (!p) return;
        window.clearTimeout(p.timer);
        pending.delete(key);
        undo();
      },
    },
  });
}
