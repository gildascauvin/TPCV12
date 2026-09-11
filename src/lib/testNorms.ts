/* Comparaisons de tests de performance aux repères de la littérature — appliquées EN LECTURE SEULE
   par-dessus les tests déjà loggés (tests.name_key, testResults.ts). Ne touche jamais à la
   génération de name_key elle-même (resolveTest/slugify reste .trim().toLowerCase() partout
   ailleurs) : un nom non reconnu ici s'affiche simplement sans repère supplémentaire, dégradation
   gracieuse plutôt qu'une erreur ou un test caché.

   Haltérophilie (2026-09) : exhaustif, extrait directement de HT_DATA (le calculateur JS publié sur
   https://www.theperfclub.com/ratios-techniques-en-halterophilie-snatch-cj-squat/, la donnée de
   référence utilisée pour construire cette page — pas une approximation maison). 7 des 63 ratios
   sont en plus cross-validés contre 2 sources externes publiées (Torokhtiy Weightlifting, Greg
   Everett/Catalyst Athletics), citées dans `desc` quand c'est le cas. Les autres (56/63) sont des
   points ThePerfClub convertis en bande ±8% relatif (le site donne un point théorique, pas une
   fourchette — voir sa propre note méthodologique : "un athlète peut légitimement s'écarter de 5 à
   10 points"). Le reste (Powerlifting, Fitness/CrossFit) reste indicatif/maison comme documenté au
   départ dans le POC (profil-athlete-poc-v2.html) — pas encore sourcé de la même façon, à refaire
   dès qu'une page équivalente existe pour ces sports. Les autres familles (Sprint, Combat,
   Endurance, Sports collectifs) suivraient le même pattern, pas encore construites.

   Table de Baroga (2026-09) — halterophiliefrance.fr/table-de-baroga/, référence historique
   soviétique/française classant les variantes semi-techniques en % de LEUR PROPRE lift classique
   (Arraché variantes ÷ Arraché ; Épaulé-Jeté/Jeté variantes ÷ Épaulé-Jeté), PAS en % du Total
   Olympique combiné (erreur de lecture initiale corrigée en vérifiant l'arithmétique : les % publiés
   par la page elle-même matchent le Total, mais les valeurs kg de l'exemple concret transmis par
   Gildas, elles, donnent directement le ratio variante/lift-classique sans jamais avoir besoin du
   Total — cf. exemple 94kg Arraché/120kg Épaulé-Jeté). Utilisée pour cross-valider 8 ratios Arraché
   (calcul direct variante÷94kg) ET 8 ratios Épaulé-Jeté/Jeté (calcul direct variante÷120kg,
   uniquement contre les cartes basées sur `cleanJerk`) déjà présents dans ce fichier, mentionné dans
   `desc` quand la correspondance est confirmée à quelques points près. Un 3e lot (4 ratios) cross-
   valide en plus les cartes basées sur `clean` SEUL (dénominateur différent de Baroga) via
   l'approximation clean≈103% de cleanJerk déjà observée dans ces mêmes données (`clean_cleanJerk`) —
   marqué "relatif à l'Épaulé-Jeté" dans `desc` pour rester honnête sur cette conversion approximative,
   moins rigoureuse que les 2 lots précédents (même dénominateur exact des deux côtés). Pas de nouvelle carte ajoutée — seulement des correspondances
   nom-à-nom déjà sans ambiguïté (ex. "BTN Press in Split" = "Développé nuque en fente", "Drop Jerk" =
   "Chute de jeté") ; les lignes Baroga sans mapping évident (Renforcement musculaire, tirages de bras,
   "Flexion d'arraché"...) sont restées volontairement de côté plutôt que devinées.

   `core` (RatioCardDef/BodyweightCardDef) : les 63 ratios haltéro couvrent des variantes très
   pointues (Tall Muscle Snatch, BTN Press in Split...) que la quasi-totalité des utilisateurs ne
   testeront jamais — les afficher TOUTES en permanence (avec un état "verrouillé, ajoute un
   résultat" pour celles jamais loguées) noierait l'écran. `core: false` (défaut pour les cartes
   générées depuis HT_DATA, sauf les 4 mouvements pivots) fait qu'une carte n'apparaît QUE si
   l'exercice a déjà été effectivement logué — exhaustif dans les données, discret dans l'UI. Les
   cartes sans `core` explicite (BW_CARDS, Powerlifting/CrossFit) restent `core: true` par défaut,
   comportement inchangé. */

export type MetricKey =
  | "backSquat" | "frontSquat" | "bench" | "deadlift" | "clean" | "cleanJerk" | "snatch"
  | "belowBtnJerk" | "behindTheNeckJerk" | "blockAboveKneeClean" | "blockAboveKneeSnatch" | "boxCleanPull"
  | "btnPressInSplit" | "cleanDeadlift" | "cleanPull" | "dropJerkTallJerk" | "goodMorning" | "hangClean"
  | "hangSnatch" | "highPull" | "jerk" | "jerkBalance" | "jerkRecovery" | "muscleClean"
  | "muscleSnatchContact" | "muscleSnatchNoLeg" | "noFeetClean" | "noFeetSnatch" | "ohSquat"
  | "ohSquatPushPress" | "powerClean" | "powerCleanBox" | "powerCleanNoFeet" | "powerJerk" | "powerSnatch"
  | "powerSnatchBox" | "powerSnatchNoFoot" | "press" | "pressBtn" | "pressOh" | "pushPress"
  | "snatchBalance" | "snatchDeadlift" | "snatchPull" | "snatchPullBlock" | "snatchSotsPress" | "sotsPress"
  | "tallClean" | "tallMuscleClean" | "tallMuscleSnatch" | "tallSnatch"
  // Endurance (2026-09) — temps de course en minutes décimales (ex. 22.5 = 22min30s), VMA en km/h.
  | "time5k" | "time10k" | "timeSemi" | "timeMarathon"
  // Athlétisme & vitesse (2026-09) — splits sprint en secondes ; hauteurs de saut en cm SAUF
  // dropJumpHeight en MÈTRES (voir RATIO_CARDS ci-dessous : le RSI = hauteur(m)/temps de contact(s),
  // convention de la littérature — mélanger les unités casserait la formule).
  | "sprint10m" | "sprint30m" | "cmjHeight" | "cmjFreeArms" | "squatJumpHeight" | "dropJumpHeight" | "dropJumpContact"
  // Sprint 20/60/100/200m (2026-09, profil de vitesse) — temps cumulés depuis le départ arrêté, en
  // secondes, mêmes conventions que sprint10m/sprint30m. Sans RATIO_CARD associée (aucune norme de
  // population sourcée) — servent uniquement d'entrée au profil de vitesse (sprintProfile.ts),
  // jamais scorées/colorées individuellement.
  | "sprint20m" | "sprint60m" | "sprint100m" | "sprint200m"
  // Fly splits (2026-09, profil de vitesse généralisé) — segment LANCÉ (le sportif est déjà à pleine
  // vitesse au démarrage du chrono), jamais un temps cumulé depuis l'arrêt. Loggable séparément si le
  // sportif teste un vrai lancé chronométré (radar/cellules, sans repartir de 0) ; sert aussi de sortie
  // dérivée du modèle de vitesse (sprintProfile.ts, comparaison réel-vs-attendu via Vmax).
  | "fly10m" | "fly20m" | "fly30m"
  // Endurance (suite, 2026-09) — VMA en km/h, VO2max en ml/kg/min.
  | "vma" | "vo2max";

/* name_key réel (déjà .trim().toLowerCase(), voir testResults.ts) → clé canonique. Couvre les
   variantes FR/EN déjà observées dans la banque d'autocomplete (HISTORY) — ex. "clean & jerk"
   (canonique EN de la banque) et "épaulé-jeté" (canonique FR) désignent le même mouvement mais
   produisent aujourd'hui 2 lignes `tests` distinctes ; cette table les fait converger ici, sans
   jamais fusionner les lignes en base. */
const ALIASES: Record<string, MetricKey> = {
  "back squat": "backSquat", "squat": "backSquat", "squat arrière": "backSquat", "squat arriere": "backSquat",
  "front squat": "frontSquat",
  "bench": "bench", "bench press": "bench", "développé couché": "bench", "developpe couche": "bench", "développé couché barre": "bench",
  "deadlift": "deadlift", "soulevé de terre": "deadlift", "souleve de terre": "deadlift", "sdt": "deadlift",
  "clean": "clean",
  "clean & jerk": "cleanJerk", "clean and jerk": "cleanJerk", "clean jerk": "cleanJerk", "épaulé-jeté": "cleanJerk", "epaule-jete": "cleanJerk", "épaulé jeté": "cleanJerk",
  "snatch": "snatch", "arraché": "snatch", "arrache": "snatch",
  // Variantes/mouvements dérivés d'haltérophilie (source : HT_DATA, voir en tête de fichier) —
  // "hang snatch"/"hang clean" répondent au cas réel signalé par Gildas (loggé "Hang snatch", aucun
  // repère affiché faute d'alias) : scindés en 2 clés distinctes plutôt que fusionnés au générique
  // "position de hang" de la source, un hang snatch et un hang clean n'étant pas le même mouvement.
  "btn press in split": "btnPressInSplit",
  "behind-the-neck jerk": "behindTheNeckJerk",
  "below btn jerk": "belowBtnJerk",
  "block au-dessus du genou (épaulé)": "blockAboveKneeClean",
  "block au-dessus du genou (arraché)": "blockAboveKneeSnatch",
  "box clean pull": "boxCleanPull",
  "clean deadlift": "cleanDeadlift",
  "clean pull": "cleanPull",
  "drop jerk / tall jerk": "dropJerkTallJerk",
  "good morning": "goodMorning",
  "hang clean": "hangClean",
  "hang snatch": "hangSnatch",
  "high pull": "highPull",
  "jerk": "jerk",
  "jerk balance": "jerkBalance",
  "jerk recovery": "jerkRecovery",
  "muscle clean": "muscleClean",
  "muscle snatch (contact)": "muscleSnatchContact",
  "muscle snatch (no leg)": "muscleSnatchNoLeg",
  "no feet clean": "noFeetClean",
  "no feet snatch": "noFeetSnatch",
  "oh squat": "ohSquat",
  "oh squat / push press": "ohSquatPushPress",
  "power clean": "powerClean",
  "power clean box": "powerCleanBox",
  "power clean no feet": "powerCleanNoFeet",
  "power jerk": "powerJerk",
  "power snatch": "powerSnatch",
  "power snatch box": "powerSnatchBox",
  "power snatch no foot": "powerSnatchNoFoot",
  "press": "press",
  "press btn": "pressBtn",
  "press oh": "pressOh",
  "push press": "pushPress",
  "snatch balance": "snatchBalance",
  "snatch deadlift": "snatchDeadlift",
  "snatch pull": "snatchPull",
  "snatch pull block": "snatchPullBlock",
  "snatch sots press": "snatchSotsPress",
  "sots press": "sotsPress",
  "tall clean": "tallClean",
  "tall muscle clean": "tallMuscleClean",
  "tall muscle snatch": "tallMuscleSnatch",
  "tall snatch": "tallSnatch",
  // Synonymes audités contre HISTORY (exerciseAutocomplete.ts, 2026-09) — la banque d'autocomplete
  // des séances et ce dictionnaire sont 2 listes distinctes maintenues séparément (l'autocomplete
  // couvre ~190 exercices, la plupart sans repère ici ; l'inverse serait faux), mais un nom déjà
  // reconnu À LA FRAPPE dans une séance doit aussi être reconnu ICI dès qu'un repère existe pour le
  // mouvement qu'il désigne — sinon un test marqué depuis une séance reste muet sans que rien ne
  // l'explique. Chaque entrée ci-dessous correspond à une clé HISTORY vérifiée une par une (pas une
  // supposition) qui manquait encore un alias vers son MetricKey.
  "épaulé": "clean", "epaule": "clean",
  "jeté": "jerk", "jete": "jerk", "push jerk": "jerk", "split jerk": "jerk",
  "ohp": "press", "overhead press": "press", "développé militaire": "press", "developpe militaire": "press",
  "overhead squat": "ohSquat", "squat arraché": "ohSquat", "squat arrache": "ohSquat",
  "squat avant": "frontSquat",
  "tirage arraché": "snatchPull", "tirage arrache": "snatchPull",
  "tirage épaulé": "cleanPull", "tirage epaule": "cleanPull",
  // Endurance — distances courantes, plusieurs libellés FR/EN pour la même course.
  "5km": "time5k", "5 km": "time5k", "5000m": "time5k", "5 000m": "time5k", "course 5km": "time5k",
  "10km": "time10k", "10 km": "time10k", "10000m": "time10k", "10 000m": "time10k", "course 10km": "time10k",
  "semi-marathon": "timeSemi", "semi marathon": "timeSemi", "semi": "timeSemi", "half marathon": "timeSemi", "21km": "timeSemi", "21,1km": "timeSemi",
  "marathon": "timeMarathon", "42km": "timeMarathon", "42,195km": "timeMarathon",
  // Athlétisme & vitesse — splits sprint et tests de saut.
  "sprint 10m": "sprint10m", "10m": "sprint10m", "temps 10m": "sprint10m",
  "sprint 30m": "sprint30m", "30m": "sprint30m", "temps 30m": "sprint30m",
  "sprint 20m": "sprint20m", "20m": "sprint20m", "temps 20m": "sprint20m",
  // Profil de vitesse (2026-09, suite) — "60m/100m départ arrêté" en alias exact (pas seulement "60m"/
  // "100m" bruts) pour que le test que Gildas a déjà relié manuellement via "🔗 Relier" (voir le fix du
  // matching plus haut, TestsPanel.tsx) devienne canonique sans nouvelle fusion.
  "sprint 60m": "sprint60m", "60m": "sprint60m", "temps 60m": "sprint60m", "60m départ arrêté": "sprint60m",
  "sprint 100m": "sprint100m", "100m": "sprint100m", "temps 100m": "sprint100m", "100m départ arrêté": "sprint100m",
  "sprint 200m": "sprint200m", "200m": "sprint200m", "temps 200m": "sprint200m",
  // Fly splits (2026-09, profil de vitesse généralisé) — "lancé"/"lance" (sans accent, saisie clavier
  // courante) pour distinguer explicitement d'un départ arrêté, jamais confondu avec "20m"/"30m" bruts.
  "fly 10m": "fly10m", "10m lancé": "fly10m", "10m lance": "fly10m",
  "fly 20m": "fly20m", "20m lancé": "fly20m", "20m lance": "fly20m",
  "fly 30m": "fly30m", "30m lancé": "fly30m", "30m lance": "fly30m",
  // "saut vertical (cmj)" (avec la parenthèse) est le nom EXACT créé par METRIC_DISPLAY.cmjHeight —
  // bug réel trouvé par Gildas (2026-09) : sans cet alias précis, une carte ajoutée depuis la carte
  // interprétée elle-même (donc sous ce nom exact) n'était jamais reconnue par canonicalMetricKey,
  // créait une 2e carte brute en double, ET rendait "🔗 Relier" destructeur (fusionner un test dans
  // son propre nom == même test_id == mergeTestInto le vidait puis le supprimait, voir son fix).
  "cmj": "cmjHeight", "countermovement jump": "cmjHeight", "saut cmj": "cmjHeight", "saut vertical": "cmjHeight", "saut vertical (cmj)": "cmjHeight", "détente verticale": "cmjHeight", "detente verticale": "cmjHeight",
  // "CMJ free arms"/"bras libres" (2026-09) — ERREUR CORRIGÉE : un 1er passage l'avait aliasé sur
  // cmjHeight (même métrique que le CMJ classique), en comprenant à tort "ils devraient être liés
  // par défaut" comme "ce sont le même test". Gildas a explicitement corrigé : ce sont 2 tests
  // RÉELLEMENT différents (CMJ bras libres/swing autorisé mesure généralement ~10% plus haut qu'un
  // CMJ mains sur les hanches — littérature du saut vertical, les 2 sont distingués), déjà traités
  // comme tels intentionnellement ailleurs dans le code (`testBattery.ts` : recommandé séparément,
  // description explicite "la comparaison avec ton CMJ standard isole la contribution du balancement
  // des bras" — une vraie comparaison, impossible si fondus dans la même métrique). Le vrai bug
  // signalé n'était PAS l'absence de fusion mais l'absence de MetricKey PROPRE : sans lui, ce test
  // créait 2 fiches séparées une fois loggué (la carte recommandée "jamais faite", jamais marquée
  // faite car `BATTERY_TEST_METRICS` ne la mappait à rien + une 2e carte brute non reliée demandant
  // un "🔗 Relier" manuel) au lieu d'être reconnu comme SA PROPRE carte, comme "Saut vertical (CMJ)"
  // l'est déjà pour cmjHeight. Fixé avec un MetricKey dédié `cmjFreeArms` (voir plus haut/
  // METRIC_DISPLAY/testBattery.ts BATTERY_TEST_METRICS/testQualities.ts METRIC_QUALITY) plutôt qu'un
  // alias vers cmjHeight — reconnu automatiquement, jamais fondu avec le CMJ classique.
  "cmj free arms": "cmjFreeArms", "cmj bras libres": "cmjFreeArms", "saut vertical bras libres": "cmjFreeArms",
  "saut vertical bras libres (cmj free arms)": "cmjFreeArms", "countermovement jump free arms": "cmjFreeArms",
  // Limite connue : "Squat Jump" désigne aussi un exercice d'entraînement CHARGÉ (squat sauté avec
  // barre, HISTORY sport 🏋️) dans les programmes haltéro/powerlifting — s'il est un jour marqué
  // comme test avec une valeur en kg, il sera interprété à tort comme une hauteur de saut en cm.
  // Non traité ici (collision de sens sur le même nom, pas un bug de matching) — à surveiller.
  "squat jump": "squatJumpHeight", "sj": "squatJumpHeight", "saut squat jump": "squatJumpHeight",
  "drop jump": "dropJumpHeight", "depth jump": "dropJumpHeight", "hauteur drop jump": "dropJumpHeight", "hauteur de saut (drop jump)": "dropJumpHeight",
  // "drop jump (rsi)" — nom EXACT du test recommandé (testBattery.ts) ET nom de METRIC_DISPLAY
  // ci-dessous (2026-09, suite) : les 2 noms sont désormais identiques, jamais 2 identités séparées
  // pour la même carte (bug déjà rencontré et corrigé pour "100m"/"100m départ arrêté" — alias manquant
  // pour l'un des 2 noms). Défensif : couvre aussi un éventuel vieux test loggué sous ce nom exact.
  "drop jump (rsi)": "dropJumpHeight",
  "temps de contact": "dropJumpContact", "temps de contact (drop jump)": "dropJumpContact", "contact drop jump": "dropJumpContact",
  // Tests de terrain qui donnent directement une VMA en km/h (2026-09, suite — manque signalé par
  // Gildas, "il manque Luc Léger") : "Luc Léger"/"test navette"/VAMEVAL/beep test sont des PROTOCOLES
  // (façons de mesurer), pas une métrique différente — leur résultat final EST une VMA, donc un alias
  // direct suffit (contrairement à Cooper/Demi-Cooper, qui donnent une DISTANCE en mètres, pas
  // directement une VMA — nécessiteraient une vraie formule de conversion sourcée, pas juste un
  // alias ; non traité ici, à faire séparément si demandé).
  "luc léger": "vma", "luc leger": "vma", "test de luc léger": "vma", "test de luc leger": "vma",
  "test luc léger": "vma", "test luc leger": "vma", "test navette": "vma", "navette": "vma",
  "navette de luc léger": "vma", "navette de luc leger": "vma", "vameval": "vma", "test vameval": "vma",
  "beep test": "vma", "test vma": "vma",
  "vma": "vma", "vitesse maximale aérobie": "vma", "vitesse maximale aerobie": "vma",
  "vo2max": "vo2max", "vo2 max": "vo2max", "consommation maximale d'oxygène": "vo2max", "consommation maximale d'oxygene": "vo2max",
};

