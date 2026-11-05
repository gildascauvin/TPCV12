import type { AutoregDir } from "@/lib/autoregulation";

/* Ambiance de l'anneau de décision (2026-11-04, POC « L'anneau, niveau 4 ») : la photo du sport prend la
   couleur de la décision (bichromie sombre → claire) et l'anneau respire à un rythme qui suit la reco.
   La couleur reste toujours doublée par le titre et la flèche des boutons (jamais seule). */

export type RingBreath = "wait" | "low" | "flat" | "high";

/* Photo du sport derrière l'anneau (SportBanner) : prête mais coupée en prod le 2026-11-05 (Gildas hésite,
   photos de 480 px trop petites sur ordinateur). Repasser à true pour la rallumer sur /today et la carte coach ;
   le halo renforcé (`ambient`) suit la photo. */
export const SPORT_PHOTO_BEHIND_RING = false;

/* [couleur sombre, couleur claire] de la bichromie, à partir de la couleur de décision (decisionCardColor). */
export function ringTint(color: string | null | undefined): [string, string] {
  const c = (color ?? "").toLowerCase();
  if (c === "#d44000" || c === "#dc2626") return ["#2b0e02", "#ff9a5c"];
  if (c === "#f28a00") return ["#2a1800", "#ffc56b"];
  if (c === "#2f9e44") return ["#04170b", "#7bd897"];
  return ["#14181b", "#8d969e"];
}

/* Rythme : lent et lourd quand il faut alléger, vif quand on peut pousser, calme sinon. */
export function breathForDir(dir: AutoregDir | null | undefined): RingBreath {
  return dir === "low" ? "low" : dir === "high" ? "high" : "flat";
}

/* Variables CSS lues par les animations tpcBreath* (globals.css) : deux rythmes qui ne se recalent jamais. */
export const BREATH_VARS: Record<RingBreath, Record<string, string>> = {
  wait: { "--p1": "6.5s", "--p2": "9.7s", "--amp": "0.006", "--dy": "0px", "--rot": "0deg", "--g0": "0.35" },
  low: { "--p1": "7.6s", "--p2": "11.3s", "--amp": "0.005", "--dy": "1.2px", "--rot": "-0.25deg", "--g0": "0.45" },
  flat: { "--p1": "5.2s", "--p2": "7.9s", "--amp": "0.009", "--dy": "0px", "--rot": "0.15deg", "--g0": "0.5" },
  high: { "--p1": "3.9s", "--p2": "5.9s", "--amp": "0.015", "--dy": "-1.6px", "--rot": "0.3deg", "--g0": "0.6" },
};
