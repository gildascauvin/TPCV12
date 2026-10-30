---
name: coach
description: Côté coach de ThePerfClub, état actuel. À charger pour Coach Control (`/coach`, radar `CoachRadar`, revue en swipe `CoachDecisionDeck`, `CoachCard`), `/coach/athletes` (Performance, tests), `/coach/planning`, `/coach/programmes`, l'invitation coach vers sportif (`InviteModal`, `InviteHost`, `/join/[code]`, `/api/invite/*`), le lien coach-sportif (`coach_athletes`, `coach_sessions`, `coach_invites`, `invited_by_coach_id`, routes `/api/coach/*`), retirer un sportif, point forme / résultat saisis par le coach, bilan du sportif et bilan du groupe.
---

# Coach : état actuel (30/10/2026)

UI : toujours « ton groupe », « tes sportifs », « sportif ». Jamais « équipe » ni « athlète ».
Le code garde `athlete`, `coach_athletes`, `/api/athlete/*`, `checkin` : ne pas renommer.

## Pages (`src/app/(app)/coach/`)
Bottom nav coach : Accueil (`/coach`) · Planning (`/coach/planning`) · Performance (`/coach/athletes`) · Programmes (`/coach/programmes`).

Fond commun des 3 premières pages : sombre cyan, comme le sportif.
- `CoachPageBg` (`src/components/calendar/CoachPageBg.tsx`, `DARK_CARD_BG`), `CalendarHeader seamless` à l'intérieur.
- `AthleteFilterBar` tout en haut, au-dessus du header de date (« qui » avant « quand »), seule barre sticky.
- Surface posée sur la page : voile `rgba(255,255,255,.055)` + bordure `rgba(255,255,255,.10)`. Jamais un 2e `DARK_CARD_BG` (la carte disparaît dans le fond).
- Accent lisible sur sombre : `#ff8a55` (pas `#d44000`). Les cartes de séance restent claires.

