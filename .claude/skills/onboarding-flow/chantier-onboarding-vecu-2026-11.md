# Chantier « Onboarding vécu » (10 → 15/11/2026)

Statut : **codé en local le 15/11 (non commité), derrière `?vecu=1`** : voir la section « Chantier en cours » de `SKILL.md`. Maquette : https://claude.ai/artifact/61zkoU967UzqLb2dSTYGko (version 40).
Source locale : `poc-onboarding-vecu/index.html` (+ photos `p_*.webp`, `t/*.jpg`), à côté de ce fichier. Références visuelles : `poc-onboarding-vecu/references/`.

## 1. Pourquoi

- Diagnostic du 10/11 : personne n'entre sa carte depuis 5 mois (0 carte depuis le 07/10, environ 40 vues de l'offre par mois). Pas de bug Stripe. Le « 70 % offre → formulaire » de septembre est un artefact : le formulaire s'affichait d'office.
- Le point forme réel pendant l'onboarding ne change rien au passage offre → formulaire.
- PostHog depuis le 30/10 : les questions programme ne font pas fuir (14 → 14 → 13 → 13). Le vrai trou est l'**écran de compte** : dernier écran vu par 31 sportifs et 12 coachs.
- Gildas garde la **carte bancaire obligatoire** comme engagement (Outsider : inscriptions divisées par 2, conversion multipliée par 5). L'essai Elite sans carte est refusé.
- Objectif : faire **vivre** l'autorégulation avant la carte, sur web, iOS et Android, pour le sportif comme pour le coach. Le POC doit être haute fidélité, construit avec les vrais composants, émotionnel et personnalisé.

## 2. Parcours actuel du POC

Sportif web : 14 écrans (`pre signup sport goal freq stag pf fact sess note avap path trial pay`). Sur iOS et Android, `health` s'ajoute après `pf`.
Coach : 14 écrans (`pre signup sport count goal fact sess radar dir note avap path trial pay`).

