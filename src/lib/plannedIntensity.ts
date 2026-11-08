/* Séance prévue (2026-10-01, POC dispositif-éteint) : 1re question du point forme quand rien n'est au
   planning aujourd'hui. Choix en mots, jamais de chiffre, converti ici en RPE prévu. Repos = aucune
   séance créée. Module séparé pour ne pas tirer WellnessModal (chargé dynamiquement) dans le bundle. */
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { guessSportChip } from "@/lib/sportCategories";

export type PlannedIntensity = "rest" | "easy" | "mod" | "hard" | "vhard";
// Calé sur Foster (2026-10-22) : 2 Facile, 4 Un peu dur, 6 Dur +, 8 Très dur +.
export const PLANNED_RPE: Record<Exclude<PlannedIntensity, "rest">, number> = { easy: 2, mod: 4, hard: 6, vhard: 8 };
export const PLANNED_LABEL: Record<Exclude<PlannedIntensity, "rest">, string> = { easy: "légère", mod: "modérée", hard: "dure", vhard: "très dure" };

/* Exercice placeholder de la séance créée par le point forme (2026-10-07, POC « Séances, exos et
   ajustements ») : une ligne de texte simple terminée par « (à compléter) », pas de nouveau statut.
   La durée et le RPE donnent prise aux décisions (Alléger/Surcharger) et à la charge prévue. */
const PLANNED_MIN: Record<Exclude<PlannedIntensity, "rest">, number> = { easy: 30, mod: 45, hard: 60, vhard: 60 };

function placeholderName(sport: string | null | undefined, intensity: Exclude<PlannedIntensity, "rest">): string {
  const s = (sport ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/halter/.test(s)) return intensity === "easy" ? "Technique haltéro" : "Séance haltéro";
  if (/velo|cycl|vtt/.test(s)) return "Sortie vélo";
  if (/course|endur|running|trail|marathon|semi|10 ?k|5 ?k/.test(s)) return { easy: "Footing", mod: "Course", hard: "Fractionné", vhard: "Fractionné" }[intensity];
  if (/muscu|hypertroph|power|force|crossfit|fitness|hyrox/.test(s)) return "Séance muscu";
  return "Séance";
}

export function plannedPlaceholderLine(sport: string | null | undefined, intensity: Exclude<PlannedIntensity, "rest">): string {
  return `${placeholderName(sport, intensity)} ${PLANNED_MIN[intensity]} min @ RPE ${PLANNED_RPE[intensity]} (à compléter)`;
}

/* Séance proposée (08/11, Gildas : « la séance doit être spécifique au sport ») : « Qu'as-tu prévu
   aujourd'hui ? » crée une vraie séance de son sport à la difficulté choisie. Une séance écrite par sport
   et par intensité (lignes reconnues par parseAndApply : NxM, minutes, mètres), pour que la décision du
   matin réécrive de vraies séries. Sport non couvert : banque par catégorie, sinon la ligne à compléter. */
