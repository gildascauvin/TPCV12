/* Batterie de tests physiques suggérés par sport — contenu réel extrait de BT_DATA (le guide publié
   sur https://www.theperfclub.com/batterie-de-tests-physiques-par-sport/, la donnée de référence
   utilisée pour construire cette page). Sert uniquement à ORIENTER l'utilisateur ("quels tests
   faire pour ton sport") — purement informatif, ne crée ni ne modifie aucun test dans `tests`/
   `test_results` (voir testResults.ts). Distinct de testNorms.ts (qui interprète les résultats déjà
   logués) : ce module répond à "quoi tester", testNorms.ts répond à "comment interpréter".

   Taxonomie plus fine que SPORT_CATEGORIES/guessSportChip (sportCategories.ts) — la batterie
   distingue Football/Rugby/Handball/Volleyball là où les familles de normes les regroupent toutes
   sous "Sports collectifs" (le test pertinent diffère vraiment par sport, contrairement aux repères
   de force qui restent indicatifs à ce niveau).

   `guessBatteryKey()` (matching sport→UNE SEULE batterie) a été RETIRÉE (2026-09, suite) — servait à
   filtrer `TestsPanel.tsx`'s "tests recommandés" par sport de profil, mécanisme abandonné sur demande
   répétée de Gildas ("je veux plus filtrer les tests par sport du profil... tous les tests de l'app
   pour tous les users, filtrables par qualité physique"). `TestsPanel.tsx` scanne désormais TOUJOURS
   `Object.values(TEST_BATTERIES)` en entier, `BATTERY_TEST_QUALITY` restant le seul filtre (optionnel,
   transverse à tous les sports). */

import { type MetricKey, METRIC_DISPLAY, suggestCanonicalNames } from "@/lib/testNorms";

export interface BatteryTest { name: string; quality: string; desc: string; url: string | null }
export interface SportBattery { label: string; emoji: string; tests: BatteryTest[] }