| # | Écran | Contenu |
|---|---|---|
| pre | Présignup | 3 écrans plein cadre façon Swile (photo teintée, objet central). Sportif : « Ton programme ne sait pas que tu as mal dormi. ThePerfClub, si. » / « Ton programme ajusté jusqu'à ta dernière série. » / « Ton programme sait enfin pourquoi tu stagnes. ». Coach : « Tes sportifs ne te disent pas tout. Leur point forme, si. » / « Leur programme ajusté jusqu'à la dernière série. » (sur l'app de ton sportif) / « Tes programmes savent enfin ce qui freine ton groupe. ». Boutons Moi / Mes sportifs (blancs pleins, 60 px), puis Google (+ Apple sur iOS) et un seul lien « Continuer avec mon email ». |
| signup | Carte de membre | Fonctionnement repris du POC 25q1nk. La carte s'écrit pendant la saisie (prénom, N° 330, sport seulement s'il est connu, date). Pas de tampons. |
| sport | Sport | Photo en haut, feuille du bas, un tap fait avancer. **Réaction** de 2,3 s sur la photo (« Course à pied. Ton allure du jour dépend de ta nuit autant que de ta VMA. »). |
| goal | Objectif | Un tap, puis réaction (« Un semi. Endurance et seuil, sur des semaines qui ne se ressemblent jamais. »). **Pas de date** (« Quand ? » retiré). |
| freq | Séances par semaine | 2 / 3 / 4 / 5 ou plus, puis réaction. |
| stag | « Tes perfs n'ont pas bougé depuis quand ? » | Elles progressent encore / 1 à 3 mois / 3 à 6 mois / Plus de 6 mois. C'est la question miroir de la frustration, suivie d'une réaction. |
| pf | Habitudes | Format du point forme (anneau + feuille à 10 crans), mais **en général** : sommeil, stress, corps entre deux séances. Le score donne sa forme habituelle. Puis, dans la même feuille, **ses comportements de la semaine** (les 8 négatifs de `WellnessModal`, plusieurs choix + « Rien de tout ça », bouton Continuer) : repris dans la carte 2 du chiffre (« Couché tard, écran tard : ta forme bouge avec ta semaine. Pas ton programme. »), dans l'analyse et dans la 3e puce de « Ce que tu gagnes ». |
| health | Apple Santé / Santé Connect | Mobile seulement. Feuille de bénéfice (30 dernières nuits), puis vraie demande système. |
| fact | « Ce que tes réponses disent » | D'abord « J'analyse tes réponses… » 2,6 s (barre + résumé), puis 3 messages glissables, **sans cartes** : 1. « **78 h** d'entraînement depuis 3 à 6 mois. Toujours le même niveau. » (compte animé) ; 2. ses 7 jours en barres face à une ligne pointillée, « Ton programme ne sait pas que ta forme varie. » ; 3. « **1 séance sur 3** tombera un jour où tu n'es pas en pleine forme. Ton <objectif> se joue là. » (ou la charge s'il a souvent des courbatures et 4 séances ou plus). Preuve sous le carrousel (5,0 App Store, 5 275 points forme, 3 visages). CTA « Changer ça ». Coach : « Ce que tu ne vois pas » (30 séances écrites chaque semaine avant de connaître leur forme / forme du groupe en barres / 1 séance sur 3). |
| sess | Le déclic | « Pousse les bons jours. Lève le pied les autres. », sous-titre « Des séances types. Dans l'app, tu personnalises tes séances et ton programme. ». L'anneau de décision + un **carrousel des séances types** du sport : au swipe, l'anneau ajuste chacune avec son score global. On démarre sur la 1re séance qui change. Lien « J'écris ma séance ». CTA « C'est ma séance » : **note du store** (mobile) ou feuille « l'app » (web) par-dessus. |
| note | Mot du fondateur | Juste après le déclic (leçon Mobbin : One Year, Airbnb, Basecamp). Carte papier : photo (à fournir), « Théo, c'est Gildas. », ton parcours en une phrase (**à écrire par Gildas**), « Ce que tu viens de voir, c'est ce qui manquait à mon programme. Essaie-le 14 jours sur tes vraies séances. », signature, vidéo 20 s en option. CTA « Voir la différence ». |
| radar / dir | Coach | Radar du Coach Control (autoregBand), puis décision sur Thomas + message prêt. |
| avap | Avant / Après | Les **barres** (Gildas : lisibles d'un coup d'œil, valent pour séances ET séries). « Ta séance suit ta forme, jusqu'à la dernière série. » Sans : « Même séance, que tu aies dormi 5 h ou 8 h. » Avec : « Ta séance suit ta forme. » CTA « Voir ce que tu y gagnes ». |
| path | Ce que tu gagnes | Façon Opal « te rendra 1 an de ta vie » : « Gildas, tes 73 heures vont enfin compter. », puis 🎯 1 séance sur 3 ajustée / ⚡ Tes bons jours, enfin exploités / 🧭 Identifie ce qui te freine (chaque lundi, ton bilan). CTA « Commencer mes 14 jours offerts ». |
| trial | 14 jours | « 14 jours offerts. On te prévient avant la fin. » Maquette d'écran verrouillé avec une notification personnalisée. Feuille claire : 2 jours avant / 3 jours avant (dates), « Me prévenir avant » = demande de notifications, « Plus tard ». Rappel **à construire**. |
| pay | Paiement | **Allégé en v40 (anti « Frankenstein », Tim Gabe).** Carrousel de 3 pages : 1. « Ton parcours commence. » (courbe Aujourd'hui · stable depuis X → bulle de son objectif, sans chiffres) ; 2. bilan du lundi (17 sur 26) ; 3. « Programmes et tests, inclus. ». Phrase de valeur dessous. Feuille claire : Annuel (Meilleur prix, 0,21 €/jour) + Mensuel, CTA « Ajuster mes séances 14 jours », « Annulation en 1 clic, sans engagement. ». Sur iOS / Android : feuille App Store / Google Play, prix annuel facturé en gros (3.1.2), « renouvelé automatiquement », Restaurer / Conditions / Confidentialité, annulation « dans tes abonnements ». Carte Elite seulement après paiement. |

Animations : essaims portés de l'app (`useDecisionSwarm` chaud/agité au-dessus de la zone, froid/groupé en dessous ; `useSwarm` du point forme selon le score), compte animé du chiffre, barre d'analyse, courbe qui se trace. Tout est coupé si l'appareil demande moins d'animations.

## 3. Règles décidées (à respecter en codant)

- Une idée par écran. Les choix dans une feuille du bas, claire (charte), avec un visuel en haut. Un tap fait avancer (rien de présélectionné).
- Titres autonomes : on lit le sous-titre de A puis le titre de B, donc pas de titres qui se répondent. Pas de titre en question pour un texte persuasif.
- Ton ingénieur de course : jamais « matin », « juge », « a le dernier mot », « calée / recalée » en lourdeur. Pas de calques de l'anglais.
- Épuré façon Opal en gardant la charte, mais **pas moins de texte qu'Opal** (Opal répartit sur plus d'écrans).
- Douleur = **frustration** (cadrage Y9De6KGJwZa3evPD8U69Uf) : son effort face à son plateau, la faute sur le programme figé, jamais sur lui. Carte 2 en pur problème (« Ton programme ne sait pas que ta forme varie »), sans affirmer qu'il n'ajuste pas déjà.
- Les ratios parlent plus que les comptes (« 1 séance sur 3 » plutôt que « 6 sur 24 »).
- Bibliothèque de programmes et générateur = réassurance (« inclus »), jamais un argument.
- « Annulation en 1 clic, sans engagement » sous les CTA de l'offre web ; CTA orientés bénéfice.
- Note du store juste après le déclic (pas de pré-question ; iOS : 3 fois par an **par personne**). Pas de note sur le web.
- Coach : jamais de vue coach en direct pendant la séance ; « sur l'app de ton sportif ».
- Ne pas promettre le rappel avant facturation tant qu'il n'est pas codé (marqué « à construire »).

## 4. Refusé (ne pas reproposer)

Tampons sur la carte · « juge » / « Direction » · écran « Bienvenue au club » · écran bilan « envie ≠ corps » · séance en direct avec séries dans l'onboarding (trop complexe, illustrée dans l'Avant / Après) · « Et aujourd'hui ? » et « Qu'as-tu prévu aujourd'hui ? » (on prend son score global) · question « Quand ? » · courbe de trajectoire classique avec « 5 h de sommeil » supposé · « Ton programme te suppose à 100, ta récup 58 » (un sportif peut être en forme tout le temps et rater ses bons jours, ou souffrir de monotonie) · Avant / Après façon Levels en lignes de texte (trop chargé) · « Ton parcours » Ajuste / Comprends / Anticipe (mots génériques) · écran « Je m'engage » · « Ton programme fixe le cap. Ta forme fixe la charge. » · « Ta séance s'ajuste à ta forme du jour » (galvaudé) · titres de présignup qui se répondent · angle assiduité côté coach (« Chloé ne fait plus son point forme ») · offre « qui s'imprime » · avis Google sur le web · retravailler le cas « Elles progressent encore ».

