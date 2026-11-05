"use client";

import { illuPos, sportIllustration } from "@/lib/sportPhoto";
import { ringTint } from "@/lib/ringAmbience";

/* Photo du sport en bandeau derrière l'anneau (2026-11-04, POC « L'anneau, niveau 4 ») : même bichromie
   que les bilans (gris × couleur claire en multiply, puis éclairci vers la couleur sombre), teintée par la
   couleur de la décision. Le centre est assombri derrière l'anneau pour garder la zone et le curseur
   lisibles, et le bas se fond dans le fond de la page. Sans sport reconnu : rien (fond actuel). */
/* Photos de 480 px de large au plus (faites pour les vignettes) : sur ordinateur, le bandeau se limite à la
   colonne de contenu (`maxWidth`, côtés fondus) au lieu de toute la page. Pas de flou (refusé par Gildas). */
export default function SportBanner({ sport, color, height = 440, radius = 0, zIndex = 0, maxWidth }: {
  sport: string | null | undefined;
  color: string | null | undefined;
  height?: number | string;
  radius?: number;
  /* -1 dans un parent `isolation: isolate` : sous le contenu, au-dessus du fond. */
  zIndex?: number;
  maxWidth?: number;
}) {
  const src = sportIllustration(sport);
  if (!src) return null;
  const [dark, light] = ringTint(color);
  return (
    <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height, pointerEvents: "none", overflow: "hidden", isolation: "isolate", zIndex, borderRadius: radius ? `${radius}px ${radius}px 0 0` : undefined,
      ...(maxWidth ? { left: "50%", right: "auto", width: `min(100%, ${maxWidth}px)`, transform: "translateX(-50%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)", maskImage: "linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)" } : {}) }}>
      <div style={{ position: "absolute", inset: 0, background: light, transition: "background .8s" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: illuPos(src), filter: "grayscale(1) contrast(1.3) brightness(1.2)", mixBlendMode: "multiply" }} />
        <div style={{ position: "absolute", inset: 0, background: dark, mixBlendMode: "lighten", transition: "background .8s" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 46%, rgba(7,10,13,.85) 0%, rgba(7,10,13,.55) 40%, transparent 66%), linear-gradient(180deg, rgba(7,10,13,.62) 0%, rgba(7,10,13,.38) 24%, rgba(7,10,13,.68) 58%, #070a0d 92%)" }} />
    </div>
  );
}
