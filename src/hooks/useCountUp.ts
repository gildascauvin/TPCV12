"use client";
import { useEffect, useRef, useState } from "react";

/* Chiffre qui monte jusqu'à sa valeur (2026-10-27) : au premier affichage, de 0 à `target` ; ensuite,
   de l'ancienne valeur à la nouvelle. Ease-out, `ms` par défaut 600. Mouvement réduit → valeur directe. */
export function useCountUp(target: number | null | undefined, ms = 600): number | null {
  const [value, setValue] = useState<number | null>(target == null ? null : 0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) { setValue(null); return; }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    if (reduced || ms <= 0 || start === target) { from.current = target; setValue(target); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const v = start + (target - start) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
