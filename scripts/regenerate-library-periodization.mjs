// One-off : régénère intégralement programs.template pour TOUS les programmes publics de la
// bibliothèque — durée multiple de 4 semaines (4/8/12/16, blocs MEV/Surcharge/MRV/Deload) OU
// durée de 6 semaines (modèle spécifique MEV/Surcharge/MRV/Deload/Surcharge/MRV). Porte
// fidèlement la logique de src/app/api/programs/generate/route.ts (prescriptions dynamiques
// séries/reps/%, test forcé en fin de semaine MRV, curriculum sportif par archétypes nommés
// pour endurance/sprint/haltérophilie/powerlifting/collectif, règles universelles d'enchaînement
// RPE qui s'appliquent même quand un curriculum est actif) — à garder en synchro si le fichier
// source évolue, cette copie n'est PAS importée dynamiquement.
//
// Différence avec le générateur live : `focus` est manquant sur 48/49 programmes de la
// bibliothèque (colonne jamais renseignée à leur création) — au lieu d'un focus par programme,
// une forme "universelle" est appliquée : les blocs non-terminaux alternent volume/intensité,
// le dernier bloc (ou l'unique "bloc" du modèle à 6 semaines) est toujours en tapering/peak,
// indépendamment de la durée totale.
//
// `sport`/`level`/`weeks_count` sont lus depuis les colonnes du programme (stables, jamais
// modifiées par ce script) ; `days` est dérivé des clés de jour déjà présentes dans le template
// existant (triées dans l'ordre calendaire). C'est une régénération complète du template — noms
// de séances, exercices sélectionnés et leur prescription, tout est recalculé. Aucune édition
// manuelle éventuelle (via ProgramBuilderModal) ne serait préservée ; en l'absence de session
// avec `type` manquant sur les 49 programmes lors du précédent patch, tout indique que ces
// programmes reflètent une sortie brute du générateur, pas un contenu retouché à la main.
//
// Usage :
//   node --env-file=.env.local scripts/regenerate-library-periodization.mjs            (dry-run)
//   node --env-file=.env.local scripts/regenerate-library-periodization.mjs --apply     (écrit en base)

import { writeFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

// ====================================================================================
// Portage de src/app/api/programs/generate/route.ts — voir ce fichier pour les commentaires
// détaillés sur le pourquoi de chaque constante. Garder en synchro si le fichier source change.
// ====================================================================================

const PHASE_LOAD = [1, 2, 3, 1];
const SHAPE_OFFSETS = {
  volume:    [-1, 0, 2, -3],
  intensity: [-2, 1, 3, -3],
  taper:     [-1, 0, 2, -4],
};

// Forme "universelle" (remplace shapeForCycle du générateur live, qui dépend de `focus` —
// absent ici) : blocs non-terminaux alternent volume/intensité, dernier bloc toujours en taper.
function universalShapeForCycle(cycleIndex, isLastCycle) {
  if (isLastCycle) return "taper";
  return cycleIndex % 2 === 0 ? "volume" : "intensity";
}

// Modèle spécifique 6 semaines — voir generate/route.ts pour le détail du raisonnement.
const SIX_WEEK_PHASE_INDEX = [0, 1, 2, 3, 1, 2]; // MEV,Surcharge,MRV,Deload,Surcharge,MRV
const SIX_WEEK_CYCLE_BASE = [0, 0, 0, 0, 1, 1];

const PRESCRIPTION_SHAPE = {
  volume:    { sets: [0.8, 1.0, 1.0, 0.6], qty: [0.8, 1.0, 1.0, 0.6], intensity: [-10, -5, 0, -15] },
  intensity: { sets: [1.0, 1.0, 1.0, 0.6], qty: [1.0, 0.8, 0.6, 0.4], intensity: [-5, 2, 10, -10] },
  taper:     { sets: [1.0, 1.0, 1.0, 0.5], qty: [1.0, 0.8, 0.5, 0.3], intensity: [-5, 3, 12, -15] },
};
const DEFAULT_INTENSITY_PCT = 75;

function parseExercise(raw) {
  const base = { name: raw, mode: "static", baseSets: 0, baseQty: 0, unit: "", wordUnit: false, baseIntensityPct: null, suffix: "" };

  const intensityPrefix = /^(.+?)\s+à\s+(\d+)%\+?(?:\s+\S+)?\s*—\s*(.+)$/;
  const mIntensity = raw.match(intensityPrefix);
  const name = mIntensity ? mIntensity[1] : raw.match(/^(.+?)\s*—\s*(.+)$/)?.[1] ?? raw;
  const rest = mIntensity ? mIntensity[3] : raw.match(/^(.+?)\s*—\s*(.+)$/)?.[2];
  const intensityPct = mIntensity ? Number(mIntensity[2]) : null;
  if (!rest) return base;

  let m = rest.match(/^(\d+)\s*×\s*(\d+)(s|m)?\b(.*)$/);
  if (m) {
    const { pct: inlinePct, suffix } = extractInlinePct(m[4]);
    return { name, mode: "load", baseSets: +m[1], baseQty: +m[2], unit: m[3] ?? "", wordUnit: false, baseIntensityPct: intensityPct ?? inlinePct, suffix };
  }

  m = rest.match(/^(\d+)\s*×\s*(\d+)\s*min\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: +m[1], baseQty: +m[2], unit: "min", wordUnit: false, baseIntensityPct: null, suffix: m[3].trim() };

  m = rest.match(/^(\d+)\s*(reps?|tours?|séries?|rounds?)\b(.*)$/);
  if (m) return { name, mode: "load", baseSets: 1, baseQty: +m[1], unit: m[2].replace(/s$/, ""), wordUnit: true, baseIntensityPct: intensityPct, suffix: m[3].trim() };

  m = rest.match(/^(\d+)\s*min\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: 1, baseQty: +m[1], unit: "min", wordUnit: false, baseIntensityPct: null, suffix: m[2].trim() };

  m = rest.match(/^(\d+)\s*m\b(.*)$/);
  if (m) return { name, mode: "duration", baseSets: 1, baseQty: +m[1], unit: "m", wordUnit: false, baseIntensityPct: null, suffix: m[2].trim() };

  return base;
}

function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

// Les banques d'archétypes (haltérophilie/powerlifting/sprint renfo) écrivent l'intensité
// collée à la fin ("5×3@78%") plutôt qu'en préfixe comme l'ancienne banque EXERCISES —
// voir generate/route.ts pour le détail du bug que ceci corrige.
function extractInlinePct(suffixRaw) {
  const m = suffixRaw.match(/^@(\d+)%\s*(.*)$/);
  if (m) return { pct: Number(m[1]), suffix: m[2].trim() };
  return { pct: null, suffix: suffixRaw.trim() };
}

function pluralize(word, n) {
  return n === 1 ? word : `${word}s`;
}

function formatPrescription(spec, shape, phase) {
  if (spec.mode === "static") return spec.name;
  const mult = PRESCRIPTION_SHAPE[shape];
  const sets = Math.max(1, Math.round(spec.baseSets * mult.sets[phase]));

  const rawQty = spec.baseQty * mult.qty[phase];
  const isDurationLike = spec.mode === "duration" || spec.unit === "s" || spec.unit === "m";
  const qty = isDurationLike ? Math.max(5, roundTo5(rawQty)) : Math.max(1, Math.round(rawQty));
  const suffix = spec.suffix ? ` ${spec.suffix}` : "";

  if (spec.mode === "duration") {
    const unitLabel = spec.unit === "min" ? " min" : spec.unit;
    const core = sets > 1 ? `${sets}×${qty}${unitLabel}` : `${qty}${unitLabel}`;
    return `${spec.name} — ${core}${suffix}`;
  }

  const core = spec.wordUnit
    ? `${qty} ${pluralize(spec.unit, qty)}`
    : sets > 1 ? `${sets}×${qty}${spec.unit}` : `${qty}${spec.unit}`;
  const rawPct = (spec.baseIntensityPct ?? DEFAULT_INTENSITY_PCT) + mult.intensity[phase];
  const pct = Math.max(40, Math.min(100, roundTo5(rawPct)));
  return `${spec.name} — ${core}@${pct}%${suffix}`;
}

const FOCUS_DIST_MIXTE = ["technique", "volume", "intensite", "volume", "recuperation", "intensite", "volume"];

const LEVEL_BASE_DIFF = { debutant: 5, intermediaire: 6, avance: 7, elite: 8 };

function sessionDifficulty(type, weekDiff) {
  switch (type) {
    case "recuperation": return Math.max(1, Math.min(3, weekDiff - 3));
    case "technique":    return Math.max(2, Math.min(4, Math.round(weekDiff / 3))); // jamais "Modérée" (5+), toujours "Facile"
    case "volume":       return Math.max(3, Math.min(7, weekDiff - 1));
    case "intensite":    return Math.max(1, Math.min(10, weekDiff + 1));
    case "test":         return Math.max(1, Math.min(10, weekDiff + 2));
  }
}

const SESSION_NAMES = {
  technique:    ["Séance technique", "Travail technique", "Affûtage technique"],
  volume:       ["Séance volume", "Travail de volume", "Construction volume"],
  intensite:    ["Séance intensive", "Travail d'intensité", "Pic d'intensité"],
  recuperation: ["Récupération active", "Séance légère", "Décharge"],
  test:         ["Test & évaluation", "Bilan de cycle", "Séance test"],
};

// Haltérophilie (arraché/épaulé-jeté olympique) ≠ Powerlifting (squat/bench/deadlift) — deux
// catégories distinctes depuis la correction du 2026-08-03 (avant, mélangées sous "halterophilie").
function getSportCategory(sport) {
  const s = (sport ?? "").toLowerCase();
  // Musculation/Hypertrophie (split par groupe musculaire) ≠ Powerlifting — "musculation" avait
  // le même sort que "power"/"force" avant ce fix (mélangés dans le "muscu" détecté comme
  // powerlifting), donnant des séances Focus Squat/Bench/Deadlift à des programmes génériques de
  // musculation/hypertrophie. "hypertroph" ne collisionne avec aucun autre mot-clé.
  if (s.includes("hypertroph")) return "musculation";
  if (s.includes("explosiv")) return "puissance";
  if (s.includes("perte de poids") || s.includes("perte-de-poids")) return "perte_de_poids";
  if (s.includes("squat")) return "powerlifting_squat";
  if (s.includes("bench")) return "powerlifting_bench";
  if (s.includes("deadlift")) return "powerlifting_deadlift";
  if (s.includes("spécialisation") && (s.includes("arrach") || s.includes("snatch"))) return "halterophilie_snatch";
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
  if (s.includes("run") || s.includes("marathon") || s.includes("trail") || s.includes("course") || s.includes("fond") || s.includes("endur")) return "endurance";
  return "autre";
}

const EXERCISES = {
  halterophilie: {
    technique: ["Arraché technique à 60% — 6×2", "Épaulé à genoux + montée (drill) — 5×3", "Tirage arraché lent — 4×4", "Squat avant pause basse — 4×3", "Mobilité chevilles et hanches — 10 min"],
    volume: ["Back squat — 5×5", "Épaulé-jeté à 70% — 5×3", "Soulevé de terre roumain — 4×8", "Développé militaire — 4×8", "Fentes marchées — 3×12", "Gainage anti-rotation — 3×40s"],
    intensite: ["Arraché compétition à 90%+ — 5×1", "Épaulé-jeté max effort — 5×1", "Squat avant lourd — 4×2", "Tirage haltère à 100%+ — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling chaîne postérieure", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Arraché : tentative de maximum", "Épaulé-jeté : tentative de maximum", "Squat avant : max du cycle", "Bilan technique (vidéo)"],
  },
  powerlifting: {
    technique: ["Squat pause — 4×3", "Bench pause 2s — 4×3", "Deadlift déficit — 4×3", "Mobilité hanches et épaules — 10 min"],
    volume: ["Back squat — 5×5", "Développé couché — 5×5", "Soulevé de terre — 4×5", "Gainage anti-rotation — 3×40s"],
    intensite: ["Squat lourd — 5×3", "Développé couché lourd — 5×3", "Deadlift lourd — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling dos et jambes", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Squat : tentative de maximum", "Développé couché : tentative de maximum", "Deadlift : tentative de maximum", "Bilan technique (vidéo)"],
  },
  musculation: {
    technique: ["Squat gobelet technique — 4×8", "Rowing haltère un bras focus posture — 4×8 par côté", "Développé incliné technique — 4×8", "Mobilité épaules et hanches — 10 min"],
    volume: ["Squat — 4×10", "Tirage horizontal — 4×10", "Développé couché — 4×10", "Développé militaire — 3×12", "Curl biceps barre — 3×12"],
    intensite: ["Presse à cuisses lourde — 4×6", "Tractions lestées — 4×6", "Développé couché lourd — 4×6", "Extension triceps poulie lourde — 3×8"],
    recuperation: ["Vélo ou marche légère — 20 min", "Stretching global — 15 min", "Foam rolling dos et jambes", "Respiration et mobilité active"],
    test: ["Test : squat 5RM", "Test : développé couché 5RM", "Test : tractions strictes max", "Tour de taille / mensurations"],
  },
  powerlifting_squat: {
    technique: ["Squat pause — 4×3", "Bench pause 2s — 4×3", "Deadlift déficit — 4×3", "Mobilité hanches et épaules — 10 min"],
    volume: ["Back squat — 5×5", "Développé couché — 5×5", "Soulevé de terre — 4×5", "Gainage anti-rotation — 3×40s"],
    intensite: ["Squat lourd — 5×3", "Développé couché lourd — 5×3", "Deadlift lourd — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling dos et jambes", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Squat : tentative de maximum", "Développé couché : tentative de maximum", "Deadlift : tentative de maximum", "Bilan technique (vidéo)"],
  },
  powerlifting_bench: {
    technique: ["Squat pause — 4×3", "Bench pause 2s — 4×3", "Deadlift déficit — 4×3", "Mobilité hanches et épaules — 10 min"],
    volume: ["Back squat — 5×5", "Développé couché — 5×5", "Soulevé de terre — 4×5", "Gainage anti-rotation — 3×40s"],
    intensite: ["Squat lourd — 5×3", "Développé couché lourd — 5×3", "Deadlift lourd — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling dos et jambes", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Squat : tentative de maximum", "Développé couché : tentative de maximum", "Deadlift : tentative de maximum", "Bilan technique (vidéo)"],
  },
  powerlifting_deadlift: {
    technique: ["Squat pause — 4×3", "Bench pause 2s — 4×3", "Deadlift déficit — 4×3", "Mobilité hanches et épaules — 10 min"],
    volume: ["Back squat — 5×5", "Développé couché — 5×5", "Soulevé de terre — 4×5", "Gainage anti-rotation — 3×40s"],
    intensite: ["Squat lourd — 5×3", "Développé couché lourd — 5×3", "Deadlift lourd — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling dos et jambes", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Squat : tentative de maximum", "Développé couché : tentative de maximum", "Deadlift : tentative de maximum", "Bilan technique (vidéo)"],
  },
  halterophilie_snatch: {
    technique: ["Arraché technique à 60% — 6×2", "Épaulé à genoux + montée (drill) — 5×3", "Tirage arraché lent — 4×4", "Squat avant pause basse — 4×3", "Mobilité chevilles et hanches — 10 min"],
    volume: ["Back squat — 5×5", "Épaulé-jeté à 70% — 5×3", "Soulevé de terre roumain — 4×8", "Développé militaire — 4×8", "Fentes marchées — 3×12", "Gainage anti-rotation — 3×40s"],
    intensite: ["Arraché compétition à 90%+ — 5×1", "Épaulé-jeté max effort — 5×1", "Squat avant lourd — 4×2", "Tirage haltère à 100%+ — 4×2"],
    recuperation: ["Mobilité hanches et chevilles — 15 min", "Foam rolling chaîne postérieure", "Stretching actif épaules — 10 min", "Marche active — 20 min"],
    test: ["Arraché : tentative de maximum", "Épaulé-jeté : tentative de maximum", "Squat avant : max du cycle", "Bilan technique (vidéo)"],
  },
  puissance: {
    technique: ["Squat gobelet technique — 4×5", "Épaulé technique léger — 4×3", "Skipping + gammes — 3×20m", "Mobilité hanches et chevilles — 10 min"],
    volume: ["Squat — 4×6", "Fentes sautées — 3×10", "Tirage vertical — 3×10", "Gainage complet — 3×40s"],
    intensite: ["Box jump — 4×5", "Épaulé puissance — 4×3", "Squat jump chargé — 4×5", "Sprints courts en côte — 5×20m"],
    recuperation: ["Mobilité complète — 15 min", "Foam rolling jambes et dos", "Marche active — 20 min", "Stretching global — 15 min"],
    test: ["Test : squat jump hauteur", "Test : épaulé max", "Sprint 30m chronométré", "Bilan explosivité vidéo"],
  },
  perte_de_poids: {
    technique: ["Squat gobelet technique — 4×8", "Fentes marchées technique — 3×10 par jambe", "Rowing haltère technique — 4×8", "Mobilité globale — 10 min"],
    volume: ["Circuit full-body : squat + pompes + rowing — 4 tours", "Vélo ou rameur continu — 30 min", "Gainage complet — 3×40s"],
    intensite: ["Circuit cardio : burpees + jumping jacks + mountain climbers — 6 rounds", "Tabata vélo/rameur — 8×20s effort/10s récup", "Corde à sauter intervalles — 8×1 min"],
    recuperation: ["Marche active — 30 min", "Stretching global — 15 min", "Mobilité douce — 15 min", "Respiration et relaxation — 10 min"],
    test: ["Test : Cooper 12 min", "Tour de taille / mensurations", "Test : squat max reps 2 min", "Bilan poids/composition corporelle"],
  },
  sprint: {
    technique: ["Drills : montées de genoux — 4×30m", "Talons-fesses — 4×30m", "Foulées bondissantes — 4×30m", "Skipping A/B/C — 3×20m chaque", "Gamme complète sprint — 3 séries"],
    volume: ["Sprint 60m à 80% — 8 reps", "Fartlek 20 min (1 min vif / 1 min calme)", "Pas courus spéciaux — 3×60m", "Squats + fentes + hip thrust — 4×10", "Gainage dynamique — 3×45s"],
    intensite: ["Sprint 30m départ arrêté — 6 reps (récup 5 min)", "Sprint 60m à 95% — 4 reps", "Départs en blocs — 5×30m", "Pliométrie : sauts horizontaux — 3×6"],
    recuperation: ["Jogging léger — 20 min", "Stretching actif membres inférieurs — 15 min", "Foam roller jambes", "Balnéo ou cryothérapie si disponible"],
    test: ["Sprint 60m chronométré", "Sprint 100m (ou distance principale)", "Détente verticale : test saut", "Bilan biomécanique vidéo"],
  },
  combat: {
    technique: ["Esquives et déplacements — 3×5 min", "Enchaînements techniques au sac — 5×3 min", "Shadow boxing — 4×3 min", "Combinaisons avec partenaire — 3×5 min"],
    volume: ["Assauts légers — 6×3 min", "Sac lourd endurance — 5×3 min", "Circuit : tractions + dips + abdos — 4 tours", "Corde à sauter — 5×3 min", "Gainage + travail au sol — 3×45s"],
    intensite: ["Assauts à intensité max — 4×3 min", "HIIT corde à sauter : 10×30s", "Sparring debout — 3×3 min", "Pliométrie combat : sauts + frappes — 3×6"],
    recuperation: ["Yoga ou stretching global — 20 min", "Mobilité épaules, hanches, colonne", "Respiration et relaxation — 10 min", "Cryothérapie si disponible"],
    test: ["Test vitesse de frappe", "Assaut de qualification", "Test endurance spécifique (rounds enchaînés)", "Bilan technique vidéo"],
  },
  fitness: {
    technique: ["Squat overhead technique — 4×5", "Deadlift roumain focus posture — 4×6", "Pull-up avec bande — 4×6", "Développé haltères — 4×8", "Mobilité thoracique et hanches — 10 min"],
    volume: ["Back squat — 4×10", "Développé couché — 4×10", "Tractions lestées — 4×8", "Fentes marchées — 3×12", "Ab wheel ou planche — 3×45s"],
    intensite: ["AMRAP 15 min : 5 tractions + 10 pompes + 15 squats", "Tabata : burpees + kettlebell swings — 8 rounds", "Complex barbell : épaulé + squat + militaire — 5 séries", "Sprints rowing ou vélo : 6×250m effort max"],
    recuperation: ["Vélo ou marche légère — 20 min", "Stretching global — 15 min", "Foam rolling dos et jambes", "Respiration et mobilité active"],
    test: ["Benchmark WOD : Fran (21-15-9 thrusters + tractions, for time)", "Benchmark WOD : Cindy (AMRAP 20 min : 5 tractions + 10 pompes + 15 squats)", "Benchmark WOD : Murph (1 mile course + 100 tractions + 200 pompes + 300 squats + 1 mile course)", "Benchmark WOD : Grace (30 épaulé-jeté for time)"],
  },
  collectif: {
    technique: ["Exercices techniques au poste — 20 min", "Passes + combinaisons à 2/3 — 15 min", "Travail défensif en situation réduite", "Prise d'information et placement — 15 min"],
    volume: ["Circuit cardio : navettes + sauts + sprint — 4 tours", "Balle à intensité soutenue — 20 min", "Renforcement bas du corps — 4×10", "Gainage et proprioception — 3×45s"],
    intensite: ["Jeux effectif réduit haute intensité — 3×8 min", "Intervalles : 8×15s effort / 45s récup", "Transitions défense/attaque — 4 séries", "Accélérations + changements de direction — 6×20m"],
    recuperation: ["Jogging léger + gamme — 15 min", "Stretching membres inférieurs — 15 min", "Travail technique basse intensité", "Cryothérapie si disponible"],
    test: ["Sprint 20m (avec et sans balle)", "Test de détente verticale", "Match de préparation", "Yo-Yo test ou équivalent"],
  },
  endurance: {
    technique: ["Foulées éducatives — 4×100m", "Travail de foulée et technique de course — 20 min", "Côtes courtes 8% — 8×50m", "Travail de bras et gainage en course — 10 min"],
    volume: ["Sortie longue en endurance fondamentale — 50-80 min", "Fartlek progressif — 40 min", "Renforcement : mollets + squats + fentes", "Gainage dynamique — 3×45s"],
    intensite: ["Intervalles 400m allure 5km — 8 reps (récup 90s)", "Seuil lactique : 20 min continu", "Côtes longues 6% — 5×400m", "Tempo run — 30 min allure semi"],
    recuperation: ["Footing léger très doux — 20-30 min", "Stretching global — 15 min", "Bain froid jambes", "Foam roller mollets et IT band"],
    test: ["Test VMA : demi-Cooper ou 6 min", "Course sur distance cible", "Test de seuil lactique", "Bilan FC repos + effort"],
  },
  cyclisme: {
    technique: ["Travail de cadence 100 rpm — 20 min", "Moulinage développement réduit — 15 min", "Position aéro + exercices de placement — 10 min", "Single leg pedaling — 3×2 min par jambe"],
    volume: ["Sortie endurance Z2 (60-70% FCmax) — 60-90 min", "Travail en côte progressive — 30 min", "Renforcement : squat + leg press + gainage", "Intervalles doux : 2×20 min Z2/Z3"],
    intensite: ["Intervalles VO2max : 5×4 min à 110% FTP (récup 4 min)", "Sprints : 6×15s all-out (récup 5 min)", "Montée longue : 2×15 min au seuil", "Pyramide puissance : 3-4-5-4-3 min"],
    recuperation: ["Vélo doux Z1 — 30 min", "Stretching quadriceps, fléchisseurs, mollets", "Foam rolling jambes et dos", "Mobilité hanches et genoux"],
    test: ["Test FTP : 20 min à puissance max", "Sprint 10s : puissance maximale", "VO2max indirect : test 5 min", "Bilan puissance sur segment référence"],
  },
  natation: {
    technique: ["Drill catch-up crawl — 4×50m", "Nage avec palmes (jambes seules) — 4×50m", "Travail de virage et poussée mur — 20 min", "Coordination bras/souffle — 3×100m"],
    volume: ["Série de fond : 10×100m (récup 15s)", "Pyramide : 200-400-600-400-200m", "Nage alternée 4 nages — 1000m", "Renforcement sec : gainage + tractions — 3×10"],
    intensite: ["Sprints : 10×50m (récup 1 min)", "Intervalles VO2 : 4×200m effort max (récup 3 min)", "Départs plongeon compétition — 6 reps", "Virages haute intensité — 10 reps"],
    recuperation: ["Nage très douce — 20-30 min", "Stretching épaules et mobilité globale", "Eau froide + relaxation", "Mobilité thoracique et hanches"],
    test: ["Test 400m allure compétition", "Sprint 50m chronométré", "Test VO2 : 3×300m progressif", "Bilan technique vidéo"],
  },
  ski: {
    technique: ["Position de ski statique (chaise) + transferts d'appui — 4×45s", "Proprioception genou sur plateau instable — 3×10 par jambe", "Fentes latérales dynamiques (dévers) — 4×10 par jambe", "Gainage rotatoire type slalom — 3×40s"],
    volume: ["Squat bulgare — 4×10 par jambe", "Chaise au mur — 4×60s", "Fentes marchées + rotation tronc — 3×12", "Gainage complet : planche + gainage latéral — 3×45s", "Mollets debout — 4×15"],
    intensite: ["Pliométrie latérale : sauts de côté — 4×10", "Squat jump — 5×8", "Circuit explosivité jambes : squats sautés + fentes sautées — 4 tours", "Sprints courts en côte — 6×20m"],
    recuperation: ["Mobilité chevilles et hanches — 15 min", "Stretching quadriceps et ischio-jambiers — 15 min", "Foam rolling jambes complètes", "Vélo léger — 20 min"],
    test: ["Test chaise au mur : temps max", "Test squat jump : hauteur", "Test proprioception unipodal : temps de tenue", "Bilan gainage : planche max"],
  },
  aviron: {
    technique: ["Rameur technique basse intensité : focus séquence jambes-dos-bras — 20 min", "Tirage horizontal poulie, focus gainage — 4×10", "Rameur : drill par segments (jambes seules / dos seul / bras seuls) — 15 min", "Mobilité thoracique et hanches — 10 min"],
    volume: ["Rameur endurance continue — 30-40 min à allure modérée", "Soulevé de terre — 4×8", "Tirage vertical + tirage horizontal — 4×10", "Gainage anti-flexion (planche + superman) — 3×45s"],
    intensite: ["Rameur intervalles : 6×500m (récup 2 min)", "Rameur sprint : 8×250m effort max (récup 90s)", "Squat + tirage complexe — 4×6", "Circuit puissance : deadlift + row + squat jump — 4 tours"],
    recuperation: ["Rameur très léger — 15 min", "Stretching dos, épaules, ischio-jambiers — 15 min", "Foam rolling dos et jambes", "Mobilité colonne thoracique — 10 min"],
    test: ["Test rameur 2000m chronométré", "Test rameur 500m sprint", "Test deadlift 5RM", "Bilan technique vidéo du geste"],
  },
  gymnastique: {
    technique: ["Gainage statique : ATR contre mur — 4×20-30s", "Placement bassin et gainage en suspension — 4×15s", "Technique de réception de saut — 4×6", "Mobilité épaules et poignets — 15 min"],
    volume: ["Tractions strictes — 4×6", "Dips — 4×8", "L-sit ou tuck-sit tenu — 4×15-20s", "Pompes déclinées — 3×12", "Gainage complet : planche + gainage latéral — 3×40s"],
    intensite: ["Pliométrie : sauts groupés + réceptions — 4×6", "Muscle-up ou tractions explosives — 4×5", "Circuit force relative : tractions + dips + pompes — 4 tours", "Handstand hold contre mur — 4×20s"],
    recuperation: ["Mobilité épaules, hanches, poignets — 15 min", "Stretching global — 15 min", "Foam rolling dos et épaules", "Respiration et relaxation — 10 min"],
    test: ["Test tractions strictes max", "Test ATR/handstand : temps de tenue", "Test L-sit : temps max", "Bilan technique vidéo"],
  },
  autre: {
    technique: ["Échauffement technique spécifique — 15 min", "Exercices de coordination et placement — 20 min", "Travail des gestes fondamentaux — 3 séries", "Mobilité et activation musculaire — 10 min"],
    volume: ["Travail de fond à intensité modérée — 30-45 min", "Circuit : squats + fentes + pompes — 4 tours", "Gainage : planche + rotation + pont fessier — 3×45s", "Corde à sauter endurance — 5×3 min"],
    intensite: ["Intervalles : 8×30s effort max / 90s récup", "Circuit haute intensité — 5 exercices × 4 tours", "Sprints courts — 6×20m", "Travail de puissance : sauts, explosions — 4×6"],
    recuperation: ["Activité légère au choix — 20 min", "Stretching global — 15 min", "Foam rolling zones de travail", "Respiration et relaxation — 10 min"],
    test: ["Test de condition physique globale", "Benchmark spécifique à la discipline", "Test de force ou d'endurance clé", "Bilan et ajustement du programme"],
  },
};

function buildNotesFromBank(bank, type, cycleIndex, shape, phase) {
  const offset = (cycleIndex * 2) % bank.length;
  const rotated = [...bank.slice(offset), ...bank.slice(0, offset)];
  if (type !== "volume" && type !== "intensite") return rotated.join("\n");
  return rotated.map(line => formatPrescription(parseExercise(line), shape, phase)).join("\n");
}

function buildNotes(category, type, cycleIndex, shape, phase) {
  return buildNotesFromBank(EXERCISES[category][type], type, cycleIndex, shape, phase);
}

// ====================================================================================
// Curriculum sportif — voir generate/route.ts pour le raisonnement détaillé de chaque règle.
// ====================================================================================

const ENDURANCE_ARCHETYPES = [
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
function selectEndurance(n) {
  return Array.from({ length: n }, (_, i) => ENDURANCE_ARCHETYPES[i % ENDURANCE_ARCHETYPES.length]);
}

const SPRINT_ACCELERATION = { name: "Accélération", type: "intensite", exercises: [
  "Gammes techniques : montées de genoux + talons-fesses — 3×20m",
  "Départs blocs — 6×20m (récup 4 min)",
  "Pliométrie : bondissements — 4×20m",
  "Squat jump — 4×6",
]};
const SPRINT_VITESSE_MAX = { name: "Vitesse max", type: "intensite", exercises: [
  "Gammes techniques : foulées bondissantes — 3×20m",
  "Sprint 60m à 95% — 5 reps (récup 5 min)",
  "Sprint 30m lancé — 4 reps (récup 4 min)",
  "Pliométrie : sauts horizontaux — 3×6",
]};
const SPRINT_RENFO = { name: "Renfo", type: "volume", exercises: [
  "Squat — 4×5@75%", "Soulevé de terre — 3×5@75%", "Fentes marchées — 3×12",
]};
const SPRINT_ENDURANCE_VITESSE = { name: "Endurance de vitesse", type: "volume", exercises: [
  "Sprint 150m à 85% — 6 reps (récup 4 min)", "Sprint 120m à 85% — 5 reps (récup 3 min)",
]};
const SPRINT_TEMPO = { name: "Tempo", type: "volume", exercises: [
  "Tempo run 200m — 8 reps (récup 90s)", "Fartlek tempo — 25 min",
]};
const SPRINT_CIRCUIT = { name: "Circuit", type: "technique", exercises: [
  "Circuit vitesse : gammes + starts + accélérations — 4 tours", "Gamme complète sprint — 3 séries",
]};
// Ordre volontairement PAS [Accélération, Vitesse max, ...] : les deux sont "intensite" (palier
// dur), adjacentes en positions 0/1 elles entrent systématiquement en collision dès que les jours
// choisis incluent 2 jours calendairement consécutifs (Lun+Mar, très courant) — trouvé en prod,
// "Vitesse max" n'apparaissait plus jamais sur un programme réel. Renfo (palier modéré) intercalé
// entre les deux évite la collision par construction ; même logique pour Circuit entre Endurance
// de vitesse et Tempo (tous deux palier modéré).
const SPRINT_PRIORITY = [SPRINT_ACCELERATION, SPRINT_RENFO, SPRINT_VITESSE_MAX, SPRINT_ENDURANCE_VITESSE, SPRINT_CIRCUIT, SPRINT_TEMPO];
function selectSprint(n) {
  if (n === 2) return [SPRINT_ACCELERATION, SPRINT_VITESSE_MAX];
  return Array.from({ length: n }, (_, i) => SPRINT_PRIORITY[i % SPRINT_PRIORITY.length]);
}

const HA_SNATCH = { name: "Focus Arraché", type: "intensite", exercises: [
  "Arraché — 5×2@75%", "Tirage arraché — 4×3@80%", "Squat arraché — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_CLEAN_JERK = { name: "Focus Épaulé-Jeté", type: "intensite", exercises: [
  "Épaulé-jeté — 5×2@75%", "Tirage épaulé — 4×3@80%", "Squat avant — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_CLEAN = { name: "Focus Épaulé", type: "intensite", exercises: [
  "Épaulé — 5×2@75%", "Tirage épaulé — 4×3@80%", "Squat avant — 4×3@70%", "Gainage anti-rotation — 3×40s",
]};
const HA_JERK = { name: "Focus Jeté", type: "intensite", exercises: [
  "Jeté — 5×2@75%", "Tirage épaulé — 4×3@78%", "Squat avant — 4×3@70%", "Développé militaire — 3×8@65%",
]};
const HA_TOTAL = { name: "Focus Total", type: "test", exercises: [
  "Complexe arraché + épaulé-jeté — 4×1@80%", "Simulation total : arraché puis épaulé-jeté",
]};
const HA_LIGHT = { name: "Séance légère variantes", type: "technique", exercises: [
  "Arraché variantes légères — 4×3@60%", "Épaulé-jeté variantes techniques — 4×3@60%", "Squat léger + mobilité — 3×5",
]};
function selectHalterophilie(n) {
  if (n <= 2) return [HA_SNATCH, HA_CLEAN_JERK].slice(0, n);
  if (n === 3) return [HA_SNATCH, HA_CLEAN_JERK, HA_TOTAL];
  if (n === 4) return [HA_SNATCH, HA_CLEAN, HA_JERK, HA_TOTAL];
  const base = [HA_SNATCH, HA_CLEAN, HA_JERK, HA_TOTAL, HA_LIGHT];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

const PL_SQUAT = { name: "Focus Squat", type: "intensite", exercises: [
  "Back squat — 5×3@78%", "Squat pause — 4×3@70%", "Front squat — 4×4@70%", "Gainage anti-rotation — 3×40s",
]};
const PL_BENCH = { name: "Focus Bench", type: "intensite", exercises: [
  "Développé couché — 5×3@78%", "Bench pause 2s — 4×3@70%", "Développé prise serrée — 4×5@65%", "Tirage horizontal — 3×10@65%",
]};
const PL_DEADLIFT = { name: "Focus Deadlift", type: "intensite", exercises: [
  "Soulevé de terre — 5×3@78%", "Deadlift déficit — 4×3@65%", "Soulevé de terre roumain — 4×6@65%", "Gainage anti-extension — 3×40s",
]};
function selectPowerlifting(n) {
  const rotation = [PL_SQUAT, PL_BENCH, PL_DEADLIFT];
  const counts = { squat: 0, bench: 0, deadlift: 0 };
  const result = [];
  let i = 0;
  while (result.length < n && i < n * 4) {
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

const COLLECTIF_TECHNIQUE = { name: "Technique", type: "technique", exercises: [
  "Exercices techniques au poste — 20 min", "Passes + combinaisons à 2/3 — 15 min", "Travail défensif en situation réduite — 20 min",
]};
const COLLECTIF_ENDURANCE = { name: "Endurance", type: "volume", exercises: [
  "Circuit cardio : navettes + sauts + sprint — 4 tours", "Balle à intensité soutenue — 20 min",
]};
const COLLECTIF_VITESSE = { name: "Vitesse", type: "intensite", exercises: [
  "Accélérations + changements de direction — 6×20m", "Intervalles : 8×15s effort (récup 45s)",
]};
const COLLECTIF_RENFO = { name: "Renfo", type: "technique", exercises: [
  "Renforcement bas du corps — 4×10", "Gainage et proprioception — 3×45s",
]};
const COLLECTIF_BASE = [COLLECTIF_TECHNIQUE, COLLECTIF_TECHNIQUE, COLLECTIF_ENDURANCE, COLLECTIF_VITESSE, COLLECTIF_RENFO];
function selectCollectif(n) {
  return Array.from({ length: n }, (_, i) => COLLECTIF_BASE[i % COLLECTIF_BASE.length]);
}

const MUSCU_JAMBES = { name: "Jambes", type: "volume", exercises: [
  "Squat — 4×8@70%", "Presse à cuisses — 3×12@65%", "Leg curl — 3×12@60%", "Mollets debout — 3×15@60%",
]};
const MUSCU_DOS = { name: "Dos", type: "volume", exercises: [
  "Tirage horizontal — 4×8@70%", "Tirage vertical — 3×12@65%", "Curl biceps barre — 3×12@60%", "Curl marteau — 3×12@60%",
]};
const MUSCU_PECTORAUX = { name: "Pectoraux", type: "volume", exercises: [
  "Développé couché — 4×8@70%", "Développé incliné haltères — 3×10@65%", "Écarté couché — 3×12@60%", "Dips — 3×10@60%",
]};
const MUSCU_EPAULES = { name: "Épaules", type: "volume", exercises: [
  "Développé militaire — 4×8@70%", "Élévations latérales — 3×15@55%", "Oiseau — 3×15@55%", "Shrugs — 3×12@65%",
]};
const MUSCU_BRAS = { name: "Bras", type: "volume", exercises: [
  "Développé prise serrée — 4×8@70%", "Extension triceps poulie — 3×12@60%", "Curl barre — 3×12@60%", "Curl marteau — 3×12@60%",
]};
const MUSCU_BASE = [MUSCU_JAMBES, MUSCU_DOS, MUSCU_PECTORAUX, MUSCU_EPAULES, MUSCU_BRAS];
function selectMusculation(n) {
  return Array.from({ length: n }, (_, i) => MUSCU_BASE[i % MUSCU_BASE.length]);
}

const SQUAT_SPEC_PATTERN = [PL_SQUAT, PL_SQUAT, PL_BENCH, PL_SQUAT, PL_DEADLIFT, PL_SQUAT];
function selectSquatSpecialization(n) {
  return Array.from({ length: n }, (_, i) => SQUAT_SPEC_PATTERN[i % SQUAT_SPEC_PATTERN.length]);
}
const BENCH_SPEC_PATTERN = [PL_BENCH, PL_BENCH, PL_SQUAT, PL_BENCH, PL_DEADLIFT, PL_BENCH];
function selectBenchSpecialization(n) {
  return Array.from({ length: n }, (_, i) => BENCH_SPEC_PATTERN[i % BENCH_SPEC_PATTERN.length]);
}
const DEADLIFT_SPEC_PATTERN = [PL_DEADLIFT, PL_DEADLIFT, PL_SQUAT, PL_DEADLIFT, PL_BENCH, PL_DEADLIFT];
function selectDeadliftSpecialization(n) {
  return Array.from({ length: n }, (_, i) => DEADLIFT_SPEC_PATTERN[i % DEADLIFT_SPEC_PATTERN.length]);
}
const SNATCH_SPEC_PATTERN = [HA_SNATCH, HA_SNATCH, HA_CLEAN_JERK, HA_SNATCH, HA_LIGHT];
function selectSnatchSpecialization(n) {
  return Array.from({ length: n }, (_, i) => SNATCH_SPEC_PATTERN[i % SNATCH_SPEC_PATTERN.length]);
}

const PUISSANCE_FORCE = { name: "Force", type: "intensite", exercises: [
  "Back squat — 5×3@80%", "Développé couché — 5×3@80%", "Gainage complet — 3×40s",
]};
const PUISSANCE_PUISSANCE = { name: "Puissance", type: "intensite", exercises: [
  "Épaulé — 4×3@70%", "Arraché puissance — 4×3@65%", "Push press — 4×4@65%", "Gainage complet — 3×40s",
]};
const PUISSANCE_PLYO = { name: "Pliométrie", type: "intensite", exercises: [
  "Box jump — 4×5", "Sauts en contrebas (depth jump) — 4×5", "Bondissements — 4×20m", "Gainage complet — 3×40s",
]};
const PUISSANCE_SPRINT = { name: "Sprint", type: "intensite", exercises: [
  "Départs blocs — 6×20m (récup 4 min)", "Sprint 30m — 5 reps", "Gainage complet — 3×40s",
]};
const PUISSANCE_PRIORITY = [PUISSANCE_FORCE, PUISSANCE_PUISSANCE, PUISSANCE_PLYO, PUISSANCE_PLYO, PUISSANCE_SPRINT];
function selectPuissanceExplosivite(n) {
  return Array.from({ length: n }, (_, i) => PUISSANCE_PRIORITY[i % PUISSANCE_PRIORITY.length]);
}

const PDP_MUSCU = { name: "Musculation full-body", type: "volume", exercises: [
  "Squat — 4×10@65%", "Développé couché — 4×10@65%", "Tirage horizontal — 4×10@65%", "Gainage complet — 3×40s",
]};
const PDP_CARDIO = { name: "Cardio", type: "intensite", exercises: [
  "Vélo ou rameur fractionné — 8×2 min effort / 1 min récup", "Circuit cardio : burpees + jumping jacks + mountain climbers — 4 tours",
]};
const PDP_PRIORITY = [PDP_MUSCU, PDP_CARDIO, PDP_MUSCU, PDP_CARDIO];
function selectPertePoids(n) {
  return Array.from({ length: n }, (_, i) => PDP_PRIORITY[i % PDP_PRIORITY.length]);
}

const FITNESS_FORCE = { name: "Force", type: "intensite", exercises: [
  "Back squat — 5×5@75%", "Développé militaire — 4×5@70%", "WOD finisher : 10-8-6-4-2 burpees + kettlebell swings",
]};
const FITNESS_METCON = { name: "Metcon / WOD", type: "intensite", exercises: [
  "Gammes + activation — 10 min", "WOD For Time : 21-15-9 thrusters + tractions", "AMRAP 15 min : 5 pompes + 10 squats + 15 mountain climbers",
]};
const FITNESS_GYMNASTIQUE = { name: "Gymnastique / Skill", type: "technique", exercises: [
  "Muscle-up progression : négatives + tirage — 5×3", "Handstand hold contre mur — 4×20s", "EMOM 10 min : 5 tractions strictes + 10 pompes",
]};
const FITNESS_MONOSTRUCTURAL = { name: "Monostructural", type: "volume", exercises: [
  "Rameur continu — 30 min endurance", "Bike ou course fractionné — 10×1 min effort / 1 min récup",
]};
const FITNESS_PRIORITY = [FITNESS_FORCE, FITNESS_METCON, FITNESS_GYMNASTIQUE, FITNESS_MONOSTRUCTURAL];
function selectFitness(n) {
  return Array.from({ length: n }, (_, i) => FITNESS_PRIORITY[i % FITNESS_PRIORITY.length]);
}

const COMBAT_TECHNIQUE = { name: "Technique", type: "technique", exercises: [
  "Shadow boxing technique — 4×3 min", "Enchaînements techniques au sac — 5×3 min", "Travail au sol / projections technique (partenaire) — 20 min",
]};
const COMBAT_SPARRING = { name: "Sparring / Randori", type: "intensite", exercises: [
  "Échauffement technique — 10 min", "Sparring / randori — 5×3 min (récup 1 min)", "Retour au calme + mobilité — 10 min",
]};
const COMBAT_CONDITIONNEMENT = { name: "Conditionnement", type: "intensite", exercises: [
  "HIIT corde à sauter — 10×30s effort / 30s récup", "Circuit combat : sac + pompes + squats — 4 tours", "Sprints courts — 6×20m",
]};
const COMBAT_FORCE = { name: "Force & Explosivité", type: "volume", exercises: [
  "Développé couché — 4×5@75%", "Squat ou fentes sautées — 4×6", "Médecine ball throws (puissance) — 4×8",
]};
const COMBAT_PRIORITY = [COMBAT_TECHNIQUE, COMBAT_SPARRING, COMBAT_CONDITIONNEMENT, COMBAT_FORCE];
function selectCombat(n) {
  return Array.from({ length: n }, (_, i) => COMBAT_PRIORITY[i % COMBAT_PRIORITY.length]);
}

const SPORT_CURRICULUM = {
  endurance: selectEndurance,
  sprint: selectSprint,
  halterophilie: selectHalterophilie,
  halterophilie_snatch: selectSnatchSpecialization,
  powerlifting: selectPowerlifting,
  powerlifting_squat: selectSquatSpecialization,
  powerlifting_bench: selectBenchSpecialization,
  powerlifting_deadlift: selectDeadliftSpecialization,
  collectif: selectCollectif,
  musculation: selectMusculation,
  puissance: selectPuissanceExplosivite,
  perte_de_poids: selectPertePoids,
  fitness: selectFitness,
  combat: selectCombat,
};

function sessionName(type, weekIdx, dayIdx) {
  const names = SESSION_NAMES[type];
  return names[(weekIdx + dayIdx) % names.length];
}

const RPE_BUCKET = {
  recuperation: "easy", technique: "easy", volume: "moderate", intensite: "hard", test: "hard",
};

// Calcule la séquence de semaines — gère les deux modèles (blocs de 4, ou le modèle spécifique
// à 6 semaines) derrière une interface commune. `focus` toujours absent ici (voir en-tête) —
// shape "universelle" plutôt que shapeForCycle(focus, ...) du générateur live.
function buildWeekSpecs(duration) {
  if (duration === 6) {
    const shape = universalShapeForCycle(0, true); // "taper" — modèle à 6 semaines = un seul bloc, toujours traité comme final
    const offsets = SHAPE_OFFSETS[shape];
    return SIX_WEEK_PHASE_INDEX.map((pIdx, i) => ({
      weekDiffOffset: SIX_WEEK_CYCLE_BASE[i] + offsets[pIdx],
      weekLoad: PHASE_LOAD[pIdx],
      isMrvWeek: pIdx === 2,
      rotationAnchor: 0,
      shape,
      prescriptionPhase: pIdx,
    }));
  }

  const mesocycles = duration / 4;
  const specs = [];
  for (let c = 0; c < mesocycles; c++) {
    const isLastCycle = c === mesocycles - 1;
    const shape = universalShapeForCycle(c, isLastCycle);
    const offsets = SHAPE_OFFSETS[shape];
    for (let phase = 0; phase < 4; phase++) {
      specs.push({
        weekDiffOffset: c + offsets[phase],
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

function generateTemplate({ sport, level, days, duration }) {
  const category = getSportCategory(sport ?? "");
  const focusDist = FOCUS_DIST_MIXTE; // approximation universelle (pas de focus par programme)
  const baseDiff = LEVEL_BASE_DIFF[level] ?? 6;
  const sortedDays = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const weekSpecs = buildWeekSpecs(duration);
  const weeks = [];
  // Dernier jour d'entraînement de la semaine précédente — voir generate/route.ts, "Phase B
  // inter-semaines" : sans ça, Phase A2/B ne comparent les jours qu'au sein d'une même semaine.
  let previousWeekLastDay = null;

  weekSpecs.forEach((spec, w) => {
    const { weekDiffOffset, weekLoad, isMrvWeek, rotationAnchor, shape, prescriptionPhase } = spec;
    const weekDiff = Math.max(1, Math.min(10, baseDiff + weekDiffOffset));
    const week = {};

    // Phase A — curriculum sportif si dispo pour cette catégorie, sinon rotation FOCUS_DIST générique.
    const curriculumSelector = SPORT_CURRICULUM[category];
    const archetypes = curriculumSelector?.(sortedDays.length);
    const dayPlans = sortedDays.map((day, dayIdx) => {
      const isLastDayOfWeek = dayIdx === sortedDays.length - 1;
      const forced = isMrvWeek && isLastDayOfWeek;
      let type, archetypeName, exercises;
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

    // Phase A2 — règle universelle, s'applique aussi aux sports à curriculum (voir generate/route.ts).
    if (dayPlans.length > 0 && !dayPlans[0].forced && RPE_BUCKET[dayPlans[0].type] === "easy") {
      dayPlans[0].type = "intensite";
      dayPlans[0].archetypeName = undefined;
      dayPlans[0].exercises = undefined;
    }

    // Phase B — règle universelle d'alternance des paliers RPE, s'applique aussi aux sports à
    // curriculum. Voir generate/route.ts pour le détail complet du raisonnement.
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (let i = 1; i < dayPlans.length; i++) {
        const prev = dayPlans[i - 1];
        const cur = dayPlans[i];
        if (cur.calIdx - prev.calIdx !== 1) continue;
        if (RPE_BUCKET[prev.type] !== RPE_BUCKET[cur.type]) continue;

        const targetIdx = cur.forced ? i - 1 : i;
        const keep = cur.forced ? cur : prev;
        const otherNeighbor = cur.forced ? dayPlans[i - 2] : dayPlans[i + 1];
        const keepBucket = RPE_BUCKET[keep.type];
        const avoidBuckets = new Set([keepBucket, otherNeighbor ? RPE_BUCKET[otherNeighbor.type] : null].filter(Boolean));
        const orderedCandidates =
          keepBucket === "hard" ? ["recuperation", "technique", "volume"]
          : keepBucket === "easy" ? ["intensite", "test", "volume"]
          : ["recuperation", "technique", "intensite", "test", "volume"];
        const replacement = orderedCandidates.find(t => !avoidBuckets.has(RPE_BUCKET[t])) ?? "volume";

        if (dayPlans[targetIdx].type !== replacement) {
          dayPlans[targetIdx].type = replacement;
          dayPlans[targetIdx].archetypeName = undefined;
          dayPlans[targetIdx].exercises = undefined;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Phase B inter-semaines — voir generate/route.ts pour le raisonnement complet. Ne se
    // déclenche que si Dimanche (calIdx 6) était un jour d'entraînement de la semaine précédente
    // ET que Lundi (calIdx 0) l'est aussi cette semaine-ci — les deux seuls jours réellement
    // consécutifs à travers une frontière de semaine.
    if (previousWeekLastDay && previousWeekLastDay.calIdx === 6 && dayPlans[0]?.calIdx === 0 &&
        RPE_BUCKET[previousWeekLastDay.type] === RPE_BUCKET[dayPlans[0].type]) {
      const keepBucket = RPE_BUCKET[previousWeekLastDay.type];
      const otherNeighbor = dayPlans[1];
      const avoidBuckets = new Set([keepBucket, otherNeighbor ? RPE_BUCKET[otherNeighbor.type] : null].filter(Boolean));
      const orderedCandidates =
        keepBucket === "hard" ? ["recuperation", "technique", "volume"]
        : keepBucket === "easy" ? ["intensite", "test", "volume"]
        : ["recuperation", "technique", "intensite", "test", "volume"];
      const replacement = orderedCandidates.find(t => !avoidBuckets.has(RPE_BUCKET[t])) ?? "volume";
      dayPlans[0].type = replacement;
      dayPlans[0].archetypeName = undefined;
      dayPlans[0].exercises = undefined;
    }
    previousWeekLastDay = dayPlans.length > 0
      ? { type: dayPlans[dayPlans.length - 1].type, calIdx: dayPlans[dayPlans.length - 1].calIdx }
      : null;

    // Phase C — construire les séances
    dayPlans.forEach(({ day, dayIdx, type, archetypeName, exercises }) => {
      const target_difficulty = sessionDifficulty(type, weekDiff);
      week[day] = [{
        name: archetypeName ?? sessionName(type, w, dayIdx),
        notes: exercises
          ? buildNotesFromBank(exercises, type, rotationAnchor, shape, prescriptionPhase)
          : buildNotes(category, type, rotationAnchor, shape, prescriptionPhase),
        target_difficulty,
        load: weekLoad,
        type,
      }];
    });

    weeks.push(week);
  });

  return { weeks };
}

// ====================================================================================
// Script
// ====================================================================================

const DAY_ORDER = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Variables manquantes — lance avec : node --env-file=.env.local scripts/regenerate-library-periodization.mjs");
  process.exit(1);
}
const restHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function fetchEligiblePrograms() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?is_public=eq.true&select=id,name,sport,level,weeks_count,template`, { headers: restHeaders });
  if (!res.ok) throw new Error(`Lecture échouée (${res.status}) : ${await res.text()}`);
  const all = await res.json();
  return all.filter(p => p.weeks_count && (p.weeks_count === 6 || p.weeks_count % 4 === 0));
}

async function updateProgramTemplate(id, template) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) throw new Error(`Écriture échouée (${res.status}) : ${await res.text()}`);
}

async function main() {
  const programs = await fetchEligiblePrograms();
  console.log(`${programs.length} programme(s) éligible(s) (durée = 6, ou multiple de 4). Mode : ${APPLY ? "APPLY (écriture réelle en base)" : "DRY-RUN (aucune écriture)"}\n`);

  const backup = programs.map(p => ({ id: p.id, name: p.name, template: p.template }));
  const backupFile = `scripts/library-templates-backup-periodization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Sauvegarde des templates d'origine écrite dans ${backupFile}\n`);

  for (const p of programs) {
    const days = Object.keys(p.template.weeks?.[0] ?? {}).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    if (!p.level || !days.length) {
      console.log(`- ${p.name} (${p.id}) : ⚠ ignoré (level ou jours introuvables)`);
      continue;
    }

    const newTemplate = generateTemplate({ sport: p.sport, level: p.level, days, duration: p.weeks_count });
    const blockDesc = p.weeks_count === 6 ? "modèle 6 sem." : `${p.weeks_count / 4} bloc${p.weeks_count / 4 > 1 ? "s" : ""}`;
    console.log(`- ${p.name} (${p.id}) : ${p.weeks_count} sem. (${blockDesc}), jours=${days.join("/")}, niveau=${p.level}, sport=${p.sport}`);

    if (APPLY) {
      try {
        await updateProgramTemplate(p.id, newTemplate);
        console.log(`  ✓ Écrit en base.`);
      } catch (e) {
        console.error(`  ✗ Échec écriture pour ${p.id} :`, e.message);
      }
    }
  }

  console.log(`\n${programs.length} programme(s) ${APPLY ? "régénéré(s)" : "à régénérer"}.`);
  if (!APPLY) console.log("Relance avec --apply pour écrire réellement en base.");
}

export { generateTemplate };

if (process.env.SKIP_MAIN !== "1") main();
