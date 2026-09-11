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

import type { MetricKey } from "@/lib/testNorms";

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
};

// `BATTERY_TO_FAMILY`/`guessBatteryKey()` (matching sport→1 seule batterie) supprimées ici (2026-09,
// suite) — voir note en tête de fichier : plus aucun filtrage des tests recommandés par sport de
// profil, `TestsPanel.tsx` scanne désormais toujours `Object.values(TEST_BATTERIES)` en entier.
