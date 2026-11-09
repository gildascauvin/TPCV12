---
name: planning-editeur
description: Planning /week et /coach/planning, cartes et tiroirs de séance (DayColumn, WeekSessionCard, TodaySessionCard, AddSessionModal, CoachSessionModal, autosave, DuplicateModal, ReconduireModal, LiveSessionHost), éditeur d'exercices (ExerciseBlockEditor, exerciseAutocomplete TOKEN_RE, exerciseParser, sessionLevers, ExerciseLineView), drag & drop, program builder et générateur (/api/programs/generate, périodisation, curriculums, faiblesses), import photo/texte, SessionQuickFill, tests physiques (TestsPanel, testNorms, testBattery), démos vidéo (exerciseDemos, ExerciseDemo), bandeau d'activité (ActivityPill), vue colonne/Bloc (PlanningScrollViews), BottomNav.
---

# Planning, séances, éditeur d'exercices, programmes

État au 30/10/2026. Règle d'or : la ligne tapée dans `sessions.notes` (une ligne par exercice, `\n`) reste la source de vérité ; rien n'est stocké en structuré.

## Fichiers clés

**Pages**
- `src/app/(app)/week/WeekClient.tsx` (sportif), `src/app/(app)/coach/planning/CoachPlanningClient.tsx` (coach), `src/app/(app)/today/TodayClient.tsx` (Accueil), `src/app/(app)/coach/CoachClient.tsx` (Coach Control).
- `/programmes`, `/coach/programmes`, `/sandbox/[role]/programmes` via `src/components/programs/ProgramLibraryStandalone.tsx` (même câblage paywall/sandbox que les pages Planning).

**Calendrier (partagé sportif + coach)**
- `src/components/calendar/DayColumn.tsx` : `DayColumn` (colonne d'un jour) et `WeekSessionCard` (carte séance du Planning). Réutilisés par `/week`, `/coach/planning`, `ReconduireModal`, `DuplicateModal`, vues colonne/Bloc. Props utiles : `renderExerciseLine(line, i, view)`, `adjustPct`, `originalNotes`, `hideActions`, `decisionGauge`, `onStart`, `liveLabel`.
- `src/components/calendar/DraggablePlanning.tsx` : DnD dnd-kit du Planning (`DraggableSessionCard`, `DraggableExerciseLine`, `makePlanningDragEndHandler`).
- `src/components/calendar/PlanningScrollViews.tsx` : `usePlanningScroll`, `PlanningScrollViews`, `PlanningLayoutToggle`.
- `src/components/calendar/CalendarHeader.tsx` : header commun (rend `ActivityPill`, prop `leftControls`, `profileHref`).
- `src/components/calendar/RangeToggle.tsx` : toggle 7j/4 semaines (`/conseils`, `/coach/athletes`).
- `--wk-col` (largeur unique d'un jour, `globals.css`) : 280 / 305 / 330 px selon breakpoint. Planning, éditeur de programme, modèles, `/p/`, Reconduire.

**Séances**
- `src/components/sessions/TodaySessionCard.tsx` (Accueil, aussi Coach Control sportif sélectionné avec `viewer="coach"`), `EmptyDayCard.tsx`, `CompleteModal.tsx`, `DecisionGauge.tsx` (prop `noZone` dans les tiroirs).
- Tiroirs : `AddSessionModal.tsx` (sportif + program builder), `src/components/coach/CoachSessionModal.tsx` (coach), `AutosaveFooterButton.tsx`, `SessionQuickFill.tsx`, `DuplicateModal.tsx`, `ReconduireModal.tsx`.
- Séance en direct : `src/lib/liveSession.ts`, `src/components/sessions/LiveSessionHost.tsx` (monté dans `(app)/layout.tsx`, sportif seulement).
- Accueil mobile : `src/components/today/HomeSheet.tsx`.

**Éditeur et lignes d'exercice**
- `src/components/sessions/ExerciseBlockEditor.tsx` : éditeur façon Notion (contient `ExerciseCard`, `TokenInput`, `TokenSuggestionPanel`, `useKeyboardInset`). Il a remplacé l'ancien `ExerciseGhostEditor`, qui n'existe plus.
- `src/lib/exerciseAutocomplete.ts` : `TOKEN_RE`, `findNameSpans`, `resolveExerciseName`, `extractNameCandidate`, `getClickToken`, `generateSuggestions`, `generateSuggestionsClickMode`, banque `HISTORY`.
- `src/lib/exerciseParser.ts` : `parseLine`, `rewriteLine`.
- `src/lib/sessionLevers.ts` : moteur d'ajustement unique (`adjustLine`, `adjustNotes`, `describeChange`). `src/lib/loadAdjust.ts` (`parseAndApply`, `adjustDifficulty`) délègue ici.
- `src/lib/exerciseBank.ts` : ~745 termes FR/EN vers 11 catégories (icône de ligne).
- `src/components/sessions/ExerciseLineView.tsx` : rendu UNIQUE de toutes les lignes d'exercice (cartes, programmes, `/p/`, fiche modèle, Reconduire/Dupliquer, démos, `/share`, tiroir, séance en direct `size="large"`) + `SessionSynthesis`.
- `src/lib/exerciseMediaReindex.ts` : `moveExerciseLine` (recale `exercise_media` indexé par position).

**Programmes**
- `src/components/programs/` : `ProgramLibraryPage.tsx` (UIStep list/new/criteria/detail/builder), `ProgramStoreSections.tsx` (`Cover`, `Carousel`, `CreateTiles`), `ProgramTemplateDetail.tsx` (fiche modèle), `ProgramLibraryBrowser.tsx` (`guessSportChip`, `fetchLibraryTemplate`), `ProgramCreatePicker.tsx`, `ProgramCriteriaModal.tsx` (modes `criteria` / `import`), `ProgramBuilderModal.tsx` (contient `DuplicateTemplateModal`), `ProgramAssignModal.tsx`, `SessionTemplateCard.tsx`, `ProgramBanner.tsx`.
- Routes : `/api/programs/generate`, `/api/programs/import`, `/api/programs/library` (+ `sessions`), `/api/programs/[id]` (+ `assign`, `assignments`, `resync`), `/api/programs/claim`, `/api/sports/custom`, `/api/activity/status`, `/api/coach/free-label`, `/api/coach/session`.
- Séries dans un programme (01/11/2026, façon Google Agenda, `src/lib/sessionSeries.ts`) : `SessionTemplate.series_id` + `series_step` (progression par semaine). Une série n'existe que si elle a été créée comme telle : « ↻ Répéter chaque semaine » du tiroir (jusqu'à Sx + progression), Reconduire, générateur et import (`seriesFromRepeats` : même jour + même nom dans plusieurs semaines, à la création seulement). Jamais devinée après coup ; les programmes d'avant restent des séances seules.
  - Une série partage la structure (nom, jour, exercices, ordre), pas la dose. « Celle-ci et les suivantes » reporte des changements, jamais des valeurs : ajout/retrait/ordre alignés (`alignSession`), un exercice ajouté reçoit `series_step` × écart de semaines, un écart de dose sur une ligne est reporté si la ligne cible s'écrit pareil (`carryDelta`), écart de difficulté reporté.
  - Questions « Cette séance seulement / Celle-ci et les suivantes » : à la fermeture du tiroir ou après un glisser d'exercice (modifier, avec « jusqu'à Sx »), au glisser d'une séance vers un autre jour (déplacer), à la suppression depuis le tiroir. Le fond ne ferme pas la modale. Le tiroir affiche « ↻ Chaque lundi · S1 à S4 ».
