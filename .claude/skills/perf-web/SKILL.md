---
name: perf-web
description: Performance web de ThePerfClub. Web Vitals PostHog (`$web_vitals`, LCP/CLS/INP), poids des bundles et `next/dynamic`, code mort (knip), fonctions Vercel en `dub1`, service worker `public/sw.js`, animations et qualité perçue (`.tpc-press`, `useExitAnimation`, toasts Annuler, `loading.tsx`, `template.tsx`).
---

# Performance web et qualité perçue

État au 30/10/2026. Chantier bundles clos le 27/10, reste une remesure.

## Acquis en place
- **Polices** : `next/font/google` dans `src/app/layout.tsx` (DM Sans + IBM Plex Mono, variable `--font-dm-sans`), plus d'`@import` Google Fonts. Preconnect `eu.i.posthog.com`, `www.theperfclub.com`, `js.stripe.com`.
- **Stripe paresseux** : `getStripePromise()` (`src/components/paywall/PaywallModal.tsx`), jamais `loadStripe` au chargement du module.
- **`useBreakpoint()`** (`src/hooks/useBreakpoint.ts`) : `useLayoutEffect` isomorphe, la largeur est corrigée avant la 1re peinture (sinon CLS desktop).
- **Image LCP `value_intro`** en `next/image` (`priority`), `images.remotePatterns` autorise `theperfclub.com`.
- **`next/dynamic`** sur toutes les modales et tiroirs ouverts à la demande (/today, /week, /coach, /coach/planning, /coach/athletes, /conseils). Restent statiques ce qui est toujours rendu (`CalendarHeader`, `DayColumn`/`DraggablePlanning`, `DiffGauge`, `ProgramBanner`, `ShareButton`, sparklines…).
- **Lecteur de démos** : `DemoSheetLauncher` (layout racine) écoute `DEMO_SHEET_EVENT` (`src/lib/demoSheetEvent.ts`, sans dépendance) et ne charge `DemoSheetHost` (`ExerciseDemo.tsx`) qu'au premier tap, passé via `initial`.
- **Auth** : `getAuthUser()` (`src/lib/supabase/server.ts`, `React.cache`), un seul `auth.getUser()` par rendu entre le layout `(app)` et sa page. Middleware court-circuité pour `/p/`, `/share/`, `/sandbox/`.
- **Requêtes serveur** parallélisées (`Promise.all`, redirection vérifiée après) sur /today et les pages coach.
- **Région Vercel `dub1`** (`vercel.json` `regions`), proche de Supabase `eu-west-1`. Contrôler via l'en-tête `x-vercel-id` (`cdg1::dub1::…`).
- **Polices OG** : `outputFileTracingIncludes` limité à `/share/**` (voir skill `partage-public`).

## Règles
- **Un import statique annule un `next/dynamic`** : importer n'importe quel export d'un module (même une constante) remet tout le module dans le bundle initial. Ne jamais importer depuis un fichier de page (`app/**/XClient.tsx`) ni depuis une modale lourde : sortir le morceau partagé dans un petit module (exemples : `src/components/paywall/paywallAvatars.ts`, `athleteStatus` dans `src/components/coach/AthleteRing.tsx`, `SessionTemplateCard.tsx` séparé de `ProgramBuilderModal`).
- **Mesurer les bundles** : builder dans une copie hors du repo (un `next build` écrase le `.next` du serveur de dev), puis sommer le gzip des chunks de `app-build-manifest.json` pour `/layout` + la page. Référence 27/10 : layout 255 Ko, `/register` 459, `/today` 506, `/coach/athletes` 381, `/programmes` 537.
- **Web Vitals** : lire les `$web_vitals` PostHog en HogQL (p75/p90, mobile/desktop séparés), pas au feeling. `/p/` dans l'iframe WP affiche 16-21 s de LCP, artefact probable du rendu différé des iframes hors écran (`/p/` direct : 0,8 s).
- **Hors ligne** : `public/sw.js` (`theperfclub-v4`) précache seulement `/offline.html` ; cache-first pour `/_next/static/` et images, network-first pour pages et API, `.catch(() => {})` sur chaque `cache.put`. Un chunk différé jamais ouvert en ligne n'est pas disponible hors ligne.

## Animations et qualité perçue (déployé 27/10, sans dépendance, pas de framer-motion)
- `globals.css` : enfoncement global des `button` (`:where`, exclusion `data-no-press` / `aria-roledescription`), `.tpc-press` pour les cartes (inactif si on presse un bouton ou un élément glissable dedans), `.tpc-exit`, `.tpc-page-in`, `prefers-reduced-motion`.
- `src/hooks/useExitAnimation.ts` (`exitClass` sur le fond de modale, `close()` pour les fermetures utilisateur), `src/hooks/useCountUp.ts` (`AggregateGauge`).
- Toasts : `src/lib/toast.ts` + `src/components/layout/ToastHost.tsx` (layouts `(app)` et sandbox). `src/lib/undoable.ts` : suppression annulable 5 s, exécutée tout de suite sur `pagehide`/arrière-plan, `isPendingDelete()` pour filtrer une liste relue. Toasts Annuler sur supprimer/dupliquer/déplacer/reconduire une séance et supprimer/arrêter un programme (plus de `confirm()`).
- `src/lib/morph.ts` : View Transition carte → tiroir, /today uniquement. `src/components/sessions/DoneBurst.tsx` : coche de séance validée.
- `PlanningDnd` (`DraggablePlanning.tsx`) : `DragOverlay` rendu dans `<body>` via portail (sinon coupé par le scroll du jour).
- Onglets : `pendingHref` dans `BottomNav` allume l'onglet au clic ; `src/app/(app)/template.tsx` fait un fondu en opacité seule (un `transform` décalerait les éléments `fixed`).
- Les 8 `loading.tsx` reprennent la vraie mise en page de leur page ; `PageSkeleton` (`src/components/ui/Skeleton.tsx`) n'est plus utilisé.

## Volontairement non fait / abandonné
- View Transitions entre onglets (écran figé pendant le chargement).
- Chargement différé de posthog-js (~96 Ko gzip, 29 fichiers l'importent) et allègement de l'inscription : risque de perdre des events de funnel.
- Découpage de `TodayClient` / `OnboardingFlow` : trop risqué sans tests automatisés.

## Reste à faire
- Remesure vers le 10/11 : `/today` app iOS, mobile, LCP p50/p75 (avant `dub1` : médiane 4,75 s, p75 6,1 s). Nettement sous 5 s → clos ; toujours ~5 s → enquête séparée (piste : synchro Apple Santé à l'ouverture ou contenu affiché après coup).

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
