"use client";

import { useEffect, useRef, useState } from "react";

/* Séance validée (2026-10-27) : grosse coche verte qui se dessine au centre de la carte, puis s'efface.
   La carte doit être en position relative. Purement décoratif, ne bloque aucun clic. Partagé par les
   cartes de l'Accueil, du Planning (sportif et coach) et de Coach Control. */
export function useJustDone(done: boolean | null | undefined, ms = 1300) {
  const [justDone, setJustDone] = useState(false);
  const prev = useRef(done);
  useEffect(() => {
    const was = prev.current;
    prev.current = done;
    if (!was && done) {
      setJustDone(true);
      const t = setTimeout(() => setJustDone(false), ms);
      return () => clearTimeout(t);
    }
  }, [done, ms]);
  return justDone;
}

export default function DoneBurst({ radius = 24, size = 64 }: { radius?: number; size?: number }) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: radius, pointerEvents: "none", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.72)", animation: "tpcFadeOut .35s .95s ease forwards" }}>
      <svg width={size} height={size} viewBox="0 0 64 64" style={{ animation: "tpcPop .45s cubic-bezier(.2,0,0,1)" }}>
        <circle cx="32" cy="32" r="30" fill="#2f9e44" />
        <path d="M19 33.5l8.5 8.5L45 24.5" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: "tpcCheckDraw .4s .2s ease-out forwards" }} />
      </svg>
    </div>
  );
}