- Séries dans le Planning (01/11/2026, migration 047 : `series_id` text + `series_step` jsonb sur `sessions` et `coach_sessions`) : route unique `POST /api/sessions/series` (info, repeat, edit, move, delete ; sportif sans athleteId, coach avec), client `src/lib/seriesClient.ts`, fenêtres partagées `src/components/sessions/SeriesModals.tsx` (aussi utilisées par le builder). Toute la logique écran est dans le hook `src/hooks/useSessionSeries.tsx`, branché dans `WeekClient`, `CoachPlanningClient`, `TodayClient` et `CoachClient` (Coach Control) : ligne ↻ du tiroir, « Répéter » dès la création (après la 1re sauvegarde) et sur les séances passées (copies à partir d'aujourd'hui), question après modification, glisser de séance ou d'exercice, suppression. Le sportif et la conversion sont figés au moment de la question (Coach Control ferme le tiroir avant). Reconduire la semaine (Planning sportif et coach) = répéter : les copies rejoignent la série de leur séance d'origine. Dupliquer = copie indépendante. Coach : « Dupliquer (n) → » vers d'autres sportifs après « Répéter » répète aussi leurs copies (`repeatAlso`). Hors connexion (Accueil) : ni ligne ↻ ni question. Rattrapage du 01/11 : `scripts/backfill-series.mts` (285 programmes, 3 892 séances ; sauvegarde `~/Desktop/theperfclub-backups/series-backfill-2026-11-01T21-37-22.json`). Séances faites jamais touchées. L'assignation et la resynchro d'un programme recopient la série du template (`<series_id>:<assignment_id>`).
- Semaines du builder : pilule `PeriodPill` (même composant que le sélecteur de date de `CalendarHeader`) centrée, barres de charge cliquables à gauche (dessous sur mobile), Reconduire + menu ⋯ (supprimer la semaine avec confirmation).
- Dupliquer / Reconduire (Planning sportif et coach, Accueil, Coach Control, builder) : `ChargeAdjustPicker` (Décharge / Maintien / Surcharge ; en Maintien aucun réglage, en Décharge / Surcharge Intensité ± % et Volume ± % préremplis et modifiables) et `src/lib/chargeAdjust.ts`. Intensité = charges/%/allure/zone/RPE ; Volume = séries, sinon durée, sinon distance, arrondi au plus proche (un 3×5 ne bouge qu'à ±17 %) ; les reps ne bougent jamais. Décharge = −10 % / −30 %, Surcharge = +5 % / 0. Reconduire : 1 à 8 semaines, progression cumulée. Builder : ⎘ Dupliquer dans le pied du tiroir (plus de bouton par jour).
- Libs : `programAssignment.ts` (`findProgramForWeek`, `pickRelevantAssignment`), `programMedia.ts` (`mediaForAssignment`), `sportCategories.ts` (`programSportEmoji`, `WEAKNESSES_BY_SPORT`), `sportShortLabel.ts`, `programIntros.ts`, `programCovers.ts`, `sessionTemplates.ts` (`getSessionTemplates`, repli statique).

**Activité** : `src/components/layout/ActivityPill.tsx`, `src/lib/activityStatus.ts`, `src/lib/activitySubject.ts` (`buildActivitySubject`), `src/lib/activitySandbox.ts`.

**Tests physiques** : `src/components/tests/TestsPanel.tsx`, `src/lib/testNorms.ts`, `testBattery.ts`, `testQualities.ts`, `testResults.ts`, `sprintProfile.ts`.

**Démos** : `src/data/catalystDemos.json`, `src/lib/exerciseDemos.ts`, `src/components/sessions/ExerciseDemo.tsx` (`DemoThumb`, `DemoBlock`, `DemoSheetHost`), `DemoSheetLauncher.tsx`, `src/lib/demoSheetEvent.ts`, `src/lib/demoPrefs.ts`.

## Planning et cartes séance

- **Bandeau d'activité unique** (`ActivityPill`, rendu par `CalendarHeader`) tout en haut de toutes les pages sportif. Contenu = période affichée (`setDisplayedPeriod`) : programme qui couvre la semaine (nom + barres de charge) ou semaine libre (nom, défaut « Séances libres », + 7 jours). Voyant vert (`activityLed`) = au moins une séance prévue à venir non faite. Côté coach, il vit dans `AthleteFilterBar` (chips par sportif, ou « ‹ Groupe » + sportif).
- Actions : ✏️ ouvre le tiroir, ↻ Reconduire (`ACTIVITY_RECONDUIRE` ; hors Planning, redirige `?reconduire=<lundi>`). Nom de semaine dans le tiroir (`saveWeekLabel`, event `ACTIVITY_LABEL_CHANGED`).
- `free_training_label` (profil / `coach_athletes`) = JSONB par semaine (`{"2026-08-24": "Bloc perso"}`, clé = lundi). Écriture coach via `/api/coach/free-label` en lecture-fusion-écriture, jamais overwrite.
- `ProgramBanner` ne sert plus qu'en `compact` au-dessus de chaque semaine de la vue Mois (WeekClient, CoachPlanningClient) ; la grande bannière Planning est remplacée par le bandeau.
- `/api/activity/status` : requête par semaine + ancre ; `template` chargé pour un seul sujet ; `refreshActivitySoon()` regroupé 400 ms ; fantôme `ActivityStripSkeleton` jamais l'ancienne semaine. Toujours passer `acclimatation` à `findProgramForWeek` (sinon semaine 0 affichée en « Séances libres »).
- **Cartes séance** : aujourd'hui = « ▶ Démarrer la séance » + lien « Déjà faite ? Noter le résultat » ; jour passé = Terminer ; jour futur = aucune action. Séance faite = tuiles « N MIN » / « N DIFF. » (tap = CompleteModal), plus de bouton Résultat. Une seule jauge par carte (pas de 2e jauge sur la séance qui porte la décision). Boutons rayon 12.
- Carte du jour vide (`EmptyDayCard`) : un seul « + Ajouter une séance » (+ « Ou démarrer un programme » côté sportif).
- `?quickadd=session|program` sur `/week` et `/coach/planning` (effet à deps `[searchParams]`, pas `[]`, sinon rien ne se passe si la page est déjà montée). `OPEN_QUICKADD` ouvre le tiroir du bandeau.
- Le jour sélectionné est centré par défilement horizontal seulement (`scrollIntoViewX`).

### Vue colonne / Bloc (`PlanningScrollViews`)
- `/week` et `/coach/planning` (sportif sélectionné ; la vue « Tous » du coach reste en semaine). Chaque page fournit `renderDay(date, prevStr, nextStr)` (vraie `DayColumn`, DnD, décision) et `loadRange(start, end)`. Ne jamais réinventer des cases compactes : toute vue réutilise `renderDay`.
- Colonne (< 1024 px) : jours empilés, 3 semaines puis +2 par IntersectionObserver, plafond 26. Bloc (≥ 1024 px) : une colonne par semaine, une ligne par jour, défilement horizontal infini.
- Défaut : colonne sous 640 px (`window.innerWidth` en layout effect, `useBreakpoint` vaut 390 au 1er rendu), semaine ailleurs ; choix mémorisé `localStorage tpc_planning_column`. `.planning-pending` masque la grille semaine SSR jusqu'au choix.
- Bascule = bouton rond 40 px à gauche du header (`leftControls`). Le header suit le défilement ; la molette ne change plus de semaine.
- Baseline wellness : chaque jour lit `popupWellnessHistory` (21 check-ins précédents) ; la décision du jour garde la fenêtre de la vue semaine.
- En-tête de semaine non sticky (`overflow-x:hidden` sur html/body casse `sticky`). Pas d'event PostHog sur la bascule.

### Drag & drop
- Cross-séance sur Planning et program builder. Droppable de carte (`sess-drop:{id}`) actif seulement si la séance est vide ; sinon dépôt sur une ligne. `moveExercise(fromSessionId, fromIdx, toSessionId, toIdx)` : 2 updates en parallèle + rollback optimiste. Builder : `moveExerciseInTemplate`, mutation locale ; même jour 2 séances = une seule copie de `week[day]`.
- `exercise_media` doit toujours être recalé (`moveExerciseLine`), y compris en réordonnancement intra-séance.
- Vue Semaine uniquement ; pas de création implicite de séance sur un jour vide.

## Tiroirs de séance

- Drawer docké à droite `50vw`, `100dvh`, `borderRadius:"28px 0 0 28px"`, animation `drawerInRight` sur `isMd` ; plein écran `modalIn` sur mobile. Flex-column : région `overflowY:auto` + footer `flexShrink:0` (jamais `position:sticky` + gradient à stop %). Même coque pour `ProgramCriteriaModal`, `ProgramCreatePicker`, `ReconduireModal`, `DuplicateModal`.
- Pas de titre redondant : le nom est un input stylé en titre, la date un input discret.
- **Autosave** : `onSave(data, id?) => Promise<{id}|void>` ; 1er save crée et renvoie l'id, les suivants mettent à jour. `saveSession` unifié dans WeekClient, TodayClient, CoachPlanningClient ; ne ferme jamais le tiroir (`onClose` s'en charge). Debounce 600 ms ; `flushAndClose()` sur backdrop/croix/bouton. Les `saveSession` DOIVENT lever une exception sur erreur Supabase (sinon l'état erreur ne sert à rien).
- `AutosaveFooterButton` : idle « Fermer » / saving / « ✓ Enregistré » 1,8 s / « ⚠ Erreur, Réessayer ». Jamais `disabled`.
- Coach : cible = `initialAthleteId` ; si décochée en création, retour au geste manuel ; « Dupliquer aussi vers » reste une action explicite (`handleDuplicateExtras`). `reviewContext` (Traiter les décisions) hors autosave.
- Footer du tiroir en édition : 🗑 Supprimer · ⎘ Dupliquer · Fermer (`onDuplicate(draft)`, flush puis `DuplicateModal`). Coach Control réutilise Reconduire (J+7). Le builder garde son Dupliquer par jour (`DuplicateTemplateModal`, z 2147483200).
- `DuplicateModal` / Reconduire : cartes Décharge / Maintien / Surcharge + chips ±2,5/5/10/15/20 %, aperçu via `WeekSessionCard` (`adjustPct`, `originalNotes`), même moteur `sessionLevers`.
- `SessionQuickFill` (tant que la séance n'a aucun exercice, jamais pour un template) : 📚 Modèle (`/api/programs/library`), 📷 Importer (`/api/programs/import`), ✨ Générer (`/api/programs/generate`, 1 jour × 4 semaines, 2 points faibles max, repli `getSessionTemplates`). Events `session_quick_fill_opened`, `session_quick_fill`.
- Limite connue : compte non actif, `requireSubscription()` résout `undefined` donc le bouton peut afficher « Enregistré » sans écriture.

## Séance en direct
- `sessions.started_at`, `paused_at`, `paused_ms` (migration 029). En cours = `started_at && !done`. Une seule séance en cours. Sans check-in du jour, Démarrer ouvre d'abord le check-in (`pendingStartSession`).
- `LiveSessionHost` : barre « En cours » au-dessus de la nav, écran plein un exercice à la fois (`ExerciseBlockEditor focusIndex`), Arrêter = Terminer ou Annuler (chrono effacé, exercices gardés). Wake lock si permis.
- CompleteModal propose la durée du chrono (pauses déduites) ; au-delà de 3 h (`LIVE_MAX_MS`), pas de pré-remplissage.
- Pas fait : « En cours » côté coach, Démarrer en sandbox / Coach Control.
- **Ressenti par série** (09/11/2026, `src/lib/liveSets.ts`, migration 048 `sessions.live_sets` jsonb, POC canvas 3HwFYueK858LbGciExihYm) : sous l'exercice, une case par série ; en bas 3 boutons Plus facile / Comme prévu / Plus dur = série validée + ressenti + repos. Ajustement des séries restantes de l'exercice : charge +2,5 % / −5 % (cran 2,5 kg, 1 kg sous 20 kg), reps ±1, allure −5 s / +10 s au km, volume seul (sprint, gainage) : plus dur retire la dernière série, plus facile la rend. Plafonds ±2 crans par exercice et ±10 % sur la séance (`sessionPct`). La ligne de notes est réécrite avec le prévu restant (`rewriteLineFor`, relue par `parseLine` ; si la relecture diffère, la ligne ne bouge pas) ; `live_sets` garde prévu d'origine, ressentis, `done`, `skipped`, repos en cours. Lignes non découpables (%, durée seule, consignes) : pas de cases, anciens boutons. Repos : récup écrite dans la ligne (`restSecOf`) = compte à rebours, sinon chrono qui monte (« Repos libre ») ; pas d'alarme (plugin de notifications locales absent, prochain build natif). Changer d'exercice sans taper = séries « non notées ». Chaque tap = une écriture `notes` + `live_sets` via `updateOwnSession` (file hors ligne ; `live_sets` ajouté à `OFFLINE_PATCH_FIELDS`). Synthèse en mots dans `CompleteModal` (prop `summary`). Pas fait : 1re série comme juge du conseil du matin, RPE pré-rempli, côté coach (écran de résultat, verrouiller l'exercice), notification de fin de repos.

## Accueil mobile (`HomeSheet`)
- Mobile, onglet Aujourd'hui : séance dans une feuille en bas (z 40, crans bas/milieu/haut, repliée jusqu'à `data-sheet-peek`). Avant check-in : `WellnessModal embedded` dans la feuille (`embeddedCheckin`, `overNav`), score porté en haut. Tous les déclencheurs de check-in passent par la feuille sur mobile.

