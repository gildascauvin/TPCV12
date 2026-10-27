import { flushSync } from "react-dom";

/* Ouverture « morphée » (2026-10-27, View Transitions) : l'élément de départ (une carte) se transforme
   en panneau d'arrivée qui porte le même `name` (viewTransitionName). Sans support ou en mouvement
   réduit : simple mise à jour. */
export const MORPH_SESSION = "tpc-session";

/* Une transition interrompue (onglet masqué, autre transition lancée) rejette ses promesses : rien à
   signaler, la mise à jour de l'écran a lieu quand même. */
export type ViewTransitionLike = { ready?: Promise<void>; finished?: Promise<void>; updateCallbackDone?: Promise<void> };
export function silence(vt: ViewTransitionLike | undefined) {
  vt?.ready?.catch(() => {});
  vt?.finished?.catch(() => {});
  vt?.updateCallbackDone?.catch(() => {});
}

export function morphOpen(from: Element | null, name: string, update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || !(from instanceof HTMLElement) || reduced) { update(); return false; }
  from.style.setProperty("view-transition-name", name);
  const vt = doc.startViewTransition(() => {
    // Le nom passe de la carte au panneau : un seul élément le porte à la fois.
    from.style.removeProperty("view-transition-name");
    flushSync(update);
  }) as ViewTransitionLike;
  silence(vt);
  return true;
}
