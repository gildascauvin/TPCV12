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

// Modèle spécifique pour une durée de 6 semaines — ne se découpe pas en blocs de 4, donc pas de
// mesocycle au sens standard. Séquence demandée explicitement : MEV → Surcharge → MRV → Deload →
// Surcharge → MRV, un seul bloc de 6 semaines qui se termine sur un pic (pas de deload final,
// contrairement au modèle par blocs de 4 — assumé tel quel, correspond à un programme conçu pour
// culminer juste avant une échéance plutôt qu'à redescendre en douceur).
// Réutilise SHAPE_OFFSETS/PRESCRIPTION_SHAPE (longueur 4 : MEV/Surcharge/MRV/Deload) via une table
// d'indices plutôt que dupliquer des tableaux à 6 valeurs — Surcharge/MRV de la 2e vague pointent
// vers les mêmes index que la 1ère (1 et 2), la surcharge progressive vient de `cycleBaseMap`.
const SIX_WEEK_PHASE_INDEX = [0, 1, 2, 3, 1, 2]; // MEV,Surcharge,MRV,Deload,Surcharge,MRV
const SIX_WEEK_CYCLE_BASE = [0, 0, 0, 0, 1, 1]; // la 2e vague (Surcharge+MRV) repart d'une base +1

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

  // "5×5" / "3×45s" / "6×20m" / "5×3@78%" — sets × qty avec unité optionnelle collée, et/ou
  // intensité collée directement après (convention des banques d'archétypes)
  let m = rest.match(/^(\d+)\s*×\s*(\d+)(s|m)?\b(.*)$/);
  if (m) {
    const { pct: inlinePct, suffix } = extractInlinePct(m[4]);
    return { name, mode: "load", baseSets: +m[1], baseQty: +m[2], unit: m[3] ?? "", wordUnit: false, baseIntensityPct: intensityPct ?? inlinePct, suffix };
  }

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

