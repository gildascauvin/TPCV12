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

// Rotation dédiée aux 6 catégories de rééducation — jamais de type "intensite" (uncapped,
// weekDiff+1) ni "test" hors du test forcé de fin de semaine MRV déjà existant, pour garantir
// une intensité réellement modérée à chaque séance plutôt qu'un vœu pieux dans le texte des
// exercices. "technique"/"volume" restent plafonnés par sessionDifficulty() (max 4 et 7).
const FOCUS_DIST_REEDUCATION: SessionType[] = ["technique", "volume", "recuperation", "technique", "volume", "recuperation", "technique"];

// ---- "Autre" (sport tapé librement, sans curriculum dédié) : répartition technique/préparation
// physique déterministe par nombre de jours, VOLONTAIREMENT générique (pas de ratio par sport) —
// contrairement aux curriculums de SPORT_CURRICULUM plus bas, chacun construit à partir d'une vraie
// page produit WordPress, il n'existe aucune source de vérité pour arbitrer un "bon" ratio technique/
// prépa par sport inconnu (kitesurf, BMX racing, escalade...) : ce serait de la pure invention.
// Formule directe (jamais un cyclage modulo sur une liste plus courte) : élimine par construction le
// bug de reachability déjà rencontré 2 fois dans ce fichier (Renfo endurance jamais atteint à n=4,
// Skill calisthenics jamais atteint à n=3 — un type/archétype placé à un index ≥ n n'apparaissait
// jamais, quel que soit n). Repères donnés par Gildas : 4j → 2 technique + 2 prépa, 5j → 3 technique
// + 2 prépa — équivaut à techCount = ceil(n/2), prépa = le reste. "technique" = le geste du sport
// lui-même ; "volume"/"intensite" = les 2 saveurs de préparation physique généraliste (alternées) —
// leur discipline réelle (circuit training, renfo, sprints, muscu...) est choisie par Claude côté
// /api/sports/custom (customSessionLabels), jamais ici : cette fonction ne décide QUE combien de
// jours de chaque type, jamais leur contenu — même principe que "Claude fournit le vocabulaire,
// jamais la structure" déjà appliqué à customExercises.
function selectAutreTypes(dayCount: number): SessionType[] {
  const techCount = Math.ceil(dayCount / 2);
  const prepCount = dayCount - techCount;
  if (prepCount === 0) return Array(dayCount).fill("technique") as SessionType[]; // n=1, cas limite

  const types: SessionType[] = [];
  let prepPlaced = 0;
  let techPlaced = 0;
  // Alterne strictement prépa/technique en commençant par la prépa — protège le ratio annoncé
  // contre la Phase A2 universelle (1er jour de la semaine jamais facile, "technique" est le
  // palier facile) : sans ce choix, la Phase A2 retransformerait silencieusement le 1er jour en
  // prépa et ferait dériver le compte exact promis (ex. 4j → 2 technique+2 prépa deviendrait 1+3
  // dès que le 1er jour calendaire tombait sur une case technique — vérifié en testant contre le
  // serveur dev réel, pas juste en relisant le code). Un seul jour "technique" en trop reste
  // possible en fin de semaine quand n est impair (techCount = prepCount+1, ex. 5j → 3 technique+
  // 2 prépa) : mathématiquement inévitable une fois le 1er jour réservé à la prépa — la Phase B
  // (jamais 2 jours calendairement consécutifs au même palier) reste le filet de sécurité si ces
  // 2 jours techniques sont effectivement adjacents dans le calendrier choisi.
  while (prepPlaced < prepCount || techPlaced < techCount) {
    if (prepPlaced <= techPlaced && prepPlaced < prepCount) {
      types.push(prepPlaced % 2 === 0 ? "volume" : "intensite");
      prepPlaced++;
    } else {
      types.push("technique");
      techPlaced++;
    }
  }
  return types;
}

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
// moderateOnly (catégories reeducation_*) : plafonne aussi "test" (le bilan/réassessment
// périodique de fin de semaine MRV, mécanisme universel non désactivé pour la rééducation — un
// point de contrôle est légitime, mais afficher "10/10" sur un bilan de rééducation contredirait
// le principe d'intensité modérée demandé explicitement).
function sessionDifficulty(type: SessionType, weekDiff: number, moderateOnly = false): number {
  switch (type) {
    case "recuperation": return Math.max(1, Math.min(3, weekDiff - 3));
    case "technique":    return Math.max(2, Math.min(4, Math.round(weekDiff / 3))); // jamais "Modérée" (5+), toujours "Facile"
    // "volume" plafonné à 5 pour moderateOnly — sans ça, une semaine MRV (weekDiff proche de 10)
    // fait quand même lire "Renforcement mollet" à 7/10 sur un programme de tendinopathie
    // achilléenne, contredisant directement le principe d'intensité modérée : le plafond générique
    // à 7 (correct partout ailleurs) n'a jamais été conçu pour rester "modéré", juste "pas dur".
    case "volume":       return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 3)) : Math.max(3, Math.min(7, weekDiff - 1));
    case "intensite":    return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 2)) : Math.max(1, Math.min(10, weekDiff + 1));
    case "test":         return moderateOnly ? Math.max(2, Math.min(5, weekDiff - 2)) : Math.max(1, Math.min(10, weekDiff + 2));
  }
}

const SESSION_NAMES: Record<SessionType, string[]> = {
  technique:   ["Séance technique", "Travail technique", "Affûtage technique"],
  volume:      ["Séance volume", "Travail de volume", "Construction volume"],
  intensite:   ["Séance intensive", "Travail d'intensité", "Pic d'intensité"],
  recuperation:["Récupération active", "Séance légère", "Décharge"],
  test:        ["Test & évaluation", "Bilan de cycle", "Séance test"],
};

// Exportés (2026-08-06) pour réutilisation par /api/sports/custom/route.ts — évite de dupliquer
// le routage par mots-clés pour décider si un sport libre matche déjà un curriculum existant.
export type SportCategory = "halterophilie" | "halterophilie_snatch" | "powerlifting" | "powerlifting_squat" | "powerlifting_bench" | "powerlifting_deadlift" | "musculation" | "puissance" | "perte_de_poids" | "sprint" | "athletisme_sauts" | "combat" | "fitness" | "hyrox" | "calisthenics" | "collectif" | "endurance" | "endurance_10k" | "endurance_semi" | "endurance_marathon" | "trail" | "triathlon" | "cyclisme" | "natation" | "ski" | "aviron" | "gymnastique" | "reeducation_cheville" | "reeducation_epaule" | "reeducation_genou" | "reeducation_genou_rotulien" | "reeducation_genou_lca" | "reeducation_lombaire" | "reeducation_tendon_achille" | "reeducation_periostite" | "reeducation_generale" | "autre";

