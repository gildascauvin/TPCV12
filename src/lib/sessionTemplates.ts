export function getSessionTemplates(sport: string): [string, string][] {
  const s = sport.toLowerCase();
  if (s.includes("force") || s.includes("puissance")) return [
    ["Snatch technique",   "Complexe : high pull + hang snatch\n5 séries @ 70–80%\nFocus vitesse sous la barre"],
    ["Clean & Jerk lourd", "Clean + jerk 5x1\nFront squat 3x3\nDifficulté cible contrôlée"],
    ["Squat + tirages",    "Back squat 5x5\nSnatch pull 4x3\nGainage 8 min"],
    ["Technique légère",   "Power snatch 6x2\nJerk footwork\nMobilité épaules/hanches"],
  ];
  if (s.includes("athlé") || s.includes("vitesse")) return [
    ["Accélération 20m",    "Échauffement complet\n6x20m départ arrêté\nRécup 3 min\nFocus : sortie de bloc"],
    ["Vitesse max fly 30m", "4x30m lancé\nRécup complète 4–5 min\nQualité > volume"],
    ["Tempo + mobilité",    "8x100m facile\nMobilité hanches/chevilles\nRespiration 5 min"],
    ["Renforcement sprint", "Squat 4x4\nNordic curl 3x5\nGainage anti-rotation"],
  ];
  if (s.includes("collectif")) return [
    ["Puissance terrain",       "Échauffement 10 min\nSprints courts 6x20m\nChangements de direction\nRenforcement membres inférieurs"],
    ["Endurance collective",    "Jeu réduit 4vs4 × 4 sets\nRécup active 2 min\nFocus pressing et transition"],
    ["Renforcement prévention", "Gainage 3x1min\nNordic curl 3x6\nMobilité hanches\nSauts amortis"],
    ["Récupération active",     "Footing facile 20 min\nMobilité globale\nÉtirements doux"],
  ];
  if (s.includes("endurance")) return [
    ["Sortie longue facile",    "Effort aérobie continu 45–60 min\nAllure conversationnelle\nFocus : respiration et économie"],
    ["Fractionné court",        "Échauffement 15 min\n8x200m @ allure rapide\nRécup 90s entre chaque\nRetour au calme 10 min"],
    ["Seuil progressif",        "Montée en allure progressive\n20 min @ seuil\nRetour au calme\nFocus : régularité"],
    ["Renforcement spécifique", "Gainage 3 séries\nSquat unipodal 3x10\nMontées de marche\nMobilité chevilles/hanches"],
  ];
  if (s.includes("martial") || s.includes("combat")) return [
    ["Travail technique",    "Échauffement cardio 10 min\nTechniques de base × séries\nCombination × 5 séries\nÉtirements actifs"],
    ["Conditionnement",      "HIIT 5x2min effort\nRécup 1 min entre chaque\nExercices pliométriques\nGainage fonctionnel"],
    ["Sparring / Randori",   "Échauffement complet\nSparring technique 3x3min\nDebriefing\nMobilité ciblée"],
    ["Renforcement général", "Exercices poids de corps\nCore stability 20 min\nMobilité épaules/hanches\nRécupération"],
  ];
  return [
    ["Séance qualité",          "Bloc principal technique\n3–5 séries propres\nDifficulté maîtrisée"],
    ["Séance volume",           "Travail continu modéré\nVolume progressif\nRespiration contrôlée"],
    ["Mobilité + récupération", "20–30 min facile\nMobilité globale\nMarche ou vélo doux"],
    ["Renforcement général",    "Mouvements de base\nCore\nPrévention blessures"],
  ];
}

export function nextDateForDow(dow: number): string {
  const today = new Date();
  const diff = ((dow - today.getDay()) + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