export function canonicalMetricKey(nameKey: string): MetricKey | null {
  return ALIASES[nameKey.trim().toLowerCase()] ?? null;
}

/* Drop jump — hauteur via temps de vol (2026-09) : beaucoup de chronomètres/apps de saut ne donnent
   que le temps de vol, pas la hauteur directement — plutôt que de forcer un aller-retour vers un
   calculateur externe, les 2 points d'entrée (TestsPanel.tsx et ExerciseBlockEditor.tsx) acceptent les
   deux et convertissent en interne via la physique du projectile (h = g·t²/8, dérivée de
   t = 2·√(2h/g) pour un saut symétrique montée/descente). Un seul point de vérité pour la formule,
   partagé par les 2 fichiers — la valeur stockée reste toujours une vraie hauteur en mètres,
   compatible telle quelle avec le seuil RSI existant ([1.5, 2.5]) sans aucun changement de ce côté. */
export const G_ACCEL = 9.81;
export function heightFromFlightTime(tSeconds: number): number {
  return (G_ACCEL * tSeconds * tSeconds) / 8;
}
/* Inverse de heightFromFlightTime (t = 2·√(2h/g)) — nécessaire pour calculer le ratio "temps de
   vol÷temps de contact" (voir ftctRatio ci-dessous) à partir de la hauteur canonique stockée, sans
   jamais redemander la donnée à l'utilisateur. */
export function flightTimeFromHeight(meters: number): number {
  return 2 * Math.sqrt((2 * meters) / G_ACCEL);
}

/* Cooper/Demi-Cooper — distance parcourue (m) → VO2max/VMA estimés (2026-09, demande de Gildas).
   Même principe que heightFromFlightTime ci-dessus : un alternative input method qui convertit vers
   l'unité canonique déjà stockée (vo2max en ml/kg/min, vma en km/h), jamais un nouveau MetricKey —
   la valeur écrite reste directement comparable à un VO2max/VMA mesuré autrement (même historique,
   même graphe). Formules vérifiées par recherche web le jour même (pas recopiées de mémoire) :
   - Cooper (12 min) : VO2max = (distance_m − 504.9) / 44.73 — régression linéaire originale de
     Cooper (K.H. Cooper, 1968, JAMA, "A Means of Assessing Maximal Oxygen Intake"), la formule la
     plus citée pour ce test, confirmée identique sur plusieurs calculateurs indépendants.
   - Demi-Cooper (6 min) : VMA(km/h) = distance_m / 100 — vitesse moyenne sur la durée du test,
     convention de terrain (pas une régression physiologique comme Cooper), corroborée à l'identique
     par 5 sources françaises de coaching indépendantes (irbms.com, wanarun.net, bandax.fr,
     fitdistance.io, campus.coach). Fenêtre de 6 min jugée par ces mêmes sources plus proche de la
     durée soutenable à VMA (~4-8 min) que les 12 min de Cooper — d'où son usage pour estimer la VMA
     plutôt que le VO2max, dans cette littérature. */
export function vo2maxFromCooperDistance(distanceM: number): number {
  return (distanceM - 504.9) / 44.73;
}
export function vmaFromDemiCooperDistance(distanceM: number): number {
  return distanceM / 100;
}

/* Ratio "temps de vol ÷ temps de contact" (2026-09, dit "style MyJump" — FT:CT ratio dans la
   littérature) : PAS le même chiffre que le RSI officiel de ce projet (RSI = hauteur(m)/contact(s),
   RATIO_CARDS ci-dessous, seuils sourcés [1.5, 2.5]) — les 2 formules ne sont PAS une simple
   conversion d'unité l'une de l'autre (le facteur de passage entre les 2 dépend du temps de vol
   lui-même, donc varie saut par saut : impossible de réutiliser les seuils RSI sur cette échelle sans
   fausser le classement). Aucun seuil publié trouvé pour CE ratio précis (recherché explicitement,
   voir échange avec Gildas 2026-09) — reste donc volontairement un chiffre affiché SANS
   couleur/jauge/score, jamais utilisé dans le calcul de forces/faiblesses. */
export function ftctRatio(heightM: number, contactS: number): number {
  return flightTimeFromHeight(heightM) / contactS;
}

/* Élasticité vs force (2026-09) — à hauteur/temps de vol égal, classe le profil du drop jump selon le
   temps de contact au sol : seuil de 250ms sourcé de la classification "fast/slow SSC" de
   Schmidtbleicher (cycle étirement-détente), reprise notamment par le Journal of Sports Sciences 2024
   ("A new approach for classification of stretch-shortening cycle: beyond 250ms of ground contact
   time") et l'UKSCA — <0.25s = fast SSC (profil élasticité), ≥0.25s = slow SSC (profil davantage basé
   sur la force). Seuil unique, pas de zone tampon : la littérature source elle-même le pose en
   frontière nette, pas en fourchette. Exportée ici (pas dans TestsPanel.tsx) pour être réutilisée
   aussi par ExerciseBlockEditor.tsx — un seul point de vérité pour le seuil et le texte. */
export const SSC_THRESHOLD_S = 0.25;
/* Seuils RSI (S&C/NSCA, voir RATIO_CARDS ci-dessous) — exportés pour être réutilisés tels quels par
   l'affichage "repère" (ExerciseBlockEditor.tsx), plutôt que de recopier [1.5, 2.5] en dur ailleurs. */
export const RSI_NORMS: [number, number] = [1.5, 2.5];
export function dropJumpProfile(contactSec: number | undefined): { label: string; detail: string } | null {
  if (contactSec == null) return null;
  const elastic = contactSec < SSC_THRESHOLD_S;
  const ms = Math.round(contactSec * 1000);
  const thresholdMs = Math.round(SSC_THRESHOLD_S * 1000);
  return elastic
    ? { label: "⚡ Profil élasticité", detail: `Temps de contact court (${ms}ms, sous ${thresholdMs}ms) : cycle étirement-détente rapide (fast SSC). Pour une même hauteur/temps de vol, tu produis ta force très vite.` }
    : { label: "🏋️ Profil force", detail: `Temps de contact plus long (${ms}ms, à partir de ${thresholdMs}ms) : cycle étirement-détente lent (slow SSC). Pour une même hauteur/temps de vol, tu t'appuies davantage sur de la force pure.` };
}

/* Affichage cm/ms (2026-09) — le stockage canonique reste mètres/secondes (dropJumpHeight/
   dropJumpContact, jamais changé : c'est l'unité que suppose le calcul RSI = hauteur(m)/contact(s)
   et les seuils sourcés [1.5, 2.5]). Ces 2 fonctions ne servent qu'à la présentation (saisie et
   relecture) — un drop jump se mesure naturellement en cm/ms (apps comme MyJump, plateformes de
   contact), pas en 0,44m/0,258s. Jamais utilisées dans un calcul, seulement dans du texte affiché. */
export function formatDropJumpHeightCm(meters: number): string {
  return `${(meters * 100).toFixed(2)} cm`;
}
export function formatDropJumpContactMs(seconds: number): string {
  return `${Math.round(seconds * 1000)} ms`;
}

/* Nom d'affichage + unité par clé canonique — utilisé (a) comme titre de carte et (b) pour créer un
   nouveau test depuis l'ajout inline de ces cartes quand aucun test existant ne matche déjà cette
   clé (voir TestsPanel.tsx : si un test existant matche, son name/unit exact est réutilisé à la
   place, pour ne jamais créer un doublon sous un alias différent). Reprend mot pour mot les noms
   canoniques déjà utilisés par la banque d'autocomplete (HISTORY, exerciseAutocomplete.ts). */