export function getSportCategory(sport: string): SportCategory {
  const s = (sport ?? "").toLowerCase();
  // Musculation/Hypertrophie (split par groupe musculaire) ≠ Powerlifting (squat/bench/deadlift) —
  // "musculation" avait le même sort que "power"/"force" avant ce fix (mélangés dans le même seau
  // "muscu" détecté comme powerlifting), donnant des séances "Focus Squat/Bench/Deadlift" à des
  // programmes génériques de musculation/hypertrophie qui n'ont rien d'un powerlifting. Vérifié
  // AVANT ce check spécifique (le mot "hypertroph" ne collisionne avec aucun autre mot-clé).
  if (s.includes("hypertroph")) return "musculation";
  if (s.includes("explosiv")) return "puissance";
  if (s.includes("perte de poids") || s.includes("perte-de-poids")) return "perte_de_poids";
  // Spécialisation par lift (bibliothèque publique, sport-field relabellisé pour ces programmes
  // précis, ex. "Powerlifting — Spécialisation Squat") — vérifiées AVANT les checks génériques
  // halterophilie/powerlifting ci-dessous, sinon "squat"/"bench"/"deadlift" ne seraient jamais
  // atteints (le générique matcherait déjà sur "power"). "snatch"/"arraché" seuls sont déjà pris
  // par le générique halterophilie plus bas, d'où le "spécialisation" combiné pour ce cas précis.
  if (s.includes("squat")) return "powerlifting_squat";
  if (s.includes("bench")) return "powerlifting_bench";
  if (s.includes("deadlift")) return "powerlifting_deadlift";
  if (s.includes("spécialisation") && (s.includes("arrach") || s.includes("snatch"))) return "halterophilie_snatch";
  // Haltérophilie (arraché/épaulé-jeté olympique) ≠ Powerlifting (squat/bench/deadlift) —
  // avant ce fix, "Force/Powerlifting" et "Haltérophilie" tombaient dans le même seau, mélangeant
  // les deux banques d'exercices (un "Force/Powerlifting" recevait des séances d'arraché).
  if (s.includes("halt") || s.includes("olympique") || s.includes("snatch") || s.includes("arraché")) return "halterophilie";
  if (s.includes("power") || s.includes("force")) return "powerlifting";
  // Sauts athlétiques (longueur/hauteur) vérifiés AVANT le générique sprint — "saut" appartenait
  // avant au seau générique "sprint", donnant des séances Accélération/Vitesse max à un programme
  // de sauts qui n'a rien à voir avec le sprint pur.
  if (s.includes("saut")) return "athletisme_sauts";
  if (s.includes("sprint") || s.includes("athlé") || s.includes("piste") || s.includes("lancé")) return "sprint";
  if (s.includes("combat") || s.includes("art") || s.includes("mma") || s.includes("judo") || s.includes("boxe") || s.includes("karaté") || s.includes("lutte")) return "combat";
  // Hyrox : format de course spécifique (8km course + 8 stations) — vérifié AVANT le générique
  // "fitness" (le sport-field "Fitness/Hyrox" contient les deux mots-clés).
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
  // Trail : dénivelé spécifique — vérifié avant le générique endurance ("trail" y était inclus
  // avant, donnant le même contenu plat qu'une course sur route classique).
  if (s.includes("trail")) return "trail";
  // Rééducation par région du corps — "Prevention/Reeducation" seul est trop générique pour
  // distinguer une cheville d'un genou ou d'un dos ; nécessite un sport-field relabellisé par
  // programme (ex. "Prevention/Reeducation — Genou").
  if (s.includes("prevention") || s.includes("reeducation") || s.includes("rééducation")) {
    // Sous-catégories spécifiques vérifiées avant le "genou" générique — Rotulien (excentrique
    // quadriceps + fessiers), LCA (16 semaines, 4 phases post-chirurgie) et Valgus (correction du
    // schéma de mouvement) sont 3 protocoles distincts pour la même articulation, pas variantes
    // d'un même contenu.
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
  // Course à pied par distance cible — "Course à pied" seul est trop générique pour distinguer un
  // 10k d'un marathon (mêmes distances de sortie longue/fractionné pour les deux sinon) ; nécessite
  // un sport-field relabellisé par programme (ex. "Course à pied — Marathon"). Le programme
  // générique "Zone 2" (base aérobie, pas de distance cible) reste volontairement sur "endurance".
  if (s.includes("course")) {
    if (s.includes("10k") || s.includes("10 km")) return "endurance_10k";
    if (s.includes("semi")) return "endurance_semi";
    if (s.includes("marathon")) return "endurance_marathon";
  }
  if (s.includes("run") || s.includes("marathon") || s.includes("course") || s.includes("fond") || s.includes("endur")) return "endurance";
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

  // Spécialisations powerlifting/haltérophilie (bibliothèque publique, sport-field relabellisé) —
  // banques identiques aux catégories génériques correspondantes (le mouvement/vocabulaire ne
  // change pas, seule la FRÉQUENCE hebdomadaire par lift change, voir le curriculum dédié).
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
      "Benchmark WOD : Fran (21-15-9 thrusters + tractions, for time)",
      "Benchmark WOD : Cindy (AMRAP 20 min : 5 tractions + 10 pompes + 15 squats)",
      "Benchmark WOD : Murph (1 mile course + 100 tractions + 200 pompes + 300 squats + 1 mile course)",
      "Benchmark WOD : Grace (30 épaulé-jeté for time)",
    ],
  },

  hyrox: {
    technique: [
      "Technique sled push/pull — 4×15m",
      "Technique wall balls — 4×15",
      "Technique burpee broad jump — 4×10m",
      "Mobilité hanches et chevilles — 10 min",
    ],
    volume: [
      "Endurance fondamentale course — 40 min",
      "Circuit stations légères : sled + wall balls + farmers carry — 3 tours",
      "Rameur continu — 20 min",
    ],
    intensite: [
      "SkiErg — 5×500m (récup 90s)",
      "Fractionné course 1km — 5 reps (récup 3 min)",
      "Circuit stations intense : sled + burpees + lunges — 4 tours",
    ],
    recuperation: [
      "Marche active — 25 min",
      "Stretching global — 15 min",
      "Mobilité chevilles et hanches — 10 min",
      "Foam rolling jambes",
    ],
    test: [
      "Simulation Hyrox complète : 8km course + 8 stations",
      "Test : 1km course chronométré",
      "Test : sled push 50m chronométré",
      "Bilan forme physique",
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

  athletisme_sauts: {
    technique: [
      "Technique d'appel : course d'élan réduite + impulsion — 6 sauts",
      "Décomposition du geste : approche + pose de pied — 4×3",
      "Éducatifs de saut : cloche-pied, foulées bondissantes — 3×20m",
      "Mobilité chevilles et hanches — 10 min",
    ],
    volume: [
      "Multibonds : foulées bondissantes — 4×30m",
      "Course d'élan progressive (7-9 appuis) + saut — 5 sauts",
      "Renforcement : squat + fentes + mollets — 3×10",
      "Gainage complet — 3×40s",
    ],
    intensite: [
      "Pliométrie : sauts en contrebas (depth jump) — 4×5",
      "Saut avec élan complet à intensité compétition — 5 sauts",
      "Squat jump chargé — 4×5",
      "Sprint d'élan 20m départ lancé — 4 reps",
    ],
    recuperation: [
      "Mobilité chevilles, hanches, ischio-jambiers — 15 min",
      "Foam rolling jambes complètes",
      "Marche active — 20 min",
      "Stretching actif — 15 min",
    ],
    test: [
      "Test : saut en longueur avec élan complet, meilleure tentative",
      "Test : saut en hauteur, meilleure tentative",
      "Test : détente verticale (squat jump)",
      "Bilan technique vidéo (course d'élan + impulsion)",
    ],
  },

  calisthenics: {
    technique: [
      "Tirage vertical progression (bande ou négatives) — 5×4",
      "Alignement gainage en suspension (hollow body) — 4×20s",
      "Placement dips sur barres parallèles — 4×5",
      "Mobilité épaules et poignets — 10 min",
    ],
    volume: [
      "Tractions strictes — 5×6",
      "Dips — 5×8",
      "Pompes archer (unilatérales) — 4×6 par côté",
      "Squat pistol assisté — 3×6 par jambe",
      "Gainage complet : planche + gainage latéral — 3×40s",
    ],
    intensite: [
      "Tractions explosives (vers barre haute) — 4×4",
      "Muscle-up ou progression muscle-up — 5×3",
      "Pompes plyométriques (décollé) — 4×6",
      "Front lever tenu (progression) — 4×10s",
    ],
    recuperation: [
      "Mobilité épaules, poignets, hanches — 15 min",
      "Stretching global — 15 min",
      "Foam rolling dos et épaules",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test : tractions strictes max en une série",
      "Test : dips strictes max en une série",
      "Test : L-sit ou front lever, temps de tenue max",
      "Bilan technique vidéo (tractions/muscle-up)",
    ],
  },

  endurance_10k: {
    technique: [
      "Foulées éducatives — 4×100m",
      "Travail de foulée allure 10k — 20 min",
      "Côtes courtes 8% — 6×50m",
      "Gainage en course — 10 min",
    ],
    volume: [
      "Endurance fondamentale Zone 2 — 35 min",
      "Sortie longue — 45-55 min",
      "Renforcement : mollets + squats + fentes",
      "Gainage dynamique — 3×45s",
    ],
    intensite: [
      "Fractionné 400m allure 10k — 10 reps (récup 60s)",
      "Fractionné 1000m allure 10k — 6 reps (récup 2 min)",
      "Seuil : 15 min continu allure semi",
      "Tempo run allure 10k — 20 min",
    ],
    recuperation: [
      "Footing léger très doux — 20 min",
      "Stretching global — 15 min",
      "Bain froid jambes",
      "Foam roller mollets et IT band",
    ],
    test: [
      "Test : 5km chronométré",
      "Course sur 10k (objectif du bloc)",
      "Test de seuil lactique",
      "Bilan FC repos + effort",
    ],
  },

  endurance_semi: {
    technique: [
      "Foulées éducatives — 4×100m",
      "Travail de foulée allure semi — 20 min",
      "Côtes moyennes 6% — 6×100m",
      "Gainage en course — 10 min",
    ],
    volume: [
      "Endurance fondamentale Zone 2 — 35-50 min",
      "Sortie longue — 50-100 min",
      "Renforcement : mollets + squats + fentes",
      "Gainage dynamique — 3×45s",
    ],
    intensite: [
      "Fractionné 1000m allure semi — 8 reps (récup 90s)",
      "Fractionné 2000m allure semi — 5 reps (récup 2 min)",
      "Seuil : 25 min continu allure semi",
      "Tempo run allure semi — 30 min",
    ],
    recuperation: [
      "Footing léger très doux — 25-30 min",
      "Stretching global — 15 min",
      "Bain froid jambes",
      "Foam roller mollets et IT band",
    ],
    test: [
      "Test : 10km chronométré",
      "Sortie longue à allure semi cible — 16km",
      "Test de seuil lactique",
      "Bilan FC repos + effort",
    ],
  },

  endurance_marathon: {
    technique: [
      "Foulées éducatives — 4×100m",
      "Travail de foulée allure marathon — 25 min",
      "Côtes longues 5% — 6×200m",
      "Gainage en course — 10 min",
    ],
    // "Zone 2 plus long (jeudi, 50-85 min)" décrit sur la page WordPress n'a pas d'archétype
    // dédié — le générateur reste sur 6 archétypes génériques par catégorie endurance (comme
    // "endurance"/10k/semi), la 5e séance hebdo du marathon n'est donc pas répliquée à l'identique.
    volume: [
      "Endurance fondamentale Zone 2 — 40-60 min",
      "Sortie longue — 70-150 min",
      "Renforcement : mollets + squats + fentes",
    ],
    intensite: [
      "Fractionné 2000m allure marathon — 6 reps (récup 2 min)",
      "Tempo run allure marathon — 45 min",
      "Seuil : 35 min continu",
      "Bloc marathon : 3×20 min allure cible (récup 3 min)",
    ],
    recuperation: [
      "Footing léger très doux — 30 min",
      "Stretching global — 15 min",
      "Bain froid jambes",
      "Foam roller mollets et IT band",
    ],
    test: [
      "Sortie longue à allure marathon cible — 30km",
      "Test : semi-marathon chronométré",
      "Test de seuil lactique",
      "Bilan FC repos + effort",
    ],
  },

  trail: {
    technique: [
      "Technique de descente : petits appuis rapides — 15 min",
      "Marche rapide en côte, technique de poussée — 20 min",
      "Franchissement d'obstacles (racines, pierres) — 15 min",
      "Mobilité chevilles et hanches — 10 min",
    ],
    volume: [
      "Sortie longue trail avec dénivelé modéré — 90 min",
      "Sortie vallonnée D+400m — 70 min",
      "Renforcement : mollets + squats + fentes + gainage",
      "Marche active en côte — 40 min",
    ],
    intensite: [
      "Répétitions de côtes : montée rapide — 8×3 min (récup descente)",
      "Côtes longues D+ soutenu — 5×5 min",
      "Descente technique rapide — 6×2 min (récup montée)",
      "Fractionné vallonné — 6×5 min effort soutenu",
    ],
    recuperation: [
      "Marche active en nature — 30 min",
      "Stretching global — 15 min",
      "Foam roller mollets et quadriceps",
      "Mobilité chevilles — 10 min",
    ],
    test: [
      "Simulation course trail : distance + dénivelé cible",
      "Test : montée chronométrée sur une côte de référence",
      "Test : descente technique chronométrée",
      "Bilan D+/D- et allure",
    ],
  },

  triathlon: {
    technique: [
      "Natation technique : catch-up crawl — 4×50m",
      "Vélo : cadence 100 rpm — 15 min",
      "Course : foulées éducatives — 4×100m",
      "Transition natation→vélo simulée — 3 reps",
    ],
    volume: [
      "Sortie vélo endurance Z2 — 60-90 min",
      "Sortie course endurance fondamentale — 45 min",
      "Nage continue 4 nages — 1500m",
      "Renforcement général : gainage + squat + tirage — 3×10",
    ],
    intensite: [
      "Fractionné natation : 10×100m (récup 20s)",
      "Fractionné vélo : 6×4 min à 105% FTP (récup 3 min)",
      "Fractionné course : 6×1000m allure 10k (récup 2 min)",
      "Brick (enchaînement) : vélo 30 min + course 15 min",
    ],
    recuperation: [
      "Nage très douce — 20 min",
      "Vélo doux Z1 — 30 min",
      "Stretching global — 15 min",
      "Mobilité épaules et hanches — 10 min",
    ],
    test: [
      "Simulation triathlon format court (natation+vélo+course enchaînés)",
      "Test : 1000m natation chronométré",
      "Test FTP vélo : 20 min à puissance max",
      "Test : 5km course chronométré",
    ],
  },

  reeducation_cheville: {
    technique: [
      "Proprioception unipodale sur sol stable — 4×30s par jambe",
      "Mobilité cheville : flexion dorsale contre mur — 3×10",
      "Marche sur pointes puis talons — 3×20m",
      "Étirement mollets — 3×30s",
    ],
    volume: [
      "Isométrie chevilles : éverseurs/inverseurs contre résistance — 4×20s",
      "Renforcement mollets léger : montées sur pointes — 3×15",
      "Proprioception sur plateau instable — 4×30s par jambe",
      "Vélo ou marche légère — 15 min",
    ],
    intensite: [
      "Renforcement mollets modéré : montées sur pointes unipodales — 3×12 par jambe",
      "Proprioception dynamique : petits sauts contrôlés — 3×8",
      "Isométrie cheville en charge partielle — 4×25s",
    ],
    recuperation: [
      "Mobilité douce cheville — 10 min",
      "Marche active — 15-20 min",
      "Auto-massage mollet et voûte plantaire",
      "Élévation + glace si besoin",
    ],
    test: [
      "Test : équilibre unipodal, temps de tenue",
      "Test : amplitude flexion dorsale (mesure)",
      "Test : montée sur pointes unipodale, répétitions max",
      "Bilan douleur/gonflement",
    ],
  },

  // Valgus du genou : correction du SCHÉMA de mouvement (le genou "part vers l'intérieur" à la
  // réception) — différent du Syndrome Rotulien (douleur sous la rotule, excentrique quadriceps)
  // et du Post-LCA (post-chirurgie, 4 phases) même si les 3 concernent le genou. Focus : squat
  // face miroir/caméra, activation fessiers, contrôle de l'alignement genou-pied.
  reeducation_genou: {
    technique: [
      "Activation fessiers : pont fessier — 3×12",
      "Squat isométrique dos au mur (wall sit) — 4×20s",
      "Contrôle du valgus : squat face à un miroir, focus alignement genou-pied — 3×10",
      "Mobilité hanches — 10 min",
    ],
    volume: [
      "Renforcement fessiers : clamshell + pont fessier + band walk — 3×15",
      "Squat gobelet focus alignement — 3×12",
      "Step-down contrôlé face miroir — 3×10 par jambe",
      "Vélo léger sans résistance — 15-20 min",
    ],
    intensite: [
      "Squat charge légère focus alignement — 3×10",
      "Fentes contrôlées focus alignement — 3×10 par jambe",
      "Step-up contrôlé — 3×10 par jambe",
      "Proprioception dynamique unipodale — 4×20s",
    ],
    recuperation: [
      "Mobilité douce genou et hanche — 10 min",
      "Vélo très léger — 15 min",
      "Auto-massage quadriceps et ischio-jambiers",
      "Étirements chaîne postérieure",
    ],
    test: [
      "Test : squat face caméra, évaluation visuelle de l'alignement genou-pied",
      "Test : squat unipodal contrôlé, répétitions max sans douleur",
      "Test : équilibre unipodal yeux fermés",
      "Bilan douleur/alignement",
    ],
  },

  // Syndrome rotulien (fémoro-patellaire) : 3 séances nommées explicitement (A/B/C) — excentrique
  // quadriceps (le symptôme), renforcement fessiers (la cause : le valgus dynamique qui augmente
  // la pression sous la rotule), intégration fonctionnelle. Squats partiels (90° ou moins), wall
  // sit, step-downs excentriques — jamais le squat complet en début de programme.
  reeducation_genou_rotulien: {
    technique: [
      "Squat partiel (90° ou moins) — 4×10",
      "Wall sit (chaise contre mur) — 4×20s",
      "Step-down excentrique lent — 3×8 par jambe",
      "Mobilité hanches — 10 min",
    ],
    volume: [
      "Excentrique quadriceps : step-down lent — 4×10 par jambe",
      "Renforcement fessiers : clamshell + pont fessier + band walk — 3×15",
      "Presse à cuisses amplitude partielle — 3×15",
      "Vélo léger sans résistance — 15-20 min",
    ],
    intensite: [
      "Excentrique quadriceps chargé : step-down lesté — 3×10 par jambe",
      "Squat progressif vers amplitude complète (si douleur <3/10) — 3×10",
      "Renforcement fessiers chargé : hip thrust — 3×12",
    ],
    recuperation: [
      "Mobilité douce genou et hanche — 10 min",
      "Vélo très léger — 15 min",
      "Auto-massage quadriceps et bandelette ilio-tibiale",
      "Étirements chaîne antérieure et postérieure",
    ],
    test: [
      "Test : step-down contrôlé, répétitions max sans dépasser 3/10 de douleur",
      "Test : squat complet, douleur évaluée sur 10",
      "Test : équilibre unipodal",
      "Bilan douleur sous la rotule (montée/descente escaliers)",
    ],
  },

  // Post-LCA : post-chirurgie, 4 phases sur 16 semaines (activation neuromusculaire S1-4, force
  // progressive S5-8 avec Nordic Hamstring dès cette phase, pliométrie débutante S9-12, retour
  // sport progressif S13-16). La rotation par bloc (rotationAnchor, même mécanisme que partout
  // ailleurs) fait naturellement remonter les exercices plus avancés de ce tableau à mesure que
  // le programme progresse — approximation raisonnable des 4 phases sans construire un modèle de
  // périodisation dédié supplémentaire.
  reeducation_genou_lca: {
    technique: [
      "Activation quadriceps : contraction isométrique — 4×10s",
      "Mobilité genou passive (flexion/extension) — 10 min",
      "Proprioception bipodale sol stable — 4×20s",
      "Amplitude articulaire active assistée — 10 min",
    ],
    volume: [
      "Renforcement quadriceps chaîne fermée léger : presse à cuisses — 3×15",
      "Nordic Hamstring Exercise assisté — 3×6",
      "Renforcement fessiers : pont fessier + clamshell — 3×15",
      "Vélo sans résistance — 15-20 min",
    ],
    intensite: [
      "Pliométrie débutante : sauts amortis bipodaux contrôlés — 3×6",
      "Squat unipodal contrôlé — 3×8 par jambe",
      "Nordic Hamstring Exercise — 4×8",
      "Course en ligne droite progressive (si autorisé) — 10-15 min",
    ],
    recuperation: [
      "Mobilité douce genou — 10 min",
      "Vélo très léger — 15-20 min",
      "Auto-massage quadriceps et ischio-jambiers",
      "Élévation si gonflement",
    ],
    test: [
      "Test : force quadricipitale, comparaison au côté sain",
      "Test : hop test unipodal, symétrie",
      "Test : squat unipodal contrôlé sans compensation",
      "Bilan douleur et épanchement",
    ],
  },

  reeducation_lombaire: {
    technique: [
      "Gainage neutre : dead bug — 3×10 par côté",
      "Bird-dog contrôlé — 3×10 par côté",
      "Mobilité hanches : bascule du bassin — 3×12",
      "Respiration diaphragmatique — 10 min",
    ],
    volume: [
      "Isométrie gainage : planche — 4×20s",
      "Isométrie gainage latéral — 3×20s par côté",
      "Renforcement dos léger : superman contrôlé — 3×12",
      "Marche active — 20 min",
    ],
    intensite: [
      "Isométrie planche prolongée — 4×30s",
      "Bird-dog avec charge légère (poids de cheville) — 3×10 par côté",
      "Renforcement dos modéré : tirage horizontal léger — 3×12",
      "Gainage dynamique : mountain climber lent — 3×10",
    ],
    recuperation: [
      "Mobilité douce colonne lombaire — 10 min",
      "Marche active — 20-25 min",
      "Étirements hanches et ischio-jambiers doux",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test : planche, temps de tenue max",
      "Test : bird-dog contrôlé, répétitions sans compensation",
      "Test : mobilité flexion/extension lombaire (amplitude)",
      "Bilan douleur au repos et en mouvement",
    ],
  },

  // Tendon d'Achille : protocole Alfredson (excentrique mollet, 3×15, lent à la descente) — le
  // traitement conservateur le plus validé pour la tendinopathie achilléenne. Progresse de
  // l'excentrique léger vers la charge, jusqu'à "force maximale" en semaines 6-7 (WP) avant le
  // retour course complet en semaine 8.
  reeducation_tendon_achille: {
    technique: [
      "Excentrique mollet (protocole Alfredson) — 3×15",
      "Isométrie mollet : montée sur pointes tenue — 4×20s",
      "Mobilité cheville : flexion dorsale — 3×10",
      "Auto-massage mollet et tendon",
    ],
    volume: [
      "Excentrique mollet (protocole Alfredson) genou tendu — 3×15",
      "Excentrique mollet (protocole Alfredson) genou fléchi — 3×15",
      "Renforcement pied/cheville léger — 3×12",
      "Vélo ou natation sans impact — 15-20 min",
    ],
    intensite: [
      "Excentrique mollet chargé (lesté, lent) — 4×12",
      "Montées sur pointes unipodales chargées — 3×12 par jambe",
      "Renforcement mollet force maximale — 4×8",
      "Course progressive courte (si douleur <4/10) — 10-15 min",
    ],
    recuperation: [
      "Mobilité douce cheville et mollet — 10 min",
      "Vélo ou natation sans impact — 15 min",
      "Auto-massage mollet et tendon",
      "Étirements chaîne postérieure doux",
    ],
    test: [
      "Test : isométrie mollet, temps de tenue max",
      "Test : montée sur pointes unipodale, répétitions max sans dépasser 4/10 de douleur",
      "Test : course 30 min, tolérance sans douleur >4/10",
      "Bilan douleur au palper et à l'effort",
    ],
  },

  // Périostite tibiale : 0 course les 2 premières semaines (règle explicite WP), renforcement
  // tibial antérieur pendant le repos course, puis marche-course progressive (ratio 1:2), reprise
  // course complète seulement en semaine 5-6.
  reeducation_periostite: {
    technique: [
      "Renforcement tibial antérieur : flexion dorsale résistée — 4×15",
      "Mobilité cheville : flexion dorsale — 3×10",
      "Technique de foulée : cadence et appui médio-pied — 10 min",
      "Auto-massage mollet et tibia",
    ],
    volume: [
      "Renforcement tibial antérieur chargé — 3×15",
      "Vélo ou natation sans impact — 20-25 min",
      "Renforcement mollets et pied — 3×12",
      "Proprioception cheville — 3×10",
    ],
    intensite: [
      "Marche-course progressive (ratio 1:2) — 20 min",
      "Course continue légère (si douleur absente) — 15-20 min",
      "Renforcement tibial antérieur et mollets chargé — 4×12",
    ],
    recuperation: [
      "Marche active — 20-25 min",
      "Vélo ou natation sans impact — 15-20 min",
      "Auto-massage mollet et tibia",
      "Élévation + glace si besoin",
    ],
    test: [
      "Test : course 20 min continue, tolérance sans douleur",
      "Test : renforcement tibial antérieur, répétitions max",
      "Test : palpation bord interne tibia (douleur)",
      "Bilan reprise course complète",
    ],
  },

  reeducation_epaule: {
    technique: [
      "Isométrie rotateurs externes (coude au corps) — 4×15s",
      "Isométrie rotateurs internes — 4×15s",
      "Mobilité scapulaire : rétraction/protraction — 3×12",
      "Mobilité épaule douce (pendulaires) — 10 min",
    ],
    volume: [
      "Renforcement coiffe léger bande élastique : rotation externe — 3×15",
      "Renforcement coiffe léger bande élastique : rotation interne — 3×15",
      "Stabilité scapulaire : Y-T-W au sol — 3×10 chaque",
      "Mobilité thoracique — 10 min",
    ],
    intensite: [
      "Isométrie rotateurs charge modérée — 4×20s",
      "Renforcement coiffe modéré bande élastique — 3×15",
      "Stabilité scapulaire avec charge légère — 3×12",
    ],
    recuperation: [
      "Mobilité douce épaule (pendulaires) — 10 min",
      "Étirements chaîne postérieure épaule",
      "Auto-massage trapèzes et deltoïdes",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test : isométrie rotation externe, temps de tenue max",
      "Test : amplitude articulaire épaule (mesure)",
      "Test : élévation bras sans douleur (amplitude)",
      "Bilan douleur au mouvement et à la charge",
    ],
  },

  reeducation_generale: {
    technique: [
      "Isométrie globale : gainage planche — 4×20s",
      "Mobilité articulaire générale — 15 min",
      "Activation musculaire ciblée (zone concernée) — 10 min",
      "Respiration diaphragmatique — 10 min",
    ],
    volume: [
      "Renforcement léger multi-articulaire : squat + rowing élastique — 3×12",
      "Isométrie ciblée zone concernée — 4×20s",
      "Marche active — 20 min",
      "Mobilité globale — 15 min",
    ],
    intensite: [
      "Renforcement modéré multi-articulaire — 3×12",
      "Isométrie ciblée prolongée — 4×30s",
      "Circuit léger : mobilité + renfo + équilibre — 3 tours",
    ],
    recuperation: [
      "Mobilité douce globale — 15 min",
      "Marche active — 20 min",
      "Auto-massage zones tendues",
      "Respiration et relaxation — 10 min",
    ],
    test: [
      "Test : isométrie zone concernée, temps de tenue max",
      "Test : amplitude articulaire (mesure)",
      "Test : tolérance à l'effort léger sans douleur",
      "Bilan douleur global",
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
// "Renfo" en fin de séance plutôt qu'en archétype dédié : à la fréquence typique de ces
// programmes (3-4 jours/semaine, cf. pages WordPress), un archétype dédié en position 5/6 sur 6
// n'apparaît quasiment jamais (la liste tronque avant de l'atteindre) — le circuit de renfo
// n'était donc en pratique jamais vu. Appendu aux 2 dernières lignes d'"Endurance fondamentale"
// (position 0, apparaît systématiquement quel que soit le nombre de jours) pour garantir au
// moins une fois par semaine, sans consommer un jour d'entraînement dédié.
// Renfo : dédié à partir de 4 jours/semaine (assez de place pour un jour à part), appendu en fin
// de séance "Endurance fondamentale" en dessous (≤3 jours) — règle donnée explicitement par
// Gildas plutôt que le premier essai (archétype dédié en position 5/6, qui n'apparaissait
// quasiment jamais aux fréquences réelles de ces programmes, 3-4 jours/semaine).
const ENDURANCE_FONDAMENTALE: Archetype = { name: "Endurance fondamentale", type: "volume", exercises: [
  "Endurance fondamentale — 45 min", "Sortie facile Z2 — 40 min", "Footing fondamental — 50 min",
]};
const ENDURANCE_FONDAMENTALE_RENFO: Archetype = { name: "Endurance fondamentale", type: "volume", exercises: [
  "Endurance fondamentale — 45 min", "Sortie facile Z2 — 40 min", "Footing fondamental — 50 min",
  "Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s",
]};
const ENDURANCE_SEUIL: Archetype = { name: "Seuil", type: "intensite", exercises: [
  "Seuil lactique — 20 min continu", "Tempo au seuil — 25 min", "Côtes au seuil — 5×400m (récup 90s)",
]};
const ENDURANCE_SORTIE_LONGUE: Archetype = { name: "Sortie longue", type: "volume", exercises: [
  "Sortie longue endurance fondamentale — 70 min", "Sortie longue progressive — 80 min",
]};
const ENDURANCE_FRACTIONNE: Archetype = { name: "Fractionné", type: "intensite", exercises: [
  "Fractionné 400m allure 5km — 8 reps (récup 90s)", "Fractionné 1000m — 5 reps (récup 3 min)", "Fractionné 200m rapide — 12 reps (récup 60s)",
]};
const ENDURANCE_RENFO: Archetype = { name: "Renfo", type: "technique", exercises: [
  "Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s", "Proprioception chevilles — 3×10",
]};
const ENDURANCE_RECUPERATION: Archetype = { name: "Récupération active", type: "recuperation", exercises: [
  "Footing très facile — 25 min", "Marche active — 30 min", "Vélo doux — 20 min",
]};
const ENDURANCE_LOW_FREQ: Archetype[] = [ENDURANCE_FONDAMENTALE_RENFO, ENDURANCE_SEUIL, ENDURANCE_SORTIE_LONGUE];
// Renfo positionné à l'index 3 (pas 4) — la sélection par cycle modulo (Array.from({length:n}))
// ne dépasse jamais l'index n-1 : dans un premier essai avec Renfo en position 4 d'une liste de
// 6, il n'apparaissait donc JAMAIS pour n=4 (exactement le seuil "dédié" annoncé), le cycle
// s'arrêtant à l'index 3 avant de l'atteindre — bug trouvé en vérifiant directement les
// templates régénérés en base, pas juste en supposant que le code faisait ce qui était voulu.
const ENDURANCE_HIGH_FREQ: Archetype[] = [ENDURANCE_FONDAMENTALE, ENDURANCE_SEUIL, ENDURANCE_SORTIE_LONGUE, ENDURANCE_RENFO, ENDURANCE_FRACTIONNE, ENDURANCE_RECUPERATION];
function selectEndurance(n: number): Archetype[] {
  const list = n <= 3 ? ENDURANCE_LOW_FREQ : ENDURANCE_HIGH_FREQ;
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
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
const SPRINT_RENFO: Archetype = { name: "Renfo", type: "volume", exercises: [
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
// Ordre volontairement PAS [Accélération, Vitesse max, Renfo, ...] : Accélération et Vitesse max
// sont toutes les deux "intensite" (palier dur) — les mettre en positions 0/1 consécutives les
// fait systématiquement entrer en collision dès que les jours choisis incluent deux jours
// calendairement consécutifs (ex. Lun+Mar, très courant), et la Phase B de lissage efface alors
// "Vitesse max" au profit d'une séance générique — trouvé en prod sur un programme réel (Lun/Mar/
// Mer/Ven/Sam) où "Vitesse max" n'apparaissait plus jamais. Intercaler Renfo (palier facile) entre
// les deux évite la collision par construction plutôt que de compter sur le lissage pour rattraper
// le coup — même logique pour Circuit (facile) entre Endurance de vitesse et Tempo (tous deux
// palier modéré, même collision possible en fin de semaine).
const SPRINT_PRIORITY: Archetype[] = [SPRINT_ACCELERATION, SPRINT_RENFO, SPRINT_VITESSE_MAX, SPRINT_ENDURANCE_VITESSE, SPRINT_CIRCUIT, SPRINT_TEMPO];
function selectSprint(n: number): Archetype[] {
  // Cas n=2 à part : Accélération ET Vitesse max sont "absolument" requises même à seulement 2
  // jours/semaine (pas de place pour intercaler Renfo sans en sacrifier une des deux).
  if (n === 2) return [SPRINT_ACCELERATION, SPRINT_VITESSE_MAX];
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

// ---- Spécialisations powerlifting/haltérophilie : même vocabulaire d'exercices que la catégorie
// générique (PL_SQUAT/PL_BENCH/PL_DEADLIFT/HA_SNATCH/... déjà définis plus haut), mais une
// fréquence hebdomadaire clairement orientée vers le lift du titre du programme, plutôt que la
// rotation équilibrée générique — sinon un programme "Deadlift — Spécialisation" n'a jamais plus
// d'une séance de deadlift que n'importe quel autre programme powerlifting générique.
const SQUAT_SPEC_PATTERN: Archetype[] = [PL_SQUAT, PL_SQUAT, PL_BENCH, PL_SQUAT, PL_DEADLIFT, PL_SQUAT];
function selectSquatSpecialization(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => SQUAT_SPEC_PATTERN[i % SQUAT_SPEC_PATTERN.length]);
}
const BENCH_SPEC_PATTERN: Archetype[] = [PL_BENCH, PL_BENCH, PL_SQUAT, PL_BENCH, PL_DEADLIFT, PL_BENCH];
function selectBenchSpecialization(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => BENCH_SPEC_PATTERN[i % BENCH_SPEC_PATTERN.length]);
}
// Le plafond "deadlift ≤2/semaine" de la catégorie générique powerlifting (fatigue lombaire/SNC)
// ne s'applique volontairement pas ici : le principe même d'un bloc de spécialisation est
// d'augmenter délibérément la fréquence sur le lift en retard pendant quelques semaines
// (protocoles de spécialisation par fréquence, pratique connue) — la variation d'exercice
// (déficit, roumain, prise classique) gère la fatigue plutôt qu'un plafond de fréquence strict.
const DEADLIFT_SPEC_PATTERN: Archetype[] = [PL_DEADLIFT, PL_DEADLIFT, PL_SQUAT, PL_DEADLIFT, PL_BENCH, PL_DEADLIFT];
function selectDeadliftSpecialization(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => DEADLIFT_SPEC_PATTERN[i % DEADLIFT_SPEC_PATTERN.length]);
}
const SNATCH_SPEC_PATTERN: Archetype[] = [HA_SNATCH, HA_SNATCH, HA_CLEAN_JERK, HA_SNATCH, HA_LIGHT];
function selectSnatchSpecialization(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => SNATCH_SPEC_PATTERN[i % SNATCH_SPEC_PATTERN.length]);
}

// ---- Puissance & Explosivité : 1 séance Force, 1 séance Puissance (haltéro olympique dérivés :
// épaulé, arraché puissance, push press — pas les lifts complets de compétition), 2 séances
// Pliométrie, 1 séance Sprint — dans cet ordre de priorité décroissante. Renfo systématiquement
// en fin de chaque séance (baked dans chaque banque d'exercices, pas une séance à part).
const PUISSANCE_FORCE: Archetype = { name: "Force", type: "intensite", exercises: [
  "Back squat — 5×3@80%", "Développé couché — 5×3@80%", "Gainage complet — 3×40s",
]};
const PUISSANCE_PUISSANCE: Archetype = { name: "Puissance", type: "intensite", exercises: [
  "Épaulé — 4×3@70%", "Arraché puissance — 4×3@65%", "Push press — 4×4@65%", "Gainage complet — 3×40s",
]};
const PUISSANCE_PLYO: Archetype = { name: "Pliométrie", type: "intensite", exercises: [
  "Box jump — 4×5", "Sauts en contrebas (depth jump) — 4×5", "Bondissements — 4×20m", "Gainage complet — 3×40s",
]};
const PUISSANCE_SPRINT: Archetype = { name: "Sprint", type: "intensite", exercises: [
  "Départs blocs — 6×20m (récup 4 min)", "Sprint 30m — 5 reps", "Gainage complet — 3×40s",
]};
const PUISSANCE_PRIORITY: Archetype[] = [PUISSANCE_FORCE, PUISSANCE_PUISSANCE, PUISSANCE_PLYO, PUISSANCE_PLYO, PUISSANCE_SPRINT];
function selectPuissanceExplosivite(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => PUISSANCE_PRIORITY[i % PUISSANCE_PRIORITY.length]);
}

// ---- Perte de poids : varié plutôt que mono-modal — musculation (préserve la masse musculaire
// en déficit calorique) et cardio en alternance, 1 à 2× chacun selon le nombre de jours.
const PDP_MUSCU: Archetype = { name: "Musculation full-body", type: "volume", exercises: [
  "Squat — 4×10@65%", "Développé couché — 4×10@65%", "Tirage horizontal — 4×10@65%", "Gainage complet — 3×40s",
]};
const PDP_CARDIO: Archetype = { name: "Cardio", type: "intensite", exercises: [
  "Vélo ou rameur fractionné — 8×2 min effort / 1 min récup", "Circuit cardio : burpees + jumping jacks + mountain climbers — 4 tours",
]};
const PDP_PRIORITY: Archetype[] = [PDP_MUSCU, PDP_CARDIO, PDP_MUSCU, PDP_CARDIO];
function selectPertePoids(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => PDP_PRIORITY[i % PDP_PRIORITY.length]);
}

// ---- Fitness/CrossFit : un seul curriculum unifié (pas de split), priorité décroissante Force >
// Metcon/WOD > Gymnastique/Skill > Monostructural. Ordre interne à chaque séance (hors
// Monostructural, pur cardio) : force/skill en ouverture (fraîcheur), WOD/metcon en fin de
// séance (fatigue accumulée volontaire, comme un vrai cours CrossFit) — chaque archétype est
// donc un mini-format hybride, pas des jours "100% force" vs "100% metcon" séparés. Le "benchmark
// WOD" (Fran/Cindy/Murph/Grace) n'est pas un archétype à part — c'est le test forcé de fin de
// semaine MRV (voir EXERCISES.fitness.test), même mécanisme que le test forcé partout ailleurs.
const FITNESS_FORCE: Archetype = { name: "Force", type: "intensite", exercises: [
  "Back squat — 5×5@75%", "Développé militaire — 4×5@70%", "WOD finisher : 10-8-6-4-2 burpees + kettlebell swings",
]};
const FITNESS_METCON: Archetype = { name: "Metcon / WOD", type: "intensite", exercises: [
  "Gammes + activation — 10 min", "WOD For Time : 21-15-9 thrusters + tractions", "AMRAP 15 min : 5 pompes + 10 squats + 15 mountain climbers",
]};
const FITNESS_GYMNASTIQUE: Archetype = { name: "Gymnastique / Skill", type: "technique", exercises: [
  "Muscle-up progression : négatives + tirage — 5×3", "Handstand hold contre mur — 4×20s", "EMOM 10 min : 5 tractions strictes + 10 pompes",
]};
const FITNESS_MONOSTRUCTURAL: Archetype = { name: "Monostructural", type: "volume", exercises: [
  "Rameur continu — 30 min endurance", "Bike ou course fractionné — 10×1 min effort / 1 min récup",
]};
const FITNESS_PRIORITY: Archetype[] = [FITNESS_FORCE, FITNESS_METCON, FITNESS_GYMNASTIQUE, FITNESS_MONOSTRUCTURAL];
function selectFitness(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => FITNESS_PRIORITY[i % FITNESS_PRIORITY.length]);
}

// ---- Arts martiaux & combat : un seul curriculum unifié (pas de split par famille striking/
// grappling/mixte), priorité décroissante Technique > Sparring/Randori > Conditionnement > Force
// & Explosivité. Ordre interne à chaque séance de Sparring : technique/échauffement d'abord (la
// précision demande de la fraîcheur), sparring ensuite. Pas de plafond de fréquence sur le
// sparring (contrairement au deadlift powerlifting) — la fréquence suit naturellement le nombre
// de jours choisis (2 à 5/semaine en pratique), pas de contrainte artificielle à coder.
const COMBAT_TECHNIQUE: Archetype = { name: "Technique", type: "technique", exercises: [
  "Shadow boxing technique — 4×3 min", "Enchaînements techniques au sac — 5×3 min", "Travail au sol / projections technique (partenaire) — 20 min",
]};
const COMBAT_SPARRING: Archetype = { name: "Sparring / Randori", type: "intensite", exercises: [
  "Échauffement technique — 10 min", "Sparring / randori — 5×3 min (récup 1 min)", "Retour au calme + mobilité — 10 min",
]};
const COMBAT_CONDITIONNEMENT: Archetype = { name: "Conditionnement", type: "intensite", exercises: [
  "HIIT corde à sauter — 10×30s effort / 30s récup", "Circuit combat : sac + pompes + squats — 4 tours", "Sprints courts — 6×20m",
]};
// "volume" (pas "intensite") — force/explosivité générale (pas un lift de compétition, cf.
// convention MUSCU_* de la catégorie musculation) : évite aussi que 3 des 4 archétypes combat
// soient tous "durs" (voir sprint plus haut pour le bug que ça cause si adjacents).
const COMBAT_FORCE: Archetype = { name: "Force & Explosivité", type: "volume", exercises: [
  "Développé couché — 4×5@75%", "Squat ou fentes sautées — 4×6", "Médecine ball throws (puissance) — 4×8",
]};
const COMBAT_PRIORITY: Archetype[] = [COMBAT_TECHNIQUE, COMBAT_SPARRING, COMBAT_CONDITIONNEMENT, COMBAT_FORCE];
function selectCombat(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => COMBAT_PRIORITY[i % COMBAT_PRIORITY.length]);
}

