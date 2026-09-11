/* Taxonomie par qualité physique (2026-09) — remplace le filtre "par sport" de TestsPanel.tsx
   (l'ancien `chipSport`/`TEST_BATTERIES` chip switching). Objectif de Gildas : filtrer les tests
   recommandés ET les cartes déjà interprétées par la qualité travaillée (Force/Puissance/Endurance...)
   plutôt que par sport — "on affiche pas Back Squat pour Explosivité ou pour Endurance".

   Exigence explicite : ne perdre AUCUN test déjà recommandé (testBattery.ts) dans le processus. Deux
   garde-fous structurels :
   1. `METRIC_QUALITY` est un `Record<MetricKey, Quality>` TOTAL (pas Partial) — TypeScript refuse de
      compiler si un MetricKey manque, donc aucun exercice interprété ne peut silencieusement se
      retrouver sans qualité assignée.
   2. `BATTERY_TEST_QUALITY` est volontairement un Partial (47 des 48 noms uniques de testBattery.ts,
      voir liste en bas) — un test SANS entrée ici n'est jamais masqué : il reste visible en
      permanence dans la vue "par sport" par défaut (comportement inchangé), et n'apparaît simplement
      pas dans la vue "par qualité" transverse (il ne serait de toute façon pas rattachable à une
      seule qualité sans trahir sa nature — seul cas restant : "Niveau de bloc à vue", pure technique.
      Les anciens noms composés listant plusieurs exercices distincts ont été décomposés en 2026-09,
      voir note en bas — ils n'existent plus). Défaut = visible, jamais l'inverse — protège
      structurellement contre l'oubli d'un test. */

import type { MetricKey } from "@/lib/testNorms";

export type Quality = "force" | "puissance" | "reactivite" | "vitesse" | "agilite" | "endurance" | "mobilite" | "polyvalence";

/* Ordre d'affichage des chips — du plus "brut" (force) au plus qualitatif (polyvalence), sans
   prétention scientifique particulière sur cet ordre, juste une progression lisible. */
export const QUALITY_ORDER: Quality[] = ["force", "puissance", "reactivite", "vitesse", "agilite", "endurance", "mobilite", "polyvalence"];

export const QUALITY_META: Record<Quality, { label: string; emoji: string }> = {
  force: { label: "Force maximale", emoji: "🏋️" },
  puissance: { label: "Puissance / Explosivité", emoji: "⚡" },
  reactivite: { label: "Réactivité", emoji: "🔁" },
  vitesse: { label: "Vitesse", emoji: "🏃" },
  agilite: { label: "Agilité / Changement de direction", emoji: "↔️" },
  endurance: { label: "Endurance", emoji: "🫀" },
  mobilite: { label: "Mobilité / Prévention", emoji: "🤸" },
  polyvalence: { label: "Polyvalence", emoji: "🔥" },
};

/* Qualité(s) par exercice interprété (2026-09, suite : tableau depuis le bug "CMJ recommandé en
   Réactivité mais invisible" trouvé par Gildas) — dérivée du mouvement lui-même, pas du sport dans
   lequel il apparaît (un Back Squat reste "Force maximale" qu'il soit loggé par un powerlifter ou un
   rugbyman). `Record` total (chaque clé a au moins 1 qualité) : voir garde-fou n°1 en tête de fichier.

   Répartition, justifiée par mouvement (pas par famille testNorms.ts) :
   - Force maximale (9) : les lifts "de force" au sens strict (charge quasi-maximale, faible vitesse
     d'exécution) — squats/press/deadlift/good morning, PAS les mouvements olympiques eux-mêmes (voir
     Puissance ci-dessous, classification standard en science du sport : l'halténophilie olympique est
     l'exemple manuel de l'entraînement de puissance, pas de force maximale pure).
   - Puissance / Explosivité (44) : arraché/épaulé-jeté et TOUTES leurs variantes techniques
     (tirages, hang/power/tall/muscle/no-feet/block..., jerks en toutes positions) + CMJ/Squat Jump
     (hauteur de saut = expression directe de puissance). Bucket volontairement large : la quasi-
     totalité de ces variantes techniques haltéro sont `core:false` dans RATIO_CARDS (invisibles tant
     que jamais loggées), donc sans impact visuel réel pour la plupart des utilisateurs.
   - Réactivité (2, +CMJ/Squat Jump en double-tag) : Drop Jump (hauteur + contact) reste la seule
     carte VRAIMENT scorée sur cette qualité (le RSI ne corrèle pas avec le profil force-vitesse
     dérivé de CMJ/SJ, littérature déjà citée pour la section "Aussi comparé à"/ratios CMJ-SJ-DropJump
     — jamais fondu dans "Puissance"). CMJ/Squat Jump portent AUSSI ce tag (en plus de Puissance,
     jamais à sa place) parce qu'un CMJ/SJ déjà loggé est recommandé comme test de Réactivité
     (BATTERY_TEST_QUALITY) : sans ce double-tag côté carte, "Saut vertical (CMJ)" apparaissait
     "✓ Déjà testé" dans la liste Réactivité sans jamais montrer sa carte correspondante nulle part
     dans cette vue (elle ne vivait que sous Puissance) — un vrai cul-de-sac, corrigé ici.
   - Vitesse (2) : sprint 10m/30m.
   - Endurance (6) : distances de course (5-10km/semi/marathon), VMA, VO2max. */
