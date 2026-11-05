import type { AutoregDir } from "@/lib/autoregulation";

/* Ambiance de l'anneau de décision (2026-11-04, POC « L'anneau, niveau 4 ») : l'anneau respire à un rythme
   qui suit la reco, avec un halo renforcé. Photo de sport derrière l'anneau essayée puis abandonnée (05/11,
   Gildas) : l'ambiance vient de l'état (couleur + souffle), pas d'une image. */

export type RingBreath = "wait" | "low" | "flat" | "high";

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