export const METRIC_DISPLAY: Record<MetricKey, { name: string; unit: string }> = {
  backSquat: { name: "Back squat", unit: "kg" },
  frontSquat: { name: "Front squat", unit: "kg" },
  bench: { name: "Bench press", unit: "kg" },
  deadlift: { name: "Deadlift", unit: "kg" },
  clean: { name: "Clean", unit: "kg" },
  cleanJerk: { name: "Clean & Jerk", unit: "kg" },
  snatch: { name: "Snatch", unit: "kg" },
  btnPressInSplit: { name: "BTN Press in Split", unit: "kg" },
  behindTheNeckJerk: { name: "Behind-the-Neck Jerk", unit: "kg" },
  belowBtnJerk: { name: "Below BTN Jerk", unit: "kg" },
  blockAboveKneeClean: { name: "Block au-dessus du genou (épaulé)", unit: "kg" },
  blockAboveKneeSnatch: { name: "Block au-dessus du genou (arraché)", unit: "kg" },
  boxCleanPull: { name: "Box Clean Pull", unit: "kg" },
  cleanDeadlift: { name: "Clean Deadlift", unit: "kg" },
  cleanPull: { name: "Clean Pull", unit: "kg" },
  dropJerkTallJerk: { name: "Drop Jerk / Tall Jerk", unit: "kg" },
  goodMorning: { name: "Good Morning", unit: "kg" },
  hangClean: { name: "Hang Clean", unit: "kg" },
  hangSnatch: { name: "Hang Snatch", unit: "kg" },
  highPull: { name: "High Pull", unit: "kg" },
  jerk: { name: "Jerk", unit: "kg" },
  jerkBalance: { name: "Jerk Balance", unit: "kg" },
  jerkRecovery: { name: "Jerk Recovery", unit: "kg" },
  muscleClean: { name: "Muscle Clean", unit: "kg" },
  muscleSnatchContact: { name: "Muscle Snatch (contact)", unit: "kg" },
  muscleSnatchNoLeg: { name: "Muscle Snatch (no leg)", unit: "kg" },
  noFeetClean: { name: "No Feet Clean", unit: "kg" },
  noFeetSnatch: { name: "No Feet Snatch", unit: "kg" },
  ohSquat: { name: "OH Squat", unit: "kg" },
  ohSquatPushPress: { name: "OH Squat / Push Press", unit: "kg" },
  powerClean: { name: "Power Clean", unit: "kg" },
  powerCleanBox: { name: "Power Clean Box", unit: "kg" },
  powerCleanNoFeet: { name: "Power Clean No Feet", unit: "kg" },
  powerJerk: { name: "Power Jerk", unit: "kg" },
  powerSnatch: { name: "Power Snatch", unit: "kg" },
  powerSnatchBox: { name: "Power Snatch Box", unit: "kg" },
  powerSnatchNoFoot: { name: "Power Snatch No Foot", unit: "kg" },
  press: { name: "Press", unit: "kg" },
  pressBtn: { name: "Press BTN", unit: "kg" },
  pressOh: { name: "Press OH", unit: "kg" },
  pushPress: { name: "Push Press", unit: "kg" },
  snatchBalance: { name: "Snatch Balance", unit: "kg" },
  snatchDeadlift: { name: "Snatch Deadlift", unit: "kg" },
  snatchPull: { name: "Snatch Pull", unit: "kg" },
  snatchPullBlock: { name: "Snatch Pull Block", unit: "kg" },
  snatchSotsPress: { name: "Snatch Sots Press", unit: "kg" },
  sotsPress: { name: "Sots Press", unit: "kg" },
  tallClean: { name: "Tall Clean", unit: "kg" },
  tallMuscleClean: { name: "Tall Muscle Clean", unit: "kg" },
  tallMuscleSnatch: { name: "Tall Muscle Snatch", unit: "kg" },
  tallSnatch: { name: "Tall Snatch", unit: "kg" },
  time5k: { name: "5 km", unit: "min" },
  time10k: { name: "10 km", unit: "min" },
  timeSemi: { name: "Semi-marathon", unit: "min" },
  timeMarathon: { name: "Marathon", unit: "min" },
  sprint10m: { name: "Sprint 10m", unit: "s" },
  sprint20m: { name: "Sprint 20m", unit: "s" },
  sprint30m: { name: "Sprint 30m", unit: "s" },
  sprint60m: { name: "Sprint 60m", unit: "s" },
  sprint100m: { name: "Sprint 100m", unit: "s" },
  sprint200m: { name: "Sprint 200m", unit: "s" },
  fly10m: { name: "Fly 10m", unit: "s" },
  fly20m: { name: "Fly 20m", unit: "s" },
  fly30m: { name: "Fly 30m", unit: "s" },
  cmjHeight: { name: "Saut vertical (CMJ)", unit: "cm" },
  // Distinct de cmjHeight (2026-09) — CMJ avec swing des bras autorisé, un vrai test à part dans la
  // littérature de saut vertical (voir ALIASES ci-dessous pour l'historique de la correction).
  cmjFreeArms: { name: "Saut vertical bras libres (CMJ free arms)", unit: "cm" },
  squatJumpHeight: { name: "Squat Jump", unit: "cm" },
  // "Drop Jump (RSI)" — même nom EXACT que testBattery.ts (2026-09, suite, demande de Gildas : un seul
  // nom, avant et après avoir loggué, plutôt que "Drop jump" une fois interprété vs "Drop Jump (RSI)"
  // pendant qu'il n'est encore que recommandé — 2 noms différents pour la même carte selon le moment).
  dropJumpHeight: { name: "Drop Jump (RSI)", unit: "m" },
  dropJumpContact: { name: "Temps de contact (drop jump)", unit: "s" },
  vma: { name: "VMA", unit: "km/h" },
  vo2max: { name: "VO2max", unit: "ml/kg/min" },
};

