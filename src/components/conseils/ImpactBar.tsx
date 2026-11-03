"use client";

/* Impact d'un comportement (aide / neutre / pénalise), sorti de HomeAnalyticsSections le 2026-11-03
   pour être partagé avec les leviers du bilan sans charger tout l'onglet Récupération. */
export function behaviorStatus(impact: number) {
  const isPositive = impact > 0;
  const isNeutral  = Math.abs(impact) < 0.3;
  const color      = isNeutral ? "rgba(255,255,255,.35)" : isPositive ? "#2f9e44" : "#d10000";
  const impactStr  = isNeutral ? "0 pt" : `${impact > 0 ? "+" : ""}${impact.toFixed(1)} pts`;
  const statusLabel = isNeutral ? "Neutre" : isPositive ? "Aide" : "Pénalise";
  return { isPositive, isNeutral, color, impactStr, statusLabel };
}

/* Barre divergente de l'impact (aide à droite, pénalise à gauche), partagée avec les leviers du bilan
   (2026-11-03, Gildas : « utiliser en illu les jauges des corrélations de comportements »). */
export function ImpactBar({ impact, maxAbs }: { impact: number; maxAbs: number }) {
  const { isPositive, isNeutral, color } = behaviorStatus(impact);
  const width = Math.min(50, Math.abs(impact) / maxAbs * 50);
  return (
    <div style={{ position: "relative" as const, height: 12, background: "rgba(255,255,255,.10)", borderRadius: 8 }}>
      <div style={{ position: "absolute" as const, left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
      {!isNeutral && (
        <div style={{ position: "absolute" as const, top: 0, height: "100%", borderRadius: 8, background: color, ...(isPositive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }) }} />
      )}
    </div>
  );
}
export function impactPill(impact: number, text: string) {
  const { color, statusLabel } = behaviorStatus(impact);
  return <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 24, flexShrink: 0, whiteSpace: "nowrap" as const, color, background: `${color}26` }}>{statusLabel} {text}</span>;
}

