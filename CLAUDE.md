# ThePerfClub — Instructions pour Claude

## Stack
- **Framework** : Next.js 14 App Router (TypeScript)
- **Backend** : Supabase (auth + PostgreSQL + RLS)
- **Styles** : inline styles React (pas de Tailwind dans les composants principaux)
- **Node** : `~/.nvm/versions/node/v20.20.2`
- **Démarrage** : `export PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH && npm run dev`

## Référence design absolue
Le fichier `/Users/Gildas/Desktop/theperfclub_poc_v59_coach_exercises_share_delete.html` est **la référence de design**. Toujours le consulter avant de créer ou modifier un composant visuel. Ne jamais deviner les couleurs, espacements ou typographie — lire le POC.

## Constantes de design
- **Accent** : `#d44000` / fort : `#f04a08`
- **Fond modal** : `#fff`, radius `30px`, padding `28px`
- **Box-shadow modale** : `0 42px 120px rgba(0,0,0,.34)`
- **Bottom nav z-index** : `2147483000` → toutes les modales doivent être à `2147483100`
- **Gradient bouton primaire** : `linear-gradient(180deg,#f04a08,#d44000)`
- **Fond page** : `#f1f0ee`
- **Jauge de difficulté** :
  - Facile (1-4) : `linear-gradient(90deg,#bfeec8,#2f9e44)`
  - Modérée (5-7) : `linear-gradient(90deg,#ffe0a0,#f28a00)`
  - Dure (8-10) : `linear-gradient(90deg,#ffb5a7,#d44000)`
  - Largeur : `max(22, min(100, value * 10))%`

## Structure des pages
```
src/app/
  (app)/          # Pages authentifiées (layout avec BottomNav)
    today/        # Vue du jour — TodayClient.tsx
    week/         # Planning hebdomadaire — WeekClient.tsx
    conseils/     # Conseils + signature de fatigue
    profil/       # Profil + édition — ProfilClient.tsx
    coach/        # Mode coach (stub)
  (auth)/
    login/        # Connexion + magic link + reset password
    register/     # Création de compte
  reset-password/ # Nouveau mot de passe (après lien email)
```

## Onboarding — flows actuels (2026-07-20)

