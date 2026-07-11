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

## Onboarding — flows actuels (2026-07-11)

Refonte complète en 5 chantiers le 2026-07-11 : suppression du tour produit (remplacé par un écran de célébration plein-page), personnalisation réelle du `PROGRAM_PATH` via le wellness, refonte visuelle plein-page (plus de carte flottante/modale), et ajout d'interstitiels type BetterMe (`concept_autoreg`, `profile_recap`) dans tous les flows. Détail complet et historique dans la mémoire Claude (`project_onboarding_celebration_screen.md`, `project_product_tour_paywall.md`) et le plan `/Users/Gildas/.claude/plans/je-vourdais-am-liorer-mes-rosy-ritchie.md`.

### Sportif — flux classique
```
role → value_slides (3 slides stats)
→ frustration_2a → overload_2a → planning_2a → fatigue_2a (pain points, auto-advance)
→ autoreg_score  [dark card : score % + 3 jauges animées — le diagnostic vient d'abord]
→ concept_autoreg (slide dark, graphique SVG comparatif "Avec ThePerfClub" vs "Programme rigide" — la solution ensuite)
→ sport_2a → level_2a → goal_2a → days_2a
→ profile_recap (phrase humaine + icône sport, "On a bien compris")
→ week_preview_2a (programme preview)
→ wellness_q (5 questions niveau de forme)
→ account (email + mdp + prénom)
→ celebration (recap profil + score wellness + upgrade pitch, CTA ouvre PaywallModal directement)
[après compte créé, PLUS de redirect immédiat : on reste sur /register, stepIdx passe à "celebration"]
→ succès/dismiss du paywall → redirect /today
```

