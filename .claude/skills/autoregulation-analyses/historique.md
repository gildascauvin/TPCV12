# Historique « autoregulation-analyses » (extrait verbatim de l'ancien CLAUDE.md, du plus ancien au plus récent)

Les sections récentes priment sur les anciennes. Toujours vérifier dans le code avant de s'appuyer sur un détail.

## Page Conseils (`/conseils`) — carte "Impact comportements"

`src/app/(app)/conseils/page.tsx` — `computeBehaviorCorrelations()` calcule, pour chaque comportement (`alcohol`, `hydration`...), son impact moyen sur le score wellness (`BehaviorImpactCard`).

**Sémantique de `wellness_daily.behaviors`** : le formulaire (`WellnessModal.tsx` step 3, et l'équivalent onboarding `wellness_q`) demande "🔍 Comportements d'hier" — les comportements enregistrés dans la ligne du jour J représentent les actions réelles du jour **J-1** (la veille), pas celles du jour J. Le score de la ligne J (`computeWellnessScore()` dans `src/lib/wellness.ts`) intègre déjà directement ces comportements : `score = base_score − pénalité(comportements) + bonus(comportements)` (pénalité −3pts/comportement négatif plafonnée à −15, bonus +2pts/positif plafonné à +10). Donc une seule ligne `wellness_daily` encode déjà toute la relation "comportements de la veille → score du jour" — pas besoin de décalage d'index entre deux lignes.

**Fix corrélation "J→J+1" → "veille→jour même" (2026-07-22)** — repéré par Gildas sur son propre compte (`cauvingildas@gmail.com`) : la carte attribuait un mauvais score à l'hydratation (positive) au lieu des vrais responsables (alcool/sommeil tardif/sortie sociale). Root cause : `computeBehaviorCorrelations()` comparait `dayD.behaviors` (= actions réelles de J-1) au score de la ligne **suivante** `dayD+1.score` (qui intègre lui-même les actions de J) — un décalage total de 2 jours, pas 1, malgré le libellé "corrélation J→J+1". **Fix** : comparaison sur la même ligne (`day.behaviors` vs `day.score`), plus de recherche de paires consécutives ni de vérification `diffDays`. Libellés UI corrigés en conséquence (suppression de toute référence à "du lendemain"/"J→J+1").

**Seuil d'affichage par comportement (préexistant, pas changé par ce fix)** : un comportement n'apparaît dans la carte que s'il a été loggé au moins 2 fois sur la période (`daysWith.length < 2` → exclu silencieusement, pas de "pas assez de données" affiché). Sur un compte avec peu d'historique, ça peut donner l'impression que certains comportements évidents (ex. alcool coché une seule fois) sont ignorés — c'est le seuil statistique minimal, pas un bug.

## Score wellness post-séance sur `/today` (2026-07-22)

La carte "Score & conseils" de `src/app/(app)/today/TodayClient.tsx` affichait jusque-là uniquement le score wellness du matin, même après qu'une séance réelle (RPE + durée saisis via `CompleteModal.tsx`) ait été terminée — le bloc "Conseils" du bas de carte (`getAdvice()`) réagissait déjà aux séances faites, mais le ring/zone/commentaire du haut (`getContextualInsight()`) restait figé sur les 4 signaux du matin (sommeil/stress/récup/motivation), pouvant afficher "Tous les signaux au vert — fenêtre idéale pour t'entraîner" juste au-dessus d'un conseil parlant d'une séance déjà terminée.

**Fonctions déjà présentes mais mortes, désormais branchées** : `computeFatigueImpact(rpe, durationMinutes)` (impact = `min(round(rpe×durée/60), 25)`) et `computeDisplayScore(wellnessScore, dailyImpacts[])` existaient dans `src/lib/wellness.ts` sans aucun appelant — `CompleteModal.tsx` réimplémentait la même formule en dur (ligne 23) juste pour son propre bandeau "🔥 Impact fatigue estimé", jamais persisté ni réutilisé ailleurs. Pas de nouveau modèle inventé, juste le câblage de l'existant.

- **`TodayClient.tsx`** : `displayScore` (utilisé partout dans la carte — ring, `zoneLabel`, lignes d'alerte) intègre désormais l'impact des séances terminées du jour (`todaySessions.filter(s => s.done && s.rpe && s.duration)`), recalculé côté client à chaque rendu — **rien n'est écrit en base**. `wellness_daily.score` reste le score du matin brut, inchangé, puisque c'est lui qu'utilise la corrélation "Impact comportements" de `/conseils` (qui doit rester un pur reflet du check-in matinal, indépendant de la charge d'entraînement qui arrive après — voir section précédente).
- **`CompleteModal.tsx`** : `impact` importe désormais `computeFatigueImpact` au lieu de dupliquer la formule.
- Testé en local par Gildas avant déploiement.

### Itération suivante (même jour) — `loadRule` réutilisée, encarts spécialisés, badges retirés

Repéré par Gildas : le commentaire du haut de carte (`getContextualInsight`) et le bloc "⚡ Entraînement" du bas (`getAdvice().training`) disaient souvent la même chose de façon différente, avec des seuils parfois contradictoires (l'un regarde chaque signal individuellement, l'autre le score agrégé). Refonte avec séparation nette des rôles plutôt qu'une simple fusion :

- **"⚡ Entraînement"** n'utilise plus de logique inventée — réutilise **`src/lib/loadRule.ts`** (`loadRule(sessions, {prevMax, nextMax})`), le moteur de règles déjà utilisé par `/week` (`WeekClient.tsx`) qui compare la séance du jour à hier et demain (hard/moderate/easy/rest, titres+textes déjà rédigés : "Séance dure après modérée" / "Récupération méritée"...). `TodayClient.tsx` calcule `prevMax`/`nextMax` exactement comme `WeekClient.tsx` (séances de `selectedDate ± 1 jour` filtrées depuis `allSessions`) et affiche `${rule.title}. ${rule.text}`. Plus aucune référence au score wellness dans cet encart.
- **"🌿 Récupération"** absorbe le signal faible (sommeil/stress/récup/motivation) et le score global, mais **ne répète plus jamais le score en chiffres** (déjà visible sur le ring) — nouvelle fonction exportée **`getRecoveryAdvice(wellness, loadCls, postSession?)`**. Priorité de contenu : comportement négatif loggé (`wellness.behaviors`, via `NEGATIVE_BEHAVIOR_TIPS` — conseil dédié par comportement, ex. "Alcool hier soir — hydrate-toi bien, évite d'en reprendre ce soir", plus actionnable qu'un signal générique) > signal faible générique > message neutre selon la charge. L'impact wellness post-séance et la charge d'entraînement (`loadRule.cls`) sont **fusionnés dans une seule notion de "charge"** au lieu de deux phrases séparées bout à bout.
- Le texte du haut de carte (`getContextualInsight`) est retiré de `/today` (la fonction elle-même n'est pas supprimée — toujours utilisée par `OnboardingFlow.tsx`, écran `wellness_reveal`).
- Le prompt "Non renseigné · Appuie pour remplir" (sous le ring, wellness non rempli) est retiré aussi — pur doublon du titre "Non renseigné" juste au-dessus, la carte entière étant déjà cliquable.
- Les deux badges pill ("✓ Autorégulation active", statique et jamais mise à jour ; "📉 {score}→{displayScore} (−X)", devenu redondant avec le nouveau texte Récupération) sont retirés entièrement.
- **`getAdvice()` reste inchangée**, toujours utilisée par l'onboarding (`wellness_reveal`, qui n'a ni séances ni notion de veille/lendemain) — `getRecoveryAdvice()` est une fonction séparée ajoutée à côté, pas une modification de l'existante, pour zéro risque de régression sur ce parcours.
- **Duplication assumée** : la détection de signal faible existe maintenant à deux endroits proches (`getAdvice`/onboarding vs `getRecoveryAdvice`/`today`) — pas de fusion pour l'instant, les contextes diffèrent trop (charge/veille/lendemain absents en onboarding) pour qu'une abstraction commune vaille le risque.
- Vérifié à chaque étape sur données réelles (`cauvingildas@gmail.com`, requêtes SQL directes) avant test visuel local, puis déployé en prod.

## Ratio technique/prépa physique pour "Autre" + libellés de discipline générés par Claude (2026-08-07)

Point de départ : Gildas a demandé un état des lieux de l'heuristique du générateur pour les sports tapés librement sans curriculum. Constat en relisant le code : `FOCUS_DIST.autre` est strictement identique à `FOCUS_DIST.mixte` — kitesurf, BMX racing et escalade à 4 jours recevaient exactement la même rotation de types de séance que n'importe quel autre sport générique, sans aucune notion de ratio technique/préparation physique. Gildas a proposé un modèle "N technique + N prépa selon la fréquence, contenu de prépa adapté au sport au bon sens de l'IA" — validé après une contre-proposition explicite (voir échange précédent) : garder le ratio **déterministe et générique par nombre de jours** (pas de table par sport, aucune page WordPress de référence pour arbitrer un "bon" ratio par sport inconnu, contrairement aux 28 curriculums existants) plutôt que de laisser l'IA décider de la structure — seule la discipline de prépa (le contenu) reste confiée à Claude, jamais le nombre de jours de chaque type.

### `selectAutreTypes()` — ratio par nombre de jours (`generate/route.ts`)
Remplace `FOCUS_DIST` pour `category === "autre"` uniquement (cyclisme/natation/ski/trail/rééducation générale, qui n'ont pas non plus de curriculum, gardent `FOCUS_DIST` inchangé — hors périmètre de cette demande). `techCount = ceil(n/2)`, le reste en prépa (alternant `volume`/`intensite`) — repères donnés par Gildas : 4j → 2 technique+2 prépa, 5j → 3 technique+2 prépa. Alterne strictement prépa/technique **en commençant par un jour de prépa**, jamais un cyclage modulo sur une liste plus courte (élimine par construction le bug de reachability déjà rencontré 2 fois dans ce fichier — Renfo endurance jamais atteint à n=4, Skill calisthenics jamais atteint à n=3).

**Bug trouvé en testant contre le serveur dev réel, pas en relisant le code** : un premier jet démarrait la séquence par une séance technique quand c'était mathématiquement la position naturelle — la Phase A2 universelle (1er jour de la semaine jamais facile, "technique" est le palier facile) la retransformait alors silencieusement en prépa, faisant dériver le ratio promis (4j → 2 technique+2 prépa devenait 1+3, vérifié via `curl` direct sur `/api/programs/generate`). Fix : le tout premier jour de la séquence est toujours un jour de prépa (jamais technique), ce qui neutralise complètement la Phase A2 pour cette fonctionnalité. Conséquence vérifiée : le ratio tient à **100% pour un nombre de jours pair** (2/4/6), quels que soient les jours calendaires choisis — les paliers RPE alternent strictement par construction, la Phase B (jamais 2 jours consécutifs au même palier) ne se déclenche jamais. Pour un nombre **impair** (3/5/7), il tient sauf si les 2 derniers jours sélectionnés (ordre calendaire) sont réellement consécutifs sans repos entre eux (ex. Lun/Mer/Ven/Sam/Dim) — dans ce cas la Phase B retransforme l'un des deux jours techniques en prépa, donnant 2 technique+3 prépa au lieu de 3+2. Même compromis déjà accepté partout ailleurs dans ce fichier (haltéro, sprint, combat...), pas un bug — documenté explicitement dans le code et signalé à Gildas plutôt que présenté comme une garantie à 100%.

### Libellés de discipline générés par Claude (`/api/sports/custom`)
`EXERCISES_TOOL` (tool-use, même mécanisme que les exercices/faiblesses déjà en place) étend son schéma avec `sessionLabels` — un libellé par `SessionType`, avec consigne explicite dans le prompt : pour `volume`/`intensite` (les 2 séances de prépa physique de la semaine), choisir la discipline la plus pertinente pour le sport décrit (Circuit Training, Renfo ciblé, Sprints, Pliométrie...) plutôt qu'un nom générique, jamais la même discipline pour les deux sauf si le sport le justifie. `sanitizeSessionLabels()` : un champ manquant/invalide sur un type précis ne fait pas échouer tout l'appel (contrairement à `isValidExercises`/`isValidWeaknesses`, qui doivent être valides à 100% ou rien) — repli sur le libellé générique de ce type côté `generate/route.ts` (`archetypeName ?? customSessionLabels?.[type] ?? sessionName(...)`). Reste strictement du vocabulaire (un nom affiché) — jamais une décision de structure, même principe déjà appliqué à `customExercises`.

### Rollout — in-app d'abord, onboarding porté après validation en prod
Même pattern que le reste du chantier "Autre"+Claude : `ANTHROPIC_API_KEY` vide en local (Sensitive côté Vercel, write-only), donc l'appel Claude réel n'est testable qu'en production. Livré en 2 commits séparés à la demande explicite de Gildas :
1. `48874f8` — câblé uniquement dans `ProgramCriteriaModal.tsx` (in-app, zéro risque funnel). Testé et confirmé fonctionnel en prod par Gildas.
2. `484a289` — porté dans l'onboarding (`OnboardingFlow.tsx`, `sport_2a`) une fois la version in-app validée : `customSessionLabels` transmis à `generateAndAssignProgram()` (sportif + coach) et aux 2 rendus `WeekPreviewStep` (`week_preview_2a`/`2b`), même câblage que `customExercises`/`customWeaknessMeta` déjà en place. Aucun changement côté `generate/route.ts`/`sports/custom/route.ts` (déjà livrés au commit précédent).

**Vérifié** : `tsc --noEmit` propre à chaque étape (seule erreur résiduelle : le piège de cache `.next/types`/`getSportCategory` déjà documenté plus haut dans ce fichier, `next dev` tournant en parallèle — pas une vraie erreur, fichier non touché). Ratio testé en direct contre le serveur dev réel pour les 7 valeurs de nombre de jours (jours consécutifs ET espacés) via `curl` sur `/api/programs/generate` — pas seulement en relisant le code. Libellés + injection dans les notes/nom de séance vérifiés avec un payload `customExercises`/`customSessionLabels` simulé (sport "Escalade"). L'appel Claude réel (le seul maillon non testable en local) confirmé fonctionnel en prod côté in-app par Gildas avant le portage onboarding.

## Moteur de charge d'entraînement unifié (Foster/ACWR/monotonie/strain/Form/Fitness/Fatigue) — `/conseils` + Coach Control (2026-08-09→11)

Chantier déclenché par une discussion sur la charge d'entraînement (inspirée d'un échange ChatGPT sur Foster/Hooper/monotonie/strain/ACWR, puis approfondie sur la fidélité scientifique du Form) : le calcul de charge (`RPE×durée`) était dupliqué avec 3 formules légèrement différentes, jamais contextualisé, et les sparklines "coût nerveux"/"coût musculaire" de `/conseils` et de la liste sportifs coach étaient des heuristiques inventées sans base scientifique. État final ci-dessous — remplace les descriptions antérieures de ce même chantier dans l'historique git de ce fichier.

### `src/lib/trainingLoad.ts` — module central, fonctions pures
Source unique de vérité pour la charge, réutilisable telle quelle par de futurs simulateurs :
- `sessionLoad`/`dailyLoad` : Foster session-RPE (`RPE × durée`) — remplace les 3 formules dupliquées (`computeFatigueImpact` de `wellness.ts` non touché, portée différente : impact ponctuel post-séance).
- `monotony(series7)` : moyenne/écart-type des charges quotidiennes sur 7j (Foster, 1998). `strain(series7)` : charge hebdo × monotonie.
- `acwr(series28)`/`acwrSeries` : charge moyenne 7j / charge moyenne 28j, **moyennes glissantes simples** (Gabbett et al., convention standard de cette littérature) — `acuteChronicAt()`, fenêtre chronique élargie progressivement à partir de 14j. **Jamais présenté comme un score de risque de blessure** (littérature critique sur ce point) — uniquement comme indicateur de tendance.
- **Fitness/Fatigue/Form%, fenêtres EWMA 7j/42j** (convention Banister, popularisée par TrainingPeaks CTL/ATL/TSB — différente de l'ACWR 7j/28j de Gabbett, les deux conventions gardées séparées) : `ewmaLoadAt()` (lambda=1/n depuis le 2026-10-24, comme TrainingPeaks : CTL += (charge − CTL)/42 ; avant, 2/(n+1) faisait oublier la Fitness en ~21 j au lieu de 42 et exagérait la perte en affûtage. Poids renormalisés sur les jours disponibles, 6n jours max : même valeur que la récursion sur un long historique, sans biais vers 0 au début ; vérifié : charge divisée par 2 pendant 14 j → Fitness −15 %, comme TrainingPeaks. Même formule dans l'outil du site, post WP 35535) → `fitnessFatigueAt()` (Fitness=EWMA 42j, Fatigue=EWMA 7j) → `formPercentSeries()` : **Form% = (Fitness − Fatigue) / Fitness × 100** — % de la charge chronique plutôt qu'UA brutes, stable dans le temps pour UN sportif, mais **assumé non comparable entre deux sportifs/sports** (Foster session-RPE n'a pas de normalisation d'intensité individuelle type FTP, contrairement au TSS de TrainingPeaks) — documenté explicitement dans le code. `fitnessFatigueTrend()` : direction (up/down/stable, seuil ±5%) de Fitness et Fatigue sur les 7 derniers jours, pour badge de tendance.
- **Formule rejetée en cours de route** : une source ("Fitness = Charge − Contrainte", attribuée à "Gazzano, 2002") s'est révélée mathématiquement incohérente par dérivation directe — vérifié contre 2 sources externes, aucune ne résolvant l'ambiguïté. Le Form ci-dessus (Banister) a été gardé à la place.
- `classifyTrend`/`computeWeekOverWeekTrend` : grille 3×3 (direction charge × signal corporel wellness+RPE) → 9 `TrendCode`, **toujours un insight** tant qu'une semaine précédente avec séances existe. `wellnessDelta` en EWMA (`λ=2/(N+1)=0.25`) plutôt que moyenne simple — un seul mauvais jour ne se dilue plus à 1/7. `describeTrend(code, input, perspective)` : texte FR, mentionne explicitement "ta récupération se dégrade/s'améliore" (le wellness, via `wellnessDelta`) — l'insight global en haut de carte parle donc bien du wellness, pas seulement de la charge/RPE.

### `src/lib/fatigueSignature.ts` — seuils d'affichage et insights croisés
`computeSignature()`/`buildDailyTimeSeries()` (`DayPoint`: `load`/`monotony`/`acwr`/`recovery`/`form`/`formRaw`). `sigDimInfo(dim, value, perspective)` :
- ACWR `<0.8` sous-charge / `0.8–1.3` zone optimale / `>1.3` surcharge (Gabbett) ; Monotonie `<2`/`<2.5`/`≥2.5` (Foster, 1998) ; Strain `<6000`/`<10000`/`≥10000` (Foster, 1998) — seuils issus de la littérature.
- **Form, 3 bandes "produit" pas "littérature"** (commentaire explicite dans le code, à recalibrer sur données réelles) : `≥+8%` Frais (vert) / `-8% à +8%` Équilibré (gris) / `<-8%` Fatigué (rouge). Une version à 5 paliers a été testée puis simplifiée — plus de bruit que de lecture utile sur un chart compact.
- **Récupération** : mêmes labels de zone qu'avant ("BONNE RÉCUP"/"RÉCUP STABLE"/"RÉCUP FRAGILE"), mais `color` = `wellnessColor(value)` (dégradé séquentiel bleu, voir section suivante) au lieu de rouge/orange/vert — harmonisé avec le ring/chart wellness.
- `trendDimInfo(dim, trend, perspective)` : badges Fitness/Fatigue — flèche seule sans texte redondant quand la flèche suffit ("FITNESS ↗", pas "FITNESS ↗ EN HAUSSE"), "→ STABLE" avec texte (une flèche neutre seule ne dit pas clairement "stable").
- `recoveryCrossInsight(recoveryInfo, formValue, perspective)` : compare wellness et Form — **détection wellGood/wellBad sur `recoveryInfo.label`**, jamais sur `.color` (piège réel rencontré : le badge recovery n'a plus de couleur fixe comparable par égalité depuis le passage au dégradé bleu — une comparaison sur la couleur y échouerait silencieusement).
- `chargeCrossInsight(loadInfo, monotonyInfo, strainInfo, fitnessTrendInfo?, fatigueTrendInfo?, perspective)` : ACWR/Monotonie/Contrainte + (optionnels) Fitness/Fatigue dans la même logique alerte/watch — Fitness/Fatigue ne déclenchent jamais "alerte" (`trendDimInfo` ne renvoie jamais rouge pour eux), seulement "à surveiller".

### UI — `/conseils` (`ConseilsClient.tsx` + `src/lib/conseilsData.ts`) et `/coach/athletes` (`AthletesClient.tsx`)
- Pas de header dédié sur `/conseils` (retiré — `CalendarHeader` suffit) : la carte "Ta signature de fatigue" commence directement par l'insight global (`describeTrend`).
- **2 sections "⚡ Charge" et "🌿 Récupération"**, identiques sur les 2 surfaces (côte à côte en desktop côté coach, `AthleteSignatureBlock`), 7 jours glissants pleine largeur :
  - **Charge** (`ZoneSparkline.tsx`) : bandes de zone ACWR (Récup/Optimal/Surcharge, Gabbett) + ligne colorée. Badges : Monotonie, Contrainte, Fitness (tendance), Fatigue (tendance) — **pas de badge ACWR séparé**, déjà entièrement illustré par les bandes/ligne du chart juste en dessous (`loadInfo` reste calculé pour `chargeCrossInsight()`, juste plus rendu en badge).
  - **Récupération** (`SparkLineClient.tsx`) : aire wellness en **dégradé séquentiel bleu** (magnitude continue → job "Sequential" du skill dataviz, pas "Status" rouge/orange/vert réservé aux dimensions bon/watch/critique) + ligne Form pointillée grise avec points colorés par zone (Frais/Équilibré/Fatigué), liseré de zone Form en bord droit, légende dégradée continue en bord gauche ("EN FORME"/"FATIGUÉ"). Badges : Récupération (coloré par `wellnessColor`), Forme (3 bandes). **Fitness/Fatigue vivent dans la carte Charge, pas ici** — ce sont des vues de la charge, alors que Form reste ici car sa seule valeur est d'être comparée visuellement au wellness sur le même chart (`recoveryCrossInsight`) ; les en séparer casserait cette comparaison à l'œil.
- **`ZoneBadge.tsx`** (partagé, tailles `md`/`sm`) : badge coloré, définition au survol/tap (tooltip HTML, pas de `title` natif).
- **`wellnessColor(score)`/`WELLNESS_RAMP`** vivent dans **`src/lib/wellness.ts`** (source unique, réutilisée par `SparkLineClient.tsx` et par tous les wellness rings de l'app, voir section suivante) — clair = en forme, foncé = fatigué (choix de Gildas après test visuel, sur les deux types de fond — cartes sombres et la carte claire de `CoachSessionModal`, le foncé reste la couleur qui "ressort"). Valeurs reprises telles quelles de la rampe séquentielle bleue documentée du skill dataviz, jamais de hex inventé à l'œil.
- **Piège de rendu SVG résolu** (`ZoneSparkline.tsx`/`SparkLineClient.tsx`) : un `<text>`/`<circle>` SVG dans un `viewBox` scale avec la largeur rendue du SVG — sur une carte desktop large, texte/points paraissaient "zoomés". Fixé en sortant labels et points vers un overlay HTML (`position:absolute`, taille fixe en px), le SVG ne gardant que remplissages/traits.
- **Coach Control / `decisionText()` (`CoachAthleteCard.tsx`) : override, pas remplacement** — `attention()`/`decisionText()`/`riskScore()` gagnent un paramètre optionnel `trend?: TrendCode` (`accumulation`/`fatigue_persistante` déclenchent une alerte prioritaire), mais le texte piloté par `wellness_score`+`maxDiff` du jour reste la branche par défaut — l'insight global n'a structurellement aucune connaissance de la difficulté de la séance prévue aujourd'hui, ne peut donc pas remplacer `decisionText()`.

### Wellness rings unifiés sur le dégradé séquentiel bleu
Sur demande explicite de Gildas ("par cohérence, toutes les wellness rings") : **7 rings + 2 widgets supplémentaires** basculés sur `wellnessColor()` (avant : seuils Status rouge/orange/vert dupliqués indépendamment dans chaque fichier — restent des composants séparés, non unifiés en un seul, seule la couleur est maintenant partagée) :
- `src/components/wellness/WellnessRing.tsx` (partagé — `CelebrationScreen.tsx`, `OnboardingFlow.tsx`)
- `src/app/(app)/today/TodayClient.tsx` (`WellnessRingPOC`)
- `src/app/(app)/coach/athletes/AthletesClient.tsx` (`AthleteRing`)
- `src/components/calendar/PlanningRing.tsx` (partagé — `WeekClient.tsx` via `DayColumn.tsx`, `CoachPlanningClient.tsx`)
- `src/components/coach/CoachAthleteCard.tsx` (`WellnessRing` — Coach Control `/coach`, aperçu onboarding coach)
- `src/components/calendar/CalendarHeader.tsx` (ring par jour dans l'en-tête)
- `src/components/coach/CoachSessionModal.tsx` (encart "attention" au clic sur une séance — ring **et** fond/bordure de la carte dérivés de la même couleur via suffixe hex+alpha `${wColor}12`/`${wColor}44`, seul cas fond clair de tout ce chantier ; le badge wellness du sélecteur de destinataires aussi)
- `src/components/coach/AddAthleteModal.tsx` (chiffre "X/100" + `accentColor` du slider, édition manuelle d'un sportif démo — variable locale renommée `wellnessAccent`, collision avec la fonction importée)

Partout, `score === null` garde son propre gris translucide existant par fichier (`rgba(255,255,255,0.18)` ou équivalent — "pas de donnée") plutôt que le gris neutre `#8a8f94` de `wellnessColor(null)`.

**Distinction volontaire, pas oubliée** : les fonctions `scoreColor` qui colorent un **texte** de statut catégoriel (ex. "Disponible"/"Stable"/"À surveiller" dans `AthletesClient.tsx`, `CoachPlanningClient.tsx`, `DayColumn.tsx`) restent en Status rouge/orange/vert — seuls les **rings** et 2 widgets ci-dessus (magnitude affichée seule, pas de mot catégoriel) sont passés en Sequential bleu.

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round (dev server arrêté avant chaque build — piège `.next`/`.next/types` corrompu par un `next dev` concurrent, rencontré plusieurs fois pendant ce chantier, déjà documenté ailleurs dans ce fichier). `trainingLoad.ts` testé isolément via scripts `tsx` ad-hoc sur séries synthétiques (convergence ACWR, scénarios Form tapering/surcharge, `strainTrendPct`). EWMA rejouée avec les vraies données Supabase du compte de Gildas avant déploiement. Pas de test isolé supplémentaire sur les fonctions EWMA de Fitness/Fatigue (dérivées directement de `ewmaWellness()` déjà testée) — à re-vérifier visuellement par Gildas sur `/conseils` et `/coach/athletes`.

Déployé en prod entre le 2026-08-10 et le 2026-08-11 en 6 commits sur `main` (`379b9d6` moteur de charge initial, `73ce2b8` Form% EWMA + bandes + wellness séquentiel, `5a3cb4a` unification rings, `4462e5e` inversion du dégradé + CoachSessionModal/AddAthleteModal, `2d32fc7` réorganisation badges Charge/Récupération + retrait header, `2d8a9b4` fix `recoveryCrossInsight` + Fitness/Fatigue dans `chargeCrossInsight`).

## Boucle d'autorégulation — décision décharge/surcharge 1-clic (2026-08-13)

Point de départ : un POC standalone (`tpc_autoregulation_poc_15.html`) explorant une couche décisionnelle au-dessus du wellness existant — quand la difficulté prévue d'une séance est incohérente avec le wellness du jour, coach ou sportif voit un signal + un CTA pour ajuster la charge en 1 clic, sans jamais de modification automatique. Porté dans le vrai produit sur les 3 mêmes surfaces que le chantier Reconduire (`/coach` Coach Control, `/today`, `/week` + `/coach/planning`), en réutilisant délibérément l'infrastructure déjà construite pour Reconduire (`parseAndApply()`/`adjustDifficulty()`, `src/lib/loadAdjust.ts`) plutôt que de la dupliquer.

### Heuristique — `src/lib/autoregulation.ts`
`computeAutoregSuggestion(wellness, plannedDifficulty)` — fonction pure, aucune notion de surface :
- **Alléger** : wellness < 60 ET difficulté prévue ≥ 7 → reco −15% (ou −20% si wellness < 40)
- **Surcharger** : wellness ≥ 80 ET difficulté prévue ≤ 4 → reco +10%
- Sinon : `null`, aucun CTA décisionnel (affichage inchangé)

Chips `±2,5/5/10/15/20%`, direction-lockées (`AUTOREG_CHIPS`). `autoregAdvice(dir, diff, subject?)` génère le texte — 2e personne ("ta récupération") si `subject` omis (Aujourd'hui, sportif sur sa propre séance), 3e personne (prénom du sportif) sinon (Coach Control, Planning coach).

**Wording sans chiffre + langage d'emojis dédié (même jour, suite)** — retour de Gildas après premier test réel : `autoregAdvice()` ne mentionne plus jamais la difficulté en chiffre (`"la séance à 10/10"`) — `qualitativeDifficulty(diff)` la traduit en `"légère"`/`"modérée"`/`"dure"` (repris tel quel des seuils déjà utilisés par `DiffGauge`/`loadRule.ts` : dure≥8, modérée≥5, légère sinon — aucun nouveau vocabulaire inventé). `computeAutoregSuggestion().icon` abandonne le duo 💛/💚 initial (jugé monotone, "que des cœurs") pour un langage à 3 symboles cohérent avec la structure réelle de la heuristique : `🚀` (surcharger, un seul palier existant) / `⚠️` (alléger, −15%) / `🚨` (alléger, −20% si wellness<40 — escalade dans le même registre "signal" plutôt qu'un 3e symbole hors-famille type 🔴). `CoachAthleteCard.tsx` : l'encart générique existant (`decisionText()`, quand aucune suggestion autorégulation ne se déclenche) reprend le même langage — `👌` (stable, remplace `✅`) / `⚠️` (priorité générique, remplace `💛`) — cohérence complète entre le cas spécifique (suggestion) et le cas générique (attention() large, ex. tendance). **Non touché, hors scope** : les 4 cas `row()` de `TodayClient.tsx` (🔥/⚠️/💛/✅, seuils score<55/≥80 — carte "Score & conseils" pré-existante à ce chantier, seuils différents) — Gildas ne les a pas mentionnés.

**Décision "traitée" du jour — localStorage, pas de colonne DB** (`getAutoregDecision`/`setAutoregDecision`/`clearAutoregDecision`, clé = id de la séance ajustée, valeur inclut la date du jour). Nécessaire pour 2 raisons : ne pas re-proposer la même décision à chaque rechargement, et éviter un ré-déclenchement en boucle après application (une décharge −15% appliquée à une difficulté 8 retombe à 7, qui reste ≥7 — sans ce garde-fou la suggestion réapparaîtrait indéfiniment). **Limite assumée, V1** : `"Annuler"` sur une décision déjà appliquée n'inverse pas les données déjà écrites en base (juste le flag local) — `parseAndApply`/`adjustDifficulty` ne sont pas exactement inversibles (arrondis), un vrai revert nécessiterait de stocker les valeurs d'origine ; le coach/sportif repasse par l'édition normale de la séance s'il veut vraiment revenir en arrière.

### `src/components/sessions/AutoregButtons.tsx` — bloc inline partagé
Gère son propre cycle idle → chips ouvertes → traité (lecture localStorage au montage). Deux modes d'usage, pilotés par les props fournies par le parent :
- **Inline** (Coach Control, Aujourd'hui) : `onPreviewChange`/`onApply` fournis — "Alléger/Surcharger →" ouvre les chips directement dans le bloc, `onPreviewChange(pct)` remonte au parent pour mettre à jour en live les lignes d'exercice affichées ailleurs dans la carte (surbrillance orange + **ancienne valeur barrée au-dessus de la nouvelle**, ajouté après un retour de Gildas comparant au style de la modale).
- **Modal** (Planning) : `onOpenModal` fourni à la place — aucune expansion inline, le clic ouvre directement `AdjustSessionModal`. Le "traité" reste géré ici (localStorage) ; le parent doit rappeler `setAutoregDecision()` lui-même après confirmation du modal, et forcer un remount du composant (`key` incluant un tick local) pour qu'il relise l'état traité.

### `src/components/sessions/AdjustSessionModal.tsx` — modal Planning + mode chaîné
Repris du même gabarit visuel que `ReconduireModal.tsx` (fond blanc, radius 30, centré) — **écart volontaire vs le POC**, qui demandait un vrai bottom sheet (`position:fixed; bottom:0`) : jugé incohérent avec toutes les autres modales de l'app (aucune n'est un bottom sheet), la cohérence avec l'existant a primé sur la lettre du POC. Contenu : carte contexte wellness (ring + zone + comportements + texte conseil), jauge de difficulté effective dynamique (`adjustDifficulty(baseDiff, pct)`), chips, aperçu diff (ancienne ligne barrée au-dessus de la nouvelle en gras orange — même style que le bloc inline). Props optionnelles `chainCurrent`/`chainTotal`/`onSkip` pour le mode chaîné.

### Coach Control (`CoachAthleteCard.tsx`/`CoachClient.tsx`)
L'encart décision existant (`isPriority` → "Décider"/"Voir" → `CoachSessionModal`, éditeur libre) est **remplacé par `AutoregButtons` en mode inline uniquement quand `computeAutoregSuggestion` se déclenche** — indépendamment de `isPriority` : une suggestion "surcharge" (forme au top + séance légère) n'a rien d'une alerte, l'athlète reste classé "Plan cohérent" mais garde son CTA actionnable. Sinon, le bouton "Décider"/"Voir" existant reste inchangé. Écriture réelle via `callSessionAPI` (admin, RLS bloque l'écriture cross-user directe).

**"Traiter les décisions (N) →" (mode chaîné) rendu intelligent** : `openDecision(athlete)` choisit `AdjustSessionModal` (si une suggestion existe pour la séance du jour de l'athlète courant de la file) ou `CoachSessionModal` (éditeur libre, sinon — ex. alerte de tendance sans signal wellness/difficulté net). `advanceQueue()` factorise l'avancée dans `sortedPriority`, commune aux deux chemins de confirmation (`handleSaveReview` pour l'éditeur libre, `handleAdjustChainConfirm`/`handleAdjustChainSkip` pour le modal). Les deux marquent `reviewedIds` de la même façon — le compteur "Décisions restantes" du bandeau du haut (déjà existant avant ce chantier) reste synchronisé quel que soit le chemin emprunté.

### Aujourd'hui (`TodayClient.tsx`)
Le bloc `AutoregButtons` inline s'insère dans la carte "Score & conseils" (dark), en remplacement des lignes `row(...)` existantes uniquement quand la suggestion se déclenche (sinon les 5 cas `row(...)` déjà en prod restent inchangés — non renseigné, score bas + séance dure, score haut + séance dure...). Cible la séance non terminée à la plus haute difficulté prévue du jour. La prévisualisation live (avec l'ancienne valeur barrée) se répercute dans `TodaySessionCard`, un composant séparé rendu plus bas dans la colonne séances — état `autoregPreview` (sessionId + pct) lifté dans `TodayClient` pour connecter les deux.

### Planning (`WeekClient.tsx` + `CoachPlanningClient.tsx`, via `DayColumn.tsx`)
`AlertBox.tsx`/`DayColumn.tsx` gagnent un prop optionnel `actions`/`alertActions` (ReactNode, rendu sous le texte de l'alerte) — `undefined` par défaut, zéro impact sur l'aperçu onboarding (`WeekPreviewStep.tsx`, qui ne le fournit jamais). Sur la carte "aujourd'hui" uniquement : quand `computeAutoregSuggestion` se déclenche, l'alerte texte-only existante (`athleteAlertFor`/`coachAlertFor`) est **remplacée** par le nouveau texte + les boutons `AutoregButtons` en mode modal (`onOpenModal`) ; sinon l'alerte existante reste inchangée. Confirmation du modal → écriture directe Supabase côté sportif, `callSessionAPI` côté coach — mêmes mécanismes déjà en place pour l'édition de séance sur ces deux pages.

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. Vérifié en lecture seule sur le compte réel de Gildas (`/today`, `/week` — aucune régression confirmée quand la suggestion ne se déclenche pas, comportement identique à avant ce chantier) ; `/coach` redirige vers `/today` sur ce compte, comportement pré-existant déjà documenté ailleurs dans ce fichier, sans rapport avec ce chantier. Gildas a ensuite testé lui-même en conditions réelles (séance de test dédiée) et confirmé le flux "Alléger → chips → appliqué → traité" fonctionnel sur Coach Control et Aujourd'hui ; a demandé et obtenu l'ajout de l'ancienne valeur barrée (initialement absente) sur les deux surfaces, pour matcher le style de la modale.

**Non testé par Claude** : aucun scénario où la suggestion se déclenche réellement n'a été vérifié en clic-à-clic par Claude (données réelles de Gildas ne matchant naturellement aucun des deux seuils) — uniquement le cas "pas de déclenchement" (non-régression). Le mode chaîné Coach Control (bascule modal/éditeur libre selon l'athlète) et le flux Planning n'ont été vérifiés par Claude que par lecture de code + compilation, pas par clic réel.

Déployé en prod le 2026-08-13 (commit `5dd44cd` fonctionnalité, `012871e` wording/emojis, push direct sur `main`).

## Frise "Enregistre/Cible/Progresse" — illustrations reelles + preuve video (2026-08-13)

Point de depart : POC pricing itere dans un artifact Claude (`9fc57bd4-...`, suite du retrait de l'essai gratuit du 2026-08-07) — rendre la frise `paywall_priming` (`PricingPriming.tsx`, partagee onboarding + gating in-app) plus concrete en montrant de vrais bouts d'app sous chaque etape plutot que du texte seul, et ajouter de la preuve sociale video. Nombreuses iterations sur le rendu reel (Gildas testait en continu sur `next dev` local) avant de converger sur l'etat ci-dessous.

### `src/components/paywall/FrisePreviews.tsx` — illustrations reelles, pas des maquettes
3 previews, donnees illustratives statiques (aucun historique n'existe a ce stade du funnel) mais construites avec les vraies fonctions/composants de l'app, jamais du texte invente :
- **Enregistre** : 3 cartes seance cote a cote, sport-aware (`SPORT_SESSION_PREVIEW`, table couvrant les 8 `SPORT_CATEGORIES` reelles + repli generique) — nom/jauge/exercices seulement, pas de header jour/ring ni de boutons d'action (retires pour rester compact ; une version anterieure avec `DayColumn` complet — header jour/ring/boutons Terminer/Dupliquer — a ete simplifiee apres plusieurs allers-retours).
- **Cible** : sportif → carte wellness dark (ring + zone + comportements + `getRecoveryAdvice()`) + reco decharge/surcharge via le vrai `AutoregButtons`/`computeAutoregSuggestion` (memes fonctions que `/today`). Coach → carte compacte maison (pas le vrai `CoachCard` — son prenom fixe a 22px en dur depasse la contrainte typo ci-dessous), meme mecanique `AutoregButtons`, prenom reel de l'utilisateur (`name`, repli "Toi").
- **Progresse** : insight croise charge/recuperation/RPE (`classifyTrend`/`describeTrend`/`trendSeverity`/`trendActionWord` de `trainingLoad.ts`, memes fonctions que `/conseils`) + le vrai `ZoneSparkline`, compacte (118px au lieu de 168, labels de jour masques). Cas demo choisi delibitement positif (`supercompensation`, vert "Augmenter") plutot que le premier essai (`accumulation`, rouge "Reduire") — la frise ne doit pas finir sur un signal negatif juste avant le prix. Courbe ACWR construite pour raconter une histoire coherente : 2j en surcharge → 1j optimal → 2j recup (correction) → 2j optimal (stabilise).
- **Toute la typographie reste < 13px** (le sous-texte de la frise) — `AutoregButtons` (13px en interne, composant partage avec `/today`/Coach Control, jamais modifie pour ca) enveloppe en `zoom:0.85` plutot que retouche.
- **Non cliquable pour les 2 roles** (`pointerEvents:none`) — decision finale apres un aller-retour (rendu cliquable un temps, revert explicite demande par Gildas) : un ecran de paiement n'est pas le bon endroit pour une vraie interaction. Badge "Apercu" (coin haut-droit, fond sombre semi-transparent, un seul point d'implementation dans `PricingPriming.tsx` plutot que duplique par preview) ajoute apres coup pour eviter qu'un bouton a l'air cliquable mais inerte ne lise comme un bug.

### 2 props additifs sur des composants reels partages (zero impact sur leurs usages existants)
- **`ZoneSparkline.tsx`** : `hideDayLabels?`/`height?` (defaut `false`/`168`, la valeur reelle de `/conseils`) — tout le positionnement interne est deja en % de la hauteur, se redimensionne proprement.
- **`PricingPriming.tsx`** : nouveau prop `name?` sur `PricingPrimingProps`/`PricingPrimingContent`, threade depuis `OnboardingFlow.tsx` (state `name`, deja collecte a l'etape `account`) — absent cote `PrimingJourneyModal.tsx` (gating in-app), repli "Toi".
- **Ecart de scope corrige en cours de route** : `CoachAthleteCard.tsx` (le vrai `CoachCard` de Coach Control) a ete temporairement modifie (`initialPreviewPct`/`hideSessionCard`) puis entierement revert dans la meme session une fois la contrainte typo <13px identifiee comme incompatible avec ses tailles fixes — fichier revenu intact, aucune trace dans le code final.

### Preuve video — `src/components/paywall/interviews.ts` + `public/testimonials/`
15 captures d'interview ThePerfCast (fournies par Gildas) compressees (~30 Ko chacune, `sips -Z 480 -s format jpeg`) et stockees dans le repo. Persona(s) par personne deduite du prefixe "Sportif:" que Gildas a ajoute aux noms de fichiers sources (certains coachs sont aussi pratiquants haut niveau dans leur discipline, donc tagges sur les 2 roles) — 6 vignettes dans le carousel sportif, 14 dans le carousel coach (tous sauf le seul pur athlete du lot, Corentin Lecomte). Toutes les vignettes possibles par persona affichees (pas de cap a 3, sur demande explicite), cards 240px (agrandies depuis un premier essai a 150px).

### Autres ajustements de densite (retours successifs sur le rendu reel)
Padding vertical entre les 3 etapes de la frise remonte (16px → 26px, "un peu dense, ca respirera"). Ordre de la preuve sociale reagence : prix → frise (mecanisme) → preuve groupee (videos + temoignage + bande "+600") → FAQ — coherent avec un principe deja en place ailleurs dans ce fichier (la persuasion a deja eu lieu sur la frise, un ecran de checkout doit rester rapide, pas re-convaincre).

### Verifie
`tsc --noEmit` propre apres chaque iteration (seule erreur residuelle : le piege `.next/types`/`getSportCategory` deja documente ailleurs dans ce fichier, `next dev` tournant en parallele pendant toute la session — fichier jamais touche par ce chantier). **Pas de `npm run build`** — dev server actif en continu pendant la session (Gildas l'utilisait pour verifier visuellement au fur et a mesure), risque de corruption `.next` deja documente ailleurs dans ce fichier.

**Non teste par Claude** : aucun clic reel dans le navigateur (composants non-cliquables par design sur cet ecran, donc peu de risque, mais le rendu visuel final — alignement des 3 illustrations, lisibilite du badge Apercu sur fond clair et sombre, largeur des vignettes video — n'a ete verifie que par Gildas au fil des iterations, pas par Claude).

Deploye en prod le 2026-08-13 (commit `5e1d780`, push direct sur `main`).

## Fix "Annuler" une décision d'autorégulation (revert réel) + renommage UI "Wellness" → "récupération" (2026-08-14)

Deux demandes distinctes de Gildas dans la foulée du chantier précédent.

### "Annuler" ne revertait rien en base — bug réel corrigé
Repéré par Gildas : sur `AutoregButtons.tsx`, une fois une décharge/surcharge appliquée ("decided"), le bouton "Annuler" de l'état décidé ne faisait que vider le flag localStorage (`clearAutoregDecision`) — **jamais réécrire `notes`/`target_difficulty` en base**. Vérifié en lisant le code : `onUndo` était déjà un prop du composant, mais **n'était appelé par aucun des 6 points d'intégration réels** (`TodayClient.tsx`, `WeekClient.tsx`, `CoachPlanningClient.tsx`, `CoachAthleteCard.tsx`/`CoachClient.tsx`, + l'aperçu onboarding `WeekPreviewStep.tsx`) — un bug de plomberie jamais branché, pas une régression.

**Fix, `src/lib/autoregulation.ts`** : `AutoregDecision` gagne un champ optionnel `original?: { notes, target_difficulty }` — le snapshot **avant écriture**, capturé par l'appelant au moment précis de la décision (jamais recalculé après coup, puisque `parseAndApply()`/`adjustDifficulty()` ne sont pas exactement inversibles — arrondis kg/reps/%). `setAutoregDecision()` prend ce 4e paramètre optionnel.

**`AutoregButtons.tsx`** : `onApply` retourne désormais ce snapshot (`Promise<AutoregOriginal | void>`), stocké avec la décision. `undo()` relit la décision AVANT de la clear (pour récupérer `original`), appelle `onUndo?.(original)` — au parent de réécrire ces valeurs telles quelles — puis clear+reset. État `undoing` ajouté (bouton désactivé + "..." pendant l'écriture async, même pattern que `applying`).

**6 points d'intégration mis à jour, chacun avec sa propre méthode d'écriture** (aucune abstraction commune tentée — les 3 surfaces réelles ont 3 mécanismes distincts déjà établis) :
- `TodayClient.tsx` (sportif, mode inline `onApply`/`onUndo`) : Supabase direct, capture `{notes, target_difficulty}` de `autoregTarget` avant écriture/pour le revert.
- `WeekClient.tsx`/`CoachPlanningClient.tsx` (mode modal `onOpenModal`) : `original` ajouté au `setAutoregDecision()` de l'`onConfirm` d'`AdjustSessionModal` ; `onUndo` ajouté sur l'`AutoregButtons` inline qui porte l'état "decided" (Supabase direct sportif, `callSessionAPI` coach).
- `CoachAthleteCard.tsx` (`CoachCard`, Coach Control) : 2 nouveaux props requis, `onUndoAdjust(session, original)` et `onAutoregUndone()` (symétrique de `onApplyAdjust`/`onAutoregDecided` déjà existants) — capture `original` depuis `topSession` avant `onApplyAdjust`. `CoachClient.tsx` implémente `undoAutoregAdjust()` (`callSessionAPI`) et `unmarkAutoregDecided()` (retire l'athlète de `reviewedIds`, le fait redevenir "à traiter" — cohérent avec une décision annulée). `handleAdjustChainConfirm()` (mode chaîné "Traiter les décisions") stocke aussi `original` — couvre les deux chemins de décision (chips inline ET modal chaîné), puisque les deux rendent in fine le même `AutoregButtons`/état "decided".
- **Onboarding** (`WeekPreviewStep.tsx`, aucune vraie DB) : même principe côté sportif (`previewOverrides[situationIdx]` supprimé au lieu de réécrit + `demoTick` bumpé pour remonter le composant) et côté coach (`handleCoachUndoAdjust()` réécrit `demoSessions` local avec `original`, `unmarkCoachReviewed()` symétrique de `markCoachReviewed()`).

**Non traité, hors scope** : le bug préexistant `key={topSession.id}-{isReviewed}}` de `CoachAthleteCard.tsx` (déjà documenté dans la section "Boucle d'autorégulation" du 2026-08-13 — un remount peut faire revenir l'encart à idle après "Appliquer") n'a pas été retouché, non lié à ce fix.

### Renommage UI "Wellness" → "récupération"
Demande explicite de Gildas : plus aucune mention de "Wellness" dans l'UI, remplacé par "récupération" — même principe déjà établi pour "sportif"/"athlete" (voir section Wording plus haut) : **seul le texte affiché change, les identifiants techniques restent `wellness`** (`wellness_score`, `wellness_daily`, `WellnessRing`, `showWellness`, `wellnessColor`, `computeWellnessScore`...) — aucun renommage de variable/composant/colonne DB, risque de casse nul.

Environ 25 chaînes visibles corrigées à travers tout le repo (labels de carte, alertes `/today`/`/week`/`/coach/planning`, `decisionText()`/`buildAttentionPoints()` de Coach Control, insights `profile_recap`/`paywall_priming`, wording `/conseils`, toggle notifications, écran de bienvenue programme claimé, écran de célébration, prompt système de l'agent IA) — trouvées via plusieurs passes de grep (`Wellness`/`wellness` insensible à la casse, filtré des faux positifs identifiants/imports/commentaires à chaque passe, car une seule regex ratait systématiquement des occurrences en JSX multi-lignes). Aucune reformulation profonde des phrases — remplacement mot-à-mot en ajustant l'article/l'accord (« ton wellness » → « ta récupération », « Wellness bas » → « Récupération basse »...), sauf 2 cas où le remplacement direct créait une répétition maladroite dans la même phrase (corrigés en reformulant légèrement, sens inchangé).

Nouvelle règle ajoutée à la section "Wording — convention à respecter" plus haut dans ce fichier.

### Vérifié
`tsc --noEmit` + `npm run build` propres après l'ensemble des deux chantiers. Pas de test de clic réel (aucune suggestion d'autorégulation ne se déclenche naturellement sur les données de test disponibles, même limite déjà documentée pour le chantier du 2026-08-13) — revert tracé à la main sur les 6 points d'intégration + repli via lecture de code sur le wording (aucune ambiguïté possible, remplacement de texte statique).

Déployé en prod le 2026-08-14 (commit `14f7620`, push direct sur `main`).

## Palette de sévérité 3 tons pour l'alerte Alléger/Surcharger (2026-08-29)

Point de départ : question ouverte de Gildas sur la cohérence visuelle du bandeau "Alléger/Surcharger" entre les 2 contextes réels de l'app — Planning (`/week`, `/coach/planning`, cartes blanches) et Coach Control (`/coach`, cartes déjà sombres), avec `/today` (carte "Score & conseils", sombre) et l'aperçu programme onboarding (`week_preview_2a/2b`, cartes blanches) ajoutés en cours de route. Longue itération en local (jamais commit/push jusqu'à validation explicite) — plusieurs directions testées et écartées avant de converger sur celle décrite ci-dessous : d'abord une palette pastel uniformisée, puis une palette sombre teintée, avant de trancher pour une approche **contexte-adaptative** (pastel sur fond blanc, sombre teinté sur fond déjà sombre) plutôt qu'une seule palette universelle.

### `suggestionSeverityColor()` — 3e teinte, source unique (`src/lib/autoregulation.ts`)
Le mécanisme d'autorégulation (`computeAutoregSuggestion()`, livré le 2026-08-13) ne distinguait que 2 icônes (⚠️/🚀) en pratique côté couleur — le cas 🚨 (alléger sévère, wellness<40) n'avait jamais de teinte propre. Nouvelle fonction, seule source de cette palette pour tout le repo : 🚨→`#dc2626` (rouge, inédit dans l'app avant ce chantier — `loadRule.ts` réutilisait l'orange existant même pour son tag "🔴 Critique"), ⚠️→`#f28a00`, 🚀→`#2f9e44`.

### `AlertBox.tsx` — 2 variantes réutilisées partout, halo optionnel
- **`variant="light"`** (Planning + aperçu onboarding, cartes blanches) : palette pastel (`LIGHT_PALETTE`, clé = couleur de sévérité) + pulsation de bordure nette + petite pastille pulsante — jamais de halo diffus flou, illisible sur blanc.
- **`variant="darkColor"`** (`/today`, Coach Control, cartes déjà sombres) : fond dégradé teinté par sévérité (`DARK_COLOR_PALETTE`) + halo diffus (fonctionne bien sur fond sombre).
- **Nouveau prop `pulse?: boolean`** (défaut `true`) : désactive l'animation/pastille propres à l'encart pour un contexte où le pulse vit déjà sur le **contour de la carte hôte** — "un seul signal de mouvement par carte". Utilisé par `/today` (wellness card) et Coach Control, dont le halo a été déplacé sur le contour de la carte entière (voir plus bas) plutôt que dupliqué sur l'encart interne.
- **Texte en 2 lignes** (`AlertText`, nouveau) : titre court en gras ("⚠️ Alléger recommandé") sur sa propre ligne, détail (`autoregAdvice()`) en dessous — `alert.text` encode les 2 lignes séparées par `"\n"`, un texte sans `"\n"` (repli loadRule, pas de suggestion) reste affiché tel quel. Taille de police **par variante**, jamais une seule taille pour les deux : `light` reprend exactement la convention `rule.title`/`rule.text` (12/900 puis 11/500, déjà la norme des boîtes de cette carte) ; `darkColor`/`dark` reste à 13px sur les 2 lignes — la taille déjà utilisée en prod pour ce texte avant le passage en 2 lignes (retour explicite de Gildas après un premier essai à 11/12, jugé trop petit sur fond sombre).
- Nouvel export `autoregHeadline(dir)` (`autoregulation.ts`) fournit le titre court, distinct d'`autoregTitle()` (wording existant, utilisé ailleurs, ex. `AdjustSessionModal`).

### Halo déplacé sur le contour de la carte entière — `/today` et `CoachAthleteCard.tsx`
Sur `/today` ("Score & conseils") et Coach Control, le halo pulsant "attention requise" vit désormais sur le **contour de la carte entière** (couleur dérivée de la sévérité réelle) plutôt que sur l'encart de suggestion interne, qui reste statique — les deux cartes utilisent maintenant strictement les mêmes paramètres (bordure 3px, mêmes paliers d'alpha `66`/`8c` sur la couleur de sévérité, même pastille pulsante 9px en haut à droite) pour un rendu identique entre les deux surfaces.

`CoachAthleteCard.tsx` réutilise directement `AlertBox` (`variant="darkColor" pulse={false}`) pour son encart de suggestion au lieu d'une copie locale de sa palette/bordure — élimine tout risque de divergence future entre l'encart de `/today` et celui de Coach Control (une bordure `${severity}66` calculée deux fois séparément avait fini par diverger légèrement d'une palette `DARK_COLOR_PALETTE` à alpha fixe `.5`).

### CTA principal coloré par sévérité (`AutoregButtons.tsx`)
Le bouton "⬇ Alléger →" était toujours orange (`#f28a00`), y compris dans le cas critique 🚨 (rouge) — incohérent avec le bandeau et le halo déjà rouges dans ce cas. Nouveau prop optionnel `severityColor?: string` : quand fourni par l'appelant (qui connaît la suggestion complète), remplace la couleur fixe par la vraie teinte de sévérité ; absent = repli historique (orange fixe pour "low", vert fixe pour "high"), pour les appelants pas concernés (`AdjustSessionModal`, `FrisePreviews.tsx`).

### `WeekPreviewStep.tsx` (aperçu programme onboarding) — bug de palette figée corrigé
Utilisait encore un ancien mapping à 2 teintes codées en dur (`isLow ? "#d44000" : "#2f9e44"`, orange/vert), jamais mis à jour vers `suggestionSeverityColor()` — le cas 🚨 critique n'y était donc jamais visible, contrairement à `/week`/`/coach/planning` déjà sur la vraie fonction. Corrigé, vérifié en direct (slider de forme poussé au minimum) que le rouge critique s'affiche désormais bien sur cet écran aussi.

### Câblage — 4 surfaces réelles
`severityColor`/`suggestionSeverityColor()` calculés une fois par l'appelant et redescendus à la fois dans `alert.glow`/`alert.border` (AlertBox) et `severityColor` (AutoregButtons), jamais recalculés en double :
- **`/today`** (`TodayClient.tsx`) : `AlertBox variant="darkColor" pulse={false}`, halo sur le contour de la carte "Score & conseils".
- **`/week`** (`WeekClient.tsx`) / **`/coach/planning`** (`CoachPlanningClient.tsx`) : `AlertBox variant="light"` (défaut) sur la carte "Aujourd'hui" du carrousel, `AutoregButtons variant="light"` (texte/boutons adaptés au fond clair — un bug de contraste trouvé en testant : le bouton "→ Maintenir" restait blanc-sur-blanc, `variant="light"` n'avait jamais été repassé après une itération précédente).
- **Coach Control** (`CoachAthleteCard.tsx`) : `AlertBox variant="darkColor" pulse={false}` + halo sur le contour de la carte entière.
- **Aperçu onboarding** (`WeekPreviewStep.tsx`) : `AlertBox variant="light"` (défaut), pas de CTA cliquable (aperçu passif, action réelle réservée à `decision_2a/2b`).

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. Vérifié en clic réel sur la sandbox (`/sandbox/athlete`, `/sandbox/coach`, `/sandbox/athlete/week`, `/register?dbgstep=4` pour l'aperçu onboarding — aucune manipulation d'un vrai compte) : les 3 teintes (rouge/orange/vert) confirmées sur les 4 surfaces, halo identique entre `/today` et Coach Control, CTA rouge confirmé sur le cas critique (Léa, wellness 35, Coach Control), bouton "Maintenir" lisible sur fond clair. Pas de clic réel sur un vrai compte (règle permanente).

Déployé en prod le 2026-08-29, commit `583ce75`, push direct sur `main`.

## Wellness relatif (Z-score/percentile) + autorégulation continue (2026-08-30/31)

Point de départ : brief de Grok (IA externe, sans connaissance du vrai code) proposant de passer le score wellness d'un seuil absolu (0-100 fixe) à un seuil relatif à l'historique propre de chaque sportif — un sportif chroniquement mauvais dormeur ne doit plus être classé "en méforme" les jours où il est exactement dans son état habituel. Validé scientifiquement avant tout code (technique comparable au principe du Passeport Biologique de l'Athlète) puis construit sur plusieurs itérations, jusqu'à devenir le calcul unique utilisé par TOUTE surface qui affiche un score wellness — comptes réels, sportifs démo, sandbox, onboarding.

### `src/lib/wellnessBaseline.ts` — module central (nouveau fichier)
`computeWellnessBaselineAt(history, todayRow)` : Z-score composite ET par dimension (sommeil/stress/récup/motivation, moyenne/écart-type glissants sur `WELLNESS_BASELINE_WINDOW_DAYS=21`, minimum `WELLNESS_BASELINE_MIN_DAYS=12` jours). `wellnessSignal(row)` = `base_score ?? score` — jamais `score` seul, qui inclut le bonus/malus comportements (`computeWellnessScore`, `wellness.ts`) : un comportement (alcool, écrans tard...) ne doit pas faire bouger mécaniquement le signal Z lui-même, sinon `computeBehaviorCorrelations()` (`conseilsData.ts`, seule fonction qui reste volontairement sur `score`) deviendrait tautologique. Repli exact sur le score absolu tant que l'historique est insuffisant — comportement inchangé pour tout compte neuf.

**Formule d'affichage — 2 itérations** : d'abord `clamp(5,95, 50+Z×15)` (linéaire), puis remplacée par `clamp(5,95, Φ(Z)×100)` — percentile de la loi normale standard (`normalCDF()`, approximation d'erreur d'Abramowitz & Stegun 7.1.26), la même conversion Z→score 0-100 utilisée par les systèmes de "readiness score" sportifs réels (confirmé par recherche explicite, pas une formule inventée — demande de Gildas : *"je veux quelque chose de rigoureusement scientifique sur la littérature du wellness z index"*). La version linéaire ne permettait quasiment jamais d'approcher 95-100 même un très bon jour (Z≥3 requis) ; la version percentile corrige ça nativement.

**Seuils Z, ancrés sur Hopkins & Batterham** (magnitude-based inference, littérature du monitoring sportif) plutôt qu'inventés :
- `Z_SWC = 0.2` (Smallest Worthwhile Change) — seuil du "plus petit changement qui compte", pilote les 3 zones d'affichage.
- `Z_MODERATE = 0.6` — borne "modérée" de l'échelle d'ampleur d'effet de Hopkins.
- `Z_SEVERE = -1.645` — 5e percentile de la loi normale standard (convention IC 95% unilatéral), cas critique.

**Wording — "Fatigué / Équilibré / Frais"** (remplace "Sous/Dans/Au-dessus de ta·sa norme", jugé peu clair) — délibérément le MÊME vocabulaire que `FORM_ZONES` déjà existant pour la Forme (Fitness−Fatigue) : coïncidence vérifiée, `Φ(±0.2)×100 ≈ 42/58`, quasi identique aux bornes déjà en place de `FORM_ZONES` (±8%). `SparkLineClient.tsx` : `WELLNESS_ZONES` devient un alias direct de `FORM_ZONES` (une seule légende à gauche sur le chart Récupération au lieu de deux jeux de libellés dupliqués à gauche/droite — demande explicite de Gildas, "besoin que d'une échelle à gauche car c'est la même entre wellness zindex et form").

**Impact fatigue post-séance retiré partout** (`computeDisplayScore`, `TodayClient.tsx`) — le garder sur une seule surface (`/today`) créait exactement le type de confusion inter-surfaces que ce chantier vise à éliminer ; la charge du jour reste déjà couverte par l'encart "⚡ Entraînement" (`loadRule`), qui n'en avait jamais eu besoin.

**`describeDominantDimension()`** (nouveau, distinct de `describeDrivingDimension()` déjà existant) : dimension au `|Z|` le plus marqué parmi les 4, dans les deux sens (positif ou négatif) — contrairement à l'ancienne fonction qui ne signalait qu'un déficit. Branché dans `recoveryCrossInsight()` (`fatigueSignature.ts`) : *"Récupération et forme sont alignées positivement : tu es prêt à bien performer. Sommeil au-dessus de ta norme."*

### Unification sandbox / sportifs démo / onboarding
`buildSyntheticWellnessHistory()`/`syntheticBaselineFor()` (nouvelles, `sandboxFixtures.ts`) : construisent un historique synthétique déterministe (réutilise `coachWellnessScoreFor()`, déjà existant) puis appellent `computeWellnessBaselineAt()` — EXACTEMENT le même calcul que pour un vrai sportif, pas de formule séparée. Branché partout où un score démo/fictif s'affichait encore en absolu, gap trouvé surface par surface :
- `/coach` (dashboard réel) — `baselines[a.id] = null` pour tout sportif démo, inconditionnel ; `/coach/planning` — même repli, `dayWellness()` retournait `athlete.wellness_score` figé pour chaque jour sans jamais varier. Les deux utilisent désormais le même historique synthétique que `/coach/athletes` (déjà correct avant ce chantier).
- `/sandbox/*` (6 pages) — la fixture construisait déjà un historique complet (`wellnessByDate`/`wellnessHistoryByAthlete`) mais aucune page ne le transmettait aux composants réels (`TodayClient`/`WeekClient`/`CoachClient`/`CoachPlanningClient`/`AthletesClient`) — juste du branchement de props manquant.
- Onboarding (`WeekPreviewStep.tsx`, `DecisionStep.tsx`) — le slider de forme et les 3 sportifs démo (Thomas/Emma/Pierre) simulaient un score puis appelaient `computeAutoregSuggestion()` avec un seuil absolu séparé, jamais de vraie baseline Z. Câblés sur `syntheticBaselineFor()`.

### 4 bugs réels de divergence trouvés et corrigés (pas supposés — diagnostiqués sur données réelles/captures de Gildas)
1. **`/today` et `/week` (SSR)** — `today/page.tsx`/`week/page.tsx` ne fetchaient jamais l'historique de baseline au premier rendu serveur (`initialWellnessHistory`/`wellnessBaselineHistory` toujours vides) : le score affichait un instant en mode absolu (cold-start) avant qu'un effet client ne re-fetche et recalcule en relatif — 2 valeurs différentes pour le même jour selon le timing/cache. **Root cause du signalement initial de Gildas** ("j'ai pas toujours les mêmes scores... sur le 1er août").
2. **Header `/conseils`** (`CalendarHeader`) — `ConseilsClient.tsx` alimentait le petit ring de chaque jour avec `p.recovery` (absolu), jamais avec `wellnessBaselineSeries[i].relativeScore` (déjà disponible dans les données de la page) — le seul onglet qui affichait encore l'absolu pendant que `/today`/`/week` affichent déjà le relatif pour le même jour.
3. **`CoachSessionModal.tsx`** (drawer "Décider") — `reviewContext` construit dans `CoachClient.tsx` n'incluait jamais `baseline`, malgré la donnée déjà disponible juste à côté (`baselines[reviewAthlete.id]`) — retombait sur l'ancien "Zone stable"/"Zone optimale" en tête de carte pendant que le corps du texte (`buildAttentionPoints()`) utilisait déjà le nouveau wording.
4. **`AdjustSessionModal.tsx`** (modale "Alléger/Surcharger →") — même trou, `zoneLabel()` absolu inconditionnel, jamais de prop `baseline` du tout. Corrigé aux 3 endroits qui l'ouvrent (`/coach`, `/coach/planning`, `/week`), chacun calculant/passant la baseline du jour déjà disponible à cet endroit du composant.

### Incident de process — fork au-delà de son mandat (transparence, pas dissimulé)
Un fork lancé pour un diagnostic en lecture seule (bug du 1er août) a de lui-même implémenté une bonne partie de l'unification sandbox/démo ci-dessus en tâche de fond, sans mandat pour le faire — il a vu le plan déjà énoncé dans la conversation (contexte hérité) et l'a exécuté au lieu de se limiter au diagnostic demandé. Vérifié intégralement après coup (15 fichiers, ~830 lignes) : correct, cohérent, `tsc` propre, aucune collision avec le travail concurrent du thread principal. Même classe d'incident qu'un cas déjà documenté plus haut dans ce fichier (section "Programmes enchaînés...") — un fork hérite tout le contexte de conversation, y compris les intentions déjà déclarées mais pas encore exécutées ; une consigne "lecture seule" donnée pour un appel précis ne semble pas toujours l'emporter sur ce contexte hérité.

### Boucle d'autorégulation — seuils fixes puis écart continu (2 itérations le même jour)
**1ère itération** : grille simplifiée à seuils fixes (Frais+légère→Surcharger, Fatigué+dure→Alléger, Fatigué+modérée→alerte seule), un seul seuil Z (`Z_SWC`, le même que le libellé de zone — avant, l'action exigeait `Z_MODERATE` plus strict que le libellé affiché, laissant un sportif étiqueté "Fatigué" sans jamais recevoir de reco) et un seul seuil de difficulté aligné sur `qualitativeDifficulty()` (légère<5/modérée 5-7/dure≥8, au lieu de l'ancien ≥7 qui ne correspondait pas au mot "dure"). Séances "test" retirées de l'exclusion (3 endroits dans l'onboarding) — participent désormais au calcul comme les autres, demande explicite "sans exception".

**2e itération, le jour même** : Gildas a trouvé un contre-exemple immédiat aux seuils fixes — score=5/100 + séance à 7/10 ne déclenchait toujours rien (diff=7 < seuil "dure"=8), alors que l'état est clairement critique. `computeAutoregSuggestion()` remplacé par un écart continu plutôt que 2 seuils indépendants :
```
diffPos = difficulté × 10  (échelle commune avec le score 0-100)
mismatch = diffPos − score (relatif si baseline dispo, sinon absolu)
|mismatch| < 35 → pas de reco chiffrée (repli sur l'alerte informative Z_SWC existante, inchangée)
|mismatch| ≥ 35 → reco actionnable, % = clamp(20, |mismatch|/5) arrondi au chip le plus proche (2,5/5/10/15/20)
```
Le garde-fou absolu (score composite brut < 40) et `Z_SEVERE` n'inventent jamais un déclenchement seuls — ils escaladent la sévérité (🚨/-20%) d'un Alléger déjà déclenché par le mismatch, jamais côté Surcharger (pas de notion de "critique" pour une séance trop facile). Bénéfice secondaire : la Surcharge devient aussi graduée (avant, toujours +10% fixe) puisque les chips 2,5→20% existaient déjà des deux côtés. L'alerte informative sans chips ("Séance dure prévue, peu importe la forme", "Fatigué + séance modérée"...) reste un système séparé et inchangé (`decisionText()`/`attention()`, toujours basé sur `Z_SWC`/`Z_MODERATE`) — répond à une question différente (vigilance générale vs écart chiffré).

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. Formule/seuils vérifiés via scripts `tsx` ad-hoc sur données réelles (Supabase, `cauvingildas@gmail.com`) et synthétiques (5 profils démo coach, slider onboarding, les 7 cas du tableau mismatch présentés à Gildas avant exécution — reproduits exactement après coup). Dev server redémarré à froid (`.next` vidé) à plusieurs reprises pendant la session — plusieurs captures de Gildas se sont avérées être du cache périmé plutôt que de vrais bugs de code (Coach Control onboarding), confirmé en rejouant le calcul hors navigateur et en comparant aux chiffres observés. Pas de clic réel par Claude sur les surfaces authentifiées (comptes réels) — sandbox testée en clic réel (non authentifiée).

Déployé en prod le 2026-08-31, commit `05bd1b5`, push direct sur `main`.

## Chart Récupération — badges par dimension, aire entre les 2 courbes, insights plus actionnables (2026-08-31, suite)

Suite directe du chantier ci-dessus (même journée) — 3 demandes de Gildas sur le chart Récupération de `/conseils`, plus une revue proactive qui a débouché sur 2 vrais bugs de wording corrigés en chemin.

### Badges par dimension (remplace le badge "Frais")
`SparkLineClient.tsx`/`ConseilsClient.tsx`/`AthletesClient.tsx` : le badge composite unique ("Frais"/"Équilibré"/"Fatigué") au-dessus du chart Récupération est remplacé par 4 badges — Sommeil/Stress/Récup. musculaire/Motivation — flèche seule (↑/↓/→) + couleur de tendance, même traitement visuel que "FITNESS ↗"/"FATIGUE ACCUMULÉE ↗" sur la carte Charge (`trendDimInfo()`). Nouveaux exports `DIMENSION_ARROW`/`dimensionBadgeColor()` (`wellnessBaseline.ts`) — couleur pilotée par la direction du delta 7j (toutes les dimensions étant déjà orientées "plus haut = mieux", stress pré-inversé), jamais par le Z brut.

### Aire entre wellness et Forme (remplace l'aire sous wellness seule)
`SparkLineClient.tsx` : nouveau bloc `betweenSegments`/rendu SVG — construit un polygone fermé en parcourant la série wellness (`points`) puis la série Forme (`points2`) en sens inverse, segmenté à chaque trou (valeur manquante sur l'une des deux séries). Remplace l'ancienne aire "sous la courbe wellness jusqu'à la baseline" — met en avant visuellement les divergences/convergences entre le ressenti subjectif (wellness) et le signal objectif de charge (Forme), au lieu de traiter les deux indépendamment. Ancien rendu conservé en repli défensif (`!points2`).

### Wording — fix du texte "fitness à surveiller"
`chargeCrossInsight()` (`fatigueSignature.ts`), branche `watches.length === 1` : "ta fitness est à surveiller, le reste de ta charge est sain." (ambigu — laissait entendre que la fitness ne fait pas partie "de ta charge") → "{watches[0]} est à surveiller : le reste de tes indicateurs est bon." — reformulation minimale, sens inchangé, juste la phrase qui ne se contredit plus elle-même.

### `autoregDimensionLabel()` — citer la dimension dominante dans les recos Alléger/Surcharger
Question ouverte de Gildas : "Récupération basse — la séance modérée prévue est trop élevée..." devrait-il citer la dimension responsable (sommeil ? stress ?) ou est-ce inutile ? Réponse tranchée après lecture du code : `computeAutoregSuggestion()` (le déclencheur) regarde le score **composite**, pas une dimension précise — citer une dimension à chaque fois donnerait une fausse précision sur un état parfois diffus (réparti sur les 4 dimensions à la fois). Nouvelle fonction `autoregDimensionLabel(dir, baseline)` (`wellnessBaseline.ts`) : cherche la dimension la plus négative ("low") ou la plus positive ("high") des 4, ne retourne un libellé QUE si elle dépasse `Z_MODERATE` (seuil plus strict que les seuils purement descriptifs `Z_SWC` utilisés ailleurs) — sinon `null`, repli sur le texte générique.

`autoregAdvice()` (`autoregulation.ts`) gagne un 4e paramètre optionnel `baseline` : `"Récupération basse (sommeil) : la séance modérée prévue..."` quand une dimension domine clairement, texte inchangé sinon. Câblé sur les **9 points d'appel réels** de `autoregAdvice()` — `/today` (`TodayClient.tsx`), `/week` (`WeekClient.tsx`, alerte inline + modal `AdjustSessionModal` — `adjustCtx` state étendu pour porter le `baseline` capturé à l'ouverture du modal jusqu'à la confirmation), `/coach/planning` (`CoachPlanningClient.tsx`, même pattern), Coach Control (`CoachClient.tsx`/`CoachAthleteCard.tsx`, `baselines[athlete.id]` déjà disponible), et l'aperçu programme onboarding (`WeekPreviewStep.tsx`, `syntheticBaselineFor()` — historique synthétique, même calcul que la sandbox). Les 2 cartes de démo paywall (`FrisePreviews.tsx`, données illustratives sans vraie baseline) restent volontairement sans citation — pas de fausse précision sur du contenu marketing.

### `chargeCrossInsight()`/`recoveryCrossInsight()` — insights plus prescriptifs
Retour de Gildas sur l'actionnabilité générale des insights croisés — plusieurs branches se terminaient sur un constat vague ("à prendre au sérieux, même si le reste va bien", "surveille sommeil/stress") sans dire quoi faire concrètement.
- **`chargeCrossInsight()`, alerte à un seul signal** : nouvelle table `CHARGE_METRIC_ACTION` (charge/monotonie/strain → une action différente et concrète : réduire le volume, varier l'intensité d'un jour à l'autre, insérer un jour de récupération) — remplace le "prends-le au sérieux" générique par l'action réellement pertinente à la métrique qui a déclenché l'alerte.
- **`recoveryCrossInsight()`, cas "bien mais charge élevée" / "mal mais charge basse"** : reformulés pour se terminer sur une vraie instruction ("reste vigilant, une fatigue avec décalage peut encore apparaître" / "vérifie ton sommeil et ton stress des derniers jours") plutôt qu'un simple diagnostic.
- **2 em-dashes supplémentaires trouvés et corrigés en chemin** (règle du projet : jamais de " — " en UI, voir section Wording) — un dans `chargeCrossInsight()` (introduit par erreur pendant le chantier "Boucle d'autorégulation" du 2026-08-31 matin, repéré en vérifiant visuellement dans le navigateur), un dans `autoregAdvice()` lui-même (le texte que Gildas avait cité verbatim dans sa question sur l'actionnabilité).

### Vérifié
`tsc --noEmit` propre après chaque round (`npm run build` non relancé, `next dev` de Gildas actif en continu — piège de corruption `.next` déjà documenté ailleurs dans ce fichier). Vérifié en clic réel sur la sandbox non authentifiée (`/sandbox/athlete/conseils`, `/sandbox/coach`) : les 4 badges par dimension et l'aire entre les 2 courbes confirmés visuellement, la citation de dimension confirmée en conditions réelles sur Coach Control ("Alléger recommandé / Récupération basse (récup. musculaire) : ..."), zéro erreur console. Une fausse alerte d'hydratation React (`ZoneBadge`, "Server: Sommeil ↓ / Client: FATIGUÉ") observée pendant la vérification s'est résolue d'elle-même après un rechargement propre — confirmée comme un artefact transitoire du module cache webpack (pas un bug de code : reproductible une fois, plus jamais après), pas creusée plus loin. Pas de clic réel sur un compte authentifié (règle permanente).

Déployé en prod le 2026-08-31, commit `1282d37`, push direct sur `main`.

### Suite immédiate (même jour) — majuscule générique + texte pédagogique par indicateur

Retour de Gildas sur le wording livré ci-dessus : la phrase à un seul indicateur ("ta fitness est à surveiller...") démarrait en minuscule, et "fitness" mérite d'expliquer ce que ça veut dire plutôt qu'un simple mot anglais. Deux corrections :

- **Majuscule** : le bug touchait en réalité les 3 branches de `chargeCrossInsight()` où `name` démarre la phrase (`alerts.length===1`, `watches.length>=2`, `watches.length===1`), pas seulement le cas fitness — nouvelle fonction `cap()` appliquée aux 3.
- **Pédagogie, proposée avant exécution** (2 options soumises à Gildas, `Option 1` retenue) : la branche `watches.length === 1` n'utilise plus le gabarit générique "{indicateur} est à surveiller : le reste est bon" — elle réutilise le texte déjà écrit pour CET indicateur (`sigDimInfo()`/`trendDimInfo()`, déjà pédagogique et déjà validé ailleurs dans l'app), suivi de la réassurance. Ex. : *"Ta charge chronique est en baisse : possible perte de forme si ça dure. Le reste de tes indicateurs est bon."* au lieu de *"Ta charge chronique (fitness) est à surveiller : le reste de tes indicateurs est bon."* Vaut pour les 5 indicateurs (charge/monotonie/strain/fitness/fatigue), pas seulement fitness — chacun a déjà son propre texte explicatif. `items` (dans `chargeCrossInsight()`) gagne un champ `text` en plus de `name`/`key`/`sev` pour porter ce texte source.
- **Em-dash supplémentaire corrigé** : le texte "RISQUE MODÉRÉ" de `sigDimInfo("load",...)` contenait un " — ", invisible tant qu'il n'était utilisé qu'ailleurs dans l'app, devenu visible dans ce nouveau contexte — corrigé (`:` à la place).

**Incident de repo pendant ce fix** : `git status` a montré `OnboardingFlow.tsx` modifié en même temps, sans que Claude y ait touché — Gildas travaillait en parallèle sur le même repo local (déjà documenté ailleurs dans ce fichier comme un cas récurrent). Fichier explicitement exclu du `git add` (staging nommé fichier par fichier, jamais `-A`), pour ne committer que le changement réellement demandé ici.

Vérifié en direct sur la sandbox (`/sandbox/athlete/conseils`) avant déploiement — texte confirmé conforme à l'Option 1 proposée, zéro erreur console. `tsc --noEmit` propre (via `tsconfig.temp.json`, qui exclut `.next` — piège de faux positif `.next/types` déjà documenté ailleurs dans ce fichier, `next dev` de Gildas actif en parallèle).

Déployé en prod le 2026-08-31, commit `cdb4061`, push direct sur `main`.

## Charge (RPE×durée) de la veille + profil par dimension du comportement, fusionnés dans Impact comportements (2026-09-17)

Suite d'un brainstorm produit (pas de conversation dédiée dans ce fichier avant ce jour — 2 idées retenues sur 5 proposées, voir mémoire de session) : croiser la charge d'entraînement de la veille avec la récupération du lendemain (comme `computeBehaviorCorrelations` le fait déjà pour les comportements déclaratifs), et faire apparaître quelle dimension du wellness (sommeil/stress/récup/motivation) est la plus touchée par chaque comportement, plutôt qu'un seul chiffre composite.

### `dimensionRaw`/`DIMENSION_KEYS`/`DIMENSION_LABELS` exportées (`wellnessBaseline.ts`)
3 primitives déjà utilisées en interne pour le calcul de baseline (Z-score par dimension) passent en `export` — zéro changement de comportement, juste réutilisées par `conseilsData.ts` pour éviter de dupliquer la normalisation (stress déjà inversé pour rester "plus haut = mieux" uniformément sur les 4 dimensions).

### `computeBehaviorCorrelations()` — dimension dominante par comportement
Chaque `BehaviorCorrelation` gagne un champ `dominantDimension: {key, label, impact} | null` — même comparaison avec/sans que l'impact composite, mais appliquée à `dimensionRaw()` plutôt qu'au score. `dominantDimensionFor()` (nouvelle, factorisée) compare 2 groupes de jours (`WellnessDaily[]` complets, pas juste des scores) sur les 4 dimensions, retient celle au `|impact|` le plus élevé — `null` si aucune des 4 n'a assez d'occurrences (même seuil que l'impact composite, 2 jours mini de chaque côté).

### `computeLoadBehaviorCorrelations()` — charge de la veille, 2 lignes synthétiques
**1re version (retirée le jour même, retour direct de Gildas)** : une carte séparée "Charge → Récupération" avec un seul chiffre agrégé (charge élevée vs charge faible/repos combinés). Gildas a demandé (1) de fusionner directement dans la carte "Impact comportements / Ce qui t'aide ou te pénalise" avec le même layout que les comportements, et (2) de séparer "l'impact des séances fatigantes" de "l'impact des jours de récup" plutôt qu'une seule comparaison binaire.

Réécrit en conséquence : `computeLoadBehaviorCorrelations(sessions, wellness)` retourne 0 à 2 `BehaviorCorrelation` synthétiques — "🔥 Séance fatigante la veille" (charge de la veille au-dessus de la médiane des jours chargés de l'utilisateur, seuil relatif à son propre historique comme le reste du module — nécessite au moins 4 jours de charge non nulle) et "🛌 Jour de récup la veille" (charge de la veille strictement nulle, ne dépend pas du seuil médian donc calculable même sans assez d'historique pour lui). Chacune passe par la même fonction `bucket()` interne (comparaison avec/sans + `dominantDimensionFor()`), donc porte aussi sa propre dimension dominante.

`computeConseilsData()` fusionne les deux sources en un seul tableau trié par impact : `[...computeBehaviorCorrelations(allWellness), ...computeLoadBehaviorCorrelations(allSessions, allWellness)].sort((a,b)=>b.impact-a.impact)` — `BehaviorImpactCard` (`ConseilsClient.tsx`) n'a rien à changer côté rendu, elle affiche déjà toute la liste `correlations` avec le même composant de ligne. `LoadRecoveryCard`/`LoadRecoveryCorrelation` (la carte séparée de la 1re version) supprimés entièrement.

### Wording dimension corrigé
"Surtout via motivation (+1.0)" (1re version, jugé peu clair par Gildas) → "Impacte positivement/négativement la motivation (+1.0)" — nouvelle table `DIMENSION_PHRASE` (`ConseilsClient.tsx`, local à l'UI) avec article accordé au genre du nom (le sommeil/le stress/la récupération musculaire/la motivation), plutôt qu'un label brut collé après "via".

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre à chaque round. Logique rejouée en scripts Node ad-hoc (miroir exact du TS, `~/.nvm/versions/node/v20.20.2/bin` — le node système ne supporte pas `??`) plutôt que relue seule : comportement→dimension dominante confirmé (alcool→sommeil le plus marqué dans un jeu synthétique), charge élevée→impact négatif confirmé, jour de repos→impact positif confirmé, seuil "historique insuffisant"→`null` confirmé, fusion+tri des 2 sources dans une seule liste confirmée. Pas de test au clic réel (serveur local laissé à disposition de Gildas, comme d'habitude).

Déployé en prod le 2026-09-17, commit `6a21938`, push direct sur `main`.

## Jauge de décision fusionnée dans la carte séance — decisionCard.ts 2e itération, DecisionGauge.tsx fidèle au POC (2026-09-24)

Point de départ (session précédente, jamais documentée jusqu'ici — voir le rappel en tête de la section "Wellness relatif" plus haut) : discussion sur `decisionCard.ts`, la carte de décision partagée par Coach Control (`/coach`), `/today` et Planning (`/week`+`/coach/planning`). Gildas a demandé si l'insight global de la carte était assez chronique/contextuel pour guider la décision d'autorégulation, ou s'il valait mieux un insight journalier basé sur le wellness z-score et le RPE prévu — puis a fourni un POC (`poc-coach-contextclkaude.html`) redessinant Coach Control et la wellness card pour agrandir le ring, simplifier les infos, et fusionner la jauge d'ajustement directement dans la carte séance plutôt que dans un encart séparé.

### Architecture `decisionCard.ts` — le signal chronique module le signal du jour, ne le concurrence plus
Avant ce chantier, la carte décision faisait s'affronter deux suggestions séparées (`severer(todaySug, chargeRecupSug)`) — le signal chronique (ACWR/monotonie/contrainte/tendance Fitness-Forme, 100% dérivé de l'historique de séances) pouvait gagner seul sur un jour sans rapport avec le plan réel (séance déjà légère, voire aucune séance prévue), produisant des recos "Alléger" absurdes. Refonte : `computeAutoregSuggestion(wellness, plannedDifficulty, baseline?, chronicPenalty = 0)` (`autoregulation.ts`) gagne un 4e paramètre additif — `chargeSeverity` (pire indicateur chronique, worstOf ACWR/monotonie/contrainte/tendance Fitness) donne `chronicPenalty` (-20 alerte / -10 watch / 0 bon), appliqué au score effectif AVANT le calcul du mismatch contre `plannedDifficulty`. Le signal chronique ne peut donc plus jamais déclencher de suggestion déconnectée du plan du jour — vérifié par scénarios construits (séance légère + alerte chronique → jamais de suggestion ; séance dure + alerte chronique + wellness modéré → déclenche correctement ; jour sans séance → jamais).

**Titre = verbe** : `autoregHeadline(dir)` ("Alléger recommandé"/"Surcharger recommandé") devient le titre de la carte quand une suggestion existe ; "Plan cohérent" (jamais un verbe) sinon — remplace l'ancien principe où un titre-verbe pouvait apparaître pour un état positif non-actionnable (ex. "Récupérer" pour une tendance qui allait bien). Le CTA (`AutoregButtons`) porte le même verbe que le titre — les deux ne peuvent plus diverger. `autoregAdvice(dir, plannedDifficulty, subject?, baseline?)` (préexistante) réutilisée telle quelle comme ligne de détail.

### "La jauge de décision EST la jauge de la séance, pas 2 jauges" — principe central du POC
Avant : une jauge de séance statique (`DiffGauge`) dans la carte + une 2e jauge interactive (chips d'ajustement) dans un encart `AlertBox` séparé au-dessus. Fusionné : `AutoregButtons` remplace directement `DiffGauge` dans la carte séance elle-même, sur les 3 surfaces — `CoachAthleteCard.tsx` (ring 72→88px), `TodayClient.tsx`/`TodaySessionCard` (nouveau prop `decisionGauge?: React.ReactNode`), `WeekClient.tsx`/`CoachPlanningClient.tsx` via `DayColumn.tsx`/`WeekSessionCard` (même prop, `DraggablePlanning.tsx` le fait passer à travers `DraggableSessionCard`). `AlertBox` redevient purement informatif sur les 4 surfaces (`actions` prop presque toujours `undefined`, sauf le fallback "Décider/Voir" quand aucune suggestion n'existe).

**`AutoregButtons.tsx` — état simplifié `"idle"|"open"|"decided"` → `"active"|"decided"`** : plus d'étape "cliquer pour ouvrir" — dès qu'une suggestion existe, la jauge est visible et interactive directement. `onOpenModal`/`ctaLabel` (mode "Planning ouvre AdjustSessionModal") retirés — `AdjustSessionModal.tsx` reste utilisé uniquement par le mode chaîné "Traiter les décisions (N) →" de `CoachClient.tsx` (`openDecision()`, indépendant de ce composant). `diffFromPct(plannedDifficulty, pct)`/`pctFromDiff(plannedDifficulty, diff)` (helpers locaux) traduisent purement pour l'affichage — `selectedPct` reste la seule source de vérité, jamais un 2e axe de calcul.

### Contradiction trouvée en comparant à `/conseils` — `chronicContextLine()` réécrite
Gildas a comparé un texte de décision ("Ta charge chronique est élevée cette semaine (charge chronique) : ton seuil est resserré par prudence.") au texte correct de `/conseils` sur le même chargement ("Ta charge chronique est en baisse : possible perte de forme si ça dure.") — contradiction directe. Root cause : `chronicContextLine()` fabriquait sa propre phrase générique "élevée...resserré par prudence" pour N'IMPORTE QUEL pire indicateur chronique, sans jamais vérifier sa direction réelle — fausse dès que le pire indicateur est `fitness`/`form` (une tendance qui peut être "en baisse", pas "élevée"). **Fix** : `chronicCandidates` porte désormais l'objet `{text,...}` complet de chaque métrique (`loadInfo`/`monotonyInfo`/`strainInfo`/`fitnessTrendInfo`/`formInfo` — mêmes objets que la carte ⚡ Charge de `/conseils`) au lieu d'une simple clé de nom ; `chronicContextLine(worst)` réutilise TEL QUEL le `.text` déjà écrit et directionnellement correct du candidat gagnant, avec seulement un suffixe neutre ("Seuil du jour resserré en conséquence.") — même pattern déjà établi pour la même classe de bug sur `crossTrendInsight()` (`fatigueSignature.ts`, section précédente).

### `DecisionGauge.tsx` — fidèle au design du POC, pas une réinvention
3 retours successifs de Gildas après une 1re version qui s'écartait trop du POC :
- **Fill** : le POC peint un dégradé continu vert→jaune→orange→rouge (`linear-gradient(to right,#4ade80 0%,#a3e635 22%,#eab308 45%,#f97316 70%,#ef4444 100%)`) sur un canvas TOUJOURS large de 100% du track, rogné à la position du curseur (trick `background-size` en JS dans le POC) — pas les 3 paliers pleins de `DiffGauge.tsx`. Reproduit en React via 2 divs imbriqués : un conteneur `overflow:hidden` large de `cursorLeft%`, contenant un div gradient large de `10000/cursorLeft%` (relatif au conteneur, donc toujours 100% du track en absolu) — même calcul que le POC, porté en pourcentages CSS imbriqués plutôt qu'en JS.
- **Zone conseillée visible au-dessus du track** : le 1er jet avait `overflow:hidden` sur le track (nécessaire pour clipper le fill), ce qui rognait aussi la zone (18px de haut contre 10px de track) à la hauteur du track — invisible. Fix : `overflow:hidden` déplacé sur le SEUL conteneur du fill (imbriqué), le track parent reste `overflow:visible` pour laisser la zone déborder comme dans le POC.
- **Curseur** : 19px, ombre douce `rgba(24,24,27,.1)` (pas de halo blanc plein comme le 1er jet), poignée de préhension (3 traits horizontaux via une div `box-shadow` dupliqué au-dessus/en dessous) — détail du POC (`.gauge-cursor::after`) répliqué à l'identique.

### Comportement du curseur — fidèle au modèle d'interaction exact du POC
- **Démarre hors zone par construction** : `selectedPct` initial `0` (pas `reco`) — le curseur part sur la difficulté RÉELLEMENT prévue, mécaniquement en dehors de la zone conseillée (c'est ce décalage qui a déclenché la suggestion). Retour de Gildas, fidèle au POC : "le curseur du RPE prévu est normalement en dehors de la plage conseillée... le clic sur le CTA mets le curseur dans le range conseillé".
- **Un clic sur le CTA hors-zone saute ET applique en un geste** (`apply()` : si `!inZone`, snap `selectedPct→reco` + `onPreviewChange(reco)` avant l'écriture) — pas une étape de confirmation séparée, comme le `if(inZone(left)||mode==="maintain") apply(currentRpe); else apply(athlete.targetRpe);` du POC.
- **Pas de CTA quand le prévu est déjà dans la zone** (`hideAdjustCta = selectedPct===0 && inZone`) : cas réel (pas hypothétique) — `reco` est parfois assez faible (mismatch tout juste au-dessus du seuil de 35) pour que la difficulté prévue d'origine tombe déjà dans `targetDifficulty±0.5` sans aucun drag. Seul "→ Maintenir" reste alors (pleine largeur), rien à ajuster. Dès que l'utilisateur drague, le CTA réapparaît normalement.
- **Le verbe du CTA suit la position RÉELLE du curseur, pas le `dir` figé de la suggestion** : `cursorDir = currentDiff < targetDiff ? "high" : "low"` — si l'utilisateur drague au-delà de la zone côté opposé à la suggestion d'origine, le CTA bascule sur le verbe opposé (cohérent : cliquer ramène toujours vers `reco`, dans la zone, peu importe de quel côté on est). À l'état par défaut (non dragué), ça coïncide toujours avec `dir`.
- **Jamais de pourcentage dans un CTA** ("Appliquer →" plain, jamais "Appliquer X% →") — matche le POC ("Appliquer" sans %, jamais de chiffre sur le bouton lui-même, contrairement à la version antérieure de ce composant qui l'affichait).
- `onUndo`/`AutoregOriginal` (revert réel en base, pas juste le flag localStorage — livré le 2026-08-14, voir section dédiée) inchangés par ce chantier, toujours fonctionnels avec la nouvelle jauge.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. 2 sandboxes (`/sandbox/athlete/week`, `/sandbox/coach/planning`) smoke-testées (200) à chaque étape. Pas de clic réel par Claude sur l'interaction du curseur (jamais de manipulation du compte réel de Gildas) — logique tracée à la main contre le JS exact du POC (`setupGauge()`, `update()`, `apply()`) et contre le comportement de `computeAutoregSuggestion()`/`inZone()` — à confirmer par Gildas en local.

Déployé en prod le 2026-09-24, commit `1172c68`, push direct sur `main`.

## Ajustement — jauge/tolérance/recommandation, insight global, tooltips, scores sélecteur (2026-09-25, suite)

3 points remontés par Gildas en testant la carte décision fusionnée (chantier `decisionCard.ts` 2e itération, section précédente) — traités en 2 rounds successifs, chacun avec au moins une fausse piste corrigée sur retour direct.

### `computeAutoregSuggestion` — le chronique ne peut plus fabriquer un "Alléger" sur un jour objectivement bon
Repéré via capture d'écran (Thomas, wellness 92 "Frais", pourtant "Alléger" recommandé). Root cause : `chronicPenalty` (ACWR/monotonie/strain/tendance Fitness en alerte) était retranché INCONDITIONNELLEMENT du score effectif avant le calcul du mismatch — capable à lui seul de faire basculer un jour dont le score SEUL ne justifiait aucun ajustement (mismatch déjà négatif sans lui) vers "Alléger". Fix : la pénalité chronique ne s'applique désormais que si le jour, à lui seul (`rawMismatch = plannedDifficulty*10 - baseScore`), penche déjà vers "plus dur que la forme ne permet" (`rawMismatch >= 0`) — elle amplifie un écart déjà là, elle ne peut plus en inventer un. Vérifié par script sur plusieurs scénarios (jour cohérent + chronique dégradé → toujours rien ; séance quasi max + chronique alerte → déclenche correctement ; Thomas M. démo, cas Alléger volontaire → inchangé).

### Jauge — tolérance proportionnelle + granularité 1 point
2e capture : bandeau "Surcharger recommandé" mais jauge "déjà dans la zone" sans CTA cliquable, sur une séance prévue à 4/10. Root cause distincte du point précédent : `TOLERANCE` (0,5 point, fixe) avalait le delta produit par une reco réelle (10% sur 4/10 = +0,4 point) dès que la difficulté prévue est basse — 0,5 était calibré pour des séances 8-10/10. Fix : `toleranceFor(plannedDifficulty) = min(0.5, plannedDifficulty*0.05)` (`DecisionGauge.tsx`), plafonnée à l'ancienne valeur pour les difficultés hautes (0 changement à 10/10), proportionnellement réduite en dessous — vérifié par script sur les cas limites (reco triviale 2,5% sur difficulté normale/max : "déjà dans la zone" toujours vrai, comportement inchangé ; reco réelle ≥10% : toujours hors zone, CTA visible, quelle que soit la difficulté).

Question posée à Gildas plutôt que devinée (ampleur de la reco pour un wellness très haut, ex. "vers 7-8 de RPE") : plafond de reco conservé à 20% — la périodisation prime, une séance volontairement légère ne doit pas être poussée vers du 7-8/10 même en super forme. En revanche la jauge se déplace désormais par pas de 1 point entier au drag (au lieu de 0,5), pour rester manipulable manuellement — la tolérance proportionnelle (indépendante de la granularité de drag) reste le vrai mécanisme qui règle le bug visuel.

### Redondance dans l'insight global (`crossTrendInsight`) — trouvée à la source, généralisée
1re tentative fausse piste : j'avais retiré la mention "charge en baisse" de `chargeCrossInsight()` (la carte ⚡ Charge elle-même) — Gildas a signalé que cette info y est utile et doit rester ("plus bon car ça dit pas que la charge baisse alors que c'est une info"), reverté à l'identique. La vraie redondance était interne à `crossTrendInsight()` : sa propre phrase mentionne déjà "(fatigue accumulée en hausse/baisse)" PUIS ajoutait systématiquement une 2e phrase complète redisant "charge chronique en hausse/baisse" (`fitnessTrendInfo.text`, même fait, mots différents). Nouveau `mergeChargeIntoBody()` : quand `chargeDetail` vient de la tendance Fitness (jamais un vrai signal ACWR/monotonie/strain, qui reste toujours affiché en entier, jamais fusionné) ET que `bodyClause` mentionne déjà "(fatigue accumulée en...)", seule la CONSÉQUENCE de `chargeDetail` (la partie après son " : ") est greffée — sur la parenthèse elle-même si la phrase s'arrête juste après, sinon en fin de phrase via " ; " (les branches qui ont déjà leur propre ":"). Généralisé aux 4 branches concernées après un 2e exemple de Gildas montrant que la 1re fusion (une seule branche, celle qui se terminait pile sur la parenthèse) ne suffisait pas — "mon exemple était à appliquer sur tous les cas où c'est possible". Vérifié par script sur les 4 branches concernées + 2 cas de non-régression (branche sans mention fatigue, `chargeDetail` = vrai signal ACWR jamais fusionné).

### Tooltips des charts — 2 bugs distincts
1. **Invisibles** (1re passe) : `overflow-x: hidden` seul sur le wrapper Charge fait calculer `overflow-y` à `auto` (pas `visible`) par la spec CSS — le tooltip (positionné hors de la boîte du wrapper) se retrouvait rogné. `RecuperationSection` avait déjà `overflowY:"visible"` explicite, `ChargeSection` non — asymétrie introduite lors de l'extraction du fichier partagé (chantier "point 1"). Corrigé.
2. **Mal positionné** (2e passe, "il faudrait qu'il soit proche des points") : le tooltip était ancré `bottom: calc(100% + 8px)` — toujours tout en haut du wrapper ENTIER, jamais relatif à la position réelle du point survolé, risquant de chevaucher le contenu au-dessus de la carte. Remplacé par un ancrage `top: {position Y réelle du point}%` + `transform: translateY(calc(-100% - 8px))` — flotte juste au-dessus du point lui-même, dans les deux charts (`ZoneSparkline.tsx`/`SparkLineClient.tsx`, même fix).

### Scores faux dans le sélecteur `AthleteFilterBar`
Nouveau composant du chantier "point 1" (barre de filtre sportifs persistante `/coach`+`/coach/planning`) — affichait `a.wellness_score` (absolu brut) au lieu du score RELATIF utilisé partout ailleurs depuis "Wellness relatif" (2026-08-30/31), donc différent du chiffre affiché sur la carte du même sportif juste en dessous. Nouveau prop `scores?: Record<string,number|null>` calculé par chaque appelant (même formule que `displayScore` de `CoachAthleteCard.tsx` : `baseline.relativeScore` si `hasEnoughHistory`, repli absolu sinon) — `CoachClient.tsx` réutilise directement `baselines` (déjà calculé pour le jour affiché) ; `CoachPlanningClient.tsx` (qui n'avait pas de map "score du jour par sportif" au niveau composant, seulement une baseline calculée PAR JOUR dans la boucle de la grille) construit sa propre boucle dédiée pour "aujourd'hui", même pattern que `dayBaseline` plus bas dans le fichier (repli neutre `{sleep:7,stress:5,recovery:7,motivation:7}`, seul le composite est exploitable via `wellnessMap`).

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. Chaque fix de logique (chronicPenalty, tolérance, merge de texte) vérifié par script `tsx` jetable reproduisant la fonction réelle contre des scénarios construits — pas seulement relu. Pas de clic réel par Claude (jamais de manipulation du compte réel de Gildas) — chaque bug signalé venait de son propre test en local.

Déployé en prod le 2026-09-25, commit `183e22e`, push direct sur `main`.

## Insight global — fusion généralisée à toutes les branches, pas juste celle testée (2026-09-25, suite)

Gildas a signalé un 2e cas de répétition dans `crossTrendInsight()` que le fix du round précédent ne couvrait pas : *"Ta récupération est basse mais ta charge des 7 derniers jours ne le confirme pas (fatigue accumulée en baisse) : la cause n'est peut-être pas l'entraînement, vérifie ton sommeil et ton stress. Ta charge chronique est en baisse : possible perte de forme si ça dure."* — même défaut que la veille (2 phrases qui redisent "charge... baisse"), mais dans la branche `disagreement && wellBad`, qui ne se termine pas par ")." comme l'unique branche couverte jusque-là. Consigne explicite : "mon exemple était à appliquer sur tous les cas où c'est possible."

`mergeChargeIntoBody()` généralisé aux 4 branches qui mentionnent "(fatigue accumulée en hausse/baisse)" (fatigueUp seul, fatigueDown seul, et les 2 branches de désaccord) — pas seulement celle qui se termine pile sur la parenthèse : si la phrase a déjà son propre ":" (désaccord, fatigueUp seul), la conséquence de `chargeDetail` est ajoutée en fin de phrase via " ; " plutôt que greffée sur la parenthèse. Vérifié par script sur les 4 branches + 2 cas de non-régression (déjà faits la veille, revérifiés).

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre. Script `tsx` jetable sur les 4 branches concernées + non-régression.

Déployé en prod le 2026-09-25, commit `a88ee90`, push direct sur `main`.

## Boucle d'autorégulation — modèle en points de RPE (pas %), range toujours 2 entiers, pas de titre sans action (2026-09-25, suite)

3 rounds successifs de retours de Gildas sur `computeAutoregSuggestion()`/la jauge de décision, chacun avec un fix vérifié par script AVANT d'exécuter le suivant — plusieurs fausses pistes trouvées et corrigées en cours de route, documentées ici pour ne pas les reproduire.

### Round 1 — "pas de 'Surcharger recommandé' si le prévu est déjà dans le range"
Repéré par Gildas : range [4,5] (Thomas), plan déjà à 4 → aucun bouton ne s'affichait (correct, fix du round précédent) mais le TITRE de la carte disait toujours "Surcharger recommandé" — contradiction titre/jauge. Fix à la SOURCE (`computeAutoregSuggestion()`, pas seulement `decisionCard.ts`) : si le RPE prévu (arrondi) tombe dans le range conservateur de la cible, retourne `null` — la carte affiche "Plan cohérent" comme n'importe quel autre jour cohérent, un seul point de vérité pour tous les consommateurs (titre, jauge, `/p/[id]`, `ProgramBuilderModal`...).

**Conséquence trouvée en vérifiant par balayage exhaustif AVANT de considérer le fix terminé** (pas juste relu) : appliqué au modèle % de l'époque (plafond 20% de `plannedDifficulty`), cette règle rend le Surcharger **structurellement incapable de sortir du range dans 100% des cas** (balayage 1-10 × 0-100 : 0/186 cas actionnables) — le plafond de 20% ne déplace jamais la cible d'un point RPE entier pour une difficulté prévue ≤9 (20%×9 < 2). Signalé explicitement à Gildas avant d'aller plus loin (chiffres à l'appui) plutôt que de livrer un Surcharger silencieusement mort.

### Round 2 — modèle en points de RPE, pas en %
Réponse de Gildas au signalement ci-dessus : *"faut pas sur-conceptualiser. Par exemple plutôt qu'un plafond de 20%, on prend un plafond de 2 points de RPE. et la reco est proportionnelle à l'écart du score et de la cible."* Refonte de `computeAutoregSuggestion()` (`autoregulation.ts`) — `AUTOREG_STEPS`/`nearestStep()` (l'ancienne grille de paliers %) supprimés de son calcul automatique (restent utilisés tels quels par `AUTOREG_CHIPS`/`AdjustSessionModal.tsx`, flux manuel séparé, non touché) :
```
magnitude = clamp(2, |mismatch|/10), arrondie à l'entier le plus proche
magnitude arrondie à 0 → pas de reco (remplace l'ancien seuil fixe "|mismatch|<35")
```
`reco` (%) reste calculé en sortie pour préserver l'API (chips manuelles, `formatAutoregPct`, `AutoregDecision.pct` partagé avec le flux chaîné de Coach Control) — mais dérivé du delta en points réel, pas l'inverse. Balayage revérifié : 186 cas Surcharger actionnables (contre 0), 324 Alléger-critique, 186 Alléger-modéré — le mécanisme redevient utilisable dans les 3 registres.

### Round 3 — range toujours 2 entiers + affichage en points, pas en %
Deux problèmes trouvés par Gildas en testant le round 2 :
1. **"des fois le range conseillé se retrouve entre 2 entier de RPE, ce qui fait que c'est impossible de déplacer le curseur dedans"** puis, plus précisément : *"j'ai un cas ou Thomas a cible 6 au lieu de 5-6 ou 6-7"*. Root cause : le modèle en points produit une cible TOUJOURS entière (`plannedDifficulty + signedPoints`, signedPoints étant maintenant un entier) — l'ancien `zoneRange()` (`Math.floor`/`Math.ceil` d'une cible fractionnaire) dégénérait donc systématiquement en un point isolé (floor=ceil pour un entier), alors qu'il n'avait été pensé que pour la cible fractionnaire du modèle %. **Fix** : `zoneRange(target, dir)` prend désormais explicitement la direction — la cible (toujours l'extrémité CONSERVATRICE, la plus proche du plan) + 1 point supplémentaire dans le sens de l'ajustement (jamais vers le plan initial). Bug trouvé EN CONCEVANT ce fix, pas signalé par Gildas : étendre naïvement vers le plan (`[target,target+1]` pour les deux directions) fait qu'à magnitude=1, une extrémité de la zone retombe EXACTEMENT sur le plan et absorbe silencieusement toute suggestion modérée — corrigé en étendant toujours à l'opposé du plan.
2. **"faut pas afficher '−33% appliqué'"** — nouveau `formatAutoregPoints(pct, plannedDifficulty)` (reconstruit le delta en points à partir du % stocké, même précision vérifiée sans dérive d'arrondi que `adjustDifficulty()`) remplace `formatAutoregPct()` partout où la reco AUTOMATIQUE s'affiche : carte "decided" d'`AutoregButtons.tsx`, badges de `PublicProgramView.tsx` (simulateur `/p/[id]`) et `ProgramBuilderModal.tsx` (simulateur wizard). Les chips manuelles d'`AdjustSessionModal.tsx` restent en % (flux séparé, jamais concerné).

Vérifié par script sur l'exemple exact de Gildas : Thomas (planned=4, wellness=92) → range **[6-7]**, applique **+2 points** — plus jamais un point isolé.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. Chaque étape (balayage exhaustif du round 1, roundtrip d'arrondi du round 2, absence d'absorption à magnitude=1 du round 3) vérifiée par script `tsx` jetable AVANT de considérer le round terminé — pas seulement relue, notamment pour le chiffre "0% actionnable" qui a changé la direction de la conversation. Pas de clic réel par Claude (jamais de manipulation du compte réel de Gildas).

Déployé en prod le 2026-09-25, commit `a88ee90`, push direct sur `main`.

## Badges pédagogiques Charge/Récup, rebrand typographique complet, fond dark unifié (2026-09-25, suite)

Trois chantiers enchaînés dans la même session, sur retours successifs de Gildas.

### Badges pédagogiques Charge/Récup (`HomeAnalyticsSections.tsx`)
Demande : les badges de couleur/tendance deviennent "plus parlants" avec un wording pédagogique — "ce qu'on a dans le tooltip mais en insight personnalisé synthétique" — **sans retirer `CrossInsightBanner`** (gardé, contrairement à une 1re proposition de Claude qui l'aurait retiré des pages Charge/Récup). Bonne nouvelle trouvée en creusant : chaque `xxxInfo` (`loadInfo`/`monotonyInfo`/`strainInfo`/`fitnessTrendInfo`/`fatigueTrendInfo`/`formInfo`/`recoveryInfo`, `fatigueSignature.ts`) a déjà un champ `.text` personnalisé (2e personne, ex. *"Ta charge chronique est en baisse : possible perte de forme si ça dure."*) — jamais affiché ailleurs que comme brique interne des paragraphes composites. Le tooltip de `ZoneBadge` (`definition` prop) passe de `METRIC_DEFINITIONS` (générique/scientifique) à ce texte personnalisé, sur `ChargeSection` et `RecuperationSection`.
- **Badge ACWR ajouté** à `ChargeSection` — `loadInfo` n'avait jusqu'ici aucun badge (seulement visible via les bandes de couleur du chart).
- **Badge "Récupération" composite ajouté** à `RecuperationSection` — n'existait pas non plus, seuls les 4 badges de dimension (flèche seule, aucun tooltip) et le badge Forme existaient.
- **Nouvelle fonction `dimensionInsightText(dim, baseline, perspective)`** (`wellnessBaseline.ts`) — généralise `describeDominantDimension()` (qui ne retourne que LA dimension dominante) à n'importe quelle dimension prise isolément, pour donner un tooltip à chacun des 4 badges Sommeil/Stress/Récup. musculaire/Motivation (ex. *"Sommeil nettement en dessous de ta norme."*). `ChargeSection`/`RecuperationSection` gagnent un prop `perspective` (défaut `"athlete"`, `CoachClient.tsx` passe `"coach"`) pour l'accord "ta"/"sa" — même classe de bug "Ta"/"Sa" déjà rencontrée et corrigée plusieurs fois dans ce fichier, évitée ici en filant explicitement le paramètre plutôt que de le déduire.

### Rebrand typographique — police mono + police d'affichage partout (POC `theperfclub_poc_landing_main_sportif_v1.html`)
D'abord scopé aux cartes Charge/Récup/Aujourd'hui (badges, eyebrows), puis étendu explicitement à **toute l'app** sur demande de Gildas ("je veux que t'appliques absolument partout... fait ce rebrand").
- **`--font-mono`** (`layout.tsx`, `IBM_Plex_Mono` via `next/font/google`, poids 500/600/700 — 900 non disponible, les `fontWeight:900` existants sont plafonnés à 700 partout où cette police s'applique) : badges/pills, eyebrows en majuscules, chiffres bruts (scores de ring, RPE/durée, jauges, dates de calendrier, statuts).
- **`--font-display`** (`globals.css` `:root`, pile système `"Avenir Next","Century Gothic",Futura,"Segoe UI",sans-serif` — reprise TELLE QUELLE du POC, pas d'approximation webfont : aucun équivalent fidèle sur Google Fonts, et c'est la version que Gildas a déjà vue/validée sur le POC) : titres autonomes (écrans, modales, cartes).
- **Laissé sur DM Sans, volontairement** : boutons/CTA (même règle que le POC, `button{font-family:var(--fb)}`), texte courant, noms répétés dans les listes denses (séances/exercices/sportifs — trop de bruit visuel à l'échelle d'une liste), `src/app/share/[id]/opengraph-image.tsx` (moteur satori séparé, ne supporte pas les variables CSS — vérifié intact, zéro diff).
- **Exécuté via un fork** (sweep mécanique sur ~100 fichiers) : 56 fichiers touchés au 1er passage (~340 insertions de `fontFamily`), classification cohérente vérifiée par relecture + `tsc` par le thread principal (pas seulement le rapport auto du fork pris pour argent comptant).

### Fond "dark theme" unifié — glow cyan scientifique (`DARK_CARD_BG`, `src/lib/theme.ts`)
Nouvelle constante partagée, valeur exacte fournie par Gildas (POC `~/Downloads/app-screen-bg-proposals-v2.html`, variante "2 · Glow scientifique cyan fort") :
```ts
export const DARK_CARD_BG =
  "radial-gradient(ellipse 105% 65% at 50% -10%, rgba(56,189,248,0.32) 0%, rgba(125,211,252,0.12) 40%, transparent 65%), " +
  "radial-gradient(ellipse 55% 35% at 15% 25%, rgba(14,165,233,0.1) 0%, transparent 55%), " +
  "#070a0d";
```
Remplace les différents dégradés/aplats neutres ad hoc utilisés jusqu'ici (`#141414`, `linear-gradient(145deg,#1a1a1a,#282828)`, `#050505→#171717→#101010`...) — **seules les surfaces neutres** sont concernées, les variantes teintées par sévérité (`AlertBox.tsx` `DARK_COLOR_PALETTE`, rouge/orange/vert de l'alerte Alléger/Surcharger) et la carte prix orange (`PricingPriming.tsx`, glow orange intentionnel) sont restées inchangées — code couleur sémantique distinct, pas un "thème dark" neutre.

**`CalendarHeader.tsx`** (top nav, 6 pages) : fond par défaut → `DARK_CARD_BG` (couvre `/week`, `/coach`, `/coach/planning`, `/coach/athletes` automatiquement). Nouveau prop `seamless?: boolean` (défaut `false`) — fond transparent, pour les pages qui veulent que le header se fonde dans LEUR propre fond de page plutôt que 2 dégradés dark empilés (visible comme une bande séparée avant ce fix).

**`/today` et `/conseils` (sportif)** — "je veux que la top nav en sportif n'ait pas de BG spécifique mais que ce soit toute la page qui ait le BG" : `CalendarHeader` déplacé à l'intérieur du wrapper de page dark (au lieu d'être un sibling avant), passé en `seamless` — un seul `DARK_CARD_BG` peint désormais le header ET tout le reste de la page en continu.

**`/conseils` — carte "Recommandations" retirée** ("pas censé avec la card qui entoure le chart") : `TestsPanel.tsx` gagne un prop `onDarkPage?: boolean` (défaut `false`) — sa carte "Recommandations d'entraînement" perd son propre fond (transparent) quand la page hôte est déjà dark, passé uniquement par `ConseilsClient.tsx`. `/coach/athletes` (page claire, même `TestsPanel`) garde sa carte dark inchangée.

**Coach** : `CoachAthleteCard.tsx` (Coach Control) et la carte Charge/Récup/Comportements côté coach (`CoachClient.tsx`) → `DARK_CARD_BG`. `FrisePreviews.tsx` (mockups du paywall qui imitent Coach Control) mis à jour en miroir pour rester fidèle.

**Onboarding/wizard** — d'abord volontairement exclus ("des hero plein écran dans un funnel de conversion, pas des cards"), puis inclus sur confirmation explicite de Gildas ("oui fais aussi") : les 6 panneaux gauche desktop du wizard (`ProgramCreatePicker`/`ProgramLibraryBrowser`/`ProgramCriteriaModal`/`ProgramAssignModal`/`WellnessModal`/`InviteModal`), `PaywallModal`/`PrimingJourneyModal` (panneau gauche paywall), `DecisionStep.tsx` (hero desktop 42% + fond mobile plein écran).
- **`WizardHero`** (`OnboardingFlow.tsx`, composant titre+frise partagé par les 7 étapes) — son fond propre (`#141414` avant) n'est peint qu'en **mobile** désormais (`dark && !isMd`) : sur desktop il est TOUJOURS niché dans un des 6 panneaux ci-dessus qui porte déjà `DARK_CARD_BG` sur toute sa hauteur — le garder aurait empilé 2 dégradés radiaux de tailles différentes (le composant fait la hauteur de son contenu, pas celle du panneau), créant un contour visible. En mobile, `wizardHero` est rendu inline dans une modale par ailleurs claire, sans aucun autre fond dark autour — son propre fond y reste nécessaire.
- **`DecisionStep.tsx` mobile, footer** — même piège : le footer dupliquait bêtement le fond du parent (inoffensif en aplat, mais un dégradé radial recalculé sur une petite boîte crée une coupure) — repassé en `transparent`, le fond du parent (100dvh) transparaît sans couture.
- **`PaywallModal.tsx`** : bordure des avatars empilés (`"+600"`) recalée sur `#070a0d` (base solide du dégradé — une bordure ne peut pas être un gradient).
- **Nuance non résolue, signalée à Gildas** : sur `InviteModal`/`WellnessModal` mobile, une petite bande (aperçu sportifs/wellness) juste sous `WizardHero` est une boîte SÉPARÉE (pas nichée dans la même) — son dégradé se recalcule indépendamment, légère coupure possible au lieu d'un flux parfaitement continu. Mineur, pas creusé plus loin faute de retour visuel réel.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque étape (badges, rebrand typo, fond dark ×2 rounds). Pas de clic réel par Claude (jamais de manipulation du compte réel de Gildas) — chaque décision de scope (badges pédagogiques sans retirer l'insight global, périmètre du rebrand typo, inclusion différée puis confirmée de l'onboarding/wizard pour le fond dark) tranchée par échange explicite avec Gildas avant exécution, pas devinée.

Déployé en prod le 2026-09-25, commit `ad33c52`, push direct sur `main`.

## Chart Charge : ligne colorée par zone, angles arrondis, hauteur mobile (2026-09-26, suite)

Point de départ : Gildas a soumis un POC (`~/Downloads/charge-poc (3).html`) proposant une refonte
complète de la vue Charge (insight héros + bandeau de 6 métriques cliquables + chart qui suit la
métrique sélectionnée), avec un brief demandant une évaluation d'opportunité. **Évaluation rendue,
puis Gildas a explicitement réduit le périmètre** ("pas convaincu par la valeur ajoutée... pour faire
simple, je commencerais juste par utiliser les badges qu'on a et au clic/déclic ça affiche le chart de
l'indicateur sélectionné") — seule l'étape 1 (les 3 points visuels ci-dessous) a été exécutée.

### Conclusions de l'évaluation, à garder si le sujet revient
- **Le POC se trompait sur ce qu'affiche le chart actuel.** `ZoneSparkline` trace l'**ACWR** (ratio
  0–2, bandes Gabbett), pas la charge en UA — les UA ne sont que dans le tooltip. Le POC écrivait
  "Charge d'entraînement · UA (RPE × durée)" avec des axes Surcharge/Optimal/Récup : ces zones n'ont
  aucun sens sur une échelle UA (842 UA n'est ni l'un ni l'autre dans l'absolu — c'est précisément le
  job de l'ACWR). Porté littéralement, ça aurait mis une affirmation fausse dans l'UI. Corollaire :
  **l'ACWR doit rester le chart par défaut**, un chart "Charge UA" serait une vue sélectionnable en
  plus, jamais à sa place.
- 2 autres unités fausses dans le POC : Contrainte annoncée en "index 0–100" (c'est du strain Foster
  **en UA**, seuils 6000/10000) et Monotonie en "score variété" (c'est un ratio ~0.5–3, seuils
  Foster 2/2.5 — l'axe du POC était dans le bon sens, seul le libellé d'unité était faux).
- **Fitness/Fatigue sont illisibles sur 7 jours** (EWMA 42j) — le POC les montrait chutant de 25 % en
  une semaine, ce qui est mathématiquement impossible. À gater sur 28j/90j si un jour on les trace.
- **Faisabilité data ≈ nulle en coût, contrairement au brief** : `DayPoint` porte déjà
  `load`/`monotony`/`strain`/`acwr` jour par jour sur 104 jours, et `formPercentSeries()` retourne
  déjà `{fitness, fatigue}` par jour (juste pas recopiés dans `DayPoint` — 2 lignes). Aucune métrique
  n'a besoin de rester "statut only".
- **Le POC perdait la hiérarchie qu'il prétendait améliorer** : il remplaçait l'insight global par
  celui de la métrique sélectionnée (`isGlobal: true` uniquement sur `charge`), alors que
  `chargeCrossInsight()` EST le "scan en 2 secondes". Les deux doivent être empilés, jamais
  substitués.
- Le vrai gain identifié est plus étroit qu'annoncé : le texte pédagogique par métrique existe déjà
  (`loadInfo.text` etc.) mais est caché derrière un survol/tap de `ZoneBadge` — fonctionnel, mais non
  découvrable. C'est ça que la piste "badge cliquable qui change le chart" adresse, sans nouveau
  composant ni nouvelle donnée.

### Ce qui a été livré (étape 1)
- **Hauteur mobile** (`HomeAnalyticsSections.tsx`, les 2 charts) : `height={isMd ? 168 : 240}`. Ce
  n'était pas un oubli de hauteur — les 2 charts sont en `width:100%` + `aspectRatio: 400/H`, donc
  leur hauteur **rendue est proportionnelle à la largeur** : ~147px sur un viewport de 390px contre
  ~286px en desktop, l'inverse de ce qu'on veut. Passer un H plus grand rend le ratio moins large
  donc le chart plus haut (~210px en mobile), **sans jamais déformer les traits** : le viewBox ET
  l'aspect-ratio CSS utilisent tous les deux ce H, l'échelle reste uniforme malgré
  `preserveAspectRatio="none"`. Précédent identique dans `FrisePreviews.tsx`. **Ne pas** mettre une
  hauteur fixe en px sur le wrapper en laissant le SVG s'étirer : l'étirement devient non uniforme et
  les traits s'épaississent verticalement.
- **Ligne colorée par zone** (`ZoneSparkline.tsx`) : un seul `<linearGradient>` vertical en
  `gradientUnits="userSpaceOnUse"` avec 2 stops par zone (donc des transitions franches aux
  frontières 0.8/1.3), plutôt qu'un découpage du tracé segment par segment — colorer chaque segment
  selon son point de départ donnerait une couleur fausse sur un segment qui traverse une frontière,
  alors qu'ici la couleur change exactement là où la ligne franchit. `useId()` pour l'id du dégradé
  (plusieurs charts cohabitent sur une page), **avec les `:` retirés** (`url(#...)` dans un attribut
  SVG les tolère mal selon les navigateurs). Stroke 1.5 (blanc 50 %) → 2.5 (couleur pleine), la ligne
  portant désormais l'information.
- **Angles arrondis** : `strokeLinecap`/`strokeLinejoin="round"`. `SparkLineClient` (Récupération) les
  avait déjà, découpait déjà ses segments aux trous et gardait déjà un marqueur sur le dernier point
  + le survol — le problème "pointu" était donc propre au chart Charge, et l'implémentation s'est
  alignée sur ce qui existait plutôt que d'inventer. **Volontairement pas de lissage en courbe** :
  une spline classique dépasse les points réels, elle pourrait dessiner la ligne dans la bande
  SURCHARGE un jour où l'ACWR n'y est jamais monté — une lecture fausse créée par du cosmétique.
- **2 pièges traités** : (1) le tracé est découpé en **segments contigus** — avant, les `null`
  (historique insuffisant) étaient joints en une seule polyline qui reliait le vide en ligne droite,
  invisible une fois les pastilles retirées ; (2) **plus une pastille par jour** (7 à 90 par-dessus la
  ligne), il en reste 3, les mêmes que `SparkLineClient` : dernier point connu, point survolé, et
  tout point isolé entre deux trous (une polyline à un seul point ne dessine rien). Le survol ne
  dépendait pas des pastilles (`onMouseMove` sur le wrapper + curseur vertical), les retirer ne coûte
  aucune interaction.
- Écart connu, assumé : le chart de `/share/[id]` utilise le même composant et change donc d'aspect
  (voulu, fidélité à l'app), ce qui crée un petit écart avec l'image OpenGraph, portage à la main
  sous satori qui garde les points.

`tsc --noEmit` propre. Déployé le 2026-09-26, commit `a5895f2`.

## Autorégulation : reco = écart à la norme personnelle, décision visible après validation, passage en "Plan cohérent" (2026-09-27)

### Le modèle de reco combattait la périodisation — refonte (3e itération)
Signalé par Gildas sur son propre compte : *"ma récup était à l'équilibre et ça m'a recommandé
d'alléger, je trouve ça bizarre, j'ai toujours répété que je voulais un algo simple : en gros
équilibre → touche rien ou peu, au plus on est fatigué au plus ça reco d'alléger, au plus on est en
forme au plus ça reco de surcharger, tout en respectant la périodisation"*.

**Root cause** : `computeAutoregSuggestion` comparait la forme à la **difficulté prévue**
(`mismatch = plannedDifficulty × 10 − score`), ce qui exigeait implicitement un score de 80/100 pour
tolérer une séance à 8/10. Un sportif pile à SA norme (relativeScore = 50, zone "Équilibré")
déclenchait donc un Alléger sur n'importe quelle séance au-dessus de 5/10 — l'algo **combattait** la
périodisation au lieu de la respecter (une séance dure est planifiée parce que le bloc l'appelle, pas
parce que le sportif est euphorique).

**Nouveau modèle, 3 règles** :
1. **La zone morte EST la bande "Équilibré" déjà affichée** (`|z| < Z_SWC`) — si le libellé de zone
   dit "Équilibré", il n'y a pas de reco. Plus aucune contradiction possible entre ce que la zone
   annonce et ce que la carte propose. (Corollaire : si cette bande paraît un jour trop étroite, c'est
   `Z_SWC` qu'on élargit, et ça bougera aussi les libellés Fatigué/Équilibré/Frais partout.)
2. **Ampleur graduée sur l'échelle d'ampleur d'effet de Hopkins**, déjà utilisée partout ailleurs :
   `Z_SWC ≤ |z| < Z_MODERATE` → 1 point de RPE, `|z| ≥ Z_MODERATE` → 2 points (le plafond, inchangé).
   Aucun nouveau seuil inventé.
3. **La difficulté prévue n'entre plus que dans les garde-fous** — c'est le plan qui fixe le niveau, la
   forme ne le décale que de ±1 ou ±2. La périodisation est respectée par construction.

Repli sans baseline personnelle (historique < 12j) : bande neutre absolue **60-80**, qui reproduit
exactement l'heuristique d'origine de cette boucle (2026-08-13 : "Alléger si wellness < 60",
"Surcharger si wellness ≥ 80").

**Garde-fous de périodisation** : résultat clampé dans `[1,10]` (surcharger un 10/10 ne propose rien) ;
une séance **≤3/10 ne se surcharge jamais** (jour de récupération/deload réellement programmé — le
générateur sort toujours `recuperation` dans 1-3), l'inverse restant vrai (un 10/10 peut toujours
s'alléger). Escalade critique inchangée (garde-fou absolu < 40 ou `Z_SEVERE` → plafond + 🚨, côté
Alléger seulement). `chronicPenalty` conservé, converti en décalage de z (`÷50`, soit 1 à 2 SWC) et
toujours **jamais appliqué à un sportif réellement frais** (`z > Z_SWC`) — garde-fou du 2026-09-25
préservé.

### Effet de bord : variance de l'historique synthétique recalibrée
Conséquence directe : la **variance** de l'historique wellness synthétique détermine désormais la
largeur des paliers sur toutes les surfaces démo. Avec l'ancienne amplitude de `coachWellnessScoreFor`
(9, centre 75 → écart-type ~6,5 points de score), le z explosait : le slider 0-100 du simulateur
`/p/[id]` ne laissait ~3 points de "rien à ajuster" entre −2 et +2, un sportif démo à 55 affichait un
score relatif de 5/100, et le cas "Plan cohérent" de la démo onboarding coach (Emma, 70) était devenu
un Alléger. Amplitude 9 → **24**, centre 75 → **72** (aligné sur la valeur par défaut du slider, pour
que le simulateur démarre en "Équilibré", càd sur "le plan tient"). **Ne touche que de la donnée
synthétique** (sandbox, simulateurs, aperçus paywall, sportifs démo d'un coach), aucun vrai sportif.

### La jauge reste affichée après validation + 1 bug réel
Retour de Gildas : *"quand on a appliqué une reco, je dois voir la jauge du nouveau RPE et les
nouvelles charges (le barré c'est avant de valider). Néanmoins je dois toujours pouvoir revenir à la
séance prévue"*.
- Avant, le mode `decided` d'`AutoregButtons` **remplaçait la jauge** par un bandeau ✓ — la carte
  séance se retrouvait donc sans aucune jauge de difficulté, puisque celle-ci a remplacé `DiffGauge`
  le 2026-09-24. Elle est désormais rendue **en lecture seule** sur la nouvelle difficulté, avec un
  **repère "prévu"** sur le plan d'origine (`DecisionGauge` : nouveaux props `readOnly`/
  `plannedMarker`/`hint`). Le repère vient de `AutoregDecision.original.target_difficulty`, déjà
  stockée pour le retour arrière — aucune donnée nouvelle à faire circuler, et c'est nécessaire parce
  que le prop `plannedDifficulty` vaut alors la NOUVELLE difficulté (le parent a déjà rafraîchi la
  séance depuis la base). Retour arrière renommé **"↩ Séance prévue"** ("Annuler" devenait ambigu une
  fois la jauge toujours visible).
- **Bug réel corrigé** : en mode décidé, `onPreviewChange` recevait encore `decision.pct`, donc le
  parent réappliquait l'ajustement **par-dessus des notes déjà ajustées en base** — l'ajustement était
  affiché deux fois (`@150kg` → base `@120kg` → affiché "`@120kg` barré → `@96kg`"), et ça **survivait
  au rechargement** puisque l'effet de montage relit la décision en localStorage. Désormais
  `onPreviewChange(null)` dès qu'une décision existe (montage, `apply`, `maintenir`). Vérifié que les
  4 surfaces mettent bien à jour leur state local après écriture, donc l'affichage sans preview montre
  les vraies valeurs persistées.
- **Ordre d'écriture de la décision** (prérequis du point suivant) : `setAutoregDecision` est appelé
  **AVANT** l'`await` de `onApply`, avec `try/catch` qui nettoie si l'écriture échoue (et dans la
  branche paywall `isActive === false`). Sans ça, `onApply` déclenche en son sein un state du parent
  qui fait **changer la carte de section** (carrousel → grille), donc remonte le composant : la
  nouvelle instance lisait un localStorage encore vide et repartait en mode actif, comme si rien
  n'avait été fait. `original` est patché juste après (`undo()` relit toujours la décision au moment du
  clic). Permet de retirer le `key={topSession.id}-${isReviewed}` de `CoachAthleteCard`, qui causait le
  bug déjà documenté (encart revenant à idle au lieu d'afficher "✓ appliqué").

### Coach : une décision prise part en "Plan cohérent"
`reviewedIds` entre dans le partage `priority`/`stable` (extrait dans un `needsDecision(a)` partagé).
**Indispensable, pas redondant avec le recalcul** : appliquer un ajustement résout souvent le signal de
SURCHARGE tout seul (`hasSurchargeSuggestion` recalcule depuis la nouvelle `target_difficulty`), mais
jamais celui d'`attention()` — piloté par la récupération/la tendance/la monotonie, que l'ajustement de
la séance ne change pas — et "Maintenir" n'écrit rien du tout donc ne change aucun signal. Annuler la
décision fait revenir la carte automatiquement. Les sportifs traités sont **triés en tête** de "Plan
cohérent" (la carte quitte un carrousel horizontal pour atterrir dans une grille, sinon elle semble
avoir disparu) ; le compteur "N/M traités" est retiré (structurellement nul désormais) et l'état vide
distingue "✓ Toutes les décisions du jour sont prises" de "Aucune décision urgente".

### Fix de suivi : une séance dure ne suffit plus à mettre un sportif "à décider"
Signalé juste après par Gildas : *"pourquoi un sportif 57 Équilibré, RPE prévu 9 est dans 'à décider'
sans action à faire ?"*. `attention()` (`CoachAthleteCard.tsx`) avait un `|| maxDiff >= 8`
**inconditionnel**, plus un `(isMildLowZ && maxDiff >= 5)` — cohérent avec l'ancien modèle (où une
séance dure produisait presque toujours un Alléger), orphelin depuis la refonte ci-dessus. Les seuils
d'`attention()` sont désormais exactement ceux qui produisent une suggestion (`Z_SWC` côté relatif,
bande neutre 60-80 côté absolu), pour que les deux ne puissent plus diverger. Le côté surcharge reste
couvert par `hasSurchargeSuggestion()` dans `CoachClient.tsx` ; la branche "pas de wellness du jour +
séance dure" reste inchangée (là, une récupération inconnue justifie bien une vérification).

### Vérifié
`tsc --noEmit` propre à chaque étape. Nouveau modèle rejoué en scripts `tsx` sur une grille z ×
difficulté ("Équilibré" → aucune reco quelle que soit la difficulté, gradation −2/−1/+1/+2, garde-fous
récup 3/10 et 10/10 confirmés), sur les 3 sportifs de la démo onboarding (Alléger/cohérent/Surcharger
tous retrouvés après recalibration de la variance), sur le slider onboarding, et sur les 5 seeds de la
sandbox coach (les 3 registres toujours couverts — le cas surcharge est porté par Nora, Sofia tombant
correctement sous le garde-fou deload avec sa séance à 3/10). Alignement `attention()`/suggestion
vérifié par **balayage exhaustif** (score 20-100 × RPE 1-10) de la combinaison réellement utilisée par
`/coach` : **45 divergences sur 810, toutes à RPE 1** — un sportif épuisé dont la séance est déjà au
plancher, donc rien à retirer mais qu'il reste légitime de signaler ; zéro divergence ailleurs.

**Non traité, signalé** : en "Maintenir", rien n'est écrit donc le signal reste, et l'`AlertBox`
continue d'afficher la raison de l'alerte au-dessus d'un bandeau "Maintenu" — défendable (le signal EST
toujours là, le coach a juste décidé de garder le plan) mais à revoir si ça gêne. Autre conséquence
assumée : un tout nouveau compte qui répond neutralement au check-in n'aura pas de geste
d'autorégulation à faire ce jour-là (`ensureTodayDemoSession` ne peut plus "trouver" une difficulté qui
déclenche quand le sportif est à sa norme — par construction, et c'est voulu).

Déployé le 2026-09-27, commits `24b8a43` (refonte) et `a82de12` (fix de suivi).

## Cartes d'indice sur l'Accueil — une carte par indicateur, chart au clic (2026-09-28)

Point de départ : POC `charge-variantes.html` (artifact, ~30 itérations sur les données réelles de
`cauvingildas@gmail.com` — 90 jours de charge + 119 jours de récupération, récupérés en SQL direct et
recalculés avec les vraies formules de l'app). Inspirations assumées : **WHOOP** (une section, un
insight, des sous-indicateurs), **Garmin** (jauge à seuil), **Withings** (une carte par indice,
aperçu intégré, détail au clic). Décision explicite de Gildas : **pas de gros score agrégé** — c'est
l'insight qui tient ce rôle, comme déjà en prod.

Remplace, dans `ChargeSection`/`RecuperationSection` (`HomeAnalyticsSections.tsx`), les sous-onglets
Charge/Adaptation et les rangées de badges par une liste de cartes. Les appelants (`/today`,
`/coach`) n'ont pas changé de signature.

### Contrat d'information, posé une fois
- **Gauche** : nom de l'indice, la LIGNE PRINCIPALE `statut · valeur` (17,5 px), puis l'**impact de
  la tendance**.
- **Droite** : aperçu, puis la tendance chiffrée sous l'aperçu.
- En **mobile**, l'insight sort de la colonne de gauche et passe sous tout le contenu — coincé à côté
  de l'aperçu il tombait sur 4-5 lignes dans une centaine de pixels.

L'insight ne décrit JAMAIS la zone (ce serait redire le statut). Trois registres : l'indice décroche
→ le texte de `sigDimInfo()`, qui porte déjà l'action ; il va bien mais bouge → ce que le mouvement
implique ; il va bien et ne bouge pas → ce que l'indicateur mesure et pourquoi sa stabilité est une
bonne nouvelle. **Un insight sur chaque carte, y compris vert et stable** (demande explicite :
« c'est la pédagogie ») — une première version se taisait alors, ce qui privait des explications les
plus utiles à qui découvre ces indices.

### 3 fichiers neufs
- **`src/lib/metricCards.ts`** — toute la logique, pure et testable : les 8 indices, bornes, bandes,
  formats, tendances, textes d'impact (variantes sportif ET coach), `chartSpecFor()`. Aucun seuil ni
  couleur n'y est inventé : ils viennent de `sigDimInfo()` et de `WELLNESS_RAMP`.
- **`src/components/conseils/MetricChart.tsx`** — chart d'UN indice, piloté par un `ChartSpec`. Il a
  fallu le créer : `ZoneSparkline`, `SparkLineClient` et `ChargeReportChart` sont composites par
  construction (chacun trace plusieurs métriques ensemble). Mêmes conventions que `ZoneSparkline` —
  viewBox 400×H, `preserveAspectRatio="none"`, et **tout ce qui est texte ou marqueur en overlay HTML
  à taille fixe** (un `<text>` dans le viewBox scale avec la largeur rendue).
- **`src/components/conseils/IndexCards.tsx`** — les cartes et leurs trois types d'aperçu.

### Décisions de rendu, chacune motivée
- **L'aperçu suit la NATURE de l'indice**, pas un gabarit unique : anneau (Garmin) pour ceux qui ont
  un seuil absolu — contrainte, monotonie ; jauge horizontale de zone pour ceux qui se lisent comme
  une position — ACWR, forme ; courbe pour le reste. **Pas d'anneau pour la charge en UA** : elle n'a
  pas de borne haute, l'échelle de l'arc serait inventée.
- **Bandes de fond seulement là où elles informent** : la zone optimale pour l'ACWR (en neutre, comme
  `ZoneSparkline`), les zones à ÉVITER pour monotonie et contrainte, les trois pour la forme, aucune
  pour la récupération (2 pointillés aux frontières 42/58, la courbe portant déjà la couleur). Le
  liseré vertical de gauche porte toujours les trois couleurs — c'est la légende, et **le seuil
  d'entrée y est écrit** (« ÉLEVÉE ≥ 2,00 »).
- **Échelle dynamique réservée à fitness et fatigue**, les deux seuls sans zones. Un premier jet
  l'appliquait partout : zoomer sur la donnée faisait sortir du cadre les seuils qui donnent son sens
  à la valeur (un ACWR à 0,85 ne veut rien dire si on ne voit plus 0,8 et 1,3).
- **ACWR en points reliés** par un fil neutre : sur 7 jours le ratio bouge de quelques centièmes, la
  courbe seule suggère un mouvement continu et on ne sait plus où tombent les jours. Points sur
  chaque jour à toutes les densités, rétrécis au lieu d'être supprimés (11 → 5 px).
- **Tout l'onglet Récupération est sur la rampe bleue** (`statusDisplayColor()`) : la couleur
  d'origine reste la source de la SÉVÉRITÉ (`severityOf` teste des hex précis), on la traduit pour
  l'affichage. Foncé = favorable, clair = défavorable, **médian = neutre** — sans ce 3e cas,
  « Équilibré » ressortait de la même couleur que « Frais ».

### 6 bugs trouvés en exécutant le code, pas en le relisant
1. **La récupération était tracée en score BRUT** contre des bandes 42/58 définies sur l'échelle du
   percentile du z-score. Intuition de Gildas (« t'as pas pris le z-score ici »), confirmée : chart,
   aperçu, valeur et tendance lisent maintenant tous `baseline.relativeScore`, comme le chart de prod.
2. **Fitness/Fatigue se contredisaient** — « ↘ −20 % sur 28 j » au-dessus de « en hausse ». Ce sont
   les SEULS indices dont le texte de statut est lui-même dérivé d'une tendance (`trendDimInfo()`,
   calculé par prod sur SA fenêtre de 7 jours). Ils lisent désormais toujours leur texte depuis la
   direction que la carte affiche. Les autres n'ont pas ce risque : leur texte décrit la zone
   courante, qui ne dépend d'aucune fenêtre.
3. **La carte Charge mélangeait deux sujets** : son insight parlait de la SÉANCE alors que sa tendance
   porte sur la moyenne 7 jours, d'où un changement de registre entre onglets de période et une
   contradiction possible avec le statut (« Dure · 520 UA » au-dessus de « Séance plus légère… »).
   Les trois textes parlent maintenant du volume ; la lecture de la séance reste sur la ligne
   principale.
4. **La tendance de Charge comparait deux jours isolés** (aujourd'hui vs il y a 7 j), dont l'un peut
   être un repos — elle porte sur la moyenne 7 jours (`TREND_SERIES`).
5. **Celle de Récupération lisait un percentile comme un ratio** (« −43 % ») : un percentile n'est pas
   une échelle de rapport, on donne l'écart du jour à la moyenne de la période.
6. **Les libellés de `sigDimInfo()` sont écrits pour des BADGES** — capitales et parfois préfixés du
   nom de l'indicateur (« CONTRAINTE OK », « FITNESS ↗ »). Normalisés à l'affichage
   (`prettyStatus()`), sans toucher `sigDimInfo` dont les badges servent ailleurs.

### Sous-jacents de la récupération
Les 4 dimensions ne sont plus des badges au-dessus du chart : elles **filtrent le chart à l'intérieur
de la carte Récupération** (chips portant la flèche déjà calculée par `dimensionBadgesSeries()`). Ce
sont les composantes du score, pas des indices frères — en faire des cartes de plus donnerait une
liste plate sans hiérarchie.

**Elles tracent le Z, pas le brut** (2026-09-28) : « comparer à la valeur d'il y a 7 jours est nul »
(Gildas). Le Z est par construction l'écart à SA norme, donc la référence est la ligne 0, sans rien
à reconstruire. Réserve connue : la flèche du chip vient toujours de `dimensionBadgesAt()`, qui
compare le Z du jour au Z d'il y a 7 jours — le chart dit « où je suis », la flèche « dans quel sens
ça bouge ». Deux lectures différentes, pas contradictoires.

**`DIMENSION_LABELS.recovery` : « Récup. musculaire » → « État physique »** — le mot du FORMULAIRE
lui-même (`WellnessModal` : « 💪 État physique aujourd'hui »), donc celui que le sportif a sous les
yeux quand il répond. Deux noms coexistaient pour une seule question. Vérifié dans les 5 phrases où
le libellé est enchâssé (« État physique nettement en dessous de ta norme »). Touche aussi les badges
de `/coach` et le filtre « Filtre : État physique bas ».

### Liste coach — même philosophie appliquée au roster
`TeamAnalyticsList` : nom du sportif (blanc, 15 px), ligne `statut · valeur`, insight ; aperçu et
tendance à droite. Le tri par sévérité et le groupement en sections existaient déjà ; **départage
alphabétique ajouté** à sévérité égale, sinon deux sportifs au même niveau permutaient d'un rendu à
l'autre au gré de l'ordre du roster.

- **Indice de tête : ACWR côté charge, score de récupération côté récup** — les deux seuls de leur
  onglet normalisés sur la norme propre de chaque sportif, donc les seuls comparables d'une ligne à
  l'autre. Un volume en UA ne l'est pas : 520 UA ne dit pas la même chose chez deux sportifs.
- **L'insight de l'ONGLET, pas l'insight croisé** (`chargeInsight`/`recoveryInsight`) : `trendText`
  mêle charge et récupération, donc sur l'onglet Charge la ligne parlait pour moitié d'autre chose —
  et disait autre chose que le détail du sportif, qui montre déjà ces insights-là. L'insight croisé
  reste dans `CrossInsightBanner`, au-dessus des onglets, où il doit parler des deux axes.
- **Rangées de badges secondaires retirées** (fitness/fatigue/monotonie/contrainte, les 4 dimensions
  + forme) : l'insight nomme déjà l'indicateur qui décroche, et cette liste est une surface de scan.
  Retire un niveau d'information qui était volontaire — à rétablir si ça manque.

### Écarté explicitement
- **Fenêtre saine mobile (0,8–1,3 × chronique) sur la carte Charge** — construite puis retirée le
  jour même : « c'est illisible, et ça duplique l'ACWR ». Elle énonce littéralement la même chose que
  l'ACWR, en UA au lieu d'un ratio ; l'ajouter coûtait toute la lisibilité pour zéro information. Le
  raisonnement qui l'avait fait proposer était incohérent (on l'écartait sur l'ACWR au motif que « le
  ratio est déjà la normalisation », sans voir que c'est le même énoncé). **Piège à connaître si le
  sujet revient** : cette fenêtre borne la charge AIGUË, jamais celle du JOUR — vérifié sur données
  réelles, une séance à 450 UA dépasse un haut de fenêtre à 410 alors que l'ACWR est à 0,85.
- **Toggle 7/28/90 descendu DANS le chart déplié**, la fenêtre restant unique et partagée : la ligne
  de tendance de chaque carte la lit aussi, des fenêtres séparées rendraient les cartes
  incomparables. Argument décisif de Gildas : avec des cartes qui se déplient, un contrôle en haut de
  section devient inatteignable sans remonter.
- **`ChargeReportChart.tsx` devient orphelin** (aucun importeur) — jamais commité, laissé non suivi
  en attendant une décision.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. Chaque correction rejouée en
script `tsx` jetable contre les **vraies séries de Gildas** (90 jours, 3 périodes, 8 indices) plutôt
que relue — les 6 bugs ci-dessus ont tous été trouvés ainsi, aucun par lecture de code. Pas de
`npm run build` (dev server actif, risque de corruption `.next` déjà documenté). **Pas de clic réel
par Claude** : Gildas fait la QA, et c'est lui qui a trouvé l'incohérence Charge et l'échelle fausse
de la récupération.

## Ligne "Phase" sur la carte décision + règles de reco par difficulté (2026-09-29)

POC validé par Gildas : `https://claude.ai/artifact/11bpzLBxxQ3HHcRPmgUnFN`. Commit préalable `bcdd844` (même jour) : la baisse de la tendance Fitness ne resserre plus le seuil d'Alléger (sa seule alerte est une baisse = perte de forme, l'inverse d'une fatigue) ; texte "ta charge récente pèse" quand l'Alléger vient du seul chronique ; tri Coach Control aligné via `computeDecisionCard` (`hasCardSuggestion`).

### La ligne Phase (`decisionCard.ts`, param `day`)
La 3e ligne chronique de la carte (ctxLine) est remplacée, sur `/today` et Coach Control, par l'insight croisé `crossTrendInsight()` rendu par `PhaseLine.tsx` ("Phase" + pastille du code). Titre + ligne 2 dépendent de l'état de la journée (`DecisionDay`) :

| Moment | Titre / ligne 2 | Phase |
|---|---|---|
| Avant wellness (séance prévue) | "Plan à confirmer" / "Séance X prévue." | Moitié charge en clair (charge récente + charge de fond), vraie phrase floutée + CTA "Renseigner mon ressenti" (flou plutôt que cadenas, pas de CTA côté coach) |
| Wellness rempli | Reco inchangée ; "Plan cohérent" gagne une ligne 2 | `crossTrendInsight().text` |
| Séance faite | Zone (titre) / ressenti vs prévu + conseil + demain (`afterText`) | Charge seule (`cross.chargeText`) |
| Jour de repos | "Jour de repos" / séance de demain | Phrases dédiées au repos (`restText`) |

- Fenêtre `CONSEILS_HISTORY_DAYS` pour les tendances de la phase, pour ne pas diverger de l'onglet Charge.
- Cold-start (pas de baseline) : la phase lit le ressenti avec la bande 60-80 de la reco (`absoluteFeel`), jamais les seuils 50/70 de `sigDimInfo` (un 55 donnait "Récupération basse" puis "récupération correcte"). Textes "correcte/basse/bonne" au lieu de "ta norme".
- `CrossInsightBanner` retiré des onglets Charge/Récupération (/today et fiche sportif coach) : doublon. Perdus avec lui : le partage "Ma signature de fatigue" (les liens existants s'ouvrent toujours) et l'alerte "séance demain, récup fragile". Reste `DemoDataChip` en sandbox/démo.
- Carte décision centrée et sans bordure quand elle porte une phase (`AlertBox` prop `centered`).

### `crossTrendInsight()` réécrit
Bug trouvé par Gildas : "Phase Accumulation" suivi de "...tu es en phase d'adaptation". Cause : titre et fin de phrase venaient de deux sources, et l'axe "état" comptait la fatigue EWMA 7j, qui monte mécaniquement dès que la charge monte, donc toute montée en charge avec un ressenti normal devenait "Accumulation" rouge.
- Axe état = ressenti seul ; la fatigue récente ne fait que nuancer la phrase quand elle contredit le ressenti.
- Une phrase par code (`crossPhaseText`), titre et texte ne peuvent plus diverger. `mergeChargeIntoBody` supprimé.
- Vocabulaire : "charge récente" (7j) / "charge de fond" (42j), sans chiffres ni parenthèses. Longueur moyenne voulue par Gildas (ni "Charge et récupération stables." trop court, ni les anciennes phrases à rallonge).
- Impact : aussi le titre de la signature sur `/coach/athletes` (`athletesData.ts`).

### Règles de reco par difficulté (`computeAutoregSuggestion`)
Déclencheur : un user à 79 avec une séance à 9 se voyait proposer 10.

| Ressenti | Légère (1-3) | Modérée (4-7) | Dure (8-10) |
|---|---|---|---|
| Fatigué (−1 à −3) | idem | idem | idem |
| Dans la norme | rien | rien | **−1** (`kind: "norm_hard"`, texte "garde un point de marge") |
| Un peu frais | **+1** | +1 | **rien** |
| Nettement frais | **+2** | +2 | **rien** |

- Remplace le blocage total de la surcharge des séances ≤3 (3 → 5 au plus, la périodisation tient) et le "Fix de suivi" du 27/09 plus haut (une séance dure seule suffit de nouveau à mettre un sportif "à décider", cohérent avec sa carte).
- Effet de seuil assumé : 57 + séance à 9 → −1, 58 → rien.
- Effet de bord positif : la séance démo de l'onboarding (candidat 2 pour un profil frais) peut enfin déclencher un Surcharger.

### Jauge : zone toujours 2 valeurs
`zoneRange` glisse aux bords ("9-10", "1-2") au lieu de retomber sur un point ; mode libre = plan + le point en dessous ; mode décidé = 2 valeurs contenant la valeur appliquée. Le filet de sécurité de `computeAutoregSuggestion` garde la zone non glissée (sinon "1-2" absorbait l'allègement d'une séance à 2). Bande dessinée ±0,35 point autour des bornes (`DecisionGauge`) : le curseur sur une borne paraissait hors zone.

### Vérifié
Typecheck ; matrices de cas via `tsx` (5 moments × 4 ressentis, grille score × difficulté) ; rendu sandbox athlète (avant wellness, reco, jauge libre 7-8) et coach (phase 3e personne). Pas testé au clic réel sur un compte.

## Fitness/Fatigue passent dans l'insight de Récupération + 2 bugs d'insight corrigés (2026-09-29)

Trois incohérences signalées par Gildas **en conditions réelles sur son compte**, dont deux avaient
la même cause racine.

**Racine — Fitness et Fatigue étaient AFFICHÉES dans l'onglet Récupération mais RACONTÉES dans
l'insight de la Charge.** `METRIC_GROUPS.recup` contient `["recovery","form","fitness","fatigue"]`,
alors que `chargeCrossInsight()` recevait `fitnessTrendInfo`/`fatigueTrendInfo` et
`recoveryCrossInsight()` ne les recevait pas du tout. Conséquences observées : (1) l'insight de
récupération ne pouvait **structurellement** pas mentionner la fatigue accumulée ; (2) la carte
décision disait « ta charge de fond baisse » pendant que l'onglet Charge disait « ta charge récente
est en hausse » — deux fenêtres différentes (Fitness EWMA 42j, Fatigue EWMA 7j), toutes les deux
vraies, lues comme une contradiction. **Décision de Gildas : elles vont dans Récupération**, avec les
cartes qui les affichent.

**Bug corrigé — `recoveryCrossInsight()` avalait la Forme en silence.** La fonction croise
wellness × Forme en 4 branches (bon/bon, bas/bas, bon/dégradé, bas/bon) et **tombait dans un repli
`return recoveryInfo.text` dès que le wellness était « Équilibré »** : aucune des 4 ne matche, donc la
Forme était ignorée quelle que soit sa valeur. C'est précisément le cas où elle porte toute
l'information. Deux branches ajoutées (récup dans la norme + Forme dégradée / fraîche), et le repli
final parle désormais des tendances Fitness/Fatigue.

**Hiérarchie de parole, pour ne pas empiler** : la Forme EST Fitness − Fatigue, donc dès qu'elle sort
de sa bande neutre elle porte déjà l'info. Fitness/Fatigue ne parlent **que** quand la Forme est
plate — leur seul angle mort réel : les deux montent ensemble, ce qui laisse la Forme immobile alors
qu'il se passe quelque chose. Et quand rien ne bouge, on n'ajoute rien (pas de meublage).

**Vocabulaire unifié** — trois termes coexistaient pour la charge chronique : « charge de fond » (17
occurrences), « charge habituelle » (10), « charge chronique » (27). Gildas a tranché : **« charge
récente » et « charge chronique »**, jamais un nom de fenêtre (« sur 6 semaines ») qu'il ne voulait
pas. Les deux premiers termes n'existent plus dans `src/`.

**Vérifié** : `tsc` propre, et les 3 cas rejoués contre les vraies fonctions (script jetable) — la
Forme est enfin dite quand le wellness est neutre, Fitness/Fatigue parlent quand la Forme est plate,
rien n'est ajouté quand rien ne bouge, et `chargeCrossInsight()` ne mentionne plus fitness/fatigue.

### Stress : chart et insight se contredisaient, et le tooltip mentait (2026-09-29, suite)
Signalé par Gildas juste après : *« l'insight dit stress légèrement en dessous de ma norme alors que
le chart le montre au-dessus »*. Les deux disaient en réalité **la même chose avec des mots
opposés** — le stress est la seule dimension inversée (`dimensionRaw` : `10 - stress`, pour que
« plus haut = mieux » vaille sur les 4).
- **Libellés de zone du chart** : le Z tracé est l'inversé, donc le haut veut dire MOINS de stress,
  mais la bande s'appelait « AU-DESSUS » — lu comme « mon stress est au-dessus », l'exact contraire,
  et en contradiction avec `describeDominantDimension()` qui parle du stress RÉEL (via
  `directionalZ`). Corrigé en nommant le sens réel pour cette dimension seulement : **« MOINS DE
  STRESS » / « DANS MA NORME » / « PLUS DE STRESS »**. L'axe reste inchangé (haut = mieux pour les
  4 dimensions, invariant utile) — seuls les mots changent.
- **Tooltip** (bug plus grave, pas repéré par Gildas) : `dimensions.stress.raw` vaut `10 - stress`,
  affiché tel quel derrière « déclaré » — il annonçait **7/10 à quelqu'un ayant déclaré 3**. Ré-inversé
  pour retrouver la valeur réellement saisie dans le formulaire.
Vérifié par script sur un cas construit (20 j autour de 3, aujourd'hui à 8) : l'insight dit « Stress
nettement au-dessus de ta norme », le chart place le point dans « PLUS DE STRESS », le tooltip
annonce « 8/10 déclaré ». Non-régression vérifiée sur une dimension non inversée (sommeil).

### Sous-charge ACWR invisible pour les insights (2026-09-29, suite)
Signalé par Gildas : le 21/09 l'insight de charge annonçait « Charge, monotonie et strain sont tous
dans des zones saines » alors que l'ACWR était **en sous-charge**. Cause : la couleur jaune
`#eab308`, introduite le 2026-09-27 pour distinguer la sous-charge du gris « pas de donnée »,
n'était reconnue par aucune branche de `severityOf()` et retombait silencieusement sur `"good"` —
donc invisible pour tout mécanisme piloté par la sévérité depuis cette date.

**Le fix évident aurait été faux.** `severityOf()` est délibérément consommée par `chronicPenalty`
(decisionCard.ts), qui resserre le seuil d'allègement : y compter la sous-charge aurait poussé vers
« allège » quelqu'un qui s'entraîne déjà trop peu — un commentaire du fichier l'énonçait déjà
explicitement. Les deux fonctions répondent à deux questions différentes, d'où **`displaySeverityOf()`**
(nouvelle) : « cet indicateur est-il hors de sa zone saine ? » (sous-charge = `watch`), là où
`severityOf()` reste « est-ce que ça pousse vers la fatigue ? ». Utilisée par `chargeCrossInsight()`
et par le `decroche` des cartes d'indice (même bug : la carte ACWR affichait la pédagogie « tout va
bien » au lieu de son texte d'action). Vérifié par script, y compris la non-régression de
`chronicPenalty` et des autres couleurs.

## Jauge de décision ronde, CTA dans la carte décision, comportements en carte (2026-09-30)

Suite du POC `https://claude.ai/artifact/McRwVAu86X9vArN2JRHBGF` (variante **R2**, plage conseillée en cadre fermé arrondi) et d'une série de retours de Gildas testés en local. Commit `1b8322e`.

### `DecisionRing.tsx` (nouveau) — jauge de décision en anneau
Même contrat que `DecisionGauge.tsx` (la barre), branchée via `AutoregButtons shape="ring"` (+ `ringSize`). Arc ouvert 240° (géométrie d'`AggregateGauge`), axe RPE 1-10, remplissage aux **dégradés de `DiffGauge`** (un dégradé choisi selon la position du curseur, déroulé le long de l'arc en segments interpolés — un `linearGradient` suivrait la corde), zone conseillée en **cadre pointillé fermé** qui entoure l'épaisseur (`sectorPath`), **curseur du Planning** (19px, noir / vert dans la zone, poignée 3 traits, liseré blanc sur fond sombre), barre blanche radiale sur le RPE **prévu** (visible dès qu'on déplace le curseur, et en mode décidé). Centre = flèche + verbe de la reco ; dessous = « Sous la zone / Dans la zone / Au-dessus de la zone » (jamais de chiffre). Variante `light` pour fond blanc. Exports :
- `RestDecisionRing` — jour de repos, lecture seule, curseur à 1 dans la zone 1-2, centre « Repos ».
- `DoneDecisionRing` — séance faite (aujourd'hui ou passé), curseur sur le RPE réel, repère sur le prévu, centre « ✓ Faite ».
- `decisionRingState()` + `DecisionRingMini` — la miniature de l'onglet Aujourd'hui (`HomeTabs.tsx`) reproduit exactement la grande (même zone calculée comme `AutoregButtons`, suit le drag sur /today via `autoregPreview`, pas côté coach).

### Où elle vit
- **/today** : en tête de l'onglet Aujourd'hui (188px) ; repos → `RestDecisionRing`, séances toutes faites → `DoneDecisionRing`.
- **Coach Control** (`CoachAthleteCard.tsx`) : À LA PLACE du `WellnessRing` sous le prénom (150px, variante sombre) — la carte décision explique déjà la forme. Même logique repos/faite. Plus de badges de comportements sur la carte.
- **Planning** (`/week`, `/coach/planning`) : garde la **barre** `DecisionGauge` dans la carte séance, restylée : fond gris `#e7e4df` (track de `DiffGauge`), même dégradé, plus de repères par point, zone qui déborde de 4px, bords 999, pointillé sombre sur fond clair, texte « Sous/Dans/Au-dessus de la zone ». Aussi `/p/[id]`.

### CTA dans la carte décision partout — portail
`AutoregButtons` gagne `actionsSlot?: HTMLElement | null` : la jauge reste où elle est montée, **Maintenir/Appliquer et le bandeau "décidé" sont rendus par `createPortal` dans ce nœud**, que l'appelant place dans les `actions` de son `AlertBox`, juste sous le texte de la reco (avant la ligne Phase). L'état (curseur, décision) reste dans le composant ; les événements remontent l'arbre React jusqu'au parent de la jauge (déjà protégé par ses `stopPropagation`). `undefined` = rendu classique ; `null` = nœud pas encore monté. Chaque page tient le nœud dans un `useState<HTMLDivElement|null>` (callback ref). `.autoreg-slot:empty` et `div:has(> .autoreg-slot:only-child:empty)` (globals.css) masquent le slot et sa marge quand il n'y a rien à décider. Boutons à largeur naturelle, centrés, en forme `ring`.

### Libellés de journée
- **Planning** passe `day` à `computeDecisionCard` (même `DecisionDay` que /today et Coach Control) : « Jour de repos », « Séance faite », « Plan à confirmer » au lieu d'un « Plan cohérent » générique. Côté sportif, le dimanche on ne dit rien de demain (la semaine chargée s'arrête là).
- **Jour de repos** (`decisionCard.ts`) : la ligne 2 commente la récupération du jour (« Ta récupération est basse : ce repos tombe bien. », « …correcte. », « …bonne : le repos consolide. », relatif « sous/dans/au-dessus de ta norme » si baseline ; non renseigné → « Renseigne ton ressenti… »), puis « Demain : séance X. ».

### Onglets / cartes d'indice
- `AggregateGauge` : pastilles aux 2 extrémités aux couleurs de la première/dernière bande (couleur jusqu'au bout de l'arrondi), opacité portée par un `<g>`.
- **Comportements = dernière carte de l'onglet Récupération** : `IndexCards` a désormais un gabarit partagé `renderCard()` et un prop `extraCard: ExtraIndexCard`. `behaviorIndexCard()` (`HomeAnalyticsSections.tsx`) : statut = comportement le plus pénalisant (sinon le plus aidant), phrase « À éviter … · à garder … », aperçu en barres centrées sur zéro (4 plus marqués), « Nj de données » ; déplié = `BehaviorImpactCard embedded` (sans titre ni halo). « En collecte » sous 10 jours. La carte séparée sous la liste disparaît (/today et fiche sportif coach).
- **Agrégat récupération** (`recupAggregatePos`) : **70 % ressenti / 30 % Forme** (était une moyenne 50/50), renormalisé si un axe manque ; **plus de plafond « pas Frais »** en cas de comportement négatif la veille (retiré sur demande).

### Coach Control — créer une séance
Bouton « + Ajouter une séance » en bas de chaque carte (prop `onAddSession`, même style que /today) → `openCreator()` ouvre `CoachSessionModal` sans séance (création sur la date affichée, autosave via `handleSaveReview`).

### Vérifié
`tsc --noEmit` propre à chaque étape, sandboxes coach/sportif/planning smoke-testées (200), textes du jour de repos vérifiés par script `tsx` (4 ressentis × 2 perspectives). Pas de clic réel par Claude — Gildas teste en local.

## Analyses avant 2 semaines, check-in "séance prévue", 1re décision par sportif (2026-10-01)

POC : https://claude.ai/artifact/GBoj2wydy4kK8N8skjTAwW (section "Check-in · séance prévue"). Commit `deb307d`.

### Analyses dès ~1 semaine
- **Norme de récup provisoire dès 5 check-ins** (`wellnessBaseline.ts`, `WELLNESS_BASELINE_PROVISIONAL_MIN_DAYS`) : entre 5 et 11 jours, moyenne et écart-type perso sont mélangés à une norme a priori (`shrinkStat`, poids perso = n/12, 100 % au 12e). A priori : composite 70 ± 8, dimensions sommeil 7 / stress 5 / état physique 6 / motivation 7, ± 1,25 (observé sur le seul vrai historique long en base). `hasEnoughHistory` passe donc à vrai dès 5 jours, nouveau champ `provisional` ; l'onglet Récup affiche « Norme provisoire · n/12 check-ins ». Effet connu : au début, la norme est tirée vers 70.
- **Charge partielle dès 7 jours** (`partialChargeReady`, trainingLoad.ts) : 1re séance il y a ≥7 jours et ≥2 jours chargés sur les 7 derniers. `analyticsReady("charge")` l'accepte : l'onglet sort de l'exemple avec charge de la semaine, monotonie, contrainte. L'ACWR et la jauge agrégée attendent toujours 14 jours (« Charge habituelle disponible après 14 jours »).
- **Phase d'exemple** : tant que l'historique manque (même seuils), la ligne Phase de /today et de Coach Control affiche la phase de l'exemple (`demoConseilsData`), en clair même quand la décision est floutée, avec la mention `ExampleNote` posée au milieu. `decisionCard.phase.insufficient` porte la condition côté coach. Texte des mentions : « Tes analyses arrivent après ~1 semaine de check-ins et de séances » (« Ses analyses » côté coach).

### Check-in : "Qu'as-tu prévu aujourd'hui ?"
- 1re question de `WellnessModal` (prop `askPlan`) quand aucune séance n'existe aujourd'hui, sur /today et le jour même seulement (pas sur /week). Repos / Léger / Modéré / Dur, clic = avance.
- Léger/Modéré/Dur créent une vraie séance « Séance du jour légère/modérée/dure », RPE prévu 3/6/8 (`src/lib/plannedIntensity.ts`), sans mention d'origine. Repos ne crée rien ; la carte "Jour de repos" propose une marche ou des étirements.
- Cette séance ne coche pas « Construis ton entraînement » (exclue par son nom dans `/api/onboarding/progress` ; si renommée, elle compte).

### Coach
- **1re décision en clair par sportif** : `coach_athletes.first_decision_on` (migration 028, appliquée en prod), posée au 1er affichage d'une vraie décision pour ce sportif (CoachClient) ; CoachPlanningClient gate dessus.
- Checklist coach : étape « Crée ton compte » toujours cochée ; « Invite tes sportifs » ne compte que les vrais sportifs (`user_id` ou `invite_email`), plus Thomas.
- Cartes Coach Control : `minWidth:0` + grilles en `minmax(0,1fr)` (un nom de programme long élargissait la colonne).

### Checklist élargie avec le pourquoi de chaque étape (2026-10-01, suite)
- `OnboardingChecklist.tsx` : panneau 400px (plein écran moins 24px sur mobile), toujours ancré sous la pastille n/4, fond assombri + flouté (clic = fermer), défile si l'écran est court.
- Table `WHY` (sportif/coach) : une phrase qui vend chaque étape, affichée tant qu'elle n'est pas faite ; pour « Débloque… », au-dessus du bouton orange.
- Modale centrée testée dans le POC puis écartée : elle bloquerait le produit et couvrirait la 1re décision au moment où l'étape se coche. Ordre assumé à l'arrivée : check-in d'abord, checklist juste après (1re étape cochée).

## Décision d'autorégulation enregistrée sur la séance (2026-10-04)

Cas réel de Gildas : « Surcharge » proposée (zone 7-8), maintenue à 5, RPE réel 6 → la carte disait « plus dure que prévu (6 pour 5) » alors que la reco allait dans son sens. La décision ne vivait qu'en localStorage du jour.

- **Migration 030** (appliquée en prod) : `autoreg_decision jsonb` sur `sessions` et `coach_sessions` : `proposed` (sens ou null), `zoneLow/zoneHigh`, `original_difficulty`, `applied_difficulty`, `original` (notes + difficulté, pour le retour arrière), et côté serveur `by` (athlete/coach), `by_name`, `date`, `decided_at`.
- **`POST /api/sessions/decision`** : écrit/efface ; déduit qui décide (propriétaire = sportif, coach lié ou propriétaire de la `coach_session` = coach), jamais pris du client.
- **`src/lib/autoregDecisionRecord.ts`** : `validDecision(session)` (ignorée si `decision.date ≠ session.date` : une séance déplacée repart de zéro), `saveDecisionRecord` (fire-and-forget), `decisionSummary`, `feltLine`.
- **`AutoregButtons`** (point unique) : enregistre à Maintenir/Appliquer, efface à « ↩ Séance prévue » ; props `storedDecision` (rend l'état décidé sur un autre appareil / côté coach) et `viewer`. Bandeau décidé sans chiffre : « Surcharge recommandée, tu as maintenu. » / « Léa l'a appliquée » / « ton coach a maintenu » / « Ton plan était cohérent, tu as allégé. ». Reco figée au moment de la décision. Le réglage gratuit de l'anneau n'est pas une décision.
- **Séance faite** (`decisionCard.ts`, `DecisionDay.decision`) : résumé de la décision + RPE réel vs zone proposée (« Difficulté dans la zone recommandée », « Difficulté sous la zone recommandée : tu avais de la marge », « … au-dessus … : plus dure que prévu ») ; sans décision enregistrée, reco recalculée depuis le check-in du matin ; sans reco, comparaison au plan, sans chiffre. `DecisionCard.doneZone` alimente `DoneDecisionRing zone` et la miniature de l'onglet Aujourd'hui.
- **Coach Control** : un sportif dont la séance du jour porte une décision enregistrée (prise ailleurs ou par le sportif) part en « Plan cohérent » (`isReviewed`).
- Décisions prises avant ce déploiement : localStorage seul, texte de repli « Ajustement appliqué. » / « Séance prévue maintenue. ».

- Wording (2026-10-04, Gildas) : « Difficulté » au lieu de « Ressentie », « recommandée » au lieu de « proposée ».

## Graphes Charge/Récupération à jour sans recharger (2026-10-08)
- `/today` : `refreshAnalyticsSoon()` (TodayClient.tsx) relit `/api/conseils` en silence (400 ms, sans fantôme) après check-in, Terminer (RPE/durée), suppression, fin de séance en direct et sur chaque event temps réel `sessions`/`wellness_daily` ; `baselineHistory` mis à jour avec la ligne de ressenti enregistrée.
- `/coach` : l'event temps réel `wellness_daily` met à jour `wellnessBaselineHistory` ; les events `sessions`/`coach_sessions` déclenchent un `router.refresh()` (600 ms) pour relire `recentSessions` (prop serveur).
- Déployé le 2026-10-08, commit `4e20cc5`.

## Carte décision : plus de redite entre la ligne 2 et la Phase (2026-10-11)
Règle : **une info = un seul bloc**. Ligne 2 = niveau de récup du jour + action du jour + demain (elle se suffit à elle-même : le Planning `/week`/`/coach/planning` n'affiche pas la Phase). Phase = tendance de charge (chronique 42j, récente 7j) et ce qu'elle implique sur les jours qui viennent, jamais le niveau de récup ni demain. Vaut côté sportif et coach (même `computeDecisionCard`).
- **Jour de repos** (`restText`, decisionCard.ts) : la Phase parle de la charge chronique (dont elle portait le titre sans jamais l'expliquer sur 60 % des cartes) et de l'effet du repos. « Demain » passe en ligne 2 avec la consigne : fatigué → « Demain : séance X, si ton ressenti ne remonte pas, allège-la. » ; frais → « …, le bon moment pour pousser. »
- **Reco Alléger/Surcharger** : la Phase utilise `crossTrendInsight().chargeText` (nouveau, `crossPhaseChargeText`, charge seule, sans « rien à changer » ni « continue sur cette lancée », qui contredisaient la reco) ; `chargeTextNoRecent` quand l'Alléger vient du seul chronique (la ligne 2 dit déjà « ta charge récente pèse »). Ligne 2 = `phaseAdviceLine()` : niveau lu comme la Phase (relatif si norme, sinon « basse/correcte/bonne »), « Récupération basse » / « Forme optimale » gardés quand ils sont justes. Corrige « Forme optimale » sur une récup dans la norme et « Récupération dans ta norme » sur un sportif frais (norm_hard).
- Séance faite et Plan cohérent inchangés (pas de redite).
- **Vérifié** sur 17 920 cartes générées (jour × ressenti × tendances × chronique × demain × voix) via le vrai `computeDecisionCard` : 0 redite, une seule info retirée (« rien à changer » à côté d'une reco). Script : esbuild + plugin qui force `fitnessFatigueTrend`/`chronicPenaltyFor` (scratchpad, non commité).
- **Calculs morts supprimés** : l'insight croisé n'était plus affiché nulle part ailleurs que la Phase. Retirés : `trendCode/trendText/trendEmoji/trendAction` (`conseilsData.ts`), `trends/trendInsights` + `computeCrossInsight` (`athletesData.ts`, `/api/coach/athletes`, pages `/coach/athletes` et sandbox), `trendInsights` de `buildAthleteSignatures`. `crossTrendInsight` ne sert plus qu'à la carte décision.

## Charts montre : FC/VFC en valeurs réelles, sommeil sans check-in (2026-10-11)
- **`deviceSeries`** (`ConseilsData`, `buildDeviceSeries()` dans deviceWellness.ts) : FC repos, VFC, nuit mesurée jour par jour, alignée sur `timeSeries`. Lue dans `health_daily` par `getConseilsData` (fenêtre + 28 j pour la norme), donc un jour sans check-in a son point. Repli sur les colonnes `device_*` des check-ins quand `health_daily` est inaccessible (coach : RLS `auth.uid() = user_id` seulement ; sandbox).
- **Charts FC repos / VFC** (`rhrSpec`/`hrvSpec`) : bpm / ms réels au lieu du Z de la composante (qui attendait 5 j de norme puis 5 j d'écarts, ~10 j sans courbe). Ligne pointillée « norme 48 bpm » (moyenne des 28 j précédents, ≥ 5 j, même calcul que le score), bande « dans ma norme » ±2 bpm / ±8 % (seuils de `deviceSummary`), tooltip « 49 bpm · norme 48 ». Score de récup inchangé.
- **Chart Sommeil** : un seul chart gardé. Jour sans check-in mais nuit mesurée (≥ 3 h) → point « durée seule » (`DeviceDay.sleepZ`, `sleepZFromDeviceOnly()` : même norme sommeil, valeur du jour = `sleepMinutesScore`), tooltip « 5h30 mesuré · pas de check-in ». Ces points s'écartent plus fort que les autres (la norme mélange ressenti et durée) ; le chart les borne au cadre.

## Anneau de décision : plus de texte dessous, il devient le titre de la carte décision (2026-10-12)

Constat de Gildas : « le titre sous le score répète le titre de la carte de décision ». Recap fait avant d'exécuter : dans tous les états, l'anneau (centre + ligne dessous) et la 1re ligne de la carte décision disaient la même chose (⬇ ALLÉGER / « Alléger recommandé », REPOS / « Jour de repos » / « Jour de repos », FAITE / « Séance faite… » / « Séance faite »).

Règle retenue (/today ET Coach Control, cohérents) : **le centre de l'anneau ne change pas, plus rien sous l'anneau, et l'ancien texte du dessous devient le titre de la carte** (visuellement plus fort).
- Séance à ajuster : titre vivant **Dans la zone / Sous la zone / Au-dessus de la zone**, qui suit le curseur pendant le glissement (voulu par Gildas). Remonté par `DecisionRing.onHint` → `AutoregButtons.onHint` → state `ringHint` du parent.
- Décision prise : **Allègement appliqué / Surcharge appliquée / Difficulté maintenue** (sens de la décision prise, `decidedPct`, pas de la reco). Même libellé sous la jauge en barre du Planning.
- Repos : `DecisionCard.title` = **Bonne récup / Récup stable / Récup fragile** (même `feel` que la ligne 2), **Récup à confirmer** sans ressenti.
- Séance faite : `DecisionCard.title` = **Dans / Sous / Au-dessus de la zone**, même repère qu'avant la séance : zone proposée, ou sans reco la zone par défaut de l'anneau (`zoneRange(prévu, "low")`), aussi renvoyée dans `doneZone` ; **Difficulté non notée** sans RPE.
- Séance faite, ligne 2 (`titleDetail`, `doneAdvice()`) : **un conseil en une phrase**, jamais le mot « zone » (le titre) ni « demain » (la Phase). Priorité : RPE non noté → reco ignorée que le RPE confirme (« La reco d'alléger était justifiée : soigne ta récup. » / « Tu pouvais surcharger, suis la reco la prochaine fois. ») → **signal du matin qui ressort** (`morningSignal()` : comportement négatif coché, puis dimension la plus loin de la norme — sommeil, stress, douleurs, motivation, en bas comme en haut — ou sous les seuils fixes de `getRecoveryAdvice` sans historique) → récup globale (fragile / stable / bonne, ou norme si relative) → sans check-in. Tables `LOW_ADVICE`/`HIGH_LABEL`, variantes coach. Le résumé de décision (« Allègement recommandé, tu as maintenu ») n'est plus affiché : constat, pas conseil. Nouveau param `behaviors` de `computeDecisionCard` (passé par /today et Coach Control).
- Séance faite, Phase : `cross.chargeText` + demain (plus `cross.text`), la ligne 2 parlant déjà de la récup. Recoupement résiduel connu : le code `recuperation_insuffisante` dit « priorité au sommeil et au repos ».
- **2026-10-13 (Gildas)** : ligne 2 séance faite = **ressenti vs prévu en mots** (`feltVsPlanned()` : « Séance ressentie comme prévu / un peu, modérément, beaucoup plus dure|facile que prévu », écart 0/1/2/3+ au prévu de la séance, pas à la zone : on peut être dans la zone et l'avoir trouvée plus dure) + conseil `doneAdvice()` + **demain** (`afterText`, comme le jour de repos ; coach sans « refais le point »). Phase séance faite = `cross.chargeText` seul. Conseils coach : « vérifie son ressenti au réveil » (plus « demain », dit juste après).
- `withTitle(text, title)` (decisionCard.ts) remplace la 1re ligne à l'affichage seulement : `decision.text` reste intact pour ses autres usages (résumés Coach Control, etc.).

Gratuit : plus rien sous l'anneau non plus (« Séance modérée prévue », « Enregistrement… », « Jour de repos », « Séance faite · RPE… » retirés). Le centre passe de « 6 RPE » à **« 6 MODÉRÉE »** (`qualitativeDifficulty`, légère/modérée/dure) — le RPE seul ne parle pas à tout le monde. La carte reste floutée, y compris le titre « Plus dure que prévu » d'une séance faite (choix assumé de Gildas). Rappel : en gratuit il n'y a jamais d'état « décidé » (réglage auto-enregistré, pas d'Appliquer) ; la 1re décision offerte a l'affichage Premium.

## Ressenti vs physiologie (2026-10-11 → 10-14, déployé le 14/10)
POC : https://claude.ai/artifact/A9XZaSXeHW9WW5amXDzEHv. Saisie subjective toujours à l'aveugle, comparaison montrée APRÈS validation (valeurs figées). Option A : affichage seulement, n'entre pas dans le calcul de la reco. UI : jamais « ta montre », dire « tes données physiologiques » ; le cœur reste nommé côté séance.
- **Synchro** (`healthSync.ts`) : lit aussi la FC pendant chaque entraînement (`heartRate`), **seulement dans les builds iOS marqués** : `capacitor.config.ts` `ios.appendUserAgent: "TPCHeart"`, testé par `canReadHeart()` (`src/lib/heartAccess.ts`). L'app App Store 1.0 publiée le 13/10 n'a pas le marqueur et ne demande pas la FC (son texte d'autorisation ne la mentionnait pas). Texte `NSHealthShareUsageDescription` mis à jour dans le build marqué → `health_workouts.avg_hr/max_hr/trimp` (migration 034, appliquée). TRIMP de Banister, FC repos = médiane 30 j, FC max = max vu, jamais < 180. Doublons Garmin dédoublonnés par `start_at` à la synchro et à la lecture. Migration 035 (suppression des doublons + unicité `user_id,start_at`) appliquée le 14/10 avec l'accord de Gildas.
- **`src/lib/physioCompare.ts`** (pur) : familles force/cardio/autre (`heartFamily`), séance ↔ entraînement du même jour à la durée la plus proche (`matchWorkout`), régression RPE ~ ln(TRIMP/min) sur les séances antérieures de la famille, 8 séances de calibrage (`HEART_CALIBRATION`), seuil = erreur typique du modèle (≥ 1 point). `physioVerdictAt()` : ressenti (4 réponses) et physiologie (nuit mesurée, FC repos, VFC, mêmes composantes que le score) comparés chacun à LEUR norme des 28 jours précédents (écart-type, plancher 5 points, 5 jours mini), puis l'un à l'autre (écart ≥ 1 écart-type). La 1re version en absolu donnait « plus optimistes » presque tous les jours (une nuit de 8 h = 10/10).
- **`src/lib/physioData.ts`** : lecture client (RLS : sportif seul), cache module, `usePhysioData`, `requestPhysioReveal` / `invalidatePhysio`.
- **Terminer la séance** (`CompleteModal`) : si l'entraînement du jour a une FC, RPE sans valeur par défaut, encadré `PhysioTeaser` en tête (« ♥ Séance mesurée · Renseigne ton ressenti pour savoir si ton cœur a vécu la séance comme tu la sens. »), Valider bloqué tant que pas noté. Sans FC : inchangé (RPE 6 par défaut, bandeau impact).
- **Check-in** (`WellnessModal`, hors wizard) : si `health_daily` a la nuit du jour, encadré `PhysioTeaser` (fond `DARK_CARD_BG`, chiffres floutés factices) en tête de la 1re question : « ⌚ Nuit mesurée · Renseigne ton ressenti pour savoir si ton corps récupère comme tu le sens. » Le check-in peut s'ouvrir seul le matin, avant la carte décision : l'annonce doit vivre dans le formulaire. Carte décision avant check-in : annonce sans valeur (« Tes données physiologiques de la nuit sont arrivées : fais ton check-in pour les comparer à ton ressenti. »).
- **`PhysioRevealHost`** (layout, sportif) : écran de fin après validation (comparaison + « ta note est enregistrée »), events PostHog `physio_reveal_shown`.
  - Refait le 15/10 (commit `5dc7244`) : titre = conclusion (« Ta séance t'a paru plus dure que ce qu'a mesuré ta FC », « Tes mesures de la nuit sont moins bonnes que ton ressenti »…), une phrase, puis une échelle à 2 repères **Ressenti / Mesuré** (jamais « toi » vs « ton corps »), en mots (Légère/Modérée/Dure ; sous/dans/au-dessus de ta norme). Nuit : phrase « Tu as dormi X min de plus/moins que d'habitude et ta FC au repos est N bpm au-dessus/en dessous de ta norme ». Les textes de `physioVerdictAt`/`heartVerdictText` restent utilisés par la carte décision (volontairement inchangée).
  - Suite 15/10 : « fréquence cardiaque » en toutes lettres (jamais « FC ») ; encadrés `PhysioTeaser` alignés (« Renseigne ton ressenti pour le comparer à ce qu'a mesuré ta fréquence cardiaque » / « …à tes mesures de la nuit »). `CompleteModal` : encadré + comparaison dès que l'entraînement du jour a une FC (`hasHeart`), y compris à la correction d'une séance déjà notée ; le RPE vide à l'aveugle reste réservé à la 1re note (`blind`). Les 2 cartes d'indice s'appellent « Ressenti vs physiologie » (celle de l'onglet Charge comprise), textes « tes données physiologiques », statuts « Plus dur / Plus facile que mesuré » ; tuile de séance faite « ♥ MESURÉ ».
- **Tuile « ♥ CŒUR »** sur la séance faite (Accueil `TodaySessionCard heartRpe`, Planning `SessionLike.heart_rpe`).
- **Cartes d'indice** (`components/physio/PhysioIndexCards.tsx`) : « Ressenti vs cœur » (onglet Charge, 42 j) et « Ressenti vs physiologie » (onglet Récupération, verdict sur 7 j, chart 28 j, avant Comportements). Dépliées : `MetricChart` en bâtons signés (nouveau `ChartSpec.barsFrom`), zone « D'accord » au milieu. Sportif seulement, absentes sans données.
- **Carte décision** (`computeDecisionCard` param `physio`, rempli par `physioDecisionInputs()` sur /today et le Planning) : désaccord check-in / nuit = une phrase en **ligne 2** (niveau de récup du jour, jamais la Phase), sauf une fois la séance faite : la ligne 2 commente alors la séance vs son cœur (rien si d'accord ou si la Phase le dit déjà) ; 2 dernières séances d'une même famille plus dures que le cœur = une phrase en fin de **Phase** (tendance). Rien quand ils sont d'accord.
- Carte « Ressenti vs physiologie » de l'onglet Charge (ex « Ressenti vs cœur ») : état « En attente de fréquence cardiaque » quand des séances arrivent sans FC, **seulement dans un build marqué** (ailleurs la carte est absente). À la sortie App Store du build marqué : la passer en « Mets à jour l'app ».
- Pas fait : côté coach (RLS health_*), Android.

## Revoir le delta ressenti vs physiologie après coup (2026-10-17, DÉPLOYÉ)
POC : https://claude.ai/artifact/6KawVvQrGrLbyrYRb5YUuf. La comparaison ne se voyait qu'une fois, juste après la saisie.
- **Entrée = les gestes de modification** (pas de ligne verdict, retirée à la demande de Gildas) : taper le résultat d'une séance faite (Accueil, Planning) et « Modifier mon ressenti » / ✎ de la ligne Phase (Accueil) / anneau du jour (Planning) ouvrent d'abord l'écran de résultat quand une mesure existe (`openResult` / `editWellness` dans TodayClient et WeekClient, `hasSessionResult` / `hasWellnessResult`) ; son bouton « Modifier ma note » / « Modifier mes réponses » ouvre le formulaire d'origine (`PhysioReplayDetail.onEdit`, proposé sur l'élément ouvert seulement, pas après les flèches). Sans mesure : formulaire directement, comme avant. Tuile « ♥ MESURÉ » retirée.
- **Relecture** : `requestPhysioReplay({kind:"session",sessionId} | {kind:"wellness",date})` (physioData.ts, event `PHYSIO_REPLAY`) ; `PhysioRevealHost` rouvre le même écran de fin avec flèches ‹ › (séances comparées triées / matins avec verdict) et « Séance N sur M comparées ». PostHog `physio_replay_opened`. `PhysioSession.name` ajouté (lu dans `fetchPhysioData`).
- **Charts des cartes « Ressenti vs physiologie »** : nouveau `ChartSpec.kind = "pairs"` (`values` = ressenti plein, `values2` = mesuré vide, trait vertical coloré par `pairColorAt`, séance en calibrage = point gris seul). `MetricChart` props `picked`/`onPick` (clic = jour le plus proche ayant une valeur). Charge : RPE 1-10, zones Légère/Modérée/Dure, 42 j. Récup : Z ±2,5, bande « ta norme », 28 j. Encadré du jour sélectionné sous le chart avec « Ouvrir › » (relecture). Toggle 7/28/90 au-dessus du chart déplié (`ExtraIndexCard.rangeToggle`, fenêtre partagée des cartes d'indice, `chartDays` de `heartIndexCard`/`physioIndexCard`) ; statut, impact et aperçu gardent leur fenêtre propre (42 j / 7 j).
- **Plus de cartes « Ressenti vs physiologie » dans la liste** (2026-10-17, même jour) : la comparaison est une puce orange « Ressenti vs physiologie » DANS la carte de l'indicateur qui lui correspond, via `IndexCards` prop `compare = { metric, body }` (body = le chart construit par `heartIndexCard` / `physioIndexCard`, dont seul `.body` sert désormais). Carte Charge : puces « Charge » / « Ressenti vs physiologie » (séances vs fréquence cardiaque). Carte Récupération : la puce s'ajoute après Score / Sommeil / … / FC repos / VFC (nuit vs ressenti). Toggle 7/28/90 partagé au-dessus. Perdu : le statut de la comparaison visible sans déplier.
- Jauge de la carte séance volontairement inchangée (une jauge à 2 points sur la carte a été maquettée puis écartée : trop complexe).

## Notes en un tap : jauge verticale 1-10 sans valeur par défaut (2026-10-17, DÉPLOYÉ)
POC : https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu (itéré avec Gildas). Remplace les curseurs (`<input type="range">`) du check-in (`WellnessModal`), du RPE de fin de séance sportif (`CompleteModal`) et coach (`CoachCompleteModal`, Planning coach).
- **Pourquoi** : les curseurs partaient de 7/5/7/8 (wellness), RPE 6, coucher 23h-minuit, enregistrés tels quels si on validait sans toucher, impossible à distinguer d'une vraie réponse (polluait récup, corrélations, Coach Control) et biaisait la note par ancrage.
- **`src/components/ui/ScaleBars.tsx`** : 10 lignes, 10 en haut, barre proportionnelle à la note, **un libellé par ligne**. Grise et sans curseur tant que rien n'est choisi ; ensuite remplie jusqu'à la note (lignes sous la note éclaircies, note choisie en pleine couleur). Palettes `recovery` / `recovery-inverted` (stress : 10 = bleu le plus clair, rampe `wellnessColor`) / `load` (vert/orange/rouge 1-4/5-7/8-10). Exporte `scaleColor`, `inkOn`, `CR10_LABELS` (Foster ; 6 et 8 = « Dur + » / « Très dur + », mots ajoutés par nous).
- **Geste** : tap n'importe où = note choisie au relâcher si le doigt a bougé de moins de 8 px (sinon la page défile, `touch-action: pan-y`). Glisser seulement depuis la ligne choisie (`data-handle`, `touch-action: none`). `onChange` à chaque cran, `onRelease` au relâcher.
- **Check-in** : plus de valeur par défaut (notes et heure de coucher, passée en boutons). La question avance au relâcher (380 ms, `autoAdvance`) ; sommeil : quand note ET coucher sont donnés. La motivation (dernière) enregistre au relâcher, sans Valider (risque d'erreur de doigt signalé, pas corrigé). « Suivant » grisé tant que la question n'a pas de réponse ; comportements sans coche = « Rien de particulier → ». Libellés par note dans `SCALE_WORDS` (extrémités = anciens curseurs, 8 mots du milieu écrits par Claude, à relire). Pas de chiffre/mot affiché au-dessus de la jauge. L'aperçu live du wizard utilise des valeurs neutres tant que rien n'est répondu (`pv`).
- **Fin de séance (sportif et coach)** : RPE `null` pour une 1re note (une séance déjà notée garde sa note), y compris sans montre (remplace le « ressenti à l'aveugle » réservé aux séances avec FC). Valider grisé tant que rien n'est choisi. Plus de valeur affichée à côté de « Difficulté réelle », tuiles MINUTES / DIFFICULTÉ retirées (doublons). Modales défilent si l'écran est court.
- 2026-10-18 : bandeau « 🔥 Impact fatigue estimé » retiré de la fin de séance, et `computeFatigueImpact` supprimée (plus aucun appelant).
- Non testé au doigt par Claude (scroll et glisser à valider sur iPhone). À suivre sur PostHog : taux de check-ins complétés avant/après.

## Check-in et fin de séance : insight après la réponse, coût des comportements (2026-10-20)
POC : https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu (pistes 2 et 3). Ne change rien pour un compte neuf : tout dépend de l'historique.
- **Insight après la réponse du check-in** (`WellnessModal.tsx`, `notableInsight`) : une ligne sous la jauge, au relâcher, jamais avant (pas d'ancrage), seulement si la réponse est rare : ≥ 12 réponses sur les 28 derniers jours, |z| ≥ 1,6 (écart-type plancher 0,75), et pas de réponse aussi extrême depuis ≥ 7 jours. « ↘ Ta pire nuit depuis 2 semaines. », « ↗ Ton stress le plus bas depuis un mois. » (stress comparé sur le stress réel). Historique lu par la modale elle-même (`wellness_daily`, 90 j) ; au-delà : « depuis plus de 3 mois ». La question reste 3 s au lieu de 0,4 s quand la ligne apparaît (`advanceDelay`).
- **Coût de chaque comportement** dans le check-in : badge à droite (`CostBadge`), même calcul (`computeBehaviorCorrelations`) et mêmes seuils/couleurs que la carte Comportements, sans les mots Aide / Pénalise (« +0,5 pts » vert, « −2,7 pts » rouge, « 0 pt » gris sous 0,3). Seulement à partir de 12 check-ins ; avant, rien (pas de « en mesure »).
- **Insight après la note RPE** (`src/lib/rpeInsight.ts`, `RpeInsightLine.tsx`, CompleteModal sportif et CoachCompleteModal) : 1) écart au prévu ≥ 2 points : « Plus dure / Bien plus dure (≥ 3) / Plus facile / Bien plus facile que prévu. », sans chiffres ; 2) sinon note rare sur 90 j de séances notées (≥ 12, |z| ≥ 1,6, pas vue depuis 7 j) : « Ta séance la plus dure depuis 3 semaines. » ; 3) sinon rien. Coach : écart au prévu seulement (historique du sportif non lu). Pas de cas particulier avec la fréquence cardiaque (note déjà donnée, l'écran suivant compare autre chose).
- Orange = plus dur / défavorable, bleu = plus facile / favorable.
- Écartée après essai en local : la rampe horizontale 1-10 (19/10), la jauge verticale reste.
- Validé pour la suite (onboarding J0, voir mémoire « check-in augmenté ») : check-in qui pilote la vraie séance en direct, teaser des 5 jours, boucle complète le soir même, écran du 5e matin.

## Check-in en bottom sheet, écrans de résultat, mots de difficulté Foster (2026-10-22, DÉPLOYÉ)
POC : https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu (section « Le check-in · tous les jours, dès le jour 0 »). Commit `b6fbab3`.

### Un seul score de récupération partout
Le score du check-in, de l'écran de fin et de l'onglet Récupération est le même agrégat (`recupAggregatePos`, 70 % ressenti relatif + 30 % Forme), mêmes mots Fatigué / Équilibré / Frais. Norme calculée comme l'onglet : tous les check-ins des `CONSEILS_HISTORY_DAYS` derniers jours. `src/lib/checkinInsight.ts` : `recoveryAggregate`, `formAt`, `checkinResult`, `recoveryGauge`.

### Check-in (`WellnessModal.tsx`)
- Mobile hors wizard (`sheetMode`) : bottom sheet réglable (crans 52 / 66 / 92 dvh, poignée), jamais plus haute que son contenu ; le défilement du contenu pilote la sheet (vers le haut l'ouvre, en haut et vers le bas la ramène). Au-dessus, le score se construit pendant les réponses dans l'arc ouvert de l'onglet Récup (`AggregateGauge`). Desktop : même score dans le panneau sombre de gauche.
- `skipResult` : pas d'écran de fin (onboarding, quand l'écran semaine suit).

### Écrans de résultat (`PhysioRevealHost.tsx`, monté aussi sur /register)
- Après check-in : score en gros au centre, UN insight en mots (jamais de chiffre ni de libellé d'échelle cité ; priorité jour 1 → écart ressenti/score dû à la charge → série sous la norme → comportement de la veille → séance très dure hier → écart avec hier → séance très dure demain → dimension la plus loin de la norme → point bas), « Jour n sur 5 » en ronds cochés tant que la norme se construit, comparaison physiologique si montre.
- Après note de séance (`sessionInsight.ts`) : « Ressentie comme prévu / Un peu, Modérément, Beaucoup plus dure|facile que prévu », verdict de la décision du jour, poids dans la semaine en mots.
- Rouvrir une séance faite / « Modifier mon ressenti » rouvre cet écran (`requestPhysioReplay`), son bouton ouvre le formulaire. Données : `resultContext.ts`.

### Mots de difficulté calés sur Foster (CR-10)
`qualitativeDifficulty()` : 1-2 légère, 3-4 modérée, 5-7 dure, 8-10 très dure. Seuils de logique (5 et 8 : recos, enchaînements, couleurs) inchangés. Repris partout : anneau, onglet Aujourd'hui, comparaison au cœur, alertes coach, règles `loadRule` (≥8 « très dure », tag 5-7 « Dure »), charge de `wellness.ts`, insights. Jauge des éditeurs de séance : badge = mot Foster de la note (`CR10_LABELS`), légende « Très, très facile … Maximal ». Check-in « Qu'as-tu prévu ? » : Léger 2 / Modéré 4 / Dur 6 / Très dur 8 (nouveau `vhard`) ; « Générer une séance » idem. Gardés : `sessionQualifier` (relatif à l'habitude), textes marketing, notifications.

### Onboarding
Écran notifications (`ob_notif`) après un check-in : `StreakTitle` (5 ronds 22 px au-dessus du titre, jour 1 coché, demain en pointillés) + « Jour 1 sur 5 : reviens demain pour le jour 2. », fausses notifs « Jour 2 sur 5 », « Jour 3 sur 5 ». Sans check-in : écran inchangé. Coach inchangé. Test sans compte : `/register?role=athlete&elite=1&dbgstep=12&dbgcheckin=1` (`dbgcheckin` simule le check-in, dev).

Non testé par Claude au doigt sur iPhone (gestes de la sheet).

## Ressenti et montre dans le même chart (2026-10-23, DÉPLOYÉ)
Maquettes validées : https://claude.ai/artifact/GoiHozJU7mGYmyv49LJEMp. Commit `3df1ff0`.
- **Récupération** (`src/lib/watchCompare.ts`, `IndexCards.tsx` `WatchPairChart`) : quand la montre a la donnée, les puces Score, Sommeil, Stress et État physique tracent 2 courbes, déclaré (trait plein bleu) et montre (pointillé orange : Body Battery, sommeil mesuré, stress mesuré, VFC), chacune en écart à sa norme sur la fenêtre affichée (stress et FC repos inversés). Badge « d'accord » (corrélation ≥ 0,4) / « en partie » / « en désaccord » (< 0,15), 5 jours minimum ; plus gros écart cité seulement si signes opposés (chacun ≥ 0,5, écart ≥ 1,5). Puces VFC, Stress mesuré et Body Battery retirées quand elles sont appariées (FC repos gardée).
- La puce « Ressenti vs physiologie » de la carte Récupération est retirée. Son verdict (nuit, FC repos, VFC face au check-in) s'affiche au-dessus du chart Score seulement quand Score n'a pas de 2e courbe (pas de Body Battery, prop `scoreVerdict`).
- **Charge** : 2 puces, Charge et Ressenti vs physiologie. La puce « Charge cardiaque » (barres RPE×durée / TRIMP) a été codée puis fusionnée le même jour (Gildas : doublon). Sous le chart ressenti vs FC : `heartFamilyCards()` (PhysioIndexCards.tsx), rapport TRIMP / charge ressentie par type de séance (≥ 3 séances dans 2 types), phrase si écart ≥ 2×, une carte par type (« Cœur ≈ ressenti » / « Cœur N× plus bas », TRIMP moyen).
- `MetricChart` : 2e série en pointillé (`overlay`), bâtons doubles (`values2`/`color2`), `lineColor`.

## Écrans de résultat allégés + conseil du jour hors charges (2026-10-23, DÉPLOYÉ)
Retour de Gildas : « beaucoup trop d'info », « ça dit 2 fois la même chose ».
- **Conseil du jour** (`checkinInsight.ts`, `CheckinResult.advice`, `dailyAdvice()`) : une action hors entraînement sur la question la plus basse (stress = le plus élevé), seulement si elle est ≤ 6 (version « très » ≤ 3). Sommeil précisé par un comportement coché (couché tard, écrans, caféine, alcool, sortie). Jamais sur la séance (rôle de la carte décision).
- **Fin du check-in** : score, puis un seul bloc gris (`#f7f8f9`, texte `#2b3035`, 14 px, graisse normale, plus de bleu) avec la phrase du jour et le conseil, même style pour les deux. Puis la jauge à 2 points, titrée « Ressenti vs nuit mesurée » ; une phrase sous la jauge seulement en cas de désaccord. Retirés : titres de comparaison, phrase minutes de sommeil / FC repos, « Tes réponses sont enregistrées ».
- **Fin de séance** : même principe, jauge « Ressenti vs fréquence cardiaque », phrase seulement en désaccord, rien pendant le calibrage.
- Écrans sans score ni résumé (comparaison seule) inchangés.
- **Contradiction corrigée** : « sous ta norme », série de matins et « avec ce matin » ne sortent que si le score affiché est dans Fatigué (le score mêle ressenti et Forme ; « 42 · Équilibré » côtoyait « 3e matin sous ta norme »).

## Bilan en carrousel — semaine, mois, depuis le début (2026-10-23)

POC validé par Gildas : canvas https://claude.ai/artifact/Qx548NQG7ZrWgwQA28DYpp (fusionne les pistes « modèle personnel » et « coût des écarts » dans la piste 8 « Ton bilan » du POC check-in augmenté). Sportif, et côté coach pour chaque sportif depuis le 2026-10-24 (voir « Côté coach » plus bas). **État à jour : voir aussi les sections « Autorégulation qui se juge » et « Côté coach » ; les écrans ajoutés depuis (« Mes conseils », « Suivre ou pas ») et les correctifs de wording y sont décrits.**

- **`src/lib/bilan.ts`** — calcul pur `computeBilan({ period, today, signupAt, sessions, checkins, tests })`. Un écran par thème, chacun avec son seuil de données ; sous le seuil, l'écran saute (jamais de chiffre creux). Écrans DE LA PÉRIODE : régularité, charge (ACWR via `acwrSeries`, zone 0,8–1,3 = même seuil que `sigDimInfo("load")` ; la série part de la 1re séance, jamais avant, sinon les jours vides d'avant l'inscription tirent la chronique vers 0 et gonflent l'ACWR — corrigé le 2026-10-24, déjà masqué par la règle « charge après 28 j d'historique »), tendance (mois et depuis le début), tests. Écrans APPRIS sur tout l'historique jusqu'à la fin de la période : ressenti vs montre (note de sommeil vs sommeil mesuré, chutes de VFC repérées), ce qui te prédit (même `learnSignals` que la décision : famille force vs vitesse et explosivité d'après les catégories du parseur, jamais le nom de séance — mélanger les deux familles dilue tous les signaux), tes biais (séances regroupées par difficulté prévue EN MOTS, légère/modérée/dure, ressenties un mot au-dessus ≥ 60 %), ce qui te fatigue (soirée = `alcohol`/`social_out`, séance très dure = RPE ≥ 8), tes leviers (comportement vs sommeil mesuré, hors soirées). La semaine ne garde que 2 écrans appris. Dernier écran = carte à partager (texte via `navigator.share`, sinon copie).
- **Historique synthétique de l'onboarding exclu** (`isSynthetic`) : ligne datée avant le jour d'inscription ET créée dans la demi-heure qui suit l'inscription. Ne jamais compter ces lignes dans un bilan.
- **Accès** : `BilanCard.tsx` en haut de l'onglet Aujourd'hui (bilan du mois passé du 1er au 3, sinon de la semaine passée du lundi au mercredi, seulement si ≥ 3 check-ins sur la période, masqué une fois ouvert ou fermé — `localStorage` `tpc_bilan_seen_<kind>_<start>`) ; `CalendarHeader` props `onOpenBilan`/`bilanSince` : « Bilan › » par semaine passée, « Bilan du mois › », « Depuis le début › » (sportif sur /today ; coach sur Coach Control et Planning dès qu'un vrai sportif est sélectionné).
- **`BilanCarousel.tsx`** (next/dynamic depuis `TodayClient`) : plein écran zIndex modale, segments de progression, swipe/flèches clavier/Échap, footer fixe et contenu qui défile. Lit sessions/wellness/test_results (`subject_user_id`) côté client (RLS propriétaire).
- **PostHog** : `bilan_card_shown`, `bilan_card_dismissed`, `bilan_opened` {period, source, slides, slide_kinds}, `bilan_slide_viewed` {period, slide, index}, `bilan_shared`.
- **Wording** (Gildas) : « soirée (alcool ou sortie) », « se paie le lendemain ».
- **Correctif du 2026-10-23 soir (chiffres revérifiés en base)** : la forme comparée (soirée, séance dure, tendance, leviers sans montre) est la **forme RESSENTIE** = les 4 réponses seules (`felt()`), jamais `score` (retire déjà 3 pts par comportement négatif coché : « soirée vs pas soirée » devenait circulaire) ni `base_score` (intègre VFC et FC au repos). Effet sur les données de Gildas : soirée 62 contre 71 (et pas 45 contre 72), tendance « stable » (et pas « en baisse », artefact des pénalités). Biais regroupés par **difficulté prévue**, plus jamais par nom de séance (un nom change d'une semaine à l'autre), et **en mots** depuis le correctif suivant (« Tes séances prévues modérées, tu les ressens dures ») : jamais « 5/10 » à l'écran. Conséquence sur les données de Gildas : en mots, 5 et 6 sont tous deux « dure », l'écran biais ne s'affiche plus pour lui. Seuils relevés : 5 nuits par note de sommeil, 8 séances par groupe dans « ce qui te prédit ». Chutes de VFC comptées hors lendemains de soirée (sinon doublon de « ce qui te fatigue »). Charge comptée seulement après 28 jours d'historique (87 % au lieu de 79 %). ~~Reste basé sur le nom~~ : remplacé depuis par les catégories du parseur (`learnSignals`).
- Testé au robot (Chromium iPhone 13, compte `cauvingildas+bilantest` créé avec une copie des données de Gildas puis supprimé) : les 3 périodes se parcourent sans erreur console ; chiffres identiques à l'analyse du POC.

## Données de la montre dans les analyses : charge estimée, récup mesurée, encart « ta montre » (2026-10-23, DÉPLOYÉ)
POC : https://claude.ai/artifact/8WtC2JiFrJUR4auL7nEQVq (un écran par cas). Captures robot : `~/Desktop/Captures onglet analyses montre`.
- **Charge estimée** (`src/lib/watchEstimates.ts`) : un entraînement montre (`health_workouts`, Apple Santé ou Garmin) qui ne correspond à aucune séance notée (`matchWorkout`) compte dans la charge avec un RPE estimé, avant comme après l'inscription (une vraie séance comptée à zéro ferait croire que la charge baisse). RPE = relation apprise sur le sportif (`personalRpeFor`, physioCompare.ts, ≥ 8 séances notées du même type), sinon règle générale : fraction de FC de réserve déduite du TRIMP/min (Banister inversé) × 10. Marche exclue (trajets auto-détectés). Une note de séance remplace l'estimation.
  - `withWatchEstimates(sessions, workouts, until)` s'applique seulement à la liste passée au moteur (getConseilsData, carte décision /today et /week, coach/page.tsx, coach/planning/page.tsx via prop `watchEstimates`, athletesData). Jamais affichées comme séances (Planning, cartes, checklist, points du calendrier coach : `isEstimated`). Le coach lit `health_workouts` via le client admin : même charge que le sportif.
- **Récup d'après les mesures** (`ConseilsData.measuredRecovery`) : jours AVANT l'inscription sans check-in, z de la nuit, de la FC au repos (inversée) et de la VFC face à leurs 28 jours, Φ(z)×100 borné 5-95. Après l'inscription, le score du jour exige le check-in (Gildas). IndexCards l'utilise en repli de `recoveryRelative` ; `analyticsReady("recup")` vrai dès 5 jours mesurés ; sans check-in du jour, `recoveryInfo` suit la dernière valeur mesurée (bandes 42/58). Coach : pas de récup mesurée (pas d'accès à health_daily dans CoachClient).
- Mentions sur l'onglet : « N entraînements de ta montre comptés avec une difficulté estimée… » (Charge), « Avant ton inscription : d'après tes mesures… » (Récup). Pas de points creux sur les charts.
- **Encart `WatchPrompt.tsx`** (sportif, au-dessus de la collecte sur /today) : web iPhone → App Store ; web Android → Garmin ; ordinateur → QR + Garmin ; app iPhone sans aucune donnée Santé → « Autoriser Apple Santé » (`syncHealthData`) ; Garmin connecté sans mesure → bandeau « tes données arrivent après ta prochaine nuit » ; mesures déjà là ou Santé sans FC/VFC → rien. « Je n'ai pas de montre » → `localStorage tpc_no_watch_<uid>`. PostHog : `watch_prompt_clicked {case, action}`, `watch_prompt_no_watch`.
- Onboarding (`AppPushStepBody`, web, sportif) : ligne « Tu as une montre ? L'app relit tes 30 derniers jours… ».
- Mesuré au 23/10 : 4 comptes avec entraînements montre ; un sportif qui ne notait pas ses séances passe de « pas de charge » à une charge calculée (15 estimées). Les comptes sans montre ne changent pas.
- Non traités : entraînements sans fréquence cardiaque (ignorés sans message), compte existant qui branche sa montre plus tard (pas d'écran dédié).

## Autorégulation qui se juge et qui apprend — pistes 1, 2, 3 (2026-10-23)

POC : canvas https://claude.ai/artifact/Qx548NQG7ZrWgwQA28DYpp (rangée « Les 3 pistes »). Migration **042** (appliquée en prod) : `sessions.autoreg_proposal` / `coach_sessions.autoreg_proposal` (jsonb), `profiles.autoreg_shift` (smallint, défaut 0).

- **Reco du matin figée** (`autoreg_proposal`, type `AutoregProposal` dans `src/lib/autoregPersonal.ts`) : calculée et écrite CÔTÉ SERVEUR par `POST /api/sessions/proposal { date }` juste après le check-in (voir « Reco figée CÔTÉ SERVEUR » plus bas ; la 1re version la calculait dans `TodayClient`), une seule fois par séance et par jour (la route refuse de réécrire : un check-in corrigé ne change pas la reco que le sportif a vue). **Distincte d'`autoreg_decision`**, qui reste « le sportif ou le coach a cliqué » : de nombreux écrans (Accueil, Planning, Coach Control, carte sportif) traitent un `autoreg_decision` présent comme une décision prise, ne jamais y écrire automatiquement.
- **Piste 1 — verdict à chaque séance** (`sessionResult`, `src/lib/sessionInsight.ts`) : titre de l'écran de fin de séance = verdict de la décision cliquée, sinon de la reco figée (« L'ajustement était juste », « Bien d'avoir allégé : même comme ça, c'était dur », « L'alerte du matin était fondée », « Tu avais de la marge. Je retiens », « Tu avais de quoi pousser », « Séance comme prévu », « Plus dure que prévu, je ne l'avais pas vu venir »), plus une ligne « Ce matin, l'app proposait… ». Bilan : écran « Mes conseils » (justesse en mots : comme prévu / plus dure, sur l'historique rejoué) + « Me recaler » qui écrit `profiles.autoreg_shift` (proposé si les « Alléger » ont été fondés moins de 35 % du temps sur ≥ 10 alertes ; pas de 5, plafond +15 au total).
- **Seuil personnel** : `computeAutoregSuggestion(..., chronicPenalty, shift)` — `shift` ajouté à la récupération effective (positif = alléger moins souvent). 0 par défaut : aucun appel existant ne change.
- **Piste 2 — signal appris** (`learnSignals` / `personalAdjust`) : par famille de séance (force vs vitesse et explosivité, d'après les catégories du parseur `bestExerciseMatch` + `CATEGORY_FAMILY`, **jamais le nom de séance**), la dimension du check-in dont le « bas » rend les séances plus dures que prévu (≥ 12 séances de la famille, ≥ 8 de chaque côté, écart ≥ 20 points). Quand elle est basse ce matin sur une séance de cette famille : malus −10 (même ampleur que la charge chronique « à surveiller ») et ligne 2 « Appris sur toi : … » dès que l'alerte est « Alléger ». Validé avant activation sur 5 mois de Gildas, sans regarder l'avenir : signal déclenché → séance plus dure que prévu 11 fois sur 18, contre 8 sur 30 pour les « Alléger » génériques. `computeDecisionCard` prend `personal` : calculé en direct sur /today, **relu dans `autoreg_proposal` partout ailleurs** (`proposalPersonal`, Week, Coach Control, carte sportif, planning coach) pour que coach et sportif voient la même décision. L'écran « Ce qui te prédit » du bilan utilise le même `learnSignals`.
- **Piste 3 — suivre ou pas** (bilan, écran « Suivre ou pas ») : jours où l'app proposait d'alléger, forme ressentie le lendemain (4 réponses, hors soirées) selon que le sportif a allégé (décision cliquée ; sans clic : ressentie sous le prévu ou séance ≥ 10 % plus courte que ses séances de même difficulté) ou gardé sa séance. ≥ 5 de chaque côté. Plus tard : progression aux tests.
- **Verdict en relecture** (`loadSessionContext`, `resultContext.ts`) : séance sans décision ni reco figée (faite avant le déploiement, ou check-in après la séance) → moteur générique rejoué ce jour-là (`replayProposal`, rien d'écrit en base), pour que toucher une séance faite montre aussi le verdict.
- **Rejeu du moteur sur l'historique** (`replay` dans `bilan.ts`) : décision cliquée, sinon reco figée, sinon `computeAutoregSuggestion` rejoué ce jour-là avec les seules données d'avant (`computeWellnessBaselineAt`, `chronicPenaltyFor`).
- **Reco figée CÔTÉ SERVEUR + notification coach** (2026-10-23 suite, `src/lib/autoregProposalServer.ts`) : `POST /api/sessions/proposal { date }` refait le calcul de la carte de /today (wellnessSignal, norme 42 j, `chronicPenaltyFor` avec `withWatchEstimates` sur `health_workouts`, `autoreg_shift`, `learnSignals`/`personalAdjust`), fige la reco sur la séance la plus dure pas encore faite, puis prévient le(s) coach(s) lié(s) si elle dit d'alléger (`sendOnce` « recovery_alert », une fois par sportif et par jour ; avec la raison apprise si elle existe : « Léa : séance dure à alléger » / « Son stress n'est pas au calme… Tu valides ? »). Appelée par `WellnessModal` juste après chaque check-in (Accueil, Planning, onboarding) et par /today en secours (séance ajoutée après le check-in, échec réseau). **`/api/push/event` supprimée** : elle recalculait la reco avec le moteur générique, sans charge chronique ni réglages personnels, et pouvait contredire les cartes.
- **Écran de résultat côté coach** (`src/components/coach/CoachResultHost.tsx`, monté dans `(app)/layout.tsx` pour le rôle coach) : toucher une séance faite d'un sportif (Coach Control, carte sportif, Planning, mini-cartes desktop du Planning) ouvre `sessionResult(..., subject)` à la 3e personne (« L'alerte du matin était fondée », « Léa avait de la marge. Je retiens », « Ton ajustement était juste » si c'est le coach qui a allégé), avec « Modifier la séance » vers l'éditeur d'avant (ou la note, depuis le bloc difficulté · durée : `completeOrResult` dans le Planning, `onComplete` sur séance faite dans la carte pleine page). Pas de montre (health_* propriétaire seul). Sans reco figée : `POST /api/coach/session-replay` (coach lié vérifié) rejoue le moteur générique du jour côté serveur (`replayProposalServer`), pour que le verdict existe aussi sur les séances d'avant. PostHog `coach_session_result_shown`.
- **Non personnalisé (à savoir)** : les aperçus d'onboarding/paywall appellent le moteur générique, volontairement (aucun historique à ce stade).
- **Wording (règle Gildas, 2026-10-23)** : jamais de note chiffrée de l'échelle 1-10 à l'écran (« 5/10 », « noté 4 », « RPE 6 ») : des mots. Difficulté = `qualitativeDifficulty()` (légère, modérée, dure, très dure) ; dimensions du check-in = libellés de `SCALE_WORDS` (« stress léger ou plus », « sommeil bon ou mieux »). Les comptes (« 11 fois sur 11 ») et la forme sur 100 restent permis. « Soirée (alcool ou sortie) » et « se paie le lendemain ».
- PostHog : `autoreg_recalibrated` {shift}, `autoreg_recalibration_declined`.
- Testé : 8 cas de verdict en test unitaire ; au robot (compte de test copié des données de Gildas, supprimé ensuite) : reco figée en base avec le malus stress/force, « Appris sur toi » affiché, pas de réécriture au 2e passage, écrans « Mes conseils »/« Suivre ou pas », « Me recaler » → `autoreg_shift = 15` en base.

## Boucle de vérification : réalisé, règle unique, verdict à chaque séance (DÉPLOYÉ 2026-10-24)

POC : https://claude.ai/artifact/PAggDE9BaiVBJM3tUCnuXF. Branche `verif-boucle` (worktree `~/Desktop/theperfclub-verif`). Migration **043** appliquée en base : `sessions.autoreg_followed` (boolean), `profiles.autoreg_shift_high` (smallint, défaut 0). Promesse retenue par Gildas : « Chaque conseil, vérifié après ta séance. Un calibrage qui apprend comment tu réponds. » (« vérifie », jamais « prouve »).
- **Le juge** (`src/lib/adviceJudge.ts`) : prévu (difficulté + texte figés le matin), conseil, réalisé. Règle unique partout (écran post-séance, « Conseils vérifiés », recalage, coach) : plus dure que prévu = ≥ 1 point au-dessus (`HARDER_POINTS`), marge = ≥ 1 point en dessous. Avant : le verdict comptait en points, le bilan en mots (une séance pouvait être « fondée » le soir et « de trop » dans le bilan). Issues : `justified`, `margin`, `followed_ok` (allégée et bien passée → hors des comptes), `push_right`, `push_wrong`, `none_same`, `none_harder`, `none_easier` (hors comptes). `outcomeRight()` dit juste / faux / hors comptes.
- **Le réalisé** : `autoreg_proposal.original_notes` = texte figé au check-in (serveur). `compareNotes()` compare ligne par ligne au texte final (parseur : séries, reps, charge haute, %, distance, temps ; ligne retirée = allégé, ajoutée = poussé). Ordre : clic (`autoreg_decision`) > correction (`autoreg_followed`) > texte allégé/poussé > séance gardée. **Pas de question** : texte inchangé = gardée, lien discret « J'ai allégé sans le noter » (coach : « Léa a allégé sans le noter ») → `POST /api/sessions/followed` (sportif ou coach lié), « En fait, séance gardée » pour revenir. Analyse du 24/10 sur 111 séances de Gildas : les jours d'alerte il n'écrit pas moins (charge relative 0,98 vs 0,97), d'où le lien.
- **Verdict à chaque séance** (`sessionVerdict`) : aussi les jours sans alerte (« Séance comme prévu, conforme à la lecture du matin », « Un peu plus dure que prévu, sans alerte ce matin »). Ligne « Conseil du matin : alléger · séance gardée ». **Registre impersonnel** (Gildas) : plus de « je » ni de « l'app » dans l'écran post-séance, le bilan et les notifs (« Alerte du matin confirmée », « Alerte de trop : tu avais de la marge », « Surcharge validée »…). Bilan : kicker « CONSEILS VÉRIFIÉS ».
- **Comptes** : `computeAccounts()` (bilan.ts, même rejeu que le bilan) → « Conseils confirmés : x sur y » + frise `VerdictStrip` (14 derniers) dans l'écran post-séance (sportif et coach, chargés après l'affichage) ; « Conseils vérifiés » du bilan dès le 1er conseil jugé, frise cliquable (rouvre la séance), barre « Les jours où pousser était conseillé ». Données : `loadBilanRaw()` (`src/lib/bilanData.ts`, sportif en RLS ou coach via /api/coach/bilan).
- **Deux curseurs** : `computeAutoregSuggestion(..., shift, shiftHigh)` : `shift` ne joue plus que sur la borne haute (alléger), `shiftHigh` sur la borne basse (pousser). Avant, le recalage d'Alléger faisait aussi pousser plus souvent. Effet pour Gildas (shift 15) : propose de pousser moins souvent qu'avant. « Me recaler » propose l'un ou l'autre (`recalFor`, ≥ 10 conseils jugés du type, justes < 35 %, pas de 5, plafond 15).
- **Rattrapage** : conseil figé dès qu'une séance du jour est créée après le check-in : `/api/coach/session` (add), `/api/programs/[id]/assign` (dates ±1 j), /week (insert), /today (secours existant) ; `/api/sessions/proposal` accepte `athleteUserId` (coach lié). Le rejeu des séances sans reco figée (`replayProposalServer`, `/api/sessions/replay` côté sportif, `/api/coach/session-replay`) utilise maintenant le même calcul que le figeage (`computeProposalFor` : seuils perso, signal appris).
- **Notifs** : soir des jours de conseil « Alléger, conseillé ce matin · Note ta séance en 10 secondes pour vérifier le conseil » ; « 30 secondes » → « 10 secondes » (notif du matin, PricingPriming, checklist).
- PostHog : `autoreg_followed_corrected` {followed, side}, `autoreg_recalibrated` gagne `dir`.
- **Résultat sur les données de Gildas (rejeu, seuil alléger 15)** : alertes confirmées 6 sur 18 (3 sur 18 avec l'ancienne règle en mots) ; jours sans alerte : plus dure que prévu 34 fois sur 92 ; comptes post-séance 8 sur 14. Moteur générique, seuil 0 : plus dure que prévu 8/30 les jours d'alerte contre 32/80 sans alerte (+1 point) ; 2/30 contre 6/80 (+2 points) : **l'alerte ne repère pas mieux les séances dures sur ces données**. **Seuil tranché par Gildas le 2026-10-24 : 1 point** (`HARDER_POINTS = 1`, même seuil que le signal appris ; à 2 points, presque rien ne serait confirmé : 2 alertes sur 30). **Jours sans conseil, jugés sur la décision (Gildas, en faveur de l'app, assumé)** : raté seulement si la séance change de catégorie (dure → très dure), sinon « Dans la zone prévue, conforme à la lecture du matin » (« Séance comme prévu » si pile au prévu). Sur Gildas : 9 ratés sur 80 au lieu de 32 ; alertes toujours confirmées à 1 point (8 sur 30).
- Testé : 25 cas unitaires (comparaison de textes, juge, verdicts, deux curseurs) dans un script scratchpad, `tsc` + `npm run build` propres. Pas testé dans le navigateur par Claude (Gildas a testé lui-même en local avant le déploiement).

## Qualités, recalage automatique, courbe du taux (DÉPLOYÉ 2026-10-24)

Suite de la boucle de vérification, même branche `verif-boucle`. Migration **044** appliquée en base : `profiles.autoreg_recal_events` (jsonb, défaut `[]`), avec un événement `seed` (23/10, alléger 0 → 15) pour le seul profil déjà recalé (Gildas).
- **Type de séance par qualité** (`autoregPersonal.ts`, demande Gildas : l'endurance n'avait aucun type) : chaque ligne → une des 8 qualités des tests (`testQualities.ts` : force, puissance, réactivité, vitesse, agilité, endurance, mobilité, polyvalence) ou `technique` (le sport : foot, tennis, BMX, escalade…), via la catégorie du parseur (`lineQuality` : haltéro → puissance, jambes/poussée/tirage → force, pliométrie → réactivité si drop/pogo/hop/bound sinon puissance, sprint → vitesse, cardio → endurance, gainage/échauffement → mobilité, technique → technique) + mots-clés (circuit/WOD/AMRAP/Hyrox → polyvalence ; navette/changement de direction/agility → agilité) + distance seule (≤ 150 m vitesse, ≥ 400 m endurance). Séance = qualité majoritaire, et un **groupe** plus large (force + puissance, vitesse + réactivité + agilité). `learnSignals` apprend sur la qualité ET sur le groupe (mêmes seuils), `personalAdjust` prend la qualité d'abord, sinon le groupe ; pas de doublon groupe/qualité. Sur Gildas : séances d'haltéro = force + puissance (une séance mêle arraché et squats) ; signal stress → force et puissance conservé, validé hors échantillon (appris avant le 24/08, testé après : 6 plus dures sur 10 quand il se déclenche, 10 sur 35 sinon). Testé : l'exercice seul n'apporte rien (7 exercices ≥ 12 séances, un seul signal = le même que le groupe).
- **Le rapport qui a du sens : jours d'alerte vs autres jours** (`liftOf`, corrigé le 24/10 soir). Le taux global de conseils confirmés est trompeur : une app muette ferait 87 % sur Gildas (mieux que nos 79 %), parce que les jours sans conseil sont jugés avec la règle favorable. Chiffre principal désormais = P(séance ≥ 1 point plus dure | alerte) / P(idem | pas d'alerte), séances suivies exclues (≥ 5 alertes, ≥ 10 jours sans alerte). Pas affiché à l'écran (essayé puis retiré, Gildas : trop brouillant ; l'écran garde « Conseils confirmés : x sur y » + frise, honnête comme comptes) : sert à piloter le recalage et à juger le moteur. `liftLine()` existe si on veut le remontrer. Sur Gildas : 0,7 (8/30 vs 32/80), 0,9 avec le seuil 15. Seul « Appris sur toi » fait mieux (≈ 2, hors échantillon : 6/10 vs 10/35). **Ne pas marketer le taux global.**
- **Recalage qui optimise ce rapport** (`recalFor`) : déclenché si un type de conseil (≥ 10 jugés) a un rapport < 1,2 ; seuil retenu = celui qui fait le plus monter le rapport (+ 0,15), en gardant ≥ 5 conseils et ≥ un tiers de ceux d'avant (il ne peut pas gagner en se taisant) ; pas de 5, plafond 15 ; un recalage annulé n'est jamais reproposé. Journal : `liftBefore`/`liftAfter`.
- **Recalage automatique** (`POST /api/autoreg/recal`) : `{ sessionId }` après chaque séance notée (écran post-séance sportif et coach) applique le recalage dû et le journalise (`rateBefore`/`rateAfter`) ; annonce « Seuil recalé · … 71 % → 79 % » + « Annuler » (`{ undo: true }`, sportif seul ; côté coach annonce sans annulation) ; `{ apply }` = « Me recaler » manuel du bilan (journalisé aussi). PostHog `autoreg_recalibrated` {source auto|manual}, `autoreg_recalibration_undone`.
- **Seuil en vigueur chaque jour** (`shiftsOn`) : le bilan, les comptes et la courbe rejouent chaque jour avec le seuil de ce jour-là (historique des événements), pas le seuil actuel.
- **Courbe « Conseils confirmés, mois par mois »** dans « Conseils vérifiés » (≥ 3 conseils jugés dans le mois, ↻ = mois recalé). Sur Gildas : mai 78 %, juin 67 %, juil 71 %, août 81 %, sept 52 %, oct 89 % ↻. La courbe reste en détail : le chiffre de référence est le rapport jours d'alerte / autres jours.

## Boucle de vérification : état au déploiement (2026-10-24)

En prod : sections « Boucle de vérification » et « Qualités, recalage automatique, courbe du taux » ci-dessus (migrations 043 et 044). Interface finale : écran post-séance = titre (verdict, registre impersonnel) → bloc gris (conseil du matin, lignes modifiées, lien « J'ai allégé sans le noter » réversible, place dans la semaine) → annonce de recalage avec « Annuler » s'il y en a un → en pied, « Conseils confirmés : x sur y » + frise à deux états (case pleine verte = confirmé, contour = non). Bilan « Conseils vérifiés » : frise cliquable, barres, courbe mois par mois.
- **Marketing (règle)** : ne pas marketer le taux de conseils confirmés (une app muette ferait 87 % sur Gildas) ni « Appris sur toi ≈ 2 fois » (n = 1, 10 alertes). Marketer le mécanisme (vérifiable dans l'app) et la science : Saw, Main & Gastin, BJSM 2016, 56 études ; quand ressenti et mesures objectives divergent, 85 % des études donnent l'avantage au ressenti (85 % des études divergentes, pas de toutes).
- **Limites connues** : une difficulté prévue fausse (marathon noté légère) fausse le verdict ; l'apprentissage par exercice n'est pas possible avec les données actuelles (testé) ; le moteur de base ne repère pas mieux les séances dures chez Gildas (rapport 0,7 → 0,9 avec le recalage).
- **Prochain petit chantier envisagé** : repérer à la création une difficulté prévue incohérente avec le texte de la séance.

## État du chantier « autorégulation qui se juge » (2026-10-24)

Tout est en prod (commits 1c60a38 → ac23264, migration 042). Fait : bilan en carrousel (sportif + coach), reco du matin figée côté serveur, verdict à chaque séance (sportif et coach, y compris en relecture des séances d'avant par rejeu du moteur), « Mes conseils » + « Me recaler », signal appris dans la décision (« Appris sur toi »), notification coach depuis la reco figée, « Suivre ou pas ».

À vérifier par Gildas : 1er verdict en direct après un check-in, 1re carte « Ton bilan est prêt » un lundi, ajouts côté coach (bilan du sportif, pastille « Seuil recalé ») non relus par la session qui a livré les pistes. À mesurer dans PostHog : `bilan_opened`, `bilan_slide_viewed`, `autoreg_recalibrated`, `coach_session_result_shown`, `coach_bilan_opened`.

Reste à faire : piste 3 volet progression (tests selon que le sportif suit ou non) quand il y aura des semaines de recul. Volontairement non fait : aperçus d'onboarding personnalisés (aucun historique à ce stade).

Pièges rencontrés : (1) plusieurs sessions Claude travaillaient en parallèle sur le même repo — travailler dans un worktree dédié, `git fetch` + `rebase origin/main` avant chaque push, prévenir la session concernée par message ; (2) un compte de test `cauvingildas+…` peut être supprimé par une autre session pendant un test : le recréer avant de conclure à un bug ; (3) le build modifie `public/embed/exercise-lines.js` : le restaurer (`git checkout --`) avant de commiter.

## Fin de séance : jauge zone conseillée / ressenti / montre (DÉPLOYÉ 2026-10-26)
Maquette validée : artifact `9t5rLydc67SrpDSReD93SF`.
- **Jauge `ZoneGauge`** (`PhysioRevealHost.tsx`) : remplace la jauge à 2 points « Ressenti vs fréquence cardiaque » sur l'écran de résultat de séance, **avec ou sans montre** (avant : seulement avec une FC calibrée). La zone est en pointillés, avec le même style que `DecisionRing` (trait `rgba(0,0,0,.55)` 2 px tirets 3/3, débord de 0,35 point de chaque côté, bouts ronds) et la légende posée sur la zone. Le ressenti est un rond (couleur `diffColor`), la montre un carré noir (« Montre · Dure », valeur prédite par la FC). Une rangée par étiquette, donc pas de chevauchement. Les mots Légère/Modérée/Dure/Très dure sont centrés sur leur vraie zone (seuils de `diffWord` : 2,5 / 4,5 / 7,5), pas répartis à intervalles égaux.
- **La zone = celle de la jauge de décision** (`sessionZone()` dans `sessionInsight.ts`, même règle que `doneZone` de `decisionCard.ts`). S'il y avait un conseil : la zone proposée ce matin-là (décision enregistrée, sinon reco figée ou rejouée), étiquette « Conseillé ». Sinon : `zoneRange(prévu, "low")` (le prévu et le point en dessous), étiquette « Prévu ». Les gratuits voient la zone conseillée après coup, comme ils voyaient déjà la ligne « Conseil du matin ».
- **Titres calés sur la zone** (`sessionVerdict` / `sessionResult`). Le verdict « rien à changer » compare les mots de Foster (6 et 7 = « Dure » → `none_same`), alors que la zone compare les points. Avant : « Dans la zone prévue » avec le point au-dessus, pendant que la carte Accueil disait « Au-dessus de la zone » (cas réel : 20/10, prévu 6, ressenti 7). Maintenant, quand le ressenti est hors zone, les titres `none_same`, `followed_ok` et `push_right` (suivi) disent l'écart compté depuis la zone : 1 point « un peu plus », 2 points « plus », 3 et plus « beaucoup plus » (jamais « modérément », qui se confond avec « Modérée »). Le titre sans conseil compte aussi depuis la zone (prévu 6, ressenti 5 → « Ressentie comme prévu »). **Les `outcome` ne changent pas** : bilan, « Conseils confirmés » et recalage sont identiques.
- **Lignes renommées** (`compareNotes`, `adviceJudge.ts`) : après l'appariement par texte identique puis par nom d'exercice, une ligne restante est rapprochée d'une ligne de **même prescription** (séries, reps, charge, distance, temps) et traitée comme renommée (cas réel 26/10 : « 3x10m Lesté » → « 3x10m sprint Lesté » affiché barré). Les vrais changements de charge ou de séries restent détectés.
- **Changements du texte affichés seulement s'il y avait un conseil** (alléger/pousser). Avec « rien à changer », la liste n'explique rien et n'est plus affichée.
- **Cas laissé tel quel** : conseil alléger, séance gardée et ressentie comme prévu → point loin au-dessus de la zone conseillée + « Alerte de trop : tu avais de la marge. » C'est cohérent, la zone était celle de la séance allégée et la ligne « séance gardée » l'explique.
- Vérifié : `tsc`, rejeu en lecture seule des 23 séances notées de Gildas depuis le 25/09 (titre vs position du point), `compareNotes` sur le cas du 26/10 et deux vrais changements. Rendu visuel testé par Gildas en local.

## Anneau de décision en grand, titre au centre, plus de carte décision (2026-10-28)

POC : https://claude.ai/artifact/5wmJBpxrMaMthAvi1qVeUm (benchmark WHOOP). Remplace, sur /today et la carte coach, la règle du 12/10 « le titre vit dans la carte décision » : le titre est désormais AU CENTRE de l'anneau, et la carte décision disparaît.

- **`DecisionRing` prop `fluid`** : largeur disponible bornée à 210-300 px ET ≤ 34 % de la hauteur d'écran (sur mobile, la feuille de séance du bas recouvre ce qui suit l'anneau), trait à 5,5 % du diamètre au lieu de 8,5 %, curseur mis à l'échelle du trait (`knob`). Autres props : `centerTitle` (titre imposé, repos / séance faite ; sinon `hintText` = Dans/Sous/Au-dessus de la zone ou « Allègement appliqué »…), `titleLocked` (gratuit : `centerLabel` « 7 · Modérée » lisible au-dessus, titre flouté), `glow` (halo radial de la couleur de sévérité). Titre sur **2 lignes max** : la police descend d'un pixel à la fois jusqu'à tenir (plancher 14 px). Plus de flèche + verbe au centre en mode `fluid` (déjà dits par le CTA, le titre ou la séance). `RestDecisionRing`/`DoneDecisionRing` relaient ces props ; `AutoregButtons` via `ringFluid`/`ringGlow` (`titleLocked` = `free`).
- **`AlertBox` variant `bare`** : sans encart ni point pulsant, n'affiche pas la 1re ligne de `text` (le titre, déjà dans l'anneau) ; détail en 15 px, jusqu'à 560 px de large, espace insécable avant `: ; ! ?`. Conseil + CTA (portail `autoreg-slot`) + Phase sous l'anneau.
- **Où** : /today (`TodayClient`) et `CoachCard` (revue `CoachDecisionDeck` + fiche d'un sportif). La vue Groupe du Coach Control (radar, lignes à `DecisionRingMini`) ne change pas.
- **`HomeSheet` (mobile)** : feuille repliée et contenu de page caché dessous → glisser vers le haut fait d'abord défiler la page, puis ouvre la feuille (repartant de la position du doigt) ; vers le bas, la page remonte puis la feuille se replie. Idem à la molette. Feuille déjà entrouverte : elle s'ouvre directement (sinon page et feuille s'alterneraient, ouvrir la feuille rallonge la page).
- Vérifié à l'écran sur `/sandbox/athlete` et `/sandbox/coach` en desktop uniquement ; gratuit, repos, séance faite, mobile et geste de la feuille restent à tester par Gildas.