function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Suggère les noms canoniques les plus proches d'un texte libre non reconnu par canonicalMetricKey()
   (2026-09) — utilisé au moment de "Marquer comme test" (ExerciseBlockEditor.tsx) pour proposer un
   nom qui débloquera une interprétation, sans jamais renommer quoi que ce soit de force : l'appelant
   décide s'il applique la suggestion. Cherche sur TOUTES les variantes d'ALIASES (pas seulement le
   nom d'affichage principal) — nécessaire pour rapprocher une phrase qui ne partage aucun mot avec
   le nom canonique anglais mais correspond à un synonyme déjà connu (ex. "Développé militaire lesté"
   ne partage aucun mot avec "Press", mais partage "développé"+"militaire" avec l'alias "développé
   militaire" déjà mappé sur `press`). Égalité de mot stricte (≥4 lettres, des deux côtés) plutôt
   qu'une inclusion de sous-chaîne : un premier essai en containment bidirectionnel produisait des
   faux positifs (un mot court comme "de" est une sous-chaîne de nombreux mots plus longs, sans
   rapport). Retourne [] si rien ne dépasse un score de 0 — jamais une suggestion hasardeuse plutôt
   que pas de suggestion du tout. */
export function suggestCanonicalNames(query: string, limit = 5): MetricKey[] {
  const norm = normalizeForMatch(query);
  if (!norm) return [];
  const words = norm.split(" ").filter(w => w.length >= 4);
  if (!words.length) return [];
  const bestByKey = new Map<MetricKey, number>();
  for (const [alias, key] of Object.entries(ALIASES)) {
    const name = normalizeForMatch(alias);
    let score = 0;
    if (name === norm) score = 100;
    else {
      const nameWords = name.split(" ").filter(w => w.length >= 4);
      const shared = words.filter(w => nameWords.includes(w));
      score = shared.length * 10;
    }
    if (score > (bestByKey.get(key) ?? 0)) bestByKey.set(key, score);
  }
  const scored = Array.from(bestByKey.entries()).filter(([, s]) => s > 0);
  scored.sort((a, b) => b[1] - a[1] || METRIC_DISPLAY[a[0]].name.localeCompare(METRIC_DISPLAY[b[0]].name));
  return scored.slice(0, limit).map(([k]) => k);
}

type Norms = { homme: [number, number]; femme: [number, number] };
export type Sexe = "homme" | "femme" | null;
/* Point de référence théorique (2026-09) — PAS toujours le milieu de `norms` : les bandes
   asymétriques (paires endurance/sprint, tolérance +20%/-15%) et les cartes cross-validées (valeur
   de littérature précise, pas une simple bande ±8%) ont un vrai centre différent du milieu
   arithmétique. Piloté par la jauge (petit repère vertical) plutôt que par du texte ("repère
   théorique ~80%") — voir ComparisonBlock, TestsPanel.tsx. */
type RefPoint = { homme: number; femme: number };

const pct0 = (v: number) => `${Math.round(v * 100)}%`;
const xTimes = (v: number) => `${v.toFixed(2)}x`;
const idxFmt = (v: number) => v.toFixed(2);

/* Repère "équilibre" en valeur absolue (2026-09) — demandé par Gildas : le petit trait sur la jauge
   ne doit pas afficher le ratio théorique en % / multiple abstrait ("80%", "0.88x") mais la vraie
   valeur attendue DANS L'UNITÉ DE L'EXERCICE TESTÉ ("128 kg"), calculée à partir de LA DONNÉE RÉELLE
   de CET utilisateur pour la référence (son propre Back Squat, son propre poids de corps...), jamais
   un chiffre abstrait déconnecté de ses propres performances. `basis` = la valeur brute déjà loggée
   de la référence (bVal pour un ratio entre 2 exercices, poidsKg pour un ratio au poids de corps) ;
   `unit` = l'unité de l'exercice TESTÉ (card.a / card.metric), pas celle de la référence — les 2
   partagent toujours la même unité physique dans toutes les cartes existantes (kg/kg, s/s, m/m). */
function formatAbsoluteRef(refRatio: number, basis: number, unit: string): string {
  return `${Math.round(refRatio * basis * 10) / 10} ${unit}`;
}

export interface RatioCardDef {
  id: string;
  /** L'exercice réellement testé (card.a) — jamais la référence (card.b). */
  a: MetricKey;
  b: MetricKey;
  bLabel: string;
  norms: Norms;
  fmt: (v: number) => string;
  desc: string;
  advice: string;
  /** false = la carte n'apparaît que si l'exercice a déjà été logué (voir note en tête de fichier) —
      défaut true (toujours visible, invite à tester) si absent. */
  core?: boolean;
  refValue?: RefPoint;
}

export interface BodyweightCardDef {
  id: string;
  metric: MetricKey;
  norms: Norms;
  fmt: (v: number) => string;
  desc: string;
  advice: string;
  core?: boolean;
  refValue?: RefPoint;
}

/* Comme BodyweightCardDef mais SANS division (pas de poids de corps, pas de 2e lift) : la valeur du
   test est comparée directement à une classification fixe. Nécessaire pour le VO2max (2026-09) — un
   ml/kg/min se compare déjà "par kilo", diviser une 2e fois par le poids serait faux. Premier et
   seul cas d'usage à ce jour ; RATIO_CARDS/BW_CARDS restent le bon choix dès qu'il y a un vrai 2e
   terme (autre lift, ou poids de corps). */
export interface AbsoluteCardDef {
  id: string;
  metric: MetricKey;
  norms: Norms;
  fmt: (v: number) => string;
  desc: string;
  advice: string;
  core?: boolean;
  /** Absent pour une classification graduée (ex. VO2max/ACSM, plusieurs paliers fair→superior) —
      il n'y a pas UN point cible unique à marquer sur la jauge dans ce cas. */
  refValue?: RefPoint;
}

/* Cartes "force" (2026-09, suite) — Haltérophilie/Powerlifting/Fitness-CrossFit partagent désormais
   UN SEUL tableau (`FORCE_RATIO_CARDS`), pas 3 tableaux indépendants keyés par famille : ces 3
   familles portent toutes des ratios sur les MÊMES exercices pivots (Back Squat, Clean & Jerk...),
   et les garder séparés produisait des doublons contradictoires pour un même couple d'exercices —
   ex. Clean & Jerk:Back Squat valait 80% (sourcé ThePerfClub, famille Haltérophilie) ET 65% (carte
   `cjSquatCf`, sans aucune source, famille Fitness/CrossFit) selon le sport de profil consulté, un
   bug réel trouvé par Gildas ("Clean & Jerk vs Squat c'est 80%, documenté"). Un seul tableau =
   structurellement impossible d'avoir 2 valeurs différentes pour le même ratio. `cjSquatCf` a été
   supprimée (gardait un chiffre non sourcé) — le ratio Clean & Jerk:Back Squat de la vraie carte
   sourcée (`cleanJerk_backSquat`, ~80%, extrait direct de HT_DATA) s'applique désormais aussi bien à
   un profil Fitness/CrossFit qu'Haltérophilie/Powerlifting. Filtrage désormais 100% piloté par la
   qualité physique travaillée (testQualities.ts, `activeQuality`) et par les métriques déjà loguées
   (cartes verrouillées) plutôt que par le sport auto-déclaré — cohérent avec la demande de Gildas de
   ne plus "trop s'occuper du sport du user" pour ces repères de force. "Endurance" et "Athlétisme &
   vitesse" restent des tableaux séparés, sans exercice en commun avec les 3 familles force
   (vérifié) — aucune raison de les fusionner, laissés inchangés ci-dessous.
   Clé du Record externe = famille de sport telle que retournée par guessSportChip()
   (src/lib/sportCategories.ts) — Haltérophilie/Powerlifting/Fitness-CrossFit pointent toutes vers
   `FORCE_RATIO_CARDS`, la même référence de tableau (pas une copie), pour que `ALL_FAMILIES`/
   `computeAllFamiliesInsights` (dédupliqué par `id`) et `activeFamily` (TestsPanel.tsx) continuent
   de fonctionner sans aucun changement de signature. */
const FORCE_RATIO_CARDS: RatioCardDef[] = [
  // Exhaustif — extrait de HT_DATA (calculateur publié sur theperfclub.com, voir note en tête de
  // fichier). `core: true` sur les 4 mouvements pivots (Front Squat/Back Squat, Snatch/CJ, Clean/CJ,
  // Back Squat/CJ) : toujours visibles pour inviter à les tester. Les 59 autres (`core: false`)
  // n'apparaissent que si l'exercice a déjà été logué — exhaustif dans les données, discret dans
  // l'UI tant que ces variantes pointues (Tall Muscle Snatch, BTN Press in Split...) ne sont pas
  // réellement pratiquées par l'utilisateur.
    { id: "clean_backSquat", a: "clean", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.736, 0.864], femme: [0.736, 0.864] }, refValue: { homme: 0.8, femme: 0.8 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~80% (ThePerfClub).",
      advice: "Ajoute des cleans depuis le sol à charge progressive et des tirages explosifs 2x/semaine pour améliorer la vitesse de passage sous la barre : souvent un problème de timing/réception plutôt qu'un manque de force." },
    { id: "clean_deadlift", a: "clean", b: "deadlift", bLabel: "Soulevé de terre", norms: { homme: [0.70, 0.75], femme: [0.70, 0.75] }, refValue: { homme: 0.725, femme: 0.725 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Soulevé de terre, repère théorique ~72,5% (Greg Everett/Catalyst Athletics).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "cleanDeadlift_backSquat", a: "cleanDeadlift", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.92, 1.08], femme: [0.92, 1.08] }, refValue: { homme: 1, femme: 1 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~100% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "cleanJerk_backSquat", a: "cleanJerk", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.736, 0.864], femme: [0.736, 0.864] }, refValue: { homme: 0.8, femme: 0.8 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~80% (ThePerfClub).",
      advice: "Priorise le travail du complexe clean+jerk à charge sous-maximale (80-90%) pour la fluidité d'enchaînement sous fatigue, plutôt que d'isoler encore le squat." },
    { id: "cleanJerk_frontSquat", a: "cleanJerk", b: "frontSquat", bLabel: "Front Squat", norms: { homme: [0.85, 0.90], femme: [0.85, 0.90] }, refValue: { homme: 0.875, femme: 0.875 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Front Squat, repère théorique ~87,5% (Greg Everett/Catalyst Athletics).",
      advice: "Priorise le travail du complexe clean+jerk à charge sous-maximale (80-90%) pour la fluidité d'enchaînement sous fatigue, plutôt que d'isoler encore le squat." },
    { id: "cleanPull_backSquat", a: "cleanPull", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.92, 1.08], femme: [0.92, 1.08] }, refValue: { homme: 1, femme: 1 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~100% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "deadlift_backSquat", a: "deadlift", b: "backSquat", bLabel: "Back Squat", norms: { homme: [1.15, 1.35], femme: [1.15, 1.35] }, refValue: { homme: 1.25, femme: 1.25 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~125% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "frontSquat_backSquat", a: "frontSquat", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.8096, 0.9504], femme: [0.8096, 0.9504] }, refValue: { homme: 0.88, femme: 0.88 }, fmt: pct0, core: true,
      desc: "Rapporté à ton Back Squat, repère théorique ~88% (ThePerfClub).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat, épaule/cheville/hanche pour l'overhead squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "jerk_backSquat", a: "jerk", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.7728, 0.9072], femme: [0.7728, 0.9072] }, refValue: { homme: 0.84, femme: 0.84 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~84% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "ohSquat_backSquat", a: "ohSquat", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.621, 0.729], femme: [0.621, 0.729] }, refValue: { homme: 0.675, femme: 0.675 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~68% (ThePerfClub).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat, épaule/cheville/hanche pour l'overhead squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "powerClean_backSquat", a: "powerClean", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.598, 0.702], femme: [0.598, 0.702] }, refValue: { homme: 0.65, femme: 0.65 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~65% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerJerk_backSquat", a: "powerJerk", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.6624, 0.7776], femme: [0.6624, 0.7776] }, refValue: { homme: 0.72, femme: 0.72 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~72% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerSnatch_backSquat", a: "powerSnatch", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.506, 0.594], femme: [0.506, 0.594] }, refValue: { homme: 0.55, femme: 0.55 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~55% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "snatch_backSquat", a: "snatch", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.598, 0.702], femme: [0.598, 0.702] }, refValue: { homme: 0.65, femme: 0.65 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~65% (ThePerfClub).",
      advice: "Ajoute de l'arraché technique (60-75%) en insistant sur la vitesse de tirage et la mobilité overhead : rarement un problème de force pure à ce ratio." },
    { id: "snatchDeadlift_backSquat", a: "snatchDeadlift", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.828, 0.972], femme: [0.828, 0.972] }, refValue: { homme: 0.9, femme: 0.9 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~90% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "snatchPull_backSquat", a: "snatchPull", b: "backSquat", bLabel: "Back Squat", norms: { homme: [0.69, 0.81], femme: [0.69, 0.81] }, refValue: { homme: 0.75, femme: 0.75 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Back Squat, repère théorique ~75% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "blockAboveKneeClean_clean", a: "blockAboveKneeClean", b: "clean", bLabel: "Clean", norms: { homme: [0.874, 1.026], femme: [0.874, 1.026] }, refValue: { homme: 0.95, femme: 0.95 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~95% (ThePerfClub, cross-validé Table de Baroga « Épaulé flexion des plots/suspension » — relatif à l'Épaulé-Jeté : 96,7%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "boxCleanPull_clean", a: "boxCleanPull", b: "clean", bLabel: "Clean", norms: { homme: [1.288, 1.512], femme: [1.288, 1.512] }, refValue: { homme: 1.4, femme: 1.4 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~140% (ThePerfClub, cross-validé Table de Baroga « Tirage lourd d'épaulé des plots/suspension » — relatif à l'Épaulé-Jeté : 139,2%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "cleanDeadlift_clean", a: "cleanDeadlift", b: "clean", bLabel: "Clean", norms: { homme: [1.15, 1.35], femme: [1.15, 1.35] }, refValue: { homme: 1.25, femme: 1.25 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~125% (ThePerfClub, cross-validé Table de Baroga « Tirage lourd d'épaulé » — relatif à l'Épaulé-Jeté : 128,3%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "frontSquat_clean", a: "frontSquat", b: "clean", bLabel: "Clean", norms: { homme: [1.058, 1.242], femme: [1.058, 1.242] }, refValue: { homme: 1.15, femme: 1.15 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~115% (ThePerfClub).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat, épaule/cheville/hanche pour l'overhead squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "hangClean_clean", a: "hangClean", b: "clean", bLabel: "Clean", norms: { homme: [0.874, 1.026], femme: [0.874, 1.026] }, refValue: { homme: 0.95, femme: 0.95 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~95% (ThePerfClub).",
      advice: "Teste ta force de départ et ton timing d'engagement de la barre depuis une position statique, sans l'élan du sol. Ajoute des tirages/cleans-snatch depuis le hang (pause 2s) pour renforcer précisément ce point." },
    { id: "muscleClean_clean", a: "muscleClean", b: "clean", bLabel: "Clean", norms: { homme: [0.5811, 0.6821], femme: [0.5811, 0.6821] }, refValue: { homme: 0.6316, femme: 0.6316 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~63% (ThePerfClub).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "noFeetClean_clean", a: "noFeetClean", b: "clean", bLabel: "Clean", norms: { homme: [0.8522, 1.0004], femme: [0.8522, 1.0004] }, refValue: { homme: 0.9263, femme: 0.9263 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~93% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerClean_clean", a: "powerClean", b: "clean", bLabel: "Clean", norms: { homme: [0.8096, 0.9504], femme: [0.8096, 0.9504] }, refValue: { homme: 0.88, femme: 0.88 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~88% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerCleanBox_clean", a: "powerCleanBox", b: "clean", bLabel: "Clean", norms: { homme: [0.7457, 0.8753], femme: [0.7457, 0.8753] }, refValue: { homme: 0.8105, femme: 0.8105 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~81% (ThePerfClub, cross-validé Table de Baroga « Épaulé debout des plots/suspension » — relatif à l'Épaulé-Jeté : 80%).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerCleanNoFeet_clean", a: "powerCleanNoFeet", b: "clean", bLabel: "Clean", norms: { homme: [0.6779, 0.7957], femme: [0.6779, 0.7957] }, refValue: { homme: 0.7368, femme: 0.7368 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~74% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "press_clean", a: "press", b: "clean", bLabel: "Clean", norms: { homme: [0.46, 0.54], femme: [0.46, 0.54] }, refValue: { homme: 0.5, femme: 0.5 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~50% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "tallClean_clean", a: "tallClean", b: "clean", bLabel: "Clean", norms: { homme: [0.5811, 0.6821], femme: [0.5811, 0.6821] }, refValue: { homme: 0.6316, femme: 0.6316 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~63% (ThePerfClub).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "tallMuscleClean_clean", a: "tallMuscleClean", b: "clean", bLabel: "Clean", norms: { homme: [0.4164, 0.4888], femme: [0.4164, 0.4888] }, refValue: { homme: 0.4526, femme: 0.4526 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~45% (ThePerfClub).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "btnPressInSplit_cleanJerk", a: "btnPressInSplit", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.4939, 0.5797], femme: [0.4939, 0.5797] }, refValue: { homme: 0.5368, femme: 0.5368 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~54% (ThePerfClub, cross-validé Table de Baroga « Développé nuque en fente » : 53,3%).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "backSquat_cleanJerk", a: "backSquat", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [1.25, 1.4], femme: [1.25, 1.4] }, refValue: { homme: 1.35, femme: 1.35 }, fmt: pct0, core: true,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~135% (cross-validé Torokhtiy/Everett).",
      advice: "Ajoute un bloc de force squat dédié (3-5 reps, 80-90%), indépendant des séances technique, pour rattraper ton retard de force brute derrière tes lifts olympiques." },
    { id: "behindTheNeckJerk_cleanJerk", a: "behindTheNeckJerk", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.9476, 1.1124], femme: [0.9476, 1.1124] }, refValue: { homme: 1.03, femme: 1.03 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~103% (ThePerfClub, cross-validé Table de Baroga « Jeté nuque » : 106,7%).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "belowBtnJerk_cleanJerk", a: "belowBtnJerk", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.4164, 0.4888], femme: [0.4164, 0.4888] }, refValue: { homme: 0.4526, femme: 0.4526 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~45% (ThePerfClub, cross-validé Table de Baroga « Chute de jeté nuque » : match exact).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "clean_cleanJerk", a: "clean", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [1.0, 1.05], femme: [1.0, 1.05] }, refValue: { homme: 1.03, femme: 1.03 }, fmt: pct0, core: true,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~103% (cross-validé Torokhtiy/Everett/Table de Baroga « Épaulé flexion » : 100%).",
      advice: "Ton clean laisse peu de marge avant le jerk : ajoute du travail de clean isolé (avec pause en réception) pour construire une marge de sécurité avant d'attaquer le jerk à pleine charge." },
    { id: "dropJerkTallJerk_cleanJerk", a: "dropJerkTallJerk", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.4164, 0.4888], femme: [0.4164, 0.4888] }, refValue: { homme: 0.4526, femme: 0.4526 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~45% (ThePerfClub, cross-validé Table de Baroga « Chute de jeté » : match exact).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "frontSquat_cleanJerk", a: "frontSquat", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [1.08, 1.19], femme: [1.08, 1.19] }, refValue: { homme: 1.15, femme: 1.15 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~115% (cross-validé Torokhtiy/Everett).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat, épaule/cheville/hanche pour l'overhead squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "goodMorning_cleanJerk", a: "goodMorning", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.5229, 0.6139], femme: [0.5229, 0.6139] }, refValue: { homme: 0.5684, femme: 0.5684 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~57% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "jerk_cleanJerk", a: "jerk", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.9476, 1.1124], femme: [0.9476, 1.1124] }, refValue: { homme: 1.03, femme: 1.03 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~103% (ThePerfClub, cross-validé Table de Baroga « Jeté supports » : 100%).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "jerkBalance_cleanJerk", a: "jerkBalance", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.644, 0.756], femme: [0.644, 0.756] }, refValue: { homme: 0.7, femme: 0.7 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~70% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "jerkRecovery_cleanJerk", a: "jerkRecovery", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [1.0856, 1.2744], femme: [1.0856, 1.2744] }, refValue: { homme: 1.18, femme: 1.18 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~118% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "powerClean_cleanJerk", a: "powerClean", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.83, 0.89], femme: [0.83, 0.89] }, refValue: { homme: 0.88, femme: 0.88 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~88% (cross-validé Torokhtiy/Everett/Table de Baroga « Épaulé puissance » : 92,5%).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerJerk_cleanJerk", a: "powerJerk", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.88, 0.94], femme: [0.88, 0.94] }, refValue: { homme: 0.92, femme: 0.92 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~92% (cross-validé Torokhtiy/Everett/Table de Baroga « Jeté debout puissance » : 92,5%).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "pressBtn_cleanJerk", a: "pressBtn", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.4939, 0.5797], femme: [0.4939, 0.5797] }, refValue: { homme: 0.5368, femme: 0.5368 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~54% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "pressOh_cleanJerk", a: "pressOh", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.5229, 0.6139], femme: [0.5229, 0.6139] }, refValue: { homme: 0.5684, femme: 0.5684 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~57% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "pushPress_cleanJerk", a: "pushPress", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.736, 0.864], femme: [0.736, 0.864] }, refValue: { homme: 0.8, femme: 0.8 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~80% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "press_pushPress", a: "press", b: "pushPress", bLabel: "Push Press", norms: { homme: [0.70, 0.75], femme: [0.70, 0.75] }, refValue: { homme: 0.725, femme: 0.725 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Push Press, repère théorique ~72,5% (Greg Everett/Catalyst Athletics).",
      advice: "Isole la force stricte overhead, sans l'aide des jambes. Si le ratio est bas, ajoute du développé militaire strict 2x/semaine et du gainage overhead ; un ratio déjà élevé indique une bonne base de force qui peut davantage exploiter la triple extension (push press/jerk)." },
    { id: "pushPress_jerk", a: "pushPress", b: "jerk", bLabel: "Jerk", norms: { homme: [0.75, 0.85], femme: [0.75, 0.85] }, refValue: { homme: 0.8, femme: 0.8 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Jerk, repère théorique ~80% (Greg Everett/Catalyst Athletics).",
      advice: "Le jerk ajoute la réception en fente/split : si le ratio est bas, travaille le timing dip-drive et la réception (jerks depuis blocks, tempo, split jerk) plutôt que la force de poussée elle-même." },
    { id: "snatch_cleanJerk", a: "snatch", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.77, 0.84], femme: [0.77, 0.84] }, refValue: { homme: 0.8, femme: 0.8 }, fmt: pct0, core: true,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~80% (cross-validé Torokhtiy/Everett).",
      advice: "Ton arraché est en retrait par rapport à ton épaulé-jeté : ajoute du volume technique spécifique (tirages arraché, réceptions en squat complet, mobilité épaule/hanche) plutôt que du travail général de force." },
    { id: "sotsPress_cleanJerk", a: "sotsPress", b: "cleanJerk", bLabel: "Clean & Jerk", norms: { homme: [0.506, 0.594], femme: [0.506, 0.594] }, refValue: { homme: 0.55, femme: 0.55 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean & Jerk, repère théorique ~55% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "blockAboveKneeSnatch_snatch", a: "blockAboveKneeSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.874, 1.026], femme: [0.874, 1.026] }, refValue: { homme: 0.95, femme: 0.95 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~95% (ThePerfClub, cross-validé Table de Baroga : 95,7%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "cleanJerk_snatch", a: "cleanJerk", b: "snatch", bLabel: "Snatch", norms: { homme: [1.15, 1.35], femme: [1.15, 1.35] }, refValue: { homme: 1.25, femme: 1.25 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~125% (ThePerfClub).",
      advice: "Ton épaulé-jeté est en retrait par rapport à ton arraché : priorise le travail du complexe clean+jerk (technique de réception, jerk depuis blocks) plutôt que le squat ou les tirages seuls." },
    { id: "hangSnatch_snatch", a: "hangSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.874, 1.026], femme: [0.874, 1.026] }, refValue: { homme: 0.95, femme: 0.95 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~95% (ThePerfClub).",
      advice: "Teste ta force de départ et ton timing d'engagement de la barre depuis une position statique, sans l'élan du sol. Ajoute des tirages/cleans-snatch depuis le hang (pause 2s) pour renforcer précisément ce point." },
    { id: "highPull_snatch", a: "highPull", b: "snatch", bLabel: "Snatch", norms: { homme: [0.92, 1.08], femme: [0.92, 1.08] }, refValue: { homme: 1, femme: 1 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~100% (ThePerfClub, cross-validé Table de Baroga « Tirage haut d'arraché » : match exact).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "muscleSnatchContact_snatch", a: "muscleSnatchContact", b: "snatch", bLabel: "Snatch", norms: { homme: [0.69, 0.81], femme: [0.69, 0.81] }, refValue: { homme: 0.75, femme: 0.75 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~75% (ThePerfClub).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "muscleSnatchNoLeg_snatch", a: "muscleSnatchNoLeg", b: "snatch", bLabel: "Snatch", norms: { homme: [0.552, 0.648], femme: [0.552, 0.648] }, refValue: { homme: 0.6, femme: 0.6 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~60% (ThePerfClub, cross-validé Table de Baroga « Arraché force » : 63,8%).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "noFeetSnatch_snatch", a: "noFeetSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.8586, 1.008], femme: [0.8586, 1.008] }, refValue: { homme: 0.9333, femme: 0.9333 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~93% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "ohSquatPushPress_snatch", a: "ohSquatPushPress", b: "snatch", bLabel: "Snatch", norms: { homme: [0.9936, 1.1664], femme: [0.9936, 1.1664] }, refValue: { homme: 1.08, femme: 1.08 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~108% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "powerSnatch_snatch", a: "powerSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.80, 0.88], femme: [0.80, 0.88] }, refValue: { homme: 0.85, femme: 0.85 }, fmt: pct0, core: false,
      // Corrigé 2 fois (2026-09, suite) — l'ancien repère (~88%, "cross-validé Torokhtiy/Everett")
      // combinait à tort les 2 sources en un seul chiffre. Un 1er passage l'avait recalé sur la SEULE
      // table Everett/Catalyst Athletics (80-85%, ref 82,5%) en pensant "Torokhtiy" non vérifiable —
      // mais fetché depuis torokhtiy.com/blogs/guides/how-to-determine-your-pr (Torokhtiy, athlète
      // olympique/coach reconnu), qui donne bien 85-88% pour Power Snatch, une source réelle et
      // légèrement différente d'Everett. Les 2 sources sont crédibles et se chevauchent seulement à
      // 85% : borne élargie [80-88%] pour couvrir les deux, repère au point de recouvrement (85%)
      // plutôt que de trancher arbitrairement pour l'une des deux.
      desc: "Rapporté à ton Snatch, repère théorique ~85% (Everett/Catalyst Athletics : 80-85% ; Torokhtiy : 85-88% ; Table de Baroga : ~87%).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerSnatchBox_snatch", a: "powerSnatchBox", b: "snatch", bLabel: "Snatch", norms: { homme: [0.7482, 0.8784], femme: [0.7482, 0.8784] }, refValue: { homme: 0.8133, femme: 0.8133 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~81% (ThePerfClub, cross-validé Table de Baroga : 81,9%).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "powerSnatchNoFoot_snatch", a: "powerSnatchNoFoot", b: "snatch", bLabel: "Snatch", norms: { homme: [0.7482, 0.8784], femme: [0.7482, 0.8784] }, refValue: { homme: 0.8133, femme: 0.8133 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~81% (ThePerfClub).",
      advice: "Isole la puissance de tirage/extension sans la réception basse. Si le ratio est bas, travaille les tirages explosifs et les sauts avec barre légère ; s'il est déjà élevé, c'est plutôt ta réception (mobilité, technique) qui limite que la force de tirage." },
    { id: "snatchBalance_snatch", a: "snatchBalance", b: "snatch", bLabel: "Snatch", norms: { homme: [1.058, 1.242], femme: [1.058, 1.242] }, refValue: { homme: 1.15, femme: 1.15 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~115% (ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "snatchDeadlift_snatch", a: "snatchDeadlift", b: "snatch", bLabel: "Snatch", norms: { homme: [1.38, 1.62], femme: [1.38, 1.62] }, refValue: { homme: 1.5, femme: 1.5 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~150% (ThePerfClub).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "snatchPull_snatch", a: "snatchPull", b: "snatch", bLabel: "Snatch", norms: { homme: [1.15, 1.35], femme: [1.15, 1.35] }, refValue: { homme: 1.25, femme: 1.25 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~125% (ThePerfClub, cross-validé Table de Baroga « Tirage lourd d'arraché » : 121,3%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "snatchPullBlock_snatch", a: "snatchPullBlock", b: "snatch", bLabel: "Snatch", norms: { homme: [1.153, 1.3536], femme: [1.153, 1.3536] }, refValue: { homme: 1.2533, femme: 1.2533 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~125% (ThePerfClub, cross-validé Table de Baroga : 125,5%).",
      advice: "Isole la force de traction pure, sans le catch. Si le ratio est bas, ajoute 2-3 séries hebdomadaires de tirages lourds (100-120% du lift complet) et de soulevé de terre roumain pour renforcer la chaîne postérieure." },
    { id: "snatchSotsPress_snatch", a: "snatchSotsPress", b: "snatch", bLabel: "Snatch", norms: { homme: [0.417, 0.4896], femme: [0.417, 0.4896] }, refValue: { homme: 0.4533, femme: 0.4533 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~45% (ThePerfClub, cross-validé Table de Baroga « Développé d'arraché » : 45,7%).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead (planches overhead, farmer's walk overhead) ; pour les variantes de jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "tallMuscleSnatch_snatch", a: "tallMuscleSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.417, 0.4896], femme: [0.417, 0.4896] }, refValue: { homme: 0.4533, femme: 0.4533 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~45% (ThePerfClub).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
    { id: "tallSnatch_snatch", a: "tallSnatch", b: "snatch", bLabel: "Snatch", norms: { homme: [0.5244, 0.6156], femme: [0.5244, 0.6156] }, refValue: { homme: 0.57, femme: 0.57 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~57% (ThePerfClub, cross-validé Table de Baroga « Passages d'arraché » : 57,4%).",
      advice: "Sans dip de réception, ce test isole la vitesse de tirage et la force de retournement du poignet/coude. Si le ratio est bas, ajoute du travail de vitesse (tirages légers explosifs) et de mobilité de poignet plutôt que de la force pure." },
  /* Réciproques mouvements classiques (2026-09) — demande de Gildas : chaque carte ne s'affiche que
     sous l'exercice réellement testé (`card.a`, voir computeAllFamiliesInsights). Plusieurs paires
     entre mouvements "classiques" (Snatch/Clean/Jerk/Clean & Jerk, Back Squat/Front Squat, Deadlift/
     Clean Deadlift/Snatch Deadlift — périmètre précisé par Gildas, "les mouvements classiques...
     et les squats (front et back) et les deadlift (normal, clean, snatch)") n'existaient que dans UN
     sens (ex. Front Squat comparé au Clean, mais rien côté Clean comparé au Front Squat) — cas
     concret trouvé par Gildas sur son propre Clean. Les 13 cartes ci-dessous sont l'inverse
     mathématique pur (1/ref, bornes norms inversées et permutées) de 13 cartes déjà sourcées listées
     plus haut — pas une nouvelle source indépendante, juste l'autre sens de lecture de la même donnée
     déjà vérifiée. Vérifié par calcul direct (computeAllFamiliesInsights/groupInsightsByMetric) que
     les 2 sens apparaissent bien ensemble (primary + "Aussi comparé à") une fois les 2 exercices
     logués — pas juste en relisant le code. `core: false` partout (pas de nouveau mouvement pivot) :
     n'apparaissent que si l'exercice correspondant a déjà été logué. */
    { id: "backSquat_clean", a: "backSquat", b: "clean", bLabel: "Clean", norms: { homme: [1.1574, 1.3587], femme: [1.1574, 1.3587] }, refValue: { homme: 1.25, femme: 1.25 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~125% (dérivé de l'inverse du ratio Clean:Back Squat, ThePerfClub).",
      advice: "Un Back Squat bas par rapport à ton Clean traduit un déficit de force pure : ajoute un bloc squat dédié (3-5 reps, 80-90%), indépendant des séances technique, pour rattraper ton retard de force brute derrière tes lifts olympiques." },
    { id: "deadlift_clean", a: "deadlift", b: "clean", bLabel: "Clean", norms: { homme: [1.3333, 1.4286], femme: [1.3333, 1.4286] }, refValue: { homme: 1.3793, femme: 1.3793 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~138% (dérivé de l'inverse du ratio Clean:Soulevé de terre, Greg Everett/Catalyst Athletics).",
      advice: "Un Soulevé de terre nettement au-dessus de ce repère par rapport à ton Clean indique une bonne base de force qui pourrait mieux se transférer via du travail de vitesse de tirage (tirages explosifs, cleans à charge sous-maximale)." },
    { id: "backSquat_frontSquat", a: "backSquat", b: "frontSquat", bLabel: "Front Squat", norms: { homme: [1.0522, 1.2352], femme: [1.0522, 1.2352] }, refValue: { homme: 1.1364, femme: 1.1364 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Front Squat, repère théorique ~114% (dérivé de l'inverse du ratio Front Squat:Back Squat, ThePerfClub).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "backSquat_jerk", a: "backSquat", b: "jerk", bLabel: "Jerk", norms: { homme: [1.1023, 1.2940], femme: [1.1023, 1.2940] }, refValue: { homme: 1.1905, femme: 1.1905 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Jerk, repère théorique ~119% (dérivé de l'inverse du ratio Jerk:Back Squat, ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead ; pour le jerk, travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "backSquat_snatch", a: "backSquat", b: "snatch", bLabel: "Snatch", norms: { homme: [1.4245, 1.6722], femme: [1.4245, 1.6722] }, refValue: { homme: 1.5385, femme: 1.5385 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch, repère théorique ~154% (dérivé de l'inverse du ratio Snatch:Back Squat, ThePerfClub).",
      advice: "Un Back Squat élevé par rapport à ton Arraché indique une force brute qui ne se transfère pas encore pleinement : ajoute du volume technique spécifique (tirages arraché, réceptions en squat complet, mobilité épaule/hanche)." },
    { id: "clean_frontSquat", a: "clean", b: "frontSquat", bLabel: "Front Squat", norms: { homme: [0.8051, 0.9452], femme: [0.8051, 0.9452] }, refValue: { homme: 0.8696, femme: 0.8696 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Front Squat, repère théorique ~87% (dérivé de l'inverse du ratio Front Squat:Clean, ThePerfClub).",
      advice: "Écart généralement lié à la mobilité (poignet/coude/thorax pour le front squat) plutôt qu'à un manque de force. Priorise des séances de mobilité ciblée avant d'ajouter de la charge." },
    { id: "cleanJerk_clean", a: "cleanJerk", b: "clean", bLabel: "Clean", norms: { homme: [0.9524, 1.0], femme: [0.9524, 1.0] }, refValue: { homme: 0.9709, femme: 0.9709 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean, repère théorique ~97% (dérivé de l'inverse du ratio Clean:Clean & Jerk, cross-validé Torokhtiy/Everett).",
      advice: "Ton Clean & Jerk laisse peu de marge de sécurité avant le catch : si ce ratio est bas, ajoute du travail de clean isolé (avec pause en réception) pour construire une marge avant d'attaquer le jerk à pleine charge." },
    { id: "cleanJerk_jerk", a: "cleanJerk", b: "jerk", bLabel: "Jerk", norms: { homme: [0.8990, 1.0553], femme: [0.8990, 1.0553] }, refValue: { homme: 0.9709, femme: 0.9709 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Jerk, repère théorique ~97% (dérivé de l'inverse du ratio Jerk:Clean & Jerk, ThePerfClub).",
      advice: "Teste la force et la stabilité overhead. Si le ratio est bas, ajoute du développé militaire strict et du gainage overhead ; travaille aussi le timing dip-drive (jerks depuis blocks, tempo)." },
    { id: "backSquat_deadlift", a: "backSquat", b: "deadlift", bLabel: "Soulevé de terre", norms: { homme: [0.7407, 0.8696], femme: [0.7407, 0.8696] }, refValue: { homme: 0.80, femme: 0.80 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Soulevé de terre, repère théorique ~80% (dérivé de l'inverse du ratio Soulevé de terre:Back Squat, ThePerfClub).",
      advice: "Un Back Squat bas par rapport à ton Soulevé de terre traduit souvent un déficit de force quadriceps/positionnelle en squat : ajoute un bloc squat dédié (3-5 reps, 80-90%) indépendant du travail de tirage." },
    { id: "backSquat_cleanDeadlift", a: "backSquat", b: "cleanDeadlift", bLabel: "Clean Deadlift", norms: { homme: [0.9259, 1.0870], femme: [0.9259, 1.0870] }, refValue: { homme: 1.0, femme: 1.0 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean Deadlift, repère théorique ~100% (dérivé de l'inverse du ratio Clean Deadlift:Back Squat, ThePerfClub).",
      advice: "Un Back Squat bas par rapport à ton Clean Deadlift traduit un déficit de force pure en squat : ajoute un bloc squat dédié (3-5 reps, 80-90%) indépendant du travail de tirage." },
    { id: "backSquat_snatchDeadlift", a: "backSquat", b: "snatchDeadlift", bLabel: "Snatch Deadlift", norms: { homme: [1.0288, 1.2077], femme: [1.0288, 1.2077] }, refValue: { homme: 1.1111, femme: 1.1111 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch Deadlift, repère théorique ~111% (dérivé de l'inverse du ratio Snatch Deadlift:Back Squat, ThePerfClub).",
      advice: "Un Back Squat bas par rapport à ton Snatch Deadlift traduit un déficit de force pure en squat : ajoute un bloc squat dédié (3-5 reps, 80-90%) indépendant du travail de tirage." },
    { id: "clean_cleanDeadlift", a: "clean", b: "cleanDeadlift", bLabel: "Clean Deadlift", norms: { homme: [0.7407, 0.8696], femme: [0.7407, 0.8696] }, refValue: { homme: 0.80, femme: 0.80 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Clean Deadlift, repère théorique ~80% (dérivé de l'inverse du ratio Clean Deadlift:Clean, ThePerfClub, cross-validé Table de Baroga).",
      advice: "Ton Clean laisse peu de marge de sécurité avant le catch : si ce ratio est bas, ajoute du travail de tirage lourd (100-120% du Clean) pour renforcer la chaîne postérieure sans le catch." },
    { id: "snatch_snatchDeadlift", a: "snatch", b: "snatchDeadlift", bLabel: "Snatch Deadlift", norms: { homme: [0.6173, 0.7246], femme: [0.6173, 0.7246] }, refValue: { homme: 0.6667, femme: 0.6667 }, fmt: pct0, core: false,
      desc: "Rapporté à ton Snatch Deadlift, repère théorique ~67% (dérivé de l'inverse du ratio Snatch Deadlift:Snatch, ThePerfClub).",
      advice: "Ton Arraché laisse peu de marge de sécurité avant le catch : si ce ratio est bas, ajoute du travail de tirage lourd (100-150% de l'Arraché) pour renforcer la chaîne postérieure sans le catch." },
  /* Powerlifting (2026-09) — exhaustif sur les 3 lifts de compétition + le développé militaire,
     sourcé de littérature/data réelles (pas de calculateur ThePerfClub équivalent à HT_DATA pour ce
     sport à ce jour) :
     - Squat/Bench et Deadlift/Squat : PowerliftingTechnique.com (repères "ratio idéal" ~156% squat/
       bench hommes, ~167% femmes ; deadlift/squat moyen ~123% hommes, ~125% femmes) + une étude
       ScienceDirect à 809 986 entrées de compétition confirmant l'ordre de grandeur. Bandes élargies
       autour de ces centraux (pas des fourchettes officielles resserrées comme l'haltéro).
     - Deadlift/Bench et développé militaire (OHP) vs Squat/Bench/Deadlift : heuristique de coaching
       largement répandue ("Deadlift 100% > Squat 80-90% > Bench 60-70% > OHP 40-50%", ex. T-Nation/
       Trainnode) — moins formellement sourcée qu'une étude, indiqué explicitement dans `desc`. Cette
       attribution "T-Nation/Trainnode" a été cross-vérifiée (2026-09, recherche web) : la page
       Trainnode "Strength Standards & Lift Ratios" existe bien et cite un ordre de grandeur cohérent
       (Deadlift 100% > Squat 80-90% > Bench 60-70% > OHP 40-50%) — attribution confirmée réelle, pas
       retrouvée mot pour mot mais du même ordre de grandeur ; le repère précis d'OHP:Clean & Jerk/
       Jerk suggéré par Gildas (55%) n'a pas pu être confirmé par une source unique et fiable (voir
       rapport de recherche) — non modifié faute de source solide, `pressSquat`/`pressBench`/
       `pressDeadlift` restent une heuristique de coaching explicitement indiquée comme telle. */
  { id: "benchSquat", a: "bench", b: "backSquat", bLabel: "Squat", norms: { homme: [0.55, 0.75], femme: [0.50, 0.70] }, refValue: { homme: 0.65, femme: 0.6 }, fmt: pct0,
      desc: "Rapporté à ton Squat, repère ~64% (hommes) / ~60% (femmes) — PowerliftingTechnique.com.",
      advice: "Un ratio bas justifie un bloc dédié développé couché (fréquence 2-3x/semaine, accessoires triceps/épaules) sans réduire le volume squat." },
    { id: "dlSquat", a: "deadlift", b: "backSquat", bLabel: "Squat", norms: { homme: [1.10, 1.40], femme: [1.15, 1.50] }, refValue: { homme: 1.25, femme: 1.325 }, fmt: xTimes, core: true,
      desc: "Rapporté à ton Squat, repère ~123% (hommes) / ~125% (femmes) — PowerliftingTechnique.com, cohérent avec les données de compétition (étude ScienceDirect, 809 986 entrées).",
      advice: "Un ratio bas signale un déficit relatif de chaîne postérieure : ajoute du soulevé de terre roumain, du hip thrust et des rack pulls. Un ratio très haut signale à l'inverse un squat en retrait : ajoute du volume squat (pause squat, tempo)." },
    { id: "dlBench", a: "deadlift", b: "bench", bLabel: "Développé couché", norms: { homme: [1.35, 1.85], femme: [1.45, 2.00] }, refValue: { homme: 1.6, femme: 1.725 }, fmt: xTimes,
      desc: "Rapporté à ton Développé couché — repère indicatif (heuristique de coaching : Deadlift 100% > Bench 60-70%).",
      advice: "Un ratio bas signale un déficit de chaîne postérieure/tirage relatif à ton haut du corps : ajoute du travail de dos (rowing lourd, tirages) et de soulevé de terre." },
    { id: "pressSquat", a: "press", b: "backSquat", bLabel: "Squat", norms: { homme: [0.40, 0.65], femme: [0.35, 0.60] }, refValue: { homme: 0.525, femme: 0.475 }, fmt: pct0,
      desc: "Rapporté à ton Squat — repère indicatif (heuristique de coaching : OHP 40-50% du Deadlift, Deadlift ~110-125% du Squat).",
      advice: "Un ratio bas signale un manque de force overhead spécifique : ajoute du développé militaire strict 2x/semaine sans réduire le squat." },
    { id: "pressBench", a: "press", b: "bench", bLabel: "Développé couché", norms: { homme: [0.55, 0.80], femme: [0.50, 0.75] }, refValue: { homme: 0.675, femme: 0.625 }, fmt: pct0,
      desc: "Rapporté à ton Développé couché — repère indicatif (heuristique de coaching : OHP généralement 60-70% du Bench).",
      advice: "Un ratio bas signale un déficit spécifique aux épaules/triceps en position stricte : ajoute du développé militaire et du travail d'épaules (élévations latérales, dips)." },
    { id: "pressDeadlift", a: "press", b: "deadlift", bLabel: "Soulevé de terre", norms: { homme: [0.35, 0.55], femme: [0.30, 0.50] }, refValue: { homme: 0.45, femme: 0.4 }, fmt: pct0,
      desc: "Rapporté à ton Soulevé de terre — repère indicatif (heuristique de coaching : OHP 40-50% du Deadlift).",
      advice: "Un ratio bas signale un manque de force overhead : ajoute du développé militaire strict en complément, sans que ce soit une priorité absolue (l'OHP reste naturellement le plus faible des 4 lifts)." },
  // Ex-carte "Fitness / CrossFit" `cjSquatCf` (Clean & Jerk:Back Squat ~65%, non sourcée) supprimée
  // le 2026-09 — remplacée par `cleanJerk_backSquat` ci-dessus (~80%, sourcée HT_DATA/ThePerfClub),
  // désormais partagée par les 3 familles force via ce même tableau. Voir note en tête de section.
];

export const RATIO_CARDS: Record<string, RatioCardDef[]> = {
  "Haltérophilie": FORCE_RATIO_CARDS,
  "Powerlifting": FORCE_RATIO_CARDS,
  "Fitness / CrossFit": FORCE_RATIO_CARDS,

  /* Endurance (2026-09) — PAS une prédiction ("ton temps X prédit ton temps Y") : un vrai ratio
     entre 2 temps RÉELLEMENT loggués, exactement comme les ratios haltéro, juste avec une
     orientation inversée. Les temps sont des métriques "plus bas = mieux" (contrairement au poids
     soulevé, "plus haut = mieux") : ici, un ratio PLUS BAS que le repère = ce test comparativement
     PLUS RAPIDE que prévu = point fort (vert) ; un ratio PLUS HAUT = comparativement plus lent =
     axe de travail (rouge) — d'où des `norms` avec min > max (clampScore()/statusOf() gèrent déjà
     cette inversion nativement, aucun changement moteur nécessaire).
     Repères centraux sourcés des tables d'équivalence de performance VDOT (Jack Daniels, "Daniels'
     Running Formula" — méthode largement utilisée en coaching course à pied, valeurs dérivées
     d'exemples VDOT publiés : 5K 25:00 → 10K 51:53 → Semi 1:55:04 → Marathon 3:57:55, cohérent avec
     les tables VDOT 40/50/60). Tolérance volontairement large (±20%/±15%, pas ±8% comme l'haltéro)
     car la performance course à pied varie naturellement de plusieurs % selon météo/parcours/allure
     — un écart plus resserré déclencherait trop de faux positifs. 6 paires (toutes les combinaisons
     entre 5K/10K/Semi/Marathon) pour matcher n'importe quel duo de distances déjà loggué. Chaque
     distance porte donc plusieurs `CardInsight` (une par distance de référence disponible) — même
     principe multi-comparaison déjà en place pour l'haltéro. */
  "Endurance": [
    { id: "time10k_time5k", a: "time10k", b: "time5k", bLabel: "5 km", norms: { homme: [2.496, 1.768], femme: [2.496, 1.768] }, refValue: { homme: 2.08, femme: 2.08 }, fmt: xTimes,
      desc: "Ton 10km prend normalement ~2.08x ton temps au 5km pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie (tu ralentis plus que prévu sur la distance) : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "time5k_time10k", a: "time5k", b: "time10k", bLabel: "10 km", norms: { homme: [0.5769, 0.4087], femme: [0.5769, 0.4087] }, refValue: { homme: 0.4808, femme: 0.4808 }, fmt: xTimes,
      desc: "Ton 5km rapporté à ton 10km — repère d'équivalence ~0.48x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max (ton 5km est plus lent que ce que ton 10km laisse supposer) : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    { id: "timeSemi_time10k", a: "timeSemi", b: "time10k", bLabel: "10 km", norms: { homme: [2.664, 1.887], femme: [2.664, 1.887] }, refValue: { homme: 2.22, femme: 2.22 }, fmt: xTimes,
      desc: "Ton Semi prend normalement ~2.22x ton temps au 10km pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie sur la distance : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "time10k_timeSemi", a: "time10k", b: "timeSemi", bLabel: "Semi-marathon", norms: { homme: [0.5406, 0.3829], femme: [0.5406, 0.3829] }, refValue: { homme: 0.4505, femme: 0.4505 }, fmt: xTimes,
      desc: "Ton 10km rapporté à ton Semi — repère d'équivalence ~0.45x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    { id: "timeMarathon_time10k", a: "timeMarathon", b: "time10k", bLabel: "10 km", norms: { homme: [5.508, 3.9015], femme: [5.508, 3.9015] }, refValue: { homme: 4.59, femme: 4.59 }, fmt: xTimes,
      desc: "Ton Marathon prend normalement ~4.59x ton temps au 10km pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie sur la distance : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "time10k_timeMarathon", a: "time10k", b: "timeMarathon", bLabel: "Marathon", norms: { homme: [0.2615, 0.1852], femme: [0.2615, 0.1852] }, refValue: { homme: 0.2179, femme: 0.2179 }, fmt: xTimes,
      desc: "Ton 10km rapporté à ton Marathon — repère d'équivalence ~0.22x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    { id: "timeMarathon_time5k", a: "timeMarathon", b: "time5k", bLabel: "5 km", norms: { homme: [11.46, 8.1175], femme: [11.46, 8.1175] }, refValue: { homme: 9.55, femme: 9.55 }, fmt: xTimes,
      desc: "Ton Marathon prend normalement ~9.55x ton temps au 5km pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie sur la distance : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "time5k_timeMarathon", a: "time5k", b: "timeMarathon", bLabel: "Marathon", norms: { homme: [0.1257, 0.089], femme: [0.1257, 0.089] }, refValue: { homme: 0.1047, femme: 0.1047 }, fmt: xTimes,
      desc: "Ton 5km rapporté à ton Marathon — repère d'équivalence ~0.10x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    { id: "timeSemi_time5k", a: "timeSemi", b: "time5k", bLabel: "5 km", norms: { homme: [5.52, 3.91], femme: [5.52, 3.91] }, refValue: { homme: 4.6, femme: 4.6 }, fmt: xTimes,
      desc: "Ton Semi prend normalement ~4.60x ton temps au 5km pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie sur la distance : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "time5k_timeSemi", a: "time5k", b: "timeSemi", bLabel: "Semi-marathon", norms: { homme: [0.2609, 0.1848], femme: [0.2609, 0.1848] }, refValue: { homme: 0.2174, femme: 0.2174 }, fmt: xTimes,
      desc: "Ton 5km rapporté à ton Semi — repère d'équivalence ~0.22x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    { id: "timeMarathon_timeSemi", a: "timeMarathon", b: "timeSemi", bLabel: "Semi-marathon", norms: { homme: [2.484, 1.7595], femme: [2.484, 1.7595] }, refValue: { homme: 2.07, femme: 2.07 }, fmt: xTimes,
      desc: "Ton Marathon prend normalement ~2.07x ton temps au Semi pour un profil équilibré (équivalence VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif d'endurance aérobie sur la distance : ajoute des sorties longues progressives et du travail au seuil." },
    { id: "timeSemi_timeMarathon", a: "timeSemi", b: "timeMarathon", bLabel: "Marathon", norms: { homme: [0.5797, 0.4106], femme: [0.5797, 0.4106] }, refValue: { homme: 0.4831, femme: 0.4831 }, fmt: xTimes,
      desc: "Ton Semi rapporté à ton Marathon — repère d'équivalence ~0.48x (VDOT/Jack Daniels).",
      advice: "Une faiblesse ici signale un déficit relatif de vitesse/VO2max : ajoute du fractionné court (400-1000m à VMA) et du travail de seuil haut." },
    /* VO2max/VMA — PAS une prédiction non plus : les 2 sont des tests réellement mesurés (terrain
       pour la VMA, terrain ou labo pour le VO2max), comparés via la formule d'approximation
       largement utilisée en coaching français : VO2max (ml/kg/min) ≈ VMA (km/h) × 3.5. Contrairement
       aux paires de distances ci-dessus, VO2max et VMA sont tous les deux "plus haut = mieux" par
       nature (pas des temps) : orientation standard dans les 2 sens, pas d'inversion. Tolérance large
       (±15%) car protocoles de test différents (terrain vs labo, VMA continue vs paliers). */
    { id: "vo2max_vma", a: "vo2max", b: "vma", bLabel: "VMA", norms: { homme: [2.975, 4.025], femme: [2.975, 4.025] }, refValue: { homme: 3.5, femme: 3.5 }, fmt: xTimes,
      desc: "Ton VO2max rapporté à ta VMA — repère d'approximation ~3.5x (formule de coaching largement utilisée, VO2max ≈ VMA × 3.5).",
      advice: "Un écart signale surtout une différence de protocole de test (terrain vs labo) plus qu'une vraie faiblesse : revérifie les conditions de test avant d'en tirer une conclusion d'entraînement." },
    { id: "vma_vo2max", a: "vma", b: "vo2max", bLabel: "VO2max", norms: { homme: [0.2429, 0.3286], femme: [0.2429, 0.3286] }, refValue: { homme: 0.2857, femme: 0.2857 }, fmt: xTimes,
      desc: "Ta VMA rapportée à ton VO2max — repère d'approximation ~0.29x (formule de coaching largement utilisée, VO2max ≈ VMA × 3.5).",
      advice: "Un écart signale surtout une différence de protocole de test (terrain vs labo) plus qu'une vraie faiblesse : revérifie les conditions de test avant d'en tirer une conclusion d'entraînement." },
  ],

  /* Athlétisme & vitesse (2026-09) :
     - Sprint 30m/10m : même principe "temps, orientation inversée" que l'Endurance ci-dessus.
       Repère central sourcé d'une étude PMC sur des joueurs de football élite (10m 1.7-1.85s /
       30m 4.0-4.3s → ratio ~2.32-2.35) — UNE population précise (sport co, pas sprinteurs purs),
       tolérance élargie (±20%/±15%) pour compenser cette base plus étroite qu'une méta-analyse.
     - CMJ/Squat Jump (EUR — Eccentric Utilization Ratio) : orientation standard (plus haut = mieux
       dans les 2 sens, hauteurs de saut), repère ~1.05 sourcé de VALD Performance (médianes NFL 1.07
       / NCAA 1.13, seuil ">1.1 = forte utilisation élastique" cité explicitement par la source).
     - RSI (Reactive Strength Index) : carte simple (pas une paire) — hauteur(m)/temps de contact(s)
       d'un drop jump, seuils >2.5 excellent / <1.5 à travailler, ~2.0 "bon repère" (littérature
       S&C/NSCA, citée par plusieurs sources croisées : Science for Sport, GymAware, Output Sports —
       elles-mêmes notent que les données normatives sur ce test restent limitées). */
  "Athlétisme & vitesse": [
    { id: "sprint30m_sprint10m", a: "sprint30m", b: "sprint10m", bLabel: "Sprint 10m", norms: { homme: [2.808, 1.989], femme: [2.808, 1.989] }, refValue: { homme: 2.34, femme: 2.34 }, fmt: xTimes,
      desc: "Ton 30m prend normalement ~2.34x ton temps au 10m pour un profil équilibré (repère : étude PMC, joueurs de foot élite).",
      advice: "Une faiblesse ici signale un manque de vitesse de pointe (développement 10-30m) : ajoute du travail de sprints lancés (flying sprints 20-30m) et de vitesse maximale." },
    { id: "sprint10m_sprint30m", a: "sprint10m", b: "sprint30m", bLabel: "Sprint 30m", norms: { homme: [0.5129, 0.3633], femme: [0.5129, 0.3633] }, refValue: { homme: 0.4274, femme: 0.4274 }, fmt: xTimes,
      desc: "Ton 10m rapporté à ton 30m — repère ~0.43x (étude PMC, joueurs de foot élite).",
      advice: "Une faiblesse ici signale un déficit d'accélération : ajoute du travail de départs (sprints résistés, starts) et de force de poussée initiale (squat, power clean)." },
    { id: "cmjHeight_squatJumpHeight", a: "cmjHeight", b: "squatJumpHeight", bLabel: "Squat Jump", norms: { homme: [0.945, 1.155], femme: [0.945, 1.155] }, refValue: { homme: 1.05, femme: 1.05 }, fmt: xTimes,
      desc: "Eccentric Utilization Ratio (CMJ/Squat Jump) — repère ~1.05-1.10, sourcé de VALD Performance.",
      advice: "Un EUR bas (CMJ proche de ton Squat Jump) signale une utilisation limitée du cycle étirement-détente : ajoute de la pliométrie (rebonds, drop jumps légers) pour mieux exploiter l'élasticité." },
    { id: "squatJumpHeight_cmjHeight", a: "squatJumpHeight", b: "cmjHeight", bLabel: "Saut vertical (CMJ)", norms: { homme: [0.857, 1.048], femme: [0.857, 1.048] }, refValue: { homme: 0.9524, femme: 0.9524 }, fmt: xTimes,
      desc: "Ton Squat Jump rapporté à ton CMJ — repère ~0.95, sourcé de VALD Performance.",
      advice: "Un Squat Jump comparativement faible signale un manque de force concentrique pure (départ à l'arrêt, sans contre-mouvement) : ajoute du travail de force lourde (squat, presses à cuisses)." },
    { id: "dropJumpHeight_dropJumpContact", a: "dropJumpHeight", b: "dropJumpContact", bLabel: "Temps de contact (drop jump)", norms: { homme: RSI_NORMS, femme: RSI_NORMS }, refValue: { homme: 2, femme: 2 }, fmt: idxFmt,
      desc: "Reactive Strength Index (RSI) : hauteur de saut rapportée au temps de contact au sol lors d'un drop jump — ta capacité à produire de la force rapidement.",
      advice: "Un RSI bas signale un temps de contact trop long : travaille les rebonds/pogo jumps et les drop jumps depuis une faible hauteur en visant un contact au sol le plus court possible." },
  ],
};

/* Cartes "poids de corps" force (2026-09, suite) — même fusion que FORCE_RATIO_CARDS ci-dessus,
   pour la même raison : 3 valeurs différentes, TOUTES non sourcées (aucune des 3 anciennes cartes
   `squatBW`/`squatBW2`/`squatBWcf` ne citait de source externe), coexistaient pour le MÊME ratio
   (Back Squat:poids de corps) selon la famille de sport consultée — un doublon du même type que
   celui explicitement signalé par Gildas pour `cjSquatCf`, trouvé en relisant l'intégralité du
   fichier pour ce chantier. Faute d'une source externe permettant de trancher entre les 3 (aucune
   n'est mieux sourcée qu'une autre), fusionnées en une seule carte `squatBW`, avec des bandes de
   normes élargies (union des 3 anciennes bandes) et marquée explicitement comme un repère combiné
   non sourcé formellement — voir garde-fou "heuristique" déjà en place ailleurs dans ce fichier
   (ex. Powerlifting `dlBench`/`pressSquat`/`pressBench`/`pressDeadlift`). `snatchBW`/`cjBW`
   (spécifiques à l'haltérophilie, sans conflit avec une autre famille) restent inchangées. */
const FORCE_BW_CARDS: BodyweightCardDef[] = [
    { id: "squatBW", metric: "backSquat", norms: { homme: [1.0, 2.5], femme: [0.85, 2.1] }, refValue: { homme: 1.75, femme: 1.47 }, fmt: xTimes,
      desc: "Force maximale relative à ton poids de corps — repère combiné (heuristique de coaching, aucune des 3 anciennes valeurs par sport n'était mieux sourcée qu'une autre).",
      advice: "Bloc squat basé sur des séries lourdes (2-4 reps, 85-92% 1RM) avant de continuer à charger les mouvements olympiques ou les autres lifts." },
    { id: "snatchBW", metric: "snatch", norms: { homme: [0.7, 1.6], femme: [0.55, 1.3] }, refValue: { homme: 1.15, femme: 0.925 }, fmt: xTimes,
      desc: "Transfert de ta force maximale vers l'arraché, ton mouvement le plus explosif, rapporté à ton poids de corps.",
      advice: "Développe la vitesse sous la barre (tirages explosifs, arraché à charge sous-maximale) pour mieux exprimer la force déjà là." },
    { id: "cjBW", metric: "cleanJerk", norms: { homme: [0.9, 1.9], femme: [0.7, 1.55] }, refValue: { homme: 1.4, femme: 1.125 }, fmt: xTimes,
      desc: "Puissance exprimée dans le second geste de compétition, rapportée au poids de corps.",
      advice: "Travaille la vitesse de tirage et le timing de la 2e traction pour améliorer ce ratio sans forcément charger plus lourd." },
    { id: "benchBW", metric: "bench", norms: { homme: [0.8, 1.6], femme: [0.5, 1.1] }, refValue: { homme: 1.2, femme: 0.8 }, fmt: xTimes,
      desc: "Force du développé couché relative à ton poids de corps.",
      advice: "Augmente la fréquence de développé couché (accessoires triceps/épaules) plutôt que la charge seule." },
    { id: "dlBW", metric: "deadlift", norms: { homme: [1.5, 2.8], femme: [1.2, 2.3] }, refValue: { homme: 2.15, femme: 1.75 }, fmt: xTimes,
      desc: "Force du soulevé de terre relative à ton poids de corps.",
      advice: "Travaille le verrouillage (deficit deadlift, pauses) et le gainage anti-extension pour progresser sans blesser le bas du dos." },
];

export const BW_CARDS: Record<string, BodyweightCardDef[]> = {
  "Haltérophilie": FORCE_BW_CARDS,
  "Powerlifting": FORCE_BW_CARDS,
  "Fitness / CrossFit": FORCE_BW_CARDS,
};

/* Classification VO2max (2026-09) — American College of Sports Medicine / Cooper Institute
   (Aerobics Center Longitudinal Study, >80 000 tests directs). Bande "Fair→Superior" pour un adulte
   actif de moins de 40 ans : [33,52] ml/kg/min hommes, [29,45] femmes. Limite assumée et documentée
   dans `desc` : ces seuils dépendent normalement de l'âge (non collecté par l'app, décision prise dès
   le début de ce chantier) — un adulte plus âgé lira un statut plus sévère que sa vraie tranche
   d'âge le justifierait. Reste un repère informatif honnête plutôt qu'aucun repère du tout. */
export const ABSOLUTE_CARDS: Record<string, AbsoluteCardDef[]> = {
  "Endurance": [
    { id: "vo2maxAbs", metric: "vo2max", norms: { homme: [33, 52], femme: [29, 45] }, fmt: (v) => `${v.toFixed(1)} ml/kg/min`, core: true,
      desc: "Classification ACSM/Cooper Institute pour un adulte actif de moins de 40 ans — ne tient pas compte de ton âge exact (non renseigné dans l'app), à interpréter avec prudence si tu es plus âgé(e).",
      advice: "Un VO2max bas signale un déficit de capacité aérobie maximale : ajoute des séances de fractionné long (3-6min à VMA/95% VMA) et augmente le volume d'endurance fondamentale." },
  ],
};

export type CardStatus = "green" | "amber" | "red";
export function statusOf(score: number): CardStatus {
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}
export function statusLabel(status: CardStatus): string {
  return status === "green" ? "Point fort" : status === "amber" ? "Dans la norme" : "Axe de travail";
}
function clampScore(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

export interface CardInsight {
  id: string;
  kind: "ratio" | "bodyweight" | "absolute";
  /** Exercice réellement testé (jamais la référence) — sert de titre de carte ET de cible pour
      l'ajout inline (on ne loggue jamais la référence depuis cette carte-là). Un même exercice peut
      porter plusieurs CardInsight (une par référence différente : un autre lift, ou le poids de
      corps) — voir groupInsightsByMetric() : elles sont fusionnées dans UNE seule carte plutôt que
      dupliquées, avec un statut propre à chaque comparaison (jamais un badge unique qui masquerait
      qu'un exercice peut être un point fort sur un axe et une faiblesse sur un autre). */
  primaryMetric: MetricKey;
  label: string;
  /** Ce à quoi cette comparaison précise rapporte l'exercice ("Épaulé-jeté", "poids de corps"...) —
      affiché pour distinguer 2 comparaisons du même exercice, jamais dans le titre de la carte
      elle-même. */
  compareLabel: string;
  desc: string;
  advice: string;
  fmt: (v: number) => string;
  norms: [number, number];
  /** Point de référence théorique, déjà résolu pour le sexe courant — absent pour une classification
      graduée sans cible unique (ex. VO2max). Piloté par un repère vertical sur la jauge, pas du
      texte (voir ComparisonBlock, TestsPanel.tsx). */
  refValue?: number;
  /** Le même repère, mais en valeur absolue dans l'unité de l'exercice testé (2026-09, ex. "128 kg"
      plutôt que "80%") — calculé à partir de la vraie donnée de référence déjà loggée par CET
      utilisateur (voir formatAbsoluteRef). Absent si refValue est absent, ou si la référence manque
      encore (carte verrouillée, aucune valeur absolue calculable). */
  refValueDisplay?: string;
  value: number | null;
  score: number | null;
  status: CardStatus | null;
  locked: { kind: "primary" | "reference" | "weight"; refLabel?: string } | null;
}

/** Regroupe les CardInsight par exercice réellement testé — une seule carte par exercice, même s'il
    est comparé à plusieurs références différentes. Préserve l'ordre d'apparition. */
export function groupInsightsByMetric(insights: CardInsight[]): { metric: MetricKey; label: string; comparisons: CardInsight[] }[] {
  const order: MetricKey[] = [];
  const byMetric = new Map<MetricKey, CardInsight[]>();
  for (const ins of insights) {
    if (!byMetric.has(ins.primaryMetric)) { byMetric.set(ins.primaryMetric, []); order.push(ins.primaryMetric); }
    byMetric.get(ins.primaryMetric)!.push(ins);
  }
  return order.map(metric => ({ metric, label: METRIC_DISPLAY[metric].name, comparisons: byMetric.get(metric)! }));
}

/* Construit TOUTES les cartes applicables à cette famille de sport (pas seulement celle du test
   actuellement sélectionné) — verrouillées (locked) tant que les données nécessaires manquent,
   jamais masquées : une carte "verrouillée" invite explicitement à ajouter le résultat/le poids qui
   manque, exactement comme le POC. Jamais d'erreur, jamais un repère inventé. */
function buildInsightsForFamily(
  sportFamily: string,
  sexeKey: "homme" | "femme",
  poidsKg: number | null,
  latestByMetric: Partial<Record<MetricKey, number>>
): CardInsight[] {
  const out: CardInsight[] = [];

  for (const card of RATIO_CARDS[sportFamily] ?? []) {
    const aVal = latestByMetric[card.a];
    const bVal = latestByMetric[card.b];
    if (aVal == null && card.core === false) continue; // exhaustif dans les données, discret dans l'UI — voir note en tête de fichier
    let value: number | null = null, score: number | null = null, status: CardStatus | null = null;
    let locked: CardInsight["locked"] = null;
    if (aVal == null) locked = { kind: "primary" };
    else if (bVal == null) locked = { kind: "reference", refLabel: card.bLabel };
    else {
      value = aVal / bVal;
      const n = card.norms[sexeKey];
      score = clampScore(value, n[0], n[1]);
      status = statusOf(score);
    }
    const ratioRef = card.refValue?.[sexeKey];
    out.push({ id: card.id, kind: "ratio", primaryMetric: card.a, label: METRIC_DISPLAY[card.a].name, compareLabel: card.bLabel, desc: card.desc, advice: card.advice, fmt: card.fmt, norms: card.norms[sexeKey], refValue: ratioRef, refValueDisplay: ratioRef != null && bVal != null ? formatAbsoluteRef(ratioRef, bVal, METRIC_DISPLAY[card.a].unit) : undefined, value, score, status, locked });
  }

  for (const card of BW_CARDS[sportFamily] ?? []) {
    const aVal = latestByMetric[card.metric];
    if (aVal == null && card.core === false) continue;
    let value: number | null = null, score: number | null = null, status: CardStatus | null = null;
    let locked: CardInsight["locked"] = null;
    if (aVal == null) locked = { kind: "primary" };
    else if (!poidsKg) locked = { kind: "weight" };
    else {
      value = aVal / poidsKg;
      const n = card.norms[sexeKey];
      score = clampScore(value, n[0], n[1]);
      status = statusOf(score);
    }
    const bwRef = card.refValue?.[sexeKey];
    out.push({ id: card.id, kind: "bodyweight", primaryMetric: card.metric, label: METRIC_DISPLAY[card.metric].name, compareLabel: "poids de corps", desc: card.desc, advice: card.advice, fmt: card.fmt, norms: card.norms[sexeKey], refValue: bwRef, refValueDisplay: bwRef != null && poidsKg != null ? formatAbsoluteRef(bwRef, poidsKg, METRIC_DISPLAY[card.metric].unit) : undefined, value, score, status, locked });
  }

  for (const card of ABSOLUTE_CARDS[sportFamily] ?? []) {
    const aVal = latestByMetric[card.metric];
    if (aVal == null && card.core === false) continue;
    let value: number | null = null, score: number | null = null, status: CardStatus | null = null;
    let locked: CardInsight["locked"] = null;
    if (aVal == null) locked = { kind: "primary" };
    else {
      value = aVal;
      const n = card.norms[sexeKey];
      score = clampScore(value, n[0], n[1]);
      status = statusOf(score);
    }
    out.push({ id: card.id, kind: "absolute", primaryMetric: card.metric, label: METRIC_DISPLAY[card.metric].name, compareLabel: "normes ACSM", desc: card.desc, advice: card.advice, fmt: card.fmt, norms: card.norms[sexeKey], refValue: card.refValue?.[sexeKey], value, score, status, locked });
  }

  return out;
}

/* Toutes les familles connues (RATIO_CARDS ∪ BW_CARDS ∪ ABSOLUTE_CARDS) — sert à l'enrichissement
   cross-famille ci-dessous. */
const ALL_FAMILIES: string[] = Array.from(new Set([
  ...Object.keys(RATIO_CARDS), ...Object.keys(BW_CARDS), ...Object.keys(ABSOLUTE_CARDS),
]));

export function computeAllInsights(
  sportFamily: string | null,
  sexe: Sexe,
  poidsKg: number | null,
  latestByMetric: Partial<Record<MetricKey, number>>
): CardInsight[] {
  if (!sportFamily) return [];
  const sexeKey: "homme" | "femme" = sexe ?? "homme";
  return buildInsightsForFamily(sportFamily, sexeKey, poidsKg, latestByMetric);
}

/* Enrichissement cross-famille (2026-09) : un test DÉJÀ LOGUÉ garde son interprétation quel que soit
   le chip actuellement actif — ex. un Drop Jump loggué (repère RSI, "Athlétisme & vitesse") doit
   afficher la carte enrichie même en consultant "Haltérophilie". Volontairement séparé de
   computeAllInsights (jamais mélangé au verdict/aux recommandations, qui doivent rester spécifiques
   au sport actif — l'appelant concatène les deux UNIQUEMENT pour l'affichage des cartes/le calcul de
   `coveredMetrics`, voir TestsPanel.tsx) : ce que TU as testé change toujours d'interprétation selon
   la famille consultée, mais "es-tu fort/faible EN HALTÉRO" ne doit jamais inclure un test de sprint.
   Limité aux métriques déjà présentes dans `latestByMetric` — jamais les 63 cartes verrouillées de
   l'haltéro (ou toute autre famille) qui viendraient polluer un sport sans rapport tant que rien n'a
   été loggué pour elles ; seul un résultat réel débloque cet enrichissement. Première famille (dans
   l'ordre de déclaration) qui interprète une métrique donnée l'emporte, jamais de doublon. */
export function computeCrossFamilyInsights(
  sportFamily: string | null,
  sexe: Sexe,
  poidsKg: number | null,
  latestByMetric: Partial<Record<MetricKey, number>>
): CardInsight[] {
  const sexeKey: "homme" | "femme" = sexe ?? "homme";
  const covered = new Set(
    sportFamily ? buildInsightsForFamily(sportFamily, sexeKey, poidsKg, latestByMetric).map(i => i.primaryMetric) : []
  );
  const extra: CardInsight[] = [];
  for (const family of ALL_FAMILIES) {
    if (family === sportFamily) continue;
    for (const ins of buildInsightsForFamily(family, sexeKey, poidsKg, latestByMetric)) {
      if (covered.has(ins.primaryMetric)) continue;
      if (latestByMetric[ins.primaryMetric] == null) continue;
      extra.push(ins);
      covered.add(ins.primaryMetric);
    }
  }
  return extra;
}

/* Vue "toutes familles confondues" (2026-09) — nécessaire pour le filtre par qualité physique
   (TestsPanel.tsx, testQualities.ts). Ni computeAllInsights (une seule famille) ni
   computeCrossFamilyInsights (uniquement ce qui est DÉJÀ loggué) ne suffisent pour parcourir une
   qualité transversalement : un utilisateur au profil "Football" qui filtre "Endurance" doit pouvoir
   voir les cartes 5km/10km VERROUILLÉES (jamais loggées) pour découvrir quoi tester — pas seulement
   celles qu'il a déjà remplies. Bug réel trouvé par Gildas : avant cette fonction, le filtre qualité
   perdait ces cartes verrouillées (régression par rapport à l'ancien chip "par sport", qui pouvait
   basculer `activeFamily` entièrement et donc les montrer). Dédupliquée par `id` de carte (protection
   si un même id venait à exister dans 2 familles — pas le cas aujourd'hui). Volontairement PAS
   utilisée pour l'affichage par défaut (sans filtre qualité actif) — y afficherait toutes les cartes
   verrouillées de tous les sports en permanence, une régression dans l'autre sens. */
export function computeAllFamiliesInsights(
  sexe: Sexe,
  poidsKg: number | null,
  latestByMetric: Partial<Record<MetricKey, number>>
): CardInsight[] {
  const sexeKey: "homme" | "femme" = sexe ?? "homme";
  const seen = new Set<string>();
  const out: CardInsight[] = [];
  for (const family of ALL_FAMILIES) {
    for (const ins of buildInsightsForFamily(family, sexeKey, poidsKg, latestByMetric)) {
      if (seen.has(ins.id)) continue;
      seen.add(ins.id);
      out.push(ins);
    }
  }
  return out;
}

/* `emoji`/`action` (2026-09) alimentent l'encadré insight fusionné avec les recommandations
   (TestsPanel.tsx, format "🟢 Maintenir — {sub}") — même convention que les encarts d'insight déjà
   utilisés ailleurs dans l'app (signature de fatigue, /conseils) : un mot d'action court plutôt
   qu'un titre de carte séparé. Couleurs alignées sur STATUS_COLOR (vert/amber/rouge) déjà utilisées
   partout dans ce panneau. */
export interface Verdict { title: string; sub: string; emoji: string; action: string }

export function buildVerdict(insights: CardInsight[]): Verdict {
  const scored = insights.filter((i): i is CardInsight & { score: number } => i.score != null);
  if (!scored.length) {
    return {
      title: "Aucun test renseigné pour l'instant",
      sub: "Ajoute un premier résultat sur l'une des cartes ci-dessous pour faire apparaître ton profil de forces et faiblesses.",
      emoji: "⚪", action: "Renseigner",
    };
  }
  // Un seul représentant par mouvement testé (2026-09, suite — retour de Gildas, "insight croisé,
  // parle des outliers, top 3 forces/top 3 faiblesses") : un exercice avec plusieurs comparaisons
  // (ex. Front Squat vs Back Squat ET vs Clean) ne doit compter qu'une fois dans le classement — sa
  // comparaison la plus faible, même convention que la sélection "primary" déjà utilisée pour la
  // jauge de sa ligne (voir unifiedRowFromInsightGroup, TestsPanel.tsx) — sinon un même mouvement
  // pourrait apparaître 2 fois dans le "top 3".
  const byMetric = new Map<MetricKey, CardInsight & { score: number }>();
  for (const c of scored) {
    const prev = byMetric.get(c.primaryMetric);
    if (!prev || c.score < prev.score) byMetric.set(c.primaryMetric, c);
  }
  const asc = Array.from(byMetric.values()).sort((a, b) => a.score - b.score);
  const avg = scored.reduce((s, c) => s + c.score, 0) / scored.length;
  // Top 3 de chaque côté, jamais le même mouvement des deux côtés (2026-09, suite) : avec peu de
  // tests loggués, `weak3`/`strong3` peuvent se chevaucher (le même mouvement serait à la fois
  // "le plus faible" et "le plus fort" du classement) — `strong3` exclut explicitement tout ce qui
  // est déjà dans `weak3` plutôt que de répéter un nom des deux côtés.
  const weak3 = asc.slice(0, Math.min(3, asc.length));
  const weakIds = new Set(weak3.map(c => c.id));
  const strong3 = [...asc].reverse().filter(c => !weakIds.has(c.id)).slice(0, 3);
  const strongest = asc[asc.length - 1];
  const weakNames = weak3.map(c => c.label).join(", ");
  const strongNames = strong3.map(c => c.label).join(", ");
  // Recommandation concrète (2026-09, suite — retour de Gildas, "ça aurait été mieux de phraser une
  // recommandation") : réutilise le texte `advice` DÉJÀ écrit pour la carte la plus faible (asc[0]/
  // weak3[0]) — pas une nouvelle phrase générique inventée pour l'occasion, le même conseil déjà
  // affiché sur la carte du mouvement elle-même (single source de vérité).
  const priorityAdvice = weak3[0].advice;
  if (avg >= 65) {
    return {
      title: "Profil solide et équilibré",
      sub: strong3.length
        ? `Points forts : ${strongNames}.${weak3.length && weak3.length < asc.length ? ` Axes encore en retrait : ${weakNames} — ${priorityAdvice}` : ""}`
        : `${strongest.label} est ton point fort actuel. Maintiens ce niveau tout en travaillant les axes encore en retrait.`,
      emoji: "🟢", action: "Maintenir",
    };
  }
  if (avg >= 40) {
    return {
      title: "Une priorité claire se dégage",
      sub: `Axes prioritaires : ${weakNames}. ${priorityAdvice}${strong3.length ? ` Points d'appui : ${strongNames}.` : ""}`,
      emoji: "🟠", action: "Prioriser",
    };
  }
  return {
    title: "Profil en construction",
    sub: `Plusieurs axes sont encore sous les repères attendus : ${weakNames}. ${priorityAdvice}${strong3.length ? ` Point d'appui : ${strongNames}.` : ""}`,
    emoji: "🔴", action: "Construire",
  };
}

export type ScoredInsight = CardInsight & { score: number; status: CardStatus };

/* Répartit toutes les cartes notées en 2 colonnes (faible/fort) — remplace l'ancien "top 3 à
   maintenir" : couvre l'intégralité du profil plutôt qu'un extrait, sans avoir besoin d'une
   araignée pour visualiser la répartition d'ensemble. "Dans la norme" (amber) n'est ni un point
   faible ni un point fort — exclu des deux colonnes (reste visible sur la carte de test elle-même,
   juste pas remonté dans les recommandations, qui doivent rester une liste de priorités réelles). */
export function splitByStrength(insights: CardInsight[]): { weak: ScoredInsight[]; strong: ScoredInsight[] } {
  const scored = insights.filter((i): i is ScoredInsight => i.score != null);
  const weak = scored.filter(i => i.status === "red").sort((a, b) => a.score - b.score);
  const strong = scored.filter(i => i.status === "green").sort((a, b) => b.score - a.score);
  return { weak, strong };
}
