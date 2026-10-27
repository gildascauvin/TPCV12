"use client";
import { useCallback, useRef, useState } from "react";

/* Fermeture animée d'une modale (2026-10-27) : `close()` pose `exiting` (→ className="tpc-exit" sur le
   fond, voir globals.css) puis appelle onClose une fois l'animation jouée. Les fermetures pilotées
   par le parent (après un enregistrement) restent immédiates, seules celles de l'utilisateur
   (croix, fond, Annuler) passent par ici. */
export const EXIT_MS = 180;

export function useExitAnimation(onClose?: () => void) {
  const [exiting, setExiting] = useState(false);
  const busy = useRef(false);
  const close = useCallback(() => {
    if (busy.current || !onClose) return;
    busy.current = true;
    setExiting(true);
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => { busy.current = false; setExiting(false); onClose(); }, reduced ? 0 : EXIT_MS);
  }, [onClose]);
  return { exiting, close, exitClass: exiting ? "tpc-exit" : undefined };
}