// ---- Hyrox : distinct de "fitness"/CrossFit générique — format de course fixe (8km course + 8
// stations : SkiErg, sled push/pull, burpee broad jumps, row, farmers carry, sandbag lunges,
// wall balls). 4 jours demandés explicitement : 2 cardio (course + machines, pour varier les
// modalités et couvrir 2 des 8 stations directement), 1 renfo spécifique aux stations, 1
// simulation de course. "Renfo Stations" classé "volume" (pas "intensite", travail de stations à
// effort géré, pas un 1RM) pour éviter que Cardio Machines et Renfo soient tous les deux au
// palier dur et adjacents dans la rotation.
const HYROX_CARDIO_COURSE: Archetype = { name: "Cardio Course", type: "volume", exercises: [
  "Endurance fondamentale course — 40 min", "Fractionné 1km allure course — 5×1km (récup 3 min)",
]};
// Révisé pour matcher exactement les 4 séances décrites sur la page WordPress du programme
// ("endurance fonctionnelle, force et conditioning, simulation de stations, et run long") —
// remplace l'ancien découpage "Cardio Course/Cardio Machines/Renfo Stations/Simulation" qui
// n'était pas fidèle à ce qui est promis sur la page produit.
const HYROX_ENDURANCE_FONCTIONNELLE: Archetype = { name: "Endurance fonctionnelle", type: "volume", exercises: [
  "Course continue — 20 min", "SkiErg ou rameur — 15 min", "Circuit fonctionnel léger : farmers carry + wall balls — 3 tours",
]};
const HYROX_FORCE_CONDITIONING: Archetype = { name: "Force + Conditioning", type: "intensite", exercises: [
  "Sled push — 4×20m", "Sled pull — 4×20m", "Wall balls — 4×20", "Burpee broad jumps — 4×15m", "Farmers carry — 4×50m",
]};
const HYROX_SIMULATION: Archetype = { name: "Simulation de stations", type: "test", exercises: [
  "Simulation Hyrox : 1km course + 1 station (rotation) — 4 tours", "Simulation Hyrox courte : 2×(1km course + wall balls + sled push)",
]};
const HYROX_RUN_LONG: Archetype = { name: "Run long", type: "volume", exercises: [
  "Course continue endurance — 45-60 min",
]};
const HYROX_PRIORITY: Archetype[] = [HYROX_ENDURANCE_FONCTIONNELLE, HYROX_FORCE_CONDITIONING, HYROX_SIMULATION, HYROX_RUN_LONG];
function selectHyrox(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => HYROX_PRIORITY[i % HYROX_PRIORITY.length]);
}

