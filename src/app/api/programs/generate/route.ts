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
function shapeForCycle(focus: ProgramFocus, cycleIndex: number, isLastCycle: boolean): "volume" | "intensity" | "taper" {
  if (focus === "intensite") return "intensity";
  if (focus === "competition") return isLastCycle ? "taper" : "volume";
  if (focus === "mixte") return cycleIndex % 2 === 0 ? "volume" : "intensity";
  return "volume"; // volume, technique, combat, autre — accumulation par défaut
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

function buildNotes(category: SportCategory, type: SessionType, weekIdx: number): string {
  // Nombre d'exercices toujours constant (rotation de la banque, jamais tronquée) — seule la
  // difficulté (target_difficulty) varie selon la phase et le type de séance, pas le volume
  // d'exercices listés. La vraie notion de volume (sets/reps) et d'intensité (%) n'est pas
  // modélisée ici, seul le curseur de difficulté 1-10 l'est.
  const bank = EXERCISES[category][type];
  const offset = (weekIdx * 2) % bank.length;
  const rotated = [...bank.slice(offset), ...bank.slice(0, offset)];
  return rotated.join("\n");
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

  const weeks: WeekTemplate[] = [];

  for (let c = 0; c < mesocycles; c++) {
    const cycleBase = baseDiff + c; // progressive overload d'un bloc de 4 semaines à l'autre
    const isLastCycle = c === mesocycles - 1;
    const offsets = SHAPE_OFFSETS[shapeForCycle(focus, c, isLastCycle)];

    for (let phase = 0; phase < 4; phase++) {
      const w = c * 4 + phase; // index de semaine global (0-based)
      const isMrvWeek = phase === 2;
      const weekDiff = Math.max(1, Math.min(10, cycleBase + offsets[phase]));
      const weekLoad = PHASE_LOAD[phase];

      const week: WeekTemplate = {};

      days.forEach((day, dayIdx) => {
        const isLastDayOfWeek = dayIdx === days.length - 1;
        const forceTest = isMrvWeek && isLastDayOfWeek; // chaque semaine MRV se termine par un test, pas seulement la toute dernière séance du programme
        const typeIdx = (w * days.length + dayIdx) % focusDist.length;
        const type: SessionType = forceTest ? "test" : focusDist[typeIdx];

        const target_difficulty = Math.max(1, Math.min(10, weekDiff + TYPE_DIFF_OFFSET[type]));
        const session: SessionTemplate = {
          name: sessionName(type, w, dayIdx),
          notes: buildNotes(category, type, w),
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