## Éditeur d'exercices (règles de parsing)
- Une seule regex `TOKEN_RE` (flag `i`) pour l'affichage ET le clic. Reconnaît : complexe `Nx(1+2)`, `NxM` avec décimale et unité collée (`2X92,5`, `6x20m`, `4x10/jambe`), « N reps M sets » (ordre libre FR/EN), `@ ...`, `RPE8`/`RIR2`, nombre + km/kg/min/m/s/%.
- Nom = ce qui a été réellement tapé (`extractNameCandidate`), pas la clé de banque la plus courte contenue. La banque `HISTORY` ne sert qu'aux suggestions et à la canonisation sur égalité exacte.
- `extractNameCandidate` saute un label de superset d'UNE lettre (`LEADING_LABEL_RE`, « A – », « A1 – ») puis un volume de tête (`LEADING_VOLUME_RE`), s'arrête au prochain vrai token (`untilNextToken`, donc « 1 arm press » reste un nom), valide par segment `+` (≤ 5 mots chacun, `isPlausibleNameCandidate`). « OHP – 3x5 » ne doit jamais être traité comme un label.
- `findNameSpans` découpe sur les `+` de premier niveau (`splitTopLevelPlus`, jamais dans une parenthèse) : une pastille par exercice combiné, y compris quand chacun a sa propre intensité. `resolveExerciseName` garde volontairement le texte combiné entier comme une seule clé.
- Non traités, à la demande de Gildas : « 10 pompes » (nombre nu sans x, toute la ligne = nom) et « HS FS 90% – Back squat » (« HS FS » pastillé).
- Interaction : clic sur une pastille = panneau du token (`TokenSuggestionPanel`, bottom sheet mobile avec `useKeyboardInset`, ancré sous le token desktop ; jamais de focus auto sur mobile) ; clic ailleurs = texte libre ; « ✏️ Modifier toute la ligne en texte » dans le panneau. Un seul panneau ouvert (`openPanelId`, `requestPanel` / `releasePanel`) + backdrop z 2147483150 (panneau 2147483200).
- Suggestions au clic : format préservé (`@ 90` vs `90kg`), pas de 5 pour m/km/s (`completeUnitNear`, `completeNxMNear`), pas de 1 pour des reps.
- `TokenInput` = textarea auto-grow, commit au blur et à Entrée ; `onLiveEdit` propage à chaque frappe (autosave) ; `onPasteLines` (composeur seulement) crée une carte par ligne collée.
- Liaison test depuis la séance : `buildMergeSuggestions` (`testBattery.ts`) ; le nom choisi est stampé dans `attachments.result.testName` dès le clic sur la suggestion.