// ---- Saut en longueur & hauteur : 4 séances nommées exactement comme sur la page WordPress du
// programme ("piste et sauts complets", "pliométrie spécifique", "technique de vol/approche",
// "préparation physique musculaire"). Chaîne causale du saut : vitesse d'approche → impulsion →
// angle de décollage → technique de vol — chaque maillon a sa séance dédiée avant d'être intégré
// dans "Piste et sauts complets".
const SAUTS_PISTE_COMPLETS: Archetype = { name: "Piste et sauts complets", type: "intensite", exercises: [
  "Course d'élan complète (7-9 appuis) + saut — 5 sauts", "Impulsion à pleine vitesse — 4 sauts",
]};
const SAUTS_PLIOMETRIE: Archetype = { name: "Pliométrie spécifique", type: "intensite", exercises: [
  "Sauts en contrebas (depth jump) — 4×5", "Multibonds : foulées bondissantes — 4×30m", "Squat jump chargé — 4×5",
]};
const SAUTS_TECHNIQUE_VOL: Archetype = { name: "Technique de vol / approche", type: "technique", exercises: [
  "Décomposition du geste : approche + pose de pied — 4×3", "Éducatifs de saut : cloche-pied, foulées bondissantes — 3×20m", "Course d'élan isolée (sans saut) — 6 reps",
]};
const SAUTS_PPG: Archetype = { name: "PPG musculaire", type: "volume", exercises: [
  "Squat — 4×6@75%", "Fentes — 3×10 par jambe", "Renforcement mollets — 3×15", "Gainage complet — 3×40s",
]};
const SAUTS_PRIORITY: Archetype[] = [SAUTS_PISTE_COMPLETS, SAUTS_PLIOMETRIE, SAUTS_TECHNIQUE_VOL, SAUTS_PPG];
function selectAthletismeSauts(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => SAUTS_PRIORITY[i % SAUTS_PRIORITY.length]);
}

