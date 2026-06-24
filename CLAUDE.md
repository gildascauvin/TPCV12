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

## Onboarding — flows actuels (juin 2026)

### Sportif (inscription — 14 écrans dans OnboardingFlow, puis tour+paywall dans l'app)
```
role → value_slides (3 slides stats)
→ frustration_2a → overload_2a → planning_2a → fatigue_2a (pain points, auto-advance)
→ autoreg_score  [dark card : score % + 3 jauges animées]
→ sport_2a → level_2a → goal_2a → days_2a
→ week_preview_2a (programme preview)
→ wellness_q (5 questions niveau de forme)
→ account (email + mdp + prénom)
[après compte créé → redirect /today → ProductTourOverlay :]
→ tour 3 steps (pages /today /week /conseils, bottom sheet)
→ PrimingJourneyModal (priming value + notif + pricing)
→ PaywallModal (formulaire CB Stripe)
```

### Coach (inscription — 13 écrans dans OnboardingFlow, puis tour+paywall dans l'app)
```
role → value_slides (3 slides stats)
→ challenge_2b → overload_2b → planning_time_2b → fatigue_2b (pain points, auto-advance)
→ autoreg_score_coach  [dark card : score % + 3 jauges animées]
→ context_2b → sport_2b → count_2b → tool_2b
→ week_preview_2b (programme preview coach)
→ account
[après compte créé → redirect /coach → ProductTourOverlay :]
→ tour 3 steps (pages /coach /coach/planning /coach/athletes)
→ PrimingJourneyModal → PaywallModal
```

### Auth mode (déjà connecté — 6 écrans, inchangé)
```
role → 5 questions rôle → saveData() → redirect /today ou /coach
```

### Logique de conversion
- **Value slides** : 3 slides dark photo avec stats (68% / 3× / −35%)
- **Pain points** : 3 questions par rôle, auto-advance 300ms (register mode uniquement)
- **Score d'autorégulation** (`autoreg_score` / `autoreg_score_coach`) : dark card après les pain points, score global en %, 3 jauges (pleine=vert=bien, vide=rouge=risque). Animation : "Analyse du profil..." 1,5s puis barres une par une + message-pont
- **Paywall personnalisé** : `PrimingJourneyModal` titre dynamique via `src/lib/primingCopy.ts` (16 headlines sportif frustration×objectif, 4-5 variantes coach contexte×challenge)
- **Tour personnalisé** : `ProductTourOverlay` steps dynamiques selon objectif/sport (sportif) et contexte/challenge (coach)
- **"niveau de forme"** dans tous les textes UI (jamais "wellness" côté visible utilisateur)
- **Trial 7j** sur plan annuel ; plan mensuel = "Sans engagement"

### Paywall flow dans l'app (post-skip)
Quand un user free/expired déclenche une action gateée :
1. `PrimingModal` s'affiche (timeline + plan cards, même design que `recap_5`)
2. CTA → `PaywallModal` (formulaire CB)
3. "← Retour" dans le formulaire → revient à `PrimingModal` pour changer de plan
4. "Accéder sans abonnement →" → ferme (24h cooldown localStorage)

Composants : `usePaywall` hook → `PrimingModal` → `PaywallModal`
Pages concernées : `TodayClient`, `WeekClient`, `AthletesClient`, `CoachPlanningClient`

### Profils de coaching (`context_2b`)
- Coach (individuel ou en groupe)
- Préparateur physique (individuel ou collectif)
- Kiné ou professionnel de la réhabilitation
- Autre (coach wellness, nutritionniste…)

### Sport "Autre" — précision
Si l'user sélectionne "Autre" dans `sport_2a` ou `sport_2b`, un champ texte s'affiche.
Sauvegardé en DB comme `"Autre - {précision}"` dans le champ `sport` du profil.

### Wellness athlète — mécanique (inchangée)
- Les 5 questions (`wellness_q`) collectent sleep+bedtime, stress, recovery, behaviors, motivation
- Le score est calculé en state via `computeWellnessScore()` à la fin de `wellness_q`
- La sauvegarde DB se fait dans `handleFinish()` après création du compte, via upsert sur `wellness_daily`

### StepIds complets
```typescript
type StepId =
  | "role"
  | "value_slides"                                                             // 3 slides stats (POST_PROGRESS)
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "days_2a"     // sportif
  | "overload_2a" | "planning_2a" | "fatigue_2a"                             // pain points sportif
  | "autoreg_score"                                                            // score autorégulation sportif (POST_PROGRESS)
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"     // coach
  | "overload_2b" | "planning_time_2b" | "fatigue_2b"                        // pain points coach
  | "autoreg_score_coach"                                                      // score autorégulation coach (POST_PROGRESS)
  | "week_preview_2a" | "week_preview_2b"                                     // preview programme
  | "wellness_q"       // questions niveau de forme (POST_PROGRESS)
  | "account";
```

`POST_PROGRESS` = `["value_slides", "wellness_q", "autoreg_score", "autoreg_score_coach"]`

## Composants clés
```
src/components/
  onboarding/
    OnboardingFlow.tsx          # Flow complet sportif + coach (register + auth mode)
    AutoRegScoreStep.tsx        # Score autorégulation sportif (dark card, 3 jauges, score %)
    AutoRegScoreStepCoach.tsx   # Score autorégulation coach (même mécanique)
  paywall/
    PaywallModal.tsx       # Stripe Elements in-app, billing toggle, badge sécurité
    PaywallGate.tsx        # Gating actions (free/expired)
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
  PaywallModal.tsx    # Formulaire CB Stripe (simplifié : pas de toggle, pas de bullet points)
  PrimingModal.tsx    # Écran priming (timeline + plan cards) — utilisé par usePaywall dans l'app
  PaywallGate.tsx     # Paywall auto au chargement des pages app (expired/free)
src/hooks/
  usePaywall.ts       # Hook 2-step : priming → paywall. Retourne paywallStep, setPaywallStep, billing, setBilling
```

**Flow paywall unifié** : `requireSubscription()` → `paywallStep = "priming"` → `PrimingModal` → CTA → `paywallStep = "paywall"` → `PaywallModal` → "← Retour" → `paywallStep = "priming"`.

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

## Base de données (Supabase)
- `sessions` : RLS activée, `target_difficulty INTEGER` ajouté manuellement
- `wellness_daily` : unique sur `(user_id, date)`, upsert via `onConflict`
- `profiles` : créé automatiquement via trigger à l'inscription

## Flow auth / reset password
1. Magic link → `/auth/callback` → `/today`
2. Reset password → `/auth/callback?type=recovery` → `/reset-password`
3. Nouveau mot de passe → `supabase.auth.updateUser({ password })` → `/today`