## Moteur de leviers (`sessionLevers.ts`)
- Utilisé par décisions, aperçus, Reconduire, Dupliquer, acclimatation, simulateurs. Ne jamais réimplémenter un ajustement ailleurs.
- Surcharge : charges +% (cran mini 2,5 kg, 1 kg sous 20 kg), sinon intensité (%, allure ±5 s/km par 5 %, plafond 10 s/km), sinon durée, sinon +1 série/tour, sinon reps +% au poids du corps (au moins +1). Baisse < 10 % : même ordre, RPE −1. Décharge (≤ −10 %) : séries −|pct| en retirant les dernières ET charges −|pct|/2 sauf montée ; endurance : intensité −1 cran. `mode: "loads"` = acclimatation.
- Parseur : parenthèses = notes jamais ajustées ; consignes (Note, Focus, Bilan) = `kind: "note"` ; `fallback` / `ambiguous` jamais ajustés ; `rewriteLine` ne réécrit que les chiffres modifiés.
- PostHog `autoreg_adjust` {action, pct, lines_changed, lines_skipped}.

## Générateur de programmes (`/api/programs/generate/route.ts`)
- Fonction pure, déterministe. Durée = 6 ou multiple de 4 (sinon 400) ; `ProgramCriteriaModal` n'expose que 4/8/12 (`DURATIONS`), ne pas y remettre 6.
- Blocs de 4 semaines MEV → Surcharge → MRV → Deload (`buildWeekSpecs`, `shapeForCycle`), +1 de base par bloc, test forcé le dernier jour de chaque semaine MRV ; modèle 6 semaines dédié culminant sur un pic. Mode `libraryShape` pour les modèles officiels sans focus.
- Prescriptions dynamiques (`PRESCRIPTION_SHAPE` sur l'ancre de `EXERCISES`) : durées/distances et % arrondis à 5, reps/séries jamais arrondies à 5. Même sélection d'exercices sur les 4 semaines d'un bloc. Technique/récup/test = texte statique.
- Paliers RPE (easy/moderate/hard) : jamais deux jours calendairement consécutifs dans le même palier, y compris dimanche → lundi entre deux semaines ; 1er jour de la semaine jamais facile. Ces règles s'appliquent aussi aux sports à curriculum (un jour corrigé retombe sur la banque générique, compromis voulu). `sessionDifficulty` plafonne par type ; rééducation (`moderateOnly`) plafonnée à 5/10.
- Contenu des séances (31/10/2026, demandé par Gildas : « pas réinventer la roue, des programmes connus ») : haltéro façon Catalyst Athletics (back squat jour arraché + jour jeté, squat avant jour épaulé, tirages 90-105 %), force façon Texas Method (1 principal 5×5 + 1 variante `alt` qui alterne par semaine et par séance, spécialisations volume/léger/lourd), sprint calé sur le tableau distance/volume/récup de Gildas par niveau (`SPRINT_CONTENT`, niveau passé via `CurriculumContext.level`). Un archétype a toujours un ordre fixe (plus de rotation). Pour ne pas être écrasée par la règle « jamais 2 jours durs consécutifs », la séance en 2e position est `volume` (Épaulé, Épaulé-Jeté, Bench) ou un jour léger.
- Prescription des mouvements de force (`formatPrescription`) : reps qui montent quand le % baisse (+1 rep / 4 % sous l'ancre, −1 / 5 % au-dessus, reps fixes en décharge et au-delà de 6 reps) ; olympiques et tirages gardent l'ancien calcul. Plus de % fabriqué : toute ligne chargée porte son % dans la banque, l'assistance sans % affiche « N reps en réserve » selon la phase (sauf sauts et lignes avec consigne entre parenthèses). Sprint sur distance : seules les reps bougent. Écrire un lancé « Sprint lancé 20 m (élan 20 m) » (un seul token distance hors parenthèses pour le parseur).
- 01/11/2026 : trail et vélo ont leurs séances type (modèle polarisé de Seiler, zones FTP de Coggan), natation aussi (allure seuil CSS, technique et aérobie, vitesse), ainsi que le ski (force, endurance de force, puissance, proprioception). Puissance a 2 pliométries différentes, la perte de poids est en A/B, et le bilan des spécialisations porte sur le seul mouvement du titre. En décharge : une durée continue descend au plus à 60 % (80 % le reste du temps) ; les reps sans %, les gainages, les tours et les répétitions comptées ne bougent pas (on retire des séries) ; un fractionné en mètres garde sa distance.
- Programmes « méthodes » (5/3/1, 5×5, Texas Method, polarisé 80/20, contrastes) : écrits à la main, hors générateur, par `~/Desktop/tpc-seo/methodes/build_programs.py`, insérés comme modèles officiels publics le 01/11. Pour les modifier, relancer ce script et mettre à jour la table `programs`.
- `SPORT_CURRICULUM` : archétypes par sport, fidèles aux pages WordPress. Seul « autre » reste générique (trail, vélo, natation, ski ont leurs séances type depuis le 01/11). Piège reachability : un archétype à seuil de fréquence doit être à un index < N.
- `getSportCategory` : « musculation »/« hypertroph » avant « power »/« force » (jamais « muscu » vers powerlifting) ; Hyrox avant fitness.
- Faiblesses : niveau 1 (powerlifting/musculation/haltéro, sur un jour non adjacent), niveau 2 (`WEAKNESS_META`, surchargé par sport via `WEAKNESS_META_BY_CATEGORY`, `typeHints`). Depuis le 02/11 le niveau 2 n'ajoute jamais un mouvement déjà dans la séance (`src/lib/movementFamily.ts`), choisit la séance par type accepté > aucun doublon > jour libre > ordre des typeHints, et passe les lignes ajoutées par la prescription du bloc (charge/réserve). Audit de toutes les combinaisons : `npx -y tsx scripts/audit-weakness-extras.mts` (Node 22, ~45 s, doit rester à 0 doublon). `WEAKNESSES_BY_SPORT` vit dans `sportCategories.ts`.
- « Autre » : `/api/sports/custom` (getSportCategory d'abord, sinon Claude Haiku en tool-use) fournit `customExercises` / `customWeaknessMeta`, jamais la structure. Ne marche qu'en prod (clé IA vide en local).
- Règle produit : des exercices précis, plus de familles (« Gainage complet » → Planche + Gainage latéral) ; circuits en bloc (en-tête de bloc du type `Circuit — 4 tours :` puis une ligne par exercice, `formatBankLine`).
- Bibliothèque : `scripts/regenerate-library-from-generator.mts` (cible `is_official_template = true` seulement, dry-run par défaut, sauvegarde JSON avant `--apply`). Toujours revérifier en base après régénération.
- Pas fait : adaptation jour à jour via le wellness (seul `wellnessAdjustment` S1 à l'assignation).

## Assignation
- `mediaForAssignment()` renvoie toujours un objet (`{}`), jamais `null` : `exercise_media` est NOT NULL. `POST /api/programs/[id]/assign` supprime l'assignation si l'insert des séances échoue. Règle générale : ne jamais envoyer `null` explicite sur une colonne NOT NULL ; un parent doit être annulé si ses enfants échouent.

## Création et bibliothèque de programmes
- Page Programmes : en-tête sombre, `CreateTiles` (Générer, Importer, Programme vierge), « Mes programmes » (`Carousel`), « Pour toi · {sport} », « Tous les modèles ». Aucun prix. Menus ⋯ en `position: fixed`.
- Clic sur un modèle = `ProgramTemplateDetail` (intro WP figée dans `programIntros.ts`, à ré-extraire si une page change). `/api/programs/library` sans `template` ; contenu à la demande via `fetchLibraryTemplate`.
- `ProgramCreatePicker` (4 cartes à plat, aucune mise en avant) reste pour la modale et le wizard. « Programme vierge » = semaine 100 % vide directement dans le builder. `onBack` (←) distinct de `onClose` (✕).
- Import (`/api/programs/import`) : Haiku tool-use `soumettre_programme`, texte ou image, transcription jamais invention, UNE seule semaine en sortie (Reconduire projette la suite).
- Emojis : `programSportEmoji()` (spécifique au sport, sinon catégorie). Ne pas matcher `velo` seul (« Dé-velo-ppé »).

## Tests physiques (`TestsPanel`)
- Liste `UnifiedRow` en accordéon, `PrimaryGauge` centrée sur la cible (unité réelle), `SprintAxisGauge`, `buildVerdict` (top 3 faiblesses / forces + `advice` existant).
- Recommandations : toujours tout `TEST_BATTERIES`, filtré seulement par qualité physique ; le sport de profil ne pilote que le scoring des ratios.
- Sprint : `fitSprintModel` (Samozino-Morin, Vmax/τ jamais affichés), repli fechain seulement si la distance n'est pas couverte par le fit.
- Toute métrique résolue sans `CardInsight` va dans `MULTI_ENTRY_METRICS`, et tout test recommandé doit être mappé dans `BATTERY_TEST_METRICS`, sinon doublon / jamais marqué fait. `cmjFreeArms` ≠ `cmjHeight`.
- `sharesEnoughWords` : seuil appliqué des deux côtés (« Jerk » ne matche pas « Clean & Jerk »). `parseResultValue("")` = `null`, jamais 0.
- « + Nouveau test » (`AddCustomTestForm`) : `tests.qualities` écrit seulement à la création d'un nom libre.

## Démos vidéo
- Catalyst seule source (624 exercices, YouTube). Illustrations `public/illustrations/*.jpg` pour endurance, sport, mobilité.
- `mediaForLine` : terme le plus long gagne ; complexe = une démo par mouvement sauf complexe Catalyst complet ; jamais sur échauffement/cardio/technique/test ; « épaule » vs « épaulé » ; variante absente = rien plutôt que le mouvement de base.
- `DemoThumb` remplace le picto dans `ExerciseLineView` (prop `noMedia` pour couper) ; `DemoBlock` en séance en direct ; `DemoSheetHost` chargé à la demande par `DemoSheetLauncher` (event `DEMO_SHEET_EVENT`, z 2147483300, `anchorY` en iframe). Vignettes `i.ytimg.com` en `<img>` simple.
- Éditeur : Changer de démo (`alternativesFor`), Mettre ma vidéo (`LINE_MEDIA_EVENT`), Masquer ; choix dans `exercise_demo_prefs` (`resolveLineMedia`, `useDemoPrefs`). Limite : choix et vidéo perso du coach pas encore propagés aux sportifs.

## Bottom nav (`BottomNav.tsx`)
- Sportif : Accueil · Planning · Performance · Programmes. Coach : Accueil · Planning · Performance (`/coach/athletes`) · Programmes. Pas de « + » central. z-index 2147483000, modales à 2147483100. Grille `repeat(N,1fr)` avec `minWidth:0` sur chaque onglet.

## Pièges
- Service worker : vider SW + caches avant toute vérification visuelle (erreur « reading 'call' » = vieux chunk).
- `tsc` avec un tsconfig excluant `.next` quand le dev server de Gildas tourne ; pas de `npm run build` dans le repo (écrase `.next`).
- Un import statique annule un `next/dynamic` (DuplicateModal etc. sont chargés en dynamic).
- Clé Anthropic vide en local : import, Générer « Autre » et sport libre ne se testent qu'en prod.
- Gildas teste lui-même : pas de clic réel sur son compte.

## Abandonné / supprimé
- `ExerciseGhostEditor`, `AcDropdown`, `QuickAddSheet` (« + » central), `ViewToggleButton`, `ProgramImportStep`, `freeCycleBars.ts`, `AdjustSessionModal`, `SessionCard`, `ReviewCompleteModal`, `scripts/regenerate-library-periodization.mjs`, `ProgramCreateOptions` (remplacé par `CreateTiles`).
- Grande `ProgramBanner` du Planning et pilule d'activité du header (fusionnées dans le bandeau). Bouton Dupliquer sur les cartes. Bouton « Résultat ». Barres de charge rétrospectives sans programme. Vue Bloc à cases compactes.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).

- Planning, un anneau par séance (LOCAL 06/11, idée de Gildas, POC 0 quater) : `components/calendar/SessionRing.tsx` à droite du nom dans `DayColumn` (et 28 px dans les cartes du mois, 38 px = séance principale du jour sur mobile) ; à venir = charge prévue (orange, onglet Charge), aujourd'hui/passé = anneau de décision avec zone (`sessionZone`, Braise, trait sur le prévu si faite). Plus de `DiffGauge` dans le Planning, plus de `PlanningRing` en tête de colonne (la récup reste en mot cliquable « Récup · Équilibré 62 », ouvre le point forme). La barre interactive de décision (`decisionGauge`) reste pour la séance ciblée. Éditeur (`AddSessionModal`, `CoachSessionModal`) : `DifficultyRingInput` (anneau 120 px, option A) au lieu de la barre.

## Anneaux du Planning (06/11/2026)
- En-tête de colonne = date seule ; l'anneau du jour (`DayRing`, exporté de `DayColumn.tsx`) est dans l'encadré du jour, à gauche du titre (`AlertBox` prop `lead`), sans pastille. Séance → `SessionRing` (charge prévue à venir, zone + statut aujourd'hui et avant) ; jour sans séance → `RestDayRing` (charge de la semaine dans sa zone, comme l'anneau de repos de /today ; « Repos » vide si inconnue). Données : `/api/charge-days` + `hooks/useChargeDays.ts` (`chargeByDay` dans `metricCards.ts`).
- Prop `ringState` : impose l'état de l'anneau (jour conseillé dans les aperçus).
- Aperçus = mêmes composants : onboarding ob_week (`DayColumnHeader` + `WeekSessionCard`), `/p/[id]` (`DayColumn` entière, lundi fictif 2001).
- Plus de vue Mois (code retiré le 06/11).
- Un seul découpage de difficulté : `difficultyWord` / `HARD_FROM` 7 / `MODERATE_FROM` 4 dans `lib/loadRule.ts` (calé sur les libellés CR-10 de l'anneau).
- 07/11/2026 : éditeur de séance (sportif + coach) sans anneau ; difficulté = `DifficultyCrans` (dix crans) sous le nom et la date (`DifficultyRingInput` supprimé). Barre d'activité du haut (`ActivityPill`) : plus d'icônes ✏️ / ↻, toucher la barre ouvre le tiroir ; « Reconduire la semaine » n'a plus d'entrée visible (événement `ACTIVITY_RECONDUIRE` et `?reconduire=` toujours gérés par /week et /coach/planning).
- 08/11 : plus de jauge horizontale dans la carte séance (Planning sportif et coach) : `AutoregButtons shape="none"` monté hors de la carte, il ne rend que ses boutons dans l'encadré (`actionsSlot`). Le Planning coach calcule `todayRing` (`todayRingState`) comme le Planning sportif : même état d'anneau que Coach Control.
- 08/11 : Reconduire revient dans le tiroir de la semaine (`ActivityPill`, ligne « ↻ Reconduire la semaine » sous « Voir le planning », si la semaine a des séances) : événement `ACTIVITY_RECONDUIRE`, sinon `?reconduire=<lundi>` ; event `activity_pill_action` action `reconduire`.