// ---- Aviron : 3 séances nommées Lun/Mer/Ven exactement comme sur la page WordPress ("Technique
// rameur et séquence", "Force de tirage et jambes (soulevé de terre, tirages)", "Endurance
// aérobie ou intervalles de puissance selon la phase").
const AVIRON_TECHNIQUE: Archetype = { name: "Technique rameur", type: "technique", exercises: [
  "Rameur technique : focus séquence jambes-dos-bras — 20 min", "Drill par segments (jambes seules / dos seul / bras seuls) — 15 min",
]};
const AVIRON_FORCE_TIRAGE: Archetype = { name: "Force de tirage", type: "intensite", exercises: [
  "Soulevé de terre — 5×5@75%", "Tirage horizontal — 4×8@70%", "Tirage vertical — 4×8@70%", "Gainage anti-flexion — 3×40s",
]};
const AVIRON_ENDURANCE_PUISSANCE: Archetype = { name: "Endurance & Puissance", type: "volume", exercises: [
  "Rameur endurance continue — 30 min", "Rameur intervalles : 6×500m (récup 2 min)",
]};
const AVIRON_PRIORITY: Archetype[] = [AVIRON_TECHNIQUE, AVIRON_FORCE_TIRAGE, AVIRON_ENDURANCE_PUISSANCE];
function selectAviron(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => AVIRON_PRIORITY[i % AVIRON_PRIORITY.length]);
}

