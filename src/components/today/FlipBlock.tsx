"use client";

import { useEffect, useState } from "react";

/* Bloc qui pivote sous l'anneau (2026-11-04, POC « L'anneau, niveau 4 ») : moins de texte à l'écran sans
   perdre d'info. Devant : le conseil du jour ; au dos : la Phase. Un toucher n'importe où dans le bloc le
   retourne, sauf sur un bouton ou un lien. Sans dos, rien ne pivote.
   06/11 (Gildas, « cohérence de l'affichage ») : même gabarit sur les deux faces (étiquette en capitales,
   texte, indication « ↻ » au même endroit), texte calé en haut des deux côtés, surface légère pour qu'on
   lise une carte qui se retourne, et les boutons (`below`) hors du bloc : ils ne tournent jamais. */
export default function FlipBlock({ front, back, backLabel, below, actions, frontLabel = "Conseil du jour" }: {
  /* Boutons de la décision (Maintenir / Alléger) : dans la carte, sous le conseil, au-dessus de « ↻ Voir la phase » (06/11, Gildas). */
  actions?: React.ReactNode;
  /* Étiquette de la face avant (repos, séance faite : ce n'est pas un conseil). */
  frontLabel?: string;
  front: React.ReactNode;
  back?: React.ReactNode;
  /* Nom de la phase affiché dans l'étiquette du dos et dans l'indication ; absent = « Phase ». */
  backLabel?: string | null;
  /* Boutons du conseil (Maintenir / Alléger, Démarrer) : sous la carte, fixes. */
  below?: React.ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  /* Lu après le montage : calculé pendant le rendu, il différait entre serveur et navigateur (hydratation). */
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);

  const kicker = (txt: React.ReactNode) => (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 8, padding: "0 30px", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>{txt}</div>
  );
  /* Icône boucle en haut à droite de la carte (06/11, Gildas) : à la place de « ↻ Voir la phase » en bas. */
  const flipIcon = (
    <span aria-hidden style={{ position: "absolute", top: 10, right: 12, width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.7)", fontSize: 14, lineHeight: 1 }}>↻</span>
  );
  const surface: React.CSSProperties = {
    gridArea: "1 / 1", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-start",
    padding: "14px 18px 12px", borderRadius: 20, background: "rgba(255,255,255,.045)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  };
  const frontKicker = kicker(frontLabel);

  if (!back) {
    return (
      <>
        {/* Sans dos : pas de grille à pivot, la carte suit le flux (gridArea la posait sur l'anneau dans une grille parente). */}
        <div style={{ ...surface, gridArea: undefined, display: "flex" }}>{frontKicker}{front}{actions}</div>
        {below}
      </>
    );
  }
  const toggle = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, [role='button']:not([data-flip])")) return;
    setFlipped(f => !f);
  };
  return (
    <>
      <div
        data-flip role="button" tabIndex={0} aria-pressed={flipped}
        aria-label={flipped ? "Revenir au conseil" : `Voir la phase${backLabel ? ` : ${backLabel}` : ""}`}
        onClick={toggle}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setFlipped(f => !f); } }}
        style={{ perspective: 900, cursor: "pointer", outline: "none" }}
      >
        <div style={{ display: "grid", position: "relative", transformStyle: "preserve-3d", transition: reduce ? "none" : "transform .5s cubic-bezier(.22,1,.36,1)", transform: flipped ? "rotateY(180deg)" : "none" }}>
          <div style={{ ...surface, pointerEvents: flipped ? "none" : undefined }} aria-hidden={flipped}>
            {frontKicker}
            {front}
            {actions}
            {flipIcon}
          </div>
          <div style={{ ...surface, transform: "rotateY(180deg)", pointerEvents: flipped ? undefined : "none" }} aria-hidden={!flipped}>
            {/* « Phase », puis son nom en dessous (06/11, Gildas). */}
            {kicker(<span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>Phase{backLabel && <span style={{ color: "#fff", background: "rgba(255,255,255,.14)", borderRadius: 999, padding: "2px 9px", letterSpacing: "0.04em" }}>{backLabel}</span>}</span>)}
            {back}
            {flipIcon}
          </div>
        </div>
      </div>
      {below}
    </>
  );
}