// Les banques d'archétypes (haltérophilie/powerlifting/sprint renfo) écrivent l'intensité
// collée à la fin ("5×3@78%") plutôt qu'en préfixe ("... à 78% — 5×3") comme l'ancienne
// banque EXERCISES générique — les deux conventions coexistent dans les données. Sans ce
// second point d'extraction, le "@78%" atterrit tel quel dans `suffix` (jamais interprété
// comme intensité) et se retrouve dupliqué à côté du pourcentage recalculé par
// formatPrescription (ex. "5×3@70% @78%").
function extractInlinePct(suffixRaw: string): { pct: number | null; suffix: string } {
  const m = suffixRaw.match(/^@(\d+)%\s*(.*)$/);
  if (m) return { pct: Number(m[1]), suffix: m[2].trim() };
  return { pct: null, suffix: suffixRaw.trim() };
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

// Difficulté par type de séance — plafonds/formules explicites, pas de simple décalage relatif.
// Un décalage relatif (-1/-2) ne suffit pas quand weekDiff est déjà proche de 10 (semaine MRV,
// blocs avancés) : tout restait collé au plafond, "technique" et "volume" lisaient aussi "durs"
// que "intensite" — un utilisateur sélectionnant tous les jours de la semaine se retrouvait avec
// une semaine entièrement dure, une seule vraie récup. `intensite`/`test` restent volontairement
// non plafonnés (leur rôle est justement d'être la partie la plus dure du cycle).
function sessionDifficulty(type: SessionType, weekDiff: number): number {
  switch (type) {
    case "recuperation": return Math.max(1, Math.min(3, weekDiff - 3));
    case "technique":    return Math.max(2, Math.min(4, Math.round(weekDiff / 3))); // jamais "Modérée" (5+), toujours "Facile"
    case "volume":       return Math.max(3, Math.min(7, weekDiff - 1));
    case "intensite":    return Math.max(1, Math.min(10, weekDiff + 1));
    case "test":         return Math.max(1, Math.min(10, weekDiff + 2));
  }
}

const SESSION_NAMES: Record<SessionType, string[]> = {
  technique:   ["Séance technique", "Travail technique", "Affûtage technique"],
  volume:      ["Séance volume", "Travail de volume", "Construction volume"],
  intensite:   ["Séance intensive", "Travail d'intensité", "Pic d'intensité"],
  recuperation:["Récupération active", "Séance légère", "Décharge"],
  test:        ["Test & évaluation", "Bilan de cycle", "Séance test"],
};

type SportCategory = "halterophilie" | "powerlifting" | "musculation" | "sprint" | "combat" | "fitness" | "collectif" | "endurance" | "cyclisme" | "natation" | "ski" | "aviron" | "gymnastique" | "autre";

function getSportCategory(sport: string): SportCategory {
  const s = (sport ?? "").toLowerCase();
  // Musculation/Hypertrophie (split par groupe musculaire) ≠ Powerlifting (squat/bench/deadlift) —
  // "musculation" avait le même sort que "power"/"force" avant ce fix (mélangés dans le même seau
  // "muscu" détecté comme powerlifting), donnant des séances "Focus Squat/Bench/Deadlift" à des
  // programmes génériques de musculation/hypertrophie qui n'ont rien d'un powerlifting. Vérifié
  // AVANT ce check spécifique (le mot "hypertroph" ne collisionne avec aucun autre mot-clé).
  if (s.includes("hypertroph")) return "musculation";
  // Haltérophilie (arraché/épaulé-jeté olympique) ≠ Powerlifting (squat/bench/deadlift) —
  // avant ce fix, "Force/Powerlifting" et "Haltérophilie" tombaient dans le même seau, mélangeant
  // les deux banques d'exercices (un "Force/Powerlifting" recevait des séances d'arraché).
  if (s.includes("halt") || s.includes("olympique") || s.includes("snatch") || s.includes("arraché")) return "halterophilie";
  if (s.includes("power") || s.includes("force")) return "powerlifting";
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

  powerlifting: {
    technique: [
      "Squat pause — 4×3",
      "Bench pause 2s — 4×3",
      "Deadlift déficit — 4×3",
      "Mobilité hanches et épaules — 10 min",
    ],
    volume: [
      "Back squat — 5×5",
      "Développé couché — 5×5",
      "Soulevé de terre — 4×5",
      "Gainage anti-rotation — 3×40s",
    ],
    intensite: [
      "Squat lourd — 5×3",
      "Développé couché lourd — 5×3",
      "Deadlift lourd — 4×2",
    ],
    recuperation: [
      "Mobilité hanches et chevilles — 15 min",
      "Foam rolling dos et jambes",
      "Stretching actif épaules — 10 min",
      "Marche active — 20 min",
    ],
    test: [
      "Squat : tentative de maximum",
      "Développé couché : tentative de maximum",
      "Deadlift : tentative de maximum",
      "Bilan technique (vidéo)",
    ],
  },

  musculation: {
    technique: [
      "Squat gobelet technique — 4×8",
      "Rowing haltère un bras focus posture — 4×8 par côté",
      "Développé incliné technique — 4×8",
      "Mobilité épaules et hanches — 10 min",
    ],
    volume: [
      "Squat — 4×10",
      "Tirage horizontal — 4×10",
      "Développé couché — 4×10",
      "Développé militaire — 3×12",
      "Curl biceps barre — 3×12",
    ],
    intensite: [
      "Presse à cuisses lourde — 4×6",
      "Tractions lestées — 4×6",
      "Développé couché lourd — 4×6",
      "Extension triceps poulie lourde — 3×8",
    ],
    recuperation: [
      "Vélo ou marche légère — 20 min",
      "Stretching global — 15 min",
      "Foam rolling dos et jambes",
      "Respiration et mobilité active",
    ],
    test: [
      "Test : squat 5RM",
      "Test : développé couché 5RM",
      "Test : tractions strictes max",
      "Tour de taille / mensurations",
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

// Rotation ancrée sur cycleIndex (pas la semaine) — les semaines d'un même bloc/rotationAnchor
// montrent toujours les mêmes exercices, seule leur prescription (séries/reps/%) change semaine
// après semaine. Nombre d'exercices toujours constant, jamais tronqué. Prescription dynamique
// (séries/répétitions/%intensité) uniquement pour "volume"/"intensite" — c'est là que la
// surcharge progressive a un sens réel ; technique/récupération/test restent du texte statique.
function buildNotesFromBank(bank: string[], type: SessionType, cycleIndex: number, shape: Shape, phase: number): string {
  const offset = (cycleIndex * 2) % bank.length;
  const rotated = [...bank.slice(offset), ...bank.slice(0, offset)];
  if (type !== "volume" && type !== "intensite") return rotated.join("\n");
  return rotated.map(line => formatPrescription(parseExercise(line), shape, phase)).join("\n");
}

function buildNotes(category: SportCategory, type: SessionType, cycleIndex: number, shape: Shape, phase: number): string {
  return buildNotesFromBank(EXERCISES[category][type], type, cycleIndex, shape, phase);
}

// ====================================================================================
// Curriculum sportif — remplace la rotation générique FOCUS_DIST pour les sports où de vraies
// séances "phares" et nommées existent (demandé explicitement, avec des règles précises par
// sport plutôt qu'un système générique technique/volume/intensite/recuperation/test appliqué
// uniformément). Les catégories sans entrée ici gardent le système générique FOCUS_DIST.
// ====================================================================================

interface Archetype {
  name: string;
  type: SessionType; // pilote le palier RPE / sessionDifficulty / prescription — pas le nom
  exercises: string[]; // banque propre à l'archétype (remplace EXERCISES[category][type] générique)
}

// ---- Endurance : priorité décroissante, on prend les N premiers selon le nombre de jours,
// on boucle si N dépasse la liste (rare, 6 archétypes couvrent déjà une grosse semaine).
const ENDURANCE_ARCHETYPES: Archetype[] = [
  { name: "Endurance fondamentale", type: "volume", exercises: [
    "Endurance fondamentale — 45 min", "Sortie facile Z2 — 40 min", "Footing fondamental — 50 min",
  ]},
  { name: "Seuil", type: "intensite", exercises: [
    "Seuil lactique — 20 min continu", "Tempo au seuil — 25 min", "Côtes au seuil — 5×400m (récup 90s)",
  ]},
  { name: "Sortie longue", type: "volume", exercises: [
    "Sortie longue endurance fondamentale — 70 min", "Sortie longue progressive — 80 min",
  ]},
  { name: "Fractionné", type: "intensite", exercises: [
    "Fractionné 400m allure 5km — 8 reps (récup 90s)", "Fractionné 1000m — 5 reps (récup 3 min)", "Fractionné 200m rapide — 12 reps (récup 60s)",
  ]},
  { name: "Renfo", type: "technique", exercises: [
    "Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s", "Proprioception chevilles — 3×10",
  ]},
  { name: "Récupération active", type: "recuperation", exercises: [
    "Footing très facile — 25 min", "Marche active — 30 min", "Vélo doux — 20 min",
  ]},
];
function selectEndurance(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => ENDURANCE_ARCHETYPES[i % ENDURANCE_ARCHETYPES.length]);
}

// ---- Sprint : priorité explicite — Accélération, Vitesse max et Renfo ("gym") sont les 3
// piliers non-négociables (occupent toujours les 3 premiers jours disponibles) ; Endurance de
// vitesse et Tempo ne viennent qu'ensuite, en complément si plus de jours sont disponibles.
// Ordre interne à chaque séance de vitesse pure (Accélération/Vitesse max) : gammes techniques
// en ouverture, sprints au milieu (le vrai travail), pliométrie systématiquement en fin de
// séance (fraîcheur maximale requise, mais après l'activation/l'échauffement spécifique).
const SPRINT_ACCELERATION: Archetype = { name: "Accélération", type: "intensite", exercises: [
  "Gammes techniques : montées de genoux + talons-fesses — 3×20m",
  "Départs blocs — 6×20m (récup 4 min)",
  "Pliométrie : bondissements — 4×20m",
  "Squat jump — 4×6",
]};
const SPRINT_VITESSE_MAX: Archetype = { name: "Vitesse max", type: "intensite", exercises: [
  "Gammes techniques : foulées bondissantes — 3×20m",
  "Sprint 60m à 95% — 5 reps (récup 5 min)",
  "Sprint 30m lancé — 4 reps (récup 4 min)",
  "Pliométrie : sauts horizontaux — 3×6",
]};
const SPRINT_RENFO: Archetype = { name: "Renfo", type: "technique", exercises: [
  "Squat — 4×5@75%", "Soulevé de terre — 3×5@75%", "Fentes marchées — 3×12",
]};
const SPRINT_ENDURANCE_VITESSE: Archetype = { name: "Endurance de vitesse", type: "volume", exercises: [
  "Sprint 150m à 85% — 6 reps (récup 4 min)", "Sprint 120m à 85% — 5 reps (récup 3 min)",
]};
const SPRINT_TEMPO: Archetype = { name: "Tempo", type: "volume", exercises: [
  "Tempo run 200m — 8 reps (récup 90s)", "Fartlek tempo — 25 min",
]};
const SPRINT_CIRCUIT: Archetype = { name: "Circuit", type: "technique", exercises: [
  "Circuit vitesse : gammes + starts + accélérations — 4 tours", "Gamme complète sprint — 3 séries",
]};
const SPRINT_PRIORITY: Archetype[] = [SPRINT_ACCELERATION, SPRINT_VITESSE_MAX, SPRINT_RENFO, SPRINT_ENDURANCE_VITESSE, SPRINT_TEMPO, SPRINT_CIRCUIT];
function selectSprint(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => SPRINT_PRIORITY[i % SPRINT_PRIORITY.length]);
}

// ---- Haltérophilie (arraché/épaulé-jeté olympique) : modèle par palier de jours demandé
// explicitement, pas une simple liste de priorité — la structure elle-même change selon N.
// Ordre interne à chaque séance, demandé explicitement : mouvement technique ou semi-technique
// (le geste complet du jour), puis tirages (pulls), puis squats, puis renfo en fin de séance.
const HA_SNATCH: Archetype = { name: "Focus Arraché", type: "intensite", exercises: [
  "Arraché — 5×2@75%", "Tirage arraché — 4×3@80%", "Squat arraché — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_CLEAN_JERK: Archetype = { name: "Focus Épaulé-Jeté", type: "intensite", exercises: [
  "Épaulé-jeté — 5×2@75%", "Tirage épaulé — 4×3@80%", "Squat avant — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_CLEAN: Archetype = { name: "Focus Épaulé", type: "intensite", exercises: [
  "Épaulé — 5×2@75%", "Tirage épaulé — 4×3@80%", "Squat avant — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_JERK: Archetype = { name: "Focus Jeté", type: "intensite", exercises: [
  "Jeté — 5×2@75%", "Tirage épaulé — 4×3@78%", "Squat avant — 4×3@70%", "Développé militaire — 3×8@65%",
]};
const HA_TOTAL: Archetype = { name: "Focus Total", type: "test", exercises: [
  "Complexe arraché + épaulé-jeté — 4×1@80%", "Simulation total : arraché puis épaulé-jeté",
]};
const HA_LIGHT: Archetype = { name: "Séance légère variantes", type: "technique", exercises: [
  "Arraché variantes légères — 4×3@60%", "Épaulé-jeté variantes techniques — 4×3@60%", "Squat léger + mobilité — 3×5",
]};
function selectHalterophilie(n: number): Archetype[] {
  if (n <= 2) return [HA_SNATCH, HA_CLEAN_JERK].slice(0, n);
  if (n === 3) return [HA_SNATCH, HA_CLEAN_JERK, HA_TOTAL];
  if (n === 4) return [HA_SNATCH, HA_CLEAN, HA_JERK, HA_TOTAL];
  const base = [HA_SNATCH, HA_CLEAN, HA_JERK, HA_TOTAL, HA_LIGHT];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

// ---- Powerlifting (squat/bench/deadlift) : rotation round-robin des 3 lifts, mais le deadlift
// ne dépasse jamais 2 séances/semaine (fatigue lombaire/SNC) — squat et bench peuvent aller
// jusqu'à 3. Pas de liste de priorité fixe ici, une contrainte de fréquence à respecter.
// Ordre interne à chaque séance, demandé explicitement : mouvement technique (le lift lui-même),
// puis assistance (variantes du lift : pause, prise, déficit...), puis renfo général en fin de
// séance (accessoire, pas spécifique au lift du jour).
const PL_SQUAT: Archetype = { name: "Focus Squat", type: "intensite", exercises: [
  "Back squat — 5×3@78%", "Squat pause — 4×3@70%", "Front squat — 4×4@70%", "Gainage anti-rotation — 3×40s",
]};
const PL_BENCH: Archetype = { name: "Focus Bench", type: "intensite", exercises: [
  "Développé couché — 5×3@78%", "Bench pause 2s — 4×3@70%", "Développé prise serrée — 4×5@65%", "Tirage horizontal — 3×10@65%",
]};
const PL_DEADLIFT: Archetype = { name: "Focus Deadlift", type: "intensite", exercises: [
  "Soulevé de terre — 5×3@78%", "Deadlift déficit — 4×3@65%", "Soulevé de terre roumain — 4×6@65%", "Gainage anti-extension — 3×40s",
]};
function selectPowerlifting(n: number): Archetype[] {
  const rotation = [PL_SQUAT, PL_BENCH, PL_DEADLIFT];
  const counts = { squat: 0, bench: 0, deadlift: 0 };
  const result: Archetype[] = [];
  let i = 0;
  while (result.length < n && i < n * 4) { // garde-fou anti-boucle infinie, jamais atteint en pratique
    const candidate = rotation[i % 3];
    if (candidate === PL_DEADLIFT && counts.deadlift >= 2) { i++; continue; }
    result.push(candidate);
    if (candidate === PL_SQUAT) counts.squat++;
    else if (candidate === PL_BENCH) counts.bench++;
    else counts.deadlift++;
    i++;
  }
  return result;
}

// ---- Sports collectifs : au moins 2 techniques, 1 endurance, 1 vitesse, 1 renfo — technique en
// tête (double priorité), on boucle sur cette base de 5 si plus de jours disponibles.
const COLLECTIF_TECHNIQUE: Archetype = { name: "Technique", type: "technique", exercises: [
  "Exercices techniques au poste — 20 min", "Passes + combinaisons à 2/3 — 15 min", "Travail défensif en situation réduite — 20 min",
]};
const COLLECTIF_ENDURANCE: Archetype = { name: "Endurance", type: "volume", exercises: [
  "Circuit cardio : navettes + sauts + sprint — 4 tours", "Balle à intensité soutenue — 20 min",
]};
const COLLECTIF_VITESSE: Archetype = { name: "Vitesse", type: "intensite", exercises: [
  "Accélérations + changements de direction — 6×20m", "Intervalles : 8×15s effort (récup 45s)",
]};
const COLLECTIF_RENFO: Archetype = { name: "Renfo", type: "technique", exercises: [
  "Renforcement bas du corps — 4×10", "Gainage et proprioception — 3×45s",
]};
const COLLECTIF_BASE: Archetype[] = [COLLECTIF_TECHNIQUE, COLLECTIF_TECHNIQUE, COLLECTIF_ENDURANCE, COLLECTIF_VITESSE, COLLECTIF_RENFO];
function selectCollectif(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => COLLECTIF_BASE[i % COLLECTIF_BASE.length]);
}

// ---- Musculation/Hypertrophie : split par groupe musculaire, priorité décroissante (grands
// groupes d'abord) — pas une rotation générique technique/volume/intensite. Ordre interne à
// chaque séance, demandé explicitement : mouvement polyarticulaire (compound) en premier, puis
// enchaînement d'exercices d'isolation ciblant le groupe musculaire du jour.
const MUSCU_JAMBES: Archetype = { name: "Jambes", type: "volume", exercises: [
  "Squat — 4×8@70%", "Presse à cuisses — 3×12@65%", "Leg curl — 3×12@60%", "Mollets debout — 3×15@60%",
]};
const MUSCU_DOS: Archetype = { name: "Dos", type: "volume", exercises: [
  "Tirage horizontal — 4×8@70%", "Tirage vertical — 3×12@65%", "Curl biceps barre — 3×12@60%", "Curl marteau — 3×12@60%",
]};
const MUSCU_PECTORAUX: Archetype = { name: "Pectoraux", type: "volume", exercises: [
  "Développé couché — 4×8@70%", "Développé incliné haltères — 3×10@65%", "Écarté couché — 3×12@60%", "Dips — 3×10@60%",
]};
const MUSCU_EPAULES: Archetype = { name: "Épaules", type: "volume", exercises: [
  "Développé militaire — 4×8@70%", "Élévations latérales — 3×15@55%", "Oiseau — 3×15@55%", "Shrugs — 3×12@65%",
]};
const MUSCU_BRAS: Archetype = { name: "Bras", type: "volume", exercises: [
  "Développé prise serrée — 4×8@70%", "Extension triceps poulie — 3×12@60%", "Curl barre — 3×12@60%", "Curl marteau — 3×12@60%",
]};
const MUSCU_BASE: Archetype[] = [MUSCU_JAMBES, MUSCU_DOS, MUSCU_PECTORAUX, MUSCU_EPAULES, MUSCU_BRAS];
function selectMusculation(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => MUSCU_BASE[i % MUSCU_BASE.length]);
}

const SPORT_CURRICULUM: Partial<Record<SportCategory, (dayCount: number) => Archetype[]>> = {
  endurance: selectEndurance,
  sprint: selectSprint,
  halterophilie: selectHalterophilie,
  powerlifting: selectPowerlifting,
  collectif: selectCollectif,
  musculation: selectMusculation,
};

function sessionName(type: SessionType, weekIdx: number, dayIdx: number): string {
  const names = SESSION_NAMES[type];
  return names[(weekIdx + dayIdx) % names.length];
}

interface WeekSpec {
  weekDiff: number;
  weekLoad: SessionLoad;
  isMrvWeek: boolean;
  rotationAnchor: number; // ancre de rotation des exercices dans buildNotes (mêmes exercices tant que l'ancre ne change pas)
  shape: Shape;
  prescriptionPhase: number; // index dans PRESCRIPTION_SHAPE (0-3)
}

// Calcule la séquence de semaines pour toute la durée du programme — gère les deux modèles
// (blocs de 4 semaines standard, ou le modèle spécifique à 6 semaines) derrière une interface
// commune, pour que le reste de la génération (Phases A/A2/B/C) n'ait pas à savoir lequel est actif.
function buildWeekSpecs(duration: number, baseDiff: number, focus: ProgramFocus): WeekSpec[] {
  if (duration === 6) {
    const shape = shapeForCycle(focus, 0, true);
    const offsets = SHAPE_OFFSETS[shape];
    return SIX_WEEK_PHASE_INDEX.map((pIdx, i) => ({
      weekDiff: Math.max(1, Math.min(10, baseDiff + SIX_WEEK_CYCLE_BASE[i] + offsets[pIdx])),
      weekLoad: PHASE_LOAD[pIdx],
      isMrvWeek: pIdx === 2,
      rotationAnchor: 0, // même sélection d'exercices sur les 6 semaines — un seul bloc, pas deux
      shape,
      prescriptionPhase: pIdx,
    }));
  }

  const mesocycles = duration / 4;
  const specs: WeekSpec[] = [];
  for (let c = 0; c < mesocycles; c++) {
    const cycleBase = baseDiff + c;
    const isLastCycle = c === mesocycles - 1;
    const shape = shapeForCycle(focus, c, isLastCycle);
    const offsets = SHAPE_OFFSETS[shape];
    for (let phase = 0; phase < 4; phase++) {
      specs.push({
        weekDiff: Math.max(1, Math.min(10, cycleBase + offsets[phase])),
        weekLoad: PHASE_LOAD[phase],
        isMrvWeek: phase === 2,
        rotationAnchor: c,
        shape,
        prescriptionPhase: phase,
      });
    }
  }
  return specs;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { sport, level, days, duration, focus } = body as {
    sport: string;
    level: ProgramLevel;
    days: string[];
    duration: 4 | 6 | 8 | 12 | 16;
    focus: ProgramFocus;
  };

  const validDuration = duration === 6 || (duration > 0 && duration % 4 === 0);
  if (!level || !days?.length || !duration || !focus || !validDuration) {
    return Response.json({ error: "Paramètres manquants ou durée invalide (6 semaines, ou un multiple de 4)" }, { status: 400 });
  }

  const category = getSportCategory(sport ?? "");
  const focusDist = FOCUS_DIST[focus] ?? FOCUS_DIST.autre;
  const baseDiff = LEVEL_BASE_DIFF[level] ?? 6;
  // Tri calendaire — nécessaire pour détecter des jours réellement consécutifs (ex. Lun+Mar)
  // plutôt que des jours simplement proches dans le tableau soumis par l'appelant.
  const sortedDays = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const weekSpecs = buildWeekSpecs(duration, baseDiff, focus);

  const weeks: WeekTemplate[] = [];

  weekSpecs.forEach((spec, w) => {
    const { weekDiff, weekLoad, isMrvWeek, rotationAnchor, shape, prescriptionPhase } = spec;
    const week: WeekTemplate = {};

    // Phase A — type de chaque jour. Deux sources possibles :
    // 1. Curriculum sportif (SPORT_CURRICULUM) si le sport en a un — séances nommées et
    //    priorisées selon le nombre de jours (ex. haltérophilie : Arraché/Épaulé/Jeté/Total),
    //    remplace la rotation générique FOCUS_DIST pour ces sports précis.
    // 2. Sinon, rotation FOCUS_DIST générique ancrée sur rotationAnchor — comportement inchangé.
    // Dans les deux cas, le test forcé de fin de semaine MRV reste une règle universelle (pas
    // seulement la toute dernière séance du programme) — un jour forcé perd son éventuel
    // archétype/banque dédiée, retombe sur la banque générique "test" du sport.
    const curriculumSelector = SPORT_CURRICULUM[category];
    const archetypes = curriculumSelector?.(sortedDays.length);
    const dayPlans = sortedDays.map((day, dayIdx) => {
      const isLastDayOfWeek = dayIdx === sortedDays.length - 1;
      const forced = isMrvWeek && isLastDayOfWeek;
      let type: SessionType;
      let archetypeName: string | undefined;
      let exercises: string[] | undefined;
      if (forced) {
        type = "test";
      } else if (archetypes) {
        const archetype = archetypes[dayIdx];
        type = archetype.type;
        archetypeName = archetype.name;
        exercises = archetype.exercises;
      } else {
        const typeIdx = (rotationAnchor * sortedDays.length + dayIdx) % focusDist.length;
        type = focusDist[typeIdx];
      }
      return { day, dayIdx, calIdx: DAY_ORDER.indexOf(day), type, forced, archetypeName, exercises };
    });

    const RPE_BUCKET: Record<SessionType, "easy" | "moderate" | "hard"> = {
      recuperation: "easy", technique: "easy", volume: "moderate", intensite: "hard", test: "hard",
    };

    // Phase A2 — le premier jour d'entraînement de la semaine (le plus frais, juste après le
    // repos) ne doit jamais être facile/technique : optimiser le stimulus veut qu'on ouvre la
    // semaine sur quelque chose de substantiel, pas qu'on "gaspille" la fraîcheur sur un jour
    // léger. Passe avant le lissage de la Phase B pour que celle-ci absorbe les collisions
    // éventuellement introduites par ce changement. S'applique aussi aux sports à curriculum :
    // les règles d'enchaînement RPE sont des principes universels de programmation, pas une
    // particularité du système générique — un curriculum sportif propose un contenu, il ne
    // s'exempte pas de ces règles.
    if (dayPlans.length > 0 && !dayPlans[0].forced && RPE_BUCKET[dayPlans[0].type] === "easy") {
      dayPlans[0].type = "intensite";
      // Le type corrigé ne correspond plus à l'archétype/banque d'origine (si curriculum
      // sportif) — repli sur la banque générique du sport pour ce jour précis.
      dayPlans[0].archetypeName = undefined;
      dayPlans[0].exercises = undefined;
    }

    // Phase B — principe de variation : jamais deux jours calendairement consécutifs (aucun
    // jour de repos entre les deux) dans le même palier de RPE (facile/modéré/dur), peu importe
    // le type exact — pas seulement "pas 2 durs d'affilée", aussi "pas 2 faciles d'affilée" ni
    // "pas 2 modérés d'affilée". Règle universelle, appliquée à tous les sports y compris ceux
    // pilotés par un curriculum (haltérophilie, sprint, powerlifting, collectif) : si le
    // curriculum propose deux jours "durs" consécutifs (ex. Arraché puis Épaulé-Jeté), cette
    // phase corrige quand même — le jour corrigé perd son nom/contenu d'archétype et retombe
    // sur la banque générique du sport (voir plus bas), c'est le compromis attendu entre
    // fidélité au curriculum et respect des principes universels d'enchaînement.
    // Certains FOCUS_DIST ont même des types identiques déjà adjacents dans leur définition
    // (ex. "volume" commence par ["volume","volume",...]) — invisible avec peu de jours/semaine
    // (tableau échantillonné en creux), exposé dès que tous les jours sont sélectionnés (tableau
    // lu intégralement).
    // Ne rétrograde jamais un test forcé (fin de semaine MRV, délibéré) — corrige l'autre jour
    // de la paire à la place. Répété jusqu'à stabilisation (pas une seule passe) : corriger un
    // jour pour résoudre une collision peut en créer une nouvelle avec son AUTRE voisin (ex.
    // Samedi rétrogradé en récupération à cause du test forcé de Dimanche, mais Vendredi était
    // déjà récupération — d'où le choix du remplacement qui évite explicitement les deux
    // voisins, pas juste celui qui posait initialement problème).
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (let i = 1; i < dayPlans.length; i++) {
        const prev = dayPlans[i - 1];
        const cur = dayPlans[i];
        if (cur.calIdx - prev.calIdx !== 1) continue; // pas réellement consécutifs (repos entre les deux)
        if (RPE_BUCKET[prev.type] !== RPE_BUCKET[cur.type]) continue; // paliers différents, rien à corriger

        const targetIdx = cur.forced ? i - 1 : i;
        const keep = cur.forced ? cur : prev; // le jour de la paire qu'on ne change pas
        const otherNeighbor = cur.forced ? dayPlans[i - 2] : dayPlans[i + 1]; // l'autre voisin du jour qu'on va changer
        const keepBucket = RPE_BUCKET[keep.type];
        const avoidBuckets = new Set([keepBucket, otherNeighbor ? RPE_BUCKET[otherNeighbor.type] : null].filter(Boolean));
        // "volume" (modéré) évité autant que possible — on privilégie l'alternance franche
        // facile/dur (bascule directement vers le palier opposé de celui qu'on corrige), et on
        // ne se rabat sur "volume" qu'en tout dernier recours si les deux autres paliers sont
        // déjà pris par les voisins.
        const orderedCandidates: SessionType[] =
          keepBucket === "hard" ? ["recuperation", "technique", "volume"]
          : keepBucket === "easy" ? ["intensite", "test", "volume"]
          : ["recuperation", "technique", "intensite", "test", "volume"];
        const replacement = orderedCandidates.find(t => !avoidBuckets.has(RPE_BUCKET[t])) ?? "volume";

        if (dayPlans[targetIdx].type !== replacement) {
          dayPlans[targetIdx].type = replacement;
          // Le type corrigé ne correspond plus à l'archétype d'origine (si curriculum sportif) —
          // repli sur la banque générique du sport pour ce jour précis, seule exception au
          // curriculum, plutôt que d'afficher un nom de séance qui ne correspond plus au contenu.
          dayPlans[targetIdx].archetypeName = undefined;
          dayPlans[targetIdx].exercises = undefined;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Phase C — construire les séances à partir du type (éventuellement corrigé par la phase B)
    dayPlans.forEach(({ day, dayIdx, type, archetypeName, exercises }) => {
      const target_difficulty = sessionDifficulty(type, weekDiff);
      const session: SessionTemplate = {
        name: archetypeName ?? sessionName(type, w, dayIdx),
        notes: exercises
          ? buildNotesFromBank(exercises, type, rotationAnchor, shape, prescriptionPhase)
          : buildNotes(category, type, rotationAnchor, shape, prescriptionPhase),
        target_difficulty,
        load: weekLoad,
        type,
      };

      week[day] = [session];
    });

    weeks.push(week);
  });

  const template: ProgramTemplate = { weeks };
  return Response.json({ template });
}
