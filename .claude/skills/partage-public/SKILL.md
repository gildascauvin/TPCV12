---
name: partage-public
description: Surfaces publiques et partage de ThePerfClub. Programme public `/p/[id]` (PublicProgramView, iframe WordPress, claim `?claim=`), partages `/share/[id]` + `opengraph-image.tsx` (satori, polices DM Sans), ShareButton et partage natif `navigator.share`, bibliothèque (`is_public` vs `is_official_template`, `/api/programs/library`), sandbox PLG `/sandbox/coach|athlete`, embed landings (`scripts/build-embed.mjs`, `/embed/exercise-lines.js`), snippets WPCode et pièges wpautop.
---

# Partage public, bibliothèque, sandbox, WordPress

État au 30/10/2026.

## Socle commun
- Toutes ces routes sont anonymes. `src/lib/supabase/middleware.ts` court-circuite `getUser()` tout en haut de `updateSession()` pour `/p/`, `/share/` et `/sandbox/` (fix TTFB), et les liste aussi dans `publicPaths`.
- Le matcher de `src/middleware.ts` exclut `embed/`, `sw.js`, `manifest.webmanifest`, `offline.html`.
- Lecture serveur anonyme via `createAdminClient()` (bypass RLS), jamais le client utilisateur.

## Programme public `/p/[id]`
### Serveur (`src/app/p/[id]/page.tsx`)
- `getProgram(id)` enveloppé dans `cache()` de React, partagé entre `generateMetadata` et la page.
- `export const revalidate = 60` (ISR) : jusqu'à 60 s de délai après une modif, assumé (les programmes publics sont surtout les modèles officiels).
- Metadata OG en texte seul : pas d'image OG pour `/p/`.

### Client (`PublicProgramView.tsx`)
- Onglets de semaines libres (`weekIdx`), `userMode` (`coach` | `athlete` | `null` = visiteur) résolu côté client.
- **Dévoilement visiteur** : semaine 1 en clair ; semaines 2+ = cartes visibles (nom, jauge), exercices floutés, encart « 🔒 Les exercices se dévoilent semaine après semaine » + « Personnaliser ce programme → ». Masquage 100 % client, choix assumé comme pour le paywall.
- **Simulateur d'autorégulation** (bandeau « Programme autorégulé », dans la zone scrollable au-dessus de la grille, pas fixe) :
  - slider 0-100 → `syntheticBaselineFor()` (`src/lib/sandboxFixtures.ts`) → `computeAutoregSuggestion` par jour, importé de `autoregulation.ts`, jamais réimplémenté ;
  - aucun jour choisi à l'avance, le plus grand écart réagit en premier ;
  - rendu via `SessionTemplateCard` (`badgeOverride`, `gaugeOverride`, `renderExerciseLine`), `AlertBox`, `DecisionGauge` ;
  - wording « propose / suggère », jamais « ajuste automatiquement ».