**Refonte v2 déployée en prod le 2026-07-20** (branche `onboarding-v2-signup-variants`, commit `ac1bb21`) : remplace intégralement la structure du 2026-07-12 décrite plus bas dans ce fichier avant cette date. Six changements structurels :
1. `value_intro` unifié (générique, position 0 dans tous les paths, avant `role`) — remplace `value_slides`/`value_program`/`value_program_coach`.
2. Le Signup (`account`) devient **testé en A/B** via le flag PostHog `short-onboarding-signup` : variante **A** (`control`) juste après les pain points (comme avant) ; variante **B** (`test`) tout de suite après `role`, profil encore vide. Override dev/support : `?ab=test|control`.
3. Paywall scindé en 2 écrans plein-page : `paywall_priming` (pricing mensuel/annuel + frise de réassurance 3 temps + témoignage) → `paywall_form` (Stripe uniquement, rappel prix compact).
4. **Paywall → Célébration → Activation** (ordre inversé par rapport à avant) : le paywall précède désormais `celebration`, et l'activation (`wellness_q`/`wellness_reveal` sportif, `invite_team` coach) est insérée **dynamiquement après** `celebration`, uniquement si le paiement réussit (`paidExtras`, posé dans `handlePaymentSuccess()`) — plus dans le tableau statique du path.
5. `handleFinish()` scindé en `createAccount(uid)` (léger, appelé au submit de `account`) + `completeProfile(uid)` (le reste : sport/niveau/objectif/jours, sessions, wellness baseline, démo coach — déclenché à l'entrée de `profile_recap`, puisque le Signup peut désormais arriver avant que ces données soient connues).
6. `onboarding_done` posé uniquement au succès réel du paiement (`handlePaymentSuccess()`), plus dans `createAccount()`/`completeProfile()` — un abandon après compte créé mais avant paiement ne fuit plus vers un accès gratuit permanent.

Historique complet du chantier (débats, wording, POC) : mémoire `project_onboarding_v2_proposal.md` et plan `/Users/Gildas/.claude/plans/sequential-percolating-dijkstra.md`. Structure pré-2026-07-20 (désormais obsolète) conservée dans l'historique git de ce fichier si besoin de contexte.

### Sportif — flux classique (`ATHLETE_PATH` = variante A / `SHORT_ATHLETE_PATH` = variante B)
```
value_intro → role
── variante B (test) : SIGNUP ICI ──
→ frustration_2a → overload_2a → planning_2a → fatigue_2a (pain points, auto-advance)
── variante A (control) : SIGNUP ICI ──
→ autoreg_score (dark card, score % + 3 jauges + persona comportemental révélé ici)
→ concept_autoreg (solution ThePerfClub)
→ sport_2a → level_2a → goal_2a → days_2a
→ profile_recap ("Ton programme d'entraînement" — qualités physiques par sport, plus de persona ici)
→ week_preview_2a (programme preview)
→ account (si pas déjà fait en variante B — email + prénom, pas de mot de passe)
→ paywall_priming → paywall_form (Stripe — CB obligatoire, non contournable)
→ celebration ("Bienvenue !")
[paiement réussi → paidExtras = ["wellness_q","wellness_reveal"], insérés après celebration]
→ wellness_q → wellness_reveal → redirect /today
```

### Sportif — flux programme (`PROGRAM_ATHLETE_PATH` / `SHORT_PROGRAM_ATHLETE_PATH`)
Activé si `claim_program_id` en localStorage (user venant d'une page WP via `?claim=[id]`). Garde le diagnostic complet, perd `sport_2a`/`goal_2a`/`level_2a`/`days_2a`/`week_preview_2a` (déduits du programme claimé).
```
value_intro → role → [pain points] → account (position selon variante A/B, comme ci-dessus)
→ autoreg_score → concept_autoreg
→ profile_recap (nom réel du programme claimé — GET /api/programs/[id])
→ paywall_priming ("Ton programme {nom} t'attend.") → paywall_form
→ celebration → [wellness_q/wellness_reveal si paiement réussi]
```
`claim`+`assign` exécutés à la fin de `completeProfile()` pour le compte créé en variante A (données déjà connues), ou dans `finishAthleteActivation()` à la fin de `wellness_q` avec le vrai `wellnessAdjustment` — voir `claimAndAssignProgram(uid, wellnessAdjustment)`.

### Coach — flux classique (`COACH_PATH` / `SHORT_COACH_PATH`)
```
value_intro → role
── variante B (test) : SIGNUP ICI ──
→ challenge_2b → overload_2b → planning_time_2b → fatigue_2b (pain points)
── variante A (control) : SIGNUP ICI ──
→ autoreg_score_coach → concept_autoreg (donut CoachBlindSpotWheel)
→ sport_2a → level_2a → goal_2a → days_2a  ← wording "de tes sportifs"
→ profile_recap → week_preview_2b
→ account
→ paywall_priming → paywall_form
→ celebration
[paiement réussi → paidExtras = ["invite_team"]]
→ invite_team → redirect /coach
```
`completeProfile()` (à l'entrée de `profile_recap`) : crée 5 sportifs démo (Thomas M./Emma L./Pierre D./Sofia R./Lucas B.), `buildProgramTemplate()` génère un programme 4 semaines assigné à Thomas M., `finishCoachClaim(uid)` exécute le claim/assign si programme claimé (ne dépend pas du wellness, contrairement au sportif).

### Coach — flux programme (`PROGRAM_COACH_PATH` / `SHORT_PROGRAM_COACH_PATH`)
Même principe que le sportif via programme : garde le diagnostic, perd `sport_2a`/`level_2a`/`goal_2a`/`days_2a`/`week_preview_2b` (déduits du programme claimé). `finishCoachClaim(uid)` appelé depuis `completeProfile()`.

### Étape `invite_team` (coach) — désormais post-paiement uniquement
Toujours adaptée de `InviteModal.tsx` (lien `go.theperfclub.com/join/{code}`, copier/WhatsApp, formulaire email multi-destinataires via `POST /api/invite/create`) — **mais n'est plus un step du path statique** : insérée dynamiquement après `celebration` seulement si `trial_started` réussit (voir `paidExtras` plus haut). CTA "Continuer →" termine l'onboarding (redirect `/coach`), jamais bloquant sans email rempli. "🔔 Plus tard — me le rappeler" reste le seul lien secondaire dans le footer (pas de "Passer", jugé redondant).

### Auth mode (déjà connecté, onboarding non terminé)
```
role → questions selon rôle → completeProfile()/createAccount() déjà faits → paywall_priming → paywall_form → celebration → activation
```
`register/page.tsx` fait rentrer un user authentifié dont `onboarding_done` est encore `false` dans `OnboardingFlow` pour reprendre, plutôt que de forcer l'accès direct.

### Continuation Google OAuth — 2 bugs trouvés et corrigés en prod le 2026-07-20 (soir)
Le repositionnement de `account` (point 2 ci-dessus) a cassé la reprise après `signInWithOAuth("google")`, restée conçue pour l'ancien flow où `account` était en toute fin de path :
1. **Atterrissage systématique sur `role`** (commit `7c573e5`) — le `useEffect` qui reprend le flow une fois le compte Google créé (`googleInitDone`) appelait `next()`, qui suppose `stepIdx` à sa valeur de montage (0) et avance d'une seule position. Avant ce chantier, l'index 0 était `role` lui-même, donc avancer de 1 tombait sans conséquence sur une slide de contenu. Depuis que `value_intro` occupe la position 0, ce même calcul tombe systématiquement sur `role` (index 1) — boucle observée en prod sur un vrai compte (`g.cauvin@tessan.io`, compte bien créé en base malgré la boucle UI). **Fix** : `setStepIdx(path.indexOf("account") + 1)` au lieu de `next()` — saute toujours juste après `account` dans le path réellement résolu (variante A/B, programme claimé ou non), quelle que soit sa position.
2. **Étapes de sélection en mode "auth" au lieu de "register"** (commit `ced4281`) — une fois le premier bug corrigé, les étapes de sélection suivantes (`sport_2a`/`level_2a`/`goal_2a`/`frustration_2a`...) perdaient l'auto-advance au tap et affichaient un CTA sticky explicite : `isRegisterMode = !userId` passait à `false` dès le compte Google créé, traitant la session comme "ancien compte incomplet qui revient" plutôt que "inscription en cours" — invisible avant ce chantier car ces steps n'étaient jamais traversés en session Google continuée (`account` trop tardif). **Fix** : `isRegisterMode = !userId || !!pendingData`.

Aucun des deux n'a été testé par Claude (pas d'accès à un vrai compte Google, règle de sécurité) — confirmés en prod par Gildas.

### `createAccount()` / `completeProfile()` — scission du 2026-07-20 (remplace l'ancienne scission `saveData()`/`finishAthleteActivation()` du 2026-07-12)
`createAccount(uid)` : léger, upsert `profiles` avec seulement ce qui est déjà connu au moment du submit d'`account` (nom, mode, frustration/coaching_challenge si déjà collectés). `completeProfile(uid)` : le reste — sport/niveau/objectif/jours, sessions, wellness baseline, démo coach + programme auto-généré, `finishCoachClaim` — déclenché une seule fois à l'entrée de `profile_recap` (`profileCompleteGuardRef`, même principe que `finishGuardRef` ci-dessous). Nécessaire car la position de `account` varie selon la variante A/B : en variante B, la plupart des données n'existent pas encore au moment du submit du compte.

### Garde anti-double-clic (`finishGuardRef`, 2026-07-12)
`handleWellnessQuestions()`/`finishAthleteActivation()` (dernier "Voir mon score →" sur `wellness_q`) et le bouton "Continuer"/"Passer" d'`invite_team` n'avaient à l'origine aucune protection contre un double-clic. Un double-clic déclenchait `finishAthleteActivation`/le handler `next()` deux fois en parallèle → double claim+assign (programmes clonés en double en DB) ET `stepIdx` qui dépasse `path.length` (`next()` utilise `isLast` calculé au moment du clic, pas une valeur live) → écran totalement blanc, sans CTA, sans moyen d'avancer. **Fix** : `finishGuardRef` (`useRef`, réinitialisé à chaque changement de `currentStep` dans le même effet que `advancingRef`), posé en entrée de `finishAthleteActivation` et des deux handlers d'`invite_team` — même principe que `advancingRef` déjà utilisé pour l'auto-advance des pain points. **Règle : tout handler qui déclenche une écriture DB non-idempotente (claim/assign, upsert avec side-effects) suivie d'un `next()` doit avoir cette garde.**

### `stepIdx` hors limites — filet de sécurité + 2e cause trouvée en prod (2026-07-12 soir)
Repéré via une investigation demandée par Gildas ("des inscrits qui vont pas jusqu'au bout") — pas un problème de config PostHog (funnels vérifiés corrects contre le code), mais un vrai bug applicatif confirmé sur des events réels : `onboarding_undefined_viewed` juste après `account_created`, c'est-à-dire `currentStep = path[stepIdx]` valant `undefined` → écran totalement blanc et irrécupérable (aucun bloc JSX ne matche `undefined`, donc pas de CTA/retour possible). Deux mesures :
1. **Filet de sécurité (`e18184d`)** : `currentStep`/`isLast` sont désormais dérivés d'un `stepIdx` clampé à `path.length - 1` avant toute lecture, avec un `useEffect([path.length, stepIdx])` qui corrige aussi le state `stepIdx` lui-même si besoin. N'empêche pas la cause de se produire, mais empêche l'écran blanc **quelle que soit l'origine** — dernier rempart pour tout futur cas non anticipé.
2. **Root cause identifiée pour le cas des comptes Google (`47bde10`)** : le `useEffect` qui finalise l'inscription via Google (`pendingData`+`userId`, deps `[]`) appelait `goToActivationStep()` directement depuis sa propre closure — figée au tout premier render, où `hasClaimedProgram` vaut encore `null` (sa résolution est asynchrone, dans un `useEffect` séparé qui se déclenche juste après le montage). Pour un user Google venant d'un programme claimé (`?claim=`), cette closure calculait donc l'index cible dans le mauvais `path` (classique, plus long) ; une fois les multiples appels réseau de l'init terminés (`getUser`, `saveData`, 2 `fetch`) et `goToActivationStep()` enfin exécuté, cet index dépassait la longueur du VRAI `path` (programme, plus court, une fois `hasClaimedProgram` réellement `true`). **Fix** : `goToActivationStep()` n'est plus appelé depuis la closure figée — un state `googleInitDone` déclenche un second `useEffect` séparé (deps `[googleInitDone]`), qui capture toujours un `path` à jour au moment où il s'exécute. **Règle : dans un `useEffect` à deps `[]` qui fait plusieurs `await` avant d'agir sur un state dérivé d'un autre state asynchrone (ici `hasClaimedProgram`), ne jamais appeler directement une fonction qui lit ce state dérivé depuis l'intérieur de la closure figée — déclencher via un state + un effect séparé pour garantir une closure fraîche.**
**Méthode utile pour ce genre d'investigation** : interroger les events PostHog réels directement (HogQL sur `events`, filtré sur les `distinct_id` ayant un `account_created` récent) plutôt que de se fier uniquement à la config visuelle des funnels — c'est cette requête qui a révélé le symptôme exact.

### Écran de célébration — désormais APRÈS le paiement, plus avant (voir refonte 2026-07-20 en haut de cette section)
- Composant `src/components/onboarding/CelebrationScreen.tsx`. Depuis le 2026-07-20, `paywall_priming`/`paywall_form` précèdent `celebration` — le CTA de célébration (`onNext`, prop renommée depuis `onStartTrial`) n'ouvre plus `PaywallModal`, il avance simplement vers l'activation post-paiement (`wellness_q`/`invite_team` insérés via `paidExtras`) ou vers `/today`/`/coach` si aucune activation ne suit. Label CTA : "Continuer →".
- Rendu toujours en carte flottante (`#161616`, même shell que les autres modales de l'onboarding — voir "Footer non-scrollable des modales" plus bas).
- Recap chips-free (sport/niveau/objectif si collectés dans le path courant).
- **Score wellness (sportif)** / **Capacité illimitée (coach)** : inchangé (`WellnessRing dark`/`dark infinite`, `wellnessTip`/`COACH_LIBRARY_PITCH`) — voir description historique ci-dessous, toujours exacte fonctionnellement.
- **Programme claimé** : bloc dédié si `claimedProgramName`.
- **Aperçus statiques personnalisés au sport** (`getAthletePreviews(sport)`/`getCoachPreviews(sport)`).
- **Preuve sociale retirée d'ici le 2026-07-19** : les avatars "+300 sportifs..." et le témoignage 5 étoiles (`AVATARS`/`TESTIMONIALS` locaux) ont été déplacés vers `paywall_priming` (`PAYWALL_AVATARS`/`PAYWALL_TESTIMONIALS` dans `OnboardingFlow.tsx`) — plus utiles comme réassurance avant paiement qu'en félicitations après coup. `CelebrationScreen.tsx` ne les contient plus.
- **`ProductTourOverlay.tsx`/`WelcomeReveal.tsx`** : toujours supprimés, ne pas recréer.
- **`PrimingJourneyModal.tsx`** : toujours utilisé par `usePaywall` (gating in-app free/expired) uniquement, pas dans le chemin onboarding.

### Frise de progression 3 phases + refonte `week_preview` (2026-07-27)
Suite à plusieurs itérations sur un artifact de mockup (POC comparatif du paywall), 2 des idées validées en variante A3 implémentées en réel :

**Frise Profil/Programme/Formule** (remplace l'ancienne barre plate masquée sur `autoreg_score`/`profile_recap`/`week_preview`/`paywall_*` via `POST_PROGRESS` — ce tableau est désormais mort, laissé en place mais plus lu par rien) :
- `PHASE_1_STEPS`/`PHASE_2_STEPS`/`PHASE_3_STEPS` (`OnboardingFlow.tsx`) regroupent les `StepId` réels par phase ; filtrés par le `path` actif à chaque render (`frisePhases`), donc cohérents avec les variantes courtes/programme claimé qui sautent des steps — pas de nombre codé en dur.
- `friseCurrentPhase`/`frisePct` : phase courante = `(index+1)/length` dans le path filtré, phases précédentes = 100%, suivantes = 0%.
- Rendu extrait en composant `ProgressFrise({ currentPhase, pct, dark })`, réutilisable hors de sa position par défaut.
- **Persistante sur tous les steps sauf `value_intro`/`celebration`** (`HIDE_FRISE_STEPS`) — visible désormais sur les écrans qui n'avaient jusque-là aucun indicateur de progression.
- **Cas `week_preview_2a`/`week_preview_2b`** (`FRISE_INLINE_STEPS`) : la frise par défaut est masquée (`showFrise` l'exclut) et injectée à la place **à l'intérieur du héros sombre** de `WeekPreviewStep.tsx` via une prop `frise: React.ReactNode` (passée `dark` en dur, header toujours sombre) — demandé par Gildas pour que la frise partage le même fond que le header au lieu du fond clair de page. Le héros garde son `marginTop: -36` (annule le padding-top de `OnboardingBackground`) : sûr désormais que la frise est rendue *dans* ce bloc et non plus au-dessus par le parent (l'ancienne version de ce commentaire avertissait du contraire — piège déjà rencontré : ce négatif masquait la frise quand elle vivait encore dans `OnboardingFlow`).

**`week_preview_2a`/`2b` — titre/sous-titre orientés valeur** : nouvelles props `role`/`goalLower` (même pattern que `ProfileRecapStep`) → `"Voici comment ThePerfClub {t'aide / aide tes sportifs} à {goalLower}."` + sous-titre fixe par rôle. Bandeau "Charge par semaine" (barres S1-S4) retiré à la demande de Gildas (jugé peu lisible / pas assez motivé côté valeur perçue).

**Aperçu wellness (sportif)** — carte "Score & conseils" réutilisant la vraie structure de `TodayClient.tsx` (ring copié en `WellnessRingPreview`, `zoneLabel()`, tags `BEHAVIOR_META`, encart "🌿 Récupération" via `getRecoveryAdvice()` — les mêmes fonctions qu'en prod, pas de texte réinventé). Score/comportements dérivés de la difficulté réelle de la séance du jour sélectionné (`wellnessPreviewFor(diff)`, 4 paliers) : sleep/stress/recovery/motivation restent à des valeurs neutres "bonnes" car aucun vrai check-in n'existe à ce stade — c'est le comportement négatif du palier (s'il y en a un) qui pilote alors le texte, exactement comme en prod. Étiquette "Aperçu" overlay en haut à droite de la carte (jamais confondue avec un vrai calcul), légende au-dessus : *"Ton analyse réelle s'appuierait sur tes données d'entraînement."*

**Aperçu Coach Control (coach)** — **réutilise le vrai `CoachCard`** au lieu d'une maquette : `CoachCard`/`WellnessRing`/`scoreColor`/`maxDiffToday`/`attention`/`riskScore`/`decisionText` extraits de `CoachClient.tsx` vers `src/components/coach/CoachAthleteCard.tsx` (nouveau module partagé, `CoachClient.tsx` importe désormais depuis là plutôt que de dupliquer — un seul point de vérité, aucun risque de drift entre l'aperçu onboarding et le vrai Coach Control). Le sportif "démo" de l'aperçu porte le prénom du coach lui-même (`coachFirstName` = state `name` d'`OnboardingFlow`, unique donnée réelle disponible à ce stade), avec des tags de comportements illustratifs et `isPriority` calculé via la vraie fonction `attention()` — varie donc aussi selon le jour sélectionné (ex. lundi séance dure → "Attention requise" + "Décider →" ; mercredi séance légère → "Voir →"). Badge "Aperçu" overlay en haut à droite de la carte (décalé de la pastille pulsante propre à `CoachCard` pour ne pas se chevaucher), légende au-dessus : *"Ton analyse réelle s'appuierait sur les données d'entraînement de tes sportifs."*, ligne sous la carte : *"Tes autres sportifs apparaîtront plus bas, dans ton Coach Control complet."*

Déployé en prod le 2026-07-27 (commit `dc2aafb`).

### Refonte `paywall_priming`/`paywall_form` — offre unique, insights, FAQ (2026-07-27)
Même origine que la section précédente (itérations sur l'artifact de mockup, variante A3 validée par Gildas), portant cette fois sur les 2 écrans du paywall lui-même. Testé en local (`tsc --noEmit` + `npm run build`, pas de re-test navigateur complet demandé par Gildas après la correction du bug d'insights ci-dessous) puis déployé en prod le 2026-07-27 (commit `773d715`, même push que la frise/week_preview — un seul commit couvre les deux chantiers car aucun des deux n'avait encore été poussé).

**La carte offre (`.pho-*`) et le formulaire de paiement décrits ci-dessous ont depuis été retravaillés en profondeur — voir "Refonte pricing/checkout : 0€ aujourd'hui" (2026-07-30) juste après cette section pour l'état actuel.** Ce qui suit reste exact pour le reste de l'écran (comparatif, témoignage, FAQ, bande "+600").

**`paywall_priming` — refonte complète (remplace l'ancienne grille 2 cartes mensuel/annuel + timeline)** :
- **Headline diagnostic** statique par rôle (`"Ta charge d'entraînement irrégulière limite ta progression en endurance."` / `"Le manque de visibilité sur la récupération de tes sportifs freine leur progression."`), overridée si programme claimé (`"Ton programme {nom} t'attend."`, prioritaire).
- **Carte offre unique** (`p-hero-offer`-like, fond dark `linear-gradient(135deg,#161616...,#111)`) : badge "✓ Essai 7j" — *le prix/toggle à l'intérieur de cette carte ont changé, voir section 2026-07-30*.
- **Comparatif "Où tu en es / Ce que ThePerfClub change"** : personnalisé via les réponses réelles données plus tôt dans l'onboarding (`frustration`/`overloadAns`/`fatigueAns` côté sportif, `coachingChallenge`/`overloadCoachAns`/`fatigueCoachAns` côté coach) — **mais jamais le texte brut de l'option cochée**. Le texte littéral d'une réponse de questionnaire (ex. *"Non, je maîtrise toujours mon intensité"*) perd tout son sens hors du contexte de la question posée ; chaque réponse possible est donc reformulée en phrase d'insight autonome via 6 tables `Record<string,string>` module-level (`FRUSTRATION_INSIGHTS`, `OVERLOAD_INSIGHTS`, `FATIGUE_INSIGHTS`, `COACHING_CHALLENGE_INSIGHTS`, `OVERLOAD_COACH_INSIGHTS`, `FATIGUE_COACH_INSIGHTS`, juste avant `export default function OnboardingFlow`), avec repli sur un texte générique si la réponse est vide ou non reconnue (`?dbgstep=`, path programme qui saute ces steps). Layout desktop (≥640px, `colIsMd`) : avant → flèche → après sur une seule ligne (inspiré de la section "Where Levels takes you" de Levels.com) ; mobile : empilé, mais dans la même carte blanche bordée (demande explicite de Gildas de garder l'encadré sur les 2 formats).
- **Témoignage**, précédé d'un titre rôle-aware *"Ce que disent des sportifs (ou coachs) comme vous"* — `PAYWALL_TESTIMONIALS[role]` (déjà existant, réutilisé tel quel).
- **Bande "+600 sportifs, coachs et clubs"** (`PAYWALL_AVATARS`) — déplacée ici depuis `paywall_form` et chiffre remonté de 300 à 600 : plus utile comme réassurance pendant la décision du prix qu'en fin de formulaire, qu'on cherche au contraire à alléger.
- **FAQ** (4 questions, la dernière rôle-aware) : prélèvement pendant l'essai (mentionne le rappel à J-2 pour l'annuel), annulation (à tout moment, sans justification), changement de formule, puis "programme vraiment personnalisé ?" (sportif) / "autant de sportifs que je veux ?" (coach).

**`paywall_form`** : voir section 2026-07-30 — le bandeau "+300"/"Ton compte est prêt" décrits initialement ici ont été retirés ou remplacés.

**Nouveau prop `Actions.tsx` : `caption?: string`** — texte discret centré sous le bouton principal (et au-dessus du lien "skip" s'il y en a un), rendu dans les 2 branches (`fixed` plein-page et flex-item modale). Généralisable à d'autres steps si besoin futur d'une mention de réassurance sous un CTA, pas juste `paywall_priming`.

### Refonte pricing/checkout : "0€ aujourd'hui" mis en avant (2026-07-30)
Suite à une nouvelle série d'itérations sur l'artifact de mockup (variante A3), benchmarkées contre ~19 captures d'écran d'apps SaaS/fitness à essai gratuit (Peloton, Meetup+, Google Workspace/Gemini, Notion, Meta Quest+, Noom, ChatGPT, Extra, Headspace, GitHub, Future, Patreon, Shopify, Skillshare, Rocket Money, Zoe). Objectif de Gildas : pousser plus fort l'essai gratuit et le message "aucun débit aujourd'hui" — jusque-là, la carte affichait le prix réel en gros (ex. "9€/mois"), sans jamais montrer "0€" ni mentionner explicitement l'absence de prélèvement. Déployé en prod le 2026-07-30 (commit `e67f0bd`).

**`paywall_priming` — carte `.p-hero-offer`, nouvel ordre** : badge "✓ Essai 7j" → prix ("0€" + "aujourd'hui", **plus de prix barré** — retiré après un aller-retour : d'abord barré+0€ façon Meetup+/Notion/Gemini, puis simplifié en "0€ aujourd'hui" seul façon Headspace, jugé plus calme/moins "vente" tout en gardant la transparence totale puisque le prix réel est explicité juste en dessous) → ligne de prix réel `{annual}€/an ({annualMonthly}€/mois) après l'essai` (annuel) / `{monthly}€/mois après l'essai` (mensuel) → toggle Annuel/Mensuel avec **badge d'économie dynamique** sur le bouton Annuel (`-{Math.round(annualSavings/(monthly*12)*100)}%`, soit -45% sportif / -70% coach — jamais codé en dur) → texte d'ancrage (inchangé).
- **Pourquoi le badge d'économie est sur le toggle et pas dans le texte** : tous les benchmarks qui affichent une économie annuelle (Meetup+ "30% off", GitHub "Save 20%", Notion "Save 17%") la posent en badge sur l'onglet "Yearly" lui-même, jamais en phrase séparée — suivi ici plutôt que d'inventer un nouveau pattern.
- **CTA** : `Actions` avec `nextLabel="Essayer gratuitement 7 jours"` (remplace "Continuer →", jugé trop générique sur un écran de prix) et `caption="Résiliable à tout moment"` (sans le point final, "Aucun paiement aujourd'hui" retiré de la caption — déjà explicite via le "0€ aujourd'hui" du prix, redondant sinon).
- **Redondances retirées en cours de route** (piège à ne pas réintroduire) : l'eyebrow "Basé sur ton objectif" a été supprimée (elle ne correspondait à aucune personnalisation réelle du prix, qui ne varie que par rôle/cadence) ; un bandeau "✓ Aucun paiement aujourd'hui" ajouté puis retiré (déjà dit par le "0€" en gros) ; la mention "résiliable à tout moment" ne doit apparaître qu'une fois par écran (elle a été dédoublée par erreur entre la ligne de prix et la caption du CTA à une itération, corrigé).

**`paywall_form`** :
- **Titre** : `"Passe au niveau supérieur."` (remplace `"Démarre ton essai gratuit"`) — volontairement le même texte pour les 2 rôles (une version rôle-aware "Fais passer tes sportifs au niveau supérieur" avait été proposée pour le coach, Gildas a préféré garder une phrase unique). Le mot "niveau" fait écho à la fois à la formule tarifaire et au niveau sportif — inspiré d'un screenshot Future ("The coach of your choice...") mais pas copié tel quel : cette phrase de Future vend une mise en relation avec un coach individuel nommé, ce qui ne correspond pas au produit.
- **Bandeau "⚡ Ton compte est prêt."** retiré entièrement (demande explicite, plus besoin une fois le reçu ci-dessous en place).
- **Ancien bandeau "Facturé..." + ligne de réassurance séparée → un seul bloc reçu**, entre le titre et les champs de carte :
  ```
  Facturé annuellement                    [Modifier]
  ─────────────────────────────────────────────
  Dû aujourd'hui                              0€
  🔔 Rappel 2 jours avant la fin de l'essai.
  À partir du {date réelle, +7 jours}   {annual}€/an ({annualMonthly}€/mois)
  ```
  `trialEnd`/`trialEndStr` calculés dans le IIFE de `paywall_form` (même formule que `CheckoutForm`, dupliquée localement — pas de prop partagée pour ce petit calcul). Tailles de texte relevées une fois en local (13-22px au lieu de 9.5-19px repris tel quel du mockup 300px) — Gildas a signalé "le texte est trop petit", les tailles du POC (calibrées pour une maquette téléphone miniature) ne convenaient pas à la vraie largeur de colonne de l'app.
- **`CheckoutForm` (`src/components/paywall/PaywallModal.tsx`) — 2 nouveaux props optionnels**, `ctaLabel` (défaut `"Commencer gratuitement"`) et `showTrialLegal` (défaut `true`) : l'onboarding passe `ctaLabel="Essayer gratuitement 7 jours"` et `showTrialLegal={false}`. **La modale in-app (`PaywallModal` par défaut, gating post-onboarding) n'appelle `CheckoutForm` avec aucun de ces 2 props — comportement 100% inchangé pour elle**, seul l'onboarding personnalise. Quand `showTrialLegal` est `false` : le paragraphe légal au-dessus du bouton ("Essai gratuit jusqu'au... Ensuite...") disparaît (déjà dit par le reçu au-dessus), et la ligne "🔒 Paiement sécurisé" sous le bouton devient `"🔒 Paiement sécurisé · Résiliable à tout moment"` (une seule ligne, un point milieu — demande explicite après un essai à 2 lignes séparées jugé trop verbeux).
- **Piège de cache navigateur rencontré plusieurs fois pendant les tests** : le service worker (cache-first sur les assets statiques, cf. section Notifications push) servait un bundle JS obsolète malgré un `npm run dev` fraîchement redémarré — vérifié à chaque fois via `dbgstep=`, corrigé en désenregistrant le SW + vidant les caches dans la console avant de re-tester. Rien de nouveau, déjà documenté ailleurs dans ce fichier, mais reconfirmé ici car ça a induit un faux négatif visuel pendant ce chantier.

### Bug réel trouvé et corrigé : paiement `paywall_form` pouvait planter en silence (2026-07-30)
Repéré en investiguant un cas concret signalé par Gildas via l'enregistrement de session PostHog d'une utilisatrice (`jeanne.sangoy@hotmail.fr`) qui semblait avoir eu une erreur au paiement. Confirmé par 3 preuves convergentes plutôt qu'une simple lecture de log : (1) l'inspecteur de session PostHog montre une exception JS non catchée 2s après le submit du formulaire — `Uncaught (in promise) IntegrationError: We could not retrieve data from the specified Element. Please make sure the Element you are attempting to use is mounted and the ready event has been emitted.` (stack `js.stripe.com/v3`) ; (2) aucun event `changed input`/`clicked input` entre `onboarding_paywall_form_viewed` et le clic sur le CTA de soumission — elle a cliqué "Essayer gratuitement 7 jours" sans avoir rempli la carte, probablement par confusion avec le CTA identique de `paywall_priming` juste avant ; (3) vérifié en base : son `subscription_status` réel est resté `free`, aucune carte enregistrée côté Stripe — le paiement n'a donc bien jamais abouti, pas juste un log d'erreur cosmétique.

**Root cause (`CheckoutForm`, `src/components/paywall/PaywallModal.tsx`)** — deux failles cumulées dans `handleSubmit()` :
1. Le bouton submit n'était désactivé que sur `!stripe || loading` — `useStripe()`/`useElements()` renvoient un objet non-null dès que `<Elements>` est monté, même si l'iframe du `PaymentElement` lui-même n'a pas fini de charger et n'a pas encore émis son event `ready`. Un clic assez tôt (ou un `PaymentElement` lent à charger) passe donc le garde-fou alors que Stripe n'est pas réellement prêt.
2. Aucun `try/catch` autour de `stripe.confirmSetup()` : dans ce cas précis, Stripe ne renvoie pas une erreur "propre" (`confirmError`, gérée normalement) mais lève une exception JS brute — jamais rattrapée, donc `setLoading(false)`/`setError(...)` ne s'exécutaient jamais. Résultat concret pour l'utilisatrice : bouton figé sur "Traitement...", aucun message d'erreur, abandon silencieux.

**Fix** : nouveau state `elementReady`, mis à `true` via la prop `onReady` du `PaymentElement` — le bouton reste désactivé (`disabled={!stripe || !elementReady || loading}`) tant que Stripe n'a pas confirmé que l'élément est réellement monté. `try/catch` ajouté autour de `stripe.confirmSetup()` : toute exception (y compris ce cas précis) affiche désormais un message d'erreur et débloque le bouton au lieu de planter en silence. Comme `CheckoutForm` est partagé entre l'onboarding et la modale in-app (`PaywallModal` par défaut), le fix corrige les deux chemins d'un coup.

**Non résolu / limite connue** : la cause exacte du "not ready" n'est pas formellement isolée (clic trop rapide vs bloqueur de pub/extension retardant l'iframe Stripe — les deux produisent le même message d'erreur). Le fix couvre les deux cas en pratique (bouton inerte tant que non prêt, erreur visible sinon rattrapée en silence), mais si un navigateur bloque carrément l'iframe Stripe, un nouvel essai échouerait probablement encore — avec un message d'erreur visible cette fois, au lieu d'un plantage muet.

Déployé en prod le 2026-07-30 (commit `c130207`, push direct sur `main`). Non testé avec un vrai paiement par Claude (règle de sécurité permanente : jamais d'informations de carte bancaire saisies, même en test) — un test manuel de Gildas juste après le fix a réussi, cohérent avec le diagnostic (une saisie manuelle laisse largement le temps au `PaymentElement` de devenir `ready` avant le submit, contrairement au clic immédiat de ce cas).

### Largeur de colonne responsive dans l'onboarding (2026-07-27)
Repéré en travaillant sur `paywall_priming` : la colonne de contenu restait figée à `maxWidth: 560` partout dans l'onboarding, quel que soit le viewport — aucune logique responsive n'existait dans aucun de ces fichiers avant ce chantier (confirmé par grep sur `560` avant modification). Résultat : sur desktop/tablette, beaucoup d'espace vide de chaque côté, jamais utilisé.
- **Formule partagée** : `isLg ? 720 : isMd ? 640 : 560` (`useBreakpoint()`, `src/hooks/useBreakpoint.ts` — `isMd: w>=640`, `isLg: w>=1024`, déjà utilisé ailleurs dans l'app, ex. `CoachClient.tsx`). Élargissement progressif plutôt qu'un zoom uniforme de tout le funnel — le mobile (où sont la plupart des vrais utilisateurs) est déjà bien calibré et n'a pas besoin d'y toucher.
- Appliquée à 5 emplacements distincts, chacun avec son propre calcul (pas de constante partagée unique — ces composants ne partagent pas d'ancêtre commun pratique pour ça) : `OnboardingBackground.tsx` (colonne de contenu), `Actions.tsx` (footer CTA fixed), `WeekPreviewStep.tsx` (héros plein-bleed), et 2 footers rendus directement dans `OnboardingFlow.tsx` (`wellness_q` hand-roulé + le portail du bouton Stripe sur `paywall_form`, via la variable locale `colMaxWidth`/`colIsMd`/`colIsLg` calculée en tête du composant).
- Vérifié par mesure réelle (`getBoundingClientRect()`) : `maxWidth` = 720px à 1440px de viewport, conforme à la formule.

### Paywall — désormais avant la célébration, toujours obligatoire (2 écrans depuis le 2026-07-20)
`paywall_priming` (offre + comparatif + témoignage + FAQ, voir refonte 2026-07-27 ci-dessus) → `paywall_form` (Stripe uniquement, rappel prix, simplifié le 2026-07-27). Ni l'un ni l'autre ne peuvent être fermés/contournés — même principe que l'ancien paywall unique du 2026-07-12 (CB obligatoire pour tout nouveau compte), juste réparti sur 2 écrans plein-page au lieu d'une modale unique en fin de flow. `CheckoutForm`/`PRICING`/`stripePromise` exportés de `PaywallModal.tsx` et réutilisés tels quels (le composant `PaywallModal`/`PrimingJourneyModal` in-app reste intact, pour le gating post-onboarding uniquement).
- **Limite assumée inchangée** : application 100% côté client (`requireSubscription()`), aucune vérification serveur/RLS sur `subscription_status` — un verrou serveur serait un chantier séparé.
- **Stripe "Link" désactivé** (`src/app/api/stripe/setup-intent/route.ts`) : `payment_method_types: ["card"]` explicite au lieu de `automatic_payment_methods: { enabled: true }`, pour ne proposer que la carte bancaire sur le formulaire (bénéficie aussi au paywall in-app, route partagée).

### `PaywallModal.tsx` — choix mensuel/annuel + garanties restaurés (2026-07-12)
Repéré en vérifiant le paywall obligatoire : le choix mensuel/annuel et le rappel des 3 garanties (accès immédiat, rappel avant prélèvement, résiliation sans condition) avaient disparu de l'onboarding quand celui-ci est passé de `PrimingJourneyModal` (3 steps, dont ce contenu au step 2) à `PaywallModal` direct le 2026-07-11 — `billing` était un `const` figé sur `initialBilling ?? "annual"`, jamais choisi par l'user.
- `billing` devient un `useState` dans `PaywallModal` (plus un `const`), avec les 2 cartes toggle mensuel/annuel (badges "ESSAI 7J GRATUITS"/"ÉCONOMISEZ Xâ‚¬", carte sombre sélectionnée) — copié depuis le step 2 de `PrimingJourneyModal.tsx`, `annualSavings` calculé pareil.
- Le rappel des 3 garanties (icône check + titre + sous-texte, ligne verticale orange) est copié verbatim depuis `PrimingJourneyModal.tsx` step 2 et inséré directement dans `PaywallModal.tsx`, entre le toggle et le formulaire Stripe.
- **Choix : fusionné dans l'écran unique, pas réintroduit comme step séparé** — maintenant que ce paywall n'est plus contournable, un seul écran complet et digne de confiance vaut mieux qu'un enchaînement d'étapes sans échappatoire.

### Fix fond sticky des modales (2026-07-12)
Les footers sticky des modales (`PaywallModal.tsx`, `PrimingJourneyModal.tsx` ×3, `invite_team`, `CelebrationScreen.tsx`) utilisaient un `linear-gradient(...,#fff 38%)` (stop en pourcentage) — l'opacité pleine n'était atteinte qu'à 38% de la hauteur TOTALE du bloc sticky, qui peut être haute (ex. `PaywallModal` avec plusieurs lignes de texte + bouton). Le texte tout en haut du bloc (juste après le padding) restait donc partiellement transparent, laissant le contenu défilé en dessous se superposer visuellement — repéré en vérifiant le paywall obligatoire, avec le texte "Essai gratuit jusqu'au..." illisible par-dessus un champ de carte bancaire. **Fix : fond opaque simple (`"#fff"` / `"#161616"`) au lieu du gradient**, sur les 6 occurrences. Le même piège avait déjà été rencontré et corrigé différemment le 2026-07-11 sur les footers dark plein-page (voir commit `bb5687e`) — **règle : ne pas utiliser de gradient à stop en pourcentage pour un fond de fade sticky dans une carte au contenu de hauteur variable, utiliser un fond opaque simple.**

### Suppression des boutons retour dans l'onboarding (2026-07-13)
Constat de Gildas : les boutons retour n'avaient pas un style cohérent (icône ← à gauche du CTA vs lien texte en dessous vs lien seul non sticky). Décision plus radicale que d'uniformiser leur style : **les supprimer entièrement**, pour forcer l'avancement — cohérent avec le paywall obligatoire du 2026-07-12 (même logique de "pas de retour en arrière possible"). Il ne reste plus que 2 types de footer : auto-advance (pas de CTA du tout) ou CTA principal sticky plein-large sans bouton retour.
- Nouveau composant partagé **`src/components/onboarding/Actions.tsx`** : `variant?: "light"|"dark"|"modal-light"|"modal-dark"` (défaut `"light"`), `onNext`, `nextLabel`, `nextDisabled?`, `onSkip?`/`skipLabel?` (utilisé uniquement par `invite_team`). Pas de prop `onBack`. Les 4 variantes utilisent un fond **opaque simple** (pas de gradient — même règle que le fix du 2026-07-12), `light` = `#f1f0ee` (couleur exacte du fond de page clair dans `OnboardingBackground.tsx`), `dark` = transparent (le fond dark de la page suffit), `modal-light` = `#fff`, `modal-dark` = `#161616`.
- Ancienne fonction locale `Actions` (avec icône ← intégrée) et `backOnlyBtn` supprimées de `OnboardingFlow.tsx`, ainsi que `back()` et tous ses appels. `AutoRegScoreStep.tsx`, `AutoRegScoreStepCoach.tsx`, `WeekPreviewStep.tsx` et `CelebrationScreen.tsx` migrés vers le composant partagé — corrige au passage le gradient à stop en pourcentage oublié dans `WeekPreviewStep.tsx` lors du fix du 2026-07-12.
- **`wellness_q` — seule nuance conservée** : son bouton retour servait à la fois à reculer d'une question à l'intérieur du wizard (`wStep > 0`) et à quitter le step (`wStep === 0`). Seule la sortie du step est supprimée ; la navigation intra-wizard reste (footer hand-roulé, pas migré vers `Actions` à cause de cette logique conditionnelle).
- **`invite_team`** : garde son lien "Passer →" (fait avancer vers `celebration`, pas un retour), migré vers `Actions` avec `onSkip`.
- `value_slides` : la pastille "← Retour" superposée à la photo est supprimée (y compris la navigation slide-à-slide en arrière, pas seulement la sortie du step).
- `sport_2a`/`level_2a`/`goal_2a`/`frustration_2a`/`context_2b`/`count_2b`/`challenge_2b` : en mode register (auto-advance au clic), le footer disparaît entièrement quand aucun CTA n'est nécessaire (plus de lien retour résiduel) ; en mode auth (sélection sans auto-advance), `Actions` sans `onBack`.
- Aucun changement aux 4 arrays de paths, à la logique métier, ni aux events PostHog.

### CTA plein-page vraiment ancré au bas de l'écran — `position:fixed` au lieu de `sticky` (2026-07-13)
Gildas : "les boutons sticky ne sont pas toujours en bas de l'écran". Reproduit en direct (mesure JS `rect.bottom` vs `window.innerHeight`) : sur les steps à contenu court (ex. `autoreg_score`), `position:"sticky"` ne colle nulle part car le conteneur scrollable n'a pas d'overflow (`scrollHeight === clientHeight`) — le bouton reste simplement à la suite du contenu, avec ~270px de vide en dessous. Le sticky ne fonctionnait que sur les steps à contenu long (où il y a effectivement un scroll à combler), d'où l'incohérence perçue.
- **`src/components/onboarding/Actions.tsx`, variantes `light`/`dark` uniquement** : `position:"fixed", left:0, right:0, bottom:0, zIndex:20` (au lieu de `sticky`), avec un wrapper interne `maxWidth:560, margin:"0 auto"` qui reproduit le centrage de la colonne de contenu (`position:fixed` échappe à la largeur du parent, contrairement à `sticky`). Variantes `modal-light`/`modal-dark` (`invite_team`/`celebration`) inchangées à ce moment-là — voir "Footer non-scrollable des modales (flex-column)" plus bas pour le fix définitif du 2026-07-13 soir, qui abandonne `sticky` sur ces variantes aussi.
- **`OnboardingBackground.tsx`** : `padding-bottom` de la colonne de contenu remonté de `56` à `120` — nécessaire puisqu'un footer `fixed` se superpose désormais physiquement au contenu qui défile derrière lui (contrairement à `sticky` qui restait dans le flow normal quand il n'y avait pas de scroll), il faut donc réserver la place pour ne jamais masquer la fin du contenu.
- **`wellness_q`** (footer hand-roulé, pas migré vers `Actions` à cause de la navigation intra-wizard) : même traitement `position:fixed` + wrapper centré, pour rester cohérent.
- Vérifié qu'aucun ancêtre entre `Actions`/`wellness_q` et la racine n'a de `transform`/`filter`/`will-change` (aurait changé le point d'ancrage de `fixed`) — confirmé par grep, `OnboardingBackground` → `(auth)` → `layout.tsx` racine est une chaîne propre.
- Vérifié en direct (Chrome DevTools, service worker vidé — **piège recontré** : le fix ne semblait pas appliqué au premier test, c'était le service worker cache-first qui servait encore l'ancien bundle, cf. [[feedback-service-worker-cache]]) sur steps courts (`autoreg_score`, `autoreg_score_coach`) ET longs (`sport_2a`, `week_preview_2a`, `wellness_q`) : CTA toujours au ras du bas de l'écran, aucun contenu masqué derrière le footer sur les steps longs.

### Verrouillage premium (🔒) — permanent, plus lié au tour
- `.tour-lock` (span 🔒 sur les CTAs premium) et le bloc CSS `body.tour-active` (bannière d'activation, opacité boutons) ont été renommés en `.locked`, posé sur le wrapper de `src/app/(app)/layout.tsx` selon l'état réel d'abonnement (`!isActive`), plus lié à une session de tour éphémère.
- `usePaywall.requireSubscription()` n'a plus de check `tour-active`.

### Logique de conversion
- **Step role** : aucune carte présélectionnée (`roleChosen` state), clic = `nextAfterChoice` → avance direct, pas de bouton "Continuer" (tous funnels)
- **`value_intro`** (depuis le 2026-07-20, remplace les 3 slides stats "Value slides") : parcours "user journey" générique à 3 temps forts, position 0 dans tous les paths (avant `role`) — 1) *La veille · Planification* (carte séance blanche : nom, conseil de charge, jauge de difficulté, exercices ; caption conditionnelle "Ton programme {nom} est prêt à personnaliser." si programme claimé) 2) *07h30 · Au réveil* (wellness ring + chips comportements) 3) *Après la séance · Analyse* (mini-widgets coût musculaire/récupération). Swipe horizontal entre les 3 cartes (`vSlideSwipeStartX`), le CTA avance toujours au step suivant (ne cycle plus les slides).
- **Pain points** : 3 questions par rôle, auto-advance 300ms (register mode uniquement)
- **Score d'autorégulation** : dark card juste après les pain points (diagnostic d'abord), score % + 3 jauges animées
- **concept_autoreg** : vient après le score (la solution ThePerfClub, pas avant) — slide dark avec illustration **conditionnelle au rôle** :
  - Sportif : `ProgressComparisonChart` (SVG, 2 courbes animées) — "Avec ThePerfClub" nettement supérieure, "Programme rigide" progresse quand même mais moins (pas un plateau plat)
  - Coach : `CoachBlindSpotWheel` (SVG, donut 6 segments) — un seul segment orange "Entraînement" (= ce que le coach voit) contre 5 segments gris muet "Énergie/Sommeil/Diet/Émotions/Stress" (= ce que l'athlète vit) — illustre le blind spot du coach sur la récupération réelle de ses sportifs, plus parlant qu'une courbe abstraite pour ce rôle
- **Persona comportemental révélé sur `autoreg_score`/`autoreg_score_coach` (depuis le 2026-07-19/20)**, pas sur `profile_recap` : pill "🔥 Ton profil : {persona.title}" (ex. "Battant instinctif", "Coach data-driven") + description pure profil comportemental (2 phrases, plus aucune mention "ThePerfClub" — pitch produit retiré) juste sous les 3 jauges. `pickAthletePersona()`/`pickCoachPersona()` (dans `AutoRegScoreStep.tsx`/`AutoRegScoreStepCoach.tsx`) dérivent la persona de la dimension la plus à risque parmi les 3 sous-indicateurs.
- **profile_recap** : composant `ProfileRecapStep` — titre **"Ton programme d'entraînement"** (pas "Ton profil d'entraînement"), phrase humaine avec mots-clés en accent couleur + icône sport en grand format, puis carte **"Ce que ce programme travaille"** : titre = `SPORT_QUALITIES[sport]` (qualités physiques par catégorie de sport), description = phrase jours/semaine + `SPORT_SESSION_TYPES[sport]` — contenu informatif générique sur le programme, plus de persona ici (remplace l'ancienne carte "profil comportemental", déplacée vers `autoreg_score` ci-dessus). **Wording rôle-aware depuis le 2026-07-20** : "une charge qui s'ajuste à ton niveau de forme" (sportif) vs "au niveau de forme de tes sportifs" (coach) — bug trouvé en testant le chemin coach (affichait "ton" à tort), corrigé le même soir. Puis loader "Génération de ton programme…" → CTA ("Voir mon programme →" ou "Continuer →").
- **Paywall (`paywall_priming`)** : headline **statique** selon rôle (`"Améliore tes performances maintenant."` / `"Améliore ton coaching maintenant."`), avec override si programme claimé (`"Ton programme {nom} t'attend."`) — prioritaire sur le reste. **`src/lib/primingCopy.ts` (`getPrimingHeadline`, 16 combos frustration×objectif sportif / 4 combos coach) n'est PAS utilisé ici** — uniquement par `PrimingJourneyModal.tsx` (gating in-app), ne pas supposer que la personnalisation par frustration/objectif est branchée sur le paywall onboarding.
- **CTA visible partout (2026-07-11, boutons retour supprimés le 2026-07-13, sticky abandonné le 2026-07-13 soir)** : sur tous les steps, le(s) bouton(s) restent visibles même si le contenu dépasse l'écran. Composant partagé `src/components/onboarding/Actions.tsx` (`variant: "light"|"dark"|"modal-light"|"modal-dark"`, pas de prop `onBack` — voir section "Suppression des boutons retour" plus bas) : `light`/`dark` en `position:fixed` (steps pleine page), `modal-light`/`modal-dark` sans position spéciale — juste un flex item non-scrollable dans une carte flex-column (voir "Footer non-scrollable des modales" plus bas). Fond **opaque simple** selon variante (`light`→`#f1f0ee`, `dark`→transparent, `modal-light`→`#fff`, `modal-dark`→`#161616`), jamais de gradient. Le CTA principal prend toute la largeur, aucune icône retour.
  - Cards `Choice` (et cards custom du step role) : padding remonté à `18px 16px` (`24px 16px` pour role) pour des cards plus hautes, plus faciles à taper au doigt.
- **`coachingContext` supprimé** — remplacé par sport+goal dans tous les composants

### Wording selon rôle (sport_2a / level_2a / goal_2a / days_2a)
| Step | Sportif | Coach |
|---|---|---|
| sport_2a | "Ton sport principal ?" | "Le sport de tes sportifs ?" |
| level_2a | "Ton niveau actuel ?" | "Niveau de tes sportifs ?" |
| goal_2a | "Ton objectif principal ?" | "L'objectif de tes sportifs ?" |
| days_2a | "Quels sont tes jours d'entraînement ?" | "Créons un premier programme" |

**`days_2a` — sélecteur en colonne (2026-07-13)** : remplace la grille 7 colonnes (lettre + abrév. "L"/"Lun.") par une liste verticale de 7 lignes pleine-largeur, nom du jour en entier (Lundi, Mardi…), coche ronde à droite — plus lisible, utilise la hauteur d'écran disponible plutôt que de compresser 7 colonnes dans la largeur mobile. Même logique de sélection multiple sous-jacente (`trainingDays`, `setTrainingDays`, au moins 1 jour obligatoire), juste la présentation qui change.

### `completeProfile()` — ce qui est créé (renommé depuis `saveData()`, voir scission `createAccount()`/`completeProfile()` plus haut)

**Sportif :** sessions 2 semaines + 4 semaines historique + wellness baseline
**Coach :**
- invite_code généré
- 5 coach_athletes démo (Thomas M. / Emma L. / Pierre D. / Sofia R. / Lucas B.) avec coach_sessions
- Pierre D. rpeBase=9, Lucas B. rpeBase=8 → toujours dans "À décider maintenant"
- coach_sessions garantit une séance AUJOURD'HUI même si le jour n'est pas dans [1,3,5,6]
- Programme auto-généré (4 semaines) + assigné à Thomas M. dès prochain lundi
- `profiles.objective` = goal (pour les deux rôles)

### `program_start_date` (localStorage) — write-only depuis la suppression du tour
Toujours posé par `OnboardingFlow.tsx` pour les paths coach (`getNextMonday()`), mais plus aucun lecteur depuis la suppression de `ProductTourOverlay.tsx` (qui pointait le step 2 du tour vers `/coach/planning?date=...`). Candidat à un nettoyage futur si confirmé inutile ailleurs.

### WeekPreviewStep — données réelles en PROGRAM_PATH
- Fetch `GET /api/programs/${claimId}` (endpoint public, admin bypass RLS)
- Affiche `template.weeks[0]` : vrais jours, vrais noms, vraies difficultés
- Jauges charge : rectangles verticaux colorés (`loadBarColor`) — autant de barres que de semaines dans le template (S1…SN)
  - Programme clamé : N semaines, pas de labels de phase, juste S1/S2/…
  - Onboarding classique (sans claim) : toujours 4 semaines avec labels "Base / Accum. / Pic / Récup"
- Header : "Charge sur N semaines" (dynamique)
- CTA : "Personnaliser ce programme →"
- Flux classique (sans claim) : `getSessionTemplates(sport)` inchangé

### buildProgramTemplate (coach onboarding)
```typescript
// Génère 4 semaines depuis getSessionTemplates(sport)
// levelAdj : beginner=-2, intermediate=0, elite=+1
// Semaine 4 = récup (diff -1 par rapport au calcul normal)
// SessionLoad = 2 (moderate), SessionType = "volume"
// level DB = LEVEL_TO_DB[level] : beginner→debutant, intermediate→intermediaire, elite→elite
```

### Paywall flow dans l'app (gating in-app free/expired)
1. `PrimingJourneyModal` s'affiche (value personnalisée + social proof → rappel essai → timeline + plan cards)
2. CTA → `PaywallModal` (Stripe Elements in-app)
3. "← Retour" → revient à `PrimingJourneyModal`
4. "Accéder sans abonnement →" → ferme (24h cooldown localStorage)

Composants : `usePaywall` hook → `PrimingJourneyModal` → `PaywallModal`
Pages : `TodayClient`, `WeekClient`, `AthletesClient`, `CoachPlanningClient`, `CoachClient`
**Attention au nom** : `PrimingModal.tsx` (sans "Journey") existe aussi dans le repo mais est du code mort (zéro import) — ne pas le confondre avec `PrimingJourneyModal.tsx` qui est le composant réellement utilisé.

**CTA sur les 3 steps de `PrimingJourneyModal` + sur le formulaire Stripe de `PaywallModal`** (2026-07-12, refondu en flex-column non-scrollable le 2026-07-13 soir — voir "Footer non-scrollable des modales" plus bas pour le détail et le pourquoi du changement). **Fond : `"#fff"` opaque simple** (pas de gradient — un `linear-gradient(...,#fff 38%)` a été essayé puis retiré le même jour, voir section "Fix fond sticky des modales" plus haut : le stop en pourcentage laissait le texte du haut du bloc partiellement transparent sur les cartes à contenu haut/variable).

### Footer non-scrollable des modales (flex-column, remplace `position:sticky`) — 2026-07-13 soir
Repéré par Gildas sur `CelebrationScreen`/`PaywallModal` en prod, avec captures d'écran : sur du contenu long (ex. célébration coach, formulaire Stripe complet), le CTA sticky (`position:"sticky", bottom:0` + `margin` négatif pour bleeder jusqu'aux bords de la carte) restait "collé" à mi-scroll pendant que l'utilisateur défilait, laissant apparaître du contenu pas encore scrollé (fin du témoignage, champ "Code de sécurité" Stripe) juste en dessous du bouton, avec le coin arrondi de la carte visible entre les deux — pas juste un espace en trop (déjà tenté et insuffisant), un vrai defaut d'opacité : `position:sticky` ne peut pas masquer du contenu qui n'a pas fini de défiler, quel que soit le margin/padding utilisé, parce que le footer reste un élément du flux normal repositionné visuellement, pas un vrai calque au-dessus du reste.
- **Nouvelle architecture, appliquée partout (`Actions.tsx` modal-light/modal-dark, `CelebrationScreen.tsx`, `invite_team` les 2 branches, `PaywallModal.tsx`, `PrimingJourneyModal.tsx` les 3 steps)** : la carte modale devient un `display:"flex", flexDirection:"column", overflow:"hidden"` (au lieu de `overflowY:"auto"` posé directement sur la carte). Le contenu passe dans une région interne dédiée avec son propre `overflowY:"auto", padding:28`. Le footer CTA devient un simple flex item `flexShrink:0` **après** cette région (sibling, pas nesté dedans) — jamais scrollable, toujours rendu, `overflow:hidden` du parent masque automatiquement ses coins pour matcher le `borderRadius:30` de la carte. Plus besoin de margin négatif ni de `position:sticky`.
- **`PaywallModal.tsx` — cas particulier (React Portal)** : le bouton de soumission doit rester lié au `<form>` Stripe pour fonctionner (`stripe.confirmSetup()` a besoin du submit natif), mais doit aussi être rendu **hors** de la région scrollable pour rester fixe. Résolu avec `form="checkout-form"` sur le `<button>` (attribut HTML natif, le lie au `<form id="checkout-form">` même s'il est ailleurs dans le DOM) + un `React.createPortal()` : `CheckoutForm` (dans `<Elements>`) reçoit `footerPortalNode` (un `useState<HTMLDivElement|null>`, pas un `useRef` — nécessaire pour déclencher un re-render une fois le `<div>` cible monté et attaché) et y portage son footer JSX. Le `<div ref={setFooterPortalNode}>` cible est rendu par `PaywallModal` en sibling après la région scrollable. Header (bouton retour, choix mensuel/annuel, garanties) rejoint la même région scrollable que le formulaire — un round de fix précédent l'avait rendu `flexShrink:0` fixe en haut, ce que Gildas a signalé comme masquant trop le formulaire Stripe visible ("le formulaire de paiement scroll mais le haut de la page... est sticky"). Header + formulaire défilent maintenant ensemble comme un seul bloc, seul le CTA reste fixe.
- **Marge symétrique autour du CTA** : Gildas a aussi signalé une marge asymétrique (16px au-dessus, 24px en dessous) entre le contenu et le bouton d'un côté, et le bouton et le bas de la carte de l'autre. Uniformisé à `padding: "20px 28px 20px"` sur tous les footers listés ci-dessus.
- Vérifié en local (fenêtre réduite pour forcer le scroll interne) sur `CelebrationScreen` (coach, contenu long) et les 3 steps de `PrimingJourneyModal` : le footer reste opaque et flush avec le bas arrondi de la carte à tout moment du scroll, plus aucun contenu ne réapparaît en dessous. `PaywallModal` vérifié structurellement (header+formulaire dans la même région scrollable, `Erreur: Unauthorized` du setup-intent — attendu hors session authentifiée — apparaît bien dans le flux scrollable avec le reste) ; **le paiement réel (saisie carte + soumission Stripe) n'a volontairement pas été testé par Claude** — Claude n'entre jamais d'informations de carte bancaire, même sur demande explicite (règle de sécurité permanente, pas spécifique à ce projet) ; Gildas doit vérifier lui-même en conditions réelles que la soumission fonctionne toujours après ce refactor (clés Stripe en mode live, voir `.env.local`).

### Sport "Autre" — précision
Si l'user sélectionne "Autre" dans `sport_2a`, un champ texte s'affiche.
Sauvegardé comme `"Autre - {précision}"` dans `profiles.sport`.
Placeholder coach : "Précise le sport de tes sportifs".

### Wellness athlète — mécanique
- Les 5 questions (`wellness_q`) collectent sleep+bedtime, stress, recovery, behaviors, motivation
- Score calculé en state via `computeWellnessScore()` à la fin de `wellness_q`
- Sauvegarde dans `finishAthleteActivation()` via upsert sur `wellness_daily` (plus `handleFinish()` — `wellness_q` est désormais post-paiement, voir `paidExtras` plus haut)

### StepIds complets (2026-07-20)
```typescript
type StepId =
  | "role"
  | "value_intro"                                                            // POST_PROGRESS, DARK_STEPS — position 0 dans tous les paths, remplace value_slides/value_program/value_program_coach
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"   // sportif ET coach
  | "overload_2a" | "planning_2a" | "fatigue_2a"                           // pain points sportif
  | "autoreg_score"                                                          // POST_PROGRESS, DARK_STEPS
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"   // coach (dead code — hors paths)
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"                      // pain points coach
  | "autoreg_score_coach"                                                    // POST_PROGRESS, DARK_STEPS
  | "week_preview_2a" | "week_preview_2b"                                   // preview programme
  | "wellness_q"                                                             // POST_PROGRESS — n'est plus dans le tableau statique, inséré via paidExtras après celebration si paiement réussi
  | "wellness_reveal"                                                        // POST_PROGRESS, DARK_STEPS — idem, après wellness_q
  | "account"                                                                // position variable selon variante A/B (voir plus haut)
  | "celebration"                                                           // POST_PROGRESS, DARK_STEPS — ne suit plus directement account, précédée par paywall_priming/paywall_form
  | "concept_autoreg"                                                        // POST_PROGRESS, DARK_STEPS
  | "profile_recap"                                                         // POST_PROGRESS (light, pas dans DARK_STEPS)
  | "invite_team"                                                           // POST_PROGRESS (light) — coach uniquement, inséré via paidExtras après celebration si paiement réussi
  | "paywall_priming" | "paywall_form";                                     // POST_PROGRESS — nouveaux, précèdent désormais celebration
```
`value_program`/`value_program_coach` supprimés du type (remplacés par `value_intro`, générique).

`POST_PROGRESS` = `["value_intro", "wellness_q", "wellness_reveal", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "profile_recap", "invite_team", "paywall_priming", "paywall_form", "week_preview_2a", "week_preview_2b"]`
`DARK_STEPS` (fond `OnboardingBackground variant="dark"`) = `["value_intro", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "wellness_reveal"]` — `paywall_priming`/`paywall_form` sont en `variant="light"`, tout comme le reste des questions/formulaires.

Note : `context_2b`, `sport_2b`, `count_2b`, `tool_2b` sont dans le type StepId mais hors de tout path actif (dead code conservé pour compatibilité auth mode).

### Les 8 tableaux de paths (`OnboardingFlow.tsx:58-150`)
`ATHLETE_PATH`/`COACH_PATH` (classique, variante A — signup après pain points), `SHORT_ATHLETE_PATH`/`SHORT_COACH_PATH` (classique, variante B — signup juste après `role`), `PROGRAM_ATHLETE_PATH`/`PROGRAM_COACH_PATH` (programme claimé, variante A), `SHORT_PROGRAM_ATHLETE_PATH`/`SHORT_PROGRAM_COACH_PATH` (programme claimé, variante B). `getPath(role)` choisit le tableau selon `assignedVariant` (`"test"` = B) puis `hasClaimedProgram`, et splice `paidExtras` après `"celebration"` une fois `trial_started` réussi (voir `handlePaymentSuccess()`).

## Composants clés
```
src/components/
  onboarding/
    OnboardingFlow.tsx          # Flow complet sportif + coach (register + auth mode)
    Actions.tsx                 # CTA sticky partagé (variant light/dark/modal-light/modal-dark), pas de bouton retour (supprimés du flow le 2026-07-13)
    OnboardingBackground.tsx    # Fond plein-page dark/light selon step (remplace AuthBackground pour l'onboarding)
    CelebrationScreen.tsx       # Dernier step de tous les paths — recap + upgrade pitch, ouvre PaywallModal
    AutoRegScoreStep.tsx        # Score autorégulation sportif (dark card, 3 jauges, score %) — exporte computeAthleteAutoregProfile (persona + dimensions) réutilisé par profile_recap
    AutoRegScoreStepCoach.tsx   # Score autorégulation coach (même mécanique) — exporte computeCoachAutoregProfile
  paywall/
    PaywallModal.tsx       # Stripe Elements in-app, billing toggle, badge sécurité
    PrimingJourneyModal.tsx # Priming in-app (value/social proof → rappel essai → pricing), utilisé par usePaywall
    PaywallGate.tsx        # Code mort (zéro import) — ne pas réutiliser sans vérifier
  sessions/
    AddSessionModal.tsx    # Créer/modifier séance (exercices, difficulté)
    CompleteModal.tsx      # Marquer séance terminée (RPE + durée)
    DuplicateModal.tsx     # Dupliquer une séance sur une autre date
  wellness/
    WellnessModal.tsx      # Formulaire wellness 5 étapes
    WellnessRing.tsx       # Ring SVG réutilisable (score, dark?, infinite? — modes ajoutés 2026-07-12 pour CelebrationScreen). Today/Coach ont chacun leur propre copie locale du même ring (WellnessRingPOC/PlanningRing) — pas encore unifiées avec ce composant
  calendar/
    CalendarHeader.tsx     # En-tête calendrier semaine avec dots
  profile/
    EditProfileModal.tsx   # Modifier nom/sport/objectif/fréquence
  auth/
    LogoutButton.tsx       # Déconnexion client
  layout/
    BottomNav.tsx          # Navigation bas (zIndex: 2147483000)
```

## Types principaux (`src/types/index.ts`)
```typescript
Session { id, user_id, date, name, notes, duration, rpe, done, target_difficulty, created_at }
WellnessDaily { id, user_id, date, sleep, stress, recovery, motivation, base_score, score, behaviors, bedtime }
Profile { id, user_id, name, sport, objective, freq_target, mode, subscription_status, onboarding_done }
```

## Wording — convention à respecter
- **"sportif"** partout dans l'UI (jamais "athlète") — changement effectué juin 2026
- Les noms de variables, routes API et colonnes DB gardent le terme `athlete` (ex: `coach_athletes`, `/api/athlete/delete`, `athleteCount`) — ne pas les renommer
- En DB, `subscription_status = "athlete"` reste la valeur technique, mais s'affiche "Sportif" côté UI

## Intégration Brevo (emailing)
- Route : `src/app/api/brevo/contact/route.ts`
- Env vars Vercel : `BREVO_API_KEY`, `BREVO_ONBOARDING_LIST_ID`
- Déclenchement : après paiement Stripe réussi (`stripe/webhook`) → `markBrevoClient(userId)` retire l'user de la liste onboarding Brevo (stoppe la séquence email)
- Route publique (pas d'auth requise) — déclarée dans `middleware.ts` sous `/api/brevo/`

## Paywall — composants
```
src/components/paywall/
  PaywallModal.tsx         # Toggle mensuel/annuel + 3 garanties + formulaire CB Stripe (toggle/garanties restaurés le 2026-07-12, voir section Onboarding)
  PrimingJourneyModal.tsx  # Écran priming (value/social proof → rappel essai → timeline + plan cards) — utilisé par usePaywall dans l'app (gating in-app free/expired) UNIQUEMENT, pas dans le chemin onboarding (celebration ouvre PaywallModal directement)
  PrimingModal.tsx         # Code mort (zéro import) — ne pas confondre avec PrimingJourneyModal
  PaywallGate.tsx          # Code mort (zéro import)
src/hooks/
  usePaywall.ts       # Hook 2-step : priming → paywall. Retourne paywallStep, setPaywallStep, billing, setBilling
```

**Flow paywall unifié** : `requireSubscription()` → `paywallStep = "priming"` → `PrimingJourneyModal` → CTA → `paywallStep = "paywall"` → `PaywallModal` → "← Retour" → `paywallStep = "priming"`.
Le cadenas `.locked`/`.tour-lock` (cf. section Onboarding) est désormais permanent, plus lié à une session de tour.

## Webhook Stripe & statuts d'abonnement (`src/app/api/stripe/webhook/route.ts`)

`profiles.subscription_status` a 4 valeurs possibles : `free` | `athlete` | `coach` | `expired`. `athlete`/`coach` servent à la fois de "rôle" et de "statut payant" (pas de valeur `trialing` séparée — un essai en cours est stocké comme `athlete`/`coach`, comme un abonnement payant actif). `isActive` (`src/app/(app)/layout.tsx`, `usePaywall.ts`) : `true` si `athlete`/`coach`, ou si `free` + lié à un coach (`hasCoach`) ; sinon `.locked` + paywall.

Le endpoint webhook écoute 3 events : `checkout.session.completed`, `customer.subscription.created`/`updated` (même handler), `customer.subscription.deleted`. Aucune vérification serveur/RLS sur `subscription_status` ailleurs — seule source de vérité DB, alimentée uniquement par ce webhook + l'update optimiste dans `stripe/subscribe/route.ts`.

**Fix résiliation pendant l'essai gratuit (2026-07-15)** — repéré par Gildas sur 2 comptes réels (`yanoutkast@live.fr`, `pgueny1@gmai.com`) restés `subscription_status = "athlete"` alors que ni payants ni en essai côté Stripe. Root cause : quand un user résilie pendant son essai, Stripe met `cancel_at_period_end = true` mais garde `status = "trialing"` jusqu'à la fin de la période — ce cas ne matchait ni la branche "actif" (exige `!cancel_at_period_end`) ni la branche "expiré" (`past_due`/`canceled`/`unpaid`), donc le handler `customer.subscription.updated` ne faisait rien : l'accès restait ouvert jusqu'à `customer.subscription.deleted` (potentiellement des jours plus tard, ou jamais si l'event est manqué). **Fix** : nouvelle branche `else if (sub.status === "trialing" && sub.cancel_at_period_end)` → `subscription_status = "expired"` immédiatement, dès la résiliation (pas d'attente de la fin de l'essai). **Choix assumé** : ne concerne que la résiliation pendant l'essai — un client payant qui résilie garde l'accès jusqu'à la fin de sa période payée (comportement standard inchangé), seul `customer.subscription.deleted` le repasse à `expired`. Pas de table d'historique des events Stripe en DB (`profiles.stripe_customer_id` seul, pas de log) — impossible de retracer après coup pourquoi un compte a divergé, seul `profiles.updated_at` donne un indice de timing.
Les 2 comptes identifiés ont été corrigés manuellement en DB (`subscription_status = "expired"`) — pas d'outil admin dans le repo, `UPDATE` SQL direct via Supabase.

## Programmes publics partagés (`/p/[id]`)

Page publique (`src/app/p/[id]/page.tsx` + `PublicProgramView.tsx`, client component) affichant un programme `is_public = true` en lecture, utilisée en iframe sur les pages WordPress (bibliothèque) et accessible en lien direct. `page.tsx` charge la ligne `programs` via `createAdminClient()` (bypass RLS, nécessaire pour un accès anonyme).

- **Onglets de semaines** (S1…SN) : navigation libre, aucune restriction — `weekIdx` en state local, clic direct.
- **Détection connecté/déconnecté** : `userMode` (state `"coach" | "athlete" | null`), résolu côté client via `supabase.auth.getUser()` + `profiles.mode` (`PublicProgramView.tsx`). `userMode === null` = visiteur non connecté.
- **Verrouillage semaines 2+ pour les non-connectés (2026-07-15)** : décision de Gildas suite au constat que la page donnait tout le programme gratuitement via les iframes WP. À partir de la semaine 2 (`weekIdx > 0`), si `userMode === null` : la grille 7 jours reste rendue (même contenu réel) mais `filter: blur(7px)` + `pointerEvents: none` + `userSelect: none`, avec un overlay centré par-dessus (titre "Obtenir le programme complet et le personnaliser" + les 2 CTA rôle décrits ci-dessous). **Choix assumé 100% client-side** (pas de troncature des données côté serveur) — cohérent avec le reste de l'app où le paywall est volontairement client-only (cf. section Paywall, "limite assumée"). Les onglets de semaines eux-mêmes ne sont ni cachés ni cadenassés (demande explicite de Gildas : pas de modification des petites barres, juste le flou du contenu).
- **CTA rôle-aware (2026-07-27)** : les 2 emplacements CTA visiteur non connecté (bottom bar + panneau flouté semaines 2+) proposaient auparavant 2 boutons ("Créer un compte" / "👤 Utiliser ce programme") qui appelaient tous les deux le même handler sans distinction — Gildas a repéré qu'ils faisaient donc littéralement la même chose. Remplacés par **"Utiliser en tant que sportif →"** (primaire, dégradé orange) et **"Utiliser en tant que coach →"** (secondaire, contour) : `handleClaimGuest(role: "athlete" | "coach")` redirige vers `/register?role=${role}` au lieu de `/register` nu, réutilisant le mécanisme de pré-remplissage déjà en place (cf. mémoire `project-role-prefill`) pour sauter le step "rôle" de l'onboarding. Bottom bar en ligne (coach à gauche, sportif à droite) ; panneau flouté empilé verticalement (carte trop étroite, `maxWidth: 300`, pour 2 boutons côte à côte avec ce wording plus long), sportif en premier.
- **Claim programme** :
  - Non connecté (`userMode === null`) : `handleClaimGuest(role)` pose `claim_program_id` en localStorage et navigue vers `/register?role=${role}` (`window.open` si embarqué en iframe) — consommé ensuite par `OnboardingFlow.tsx` (`PROGRAM_ATHLETE_PATH`/`PROGRAM_COACH_PATH`), alimente le funnel "programme claimé" (`program_onboarding_start` → funnels PostHog 4745753/4745754, cf. section Analytics).
  - Connecté : `handleClaimConnected()` → `POST /api/programs/claim` (copie la ligne `programs` publique vers l'utilisateur courant via le client serveur authentifié), puis redirige vers `/today` ou `/coach/planning` selon `userMode`.
- **Tracking** : `program_page_viewed` (montage), `program_cta_clicked` (`cta`: `add_to_library` | `use_as_athlete` | `use_as_coach`, plus propriété `role` depuis le 2026-07-27 — anciennes valeurs `create_account`/`use_program` avant ce changement — tous les CTA y compris le panneau flouté), `program_claimed` (succès du claim connecté).

### Performance — TTFB catastrophique corrigé (2026-07-28)
Web Vitals PostHog (mobile, p90, 90j) montraient un LCP de **6 à 18 secondes** sur `/p/*` — la page publique la plus visible du site (iframe WP + liens directs). Investigation : aucune image sur cette page (l'élément LCP est un bloc de texte), le problème était 100% TTFB, causé par 3 choses en cascade avant le premier octet HTML :
1. **`src/lib/supabase/middleware.ts`** faisait un `await supabase.auth.getUser()` inconditionnel (aller-retour réseau Auth Supabase, pas juste un décodage local) sur *chaque* requête, y compris les visiteurs anonymes de `/p/*` — alors que `user` n'était jamais lu sur les chemins publics. **Fix** : court-circuit tout en haut de `updateSession()`, restreint à `/p/` (pas tous les `publicPaths`, pour limiter le risque) — retourne directement sans jamais appeler Supabase Auth.
2. **`generateMetadata` et la page** faisaient chacun leur propre requête `programs` quasi-identique, non partagée. **Fix** : extraction dans `getProgram(id)` wrappée par `cache()` de React (`src/app/p/[id]/page.tsx`) — dédupliquée entre les deux appelants, 3 requêtes DB → 2.
3. **`export const dynamic = "force-dynamic"`** désactivait tout cache — chaque vue refaisait 100% du travail serveur. **Fix** : remplacé par `export const revalidate = 60` (ISR) — la majorité des visites servent désormais une page déjà générée. **Compromis assumé** : jusqu'à 60s de délai de propagation sur une modification de programme public. Accepté explicitement par Gildas car l'usage actuel de `/p/*` est uniquement des templates PLG créés depuis son propre compte coach (pas de contenu tiers édité en temps réel) — à revisiter si l'usage change.

Le fix middleware a un effet de bord à surveiller : `getUser()` rafraîchit aussi le cookie de session — un visiteur déjà connecté qui consulte `/p/*` ne verra pas son cookie rafraîchi *pendant cette visite précise* (impact jugé faible, la prochaine navigation vers une page authentifiée le refait). Pas de régression détectée mais pas testée en conditions réelles par Claude (pas d'accès à un compte connecté) — à vérifier par Gildas en prod.

## Web Vitals mobile — Phase 1, quick wins globaux (2026-07-28)
Même chantier que ci-dessus, causes identifiées sur `/register` (LCP 4551ms) et `/today` (INP 2017ms, le pire de toutes les pages mesurées) via 3 agents d'investigation en lecture seule, puis un agent de planification. Détail complet et données chiffrées dans le plan `/Users/Gildas/.claude/plans/harmonic-dancing-possum.md`.

- **Fonts → `next/font/google`** (`src/app/layout.tsx`, `globals.css`, `tailwind.config.ts`) : remplace l'`@import url('fonts.googleapis.com/...')` (chaîne bloquante HTML→CSS→@import→2 origines externes, cause probable du CLS élevé partout — FOUT sur les titres en graisse 900/950, fallback Helvetica Neue→DM Sans). Self-host + preload auto via `next/font`, plus de requête réseau bloquante. Variable CSS `--font-dm-sans` posée sur `<html className={dmSans.variable}>`, consommée par `globals.css`/`tailwind.config.ts`.
- **Preconnect** (`layout.tsx`) : `eu.i.posthog.com`, `www.theperfclub.com`, `js.stripe.com`.
- **Stripe en lazy-load** (`PaywallModal.tsx`) : `loadStripe(...)` s'exécutait auparavant au chargement du **module**, importé en haut d'`OnboardingFlow.tsx` — le SDK Stripe se chargeait donc dès `value_intro` (1er écran), bien avant le paywall, en concurrence avec l'image LCP. **Fix** : singleton lazy `getStripePromise()`, appelé seulement au step `paywall_form` (guard déjà existant sur le fetch `setup-intent`, ligne ~1269). Comportement Stripe inchangé, seul le timing change.
- **Image LCP `value_intro`** (`OnboardingFlow.tsx`, `<img>` du carrousel, 1er slide toujours la même image statique) : `fetchpriority="high"` + `loading="eager"` sur cette image précise (attribut DOM brut via spread `{...{ fetchpriority: "high" }}`, React 18 ne reconnaît pas la prop camelCase), plus un `<link rel="preload" as="image">` posé côté Server Component (`register/page.tsx`, uniquement pour les visiteurs sans `?role=` — ce cas saute `value_intro`).
- **`next/dynamic` sur les 5 modales de `/today`** (`WellnessModal`, `AddSessionModal`, `CompleteModal`, `PaywallModal`, `PrimingJourneyModal`) : jusque-là importées statiquement dans `TodayClient.tsx` alors que rendues seulement sous condition — tout leur JS était hydraté avec le bundle principal. Premier usage de `next/font`/`next/dynamic`/`React.cache()` dans tout le repo (aucun précédent avant ce chantier).

**Non fait, volontairement** : split structurel de `TodayClient.tsx` (747 lignes, 11 `useState` sans mémoïsation — cause la plus probable de l'INP 2017ms) et `OnboardingFlow.tsx` (2626 lignes). Jugé trop risqué sans suite de tests automatisée sur des fichiers aussi centraux (funnel de conversion, dashboard principal) — à ne déclencher que si les fixes ci-dessus s'avèrent insuffisants une fois mesurés sur PostHog (1-2 semaines de données p90 pour lisser le bruit). Mémoïsation ciblée (`useMemo` sur `buildDotMap`) et fix CLS du bandeau d'activation (`showActivation`, résolu par `localStorage` dans un `useEffect` post-montage) identifiés mais pas implémentés — voir le plan pour le détail.

## Analytics PostHog — tracking onboarding
Provider : `src/providers/PostHogProvider.tsx`, clé : `NEXT_PUBLIC_POSTHOG_KEY`

### Events émis par `OnboardingFlow.tsx`
Chaque changement de step déclenche **deux events** :
```typescript
posthog.capture("onboarding_step_viewed", { step, step_index, role, mode }); // pour les funnels
posthog.capture(`onboarding_${currentStep}_viewed`, { step, step_index, role, mode }); // pour User Paths
```
- `onboarding_step_viewed` (générique) → utilisé par les funnels Athlète/Coach existants
- `onboarding_${step}_viewed` (spécifique) → utilisé par le User Path (nœuds distincts par étape)

**Règle :** ne jamais fusionner ces deux calls en un seul — les funnels ont besoin de l'event générique, le User Path a besoin des events spécifiques.

### Insight User Path configuré
- ID PostHog : `S3Tznl9b` (projet 187815, EU)
- Start point : `onboarding_role_viewed`
- Visible dès qu'un user fait l'onboarding après le déploiement du 2026-06-01

### Fix ordre `program_onboarding_start` / `onboarding_role_viewed` (2026-07-14/15)
Repéré par Gildas ("je vois des users qui viennent des programme et je les vois pas dans le funnel alors qu'ils sont allés jusqu'à l'inscription") — investigation HogQL directe sur les events (pas juste la config des funnels) : sur 100% des sessions "via programme" des 10 derniers jours, `onboarding_role_viewed` tirait systématiquement quelques ms **avant** `program_onboarding_start`, alors que les funnels 4745753/4745754 exigent l'inverse (Démarrage=step 1, Rôle=step 2) — les funnels sont ordonnés, donc ces users restaient bloqués visuellement à l'étape 1 même s'ils avaient progressé bien plus loin.

**Root cause** : dans `OnboardingFlow.tsx`, deux `useEffect` séparés capturent chacun un des deux events au montage (aucun des deux n'est réellement async avant son `posthog.capture`) — React exécute les effets dans leur ordre de déclaration textuelle, et l'effet générique de vue d'étape (qui capture `onboarding_role_viewed`) était déclaré **avant** l'effet de claim (qui capture `program_onboarding_start`). **Fix** : le bloc de l'effet de claim a été remonté au-dessus de l'effet générique — `program_onboarding_start` tire désormais toujours en premier, confirmé par un test réel en prod (`019f5f93-...`, 2026-07-14) montrant l'ordre correct à la milliseconde.

Les funnels 4745753/4745754 ont été bumpés à `date_from: 2026-07-14` (déploiement du fix) pour exclure la fenêtre où l'ordre était encore inversé.

### A/B test "short-onboarding-signup" — LIVRÉ 2026-07-15
**Contexte** : analyse du funnel (30 jours) montrant seulement 16-18 personnes/semaine atteignant le CTA du paywall, avec 0-1 essai démarré — échantillon trop petit pour juger la conversion du paywall lui-même (IC 95% sur 0/16 ≈ 0%-19%). Deux fuites significatives identifiées en amont : formulaire de compte (-51%) et compte créé→célébration (-58%), suggérant que le long parcours qualifiant (9-13 étapes) pourrait fatiguer avant même d'arriver au paywall. Décision de Gildas : garder la CB obligatoire pour l'essai (non négociable), tester si un parcours ultra-court (rôle + inscription → paywall immédiat) change la donne — objectif double : volume d'exposition au paywall bien plus élevé + isoler "le paywall convertit-il" de "le parcours fatigue-t-il".

**Implémentation** (`OnboardingFlow.tsx`) :
- Deux nouveaux paths : `SHORT_ATHLETE_PATH`/`SHORT_COACH_PATH` = `["role", "account"]` uniquement, aucun écran de célébration intermédiaire.
- Variante résolue via `useFeatureFlagVariantKey("short-onboarding-signup")` (posthog-js/react), verrouillée dans `assignedVariant` (state) — repli sur `"control"` si le flag n'a pas résolu au moment où l'utilisateur clique son rôle. Override `?ab=test`/`?ab=control` dans l'URL pour forcer un bras (nécessaire en dev, `PostHogProvider.tsx` skip `posthog.init()` en local — sert aussi d'outil de support/debug en prod).
- `getPath()` route vers les paths courts pour le bras `test`, **avant** le check `hasClaimedProgram` — le trafic via programme claimé est bien inclus dans le test (pas juste le trafic classique), ~doublant le volume éligible (~17,4 démarrages/jour).
- `handleFinish()`/l'effet de continuation Google appellent `handleStartTrial()` directement (au lieu de `goToActivationStep()`) quand `assignedVariant === "test"` — paywall ouvert immédiatement après création du compte.
- **Titre du paywall dynamique** : nouveau prop `headline?: string` sur `PaywallModal.tsx`, calculé dans `OnboardingFlow.tsx` (`hasClaimedProgram && claimedProgramName ? "Ton programme {nom} t'attend" : undefined`, repli sur le titre générique par défaut du composant) — rappelle le programme claimé pour ce trafic, générique sinon.
- **Piège trouvé et corrigé en review** : le vrai claim+assign sportif (POST `/api/programs/claim` puis `/assign`) était uniquement à l'intérieur de `finishAthleteActivation()`, appelée seulement à la fin de `wellness_q` — étape absente du path court. Sans fix, un sportif du bras test venant d'un programme claimé aurait payé sans jamais recevoir son programme. Extrait dans une fonction partagée `claimAndAssignProgram(uid, wellnessAdjustment)`, appelée soit par `finishAthleteActivation()` (ajustement réel), soit en synchrone dans `handleFinish()` pour le cas test+programme+sportif (`wellnessAdjustment=0`, aucune donnée wellness disponible en path court).
- Tagging `ab_variant` (`"control"`/`"test"`/`"pending"` avant résolution) sur les events clés (`onboarding_step_viewed`/`onboarding_${step}_viewed`, `account_created` ×2, `celebration_cta_clicked`, `paywall_priming_viewed`) + `posthog.setPersonProperties({ ab_variant })` une fois verrouillé.
- **Trou trouvé sur le premier vrai essai converti (`trial_started`, 2026-07-15)** : cet event est capturé dans `PaywallModal.tsx`/`CheckoutForm` (déclenché après paiement Stripe réussi), pas dans `OnboardingFlow.tsx` — oublié du tagging initial, `assignedVariant` n'y étant pas accessible. Le breakdown des funnels/de l'expérience reste correct malgré tout (basé sur la person property `ab_variant`, pas sur l'event property), mais toute requête brute directe sur `trial_started` était aveugle au bras. Fix : nouveau prop optionnel `abVariant` threadé `OnboardingFlow.tsx` → `PaywallModal` → `CheckoutForm`, absent (donc omis du payload) pour les callers hors onboarding (gating in-app via `usePaywall`, non concerné par ce test).

**Isolation des funnels existants** : sans filtre, les sessions du bras test auraient pollué les 4 funnels historiques (4403213, 4403222, 4745753, 4745754) — mêmes noms d'events partagés (`onboarding_role_viewed`, `account_created`...), donc comptabilisées à l'étape "Rôle" puis disparaissant (jamais de `onboarding_value_slides_viewed`/`frustration_2a`/etc.), gonflant artificiellement leur taux de chute apparent. Filtre personne `ab_variant is_not "test"` ajouté aux 4 (même opérateur déjà éprouvé pour `onboarding_source is_not "program"`, inclut correctement les users sans la propriété).

**Config PostHog (projet 187815, EU)** :
- Feature flag `short-onboarding-signup` (id 227509), multivarié `control`/`test` 50/50, **actif depuis 2026-07-15 08:22 UTC**.
- Expérience formelle liée au flag (id 86574) : métrique primaire `celebration_cta_clicked → trial_started` (isole la conversion paywall), secondaire `onboarding_role_viewed → celebration_cta_clicked` (fuite pré-paywall).
- 2 insights funnel dédiés : `nWK7DxIJ` "Vue d'ensemble (control vs test)" (breakdown `ab_variant`), et un second "Bras court, par origine" (filtré `ab_variant=test`, breakdown `onboarding_source`) pour comparer programme vs générique à l'intérieur du bras test.

**Règle d'arrêt pré-enregistrée** (éviter le peeking) : ne pas conclure avant **à la fois** 3 semaines écoulées **et** ~150 `celebration_cta_clicked` accumulés côté bras test. Rollback = désactiver le flag (0%) dans PostHog, aucun revert de code nécessaire.

**Note sur la fusion de personnes PostHog** : après `account_created`, `posthog.identify(uid, ...)` change le `distinct_id` (anonyme → uid réel). La fusion des deux identités (`person_distinct_id_overrides`) est asynchrone côté PostHog et peut prendre du temps à se propager — un funnel consulté trop tôt après une conversion peut afficher 0% à l'étape "Compte créé" même si les events bruts prouvent que la session a bien progressé (vérifié sur un cas réel le 2026-07-15 : `$identify` bien envoyé avec `$anon_distinct_id` correct, mais table de fusion encore vide plusieurs minutes après). Pas un bug applicatif — se vérifie en interrogeant les events bruts (HogQL) plutôt que le funnel si un chiffre semble incohérent juste après une conversion.

### Pivot A/B du 2026-07-19 + rebuild PostHog du 2026-07-20 (LIVRÉ)
Le design ci-dessus (`test` = parcours court avec paywall immédiat) a été **abandonné avant tout gros volume** : `test` enchaînait signup→paywall sans diagnostic, mesurant "signup tôt + paywall immédiat" plutôt que la longueur du diagnostic en tant que telle. Nouveau design (voir refonte v2 en tête de la section Onboarding) : `control` = **variante A** (signup après pain points), `test` = **variante B** (signup juste après `role`, diagnostic complet conservé) — isole la seule variable "position du Signup", sans le paywall immédiat qui brouillait la lecture. Flag `short-onboarding-signup` inchangé (même id, mêmes valeurs `control`/`test`), seule la signification du bras `test` change.

**Mis à jour dans PostHog le 2026-07-20 (via API, clé personnelle)**, suite au déploiement de la refonte v2 :
- **4 funnels historiques** (4403213/4403222/4745753/4745754) reconstruits avec la nouvelle séquence d'events (`value_intro`→`paywall_priming`→`paywall_form`→`trial_started`, sans plus l'ancien `celebration_cta_clicked`/`value_slides`). **`account_created` retiré des étapes ordonnées** (sa position diffère entre variante A et B — l'inclure dans un funnel séquentiel unique aurait fait apparaître une chute artificielle sur le bras dont l'ordre ne correspond pas à la position choisie ; il n'existe pas de conflit d'ordre pour les autres steps, identiques entre A et B une fois `account` retiré). Filtre `ab_variant is_not "test"` retiré (n'a plus de sens : les 2 bras sont désormais des flows v2 complets, plus un bras dégénéré à exclure). `date_from` bumpé au 2026-07-20.
- **Insight "Vue d'ensemble (control vs test)"** (`nWK7DxIJ`, id 5003439) : structure préservée (`role → account_created → paywall → trial`, breakdown personne `ab_variant`) — ce funnel réduit n'a PAS le problème d'ordre ci-dessus (`account_created` reste toujours avant le paywall dans les 2 bras, quelle que soit sa position exacte). Seul `celebration_cta_clicked` remplacé par `paywall_priming_viewed` (event mort après le 07-20, célébration n'a plus de CTA paywall).
- **Insight "Bras court, par origine"** (id 5003440) : supprimé — sa prémisse ("bras test = parcours court") n'existe plus depuis le pivot du 07-19.
- **Expérience 86574** : renommée, primaire `paywall vu → essai` (event `paywall_priming_viewed`, custom sans préfixe — l'API expérience a un garde-fou qui bloque les events jamais ingérés, `onboarding_paywall_priming_viewed` étant tout neuf au moment du rebuild), secondaire `role → paywall vu` (`onboarding_role_viewed → paywall_priming_viewed`, la vraie question posée par cette expérience).
- Les 4 funnels détaillés utilisent `onboarding_paywall_priming_viewed`/`onboarding_paywall_form_viewed` : normal qu'ils affichent 0 sur ces étapes tant que le trafic post-déploiement n'a pas encore convergé, pas un bug.

### Test Stripe en local (mode test, sans toucher à la prod)
Runbook utilisé le 2026-07-20 pour valider `paidExtras`/le webhook de bout en bout sans argent réel :
1. Dashboard Stripe → toggle "Mode test" → Developers → API keys → copier `pk_test_`/`sk_test_`.
2. Créer 4 Price test (mêmes montants que `PRICING` dans `PaywallModal.tsx` : sportif 9€/mois·59€/an, coach 49€/mois·179€/an) via `stripe prices create --api-key sk_test_...` (CLI officielle, `brew install stripe/stripe-cli/stripe`).
3. `.env.local` : remplacer `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`/les 4 `STRIPE_PRICE_*` par les valeurs test (garder les valeurs live commentées juste en dessous pour revert facile).
4. `stripe listen --api-key sk_test_... --forward-to localhost:3000/api/stripe/webhook` (arrière-plan) → copier le `whsec_...` affiché dans `STRIPE_WEBHOOK_SECRET`.
5. Redémarrer `npm run dev` (`.next` vidé), tester le flow réel jusqu'au paiement avec la carte `4242 4242 4242 4242`.
6. **Revert impératif après test** : remettre les clés live + arrêter `stripe listen`, sinon le serveur local continue de parler à Stripe en mode test alors que la prod (Vercel) reste sur les clés live — pas de risque de mélange (`.env.local` n'affecte jamais Vercel), juste à ne pas oublier pour la suite du dev local.

## Règles de développement
1. **Une seule jauge par carte de séance** — RPE si terminée, target_difficulty si planifiée. Pas de label.
2. **Exercices sans numéros** — liste séparée par `\n` dans `notes`, affichage brut.
3. **Comportements wellness** — les clés DB (`alcohol`, `screen_late`…) doivent être traduits via `BEHAVIOR_LABELS` avant affichage.
4. **Footer CTA des modales scrollables (`padding:28`, `maxHeight:92vh`)** : carte en `display:flex; flexDirection:column; overflow:hidden`, contenu dans une région interne `overflowY:auto; padding:28`, footer en flex item `flexShrink:0` après cette région (pas de `position:sticky`, pas de margin négatif — voir "Footer non-scrollable des modales" pour le détail et le pourquoi). Padding du footer : `20px 28px 20px` (symétrique haut/bas).
5. **Pages serveur** pour le fetch initial, **Client components** pour l'interactivité.
6. **Pas de commentaires** sauf si le WHY est non-évident.
7. **Service worker (`public/sw.js`)** — stratégie mixte depuis le 2026-07-13 (voir section "Notifications push" pour le détail) : cache-first uniquement pour les fichiers statiques versionnés (`/_next/static/`, images), network-first pour les pages et l'API. En dev local, le navigateur peut quand même servir un bundle JS obsolète pour les assets statiques malgré un restart complet de `npm run dev`. Avant toute vérification visuelle après un changement de code, désenregistrer le SW + vider les caches dans la console du navigateur : `(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();const k=await caches.keys();for(const x of k)await caches.delete(x);})()`, puis recharger.

## Notifications push (2026-07-13)

Chantier lancé après évaluation d'opportunité (l'app est déjà une PWA fonctionnelle — manifest, service worker, meta tags iOS — et `web-push`/VAPID étaient déjà scaffoldés sans être branchés). Objectif prioritaire : relancer par push les comptes créés qui n'ont pas démarré leur essai (paywall obligatoire non passé), en captant la permission le plus tôt possible dans le funnel — avant l'abandon potentiel au paywall.

- **Nouveau step `wellness_reveal`** (sportif uniquement, entre `wellness_q` et `celebration` sur `ATHLETE_PATH`/`PROGRAM_ATHLETE_PATH`, ajouté à `POST_PROGRESS`/`DARK_STEPS`) : reprend le style de la carte "Score & conseils" de `/today` (zone wellness via `zoneLabel()`, insight via `getContextualInsight()`, pill "Autorégulation active", conseils Entraînement/Récupération via `getAdvice()` — fonctions extraites de `TodayClient.tsx` vers `src/lib/wellness.ts` pour être réutilisées ici sans dupliquer la logique). Affiche la date de la prochaine séance (`nextSessionDayLabel()`, dérivé de `training_days` + `nextDateForDow`) et demande la permission notification : **"🔔 Oui, me prévenir"** (CTA principal) / **"Passer"** (secondaire) — clic sur l'un ou l'autre avance vers `celebration`. `celebration` n'a pas été modifiée (bloc wellness existant conservé, décision explicite de ne pas alléger pour l'instant).
- **`invite_team` (coach)** : le simple lien "Passer" a été remplacé le 2026-07-13 (matin) par **"🔔 Plus tard — me le rappeler"** (implémenté en JSX custom, pas via `Actions.tsx`, pour garder le composant partagé simple). Le lien "Passer" a depuis été retiré entièrement (même jour, plus tard) — voir section "Étape `invite_team`" plus haut : jugé redondant avec "Continuer" qui avance déjà sans email rempli. Seul "🔔 Plus tard — me le rappeler" reste dans le footer.
- **Limite iOS** : `src/lib/push.ts` expose `needsInstallForPush()` (iOS Safari + non-standalone) — sur ces deux écrans, le bouton de permission est remplacé par un nudge "📲 Ajoute à l'écran d'accueil" et l'appel à `subscribeToPush()` est skip (no-op silencieux, jamais bloquant).
- **Infra** : table `push_subscriptions` (migration `008_push_subscriptions.sql`, RLS `auth.uid() = user_id`, colonne `reminder_type` conservée en base mais plus utilisée par la logique d'envoi — segmentation basée sur `profiles.mode`/`subscription_status` à la place), `src/lib/push.ts` (`subscribeToPush()`/`unsubscribeFromPush()`/`isSubscribedToPush()`, détection iOS/standalone), `POST`/`DELETE /api/push/subscribe` (auth cookie), `GET|POST /api/push/send?job=session|winback` (protégé par `CRON_SECRET`).
- **Toggle notifications dans `/profil`** (`src/components/profile/NotificationToggle.tsx`, les deux rôles) : ON/OFF simple par appareil (pas par compte), permet de tester l'activation sans repasser par l'onboarding. Vérifie `Notification.permission` + abonnement `pushManager` actif au montage ; toggle ON = `subscribeToPush()`, toggle OFF = `unsubscribeFromPush()` (désabonne le navigateur + supprime la ligne DB).
- **Cron Vercel (plan Hobby confirmé)** : 2 jobs distincts dans `vercel.json` (Hobby limite à des crons quotidiens, pas horaires) — `job=session` à `0 8 * * *` UTC (9h Paris hiver), `job=winback` à `0 19 * * *` UTC (20h Paris hiver). **Horaires en UTC fixe, pas de gestion DST** : en heure d'été (CEST, UTC+2) ça glisse à 10h/21h locaux — accepté comme approximation, pas critique pour ce type de notif.
- **Segmentation par statut d'abonnement (pas par écran d'opt-in d'origine)**, décidée par Gildas après un premier design qui ne distinguait pas assez les cas :
  - `job=session` (9h) → sportifs uniquement (`profiles.mode = "athlete"`) : si `subscription_status = "free"`, rappel séance du jour si non terminée (`runSessionJob`) ; si payant (`subscription_status = "athlete"`), rappel de remplir le wellness du jour si absent de `wellness_daily` — notification différente, but rétention pas conversion.
  - `job=winback` (20h) → coachs gratuits uniquement (`profiles.mode = "coach"` ET `subscription_status = "free"`) : relance "Tes sportifs t'attendent" vers `/coach` (`runWinbackJob`). Le sportif gratuit n'a plus de winback séparé — le rappel séance du matin sert déjà cet objectif de conversion pour ce rôle.
  - Dédup winback inchangée : compteur `profiles.winback_push_count` (max 3 touches, espacées d'au moins 18h via `last_winback_push_at`).
  - **Décision explicite** : pas de contournement du paywall pour la relance coach — `/coach` affiche déjà le bouton "Inviter des sportifs" au premier plan, le clic déclenche `requireSubscription` normalement, cohérent avec le gating existant.
- **`public/sw.js`** : handlers `push`/`notificationclick` déjà présents, jamais branchés jusqu'ici. Fix `event.data?.json() ?? {}` ne rattrape pas une exception (seulement `null`/`undefined`) — si le payload ne parse pas, `event.waitUntil()` n'est jamais appelé et rien ne s'affiche, silencieusement. Remplacé par un vrai `try/catch`.
- **Bug de fond découvert en testant en prod avec Gildas (corrigé, `CACHE` bump à `v2`)** : le `fetch` handler était cache-first pour absolument tout (pages ET API), pas seulement les assets statiques — une page visitée une fois restait figée à cette version indéfiniment, même après déploiement, jusqu'à un nettoyage manuel du cache. Gildas a confirmé que ça touchait son usage quotidien réel de l'app ("données pas à jour, sauf à nettoyer le cache"), pas seulement un désagrément de dev. **Fix** : cache-first conservé uniquement pour `/_next/static/` + images (noms de fichiers hashés par le build, jamais de risque d'obsolescence) ; pages et API passent en network-first (réseau d'abord, cache en secours uniquement hors-ligne). C'est très probablement la cause de la plupart des comportements "capricieux" observés pendant tout le débogage push (toggle qui semblait revenir à OFF, etc.).
- **Bug préexistant corrigé en chemin, sans rapport avec ce chantier** : `src/middleware.ts` — le matcher n'excluait pas `sw.js`/`manifest.webmanifest`, donc `updateSession` redirigeait ces fichiers vers `/login` pour tout visiteur non authentifié (`SecurityError: script resource is behind a redirect` à l'enregistrement du service worker). Corrigé en les ajoutant à l'exclusion du matcher, même endroit que `_next/static`/favicon/images.
- **Vérification bout-en-bout tentée en local, non concluante** : abonnement réel créé, FCM répond systématiquement 201 (accepté), mais aucune notification n'apparaît sur macOS malgré permissions/réglages vérifiés (macOS notif Chrome, style d'alerte, `chrome://settings/content/notifications`) et un test de démo externe (gauntface.com) qui fonctionne sur la même machine — donc pas un blocage réseau/OS général. Clés VAPID vérifiées cryptographiquement correctes (dérivation de la clé publique depuis la privée = clé stockée). Cause probable : fiabilité connue de la livraison push sur `http://localhost`, à re-tester une fois en prod sur `go.theperfclub.com` (HTTPS réel).
- Plan complet : `/Users/Gildas/.claude/plans/evalue-l-opportunit-de-mettre-fuzzy-fiddle.md`.

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

## Coach Control (`/coach`) — carte dark + wellness du jour actif fiable (2026-07-23)

Capitalise sur le chantier `/today` ci-dessus (comportements, `loadRule`), appliqué au dashboard coach.

### `CoachCard` — extrait dans `src/components/coach/CoachAthleteCard.tsx` (2026-07-27)
`CoachCard`/`WellnessRing`/`scoreColor`/`maxDiffToday`/`attention`/`riskScore`/`decisionText` ne vivent plus dans `CoachClient.tsx` — déplacés dans ce module partagé pour être réutilisés par l'aperçu Coach Control de l'onboarding (`week_preview_2b`, voir section Onboarding plus haut) sans dupliquer la logique. `CoachClient.tsx` importe désormais tout depuis là ; `DiffGauge` reste importé localement dans `CoachClient.tsx` (utilisé aussi ailleurs sur la page, hors `CoachCard`).

### `CoachCard` — refonte visuelle (description ci-dessous inchangée, juste déplacée de fichier)
Passe d'un layout 3-colonnes clair (ring | contenu | bouton) à une carte dark empilée verticalement, inspirée d'une maquette fournie par Gildas :
- Fond `linear-gradient(145deg,#1a1a1a,#282828)` — même dégradé que le widget "Lecture d'équipe" déjà présent sur cette page (pas une nouvelle couleur inventée).
- Ligne du haut : `WellnessRing` + `zoneLabel()` (texte "ZONE X", `src/lib/wellness.ts`) + **prénom seul** (`athlete.name.split(" ")[0]`) + badge "Attention requise"/"Traité ✓".
- **Chips comportements directement sous le prénom** (pas de ligne "{sport} · N séances" — retirée à la demande de Gildas, cet emplacement est réservé aux chips) — `BEHAVIOR_META` (voir plus bas), rouge/orange pour négatif, vert pour positif.
- Encart décision (`decisionText()`, inchangée) avec émoji (💛 attention / ✅ stable) et bouton d'action désormais **à l'intérieur** de l'encart (Décider/Revoir/Voir — libellés conservés, pas renommés en "Ajuster" uniforme : la distinction reviewed/non-reviewed porte une info réelle que la maquette ne montrait pas).
- Carte blanche imbriquée pour la séance la plus dure du jour (`getTopSession()`-like, réutilise le pattern déjà écrit dans `CoachPlanningClient.tsx` : nom, badge Terminé/Prévu, `DiffGauge`, liste d'exercices) — une seule séance affichée, `+N autres séances` en petit texte si plusieurs.
- Les deux badges pill précédents ("✓ Autorégulation active" statique, "📉 score→score") ne sont pas repris ici (spécifiques à `/today`, pas demandés sur cette carte).

### `src/lib/behaviors.ts` — nouveau module partagé
`BEHAVIOR_META` (emoji + label + `positive`, 14 clés) extrait de `conseils/page.tsx` (dupliqué une 2e fois dans `today/TodayClient.tsx` sous le nom `BEHAVIOR_LABELS`, format différent) — les deux fichiers importent désormais depuis ce module, `CoachClient.tsx` aussi. Un seul point de vérité pour l'emoji/label de chaque comportement.

### Bug corrigé : le score wellness affiché ne correspondait pas toujours au jour actif
**Root cause** : `coach_athletes.wellness_score` est une colonne dénormalisée qui garde la dernière valeur écrite, sans lien garanti avec le jour affiché. La requête initiale (`page.tsx`) prenait "la ligne `wellness_daily` la plus récente toutes dates confondues" au lieu du jour actif, et `handleDateChange` (`CoachClient.tsx`) ne rafraîchissait jamais le wellness au changement de date (seulement les séances) — un score pouvait être périmé de plusieurs jours sans que rien ne l'indique. Repéré par Gildas sur son propre compte (`Gildas`, auto-lié coach+sportif) : deux `coach_athletes.wellness_score` différents (56 et 85) pour la même personne selon la relation coach consultée, aucun des deux ne correspondant au jour réel (pas encore rempli).

**Fix — nouveau champ `CoachAthlete.wellnessFilledToday?: boolean`** :
- `page.tsx` : requête wellness filtrée `.eq("date", today)` (comme la requête sessions juste à côté) au lieu de "la plus récente" ; `behaviors` sélectionné en même temps (même ligne, jamais désynchronisé du score).
- `handleDateChange` : nouvelle route **`GET /api/coach/wellness?date=...`** (le client Supabase normal ne peut pas lire le `wellness_daily` d'un autre `user_id` — RLS `auth.uid() = user_id`, aucune exception coach — même pattern que `/api/coach/session` déjà existant : vérifie que le coach possède bien ces sportifs via le client normal, puis lit via le client admin) appelée en parallèle du fetch sessions, met à jour `wellness_score`/`behaviors`/`wellnessFilledToday` pour tous les vrais sportifs (pas seulement ceux avec une ligne trouvée — sinon l'absence de mise à jour laissait les valeurs de la date précédente affichées).
- Souscription temps réel (`postgres_changes` sur `wellness_daily`) étendue pour patcher aussi `behaviors`/`wellnessFilledToday` (ne mettait à jour que `wellness_score` avant), filtrée sur `row.date === today` (le vrai jour calendaire, pas `selectedDate` — nuance acceptée, cas rare de navigation de date + événement temps réel simultané).
- Quand `wellnessFilledToday === false` : `WellnessRing`/`scoreColor` (widened en `number | null`) affichent "—" au lieu d'un chiffre trompeur ; `decisionText`/`attention`/`riskScore` ignorent le score non rempli (seule une séance dure prévue peut encore déclencher une alerte) ; la moyenne wellness d'équipe (`avgWellness`) exclut ces sportifs. Sportifs démo (`user_id === null`) : toujours `wellnessFilledToday: true`, pas de notion de jour pour eux.
- Même correction dans **`CoachSessionModal.tsx`** (`ReviewContext.wellness` devient `number | null`) — la modale ouverte au clic "Décider" utilisait le même chiffre périmé pour construire ses "points d'attention" (`buildAttentionPoints`).

**Deuxième occurrence trouvée par Gildas juste après, sur `/coach/planning`** (`CoachPlanningClient.tsx`, `dayWellness()`) : cette fonction avait déjà un `wellnessMap` correct par date (requête sur la vraie plage affichée), mais retombait aussi sur `athlete.wellness_score` dès qu'aucune ligne n'existait pour le jour consulté — y compris pour de vrais sportifs. **Fix** : le repli sur `wellness_score` ne s'applique plus qu'aux sportifs démo ; pour un vrai sportif, absence de ligne = `null` (déjà bien géré par `scoreColor`/`formLabel` du même fichier, seul le fallback était fautif). Retenir : tout endroit qui affiche `CoachAthlete.wellness_score` doit distinguer "vrai sportif sans donnée du jour" (→ `null`/"non renseigné") de "sportif démo" (→ toujours la valeur fixe) — ne pas supposer que la présence d'un `user_id` suffit à garantir une donnée à jour.

## `/coach/athletes` en dashboard + invitation multi-sportifs + alerte Coach Control renforcée (2026-07-28)

Parti d'un POC exploré en artefact HTML (idée : remonter dans `/coach/athletes` un condensé de ce que `/conseils` montre déjà côté sportif — charge nerveuse/musculaire, récup, comportements — plutôt qu'une simple grille de cards wellness+sport+boutons), puis implémenté en vrai après validation visuelle.

### `src/lib/fatigueSignature.ts` — nouveau module partagé
`daysAgoStr`, `computeSignature`, `sigDimInfo`, `buildDailyTimeSeries` existaient uniquement dans `conseils/page.tsx` (page-local, non exportés) — extraits tels quels dans ce module pour devenir la source unique de ces seuils/formules. `conseils/page.tsx` importe désormais depuis là au lieu de les redéfinir ; comportement inchangé, refactor pur.

### `/coach/athletes` — liste avec signature de fatigue par sportif
`AthletesClient.tsx` : la grille de cards (`repeat(auto-fit,minmax(240px,1fr))`) devient une liste verticale pleine largeur. Le haut de chaque ligne (ring, nom, statut, boutons "Voir planning"/"Retirer") est inchangé — juste réaligné sur une seule ligne flex (texte `flex:1`, boutons `flexShrink:0`, alors qu'ils étaient empilés dans deux blocs séparés avant). En dessous, nouveau bloc signature :
- `page.tsx` (server) : pour chaque sportif réel (`user_id` non null), fetch les 10 derniers jours de `sessions` + `wellness_daily` (`admin.from(...).in("user_id", realUserIds).gte("date", since10)`), calcule `buildDailyTimeSeries(sessions, wellness, 10)` → `AthleteSignature` (`{ kind: "manual" | "no_data" | "ok", nervous, muscular, recovery }`, `kind` discriminé). Sportifs démo (`user_id === null`) → toujours `"manual"` ; sportif réel sans aucune ligne `wellness_daily` sur la fenêtre → `"no_data"` (pas de requête supplémentaire pour dater précisément "depuis N jours" — volontairement simplifié pour éviter un N+1).
- `AthletesClient.tsx` (`AthleteSignatureBlock`) : `"manual"` → *"Forme non renseignée — pas de signature de fatigue ni de récupération à afficher."* ; `"no_data"` → *"🕳️ Pas de wellness renseigné ces 10 derniers jours…"* ; `"ok"` → 3 mini-sparklines (`MiniSpark`, composant React local, SVG `width:100%`/`preserveAspectRatio="none"` pour rester responsive) reprenant le style visuel exact de `SparkLineClient.tsx` (aire remplie `fillOpacity:.12` + trait 2px + point plein pour les lignes ; colonnes arrondies `fillOpacity:.75` pour les barres) et ses couleurs (nerveux `#f04a08` fixe, musculaire `#f28a00` fixe/bar chart, récupération = `sigDimInfo("recovery", …).color` dynamique) — mais **sans libellé texte à côté de la courbe** ("COÛT ÉLEVÉ" etc., retiré à la demande de Gildas : la couleur et la forme suffisent) ni tooltip au survol (simplification assumée pour une liste dense ; le vrai graphe détaillé avec hover reste `/conseils`, 28 jours). Simplification supplémentaire : les jours sans wellness renseigné sont compressés (courbe reliant uniquement les points connus, pas d'axe temporel avec trous visibles).
- Layout : `.sig-grid` (`globals.css`) — classe déjà présente mais non utilisée nulle part dans le code, retravaillée pour cet usage : 3 colonnes fixes `minmax(0,170px)` sur desktop (pas `1fr` — sinon les 3 courbes s'étirent sur toute la largeur de la carte, ~1000px sur grand écran, avec un `justify-content:space-between` essayé puis abandonné car il créait un espace excessif entre les 3 au lieu d'un espacement fixe), 2 colonnes puis 1 colonne en dessous de 680px/480px (media queries déjà existantes dans le fichier, inchangées).
- Comportements fréquents (chips) : implémentés dans un premier temps (`countRecentBehaviors` dans `fatigueSignature.ts`, réutilisant `BEHAVIOR_META`) puis **retirés à la demande de Gildas** ("finalement") — fonction et champ `AthleteSignature.behaviors` supprimés du code plutôt que laissés morts.

### `InviteModal.tsx` — invitation de plusieurs sportifs en une fois
Ne gérait qu'un seul champ email. Reprend le pattern déjà en place dans l'étape `invite_team` de l'onboarding coach (`OnboardingFlow.tsx`, post-paiement) : état `extraEmails: string[]`, bouton "+ Inviter un autre sportif" qui ajoute une ligne (email + bouton ✕ pour la retirer), et `handleInvite()` envoie tous les emails non vides en parallèle (`Promise.all`, un `POST /api/invite/create` par email — la route ne change pas, elle ne gérait déjà qu'un email à la fois). Écran de résultat adapté : `sentCount > 1` → *"Invitations enregistrées ! Tes {N} sportifs rejoindront ton espace…"*, sinon le wording singulier existant inchangé. Échec partiel (ex. 2 envoyés sur 3) affiché en une ligne d'erreur agrégée, sans bloquer les invitations réussies.

**`CoachClient.tsx` (`/coach`, dashboard Coach Control) utilisait une modale invite dupliquée et non alignée** (un seul champ email, sa propre logique `inviteEmail`/`inviteStatus`/`inviteError`/`handleEmptyInvite`, sans le lien d'invitation copiable ni WhatsApp) — remplacée par le vrai composant partagé `<InviteModal onClose={...} onLinked={() => router.refresh()} inviteCode={inviteCode} />`, exactement comme `AthletesClient.tsx`. Le bandeau "Invite ton premier sportif" affiché quand `athletes.length === 0` (formulaire email simple, sans modale) n'a pas été touché — hors périmètre de la demande, garde `inviteEmail`/`handleEmptyInvite`.

### `CoachAthleteCard.tsx` — alerte visuelle renforcée pour "attention requise"
Le point rouge clignotant seul (`perf-pulse`, existant) ne se voyait pas assez selon Gildas. Ajouts, au même rythme (1.8s) et sous la même condition (`showBadge` : priorité + pas encore traité) :
- Bordure : 1.5px → 3px, nouvelle animation `perf-border-pulse` faisant varier `border-color` (`rgba(212,64,0,.4)` → `rgba(212,64,0,1)`) et un second `box-shadow` en halo (`0 0 0 0` → `0 0 16px 3px rgba(212,64,0,.55)`), en plus du `box-shadow` de profondeur existant (conservé, deux ombres comma-séparées).
- Encart décision : le bouton Décider/Revoir/Voir passe d'un empilement vertical (texte puis bouton en dessous) à une ligne flex (texte `flex:1`, bouton `flexShrink:0`) — demandé séparément par Gildas, même esprit que le réalignement fait sur `/coach/athletes`.
- Se propage automatiquement à l'aperçu Coach Control de l'onboarding (`WeekPreviewStep.tsx`, `role === "coach"`) qui importe `CoachCard`/`attention` depuis ce même fichier — vérifié : `previewIsPriority = attention(previewAthlete, currentDiff)` est calculé dynamiquement selon le jour démo sélectionné, donc l'alerte visuelle (bordure + halo) y apparaît aussi sans travail supplémentaire. **Asymétrie notée avec le côté sportif** : l'aperçu wellness de la même page (`role !== "coach"`) ne réutilise que des fonctions de logique (`zoneLabel`, `getRecoveryAdvice`, `loadRule`), pas un composant carte partagé — son JSX est dupliqué à la main, donc un futur changement purement visuel sur la vraie carte `/today` ne s'y répercuterait pas automatiquement (contrairement au côté coach).

Testé en local à chaque étape (`tsc --noEmit`, service worker/cache PWA à vider entre chaque test — voir section Notifications push), puis en prod par Gildas. Déployé en 4 commits séparés (`f90128d`, `4677d15`, `7b622c8`, `99e4e1c`), chacun poussé sur `main` et vérifié `READY` sur Vercel avant de passer au suivant.

## Invitation coach → sportif — deux bugs bloquants corrigés (2026-07-23)

Repéré par Gildas en essayant de lier `cauvingildas@gmail.com` (compte sportif déjà existant) à `contact@theperfclub.com` (coach) :

1. **`POST /api/invite/create`** vérifiait l'existence d'un compte via `fetch(".../auth/v1/admin/users?email=...")` — ce paramètre `?email=` n'est pas un filtre supporté par l'API admin Supabase (confirmé via la doc officielle : `listUsers()` n'accepte que `page`/`perPage`, pas de filtre email), l'appel renvoyait donc juste la 1ère page (50 users par défaut). Sur 84 users au total, le compte cherché n'y était pas forcément → traité à tort comme "pas encore inscrit", créant une invitation en attente (`coach_invites`) au lieu de lier directement. **Fix** : `admin.auth.admin.listUsers({ page: 1, perPage: 1000 })` (méthode du SDK, pas de fetch brut).
2. **Aucun mécanisme pour qu'un compte déjà inscrit rattrape une invitation en attente** : `POST /api/invite/link` (consomme une ligne `coach_invites` pending et lie le sportif) n'était appelé que dans `OnboardingFlow.tsx`, à la création du compte — jamais pour quelqu'un qui se connecte normalement après coup. **Fix** : `TodayClient.tsx` appelle `/api/invite/link` au montage si `!hasCoach`, en silence (pas de toast, juste `router.refresh()` si `ok`).

Confirmé en base sur le cas réel de Gildas : la ligne `coach_invites` est passée de `pending` à `accepted` et `coach_athletes.user_id` a été rempli automatiquement dès le rechargement de `/today` en local, sans intervention manuelle.

## Invitation coach → sportif — 3 causes bloquantes corrigées (2026-07-28)

Remonté par un client payant réel (`mezghadsport@gmail.com`) : impossible d'ajouter des joueurs à son groupe, ni par email ni par lien. Investigation directe (code + requêtes SQL sur le projet Supabase prod) — trois causes distinctes, confirmées par des preuves concrètes (DB + grep), corrigées dans le même chantier :

1. **L'email d'invitation n'était jamais envoyé** — `POST /api/invite/create` se contentait d'écrire en base (`coach_invites` + placeholder `coach_athletes`), aucun envoi d'email n'existait dans le code malgré le package `resend` installé (`package.json`, jamais importé nulle part) et une variable `RESEND_API_KEY=re_placeholder` en `.env.local` jamais remplacée. Confirmé en base : l'invitation du coach concerné était restée "pending" indéfiniment, l'adresse invitée n'ayant jamais eu de compte créé. **Fix** : nouveau `src/lib/email/inviteEmail.ts` (`sendCoachInviteEmail`, HTML table-based avec les constantes de design habituelles, via le SDK `resend`), appelé dans `src/app/api/invite/create/route.ts` juste après la création de l'invite en attente — best-effort (try/catch, ne fait jamais échouer la requête), avec un warning silencieux si la clé est absente/placeholder. **Mise à jour 2026-07-28 (même jour)** : vraie clé `RESEND_API_KEY` fournie par Gildas, posée dans `.env.local` et sur Vercel prod (`vercel env add`, projet `tpcv-12`, confirmé via `vercel env ls production`). Domaine `theperfclub.com` enregistré côté Resend (`POST /domains`). **Les 3 enregistrements DNS ont été ajoutés directement dans la zone OVH** (`manager.eu.ovhcloud.com`, domaine géré chez OVH — pas de registrar tiers) via browser automation : TXT `resend._domainkey` (clé DKIM), MX `send` → `feedback-smtp.us-east-1.amazonses.com` (priorité 10 — piège rencontré : le champ "Priorité" affichait "10" par défaut mais n'était qu'un placeholder non soumis tant qu'il n'était pas explicitement retapé, le bouton "Ajouter" restait grisé sans message d'erreur visible), TXT `send` → `v=spf1 include:amazonses.com ~all`. Propagation confirmée instantanée (`dig` sur `ns20.ovh.net` et sur `8.8.8.8`, les 3 valeurs correspondent exactement à celles demandées par Resend). **Domaine passé à `verified` côté Resend le 2026-07-28, quelques minutes après l'ajout des enregistrements** (confirmé via l'API `GET /domains/:id`) — la cause #1 est désormais réellement résolue de bout en bout : `sendCoachInviteEmail` peut envoyer depuis `invitations@theperfclub.com`. Reste seulement à déployer le code (voir plus bas) pour que ça s'applique en prod.

2. **Le lien `/join/[code]` forçait tout le funnel consommateur** — `register/page.tsx` rendait l'onboarding complet (diagnostic, pain points, sport/niveau/objectif/jours, paywall) pour tout visiteur non connecté, sans jamais regarder si un `coach_invite_code` était présent en localStorage.

3. **Le paywall Stripe obligatoire bloquait tout nouveau sportif, invité ou non** — sans rapport avec le statut d'abonnement du coach lui-même (mur inconditionnel pour tout compte "athlete" créé). L'app gère pourtant déjà un accès gratuit via coach (`usePaywall.ts`/`(app)/layout.tsx` : `isActive = ... || (subscription_status==="free" && hasCoach)`), mais l'onboarding ignorait cette règle. Confirmé en base : zéro sportif n'avait jamais été lié à ce coach.

**Fix des causes 2 et 3, un seul mécanisme** (`src/components/onboarding/OnboardingFlow.tsx`) :
- Nouveau tableau `INVITE_ATHLETE_PATH: StepId[] = ["value_intro", "role", "account", "celebration"]` — aucun nouveau `StepId`, réutilise 4 steps existants, n'inclut ni diagnostic ni `paywall_priming`/`paywall_form` : le sportif atterrit sur `/today` avec `subscription_status="free"` + `hasCoach=true` sans jamais voir de mur de paiement.
- États `hasCoachInvite`/`coachInviteCode`/`inviteJoinFailed`. Résolution de `coach_invite_code` (localStorage) dans le **même** `useEffect` que `claim_program_id` (ordre de déclaration important, cf. bug déjà documenté plus haut sur l'ordre des effets) — validation asynchrone via une nouvelle route publique **`GET /api/invite/validate?code=...`** (même pattern que `GET /api/programs/[id]`), qui peut rétrograder `hasCoachInvite` à `false` si le code est invalide.
- `getPath()` : `hasCoachInvite` a priorité absolue sur `assignedVariant` (bras A/B) et `hasClaimedProgram` — une invitation coach est plus spécifique.
- `handleFinish()` : après l'appel existant à `/api/invite/link`, si `role==="athlete" && hasCoachInvite`, appelle `/api/invite/join` et **vérifie le résultat** avant de marquer `profiles.onboarding_done = true` (auparavant l'appel n'était jamais vérifié). En cas d'échec (code invalidé entre l'ouverture du lien et la soumission), bascule `hasCoachInvite=false` — retombe sur le funnel payant standard plutôt que de laisser un compte gratuit non lié en accès permanent non détecté. Nouvel effet dédié (`inviteJoinFailed`) recalcule `stepIdx` via `path.indexOf("account") + 1`, jamais `next()` — même règle que le bug déjà documenté sur la continuation Google OAuth (avancer d'un cran sur un ancien index tombe au mauvais endroit après un changement de path).
- **Continuation Google OAuth** : gap distinct trouvé pendant l'investigation — cette branche n'appelait **jamais** `/api/invite/join`, même avant ce chantier. Même fix ajouté (appel + vérification avant `setGoogleInitDone(true)`) ; le `useEffect [googleInitDone]` déjà existant recalcule `path`/`accountIdx` à jour, pas besoin d'un effet dédié supplémentaire ici.
- **`src/app/join/[code]/JoinRedirect.tsx`** : redirige vers `/register?role=athlete` (au lieu de `/register` nu) — réutilise le pré-remplissage de rôle déjà existant pour sauter `value_intro`/`role` visuellement sans code supplémentaire.

**Limite acceptée** : dans le cas rare où le lien coach échoue pile au moment de la soumission du formulaire, le fallback saute les questions sport/niveau/objectif/jours et `completeProfile()` (jamais déclenché, puisqu'il ne se déclenche qu'à l'entrée de `profile_recap`, jamais visitée par `INVITE_ATHLETE_PATH`) — un sportif dans ce cas précis se retrouverait avec un compte payant mais sans programme généré. Fenêtre de déclenchement très étroite, accepté comme limite connue plutôt que sur-ingénierer une reprise complète.

**Non traité, action manuelle recommandée** : une 4e cause possible (non confirmée par les données, aucun compte joueur n'existait en base pour vérifier) — la création de compte est "passwordless" et dépend à 100% d'un email Supabase Auth (`resetPasswordForEmail`) pour que l'utilisateur puisse se reconnecter plus tard. Si la délivrabilité de ce canal est aussi capricieuse que celle des invitations (le projet a déjà été flaggé par Supabase pour bounces), un sportif qui ne reçoit jamais cet email resterait bloqué au prochain login. Recommandation : configurer un **SMTP personnalisé** dans Supabase Dashboard → `Authentication → Settings → SMTP Settings` (réutiliser Resend une fois son domaine vérifié) pour sortir du SMTP partagé par défaut.

**Isolation analytics (action manuelle, dashboard PostHog)** : comme pour le trafic "programme claimé", ajouter le filtre personne `onboarding_source is_not "coach_invite"` aux funnels existants (4403213/4403222/4745753/4745754) une fois déployé, sinon ce nouveau trafic (qui ne passe jamais par `frustration_2a`/`profile_recap`/`paywall_*`) gonfle artificiellement leur taux de chute après "Rôle".

**LIVRÉ 2026-07-28** — vérifié par `tsc --noEmit` + `npm run build`, commité (`5f083c5`) et déployé en prod (push `main`, Vercel auto-deploy), testé par Gildas directement en prod et confirmé fonctionnel.

## Base de données (Supabase)
- `sessions` : RLS activée, `target_difficulty INTEGER` ajouté manuellement
- `wellness_daily` : unique sur `(user_id, date)`, upsert via `onConflict`
- `profiles` : créé automatiquement via trigger à l'inscription
- `push_subscriptions` : RLS `auth.uid() = user_id`, unique sur `endpoint` (voir section Notifications push)

## Flow auth / reset password
1. Magic link → `/auth/callback` → `/today`
2. Reset password → `/auth/callback?type=recovery` → `/reset-password`
3. Nouveau mot de passe → `supabase.auth.updateUser({ password })` → `/today`

### Inscription sans mot de passe — LIVRÉ (2026-07-13)
L'étape `account` de l'onboarding ne demande plus de mot de passe (prénom + email uniquement, en plus du bouton Google). Dans `handleFinish()` (`OnboardingFlow.tsx`), `supabase.auth.signUp()` reçoit un mot de passe généré aléatoirement (`crypto.randomUUID() + crypto.randomUUID()`, jamais vu par l'utilisateur), puis un `supabase.auth.resetPasswordForEmail(email, { redirectTo: ".../auth/callback?type=recovery&first=1" })` est déclenché en tâche de fond (non bloquant, `.catch(() => {})`) juste après la création du compte, pour envoyer l'email "crée ton mot de passe" — réutilise tel quel le pipeline reset-password existant. Le flag `first=1` est forwardé par `auth/callback/route.ts` jusqu'à `/reset-password` pour adapter le wording ("Crée ton mot de passe" au lieu de "Nouveau mot de passe"). Le flux Google (`handleGoogleRegister`) n'est pas concerné (Google reste la méthode de connexion pour ces comptes). Le login par lien magique (`signInWithOtp`, déjà sur `/login`) reste un filet de sécurité si l'utilisateur ne clique jamais sur l'email.

Déployé en prod le 2026-07-13 (commit `3df6a0e`, push direct sur `main`).

**Templates email Supabase restylés** (dashboard, hors repo) : les templates "Magic Link" et "Reset Password" (`Authentication → Email Templates` sur le dashboard Supabase, projet `levplovrwwsqvswmolik`) ont été remplacés par du HTML brandé ThePerfClub (logo `icon-192.png` via `go.theperfclub.com`, gradient bouton `linear-gradient(180deg,#f04a08,#d44000)`, radius 30px — mêmes constantes que le reste de l'app), à la place du template générique Supabase. Sources HTML (table-based, inline styles, sans base64) laissées sur le Bureau : `supabase_email_magic_link.html` / `supabase_email_reset_password.html`. Le template "Reset Password" sert maintenant deux cas (mot de passe oublié classique + création du premier mot de passe), wording volontairement neutre pour couvrir les deux.
