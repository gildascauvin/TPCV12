---
name: paywall-billing
description: Paywall, priming Elite, abonnements Stripe et achats intégrés iOS/Android (RevenueCat), freemium v2 (mesures gratuites, décisions payantes). À charger avant de toucher `PrimingJourneyModal`, `PaywallModal`, `PricingPriming.tsx`, `ExitOffer`/DEPART30, `LossSheet`, `LockedBlur`, `UnsavedBanner`, `usePaywall`, `/api/stripe/*`, `/api/revenuecat/*`, `subscription_status`, `coachIsPaying`, essai 14 jours, ob_pay.
---

# Paywall, abonnements et freemium (état au 30/10/2026)

## Fichiers clés
- `src/components/paywall/PrimingJourneyModal.tsx` : l'écran d'offre Elite. UN SEUL composant pour l'onboarding (étape `ob_pay`) et toute l'app. Gère la croix, l'offre de sortie et la feuille de perte.
- `src/components/paywall/PaywallModal.tsx` : formulaire de paiement Stripe (`CheckoutForm`, carte + Apple/Google Pay). Exporte `PRICING`, `PAYWALL_CTA_LABEL`, `PAYWALL_TESTIMONIALS`, `PAYWALL_AVATARS`, `getStripePromise`, type `Billing`.
- `src/components/paywall/PricingPriming.tsx` : contenu de l'offre : `ElitePlanCard`, `ElitePrice` (interne), `OfferRows`, `planFeatures`, `PrimingExtras` (vidéos + FAQ), `PricingSideLink` (« Inviter mon coach » / démo coach), `TRIAL_DAYS`, `PRICING_PRIMING_GUARANTEE_CAPTION`, `paywallSimIos`.
- `src/components/paywall/RiskTimeline.tsx` : frise Aujourd'hui / (coach : Demain matin) / Jour 7 / Jour 14 sous le titre (aussi utilisée par `InsightSteps.tsx`).
- `src/components/paywall/ExitOffer.tsx` + `src/lib/exitOffer.ts` : offre de sortie DEPART30.
- `src/components/paywall/LossSheet.tsx` : feuille de perte à la fermeture.
- `src/components/paywall/NativeCheckout.tsx` : `NativePurchasePanel` (achat Apple/Google, restaurer, mentions légales) et `NativeCheckout` (même bloc porté dans le footer de `PaywallModal`).
- `src/components/paywall/LockedBlur.tsx` : flou sur le vrai contenu + pancarte (jamais un cadenas).
- `src/components/paywall/UnsavedBanner.tsx` : bandeau du haut pour un compte non actif (`WIZARD_BANNER_H`).
- `src/components/paywall/SandboxGateModal.tsx` (+ `src/hooks/useSandboxGate.ts`) : gate de la sandbox sans compte.
- `src/components/paywall/FrisePreviews.tsx` : aperçus réutilisés ailleurs (`WellnessCardPreview`, `CoachControlPreview`, `CombinedInsightPreview`...), plus affichés dans le paywall.
- `src/hooks/usePaywall.ts` : `isActive`, `requireSubscription`, `paywallStep` (`idle`/`priming`/`paywall`), `billing`, écoute `OPEN_PRIMING` (`src/lib/onboardingProgress.ts`).
- `src/lib/primingSource.ts` : déclencheur et titres personnalisés (`markPrimingSource`, `peekPrimingSource`, `clearPrimingSource`, `sourceFromSurface`, `loadPrimingContext`, `primingTitles`, `primingHitIndex`).
- `src/lib/access.ts` : `coachIsPaying(coachId)`.
- `src/hooks/useFirstDecision.ts` : pose `profiles.first_decision_on`.
- API : `src/app/api/stripe/{setup-intent,subscribe,webhook,portal}/route.ts`, `src/app/api/revenuecat/{sync,webhook}/route.ts`.
- Natif : `src/lib/nativePurchases.ts` (client RevenueCat Capacitor), `src/lib/revenuecat.ts` (serveur, `syncRevenueCatStatus`).

