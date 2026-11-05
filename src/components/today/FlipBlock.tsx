"use client";

import { useState } from "react";

/* Bloc qui pivote sous l'anneau (2026-11-04, POC « L'anneau, niveau 4 ») : moins de texte à l'écran sans
   perdre d'info. Devant : le conseil du jour et le bouton ; au dos : la Phase. L'indice donne le nom de la
   phase (« Phase · Accumulation ↻ »). Un toucher n'importe où dans le bloc le retourne, sauf sur un bouton
   ou un lien. Sans dos, rien ne pivote. */
export default function FlipBlock({ front, back, backLabel }: {
  front: React.ReactNode;
  back?: React.ReactNode;
  /* Nom de la phase affiché dans l'indice ; absent = « Phase ». */
  backLabel?: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!back) return <>{front}</>;
  const toggle = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, [role='button']:not([data-flip])")) return;
    setFlipped(f => !f);
  };
  const hint = (txt: string) => (
    <span style={{ display: "block", textAlign: "center", marginTop: 10, fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>{txt}</span>
  );
  const face: React.CSSProperties = { gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" };
  return (
    <div
      data-flip role="button" tabIndex={0} aria-pressed={flipped}
      aria-label={flipped ? "Revenir au conseil" : `Voir la phase${backLabel ? ` : ${backLabel}` : ""}`}
      onClick={toggle}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setFlipped(f => !f); } }}
      style={{ perspective: 900, cursor: "pointer", outline: "none" }}
    >
      <div style={{ display: "grid", position: "relative", transformStyle: "preserve-3d", transition: reduce ? "none" : "transform .55s cubic-bezier(.22,1,.36,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
        <div style={{ ...face, pointerEvents: flipped ? "none" : undefined }} aria-hidden={flipped}>
          {front}
          {hint(`Phase${backLabel ? ` · ${backLabel}` : ""} ↻`)}
        </div>
        <div style={{ ...face, transform: "rotateY(180deg)", pointerEvents: flipped ? undefined : "none" }} aria-hidden={!flipped}>
          {back}
          {hint("Conseil ↻")}
        </div>
      </div>
    </div>
  );
}