- **CTA visiteur** : un seul handler `handleClaimGuest()`.
  - pose `claim_program_id` en localStorage ET navigue vers `/register?claim={id}` (+ UTM `utm_*` recopiés) ;
  - `window.open` si embarqué en iframe (Safari iOS : localStorage non partagé avec le nouvel onglet, d'où le query param) ;
  - **plus de `?role=`** : demander le rôle dans l'onboarding convertit mieux (65,0 % vs 34,6 % sur ce canal).
- **Connecté** : `POST /api/programs/claim` (origine `template` si la source est un modèle officiel), puis redirection.
- **« 🔗 Partager »** en haut à droite (remplace « Se connecter ») : copie `window.location.href`.
- **Tracking** : `program_page_viewed`, `program_cta_clicked` (`cta` : `personalize` | `add_to_library` | `copy_share_link`, + `is_embedded`), `program_claimed`.
- `AppBanner source="public_program"` seulement hors iframe et hors `?inapp=1`.

### Mode inséré et hauteur
- `?inapp=1` retire la barre du haut et le CTA du bas ; `&lock=1` force le dévoilement des semaines 2+ même connecté.
- Utilisé par `src/components/programs/ProgramTemplateDetail.tsx` (fiche d'un modèle) : `/p/{id}?inapp=1`, `&lock=1` côté sportif.
- `/p/` poste `{type:"tpc-program-height", id, height}` (cible `"*"`) au chargement, au resize et sur demande `{type:"tpc-program-height-request"}` (le parent peut s'abonner après le 1er envoi). Écouté par `ProgramTemplateDetail` et par le snippet WordPress.

### Perf
- Ne jamais importer `ProgramBuilderModal` (dnd-kit, éditeur) depuis `/p/` : les cartes viennent de `src/components/programs/SessionTemplateCard.tsx`, module léger partagé (régression LCP d'août).

## Bibliothèque : `is_public` vs `is_official_template`
- `programs.is_public` : pilote seulement le lien `/p/[id]` et `/api/programs/claim`. Posé par « Partager ».
- `programs.is_official_template` : seul critère de `/api/programs/library` (+ `/library/sessions`) et `/api/sandbox/library`.
  - **Jamais posé par l'app**, uniquement à la main en base.
  - 65 modèles au 07/09 : compte `contact@theperfclub.com` + « Programme Haltérophilie » (`d85c3fff-…`, compte perso de Gildas, référencé dans `CURATED_PROGRAM_IDS`).
- Les routes de bibliothèque ont `export const dynamic = "force-dynamic"` : sans API dynamique, un Route Handler GET est statique et servait des programmes supprimés.
- `ProgramLibraryPage.tsx` :
  - `shareProgram(p)` s'assure que `is_public=true` (écrit seulement si besoin) puis copie le lien ; ne repasse **jamais** en privé (l'ancien `toggleShare` dépubliait au 2e clic) ;
  - Partager en haut à droite de la carte ; en bas seulement « Assigner → » / « ✏️ Modifier » + menu « ⋯ » (Dupliquer, Supprimer) ;
  - `gate()` n'est actif qu'en sandbox (`requireSubscription` passé seulement si `sandboxMode`).
- `ProgramLibraryBrowser.tsx` (modèles) : « 🔗 Partager » sur chaque carte, copie `${origin}/p/${id}` sans appel réseau, jamais gaté. La ligne est un `<div onClick>` (pas de bouton dans un bouton).
- `ProgramBuilderModal.tsx` :
  - `onShare(name, template)` sauvegarde silencieusement (programme pas encore enregistré inclus) puis copie le lien ;
  - `shareGated` (sandbox) ouvre la modale d'inscription. Pas de route publique d'écriture anonyme (risque de spam).
- **Dévoilement J-7** des programmes ThePerfClub (`programs.origin` `template`/`generated`, migration `032_programs_origin.sql`) :
  - `src/lib/programReveal.ts` : `isThePerfClubProgram`, `revealLabel`, `NOT_STARTED_LABEL`, `REVEAL_DAYS = 7` ;
  - côté sportif uniquement, affichage seulement (pas un paywall) ; `ProgramLibraryPage.concealFor` → `ProgramBuilderModal.concealFrom`.

## Partages `/share/[id]`
- Table `shares (id, resource_type, snapshot jsonb, created_by, created_at)`, migrations `013_shares.sql` et `014_shares_signature_type.sql` (contrainte CHECK sur `resource_type`).
  - **Snapshot figé au clic**, jamais un pointeur live.
  - Lecture publique `using (true)`, écriture par le créateur. Aucune donnée sensible, donc aucun gating.
- `src/lib/share.ts` : `createShare(resourceType, snapshot)` → `go.theperfclub.com/share/{id}`. `ShareResourceType` = `wellness | session | charge | recuperation | coach_athlete | signature`. Le programme ne passe pas par `shares` (il a `/p/[id]`).
- Fichiers de `src/app/share/[id]/` :
  - `page.tsx` (metadata) et `ShareView.tsx` (rendu navigateur : vrais `ZoneSparkline` / `SparkLineClient` / `ZoneBadge`, `ExerciseLineView`, CTA « Accéder à ThePerfClub → » vers `/login`) ;
  - `shareMeta.ts` : `getShare()`, `metaFor()`, partagés avec l'image ;
  - `ShareCardParts.tsx` : `ShareRing`, `ShareChip`, `ShareExerciseList`, source unique navigateur + satori.
- **Boutons encore rendus** :
  - séance : `TodaySessionCard`, `AddSessionModal` et `CoachSessionModal` (en édition seulement, snapshot du brouillon courant, `authorName` = celui qui partage) ;
  - Coach Control : `CoachAthleteCard` (`coach_athlete`).
- Wellness (retiré de /today le 30/09), signature, charge, récupération : plus aucun bouton, les types restent valides pour les liens déjà émis.

### Image OG `src/app/share/[id]/opengraph-image.tsx`
- `next/og` (satori), `runtime = "nodejs"`, **canvas portrait 1200×1500**.
- Deux usages : `og:image` (aperçu de lien) et bytes de l'image partagée en natif. Pas de screenshot Chromium headless (lent, lourd, timeouts crawler).
- Polices `public/fonts/DMSans-500|700|900.woff` (woff, pas woff2 : satori ne lit pas woff2), lues par `readFile` + cache module ; `fw()` arrondit au poids chargé le plus proche.
- **Piège du 500 en prod (ENOENT `/var/task/public/fonts/...`)** :
  - un chemin construit à l'exécution est invisible à l'output file tracing ;
  - `next.config.mjs` → `experimental.outputFileTracingIncludes: { "/share/**": ["./public/fonts/**/*"] }` ;
  - vérifier dans `.next/server/app/share/[id]/opengraph-image/route.js.nft.json` que les `.woff` y sont ;
  - tester l'URL **déployée** : un test local ne prouve rien pour une route qui lit un fichier via `fs`.
- **Règles satori** :
  - tout `<div>` à plusieurs enfants exige `display:flex` explicite ; jamais de Fragment multi-enfants dans un flex (chevauchements) ;
  - `inset` non supporté (utiliser `top/left/width/height`) ; `flex` fractionnaire non respecté (hauteurs en px) ;
  - `transform: rotate(-90deg)` sur `<svg>` fonctionne ; pas de `box-shadow` ; certains glyphes en tofu (`✦`, préférer `✨`) ;
  - échelle Y fixe sur les mini-graphes (`maxVal` 2 pour la charge, 100 pour la récupération) ;
  - textes coupés via `truncate()` (au dernier espace + « … »), jamais `.slice()`.
- Le hot-reload de `next dev` ne recompile pas toujours cette route : en cas de doute, `pkill` + `rm -rf .next` + relance.
- Tester avec une ligne `shares` de test insérée puis supprimée, `curl` + inspection visuelle. L'aperçu WhatsApp ne se teste pas en local (crawler externe).

### `src/components/sessions/ShareButton.tsx`
- Deux sources : `resourceType` + `buildSnapshot` (table `shares`, lien créé une seule fois puis mis en cache) ou `getShareUrl` (URL déjà connue, ex. `PricingPriming.tsx` « Inviter mon coach »). Variantes `buttonLabel` / `linkLabel`.
- **Mobile iOS/Android** (détection de l'OS, pas de la présence de l'API) : clic = `navigator.share()` direct, image jointe si `navigator.canShare({files})`, lien dans le vrai champ `url`.
- **Desktop** (même si `navigator.share` existe : macOS ne propose ni WhatsApp ni Copier) : petit menu Copier le lien / WhatsApp.
- Geste utilisateur : jamais d'`await` réseau avant `window.open` ou `navigator.share` (Safari bloque). WhatsApp = vrai `<a href="https://wa.me/...">`, image et lien préchargés à l'ouverture.
- Menu en `position:fixed` + `getBoundingClientRect()` (hôtes en `overflow:hidden`).

## Sandbox PLG `/sandbox/[role]`
- `src/app/sandbox/[role]/layout.tsx` : pas d'auth, `role` ∈ `athlete|coach` sinon 404, `BottomNav basePath="/sandbox/{role}"` (onglet accueil en match exact), `ToastHost`, `InviteHost sandboxMode` côté coach.
- Pages : accueil, `week`, `planning`, `athletes`, `conseils`, `programmes` (+ `template.tsx`). Pas de page profil.
- Les vrais composants (`TodayClient`, `WeekClient`, `CoachClient`, `CoachPlanningClient`, `AthletesClient`, `ConseilsClient`, `ProgramLibraryPage`) prennent `sandboxMode` et utilisent `src/hooks/useSandboxGate.ts` (même forme que `usePaywall`).
- Toute action gatée ouvre `src/components/paywall/SandboxGateModal.tsx` (fond flouté, « Créer mon compte → » / « Continuer en mode démo »).
- Données : `src/lib/sandboxFixtures.ts`, fonctions pures déterministes (jamais `Math.random`), dates relatives à aujourd'hui, une séance garantie le jour même pour déclencher l'AHA. Côté coach : 5 sportifs démo, signatures « ok » calculées avec les vraies fonctions de `/conseils`.
- `GET /api/sandbox/library` : `CURATED_PROGRAM_IDS` (8 modèles, un par famille) filtrés par `is_official_template`.
- `POST /api/sandbox/invite` : email seul (`sendSandboxInviteEmail`, `src/lib/email/inviteEmail.ts`), aucune ligne `coach_invites` / `coach_athletes`.
- `AutoregButtons` prend `isActive` : ne marque « appliqué » que si l'action a vraiment pu s'écrire.
- `src/app/sandbox/poc-coach/page.tsx` : POC local non commité, ne pas s'en servir comme référence.

## WordPress (theperfclub.com)
- **Snippet iframes `/p/`** : `docs/wp-snippet-programmes.html` (WPCode, extrait HTML en pied de page).
  - agit seulement sur les iframes `go.theperfclub.com/p/` (pleine largeur en JS, hauteur reçue par `postMessage`) et sur `[data-bg]` (pose le `background` pour les visiteurs, lazysizes n'étant servi qu'aux admins) ;
  - **aucune règle CSS globale** (un `overflow-x: clip` + `transform` sur `html, body` a été retiré).
- **CTA flottant** des pages programme : `docs/wpcode-34831-complet.js`, lit l'id du programme dans l'iframe, pointe vers `/register?claim={id}`, exclu sur `/` et `/coach-suivi-charge-wellness-sportifs/`.
- **Pièges WordPress** :
  - jamais de `&&` dans un JS collé dans WP (corrompu), utiliser des `if` imbriqués ;
  - jamais de bloc entier dans un `<a>` (wpautop casse les cartes cliquables) ;
  - après toute modif, « Vider les caches » (Kinsta).
- **Mettre à jour une page WP** (le MCP WordPress renvoie 404 sur les pages) :
  1. Chrome connecté → `wp-admin/post.php?post={id}&action=edit` ;
  2. en JS, bloc `core/html` via `wp.data.select('core/block-editor').getBlocks()` ; hasher le contenu en ligne et le comparer au fichier local ;
  3. envoyer seulement les lignes changées, `updateBlockAttributes`, revérifier le hash ;
  4. lancer `savePost()` sans l'attendre, puis contrôler `isEditedPostDirty() === false`, `didPostSaveRequestFail() === false` et le site public (curl).

## Landings (pages WP 33785 sportif, 34219 coach)
- Sources hors repo : `~/Desktop/LP prod/theperfclub_poc_landing_main_sportif_v1.html` et `theperfclub_poc_landing_coach_v1.html`, versions précédentes dans `old/`.
- **Embed** : les landings chargent `https://go.theperfclub.com/embed/exercise-lines.js` (API `window.TPCExercise.renderSession / adjustNotes / pointsToPct`).
  - compilé depuis `src/embed/exerciseLines.tsx` par `scripts/build-embed.mjs` (esbuild, IIFE), lancé en `prebuild` ou via `npm run build:embed`, sortie `public/embed/` ;
  - mêmes modules que l'app (`ExerciseLineView`, `sessionLevers`) : les landings suivent chaque déploiement ;
  - cache `/embed/*` 1 h + `stale-while-revalidate` (`headers()` de `next.config.mjs`).
- Contenu en ligne (v8, 25/10) : « Chaque conseil, vérifié après la séance », bilan en 6 cartes (chiffres réels de Gildas, n = 1, jamais « les sportifs »), pas de tableau comparatif ni de marques citées, point forme = « 10 secondes ».

## Abandonné, ne pas recréer
- Menu maison à 3 options sur mobile ; partage par screenshot Chromium headless ; formats d'image multiples (Story, LinkedIn).
- Flou en bloc des semaines 2+ de `/p/`, `?role=` dans le CTA de `/p/`, bascule public/privé exposée à l'utilisateur.
- Boutons de partage séparés Charge / Récupération / signature, et partage wellness sur /today.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