// ---- Triathlon : 3 disciplines + brick (vélo+course enchaînés), comme décrit sur la page
// WordPress ("3 blocs : base sem1-4 / développement sem5-9 avec bricks / affûtage sem10-12").
const TRI_NATATION: Archetype = { name: "Natation", type: "volume", exercises: [
  "Nage continue 4 nages — 1500m", "Natation technique : catch-up crawl — 4×50m",
]};
const TRI_VELO: Archetype = { name: "Vélo", type: "volume", exercises: [
  "Sortie vélo endurance Z2 — 60-90 min", "Fractionné vélo : 6×4 min à 105% FTP (récup 3 min)",
]};
// 2 versions de "Course à pied" : avec renfo appendu (≤4 jours — les 4 slots Natation/Vélo/Course/
// Brick sont déjà tous pris par le squelette documenté sur la page WordPress, pas de place pour
// un 5e archétype dédié sans sacrifier une discipline) et sans (≥5 jours, où un vrai jour Renfo
// devient possible). Seuil différent de la règle générale (≤3/≥4) donnée par Gildas car le
// triathlon a déjà 4 slots "core" occupés — adaptation délibérée, pas un oubli de la règle.
const TRI_COURSE: Archetype = { name: "Course à pied", type: "volume", exercises: [
  "Sortie course endurance fondamentale — 45 min", "Fractionné course : 6×1000m allure 10k (récup 2 min)",
]};
const TRI_COURSE_RENFO: Archetype = { name: "Course à pied", type: "volume", exercises: [
  "Sortie course endurance fondamentale — 45 min", "Fractionné course : 6×1000m allure 10k (récup 2 min)",
  "Renforcement général : squat + gainage + tirage — 3×10",
]};
const TRI_BRICK: Archetype = { name: "Brick (vélo + course)", type: "intensite", exercises: [
  "Brick : vélo 30 min + course 15 min enchaînés",
]};
const TRI_RENFO: Archetype = { name: "Renfo", type: "technique", exercises: [
  "Renforcement général : squat + gainage + tirage — 3×10", "Gainage complet — 3×40s",
]};
const TRI_LOW_FREQ: Archetype[] = [TRI_NATATION, TRI_VELO, TRI_COURSE_RENFO, TRI_BRICK];
const TRI_HIGH_FREQ: Archetype[] = [TRI_NATATION, TRI_VELO, TRI_COURSE, TRI_BRICK, TRI_RENFO];
function selectTriathlon(n: number): Archetype[] {
  const list = n <= 4 ? TRI_LOW_FREQ : TRI_HIGH_FREQ;
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}

// ---- Calisthenics : 4 archétypes, correspondant exactement à la page WordPress — badge "4
// séances/sem" + stat "4 Séances par semaine" EXPLICITES, en plus des 3 patterns fondamentaux
// cités dans le texte ("Pousser, tirer, porter — les patterns fondamentaux") et de la progression
// muscle-up mise en avant dans une FAQ dédiée ("Peut-on apprendre le muscle-up en 8 semaines ?").
// Skill (muscle-up/front lever) est donc bien le 4e archétype voulu, pas un ajout arbitraire.
// Gainage intégré à CHAQUE séance ("le gainage est la base de toutes les progressions avancées"),
// jamais de séance "Gainage" à part. Pas de doublage artificiel de Tractions (1er essai —
// provoquait des remplacements Phase B dès que Lundi+Mardi étaient calendairement consécutifs).
// Muscle-up/tractions lestées gardés dans Tirer AUSSI (pas seulement Skill) : garantit une trace
// de la progression muscle-up même pour un utilisateur in-app qui choisirait moins de 4 jours,
// où Skill (position 3 d'une liste de 4) ne serait pas atteint par la sélection modulo.
// ATTENTION reachability : Skill n'est réellement affiché que si le programme utilise bien 4 jours
// (ou plus) — voir le fix du jeu de données ci-dessous, le vrai bug n'était pas dans cette liste
// mais dans le champ `days` du programme "Calisthenics — Tractions et Force 8 Semaines" en base
// (3 jours, Lun/Mer/Sam, alors que la page WP en promet 4) : un précédent essai avait supprimé
// Skill au lieu de corriger `days`, sur la base d'une hypothèse fausse (le nombre de jours en base
// faisait foi) jamais vérifiée contre la page WordPress elle-même — trouvé par Gildas.
const CALI_TIRER: Archetype = { name: "Tirer", type: "volume", exercises: [
  "Tractions strictes — 5×6", "Tractions lestées (progression) — 4×4", "Muscle-up ou progression muscle-up (chest-to-bar, false grip) — 4×3", "Gainage en suspension (hollow body) — 3×20s",
]};
const CALI_POUSSER: Archetype = { name: "Pousser", type: "volume", exercises: [
  "Dips — 5×8", "Dips en anneau (progression) — 4×6", "Pompes archer (unilatérales) — 4×6 par côté", "Gainage : planche — 3×30s",
]};
const CALI_PORTER: Archetype = { name: "Porter", type: "technique", exercises: [
  "L-sit ou tuck-sit tenu — 4×15-20s", "Squat pistol assisté — 3×6 par jambe", "Gainage latéral — 3×25s par côté",
]};
const CALI_SKILL: Archetype = { name: "Skill", type: "intensite", exercises: [
  "Muscle-up ou progression muscle-up (chest-to-bar, false grip) — 5×3", "Front lever tenu (progression) — 4×10s", "Gainage complet — 3×30s",
]};
const CALI_PRIORITY: Archetype[] = [CALI_TIRER, CALI_POUSSER, CALI_PORTER, CALI_SKILL];
function selectCalisthenics(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => CALI_PRIORITY[i % CALI_PRIORITY.length]);
}

// ---- Gymnastique : 3 séances nommées Lun/Mer/Ven exactement comme sur la page WordPress
// ("Gainage et placement (ATR, suspension)", "Force relative (tractions, dips, L-sit)",
// "Pliométrie et réception").
const GYM_GAINAGE_PLACEMENT: Archetype = { name: "Gainage et placement", type: "technique", exercises: [
  "ATR contre mur — 4×20-30s", "Placement bassin en suspension (hollow body) — 4×15s", "Mobilité épaules et poignets — 10 min",
]};
const GYM_FORCE_RELATIVE: Archetype = { name: "Force relative", type: "intensite", exercises: [
  "Tractions strictes — 4×6", "Dips — 4×8", "L-sit ou tuck-sit tenu — 4×15-20s",
]};
const GYM_PLIOMETRIE_RECEPTION: Archetype = { name: "Pliométrie et réception", type: "volume", exercises: [
  "Sauts groupés + réceptions contrôlées — 4×6", "Technique de réception de saut — 4×6", "Handstand hold contre mur — 4×20s",
]};
const GYM_PRIORITY: Archetype[] = [GYM_GAINAGE_PLACEMENT, GYM_FORCE_RELATIVE, GYM_PLIOMETRIE_RECEPTION];
function selectGymnastique(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => GYM_PRIORITY[i % GYM_PRIORITY.length]);
}

// ---- Course à pied par distance : mêmes noms de séance que la catégorie "endurance" générique
// (Endurance fondamentale/Seuil/Sortie longue/Fractionné/Renfo/Récupération active), mais
// exercices tirés des banques EXERCISES.endurance_10k/semi/marathon (distances/durées ajustées à
// la distance cible), avec les jours et durées de sortie longue donnés par les pages WordPress
// respectives (10k : 35→55 min ; semi : 35-50 min Z2, sortie longue 50-100 min ; marathon :
// 40-60 min Z2, sortie longue 70-150 min, 5 séances/semaine).
// Même règle que la catégorie "endurance" générique : Renfo dédié à partir de 4 jours/semaine,
// appendu en fin de séance "Endurance fondamentale" en dessous (≤3 jours, la fréquence typique
// de ces programmes selon les pages WordPress : 4 séances/semaine pour 10k/semi, 5 pour marathon
// — donc la plupart des sélections utilisateur réelles restent sous le seuil "dédié").
const DISTANCE_RENFO_LINES = ["Renforcement : mollets + squats + fentes — 3×12", "Gainage complet — 3×45s"];
// Le squelette WordPress de ces programmes (10k/semi : Zone2/Seuil/Récup/Sortie longue, 4
// séances ; marathon : +1 Zone2 plus long) occupe déjà 4 slots sans laisser de place pour un 5e
// archétype Renfo dédié tant qu'on veut rester fidèle à ce squelette documenté — même contrainte
// structurelle que le triathlon (4 slots "core" déjà pris). Seuil aligné sur celui du triathlon :
// Renfo appendu à "Endurance fondamentale" pour n≤4, dédié seulement à partir de n≥5 (où il
// devient reachable par le cycle modulo sans écarter une des 4 séances du squelette WP).
function buildDistanceEnduranceArchetypes(bank: Record<SessionType, string[]>, n: number): Archetype[] {
  const fondamentale: Archetype = n <= 4
    ? { name: "Endurance fondamentale", type: "volume", exercises: [...bank.volume.slice(0, 1), ...DISTANCE_RENFO_LINES] }
    : { name: "Endurance fondamentale", type: "volume", exercises: bank.volume.slice(0, 1) };
  const list: Archetype[] = [
    fondamentale,
    { name: "Seuil", type: "intensite", exercises: bank.intensite.slice(2, 4) },
    { name: "Récupération active", type: "recuperation", exercises: bank.recuperation },
    { name: "Sortie longue", type: "volume", exercises: bank.volume.slice(1, 2) }, // index 1 : la longue, distincte du Z2 quotidien
  ];
  if (n > 4) {
    list.push({ name: "Renfo", type: "technique", exercises: DISTANCE_RENFO_LINES });
    list.push({ name: "Fractionné", type: "intensite", exercises: bank.intensite.slice(0, 2) });
  }
  return list;
}
function selectEndurance10k(n: number): Archetype[] {
  const list = buildDistanceEnduranceArchetypes(EXERCISES.endurance_10k, n);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}
function selectEnduranceSemi(n: number): Archetype[] {
  const list = buildDistanceEnduranceArchetypes(EXERCISES.endurance_semi, n);
  return Array.from({ length: n }, (_, i) => list[i % list.length]);
}
function selectEnduranceMarathon(n: number): Archetype[] {
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
const CHEVILLE_PROPRIOCEPTION: Archetype = { name: "Proprioception", type: "technique", exercises: [
  "Proprioception unipodale sur sol stable — 4×30s par jambe", "Proprioception sur plateau instable — 4×30s par jambe", "Marche sur pointes puis talons — 3×20m",
]};
const CHEVILLE_RENFORCEMENT: Archetype = { name: "Renforcement péroniers", type: "volume", exercises: [
  "Isométrie chevilles : éverseurs/inverseurs contre résistance — 4×20s", "Montées sur pointes — 3×15", "Mobilité cheville : flexion dorsale contre mur — 3×10",
]};
const CHEVILLE_PRIORITY: Archetype[] = [CHEVILLE_PROPRIOCEPTION, CHEVILLE_RENFORCEMENT];
function selectReeducationCheville(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => CHEVILLE_PRIORITY[i % CHEVILLE_PRIORITY.length]);
}

// Coiffe des rotateurs : 4 muscles ciblés (sus-épineux, sous-épineux, petit rond, sous-scapulaire)
// — regroupés en 3 séances par fonction (rotation externe/interne, stabilité scapulaire),
// élastiques progressifs.
const EPAULE_ROTATION_EXTERNE: Archetype = { name: "Rotation externe", type: "technique", exercises: [
  "Isométrie rotateurs externes (coude au corps) — 4×15s", "Rotation externe élastique léger — 3×15",
]};
const EPAULE_ROTATION_INTERNE: Archetype = { name: "Rotation interne", type: "technique", exercises: [
  "Isométrie rotateurs internes — 4×15s", "Rotation interne élastique léger — 3×15",
]};
const EPAULE_STABILITE_SCAPULAIRE: Archetype = { name: "Stabilité scapulaire", type: "volume", exercises: [
  "Rétraction/protraction scapulaire — 3×12", "Y-T-W au sol — 3×10 chaque", "Mobilité thoracique — 10 min",
]};
const EPAULE_PRIORITY: Archetype[] = [EPAULE_ROTATION_EXTERNE, EPAULE_ROTATION_INTERNE, EPAULE_STABILITE_SCAPULAIRE];
function selectReeducationEpaule(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => EPAULE_PRIORITY[i % EPAULE_PRIORITY.length]);
}

