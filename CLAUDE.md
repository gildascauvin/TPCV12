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

## Onboarding — flows actuels (2026-07-12)

Refonte tour→célébration livrée le 2026-07-11 (5 chantiers), puis convergence des 4 funnels + repositionnement de l'activation le 2026-07-12 : les paths `PROGRAM_*` gagnent le diagnostic complet (pain points + score d'autorégulation) qu'ils n'avaient jamais eu, `wellness_q` (sportif) et la nouvelle étape `invite_team` (coach) se déplacent entre `account` et `celebration` sur les 4 paths (au lieu d'avant `account` pour `wellness_q`, absent pour le coach), et `profile_recap` référence le programme claimé par son nom réel quand disponible. Détail complet et historique dans la mémoire Claude (`project_onboarding_celebration_screen.md`, `project_product_tour_paywall.md`, `project_analytics.md`) et le plan `/Users/Gildas/.claude/plans/je-vourdais-am-liorer-mes-rosy-ritchie.md`.

### Sportif — flux classique
```
role → value_slides (3 slides stats)
→ frustration_2a → overload_2a → planning_2a → fatigue_2a (pain points, auto-advance)
→ autoreg_score  [dark card : score % + 3 jauges animées — le diagnostic vient d'abord]
→ concept_autoreg (slide dark, graphique SVG comparatif "Avec ThePerfClub" vs "Programme rigide" — la solution ensuite)
→ sport_2a → level_2a → goal_2a → days_2a
→ profile_recap (phrase humaine + icône sport + carte persona, "Ton profil d'entraînement")
→ week_preview_2a (programme preview)
→ account (email + mdp + prénom — création du compte, saveData() SANS le wellness_daily ni claim/assign)
→ wellness_q (5 questions niveau de forme — après le compte, juste avant la célébration)
→ celebration (recap profil + score wellness + upgrade pitch, CTA ouvre PaywallModal directement)
→ succès/dismiss du paywall → redirect /today
```

### Sportif — flux programme (PROGRAM_ATHLETE_PATH)
Activé si `claim_program_id` en localStorage (user venant d'une page WP via `?claim=[id]`). Depuis 2026-07-12, gagne le diagnostic complet et perd `sport_2a`/`goal_2a`/`level_2a`/`days_2a` (déduits automatiquement du programme claimé).
```
role → value_program (1 slide, transition iframe WP → onboarding)
→ frustration_2a → overload_2a → planning_2a → fatigue_2a (pain points, [NOUVEAU 2026-07-12])
→ autoreg_score [NOUVEAU]
→ concept_autoreg
→ profile_recap (nom réel du programme claimé + niveau — via GET /api/programs/[id], sport/level/name/weeks_count)
→ account → wellness_q → celebration
[claim+assign exécutés à la FIN de wellness_q, pas à la création du compte — voir finishAthleteActivation]
→ claim programme → assign user_id + start_date = prochain lundi + wellnessAdjustment
  (ajustement de target_difficulty semaine 1 basé sur computeWellnessScore, clampé 1-10)
```
Pas de `week_preview_2a` dans ce path (l'user a déjà vu le programme sur la page WP).

### Coach — flux classique
```
role → value_slides (3 slides stats)
→ challenge_2b → overload_2b → planning_time_2b → fatigue_2b (pain points, auto-advance)
→ autoreg_score_coach  [dark card : score % + 3 jauges animées — le diagnostic vient d'abord]
→ concept_autoreg (donut CoachBlindSpotWheel — la solution ensuite)
→ sport_2a → level_2a → goal_2a → days_2a  ← wording adapté "de tes sportifs"
→ profile_recap → week_preview_2b (= WeekPreviewStep, preview du programme généré)
→ account (création du compte + saveData() + finishCoachClaim si claim — voir plus bas)
→ invite_team (lien d'invitation + email, skippable — [NOUVEAU 2026-07-12])
→ celebration
[après compte créé → saveData() :]
  - crée 5 sportifs démo (Thomas M., Emma L., Pierre D., Sofia R., Lucas B.)
  - buildProgramTemplate(sport, level, days) → insère programme 4 semaines en DB, assigne à Thomas M.
  - localStorage.setItem("program_start_date", nextMonday)
```

### Coach — flux programme (PROGRAM_COACH_PATH)
Activé si `claim_program_id` en localStorage ET role=coach. Depuis 2026-07-12, gagne le diagnostic complet (comme le sportif) et perd `sport_2a`/`goal_2a` (déduits du programme claimé) — l'ajout `sport_2a`/`goal_2a` du 2026-07-11 est donc de nouveau retiré, remplacé par la déduction automatique.
```
role → value_program_coach
→ challenge_2b → overload_2b → planning_time_2b → fatigue_2b (pain points, [NOUVEAU 2026-07-12])
→ autoreg_score_coach [NOUVEAU]
→ concept_autoreg → profile_recap (nom réel du programme claimé)
→ account (saveData() + finishCoachClaim(uid) — claim/assign immédiat, ne dépend pas du wellness)
→ invite_team [NOUVEAU]
→ celebration
```

### Étape `invite_team` (coach, nouveau 2026-07-12)
Adaptée de `InviteModal.tsx` (`src/components/coach/InviteModal.tsx`) — lien d'invitation (`go.theperfclub.com/join/{code}` généré dans `saveData()`, capturé en state `inviteCode`) + copier + WhatsApp + formulaire email (`POST /api/invite/create`, ne envoie pas de vrai email — enregistre une invitation "pending" auto-liée à la prochaine inscription avec cet email). CTA "Continuer →" et lien "Passer →" tous les deux dans le même footer sticky, jamais bloquant, avance toujours vers `celebration`.
- **Rendu en carte flottante depuis le 2026-07-12** (pas plein-page) : `position:fixed; inset:0; zIndex:2147483100` + backdrop flou (`rgba(0,0,0,0.65)`, `backdropFilter:blur(16px)`) + carte blanche `borderRadius:30, padding:28, maxWidth:420, overflowY:auto` — même shell que `PaywallModal.tsx`/`WelcomeModal.tsx`. Décision : `celebration`/`invite_team` gagnent la sensation "produit réel" de la modale sans redirection vers `/today`/`/coach` réel (qui aurait exigé d'extraire ces steps hors du state machine `OnboardingFlow.tsx` — même complexité cross-page que le tour supprimé le 2026-07-11). `wellness_q` reste plein-page (vrai formulaire séquentiel, la modale n'apporte rien à une saisie).

### Auth mode (déjà connecté)
```
role → questions selon rôle → saveData() → transition vers "celebration" (plus de redirect direct)
```

### Scission `handleFinish()` en deux phases (2026-07-12)
Pour les paths sportif : submit `account` → `saveData()` (profil, PAS le wellness_daily, PAS le claim/assign) → avance à `wellness_q` (via `goToActivationStep()`) → à la fin de `wellness_q`, `finishAthleteActivation()` calcule le score, upsert `wellness_daily`, PUIS exécute claim+assign avec le vrai `wellnessAdjustment` → avance à `celebration`. Pour les paths coach : `saveData()` inchangée, `finishCoachClaim(uid)` (claim+assign, ne dépend pas du wellness) reste appelée immédiatement dans `handleFinish()`, `invite_team` est un step purement additif sans dépendance en aval.

### Garde anti-double-clic (`finishGuardRef`, 2026-07-12)
`handleWellnessQuestions()`/`finishAthleteActivation()` (dernier "Voir mon score →" sur `wellness_q`) et le bouton "Continuer"/"Passer" d'`invite_team` n'avaient à l'origine aucune protection contre un double-clic. Un double-clic déclenchait `finishAthleteActivation`/le handler `next()` deux fois en parallèle → double claim+assign (programmes clonés en double en DB) ET `stepIdx` qui dépasse `path.length` (`next()` utilise `isLast` calculé au moment du clic, pas une valeur live) → écran totalement blanc, sans CTA, sans moyen d'avancer. **Fix** : `finishGuardRef` (`useRef`, réinitialisé à chaque changement de `currentStep` dans le même effet que `advancingRef`), posé en entrée de `finishAthleteActivation` et des deux handlers d'`invite_team` — même principe que `advancingRef` déjà utilisé pour l'auto-advance des pain points. **Règle : tout handler qui déclenche une écriture DB non-idempotente (claim/assign, upsert avec side-effects) suivie d'un `next()` doit avoir cette garde.**

### `stepIdx` hors limites — filet de sécurité + 2e cause trouvée en prod (2026-07-12 soir)
Repéré via une investigation demandée par Gildas ("des inscrits qui vont pas jusqu'au bout") — pas un problème de config PostHog (funnels vérifiés corrects contre le code), mais un vrai bug applicatif confirmé sur des events réels : `onboarding_undefined_viewed` juste après `account_created`, c'est-à-dire `currentStep = path[stepIdx]` valant `undefined` → écran totalement blanc et irrécupérable (aucun bloc JSX ne matche `undefined`, donc pas de CTA/retour possible). Deux mesures :
1. **Filet de sécurité (`e18184d`)** : `currentStep`/`isLast` sont désormais dérivés d'un `stepIdx` clampé à `path.length - 1` avant toute lecture, avec un `useEffect([path.length, stepIdx])` qui corrige aussi le state `stepIdx` lui-même si besoin. N'empêche pas la cause de se produire, mais empêche l'écran blanc **quelle que soit l'origine** — dernier rempart pour tout futur cas non anticipé.
2. **Root cause identifiée pour le cas des comptes Google (`47bde10`)** : le `useEffect` qui finalise l'inscription via Google (`pendingData`+`userId`, deps `[]`) appelait `goToActivationStep()` directement depuis sa propre closure — figée au tout premier render, où `hasClaimedProgram` vaut encore `null` (sa résolution est asynchrone, dans un `useEffect` séparé qui se déclenche juste après le montage). Pour un user Google venant d'un programme claimé (`?claim=`), cette closure calculait donc l'index cible dans le mauvais `path` (classique, plus long) ; une fois les multiples appels réseau de l'init terminés (`getUser`, `saveData`, 2 `fetch`) et `goToActivationStep()` enfin exécuté, cet index dépassait la longueur du VRAI `path` (programme, plus court, une fois `hasClaimedProgram` réellement `true`). **Fix** : `goToActivationStep()` n'est plus appelé depuis la closure figée — un state `googleInitDone` déclenche un second `useEffect` séparé (deps `[googleInitDone]`), qui capture toujours un `path` à jour au moment où il s'exécute. **Règle : dans un `useEffect` à deps `[]` qui fait plusieurs `await` avant d'agir sur un state dérivé d'un autre state asynchrone (ici `hasClaimedProgram`), ne jamais appeler directement une fonction qui lit ce state dérivé depuis l'intérieur de la closure figée — déclencher via un state + un effect séparé pour garantir une closure fraîche.**
**Méthode utile pour ce genre d'investigation** : interroger les events PostHog réels directement (HogQL sur `events`, filtré sur les `distinct_id` ayant un `account_created` récent) plutôt que de se fier uniquement à la config visuelle des funnels — c'est cette requête qui a révélé le symptôme exact.

### Écran de célébration (remplace l'ancien tour produit + PrimingJourneyModal en fin de flow)
- Composant `src/components/onboarding/CelebrationScreen.tsx`, dernier step de tous les paths.
- **Rendu en carte flottante depuis le 2026-07-12** — même shell/raisonnement que `invite_team` ci-dessus (carte `#161616` en dégradé remplacé par un `background:"#161616"` solide, voir "Fix fond sticky" plus bas). Bonus : `celebration`-modale → `PaywallModal` (déjà une modale) devient une transition modale→modale cohérente au lieu du plein-page→modale d'avant.
- Recap chips-free (sport/niveau/objectif si collectés dans le path courant via `path.includes(...)`).
- **Score wellness (sportif)** : `<WellnessRing dark score={wScore} .../>` (composant `src/components/wellness/WellnessRing.tsx`, réutilisé depuis Today/Coach — nouveau prop `dark?: boolean` pour l'intégrer à la carte sombre) + un **tip personnalisé** (`wellnessTip`, calculé par `computeWellnessTip()` dans `OnboardingFlow.tsx` à la fin de `wellness_q`, à partir de `wSleep`/`wStress`/`wRecovery`/`score` — identifie la dimension la plus faible et donne un conseil dédié ; le cas `score < 45` est phrasé différemment selon `hasClaimedProgram` pour rester honnête, seul le programme claimé bénéficie réellement du `wellnessAdjustment`). Pas de réutilisation du moteur de corrélation `/conseils` — un compte neuf n'a pas l'historique J→J+1 nécessaire.
- **Capacité illimitée (coach)** : remplace le slot vide qu'avait le coach (pas de wellness) — `<WellnessRing dark infinite score={null} .../>` (nouveau mode `infinite` sur `WellnessRing`, ring plein vert + label "∞"/"ILLIMITÉ", ignore `score`) + texte `COACH_LIBRARY_PITCH` (`primingCopy.ts`) : "Choisis parmi 40+ programmes prêts à l'emploi, ou génère le tien sur-mesure en quelques clics" — nombre et wording vérifiés sur le code (`/api/programs/generate` n'est pas de l'IA, template instantané, pas "en 1 minute").
- **Programme claimé** : si `claimedProgramName` (state déjà existant, passé en prop), bloc dédié avec le nom réel + `claimedProgramWeeks`.
- **Aperçus statiques personnalisés au sport** : les items `"Ton programme {sport}, semaine par semaine"` (sportif) / `"Un programme {sport} prêt à assigner"` (coach) interpolent le sport de l'user (`getAthletePreviews(sport)`/`getCoachPreviews(sport)`, fonctions au lieu de constantes).
- Preuve sociale (avatars "+300 sportifs, coachs et clubs" + témoignage 5 étoiles, sportif/coach — `AVATARS`/`TESTIMONIALS` locaux), pitch upgrade (`getPrimingHeadline()`/`COACH_AUTOREG_HEADLINE` + `UNLIMITED_BULLET` de `primingCopy.ts`, `UNLIMITED_BULLET.coach` étendu pour mentionner aussi les programmes).
- **CTA unique** (plus de "Accéder sans abonnement →", voir "Paywall obligatoire" plus bas) → ouvre `PaywallModal` directement dans `OnboardingFlow.tsx` (pas de redirect intermédiaire). `onSuccess` redirige enfin vers `/today` ou `/coach`.
- **`ProductTourOverlay.tsx` et `WelcomeReveal.tsx` ont été supprimés** — ne pas les recréer, ni chercher `?welcome=1` (plumbing retirée de `TodayClient.tsx`/`CoachClient.tsx`).
- **`PrimingJourneyModal.tsx` existe toujours** et reste utilisé par `usePaywall` dans les 5 pages client (`TodayClient`/`WeekClient`/`CoachClient`/`CoachPlanningClient`/`AthletesClient`) pour le gating in-app free/expired — ne pas le confondre avec `PrimingModal.tsx` (celui-là est mort, zéro import). Son contenu N'EST PAS affiché dans le chemin onboarding (celebration ouvre `PaywallModal` directement).

### Paywall obligatoire à la fin de l'onboarding (2026-07-12)
Le paywall affiché juste après `celebration` ne peut plus être fermé ni contourné — décision explicite (nouveau compte = carte obligatoire pour accéder à l'app). **Scope : onboarding uniquement.** Le paywall in-app (`usePaywall`, essai/abonnement qui expire pour un user existant) garde son comportement actuel (rappel + fermeture possible selon `allowDismiss`/`hasCoach`).
- `handleSkipCelebration()` (bouton "Accéder sans abonnement →") et le prop `onSkip` de `CelebrationScreen` ont été supprimés.
- Call site onboarding de `<PaywallModal>` : `allowDismiss={false}`, pas de `onClose`.
- **Fix de faille dans `PaywallModal.tsx`** : le clic sur le fond (`backdrop click`) appelait `onClose?.()` sans vérifier `allowDismiss` (contrairement au "×" et à "← Retour", eux bien gated) — corrigé pour respecter `allowDismiss` partout, bénéficie à tous les appelants existants (comportement enfin cohérent avec l'intention `allowDismiss={false}` déjà utilisée sur les pages coach).
- **Limite assumée** : l'application reste 100% côté client (`requireSubscription()`), aucune vérification serveur/RLS sur `subscription_status`. Retirer les boutons de sortie UI empêche l'usage normal gratuit, pas un contournement technique délibéré — un verrou serveur serait un chantier séparé, plus large.

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
- **`src/components/onboarding/Actions.tsx`, variantes `light`/`dark` uniquement** : `position:"fixed", left:0, right:0, bottom:0, zIndex:20` (au lieu de `sticky`), avec un wrapper interne `maxWidth:560, margin:"0 auto"` qui reproduit le centrage de la colonne de contenu (`position:fixed` échappe à la largeur du parent, contrairement à `sticky`). Variantes `modal-light`/`modal-dark` (`invite_team`/`celebration`) **inchangées** — restent `sticky` au bas de leur carte, périmètre du bug explicitement pas concerné (une carte modale de taille variable n'est pas censée toucher le bas de l'écran, juste le bas de son propre contenu).
- **`OnboardingBackground.tsx`** : `padding-bottom` de la colonne de contenu remonté de `56` à `120` — nécessaire puisqu'un footer `fixed` se superpose désormais physiquement au contenu qui défile derrière lui (contrairement à `sticky` qui restait dans le flow normal quand il n'y avait pas de scroll), il faut donc réserver la place pour ne jamais masquer la fin du contenu.
- **`wellness_q`** (footer hand-roulé, pas migré vers `Actions` à cause de la navigation intra-wizard) : même traitement `position:fixed` + wrapper centré, pour rester cohérent.
- Vérifié qu'aucun ancêtre entre `Actions`/`wellness_q` et la racine n'a de `transform`/`filter`/`will-change` (aurait changé le point d'ancrage de `fixed`) — confirmé par grep, `OnboardingBackground` → `(auth)` → `layout.tsx` racine est une chaîne propre.
- Vérifié en direct (Chrome DevTools, service worker vidé — **piège recontré** : le fix ne semblait pas appliqué au premier test, c'était le service worker cache-first qui servait encore l'ancien bundle, cf. [[feedback-service-worker-cache]]) sur steps courts (`autoreg_score`, `autoreg_score_coach`) ET longs (`sport_2a`, `week_preview_2a`, `wellness_q`) : CTA toujours au ras du bas de l'écran, aucun contenu masqué derrière le footer sur les steps longs.

### Verrouillage premium (🔒) — permanent, plus lié au tour
- `.tour-lock` (span 🔒 sur les CTAs premium) et le bloc CSS `body.tour-active` (bannière d'activation, opacité boutons) ont été renommés en `.locked`, posé sur le wrapper de `src/app/(app)/layout.tsx` selon l'état réel d'abonnement (`!isActive`), plus lié à une session de tour éphémère.
- `usePaywall.requireSubscription()` n'a plus de check `tour-active`.

### Logique de conversion
- **Step role** : aucune carte présélectionnée (`roleChosen` state), clic = `nextAfterChoice` → avance direct, pas de bouton "Continuer" (tous funnels)
- **Value slides** : 3 slides dark photo avec stats (68% / 3× / −35%)
- **Pain points** : 3 questions par rôle, auto-advance 300ms (register mode uniquement)
- **Score d'autorégulation** : dark card juste après les pain points (diagnostic d'abord), score % + 3 jauges animées
- **concept_autoreg** : vient après le score (la solution ThePerfClub, pas avant) — slide dark avec illustration **conditionnelle au rôle** :
  - Sportif : `ProgressComparisonChart` (SVG, 2 courbes animées) — "Avec ThePerfClub" nettement supérieure, "Programme rigide" progresse quand même mais moins (pas un plateau plat)
  - Coach : `CoachBlindSpotWheel` (SVG, donut 6 segments) — un seul segment orange "Entraînement" (= ce que le coach voit) contre 5 segments gris muet "Énergie/Sommeil/Diet/Émotions/Stress" (= ce que l'athlète vit) — illustre le blind spot du coach sur la récupération réelle de ses sportifs, plus parlant qu'une courbe abstraite pour ce rôle
- **profile_recap** : composant `ProfileRecapStep` (extrait, pas une IIFE inline — nécessaire pour `useState`/`useEffect`) — titre **"Ton profil d'entraînement"** (pas "On a bien compris"), phrase humaine (pas de tags/chips) toujours visible immédiatement avec mots-clés en accent couleur inline + icône sport en grand format, puis **carte "profil comportemental"** (si le path inclut `autoreg_score`/`autoreg_score_coach` — absente en PROGRAM_PATH) : label "Ton profil d'autorégulation" + persona (titre + description, ex. "Battant instinctif", "Coach du volume") dérivé de la dimension la plus à risque parmi les 3 sous-indicateurs déjà calculés (`computeAthleteAutoregProfile`/`computeCoachAutoregProfile`, exportés depuis `AutoRegScoreStep.tsx`/`AutoRegScoreStepCoach.tsx`) + détail des 3 dimensions avec leur label de risque — remplace l'ancien badge "33% score d'autorégulation" (jugé trop plat, pas assez "profil"). Puis juste en dessous un loader "Génération de ton programme…" (~1.4s, pulsing dots) qui se transforme en CTA ("Voir mon programme →" si un `week_preview_*` suit dans le path, sinon "Continuer →") — augmente la qualité perçue sans retarder l'affichage du recap lui-même
- **Paywall personnalisé** : headline via `src/lib/primingCopy.ts`
  - Sportif : 16 headlines (frustration × objectif)
  - Coach : basé sur `coachingChallenge` uniquement (4 variantes) + `COACH_AUTOREG_HEADLINE` pour la célébration
- **CTA sticky partout (2026-07-11, boutons retour supprimés le 2026-07-13)** : sur tous les steps, le(s) bouton(s) restent visibles en bas de viewport même si le contenu dépasse l'écran. Composant partagé `src/components/onboarding/Actions.tsx` (`variant: "light"|"dark"|"modal-light"|"modal-dark"`, pas de prop `onBack` — voir section "Suppression des boutons retour" plus bas) : `position:sticky; bottom:0`, fond **opaque simple** selon variante (`light`→`#f1f0ee`, `dark`→transparent, `modal-light`→`#fff`, `modal-dark`→`#161616`), jamais de gradient. Le CTA principal prend toute la largeur, aucune icône retour.
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

### saveData() — ce qui est créé à l'inscription

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

**CTA sticky sur les 3 steps de `PrimingJourneyModal` + sur le formulaire Stripe de `PaywallModal`** (2026-07-12) : pattern modale (`margin:"16px -28px -28px"`, `padding:"14px 28px 20px"`, `position:"sticky", bottom:0`) — bleed jusqu'aux bords de padding de la carte (`padding:28`) puisque la carte a `overflowY:auto` (contenu qui peut scroller, notamment le formulaire Stripe avec `PaymentElement`). **Diffère de la règle 4 ci-dessous** (`margin-bottom:0` au lieu de `-28px`) — ces valeurs sont les bonnes pour ce cas précis (carte scrollable), la règle 4 documente un pattern plus ancien/simplifié à ne pas suivre à la lettre ici. **Fond : `"#fff"` opaque simple** (pas de gradient — un `linear-gradient(...,#fff 38%)` a été essayé puis retiré le même jour, voir section "Fix fond sticky des modales" plus haut : le stop en pourcentage laissait le texte du haut du bloc partiellement transparent sur les cartes à contenu haut/variable).

### Sport "Autre" — précision
Si l'user sélectionne "Autre" dans `sport_2a`, un champ texte s'affiche.
Sauvegardé comme `"Autre - {précision}"` dans `profiles.sport`.
Placeholder coach : "Précise le sport de tes sportifs".

### Wellness athlète — mécanique
- Les 5 questions (`wellness_q`) collectent sleep+bedtime, stress, recovery, behaviors, motivation
- Score calculé en state via `computeWellnessScore()` à la fin de `wellness_q`
- Sauvegarde dans `handleFinish()` via upsert sur `wellness_daily`

### StepIds complets
```typescript
type StepId =
  | "role"
  | "value_slides"                                                           // POST_PROGRESS, DARK_STEPS
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"   // sportif ET coach
  | "overload_2a" | "planning_2a" | "fatigue_2a"                           // pain points sportif
  | "autoreg_score"                                                          // POST_PROGRESS, DARK_STEPS
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"   // coach (dead code — hors paths)
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"                      // pain points coach
  | "autoreg_score_coach"                                                    // POST_PROGRESS, DARK_STEPS
  | "week_preview_2a" | "week_preview_2b"                                   // preview programme
  | "wellness_q"                                                             // POST_PROGRESS
  | "wellness_reveal"                                                        // POST_PROGRESS, DARK_STEPS — sportif uniquement, entre wellness_q et celebration
  | "account"
  | "celebration"                                                           // POST_PROGRESS, DARK_STEPS — dernier step de tous les paths
  | "value_program" | "value_program_coach"                                 // POST_PROGRESS, DARK_STEPS — PROGRAM_PATH uniquement
  | "concept_autoreg"                                                        // POST_PROGRESS, DARK_STEPS
  | "profile_recap"                                                         // POST_PROGRESS (light, pas dans DARK_STEPS)
  | "invite_team";                                                          // POST_PROGRESS (light) — coach uniquement, entre account et celebration
```

`POST_PROGRESS` = `["value_slides", "wellness_q", "wellness_reveal", "autoreg_score", "autoreg_score_coach", "celebration", "value_program", "value_program_coach", "concept_autoreg", "profile_recap", "invite_team"]`
`DARK_STEPS` (fond `OnboardingBackground variant="dark"`) = `["value_slides", "value_program", "value_program_coach", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg", "wellness_reveal"]` — tout le reste (questions/formulaire, y compris `invite_team`) est en `variant="light"` (`#f1f0ee`).

Note : `context_2b`, `sport_2b`, `count_2b`, `tool_2b` sont dans le type StepId mais hors de tout path actif (dead code conservé pour compatibilité auth mode).

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

## Règles de développement
1. **Une seule jauge par carte de séance** — RPE si terminée, target_difficulty si planifiée. Pas de label.
2. **Exercices sans numéros** — liste séparée par `\n` dans `notes`, affichage brut.
3. **Comportements wellness** — les clés DB (`alcohol`, `screen_late`…) doivent être traduits via `BEHAVIOR_LABELS` avant affichage.
4. **Sticky actions bar dans les modales** : `position:sticky; bottom:0; margin:16px -28px 0; padding:14px 28px 20px; background:linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)`
5. **Pages serveur** pour le fetch initial, **Client components** pour l'interactivité.
6. **Pas de commentaires** sauf si le WHY est non-évident.
7. **Service worker (`public/sw.js`) cache-first** : en dev local, le navigateur peut servir un bundle JS obsolète malgré un restart complet de `npm run dev`. Avant toute vérification visuelle après un changement de code, désenregistrer le SW + vider les caches dans la console du navigateur : `(async()=>{const r=await navigator.serviceWorker.getRegistrations();for(const x of r)await x.unregister();const k=await caches.keys();for(const x of k)await caches.delete(x);})()`, puis recharger.

## Notifications push (2026-07-13)

Chantier lancé après évaluation d'opportunité (l'app est déjà une PWA fonctionnelle — manifest, service worker, meta tags iOS — et `web-push`/VAPID étaient déjà scaffoldés sans être branchés). Objectif prioritaire : relancer par push les comptes créés qui n'ont pas démarré leur essai (paywall obligatoire non passé), en captant la permission le plus tôt possible dans le funnel — avant l'abandon potentiel au paywall.

- **Nouveau step `wellness_reveal`** (sportif uniquement, entre `wellness_q` et `celebration` sur `ATHLETE_PATH`/`PROGRAM_ATHLETE_PATH`, ajouté à `POST_PROGRESS`/`DARK_STEPS`) : reprend le style de la carte "Score & conseils" de `/today` (zone wellness via `zoneLabel()`, insight via `getContextualInsight()`, pill "Autorégulation active", conseils Entraînement/Récupération via `getAdvice()` — fonctions extraites de `TodayClient.tsx` vers `src/lib/wellness.ts` pour être réutilisées ici sans dupliquer la logique). Affiche la date de la prochaine séance (`nextSessionDayLabel()`, dérivé de `training_days` + `nextDateForDow`) et demande la permission notification : **"🔔 Oui, me prévenir"** (CTA principal) / **"Passer"** (secondaire) — clic sur l'un ou l'autre avance vers `celebration`. `celebration` n'a pas été modifiée (bloc wellness existant conservé, décision explicite de ne pas alléger pour l'instant).
- **`invite_team` (coach)** : le simple lien "Passer" est remplacé par un choix explicite quand le coach ne veut pas inviter tout de suite — **"🔔 Plus tard — me le rappeler"** vs **"Passer"** (pas de rappel). Implémenté en JSX custom (pas via `Actions.tsx`, pour garder le composant partagé simple) dans le même style que le footer modal-light existant.
- **Limite iOS** : `src/lib/push.ts` expose `needsInstallForPush()` (iOS Safari + non-standalone) — sur ces deux écrans, le bouton de permission est remplacé par un nudge "📲 Ajoute à l'écran d'accueil" et l'appel à `subscribeToPush()` est skip (no-op silencieux, jamais bloquant).
- **Infra** : table `push_subscriptions` (migration `008_push_subscriptions.sql`, RLS `auth.uid() = user_id`, colonne `reminder_type` conservée en base mais plus utilisée par la logique d'envoi — segmentation basée sur `profiles.mode`/`subscription_status` à la place), `src/lib/push.ts` (`subscribeToPush()`/`unsubscribeFromPush()`/`isSubscribedToPush()`, détection iOS/standalone), `POST`/`DELETE /api/push/subscribe` (auth cookie), `GET|POST /api/push/send?job=session|winback` (protégé par `CRON_SECRET`).
- **Toggle notifications dans `/profil`** (`src/components/profile/NotificationToggle.tsx`, les deux rôles) : ON/OFF simple par appareil (pas par compte), permet de tester l'activation sans repasser par l'onboarding. Vérifie `Notification.permission` + abonnement `pushManager` actif au montage ; toggle ON = `subscribeToPush()`, toggle OFF = `unsubscribeFromPush()` (désabonne le navigateur + supprime la ligne DB).
- **Cron Vercel (plan Hobby confirmé)** : 2 jobs distincts dans `vercel.json` (Hobby limite à des crons quotidiens, pas horaires) — `job=session` à `0 8 * * *` UTC (9h Paris hiver), `job=winback` à `0 19 * * *` UTC (20h Paris hiver). **Horaires en UTC fixe, pas de gestion DST** : en heure d'été (CEST, UTC+2) ça glisse à 10h/21h locaux — accepté comme approximation, pas critique pour ce type de notif.
- **Segmentation par statut d'abonnement (pas par écran d'opt-in d'origine)**, décidée par Gildas après un premier design qui ne distinguait pas assez les cas :
  - `job=session` (9h) → sportifs uniquement (`profiles.mode = "athlete"`) : si `subscription_status = "free"`, rappel séance du jour si non terminée (`runSessionJob`) ; si payant (`subscription_status = "athlete"`), rappel de remplir le wellness du jour si absent de `wellness_daily` — notification différente, but rétention pas conversion.
  - `job=winback` (20h) → coachs gratuits uniquement (`profiles.mode = "coach"` ET `subscription_status = "free"`) : relance "Tes sportifs t'attendent" vers `/coach` (`runWinbackJob`). Le sportif gratuit n'a plus de winback séparé — le rappel séance du matin sert déjà cet objectif de conversion pour ce rôle.
  - Dédup winback inchangée : compteur `profiles.winback_push_count` (max 3 touches, espacées d'au moins 18h via `last_winback_push_at`).
  - **Décision explicite** : pas de contournement du paywall pour la relance coach — `/coach` affiche déjà le bouton "Inviter des sportifs" au premier plan, le clic déclenche `requireSubscription` normalement, cohérent avec le gating existant.
- **`public/sw.js`** : handlers `push`/`notificationclick` déjà présents, jamais branchés jusqu'ici. Un seul fix apporté : `event.data?.json() ?? {}` ne rattrape pas une exception (seulement `null`/`undefined`) — si le payload ne parse pas, `event.waitUntil()` n'est jamais appelé et rien ne s'affiche, silencieusement. Remplacé par un vrai `try/catch`.
- **Bug préexistant corrigé en chemin, sans rapport avec ce chantier** : `src/middleware.ts` — le matcher n'excluait pas `sw.js`/`manifest.webmanifest`, donc `updateSession` redirigeait ces fichiers vers `/login` pour tout visiteur non authentifié (`SecurityError: script resource is behind a redirect` à l'enregistrement du service worker). Corrigé en les ajoutant à l'exclusion du matcher, même endroit que `_next/static`/favicon/images.
- **Vérification bout-en-bout tentée en local, non concluante** : abonnement réel créé, FCM répond systématiquement 201 (accepté), mais aucune notification n'apparaît sur macOS malgré permissions/réglages vérifiés (macOS notif Chrome, style d'alerte, `chrome://settings/content/notifications`) et un test de démo externe (gauntface.com) qui fonctionne sur la même machine — donc pas un blocage réseau/OS général. Clés VAPID vérifiées cryptographiquement correctes (dérivation de la clé publique depuis la privée = clé stockée). Cause probable : fiabilité connue de la livraison push sur `http://localhost`, à re-tester une fois en prod sur `go.theperfclub.com` (HTTPS réel).
- Plan complet : `/Users/Gildas/.claude/plans/evalue-l-opportunit-de-mettre-fuzzy-fiddle.md`.

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
