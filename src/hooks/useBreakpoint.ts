"use client";

import { useState, useEffect, useLayoutEffect } from "react";

/* useLayoutEffect côté client (s'exécute avant que le navigateur peigne — corrige la largeur
   par défaut de 390 avant tout affichage visible, élimine le saut de mise en page mobile→desktop
   au montage) / useEffect côté serveur (useLayoutEffect logue un warning en SSR, aucun effet
   là-bas de toute façon). */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useBreakpoint() {
  const [w, setW] = useState(390);
  useIsomorphicLayoutEffect(() => {
    setW(window.innerWidth);
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMd: w >= 640, isLg: w >= 1024, w };
}