### `AthleteFilterBar` (`src/components/coach/AthleteFilterBar.tsx`)
- Puces « 👥 Groupe » + un prénom par sportif, sans score (c'est un sélecteur, pas un tableau de bord).
- Sélection partagée entre les pages coach via `useCoachAthleteFilterStorage()` (localStorage `coach_athlete_filter`).
- Bouton « + Inviter » toujours visible.

### Coach Control (`/coach`, `page.tsx` + `CoachClient.tsx`)
**Vue Groupe** (aucun sportif sélectionné, onglet Aujourd'hui), pleine largeur.

Gauche, `CoachRadar.tsx` :
- X = récupération effective (`groupRadarX`, via `effectiveRecoveryX` de `lib/autoregulation.ts`) ; Y = RPE prévu de la séance la plus dure du jour.
- Zones Alléger / Maintenir (diagonale) / Surcharger tracées avec `autoregBand(x)`, la bande de `computeAutoregSuggestion` : le radar est la référence du calcul.
- `chronicPenaltyFor` (`lib/decisionCard.ts`) est partagé pour que le radar place chaque sportif là où sa carte le voit.
- Points = `DecisionRingMini thin` (`src/components/sessions/DecisionRing.tsx`, initiales au centre, prop `disc`), à leur position exacte (pas d'anti-chevauchement, qui faisait franchir une frontière).
- Sans séance ou sans point forme : pastilles d'initiales sous le radar.
- Bouton « Passer en revue · N décisions ».

Droite, lignes « À décider maintenant » / « Décidé aujourd'hui » / « Plan cohérent » :
- nom, séance, pastille (⬇ Alléger / ⬆ Surcharger ; « À vérifier » si signal sans reco chiffrée ; « À décider » si verrouillé en gratuit) ;
- `AthleteRing` (jauge « récup » = `recoveryAxisX`) + `DecisionRingMini showValue` (RPE au centre) ;
- « + Invite un sportif » en bas.

Revue, `CoachDecisionDeck.tsx` :
- plein écran, la vraie `CoachCard` une à la fois, file « À décider maintenant » figée à l'ouverture ;
- glisser à droite = la reco, à gauche = Maintenir, via le prop `actionRequest` (CoachCard → `AutoregButtons`, mêmes `apply()`/`maintenir()` que les boutons) ;
- rien enregistré en 2,5 s (paywall, erreur) : la carte revient ; « Plus tard » remet en fin de file.

Onglets Charge / Récupération / Comportements en vue Groupe : `TeamAnalyticsList` (`src/components/conseils/HomeAnalyticsSections.tsx`).
- Tri, titre de section (bande Surcharge/Optimal/Sous-charge ou Fatigué/Équilibré/Frais) et liseré dérivent tous du même `aggregateFor` (`lib/metricCards.ts`), jamais d'une autre source. Jauge `AggregateGauge` à gauche.
- Comportements n'a pas d'agrégat : garde la ring et l'ancien chemin.

**Sportif sélectionné** : une seule `CoachCard page` (`src/components/coach/CoachAthleteCard.tsx`), même rendu que l'Accueil du sportif, `HomeTabs` (`src/components/today/HomeTabs.tsx`) en `dark`, sections sans encadré (iso `/today`).

### `/coach/athletes` (Performance, `AthletesClient.tsx`)
- Recentrée sur les tests physiques : badge dernier test (`getAthletesLastTests`) et verdict forces/faiblesses (`getAthletesTestVerdicts`), tous deux dans `lib/testSummary.ts`, batchés pour tout le roster, client admin.
- Liseré piloté par le dernier test ; `TestsPanel` (`onDarkPage`) à l'ouverture d'une ligne, accordéon à une carte.
- Pastille « SEUIL RECALÉ » si `profiles.autoreg_shift > 0`.
- Plus de menu ⋯ ni de bouton d'invitation ici. Rafraîchissement par date : `GET /api/coach/athletes?date=`.

### `/coach/planning` (`CoachPlanningClient.tsx`)
- Même `DayColumn` générique que `/week` (`src/components/calendar/DayColumn.tsx`, `DraggablePlanning.tsx`) : drag & drop, `UnseenDot`, `AlertBox` du jour (`coachAlertFor`, `lib/alerts.ts`).
- `ReconduireModal` et `DuplicateModal` acceptent `athletes`/`sourceAthleteId` : plusieurs destinataires (`targetAthleteIds`, un `callSessionAPI` par sportif).
- `ProgramBanner dark` cherche l'assignment qui couvre la semaine **affichée** (`activeAssignments`), pas « le programme du jour ».
- Éditeur de séance et d'exercices : skill `planning-editeur`.

### `/coach/programmes`
- `ProgramLibraryStandalone`.
- `ProgramAssignModal` : multi-sportifs (cases à cocher, un `assign` par sportif, échecs partiels agrégés sans bloquer les réussites).

## Lien coach / sportif
- `coach_athletes` : une ligne par sportif du coach (`coach_id`, `user_id` null = profil sans compte ou démo, `invite_email`, `wellness_score` dénormalisé, `free_training_label`, `first_decision_on`). Le coach lit ses lignes avec le client normal (RLS).
- Sportif inscrit : ses séances vivent dans **`sessions`** (son `user_id`). Profil sans compte ou démo : **`coach_sessions`** (`athlete_id`, `is_demo`).
- `POST /api/coach/session` (`action` add / update / complete / delete) choisit la table selon `user_id`, vérifie `coach_id = auth.uid()`, écrit en client admin, notifie le sportif (`notifyCoachUpdate`) et fige le conseil du matin si besoin.
- **RLS bloque toute lecture ou écriture cross-user, même pour un coach.** Pattern obligatoire : vérifier le lien `coach_athletes` avec le client normal, puis `createAdminClient()`.
- Routes de ce pattern : `/api/coach/{wellness,athletes,session,session-history,session-replay,checkin,bilan,group-bilan,roster,free-label,athlete-tests}` ; côté sportif `/api/athlete/coach-tests` (coach résolu via `profiles.invited_by_coach_id`).
- Tests physiques visibles dans les 2 sens : `tests`/`test_results` (migration 016) scopés par `owner_id`, fusionnés par `name_key` (`mergeTests`, `lib/testResults.ts`). Seule la relation coach courante est fusionnée.
- Wellness : toujours lu pour la **date affichée** (`/api/coach/wellness?date=`, qui renvoie aussi `baselineHistory` sur 42 j ; baselines recalculées à chaque render dans `CoachClient`).
- `wellnessFilledToday === false` : afficher un tiret, ignorer le score. Jamais de repli sur `coach_athletes.wellness_score` pour un vrai sportif ; ce repli ne vaut que pour les démos.
- Accès gratuit d'un sportif invité : seulement si **son coach paie** (`coachIsPaying`, `lib/access.ts`, `subscription_status === "coach"`), calculé dans les `page.tsx` sportif puis passé en `hasCoach` à `usePaywall`.

## Invitation coach vers sportif
Ouverture sur place partout :
- `InviteHost` (monté dans `(app)/layout.tsx` côté coach et dans la sandbox) écoute `OPEN_INVITE` ;
- `openInvite()` est appelé par « + Inviter » (`AthleteFilterBar`), la checklist d'onboarding, le tiroir d'activité (`ActivityPill`) et « + Invite un sportif » de Coach Control ;
- fermer après un envoi recharge la page.

`InviteModal` / `InviteForm` (`src/components/coach/InviteModal.tsx`) :
- plusieurs emails à la fois (un `POST /api/invite/create` par email, `Promise.all`, échec partiel agrégé) ;
- message prêt « Envoyer sur WhatsApp » / « Copier » (`readyInviteText`, modifiable, ne suit plus le prénom une fois édité ; PostHog `invite_ready_message` ; un envoi WhatsApp ne crée pas de `coach_invites`) ;
- le formulaire de l'état vide (0 sportif) reste, c'est la seule action de l'écran.

Côté serveur :
- `POST /api/invite/create` : compte existant → lien direct ; sinon `coach_invites` pending + placeholder `coach_athletes` + email Resend (`sendCoachInviteEmail`, `lib/email/inviteEmail.ts`, depuis `invitations@theperfclub.com`, best-effort). `POST /api/invite/resend` renvoie l'email.
- `/join/[code]` → `JoinRedirect` → `/register?role=athlete`. `GET /api/invite/validate` (public, renvoie aussi `coachPaying`).
- `INVITE_ATHLETE_PATH = ["value_intro","account"]` (`lib/onboardingPath.ts`) : ni diagnostic ni paywall. `POST /api/invite/join` dont le résultat est vérifié avant `onboarding_done`, y compris dans la continuation Google.
- Rattrapage : `TodayClient` appelle `POST /api/invite/link` au montage si le sportif n'a pas de coach (compte déjà inscrit + invitation pending).
- Au join/link, `migratePlaceholderSessions.ts` supprime les `coach_sessions` démo (`is_demo`) et **migre** les réelles vers `sessions` (+ `program_assignments.user_id`). Ne jamais revenir à « tout supprimer » (le coach perdait le planning construit).

## Retirer un sportif
- `ProfileDrawer` côté coach : onglets « Mon profil » / « Mes sportifs » (`src/components/profile/CoachAthletesManager.tsx`).
- Statut Compte actif / Invitation envoyée · email / Profil sans compte ; email des inscrits via `GET /api/coach/roster` (admin après vérification de propriété).
- Menu ⋯ : Voir sa journée, Renvoyer l'invitation, puis Retirer de mon groupe / Annuler l'invitation / Supprimer le profil, confirmation dans la ligne (pas de `confirm()`).
- Route `/api/athlete/delete` : vérifie `.error` sur chaque écriture (500, jamais un faux succès), remet `invited_by_coach_id` à null.
- Les pages coach gardent leurs sportifs en state : fermer le tiroir après un retrait recharge la page.

## Point forme et résultat saisis par le coach
Usage en salle (tablette sur le compte coach). Sur la `CoachCard page` d'un vrai sportif uniquement (`user_id` non null, jamais en sandbox) :
- « Faire le point forme de X » / « Modifier son point forme » → `WellnessModal` prop `subject` (3e personne, historique via `GET /api/coach/bilan`, pas d'écran de résultat).
- Enregistrement `POST /api/coach/checkin` (lien vérifié, admin, `withDeviceScore`, `.error` vérifié), puis `/api/sessions/proposal` avec `athleteUserId` : le conseil du matin est figé comme si le sportif l'avait fait. Échec : message visible, modale ouverte.
- Terminer une séance → `CoachCompleteModal` (le même qu'au Planning), `action: "complete"`, puis écran de résultat `CoachResultHost` (`sessionVerdict`, `lib/sessionInsight.ts`).
- Toucher une séance faite ouvre aussi cet écran (Coach Control, revue, Planning après notation). Le verdict vit seulement dans l'écran de résultat, jamais sur la carte.

## Bilans
Bilan d'un sportif :
- `BilanCarousel` prop `subject { athleteId, name }`, données `GET /api/coach/bilan`, 3e personne.
- Pas d'écran partage ni de bouton « Me recaler » (le sportif décide ; le coach voit « Seuil recalé » / « Recalage proposé »).
- Liens « Bilan › » / « Bilan du mois › » / « Depuis le début › » du calendrier (`onOpenBilan`) dès qu'un vrai sportif est sélectionné.

Bilan du groupe (vue Groupe, mêmes liens) :
- `BilanCarousel group`, `GET /api/coach/group-bilan?today=` (lectures paginées par 1000, sportif lié deux fois compté une fois, sans compte exclus), calcul `computeGroupBilan` (`lib/groupBilan.ts`).
- 5 écrans : `g_decroche`, `g_seances` (par mot de difficulté prévue, pas par nom de séance), `g_appris`, `g_conseils` (`allVerdicts` de `lib/bilan.ts`), `g_charge`.
- Un seul sportif avec des données suffit. Jamais de moyenne du groupe : des prénoms, du plus préoccupant au moins préoccupant.
- « Bilan de X › » ouvre son bilan par-dessus ; la croix ramène au même écran du groupe.
- Daltonisme : barre pleine / demi-hauteur / pointillé + légende ; barres de charge doublées de texte.

Commun : compte coach gratuit → paywall ; pas de bilan en sandbox. PostHog `coach_bilan_opened` (`from`, `scope: "group"`), `bilan_opened` (`source: coach | coach_group`).

## Retour coach sur l'exercice
- `ExerciseBlockEditor` : vidéo / photo / commentaires par exercice, `exercise_media` JSONB sur `sessions` et `coach_sessions`, bibliothèque `exercise_video_library`, bucket `exercise-comments`.
- Point non cliquable `UnseenDot` (`viewed_by_athlete_at` / `viewed_by_coach_at`, écrits à l'ouverture de la séance ; côté coach via `callSessionAPI`).
- À l'assignation d'un programme, `mediaForAssignment` (`lib/programMedia.ts`) recopie médias et commentaires du coach.
- Détail : skill `planning-editeur`.

## Programmes enchaînés
- Plusieurs assignments actifs par sportif. `assign/route.ts` ne désactive que les assignments déjà terminés.
- `pickRelevantAssignment()` (`lib/programAssignment.ts`) : en cours d'abord, sinon le plus proche à venir. Jamais « le plus récemment créé ».

## Pièges encore valables
- Sportifs démo : tous `user_id: null`. Ne jamais matcher `x.user_id === a.user_id` sans vérifier que `a.user_id` est non null (le 1er démo gagnait toujours).
- Dates de programme : comparer à midi (`T12:00:00`) ; reformater `startOfWeek()` en date-string avant de comparer (la semaine 1 n'était jamais reconnue).
- Vue Mois : `handleDateChange()` doit appeler `loadMonth()` en mode mois ; plage = semaines entières qui chevauchent le mois.
- `selectedAthleteId` ne se resynchronise que sur l'URL (`searchParams`), jamais sur `athletes` (écrasé à chaque `router.refresh()`).
- Handler `wheel` des grilles semaine : ne rien faire si une modale est ouverte.
- `POST /api/invite/create` liste les comptes via `admin.auth.admin.listUsers({ perPage: 1000 })` (le filtre `?email=` n'existe pas) : plafond à surveiller au-delà de 1000 comptes.
- Pas de `{/* commentaire */}` entre `return (` et l'élément racine.
- Ne jamais importer depuis `AthletesClient.tsx` ou une autre page : `athleteStatus` / `AthleteRing` vivent dans `components/coach/AthleteRing.tsx`.
- Gildas fait la QA lui-même : pas de clic réel sur ses comptes.

## Abandonné / retiré
- Carrousel « À décider », grille « Plan cohérent » en cartes, tuiles de filtre par métrique (le state `metricFilter` reste, non affiché).
- Ancien fond clair `COACH_PAGE_BG` et convention « page claire + cartes sombres ».
- Scores dans les puces du sélecteur.
- Option « Inviter » du « + » de la bottom nav (`?quickadd=invite` encore lu par `AthletesClient`, sans appelant).
- Menu ⋯ et insight croisé charge/récup sur `/coach/athletes` (`trendInsights` encore fetché, non rendu).
- Halo pulsant (remplacé par `PulseDot` dans `AlertBox`) ; verdict en titre de `CoachCard`.
- Mode salle, compte géré, place vide « Ton 1er sportif » sur le radar.
- Page de gestion de la bibliothèque vidéo, chat, communauté.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
