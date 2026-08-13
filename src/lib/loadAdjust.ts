// Applique un delta % aux charges ET au volume d'une ligne d'exercice (feature "Reconduire").
// Charges : "@ Xkg", "@ X,X", "@ X kg", "Xkg" standalone — arrondi au 0.5 kg le plus proche.
// Volume : reps (dans un NxM ou seules), distance (m/km), durée (min/h/s, "1h30"), rounds/tours,
// OTM/EMOM/AMRAP — chacun arrondi à un incrément "propre" pour son échelle plutôt qu'à l'unité.
// Ne modifie JAMAIS : le nombre de séries dans un NxM (seules les reps bougent), RPE, %.

function roundToStep(val: number, step: number): number {
  return Math.round(val / step) * step;
}

// Entiers (reps/rounds/OTM...) : jamais en dessous de 1, jamais de fraction affichée.
function scaleInt(val: number, factor: number): number {
  return Math.max(1, Math.round(val * factor));
}

export function parseAndApply(text: string, pct: number): string {
  if (pct === 0) return text;
  const factor = 1 + pct / 100;

  // ── Charges kg ──
  let result = text.replace(/@\s*(\d+(?:[.,]\d+)?)\s*(kg)?(?=\b|$)/g, (match, num: string, unit?: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const rounded = Math.round(val * factor * 2) / 2;
    const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace(".", ",");
    return "@ " + str + (unit ? " kg" : "");
  });

  // (?<![.,]) exclut aussi le cas où la 1re passe a laissé "127,5 kg" et où \b matche juste
  // après la virgule ("5" a bien une frontière de mot après ",") — sans ce garde-fou, ce "5"
  // isolé était re-scalé comme une charge séparée, corrompant "127,5" en "127,4,5".
  result = result.replace(/(?<!@\s{0,5})(?<![.,])\b(\d+(?:[.,]\d+)?)\s*(kg)\b/g, (match, num: string, unit: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const rounded = Math.round(val * factor * 2) / 2;
    const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace(".", ",");
    return str + " " + unit;
  });

  // ── Durée composite "1h30" (avant le passage générique "Xh" pour ne pas le fragmenter) ──
  result = result.replace(/\b(\d+)h(\d{2})\b/g, (match, h: string, mm: string) => {
    const totalMin = parseInt(h, 10) * 60 + parseInt(mm, 10);
    const scaled = Math.max(5, roundToStep(totalMin * factor, 5));
    const newH = Math.floor(scaled / 60);
    const newMin = scaled % 60;
    return `${newH}h${String(newMin).padStart(2, "0")}`;
  });

  // ── OTM / EMOM / AMRAP (le nombre représente des minutes/rounds) ──
  result = result.replace(/\b(\d+)\s*(OTM|EMOM|AMRAP)\b/gi, (match, num: string, unit: string) => {
    return `${scaleInt(parseFloat(num), factor)} ${unit}`;
  });

  // ── NxM : seules les reps (2e nombre) bougent, le nombre de séries reste fixe ──
  result = result.replace(/\b(\d+)\s*([xX×])\s*(\d+)\b/g, (match, sets: string, sep: string, reps: string) => {
    return `${sets}${sep}${scaleInt(parseFloat(reps), factor)}`;
  });

  // ── Reps seules ("10 reps") ──
  result = result.replace(/\b(\d+)\s*(reps?)\b/gi, (match, num: string, unit: string) => {
    return `${scaleInt(parseFloat(num), factor)} ${unit}`;
  });

  // ── Distance (km/m) — arrondi au 0,5 km ou au 5 m le plus proche ──
  result = result.replace(/\b(\d+(?:[.,]\d+)?)\s*(km|m)\b/gi, (match, num: string, unit: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const scaled = unit.toLowerCase() === "km" ? roundToStep(val * factor, 0.5) : roundToStep(val * factor, 5);
    const str = scaled % 1 === 0 ? String(scaled) : String(scaled).replace(".", ",");
    return `${str}${unit}`;
  });

  // ── Durée min/h/s (hors "1h30" déjà traité) — arrondi au 5 le plus proche ──
  result = result.replace(/\b(\d+(?:[.,]\d+)?)\s*(min|h|sec(?:ondes?)?|s)\b/gi, (match, num: string, unit: string) => {
    const val = parseFloat(num.replace(",", "."));
    if (isNaN(val)) return match;
    const scaled = Math.max(5, roundToStep(val * factor, 5));
    return `${scaled}${unit === "min" || unit.toLowerCase().startsWith("h") ? " " + unit : unit}`;
  });

  // ── Rounds / tours ──
  result = result.replace(/\b(\d+)\s*(rounds?|tours?)\b/gi, (match, num: string, unit: string) => {
    return `${scaleInt(parseFloat(num), factor)} ${unit}`;
  });

  return result;
}

export function hasLoadChange(before: string, pct: number): boolean {
  return parseAndApply(before, pct) !== before;
}

// Répercute le même % sur la difficulté prévue (1-10) — une surcharge/décharge (charge ET volume)
// doit aussi se voir sur la jauge, sinon la séance affiche un texte plus dur/plus léger avec une
// difficulté inchangée. Alimente aussi les jauges dérivées (avgWeekRpe côté programmes).
export function adjustDifficulty(diff: number, pct: number): number {
  if (pct === 0) return diff;
  return Math.max(1, Math.min(10, Math.round(diff * (1 + pct / 100))));
}