type Four = Record<Exclude<PlannedIntensity, "rest">, [string, string]>;
const SPORT_SESSIONS: [RegExp, Four][] = [
  [/trail/, { easy: ["Footing nature", "Footing 35 min en endurance fondamentale\nGammes 4x30 m"], mod: ["Côtes en endurance", "Échauffement 15 min\n6x2 min en côte, récup en descente\nRetour au calme 10 min"], hard: ["Seuil en côte", "Échauffement 15 min\n4x6 min au seuil en côte\nRetour au calme 10 min"], vhard: ["Sortie longue dénivelé", "Sortie 1 h 45 avec 3x15 min en montée soutenue\nRetour au calme 10 min"] }],
  [/v[ée]lo|cycl|vtt|gravel/, { easy: ["Sortie souple", "Vélo 45 min en endurance, cadence 90 rpm"], mod: ["Tempo vélo", "Échauffement 15 min\n3x10 min en tempo\nRetour au calme 10 min"], hard: ["Intervalles seuil", "Échauffement 15 min\n4x8 min au seuil, récup 4 min\nRetour au calme 10 min"], vhard: ["PMA vélo", "Échauffement 20 min\n6x3 min à PMA, récup 3 min\nRetour au calme 10 min"] }],
  [/natation|nage|swim/, { easy: ["Technique nage", "400 m échauffement\n8x50 m éducatifs\n200 m souple"], mod: ["Endurance nage", "400 m échauffement\n6x200 m allure endurance\n200 m souple"], hard: ["Seuil nage", "400 m échauffement\n10x100 m au seuil, récup 20 s\n200 m souple"], vhard: ["Vitesse nage", "400 m échauffement\n12x50 m vite, récup 30 s\n4x25 m sprint\n200 m souple"] }],
  [/triathlon/, { easy: ["Enchaînement souple", "Vélo 40 min souple\nCourse 15 min facile"], mod: ["Enchaînement tempo", "Vélo 45 min dont 2x10 min tempo\nCourse 20 min dont 10 min tempo"], hard: ["Enchaînement seuil", "Vélo 50 min dont 3x8 min au seuil\nCourse 20 min dont 2x6 min au seuil"], vhard: ["Enchaînement course", "Vélo 1 h dont 4x6 min allure course\nCourse 30 min dont 3x8 min allure course"] }],
  [/course|running|marathon|semi|10 ?k|5 ?k|endurance/, { easy: ["Footing", "Footing 40 min en endurance fondamentale\nGammes 4x30 m"], mod: ["Footing + lignes droites", "Footing 35 min\n6x100 m lignes droites"], hard: ["Fractionné seuil", "Échauffement 20 min\n3x10 min au seuil, récup 2 min\nRetour au calme 10 min"], vhard: ["Fractionné VMA", "Échauffement 20 min\n10x400 m à VMA, récup 1 min\nRetour au calme 10 min"] }],
  [/sprint|athl[ée]|vitesse|haies|saut|d[ée]cathl/, { easy: ["Technique de course", "Gammes 4x30 m\nTempo 6x100 m\nMobilité hanches 15 min"], mod: ["Accélérations", "Gammes 4x30 m\n6x30 m départ arrêté\nSquat 4x5"], hard: ["Vitesse max", "Gammes 4x30 m\n5x40 m lancé\nSquat 4x4\nBox jump 4x5"], vhard: ["Vitesse + lactique", "Gammes 4x30 m\n4x60 m vite\n3x150 m, récup 5 min\nSquat 4x3"] }],
  [/foot|soccer/, { easy: ["Récupération foot", "Footing 20 min\nConservation 4x4 min léger\nMobilité 10 min"], mod: ["Jeu réduit", "Échauffement ballon 15 min\nJeu réduit 4x6 min\nFrappes 3x10"], hard: ["Intensif foot", "Échauffement 15 min\nJeu réduit 6x4 min intense\nSprints 6x20 m"], vhard: ["Haute intensité foot", "Échauffement 15 min\nIntermittent 15-15 2x8 min\nJeu réduit 6x3 min\nSprints 8x20 m"] }],
  [/rugby/, { easy: ["Récupération rugby", "Footing 20 min\nPasses 4x5 min\nMobilité 10 min"], mod: ["Technique rugby", "Échauffement 15 min\nPasses et rucks 4x6 min\nSquat 4x6"], hard: ["Contact + vitesse", "Échauffement 15 min\nSprints 6x30 m\nOpposition 4x5 min\nSquat 4x5"], vhard: ["Conditionnement rugby", "Échauffement 15 min\nIntermittent 30-30 2x8 min\nPlaquages et relevés 5x1 min\nSquat 5x3"] }],
  [/basket|hand|volley/, { easy: ["Adresse et mobilité", "Échauffement 15 min\nAdresse 4x5 min\nMobilité 10 min"], mod: ["Jeu et appuis", "Échauffement 15 min\nAppuis 4x8 répétitions\nJeu réduit 4x5 min"], hard: ["Explosivité salle", "Échauffement 15 min\nSauts 4x6\nSprints 6x15 m\nJeu réduit 4x5 min"], vhard: ["Intensif salle", "Échauffement 15 min\nSauts 5x6\nIntermittent 15-15 2x6 min\nJeu réduit 5x4 min"] }],
  [/tennis|padel|badminton|squash/, { easy: ["Échanges souples", "Échanges 30 min\nService 3x10\nMobilité épaules 10 min"], mod: ["Exercices de jeu", "Échauffement 15 min\nDéplacements 4x8 répétitions\nExercices de jeu 4x8 min"], hard: ["Intensif raquette", "Échauffement 15 min\nDéplacements 6x30 s\nPoints joués 5x6 min"], vhard: ["Match et vitesse", "Échauffement 15 min\nSprints 8x10 m\nMatch 2x20 min"] }],
  [/halt[ée]ro/, { easy: ["Technique haltéro", "Arraché à vide 4x5\nFootwork jeté 5x3\nMobilité épaules 15 min"], mod: ["Squats + tirages", "Back squat 5x5 @ 70%\nTirage arraché 4x3\nPush press 3x5"], hard: ["Épaulé-jeté volume", "Épaulé-jeté 5x2 @ 75%\nFront squat 4x4\nTirage épaulé 4x4"], vhard: ["Arraché lourd", "Arraché 6x1 @ 85%\nÉpaulé-jeté 4x2 @ 80%\nSquat clair 4x3"] }],
  [/power/, { easy: ["Technique légère", "Squat à vide 4x8\nBand pull-apart 3x15\nMobilité hanches 15 min"], mod: ["Deadlift volume", "Soulevé de terre 5x5 @ 65%\nSquat avant 4x6\nTirage horizontal 4x8"], hard: ["Bench + assistance", "Développé couché 5x5 @ 78%\nDips lestés 3x8\nRowing barre 4x6"], vhard: ["Squat lourd", "Back squat 5x3 @ 85%\nDéveloppé couché 4x5 @ 75%\nSoulevé de terre 3x3 @ 80%"] }],
  [/hyrox|crossfit|fitness/, { easy: ["Skill + mobilité", "Rameur 10 min souple\nDouble-unders 5x30\nMobilité épaules 15 min"], mod: ["Metcon modéré", "Kettlebell swings 4x15\nBurpees 4x10\nWall balls 4x12"], hard: ["Force + gym", "Back squat 5x5 @ 75%\nMuscle-up practice 5x3\nRameur 4x500 m"], vhard: ["Force + metcon", "Clean & jerk 5x2 @ 80%\nBox jump 4x8\nThrusters 3x10\nWall balls 3x15"] }],
  [/muscu|hypertroph|force|bodybuild/, { easy: ["Mobilité + gainage", "Squat au poids du corps 3x15\nMobilité hanches 15 min\nPlanche 3x30s"], mod: ["Haut du corps", "Développé couché 4x10\nTractions 4x8\nÉlévations latérales 3x12"], hard: ["Bas du corps", "Squat 5x6 @ 75%\nSoulevé de terre roumain 4x8\nFentes bulgares 3x10"], vhard: ["Jambes lourdes", "Squat 5x5 @ 80%\nLeg press 4x10\nFentes bulgares 3x10\nHip thrust 4x8"] }],
  [/boxe|mma|judo|karat|lutte|combat|martia|jiu/, { easy: ["Technique légère", "Shadow 4x3 min\nMobilité épaules 10 min\nPlanche 3x30s"], mod: ["Travail technique", "Combinaisons 5x2 min\nShadow 4x3 min\nPlanche 3x30s"], hard: ["Conditionnement", "HIIT 5x2 min\nPliométrie 4x8\nSac 5x3 min"], vhard: ["Sparring / randori", "Sparring 6x3 min, récup 1 min\nSac 3x3 min\nPlanche 3x40s"] }],
  [/escalade|bloc/, { easy: ["Volume facile", "Voies faciles 30 min\nMobilité épaules 10 min"], mod: ["Technique escalade", "Échauffement 15 min\nBlocs techniques 6x4 essais\nGainage 3x30s"], hard: ["Force doigts", "Échauffement 20 min\nSuspensions 6x10 s\nBlocs durs 5x3 essais"], vhard: ["Bloc limite", "Échauffement 20 min\nBlocs limite 8x3 essais\nTractions lestées 4x4"] }],
  [/ski/, { easy: ["Prépa ski douce", "Vélo 30 min souple\nMobilité hanches 15 min"], mod: ["Renfo ski", "Squat 4x10\nFentes latérales 3x10\nGainage 3x40s"], hard: ["Prépa ski intense", "Squat sauté 4x8\nChaise 4x45 s\nSauts latéraux 4x20"], vhard: ["Prépa ski explosive", "Squat 5x5 @ 80%\nSauts latéraux 5x20\nChaise 4x60 s\nVélo 4x3 min fort"] }],
  [/aviron|rameur/, { easy: ["Rameur souple", "Rameur 40 min en endurance"], mod: ["Tempo aviron", "Échauffement 10 min\n3x10 min en tempo\nRetour au calme 10 min"], hard: ["Seuil aviron", "Échauffement 15 min\n4x8 min au seuil, récup 3 min"], vhard: ["Intervalles aviron", "Échauffement 15 min\n8x500 m fort, récup 2 min"] }],
];
export function plannedSession(sport: string | null | undefined, intensity: Exclude<PlannedIntensity, "rest">): { name: string; notes: string } {
  const label = PLANNED_LABEL[intensity];
  const raw = (sport ?? "").trim();
  const placeholder = { name: `Séance du jour ${label}`, notes: plannedPlaceholderLine(sport, intensity) };
  if (!raw) return placeholder;
  const s = raw.toLowerCase();
  const hit = SPORT_SESSIONS.find(([re]) => re.test(s));
  if (hit) { const [name, notes] = hit[1][intensity]; return { name, notes }; }
  const cat = guessSportChip(raw);
  if (!cat) return placeholder;
  const target = PLANNED_RPE[intensity];
  const best = [...getSessionTemplates(cat)].sort((a, b) => Math.abs(a[2] - target) - Math.abs(b[2] - target))[0];
  return best ? { name: best[0], notes: best[1] } : placeholder;
}