// Valgus du genou : correction du schéma de mouvement (activation fessiers + contrôle visuel de
// l'alignement genou-pied), distinct du Syndrome Rotulien (douleur) et du Post-LCA (chirurgie).
const GENOU_ACTIVATION_FESSIERS: Archetype = { name: "Activation fessiers", type: "technique", exercises: [
  "Pont fessier — 3×12", "Clamshell — 3×15 par côté", "Band walk latéral — 3×10 par côté",
]};
const GENOU_CONTROLE_ALIGNEMENT: Archetype = { name: "Contrôle de l'alignement", type: "volume", exercises: [
  "Squat face à un miroir, focus alignement genou-pied — 3×10", "Step-down contrôlé face miroir — 3×10 par jambe", "Wall sit — 4×20s",
]};
const GENOU_PRIORITY: Archetype[] = [GENOU_ACTIVATION_FESSIERS, GENOU_CONTROLE_ALIGNEMENT];
function selectReeducationGenou(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => GENOU_PRIORITY[i % GENOU_PRIORITY.length]);
}

// Syndrome rotulien : 3 séances nommées A/B/C exactement comme sur la page WordPress.
const ROTULIEN_EXCENTRIQUE_QUAD: Archetype = { name: "Excentrique quadriceps", type: "technique", exercises: [
  "Squat partiel (90° ou moins) — 4×10", "Step-down excentrique lent — 3×8 par jambe", "Wall sit — 4×20s",
]};
const ROTULIEN_RENFORCEMENT_FESSIERS: Archetype = { name: "Renforcement fessiers", type: "volume", exercises: [
  "Clamshell — 3×15 par côté", "Pont fessier — 3×15", "Band walk latéral — 3×12",
]};
const ROTULIEN_INTEGRATION: Archetype = { name: "Intégration fonctionnelle", type: "volume", exercises: [
  "Squat progressif (si douleur <3/10) — 3×10", "Fentes contrôlées — 3×10 par jambe", "Équilibre unipodal dynamique — 4×20s",
]};
const ROTULIEN_PRIORITY: Archetype[] = [ROTULIEN_EXCENTRIQUE_QUAD, ROTULIEN_RENFORCEMENT_FESSIERS, ROTULIEN_INTEGRATION];
function selectReeducationRotulien(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => ROTULIEN_PRIORITY[i % ROTULIEN_PRIORITY.length]);
}

// Lombalgie : 3 séances nommées A/B/C exactement comme sur la page WordPress.
const LOMBALGIE_GAINAGE_PROFOND: Archetype = { name: "Gainage profond", type: "technique", exercises: [
  "Bird-dog contrôlé — 3×10 par côté", "Dead bug — 3×10 par côté", "Respiration diaphragmatique — 10 min",
]};
const LOMBALGIE_MOBILITE: Archetype = { name: "Mobilité lombaire et hanche", type: "technique", exercises: [
  "Bascule du bassin — 3×12", "Mobilité hanches (rotation, flexion) — 10 min", "Étirements chaîne postérieure doux — 10 min",
]};
const LOMBALGIE_RENFORCEMENT: Archetype = { name: "Renforcement intégré", type: "volume", exercises: [
  "Planche — 4×20s", "Romanian deadlift charge légère — 3×10", "Superman contrôlé — 3×12",
]};
const LOMBALGIE_PRIORITY: Archetype[] = [LOMBALGIE_GAINAGE_PROFOND, LOMBALGIE_MOBILITE, LOMBALGIE_RENFORCEMENT];
function selectReeducationLombalgie(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => LOMBALGIE_PRIORITY[i % LOMBALGIE_PRIORITY.length]);
}

// Post-LCA : 4 phases sur 16 semaines (activation neuromusculaire, force progressive avec Nordic
// Hamstring, pliométrie débutante, retour sport progressif) — approximées par rotation par bloc
// (rotationAnchor) plutôt qu'un modèle de périodisation dédié supplémentaire, voir EXERCISES.
const LCA_ACTIVATION: Archetype = { name: "Activation neuromusculaire", type: "technique", exercises: [
  "Contraction isométrique quadriceps — 4×10s", "Mobilité genou passive — 10 min", "Proprioception bipodale — 4×20s",
]};
const LCA_FORCE: Archetype = { name: "Force progressive", type: "volume", exercises: [
  "Presse à cuisses — 3×15", "Nordic Hamstring Exercise assisté — 3×6", "Pont fessier — 3×15",
]};
const LCA_PLIOMETRIE: Archetype = { name: "Pliométrie débutante", type: "intensite", exercises: [
  "Sauts amortis bipodaux contrôlés — 3×6", "Squat unipodal contrôlé — 3×8 par jambe", "Nordic Hamstring Exercise — 4×8",
]};
const LCA_RETOUR_SPORT: Archetype = { name: "Retour sport progressif", type: "intensite", exercises: [
  "Course en ligne droite progressive — 15 min", "Hop test unipodal contrôlé — 3×5 par jambe", "Renforcement quadriceps chargé — 3×10",
]};
const LCA_PRIORITY: Archetype[] = [LCA_ACTIVATION, LCA_FORCE, LCA_PLIOMETRIE, LCA_RETOUR_SPORT];
function selectReeducationLca(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => LCA_PRIORITY[i % LCA_PRIORITY.length]);
}

// Tendon d'Achille : protocole Alfredson (excentrique mollet) en séance principale, renforcement
// et retour course en complément.
const ACHILLE_EXCENTRIQUE: Archetype = { name: "Excentrique (Alfredson)", type: "technique", exercises: [
  "Excentrique mollet genou tendu — 3×15", "Excentrique mollet genou fléchi — 3×15",
]};
const ACHILLE_RENFORCEMENT: Archetype = { name: "Renforcement mollet", type: "volume", exercises: [
  "Montées sur pointes unipodales — 3×12 par jambe", "Isométrie mollet — 4×25s",
]};
const ACHILLE_RETOUR_COURSE: Archetype = { name: "Retour course", type: "volume", exercises: [
  "Course progressive courte (si douleur <4/10) — 10-15 min", "Vélo ou natation sans impact — 15 min",
]};
const ACHILLE_PRIORITY: Archetype[] = [ACHILLE_EXCENTRIQUE, ACHILLE_RENFORCEMENT, ACHILLE_RETOUR_COURSE];
function selectReeducationAchille(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => ACHILLE_PRIORITY[i % ACHILLE_PRIORITY.length]);
}

// Périostite tibiale : 0 course les 2 premières semaines (règle explicite WordPress) —
// renforcement tibial antérieur + cross-training sans impact, puis marche-course progressive.
const PERIOSTITE_RENFORCEMENT: Archetype = { name: "Renforcement tibial antérieur", type: "technique", exercises: [
  "Flexion dorsale résistée — 4×15", "Mobilité cheville — 3×10",
]};
const PERIOSTITE_CROSS_TRAINING: Archetype = { name: "Cross-training sans impact", type: "volume", exercises: [
  "Vélo ou natation sans impact — 20-25 min", "Renforcement mollets et pied — 3×12",
]};
const PERIOSTITE_MARCHE_COURSE: Archetype = { name: "Marche-course progressive", type: "volume", exercises: [
  "Marche-course (ratio 1:2) — 20 min", "Course continue légère (si douleur absente) — 15-20 min",
]};
const PERIOSTITE_PRIORITY: Archetype[] = [PERIOSTITE_RENFORCEMENT, PERIOSTITE_CROSS_TRAINING, PERIOSTITE_MARCHE_COURSE];
function selectReeducationPeriostite(n: number): Archetype[] {
  return Array.from({ length: n }, (_, i) => PERIOSTITE_PRIORITY[i % PERIOSTITE_PRIORITY.length]);
}