## Statut d'abonnement
- `profiles.subscription_status` : `free` | `athlete` | `coach` | `expired` (`src/types/index.ts`). `athlete`/`coach` = rôle ET statut payant ; un essai en cours est stocké comme payant (pas de valeur `trialing`).
- `isActive` (`usePaywall`) = `athlete`/`coach`, ou `free` + coach payant. Le 2e paramètre de `usePaywall` s'appelle `hasCoach` mais DOIT recevoir `hasActiveCoach` (= `coachIsPaying(invited_by_coach_id)`, calculé côté serveur dans `today/page.tsx`, `week/page.tsx`, `conseils/page.tsx`, `programmes/page.tsx`). Jamais `hasCoach` seul pour un check de paywall.
- `coachIsPaying` lit le profil du coach avec le client admin : `profiles` n'a qu'une policy RLS `auth.uid() = user_id`, une lecture cross-user avec le client de session renvoie `null` en silence (bug corrigé le 17/09).
- Seules sources d'écriture du statut : webhook Stripe, update optimiste dans `/api/stripe/subscribe`, `syncRevenueCatStatus`. Aucune table d'historique des events. Correction manuelle = `UPDATE` SQL.

## Stripe (web)
- Flux : `PaywallModal` appelle `/api/stripe/setup-intent` (crée le customer Stripe si besoin, `profiles.stripe_customer_id`), puis `/api/stripe/subscribe` `{setupIntentId | paymentMethodId (wallet), plan, billing, promo}`.
- `subscribe` : `trial_period_days: 14` (constante `TRIAL_DAYS`, dupliquée dans `PricingPriming.tsx` et `PaywallModal.tsx`, à garder en phase), `metadata: {user_id, plan, promo}`. Refuse (402) si le statut n'est ni `active` ni `trialing` : ne jamais accorder l'accès sur un paiement non confirmé (bug du 07/08 quand l'essai avait été retiré, `incomplete` sans exception).
- Prix via env Vercel `STRIPE_PRICE_ATHLETE`, `STRIPE_PRICE_ATHLETE_ANNUAL`, `STRIPE_PRICE_COACH`, `STRIPE_PRICE_COACH_ANNUAL`. Piège : `.env.local` pointe encore les anciens prix annuels (59 €/179 €) ; la prod est à 78 €/348 €.
- Grille (`PRICING`) : sportif 9 €/mois ou 78 €/an (6,50 €/mois), coach 39 €/mois ou 348 €/an (29 €/mois).
- Webhook (`STRIPE_WEBHOOK_SECRET`) : `customer.subscription.created/updated` → plan si `trialing`/`active` et pas `cancel_at_period_end` (+ `markBrevoClient`, sort le contact de la liste onboarding Brevo) ; `past_due`/`canceled`/`unpaid` → `expired` ; **`trialing` + `cancel_at_period_end` → `expired` tout de suite** (résiliation pendant l'essai, fix du 15/07, ne pas retirer) ; un payant qui résilie garde l'accès jusqu'à `customer.subscription.deleted` → `expired`. Branche `checkout.session.completed` présente mais aucun Checkout Session n'est créé par l'app.
- Résiliation et gestion : Customer Portal Stripe (`/api/stripe/portal`, bouton « Gérer » de `ProfileDrawer.tsx`). Sondage de résiliation = réglage du Dashboard Stripe, pas du code. Dans les apps, « Gérer » ouvre les abonnements App Store / Google Play.
- Remboursement : manuel (contact@theperfclub.com, Dashboard Stripe).
- Ne jamais supposer un Price immuable : le Dashboard a permis d'éditer le montant d'un Price sans abonné.
- Claude n'entre jamais de carte bancaire, ne teste jamais un vrai paiement.

## Achats intégrés iOS / Android (RevenueCat)
- Dans la coque Capacitor (`isNativeApp()`), Stripe est remplacé par l'achat store (guideline Apple 3.1.1). Le web garde Stripe.
- Produits identiques sur les deux stores : `tpc_{athlete,coach}_{monthly,annual}` (`PRODUCT_IDS`). Google Play renvoie `abonnement:forfait`, rangé sous `split(":")[0]`. Entitlements RevenueCat `athlete` / `coach`. App user id RevenueCat = id Supabase.
- Prix et durée d'essai affichés = ceux du store (`getStoreProducts`, `trialDays()` lit `introPrice` iOS ou `defaultOption.freePhase` Play), jamais `PRICING`.
- Après achat ou restauration : `/api/revenuecat/sync` relit le client chez RevenueCat (`REVENUECAT_SECRET_KEY`) et écrit le statut avec les mêmes règles que Stripe (essai résilié → `expired`). `/api/revenuecat/webhook` (en-tête `Authorization` = `REVENUECAT_WEBHOOK_AUTH`) resynchronise à chaque événement ; 500 = RevenueCat réessaie.
- Garde-fous de `syncRevenueCatStatus` : un client sans abonnement store n'est jamais touché ; `expired` n'écrase jamais un compte qui a un `stripe_customer_id` (Stripe reste maître).
- Piège Capacitor : un plugin natif est un Proxy qui répond à `then` ; ne jamais le renvoyer nu depuis une fonction async (`plugin()` le met dans un objet). Bug vu sur TestFlight build 3.
- Restaurer mes achats + liens Conditions/Confidentialité obligatoires (Apple). iOS : le montant facturé doit être l'élément de prix le plus visible (refus 3.1.2(c) reçu le 09/10) : « 78 €/an » en gros, mensuel équivalent en petit.
- Suppression de compte (`/api/account/delete`) supprime aussi le client RevenueCat.

## Écran d'offre (PrimingJourneyModal) : état actuel
- Desktop : modale centrée ; dès 900 px de large, titre + `RiskTimeline` à gauche, carte Elite à droite. Mobile : plein écran, achat dans le bas fixe. Charte sombre (`DARK_CARD_BG`, bouton `#D44000`, Stripe thème `night`).
- **Plus de carte Gratuit ni de « Continuer en Gratuit » (30/10), onboarding comme app** : la croix est la seule sortie. Carte Elite « En plus du gratuit ».
- Formules empilées (`OfferRows`, radios, annuel présélectionné) à la place de l'ancien toggle. Web : annuel « 6,50 €/mois » en gros + ~~108 €~~ 78 € par an, badge d'économie calculé ; mensuel « Sans engagement ». iOS (ou `?pwios=1`) : prix facturé en gros.
- Ancrage sous les formules, texte validé par Gildas, ne pas changer : sportif « Le prix d'une seule séance avec un préparateur physique, pour toute l'année. » ; coach « Avec N sportifs : X € par sportif et par mois. Sportifs illimités. » : N = réponse à `ob_count` en onboarding (1-5 → 5, 6-15 → 10, 16-30 → 20, 30+ → 30, prop `athleteCount` de `PrimingJourneyModal`), dans l'app ses vrais sportifs s'il en a au moins 5, sinon 10 (31/10, Gildas « cale sur la réponse »). Prix remisé si l'offre de sortie est acceptée.
- « 0 € aujourd'hui, 1er prélèvement après tes 14 jours offerts. » CTA `PAYWALL_CTA_LABEL` = « Commencer mon essai gratuit » (Gildas, 30/10 ; remplace « Débloquer Elite — 14 jours offerts »). Légende `PRICING_PRIMING_GUARANTEE_CAPTION` sous le CTA web. Dans l'app native, le CTA est directement `NativePurchasePanel` (pas d'écran Stripe intermédiaire).
- Titres par déclencheur : `markPrimingSource()` juste avant l'ouverture (`LockedBlur` via `surface`, gates de décision de /today, /week, /coach/planning, Coach Control avec prénom, charts floutés `MetricChart`/`IndexCards`/liste de groupe, `usePaywall` sur `OPEN_PRIMING`). Sources : `decision`/`insight`/`progress`/`first`/`checklist`. `peekPrimingSource` à l'ouverture, `clearPrimingSource` dans un effet (StrictMode). La ligne Elite du déclencheur est surlignée. Contexte (prénom, sport, sportifs du coach, `everPaid`) préchargé par `usePaywall` via `loadPrimingContext` (cache module) ; l'écran attend ce contexte plutôt que d'afficher un titre générique.
- En onboarding (`ob_pay`, `OnboardingFlow.tsx`) : titre `payHeadline`/`payHeadlineCoach` (`InsightSteps.tsx`) avec le nom de la séance de la jauge ; croix → `onboarding_pay_free` puis `finishOnboarding` ; `PaywallModal.onClose` revient au priming.
- « Inviter mon coach » (`PricingSideLink`, prop `athleteSelfId`) : lien `/register?role=coach&athleteId=…&athleteName=…` construit sans appel réseau (`ShareButton` `getShareUrl` + `linkLabel`). Vrai compte seulement (`demo` en mode test).

## Erreurs et prix affichés (31/10, audit paiement)
- `/api/stripe/setup-intent` ne renvoie plus de texte technique (`{ error: "unavailable" }`, détail dans les logs) ; `PaywallModal` affiche « Le formulaire de paiement ne s'est pas chargé » + « Réessayer », ou sur 401 « Ta session a expiré » + « Me reconnecter ».
- `/api/stripe/subscribe` : try/catch global, messages en français (carte refusée / expirée / CVC / validation bancaire, session expirée, offre indisponible) ; erreur de l'update `subscription_status` loggée.
- Feuille Apple Pay / Google Pay : total à **0 €**, libellé « ThePerfClub · 14 jours offerts, puis 78 €/an » (avant : 78,00 € affichés au moment de payer).
- Garde anti double envoi `submittingRef` (carte et wallet). Stripe Elements en `locale: "fr"`.
- Apps : `ElitePrice` lit les prix et l'essai du store (`useStorePrices`, même cache que `getStoreProducts`), « … » pendant le chargement, jamais `PRICING`. `trialDays` est exporté par `src/lib/nativePurchases.ts`. Chargement de l'offre store : 20 s max, « L'offre App Store ne s'est pas chargée. Réessayer ».
- Offre de sortie acceptée puis « Retour aux offres » : `ElitePrice` affiche les prix remisés + « Code DEPART30 appliqué ».

## Fermeture : offre de sortie et feuille de perte
- `requestClose()` dans `PrimingJourneyModal` : (1) si l'offre de sortie n'est pas disponible (app native, `?pwios=1`, ou déjà vue) et que `lossSheetDue()`, feuille de perte ; (2) sinon, si `exitOfferEligible()` et pas `everPaid` (ancien abonné `expired`), offre de sortie ; (3) sinon fermeture.
- Offre de sortie (web seulement, une fois par appareil, `localStorage tpc_exit_offer_seen`, rejouée à chaque fermeture en `?dbgstep`) : « Ta 1re année à −30 % », annuel 54,60 € au lieu de 78 € (coach 243,60 €/348 €), mensuel 6,30 € au lieu de 9 € pendant 12 mois (coach 27,30 €/39 €), essai inchangé. « Prendre l'offre » → `acceptExitOffer()` (état de module jusqu'au rechargement) → formulaire avec la ligne « Code DEPART30 » ; « Non merci, je laisse passer -30 % » → fermeture.
- Stripe : coupon -30 % sur **12 mois** (pas « une fois », sinon la remise part sur la facture à 0 € de l'essai), produits sportif + coach ; code `DEPART30` 1er abonnement seulement. `/api/stripe/subscribe` n'accepte que `DEPART30`, vérifie qu'il est actif, sinon erreur (jamais un abonnement plein tarif alors que l'écran affichait le prix remisé) ; client déjà abonné → « Cette offre est réservée à un premier abonnement. »
- Feuille de perte (`LossSheet`, une fois par jour au plus, `localStorage tpc_loss_sheet_day`) : sportif « Ta séance de demain ne s'ajustera pas. », coach « Demain matin, tu ne sauras pas qui alléger. » ; « Garder mes 14 jours offerts » / « Quitter quand même » (ferme toujours).
- Écartés volontairement : prix par jour en gros, croix retardée, faux compte à rebours (App Store + DGCCRF).

## Freemium v2 : les mesures sont gratuites, les décisions payantes
- Toutes les ENTRÉES sont libres pour un compte gratuit : point forme, séances (ajout, édition, terminer, supprimer, dupliquer, reconduire), programmes (toutes les semaines), invitations. Chaque page définit `gateInput` = `requireSubscription` en sandbox seulement, sinon exécute directement (`TodayClient`, `WeekClient`, `CoachClient`, `CoachPlanningClient`).
- Gratuit net : anneau RPE sans zone (`AutoregButtons` prop `free` + `onSetDifficulty`, `DecisionRing`/`DecisionRingMini`/`DoneDecisionRing` prop `hideZone`, `HomeTabs` `lockedTabs`), jauges et « statut · valeur » Charge/Récup, jauge/statut des lignes de la liste coach. En gratuit le glisser n'écrit QUE `target_difficulty` (500 ms après le dernier mouvement), jamais les exercices, et ne compte pas comme 1re décision. Côté coach : `setSessionDifficulty`.
- Gratuit flouté (`LockedBlur`) : carte décision, insights, impacts et aperçus des cartes, séries des charts (`MetricChart` prop `locked`, légendes nettes), carte Comportements, analyse des tests (`TestsPanel`), cartes Coach Control (`CoachAthleteCard`, `lockedBare`). **Une seule pancarte par écran**, sur le 1er flou ; les autres flous n'ont pas de bouton. PostHog `locked_view`/`unlock_click {surface}`.
- 1re décision offerte : `profiles.first_decision_on` posé par `useFirstDecision` au 1er affichage d'une vraie décision ; ce jour-là un gratuit voit tout l'écran Premium (`historyLocked = decisionLocked`), flou dès le lendemain. Lu aussi par /week, /coach/planning, Coach Control.
- Pas assez d'historique (gratuit ET Premium) : `AnalyticsCollecting.tsx` (« Tes analyses arrivent dans N jours de suivi », cartes « En construction ») et `PhaseCollecting`. Plus jamais de données d'exemple dans l'app (le sportif démo Thomas du coach garde sa mention « Exemple »).
- `UnsavedBanner` : « 🔓 Activer l'ajustement » / « 🔓 Activer le Coach Control », jamais de prix (le prix ne vit que sur l'offre et le formulaire).
- Sportif rattaché à un coach payant : débloqué, ni paywall ni étape « Débloque ». Pour tester le paywall : un compte gratuit dont le coach ne paie pas.

## Mode test sans compte
- `/register?role=athlete&dbgstep=8` (coach : `role=coach&dbgstep=9`), options `&dbgsport=Trail`, `&dbgprog=none`, `&dbghealth=1`. Les index bougent avec `src/lib/onboardingPath.ts` : vérifier avant de citer un numéro.
- `?pwios=1` simule l'affichage iOS sur le web (prix facturé en gros, feuille de perte au lieu de l'offre), `?pwios=0` l'enlève (sessionStorage `tpc_pwios`).

