/* Famille de mouvement d'une ligne de séance (2026-11-02). Sert au générateur de programmes pour ne
   jamais ajouter, au titre d'un point faible, un mouvement que la séance contient déjà : un sportif
   powerlifting avec « Jambes » recevait « Squat — 3×12 » à la fin de son Focus Squat, après le back
   squat et le squat pause. Deux lignes de la même famille = le même geste sous un autre nom
   (« Squat », « Back squat », « Squat pause 2 s »), pas deux exercices différents. */

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// L'ordre compte : la première famille qui correspond gagne (les variantes nommées avant le
// mouvement générique qu'elles contiennent, « squat jump » avant « squat »).
const FAMILIES: [string, RegExp][] = [
  ["squat_jump", /squat (jump|saute)|jump squat/],
  ["box_jump", /box jump/],
  ["squat_mobilite", /squat cosaque|cossack/],
  ["squat_olympique", /squat arrache|overhead squat/],
  ["fente", /fente|lunge|split squat|step.?up/],
  ["squat", /squat/],
  ["souleve_de_terre", /souleve de terre|deadlift|\bsdt\b|\brdl\b/],
  ["hip_thrust", /hip thrust|pont fessier|glute bridge/],
  ["leg_curl", /leg curl|nordic|curl ischio/],
  ["developpe_couche", /developpe couche|bench press/],
  ["developpe_incline", /developpe incline/],
  ["developpe_militaire", /developpe militaire|push press|developpe epaules|overhead press/],
  ["tirage_horizontal", /rowing|tirage horizontal/],
  ["tirage_vertical", /tirage vertical|traction|pull.?up|chin.?up/],
  ["curl_bras", /^curl|curl (barre|haltere|marteau|incline)/],
  ["triceps", /triceps|\bdips\b|barre au front/],
  ["elevations_laterales", /elevations? laterales?/],
  ["ecarte", /ecarte|butterfly|pec deck/],
  ["gainage_lateral", /gainage lateral|planche laterale|side plank/],
  ["planche", /^planche( |$)|^plank/],
  ["pallof", /pallof/],
  ["sprint", /sprint/],
  ["snatch_balance", /snatch balance/],
  ["tirage_arrache", /tirage arrache/],
  ["epaule", /epaule (suspendu|debout|puissance|force|\+)|^epaule$|power clean/],
  ["jerk", /jete|jerk/],
];

/** Nom du mouvement d'une ligne (« Back squat — 4×7@65% » → « back squat »), sans accents. */
export function movementName(line: string): string {
  return strip(line.split(/\s+—\s+|\s+:\s*$/)[0]).replace(/\s+/g, " ").trim();
}

/** Famille du mouvement, ou son nom normalisé quand aucune famille connue ne correspond. */
export function movementFamily(line: string): string {
  const name = movementName(line);
  for (const [family, re] of FAMILIES) if (re.test(name)) return family;
  return name;
}

/** Familles présentes dans des notes de séance (une ligne par exercice, blocs compris). */
export function familiesIn(notes: string): Set<string> {
  return new Set(notes.split("\n").map(l => l.trim()).filter(Boolean).map(movementFamily));
}