## 5. Ouvert / à faire

- **A/B position du signup** (2e écran vs plus tard) : voulu par Gildas (emails pour le drip). Variante proposée le 15/11 : signup juste avant `fact` (pic de curiosité, école Cravotta), **pas retenue pour l'instant**. Volume ≈ 130 vues de l'écran de compte par mois : indicateur = inscrits pour 100 démarrages d'onboarding, tri sur le flag de la personne.
- Relecture du 15/11 contre les références, décisions de Gildas : rappel J-2 / J-3, notif du lendemain et bilan J3 **codés au passage en local** (sinon l'écran `trial` ne part pas en prod) ; « 17 sur 26 » du paiement à marquer exemple **au vrai design en local** ; preuve sociale au paiement **pas retenue** (peur de surcharger) ; invitation d'un sportif côté coach = **chantier activation** (après le paiement, pas dans l'onboarding), mais condition de conversion de l'essai coach.
- DEPART30 (remise en offre de sortie) contredit Jonathan (Mobbin : pas de remise juste après l'onboarding, sortie = annuel → mensuel) : à trancher.

- **Inscription en 2e écran** : c'est notre plus grosse chute mesurée. Gildas la garde (Opal crée aussi le compte tôt, en « Petite question »). Piste pour l'app : compte invité anonyme (Supabase `signInAnonymously`) rattaché à Apple / Google au paiement. À décider après le POC.
- **Essaim discret en fond plein écran** sur l'écran de l'anneau (homéostasie bleue / inflammation orange, comme la pierre d'Opal) : proposé, pas validé. Si on l'adopte, le mettre aussi sur l'Accueil.
- Écran du chiffre : reprendre le **template des bilans** (`components/bilan/BilanCarousel.tsx`).
- Chiffres à mesurer avant la prod : la part de jours de forme basse côté coach (37 %, inventée), le modèle `lowShare()` côté sportif, et le bilan « 17 sur 26 » (réel ou aperçu ?).
- Vérifier que les tuiles programmes (Force 5×5, Texas, 5/3/1, Hypertrophie / Semi, 10 km, Marathon, Trail) et tests (1RM, détente, sprint 10 m, Squat Jump / Yo-Yo) existent dans l'app.
- Rappel J-2 / J-3 avant facturation à coder. Notification du lendemain, bilan au 3e jour : la conversion de l'essai se joue après l'onboarding.
- PostHog : un événement par nouvel écran (`ob_freq`, `ob_stag`, `ob_habits`, `ob_fact`, `ob_avap`, `ob_path`, `ob_trial_reminder`…) + achats iOS (angle mort NativeCheckout) + `paywall_close_reason`.
- Coach : parcours long (13 écrans). On pourrait fusionner la séance de demain et la décision sur Thomas.
- Vidéo de Gildas (20 s, « Pourquoi j'ai créé ThePerfClub ») à tourner.

## 6. Composants réels à réutiliser au codage

`theme.ts` (DARK_CARD_BG) · `wellness/PointFormeRing.tsx` (anneau 300 px, 240°, feuille à 10 crans, essaim) · `sessions/DecisionRing.tsx` (fluide, Braise via `lib/ringColors.ts`, voix « Gère\nl'effort », essaim) · `paywall/PricingPriming.tsx`, `RiskTimeline.tsx`, `interviews.ts` (photos `public/testimonials`) · `onboarding/PostSignupSteps.tsx` (QuestionShell, OptionCard, CTA pilule #d44000) · `coach/CoachRadar.tsx` (autoregBand) · `bilan/BilanCarousel.tsx` · `paywall/NativeCheckout.tsx` · `lib/plannedIntensity.ts` · `components/wellness/WellnessModal.tsx`.

## 7. Références

- **Cadrage stratégique NPE** : https://claude.ai/artifact/Y9De6KGJwZa3evPD8U69Uf (douleur = frustration, P = point forme → séance ajustée, bilans = enablers). Skill utilisateur `storytelling-tpc`, skill projet `ui-wording`.
- **Vidéos Mobbin** : onboarding https://www.youtube.com/watch?v=Qsq-Sj_rojU · paywalls https://www.youtube.com/watch?v=9ypqs_2fAl8 · Jonathan (4 700 paywalls) https://www.youtube.com/watch?v=E7RzEZ8GlHE. Leçons : la valeur avant le compte (Duolingo, Elma), le mot du fondateur au déclic, le paywall comme suite logique et en plusieurs pages, la frise d'essai (Blinkist), « sans engagement » sous le CTA, la carte obligatoire (Outsider ×5), pas de grosse remise juste après l'onboarding, 2 formules et l'annuelle par défaut, personnaliser le paywall.
- **Tim Gabe** (vidéos vues plus tôt) : « Frankenstein paywall » à éviter (trop chargé). Les questions miroirs ne viennent PAS de Gabe : elles viennent de Noom, BetterMe et de l'école Steven Cravotta (l'onboarding comme tunnel de vente : problème → solution → offre).
- **Opal** (enregistrement complet du 14/11, `references/opal/s_01..05.jpg` + captures) : intro de marque (pierre « recouverte de bruit »), conversation + prénom, compte tôt (« Petite question : tu as déjà un compte ? »), réaction à chaque réponse, « J'analyse tes réponses… », mauvaise puis bonne nouvelle avec chiffre roulant + source + « Changer ça », autorisations avec une flèche vers le bouton système, « Gildas, Opal te rendra 1 an de ta vie » + 3 puces + « Scellons ça avec un check », photo avant le paywall, rappel d'essai en maquette d'écran verrouillé, paywall en carrousel de 5 pages (projection perso, blocages, règles, progrès, invitations ; aucune preuve sociale) + annuel 0,27 €/jour + « Autres forfaits », réglages APRÈS le paiement. Opal ne parle jamais du « comment » avant le paywall.
- **Levels** (`references/levels-*.png`) : frise « path » en 3 étapes et Avant / Après en lignes. Seule l'idée de mise en page a été gardée ; la version texte a été refusée.
- **Swile** (vidéo d'onboarding + capture crypto) : interface en retrait, photo / fond, objet central → présignup.
- **Inspirations Mobbin** partagées par Gildas (5 liens ouverts dans son navigateur le 11/11) ; Blinkist (frise d'essai) ; Outsider (carte obligatoire).
- **POC liés** : présignup / inscription 25q1nk (https://claude.ai/artifact/25q1nkHMtHGGJem3mRV2n5), dont on garde le fonctionnement (rôle d'abord, email en lien secondaire).
- **Données** : Supabase 329 profils, 66 coachs, 5 275 points forme (11/11) ; PostHog depuis le 30/10 (funnels onboarding).

## 8. Historique des versions (artifact)

v1-3 (10-11/11) : séance prévue, point forme, bilan, offre ; bascule Sportif / Coach · v6-7 : vrais composants · v8-9 : présignup façon Swile, note native au déclic · v10-14 : ton ingénieur de course, titres autonomes, présignup en oppositions, 3 écrans · v15-19 : tampons retirés, bilan coach perf / récup, paiement natif par les stores, l'anneau suit le point forme · v20 : « Qu'as-tu prévu aujourd'hui ? » · v21-22 : courbe (refusée), chiffre façon Opal, carrousel du paiement · v23-28 : problème avant la démo, habitudes, chiffre « frustration » (78 h), cartes 2 et 3, format point forme global, carrousel de séances · v29-31 : sans date, titres bénéfice, coach à jour, preuve, coût de l'inaction · v32-36 : analyse Opal, 1 question par écran, épuré, feuilles claires, réactions, analyse, Avant / Après barres, « Ce que tu gagnes » · v37-39 : essaims, carrousel du paiement façon Opal · v40 (15/11) : relecture contre Cravotta / Mobbin / Tim Gabe → comportements dans `pf`, mot du fondateur après le déclic, paiement allégé (coût de l'inaction et vidéo retirés, programmes + tests fusionnés).
