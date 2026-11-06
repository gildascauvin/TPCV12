"use client";

import MiniScoreArc from "@/components/ui/MiniScoreArc";
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
  /* 06/11 : même arc de 240° que les grands anneaux (MiniScoreArc), récup en bleu, chiffre en blanc. */
  return <MiniScoreArc score={score} size={52} label="récup" />;
}