## PostHog (grep avant de remplacer un composant)
`paywall_priming_viewed {plan, source}`, `paywall_priming_value_next`, `paywall_form_viewed`, `trial_started {plan, billing, method, promo}`, `exit_offer_viewed/accepted {billing}/declined`, `paywall_loss_sheet_viewed/stayed/left`, `onboarding_pay_free/purchased`, `first_decision_shown`, `locked_view`, `unlock_click`.

## Abandonné ou mort (ne pas réintroduire)
- Carte Gratuit et « Continuer en Gratuit » (supprimées le 30/10), toggle Annuel/Mensuel (remplacé par `OfferRows`), drawer docké à droite (remplacé par la modale du 07/10).
- Anciens composants disparus : `PricingPrimingContent`, `PricingPrimingValue`, `PlanJourney`, `FreePlanCard`, `PrimingModal`, `PaywallGate`, `DemoAnalyticsBanner`, frise Enregistre/Cible/Progresse, étapes `paywall_priming`/`paywall_form`, `wizardPaywallStage`, `skipPaywall`/`onboarding_paywall_skipped`. Les commentaires qui les mentionnent encore (`OnboardingFlow.tsx`, `FrisePreviews.tsx`, en-tête de `PrimingJourneyModal.tsx`) sont périmés.
- Mur `.locked` pleine page dans `(app)/layout.tsx` et gate « paiement à la sauvegarde » : remplacés par le freemium v2. Flou des semaines S2+ supprimé : `weekLocked` de `ProgramBuilderModal` n'est plus déclenché hors sandbox, constant `false` dans `WeekClient`.
- Essai retiré puis remis : l'essai de 14 jours avec CB est en vigueur. « 14 jours offerts » dans les textes ; le CTA dit « Commencer mon essai gratuit » depuis le 30/10. Jamais de promesse de rappel avant facturation.
- Ligne « Moins cher qu'une séance de coach particulier » de 2026-08 : retirée (l'ancrage actuel est celui validé le 30/10).

## Reste à faire (lot natif, après validation Play)
Offre de sortie dans les apps (Android : offre Play réservée au développeur ; iOS : piste d'un 2e produit remisé dans le même groupe d'abonnement). En attendant, les apps affichent la feuille de perte.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
