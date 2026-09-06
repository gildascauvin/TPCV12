"use client";

import { useEffect, useRef } from "react";

const THRESHOLD = 30; // deltaX minimal pour un vrai geste horizontal délibéré (trackpad)
const COOLDOWN_MS = 600; // même cadence que la navigation verticale déjà en place (/week, /coach/planning)
const BOUNDARY_EPSILON = 4; // tolérance sur scrollLeft (arrondis sub-pixel)

interface Options {
  onPrev: () => void;
  onNext: () => void;
  enabled?: boolean;
  /* "always" (défaut) : contenu à jour unique, sans scroll interne à respecter — tout geste
     horizontal déclenche directement (ex. /today, /coach, /conseils, /coach/athletes).
     "boundary" : le conteneur scrolle déjà horizontalement en interne (grille 7 jours) — ne
     déclenche que quand ce scroll est déjà à son extrémité dans le sens du geste (ex. /week,
     /coach/planning : au bout à droite, continuer vers "next" change de semaine). */
  mode?: "always" | "boundary";
}

/* Convention de sens (calée sur le scroll trackpad "naturel", quasi universel) : glisser vers la
   gauche (deltaX > 0) = avancer ("next"), glisser vers la droite (deltaX < 0) = reculer ("prev") —
   même sens qu'un carrousel photo classique (swipe gauche = suivant). */
export function useHorizontalScrollNav<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  { onPrev, onNext, enabled = true, mode = "always" }: Options
) {
  const lastNav = useRef(0);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  onPrevRef.current = onPrev;
  onNextRef.current = onNext;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    function handler(e: WheelEvent) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaX) < THRESHOLD) return;
      const dir: "prev" | "next" = e.deltaX < 0 ? "prev" : "next";

      if (mode === "boundary") {
        const target = el!;
        if (dir === "prev" && target.scrollLeft > BOUNDARY_EPSILON) return;
        if (dir === "next" && target.scrollLeft < target.scrollWidth - target.clientWidth - BOUNDARY_EPSILON) return;
      }

      const now = Date.now();
      if (now - lastNav.current < COOLDOWN_MS) return;
      lastNav.current = now;
      if (dir === "prev") onPrevRef.current();
      else onNextRef.current();
    }

    el.addEventListener("wheel", handler, { passive: true });
    return () => el.removeEventListener("wheel", handler);
  }, [ref, enabled, mode]);
}