export const METRIC_QUALITY: Record<MetricKey, Quality[]> = {
  // Force maximale
  backSquat: ["force"], frontSquat: ["force"], bench: ["force"], deadlift: ["force"], press: ["force"],
  goodMorning: ["force"], cleanDeadlift: ["force"], snatchDeadlift: ["force"], ohSquat: ["force"],
  // Puissance / Explosivité — arraché/épaulé-jeté et variantes techniques
  clean: ["puissance"], cleanJerk: ["puissance"], snatch: ["puissance"],
  belowBtnJerk: ["puissance"], behindTheNeckJerk: ["puissance"], blockAboveKneeClean: ["puissance"], blockAboveKneeSnatch: ["puissance"], boxCleanPull: ["puissance"],
  btnPressInSplit: ["puissance"], cleanPull: ["puissance"], dropJerkTallJerk: ["puissance"], hangClean: ["puissance"],
  hangSnatch: ["puissance"], highPull: ["puissance"], jerk: ["puissance"], jerkBalance: ["puissance"], jerkRecovery: ["puissance"], muscleClean: ["puissance"],
  muscleSnatchContact: ["puissance"], muscleSnatchNoLeg: ["puissance"], noFeetClean: ["puissance"], noFeetSnatch: ["puissance"],
  ohSquatPushPress: ["puissance"], powerClean: ["puissance"], powerCleanBox: ["puissance"], powerCleanNoFeet: ["puissance"], powerJerk: ["puissance"], powerSnatch: ["puissance"],
  powerSnatchBox: ["puissance"], powerSnatchNoFoot: ["puissance"], pressBtn: ["puissance"], pressOh: ["puissance"], pushPress: ["puissance"],
  snatchBalance: ["puissance"], snatchPull: ["puissance"], snatchPullBlock: ["puissance"], snatchSotsPress: ["puissance"], sotsPress: ["puissance"],
  tallClean: ["puissance"], tallMuscleClean: ["puissance"], tallMuscleSnatch: ["puissance"], tallSnatch: ["puissance"],
  cmjHeight: ["puissance", "reactivite"], cmjFreeArms: ["puissance", "reactivite"], squatJumpHeight: ["puissance", "reactivite"],
  // Réactivité
  dropJumpHeight: ["reactivite"], dropJumpContact: ["reactivite"],
  // Vitesse
  sprint10m: ["vitesse"], sprint20m: ["vitesse"], sprint30m: ["vitesse"], sprint60m: ["vitesse"], sprint100m: ["vitesse"], sprint200m: ["vitesse"],
  fly10m: ["vitesse"], fly20m: ["vitesse"], fly30m: ["vitesse"],
  // Endurance
  time5k: ["endurance"], time10k: ["endurance"], timeSemi: ["endurance"], timeMarathon: ["endurance"], vma: ["endurance"], vo2max: ["endurance"],
};

/* Qualité(s) par test recommandé (testBattery.ts), keyée par nom EXACT (déduplique naturellement les
   tests qui apparaissent dans plusieurs batteries sport, ex. "Saut vertical (CMJ)" listé pour
   football/handball). Partial volontaire — voir garde-fou n°2 en tête de fichier pour la liste des
   noms sciemment non taggés et pourquoi.

   Tableau (pas une seule Quality) depuis 2026-09 (suite) — certains tests sont légitimement
   pertinents pour 2 qualités à la fois (ex. CMJ/Squat Jump : expression de puissance ET brique de
   base d'un profil de réactivité, comparés au Drop Jump en pratique S&C réelle ; "Test de vitesse de
   frappe" : "Vitesse ET puissance de frappe" dans son propre texte `quality`). Un tag en `Quality[]`
   apparaît dans CHACUNE des vues qualité listées, jamais dupliqué au sein d'une même vue (dédup par
   nom déjà géré côté TestsPanel.tsx). */
