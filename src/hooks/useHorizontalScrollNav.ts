"use client";

import { useEffect, useRef } from "react";

const THRESHOLD = 30; // deltaX minimal pour un vrai geste horizontal délibéré (trackpad)
const TOUCH_THRESHOLD = 50; // dx minimal au doigt (mobile) — même ordre de grandeur que le swipe déjà en place sur CalendarHeader (55px)
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

    function tryNavigate(dir: "prev" | "next") {
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

    function handleWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      if (Math.abs(e.deltaX) < THRESHOLD) return;
      tryNavigate(e.deltaX < 0 ? "prev" : "next");
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchTracking = false;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchTracking = true;
    }

    /* Même convention de sens qu'un vrai swipe carrousel (et que CalendarHeader.tsx) : glisser le
       doigt vers la gauche (dx < 0) = avancer ("next"), vers la droite (dx > 0) = reculer ("prev")
       — signe inverse de deltaX au wheel, cohérent car deltaX représente le mouvement du contenu
       (convention "scroll naturel"), pas le déplacement brut du doigt. */
    function handleTouchEnd(e: TouchEvent) {
      if (!touchTracking) return;
      touchTracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < TOUCH_THRESHOLD) return;
      tryNavigate(dx < 0 ? "next" : "prev");
    }

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, enabled, mode]);
}
