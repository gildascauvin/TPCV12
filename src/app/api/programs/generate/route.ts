import type { ProgramTemplate, WeekTemplate, SessionTemplate, ProgramLevel, ProgramFocus, SessionLoad, SessionType } from "@/types";

// Périodisation par blocs de 4 semaines (MEV → Surcharge → MRV → Deload, terminologie RP) —
// remplace l'ancienne LOAD_PATTERNS (courbe plate indexée par durée totale, aucune notion de
// bloc). `duration` doit désormais être un multiple de 4 pour que chaque bloc soit complet.
// Phase 0=MEV / 1=Surcharge / 2=MRV / 3=Deload.
const PHASE_LOAD: SessionLoad[] = [1, 2, 3, 1];
const SHAPE_OFFSETS: Record<"volume" | "intensity" | "taper", number[]> = {
  volume:    [-1, 0, 2, -3], // accumulation régulière — objectif "volume" et repli par défaut
  intensity: [-2, 1, 3, -3], // ramp plus marqué — objectif "intensité"
  taper:     [-1, 0, 2, -4], // dernier bloc d'un objectif "compétition" — deload final plus profond
};
type Shape = "volume" | "intensity" | "taper";

function shapeForCycle(focus: ProgramFocus, cycleIndex: number, isLastCycle: boolean): Shape {
  if (focus === "intensite") return "intensity";
  if (focus === "competition") return isLastCycle ? "taper" : "volume";
  if (focus === "mixte") return cycleIndex % 2 === 0 ? "volume" : "intensity";
  return "volume"; // volume, technique, combat, autre — accumulation par défaut
}

// Prescription par exercice (séries/répétitions/%intensité), dérivée de la forme du bloc —
// jamais le nombre d'exercices. Les valeurs écrites dans EXERCISES servent d'ancre = la
// prescription "MRV d'un bloc volume" (phase 2, forme "volume" = multiplicateur 1.0/1.0/+0
// partout). Les autres phases/formes sont dérivées de cette même ancre par multiplicateur —
// pas besoin de ré-écrire une valeur différente à la main pour chaque case.
// Phase 0=MEV / 1=Surcharge / 2=MRV / 3=Deload.
const PRESCRIPTION_SHAPE: Record<Shape, { sets: number[]; qty: number[]; intensity: number[] }> = {
  volume:    { sets: [0.8, 1.0, 1.0, 0.6], qty: [0.8, 1.0, 1.0, 0.6], intensity: [-10, -5, 0, -15] },
  intensity: { sets: [1.0, 1.0, 1.0, 0.6], qty: [1.0, 0.8, 0.6, 0.4], intensity: [-5, 2, 10, -10] },
  taper:     { sets: [1.0, 1.0, 1.0, 0.5], qty: [1.0, 0.8, 0.5, 0.3], intensity: [-5, 3, 12, -15] },
};
const DEFAULT_INTENSITY_PCT = 75; // ancre par défaut pour un exercice "load" sans % déjà écrit dans le texte

interface ParsedExercise {
  name: string;
  mode: "load" | "duration" | "static";
  baseSets: number;
  baseQty: number;
  unit: string; // "" (reps), "min", "s", "m" (unités collées : "45s") ou "tour"/"série"/"round" (mots, espace + pluriel à l'affichage)
  wordUnit: boolean; // true pour tour/série/round — affichage "4 tours" et non "4tour" ni "1×4tour"
  baseIntensityPct: number | null;
  suffix: string; // texte accessoire préservé tel quel (ex. "(récup 90s)", "par jambe")
}