export const BATTERY_TEST_QUALITY: Partial<Record<string, Quality[]>> = {
  "Yo-Yo Intermittent Recovery Test": ["endurance"],
  "Sprint 30m avec split 10m": ["vitesse"],
  "Test T (agilité)": ["agilite"],
  "Saut vertical (CMJ)": ["puissance", "reactivite"],
  "Drop Jump (RSI)": ["reactivite"],
  "Squat Jump": ["puissance", "reactivite"],
  "Lane Agility Drill": ["agilite"],
  "Sprint 3/4 terrain": ["vitesse"],
  "Test de Sargent": ["puissance", "reactivite"],
  "Bronco Test": ["endurance"],
  "Sprint 40m avec split 10m": ["vitesse"],
  "1RM Back Squat": ["force"],
  "Test de pompes / tirage isométrique": ["force"],
  "Yo-Yo IR1": ["endurance"],
  "Medicine ball throw (lancer assis)": ["puissance"],
  "Saut vertical avec élan (Spike Jump)": ["puissance"],
  "Saut vertical sans élan (Block Jump)": ["puissance"],
  "Souplesse d'épaule (goniométrie)": ["mobilite"],
  "Test VMA (Cooper ou demi-Cooper)": ["endurance"],
  "Test de seuil (30 min max ou Conconi)": ["endurance"],
  // Reclassé Endurance (pas Force) sur retour de Gildas : "Spécifique trail : la descente sollicite
  // le quadriceps en excentrique de façon prolongée" — le contexte (préparation trail/course longue)
  // prime ici sur le pattern moteur (excentrique = famille "force" en général), ce test répond à une
  // question d'endurance/tolérance à la fatigue spécifique course, pas de force maximale.
  "Test de descente (protocole excentrique)": ["endurance"],
  "1RM ou 5RM Squat": ["force"],
  "Test FTP (Functional Threshold Power)": ["endurance"],
  "Test de puissance maximale (sprint 6-10s)": ["puissance"],
  "VO2max sur ergocycle": ["endurance"],
  "Test 400m ou 30min (protocole seuil)": ["endurance"],
  "Test de vitesse 25m/50m départ plongé": ["vitesse"],
  "Test de force en traction (tirage élastique ou banc de nage)": ["force"],
  "1RM Snatch": ["puissance"],
  "1RM Clean & Jerk": ["puissance"],
  "1RM Front Squat": ["force"],
  "Test de mobilité overhead squat": ["mobilite"],
  "Test RM répété (5RM, 8RM)": ["force"],
  "1RM Développé couché": ["force"],
  "1RM Soulevé de terre": ["force"],
  "1RM Développé militaire (OHP)": ["force"],
  "Saut vertical et saut en longueur sans élan": ["puissance"],
  "Test Fran / Grace / Helen (benchmark WOD)": ["polyvalence"],
  "Test 2000m rameur ou 5km course": ["endurance"],
  "Test de vitesse de frappe": ["puissance"],
  "Test d'assauts enchaînés (rounds)": ["endurance"],
  "Test de suspension à la poutre (dead hang)": ["force"],
  "Test de continuité (4x4)": ["endurance"],
  // Nouveaux tests (2026-09, suite) — demandés par Gildas pour compléter les batteries "Réactivité"
  // et "Vitesse". Ajoutés au battery sprint_athle (testBattery.ts, seul bucket vraiment générique
  // athlétisme/vitesse) plutôt qu'à un sport précis.
  "Saut vertical bras libres (CMJ free arms)": ["puissance", "reactivite"],
  "30m lancé (flying 30m)": ["vitesse"],
  "60m départ arrêté": ["vitesse"],
  "100m départ arrêté": ["vitesse"],
  // Volontairement NON taggé (toujours visible en vue "par sport" par défaut, jamais dans la vue
  // "par qualité" transverse — voir garde-fou n°2) :
  // - "Niveau de bloc à vue" : "Technique et lecture de mouvement", pas une qualité physique.
  // (Les anciens noms composés listant plusieurs exercices distincts — "1RM ou estimation via RPE
  // (Squat, Bench, Deadlift)", "1RM Snatch / Clean & Jerk", "1RM Back Squat / Front Squat", "1RM
  // Clean & Jerk, Snatch, Back Squat" — ont été décomposés en autant d'entrées tagguées séparément
  // (testBattery.ts, 2026-09) : ils n'existent plus, remplacés par une carte par exercice.)
  // (Les liens "Programme {sport} complet" et les 5 concours multi-critères — Gendarmerie/
  // Sapeur-Pompier/Armée de Terre/Police Nationale/GIGN — ont été retirés de testBattery.ts le
  // 2026-09 : ni l'un ni l'autre n'est un test physique individuel, jugé hors périmètre de Tests
  // de performance par Gildas — pas seulement non-tagués ici, absents de la source elle-même.)
};
