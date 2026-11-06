/* Couleurs des anneaux (OKLab : dégradés sans zone grise au milieu). */
/* Mélange de couleurs en OKLab (dégradés sans zone grise au milieu). */
const s2l = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c: number) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
const LAB: Record<string, number[]> = {};
function toLab(h: string) {
  if (LAB[h]) return LAB[h];
  const r = s2l(parseInt(h.slice(1, 3), 16)), g = s2l(parseInt(h.slice(3, 5), 16)), b = s2l(parseInt(h.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return (LAB[h] = [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]);
}
function fromLab([L, a, b]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return "#" + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map(x => l2s(x).toString(16).padStart(2, "0")).join("");
}
const MIX: Map<string, string> = new Map();
export function mixLab(a: string, b: string, t: number) {
  const key = `${a}${b}${Math.round(Math.max(0, Math.min(1, t)) * 400)}`;
  const hit = MIX.get(key); if (hit) return hit;
  const out = mixLabRaw(a, b, Math.round(Math.max(0, Math.min(1, t)) * 400) / 400);
  if (MIX.size > 4000) MIX.clear();
  MIX.set(key, out);
  return out;
}
function mixLabRaw(a: string, b: string, t: number) {
  const A = toLab(a), B = toLab(b), k = Math.max(0, Math.min(1, t));
  return fromLab(A.map((x, i) => x + (B[i] - x) * k));
}

/* Palette « Braise » de l'anneau de décision (2026-11-06, POC « Le curseur est le formulaire ») : la couleur
   dit où l'on est par rapport à la zone conseillée, pas la difficulté brute. Dans la zone : jade ; en
   dessous : bleu pétrole de plus en plus profond ; au-dessus : ocre, rouille puis bordeaux. Toujours doublée
   par la position du curseur, le secteur de la zone et le titre (daltonisme). */
const BRAISE: [number, string][] = [[-6, "#2f5d8a"], [-3, "#3f7f9a"], [-1.2, "#4f9e94"], [0, "#5fae7e"], [1.2, "#d6a24a"], [2.8, "#d44000"], [5.5, "#8e2a2a"]];
export function braiseColor(u: number, zoneLow: number, zoneHigh: number) {
  const lo = zoneLow - 0.35, hi = zoneHigh + 0.35, d = u < lo ? u - lo : u > hi ? u - hi : 0;
  if (d <= BRAISE[0][0]) return BRAISE[0][1];
  if (d >= BRAISE[BRAISE.length - 1][0]) return BRAISE[BRAISE.length - 1][1];
  for (let i = 1; i < BRAISE.length; i++) if (d <= BRAISE[i][0]) {
    const t = (d - BRAISE[i - 1][0]) / (BRAISE[i][0] - BRAISE[i - 1][0]);
    return mixLab(BRAISE[i - 1][1], BRAISE[i][1], t * t * (3 - 2 * t));
  }
  return BRAISE[BRAISE.length - 1][1];
}

/* Palettes des scores (06/11) : récup en bleu, charge (et difficulté d'une séance à venir) en orange.
   `f` 0..1 = position le long de l'arc ou de la barre. */
export const recupColor = (f: number) => mixLab("#d2e6ea", "#2f6d8f", f);
export const chargeColor = (f: number) => mixLab("#f7d9c6", "#d44000", f);