// Essaie une série de formats reconnus dans EXERCISES (le format n'a jamais été standardisé
// à l'écriture, donc plusieurs variantes coexistent) — repli sur "static" (texte inchangé,
// jamais reformaté) si aucun ne correspond, plutôt que de forcer un résultat probablement faux.
function parseExercise(raw: string): ParsedExercise {
  const base = { name: raw, mode: "static" as const, baseSets: 0, baseQty: 0, unit: "", wordUnit: false, baseIntensityPct: null, suffix: "" };

  const intensityPrefix = /^(.+?)\s+à\s+(\d+)%\+?(?:\s+\S+)?\s*—\s*(.+)$/;
  const mIntensity = raw.match(intensityPrefix);
  const name = mIntensity ? mIntensity[1] : raw.match(/^(.+?)\s*—\s*(.+)$/)?.[1] ?? raw;
  const rest = mIntensity ? mIntensity[3] : raw.match(/^(.+?)\s*—\s*(.+)$/)?.[2];
  const intensityPct = mIntensity ? Number(mIntensity[2]) : null;
  if (!rest) return base;

  // "5×5" / "3×45s" / "6×20m" — sets × qty avec unité optionnelle collée
  let m = rest.match(/^(\d+)\s*×\s*(\d+)(s|m)?\b(.*)$/);
  if (m) return { name, mode: "load", baseSets: +m[1], baseQty: +m[2], unit: m[3] ?? "", wordUnit: false, baseIntensityPct: intensityPct, suffix: m[4].trim() };

  // "6×3 min" — sets × durée en minutes
  m = rest.match(/^(\d+)\s*×\s*(\d+)\s*min\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: +m[1], baseQty: +m[2], unit: "min", wordUnit: false, baseIntensityPct: null, suffix: m[3].trim() };

  // "8 reps" / "4 tours" / "5 séries" / "8 rounds" — mot, pas d'unité collée, pas de vrai "sets"
  m = rest.match(/^(\d+)\s*(reps?|tours?|séries?|rounds?)\b(.*)$/);
  if (m) return { name, mode: "load", baseSets: 1, baseQty: +m[1], unit: m[2].replace(/s$/, ""), wordUnit: true, baseIntensityPct: intensityPct, suffix: m[3].trim() };

  // "20 min" — durée seule
  m = rest.match(/^(\d+)\s*min\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: 1, baseQty: +m[1], unit: "min", wordUnit: false, baseIntensityPct: null, suffix: m[2].trim() };

  // "1000m" / "50m" — distance seule, pas de série
  m = rest.match(/^(\d+)\s*m\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: 1, baseQty: +m[1], unit: "m", wordUnit: false, baseIntensityPct: null, suffix: m[2].trim() };

  return base; // plages ("50-80 min"), pyramides, formats composés — laissés statiques
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function pluralize(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}

function formatPrescription(spec: ParsedExercise, shape: Shape, phase: number): string {
  if (spec.mode === "static") return spec.name;
  const mult = PRESCRIPTION_SHAPE[shape];
  const sets = Math.max(1, Math.round(spec.baseSets * mult.sets[phase]));

  // Durées/distances (min/s/m) arrondies au multiple de 5 le plus proche ("20 min", "25m",
  // jamais "22m" ou "32s") — les reps/tours/séries restent de petits entiers naturels, un
  // arrondi à 5 les dénaturerait (5×3 ne doit jamais devenir 5×5).
  const rawQty = spec.baseQty * mult.qty[phase];
  const isDurationLike = spec.mode === "duration" || spec.unit === "s" || spec.unit === "m";
  const qty = isDurationLike ? Math.max(5, roundTo5(rawQty)) : Math.max(1, Math.round(rawQty));
  const suffix = spec.suffix ? ` ${spec.suffix}` : "";

  if (spec.mode === "duration") {
    const unitLabel = spec.unit === "min" ? " min" : spec.unit;
    const core = sets > 1 ? `${sets}×${qty}${unitLabel}` : `${qty}${unitLabel}`;
    return `${spec.name} — ${core}${suffix}`;
  }

  // mode === "load" — "tour"/"série"/"round" sont des mots (espace + pluriel, pas de "N×"
  // artificiel : "4 tours", jamais "1×4tour") ; "s"/"m"/"" restent collés à la valeur ("3×45s").
  const core = spec.wordUnit
    ? `${qty} ${pluralize(spec.unit, qty)}`
    : sets > 1 ? `${sets}×${qty}${spec.unit}` : `${qty}${spec.unit}`;
  const rawPct = (spec.baseIntensityPct ?? DEFAULT_INTENSITY_PCT) + mult.intensity[phase];
  const pct = Math.max(40, Math.min(100, roundTo5(rawPct)));
  return `${spec.name} — ${core}@${pct}%${suffix}`;
}

const FOCUS_DIST: Record<string, SessionType[]> = {
  mixte:      ["technique", "volume", "intensite", "volume", "recuperation", "intensite", "volume"],
  technique:  ["technique", "technique", "volume", "technique", "recuperation", "volume", "technique"],
  volume:     ["volume", "volume", "intensite", "volume", "recuperation", "volume", "volume"],
  intensite:  ["intensite", "technique", "intensite", "volume", "recuperation", "intensite", "intensite"],
  competition:["technique", "intensite", "volume", "intensite", "recuperation", "test", "intensite"],
  combat:     ["technique", "volume", "intensite", "technique", "recuperation", "intensite", "volume"],
  autre:      ["technique", "volume", "intensite", "volume", "recuperation", "intensite", "volume"],
};

const DAY_ORDER = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const LEVEL_BASE_DIFF: Record<ProgramLevel, number> = {
  debutant: 5,
  intermediaire: 6,
  avance: 7,
  elite: 8,
};

// Écart de difficulté par type de séance, relatif à la difficulté de base de la semaine —
// avant ce correctif, target_difficulty était identique pour toutes les séances d'une même
// semaine quel que soit leur type (une "Récupération" affichait la même jauge qu'une "Séance
// intensive" le même cycle).
const TYPE_DIFF_OFFSET: Record<SessionType, number> = {
  recuperation: -2,
  technique: -1,
  volume: 0,
  intensite: 1,
  test: 1,
};

const SESSION_NAMES: Record<SessionType, string[]> = {
  technique:   ["Séance technique", "Travail technique", "Affûtage technique"],
  volume:      ["Séance volume", "Travail de volume", "Construction volume"],
  intensite:   ["Séance intensive", "Travail d'intensité", "Pic d'intensité"],
  recuperation:["Récupération active", "Séance légère", "Décharge"],
  test:        ["Test & évaluation", "Bilan de cycle", "Séance test"],
};

type SportCategory = "halterophilie" | "sprint" | "combat" | "fitness" | "collectif" | "endurance" | "cyclisme" | "natation" | "ski" | "aviron" | "gymnastique" | "autre";

function getSportCategory(sport: string): SportCategory {
  const s = (sport ?? "").toLowerCase();
  if (s.includes("halt") || s.includes("power") || s.includes("force") || s.includes("muscu")) return "halterophilie";
  if (s.includes("sprint") || s.includes("athlé") || s.includes("piste") || s.includes("lancé") || s.includes("saut")) return "sprint";
  if (s.includes("combat") || s.includes("art") || s.includes("mma") || s.includes("judo") || s.includes("boxe") || s.includes("karaté") || s.includes("lutte")) return "combat";
  if (s.includes("fitness") || s.includes("cross") || s.includes("condition") || s.includes("forme") || s.includes("wod")) return "fitness";
  if (s.includes("collectif") || s.includes("foot") || s.includes("basket") || s.includes("rugby") || s.includes("handball") || s.includes("volley")) return "collectif";
  if (s.includes("nata") || s.includes("aqua") || s.includes("swim")) return "natation";
  if (s.includes("cycl") || s.includes("vélo") || s.includes("velo") || s.includes("bike")) return "cyclisme";
  if (s.includes("ski") || s.includes("snowboard")) return "ski";
  if (s.includes("aviron") || s.includes("rowing") || s.includes("rameur")) return "aviron";
  if (s.includes("gym") || s.includes("agrès") || s.includes("agres")) return "gymnastique";
  if (s.includes("run") || s.includes("marathon") || s.includes("trail") || s.includes("course") || s.includes("fond")) return "endurance";
  return "autre";
}

const EXERCISES: Record<SportCategory, Record<SessionType, string[]>> = {
  halterophilie: {
    technique: [
      "Arraché technique à 60% — 6×2",
      "Épaulé à genoux + montée (drill) — 5×3",
      "Tirage arraché lent — 4×4",
      "Squat avant pause basse — 4×3",
      "Mobilité chevilles et hanches — 10 min",
    ],
    volume: [
      "Back squat — 5×5",
      "Épaulé-jeté à 70% — 5×3",
      "Soulevé de terre roumain — 4×8",
      "Développé militaire — 4×8",
      "Fentes marchées — 3×12",
      "Gainage anti-rotation — 3×40s",
    ],
    intensite: [
      "Arraché compétition à 90%+ — 5×1",
      "Épaulé-jeté max effort — 5×1",
      "Squat avant lourd — 4×2",
      "Tirage haltère à 100%+ — 4×2",
    ],
    recuperation: [
      "Mobilité hanches et chevilles — 15 min",
      "Foam rolling chaîne postérieure",
      "Stretching actif épaules — 10 min",
      "Marche active — 20 min",
    ],
    test: [
      "Arraché : tentative de maximum",
      "Épaulé-jeté : tentative de maximum",
      "Squat avant : max du cycle",
      "Bilan technique (vidéo)",
    ],
  },

  sprint: {
    technique: [
      "Drills : montées de genoux — 4×30m",
      "Talons-fesses — 4×30m",
      "Foulées bondissantes — 4×30m",
      "Skipping A/B/C — 3×20m chaque",
      "Gamme complète sprint — 3 séries",
    ],
    volume: [
      "Sprint 60m à 80% — 8 reps",
      "Fartlek 20 min (1 min vif / 1 min calme)",
      "Pas courus spéciaux — 3×60m",
      "Squats + fentes + hip thrust — 4×10",
      "Gainage dynamique — 3×45s",
    ],
    intensite: [
      "Sprint 30m départ arrêté — 6 reps (récup 5 min)",
      "Sprint 60m à 95% — 4 reps",
      "Départs en blocs — 5×30m",
      "Pliométrie : sauts horizontaux — 3×6",
    ],
    recuperation: [
      "Jogging léger — 20 min",
      "Stretching actif membres inférieurs — 15 min",
      "Foam roller jambes",
      "Balnéo ou cryothérapie si disponible",
    ],
    test: [
      "Sprint 60m chronométré",
      "Sprint 100m (ou distance principale)",
      "Détente verticale : test saut",
      "Bilan biomécanique vidéo",
    ],
  },

  combat: {
    technique: [
      "Esquives et déplacements — 3×5 min",
      "Enchaînements techniques au sac — 5×3 min",
      "Shadow boxing — 4×3 min",
      "Combinaisons avec partenaire — 3×5 min",
    ],
    volume: [
      "Assauts légers — 6×3 min",
      "Sac lourd endurance — 5×3 min",
      "Circuit : tractions + dips + abdos — 4 tours",
      "Corde à sauter — 5×3 min",
      "Gainage + travail au sol — 3×45s",
    ],
    intensite: [
      "Assauts à intensité max — 4×3 min",
      "HIIT corde à sauter : 10×30s",
      "Sparring debout — 3×3 min",
      "Pliométrie combat : sauts + frappes — 3×6",
    ],
    recuperation: [
      "Yoga ou stretching global — 20 min",
      "Mobilité épaules, hanches, colonne",
      "Respiration et relaxation — 10 min",
      "Cryothérapie si disponible",
    ],
    test: [
      "Test vitesse de frappe",
      "Assaut de qualification",
      "Test endurance spécifique (rounds enchaînés)",
      "Bilan technique vidéo",
    ],
  },

  fitness: {
    technique: [
      "Squat overhead technique — 4×5",
      "Deadlift roumain focus posture — 4×6",
      "Pull-up avec bande — 4×6",
      "Développé haltères — 4×8",
      "Mobilité thoracique et hanches — 10 min",
    ],
    volume: [
      "Back squat — 4×10",
      "Développé couché — 4×10",
      "Tractions lestées — 4×8",
      "Fentes marchées — 3×12",
      "Ab wheel ou planche — 3×45s",
    ],
    intensite: [
      "AMRAP 15 min : 5 tractions + 10 pompes + 15 squats",
      "Tabata : burpees + kettlebell swings — 8 rounds",
      "Complex barbell : épaulé + squat + militaire — 5 séries",
      "Sprints rowing ou vélo : 6×250m effort max",
    ],
    recuperation: [
      "Vélo ou marche légère — 20 min",
      "Stretching global — 15 min",
      "Foam rolling dos et jambes",
      "Respiration et mobilité active",
    ],
    test: [
      "Test : max tractions strictes",
      "Test : squat 5RM",
      "Benchmark WOD",
      "VO2max indirect : test de Cooper",
    ],
  },

  collectif: {
    technique: [
      "Exercices techniques au poste — 20 min",
      "Passes + combinaisons à 2/3 — 15 min",
      "Travail défensif en situation réduite",
      "Prise d'information et placement — 15 min",
    ],
    volume: [
      "Circuit cardio : navettes + sauts + sprint — 4 tours",
      "Balle à intensité soutenue — 20 min",
      "Renforcement bas du corps — 4×10",
      "Gainage et proprioception — 3×45s",
    ],
    intensite: [
      "Jeux effectif réduit haute intensité — 3×8 min",
      "Intervalles : 8×15s effort / 45s récup",
      "Transitions défense/attaque — 4 séries",
      "Accélérations + changements de direction — 6×20m",
    ],
    recuperation: [
      "Jogging léger + gamme — 15 min",
      "Stretching membres inférieurs — 15 min",
      "Travail technique basse intensité",
      "Cryothérapie si disponible",
    ],
    test: [
      "Sprint 20m (avec et sans balle)",
      "Test de détente verticale",
      "Match de préparation",
      "Yo-Yo test ou équivalent",
    ],
  },

  endurance: {
    technique: [
      "Foulées éducatives — 4×100m",
      "Travail de foulée et technique de course — 20 min",
      "Côtes courtes 8% — 8×50m",
      "Travail de bras et gainage en course — 10 min",
    ],
    volume: [
      "Sortie longue en endurance fondamentale — 50-80 min",
      "Fartlek progressif — 40 min",
      "Renforcement : mollets + squats + fentes",
      "Gainage dynamique — 3×45s",
    ],
    intensite: [
      "Intervalles 400m allure 5km — 8 reps (récup 90s)",
      "Seuil lactique : 20 min continu",
      "Côtes longues 6% — 5×400m",
      "Tempo run — 30 min allure semi",
    ],
    recuperation: [
      "Footing léger très doux — 20-30 min",
      "Stretching global — 15 min",
      "Bain froid jambes",
      "Foam roller mollets et IT band",
    ],
    test: [
      "Test VMA : demi-Cooper ou 6 min",
      "Course sur distance cible",
      "Test de seuil lactique",
      "Bilan FC repos + effort",
    ],
  },

  cyclisme: {
    technique: [
      "Travail de cadence 100 rpm — 20 min",
      "Moulinage développement réduit — 15 min",
      "Position aéro + exercices de placement — 10 min",
      "Single leg pedaling — 3×2 min par jambe",
    ],
    volume: [
      "Sortie endurance Z2 (60-70% FCmax) — 60-90 min",
      "Travail en côte progressive — 30 min",
      "Renforcement : squat + leg press + gainage",
      "Intervalles doux : 2×20 min Z2/Z3",
    ],
    intensite: [
      "Intervalles VO2max : 5×4 min à 110% FTP (récup 4 min)",
      "Sprints : 6×15s all-out (récup 5 min)",
      "Montée longue : 2×15 min au seuil",
      "Pyramide puissance : 3-4-5-4-3 min",
    ],
    recuperation: [
      "Vélo doux Z1 — 30 min",
      "Stretching quadriceps, fléchisseurs, mollets",
      "Foam rolling jambes et dos",
      "Mobilité hanches et genoux",
    ],
    test: [
      "Test FTP : 20 min à puissance max",
      "Sprint 10s : puissance maximale",
      "VO2max indirect : test 5 min",
      "Bilan puissance sur segment référence",
    ],
  },

  natation: {
    technique: [
      "Drill catch-up crawl — 4×50m",
      "Nage avec palmes (jambes seules) — 4×50m",
      "Travail de virage et poussée mur — 20 min",
      "Coordination bras/souffle — 3×100m",
    ],
    volume: [
      "Série de fond : 10×100m (récup 15s)",
      "Pyramide : 200-400-600-400-200m",
      "Nage alternée 4 nages — 1000m",
      "Renforcement sec : gainage + tractions — 3×10",
    ],
    intensite: [
      "Sprints : 10×50m (récup 1 min)",
      "Intervalles VO2 : 4×200m effort max (récup 3 min)",
      "Départs plongeon compétition — 6 reps",
      "Virages haute intensité — 10 reps",
    ],
    recuperation: [
      "Nage très douce — 20-30 min",
      "Stretching épaules et mobilité globale",
      "Eau froide + relaxation",
      "Mobilité thoracique et hanches",
    ],
    test: [
      "Test 400m allure compétition",
      "Sprint 50m chronométré",
      "Test VO2 : 3×300m progressif",
      "Bilan technique vidéo",
    ],
  },

  ski: {
    technique: [
      "Position de ski statique (chaise) + transferts d'appui — 4×45s",
      "Proprioception genou sur plateau instable — 3×10 par jambe",
      "Fentes latérales dynamiques (dévers) — 4×10 par jambe",
      "Gainage rotatoire type slalom — 3×40s",
    ],
    volume: [
      "Squat bulgare — 4×10 par jambe",
      "Chaise au mur — 4×60s",
      "Fentes marchées + rotation tronc — 3×12",
      "Gainage complet : planche + gainage latéral — 3×45s",
      "Mollets debout — 4×15",
    ],
    intensite: [
      "Pliométrie latérale : sauts de côté — 4×10",
      "Squat jump — 5×8",
      "Circuit explosivité jambes : squats sautés + fentes sautées — 4 tours",
      "Sprints courts en côte — 6×20m",
    ],
    recuperation: [
      "Mobilité chevilles et hanches — 15 min",
      "Stretching quadriceps et ischio-jambiers — 15 min",
      "Foam rolling jambes complètes",
      "Vélo léger — 20 min",
    ],
    test: [
      "Test chaise au mur : temps max",
      "Test squat jump : hauteur",
      "Test proprioception unipodal : temps de tenue",
      "Bilan gainage : planche max",
    ],
  },

  aviron: {
    technique: [
      "Rameur technique basse intensité : focus séquence jambes-dos-bras — 20 min",
      "Tirage horizontal poulie, focus gainage — 4×10",
      "Rameur : drill par segments (jambes seules / dos seul / bras seuls) — 15 min",
      "Mobilité thoracique et hanches — 10 min",
    ],
    volume: [
      "Rameur endurance continue — 30-40 min à allure modérée",
      "Soulevé de terre — 4×8",
      "Tirage vertical + tirage horizontal — 4×10",
      "Gainage anti-flexion (planche + superman) — 3×45s",
    ],
    intensite: [
      "Rameur intervalles : 6×500m (récup 2 min)",
      "Rameur sprint : 8×250m effort max (récup 90s)",
      "Squat + tirage complexe — 4×6",
      "Circuit puissance : deadlift + row + squat jump — 4 tours",
    ],
    recuperation: [
      "Rameur très léger — 15 min",
      "Stretching dos, épaules, ischio-jambiers — 15 min",
      "Foam rolling dos et jambes",
      "Mobilité colonne thoracique — 10 min",
    ],
    test: [
      "Test rameur 2000m chronométré",
      "Test rameur 500m sprint",
      "Test deadlift 5RM",
      "Bilan technique vidéo du geste",
    ],
  },

  gymnastique: {
    technique: [
      "Gainage statique : ATR contre mur — 4×20-30s",
      "Placement bassin et gainage en suspension — 4×15s",
      "Technique de réception de saut — 4×6",
      "Mobilité épaules et poignets — 15 min",
    ],
    volume: [
      "Tractions strictes — 4×6",
      "Dips — 4×8",
      "L-sit ou tuck-sit tenu — 4×15-20s",
      "Pompes déclinées — 3×12",
      "Gainage complet : planche + gainage latéral — 3×40s",
    ],
    intensite: [
      "Pliométrie : sauts groupés + réceptions — 4×6",
      "Muscle-up ou tractions explosives — 4×5",
      "Circuit force relative : tractions + dips + pompes — 4 tours",
      "Handstand hold contre mur — 4×20s",
    ],
    recuperation: [
      "Mobilité épaules, hanches, poignets — 15 min",
      "Stretching global — 15 min",
      "Foam rolling dos et épaules",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test tractions strictes max",
      "Test ATR/handstand : temps de tenue",
      "Test L-sit : temps max",
      "Bilan technique vidéo",
    ],
  },

  autre: {
    technique: [
      "Échauffement technique spécifique — 15 min",
      "Exercices de coordination et placement — 20 min",
      "Travail des gestes fondamentaux — 3 séries",
      "Mobilité et activation musculaire — 10 min",
    ],
    volume: [
      "Travail de fond à intensité modérée — 30-45 min",
      "Circuit : squats + fentes + pompes — 4 tours",
      "Gainage : planche + rotation + pont fessier — 3×45s",
      "Corde à sauter endurance — 5×3 min",
    ],
    intensite: [
      "Intervalles : 8×30s effort max / 90s récup",
      "Circuit haute intensité — 5 exercices × 4 tours",
      "Sprints courts — 6×20m",
      "Travail de puissance : sauts, explosions — 4×6",
    ],
    recuperation: [
      "Activité légère au choix — 20 min",
      "Stretching global — 15 min",
      "Foam rolling zones de travail",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test de condition physique globale",
      "Benchmark spécifique à la discipline",
      "Test de force ou d'endurance clé",
      "Bilan et ajustement du programme",
    ],
  },
};

function buildNotes(category: SportCategory, type: SessionType, cycleIndex: number, shape: Shape, phase: number): string {
  // Rotation ancrée sur le bloc (cycleIndex), pas sur la semaine — les 4 semaines d'un même
  // bloc montrent toujours les mêmes exercices, seule leur prescription (séries/reps/%) change
  // semaine après semaine. Nombre d'exercices toujours constant, jamais tronqué.
  const bank = EXERCISES[category][type];
  const offset = (cycleIndex * 2) % bank.length;
  const rotated = [...bank.slice(offset), ...bank.slice(0, offset)];

  // Prescription dynamique (séries/répétitions/%intensité) uniquement pour les séances
  // "volume"/"intensite" — c'est là que la surcharge progressive a un sens réel. Les banques
  // technique/récupération/test restent du texte statique, non reformaté (une récup ne "monte
  // pas en charge", un test est un événement, pas une prescription qui progresse).
  if (type !== "volume" && type !== "intensite") return rotated.join("\n");
  return rotated.map(line => formatPrescription(parseExercise(line), shape, phase)).join("\n");
}

function sessionName(type: SessionType, weekIdx: number, dayIdx: number): string {
  const names = SESSION_NAMES[type];
  return names[(weekIdx + dayIdx) % names.length];
}

export async function POST(req: Request) {
  const body = await req.json();
  const { sport, level, days, duration, focus } = body as {
    sport: string;
    level: ProgramLevel;
    days: string[];
    duration: 4 | 8 | 12;
    focus: ProgramFocus;
  };

  if (!level || !days?.length || !duration || !focus || duration % 4 !== 0) {
    return Response.json({ error: "Paramètres manquants ou durée invalide (multiple de 4 semaines requis)" }, { status: 400 });
  }

  const category = getSportCategory(sport ?? "");
  const focusDist = FOCUS_DIST[focus] ?? FOCUS_DIST.autre;
  const baseDiff = LEVEL_BASE_DIFF[level] ?? 6;
  const mesocycles = duration / 4;
  // Tri calendaire — nécessaire pour détecter des jours réellement consécutifs (ex. Lun+Mar)
  // plutôt que des jours simplement proches dans le tableau soumis par l'appelant.
  const sortedDays = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

  const weeks: WeekTemplate[] = [];

  for (let c = 0; c < mesocycles; c++) {
    const cycleBase = baseDiff + c; // progressive overload d'un bloc de 4 semaines à l'autre
    const isLastCycle = c === mesocycles - 1;
    const shape = shapeForCycle(focus, c, isLastCycle);
    const offsets = SHAPE_OFFSETS[shape];

    for (let phase = 0; phase < 4; phase++) {
      const w = c * 4 + phase; // index de semaine global (0-based)
      const isMrvWeek = phase === 2;
      const weekDiff = Math.max(1, Math.min(10, cycleBase + offsets[phase]));
      const weekLoad = PHASE_LOAD[phase];

      const week: WeekTemplate = {};

      // Phase A — type de chaque jour (rotation ancrée sur le bloc + test forcé). Avant ce fix,
      // "Lundi" pouvait être volume en S1 puis intensité en S2 : les exercices semblaient changer
      // de façon incohérente alors que c'était le type lui-même qui changeait sous la rotation.
      const dayPlans = sortedDays.map((day, dayIdx) => {
        const isLastDayOfWeek = dayIdx === sortedDays.length - 1;
        const forced = isMrvWeek && isLastDayOfWeek; // chaque semaine MRV se termine par un test, pas seulement la toute dernière séance du programme
        const typeIdx = (c * sortedDays.length + dayIdx) % focusDist.length;
        const type: SessionType = forced ? "test" : focusDist[typeIdx];
        return { day, dayIdx, calIdx: DAY_ORDER.indexOf(day), type, forced };
      });

      // Phase B — jamais deux jours calendairement consécutifs (aucun jour de repos entre les
      // deux) tous les deux en intensité/test. Ne rétrograde jamais un test forcé (fin de semaine
      // MRV, delibéré) — rétrograde l'autre jour de la paire à la place.
      const HARD: SessionType[] = ["intensite", "test"];
      for (let i = 1; i < dayPlans.length; i++) {
        const prev = dayPlans[i - 1];
        const cur = dayPlans[i];
        if (cur.calIdx - prev.calIdx !== 1) continue; // pas réellement consécutifs (repos entre les deux)
        if (!HARD.includes(prev.type) || !HARD.includes(cur.type)) continue;
        if (cur.forced) prev.type = "recuperation";
        else cur.type = "recuperation";
      }

      // Phase C — construire les séances à partir du type (éventuellement corrigé par la phase B)
      dayPlans.forEach(({ day, dayIdx, type }) => {
        // Plafond absolu pour "récupération" (pas juste un décalage relatif) : sinon une semaine
        // MRV à charge de base 10 laisse quand même une "Récupération active" à 8/10 — plus basse
        // que le reste de la semaine, mais pas du tout "légère" pour qui regarde juste la jauge.
        const target_difficulty = type === "recuperation"
          ? Math.max(1, Math.min(3, weekDiff - 3))
          : Math.max(1, Math.min(10, weekDiff + TYPE_DIFF_OFFSET[type]));
        const session: SessionTemplate = {
          name: sessionName(type, w, dayIdx),
          notes: buildNotes(category, type, c, shape, phase),
          target_difficulty,
          load: weekLoad,
          type,
        };

        week[day] = [session];
      });

      weeks.push(week);
    }
  }

  const template: ProgramTemplate = { weeks };
  return Response.json({ template });
}