### Sportif — flux programme (PROGRAM_ATHLETE_PATH)
Activé si `claim_program_id` en localStorage (user venant d'une page WP via `?claim=[id]`).
```
role → value_program (1 slide, explique pourquoi le wellness personnalise le programme)
→ sport_2a → goal_2a
→ concept_autoreg → wellness_q → profile_recap
→ account → celebration
[après compte créé :]
→ claim programme → assign user_id + start_date = prochain lundi + wellnessAdjustment
  (ajustement de target_difficulty semaine 1 basé sur computeWellnessScore, clampé 1-10)
```
Pas de `week_preview_2a` dans ce path (l'user a déjà vu le programme sur la page WP).

### Coach — flux classique
```
role → value_slides (3 slides stats)
→ challenge_2b → overload_2b → planning_time_2b → fatigue_2b (pain points, auto-advance)
→ autoreg_score_coach  [dark card : score % + 3 jauges animées — le diagnostic vient d'abord]
→ concept_autoreg (la solution ensuite)
→ sport_2a → level_2a → goal_2a → days_2a  ← wording adapté "de tes sportifs"
→ profile_recap → week_preview_2b (= WeekPreviewStep, preview du programme généré)
→ account → celebration
[après compte créé → saveData() :]
  - crée 5 sportifs démo (Thomas M., Emma L., Pierre D., Sofia R., Lucas B.)
  - buildProgramTemplate(sport, level, days) → insère programme 4 semaines en DB
  - assigne le programme au premier sportif démo (Thomas M.) dès prochain lundi
  - localStorage.setItem("program_start_date", nextMonday)
```

### Coach — flux programme (PROGRAM_COACH_PATH)
Activé si `claim_program_id` en localStorage ET role=coach. Gagne `sport_2a`/`goal_2a` (2026-07-11, pour que `profile_recap` ait une vraie phrase à construire côté coach aussi — pas de niveau/jours, parcours reste plus court que le classique).
```
role → value_program_coach → sport_2a → goal_2a → concept_autoreg → profile_recap → account → celebration
[après compte créé :]
→ claim programme → assign athlete_id (premier sportif démo) + start_date = prochain lundi
→ localStorage.setItem("program_start_date", nextMonday)
```

### Auth mode (déjà connecté)
```
role → questions selon rôle → saveData() → transition vers "celebration" (plus de redirect direct)
```

### Écran de célébration (remplace l'ancien tour produit + PrimingJourneyModal en fin de flow)
- Composant `src/components/onboarding/CelebrationScreen.tsx`, dernier step de tous les paths.
- Recap chips-free (sport/niveau/objectif si collectés dans le path courant via `path.includes(...)`), score wellness animé si `wellness_q` fait partie du path, aperçus statiques des écrans clés, pitch upgrade (`getPrimingHeadline()`/`COACH_AUTOREG_HEADLINE` + `UNLIMITED_BULLET` de `primingCopy.ts`).
- CTA unique → ouvre `PaywallModal` directement dans `OnboardingFlow.tsx` (pas de redirect intermédiaire). `onSuccess`/dismiss redirige enfin vers `/today` ou `/coach`.
- **`ProductTourOverlay.tsx` et `WelcomeReveal.tsx` ont été supprimés** — ne pas les recréer, ni chercher `?welcome=1` (plumbing retirée de `TodayClient.tsx`/`CoachClient.tsx`).
- **`PrimingJourneyModal.tsx` existe toujours** et reste utilisé par `usePaywall` dans les 5 pages client (`TodayClient`/`WeekClient`/`CoachClient`/`CoachPlanningClient`/`AthletesClient`) pour le gating in-app free/expired — ne pas le confondre avec `PrimingModal.tsx` (celui-là est mort, zéro import).

### Verrouillage premium (🔒) — permanent, plus lié au tour
- `.tour-lock` (span 🔒 sur les CTAs premium) et le bloc CSS `body.tour-active` (bannière d'activation, opacité boutons) ont été renommés en `.locked`, posé sur le wrapper de `src/app/(app)/layout.tsx` selon l'état réel d'abonnement (`!isActive`), plus lié à une session de tour éphémère.
- `usePaywall.requireSubscription()` n'a plus de check `tour-active`.

### Logique de conversion
- **Step role** : aucune carte présélectionnée (`roleChosen` state), clic = `nextAfterChoice` → avance direct, pas de bouton "Continuer" (tous funnels)
- **Value slides** : 3 slides dark photo avec stats (68% / 3× / −35%)
- **Pain points** : 3 questions par rôle, auto-advance 300ms (register mode uniquement)
- **Score d'autorégulation** : dark card juste après les pain points (diagnostic d'abord), score % + 3 jauges animées
- **concept_autoreg** : vient après le score (la solution ThePerfClub, pas avant) — slide dark avec `ProgressComparisonChart` (SVG, 2 courbes animées) — "Avec ThePerfClub" nettement supérieure, "Programme rigide" progresse quand même mais moins (pas un plateau plat)
- **profile_recap** : composant `ProfileRecapStep` (extrait, pas une IIFE inline — nécessaire pour `useState`/`useEffect`) — phrase humaine (pas de tags/chips) toujours visible immédiatement avec mots-clés en accent couleur inline + icône sport en grand format, puis juste en dessous un loader "Génération de ton programme…" (~1.4s, pulsing dots) qui se transforme en CTA ("Voir mon programme →" si un `week_preview_*` suit dans le path, sinon "Continuer →") — augmente la qualité perçue sans retarder l'affichage du recap lui-même
- **Paywall personnalisé** : headline via `src/lib/primingCopy.ts`
  - Sportif : 16 headlines (frustration × objectif)
  - Coach : basé sur `coachingChallenge` uniquement (4 variantes) + `COACH_AUTOREG_HEADLINE` pour la célébration
- **CTA sticky partout (2026-07-11)** : sur tous les steps, le(s) bouton(s) restent visibles en bas de viewport même si le contenu dépasse l'écran.
  - Pattern clair (steps question/formulaire, composant `Actions` réutilisé par sport_2a/level_2a/goal_2a/days_2a/account/profile_recap) : `position:sticky; bottom:0; margin:16px -20px -56px; padding:14px 20px 24px; background:linear-gradient(180deg,rgba(241,240,238,0) 0%,rgba(241,240,238,.88) 30%,#f1f0ee 55%)`. Bouton retour minimisé en icône carrée 52×52 (`←`), le CTA principal (`flex:1`, height 52) prend le reste de la largeur.
  - Pattern dark (steps value_slides/autoreg_score(_coach)/concept_autoreg/value_program(_coach)/celebration) : même structure, gradient `rgba(17,17,17,0)`→`#161616`. Le lien "Retour" y est un texte discret (`rgba(255,255,255,.45)`), pas un bouton icône — ces steps n'ont qu'un seul CTA pleine largeur au-dessus.
  - Cards `Choice` (et cards custom du step role) : padding remonté à `18px 16px` (`24px 16px` pour role) pour des cards plus hautes, plus faciles à taper au doigt.
- **`coachingContext` supprimé** — remplacé par sport+goal dans tous les composants

### Wording selon rôle (sport_2a / level_2a / goal_2a / days_2a)
| Step | Sportif | Coach |
|---|---|---|
| sport_2a | "Ton sport principal ?" | "Le sport de tes sportifs ?" |
| level_2a | "Ton niveau actuel ?" | "Niveau de tes sportifs ?" |
| goal_2a | "Ton objectif principal ?" | "L'objectif de tes sportifs ?" |
| days_2a | "Quels sont tes jours d'entraînement ?" | "Créons un premier programme" |

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
  | "account"
  | "celebration"                                                           // POST_PROGRESS, DARK_STEPS — dernier step de tous les paths
  | "value_program" | "value_program_coach"                                 // POST_PROGRESS, DARK_STEPS — PROGRAM_PATH uniquement
  | "concept_autoreg"                                                        // POST_PROGRESS, DARK_STEPS
  | "profile_recap";                                                        // POST_PROGRESS (light, pas dans DARK_STEPS)
```

`POST_PROGRESS` = `["value_slides", "wellness_q", "autoreg_score", "autoreg_score_coach", "celebration", "value_program", "value_program_coach", "concept_autoreg", "profile_recap"]`
`DARK_STEPS` (fond `OnboardingBackground variant="dark"`) = `["value_slides", "value_program", "value_program_coach", "autoreg_score", "autoreg_score_coach", "celebration", "concept_autoreg"]` — tout le reste (questions/formulaire) est en `variant="light"` (`#f1f0ee`).

Note : `context_2b`, `sport_2b`, `count_2b`, `tool_2b` sont dans le type StepId mais hors de tout path actif (dead code conservé pour compatibilité auth mode).

## Composants clés
```
src/components/
  onboarding/
    OnboardingFlow.tsx          # Flow complet sportif + coach (register + auth mode)
    OnboardingBackground.tsx    # Fond plein-page dark/light selon step (remplace AuthBackground pour l'onboarding)
    CelebrationScreen.tsx       # Dernier step de tous les paths — recap + upgrade pitch, ouvre PaywallModal
    AutoRegScoreStep.tsx        # Score autorégulation sportif (dark card, 3 jauges, score %)
    AutoRegScoreStepCoach.tsx   # Score autorégulation coach (même mécanique)
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
  PaywallModal.tsx         # Formulaire CB Stripe (simplifié : pas de toggle, pas de bullet points)
  PrimingJourneyModal.tsx  # Écran priming (value/social proof → rappel essai → timeline + plan cards) — utilisé par usePaywall dans l'app ET par CelebrationScreen en fin d'onboarding
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

## Base de données (Supabase)
- `sessions` : RLS activée, `target_difficulty INTEGER` ajouté manuellement
- `wellness_daily` : unique sur `(user_id, date)`, upsert via `onConflict`
- `profiles` : créé automatiquement via trigger à l'inscription

## Flow auth / reset password
1. Magic link → `/auth/callback` → `/today`
2. Reset password → `/auth/callback?type=recovery` → `/reset-password`
3. Nouveau mot de passe → `supabase.auth.updateUser({ password })` → `/today`
