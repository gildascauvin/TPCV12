# ThePerfClub — Instructions pour Claude

App de coaching sportif fondée sur l'autorégulation (sportifs + coachs). App : go.theperfclub.com ; site vitrine WordPress : theperfclub.com. Gildas (fondateur, non technique) fait lui-même la QA.

## Stack
- Next.js 14 App Router (TypeScript), styles inline React (pas de Tailwind dans les composants principaux)
- Supabase (auth + PostgreSQL + RLS), projet `levplovrwwsqvswmolik`, migrations dans `supabase/migrations/` appliquées via le MCP Supabase
- Stripe (web) + RevenueCat (achats intégrés natifs), PostHog, Brevo (emails marketing), Resend
- Capacitor 8 : apps iOS (`ios/`) et Android (`android/`), Apple Santé / Health Connect, Garmin
- Hébergement Vercel : un push sur `main` déploie en prod

## Démarrer
`export PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH && npm run dev` (port 3000). Détails, scripts tsx en Node 22 et pièges du service worker : skill `run-local`.

## Skills du projet (`.claude/skills/`)
Chaque domaine a un `SKILL.md` (état actuel) et un `historique.md` (ancien journal de bord verbatim, daté, à grep pour le pourquoi). Charger le skill du domaine avant de toucher au code concerné.

| Skill | Quand |
|---|---|
| `ui-wording` | tout texte visible ou composant visuel (à relire avant chaque livraison) |
| `run-local` | lancer, builder, tester, scripts |
| `supabase-write` | toute écriture en base, migration, script de données, requête de stats |
| `onboarding-flow` | `OnboardingFlow.tsx`, steps, signup, AHA, post-signup |
| `paywall-billing` | paywall, priming, Stripe, RevenueCat, freemium, offres |
| `autoregulation-analyses` | moteur de charge, décision, anneau, point forme, analyses, bilans, montre |
| `planning-editeur` | /week, /today, séances, éditeur d'exercices, programmes, générateur |
| `coach` | Coach Control, /coach/*, invitation, lien coach-sportif, bilan du groupe |
| `partage-public` | `/p/[id]`, `/share`, OG, bibliothèque, sandbox, WordPress |
| `release-mobile` | iOS / Android, sortir une version, natif |
| `posthog-funnel` | tracking, A/B, rapports funnel |
| `emails-brevo` | emails, workflows Brevo |
| `perf-web` | Web Vitals, bundles, animations |

Le contexte business (pricing, MRR, acquisition) est dans le skill personnel `theperfclub`.

## Structure
```
src/app/
  (app)/        today, week, conseils, programmes, coach/{athletes,planning,programmes}  (layout avec BottomNav)
  (auth)/       login, register
  api/          routes serveur (coach/*, invite/*, programs/*, sessions/*, stripe, revenuecat, garmin, push, offline…)
  p/[id]        programme public    share/       partages + images OG
  sandbox/      démo PLG non authentifiée    join/  arrivée par invitation
src/components/  onboarding, paywall, sessions, wellness, today, coach, conseils, bilan, programs, physio, tests, layout, ui…
src/lib/         logique métier (autoregulation.ts, decisionCard.ts, exerciseParser.ts, bilan.ts, access.ts…)
src/types/index.ts
scripts/         scripts de données (dry-run par défaut, `--apply` pour écrire), build-embed.mjs, test du parcours onboarding
```
`src/app/\(app\)` et `src/app/\(auth\)` (avec antislashs) sont des dossiers vides parasites, à ignorer.

## Wording (résumé, détail dans `ui-wording`)
- UI : « sportif », « récupération », « point forme », « ton groupe ». Le code, la DB et les événements PostHog gardent `athlete`, `wellness`, `checkin` : ne jamais les renommer.
- Pas de tiret long « — » en prose, pas de note « /10 », jamais d'information portée par la seule couleur.

## Design
Référence : `/Users/Gildas/Desktop/theperfclub_poc_v59_coach_exercises_share_delete.html` pour le nouveau ; pour ce qui existe déjà, la prod fait foi.
- Accent `#d44000` / fort `#f04a08`, gradient bouton `linear-gradient(180deg,#f04a08,#d44000)`, fond page clair `#f1f0ee`
- Modale : `#fff`, radius 30, padding 28, ombre `0 42px 120px rgba(0,0,0,.34)`, z-index `2147483100` (bottom nav `2147483000`)
- Jauge de difficulté : facile `#bfeec8→#2f9e44`, modérée `#ffe0a0→#f28a00`, dure `#ffb5a7→#d44000`, largeur `max(22, min(100, value*10))%`

## Règles de développement
1. Une seule jauge par carte de séance : RPE si terminée, `target_difficulty` si planifiée. Pas de label.
2. Exercices sans numéros : liste séparée par `\n` dans `notes`.
3. Comportements : clés DB (`alcohol`, `screen_late`…) traduites via `BEHAVIOR_LABELS` avant affichage.
4. Footer CTA des modales scrollables : carte flex colonne `overflow:hidden`, contenu `overflowY:auto; padding:28`, footer `flexShrink:0` (pas de sticky), padding `20px 28px 20px`.
5. Pages serveur pour le fetch initial, client components pour l'interactivité.
6. Pas de commentaires sauf si le pourquoi n'est pas évident.
7. Toute écriture Supabase lit `.error` (skill `supabase-write`).
8. Avant de remplacer ou supprimer un composant, grep ses appels PostHog (funnels).
9. Réutiliser les vrais composants de l'app plutôt que des copies maison dans l'onboarding.
10. Restructuration d'un flow : comparer à l'ancien flow pour vérifier que rien n'a disparu.

## Base de données (repères)
- `sessions` : RLS, `target_difficulty INTEGER`
- `wellness_daily` : unique `(user_id, date)`, upsert `onConflict`
- `profiles` : créé par trigger à l'inscription
- `push_subscriptions` : RLS `auth.uid() = user_id`, unique sur `endpoint`
- Types : `src/types/index.ts`

## Auth
- Lien magique → `/auth/callback` → `/today` ; reset → `/auth/callback?type=recovery` → `/reset-password` → `updateUser({ password })`.
- Inscription sans mot de passe : prénom + email (ou Google). Mot de passe aléatoire à la création, puis email « crée ton mot de passe » (`?type=recovery&first=1`). Templates email Supabase brandés gérés dans le dashboard (hors repo).

## Mise à jour de ce fichier
Ce fichier reste court. Un nouveau chantier se documente dans le `SKILL.md` du domaine (état actuel, remplacer ce qui devient faux) et, si le pourquoi mérite d'être gardé, dans son `historique.md` (section datée ajoutée à la fin). Ne plus ajouter de sections datées ici.