export const TEST_BATTERIES: Record<string, SportBattery> = {
  football: {
    label: "Football", emoji: "⚽",
    tests: [
      { name: "Yo-Yo Intermittent Recovery Test", quality: "Endurance intermittente", desc: "Navette 20m avec paliers croissants et récupération active de 10s : standard de référence en sports co pour l'endurance spécifique.", url: null },
      { name: "Sprint 30m avec split 10m", quality: "Vitesse et accélération", desc: "Le split 10m évalue l'accélération pure, les 20m suivants la vitesse de pointe : deux qualités distinctes en football.", url: null },
      { name: "Test T (agilité)", quality: "Changements de direction", desc: "Parcours en T avec sprints latéraux : évalue la capacité à changer de direction sous contrainte de temps.", url: null },
      { name: "Saut vertical (CMJ)", quality: "Puissance des membres inférieurs", desc: "Countermovement jump : corrélé à la capacité de détente pour les duels aériens et les accélérations.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Drop Jump (RSI)", quality: "Réactivité / relances et duels rapides", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
    ],
  },
  basketball: {
    label: "Basketball", emoji: "🏀",
    tests: [
      { name: "Saut vertical (CMJ)", quality: "Puissance explosive (contribution élastique)", desc: "Countermovement jump : comparé au squat jump, permet de calculer l'indice d'utilisation de l'élasticité.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Squat Jump", quality: "Puissance explosive (force concentrique pure)", desc: "Saut sans contre-mouvement : comparé au CMJ, isole la contribution du cycle étirement-détente à la hauteur de saut.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Lane Agility Drill", quality: "Agilité multidirectionnelle", desc: "Test standard des combines NBA : changements de direction avant/arrière/latéral sur le terrain de basket.", url: null },
      { name: "Sprint 3/4 terrain", quality: "Vitesse de transition", desc: "Reproduit les courses de contre-attaque, distance spécifique au basket plutôt que le 30-40m classique.", url: null },
      { name: "Test de Sargent", quality: "Détente verticale de terrain", desc: "Alternative simple au CMJ sur plateforme, mesurable avec un simple mur gradué en salle.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Drop Jump (RSI)", quality: "Réactivité / rebonds répétés", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
    ],
  },
  rugby: {
    label: "Rugby", emoji: "🏉",
    tests: [
      { name: "Bronco Test", quality: "Endurance intermittente spécifique", desc: "Navettes répétées 20-40-60m, très utilisé en rugby professionnel pour l'endurance haute intensité.", url: null },
      { name: "Sprint 40m avec split 10m", quality: "Vitesse et accélération", desc: "Distance plus longue qu'en football pour capturer la vitesse de pointe recherchée sur les lignes arrières.", url: null },
      { name: "1RM Back Squat", quality: "Force maximale des membres inférieurs", desc: "Référence pour les qualités de contact et de percussion, souvent croisé avec le poids de corps.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "Test de pompes / tirage isométrique", quality: "Force du haut du corps", desc: "Pertinent pour les phases de mêlée et de plaquage, moins standardisé mais largement utilisé en club.", url: null },
      { name: "Drop Jump (RSI)", quality: "Réactivité / plaquages et relances", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
    ],
  },
  handball: {
    label: "Handball", emoji: "🤾",
    tests: [
      { name: "Test T (agilité)", quality: "Changements de direction", desc: "Les trajectoires en handball imposent des changements de direction fréquents à haute vitesse.", url: null },
      { name: "Saut vertical (CMJ)", quality: "Puissance de tir et de duel aérien", desc: "Corrélé à la vitesse de bras au tir et à la capacité de duel en position aérienne.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Yo-Yo IR1", quality: "Endurance intermittente", desc: "Format de jeu avec alternance intense/récupération, proche du profil football/handball.", url: null },
      { name: "Medicine ball throw (lancer assis)", quality: "Puissance du tronc et des bras", desc: "Test de terrain simple pour la puissance de tir sans dépendre de la technique de lancer complète.", url: null },
      { name: "Drop Jump (RSI)", quality: "Réactivité / duels aériens répétés", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
    ],
  },
  basketball_volley: {
    label: "Volleyball", emoji: "🏐",
    tests: [
      { name: "Saut vertical avec élan (Spike Jump)", quality: "Puissance d'attaque", desc: "Différent du CMJ classique : inclut la course d'élan spécifique au smash.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Saut vertical sans élan (Block Jump)", quality: "Puissance de contre", desc: "Détente pure depuis l'arrêt, pertinent pour l'évaluation du poste de contre.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Test T (agilité)", quality: "Déplacements latéraux", desc: "Les déplacements le long du filet sollicitent l'agilité latérale plus que la course linéaire.", url: null },
      { name: "Souplesse d'épaule (goniométrie)", quality: "Mobilité spécifique smash/service", desc: "Prévention de blessure : la répétition du geste de frappe surmène l'épaule dominante.", url: null },
      { name: "Drop Jump (RSI)", quality: "Réactivité / enchaînements de sauts (attaque-contre)", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
    ],
  },
  // Ajouté 2026-09 (n'existe pas dans la source WP) — contrairement à "trail" (spécifique dénivelé/
  // descente) et "Test 2000m rameur ou 5km course" (crossfit, ambigu rameur/course, sans MetricKey),
  // ces 5 métriques ont chacune un ratio sourcé (RATIO_CARDS["Endurance"], équivalences VDOT/Jack
  // Daniels + VO2max≈VMA×3.5) mais n'apparaissaient nulle part comme test recommandé avant d'être
  // loggué au moins une fois manuellement (retour de Gildas : "ajouter par défaut tous ceux qui ont
  // un ratio", pas limité à l'haltérophilie — voir aussi les 10 mouvements ajoutés au bucket haltero
  // plus bas).
  endurance: {
    label: "Endurance / Course à pied", emoji: "🏃",
    tests: [
      { name: "5 km", quality: "Endurance-vitesse", desc: "Comparé au 10km, au Semi et au Marathon (équivalences VDOT/Jack Daniels) : situe ton profil vitesse vs endurance longue.", url: null },
      { name: "10 km", quality: "Endurance intermédiaire", desc: "Comparé au 5km, au Semi et au Marathon (équivalences VDOT/Jack Daniels) : distance pivot entre vitesse et endurance longue.", url: null },
      { name: "Semi-marathon", quality: "Endurance longue", desc: "Comparé au 5km, au 10km et au Marathon (équivalences VDOT/Jack Daniels) : situe ton profil sur les distances longues.", url: null },
      { name: "Marathon", quality: "Endurance très longue", desc: "Comparé au 5km, au 10km et au Semi (équivalences VDOT/Jack Daniels) : référence ultime d'endurance aérobie.", url: null },
      { name: "VO2max", quality: "Puissance aérobie maximale", desc: "Comparé à ta VMA (ratio sourcé, VO2max ≈ VMA × 3.5) : mesure directe (terrain ou labo), distincte du protocole ergocycle ci-dessous.", url: null },
    ],
  },
  trail: {
    label: "Trail / Course à pied", emoji: "🏔️",
    tests: [
      { name: "Test VMA (Cooper ou demi-Cooper)", quality: "Puissance aérobie maximale", desc: "Base de calcul des allures d'entraînement, référence historique en course à pied.", url: null },
      { name: "Test de seuil (30 min max ou Conconi)", quality: "Endurance au seuil", desc: "Plus spécifique que la VMA pour les distances longues où l'intensité reste sous-maximale.", url: null },
      { name: "Test de descente (protocole excentrique)", quality: "Tolérance à l'excentrique", desc: "Spécifique trail : la descente sollicite le quadriceps en excentrique de façon prolongée, rarement testée ailleurs.", url: null },
    ],
  },
  velo: {
    label: "Vélo / Cyclisme", emoji: "🚴",
    tests: [
      { name: "Test FTP (Functional Threshold Power)", quality: "Puissance au seuil fonctionnel", desc: "20 minutes à effort maximal soutenable, référence absolue pour le calcul des zones d'entraînement en cyclisme.", url: null },
      { name: "Test de puissance maximale (sprint 6-10s)", quality: "Puissance anaérobie", desc: "Pertinent pour les efforts explosifs (côtes courtes, sprints final).", url: null },
      { name: "VO2max sur ergocycle", quality: "Puissance aérobie maximale", desc: "Version cyclisme du test VMA, mesuré en watts plutôt qu'en vitesse de course.", url: null },
    ],
  },
  natation: {
    label: "Natation", emoji: "🏊",
    tests: [
      { name: "Test 400m ou 30min (protocole seuil)", quality: "Endurance au seuil", desc: "Équivalent natation du test de seuil course à pied, utilisé pour caler les allures d'entraînement.", url: null },
      { name: "Test de vitesse 25m/50m départ plongé", quality: "Vitesse pure", desc: "Distance courte isolant la qualité de vitesse indépendamment de l'endurance.", url: null },
      { name: "Test de force en traction (tirage élastique ou banc de nage)", quality: "Force spécifique de traction", desc: "La force de bras hors de l'eau ne se transfère pas directement : ce test isole le geste spécifique.", url: null },
    ],
  },
  haltero: {
    label: "Haltérophilie", emoji: "🥇",
    tests: [
      { name: "1RM Snatch", quality: "Performance de compétition (arraché)", desc: "Référence absolue en haltérophilie : situe tes mouvements dérivés grâce aux ratios techniques.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "1RM Clean & Jerk", quality: "Performance de compétition (épaulé-jeté)", desc: "Référence absolue en haltérophilie : situe tes mouvements dérivés grâce aux ratios techniques.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "1RM Back Squat", quality: "Force maximale des jambes", desc: "Base de tous les ratios techniques en haltérophilie, prédicteur du potentiel sur les mouvements olympiques.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Front Squat", quality: "Force maximale des jambes (position spécifique)", desc: "Position plus proche du réceptionné olympique que le back squat : complète le ratio technique avec la même base de charge.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "Test de mobilité overhead squat", quality: "Mobilité spécifique", desc: "La réception en squat complet exige une mobilité de cheville, hanche et épaule rarement présente naturellement.", url: null },
      { name: "Saut vertical (CMJ)", quality: "Puissance de triple extension", desc: "Corrélé à la vitesse de triple extension (cheville-genou-hanche) commune au squat jump et à l'arraché.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      // 10 mouvements dérivés (2026-09, retour de Gildas : "ajouter par défaut tous ceux qui ont un
      // ratio, genre je viens de créer power clean, j'aurais aimé qu'il y soit déjà") — chacun a déjà
      // un ratio sourcé (RATIO_CARDS, testNorms.ts) mais n'apparaissait nulle part comme test
      // recommandé avant d'être loggué au moins une fois manuellement. Portée volontairement limitée
      // à ces 10 (validée explicitement par Gildas) : ~40 autres variantes techniques très pointues
      // (Tall Muscle Snatch, Box Clean Pull, Snatch Sots Press...) restent découvrables uniquement via
      // "+ Nouveau test" (avec suggestion de lien si le nom tapé s'en approche), pas dans cette liste.
      { name: "Power Clean", quality: "Puissance de réception haute", desc: "Comparé au Back Squat, au Clean et au Clean & Jerk (ratios sourcés) : réception plus haute que le clean complet, isole la puissance de tirage.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Power Snatch", quality: "Puissance de réception haute (arraché)", desc: "Comparé au Back Squat et au Snatch (ratios sourcés) : équivalent du Power Clean côté arraché.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Clean", quality: "Épaulé complet (sans le jeté)", desc: "Comparé au Clean & Jerk, au Front Squat et au Clean Deadlift (ratios sourcés) : isole la phase de réception, sans la propulsion overhead.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Jerk", quality: "Propulsion overhead", desc: "Comparé au Back Squat et au Clean & Jerk (ratios sourcés) : isole la propulsion overhead, indépendamment de la réception du clean.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Power Jerk", quality: "Propulsion overhead (réception haute)", desc: "Comparé au Back Squat et au Clean & Jerk (ratios sourcés) : variante du Jerk en réception haute (fente/squat partiel).", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "OH Squat", quality: "Force et stabilité overhead", desc: "Comparé au Back Squat (ratio sourcé) : force et stabilité en position overhead, prérequis technique de l'arraché.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Clean Pull", quality: "Force de tirage (épaulé)", desc: "Comparé au Back Squat (ratio sourcé) : force de tirage pure, sans la réception du clean.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Snatch Pull", quality: "Force de tirage (arraché)", desc: "Comparé au Back Squat et au Snatch (ratios sourcés) : équivalent du Clean Pull côté arraché.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Clean Deadlift", quality: "Force de tirage lourde (épaulé)", desc: "Comparé au Back Squat et au Clean (ratios sourcés) : soulevé de terre en prise étroite, base de force du tirage d'épaulé.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
      { name: "Snatch Deadlift", quality: "Force de tirage lourde (arraché)", desc: "Comparé au Back Squat et au Snatch (ratios sourcés) : équivalent du Clean Deadlift côté arraché, prise large.", url: "https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/" },
    ],
  },
  musculation: {
    label: "Musculation / Force", emoji: "🏋️",
    tests: [
      { name: "1RM Back Squat", quality: "Force maximale des jambes", desc: "Estime ta charge sans forcément aller à l'échec, via le barème RPE.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Développé couché", quality: "Force maximale du haut du corps", desc: "Estime ta charge sans forcément aller à l'échec, via le barème RPE.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Soulevé de terre", quality: "Force maximale de la chaîne postérieure", desc: "Estime ta charge sans forcément aller à l'échec, via le barème RPE.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "Saut vertical (CMJ)", quality: "Puissance et transfert de force", desc: "Mesure si la force maximale se traduit en puissance explosive utilisable.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
    ],
  },
  // Ajouté 2026-09 (n'existe pas dans la source WP, contrairement aux 15 autres — voir note sur
  // guessBatteryKey plus bas) : les 4 lifts couverts par les vraies normes RATIO_CARDS["Powerlifting"]
  // (testNorms.ts), pour que ce sport soit sélectionnable comme chip au même titre que les autres.
  powerlifting: {
    label: "Powerlifting", emoji: "🦍",
    tests: [
      { name: "1RM Back Squat", quality: "Force maximale des jambes", desc: "Un des 3 lifts de compétition, base des ratios techniques powerlifting.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Développé couché", quality: "Force maximale du haut du corps", desc: "2e lift de compétition, comparé au squat et au soulevé de terre.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Soulevé de terre", quality: "Force maximale de la chaîne postérieure", desc: "3e lift de compétition, le plus lourd des trois chez la plupart des lifteurs.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Développé militaire (OHP)", quality: "Force overhead", desc: "Pas un lift de compétition, mais un repère classique d'équilibre de force overhead.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
    ],
  },
  sprint_athle: {
    label: "Sprint / Athlétisme", emoji: "⚡",
    tests: [
      { name: "Sprint 30m avec split 10m", quality: "Accélération et vitesse max", desc: "Prédit tes temps sur d'autres distances à partir de 2 chronos.", url: "https://www.theperfclub.com/simulateur-de-temps-de-sprint/" },
      // Bug réel corrigé (2026-09) : cette entrée était composite ("Saut vertical ET saut en longueur")
      // mais ne mappait QUE cmjHeight dans BATTERY_TEST_METRICS plus bas — la moitié "saut en longueur
      // sans élan" (broad jump) n'avait jamais de MetricKey ni de carte, silencieusement ignorée depuis
      // la création de cette liste. Décomposée en 2 entrées séparées, même convention déjà appliquée
      // ailleurs dans ce fichier pour tout composé ("un composé ne dit jamais dans quelle case mettre
      // quelle valeur"). "Saut vertical (CMJ)" seul n'existait pas encore dans cette batterie précise.
      { name: "Saut vertical (CMJ)", quality: "Puissance explosive", desc: "Corrélation forte avec la performance sur 100m, notamment sur la phase d'accélération.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Saut en longueur sans élan (Broad Jump)", quality: "Puissance explosive horizontale", desc: "Version horizontale du CMJ : corrélation forte avec la performance sur 100m, notamment sur la phase d'accélération.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Drop Jump (RSI)", quality: "Réactivité / cycle étirement-détente", desc: "Saute d'un step (30-40cm), rebondis le plus vite et le plus haut possible : demande 2 mesures sur le MÊME saut (hauteur de saut + temps de contact au sol) pour calculer ton Reactive Strength Index.", url: null },
      { name: "Saut vertical bras libres (CMJ free arms)", quality: "Puissance / contribution du balancement des bras", desc: "Même geste que le CMJ classique mais bras libres (swing autorisé) au lieu de mains sur les hanches : la comparaison avec ton CMJ standard isole la contribution du balancement des bras à la hauteur de saut, un facteur souvent négligé dans le profil de réactivité.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "1RM Back Squat", quality: "Force maximale", desc: "Un des meilleurs prédicteurs de la vitesse d'accélération sur les premiers appuis.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "30m lancé (flying 30m)", quality: "Vitesse maximale lancée", desc: "Chronométré en course lancée (10-20m d'élan avant le déclenchement) plutôt qu'au départ arrêté : isole la vitesse de pointe pure, sans la phase d'accélération initiale.", url: null },
      { name: "60m départ arrêté", quality: "Accélération et transition vers la vitesse max", desc: "Distance standard en athlétisme indoor : couvre l'accélération (0-30m) et le début de la vitesse de pointe, plus complet qu'un 10-30m seul.", url: null },
      { name: "100m départ arrêté", quality: "Profil de vitesse complet", desc: "Avec les splits 10/30/60m, permet de construire un profil complet accélération → vitesse maximale (à rapprocher du modèle force-vitesse de Samozino, pas encore interprété automatiquement dans l'app).", url: null },
    ],
  },
  crossfit: {
    label: "Cross-Training / Hyrox", emoji: "🔥",
    tests: [
      { name: "Test Fran / Grace / Helen (benchmark WOD)", quality: "Capacité de travail générale", desc: "Benchmarks standardisés de la communauté CrossFit, permettent le suivi de progression dans le temps.", url: null },
      { name: "1RM Clean & Jerk", quality: "Force sur mouvements composés (épaulé-jeté)", desc: "Les mouvements olympiques et le squat sont les piliers de force testés en compétition CrossFit.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Snatch", quality: "Force sur mouvements composés (arraché)", desc: "Les mouvements olympiques et le squat sont les piliers de force testés en compétition CrossFit.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "1RM Back Squat", quality: "Force sur mouvements composés (squat)", desc: "Les mouvements olympiques et le squat sont les piliers de force testés en compétition CrossFit.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
      { name: "Test 2000m rameur ou 5km course", quality: "Capacité aérobie", desc: "Composante cardio incontournable des formats de compétition longue durée.", url: null },
    ],
  },
  combat: {
    label: "Combat / Boxe", emoji: "🥊",
    tests: [
      { name: "Test de vitesse de frappe", quality: "Vitesse et puissance de frappe", desc: "Chronométrage du nombre de frappes en 10-15s, ou capteur de puissance sur sac : évalue la vitesse gestuelle spécifique.", url: null },
      { name: "Test d'assauts enchaînés (rounds)", quality: "Conditioning cardio spécifique", desc: "Capacité à maintenir le rythme sur plusieurs rounds avec récupération courte : reproduit la structure d'un combat.", url: null },
      { name: "1RM Développé couché", quality: "Force du haut du corps", desc: "Corrélé à la puissance de frappe en complément de la vitesse de rotation du tronc.", url: "https://www.theperfclub.com/calculateur-1rm-et-rpe/" },
    ],
  },
  escalade: {
    label: "Escalade", emoji: "🧗",
    tests: [
      { name: "Test de suspension à la poutre (dead hang)", quality: "Force de préhension maximale", desc: "Temps de suspension max sur une prise de référence : indicateur le plus utilisé en escalade de performance.", url: null },
      { name: "Niveau de bloc à vue", quality: "Technique et lecture de mouvement", desc: "Le niveau enchaîné sans essai préalable reflète la technique réelle, indépendamment de la force pure.", url: null },
      { name: "Test de continuité (4x4)", quality: "Endurance spécifique", desc: "4 blocs enchaînés répétés 4 fois avec récupération courte : évalue la capacité à répéter l'effort en séance.", url: null },
    ],
  },
  // Agilité et mobilité (2026-09, demande de Gildas) — contrairement au reste de ce fichier, ces 2
  // buckets ne sont PAS extraits de BT_DATA (le guide publié) : ajoutés directement sur sa demande,
  // organisés par qualité plutôt que par sport (cohérent avec le retrait du filtrage par sport de
  // TestsPanel.tsx — le bucket n'a plus qu'une valeur d'organisation du fichier, plus aucun rôle de
  // filtrage). Single/Triple Broad Jump inclus ici (déjà des MetricKey depuis le chantier précédent)
  // pour corriger le bug signalé par Gildas ("je vois pas Single/Triple Broad Jump dans Puissance") :
  // sans entrée recommandée, ils n'apparaissaient JAMAIS avant d'être logués au moins une fois,
  // contrairement à Broad Jump (déjà mappé lui).
  agilite: {
    label: "Agilité / Changement de direction", emoji: "↔️",
    tests: [
      { name: "5-0-5 (505 Test)", quality: "Changement de direction unilatéral", desc: "5m d'élan, demi-tour à 180°, 5m de retour chronométrés séparément : isole la capacité à changer de direction, sans la phase d'accélération linéaire.", url: null },
      { name: "Illinois Agility Test", quality: "Agilité multidirectionnelle", desc: "Parcours combinant sprint, virages à 180° et slalom entre plots : test de référence historique en agilité.", url: null },
      { name: "Pro Agility (5-10-5)", quality: "Changement de direction latéral", desc: "5m-10m-5m avec 2 changements de direction à 180° : standard des combines américains (NFL/NBA).", url: null },
      { name: "Saut en longueur unipodal (Single Leg Broad Jump)", quality: "Puissance horizontale unilatérale / symétrie", desc: "Comparé jambe gauche vs jambe droite (limb symmetry index) : test standard des protocoles de retour au sport après blessure.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
      { name: "Triple saut sans élan (Triple Broad Jump)", quality: "Puissance horizontale répétée", desc: "3 bonds enchaînés sans élan : évalue la capacité à ré-exprimer de la puissance horizontale sur des appuis successifs, au-delà d'un seul saut.", url: "https://www.theperfclub.com/calculateur-de-detente-verticale-vertical-jump/" },
    ],
  },
  mobilite: {
    label: "Mobilité / Prévention", emoji: "🤸",
    tests: [
      { name: "Dorsiflexion de cheville", quality: "Mobilité de cheville", desc: "Mesure au goniomètre (degrés) : une amplitude limitée est un facteur de risque documenté (entorses, tendinopathies, technique de squat).", url: null },
      { name: "Knee-to-Wall Test", quality: "Mobilité de cheville (protocole terrain)", desc: "Distance orteil-mur maximale genou touchant le mur sans lever le talon (cm), sans goniomètre : mesure la même qualité que la dorsiflexion de cheville via un protocole terrain différent, 2 tests distincts plutôt qu'un seul.", url: null },
      { name: "Rotation interne de hanche", quality: "Mobilité de hanche", desc: "Amplitude mesurée en décubitus ventral ou assis, genou fléchi à 90° : une limitation est associée aux douleurs lombaires et de hanche chez l'athlète.", url: null },
      { name: "Rotation externe de hanche", quality: "Mobilité de hanche", desc: "Même protocole que la rotation interne, dans l'autre sens : les 2 mesures ensemble donnent l'arc de rotation total de la hanche.", url: null },
      { name: "Flexion d'épaule", quality: "Mobilité d'épaule", desc: "Amplitude bras tendu au-dessus de la tête : limite fréquemment le verrouillage overhead (jerk, snatch, développé militaire).", url: null },
      { name: "Apley Scratch Test", quality: "Mobilité combinée d'épaule (rotation interne+externe)", desc: "Une main dans le dos par-dessus l'épaule, l'autre par en-dessous : distance entre les mains, test de dépistage rapide de la mobilité globale d'épaule.", url: null },
      { name: "Thomas Test", quality: "Souplesse des fléchisseurs de hanche", desc: "Allongé, une jambe ramenée vers la poitrine : l'angle de la jambe opposée qui reste au sol dépiste un raccourcissement du psoas/droit fémoral.", url: null },
      { name: "Active Straight-Leg Raise", quality: "Mobilité de hanche postérieure (ischio-jambiers)", desc: "Jambe tendue levée activement, genou opposé au sol : dépistage rapide de la mobilité postérieure de hanche, utilisé dans plusieurs batteries de screening (ex. FMS).", url: null },
    ],
  },
};

/* Rattache chaque sport de la batterie (fin, 15 entrées) à la famille de sport de testNorms.ts
   (large, 8 entrées via guessSportChip() — sportCategories.ts) — sert à filtrer les cartes
   ratio/bodyweight (RATIO_CARDS/BW_CARDS) quand l'utilisateur choisit un sport via les chips de
   TestsPanel.tsx, indépendamment de son sport de profil. `null` = aucune famille de normes sourcée
   pour ce sport à ce jour (Escalade, Concours) : sélectionner ce chip affiche quand même les tests
   recommandés ci-dessus, mais aucune carte de comparaison (RATIO_CARDS[null] n'existe pas) — honnête
   plutôt qu'un repère inventé. Plusieurs familles réelles (Endurance, Athlétisme & vitesse, Sports
   collectifs, Arts martiaux & combat, Musculation / Hypertrophie) n'ont elles-mêmes encore aucune
   norme sourcée dans RATIO_CARDS — sélectionner ces chips retombe donc aussi sur "tests recommandés
   seuls" jusqu'à ce qu'une page de référence équivalente à HT_DATA existe pour ces sports. */
/* Rattache un test recommandé (nom EXACT, voir TEST_BATTERIES) à la ou les clés canoniques qu'il
   désigne dans testNorms.ts (2026-09) — sert à FUSIONNER "Tests recommandés" avec les vraies cartes
   de test (TestsPanel.tsx, `notCovered`) : un test dont TOUTES les clés sont déjà interprétées par la
   famille active (RATIO_CARDS/BW_CARDS/ABSOLUTE_CARDS) disparaît de la liste — chaque clé a déjà sa
   propre carte, qui l'affiche enrichi de ce texte.

   Les anciens noms composés listant plusieurs exercices distincts (ex. "1RM ou estimation via RPE
   (Squat, Bench, Deadlift)", "1RM Snatch / Clean & Jerk"...) ont été décomposés en autant d'entrées
   séparées, une par exercice (2026-09, suite) — sur demande explicite de Gildas : un composé ne dit
   jamais dans quelle case mettre quelle valeur, une carte par exercice lève l'ambiguïté. "Drop Jump
   (RSI)" reste la seule entrée à 2 clés : ce n'est pas une liste d'exercices distincts mais UN seul
   saut dont on mesure 2 grandeurs liées (hauteur + temps de contact), déjà servi par sa propre saisie
   à 2 champs (onAddPair) plutôt qu'une simple carte "valeur seule" comme les autres. */
export const BATTERY_TEST_METRICS: Record<string, MetricKey[]> = {
  "Saut vertical (CMJ)": ["cmjHeight"],
  // Bug réel corrigé (2026-09) : jamais mappé jusqu'ici — ce test recommandé n'était donc jamais
  // marqué "fait" une fois loggué (notCovered() le voyait toujours comme non couvert), et sa donnée
  // réelle atterrissait séparément comme test brut non relié (canonicalMetricKey renvoyait null avant
  // l'ajout du MetricKey `cmjFreeArms`, voir testNorms.ts) — 2 fiches pour un seul et même test.
  "Saut vertical bras libres (CMJ free arms)": ["cmjFreeArms"],
  "Squat Jump": ["squatJumpHeight"],
  "1RM Back Squat": ["backSquat"],
  "1RM Front Squat": ["frontSquat"],
  "1RM Développé couché": ["bench"],
  "1RM Soulevé de terre": ["deadlift"],
  "1RM Développé militaire (OHP)": ["press"],
  "1RM Snatch": ["snatch"],
  "1RM Clean & Jerk": ["cleanJerk"],
  // 10 mouvements dérivés + 5 métriques endurance (2026-09, suite — "ajouter par défaut tous ceux qui
  // ont un ratio") — voir les commentaires en tête des buckets haltero/endurance ci-dessus.
  "Power Clean": ["powerClean"],
  "Power Snatch": ["powerSnatch"],
  "Clean": ["clean"],
  "Jerk": ["jerk"],
  "Power Jerk": ["powerJerk"],
  "OH Squat": ["ohSquat"],
  "Clean Pull": ["cleanPull"],
  "Snatch Pull": ["snatchPull"],
  "Clean Deadlift": ["cleanDeadlift"],
  "Snatch Deadlift": ["snatchDeadlift"],
  "5 km": ["time5k"],
  "10 km": ["time10k"],
  "Semi-marathon": ["timeSemi"],
  "Marathon": ["timeMarathon"],
  "VO2max": ["vo2max"],
  "Sprint 30m avec split 10m": ["sprint30m", "sprint10m"],
  "Saut en longueur sans élan (Broad Jump)": ["broadJump"],
  "Saut en longueur unipodal (Single Leg Broad Jump)": ["singleLegBroadJump"],
  "Triple saut sans élan (Triple Broad Jump)": ["tripleBroadJump"],
  "5-0-5 (505 Test)": ["test505"],
  "Illinois Agility Test": ["illinoisAgility"],
  "Pro Agility (5-10-5)": ["proAgility"],
  "Dorsiflexion de cheville": ["ankleDorsiflexion"],
  "Knee-to-Wall Test": ["kneeToWall"],
  "Rotation interne de hanche": ["hipInternalRotation"],
  "Rotation externe de hanche": ["hipExternalRotation"],
  "Flexion d'épaule": ["shoulderFlexion"],
  "Apley Scratch Test": ["apleyScratchTest"],
  "Thomas Test": ["thomasTest"],
  "Active Straight-Leg Raise": ["activeStraightLegRaise"],
  "Drop Jump (RSI)": ["dropJumpHeight", "dropJumpContact"],
  // Profil de vitesse (2026-09, suite) — sprint60m/100m n'ont aucune RATIO_CARD (pas de norme de
  // population sourcée), donc jamais "couverts" au sens de `notCovered` : ces 2 lignes restent
  // affichées en recommandé même une fois loggées, MAIS le test lui-même devient canonique dès qu'il
  // est nommé "60m"/"100m"/"60m départ arrêté"/"100m départ arrêté" (ALIASES, testNorms.ts) — sa carte
  // s'affiche alors normalement dans `rawTests`, juste sans comparaison chiffrée à ce jour.
  "60m départ arrêté": ["sprint60m"],
  "100m départ arrêté": ["sprint100m"],
  // Bug réel corrigé (2026-09, même famille que le bug CMJ free arms ci-dessus) : jamais mappé
  // jusqu'ici — un utilisateur qui loggue sa VMA (Luc Léger, VAMEVAL, ou via le toggle Demi-Cooper de
  // la carte VMA) voyait sa vraie carte "VMA" ET cette recommandation persister éternellement (jamais
  // marquée "faite", `notCovered` ne pouvant vérifier aucun MetricKey). "VO2max sur ergocycle"
  // (mesuré en watts, juste au-dessus dans testBattery.ts) volontairement PAS mappé à `vo2max` — pas
  // de formule sourcée pour convertir une puissance ergocycle en VO2max (ml/kg/min), contrairement au
  // Cooper/Demi-Cooper déjà sourcés (voir vo2maxFromCooperDistance/vmaFromDemiCooperDistance).
  "Test VMA (Cooper ou demi-Cooper)": ["vma"],
};

// `BATTERY_TO_FAMILY`/`guessBatteryKey()` (matching sport→1 seule batterie) supprimées ici (2026-09,
// suite) — voir note en tête de fichier : plus aucun filtrage des tests recommandés par sport de
// profil, `TestsPanel.tsx` scanne désormais toujours `Object.values(TEST_BATTERIES)` en entier.

/* Matching de noms de tests par mots partagés (2026-09, suite) — déplacé ici depuis TestsPanel.tsx
   (2026-09, encore une suite : "je veux [pouvoir lier à un test existant] dès la séance", pas
   seulement dans TestsPanel) pour être réutilisable aussi par ExerciseBlockEditor.tsx (composeur de
   résultat de test directement dans une séance) — un seul point de vérité pour "ce nom tapé
   ressemble-t-il à un test déjà connu ?", au lieu de 2 heuristiques qui auraient fini par diverger. */

/* Normalisation texte libre (accents/casse/ponctuation) — base commune de sharesEnoughWords/
   findMatchingRawTest (TestsPanel.tsx). Ex-heuristique "ce test a-t-il déjà été loggué ?" à base de
   badge texte, remplacée 2026-09 par la fusion "Tests recommandés" → cartes. */
export function normalizeTestName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Score de similarité partagé par findMatchingRawTest (TestsPanel.tsx, matching auto) et
   suggestRecommendedTestNames ci-dessous (suggestions de fusion manuelle) — un seul point de vérité,
   pour ne plus jamais avoir 2 heuristiques qui divergent en silence. Historique : ≥2 mots ≥4 lettres
   partagés (un match sur 1 mot générique ne suffit pas — "squat" seul faisait matcher "Back Squat" et
   "Saut vertical (CMJ et squat jump)", 2 exercices différents).

   Bug réel trouvé par Gildas (2026-09, suite) : relier "100m" à "100m départ arrêté" faisait ensuite
   AUSSI matcher "60m départ arrêté" — les 2 noms partagent "départ"+"arrêté" (2 mots ≥4 lettres, le
   seuil), et l'ancien filtre ne retenait jamais "60m"/"100m" comme mots "significatifs" (respectivement
   3 et 4 caractères, sous le seuil pour "60m"). Or c'est justement le token numérique qui distingue 2
   tests entre eux dans ce cas, pas les mots génériques qu'ils partagent. Fix : tout token contenant un
   chiffre (peu importe sa longueur) est traité à part — si les 2 noms en portent, ils doivent être
   EXACTEMENT les mêmes (comparaison par token entier, jamais une sous-chaîne : "10m" est une
   sous-chaîne de "100m", `.includes()` s'y ferait piéger). Un token numérique déjà confirmé identique
   suffit à lui seul quand la requête n'a AUCUN autre mot (ex. "100m" seul, pour que le bouton "🔗
   Relier" puisse le proposer comme cible malgré son nom trop court pour la logique de mots générique). */
export function sharesEnoughWords(queryName: string, candidateName: string): boolean {
  const qNorm = normalizeTestName(queryName);
  const cNorm = normalizeTestName(candidateName);
  if (!qNorm || !cNorm) return false;
  if (qNorm === cNorm) return true;
  const qTokens = qNorm.split(" ");
  const cTokens = cNorm.split(" ");
  const qDigits = qTokens.filter(t => /\d/.test(t));
  const cDigits = cTokens.filter(t => /\d/.test(t));
  if (qDigits.length && cDigits.length) {
    const sameDigits = qDigits.length === cDigits.length && qDigits.every(d => cDigits.includes(d));
    if (!sameDigits) return false;
    if (qTokens.length === qDigits.length) return true; // requête = uniquement des tokens numériques déjà validés
  }
  const words = qTokens.filter(w => !/\d/.test(w) && w.length >= 4);
  // Seuil proportionnel (2026-09, suite) — un plafond fixe à 2 mots partagés, peu importe combien de
  // mots compte le nom, était trop laxiste pour un nom long dont seul le PRÉFIXE générique est partagé
  // avec un autre test : bug réel trouvé par Gildas — "Saut vertical bras libres (CMJ free arms)"
  // (6 mots ≥4 lettres) matchait "Saut vertical (CMJ)" sur ses 2 seuls mots communs ("saut","vertical"),
  // sans jamais vérifier "bras"/"libres"/"free"/"arms" — 2 exercices délibérément DISTINCTS (comparer
  // bras libres vs mains sur les hanches est tout l'intérêt du 2e test) fusionnés à tort en une seule
  // carte. ≤2 mots : exige TOUS (comportement inchangé, déjà strict). >2 mots : exige une majorité
  // (60%, arrondi au-dessus, jamais moins de 2) — un préfixe partagé de 2 mots sur 6 ne suffit plus.
  const minShared = words.length <= 2 ? words.length : Math.max(2, Math.ceil(words.length * 0.6));
  if (words.length) return words.filter(w => cNorm.includes(w)).length >= minShared;
  return (qNorm.length >= 4 && cNorm.includes(qNorm)) || (cNorm.length >= 4 && qNorm.includes(cNorm));
}

/* Suggestions de fusion vers un test recommandé SANS MetricKey (2026-09) — étend le bouton "🔗 Relier",
   jusqu'ici restreint aux exercices canoniques (suggestCanonicalNames, MetricKey), et qui laissait donc
   un test comme "100m" sans AUCUNE cible possible vers "100m départ arrêté" (testBattery.ts) — un vrai
   test recommandé, juste sans interprétation chiffrée derrière. Même heuristique de score que
   findMatchingRawTest (sharesEnoughWords) : si le score ne suffirait pas à un matching AUTOMATIQUE, il
   ne mérite pas non plus d'être proposé en fusion MANUELLE — seuil identique, cohérence des deux
   mécanismes. Classé par nombre de mots génériques partagés (le plus proche en premier, les tokens
   numériques ayant déjà fait leur travail de filtre dans sharesEnoughWords), pas par ordre
   d'apparition dans TEST_BATTERIES. */
export function suggestRecommendedTestNames(query: string, limit = 5): string[] {
  const names = new Set<string>();
  for (const battery of Object.values(TEST_BATTERIES)) {
    for (const t of battery.tests) {
      if (BATTERY_TEST_METRICS[t.name]) continue; // déjà couvert par suggestCanonicalNames (MetricKey)
      names.add(t.name);
    }
  }
  const qWords = normalizeTestName(query).split(" ").filter(w => w.length >= 4 && !/\d/.test(w));
  return Array.from(names)
    .filter(name => sharesEnoughWords(query, name))
    .map(name => ({ name, shared: qWords.filter(w => normalizeTestName(name).includes(w)).length }))
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map(x => x.name);
}

/* Combine les 2 sources de suggestions de fusion (2026-09) : exercices canoniques interprétés
   (suggestCanonicalNames, MetricKey → son nom d'affichage) et tests recommandés sans MetricKey
   (suggestRecommendedTestNames, déjà le nom final) — un seul type de sortie (`toName` déjà prêt à
   passer à onMerge/mergeTestInto/upsertTestResult) pour qu'un appelant n'ait jamais à distinguer les
   2 origines. Réutilisée par TestsPanel.tsx (bouton "🔗 Relier", formulaire "+ Nouveau test") ET
   ExerciseBlockEditor.tsx (composeur de résultat de test dans une séance, "🔗 Tu veux dire"). */
export function buildMergeSuggestions(name: string): { label: string; toName: string }[] {
  return [
    ...suggestCanonicalNames(name).map(k => ({ label: METRIC_DISPLAY[k].name, toName: METRIC_DISPLAY[k].name })),
    ...suggestRecommendedTestNames(name).map(n => ({ label: n, toName: n })),
  ];
}
