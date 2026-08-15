import { wellnessColor } from "@/lib/wellness";

/* Pièces visuelles vraiment partagées entre la vraie carte de partage (ShareView.tsx, rendu
   navigateur) et l'image OG (opengraph-image.tsx, rendu satori) — extraites ici pour être
   importées telles quelles des deux côtés, single source de vérité. Objectif : arrêter le drift
   constaté deux fois de suite (v3 : rotation du ring oubliée sur l'image OG ; v4 : contenu de la
   carte wellness incomplet) — désormais, toute évolution de ces pièces (couleurs, rayon, style de
   pastille) s'applique automatiquement aux deux rendus, pas seulement à un des deux si on oublie
   l'autre fichier.

   Seules les pièces suffisamment simples pour ça sont ici : pas de hooks, pas d'API navigateur, CSS
   satori-compatible (`<span>` remplacé par `<div display:flex>` — visuellement identique dans un
   vrai navigateur puisque les items flex sont de toute façon "blockifiés" par le CSS, mais requis
   explicitement par satori). Les charts interactifs (ZoneSparkline/SparkLineClient/ZoneBadge —
   hooks, tooltips, décimation) ne peuvent structurellement pas tourner dans satori et restent
   hand-portés séparément dans opengraph-image.tsx (voir son commentaire d'en-tête pour le détail de
   ce compromis assumé). `DiffGauge` (src/components/calendar/DiffGauge.tsx) est déjà assez simple
   pour être importé directement des deux côtés sans extraction ici.

   `fontSize`/`padding`/`rowPadding` sont paramétrables (avec les valeurs réelles de ShareView.tsx en
   défaut, donc aucun changement pour l'app) : l'image OG vise un canvas 1200×630 généralement
   affiché en miniature réduite dans une conversation, alors que la vraie carte vit dans une colonne
   ~460px CSS sur un écran de téléphone — même structure/couleurs, tailles adaptées au contexte
   d'affichage plutôt qu'un seul jeu de valeurs qui serait soit illisible en miniature, soit
   disproportionné dans l'app. */

export interface ShareBehavior { emoji: string; label: string; positive: boolean }

export function ShareRing({ score, size = 84 }: { score: number | null; size?: number }) {
  const r = Math.round(size * 0.42);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const color = wellnessColor(score);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", background: "linear-gradient(145deg,#171717,#2f2f2f)", display: "flex" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "flex" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={Math.round(size * 0.08)} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={Math.round(size * 0.08)} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.3), fontWeight: 900, letterSpacing: "-0.04em", color }}>{score ?? "—"}</div>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.1), fontWeight: 900, letterSpacing: "0.12em", color: "rgba(255,255,255,.55)", marginTop: 2, textTransform: "uppercase" }}>récup.</div>
      </div>
    </div>
  );
}

export function ShareChip({ b, fontSize = 12, padding = "4px 10px" }: { b: ShareBehavior; fontSize?: number; padding?: string }) {
  return (
    <div style={{ display: "flex", fontSize, fontWeight: 700, padding, borderRadius: 999, background: b.positive ? "rgba(47,158,68,.18)" : "rgba(212,64,0,.22)", color: b.positive ? "#bfeec8" : "#ffd2bf" }}>
      {b.emoji} {b.label}
    </div>
  );
}

export function ShareExerciseList({ exercises, max, fontSize = 13.5, rowPadding = "10px 12px" }: {
  exercises: string[]; max?: number; fontSize?: number; rowPadding?: string;
}) {
  const shown = max ? exercises.slice(0, max) : exercises;
  const more = exercises.length - shown.length;
  if (!shown.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(0,0,0,.07)", borderRadius: 14, overflow: "hidden" }}>
      {shown.map((ex, i) => (
        <div key={i} style={{ display: "flex", padding: rowPadding, borderTop: i > 0 ? "1px solid rgba(0,0,0,.06)" : "none", fontSize, lineHeight: 1.45, color: "#2c3236", fontWeight: 650, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {ex}
        </div>
      ))}
      {more > 0 && (
        <div style={{ display: "flex", padding: rowPadding, borderTop: "1px solid rgba(0,0,0,.06)", fontSize: Math.round(fontSize * 0.85), color: "#9a9ea1" }}>+{more} autre{more > 1 ? "s" : ""}</div>
      )}
    </div>
  );
}
