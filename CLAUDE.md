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
  onboarding/     # Onboarding post-register (auth mode sans compte)
```

## Onboarding — flows actuels (mai 2026)

### Athlète (inscription — 10 écrans)
```
role → sport_2a → level_2a → goal_2a → frustration_2a → freq_2a
→ wellness_q (5 questions wellness)
→ account (email + mdp + prénom)
→ readiness_4a (score reveal — dark card)
→ recap_5 (offre trial 7j)
→ PaywallModal
```

### Coach (inscription — 10 écrans)
```
role → context_2b → sport_2b → count_2b → challenge_2b → tool_2b
→ account
→ preview_4b (MissionCards démo avec WellnessRingCoach)
→ recap_5
→ PaywallModal
```

### Auth mode (déjà connecté — 6 écrans)
```
role → 5 questions rôle → saveData() → redirect /today ou /coach
```
Pas d'account, pas d'aha moment, pas de paywall.

### Logique de conversion
- **Sunk cost** : 10 étapes d'investissement (5 questions rôle + 5 questions wellness) avant de demander l'email
- **Curiosity gap** : dernier bouton wellness = "Voir mon score →" — l'utilisateur ne voit son score qu'après avoir créé son compte
- **Peak emotion avant paywall** : le score reveal (`readiness_4a`) est la dernière chose vue avant `recap_5` → PaywallModal
- **Trial 7j** uniquement sur le plan annuel ; plan mensuel = débit immédiat

### Wellness athlète — mécanique
- Les 5 questions (`wellness_q`) collectent sleep+bedtime, stress, recovery, behaviors, motivation
- Le score est calculé en state via `computeWellnessScore()` à la fin de `wellness_q` (`handleWellnessQuestions`)
- La sauvegarde DB se fait dans `handleFinish()` après création du compte (uid disponible), via upsert sur `wellness_daily` — écrase la baseline auto insérée par `saveData()`
- **Baseline fallback** : `buildWellnessBaseline()` insère des valeurs neutres dans `saveData()` ; elle est systématiquement écrasée par les vraies données pour les athlètes register

**Détection wellness rempli :** `bedtime == null` = baseline auto. `bedtime != null` = rempli par l'user. `TodayClient` utilise `wellnessFilledToday` pour auto-ouvrir `WellnessModal` au premier chargement du jour (guard sessionStorage).

### Catégories sport (remplacent les sports spécifiques)
`Force & puissance` · `Athlétisme & vitesse` · `Sports collectifs` · `Endurance` · `Arts martiaux & combat` · `Autre`
Chaque catégorie mappe vers des session templates dédiés dans `getSessionTemplates()`.

### Création auto à l'inscription coach
`saveData()` insère 1 `coach_athletes` démo (nom + sport du coach, `user_id=null`) + 4 `coach_sessions` lun/mer/ven/sam via `buildCoachDemoSessions()`.

### StepIds complets
```typescript
type StepId =
  | "role"
  | "sport_2a" | "level_2a" | "goal_2a" | "frustration_2a" | "freq_2a"   // athlète
  | "context_2b" | "sport_2b" | "count_2b" | "challenge_2b" | "tool_2b"  // coach
  | "wellness_q"      // questions wellness (avant account, athlète seulement)
  | "account"
  | "readiness_4a"    // score reveal (après account, athlète)
  | "preview_4b"      // MissionCards démo (coach)
  | "recap_5";        // offre trial + PaywallModal
```

`POST_PROGRESS` = `["wellness_q", "readiness_4a", "preview_4b", "recap_5"]` — ces étapes masquent la barre de progression principale (elles ont leur propre UI ou sont des écrans d'émotion).

## Composants clés
```
src/components/
  onboarding/
    OnboardingFlow.tsx     # Flow complet athlète + coach (register + auth mode)
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
