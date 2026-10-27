/* Toasts d'action (2026-10-27) : confirmation discrète en bas d'écran, avec un bouton optionnel
   (« Annuler » après une suppression ou une duplication). Affichés par ToastHost (layout de l'app). */
export type ToastAction = { label: string; onClick: () => void };
export type ToastInput = { message: string; action?: ToastAction; tone?: "default" | "success"; ms?: number };

export const TOAST_EVENT = "tpc:toast";

export function toast(message: string, opts: Omit<ToastInput, "message"> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: { message, ...opts } }));
}
