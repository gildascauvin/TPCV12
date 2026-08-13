// Applique un delta % aux charges kg d'une ligne d'exercice (feature "Reconduire").
// Ne modifie JAMAIS : distances (m, km), durées (min, s, sec), NxM, RPE, %.
// Modifie : "@ Xkg", "@ X,X", "@ X kg", "Xkg" standalone. Arrondit au 0.5 kg le plus proche.

export function parseAndApply(text: string, pct: number): string {
  if (pct === 0) return text;
  const factor = 1 + pct / 100;

  let result = text.replace(/@\s*(\d+(?:[.,]\d+)?)\s*(kg)?(?=\b|$)/g, (match, num: string, unit?: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const rounded = Math.round(val * factor * 2) / 2;
    const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace(".", ",");
    return "@ " + str + (unit ? " kg" : "");
  });

  result = result.replace(/(?<!@\s{0,5})\b(\d+(?:[.,]\d+)?)\s*(kg)\b/g, (match, num: string, unit: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const rounded = Math.round(val * factor * 2) / 2;
    const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace(".", ",");
    return str + " " + unit;
  });

  return result;
}

export function hasLoadChange(before: string, pct: number): boolean {
  return parseAndApply(before, pct) !== before;
}

// Répercute le même % sur la difficulté prévue (1-10) — une surcharge/décharge des charges kg
// doit aussi se voir sur la jauge, sinon la séance affiche un texte plus dur/plus léger avec une
// difficulté inchangée. Alimente aussi les jauges dérivées (avgWeekRpe côté programmes).
export function adjustDifficulty(diff: number, pct: number): number {
  if (pct === 0) return diff;
  return Math.max(1, Math.min(10, Math.round(diff * (1 + pct / 100))));
}
