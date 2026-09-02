// Each template: [name, exercises, baseDifficulty]
// baseDifficulty is for intermediate level. Ordered hard → easy → hard → moderate for natural variation.
//
// Banque statique, sport-only, aucun appel réseau — utilisée pré-signup par DecisionStep.tsx
// (l'AHA d'autorégulation, avant que le sport/faiblesses/jours réels ne soient connus par le
// vrai générateur dans le wizard post-signup) ainsi que par EmptySessionState.tsx/coachDemoSessions.ts.
// Mots-clés alignés sur les 8 id exacts de SPORT_CATEGORIES (OnboardingFlow.tsx) — un bucket dédié
// par sport plutôt qu'un seul repli générique partagé (bug trouvé par Gildas, 2026-09-04 : la
// moitié des sports réels — Haltérophilie/Powerlifting/Musculation-Hypertrophie/Fitness-CrossFit —
// ne matchaient aucun des 5 anciens blocs "force/athlé/collectif/endurance/combat" et retombaient
// sur "Bloc principal technique", un mouvement générique au lieu de squat/bench/deadlift/arraché
// réels). Chaque note porte plusieurs lignes avec un token réellement reconnu par parseAndApply()
// (src/lib/loadAdjust.ts : NxM, "@X%"/"@Xkg", "Xmin"...), jamais une seule ligne d'échauffement
// isolée — sinon l'aperçu Alléger/Surcharger de l'écran décision pré-signup n'a presque rien à
// ajuster visiblement, ou seulement une ligne peu parlante (2e bug signalé le même jour).
//
// Depuis le 2026-09-04 (expérimentation "rôle fusionné dans value_intro, AHA générique") : le sport
// n'est plus jamais connu au moment où DecisionStep appelle cette fonction — `sport` reste "" tout
// le long du pré-signup, `getSessionTemplates("")` retombe donc systématiquement sur le repli
// générique en bas de fichier, désormais son usage PRINCIPAL pour l'AHA (plus un cas rare). Les 8
// buckets sport-spécifiques ci-dessus restent utilisés par EmptySessionState.tsx/coachDemoSessions.ts
// (post-signup, sport réel déjà connu à ce stade).
export function getSessionTemplates(sport: string): [string, string, number][] {
  const s = sport.toLowerCase();

  if (s.includes("haltéro")) return [
    ["Arraché lourd",        "Arraché 6x1 @ 85%\nÉpaulé-jeté 4x2 @ 80%\nSquat clair 4x3\nTirage nuque 3x5", 8],
    ["Technique légère",     "Arraché à vide 4x5\nFootwork jeté 5x3\nMobilité épaules 15 min", 3],
    ["Épaulé-jeté volume",   "Épaulé-jeté 5x2 @ 75%\nFront squat 4x4\nTirage épaulé 4x4", 7],
    ["Squats + tirages",     "Back squat 5x5 @ 70%\nTirage arraché 4x3\nPush press 3x5", 5],
  ];
  if (s.includes("powerlifting")) return [
    ["Squat lourd",          "Back squat 5x3 @ 85%\nDéveloppé couché 4x5 @ 75%\nSoulevé de terre 3x3 @ 80%", 8],
    ["Technique légère",     "Squat à vide 4x8\nBand pull-apart 3x15\nMobilité hanches 15 min", 3],
    ["Bench + assistance",   "Développé couché 5x5 @ 78%\nDips lestés 3x8\nRowing barre 4x6", 7],
    ["Deadlift volume",      "Soulevé de terre 5x5 @ 65%\nSquat avant 4x6\nTirage horizontal 4x8", 5],
  ];
  if (s.includes("musculation") || s.includes("hypertroph") || s.includes("force") || s.includes("puissance") || s.includes("muscu")) return [
    ["Jambes lourdes",       "Squat 5x5 @ 75%\nLeg press 4x10\nFentes bulgares 3x10", 8],
    ["Technique + mobilité", "Squat au poids du corps 3x15\nMobilité hanches 15 min\nGainage léger 3x20s", 3],
    ["Pecs / épaules",       "Développé couché 5x6 @ 72%\nDéveloppé militaire 4x8\nÉcarté poulie 3x12", 7],
    ["Dos + bras",           "Tirage vertical 4x10\nRowing barre 4x8\nCurl biceps 3x12", 5],
  ];
  if (s.includes("fitness") || s.includes("crossfit")) return [
    ["Force + metcon",       "Clean & jerk 5x2 @ 80%\nBox jump 4x8\nThrusters 3x10\nWall balls 3x15", 8],
    ["Skill + mobilité",     "Double-unders 5x30\nMobilité épaules 15 min\nGainage léger 3x20s", 3],
    ["Force + gym",          "Back squat 5x5 @ 75%\nMuscle-up practice 5x3\nRowing 4x500m", 7],
    ["Metcon modéré",        "Kettlebell swings 4x15\nBurpees 4x10\nWall balls 4x12", 5],
  ];
  if (s.includes("athlé") || s.includes("vitesse")) return [
    ["Vitesse max",          "4x30m lancé\nSquat 4x4\nGainage 3x30s", 8],
    ["Tempo + mobilité",     "Tempo 8x100m\nMobilité hanches 15 min\nGainage léger 3x20s", 3],
    ["Accélération",         "6x20m départ arrêté\nSquat 4x4\nGainage anti-rotation 3x30s", 7],
    ["Renforcement sprint",  "Squat 4x4\nNordic curl 3x5\nHip thrust 3x8", 5],
  ];
  if (s.includes("collectif")) return [
    ["Puissance terrain",        "Sprints courts 6x20m\nChangements de direction 4x10m\nSquat 4x5", 8],
    ["Récupération active",      "Footing 20 min\nMobilité globale 10 min\nÉtirements 10 min", 2],
    ["Endurance collective",     "Jeu réduit 4x8 min\nSprints 3x30m\nGainage 3x30s", 6],
    ["Renforcement prévention",  "Nordic curl 3x6\nGainage 3x40s\nSauts amortis 3x8", 4],
  ];
  if (s.includes("endurance") || s.includes("course") || s.includes("marathon") || s.includes("trail") || s.includes("vélo") || s.includes("cyclisme") || s.includes("triathlon")) return [
    ["Fractionné court",         "8x200m @ allure rapide\nRécup 90s entre chaque\nGainage 3x30s", 8],
    ["Sortie longue facile",     "Sortie continue 50 min\nAllure conversationnelle\nGainage léger 3x20s", 3],
    ["Seuil progressif",         "20 min @ seuil\nSquat 3x8\nGainage 3x30s", 7],
    ["Renforcement spécifique",  "Squat unipodal 3x10\nMontées de marche 3x12\nMollets 3x15", 4],
  ];
  if (s.includes("martial") || s.includes("combat")) return [
    ["Sparring / Randori",   "Sparring 5x3min\nRécup 2 min entre rounds\nGainage 3x40s", 8],
    ["Renforcement général", "Gainage 3x30s\nBand work cervicales 3x12\nMobilité épaules 10 min", 3],
    ["Conditionnement",      "HIIT 5x2min effort\nPliométrie 4x8\nGainage 3x30s", 7],
    ["Travail technique",    "Combinaisons 5x2min\nShadow boxing 4x3min\nGainage 3x30s", 5],
  ];
  // Repli générique — sport libre "Autre" non résolu par aucun mot-clé ci-dessus, ET banque par
  // défaut de l'AHA pré-signup (DecisionStep.tsx) depuis le 2026-09-04 (expérimentation "rôle
  // fusionné dans value_intro, sport plus jamais demandé avant l'AHA" — voir doc des paths). Une
  // séance de préparation physique volontairement générique, avec des mouvements reconnaissables
  // quel que soit le sport (squat/pompes/fentes/gainage) plutôt qu'un contenu vague — le wording de
  // DecisionStep précise explicitement que le mécanisme marche pour tous les sports.
  return [
    ["Renforcement complet",     "Squats 4x8\nPompes 4x10\nFentes 3x10\nGainage 3x45s", 8],
    ["Mobilité + récupération",  "Marche 20 min\nMobilité globale 10 min\nÉtirements 10 min", 2],
    ["Circuit modéré",           "Circuit 3x10\nGainage 3x30s\nRespiration contrôlée", 6],
    ["Renforcement général",     "Squats au poids du corps 3x15\nGainage 3x30s\nFentes 3x10", 5],
  ];
}

export function nextDateForDow(dow: number): string {
  const today = new Date();
  const diff = ((dow - today.getDay()) + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
