---
name: release-mobile
description: Mode opératoire des apps natives iOS et Android (coque Capacitor) : architecture, sortir une nouvelle version App Store ou Google Play, TestFlight, re-seed du compte de revue Apple, fiche store. Déclencheurs : build iOS, build Android, versionCode, CURRENT_PROJECT_VERSION, cap sync, xcodebuild, gradlew, AAB, TestFlight, Play Console, App Store Connect, Apple Santé, Health Connect, APNs, FCM, RevenueCat, Garmin, hors ligne.
---

# Apps mobiles iOS / Android : architecture et sortie de version

## 1. Architecture (à connaître avant de toucher au natif)

- **Coque Capacitor 8** (`capacitor.config.ts`) : l'app native charge le site en ligne `server.url = https://go.theperfclub.com` (local : `CAP_SERVER_URL=http://<ip-du-mac>:3000`, téléphone sur le même wifi). Pas d'export statique (routes serveur + API). `webDir: capacitor-www` ne contient que `index.html` et `offline.html`.
- **Conséquence clé** : tout changement web arrive dans les apps au déploiement Vercel, sans build. Un nouveau build n'est nécessaire que pour du natif : plugin, permission, `Info.plist`, entitlements, `AndroidManifest.xml`, icône/splash, `capacitor.config.ts` (dont les marqueurs d'user agent), copie de `capacitor-www/offline.html`.
- **Interrupteur web/app** : `Capacitor.isNativePlatform()` ; helpers dans `src/lib/native.ts` (`isIosApp()`, `isAndroidApp()`, `healthAppName()` = Apple Santé / Health Connect, `storeName()`, haptiques). Plugins natifs importés dynamiquement. `src/components/NativeShell.tsx` (layout racine) : splash, barre d'état Android, notifications natives.
- **Marqueurs d'user agent** (`appendUserAgent`) : iOS `TPCHeart` (build autorisé à demander la FC des séances, lu par `src/lib/heartAccess.ts`) ; Android `TPCHeart TPCFcm` (`TPCFcm` = Firebase embarqué, sinon `src/lib/notifications.ts` renvoie `unsupported`). Un nouveau besoin natif côté web = un nouveau marqueur, le site ne l'active que pour les builds qui le portent.
- **Santé** (`@capgo/capacitor-health`) : `src/components/layout/HealthSyncOnOpen.tsx` → `src/lib/healthSync.ts` (30 j relus à chaque ouverture/premier plan, `SYNC_DAYS`) → tables `health_daily` et `health_workouts`. Lecture seule. iOS : entitlement `com.apple.developer.healthkit` seul. Android : 5 permissions READ, les autres retirées par `tools:node="remove"` dans `android/app/src/main/AndroidManifest.xml`.
- **Garmin** (web, pas de natif) : OAuth2 PKCE `src/lib/garmin.ts`, ingestion `src/lib/garminIngest.ts`, routes `src/app/api/garmin/*` (webhook avec le jeton dans le chemin : `webhook/[token]`). Depuis l'app iPhone, Garmin s'ouvre dans Safari puis retour dans l'app. Script perso de Gildas : `scripts/garmin-personal-sync.mts` (Personal API, jamais pour d'autres utilisateurs).
- **Notifications** : `src/lib/notifications.ts` (point d'entrée unique natif/web) ; serveur `src/lib/pushSend.ts` → `src/lib/apns.ts` (iOS), `src/lib/fcm.ts` (Android), web-push. Passage horaire `src/app/api/push/send/route.ts` appelé par pg_cron Supabase (`push-hourly`), pas par Vercel. Jetons dans `push_subscriptions.kind` (`apns`, `fcm`, web).
- **Achats** : RevenueCat (`@revenuecat/purchases-capacitor`), `src/lib/nativePurchases.ts` (clés publiques iOS/Android en dur ou via `NEXT_PUBLIC_REVENUECAT_*_KEY`), `src/components/paywall/NativeCheckout.tsx`, synchro serveur `src/lib/revenuecat.ts` + `src/app/api/revenuecat/{sync,webhook}`. Produits identiques sur les deux stores : `tpc_{athlete,coach}_{monthly,annual}`, entitlements `athlete` / `coach`, essai 14 j (`trial-14d` sur Play).
- **Connexion** : `src/lib/nativeGoogleAuth.ts` (SDK Google natif + `signInWithIdToken`, Sign in with Apple sur iOS seulement).
- **Hors ligne** : `src/components/layout/OfflineSync.tsx` + `src/lib/offlineStore.ts` / `offlineSessions.ts`, routes `src/app/api/offline/{snapshot,flush}`. iOS : `server.errorPath: "offline.html"` + `limitsNavigationsToAppBoundDomains` (domaines listés dans `WKAppBoundDomains` de `ios/App/App/Info.plist`) pour que le service worker tourne dans l'app.
- **Liens stores** : `src/lib/storeLinks.ts` (`APP_STORE_URL`, `PLAY_STORE_URL`, `storeForUserAgent`), réutilisés par `src/lib/pwaInstall.ts`, `src/components/AppBanner.tsx`, `src/components/onboarding/PostSignupSteps.tsx`, `src/components/conseils/WatchPrompt.tsx`, route `src/app/api/telecharger`.
- **Analytics** : super-propriété PostHog `platform` = `ios_app` / `android_app` / `pwa` / `web` (`src/providers/PostHogProvider.tsx`). Installs : App Store Connect → Analytics, Play Console → Statistiques.

## 2. Outils et emplacements (jamais de contenu de clé dans un fichier ou un message)

| Quoi | Où |
|---|---|
| Node 22 (CLI Capacitor) | `~/.nvm/versions/node/v22.23.3/bin` ; le shell par défaut est en Node 8, préfixer `PATH` |
| Java / SDK Android | `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`, `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools` |
| Signature Android (clé d'envoi) | `~/.config/theperfclub/android-keystore.properties` + `android-upload.jks` (lus par `android/app/build.gradle`) |
| Firebase Android | `android/app/google-services.json` (gitignoré, à garder en local) ; compte de service `~/.config/theperfclub/fcm-service-account.json` |
| RevenueCat ↔ Play | `~/.config/theperfclub/revenuecat-play-service-account.json` |
| Clés App Store Connect (.p8) | `~/.appstoreconnect/private_keys/` + récap `~/.appstoreconnect/README.txt` (téléchargeables une seule fois chez Apple : ne jamais supprimer ni committer) |
| Seed des comptes de revue | `~/Desktop/Captures App Store/.seed_review.mjs` (hors repo) |
| Visuels stores | `~/Desktop/Captures App Store/Store`, `~/Desktop/Captures Play Store/` |
| Secrets serveur | Vercel (`APNS_*`, `FCM_SERVICE_ACCOUNT`, `REVENUECAT_*`, `GARMIN_*`, `PUSH_CRON_SECRET`) : écriture bloquée pour Claude, Gildas les pose |

Identifiants non secrets : bundle/package `com.theperfclub.app`, Team Apple `B4AJAX65W8`, app Play `4972249096511590966`.

## 3. Avant de décider d'un build

1. Le changement est-il natif (liste du §1) ? Sinon : déployer le web, pas de build.
2. Une revue Apple ou Google est-elle en cours ? Si oui : **ne rien mettre en prod sur l'onboarding ni le paiement** (le relecteur voit le site en ligne).
3. Le web doit-il distinguer les anciens builds ? Ajouter un marqueur d'user agent et garder un repli propre (« non disponible », jamais un crash) pour les builds publiés sans le plugin.
4. Nouvelle donnée collectée (santé, notifications, etc.) : prévoir la mise à jour de la politique de confidentialité WordPress (page id 3, via l'éditeur Gutenberg) et des déclarations stores.

## 4. Sortir une version iOS

État au 05/11 : 1.2.1 (build 14) publiée (ASO). 1.2.2 (build 15, même code natif) envoyée en revue le 05/11 pour les nouvelles captures (galerie V4) avec la page produit personnalisée « Page coach » (ppid 7b7b4b0a-b012-4a28-93ab-0487ab69861f, liée depuis la landing coach) ; publication automatique.

1. **Version** : `MARKETING_VERSION` (ex. 1.1 → 1.2) si nouvelle version store ; **toujours** incrémenter `CURRENT_PROJECT_VERSION` (12 → 13). Vérifier : `grep -n "CURRENT_PROJECT_VERSION\|MARKETING_VERSION" ios/App/App.xcodeproj/project.pbxproj`.
2. **Sync** (obligatoire, même sans nouveau plugin : `ios/App/App/capacitor.config.json` est gitignoré) :
   `PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx cap sync ios`
3. **Archive puis envoi** (dossier de travail = scratchpad ; `upload.plist` n'est pas versionné, le recréer avec `method=app-store-connect`, `destination=upload`, `teamID=B4AJAX65W8`, `signingStyle=automatic`) :
   ```
   cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Release \
     -destination "generic/platform=iOS" -archivePath <dir>/ThePerfClub.xcarchive -allowProvisioningUpdates archive
   xcodebuild -exportArchive -archivePath <dir>/ThePerfClub.xcarchive -exportOptionsPlist <dir>/upload.plist \
     -exportPath <dir>/upload -allowProvisioningUpdates
   ```
   Si la signature échoue (nouvel entitlement, profil) : **Gildas** ouvre Xcode → Signing & Capabilities.
4. **TestFlight** : le build apparaît après traitement Apple (quelques minutes). **Gildas** l'installe et teste sur son iPhone (Claude ne clique pas sur son compte).
5. **App Store Connect** : créer la version, attacher le build, notes de version FR, ajouter un paragraphe « WHAT'S NEW IN x.y » (EN) aux Remarques pour le relecteur, publication manuelle. Fiche confidentialité à revoir si nouvelle donnée.
6. **Comptes de revue** : si la revue attend depuis plus d'environ une semaine (ou la veille de la soumission), re-seed : `~/.nvm/versions/node/v22.23.3/bin/node ~/Desktop/Captures App Store/.seed_review.mjs` (Node 20 casse supabase-js). Écriture en prod : **Gildas le lance**. Ensuite vérifier en base le point forme et la séance du jour des comptes `cauvingildas+review-sportif` (Alex, gratuit) et `+review-coach` (Sam, coach payant). `+review-lea` n'est jamais donné à Apple. Mot de passe : mémoire `project_apple_review_account_202610`, ne jamais le recopier.
7. **Soumission** : **Gildas envoie** la soumission, puis publie à la validation. Nouveaux abonnements ou nouveau groupe : un groupe ne se soumet pas seul (« doit être soumis avec un abonnement ») → « Ajouter pour vérification ▾ » sur **chaque abonnement** (au brouillon existant), puis sur la version ; le brouillon contient alors version + groupe + abonnements, et Gildas clique « Envoyer pour vérification ». Avant de soumettre, vérifier le bandeau « contrat de licence mis à jour » (à accepter par Gildas, sinon soumission impossible). Notes relecteur : 4000 caractères max.

## 5. Sortir une version Android

État au 03/11 : 1.2 (versionCode 3) publiée en production France (1re publication publique le 02/11 en 1.1). Publication gérée DÉSACTIVÉE le 03/11 (choix de Gildas) : tout ce que Google valide sort automatiquement. La réactiver (pastille en haut de Vue d ensemble de la publication) avant un envoi dont on veut choisir la date de sortie.

1. **Version** : dans `android/app/build.gradle`, **monter `versionCode`** (2 → 3) à chaque envoi, et `versionName` si nouvelle version.
2. **Sync** : `PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx cap sync android`. Vérifier que `android/app/google-services.json` est présent.
3. **Build** (sans Android Studio), avec `JAVA_HOME` et `ANDROID_HOME` du §2 :
   `cd android && ./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
   Les lignes `e: … incompatible version of Kotlin` ne sont pas bloquantes.
4. **Test émulateur** (recommandé) : `./gradlew assembleRelease`, `$ANDROID_HOME/emulator/emulator -avd tpc_pixel`, `adb install -r android/app/build/outputs/apk/release/app-release.apk`. Claude ne valide jamais la connexion Google : **Gildas choisit le compte**.
5. **Play Console** : envoyer l'AAB sur une piste (test interne d'abord : lien `play.google.com/apps/internaltest/4701402545353611301`), notes de version FR. L'envoi en examen production se fait **avec l'accord explicite de Gildas** ; les déclarations (règlement, Health Connect, sécurité des données, IARC) et tout ce qui touche au paiement/compte marchand sont pour **Gildas**.
6. **Compte de revue Google** : `cauvingildas+review-coach@gmail.com` (coach payant) dans « Informations de connexion ». `review-sportif` est gratuit, ne pas le donner.
7. **Première publication publique (faite le 02/11/2026)** : (1) remplir `PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.theperfclub.app"` dans `src/lib/storeLinks.ts` ; (2) générer `public/app-qr.svg` (QR vers `https://go.theperfclub.com/api/telecharger`) : tant qu'il manque, le code garde `public/app-store-qr.svg` ; (3) mettre à jour la fiche Play (« point forme » au lieu de « check-in »).

## 6. Textes de fiche

- ASO (03/11) : nom App Store et titre Play « ThePerfClub: Coach sportif » ; ne jamais répéter dans les mots-clés iOS un mot du nom ou du sous-titre. Nomination Apple « Bilans hebdo » envoyée pour le 04/01/2027 (la refonte des bilans doit être en ligne avant).
- App Store : kit de soumission (textes FR, notes de revue EN, questionnaire confidentialité) https://claude.ai/artifact/3GfK8B3AniaHMt6PVu7JRa. À la prochaine soumission : remplacer « check-in » par « point forme » dans la description.
- Play : textes FR alignés sur l'App Store (choix de Gildas), 8 captures 1080×1920 + bannière 1024×500 dans `~/Desktop/Captures Play Store/`.
- Règles de wording du projet : pas de tiret long en prose, « sportif » (pas « athlète »), « groupe » côté coach, check-in = « 10 secondes ».

## 7. Checklist de sortie

- [ ] Changement réellement natif ? Sinon déploiement web seul.
- [ ] Aucune revue en cours qui verrait un onboarding/paiement modifié.
- [ ] `CURRENT_PROJECT_VERSION` / `versionCode` incrémentés.
- [ ] `npx cap sync <plateforme>` en Node 22 juste avant le build.
- [ ] `capacitor-www/offline.html` identique à `public/offline.html` (`diff -q`).
- [ ] Repli web propre pour les builds publiés sans le nouveau plugin (marqueur UA).
- [ ] Politique de confidentialité + déclarations stores à jour si nouvelle donnée.
- [ ] Testé sur TestFlight / émulateur par Gildas.
- [ ] Re-seed des comptes de revue Apple (lancé par Gildas) si attente longue.
- [ ] Notes de version FR + « WHAT'S NEW » pour le relecteur.
- [ ] Soumission et publication cliquées par Gildas.

## 8. Pièges connus

- **Plugin natif renvoyé par une fonction async** : son `.then` répond, JS attend sans fin (paywall bloqué « Chargement de l'offre »). Toujours l'envelopper (`{ Purchases }`) ou le déstructurer à l'import.
- **Oublier `cap sync`** (surtout en changeant de dossier ou de worktree) : builds 8-9 sans plugin splash, écran blanc au lancement.
- **Android, connexion Google** : ne jamais passer `scopes` au plugin @capgo, il rejette toute connexion.
- **Notifications Android** : un build sans Firebase plante à `register()` ; le web ne les active que si l'UA contient `TPCFcm`.
- **Nouveau domaine de navigation dans l'app iOS** : l'ajouter à `WKAppBoundDomains`, sinon la navigation est bloquée.
- **Revue Apple 3.1.2(c)** : sur iOS, le prix annuel s'affiche en gros (« 78€/an »), le mensuel équivalent en secondaire. **3.1.1** : jamais de paiement Stripe dans l'app iOS.
- **Play, prix** : la saisie globale est HT et arrondie en ,99 TTC ; corriger la France à la main (9 / 78 / 39 / 348 €).
- **Santé** : `healthSync.ts` n'envoie jamais de colonne vide (sinon la VFC Garmin est effacée) ; VFC Garmin = RMSSD, Apple Watch = SDNN, ne jamais mélanger pour un même sportif.
- **Achat Google Play jamais testé** à ce jour (ni l'offre de sortie `depart30`) : tester avec un compte gratuit en testeur de licence, sur un vrai téléphone Android.
- **Émulateur Android lent au démarrage à froid** : réseau simulé HSPA (~40 s pour charger le site), l'écran de lancement reste affiché, ce n'est pas un bug. Débogage de la WebView : `webContentsDebuggingEnabled` dans `android/app/src/main/assets/capacitor.config.json` (build local seulement, jamais dans l'AAB envoyé), puis `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` et CDP.
- **Fenêtre de note** : jamais affichée en TestFlight ni pour une app Android installée hors Play Store ; tester sur la version du store.
- **Prix Apple** : paliers imposés (pas de 54,60 ou 243,60 €) ; lister les paliers dans la fenêtre « Tarification d'abonnement » (« Afficher d'autres prix »).
- **Reste à faire** : révoquer la clé Firebase en doublon (`~/.config/theperfclub/fcm-service-account-doublon.json`) dans GCP (Gildas).
- **Demande de note** (02/11) : `@capacitor-community/in-app-review`, `src/lib/storeReview.ts`, marqueur UA `TPCReview` (iOS build 13+, Android versionCode 3+), déclenchée une fois par appareil sur « C'est parti » d'`ob_week`.
- **Health Connect, sommeil** : une nuit = un échantillon de toute la session avec les phases dans `stages` ; `healthSync.ts` additionne les phases hors éveil (avant le 02/11 la nuit entière était comptée).
- **Captures App Store** : changer les captures = nouvelle version + nouveau build. Les captures 1320×2868 vont dans un jeu `APP_IPHONE_67` (6,9") ; dans `APP_IPHONE_65` elles sont refusées (`SPEC_MISMATCH`). La clé API d'équipe n'a pas les droits sur les fiches (403) : passer par l'API interne `/iris/v1/...` en `fetch` depuis une page App Store Connect connectée (création de version, `appScreenshots` + upload, pages produit personnalisées).
- **Ne jamais lancer `next build` dans le repo pendant que le serveur de dev tourne** : pas de `distDir` configuré, le build écrase `.next` et le serveur local renvoie des 500.

Détails et raisons : grep `historique.md` de ce dossier.

## 9. Lien magique qui ouvre l'app (08/11/2026)
- Web : `public/.well-known/apple-app-site-association` (appID `B4AJAX65W8.com.theperfclub.app`, chemins `/auth/callback*`, Content-Type JSON dans `next.config.mjs`) et `assetlinks.json` (SHA-256 clé de signature Play `29:F6…` + clé d'importation `C5:BE…`). Le middleware exclut `.well-known`.
- Natif : `applinks:go.theperfclub.com` dans `App.entitlements` (capability Associated Domains cochée sur l'App ID le 08/11, profils Xcode à régénérer) ; intent-filter `autoVerify` `/auth/callback` dans `AndroidManifest.xml` ; `@capacitor/app` + listener `appUrlOpen` dans `NativeShell` (va sur le même chemin). Effectif seulement à partir du build 1.3 (`npx cap sync` pour le plugin).
- `/auth/callback` gère `token_hash` + `type` (`verifyOtp`) : marche dans n'importe quel navigateur/app (pas de PKCE). Modèle Supabase Magic Link = `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` (appliqué le 08/11 après le déploiement f2067b0, 3 occurrences).
- Emails auth envoyés par Resend en SMTP (branché le 08/11, `noreply@theperfclub.com`), limite 100/h (avant : 2/h du service intégré).