const SPORT_CURRICULUM: Partial<Record<SportCategory, (dayCount: number) => Archetype[]>> = {
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

// ---- Faiblesses : biais de génération sur 2 niveaux (2026-08-05).
// Niveau 2 (universel, tous les sports) : une ligne d'exercice supplémentaire ajoutée à LA séance
// de la semaine dont le type correspond le mieux à la faiblesse (typeHints, liste ordonnée de
// types acceptables plutôt qu'un seul) — sûr par construction, ne modifie jamais l'équilibre des
// jours choisis par l'utilisateur, marche même sans curriculum.
// BUG TROUVÉ ET CORRIGÉ (typeHint unique au lieu d'une liste) : avec la config par défaut de la
// modale (3 jours, curriculum) les types de la semaine sont presque toujours technique/volume/
// intensite — "recuperation" en particulier n'apparaît quasiment jamais à ces fréquences (c'est un
// type de remplissage FOCUS_DIST, pas un type que les curriculums sportifs programment à 3
// jours/semaine). Un typeHint unique = "recuperation" ne trouvait donc JAMAIS de jour à modifier
// pour n'importe quelle faiblesse de récupération, quel que soit le sport — silencieusement aucun
// effet visible, trouvé en testant les 5 combos les plus probables (config par défaut de la
// modale) plutôt qu'en supposant que "ça doit marcher". Remplacé par une liste de types acceptables
// par ordre de préférence, avec un dernier repli garanti (le 1er jour non forcé de la semaine) si
// aucun des types préférés n'est présent — un effet imparfaitement placé reste toujours préférable
// à aucun effet du tout.
// Niveau 1 (sports à curriculum splitté par groupe musculaire/mouvement — powerlifting/musculation/
// halterophilie uniquement, pas leurs spécialisations par titre qui skewent déjà volontairement
// vers un lift) : bump de fréquence RÉEL, mais seulement sur un "slot de répétition" (tout index
// où l'archétype cyclé est un doublon d'un archétype déjà apparu plus tôt dans la semaine) — jamais
// sur le premier passage de chaque archétype, pour ne jamais faire disparaître un mouvement
// essentiel (ex. impossible de faire disparaître Deadlift d'un programme powerlifting à 3 jours,
// où chaque lift n'apparaît qu'une fois). Si aucun slot de répétition n'existe (peu de jours
// choisis), le niveau 1 ne s'applique simplement pas cette semaine-là — dégradation naturelle vers
// le niveau 2 seul, aucun cas particulier à coder par nombre de jours. Les collisions RPE
// éventuellement introduites par ce remplacement sont absorbées par les Phases A2/B universelles
// exactement comme pour n'importe quel autre archétype de curriculum.
export interface WeaknessMeta { extraLine: string; typeHints: SessionType[] }
const WEAKNESS_META: Record<string, WeaknessMeta> = {
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

const WEAKNESS_ARCHETYPE_L1: Partial<Record<SportCategory, Record<string, Archetype>>> = {
  powerlifting: { jambes: PL_SQUAT, dos_bras: PL_DEADLIFT, pecs_epaules: PL_BENCH },
  musculation: { jambes: MUSCU_JAMBES, dos: MUSCU_DOS, pectoraux: MUSCU_PECTORAUX, epaules: MUSCU_EPAULES, bras: MUSCU_BRAS },
  halterophilie: { arrache: HA_SNATCH, epaule_jete: HA_CLEAN_JERK },
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
  const { sport, level, days, duration, focus, weaknesses, customExercises, customWeaknessMeta, customSessionLabels } = body as {
    sport: string;
    level: ProgramLevel;
    days: string[];
    duration: 4 | 6 | 8 | 12 | 16;
    focus: ProgramFocus;
    weaknesses?: string[];
    // Sport libre non couvert par un curriculum (2026-08-06, /api/sports/custom) — vocabulaire
    // généré par Claude pour ce sport précis, injecté à la place de EXERCISES.autre/WEAKNESS_META
    // pour cette seule requête. Le moteur de périodisation (blocs, plafonds RPE, Phase A2/B) ne
    // change jamais — voir buildNotes()/Phase C plus bas pour le point d'injection exact.
    customExercises?: Record<SessionType, string[]>;
    customWeaknessMeta?: Record<string, WeaknessMeta>;
    // Libellés de séance par discipline de prépa physique (2026-08-07, même origine que
    // customExercises) — ex. "Circuit Training"/"Sprints"/"Renfo spécifique" au lieu du générique
    // "Séance volume"/"Travail d'intensité". Reste du vocabulaire pur (un nom affiché), jamais une
    // décision de structure — voir selectAutreTypes() plus haut pour ce qui décide le nombre de
    // jours de chaque type, indépendant de ce libellé.
    customSessionLabels?: Partial<Record<SessionType, string>>;
  };

  const validDuration = duration === 6 || (duration > 0 && duration % 4 === 0);
  if (!level || !days?.length || !duration || !focus || !validDuration) {
    return Response.json({ error: "Paramètres manquants ou durée invalide (6 semaines, ou un multiple de 4)" }, { status: 400 });
  }
  const selectedWeaknesses = (weaknesses ?? []).slice(0, 2); // max 2 côté UI, plafonné aussi ici

  const category = getSportCategory(sport ?? "");
  const moderateOnly = category.startsWith("reeducation_");
  const focusDist = moderateOnly ? FOCUS_DIST_REEDUCATION : (FOCUS_DIST[focus] ?? FOCUS_DIST.autre);
  const baseDiff = LEVEL_BASE_DIFF[level] ?? 6;
  // Tri calendaire — nécessaire pour détecter des jours réellement consécutifs (ex. Lun+Mar)
  // plutôt que des jours simplement proches dans le tableau soumis par l'appelant.
  const sortedDays = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const weekSpecs = buildWeekSpecs(duration, baseDiff, focus);

  const weeks: WeekTemplate[] = [];
  // Dernier jour d'entraînement de la semaine précédente — nécessaire pour la Phase B
  // inter-semaines (voir plus bas) : sans ça, Phase A2/B ne comparent les jours qu'AU SEIN d'une
  // même semaine, jamais à la frontière entre deux semaines (ex. Dimanche de la semaine N et
  // Lundi de la semaine N+1, réellement consécutifs si Dimanche est un jour d'entraînement).
  let previousWeekLastDay: { type: SessionType; calIdx: number } | null = null;

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
    // "Autre" (sport libre sans curriculum) : ratio technique/prépa déterministe par nombre de
    // jours (selectAutreTypes), pas la rotation FOCUS_DIST générique partagée avec cyclisme/
    // natation/ski/trail/rééducation générale — ceux-là gardent FOCUS_DIST inchangé.
    const autreTypes = category === "autre" ? selectAutreTypes(sortedDays.length) : null;
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
      } else if (autreTypes) {
        type = autreTypes[dayIdx];
      } else {
        const typeIdx = (rotationAnchor * sortedDays.length + dayIdx) % focusDist.length;
        type = focusDist[typeIdx];
      }
      return { day, dayIdx, calIdx: DAY_ORDER.indexOf(day), type, forced, archetypeName, exercises };
    });

    // Faiblesses, niveau 1 — appliqué ICI (sur dayPlans, après avoir calculé calIdx), pas sur le
    // tableau abstrait d'archétypes. RAISON : pour powerlifting/musculation/halterophilie, TOUS
    // les archétypes d'un même sport partagent le même SessionType (ex. Squat/Bench/Deadlift sont
    // tous "intensite") — donc qu'un jour soit écrasé par la Phase B (collision RPE) ne dépend QUE
    // de son adjacence calendaire à un autre jour sélectionné, jamais de quel archétype précis y
    // est assigné. Appliquer le biais sur le premier "slot de répétition" trouvé dans l'ordre du
    // tableau (comme le 1er essai) revenait à un choix arbitraire de jour, potentiellement déjà
    // condamné à être écrasé quel que soit son contenu — invisible pour l'utilisateur, bug réel
    // trouvé en testant plusieurs configurations de jours réalistes (pas juste celle qui marchait).
    // Fix : ne cible plus le 1er slot de répétition trouvé, mais le 1er slot de répétition dont le
    // jour calendaire n'est adjacent à AUCUN autre jour sélectionné — garantit que la Phase B qui
    // suit ne l'écrasera jamais. Si aucun slot de répétition n'est à la fois libre ET calendairement
    // isolé, le niveau 1 ne s'applique simplement pas cette semaine — dégradation gracieuse vers le
    // niveau 2 seul, plutôt qu'un biais appliqué en pure perte.
    if (selectedWeaknesses.length) {
      const l1Table = WEAKNESS_ARCHETYPE_L1[category];
      if (l1Table) {
        // Vrai seulement si ce jour précis est la toute première apparition de son archétype dans
        // dayPlans — les occurrences suivantes du même nom restent réassignables sans jamais faire
        // disparaître le tout premier passage d'un mouvement essentiel.
        const isFirstOccurrence = (d: (typeof dayPlans)[number]) =>
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
    // "moderateOnly" : "ouvrir la semaine sur quelque chose de substantiel" est une heuristique de
    // performance, à l'opposé du principe même de la rééducation (rester prudent, ne jamais forcer
    // en intensité) — Phase A2 désactivée pour ces catégories, contrairement au reste des règles
    // universelles qui s'appliquent partout ailleurs.
    if (!moderateOnly && dayPlans.length > 0 && !dayPlans[0].forced && RPE_BUCKET[dayPlans[0].type] === "easy") {
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
        // déjà pris par les voisins. moderateOnly (rééducation) : jamais "intensite"/"test" comme
        // candidat, même en cas de collision easy-easy — "volume" directement en priorité.
        const orderedCandidates: SessionType[] = moderateOnly
          ? ["volume", "recuperation", "technique"]
          : keepBucket === "hard" ? ["recuperation", "technique", "volume"]
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

    // Phase B inter-semaines — même règle universelle que la Phase B ci-dessus, mais appliquée à
    // la frontière entre deux semaines plutôt qu'à l'intérieur d'une seule. Ne se déclenche que
    // si Dimanche (dernier jour possible, calIdx 6) était un jour d'entraînement de la semaine
    // précédente ET que Lundi (calIdx 0) l'est aussi cette semaine-ci — les deux seuls jours
    // réellement consécutifs à travers une frontière de semaine. Cas concret trouvé en prod : fin
    // de semaine MRV forcée en "test" (Dimanche) suivie du premier jour de la semaine Deload
    // suivante, forcé "non-facile" par la Phase A2 — les deux jours atterrissent dans le palier
    // "dur", jamais comparés l'un à l'autre puisque chaque semaine était traitée isolément.
    // Ne touche jamais le dernier jour de la semaine précédente (déjà finalisé, potentiellement
    // un test forcé délibéré) — corrige uniquement le premier jour de la semaine courante.
    if (previousWeekLastDay && previousWeekLastDay.calIdx === 6 && dayPlans[0]?.calIdx === 0 &&
        RPE_BUCKET[previousWeekLastDay.type] === RPE_BUCKET[dayPlans[0].type]) {
      const keepBucket = RPE_BUCKET[previousWeekLastDay.type];
      const otherNeighbor = dayPlans[1];
      const avoidBuckets = new Set([keepBucket, otherNeighbor ? RPE_BUCKET[otherNeighbor.type] : null].filter(Boolean));
      const orderedCandidates: SessionType[] = moderateOnly
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

    // Faiblesses, niveau 2 — une ligne d'exercice ajoutée à la séance de la semaine dont le type
    // correspond le mieux à chaque faiblesse choisie, en essayant chaque type de typeHints dans
    // l'ordre. Garantie d'effet visible : si aucun des types préférés n'est présent cette
    // semaine-là, repli sur le 1er jour non forcé plutôt qu'aucun ajout — un effet imparfaitement
    // placé reste préférable à un effet invisible pour l'utilisateur qui vient de faire un choix.
    // Dispatch sur des jours différents (max 2 faiblesses) : sans ça, 2 faiblesses aux typeHints
    // proches (ex. toutes deux "volume" en 1re préférence) atterrissent sur LE MÊME jour — repéré
    // par Gildas ("il faudrait dispatch les exos en plus dans les jours") après avoir testé 2
    // faiblesses ensemble. Priorité à un jour pas encore utilisé par une faiblesse précédente ;
    // empiler sur un jour déjà utilisé reste le dernier recours plutôt que de ne rien ajouter.
    const weaknessDayIdx = new Map<string, number>();
    const usedDayIdx = new Set<number>();
    for (const key of selectedWeaknesses) {
      // customWeaknessMeta d'abord (sport libre généré par Claude, /api/sports/custom) — repli
      // sur le dictionnaire fixe pour les 9 sports du sélecteur.
      const meta = customWeaknessMeta?.[key] ?? WEAKNESS_META[key];
      if (!meta) continue;
      const candidates = dayPlans.filter(d => !d.forced);
      const unused = (d: (typeof candidates)[number]) => !usedDayIdx.has(d.dayIdx);
      const match =
        meta.typeHints.map(t => candidates.find(d => d.type === t && unused(d))).find(Boolean) ??
        meta.typeHints.map(t => candidates.find(d => d.type === t)).find(Boolean) ??
        candidates.find(unused) ??
        candidates[0];
      if (match) { weaknessDayIdx.set(key, match.dayIdx); usedDayIdx.add(match.dayIdx); }
    }

    // Phase C — construire les séances à partir du type (éventuellement corrigé par la phase B)
    dayPlans.forEach(({ day, dayIdx, type, archetypeName, exercises }) => {
      const target_difficulty = sessionDifficulty(type, weekDiff, moderateOnly);
      let notes = exercises
        ? buildNotesFromBank(exercises, type, rotationAnchor, shape, prescriptionPhase)
        : customExercises
        ? buildNotesFromBank(customExercises[type], type, rotationAnchor, shape, prescriptionPhase)
        : buildNotes(category, type, rotationAnchor, shape, prescriptionPhase);
      Array.from(weaknessDayIdx.entries()).forEach(([key, idx]) => {
        if (idx === dayIdx) notes += "\n" + (customWeaknessMeta?.[key]?.extraLine ?? WEAKNESS_META[key].extraLine);
      });
      const session: SessionTemplate = {
        name: archetypeName ?? customSessionLabels?.[type] ?? sessionName(type, w, dayIdx),
        notes,
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
