// Point d'entrée historique de l'ajustement d'une ligne d'exercice. Depuis le 2026-10-07, délègue au
// moteur unique (sessionLevers.ts, parseur exerciseParser.ts) : décisions, aperçus, Reconduire,
// Dupliquer, acclimatation et simulateurs utilisent tous les mêmes leviers. Les appelants n'ont pas
// changé de signature.
import { adjustLine, type LeverOptions } from "./sessionLevers";

export function parseAndApply(text: string, pct: number, opt?: LeverOptions): string {
  if (!pct) return text;
  // une ligne par appel, mais certains appelants passent des notes entières
  return text.split("\n").map(l => adjustLine(l, pct, opt).text).join("\n");
}

// Répercute le même % sur la difficulté prévue (1-10) — une surcharge/décharge doit aussi se voir sur
// la jauge. Alimente aussi les jauges dérivées (avgWeekRpe côté programmes).
export function adjustDifficulty(diff: number, pct: number): number {
  if (pct === 0) return diff;
  return Math.max(1, Math.min(10, Math.round(diff * (1 + pct / 100))));
}
