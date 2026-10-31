---
name: onboarding-flow
description: Parcours d'inscription ThePerfClub (état au 30/10/2026) : OnboardingFlow.tsx, src/lib/onboardingPath.ts (buildOnboardingPath, parcours Elite), value_intro, decision_2a/2b (AHA, AhaPreviews.tsx), account (signup sans mot de passe, Google/Apple), questions post-signup ob_sport/ob_program/ob_import/ob_goal/ob_weak/ob_days/ob_count, argumentaire avant paywall ob_plan/ob_health/ob_decide/ob_insight/ob_week/ob_invite/ob_notif/ob_pay, /register, /join/[code], claim_program_id, coach_invite_code, ?dbgstep, checklist OnboardingChecklist / /api/onboarding/progress, acclimatation S0. À charger avant de toucher à l'inscription, à l'AHA ou au post-signup.
---

# Onboarding (inscription → app)

## Fichiers clés
- `src/components/onboarding/OnboardingFlow.tsx` (~2500 lignes) : tout le parcours, rendu de chaque step, création du compte, préparation, entrée dans l'app.
- `src/lib/onboardingPath.ts` : type `StepId`, tableaux de base, `buildOnboardingPath()` (fonction pure), `readEliteFlag()`, `ELITE_STEPS`, `PROGRAM_QUESTION_STEPS`. Test de la matrice : `node scripts/run-onboarding-path-test.mjs` (source `scripts/onboarding-path.test.ts`). À relancer après toute modif du parcours.
- `src/app/(auth)/register/page.tsx` : choisit le mode (inscription, reprise d'un compte connecté sans `onboarding_done` via `resumeRole`, continuation Google via `pendingData`), preload de l'image de `value_intro`.
- `src/app/join/[code]/JoinRedirect.tsx` : pose `coach_invite_code` en localStorage puis `/register?role=athlete`.
- Écrans :
  - `DecisionStep.tsx` : AHA en 3 étapes (`decision_2a` sportif / `decision_2b` coach).
  - `AhaPreviews.tsx` : illustrations sombres non cliquables (`AhaMorningCard`, `AhaBilanPreview`, `AhaDecisionPreview`, `AhaFormPeakPreview`, `AhaRadarPreview`, `AhaGroupBilanPreview`).
  - `PostSignupSteps.tsx` : `QuestionShell`, `OptionCard`, `ChoiceChip`, `SportStepBody`, `ImportStepBody`, `DeadlineField`, `GOAL_OPTIONS`.
  - `EliteSteps.tsx` : `COUNT_OPTIONS`, `HealthStepBody`, `PlannedWeekBody`, `WeekStepBody`, `NotifStepBody`, `AppPushStepBody`, `StreakTitle`.
  - `InsightSteps.tsx` : `InsightStepBody`, `sportFamily`, `decideOptions(Coach)`, `pickWords(Coach)`, `payHeadline(Coach)`, `insightTitle`.
  - `AnalysisReveal.tsx` : écran sombre « on construit », étapes qui se cochent.
  - `OnboardingBackground.tsx` : `variant` `dark` | `light` | `glow`.
  - `Actions.tsx` : CTA partagé, sans bouton retour.
- Composants de l'app réutilisés tels quels : `SportPicker` (components/programs), `InviteForm` (exporté par `coach/InviteModal.tsx`), `WellnessModal`, `PrimingJourneyModal` / `PaywallModal`, `SessionTemplateCard`, `AutoregButtons` (mode `demo`), `DecisionRing`.
- Après l'inscription : `OnboardingChecklist.tsx` (monté dans `calendar/CalendarHeader.tsx`), `src/lib/onboardingProgress.ts`, `GET /api/onboarding/progress`.
- Libs : `sportCatalog.ts` (41 entrées), `programCovers.ts` (`sportCover`, `DEFAULT_ONBOARDING_COVER`), `sportCategories.ts` (`sessionsComplement`), `programSchedule.ts`.

## Parcours actuel (parcours « Elite », allumé pour tous)
Interrupteur `readEliteFlag()` : allumé par défaut. `NEXT_PUBLIC_ELITE_ONBOARDING=0` sur Vercel + redéploiement = ancien parcours (questions puis app). `?elite=0|1` force un parcours (mémorisé en localStorage `tpc_elite_onboarding`).

**Sportif direct**
```
value_intro → decision_2a → account
→ ob_sport → ob_program → (ob_import | ob_goal → ob_weak → ob_days)   (« Passer » sur ob_program = obHas "later" : pas de questions)
→ ob_plan → [ob_health si Apple Santé lisible, app iOS] → ob_decide → ob_insight → ob_week
→ [ob_notif si notifs activables] → ob_pay → app (/today)
```
**Coach**
```
value_intro → decision_2b → account → ob_sport → ob_count → questions programme
→ ob_plan → ob_decide → ob_insight → ob_week → ob_invite → [ob_notif] → ob_pay → app (/coach)
```
- **Programme claimé** (`claim_program_id` en localStorage, posé par `/p/[id]`) : pas de questions de programme (coach : `ob_count` seul). Le programme claimé est montré tel quel sur `ob_plan`.
- **Sportif invité par un coach** (`INVITE_ATHLETE_PATH` = `value_intro → account`) : puis l'app directement, la checklist prend le relais ; si le coach ne paie pas, le paywall arrive par le gating de l'app. Prioritaire sur tout le reste.
- **Sans programme** (« plus tard », génération ou import raté) : mêmes écrans, une séance type du sport (`obProgramOk=false`).
- `value_intro` est toujours l'étape 0 ; il n'y a plus de step `role` : les 2 cartes de rôle sont le CTA de `value_intro` (bouton unique si le rôle est déjà connu par `?role=`, claim, invitation ou reprise).

## Ce que fait chaque écran
- **value_intro** : photo plein fond (couverture du programme claimé, sinon `DEFAULT_ONBOARDING_COVER`), titre « Ton programme ne sait pas que tu as mal dormi. ThePerfClub, si. », carte `AhaMorningCard` (lignes de séance allégées calculées par le vrai moteur).
- **decision_2a/2b** : 3 étapes minutées (5 s). Sportif : bilans (`AhaBilanPreview`) → « Ta séance s'ajuste chaque matin » → pic de forme (`AhaFormPeakPreview`). Coach : radar (`AhaRadarPreview`) → décision « Karim Haddad » → bilan du groupe (`AhaGroupBilanPreview`). Reco jamais écrite à la main : `syntheticBaselineFor` + `computeAutoregSuggestion` (à recalibrer si la règle de reco change). Bilans en écran de synthèse, jamais en story ; style de `BilanCarousel` recopié sans l'importer (module trop lourd pour l'inscription).
- **account** : fond `glow` (sauf l'écran « vérifie tes emails », resté clair), prénom + email sans mot de passe, Google, Apple (app iOS seulement). Apple/Google et « ou avec email » se replient dès qu'un champ est actif ou rempli (`accountFieldFocus`, repli au focus, `visibility` et pas `inert`). Titre programme claimé : `sessionsComplement(sport)`.
- **Questions post-signup** : `QuestionShell` (bandeau photo du sport, frise, retour, Passer). Récap en direct sur `ob_days` (`obRecap`). Côté coach elles parlent de « ton programme ».
- **ob_plan** : `AnalysisReveal` (attend le programme, 15 s max) puis la semaine 1 telle quelle (nom coupé au tiret). Sportif : bouton « Faire mon point forme » qui ouvre le vrai `WellnessModal` (sur iOS avec Santé : « Continuer » vers `ob_health`, qui ouvre ensuite le point forme). Coach : `WellnessModal offline` « Imagine le point forme d'un de tes sportifs », rien d'enregistré. Point forme passé : exemple « nuit courte » (`obExample`).
- **ob_health** : `syncHealthData` (import dynamique, plugin iOS seulement). Bandeau texte des marques, jamais de logos.
- **ob_decide** (« Tu fais quoi ? ») : réponse dans `profiles.frustration` (`force/feeling/saute/pousse`, coach `coach_garde/coach_oeil/coach_aveugle/coach_pousse`).
- **ob_insight** : `AnalysisReveal` puis `InsightStepBody`, cartes par famille de sport, chiffres illustratifs.
- **ob_week** : la jauge de décision de /today (`AutoregButtons` mode `demo`, jamais de décision lue/écrite). Séance figée dès `ob_decide` (`obRingRef`).
- **ob_invite** (coach) : `InviteForm`, invitations envoyées au clic (`sendObInvites`, `POST /api/invite/create`).
- **ob_notif** : natif (`enableNotifications`) ; iPhone Safari = bouton App Store ; ordinateur = QR ; heure dans `profiles.push_hour`.
- **ob_pay** : `PrimingJourneyModal` puis `PaywallModal`, titre `payHeadline` / `payHeadlineCoach` avec le nom de la séance de la jauge. La fermeture et l'achat appellent `finishOnboarding`. Contenu du paywall (pas de carte Gratuit, `RiskTimeline`, offre de sortie, feuille de perte) : skill `paywall-billing`.
- Côté coach, pas de prénom de sportif : « ton sportif » partout (`capS()` en début de phrase).

## Audit UX du 31/10 (en ligne)
- Inscription : vrai `<form>` (Entrée/« Aller » valide), champs 16 px + autocomplete, email vérifié (`EMAIL_RE`), erreurs Supabase traduites (`signupErrorFr`). Sur téléphone (`pointer: coarse`), pendant la saisie le bouton fixe disparaît et « Activer mon espace » s'affiche sous le champ email (`inlineCta`) : le bouton déplacé au-dessus du clavier (visualViewport) se plaçait mal dans Safari et Chrome iOS, ne pas y revenir.
- Préparation : `fetchWithTimeout` (20 s) sur génération, enregistrement et attribution du programme.
- Frise des questions par thème (`segments` de `QuestionShell`) : programme / point forme / sportifs et notifications.
- 2e analyse = `ReadingReveal` (« On lit ton point forme », vraies réponses + verdict), jamais un 2e anneau à cocher. Jamais « ton matin ».
- Objectifs par famille du catalogue (`goalOptionsFor`) : force, endurance, collectif (« Tenir tout le match »), combat (« Tenir tout le combat »), athlé.
- Démos coach : le sportif s'appelle Karim (AHA et aperçu des notifications), « ton sportif » dans le texte. Titres neutres si `ob_decide` est passé.
- `ob_pay` coach : `athleteCount` (réponse `ob_count`) et `hasAthletes` (invitations envoyées) passés à `PrimingJourneyModal`.
- Point forme : ← et « Plus tard » en haut, pas de « Suivant » (les notes avancent seules), bouton seulement aux comportements.
- Mode test sans compte : le programme reprend sport, jours, objectif et points faibles choisis (`dbgsport` en repli).

## Données écrites
- `handleFinish` : `supabase.auth.signUp` (mot de passe aléatoire), `createAccount(uid)`, `posthog.identify`, `account_created`, puis `/api/invite/link` et, pour un invité, `/api/invite/join` (résultat vérifié ; échec → `inviteJoinFailed`, retour au parcours normal). `afterAccount` va au step après `account`.
- `runPrepare` / `prepareOnboarding` (lancé en arrière-plan dès le 1er écran Elite, promesse mémorisée, relancée seulement en cas d'échec) :
  - `completeProfile` ;
  - programme généré (`/api/programs/generate`), importé (`/api/programs/import`) ou claimé, enregistré (`POST /api/programs`) puis assigné ;
  - sportif : à lui-même avec `acclimatation: true` ;
  - coach : au sportif démo Thomas sans acclimatation, `align_first_session: true` (1re séance aujourd'hui, donc une décision le jour de l'inscription). Repli `assignDemoProgram` (« Programme démo ») ou `buildCoachDemoSessions`.
  - En Elite, `onboarding_done: true` est posé à ce moment (upsert `profiles`) : un départ en cours de route ouvre l'app.
- `ensureWeek` : séances à venir du programme assigné, pour `ob_plan` / `ob_week`.
- `finishOnboarding` → `enterApp` : enregistre un programme claimé non encore sauvé, **upsert** (jamais update) `profiles {mode, onboarding_done: true}`, `onboarding_entered_app`, redirection `/today` ou `/coach`.
- **Semaine 0 d'acclimatation** (`/api/programs/[id]/assign`, `acclimatation`) : lundi = départ aujourd'hui sans S0 ; sinon départ lundi prochain, et les séances S1 des jours restants posées tout de suite (« Acclimatation · … », difficulté −2, charges −20 %). Colonne `program_assignments.acclimatation`, `programWeekTag()` → « S0 · Acclimatation ».
- Sportif : aucune donnée fictive à l'inscription (elles faussaient les vrais calculs). Coach : Thomas (démo) garde un historique synthétique.

## Checklist dans l'app (après l'inscription)
- Puce dans `CalendarHeader` + panneau.
- Étapes dérivées des vraies données (`/api/onboarding/progress`), rien coché à la main.
  - Sportif : Renseigne ta forme, Construis ton entraînement, Ajuste et fais ta séance, Débloque tes performances (masquée si le coach paie).
  - Coach : Crée ton compte (toujours cochée), Invite tes sportifs, Construis leur entraînement, Ajuste leur séance (`first_adjustment_at`), Débloque leurs performances.
- Events `OPEN_QUICKADD` (écouté par `BottomNav`) et `OPEN_PRIMING` (écouté par `usePaywall`).
- `markFirstAdjustment()` ouvre le priming après la 1re décision.
- Jamais en sandbox.

## Outils de test
- `?dbgstep=N` : démarre à l'index N du path. Sans compte, les écrans Elite tournent sans rien écrire : programme généré à la volée, code d'invitation factice `tpc-demo`.
  - Sportif : `/register?role=athlete&dbgstep=8` ; coach : `role=coach&dbgstep=9`.
  - Options : `&dbgsport=Trail`, `&dbgprog=none`, `&dbghealth=1`, `&dbgcheckin=1`.
- `?pwios=1` : simule le paywall iOS sur le web (géré côté paywall).
- L'import et l'analyse de sport ne marchent qu'en prod (clé IA vide en local).
- Gildas fait la QA lui-même. Ne jamais compléter une connexion Google/Apple en test. Toujours de vraies adresses (alias Gmail) pour tester signup/invitation.

## PostHog
- Chaque step émet **deux** events : `onboarding_step_viewed` (funnels) + `onboarding_<step>_viewed` (spécifique). Ne jamais fusionner.
- `onboarding_role_viewed` est émis au clic sur un rôle (ou au montage si le rôle est connu, effet déclaré **après** l'effet générique de vue). `program_onboarding_start` doit partir avant.
- Events métier : `onboarding_plan_reveal_done`, `onboarding_insight_reveal_done`, `onboarding_decide_answered {answer, role}`, `onboarding_coach_checkin_imagined`, `onboarding_checkin_saved/skipped {role}`, `onboarding_health_connected/skipped/failed`, `onboarding_app_push(_skipped)`, `notif_prompt_enabled/dismissed {surface:"onboarding"}`, `onboarding_pay_free/purchased`, `onboarding_entered_app`, `onboarding_checklist_*`.
- Dashboard 706709 : funnels sportif `6JLNeyfb` / coach `M71wHM4I` (depuis le 30/10), « Questions post-signup » `SUb8KXZy` / `HLxOiBpE`. « Passer » mène toujours à l'écran suivant (`obAdvance`), donc les étapes « écran vu » sont strictes ; seules les actions (point forme fait/imaginé, offre de sortie) sont facultatives.
- Ajouter un step à un funnel existant : bumper `date_from`, sinon toute la cohorte antérieure tombe à 0 %. Grep les events avant de remplacer un composant.

## Invariants et pièges (bugs déjà corrigés, à ne pas réintroduire)
- **Reprise Google/OAuth** : ne jamais appeler `next()` depuis une closure figée d'un effet à deps `[]`. Passer par un state (`googleInitDone`) + un effet séparé, et viser `path.indexOf("account") + 1`.
- Même règle pour `inviteJoinFailed` : recalculer l'index dans le path à jour.
- `isRegisterMode = !userId || !!pendingData` (une session Google continuée reste une inscription).
- `stepIdx` est clampé à `path.length - 1` (filet anti écran blanc `onboarding_undefined_viewed`).
- Gardes anti double clic sur toute écriture non idempotente suivie d'une navigation : `finishGuardRef`, `finishGuardRef2`, `enterAppGuardRef`, `profileCompleteGuardRef`, `advancingRef`.
- `enterApp` fait un upsert, pas un update (compte orphelin sans ligne `profiles` = boucle sur `/register`).
- `alreadyHasRealHistory` compte aussi `coach_athletes` (sinon un coach qui reprend recrée un sportif démo).
- Ordre des effets au montage = ordre de déclaration textuelle : l'effet de claim/invitation est avant l'effet générique de vue, l'effet `initialRole` est après.
- Pas de retour d'un écran Elite vers les questions de programme (`PROGRAM_QUESTION_STEPS`) : le programme est déjà en préparation.
- Ne jamais importer dans l'inscription depuis un fichier de page (`app/**/XClient.tsx`) ni depuis une modale lourde : ça annule les `next/dynamic` et charge Stripe ou une page coach dès le 1er écran (ex. `PAYWALL_AVATARS` vit dans `paywall/paywallAvatars.ts`).
- Clé du point forme auto du matin : `wellness_prompted_{userId}_{date}` (par compte).
- Footers : `Actions` en `position:fixed` sur les pages pleines, fond opaque (jamais de gradient à stop en %), pas de bouton retour.
- Wording : « point forme » (10 secondes), « ton groupe », pas de tiret long en prose (skill `ui-wording`).

## Abandonné ou mort (ne pas ressusciter)
- Wizard post-signup (`wizard_picker/library/criteria/builder/activate/assign`) et paywall de fin de parcours `paywall_priming` / `paywall_form` : retirés du type. Restent des noms d'états `wizard*` et des commentaires historiques dans `OnboardingFlow.tsx`.
- Steps supprimés :
  - écran `role` séparé ;
  - pain points `*_2a/*_2b` (frustration, overload, planning, fatigue) ;
  - `autoreg_score(_coach)`, `concept_autoreg`, `profile_recap` ;
  - `sport_2a/level_2a/goal_2a/days_2a`, `week_preview_2a/2b`, `wellness_check`, `wellness_q/wellness_reveal` ;
  - `celebration`, `invite_team`, `value_slides`.
- Composants supprimés : `CelebrationScreen.tsx`, `WeekPreviewStep.tsx`, `AutoRegScoreStep*.tsx`, `ProductTourOverlay.tsx`, `WelcomeReveal.tsx`, `AhaRecoveryPreview`, `AhaTeamChargePreview`, carte « Signal du jour » (score 52).
- Remplacés le 30/10 par `ob_plan` / `ob_decide` / `ob_insight` : `ob_when`, `ob_mirror`, `ob_checkin`, `ob_control`. Ils restent dans le type `StepId` mais aucun rendu ni path ne les utilise.
- A/B tests `short-onboarding-signup` et `skip-value-intro` clos, plumbing retiré : plus de `?ab=`, plus de variantes A/B de path.
- Plus de score de forme avant l'inscription (« on vend pas ça »). Plus de données fictives sportif. Plus de bannières d'activation J0.
- Personnalisation de l'AHA (séance réelle du claim, prénom) écartée (« overkill »).

## Pas encore branché
`ReplayStepBody` (rejeu Apple Santé réel), `ReviewPromptMock` (note native), Health Connect dans l'onboarding Android : lot natif après validation Play.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
