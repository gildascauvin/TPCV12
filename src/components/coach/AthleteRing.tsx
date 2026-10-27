"use client";

import { wellnessColor } from "@/lib/wellness";
import type { TrendCode } from "@/lib/trainingLoad";

// Reste en Status (rouge/orange/vert) — colore le badge d'état "Disponible"/"Stable"/"À
// surveiller", pas un ring : job Status légitime (texte+couleur = état, pas magnitude).
// AthleteRing ci-dessous utilise wellnessColor (Sequential bleu) pour le ring lui-même.
// Label ET couleur dans une seule fonction (pas 2 séparées) — bug réel trouvé par Gildas sinon :
// l'ancienne scoreColor(s) ignorait le paramètre trend, donc un score élevé (vert) avec un trend
// "accumulation"/"fatigue_persistante" affichait "À surveiller" en vert au lieu de rouge.
const TREND_WATCH: ReadonlySet<TrendCode> = new Set<TrendCode>(["accumulation", "fatigue_persistante"]);
// Réutilisée telle quelle par l'illustration onboarding "3 sportifs" (DecisionStep, via
// FrisePreviews.tsx) — même règle produit. Vit ici et non dans AthletesClient.tsx : l'importer depuis
// la page embarquait toute la page coach dans l'inscription.
export function athleteStatus(s: number | null, trend?: TrendCode | null): { label: string; color: string } {
  if (s === null) return { label: "Non renseigné", color: "#8a8f94" };
  if (trend && TREND_WATCH.has(trend)) return { label: "À surveiller", color: "#d10000" };
  if (s >= 75) return { label: "Disponible", color: "#2f9e44" };
  if (s >= 60) return { label: "Stable", color: "#f28a00" };
  return { label: "À surveiller", color: "#d10000" };
}

/* Anneau de récupération 52px (liste des sportifs, lignes du Coach Control). Extrait
   d'AthletesClient.tsx le 2026-10-05 pour être réutilisé sans importer toute la page. */
export function AthleteRing({ score }: { score: number | null }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = score === null ? circ : +(circ * (1 - score / 100)).toFixed(1);
  const color = score === null ? "rgba(255,255,255,0.28)" : wellnessColor(score);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color }}>{score !== null ? score : "—"}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>récup</span>
      </div>
    </div>
  );
}
