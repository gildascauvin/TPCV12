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

// Rotation dédiée aux catégories de rééducation — jamais "intensite" (uncapped) ni "test" hors du
// test forcé de fin de semaine MRV, pour garantir une intensité réellement modérée. Voir
// generate/route.ts pour le détail complet du raisonnement.
const FOCUS_DIST_REEDUCATION = ["technique", "volume", "recuperation", "technique", "volume", "recuperation", "technique"];

const LEVEL_BASE_DIFF = { debutant: 5, intermediaire: 6, avance: 7, elite: 8 };

function sessionDifficulty(type, weekDiff, moderateOnly = false) {
  switch (type) {
    case "recuperation": return Math.max(1, Math.min(3, weekDiff - 3));
    case "technique":    return Math.max(2, Math.min(4, Math.round(weekDiff / 3))); // jamais "Modérée" (5+), toujours "Facile"
    case "volume":       return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 3)) : Math.max(3, Math.min(7, weekDiff - 1));
    case "intensite":    return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 2)) : Math.max(1, Math.min(10, weekDiff + 1));
    case "test":         return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 2)) : Math.max(1, Math.min(10, weekDiff + 2));
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
  if (s.includes("saut")) return "athletisme_sauts";
  if (s.includes("sprint") || s.includes("athlé") || s.includes("piste") || s.includes("lancé")) return "sprint";
  if (s.includes("combat") || s.includes("art") || s.includes("mma") || s.includes("judo") || s.includes("boxe") || s.includes("karaté") || s.includes("lutte")) return "combat";
  if (s.includes("hyrox")) return "hyrox";
  if (s.includes("calisthenics")) return "calisthenics";
  if (s.includes("fitness") || s.includes("cross") || s.includes("condition") || s.includes("forme") || s.includes("wod")) return "fitness";
  if (s.includes("collectif") || s.includes("foot") || s.includes("basket") || s.includes("rugby") || s.includes("handball") || s.includes("volley")) return "collectif";
  if (s.includes("nata") || s.includes("aqua") || s.includes("swim")) return "natation";
  if (s.includes("triathlon")) return "triathlon";
  if (s.includes("cycl") || s.includes("vélo") || s.includes("velo") || s.includes("bike")) return "cyclisme";
  if (s.includes("ski") || s.includes("snowboard")) return "ski";
  if (s.includes("aviron") || s.includes("rowing") || s.includes("rameur")) return "aviron";
  if (s.includes("gym") || s.includes("agrès") || s.includes("agres")) return "gymnastique";
  if (s.includes("trail")) return "trail";
  if (s.includes("prevention") || s.includes("reeducation") || s.includes("rééducation")) {
    if (s.includes("lca")) return "reeducation_genou_lca";
    if (s.includes("rotulien")) return "reeducation_genou_rotulien";
    if (s.includes("genou")) return "reeducation_genou";
    if (s.includes("achille")) return "reeducation_tendon_achille";
    if (s.includes("periostite") || s.includes("périostite")) return "reeducation_periostite";
    if (s.includes("cheville")) return "reeducation_cheville";
    if (s.includes("lombaire")) return "reeducation_lombaire";
    if (s.includes("épaule") || s.includes("epaule")) return "reeducation_epaule";
    return "reeducation_generale";
  }
  if (s.includes("course")) {
    if (s.includes("10k") || s.includes("10 km")) return "endurance_10k";
    if (s.includes("semi")) return "endurance_semi";
    if (s.includes("marathon")) return "endurance_marathon";
  }
  if (s.includes("run") || s.includes("marathon") || s.includes("course") || s.includes("fond") || s.includes("endur")) return "endurance";
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
  hyrox: {
    technique: ["Technique sled push/pull — 4×15m", "Technique wall balls — 4×15", "Technique burpee broad jump — 4×10m", "Mobilité hanches et chevilles — 10 min"],
    volume: ["Endurance fondamentale course — 40 min", "Circuit stations légères : sled + wall balls + farmers carry — 3 tours", "Rameur continu — 20 min"],
    intensite: ["SkiErg — 5×500m (récup 90s)", "Fractionné course 1km — 5 reps (récup 3 min)", "Circuit stations intense : sled + burpees + lunges — 4 tours"],
    recuperation: ["Marche active — 25 min", "Stretching global — 15 min", "Mobilité chevilles et hanches — 10 min", "Foam rolling jambes"],
    test: ["Simulation Hyrox complète : 8km course + 8 stations", "Test : 1km course chronométré", "Test : sled push 50m chronométré", "Bilan forme physique"],
  },
  athletisme_sauts: {
    technique: ["Technique d'appel : course d'élan réduite + impulsion — 6 sauts", "Décomposition du geste : approche + pose de pied — 4×3", "Éducatifs de saut : cloche-pied, foulées bondissantes — 3×20m", "Mobilité chevilles et hanches — 10 min"],
    volume: ["Multibonds : foulées bondissantes — 4×30m", "Course d'élan progressive (7-9 appuis) + saut — 5 sauts", "Renforcement : squat + fentes + mollets — 3×10", "Gainage complet — 3×40s"],
    intensite: ["Pliométrie : sauts en contrebas (depth jump) — 4×5", "Saut avec élan complet à intensité compétition — 5 sauts", "Squat jump chargé — 4×5", "Sprint d'élan 20m départ lancé — 4 reps"],
    recuperation: ["Mobilité chevilles, hanches, ischio-jambiers — 15 min", "Foam rolling jambes complètes", "Marche active — 20 min", "Stretching actif — 15 min"],
    test: ["Test : saut en longueur avec élan complet, meilleure tentative", "Test : saut en hauteur, meilleure tentative", "Test : détente verticale (squat jump)", "Bilan technique vidéo (course d'élan + impulsion)"],
  },
  calisthenics: {
    technique: ["Tirage vertical progression (bande ou négatives) — 5×4", "Alignement gainage en suspension (hollow body) — 4×20s", "Placement dips sur barres parallèles — 4×5", "Mobilité épaules et poignets — 10 min"],
    volume: ["Tractions strictes — 5×6", "Dips — 5×8", "Pompes archer (unilatérales) — 4×6 par côté", "Squat pistol assisté — 3×6 par jambe", "Gainage complet : planche + gainage latéral — 3×40s"],
    intensite: ["Tractions explosives (vers barre haute) — 4×4", "Muscle-up ou progression muscle-up — 5×3", "Pompes plyométriques (décollé) — 4×6", "Front lever tenu (progression) — 4×10s"],
    recuperation: ["Mobilité épaules, poignets, hanches — 15 min", "Stretching global — 15 min", "Foam rolling dos et épaules", "Respiration et relaxation — 10 min"],
    test: ["Test : tractions strictes max en une série", "Test : dips strictes max en une série", "Test : L-sit ou front lever, temps de tenue max", "Bilan technique vidéo (tractions/muscle-up)"],
  },
  endurance_10k: {
    technique: ["Foulées éducatives — 4×100m", "Travail de foulée allure 10k — 20 min", "Côtes courtes 8% — 6×50m", "Gainage en course — 10 min"],
    volume: ["Endurance fondamentale Zone 2 — 35 min", "Sortie longue — 45-55 min", "Renforcement : mollets + squats + fentes", "Gainage dynamique — 3×45s"],
    intensite: ["Fractionné 400m allure 10k — 10 reps (récup 60s)", "Fractionné 1000m allure 10k — 6 reps (récup 2 min)", "Seuil : 15 min continu allure semi", "Tempo run allure 10k — 20 min"],
    recuperation: ["Footing léger très doux — 20 min", "Stretching global — 15 min", "Bain froid jambes", "Foam roller mollets et IT band"],
    test: ["Test : 5km chronométré", "Course sur 10k (objectif du bloc)", "Test de seuil lactique", "Bilan FC repos + effort"],
  },
  endurance_semi: {
    technique: ["Foulées éducatives — 4×100m", "Travail de foulée allure semi — 20 min", "Côtes moyennes 6% — 6×100m", "Gainage en course — 10 min"],
    volume: ["Endurance fondamentale Zone 2 — 35-50 min", "Sortie longue — 50-100 min", "Renforcement : mollets + squats + fentes", "Gainage dynamique — 3×45s"],
    intensite: ["Fractionné 1000m allure semi — 8 reps (récup 90s)", "Fractionné 2000m allure semi — 5 reps (récup 2 min)", "Seuil : 25 min continu allure semi", "Tempo run allure semi — 30 min"],
    recuperation: ["Footing léger très doux — 25-30 min", "Stretching global — 15 min", "Bain froid jambes", "Foam roller mollets et IT band"],
    test: ["Test : 10km chronométré", "Sortie longue à allure semi cible — 16km", "Test de seuil lactique", "Bilan FC repos + effort"],
  },
  endurance_marathon: {
    technique: ["Foulées éducatives — 4×100m", "Travail de foulée allure marathon — 25 min", "Côtes longues 5% — 6×200m", "Gainage en course — 10 min"],
    volume: ["Endurance fondamentale Zone 2 — 40-60 min", "Sortie longue — 70-150 min", "Renforcement : mollets + squats + fentes"],
    intensite: ["Fractionné 2000m allure marathon — 6 reps (récup 2 min)", "Tempo run allure marathon — 45 min", "Seuil : 35 min continu", "Bloc marathon : 3×20 min allure cible (récup 3 min)"],
    recuperation: ["Footing léger très doux — 30 min", "Stretching global — 15 min", "Bain froid jambes", "Foam roller mollets et IT band"],
    test: ["Sortie longue à allure marathon cible — 30km", "Test : semi-marathon chronométré", "Test de seuil lactique", "Bilan FC repos + effort"],
  },
  trail: {
    technique: ["Technique de descente : petits appuis rapides — 15 min", "Marche rapide en côte, technique de poussée — 20 min", "Franchissement d'obstacles (racines, pierres) — 15 min", "Mobilité chevilles et hanches — 10 min"],
    volume: ["Sortie longue trail avec dénivelé modéré — 90 min", "Sortie vallonnée D+400m — 70 min", "Renforcement : mollets + squats + fentes + gainage", "Marche active en côte — 40 min"],
    intensite: ["Répétitions de côtes : montée rapide — 8×3 min (récup descente)", "Côtes longues D+ soutenu — 5×5 min", "Descente technique rapide — 6×2 min (récup montée)", "Fractionné vallonné — 6×5 min effort soutenu"],
    recuperation: ["Marche active en nature — 30 min", "Stretching global — 15 min", "Foam roller mollets et quadriceps", "Mobilité chevilles — 10 min"],
    test: ["Simulation course trail : distance + dénivelé cible", "Test : montée chronométrée sur une côte de référence", "Test : descente technique chronométrée", "Bilan D+/D- et allure"],
  },
  triathlon: {
    technique: ["Natation technique : catch-up crawl — 4×50m", "Vélo : cadence 100 rpm — 15 min", "Course : foulées éducatives — 4×100m", "Transition natation→vélo simulée — 3 reps"],
    volume: ["Sortie vélo endurance Z2 — 60-90 min", "Sortie course endurance fondamentale — 45 min", "Nage continue 4 nages — 1500m", "Renforcement général : gainage + squat + tirage — 3×10"],
    intensite: ["Fractionné natation : 10×100m (récup 20s)", "Fractionné vélo : 6×4 min à 105% FTP (récup 3 min)", "Fractionné course : 6×1000m allure 10k (récup 2 min)", "Brick (enchaînement) : vélo 30 min + course 15 min"],
    recuperation: ["Nage très douce — 20 min", "Vélo doux Z1 — 30 min", "Stretching global — 15 min", "Mobilité épaules et hanches — 10 min"],
    test: ["Simulation triathlon format court (natation+vélo+course enchaînés)", "Test : 1000m natation chronométré", "Test FTP vélo : 20 min à puissance max", "Test : 5km course chronométré"],
  },
  reeducation_cheville: {
    technique: ["Proprioception unipodale sur sol stable — 4×30s par jambe", "Mobilité cheville : flexion dorsale contre mur — 3×10", "Marche sur pointes puis talons — 3×20m", "Étirement mollets — 3×30s"],
    volume: ["Isométrie chevilles : éverseurs/inverseurs contre résistance — 4×20s", "Renforcement mollets léger : montées sur pointes — 3×15", "Proprioception sur plateau instable — 4×30s par jambe", "Vélo ou marche légère — 15 min"],
    intensite: ["Renforcement mollets modéré : montées sur pointes unipodales — 3×12 par jambe", "Proprioception dynamique : petits sauts contrôlés — 3×8", "Isométrie cheville en charge partielle — 4×25s"],
    recuperation: ["Mobilité douce cheville — 10 min", "Marche active — 15-20 min", "Auto-massage mollet et voûte plantaire", "Élévation + glace si besoin"],
    test: ["Test : équilibre unipodal, temps de tenue", "Test : amplitude flexion dorsale (mesure)", "Test : montée sur pointes unipodale, répétitions max", "Bilan douleur/gonflement"],
  },
  reeducation_genou: {
    technique: ["Activation fessiers : pont fessier — 3×12", "Squat isométrique dos au mur (wall sit) — 4×20s", "Contrôle du valgus : squat face à un miroir, focus alignement genou-pied — 3×10", "Mobilité hanches — 10 min"],
    volume: ["Renforcement fessiers : clamshell + pont fessier + band walk — 3×15", "Squat gobelet focus alignement — 3×12", "Step-down contrôlé face miroir — 3×10 par jambe", "Vélo léger sans résistance — 15-20 min"],
    intensite: ["Squat charge légère focus alignement — 3×10", "Fentes contrôlées focus alignement — 3×10 par jambe", "Step-up contrôlé — 3×10 par jambe", "Proprioception dynamique unipodale — 4×20s"],
    recuperation: ["Mobilité douce genou et hanche — 10 min", "Vélo très léger — 15 min", "Auto-massage quadriceps et ischio-jambiers", "Étirements chaîne postérieure"],
    test: ["Test : squat face caméra, évaluation visuelle de l'alignement genou-pied", "Test : squat unipodal contrôlé, répétitions max sans douleur", "Test : équilibre unipodal yeux fermés", "Bilan douleur/alignement"],
  },
  reeducation_genou_rotulien: {
    technique: ["Squat partiel (90° ou moins) — 4×10", "Wall sit (chaise contre mur) — 4×20s", "Step-down excentrique lent — 3×8 par jambe", "Mobilité hanches — 10 min"],
    volume: ["Excentrique quadriceps : step-down lent — 4×10 par jambe", "Renforcement fessiers : clamshell + pont fessier + band walk — 3×15", "Presse à cuisses amplitude partielle — 3×15", "Vélo léger sans résistance — 15-20 min"],
    intensite: ["Excentrique quadriceps chargé : step-down lesté — 3×10 par jambe", "Squat progressif vers amplitude complète (si douleur <3/10) — 3×10", "Renforcement fessiers chargé : hip thrust — 3×12"],
    recuperation: ["Mobilité douce genou et hanche — 10 min", "Vélo très léger — 15 min", "Auto-massage quadriceps et bandelette ilio-tibiale", "Étirements chaîne antérieure et postérieure"],
    test: ["Test : step-down contrôlé, répétitions max sans dépasser 3/10 de douleur", "Test : squat complet, douleur évaluée sur 10", "Test : équilibre unipodal", "Bilan douleur sous la rotule (montée/descente escaliers)"],
  },
  reeducation_genou_lca: {
    technique: ["Activation quadriceps : contraction isométrique — 4×10s", "Mobilité genou passive (flexion/extension) — 10 min", "Proprioception bipodale sol stable — 4×20s", "Amplitude articulaire active assistée — 10 min"],
    volume: ["Renforcement quadriceps chaîne fermée léger : presse à cuisses — 3×15", "Nordic Hamstring Exercise assisté — 3×6", "Renforcement fessiers : pont fessier + clamshell — 3×15", "Vélo sans résistance — 15-20 min"],
    intensite: ["Pliométrie débutante : sauts amortis bipodaux contrôlés — 3×6", "Squat unipodal contrôlé — 3×8 par jambe", "Nordic Hamstring Exercise — 4×8", "Course en ligne droite progressive (si autorisé) — 10-15 min"],
    recuperation: ["Mobilité douce genou — 10 min", "Vélo très léger — 15-20 min", "Auto-massage quadriceps et ischio-jambiers", "Élévation si gonflement"],
    test: ["Test : force quadricipitale, comparaison au côté sain", "Test : hop test unipodal, symétrie", "Test : squat unipodal contrôlé sans compensation", "Bilan douleur et épanchement"],
  },
  reeducation_lombaire: {
    technique: ["Gainage neutre : dead bug — 3×10 par côté", "Bird-dog contrôlé — 3×10 par côté", "Mobilité hanches : bascule du bassin — 3×12", "Respiration diaphragmatique — 10 min"],
    volume: ["Isométrie gainage : planche — 4×20s", "Isométrie gainage latéral — 3×20s par côté", "Renforcement dos léger : superman contrôlé — 3×12", "Marche active — 20 min"],
    intensite: ["Isométrie planche prolongée — 4×30s", "Bird-dog avec charge légère (poids de cheville) — 3×10 par côté", "Renforcement dos modéré : tirage horizontal léger — 3×12", "Gainage dynamique : mountain climber lent — 3×10"],
    recuperation: ["Mobilité douce colonne lombaire — 10 min", "Marche active — 20-25 min", "Étirements hanches et ischio-jambiers doux", "Respiration et relaxation — 10 min"],
    test: ["Test : planche, temps de tenue max", "Test : bird-dog contrôlé, répétitions sans compensation", "Test : mobilité flexion/extension lombaire (amplitude)", "Bilan douleur au repos et en mouvement"],
  },
  reeducation_tendon_achille: {
    technique: ["Excentrique mollet (protocole Alfredson) — 3×15", "Isométrie mollet : montée sur pointes tenue — 4×20s", "Mobilité cheville : flexion dorsale — 3×10", "Auto-massage mollet et tendon"],
    volume: ["Excentrique mollet (protocole Alfredson) genou tendu — 3×15", "Excentrique mollet (protocole Alfredson) genou fléchi — 3×15", "Renforcement pied/cheville léger — 3×12", "Vélo ou natation sans impact — 15-20 min"],
    intensite: ["Excentrique mollet chargé (lesté, lent) — 4×12", "Montées sur pointes unipodales chargées — 3×12 par jambe", "Renforcement mollet force maximale — 4×8", "Course progressive courte (si douleur <4/10) — 10-15 min"],
    recuperation: ["Mobilité douce cheville et mollet — 10 min", "Vélo ou natation sans impact — 15 min", "Auto-massage mollet et tendon", "Étirements chaîne postérieure doux"],
    test: ["Test : isométrie mollet, temps de tenue max", "Test : montée sur pointes unipodale, répétitions max sans dépasser 4/10 de douleur", "Test : course 30 min, tolérance sans douleur >4/10", "Bilan douleur au palper et à l'effort"],
  },
  reeducation_periostite: {
    technique: ["Renforcement tibial antérieur : flexion dorsale résistée — 4×15", "Mobilité cheville : flexion dorsale — 3×10", "Technique de foulée : cadence et appui médio-pied — 10 min", "Auto-massage mollet et tibia"],
    volume: ["Renforcement tibial antérieur chargé — 3×15", "Vélo ou natation sans impact — 20-25 min", "Renforcement mollets et pied — 3×12", "Proprioception cheville — 3×10"],
    intensite: ["Marche-course progressive (ratio 1:2) — 20 min", "Course continue légère (si douleur absente) — 15-20 min", "Renforcement tibial antérieur et mollets chargé — 4×12"],
    recuperation: ["Marche active — 20-25 min", "Vélo ou natation sans impact — 15-20 min", "Auto-massage mollet et tibia", "Élévation + glace si besoin"],
    test: ["Test : course 20 min continue, tolérance sans douleur", "Test : renforcement tibial antérieur, répétitions max", "Test : palpation bord interne tibia (douleur)", "Bilan reprise course complète"],
  },
  reeducation_epaule: {
    technique: ["Isométrie rotateurs externes (coude au corps) — 4×15s", "Isométrie rotateurs internes — 4×15s", "Mobilité scapulaire : rétraction/protraction — 3×12", "Mobilité épaule douce (pendulaires) — 10 min"],
    volume: ["Renforcement coiffe léger bande élastique : rotation externe — 3×15", "Renforcement coiffe léger bande élastique : rotation interne — 3×15", "Stabilité scapulaire : Y-T-W au sol — 3×10 chaque", "Mobilité thoracique — 10 min"],
    intensite: ["Isométrie rotateurs charge modérée — 4×20s", "Renforcement coiffe modéré bande élastique — 3×15", "Stabilité scapulaire avec charge légère — 3×12"],
    recuperation: ["Mobilité douce épaule (pendulaires) — 10 min", "Étirements chaîne postérieure épaule", "Auto-massage trapèzes et deltoïdes", "Respiration et relaxation — 10 min"],
    test: ["Test : isométrie rotation externe, temps de tenue max", "Test : amplitude articulaire épaule (mesure)", "Test : élévation bras sans douleur (amplitude)", "Bilan douleur au mouvement et à la charge"],
  },
  reeducation_generale: {
    technique: ["Isométrie globale : gainage planche — 4×20s", "Mobilité articulaire générale — 15 min", "Activation musculaire ciblée (zone concernée) — 10 min", "Respiration diaphragmatique — 10 min"],
    volume: ["Renforcement léger multi-articulaire : squat + rowing élastique — 3×12", "Isométrie ciblée zone concernée — 4×20s", "Marche active — 20 min", "Mobilité globale — 15 min"],
    intensite: ["Renforcement modéré multi-articulaire — 3×12", "Isométrie ciblée prolongée — 4×30s", "Circuit léger : mobilité + renfo + équilibre — 3 tours"],
    recuperation: ["Mobilité douce globale — 15 min", "Marche active — 20 min", "Auto-massage zones tendues", "Respiration et relaxation — 10 min"],
    test: ["Test : isométrie zone concernée, temps de tenue max", "Test : amplitude articulaire (mesure)", "Test : tolérance à l'effort léger sans douleur", "Bilan douleur global"],
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

const ENDURANCE_FONDAMENTALE = { name: "Endurance fondamentale", type: "volume", exercises: [
  "Endurance fondamentale — 45 min", "Sortie facile Z2 — 40 min", "Footing fondamental — 50 min",
]};
const ENDURANCE_FONDAMENTALE_RENFO = { name: "Endurance fondamentale", type: "volume", exercises: [
  "Endurance fondamentale — 45 min", "Sortie facile Z2 — 40 min", "Footing fondamental — 50 min",
  "Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s",
]};
const ENDURANCE_SEUIL = { name: "Seuil", type: "intensite", exercises: [
  "Seuil lactique — 20 min continu", "Tempo au seuil — 25 min", "Côtes au seuil — 5×400m (récup 90s)",
]};
const ENDURANCE_SORTIE_LONGUE = { name: "Sortie longue", type: "volume", exercises: [
  "Sortie longue endurance fondamentale — 70 min", "Sortie longue progressive — 80 min",
]};
const ENDURANCE_FRACTIONNE = { name: "Fractionné", type: "intensite", exercises: [
  "Fractionné 400m allure 5km — 8 reps (récup 90s)", "Fractionné 1000m — 5 reps (récup 3 min)", "Fractionné 200m rapide — 12 reps (récup 60s)",
]};
const ENDURANCE_RENFO = { name: "Renfo", type: "technique", exercises: [
  "Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s", "Proprioception chevilles — 3×10",
]};
const ENDURANCE_RECUPERATION = { name: "Récupération active", type: "recuperation", exercises: [
  "Footing très facile — 25 min", "Marche active — 30 min", "Vélo doux — 20 min",
]};
const ENDURANCE_LOW_FREQ = [ENDURANCE_FONDAMENTALE_RENFO, ENDURANCE_SEUIL, ENDURANCE_SORTIE_LONGUE];
const ENDURANCE_HIGH_FREQ = [ENDURANCE_FONDAMENTALE, ENDURANCE_SEUIL, ENDURANCE_SORTIE_LONGUE, ENDURANCE_RENFO, ENDURANCE_FRACTIONNE, ENDURANCE_RECUPERATION];
function selectEndurance(n) {
  const list = n <= 3 ? ENDURANCE_LOW_FREQ : ENDURANCE_HIGH_FREQ;
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
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

const HYROX_ENDURANCE_FONCTIONNELLE = { name: "Endurance fonctionnelle", type: "volume", exercises: [
  "Course continue — 20 min", "SkiErg ou rameur — 15 min", "Circuit fonctionnel léger : farmers carry + wall balls — 3 tours",
]};
const HYROX_FORCE_CONDITIONING = { name: "Force + Conditioning", type: "intensite", exercises: [
  "Sled push — 4×20m", "Sled pull — 4×20m", "Wall balls — 4×20", "Burpee broad jumps — 4×15m", "Farmers carry — 4×50m",
]};
const HYROX_SIMULATION = { name: "Simulation de stations", type: "test", exercises: [
  "Simulation Hyrox : 1km course + 1 station (rotation) — 4 tours", "Simulation Hyrox courte : 2×(1km course + wall balls + sled push)",
]};
const HYROX_RUN_LONG = { name: "Run long", type: "volume", exercises: [
  "Course continue endurance — 45-60 min",
]};
const HYROX_PRIORITY = [HYROX_ENDURANCE_FONCTIONNELLE, HYROX_FORCE_CONDITIONING, HYROX_SIMULATION, HYROX_RUN_LONG];
function selectHyrox(n) {
  return Array.from({ length: n }, (_, i) => HYROX_PRIORITY[i % HYROX_PRIORITY.length]);
}

// ---- Saut en longueur & hauteur : 4 séances nommées exactement comme sur la page WordPress du
// programme ("piste et sauts complets", "pliométrie spécifique", "technique de vol/approche",
// "préparation physique musculaire"). Chaîne causale du saut : vitesse d'approche → impulsion →
// angle de décollage → technique de vol — chaque maillon a sa séance dédiée avant d'être intégré
// dans "Piste et sauts complets".
const SAUTS_PISTE_COMPLETS = { name: "Piste et sauts complets", type: "intensite", exercises: [
  "Course d'élan complète (7-9 appuis) + saut — 5 sauts", "Impulsion à pleine vitesse — 4 sauts",
]};
const SAUTS_PLIOMETRIE = { name: "Pliométrie spécifique", type: "intensite", exercises: [
  "Sauts en contrebas (depth jump) — 4×5", "Multibonds : foulées bondissantes — 4×30m", "Squat jump chargé — 4×5",
]};
const SAUTS_TECHNIQUE_VOL = { name: "Technique de vol / approche", type: "technique", exercises: [
  "Décomposition du geste : approche + pose de pied — 4×3", "Éducatifs de saut : cloche-pied, foulées bondissantes — 3×20m", "Course d'élan isolée (sans saut) — 6 reps",
]};
const SAUTS_PPG = { name: "PPG musculaire", type: "volume", exercises: [
  "Squat — 4×6@75%", "Fentes — 3×10 par jambe", "Renforcement mollets — 3×15", "Gainage complet — 3×40s",
]};
const SAUTS_PRIORITY = [SAUTS_PISTE_COMPLETS, SAUTS_PLIOMETRIE, SAUTS_TECHNIQUE_VOL, SAUTS_PPG];
function selectAthletismeSauts(n) {
  return Array.from({ length: n }, (_, i) => SAUTS_PRIORITY[i % SAUTS_PRIORITY.length]);
}

// ---- Aviron : 3 séances nommées Lun/Mer/Ven exactement comme sur la page WordPress ("Technique
// rameur et séquence", "Force de tirage et jambes (soulevé de terre, tirages)", "Endurance
// aérobie ou intervalles de puissance selon la phase").
const AVIRON_TECHNIQUE = { name: "Technique rameur", type: "technique", exercises: [
  "Rameur technique : focus séquence jambes-dos-bras — 20 min", "Drill par segments (jambes seules / dos seul / bras seuls) — 15 min",
]};
const AVIRON_FORCE_TIRAGE = { name: "Force de tirage", type: "intensite", exercises: [
  "Soulevé de terre — 5×5@75%", "Tirage horizontal — 4×8@70%", "Tirage vertical — 4×8@70%", "Gainage anti-flexion — 3×40s",
]};
const AVIRON_ENDURANCE_PUISSANCE = { name: "Endurance & Puissance", type: "volume", exercises: [
  "Rameur endurance continue — 30 min", "Rameur intervalles : 6×500m (récup 2 min)",
]};
const AVIRON_PRIORITY = [AVIRON_TECHNIQUE, AVIRON_FORCE_TIRAGE, AVIRON_ENDURANCE_PUISSANCE];
function selectAviron(n) {
  return Array.from({ length: n }, (_, i) => AVIRON_PRIORITY[i % AVIRON_PRIORITY.length]);
}

// ---- Triathlon : 3 disciplines + brick (vélo+course enchaînés), comme décrit sur la page
// WordPress ("3 blocs : base sem1-4 / développement sem5-9 avec bricks / affûtage sem10-12").
const TRI_NATATION = { name: "Natation", type: "volume", exercises: [
  "Nage continue 4 nages — 1500m", "Natation technique : catch-up crawl — 4×50m",
]};
const TRI_VELO = { name: "Vélo", type: "volume", exercises: [
  "Sortie vélo endurance Z2 — 60-90 min", "Fractionné vélo : 6×4 min à 105% FTP (récup 3 min)",
]};
const TRI_COURSE = { name: "Course à pied", type: "volume", exercises: [
  "Sortie course endurance fondamentale — 45 min", "Fractionné course : 6×1000m allure 10k (récup 2 min)",
]};
const TRI_COURSE_RENFO = { name: "Course à pied", type: "volume", exercises: [
  "Sortie course endurance fondamentale — 45 min", "Fractionné course : 6×1000m allure 10k (récup 2 min)",
  "Renforcement général : squat + gainage + tirage — 3×10",
]};
const TRI_BRICK = { name: "Brick (vélo + course)", type: "intensite", exercises: [
  "Brick : vélo 30 min + course 15 min enchaînés",
]};
const TRI_RENFO = { name: "Renfo", type: "technique", exercises: [
  "Renforcement général : squat + gainage + tirage — 3×10", "Gainage complet — 3×40s",
]};
const TRI_LOW_FREQ = [TRI_NATATION, TRI_VELO, TRI_COURSE_RENFO, TRI_BRICK];
const TRI_HIGH_FREQ = [TRI_NATATION, TRI_VELO, TRI_COURSE, TRI_BRICK, TRI_RENFO];
function selectTriathlon(n) {
  const list = n <= 4 ? TRI_LOW_FREQ : TRI_HIGH_FREQ;
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}

// ---- Calisthenics : 4 archétypes — la page WP promet explicitement "4 séances/sem", pas
// seulement les 3 patterns Pousser/Tirer/Porter cités dans le texte. Voir generate/route.ts pour
// le raisonnement complet (Skill/muscle-up est le 4e archétype voulu, réellement atteint une fois
// le champ `days` du programme bibliothèque corrigé à 4 jours). Gainage intégré à chaque séance.
const CALI_TIRER = { name: "Tirer", type: "volume", exercises: [
  "Tractions strictes — 5×6", "Tractions lestées (progression) — 4×4", "Muscle-up ou progression muscle-up (chest-to-bar, false grip) — 4×3", "Gainage en suspension (hollow body) — 3×20s",
]};
const CALI_POUSSER = { name: "Pousser", type: "volume", exercises: [
  "Dips — 5×8", "Dips en anneau (progression) — 4×6", "Pompes archer (unilatérales) — 4×6 par côté", "Gainage : planche — 3×30s",
]};
const CALI_PORTER = { name: "Porter", type: "technique", exercises: [
  "L-sit ou tuck-sit tenu — 4×15-20s", "Squat pistol assisté — 3×6 par jambe", "Gainage latéral — 3×25s par côté",
]};
const CALI_SKILL = { name: "Skill", type: "intensite", exercises: [
  "Muscle-up ou progression muscle-up (chest-to-bar, false grip) — 5×3", "Front lever tenu (progression) — 4×10s", "Gainage complet — 3×30s",
]};
const CALI_PRIORITY = [CALI_TIRER, CALI_POUSSER, CALI_PORTER, CALI_SKILL];
function selectCalisthenics(n) {
  return Array.from({ length: n }, (_, i) => CALI_PRIORITY[i % CALI_PRIORITY.length]);
}

// ---- Gymnastique : 3 séances nommées Lun/Mer/Ven exactement comme sur la page WordPress
// ("Gainage et placement (ATR, suspension)", "Force relative (tractions, dips, L-sit)",
// "Pliométrie et réception").
const GYM_GAINAGE_PLACEMENT = { name: "Gainage et placement", type: "technique", exercises: [
  "ATR contre mur — 4×20-30s", "Placement bassin en suspension (hollow body) — 4×15s", "Mobilité épaules et poignets — 10 min",
]};
const GYM_FORCE_RELATIVE = { name: "Force relative", type: "intensite", exercises: [
  "Tractions strictes — 4×6", "Dips — 4×8", "L-sit ou tuck-sit tenu — 4×15-20s",
]};
const GYM_PLIOMETRIE_RECEPTION = { name: "Pliométrie et réception", type: "volume", exercises: [
  "Sauts groupés + réceptions contrôlées — 4×6", "Technique de réception de saut — 4×6", "Handstand hold contre mur — 4×20s",
]};
const GYM_PRIORITY = [GYM_GAINAGE_PLACEMENT, GYM_FORCE_RELATIVE, GYM_PLIOMETRIE_RECEPTION];
function selectGymnastique(n) {
  return Array.from({ length: n }, (_, i) => GYM_PRIORITY[i % GYM_PRIORITY.length]);
}

// ---- Course à pied par distance : mêmes noms de séance que la catégorie "endurance" générique
// (Endurance fondamentale/Seuil/Sortie longue/Fractionné/Renfo/Récupération active), mais
// exercices tirés des banques EXERCISES.endurance_10k/semi/marathon (distances/durées ajustées à
// la distance cible), avec les jours et durées de sortie longue donnés par les pages WordPress
// respectives (10k : 35→55 min ; semi : 35-50 min Z2, sortie longue 50-100 min ; marathon :
// 40-60 min Z2, sortie longue 70-150 min, 5 séances/semaine).
const DISTANCE_RENFO_LINES = ["Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s"];
function buildDistanceEnduranceArchetypes(bank, n) {
  const fondamentale = n <= 4
    ? { name: "Endurance fondamentale", type: "volume", exercises: [...bank.volume.slice(0, 1), ...DISTANCE_RENFO_LINES] }
    : { name: "Endurance fondamentale", type: "volume", exercises: bank.volume.slice(0, 1) };
  const list = [
    fondamentale,
    { name: "Seuil", type: "intensite", exercises: bank.intensite.slice(2, 4) },
    { name: "Récupération active", type: "recuperation", exercises: bank.recuperation },
    { name: "Sortie longue", type: "volume", exercises: bank.volume.slice(1, 2) },
  ];
  if (n > 4) {
    list.push({ name: "Renfo", type: "technique", exercises: DISTANCE_RENFO_LINES });
    list.push({ name: "Fractionné", type: "intensite", exercises: bank.intensite.slice(0, 2) });
  }
  return list;
}
function selectEndurance10k(n) {
  const list = buildDistanceEnduranceArchetypes(EXERCISES.endurance_10k, n);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}
function selectEnduranceSemi(n) {
  const list = buildDistanceEnduranceArchetypes(EXERCISES.endurance_semi, n);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}
function selectEnduranceMarathon(n) {
  const list = buildDistanceEnduranceArchetypes(EXERCISES.endurance_marathon, n);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}

// ====================================================================================
// Curriculums de rééducation — moderateOnly (jamais Phase A2, jamais "intensite"/"test" comme
// candidat de remplacement en cas de collision RPE, voir plus haut). Séances nommées d'après ce
// qui est décrit sur chaque page WordPress produit (souvent des séances A/B/C explicitement
// nommées) plutôt qu'un système générique uniforme.
// ====================================================================================

// Cheville — post-entorse : 2 axes explicites (proprioception, renforcement péroniers/tibial
// antérieur) — sem1-2 base, sem3 décharge (mécanisme MRV/Deload existant), sem4-5 avancé, sem6 test.
const CHEVILLE_PROPRIOCEPTION = { name: "Proprioception", type: "technique", exercises: [
  "Proprioception unipodale sur sol stable — 4×30s par jambe", "Proprioception sur plateau instable — 4×30s par jambe", "Marche sur pointes puis talons — 3×20m",
]};
const CHEVILLE_RENFORCEMENT = { name: "Renforcement péroniers", type: "volume", exercises: [
  "Isométrie chevilles : éverseurs/inverseurs contre résistance — 4×20s", "Montées sur pointes — 3×15", "Mobilité cheville : flexion dorsale contre mur — 3×10",
]};
const CHEVILLE_PRIORITY = [CHEVILLE_PROPRIOCEPTION, CHEVILLE_RENFORCEMENT];
function selectReeducationCheville(n) {
  return Array.from({ length: n }, (_, i) => CHEVILLE_PRIORITY[i % CHEVILLE_PRIORITY.length]);
}

// Coiffe des rotateurs : 4 muscles ciblés (sus-épineux, sous-épineux, petit rond, sous-scapulaire)
// — regroupés en 3 séances par fonction (rotation externe/interne, stabilité scapulaire),
// élastiques progressifs.
const EPAULE_ROTATION_EXTERNE = { name: "Rotation externe", type: "technique", exercises: [
  "Isométrie rotateurs externes (coude au corps) — 4×15s", "Rotation externe élastique léger — 3×15",
]};
const EPAULE_ROTATION_INTERNE = { name: "Rotation interne", type: "technique", exercises: [
  "Isométrie rotateurs internes — 4×15s", "Rotation interne élastique léger — 3×15",
]};
const EPAULE_STABILITE_SCAPULAIRE = { name: "Stabilité scapulaire", type: "volume", exercises: [
  "Rétraction/protraction scapulaire — 3×12", "Y-T-W au sol — 3×10 chaque", "Mobilité thoracique — 10 min",
]};
const EPAULE_PRIORITY = [EPAULE_ROTATION_EXTERNE, EPAULE_ROTATION_INTERNE, EPAULE_STABILITE_SCAPULAIRE];
function selectReeducationEpaule(n) {
  return Array.from({ length: n }, (_, i) => EPAULE_PRIORITY[i % EPAULE_PRIORITY.length]);
}

// Valgus du genou : correction du schéma de mouvement (activation fessiers + contrôle visuel de
// l'alignement genou-pied), distinct du Syndrome Rotulien (douleur) et du Post-LCA (chirurgie).
const GENOU_ACTIVATION_FESSIERS = { name: "Activation fessiers", type: "technique", exercises: [
  "Pont fessier — 3×12", "Clamshell — 3×15 par côté", "Band walk latéral — 3×10 par côté",
]};
const GENOU_CONTROLE_ALIGNEMENT = { name: "Contrôle de l'alignement", type: "volume", exercises: [
  "Squat face à un miroir, focus alignement genou-pied — 3×10", "Step-down contrôlé face miroir — 3×10 par jambe", "Wall sit — 4×20s",
]};
const GENOU_PRIORITY = [GENOU_ACTIVATION_FESSIERS, GENOU_CONTROLE_ALIGNEMENT];
function selectReeducationGenou(n) {
  return Array.from({ length: n }, (_, i) => GENOU_PRIORITY[i % GENOU_PRIORITY.length]);
}

// Syndrome rotulien : 3 séances nommées A/B/C exactement comme sur la page WordPress.
const ROTULIEN_EXCENTRIQUE_QUAD = { name: "Excentrique quadriceps", type: "technique", exercises: [
  "Squat partiel (90° ou moins) — 4×10", "Step-down excentrique lent — 3×8 par jambe", "Wall sit — 4×20s",
]};
const ROTULIEN_RENFORCEMENT_FESSIERS = { name: "Renforcement fessiers", type: "volume", exercises: [
  "Clamshell — 3×15 par côté", "Pont fessier — 3×15", "Band walk latéral — 3×12",
]};
const ROTULIEN_INTEGRATION = { name: "Intégration fonctionnelle", type: "volume", exercises: [
  "Squat progressif (si douleur <3/10) — 3×10", "Fentes contrôlées — 3×10 par jambe", "Équilibre unipodal dynamique — 4×20s",
]};
const ROTULIEN_PRIORITY = [ROTULIEN_EXCENTRIQUE_QUAD, ROTULIEN_RENFORCEMENT_FESSIERS, ROTULIEN_INTEGRATION];
function selectReeducationRotulien(n) {
  return Array.from({ length: n }, (_, i) => ROTULIEN_PRIORITY[i % ROTULIEN_PRIORITY.length]);
}

// Lombalgie : 3 séances nommées A/B/C exactement comme sur la page WordPress.
const LOMBALGIE_GAINAGE_PROFOND = { name: "Gainage profond", type: "technique", exercises: [
  "Bird-dog contrôlé — 3×10 par côté", "Dead bug — 3×10 par côté", "Respiration diaphragmatique — 10 min",
]};
const LOMBALGIE_MOBILITE = { name: "Mobilité lombaire et hanche", type: "technique", exercises: [
  "Bascule du bassin — 3×12", "Mobilité hanches (rotation, flexion) — 10 min", "Étirements chaîne postérieure doux — 10 min",
]};
const LOMBALGIE_RENFORCEMENT = { name: "Renforcement intégré", type: "volume", exercises: [
  "Planche — 4×20s", "Romanian deadlift charge légère — 3×10", "Superman contrôlé — 3×12",
]};
const LOMBALGIE_PRIORITY = [LOMBALGIE_GAINAGE_PROFOND, LOMBALGIE_MOBILITE, LOMBALGIE_RENFORCEMENT];
function selectReeducationLombalgie(n) {
  return Array.from({ length: n }, (_, i) => LOMBALGIE_PRIORITY[i % LOMBALGIE_PRIORITY.length]);
}

// Post-LCA : 4 phases sur 16 semaines (activation neuromusculaire, force progressive avec Nordic
// Hamstring, pliométrie débutante, retour sport progressif) — approximées par rotation par bloc
// (rotationAnchor) plutôt qu'un modèle de périodisation dédié supplémentaire, voir EXERCISES.
const LCA_ACTIVATION = { name: "Activation neuromusculaire", type: "technique", exercises: [
  "Contraction isométrique quadriceps — 4×10s", "Mobilité genou passive — 10 min", "Proprioception bipodale — 4×20s",
]};
const LCA_FORCE = { name: "Force progressive", type: "volume", exercises: [
  "Presse à cuisses — 3×15", "Nordic Hamstring Exercise assisté — 3×6", "Pont fessier — 3×15",
]};
const LCA_PLIOMETRIE = { name: "Pliométrie débutante", type: "intensite", exercises: [
  "Sauts amortis bipodaux contrôlés — 3×6", "Squat unipodal contrôlé — 3×8 par jambe", "Nordic Hamstring Exercise — 4×8",
]};
const LCA_RETOUR_SPORT = { name: "Retour sport progressif", type: "intensite", exercises: [
  "Course en ligne droite progressive — 15 min", "Hop test unipodal contrôlé — 3×5 par jambe", "Renforcement quadriceps chargé — 3×10",
]};
const LCA_PRIORITY = [LCA_ACTIVATION, LCA_FORCE, LCA_PLIOMETRIE, LCA_RETOUR_SPORT];
function selectReeducationLca(n) {
  return Array.from({ length: n }, (_, i) => LCA_PRIORITY[i % LCA_PRIORITY.length]);
}

// Tendon d'Achille : protocole Alfredson (excentrique mollet) en séance principale, renforcement
// et retour course en complément.
const ACHILLE_EXCENTRIQUE = { name: "Excentrique (Alfredson)", type: "technique", exercises: [
  "Excentrique mollet genou tendu — 3×15", "Excentrique mollet genou fléchi — 3×15",
]};
const ACHILLE_RENFORCEMENT = { name: "Renforcement mollet", type: "volume", exercises: [
  "Montées sur pointes unipodales — 3×12 par jambe", "Isométrie mollet — 4×25s",
]};
const ACHILLE_RETOUR_COURSE = { name: "Retour course", type: "volume", exercises: [
  "Course progressive courte (si douleur <4/10) — 10-15 min", "Vélo ou natation sans impact — 15 min",
]};
const ACHILLE_PRIORITY = [ACHILLE_EXCENTRIQUE, ACHILLE_RENFORCEMENT, ACHILLE_RETOUR_COURSE];
function selectReeducationAchille(n) {
  return Array.from({ length: n }, (_, i) => ACHILLE_PRIORITY[i % ACHILLE_PRIORITY.length]);
}

// Périostite tibiale : 0 course les 2 premières semaines (règle explicite WordPress) —
// renforcement tibial antérieur + cross-training sans impact, puis marche-course progressive.
const PERIOSTITE_RENFORCEMENT = { name: "Renforcement tibial antérieur", type: "technique", exercises: [
  "Flexion dorsale résistée — 4×15", "Mobilité cheville — 3×10",
]};
const PERIOSTITE_CROSS_TRAINING = { name: "Cross-training sans impact", type: "volume", exercises: [
  "Vélo ou natation sans impact — 20-25 min", "Renforcement mollets et pied — 3×12",
]};
const PERIOSTITE_MARCHE_COURSE = { name: "Marche-course progressive", type: "volume", exercises: [
  "Marche-course (ratio 1:2) — 20 min", "Course continue légère (si douleur absente) — 15-20 min",
]};
const PERIOSTITE_PRIORITY = [PERIOSTITE_RENFORCEMENT, PERIOSTITE_CROSS_TRAINING, PERIOSTITE_MARCHE_COURSE];
function selectReeducationPeriostite(n) {
  return Array.from({ length: n }, (_, i) => PERIOSTITE_PRIORITY[i % PERIOSTITE_PRIORITY.length]);
}

// ---- Faiblesses — voir generate/route.ts pour le raisonnement complet (2 niveaux : append
// universel niveau 2, bump de fréquence niveau 1 pour powerlifting/musculation/halterophilie
// seulement). Jamais utilisé par ce script (la bibliothèque publique ne passe pas `weaknesses`),
// porté ici uniquement pour garder generateTemplate() en synchro avec le vrai générateur.
const WEAKNESS_META = {
  jambes:            { extraLine: "Renfo ciblé jambes : squat gobelet + fentes marchées — 3×12", typeHints: ["volume", "intensite", "technique"] },
  dos_bras:          { extraLine: "Renfo ciblé dos/bras : tirage horizontal + curl — 3×12", typeHints: ["volume", "intensite", "technique"] },
  pecs_epaules:      { extraLine: "Renfo ciblé pecs/épaules : développé incliné + élévations latérales — 3×12", typeHints: ["volume", "intensite", "technique"] },
  dos:               { extraLine: "Renfo ciblé dos : tirage vertical + rowing — 3×12", typeHints: ["volume", "intensite", "technique"] },
  pectoraux:         { extraLine: "Renfo ciblé pectoraux : développé couché + écartés — 3×12", typeHints: ["volume", "intensite", "technique"] },
  epaules:           { extraLine: "Renfo ciblé épaules : développé militaire + élévations — 3×12", typeHints: ["volume", "intensite", "technique"] },
  bras:              { extraLine: "Renfo ciblé bras : curl + extensions triceps — 3×12", typeHints: ["volume", "intensite", "technique"] },
  arrache:           { extraLine: "Travail technique arraché : position réceptrice + tirages — 5×3", typeHints: ["technique", "volume", "recuperation"] },
  epaule_jete:       { extraLine: "Travail technique épaulé-jeté : réception + jeté sous barre — 5×3", typeHints: ["technique", "volume", "recuperation"] },
  mobilite:          { extraLine: "Mobilité ciblée hanches/chevilles — 10 min", typeHints: ["technique", "recuperation", "volume"] },
  vitesse:           { extraLine: "Sprints courts : 4×20m départ arrêté (récup complète)", typeHints: ["intensite", "volume"] },
  endurance_vitesse: { extraLine: "Répétitions longues : 4×150m allure soutenue", typeHints: ["volume", "intensite"] },
  endurance_fond:    { extraLine: "Extension endurance fondamentale : +10 min à allure facile", typeHints: ["volume", "recuperation"] },
  explosivite:       { extraLine: "Pliométrie : squats sautés — 4×6", typeHints: ["intensite", "volume"] },
  technique:         { extraLine: "Travail technique ciblé (vidéo/feedback) — 15 min", typeHints: ["technique", "volume", "recuperation"] },
  technique_course:  { extraLine: "Éducatifs de course : montées de genoux + talons-fesses — 4×20m", typeHints: ["technique", "volume", "recuperation"] },
  recuperation:      { extraLine: "Récupération active ciblée : mobilité + étirements — 15 min", typeHints: ["recuperation", "technique", "volume"] },
  cardio:            { extraLine: "Finisher cardio : 10 min zone modérée", typeHints: ["volume", "intensite"] },
  force_generale:    { extraLine: "Renfo général : squat + tirage + gainage — 3×10", typeHints: ["volume", "intensite", "technique"] },
  puissance:         { extraLine: "Puissance : sauts + lancers médecine-ball — 4×5", typeHints: ["intensite", "volume"] },
  gainage:           { extraLine: "Gainage renforcé : planche + rotation — 3×40s", typeHints: ["technique", "volume", "recuperation"] },
  frappe:            { extraLine: "Sac lourd : 5×10 frappes puissance maximale", typeHints: ["intensite", "volume"] },
};

const WEAKNESS_ARCHETYPE_L1 = {
  powerlifting: { jambes: PL_SQUAT, dos_bras: PL_DEADLIFT, pecs_epaules: PL_BENCH },
  musculation: { jambes: MUSCU_JAMBES, dos: MUSCU_DOS, pectoraux: MUSCU_PECTORAUX, epaules: MUSCU_EPAULES, bras: MUSCU_BRAS },
  halterophilie: { arrache: HA_SNATCH, epaule_jete: HA_CLEAN_JERK },
};

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
  hyrox: selectHyrox,
  combat: selectCombat,
  athletisme_sauts: selectAthletismeSauts,
  aviron: selectAviron,
  gymnastique: selectGymnastique,
  triathlon: selectTriathlon,
  calisthenics: selectCalisthenics,
  endurance_10k: selectEndurance10k,
  endurance_semi: selectEnduranceSemi,
  endurance_marathon: selectEnduranceMarathon,
  reeducation_cheville: selectReeducationCheville,
  reeducation_epaule: selectReeducationEpaule,
  reeducation_genou: selectReeducationGenou,
  reeducation_genou_rotulien: selectReeducationRotulien,
  reeducation_genou_lca: selectReeducationLca,
  reeducation_lombaire: selectReeducationLombalgie,
  reeducation_tendon_achille: selectReeducationAchille,
  reeducation_periostite: selectReeducationPeriostite,
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

function generateTemplate({ sport, level, days, duration, weaknesses }) {
  const category = getSportCategory(sport ?? "");
  const moderateOnly = category.startsWith("reeducation_");
  const focusDist = moderateOnly ? FOCUS_DIST_REEDUCATION : FOCUS_DIST_MIXTE; // approximation universelle (pas de focus par programme)
  const baseDiff = LEVEL_BASE_DIFF[level] ?? 6;
  const selectedWeaknesses = (weaknesses ?? []).slice(0, 2);
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

    // Faiblesses, niveau 1 — voir generate/route.ts pour le raisonnement complet (biais calendaire,
    // pas juste "1er slot de répétition" : pour ces sports tous les archétypes partagent le même
    // SessionType, donc l'écrasement par la Phase B dépend uniquement de l'adjacence calendaire,
    // jamais du contenu — cibler un slot non-isolé serait invisible, écrasé quel que soit le choix).
    if (selectedWeaknesses.length) {
      const l1Table = WEAKNESS_ARCHETYPE_L1[category];
      if (l1Table) {
        const isFirstOccurrence = d =>
          dayPlans.findIndex(x => x.archetypeName === d.archetypeName) === dayPlans.indexOf(d);
        for (const key of selectedWeaknesses) {
          const target = l1Table[key];
          if (!target) continue;
          const currentCount = dayPlans.filter(d => d.archetypeName === target.name).length;
          if (currentCount >= 2) continue;
          const candidate = dayPlans.find(d =>
            !d.forced && d.archetypeName && !isFirstOccurrence(d) &&
            !dayPlans.some(other => other !== d && Math.abs(other.calIdx - d.calIdx) === 1)
          );
          if (!candidate) continue;
          candidate.type = target.type;
          candidate.archetypeName = target.name;
          candidate.exercises = target.exercises;
        }
      }
    }

    // Phase A2 — règle universelle, s'applique aussi aux sports à curriculum (voir generate/route.ts).
    // moderateOnly (rééducation) : désactivée — "ouvrir la semaine sur quelque chose de
    // substantiel" contredit le principe même de la rééducation.
    if (!moderateOnly && dayPlans.length > 0 && !dayPlans[0].forced && RPE_BUCKET[dayPlans[0].type] === "easy") {
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
        const orderedCandidates = moderateOnly
          ? ["volume", "recuperation", "technique"]
          : keepBucket === "hard" ? ["recuperation", "technique", "volume"]
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
      const orderedCandidates = moderateOnly
        ? ["volume", "recuperation", "technique"]
        : keepBucket === "hard" ? ["recuperation", "technique", "volume"]
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

    // Faiblesses, niveau 2 — voir generate/route.ts pour le raisonnement complet (liste de types
    // acceptables + repli garanti + dispatch sur des jours différents entre plusieurs faiblesses).
    const weaknessDayIdx = new Map();
    const usedDayIdx = new Set();
    for (const key of selectedWeaknesses) {
      const meta = WEAKNESS_META[key];
      if (!meta) continue;
      const candidates = dayPlans.filter(d => !d.forced);
      const unused = d => !usedDayIdx.has(d.dayIdx);
      const match =
        meta.typeHints.map(t => candidates.find(d => d.type === t && unused(d))).find(Boolean) ??
        meta.typeHints.map(t => candidates.find(d => d.type === t)).find(Boolean) ??
        candidates.find(unused) ??
        candidates[0];
      if (match) { weaknessDayIdx.set(key, match.dayIdx); usedDayIdx.add(match.dayIdx); }
    }

    // Phase C — construire les séances
    dayPlans.forEach(({ day, dayIdx, type, archetypeName, exercises }) => {
      const target_difficulty = sessionDifficulty(type, weekDiff, moderateOnly);
      let notes = exercises
        ? buildNotesFromBank(exercises, type, rotationAnchor, shape, prescriptionPhase)
        : buildNotes(category, type, rotationAnchor, shape, prescriptionPhase);
      Array.from(weaknessDayIdx.entries()).forEach(([key, idx]) => {
        if (idx === dayIdx) notes += "\n" + WEAKNESS_META[key].extraLine;
      });
      week[day] = [{
        name: archetypeName ?? sessionName(type, w, dayIdx),
        notes,
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
