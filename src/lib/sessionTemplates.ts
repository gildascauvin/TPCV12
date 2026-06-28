// Each template: [name, exercises, baseDifficulty]
// baseDifficulty is for intermediate level. Ordered hard → easy → hard → moderate for natural variation.
export function getSessionTemplates(sport: string): [string, string, number][] {
  const s = sport.toLowerCase();
  if (s.includes("force") || s.includes("puissance")) return [
    ["Clean & Jerk lourd",  "Clean + jerk 5x1\nFront squat 3x3\nSnatch grip deadlift 3x4\nÉpaules : face pull 3x12\nÉchauffement articulaire complet", 8],
    ["Technique légère",    "Power snatch 6x2 @ 60%\nJerk footwork 5x3\nBanded pull-apart 3x15\nMobilité épaules/hanches 15 min\nTracé barre vidéo", 3],
    ["Squat + tirages",     "Back squat 5x5\nSnatch pull 4x3\nRoman chair 3x12\nGainage planche 3x45s\nMobilité hanches 10 min", 7],
    ["Snatch technique",    "Complexe : high pull + hang snatch\n4 séries @ 70%\nFocus vitesse sous la barre\nSquat de réception 3x3\nMobilité épaules post-séance", 5],
  ];
  if (s.includes("athlé") || s.includes("vitesse")) return [
    ["Vitesse max fly 30m",  "Échauffement 15 min\n4x30m lancé\nRécup complète 4–5 min\nQualité > volume\nAnalyse foulée si possible", 8],
    ["Tempo + mobilité",     "8x100m effort facile\nRécup marche 45s\nMobilité hanches/chevilles\nGainage léger 3x30s\nRespiration 5 min", 3],
    ["Accélération 20m",     "Échauffement complet 15 min\n6x20m départ arrêté\nRécup 3 min entre chaque\nFocus : sortie de bloc\nStrides de finition 4x60m", 7],
    ["Renforcement sprint",  "Squat 4x4\nNordic curl 3x5\nGainage anti-rotation 3x30s\nHip thrust 3x8\nMontées de genoux explosives 3x6", 5],
  ];
  if (s.includes("collectif")) return [
    ["Puissance terrain",        "Échauffement 10 min\nSprints courts 6x20m\nChangements de direction 4x10m × 4\nRenforcement membres inférieurs\nRetour calme 5 min", 7],
    ["Récupération active",      "Footing facile 20 min\nMobilité globale 10 min\nÉtirements doux 10 min\nRouleau mousse 10 min", 2],
    ["Endurance collective",     "Jeu réduit 4vs4 × 4 sets\nRécup active 2 min\nFocus pressing et transitions\nConduite balle + sprints 3x30m\nDebriefing tactique", 6],
    ["Renforcement prévention",  "Gainage 3x1min\nNordic curl 3x6\nMobilité hanches 10 min\nSauts amortis 3x8\nBand work genoux 2x15", 4],
  ];
  if (s.includes("endurance") || s.includes("course") || s.includes("marathon") || s.includes("trail") || s.includes("vélo") || s.includes("cyclisme") || s.includes("triathlon")) return [
    ["Fractionné court",         "Échauffement 15 min\n8x200m @ allure rapide\nRécup 90s entre chaque\nNote ta cadence de foulée\nRetour au calme 10 min", 8],
    ["Sortie longue facile",     "Effort aérobie continu 45–60 min\nAllure conversationnelle\nFocus : respiration et économie\nRavitaillement toutes les 30 min\nNote FC moyenne", 3],
    ["Seuil progressif",         "Montée en allure progressive 10 min\n20 min @ seuil\nFocus : régularité d'allure\nMesure FC max & moyenne\nRetour au calme 10 min", 7],
    ["Renforcement spécifique",  "Gainage 3 séries\nSquat unipodal 3x10\nMontées de marche lestées 3x12\nExcentrique mollets 3x12\nMobilité chevilles/hanches", 4],
  ];
  if (s.includes("martial") || s.includes("combat")) return [
    ["Sparring / Randori",    "Échauffement complet 15 min\nSparring technique 3x3min\nRécup 2 min entre rounds\nDebriefing avec partenaire\nMobilité ciblée 10 min", 8],
    ["Renforcement général",  "Exercices poids de corps\nCore stability 20 min\nBand work cervicales 3x12\nMobilité épaules/hanches\nRécupération", 3],
    ["Conditionnement",       "HIIT 5x2min effort\nRécup 1 min entre chaque\nExercices pliométriques\nGainage fonctionnel 3x45s\nPunch bag ou shadow 3x2min", 7],
    ["Travail technique",     "Échauffement cardio 10 min\nTechniques de base × séries\nCombination × 5 séries\nTravail en miroir 5 min\nÉtirements actifs post-séance", 5],
  ];
  return [
    ["Séance qualité",           "Bloc principal technique\n3–5 séries propres\nDifficulté maîtrisée\nNote tes sensations post-séance", 7],
    ["Mobilité + récupération",  "20–30 min facile\nMobilité globale\nMarche ou vélo doux\nÉtirements 10 min", 2],
    ["Séance volume",            "Travail continu modéré\nVolume progressif\nRespiration contrôlée\nRécupération active entre séries", 5],
    ["Renforcement général",     "Mouvements de base\nCore 3 séries\nPrévention blessures\nBand work mobilité", 4],
  ];
}

export function nextDateForDow(dow: number): string {
  const today = new Date();
  const diff = ((dow - today.getDay()) + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
