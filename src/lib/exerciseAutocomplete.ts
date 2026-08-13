// Moteur d'autocomplete token-aware pour la saisie d'exercices (AddSessionModal).
// Port du POC tpc_editor_v2 — 4 familles de tokens : nom, volume, intensité, contrainte.
// Chaque ligne d'exercice reste du texte libre au final (aucun format structuré stocké en DB) —
// ce moteur assiste la saisie, il ne change jamais la façon dont `sessions.notes` est lu ailleurs.

export type TokenType = "name" | "volume" | "intensity" | "constraint";

export interface TokenSuggestion {
  type: TokenType;
  value: string;
  label: string;
  meta: string;
  icon: string;
  next?: boolean;
}

interface HistoryEntry {
  name: string;
  volume: string | null;
  intensity: string | null;
  date: string;
  sport: string;
}

export const HISTORY: Record<string, HistoryEntry> = {
  "clean pull": { name: "Clean pull", volume: "3x2", intensity: "@ 125kg", date: "il y a 3 jours", sport: "🏋️" },
  "clean & jerk": { name: "Clean & Jerk", volume: "3x1", intensity: "@ 130kg", date: "il y a 1 sem.", sport: "🏋️" },
  "power clean": { name: "Power clean", volume: "4x2", intensity: "@ 110kg", date: "il y a 1 sem.", sport: "🏋️" },
  "overhead squat": { name: "Overhead squat", volume: "3x3", intensity: "@ 80kg", date: "il y a 2 sem.", sport: "🏋️" },
  "split jerk": { name: "Split jerk", volume: "5 OTM", intensity: "@ 87.5", date: "il y a 3 jours", sport: "🏋️" },
  "snatch": { name: "Snatch", volume: "5 OTM", intensity: "@ 75", date: "il y a 3 jours", sport: "🏋️" },
  "snatch pull": { name: "Snatch pull", volume: "3x3", intensity: "@ 100kg", date: "il y a 1 sem.", sport: "🏋️" },
  "power snatch": { name: "Power snatch", volume: "5 OTM", intensity: "@ 65", date: "il y a 2 sem.", sport: "🏋️" },
  "hang snatch": { name: "Hang snatch", volume: "4x2", intensity: "@ 70", date: "il y a 1 sem.", sport: "🏋️" },
  "snatch balance": { name: "Snatch balance", volume: "3x3", intensity: "@ 60kg", date: "il y a 3 sem.", sport: "🏋️" },
  "clean": { name: "Clean", volume: "3x2", intensity: "@ 125kg", date: "il y a 3 jours", sport: "🏋️" },
  "hang clean": { name: "Hang clean", volume: "4x2", intensity: "@ 100kg", date: "il y a 2 sem.", sport: "🏋️" },
  "push jerk": { name: "Push jerk", volume: "4x2", intensity: "@ 90kg", date: "il y a 1 sem.", sport: "🏋️" },
  "jerk": { name: "Split jerk", volume: "5 OTM", intensity: "@ 87.5", date: "il y a 3 jours", sport: "🏋️" },
  "back squat": { name: "Back squat", volume: "4x5", intensity: "@ 150kg", date: "il y a 5 jours", sport: "🏋️" },
  "front squat": { name: "Front squat", volume: "3x3", intensity: "@ 115kg", date: "il y a 4 jours", sport: "🏋️" },
  "romanian deadlift": { name: "Romanian deadlift", volume: "3x8", intensity: "@ 110kg", date: "il y a 2 sem.", sport: "🏋️" },
  "bench press": { name: "Bench press", volume: "4x8", intensity: "@ RPE 8", date: "il y a 2 sem.", sport: "🏋️" },
  "incline bench": { name: "Incline bench", volume: "3x10", intensity: "@ 80kg", date: "il y a 3 sem.", sport: "🏋️" },
  "overhead press": { name: "Overhead press", volume: "4x6", intensity: "@ 75kg", date: "il y a 1 sem.", sport: "🏋️" },
  "barbell row": { name: "Barbell row", volume: "4x8", intensity: "@ 90kg", date: "il y a 1 sem.", sport: "🏋️" },
  "hip thrust": { name: "Hip thrust", volume: "4x10", intensity: "@ 120kg", date: "il y a 2 sem.", sport: "🏋️" },
  "deadlift": { name: "Deadlift", volume: "3x3", intensity: "@ 180kg", date: "il y a 3 sem.", sport: "🏋️" },
  "squat": { name: "Back squat", volume: "4x5", intensity: "@ 150kg", date: "il y a 5 jours", sport: "🏋️" },
  "rdl": { name: "RDL", volume: "3x8", intensity: "@ 110kg", date: "il y a 2 sem.", sport: "🏋️" },
  "bench": { name: "Bench press", volume: "4x8", intensity: "@ RPE 8", date: "il y a 2 sem.", sport: "🏋️" },
  "ohp": { name: "Overhead press", volume: "4x6", intensity: "@ 75kg", date: "il y a 1 sem.", sport: "🏋️" },
  "muscle-up": { name: "Muscle-up", volume: "5x3", intensity: "BW", date: "il y a 2 sem.", sport: "💪" },
  "muscle up": { name: "Muscle-up", volume: "5x3", intensity: "BW", date: "il y a 2 sem.", sport: "💪" },
  "pull-up": { name: "Pull-ups", volume: "5x8", intensity: "+10kg", date: "il y a 1 sem.", sport: "💪" },
  "pull up": { name: "Pull-ups", volume: "5x8", intensity: "+10kg", date: "il y a 1 sem.", sport: "💪" },
  "push-up": { name: "Push-ups", volume: "4x20", intensity: "tempo 2-1-2", date: "il y a 1 sem.", sport: "💪" },
  "push up": { name: "Push-ups", volume: "4x20", intensity: "tempo 2-1-2", date: "il y a 1 sem.", sport: "💪" },
  "handstand": { name: "Handstand hold", volume: "5x30s", intensity: "mur", date: "il y a 3 sem.", sport: "💪" },
  "l-sit": { name: "L-sit", volume: "5x15s", intensity: "parallettes", date: "il y a 2 sem.", sport: "💪" },
  "ring dip": { name: "Ring dips", volume: "4x8", intensity: "BW", date: "il y a 2 sem.", sport: "💪" },
  "dip": { name: "Dips", volume: "4x10", intensity: "+15kg", date: "il y a 1 sem.", sport: "💪" },
  "pull": { name: "Pull-ups", volume: "5x8", intensity: "+10kg", date: "il y a 1 sem.", sport: "💪" },
  "tractions": { name: "Tractions", volume: "5x8", intensity: "+10kg", date: "il y a 1 sem.", sport: "💪" },
  "traction": { name: "Tractions", volume: "5x8", intensity: "+10kg", date: "il y a 1 sem.", sport: "💪" },
  "depth jump": { name: "Depth jump", volume: "4x5", intensity: "40cm", date: "il y a 1 sem.", sport: "⬆️" },
  "box jump": { name: "Box jump", volume: "5x5", intensity: "60cm", date: "il y a 4 jours", sport: "⬆️" },
  "broad jump": { name: "Broad jump", volume: "5x3", intensity: "max", date: "il y a 4 jours", sport: "⬆️" },
  "triple hop": { name: "Triple hop", volume: "4x3", intensity: "max", date: "il y a 3 jours", sport: "⬆️" },
  "bounding": { name: "Bounding", volume: "6x20m", intensity: "max", date: "il y a 3 jours", sport: "⬆️" },
  "haies bond": { name: "Haies bondissantes", volume: "5x6", intensity: "max hauteur", date: "il y a 1 sem.", sport: "⬆️" },
  "switch drill": { name: "Switch drill", volume: "2x4", intensity: "max", date: "il y a 4 jours", sport: "🏃" },
  "sprint": { name: "Sprint", volume: "8x30m", intensity: "95%", date: "il y a 3 jours", sport: "🏃" },
  "100m": { name: "100m", volume: "3x", intensity: "max", date: "il y a 2 sem.", sport: "🏃" },
  "400m": { name: "400m", volume: "4x", intensity: "85%", date: "il y a 2 sem.", sport: "🏃" },
  "1000m": { name: "1000m", volume: "5x", intensity: "allure cible", date: "il y a 3 sem.", sport: "🏃" },
  "30m": { name: "30m sprint", volume: "6x", intensity: "max", date: "il y a 3 jours", sport: "🏃" },
  "60m": { name: "60m sprint", volume: "4x", intensity: "90%", date: "il y a 1 sem.", sport: "🏃" },
  "haies": { name: "Haies", volume: "6x", intensity: "technique", date: "il y a 2 sem.", sport: "🏃" },
  "interval": { name: "Intervalles", volume: "8x400m", intensity: "90%", date: "il y a 2 sem.", sport: "🏃" },
  "fartlek": { name: "Fartlek", volume: "40 min", intensity: "varié", date: "il y a 2 sem.", sport: "🏃" },
  "footing": { name: "Footing", volume: "45 min", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏃" },
  "tempo": { name: "Tempo run", volume: "5km", intensity: "allure seuil", date: "il y a 1 sem.", sport: "🏃" },
  "assault bike": { name: "Assault bike", volume: "4x30s", intensity: "max", date: "il y a 2 sem.", sport: "🚴" },
  "ski erg": { name: "Ski erg", volume: "5x1min", intensity: "RPE 8", date: "il y a 3 sem.", sport: "⛷️" },
  "rowing": { name: "Rowing erg.", volume: "4x500m", intensity: "2:05/500", date: "il y a 2 sem.", sport: "🚣" },
  "natation": { name: "Natation", volume: "2km", intensity: "facile", date: "il y a 4 sem.", sport: "🏊" },
  "vélo": { name: "Vélo", volume: "1h30", intensity: "zone 2", date: "il y a 3 sem.", sport: "🚴" },
  "velo": { name: "Vélo", volume: "1h30", intensity: "zone 2", date: "il y a 3 sem.", sport: "🚴" },
  "run": { name: "Run", volume: "30 min", intensity: "facile", date: "il y a 1 sem.", sport: "🏃" },
  "jeu réduit": { name: "Jeu réduit", volume: "3x8 min", intensity: "intensité haute", date: "il y a 1 sem.", sport: "⚽" },
  "pressing": { name: "Bloc pressing", volume: "4x5 min", intensity: "intensité max", date: "il y a 1 sem.", sport: "⚽" },
  "passe": { name: "Passes en mouvement", volume: "15 min", intensity: "technique", date: "il y a 1 sem.", sport: "⚽" },
  "lancer": { name: "Lancers", volume: "4x10", intensity: "technique", date: "il y a 2 sem.", sport: "🏀" },
  "4v4": { name: "4v4", volume: "4x6 min", intensity: "libre", date: "il y a 1 sem.", sport: "⚽" },
  "tir": { name: "Tir au but", volume: "3x10", intensity: "max", date: "il y a 2 sem.", sport: "⚽" },
  "campus board": { name: "Campus board", volume: "5x", intensity: "L3-L1", date: "il y a 3 sem.", sport: "🧗" },
  "système": { name: "Système board", volume: "4x", intensity: "7b éq.", date: "il y a 4 sem.", sport: "🧗" },
  "traversée": { name: "Traversée", volume: "20 min", intensity: "facile", date: "il y a 2 sem.", sport: "🧗" },
  "bloc": { name: "Blocs", volume: "10 voies", intensity: "7a", date: "il y a 1 sem.", sport: "🧗" },
  "voie": { name: "Voies", volume: "4 voies", intensity: "6c+", date: "il y a 2 sem.", sport: "🧗" },
  "mobilité hanches": { name: "Mobilité hanches", volume: "10 min", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "foam roller": { name: "Foam roller", volume: "10 min", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "étirements": { name: "Étirements", volume: "15 min", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "gainage": { name: "Gainage", volume: "3x45s", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "mobilité": { name: "Mobilité", volume: "10 min", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "foam": { name: "Foam roller", volume: "10 min", intensity: null, date: "il y a 1 sem.", sport: "🧘" },

  // ── Haltérophilie — compléments ──
  "épaulé": { name: "Épaulé", volume: "4x2", intensity: "@ 90kg", date: "il y a 1 sem.", sport: "🏋️" },
  "épaulé-jeté": { name: "Épaulé-jeté", volume: "3x1", intensity: "@ 100kg", date: "il y a 1 sem.", sport: "🏋️" },
  "jeté": { name: "Jeté", volume: "4x1", intensity: "@ 90kg", date: "il y a 2 sem.", sport: "🏋️" },
  "tirage arraché": { name: "Tirage arraché", volume: "3x3", intensity: "@ 90kg", date: "il y a 1 sem.", sport: "🏋️" },
  "tirage épaulé": { name: "Tirage épaulé", volume: "3x3", intensity: "@ 100kg", date: "il y a 1 sem.", sport: "🏋️" },
  "squat avant": { name: "Squat avant", volume: "3x3", intensity: "@ 100kg", date: "il y a 4 jours", sport: "🏋️" },
  "squat arraché": { name: "Squat arraché", volume: "3x2", intensity: "@ 60kg", date: "il y a 1 sem.", sport: "🏋️" },
  "complexe arraché": { name: "Complexe arraché + épaulé-jeté", volume: "5x1", intensity: "@ 60%", date: "il y a 2 sem.", sport: "🏋️" },

  // ── Powerlifting — compléments ──
  "squat pause": { name: "Squat pause", volume: "3x3", intensity: "@ 140kg", date: "il y a 4 jours", sport: "🏋️" },
  "bench pause": { name: "Bench pause 2s", volume: "4x3", intensity: "@ 100kg", date: "il y a 3 jours", sport: "🏋️" },
  "développé prise serrée": { name: "Développé prise serrée", volume: "4x6", intensity: "@ 80kg", date: "il y a 1 sem.", sport: "🏋️" },
  "deadlift déficit": { name: "Deadlift déficit", volume: "3x3", intensity: "@ 150kg", date: "il y a 1 sem.", sport: "🏋️" },
  "soulevé de terre": { name: "Soulevé de terre", volume: "3x3", intensity: "@ 180kg", date: "il y a 3 sem.", sport: "🏋️" },

  // ── Musculation / Hypertrophie — compléments ──
  "presse à cuisses": { name: "Presse à cuisses", volume: "4x10", intensity: "@ 180kg", date: "il y a 1 sem.", sport: "🏋️" },
  "leg curl": { name: "Leg curl", volume: "3x12", intensity: "@ 40kg", date: "il y a 1 sem.", sport: "🏋️" },
  "mollets debout": { name: "Mollets debout", volume: "4x15", intensity: "@ 60kg", date: "il y a 1 sem.", sport: "🏋️" },
  "tirage horizontal": { name: "Tirage horizontal", volume: "4x10", intensity: "@ 60kg", date: "il y a 1 sem.", sport: "🏋️" },
  "tirage vertical": { name: "Tirage vertical", volume: "4x10", intensity: "@ 55kg", date: "il y a 1 sem.", sport: "🏋️" },
  "curl biceps": { name: "Curl biceps barre", volume: "3x12", intensity: "@ 30kg", date: "il y a 1 sem.", sport: "🏋️" },
  "curl marteau": { name: "Curl marteau", volume: "3x12", intensity: "@ 14kg", date: "il y a 1 sem.", sport: "🏋️" },
  "développé incliné": { name: "Développé incliné haltères", volume: "4x10", intensity: "@ 28kg", date: "il y a 1 sem.", sport: "🏋️" },
  "écarté couché": { name: "Écarté couché", volume: "3x12", intensity: "@ 14kg", date: "il y a 1 sem.", sport: "🏋️" },
  "élévations latérales": { name: "Élévations latérales", volume: "4x15", intensity: "@ 8kg", date: "il y a 1 sem.", sport: "🏋️" },
  "oiseau": { name: "Oiseau", volume: "3x15", intensity: "@ 6kg", date: "il y a 1 sem.", sport: "🏋️" },
  "shrugs": { name: "Shrugs", volume: "3x12", intensity: "@ 60kg", date: "il y a 2 sem.", sport: "🏋️" },
  "extension triceps": { name: "Extension triceps poulie", volume: "3x12", intensity: "@ 25kg", date: "il y a 1 sem.", sport: "🏋️" },
  "rowing haltère": { name: "Rowing haltère (un bras)", volume: "4x10", intensity: "@ 24kg", date: "il y a 1 sem.", sport: "🏋️" },
  "tractions lestées": { name: "Tractions lestées", volume: "4x6", intensity: "+15kg", date: "il y a 1 sem.", sport: "💪" },

  // ── Puissance / explosivité ──
  "push press": { name: "Push press", volume: "4x3", intensity: "@ 70kg", date: "il y a 1 sem.", sport: "🏋️" },
  "squat jump": { name: "Squat jump", volume: "5x5", intensity: "chargé léger", date: "il y a 1 sem.", sport: "⬆️" },
  "fentes sautées": { name: "Fentes sautées", volume: "4x10", intensity: "max", date: "il y a 1 sem.", sport: "⬆️" },
  "gammes techniques": { name: "Gammes techniques", volume: "4x20m", intensity: "technique", date: "il y a 4 jours", sport: "🏃" },
  "départs blocs": { name: "Départs blocs", volume: "6x", intensity: "max", date: "il y a 4 jours", sport: "🏃" },
  "montées de genoux": { name: "Montées de genoux", volume: "4x20m", intensity: "technique", date: "il y a 1 sem.", sport: "🏃" },
  "talons-fesses": { name: "Talons-fesses", volume: "4x20m", intensity: "technique", date: "il y a 1 sem.", sport: "🏃" },
  "foulées bondissantes": { name: "Foulées bondissantes", volume: "5x30m", intensity: "max", date: "il y a 1 sem.", sport: "🏃" },
  "skipping": { name: "Skipping", volume: "4x20m", intensity: "technique", date: "il y a 1 sem.", sport: "🏃" },
  "détente verticale": { name: "Détente verticale", volume: "5x", intensity: "max", date: "il y a 2 sem.", sport: "⬆️" },

  // ── Sports collectifs — compléments ──
  "changement de direction": { name: "Changements de direction", volume: "6x", intensity: "max", date: "il y a 1 sem.", sport: "⚽" },
  "yo-yo test": { name: "Yo-Yo test", volume: "1x", intensity: "max", date: "il y a 3 sem.", sport: "⚽" },
  "navettes": { name: "Navettes", volume: "8x20m", intensity: "max", date: "il y a 1 sem.", sport: "⚽" },

  // ── Fitness / CrossFit ──
  "thrusters": { name: "Thrusters", volume: "21-15-9", intensity: "@ 40kg", date: "il y a 1 sem.", sport: "🏋️" },
  "wall balls": { name: "Wall balls", volume: "3x15", intensity: "@ 9kg", date: "il y a 1 sem.", sport: "🏋️" },
  "kettlebell swings": { name: "Kettlebell swings", volume: "5x15", intensity: "@ 24kg", date: "il y a 1 sem.", sport: "🏋️" },
  "burpees": { name: "Burpees", volume: "5x10", intensity: "max", date: "il y a 1 sem.", sport: "💪" },
  "mountain climbers": { name: "Mountain climbers", volume: "4x30s", intensity: "max", date: "il y a 1 sem.", sport: "💪" },
  "double unders": { name: "Double unders", volume: "5x30", intensity: "technique", date: "il y a 1 sem.", sport: "💪" },
  "ab wheel": { name: "Ab wheel", volume: "4x10", intensity: null, date: "il y a 1 sem.", sport: "💪" },
  "fran": { name: "Fran", volume: "21-15-9", intensity: "@ 43kg + tractions", date: "il y a 2 sem.", sport: "🏋️" },
  "cindy": { name: "Cindy", volume: "AMRAP 20min", intensity: "5 tractions-10 pompes-15 squats", date: "il y a 2 sem.", sport: "💪" },
  "murph": { name: "Murph", volume: "1x", intensity: "1mi-100T-200P-300S-1mi", date: "il y a 4 sem.", sport: "💪" },
  "grace": { name: "Grace", volume: "30 reps", intensity: "@ 61kg C&J", date: "il y a 3 sem.", sport: "🏋️" },

  // ── Hyrox ──
  "sled push": { name: "Sled push", volume: "4x20m", intensity: "lourd", date: "il y a 1 sem.", sport: "🏋️" },
  "sled pull": { name: "Sled pull", volume: "4x20m", intensity: "lourd", date: "il y a 1 sem.", sport: "🏋️" },
  "farmers carry": { name: "Farmers carry", volume: "4x40m", intensity: "@ 32kg/main", date: "il y a 1 sem.", sport: "🏋️" },
  "burpee broad jump": { name: "Burpee broad jumps", volume: "5x10", intensity: "max", date: "il y a 1 sem.", sport: "💪" },

  // ── Arts martiaux & combat ──
  "shadow boxing": { name: "Shadow boxing", volume: "6x3min", intensity: "technique", date: "il y a 1 sem.", sport: "🥊" },
  "sparring": { name: "Sparring", volume: "5x3min", intensity: "contrôlé", date: "il y a 1 sem.", sport: "🥊" },
  "corde à sauter": { name: "Corde à sauter", volume: "10x1min", intensity: "max", date: "il y a 1 sem.", sport: "🥊" },
  "médecine ball": { name: "Médecine ball throws", volume: "4x10", intensity: "@ 5kg", date: "il y a 1 sem.", sport: "🥊" },
  "sac de frappe": { name: "Enchaînements au sac", volume: "6x2min", intensity: "technique", date: "il y a 1 sem.", sport: "🥊" },

  // ── Endurance / course à pied ──
  "course": { name: "Course à pied", volume: "45 min", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏃" },
  "endurance fondamentale": { name: "Endurance fondamentale", volume: "50 min", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏃" },
  "sortie longue": { name: "Sortie longue", volume: "80 min", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏃" },
  "seuil": { name: "Seuil lactique", volume: "3x8 min", intensity: "allure seuil", date: "il y a 1 sem.", sport: "🏃" },
  "côtes": { name: "Côtes", volume: "8x30s", intensity: "max", date: "il y a 1 sem.", sport: "🏃" },
  "récupération active": { name: "Récupération active", volume: "30 min", intensity: "très facile", date: "il y a 2 jours", sport: "🏃" },
  "foulées éducatives": { name: "Foulées éducatives", volume: "6x80m", intensity: "technique", date: "il y a 1 sem.", sport: "🏃" },
  "vma": { name: "Test VMA (demi-Cooper)", volume: "1x6min", intensity: "max", date: "il y a 3 sem.", sport: "🏃" },

  // ── Trail ──
  "technique de descente": { name: "Technique de descente", volume: "20 min", intensity: "technique", date: "il y a 1 sem.", sport: "🏃" },
  "marche rapide en côte": { name: "Marche rapide en côte", volume: "30 min", intensity: "zone 3", date: "il y a 1 sem.", sport: "🏃" },

  // ── Triathlon ──
  "natation continue": { name: "Natation continue", volume: "2km", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏊" },
  "brick": { name: "Brick (vélo+course)", volume: "1x", intensity: "allure cible", date: "il y a 1 sem.", sport: "🚴" },

  // ── Cyclisme ──
  "cadence": { name: "Travail de cadence (100rpm)", volume: "5x5min", intensity: "zone 2", date: "il y a 1 sem.", sport: "🚴" },
  "ftp": { name: "Test FTP 20min", volume: "1x20min", intensity: "max soutenu", date: "il y a 4 sem.", sport: "🚴" },
  "sprint vélo": { name: "Sprints all-out", volume: "8x15s", intensity: "max", date: "il y a 1 sem.", sport: "🚴" },

  // ── Natation ──
  "catch-up crawl": { name: "Drill catch-up crawl", volume: "8x50m", intensity: "technique", date: "il y a 1 sem.", sport: "🏊" },
  "nage avec palmes": { name: "Nage avec palmes", volume: "6x100m", intensity: "zone 2", date: "il y a 1 sem.", sport: "🏊" },
  "virages": { name: "Travail de virage", volume: "10x", intensity: "technique", date: "il y a 1 sem.", sport: "🏊" },

  // ── Ski ──
  "chaise au mur": { name: "Chaise au mur", volume: "5x45s", intensity: null, date: "il y a 1 sem.", sport: "⛷️" },
  "squat bulgare": { name: "Squat bulgare", volume: "4x10/jambe", intensity: "@ 16kg", date: "il y a 1 sem.", sport: "⛷️" },
  "fentes latérales": { name: "Fentes latérales dynamiques", volume: "4x10", intensity: null, date: "il y a 1 sem.", sport: "⛷️" },

  // ── Aviron ──
  "rameur technique": { name: "Rameur technique", volume: "20 min", intensity: "technique", date: "il y a 1 sem.", sport: "🚣" },
  "rameur intervalles": { name: "Rameur intervalles", volume: "6x500m", intensity: "@ seuil", date: "il y a 1 sem.", sport: "🚣" },
  "rameur sprint": { name: "Rameur sprint", volume: "8x250m", intensity: "max", date: "il y a 1 sem.", sport: "🚣" },

  // ── Gymnastique / Calisthenics — compléments ──
  "front lever": { name: "Front lever (progression)", volume: "5x10s", intensity: null, date: "il y a 2 sem.", sport: "💪" },
  "pistol squat": { name: "Squat pistol assisté", volume: "4x6/jambe", intensity: null, date: "il y a 1 sem.", sport: "💪" },
  "planche": { name: "Planche", volume: "5x20s", intensity: null, date: "il y a 1 sem.", sport: "💪" },
  "pompes archer": { name: "Pompes archer", volume: "4x8/côté", intensity: null, date: "il y a 1 sem.", sport: "💪" },
  "ring dips": { name: "Dips en anneau", volume: "4x8", intensity: "BW", date: "il y a 1 sem.", sport: "💪" },
  "hollow body": { name: "Gainage en suspension (hollow body)", volume: "5x20s", intensity: null, date: "il y a 1 sem.", sport: "💪" },

  // ── Athlétisme — sauts ──
  "multibonds": { name: "Multibonds", volume: "6x5", intensity: "max", date: "il y a 1 sem.", sport: "⬆️" },

  // ── Rééducation ──
  "pont fessier": { name: "Pont fessier", volume: "3x15", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "clamshell": { name: "Clamshell", volume: "3x15/côté", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "band walk": { name: "Band walk latéral", volume: "3x10/côté", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "step-down": { name: "Step-down contrôlé", volume: "3x10/jambe", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "wall sit": { name: "Wall sit", volume: "4x30s", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "nordic hamstring": { name: "Nordic Hamstring Exercise", volume: "3x6", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "bird-dog": { name: "Bird-dog", volume: "3x10/côté", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "dead bug": { name: "Dead bug", volume: "3x10/côté", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "excentrique mollet": { name: "Excentrique mollet (protocole Alfredson)", volume: "3x15", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "proprioception": { name: "Proprioception unipodale", volume: "3x30s/jambe", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
  "rotateurs externes": { name: "Rotation externe élastique", volume: "3x15", intensity: null, date: "il y a 1 sem.", sport: "🧘" },
};

export const HISTORY_KEYS = Object.keys(HISTORY).sort((a, b) => b.length - a.length);

/* ── Historique réel de l'utilisateur (dernières séances faites), fusionné par-dessus la base
   statique — priorité aux exercices réellement pratiqués récemment. État module-level volontaire :
   un seul éditeur d'exercices (AddSessionModal/CoachSessionModal) est jamais monté à la fois dans
   l'app (modales), donc pas de risque de fuite entre utilisateurs en pratique. Réinitialisé au
   démontage de l'éditeur (resetUserHistory) pour ne jamais laisser traîner l'historique d'un
   sportif/athlète précédent. ──*/
let ACTIVE_HISTORY: Record<string, HistoryEntry> = HISTORY;
let ACTIVE_HISTORY_KEYS: string[] = HISTORY_KEYS;
let ACTIVE_USER_KEYS = new Set<string>();

export function setUserHistory(entries: Record<string, HistoryEntry>) {
  ACTIVE_HISTORY = { ...HISTORY, ...entries };
  ACTIVE_USER_KEYS = new Set(Object.keys(entries));
  ACTIVE_HISTORY_KEYS = Object.keys(ACTIVE_HISTORY).sort((a, b) => {
    const aUser = ACTIVE_USER_KEYS.has(a);
    const bUser = ACTIVE_USER_KEYS.has(b);
    if (aUser !== bUser) return aUser ? -1 : 1; // les vraies séances passent devant la base statique
    return b.length - a.length;
  });
}

export function resetUserHistory() {
  ACTIVE_HISTORY = HISTORY;
  ACTIVE_HISTORY_KEYS = HISTORY_KEYS;
  ACTIVE_USER_KEYS = new Set();
}

const VOLUME_TOKEN_RE = /\d+\s*[xX×]\s*\d+[\w]*|\d+\s*(OTM|EMOM|AMRAP)\b|\d+\s*min\b|\d+\s*h\d*|\d+\s*(km|m)\b/i;
const INTENSITY_TOKEN_RE = /@\s*\d+(?:[.,]\d+)?\s*(kg)?|RPE\s*\d+(?:\.\d+)?|\d+\s*kg\b|\d+\s*%/i;

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr + "T12:00:00").getTime();
  const days = Math.round(diffMs / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 14) return `il y a ${days} jours`;
  return `il y a ${Math.round(days / 7)} sem.`;
}

// Distance/durée/allure en tête de ligne — plus spécifique en premier dans l'alternance ("min"
// avant "m", "sec(ondes)?" avant "s") pour ne jamais matcher un préfixe trop court par erreur.
const LEADING_QUANTITY_RE = /^(\d+(?:[.,]\d+)?\s*(?:km|min|h\d*|sec(?:ondes?)?|s|m)\b|\d+:\d+\s*\/\s*km)/i;

function extractNameCandidate(line: string): string | null {
  const m = line.match(/^([^\d]+)/);
  if (m) {
    const name = m[1].trim().replace(/[-–:·]+$/, "").trim();
    if (name.length >= 2 && name.split(/\s+/).length <= 5) return name;
  }
  // Une ligne qui commence directement par une distance/durée/allure ("400m", "30 min", "4:30/km")
  // est fréquente en course à pied/natation/vélo — ce token EST l'identité de l'exercice, pas
  // juste son volume : sans ce cas, ces lignes ne s'apprenaient jamais (aucun préfixe non-chiffré).
  const lead = line.match(LEADING_QUANTITY_RE);
  if (lead) return lead[1].replace(/\s+/g, " ").trim();
  return null;
}

/** Construit un dictionnaire d'historique à partir des vraies séances de l'utilisateur (les plus
    récentes en premier) — un exercice déjà connu de la base statique récupère son nom canonique et
    son emoji sport ; un exercice inconnu devient suggérable via son propre libellé tel que tapé. */
export function buildUserHistory(sessions: { notes: string | null; date: string }[]): Record<string, HistoryEntry> {
  const dict: Record<string, HistoryEntry> = {};
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const s of sorted) {
    if (!s.notes) continue;
    for (const line of s.notes.split("\n")) {
      if (!line.trim()) continue;
      const lower = line.toLowerCase();
      let canonicalName: string | null = null;
      let sport = "📊";
      for (const key of HISTORY_KEYS) {
        if (lower.includes(key)) { canonicalName = HISTORY[key].name; sport = HISTORY[key].sport; break; }
      }
      const name = canonicalName ?? extractNameCandidate(line);
      if (!name) continue;
      const key = name.toLowerCase();
      if (dict[key]) continue; // déjà vu une occurrence plus récente
      const volumeMatch = line.match(VOLUME_TOKEN_RE);
      const intensityMatch = line.match(INTENSITY_TOKEN_RE);
      dict[key] = {
        name,
        volume: volumeMatch ? volumeMatch[0].trim() : null,
        intensity: intensityMatch ? intensityMatch[0].trim() : null,
        date: formatRelativeDate(s.date),
        sport,
      };
    }
  }
  return dict;
}

function normalizeVol(v: string) {
  return v.toLowerCase().replace(/\s+/g, "").replace(/[×x]/g, "x");
}

function detectVolume(line: string) {
  return (
    /\d+\s*[xX×]\s*\d+/.test(line) ||
    /\d+\s*(OTM|EMOM|AMRAP)\b/i.test(line) ||
    /\d+\s*(rounds?|reps?)\b/i.test(line) ||
    /\d+\s*min\b/i.test(line) ||
    /\d+\s*h\d*/i.test(line) ||
    /\d+\s*(km|m)\b/i.test(line) ||
    /\d+\s*(voies?|blocs?)\b/i.test(line)
  );
}

function detectIntensity(line: string) {
  return (
    /@\s*\d/.test(line) ||
    /RPE\s*\d/i.test(line) ||
    /\d+\s*kg\b/i.test(line) ||
    /\d+\s*%/.test(line) ||
    /[+-]\d+\s*kg/i.test(line) ||
    /\bBW\b/i.test(line) ||
    /\bzone\s*\d/i.test(line) ||
    /\b[5-9][abc][+]?\b/i.test(line) ||
    /\d+:\d+/.test(line) ||
    /\b(max|facile|modéré|libre|haute\s*intensité|intensité\s*haute)\b/i.test(line)
  );
}

function detectName(lower: string): string | null {
  for (const key of ACTIVE_HISTORY_KEYS) {
    if (lower.includes(key)) return key;
  }
  return null;
}

function analyzeLineContext(fullLine: string) {
  const lower = fullLine.toLowerCase();
  const nameKey = detectName(lower);
  const hasVolume = detectVolume(fullLine);
  const hasIntensity = detectIntensity(fullLine);
  return { nameKey, hasVolume, hasIntensity, exercise: nameKey ? ACTIVE_HISTORY[nameKey] : null };
}

function extractVolumeText(line: string): string | null {
  const m = line.match(/\d+\s*[xX×]\s*\d+[\w]*|\d+\s*(OTM|EMOM|AMRAP)\b|\d+\s*min\b|\d+\s*h\d*/i);
  return m ? m[0].trim() : null;
}

/* Aucun ordre de tokens imposé : chaque suggestion ne dépend que de sa propre absence sur la
   ligne, jamais de la présence des autres. "Back squat @ 150kg" (intensité tapée avant le volume)
   suggère quand même le volume manquant ; "@ 150kg" seul puis complété par un nom plus tard
   fonctionne pareil, la ligne entière est ré-analysée à chaque frappe. Volume puis intensité
   reste juste l'ordre par défaut quand rien n'est encore tapé (résolution de priorité, pas une
   contrainte). */
function suggestNextToken(ctx: ReturnType<typeof analyzeLineContext>, fullLine: string): TokenSuggestion[] {
  const h = ctx.exercise;

  if (h && !ctx.hasVolume && h.volume) {
    return [{ type: "volume", value: h.volume, label: h.volume, meta: "← " + h.name + " · " + h.date, icon: h.sport || "📊", next: true }];
  }
  if (h && !ctx.hasIntensity && h.intensity) {
    return [{ type: "intensity", value: h.intensity, label: h.intensity, meta: "← " + h.name + " · " + h.date, icon: h.sport || "⚡", next: true }];
  }

  // Volume tapé mais exercice non reconnu (ou personnalisé) : impossible de deviner le nom, mais
  // le volume seul permet de recouper l'historique pour une intensité plausible.
  if (!ctx.nameKey && ctx.hasVolume && !ctx.hasIntensity) {
    const vt = extractVolumeText(fullLine);
    if (vt) {
      const results: TokenSuggestion[] = [];
      const seen = new Set<string>();
      Object.values(ACTIVE_HISTORY).forEach(hh => {
        if (!hh.intensity || !hh.volume) return;
        if (normalizeVol(hh.volume).includes(normalizeVol(vt)) && !seen.has(hh.intensity)) {
          seen.add(hh.intensity);
          results.push({ type: "intensity", value: hh.intensity, label: hh.intensity, meta: hh.name, icon: hh.sport || "⚡", next: true });
        }
      });
      if (results.length) return results.slice(0, 4);
    }
  }

  // Volume + intensité déjà présents (avec ou sans nom reconnu — un exercice personnalisé compte
  // tout autant) : propose des contraintes usuelles.
  if (ctx.hasVolume && ctx.hasIntensity) {
    const commonConstraints: TokenSuggestion[] = [
      { type: "constraint", value: "RIR 2", label: "RIR 2", meta: "reps en réserve", icon: "🎯", next: true },
      { type: "constraint", value: "RPE 8", label: "RPE 8", meta: "effort perçu", icon: "💪", next: true },
      { type: "constraint", value: "à l'échec", label: "à l'échec", meta: "gestion échec", icon: "🛑", next: true },
      { type: "constraint", value: "par jambe", label: "par jambe", meta: "côté / alternance", icon: "↔️", next: true },
    ];
    return commonConstraints.slice(0, 2);
  }

  return [];
}

function completeNxM(n: number, partial: string, _ctx: ReturnType<typeof analyzeLineContext>): TokenSuggestion[] {
  const prefix = `${n}x`;
  const seen = new Set<string>();
  const results: TokenSuggestion[] = [];
  Object.values(ACTIVE_HISTORY).forEach(h => {
    if (!h.volume) return;
    const vn = normalizeVol(h.volume);
    if (vn.startsWith(prefix) && (!partial || vn.slice(prefix.length).startsWith(partial.toLowerCase()))) {
      if (!seen.has(h.volume)) {
        seen.add(h.volume);
        const meta = [h.name, h.intensity].filter(Boolean).join(" · ");
        results.push({ type: "volume", value: h.volume, label: h.volume, meta, icon: h.sport || "🔢" });
      }
    }
  });
  [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30].forEach(r => {
    const val = `${n}x${r}`;
    if (!seen.has(val) && (!partial || String(r).startsWith(partial))) {
      seen.add(val);
      results.push({ type: "volume", value: val, label: val, meta: "séries × reps", icon: "🔢" });
    }
  });
  return results.filter(r => normalizeVol(r.value) !== `${n}x${partial || ""}` || !partial).slice(0, 8);
}

function completeAtIntensity(numPart: string, ctx: ReturnType<typeof analyzeLineContext> | null): TokenSuggestion[] {
  const seen = new Set<string>();
  const results: TokenSuggestion[] = [];
  if (ctx && ctx.exercise && ctx.exercise.intensity && ctx.exercise.intensity.startsWith("@")) {
    const val = ctx.exercise.intensity.trim();
    const numInVal = val.replace(/^@\s*/, "");
    if (!numPart || numInVal.startsWith(numPart)) {
      seen.add(val);
      results.push({ type: "intensity", value: val, label: val, meta: ctx.exercise.name + " · historique", icon: ctx.exercise.sport || "⚡" });
    }
  }
  Object.values(ACTIVE_HISTORY).forEach(h => {
    if (!h.intensity || !h.intensity.includes("@")) return;
    const val = h.intensity.trim();
    const numInVal = val.replace(/^@\s*/, "");
    if ((!numPart || numInVal.startsWith(numPart)) && !seen.has(val)) {
      seen.add(val);
      results.push({ type: "intensity", value: val, label: val, meta: h.name, icon: h.sport || "⚡" });
    }
  });
  [40, 50, 60, 65, 70, 75, 80, 82, 85, 87, 90, 92, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160, 170, 180].forEach(w => {
    const val = `@ ${w}`;
    if (!seen.has(val) && (!numPart || String(w).startsWith(numPart))) {
      seen.add(val);
      results.push({ type: "intensity", value: val, label: val, meta: "charge libre", icon: "⚡" });
    }
  });
  return results.slice(0, 8);
}

/** Génère des valeurs "proches" d'une base numérique (± plusieurs paliers), triées par distance
    croissante — utilisé en mode click pour proposer des alternatives voisines plutôt qu'une liste
    filtrée par préfixe (qui n'a de sens qu'en train de taper) ou une liste fixe non triée. */
function nearbyValues(base: number, steps: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  steps.forEach(s => {
    [base - s, base + s].forEach(v => {
      if (v <= 0) return;
      const rounded = Math.round(v * 2) / 2;
      if (seen.has(rounded)) return;
      seen.add(rounded);
      out.push(rounded);
    });
  });
  return out.sort((a, b) => Math.abs(a - base) - Math.abs(b - base));
}

function formatKg(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1).replace(".", ",");
}

/** Click sur une charge kg (ex. "@ 80" ou "80kg") → propose des charges voisines, pas un filtre
    par préfixe (qui n'aurait presque jamais de résultat sur une valeur déjà complète). */
function completeAtIntensityNear(baseVal: number): TokenSuggestion[] {
  const steps = baseVal >= 100 ? [5, 10, 15, 20] : baseVal >= 40 ? [2.5, 5, 7.5, 10] : [1, 2, 2.5, 5];
  return nearbyValues(baseVal, steps).slice(0, 8).map(v => {
    const str = formatKg(v);
    return { type: "intensity" as const, value: `@ ${str}`, label: `@ ${str}`, meta: "charge proche", icon: "⚡" };
  });
}

/** Click sur un NxM (ex. "3x3") → fait varier séries ET reps (pas seulement les reps comme en
    mode frappe), alterné pour proposer les deux dimensions dès les premiers résultats. */
function completeNxMNear(sets: number, reps: number): TokenSuggestion[] {
  const seen = new Set<string>();
  const results: TokenSuggestion[] = [];
  const add = (s: number, r: number) => {
    if (s < 1 || r < 1) return;
    const val = `${s}x${r}`;
    if (seen.has(val)) return;
    seen.add(val);
    results.push({ type: "volume", value: val, label: val, meta: "séries × reps", icon: "🔢" });
  };
  [1, -1, 2, -2].forEach(d => { add(sets, reps + d); add(sets + d, reps); });
  return results.slice(0, 8);
}

function completeVolumeFromNumber(numStr: string, ctx: ReturnType<typeof analyzeLineContext>): TokenSuggestion[] {
  const seen = new Set<string>();
  const results: TokenSuggestion[] = [];
  if (ctx.exercise && ctx.exercise.volume && ctx.exercise.volume.startsWith(numStr)) {
    const v = ctx.exercise.volume;
    seen.add(v);
    results.push({ type: "volume", value: v, label: v, meta: ctx.exercise.name + " · historique", icon: ctx.exercise.sport || "📊" });
  }
  Object.values(ACTIVE_HISTORY).forEach(h => {
    if (!h.volume || seen.has(h.volume)) return;
    if (h.volume.replace(/\s+/g, "").toLowerCase().startsWith(numStr.toLowerCase())) {
      seen.add(h.volume);
      results.push({ type: "volume", value: h.volume, label: h.volume, meta: h.name, icon: h.sport || "🔢" });
    }
  });
  return results.slice(0, 6);
}

function completeExerciseName(lower: string): TokenSuggestion[] {
  const seen = new Set<string>();
  const matches: TokenSuggestion[] = [];
  const tryAdd = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const h = ACTIVE_HISTORY[key];
    const meta = [h.volume, h.intensity, h.date].filter(Boolean).join(" · ");
    matches.push({ type: "name", value: h.name, label: h.name, meta, icon: h.sport || "" });
  };
  for (const key of ACTIVE_HISTORY_KEYS) {
    if (key.startsWith(lower) || ACTIVE_HISTORY[key].name.toLowerCase().startsWith(lower)) tryAdd(key);
    if (matches.length >= 6) break;
  }
  if (matches.length < 6) {
    for (const key of ACTIVE_HISTORY_KEYS) {
      if (key.includes(lower)) tryAdd(key);
      if (matches.length >= 6) break;
    }
  }
  return matches;
}

function completeRIR(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  return [0, 1, 2, 3, 4, 5]
    .map(r => ({ type: "constraint" as const, value: `RIR ${r}`, label: `RIR ${r}`, meta: "reps en réserve", icon: "🎯" }))
    .filter(r => r.value.toLowerCase() !== lower);
}
function sortByProximity<T extends { value: string }>(items: T[], target: number | null, extract: (v: string) => number | null): T[] {
  if (target === null) return items;
  return [...items].sort((a, b) => {
    const na = extract(a.value), nb = extract(b.value);
    if (na === null || nb === null) return 0;
    return Math.abs(na - target) - Math.abs(nb - target);
  });
}

function completeVitesse(token: string): TokenSuggestion[] {
  const speeds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0];
  const target = parseFloat(token.replace(",", ".")) || null;
  const results = speeds
    .map(s => ({ type: "constraint" as const, value: `${s} m/s`, label: `${s} m/s`, meta: "vitesse barre", icon: "⚡" }))
    .filter(r => r.value.replace(/\s/g, "") !== token.replace(/\s/g, ""));
  return sortByProximity(results, target, v => parseFloat(v));
}
function parseAllureSeconds(s: string): number | null {
  const m = s.match(/(\d+):(\d+)/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
function completeAllure(token: string): TokenSuggestion[] {
  const allures = ["3:00/km", "3:15/km", "3:30/km", "3:45/km", "4:00/km", "4:15/km", "4:30/km", "4:45/km", "5:00/km", "5:30/km", "6:00/km", "6:30/km"];
  const results = allures.map(a => ({ type: "constraint" as const, value: a, label: a, meta: "allure course", icon: "🏃" })).filter(r => r.value !== token);
  return sortByProximity(results, parseAllureSeconds(token), parseAllureSeconds);
}
function completeZone(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  const zones = [
    { v: "Z1", m: "récupération < 65% FC max" },
    { v: "Z2", m: "endurance 65–75% FC max" },
    { v: "Z3", m: "tempo 75–85% FC max" },
    { v: "Z4", m: "seuil 85–95% FC max" },
    { v: "Z5", m: "VO2max > 95% FC max" },
  ];
  return zones.map(z => ({ type: "constraint" as const, value: z.v, label: z.v, meta: z.m, icon: "❤️" })).filter(r => r.value.toLowerCase() !== lower);
}
const BPM_VALUES = [100, 110, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 200];
function completeBPM(numPart: string): TokenSuggestion[] {
  return BPM_VALUES
    .filter(b => !numPart || String(b).startsWith(numPart))
    .map(b => ({ type: "constraint" as const, value: `${b} bpm`, label: `${b} bpm`, meta: "fréquence cardiaque", icon: "❤️" }));
}
/** Click sur un BPM complet — le filtre par préfixe de completeBPM ne renvoie presque jamais rien
    sur une valeur déjà tapée en entier, donc on trie plutôt tout l'éventail par proximité. */
function completeBPMNear(target: number): TokenSuggestion[] {
  const results = BPM_VALUES
    .filter(b => b !== target)
    .map(b => ({ type: "constraint" as const, value: `${b} bpm`, label: `${b} bpm`, meta: "fréquence cardiaque", icon: "❤️" }));
  return sortByProximity(results, target, v => parseInt(v, 10));
}
function completeVMA(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  const vals = [70, 75, 80, 85, 90, 92, 95, 97, 100, 105, 110, 115];
  const target = parseInt(token, 10) || null;
  const results = vals
    .map(v => ({ type: "constraint" as const, value: `${v}% VMA`, label: `${v}% VMA`, meta: "vélocité max aérobie", icon: "🏃" }))
    .filter(r => r.value.toLowerCase() !== lower);
  return sortByProximity(results, target, v => parseInt(v, 10));
}
function parseReposSeconds(s: string): number | null {
  const m = s.match(/^(?:(\d+)')?(?:(\d+)")?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return parseInt(m[1] || "0", 10) * 60 + parseInt(m[2] || "0", 10);
}
function completeRepos(token: string): TokenSuggestion[] {
  const repos = ["30\"", "45\"", "1'", "1'15\"", "1'30\"", "1'45\"", "2'", "2'30\"", "3'", "3'30\"", "4'", "5'", "récup active", "repos complet"];
  const results = repos.map(r => ({ type: "constraint" as const, value: r, label: r, meta: "temps de repos", icon: "💤" })).filter(r => r.value !== token);
  return sortByProximity(results, parseReposSeconds(token), parseReposSeconds);
}
function completeTempo(token: string): TokenSuggestion[] {
  const tempos = ["3010", "3110", "3011", "2010", "2020", "3030", "4010", "4011", "1010", "2012", "3012", "explosif"];
  return tempos.map(t => ({ type: "constraint" as const, value: t, label: t, meta: "cadence (exc-cont-con-pause)", icon: "⏱️" })).filter(r => r.value !== token);
}
function completeEffort(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  const effs = [
    { v: "facile", m: "intensité basse" },
    { v: "modéré", m: "intensité modérée" },
    { v: "dur", m: "intensité élevée" },
    { v: "très dur", m: "intensité très élevée" },
    { v: "à fond", m: "effort maximal" },
    { v: "max", m: "maximal" },
    { v: "au feeling", m: "selon les sensations" },
  ];
  return effs.filter(e => e.v !== lower).map(e => ({ type: "constraint" as const, value: e.v, label: e.v, meta: e.m, icon: "💪" }));
}
function completeProgression(token: string): TokenSuggestion[] {
  const progs = ["+2.5 kg", "+5 kg", "+7.5 kg", "+10 kg", "-2.5 kg", "-5 kg", "progressif", "dégressif", "pyramidal", "monter progressivement"];
  return progs.map(p => ({ type: "constraint" as const, value: p, label: p, meta: "progression de charge", icon: "📈" })).filter(r => r.value !== token);
}
function completeEchec(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  const echs = ["à l'échec", "sans échec", "proche de l'échec", "1-2 reps de l'échec", "2-3 reps de l'échec"];
  return echs.filter(e => e !== lower).map(e => ({ type: "constraint" as const, value: e, label: e, meta: "gestion de l'échec", icon: "🛑" }));
}
function completeCote(token: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  const cotes = [
    { v: "par jambe", m: "unilatéral jambe" },
    { v: "par côté", m: "unilatéral côté" },
    { v: "unilatéral", m: "un côté à la fois" },
    { v: "bilatéral", m: "deux côtés en même temps" },
    { v: "alterné", m: "alternance gauche/droite" },
    { v: "A1", m: "superset A1" },
    { v: "A2", m: "superset A2" },
    { v: "B1", m: "superset B1" },
    { v: "B2", m: "superset B2" },
    { v: "en superset", m: "sans repos entre exercices" },
  ];
  return cotes.filter(c => c.v.toLowerCase() !== lower).map(c => ({ type: "constraint" as const, value: c.v, label: c.v, meta: c.m, icon: "↔️" }));
}

function tryConstraintSuggestions(token: string, isClickMode: boolean): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  if (!lower) return [];
  if (/^rir\s*\d?$/i.test(lower) || /^\d+\s*rir$/i.test(lower)) return completeRIR(token);
  if (/^\d[.,]\d*(\s*(m(\/s?)?)?)?$/i.test(lower) || /^\d[.,]\d+\s*m\/s$/i.test(lower)) return completeVitesse(token);
  if (/^\d+:\d*\/?k?m?$/i.test(lower)) return completeAllure(token);
  if (/^z\d?$/i.test(lower) || /^zone\s*\d?$/i.test(lower)) return completeZone(token);
  if (/^\d+\s*b(p(m?)?)?$/i.test(lower)) return completeBPM(lower.replace(/[^0-9]/g, ""));
  if (/^vma$/i.test(lower) || /^\d+%?\s*vma$/i.test(lower)) return completeVMA(token);
  if (/^\d+['"](\d*['"]?)?$/.test(lower) || /^\d+\s*(min\s*)?(repos|récup)$/i.test(lower)) return completeRepos(token);
  if (/^[1-5]\d{2,3}$/.test(lower)) return completeTempo(token);
  if (/^(faci|modé|dur|très|à fo|à l'|au fe)/.test(lower)) return completeEffort(token);
  if (/^\+\d/.test(lower)) return completeProgression(token);
  if (/^(l'é|éche|sans\s*é|proche)/.test(lower)) return completeEchec(token);
  if (/^(par\s|unilat|bilat|alter|super|[ab][12])/.test(lower)) return completeCote(token);
  if (isClickMode) {
    if (/^\d{4}$/.test(lower)) return completeTempo(token);
    if (/^\d+\s*bpm$/i.test(lower)) return completeBPMNear(parseInt(lower, 10));
    if (/^\d+%\s*vma$/i.test(lower)) return completeVMA(token);
    if (/^\d+'\d+"?$/i.test(lower) || /^\d+"$/.test(lower)) return completeRepos(token);
    if (/^(facile|modéré|dur|très dur|à fond|max|au feeling)$/i.test(lower)) return completeEffort(token);
    if (/^\+\d+(\.\d+)?\s*kg$/i.test(lower)) return completeProgression(token);
    if (/^(à l'échec|sans échec|proche de l'échec)$/i.test(lower)) return completeEchec(token);
    if (/^(par jambe|par côté|unilatéral|bilatéral|alterné|en superset|[ab][12])$/i.test(lower)) return completeCote(token);
    if (/^\d[.,]\d+\s*m\/s$/i.test(lower)) return completeVitesse(token);
    if (/^\d+:\d+\/km$/i.test(lower)) return completeAllure(token);
    if (/^z\d$/i.test(lower)) return completeZone(token);
  }
  return [];
}

/** Mode A (frappe) + Mode B (token suivant sur ligne vide/espace). */
export function generateSuggestions(currentToken: string, fullLine: string): TokenSuggestion[] {
  const lower = currentToken.toLowerCase().trim();
  const ctx = analyzeLineContext(fullLine);

  if (!lower) return suggestNextToken(ctx, fullLine);

  const volNxM = currentToken.match(/^(\d+)\s*[xX×](\d*)$/);
  if (volNxM) return completeNxM(parseInt(volNxM[1], 10), volNxM[2], ctx);

  if (/^@\s*\d*$/.test(currentToken.trim())) return completeAtIntensity(currentToken.replace("@", "").trim(), ctx);

  if (/^rpe\s*\d?$/i.test(lower)) {
    const np = lower.replace(/^rpe\s*/i, "");
    return [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
      .filter(r => !np || String(r).startsWith(np))
      .slice(0, 6)
      .map(r => ({ type: "intensity" as const, value: `RPE ${r}`, label: `RPE ${r}`, meta: "effort perçu", icon: "💪" }));
  }

  const constraintSugg = tryConstraintSuggestions(currentToken, false);
  if (constraintSugg.length) return constraintSugg;

  if (ctx.nameKey) {
    const keyWords = ctx.nameKey.split(" ");
    const lastWord = keyWords[keyWords.length - 1];
    if (lastWord.startsWith(lower)) return suggestNextToken(ctx, fullLine);
  }

  if (/^\d+$/.test(currentToken) && ctx.nameKey && !ctx.hasVolume) return completeVolumeFromNumber(currentToken, ctx);

  if (!/^\d/.test(lower) && lower.length >= 1) return completeExerciseName(lower);

  return [];
}

/** Click-to-edit : alternatives pour remplacer un token déjà complet. */
export function generateSuggestionsClickMode(token: string, fullLine: string): TokenSuggestion[] {
  const lower = token.toLowerCase().trim();
  if (!lower) return [];
  const ctx = analyzeLineContext(fullLine);
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "").replace(/[×x]/g, "x");

  const volNxM = token.match(/^(\d+)\s*[xX×]\s*(\d+)/);
  if (volNxM) {
    const sets = parseInt(volNxM[1], 10);
    const reps = parseInt(volNxM[2], 10);
    return completeNxMNear(sets, reps);
  }

  if (/^@\s*\d/.test(token.trim())) {
    const baseVal = parseFloat(token.replace("@", "").replace(",", ".").trim());
    if (!isNaN(baseVal)) return completeAtIntensityNear(baseVal);
  }
  if (/^@/.test(token.trim())) {
    const all = completeAtIntensity("", ctx);
    return all.filter(r => norm(r.value) !== norm(token));
  }

  if (/^\d/.test(token) && /kg$/i.test(token.trim())) {
    const baseVal = parseFloat(token.replace(/kg/i, "").replace(",", ".").trim());
    if (!isNaN(baseVal)) return completeAtIntensityNear(baseVal);
  }

  if (/^\d+\s*%$/.test(token)) {
    const n = parseInt(token, 10);
    const results = [70, 75, 80, 82, 85, 87, 90, 92, 95, 97, 100, 102, 105]
      .filter(v => v !== n)
      .map(v => ({ type: "intensity" as const, value: `${v}%`, label: `${v}%`, meta: "intensité relative", icon: "⚡" }));
    return sortByProximity(results, n, v => parseInt(v, 10));
  }

  if (/^rpe/i.test(lower)) {
    return [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
      .map(r => ({ type: "intensity" as const, value: `RPE ${r}`, label: `RPE ${r}`, meta: "effort perçu", icon: "💪" }))
      .filter(r => r.value.toLowerCase() !== lower);
  }

  const constraintClick = tryConstraintSuggestions(token, true);
  if (constraintClick.length) return constraintClick;

  if (!/^\d/.test(lower)) {
    const words = lower.split(/\s+/).filter(w => w.length >= 3);
    const keyword = words.length ? words[words.length - 1] : lower;
    const seenNames = new Set<string>();
    const results: TokenSuggestion[] = [];
    for (const key of ACTIVE_HISTORY_KEYS) {
      const h = ACTIVE_HISTORY[key];
      const nameLow = h.name.toLowerCase();
      if (nameLow === lower) continue;
      if (!key.includes(keyword) && !nameLow.includes(keyword)) continue;
      if (seenNames.has(nameLow)) continue;
      seenNames.add(nameLow);
      const meta = [h.volume, h.intensity, h.date].filter(Boolean).join(" · ");
      results.push({ type: "name", value: h.name, label: h.name, meta, icon: h.sport || "" });
      if (results.length >= 6) break;
    }
    return results;
  }

  if (/^\d+$/.test(token) && ctx.nameKey) {
    return completeVolumeFromNumber(token, ctx).filter(r => norm(r.value) !== norm(token));
  }

  return [];
}

/** Token à gauche du curseur (mode frappe), dans une textarea multi-lignes — une ligne = un exercice. */
export function getCurrentToken(text: string, pos: number): { currentToken: string; fullLine: string; tokenStart: number; lineStart: number } {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const lineText = text.slice(lineStart, pos);
  const fullLine = lineText.trim();
  const spaceIdx = lineText.lastIndexOf(" ");
  const tokenStart = lineStart + (spaceIdx === -1 ? 0 : spaceIdx + 1);
  return { currentToken: text.slice(tokenStart, pos), fullLine, tokenStart, lineStart };
}

/** Token complet sous le curseur (mode click) — étend gauche ET droite jusqu'aux bornes de la ligne. */
export function getFullTokenAtCursor(text: string, pos: number): { currentToken: string; fullLine: string; tokenStart: number; tokenEnd: number; lineStart: number } {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nlRight = text.indexOf("\n", pos);
  const lineEndPos = nlRight === -1 ? text.length : nlRight;
  const lineTextLeft = text.slice(lineStart, pos);
  const spaceIdx = lineTextLeft.lastIndexOf(" ");
  const tokenStart = lineStart + (spaceIdx === -1 ? 0 : spaceIdx + 1);
  let tokenEnd = pos;
  while (tokenEnd < lineEndPos && text[tokenEnd] !== " ") tokenEnd++;
  const currentToken = text.slice(tokenStart, tokenEnd);
  const fullLine = text.slice(lineStart, lineEndPos).trim();
  return { currentToken, fullLine, tokenStart, tokenEnd, lineStart };
}

/**
 * Résout le token cliqué en tenant compte des cas particuliers du POC :
 * - cliquer sur "@" seul étend à droite pour inclure la valeur ("@ 125kg")
 * - cliquer au milieu d'un nom d'exercice multi-mots ("Back |squat") étend sur le nom complet
 * Retourne null si le curseur est sur un espace en ligne vide (rien à éditer).
 */
export function getClickToken(text: string, pos: number): { token: string; tokenStart: number; tokenEnd: number; fullLine: string } | null {
  const full = getFullTokenAtCursor(text, pos);
  let { currentToken, tokenStart, tokenEnd, fullLine, lineStart } = full;
  if (!fullLine.trim()) return null;

  let token = currentToken.trim();

  if (token === "@") {
    let ext = tokenEnd;
    while (ext < text.length && text[ext] === " ") ext++;
    const wEnd = text.indexOf(" ", ext);
    const nextTokenEnd = wEnd === -1 ? text.length : wEnd;
    if (ext < nextTokenEnd) {
      tokenEnd = nextTokenEnd;
      token = text.slice(tokenStart, tokenEnd).trim();
    }
  }

  if (!token) return null;

  if (!/^\d/.test(token) && token !== "@") {
    const ctx = analyzeLineContext(fullLine);
    if (ctx.nameKey && ctx.nameKey.length > token.length) {
      const nlRight = text.indexOf("\n", lineStart);
      const rawLine = text.slice(lineStart, nlRight === -1 ? text.length : nlRight);
      const nameIdx = rawLine.toLowerCase().indexOf(ctx.nameKey);
      if (nameIdx !== -1) {
        const nameAbsStart = lineStart + nameIdx;
        const nameAbsEnd = nameAbsStart + ctx.nameKey.length;
        if (tokenStart >= nameAbsStart && tokenEnd <= nameAbsEnd) {
          tokenStart = nameAbsStart;
          tokenEnd = nameAbsEnd;
          token = text.slice(tokenStart, tokenEnd).trim();
        }
      }
    }
  }

  return { token, tokenStart, tokenEnd, fullLine };
}

export function highlightMatch(text: string, query: string): { pre: string; match: string; post: string } | null {
  if (!query || query.length < 1) return null;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return null;
  return { pre: text.slice(0, idx), match: text.slice(idx, idx + query.length), post: text.slice(idx + query.length) };
}
