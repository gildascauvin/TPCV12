---
name: run-local
description: Lancer ThePerfClub en local et vérifier un changement (dev server, build, typecheck, scripts Node/tsx, tests du parcours onboarding). À charger avant tout `npm run dev`, `next build`, script dans `scripts/`, ou quand « ça ne marche pas en local », « l'écran n'a pas changé », cache, service worker.
---

# Lancer et vérifier en local

## Commandes
- Node 20 pour l'app : `export PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH` (`.nvmrc` = 20).
- Dev : `npm run dev` (port 3000). Le lancer en arrière-plan (`run_in_background`), jamais en avant-plan bloquant.
- Typecheck rapide : `npx tsc --noEmit -p tsconfig.json`.
- Build : `npm run build` (le `prebuild` lance `scripts/build-embed.mjs`, l'embed WordPress).
- Scripts TypeScript (`.mts`, `.ts`) : Node 22 + tsx + env local, par exemple
  `PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx -y tsx --env-file=.env.local scripts/<script>.mts`
  Les scripts de données tournent en dry-run par défaut et n'écrivent qu'avec `--apply` (voir le skill `supabase-write`).
- Test du parcours onboarding : `node scripts/run-onboarding-path-test.mjs`.
- Ne jamais afficher le contenu de `.env.local`.

## Pièges connus
- **Service worker** (`public/sw.js`) : cache-first sur `/_next/static/` et les images, network-first pour les pages et l'API, précache de `/offline.html` (nom du cache dans `public/sw.js`). En local, le navigateur peut servir un vieux bundle même après un redémarrage et la suppression de `.next`. Symptôme : un `console.log` ajouté n'apparaît jamais. Avant toute vérification visuelle, dans la console :
  `(async()=>{for(const x of await navigator.serviceWorker.getRegistrations())await x.unregister();for(const k of await caches.keys())await caches.delete(k);})()` puis recharger. `curl localhost:3000/...` confirme ce que sert réellement le serveur.
- Mode test des écrans de paywall / onboarding : paramètres `?dbgstep`, `?ab=test|control`.

## Qui vérifie quoi
- **C'est Gildas qui fait la QA.** Ne pas lancer de vérification navigateur (même en sandbox) sauf s'il le demande ; proposer plutôt.
- S'il le demande : ne jamais cliquer « Continuer avec Google » en local (c'est sa vraie session Chrome). S'arrêter avant l'étape `account`, ou tester via l'API.
- Tout ce qui envoie un email réel (signUp, resetPasswordForEmail, signInWithOtp, `/api/invite/create`) : uniquement avec une vraie adresse de Gildas, jamais `test@example.com` (rebonds = réputation d'envoi).
- Un test qui « échoue » dans Chrome piloté : vérifier que c'est bien son ordinateur et pas une autre instance.
- Ne pas « corriger » l'auto-lien coach = sportif sur son compte : c'est volontaire pour ses tests.

## Mise en prod
Le code part en prod par un push sur `main` (déploiement Vercel automatique). Gildas ne gère pas les branches : travailler sur `main` ou y revenir sans lui exposer l'état git. Commiter et pousser seulement quand il le demande.
