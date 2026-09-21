"use client";

/* Point pulsant "il y a quelque chose à voir ici", uniforme entre /today (carte wellness),
   Coach Control (CoachCard) et Planning (carte "Aujourd'hui", DayColumn.tsx) — 2026-09, retour de
   Gildas : le halo vivait jusqu'ici sur le CONTOUR de la carte entière sur /today et Coach Control
   (mécanisme différent de Planning, qui n'avait que le halo de l'AlertBox, sans point) — un seul
   mécanisme partout maintenant : le halo pulse UNIQUEMENT sur l'AlertBox elle-même (voir
   AlertBox.tsx, `pulse`), et ce point (avec son propre petit halo, indépendant du contour de la
   carte) signale juste "regarde ici" en haut à droite, où qu'il soit posé. Contour de carte
   redevenu statique partout (plus de border-pulse sur la carte hôte). */
export default function PulseDot({ color, top = 14, right = 14, size = 9 }: { color: string; top?: number; right?: number; size?: number }) {
  return (
    <>
      <style>{`
        @keyframes perf-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 ${color}00; }
          50% { opacity: 0.55; transform: scale(1.35); box-shadow: 0 0 10px 2px ${color}8c; }
        }
      `}</style>
      <div style={{
        position: "absolute", top, right, zIndex: 4,
        width: size, height: size, borderRadius: "50%", background: color,
        animation: "perf-pulse-dot 1.8s ease-in-out infinite",
      }} />
    </>
  );
}
