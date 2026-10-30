# Historique « coach » (extrait verbatim de l'ancien CLAUDE.md, du plus ancien au plus récent)

Les sections récentes priment sur les anciennes. Toujours vérifier dans le code avant de s'appuyer sur un détail.

## Coach Control (`/coach`) — carte dark + wellness du jour actif fiable (2026-07-23)

Capitalise sur le chantier `/today` ci-dessus (comportements, `loadRule`), appliqué au dashboard coach.

### `CoachCard` — extrait dans `src/components/coach/CoachAthleteCard.tsx` (2026-07-27)
`CoachCard`/`WellnessRing`/`scoreColor`/`maxDiffToday`/`attention`/`riskScore`/`decisionText` ne vivent plus dans `CoachClient.tsx` — déplacés dans ce module partagé pour être réutilisés par l'aperçu Coach Control de l'onboarding (`week_preview_2b`, voir section Onboarding plus haut) sans dupliquer la logique. `CoachClient.tsx` importe désormais tout depuis là ; `DiffGauge` reste importé localement dans `CoachClient.tsx` (utilisé aussi ailleurs sur la page, hors `CoachCard`).

### `CoachCard` — refonte visuelle (description ci-dessous inchangée, juste déplacée de fichier)
Passe d'un layout 3-colonnes clair (ring | contenu | bouton) à une carte dark empilée verticalement, inspirée d'une maquette fournie par Gildas :
- Fond `linear-gradient(145deg,#1a1a1a,#282828)` — même dégradé que le widget "Lecture d'équipe" déjà présent sur cette page (pas une nouvelle couleur inventée).
- Ligne du haut : `WellnessRing` + `zoneLabel()` (texte "ZONE X", `src/lib/wellness.ts`) + **prénom seul** (`athlete.name.split(" ")[0]`) + badge "Attention requise"/"Traité ✓".
- **Chips comportements directement sous le prénom** (pas de ligne "{sport} · N séances" — retirée à la demande de Gildas, cet emplacement est réservé aux chips) — `BEHAVIOR_META` (voir plus bas), rouge/orange pour négatif, vert pour positif.
- Encart décision (`decisionText()`, inchangée) avec émoji (💛 attention / ✅ stable) et bouton d'action désormais **à l'intérieur** de l'encart (Décider/Revoir/Voir — libellés conservés, pas renommés en "Ajuster" uniforme : la distinction reviewed/non-reviewed porte une info réelle que la maquette ne montrait pas).
- Carte blanche imbriquée pour la séance la plus dure du jour (`getTopSession()`-like, réutilise le pattern déjà écrit dans `CoachPlanningClient.tsx` : nom, badge Terminé/Prévu, `DiffGauge`, liste d'exercices) — une seule séance affichée, `+N autres séances` en petit texte si plusieurs.
- Les deux badges pill précédents ("✓ Autorégulation active" statique, "📉 score→score") ne sont pas repris ici (spécifiques à `/today`, pas demandés sur cette carte).

### `src/lib/behaviors.ts` — nouveau module partagé
`BEHAVIOR_META` (emoji + label + `positive`, 14 clés) extrait de `conseils/page.tsx` (dupliqué une 2e fois dans `today/TodayClient.tsx` sous le nom `BEHAVIOR_LABELS`, format différent) — les deux fichiers importent désormais depuis ce module, `CoachClient.tsx` aussi. Un seul point de vérité pour l'emoji/label de chaque comportement.

### Bug corrigé : le score wellness affiché ne correspondait pas toujours au jour actif
**Root cause** : `coach_athletes.wellness_score` est une colonne dénormalisée qui garde la dernière valeur écrite, sans lien garanti avec le jour affiché. La requête initiale (`page.tsx`) prenait "la ligne `wellness_daily` la plus récente toutes dates confondues" au lieu du jour actif, et `handleDateChange` (`CoachClient.tsx`) ne rafraîchissait jamais le wellness au changement de date (seulement les séances) — un score pouvait être périmé de plusieurs jours sans que rien ne l'indique. Repéré par Gildas sur son propre compte (`Gildas`, auto-lié coach+sportif) : deux `coach_athletes.wellness_score` différents (56 et 85) pour la même personne selon la relation coach consultée, aucun des deux ne correspondant au jour réel (pas encore rempli).

**Fix — nouveau champ `CoachAthlete.wellnessFilledToday?: boolean`** :
- `page.tsx` : requête wellness filtrée `.eq("date", today)` (comme la requête sessions juste à côté) au lieu de "la plus récente" ; `behaviors` sélectionné en même temps (même ligne, jamais désynchronisé du score).
- `handleDateChange` : nouvelle route **`GET /api/coach/wellness?date=...`** (le client Supabase normal ne peut pas lire le `wellness_daily` d'un autre `user_id` — RLS `auth.uid() = user_id`, aucune exception coach — même pattern que `/api/coach/session` déjà existant : vérifie que le coach possède bien ces sportifs via le client normal, puis lit via le client admin) appelée en parallèle du fetch sessions, met à jour `wellness_score`/`behaviors`/`wellnessFilledToday` pour tous les vrais sportifs (pas seulement ceux avec une ligne trouvée — sinon l'absence de mise à jour laissait les valeurs de la date précédente affichées).
- Souscription temps réel (`postgres_changes` sur `wellness_daily`) étendue pour patcher aussi `behaviors`/`wellnessFilledToday` (ne mettait à jour que `wellness_score` avant), filtrée sur `row.date === today` (le vrai jour calendaire, pas `selectedDate` — nuance acceptée, cas rare de navigation de date + événement temps réel simultané).
- Quand `wellnessFilledToday === false` : `WellnessRing`/`scoreColor` (widened en `number | null`) affichent "—" au lieu d'un chiffre trompeur ; `decisionText`/`attention`/`riskScore` ignorent le score non rempli (seule une séance dure prévue peut encore déclencher une alerte) ; la moyenne wellness d'équipe (`avgWellness`) exclut ces sportifs. Sportifs démo (`user_id === null`) : toujours `wellnessFilledToday: true`, pas de notion de jour pour eux.
- Même correction dans **`CoachSessionModal.tsx`** (`ReviewContext.wellness` devient `number | null`) — la modale ouverte au clic "Décider" utilisait le même chiffre périmé pour construire ses "points d'attention" (`buildAttentionPoints`).

**Deuxième occurrence trouvée par Gildas juste après, sur `/coach/planning`** (`CoachPlanningClient.tsx`, `dayWellness()`) : cette fonction avait déjà un `wellnessMap` correct par date (requête sur la vraie plage affichée), mais retombait aussi sur `athlete.wellness_score` dès qu'aucune ligne n'existait pour le jour consulté — y compris pour de vrais sportifs. **Fix** : le repli sur `wellness_score` ne s'applique plus qu'aux sportifs démo ; pour un vrai sportif, absence de ligne = `null` (déjà bien géré par `scoreColor`/`formLabel` du même fichier, seul le fallback était fautif). Retenir : tout endroit qui affiche `CoachAthlete.wellness_score` doit distinguer "vrai sportif sans donnée du jour" (→ `null`/"non renseigné") de "sportif démo" (→ toujours la valeur fixe) — ne pas supposer que la présence d'un `user_id` suffit à garantir une donnée à jour.

## `/coach/athletes` en dashboard + invitation multi-sportifs + alerte Coach Control renforcée (2026-07-28)

Parti d'un POC exploré en artefact HTML (idée : remonter dans `/coach/athletes` un condensé de ce que `/conseils` montre déjà côté sportif — charge nerveuse/musculaire, récup, comportements — plutôt qu'une simple grille de cards wellness+sport+boutons), puis implémenté en vrai après validation visuelle.

### `src/lib/fatigueSignature.ts` — nouveau module partagé
`daysAgoStr`, `computeSignature`, `sigDimInfo`, `buildDailyTimeSeries` existaient uniquement dans `conseils/page.tsx` (page-local, non exportés) — extraits tels quels dans ce module pour devenir la source unique de ces seuils/formules. `conseils/page.tsx` importe désormais depuis là au lieu de les redéfinir ; comportement inchangé, refactor pur.

### `/coach/athletes` — liste avec signature de fatigue par sportif
`AthletesClient.tsx` : la grille de cards (`repeat(auto-fit,minmax(240px,1fr))`) devient une liste verticale pleine largeur. Le haut de chaque ligne (ring, nom, statut, boutons "Voir planning"/"Retirer") est inchangé — juste réaligné sur une seule ligne flex (texte `flex:1`, boutons `flexShrink:0`, alors qu'ils étaient empilés dans deux blocs séparés avant). En dessous, nouveau bloc signature :
- `page.tsx` (server) : pour chaque sportif réel (`user_id` non null), fetch les 10 derniers jours de `sessions` + `wellness_daily` (`admin.from(...).in("user_id", realUserIds).gte("date", since10)`), calcule `buildDailyTimeSeries(sessions, wellness, 10)` → `AthleteSignature` (`{ kind: "manual" | "no_data" | "ok", nervous, muscular, recovery }`, `kind` discriminé). Sportifs démo (`user_id === null`) → toujours `"manual"` ; sportif réel sans aucune ligne `wellness_daily` sur la fenêtre → `"no_data"` (pas de requête supplémentaire pour dater précisément "depuis N jours" — volontairement simplifié pour éviter un N+1).
- `AthletesClient.tsx` (`AthleteSignatureBlock`) : `"manual"` → *"Forme non renseignée — pas de signature de fatigue ni de récupération à afficher."* ; `"no_data"` → *"🕳️ Pas de wellness renseigné ces 10 derniers jours…"* ; `"ok"` → 3 mini-sparklines (`MiniSpark`, composant React local, SVG `width:100%`/`preserveAspectRatio="none"` pour rester responsive) reprenant le style visuel exact de `SparkLineClient.tsx` (aire remplie `fillOpacity:.12` + trait 2px + point plein pour les lignes ; colonnes arrondies `fillOpacity:.75` pour les barres) et ses couleurs (nerveux `#f04a08` fixe, musculaire `#f28a00` fixe/bar chart, récupération = `sigDimInfo("recovery", …).color` dynamique) — mais **sans libellé texte à côté de la courbe** ("COÛT ÉLEVÉ" etc., retiré à la demande de Gildas : la couleur et la forme suffisent) ni tooltip au survol (simplification assumée pour une liste dense ; le vrai graphe détaillé avec hover reste `/conseils`, 28 jours). Simplification supplémentaire : les jours sans wellness renseigné sont compressés (courbe reliant uniquement les points connus, pas d'axe temporel avec trous visibles).
- Layout : `.sig-grid` (`globals.css`) — classe déjà présente mais non utilisée nulle part dans le code, retravaillée pour cet usage : 3 colonnes fixes `minmax(0,170px)` sur desktop (pas `1fr` — sinon les 3 courbes s'étirent sur toute la largeur de la carte, ~1000px sur grand écran, avec un `justify-content:space-between` essayé puis abandonné car il créait un espace excessif entre les 3 au lieu d'un espacement fixe), 2 colonnes puis 1 colonne en dessous de 680px/480px (media queries déjà existantes dans le fichier, inchangées).
- Comportements fréquents (chips) : implémentés dans un premier temps (`countRecentBehaviors` dans `fatigueSignature.ts`, réutilisant `BEHAVIOR_META`) puis **retirés à la demande de Gildas** ("finalement") — fonction et champ `AthleteSignature.behaviors` supprimés du code plutôt que laissés morts.

### `InviteModal.tsx` — invitation de plusieurs sportifs en une fois
Ne gérait qu'un seul champ email. Reprend le pattern déjà en place dans l'étape `invite_team` de l'onboarding coach (`OnboardingFlow.tsx`, post-paiement) : état `extraEmails: string[]`, bouton "+ Inviter un autre sportif" qui ajoute une ligne (email + bouton ✕ pour la retirer), et `handleInvite()` envoie tous les emails non vides en parallèle (`Promise.all`, un `POST /api/invite/create` par email — la route ne change pas, elle ne gérait déjà qu'un email à la fois). Écran de résultat adapté : `sentCount > 1` → *"Invitations enregistrées ! Tes {N} sportifs rejoindront ton espace…"*, sinon le wording singulier existant inchangé. Échec partiel (ex. 2 envoyés sur 3) affiché en une ligne d'erreur agrégée, sans bloquer les invitations réussies.

**`CoachClient.tsx` (`/coach`, dashboard Coach Control) utilisait une modale invite dupliquée et non alignée** (un seul champ email, sa propre logique `inviteEmail`/`inviteStatus`/`inviteError`/`handleEmptyInvite`, sans le lien d'invitation copiable ni WhatsApp) — remplacée par le vrai composant partagé `<InviteModal onClose={...} onLinked={() => router.refresh()} inviteCode={inviteCode} />`, exactement comme `AthletesClient.tsx`. Le bandeau "Invite ton premier sportif" affiché quand `athletes.length === 0` (formulaire email simple, sans modale) n'a pas été touché — hors périmètre de la demande, garde `inviteEmail`/`handleEmptyInvite`.

### `CoachAthleteCard.tsx` — alerte visuelle renforcée pour "attention requise"
Le point rouge clignotant seul (`perf-pulse`, existant) ne se voyait pas assez selon Gildas. Ajouts, au même rythme (1.8s) et sous la même condition (`showBadge` : priorité + pas encore traité) :
- Bordure : 1.5px → 3px, nouvelle animation `perf-border-pulse` faisant varier `border-color` (`rgba(212,64,0,.4)` → `rgba(212,64,0,1)`) et un second `box-shadow` en halo (`0 0 0 0` → `0 0 16px 3px rgba(212,64,0,.55)`), en plus du `box-shadow` de profondeur existant (conservé, deux ombres comma-séparées).
- Encart décision : le bouton Décider/Revoir/Voir passe d'un empilement vertical (texte puis bouton en dessous) à une ligne flex (texte `flex:1`, bouton `flexShrink:0`) — demandé séparément par Gildas, même esprit que le réalignement fait sur `/coach/athletes`.
- Se propage automatiquement à l'aperçu Coach Control de l'onboarding (`WeekPreviewStep.tsx`, `role === "coach"`) qui importe `CoachCard`/`attention` depuis ce même fichier — vérifié : `previewIsPriority = attention(previewAthlete, currentDiff)` est calculé dynamiquement selon le jour démo sélectionné, donc l'alerte visuelle (bordure + halo) y apparaît aussi sans travail supplémentaire. **Asymétrie notée avec le côté sportif** : l'aperçu wellness de la même page (`role !== "coach"`) ne réutilise que des fonctions de logique (`zoneLabel`, `getRecoveryAdvice`, `loadRule`), pas un composant carte partagé — son JSX est dupliqué à la main, donc un futur changement purement visuel sur la vraie carte `/today` ne s'y répercuterait pas automatiquement (contrairement au côté coach).

Testé en local à chaque étape (`tsc --noEmit`, service worker/cache PWA à vider entre chaque test — voir section Notifications push), puis en prod par Gildas. Déployé en 4 commits séparés (`f90128d`, `4677d15`, `7b622c8`, `99e4e1c`), chacun poussé sur `main` et vérifié `READY` sur Vercel avant de passer au suivant.

## Invitation coach → sportif — deux bugs bloquants corrigés (2026-07-23)

Repéré par Gildas en essayant de lier `cauvingildas@gmail.com` (compte sportif déjà existant) à `contact@theperfclub.com` (coach) :

1. **`POST /api/invite/create`** vérifiait l'existence d'un compte via `fetch(".../auth/v1/admin/users?email=...")` — ce paramètre `?email=` n'est pas un filtre supporté par l'API admin Supabase (confirmé via la doc officielle : `listUsers()` n'accepte que `page`/`perPage`, pas de filtre email), l'appel renvoyait donc juste la 1ère page (50 users par défaut). Sur 84 users au total, le compte cherché n'y était pas forcément → traité à tort comme "pas encore inscrit", créant une invitation en attente (`coach_invites`) au lieu de lier directement. **Fix** : `admin.auth.admin.listUsers({ page: 1, perPage: 1000 })` (méthode du SDK, pas de fetch brut).
2. **Aucun mécanisme pour qu'un compte déjà inscrit rattrape une invitation en attente** : `POST /api/invite/link` (consomme une ligne `coach_invites` pending et lie le sportif) n'était appelé que dans `OnboardingFlow.tsx`, à la création du compte — jamais pour quelqu'un qui se connecte normalement après coup. **Fix** : `TodayClient.tsx` appelle `/api/invite/link` au montage si `!hasCoach`, en silence (pas de toast, juste `router.refresh()` si `ok`).

Confirmé en base sur le cas réel de Gildas : la ligne `coach_invites` est passée de `pending` à `accepted` et `coach_athletes.user_id` a été rempli automatiquement dès le rechargement de `/today` en local, sans intervention manuelle.

## Invitation coach → sportif — 3 causes bloquantes corrigées (2026-07-28)

Remonté par un client payant réel (`mezghadsport@gmail.com`) : impossible d'ajouter des joueurs à son groupe, ni par email ni par lien. Investigation directe (code + requêtes SQL sur le projet Supabase prod) — trois causes distinctes, confirmées par des preuves concrètes (DB + grep), corrigées dans le même chantier :

1. **L'email d'invitation n'était jamais envoyé** — `POST /api/invite/create` se contentait d'écrire en base (`coach_invites` + placeholder `coach_athletes`), aucun envoi d'email n'existait dans le code malgré le package `resend` installé (`package.json`, jamais importé nulle part) et une variable `RESEND_API_KEY=re_placeholder` en `.env.local` jamais remplacée. Confirmé en base : l'invitation du coach concerné était restée "pending" indéfiniment, l'adresse invitée n'ayant jamais eu de compte créé. **Fix** : nouveau `src/lib/email/inviteEmail.ts` (`sendCoachInviteEmail`, HTML table-based avec les constantes de design habituelles, via le SDK `resend`), appelé dans `src/app/api/invite/create/route.ts` juste après la création de l'invite en attente — best-effort (try/catch, ne fait jamais échouer la requête), avec un warning silencieux si la clé est absente/placeholder. **Mise à jour 2026-07-28 (même jour)** : vraie clé `RESEND_API_KEY` fournie par Gildas, posée dans `.env.local` et sur Vercel prod (`vercel env add`, projet `tpcv-12`, confirmé via `vercel env ls production`). Domaine `theperfclub.com` enregistré côté Resend (`POST /domains`). **Les 3 enregistrements DNS ont été ajoutés directement dans la zone OVH** (`manager.eu.ovhcloud.com`, domaine géré chez OVH — pas de registrar tiers) via browser automation : TXT `resend._domainkey` (clé DKIM), MX `send` → `feedback-smtp.us-east-1.amazonses.com` (priorité 10 — piège rencontré : le champ "Priorité" affichait "10" par défaut mais n'était qu'un placeholder non soumis tant qu'il n'était pas explicitement retapé, le bouton "Ajouter" restait grisé sans message d'erreur visible), TXT `send` → `v=spf1 include:amazonses.com ~all`. Propagation confirmée instantanée (`dig` sur `ns20.ovh.net` et sur `8.8.8.8`, les 3 valeurs correspondent exactement à celles demandées par Resend). **Domaine passé à `verified` côté Resend le 2026-07-28, quelques minutes après l'ajout des enregistrements** (confirmé via l'API `GET /domains/:id`) — la cause #1 est désormais réellement résolue de bout en bout : `sendCoachInviteEmail` peut envoyer depuis `invitations@theperfclub.com`. Reste seulement à déployer le code (voir plus bas) pour que ça s'applique en prod.

2. **Le lien `/join/[code]` forçait tout le funnel consommateur** — `register/page.tsx` rendait l'onboarding complet (diagnostic, pain points, sport/niveau/objectif/jours, paywall) pour tout visiteur non connecté, sans jamais regarder si un `coach_invite_code` était présent en localStorage.

3. **Le paywall Stripe obligatoire bloquait tout nouveau sportif, invité ou non** — sans rapport avec le statut d'abonnement du coach lui-même (mur inconditionnel pour tout compte "athlete" créé). L'app gère pourtant déjà un accès gratuit via coach (`usePaywall.ts`/`(app)/layout.tsx` : `isActive = ... || (subscription_status==="free" && hasCoach)`), mais l'onboarding ignorait cette règle. Confirmé en base : zéro sportif n'avait jamais été lié à ce coach.

**Fix des causes 2 et 3, un seul mécanisme** (`src/components/onboarding/OnboardingFlow.tsx`) :
- Nouveau tableau `INVITE_ATHLETE_PATH: StepId[] = ["value_intro", "role", "account", "celebration"]` (mis à jour 2026-07-31 : `"role"` retiré, devenu `["value_intro", "account", "celebration"]` — voir section dédiée plus bas) — aucun nouveau `StepId`, réutilise les steps existants, n'inclut ni diagnostic ni `paywall_priming`/`paywall_form` : le sportif atterrit sur `/today` avec `subscription_status="free"` + `hasCoach=true` sans jamais voir de mur de paiement.
- États `hasCoachInvite`/`coachInviteCode`/`inviteJoinFailed`. Résolution de `coach_invite_code` (localStorage) dans le **même** `useEffect` que `claim_program_id` (ordre de déclaration important, cf. bug déjà documenté plus haut sur l'ordre des effets) — validation asynchrone via une nouvelle route publique **`GET /api/invite/validate?code=...`** (même pattern que `GET /api/programs/[id]`), qui peut rétrograder `hasCoachInvite` à `false` si le code est invalide.
- `getPath()` : `hasCoachInvite` a priorité absolue sur `assignedVariant` (bras A/B) et `hasClaimedProgram` — une invitation coach est plus spécifique.
- `handleFinish()` : après l'appel existant à `/api/invite/link`, si `role==="athlete" && hasCoachInvite`, appelle `/api/invite/join` et **vérifie le résultat** avant de marquer `profiles.onboarding_done = true` (auparavant l'appel n'était jamais vérifié). En cas d'échec (code invalidé entre l'ouverture du lien et la soumission), bascule `hasCoachInvite=false` — retombe sur le funnel payant standard plutôt que de laisser un compte gratuit non lié en accès permanent non détecté. Nouvel effet dédié (`inviteJoinFailed`) recalcule `stepIdx` via `path.indexOf("account") + 1`, jamais `next()` — même règle que le bug déjà documenté sur la continuation Google OAuth (avancer d'un cran sur un ancien index tombe au mauvais endroit après un changement de path).
- **Continuation Google OAuth** : gap distinct trouvé pendant l'investigation — cette branche n'appelait **jamais** `/api/invite/join`, même avant ce chantier. Même fix ajouté (appel + vérification avant `setGoogleInitDone(true)`) ; le `useEffect [googleInitDone]` déjà existant recalcule `path`/`accountIdx` à jour, pas besoin d'un effet dédié supplémentaire ici.
- **`src/app/join/[code]/JoinRedirect.tsx`** : redirige vers `/register?role=athlete` (au lieu de `/register` nu) — réutilise le pré-remplissage de rôle déjà existant pour sauter `value_intro`/`role` visuellement sans code supplémentaire.

**Limite acceptée** : dans le cas rare où le lien coach échoue pile au moment de la soumission du formulaire, le fallback saute les questions sport/niveau/objectif/jours et `completeProfile()` (jamais déclenché, puisqu'il ne se déclenche qu'à l'entrée de `profile_recap`, jamais visitée par `INVITE_ATHLETE_PATH`) — un sportif dans ce cas précis se retrouverait avec un compte payant mais sans programme généré. Fenêtre de déclenchement très étroite, accepté comme limite connue plutôt que sur-ingénierer une reprise complète.

**Non traité, action manuelle recommandée** : une 4e cause possible (non confirmée par les données, aucun compte joueur n'existait en base pour vérifier) — la création de compte est "passwordless" et dépend à 100% d'un email Supabase Auth (`resetPasswordForEmail`) pour que l'utilisateur puisse se reconnecter plus tard. Si la délivrabilité de ce canal est aussi capricieuse que celle des invitations (le projet a déjà été flaggé par Supabase pour bounces), un sportif qui ne reçoit jamais cet email resterait bloqué au prochain login. Recommandation : configurer un **SMTP personnalisé** dans Supabase Dashboard → `Authentication → Settings → SMTP Settings` (réutiliser Resend une fois son domaine vérifié) pour sortir du SMTP partagé par défaut.

**Isolation analytics (action manuelle, dashboard PostHog)** : comme pour le trafic "programme claimé", ajouter le filtre personne `onboarding_source is_not "coach_invite"` aux funnels existants (4403213/4403222/4745753/4745754) une fois déployé, sinon ce nouveau trafic (qui ne passe jamais par `frustration_2a`/`profile_recap`/`paywall_*`) gonfle artificiellement leur taux de chute après "Rôle".

**LIVRÉ 2026-07-28** — vérifié par `tsc --noEmit` + `npm run build`, commité (`5f083c5`) et déployé en prod (push `main`, Vercel auto-deploy), testé par Gildas directement en prod et confirmé fonctionnel.

## Alerte "jour prioritaire" (halo) portée dans le vrai produit — /week + /coach/planning (2026-08-06)

Suite directe de la section précédente : une fois le composant validé dans l'aperçu onboarding, Gildas a demandé de le porter dans le vrai produit, sur la carte "Aujourd'hui" du carrousel `/week` (sportif) et `/coach/planning` (coach), avec les vrais cas déjà documentés en prod (mêmes tableaux de seuils que ci-dessus). Clarification explicite en cours de route : affichage **uniquement sur la carte "Aujourd'hui"**, pas sur tous les jours où la condition serait vraie (contrairement à une première intuition envisagée pour l'aperçu onboarding, cf. section précédente).

**Extraction DRY** : `src/lib/alerts.ts` (nouveau) porte désormais `athleteAlertFor()`/`coachAlertFor()`, déplacés hors de `WeekPreviewStep.tsx` pour être partagés avec le vrai produit — `athleteAlertFor()` gagne un 3e paramètre `wellnessFilledToday: boolean` (l'onboarding l'appelle toujours avec `true`, aucun changement de comportement) et inclut désormais le cas "wellness non rempli" (déjà en prod dans `TodayClient.tsx`, absent de l'aperçu onboarding qui force toujours un score). `src/components/calendar/AlertBox.tsx` (nouveau) porte le markup sombre halo/pastille, extrait de `DayColumn.tsx` pour être réutilisable là où `DayColumn` n'est pas utilisé (`CoachPlanningClient.tsx`, qui a sa propre carte jour dupliquée, non migrée vers `DayColumn` par prudence — trop de logique/handlers spécifiques au flux coach pour un premier portage).

**Sportif (`WeekClient.tsx`)** : sur la carte où `dstr === todayStr`, calcul du `maxDiff` identique à `TodayClient.tsx` (séances non terminées du jour uniquement, `target_difficulty`), `wellnessFilledToday` = wellness du jour présent + `bedtime != null` (même convention que `handleTerminer()`), score = `wellness.score` brut (la même valeur déjà affichée par la ring de la carte — jamais une valeur recalculée différemment, pour ne pas contredire visuellement ce qui est déjà montré).

**Coach (`CoachPlanningClient.tsx`)** : `CoachPlanningClient.tsx` n'utilise pas `DayColumn` (carte dupliquée inline) — plutôt que migrer toute la carte (risque sur les handlers réels : `CoachSessionModal`, `CoachCompleteModal`, pas de bouton dupliquer côté coach contrairement à `WeekSessionCard`), seul l'encart a été rendu conditionnel (`AlertBox` si `coachAlertFor()` renvoie un cas, sinon la rule-box existante inchangée). **Bug trouvé par Gildas en test réel, corrigé le jour même** : la première version passait l'objet `athlete` tel quel à `coachAlertFor()`, en supposant que `athlete.wellness_score`/`wellnessFilledToday` (dénormalisés côté serveur au chargement de la page, même convention que `/coach`) reflétaient toujours le jour affiché — faux pour un vrai sportif dont le wellness a été renseigné/rafraîchi après le chargement initial : la ring de la carte (alimentée par `dayWellness()` via `wellnessMap`, mis à jour en temps réel) affichait 30 alors que l'alerte ne se déclenchait pas, car `athlete.wellness_score` était resté sur une valeur périmée. **Fix** : construction d'un objet `{ ...athlete, wellness_score: wellness ?? 0, wellnessFilledToday }` où `wellness` est la même variable déjà utilisée pour la ring (`dayWellness(athlete, dstr, wellnessMap)`) et `wellnessFilledToday` dérivé de la présence d'une entrée dans `wellnessMap[athlete.user_id]?.[dstr]` (vrai sportif) ou `true` (sportif démo, toujours "rempli" par construction). `maxDiff` via `maxDiffToday(athlete.id, sessions...)`, la même fonction que `/coach` (dashboard principal), pas une réimplémentation.

**Bug de contraste corrigé en chemin** (préexistant dans `DayColumn.tsx` depuis la section précédente, invisible tant que l'alerte ne sortait pas de l'onboarding) : le label "Séances · N" et la boîte "Repos / libre" passaient en blanc/quasi-transparent dès qu'un `alert` était présent — reliquat d'une itération où toute la carte du jour passait en sombre (revert incomplet). Comme la carte reste **toujours blanche** (seul l'encart lui-même est sombre), ce texte devenait quasiment illisible en blanc-sur-blanc. Fix : couleurs redevenues fixes (`#8a8f94` / `rgba(0,0,0,0.12)`), plus de branchement sur la présence d'une alerte.

**Scroll horizontal vers le jour cliqué (ring du header)** : dans les deux fichiers, le `useEffect` de scroll ne ciblait que "aujourd'hui" (`todayIdx`/index figé), donc cliquer une ring d'un autre jour dans `CalendarHeader` ne faisait rien visuellement dans `/week`, et dans `/coach/planning` le carrousel « re-snappait » systématiquement sur aujourd'hui même après un clic sur un autre jour. Fix : l'effet cible désormais l'index de `selectedDate` (déjà mis à jour par le clic sur la ring via `onDateChange`/`selectDay()` dans `CalendarHeader.tsx`) au lieu de `todayStr` — `selectedDate` valant `todayStr` par défaut au montage, le comportement par défaut (scroll vers aujourd'hui) est inchangé.

**Incident de tooling en cours de route** : lancer `npm run build` (vérification) pendant que `next dev` tournait en parallèle sur le même dossier a corrompu le `.next` du serveur dev (`next build`/`next dev` partagent le même répertoire de sortie) — 404 sur les chunks JS/CSS en local, repéré par Gildas en testant. Fix : `rm -rf .next` + redémarrage propre de `next dev`. Leçon retenue : ne plus relancer `npm run build` pendant qu'un `next dev` est actif sur le même repo sans le relancer juste après.

**Vérifié** : `tsc --noEmit` + `npm run build` propres après chaque itération. Testé en conditions réelles par Gildas lui-même (connexion avec son propre compte — Claude n'entre jamais les identifiants d'un vrai compte, règle de sécurité permanente) sur `/week` (sportif, ok direct) et `/coach/planning` (coach, bug wellness périmé trouvé et corrigé le jour même, confirmé fonctionnel après fix). Pas de test de paiement (aucun rapport avec ce chantier).

## Planning coach — tokens, drag & drop, reconduire (2026-08-13)

Point de départ : un POC standalone (`tpc_editor_v2.html`, vanilla JS, aucun rapport avec le vrai repo) explorant 4 features pour l'édition de séances — copier une séance depuis J-7, autocomplete d'exercices token-aware, drag & drop (séances entre jours, exercices dans une séance), et "Reconduire" une semaine sur plusieurs semaines suivantes avec un % de charge. Portées dans le vrai produit sur `/week`, `/coach/planning` et l'éditeur de programmes, en plusieurs itérations suite aux retours de Gildas sur chaque brouillon.

**Contrainte de départ, tenue de bout en bout** : `sessions.notes` et `programs.template[].notes` partagent le même format texte libre `\n`-séparé, lu à l'identique par 6+ points de code du repo (dont les 49 templates publics de la bibliothèque). Aucune des features ci-dessous n'introduit de format structuré stocké — `notes` reste toujours du texte simple en sortie, les tokens/DnD/reconduire assistent la saisie/manipulation sans jamais changer ce que les lecteurs existants voient.

### Autocomplete d'exercices token-aware
`src/lib/exerciseAutocomplete.ts` (moteur pur) + `src/components/sessions/ExerciseGhostEditor.tsx` (UI partagée). Reconnaît 4 familles de tokens en tapant du texte libre — nom d'exercice, volume (NxM, OTM/EMOM/AMRAP, durée, distance), intensité (`@ kg`, %, RPE), contrainte (RIR, vitesse, allure, zone FC, repos, tempo, effort subjectif, progression, échec, côté/alternance) — avec un dropdown flottant et un mode "token suivant" qui s'auto-suggère après acceptation (sans avoir à recliquer dans le champ). Remplace le champ "un textarea par exercice" par un textarea global unique ("une ligne = un exercice"), même composant utilisé par `AddSessionModal.tsx` (sportif) et `CoachSessionModal.tsx` (coach) — élimine une duplication qui existait déjà entre les deux avant ce chantier.

**Base de suggestions, deux couches** :
1. Base statique (`HISTORY`, ~185 exercices) — étendue à partir de la vraie banque du générateur de programmes (`EXERCISES`/archétypes dans `generate/route.ts`, ~30 catégories de sport) plutôt que réinventée à la main, après un premier passage jugé trop pauvre par Gildas ("j'ai même pas tractions ou course").
2. Historique réel de l'utilisateur (`buildUserHistory()`/`setUserHistory()`/`resetUserHistory()`) — parse les 60 dernières séances réellement faites (`done=true`) et fait passer ces exercices-là en priorité dans l'ordre de suggestion, devant la base statique. État module-level volontaire (un seul éditeur de séance est jamais monté à la fois dans l'app), réinitialisé au démontage pour ne jamais laisser fuiter l'historique d'un sportif vers un autre. `AddSessionModal` reçoit un prop `userId` optionnel et fetch en direct (RLS déjà scopé sur soi-même) ; `CoachSessionModal` passe par une nouvelle route `GET /api/coach/session-history?athleteId=X` (RLS bloque la lecture cross-user même pour un coach, nécessite le client admin côté serveur — même garde d'accès que `/api/coach/session`).

**Pas fait, scope délibérément limité** : `ProgramBuilderModal` (édition de template, sans utilisateur réel associé) reste sur la base statique seule. Suggestions croisées (proposer les accessoires habituels après un squat) et complétion de blocs (reconnaître la convention A/B/C lettrée) — évoqués dans le brief du POC comme extensions futures, pas construits.

### Drag & drop
`src/components/calendar/DraggablePlanning.tsx` (wrappers `@dnd-kit/core` partagés, nouvelle dépendance) — séances déplaçables entre jours + exercices réordonnables dans une séance, sur `/week`, `/coach/planning` **et** `ProgramBuilderModal` (mutations locales sur le template, aucune écriture DB tant que le programme n'est pas sauvegardé). `DayColumn`/`WeekSessionCard` (`src/components/calendar/DayColumn.tsx`) rendus génériques (`<T extends SessionLike>`) pour accepter aussi bien `Session` (sportif) que `CoachViewSession` (coach) — **`/coach/planning` n'a plus sa propre carte-jour dupliquée**, il rend le même `DayColumn` que `/week` (demande explicite de Gildas, "ça devrait être techniquement exactement le même composant"). Écriture réelle en base pour `/week`/`/coach/planning` (`sessions.date`/`sessions.notes` via update direct pour le sportif, via `callSessionAPI` admin pour le coach — RLS bloque l'écriture cross-user directe). Bonus de cette unification : le coach gagne la capacité de dupliquer une séance (`DuplicateModal.tsx` généralisé sur `SessionLike`), absente avant ce chantier.

**Pas fait** : réordonnancement de colonnes-jours entières (swap Lundi↔Mardi en un geste) — jugé pas nécessaire par Gildas, déjà atteignable en glissant chaque séance individuellement d'un jour à l'autre. Tactile mobile jamais testé sur un vrai appareil (dnd-kit `PointerSensor` gère nativement souris + tactile, donc probablement fonctionnel, mais non vérifié).

### Reconduire — généralisé, positionnel
`src/components/sessions/ReconduireModal.tsx` : mode Décharge/Maintien/Surcharge + % personnalisé, nombre de semaines, aperçu avant/après (charges kg **et** difficulté prévue — `adjustDifficulty()` dans `src/lib/loadAdjust.ts`, même facteur multiplicatif que `parseAndApply()` sur les kg, appliqué à `target_difficulty` — bug trouvé par Gildas : la difficulté restait inchangée alors que les charges bougeaient, ce qui désynchronisait aussi les jauges `avgWeekRpe` de `ProgramBanner`/`ProgramBuilderModal`, dérivées de `target_difficulty`). Généralisé en **positionnel** (`dayIndex` 0-6, Lun→Dim) plutôt que sur des dates réelles — un seul composant sert `/week`/`/coach/planning` (dates concrètes) **et** `ProgramBuilderModal` (clés de jour "Lun".."Dim" du template, sans date). Chaque appelant traduit `dayIndex` vers sa propre notion de jour et persiste à sa façon (insert Supabase direct, `callSessionAPI`, ou `setTemplate` local).

CTA intégré dans `ProgramBanner.tsx` (état "Aucun programme actif", bouton secondaire à gauche de "📚 Programmes") plutôt qu'en ligne séparée au-dessus de la grille — **une proposition initiale de Gildas (jauges RPE 4 semaines + CTA en simple "+") a été challengée et refusée** (moins découvrable qu'un bouton texte, créait un trou d'accès si un programme est actif, mélangeait info passive et action) ; Gildas a tranché lui-même vers la version simplifiée livrée, après avoir explicitement demandé ce challenge plutôt qu'une exécution telle quelle. Dans `ProgramBuilderModal`, le "+" à côté des barres de semaines ouvre désormais la modale (avec ajustement de charge) au lieu de dupliquer la dernière semaine à l'identique — remplacé par un vrai bouton "Reconduire la semaine →" en bout de barre.

**Copier séance J-7** : construit en itération 1 (bouton sur `DayColumn`, lookup semaine précédente), puis **retiré entièrement** à la demande de Gildas — Reconduire couvrant déjà ce besoin, jugé redondant.

**Pas fait** : mode "Programme libre" (template vierge sans exercices prédéfinis) et "Cycle 1 semaine" (durée de cycle dans la création de programme) — évoqués dans le brief du POC, jamais abordés (concernent la *création* d'un programme, pas son édition, hors périmètre de ce chantier qui n'a touché qu'`AddSessionModal`/`CoachSessionModal`/`DayColumn`/`ProgramBuilderModal`).

### Suite le même jour — généricité de l'autocomplete, décharge/surcharge sur le volume, zoom mobile, refonte Reconduire, bug d'édition programme trouvé en testant en direct

**Autocomplete, généricité au-delà de l'historique de Gildas** — deux bugs réels trouvés en challengeant la question posée par Gildas ("le système est assez générique ou on a mes exercices en référence ?") plutôt qu'en se contentant de valider :
- `extractNameCandidate()` (`exerciseAutocomplete.ts`) ne reconnaissait aucun nom d'exercice commençant directement par une quantité de temps/distance ("400m", "30 min", "4:30/km") — la regex exigeait un préfixe non-numérique. Fix : `LEADING_QUANTITY_RE`, fallback couvrant km/min/h/sec/s/m et les allures type `4:30/km`.
- `suggestNextToken()` gâtait la suggestion d'intensité derrière la présence du volume (if/else-if enchaîné) — un user qui tape l'intensité avant le volume, ou uniquement un volume sans jamais de nom reconnu, ne recevait aucune suggestion pertinente. Fix : checks indépendants par catégorie (volume manquant, puis intensité manquante, chacun sans dépendre de l'autre), recoupement volume→intensité en repli si le nom n'est pas reconnu, contraintes seulement si les deux sont déjà présents.
- **Suggestions "valeurs proches" en mode clic** (cliquer un token déjà complet, ex. "80kg" → 75/87,5/90 ; "3x3" → 4x3/5x3/3x4) : la logique de clic réutilisait par erreur le filtrage par préfixe du mode saisie, qui ne trouve presque rien une fois la valeur entière déjà tapée. Nouvelles fonctions dédiées `nearbyValues()`/`completeAtIntensityNear()`/`completeNxMNear()` (varie sets ET reps) + `sortByProximity<T>()` générique appliqué aux branches BPM/vitesse/allure/VMA/repos. Bug secondaire trouvé au passage : le clic BPM appelait `completeBPM("")` (chaîne vide, aucune valeur à comparer) au lieu de passer le nombre réellement cliqué.

**Décharge/surcharge étendue au volume, pas seulement kg/difficulté** (`src/lib/loadAdjust.ts`) — `parseAndApply()` ne scalait avant que les kg ; nouvelles passes regex pour NxM (reps seules, sets inchangés), reps isolées, distance km/m (arrondi 0,5km/5m), durée min/h/s/`1h30` composite (arrondi au multiple de 5), OTM/EMOM/AMRAP, rounds/tours. **Bug de decimal-comma trouvé et corrigé** : la regex kg "bare" re-matchait par erreur la partie fractionnaire d'une valeur déjà transformée par la passe précédente (`"@150kg"` → `"@ 127,5 kg"` → la passe suivante retrouvait un `\b` juste après la virgule et retraitait le "5" isolé), produisant des sorties corrompues type `"127,4,5 kg"`. Fix : lookbehind supplémentaire `(?<![.,])` avant le nombre matché.

**Zoom mobile au focus** : tous les champs de saisie de l'éditeur (`ExerciseGhostEditor`, dates/noms dans `AddSessionModal`/`CoachSessionModal`/`ProgramBuilderModal`) passés à `fontSize: 16` — en dessous, iOS Safari zoome automatiquement la page au focus.

**Refonte visuelle `ReconduireModal.tsx`**, sur retours explicites de Gildas avec référence visuelle : slider remplacé par des chips discrets à exactement `±2,5 / 5 / 10 / 15 / 20%` ; section "Nombre de semaines" (stepper +/-) supprimée entièrement, toujours 1 semaine reconduite (signature `onConfirm(weeks: ReconduireOutputRow[][])` conservée telle quelle — `handleConfirm` construit directement `[rows]`, les 3 appelants `/week`/`/coach/planning`/`ProgramBuilderModal` n'ont eu aucune modification à faire) ; impact difficulté visualisé via deux `DiffGauge` avant/après par séance concernée (pas seulement le texte) ; aperçu "Aperçu des modifications" redessiné pour mobile — badge jour + badge "N modif." par séance, bordure gauche colorée, ligne barrée directement au-dessus de la nouvelle valeur en gras (au lieu d'un texte "avant → après" sur une ligne).

**Bug trouvé en testant réellement en direct dans le navigateur (pas seulement en relisant le code)** : Gildas a signalé ne plus pouvoir éditer une séance dans un programme de la bibliothèque, sauvegardé ou non. Une première investigation (relecture complète de `ProgramBuilderModal.tsx`, sans clic réel) n'avait rien trouvé. Reproduit ensuite en cliquant directement dans Chrome (compte réel de Gildas, lecture seule, jamais de sauvegarde) : cliquer sur le header de la carte séance ouvrait bien l'édition, mais cliquer sur une ligne d'exercice — qui occupe visuellement l'essentiel de la carte — ne faisait rien. Root cause : `SessionTemplateCard` posait `onClick={e => e.stopPropagation()}` sur chaque wrapper de ligne d'exercice, pensé pour protéger le drag & drop alors que le handle de drag (`⠿`) a déjà ses propres listeners isolés et n'en avait pas besoin — ce `stopPropagation` avalait silencieusement tout clic sur la zone d'exercices. `DayColumn.tsx` (`/week`, `/coach/planning`) n'a jamais eu ce `stopPropagation` sur ses lignes d'exercice, donc ces deux surfaces n'étaient jamais concernées — cohérent avec le fait que Gildas ne l'ait signalé que sur l'éditeur de programme. Fix : `stopPropagation` retiré, testé à nouveau en direct (clic sur une ligne → modale "Modifier la séance" s'ouvre).

**Leçon retenue** : une relecture de code, même complète, peut manquer un bug d'interaction (event bubbling/stopPropagation) qui ne se révèle qu'au clic réel — quand un rapport utilisateur contredit une lecture de code jugée propre, préférer reproduire en direct (lecture seule, sans mutation) plutôt que de re-garantir sur la seule base du code.

### Vérifié
`tsc --noEmit` propre après chaque itération (seule erreur résiduelle récurrente : `.next/types/.../generate/route.ts`, pitfall `next dev` concurrent déjà documenté ailleurs dans ce fichier, fichier jamais touché par ce chantier). `npm run build` propre (dev server arrêté avant, `.next` vidé, relancé après — même précaution documentée ailleurs dans ce fichier). Vérification visuelle en lecture seule sur le compte réel de Gildas (trouvé déjà connecté dans Chrome local à plusieurs reprises pendant la vérification) — navigation et captures, plus cette fois un vrai clic reproduisant puis confirmant le fix du bug d'édition (ouverture de la modale, jamais de sauvegarde). Un mismatch d'hydratation React rencontré pendant une vérification précédente (bouton Reconduire : style serveur correct, style client périmé) s'était avéré être le service worker cache-first déjà documenté dans ce fichier — pas un bug de code, résolu en vidant le cache.

**Non testé par Claude** : le drag & drop réel (glisser une séance/un exercice), la confirmation effective d'un Reconduire (écriture DB), et l'acceptation d'une suggestion d'autocomplete jusqu'à sauvegarde — seuls `tsc`/`build`/lecture de code/clics de navigation en lecture seule ont été faits. Gildas doit valider ces parcours mutants lui-même après déploiement.

Déployé en prod le 2026-08-13 (commit `5c20f3d` puis `68e9b57`, push direct sur `main`).

## Retour coach sur l'exercice — éditeur façon Notion, vidéo/photo/commentaires, notification (2026-08-14)

Point de départ : un coach a proposé 6 idées en feedback (vidéo de démo sur un exo, retour du sportif au même endroit, chat, communauté, capteurs Whoop/Oura, copier-coller de cycle). Priorisées avec Gildas ("vidéo/retour sur l'exo" + "capteurs" en tête, chat/communauté écartés) puis explorées en artifact Claude avant tout code réel — plusieurs itérations de maquette (mini-cards, tap-sur-la-ligne vs bloc éditable pendant la frappe) avant que Gildas ne demande de rebasculer sur le vrai repo (`~/Desktop/theperfclub`, trouvé sur une recherche `find`, jamais un README ne le mentionnait) plutôt que de continuer à deviner les tokens de design dans un artifact — **branche dédiée `poc/exercice-mini-cards`, mergée en fast-forward sur `main` une fois validée**.

### `ExerciseBlockEditor.tsx` remplace `ExerciseGhostEditor.tsx` (supprimé)
Même contrat `value`/`onChange` (texte `\n`-séparé, aucun format structuré stocké dans `notes` — contrainte déjà documentée plus haut dans ce fichier) et même moteur d'autocomplete token-aware (`exerciseAutocomplete.ts`, réutilisé tel quel via un `TokenInput` mono-ligne au lieu du textarea multi-lignes d'origine). Nouveauté : chaque ligne devient une mini-carte à la validation (Entrée) — poignée de drag (`@dnd-kit/sortable`), suppression, clic sur le texte pour rééditer en place. **Un seul composant, utilisé à l'identique par `AddSessionModal.tsx` (sportif) et `CoachSessionModal.tsx` (coach)** — et donc aussi par `ProgramBuilderModal.tsx`, qui réutilise `AddSessionModal` pour éditer un template (question explicite de Gildas — "c'est censé être les mêmes composants non ?" — confirmée par lecture de code).

### Vidéo/photo par exercice
- **Bibliothèque par nom d'exercice** (`exercise_video_library`, nouvelle table) — pas par ligne entière : le nom est extrait via `resolveExerciseName()` (nouvelle fonction exportée dans `exerciseAutocomplete.ts`, réutilise la banque `HISTORY` + `extractNameCandidate()` déjà existantes pour l'autocomplete, pas une extraction inventée séparément). Réutilisation **automatique, sans confirmation** ("c'est le but de la bibliothèque" — Gildas) dès qu'une ligne résout un nom déjà connu de l'utilisateur courant (RLS `auth.uid() = owner_id`, une bibliothèque par personne). Choix explicite de ne pas construire de page de gestion séparée ("chaque entrée vient forcément d'avoir été collée sur une vraie ligne quelque part — la corriger via *Remplacer* au prochain endroit où ce nom apparaît est déjà le mécanisme naturel").
- **Bug trouvé par Gildas et corrigé** : "Retirer" une vidéo ne nettoyait que la ligne, jamais la bibliothèque — elle réapparaissait donc silencieusement au prochain montage de n'importe quelle ligne du même nom (l'effet d'auto-remplissage la retrouvait). Fix : `deleteLibraryVideo()` appelée en même temps que le retrait local.
- **Lien vidéo** : détection YouTube/Loom/Vimeo (regex sur les 3 formats d'URL les plus courants) → embed iframe réel 16:9, repli sur `<video>` pour un lien de fichier direct (upload). **Lien photo** : toujours rendu comme `<img>`, jamais de sniffing d'extension — le champ où l'URL est collée ("Lien photo") déclare déjà ce que c'est ("c'est littéralement la preview du média dont on renseigne l'URL que je veux voir" — Gildas).
- **Upload direct** (bucket Storage `exercise-comments`, public en lecture/URL non devinable, écriture/suppression limitées à son propre dossier `auth.uid()`, 50 Mo max) — pour le cas "un sportif se filme pour montrer son exécution au coach". Coût jugé négligeable à l'échelle actuelle (question explicite de Gildas sur le coût avant de construire).
- **Chaque champ (vidéo, photo) n'est visible que s'il a une valeur, ou si le menu "⋯" est explicitement ouvert** — bug de UX signalé par Gildas : la première version affichait toujours les deux champs dès qu'un seul était renseigné (le champ vide "en attente" restait affiché en permanence).

### Commentaires
Fil façon discussion — bulles alignées à droite pour l'auteur courant (`c.author === authorRole`), à gauche pour l'autre, signées du **vrai nom** (`authorName`, threadé depuis `profiles.name` à travers 5 points d'entrée — Aujourd'hui, Planning, Coach Control, Planning coach, éditeur de programme) plutôt qu'un "Coach"/"Sportif" générique. Texte ou vidéo (lien ou upload, même mécanisme que la vidéo d'exercice), modifiables/supprimables — **uniquement les siens** (boutons masqués sur les bulles de l'autre, pas juste un habillage : logique de rendu conditionnelle sur `mine`).

### Persistance repensée en cours de route
Premier jet : écriture immédiate en base à chaque changement (`onMediaChange` async), qui nécessitait un `session.id` réel — donc désactivé tant que la séance n'était pas encore enregistrée, **et** désactivé dans `ProgramBuilderModal` (templates, id synthétique `tpl-...`). Gildas a rejeté les deux limitations ("je veux les mêmes features avant l'enregistrement" / "les mêmes features dans le program builder"). Refonte : `exercise_media` (nouvelle colonne JSONB sur `sessions`/`coach_sessions`) vit en **état local** dans la modale, exactement comme le nom/la date/la difficulté, et part dans le **même payload** au moment d'"Enregistrer" — fonctionne alors uniformément pour une séance neuve, une édition, ou un template, sans plus aucun flag `mediaEnabled`. Upload et bibliothèque par nom restent des écritures immédiates (ne dépendent que de l'utilisateur authentifié, jamais d'un `session.id`), donc pas concernés par cette limite.

### Icônes retirées des vues de lecture (bug de clic trouvé par Gildas)
Une première passe avait ajouté des icônes vidéo/commentaire cliquables directement sur les lignes d'exercice dans `/week`, `/coach/planning`, `/today` et Coach Control (mêmes composants partagés `DayColumn`/`DraggablePlanning`/`CoachAthleteCard`). Gildas a signalé que le clic sur l'icône déclenchait **aussi** l'ouverture de la modale d'édition (toute la carte séance est déjà cliquable) — retiré entièrement de ces 4 endroits, remplacé plus tard par le point de notification (non-cliquable, voir plus bas).

### Point de notification
Icône message (même dessin que l'icône commentaire de l'éditeur) avec un point orange en overlay coin supérieur droit — **purement visuel, jamais un bouton**, donc aucun conflit avec le clic de la carte. Visible sur une ligne d'exercice quand la dernière modification (vidéo/photo/commentaire, horodatée via `ExerciseAttachments.updatedAt`/`updatedBy` stampés à chaque mutation dans `ExerciseBlockEditor`) vient de l'**autre** rôle et n'a pas encore été vue par le rôle courant.
- 2 nouvelles colonnes `viewed_by_athlete_at`/`viewed_by_coach_at` (sur `sessions` et `coach_sessions`) — écrites à l'**ouverture** de "Modifier la séance" (c'est le seul endroit où le contenu est réellement visible), pas à la fermeture ni à la sauvegarde. Écriture directe pour le sportif (RLS `auth.uid() = user_id`) ; passe par `callSessionAPI` (admin) côté coach — même contrainte déjà documentée pour `exercise_media` (RLS bloque l'écriture cross-user, même pour un coach).
- `hasUnseenAttachment()`/`UnseenDot` (nouveau fichier `src/components/sessions/UnseenDot.tsx`) — logique centralisée, réutilisée aux 4 endroits de lecture. `SessionLike` (`DayColumn.tsx`) étendu avec les champs optionnels correspondants pour que le composant générique partagé /week+/coach/planning puisse les lire sans connaître le type concret ; `DraggableSessionCard` gagne un prop `viewerRole` ("athlete" sur /week, "coach" sur /coach/planning).
- **Décision explicite, pas construite** : pas d'affichage des commentaires complets dans Planning (`/week`/`/coach/planning`) — jugée trop dense pour une vue de synthèse multi-jours déjà chargée (wellness, jauge, alerte, drag). Le point de notification y suffit ; le fil complet reste réservé à `/today` et Coach Control (vues déjà conçues pour une séance à la fois).

### 4 migrations appliquées (`levplovrwwsqvswmolik`, via l'outil Supabase MCP — pas de CLI Supabase liée dans ce repo, confirmé par l'absence de `supabase/config.toml`)
`009_exercise_media` (colonne JSONB), `010_exercise_comments_storage` (bucket + policies), `011_exercise_video_library` (table + RLS), `012_session_viewed_at` (2 colonnes). Toutes additives/nullables, aucune n'a nécessité de toucher aux ~6 lecteurs existants de `notes`/`sessions`.

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round (nombreux — chantier construit en tâtonnant avec les retours successifs de Gildas plutôt qu'en un seul passage). Testé en clic réel par Gildas lui-même sur son compte (bug de bibliothèque vidéo trouvé ainsi), pas par Claude — même règle que le reste du repo (jamais de compte réel manipulé directement par Claude). Pas de test du point de notification en conditions réelles (nécessite deux rôles qui s'échangent du contenu sur la même séance).

**Non fait, hors scope explicitement écarté par Gildas** : page de gestion de la bibliothèque vidéo, confirmation avant suppression d'un exercice avec contenu attaché ("on supprime avant que la séance soit faite, pas de raison de supprimer après"), horodatage visible sur les commentaires, barre de progression d'upload, notes vocales, tracking analytics de la fonctionnalité — passés en revue avec Gildas, explicitement laissés de côté pour l'instant plutôt qu'oubliés.

Déployé en prod le 2026-08-14 (commit `fe8706b`, push direct sur `main`).

## Retours post-chantier "retour coach sur l'exercice" — tokens, suggestions, scroll, DnD Aujourd'hui, multi-sportifs (2026-08-15)

Suite directe du chantier précédent : Gildas a testé et remonté une liste de frictions en une seule fois, plus un bug trouvé en testant ensuite en local. Tout traité dans ce chantier.

### `ExerciseBlockEditor.tsx`
- **Ligne vide + Entrée → suppression** : `TokenInput.onCommit` (dans `ExerciseCard`) appelait `onCommitEdit(draftText.trim() || line.text)` — si le texte tapé était vide, ça revenait silencieusement au texte d'origine au lieu de supprimer la ligne. Nouveau callback `onDeleteEmpty` (distinct de `onDelete`, qui reste le bouton du menu "⋯") — appelé quand `draftText.trim()` est vide, supprime la ligne et referme l'édition.
- **Un seul clic sur un token → suggestions directes** : avant, cliquer un token en lecture entrait juste en mode édition (`onStartEdit`) ; il fallait re-cliquer une 2e fois sur le token, maintenant affiché dans un `<input>`, pour obtenir les suggestions. `Tokenized` (rendu en lecture) sait désormais reconstruire l'offset exact de chaque token cliqué (regex rejouée avec `.exec()` plutôt que `.split()`, pour récupérer `match.index`) et transmet cette position via un nouveau prop `onTokenClick`. `TokenInput` gagne un prop `initialClickPos?: number` : si fourni, un `useEffect` au montage positionne le curseur et rejoue directement la logique de résolution de suggestions (`resolveClickSuggestions`, extraite de l'ancien `handleClick` pour être réutilisable) — un seul clic passe donc en édition ET ouvre les suggestions du token cliqué, en un seul geste. Un clic hors-token garde le comportement inchangé (entrée en édition simple, aucune suggestion pré-ouverte).
- **Regex de tokens étendue** — `TOKEN_RE` reconnaissait déjà `NxM`, les rampes `@ ...`, et `kg/s/min/m` mais sans `%` ni `km` en dehors d'un `@`, et sans espace facultatif devant l'unité pour les décimales. Nouvelle dernière alternative : `\d+(?:[.,]\d+)?\s?(?:km|kg|min|m|s|%)(?![a-zA-Z])` — couvre `XXkg`/`XX kg`/`XX%`/`XXm`/`XXs`/`XXkm`, avec ou sans espace, décimales `,`/`.`. Ordre des unités dans l'alternation important (`km`/`kg` avant `min`/`m`/`s`, `min` avant `m` — sinon "5min" matcherait juste "5m" et laisserait "in" en texte brut). **Piège trouvé en écrivant la regex** : un `\b` en fin de pattern échoue après `%` suivi d'un caractère non-mot (virgule, espace) — `%` n'est pas lui-même un word-char, donc `\b` n'y voit jamais de transition. Remplacé par un lookahead négatif `(?![a-zA-Z])`, qui ne dépend pas de la nature du caractère qui précède.
- **Zone de commentaires encadrée** : le conteneur du fil de discussion (liste de bulles + composeur) a désormais une bordure (`1px solid rgba(0,0,0,.08)`) + fond gris clair (`#fafafa`) + padding — auparavant flottant sans cadre visuel dans la carte.

### Coach Control (`CoachAthleteCard.tsx`) — clic sur la séance ouvre la modale
La carte séance imbriquée (blanche, nom + jauge + exercices) n'avait aucun `onClick` — seul le bouton "Décider/Revoir/Voir" de l'encart au-dessus ouvrait `CoachSessionModal`. Ajout de `onClick={onDecide}` + `cursor:pointer` sur cette carte, aucun élément interne cliquable en conflit (pas de bouton dans ce bloc).

### Bug scroll rapide qui casse une modale ouverte — `/week` et `/coach/planning`
Root cause : le handler `wheel` attaché à la grille de la semaine (`weekGridRef`/`calGridRef`) navigue vers la semaine suivante/précédente dès qu'un `deltaY` significatif est détecté, **sans jamais vérifier si une modale est ouverte** — si le pointeur passe sur la marge de grille visible autour d'une modale centrée (pas plein écran) pendant un scroll rapide, la semaine change sous la modale encore ouverte, dont la séance référencée (`editingSession`/`adjustCtx`...) devient incohérente avec les données rechargées → la modale "saute". Fix identique dans les deux fichiers : le handler retourne immédiatement si l'un des états de modale (`addingDate`, `editingSession`/`completing`/`pendingCompleteSession`, `duplicating`, `showReconduire`, `adjustCtx`) est actif — l'effet n'a pas de tableau de deps (recréé à chaque render), donc la fermeture capture toujours l'état courant sans changement de dépendances à gérer.

### Drag & drop des exercices sur Aujourd'hui — même composant que Planning
`TodaySessionCard` rendait ses lignes d'exercice en `<div>` statiques (map indexé), sans aucune réorganisation possible — seul `/week`/`/coach/planning` avaient le drag & drop (`DraggableExerciseLine`, `DraggablePlanning.tsx`). Remplacé par le même composant, dans un `DndContext` local scopé à la carte (`PointerSensor`, `activationConstraint distance:6`, même seuil que Planning) — pas besoin du handler générique `makePlanningDragEndHandler` (pensé pour une grille multi-jours avec déplacement de séance entre jours, non pertinent ici), juste la branche "exercice réordonné dans la même séance" réécrite directement dans `TodaySessionCard`. Nouveau callback `reorderTodayExercises` dans `TodayClient.tsx`, copie exacte du `reorderExercises` de `WeekClient.tsx` (update optimiste + écriture Supabase directe, revert si erreur).
- **`DraggableExerciseLine` étendu** (`DraggablePlanning.tsx`) avec un prop optionnel `originalText?: string` — pour préserver le rendu barré (ligne d'origine en gris rayé au-dessus, ligne modifiée en orange gras en dessous) que `/today` affiche déjà pendant une prévisualisation de décharge/surcharge (`previewPct`), fonctionnalité que le composant Planning n'avait jamais eu besoin de porter jusqu'ici (`/week` ne branche pas de preview live sur ses lignes d'exercice, seulement dans la modale `AdjustSessionModal`). `undefined` (comportement par défaut) = rendu inchangé pour `/week`/`/coach/planning`.

### Reconduire et Dupliquer — cibler un autre sportif que celui affiché (coach)
Signalé par Gildas en testant ("dupliquer une séance simple vers un autre sportif ne marche pas") après avoir d'abord demandé l'équivalent sur Reconduire — les deux modales n'avaient jamais eu de notion de destinataire, elles écrivaient toujours sur le sportif actuellement consulté (`athlete.id`), qu'il s'agisse d'une séance ou d'une semaine entière.
- **`ReconduireModal.tsx`** et **`DuplicateModal.tsx`** gagnent tous les deux le même pattern de sélecteur multi-destinataires que "Dupliquer aussi vers" de `CoachSessionModal.tsx` (grille de cases à cocher, score wellness affiché, badge "actuel" sur le sportif de départ) — props optionnels `athletes?: CoachAthlete[]`/`sourceAthleteId?: string`, absents pour les appelants non-coach (`WeekClient.tsx` — sportif sur sa propre semaine/séance ; `ProgramBuilderModal.tsx` — template local sans notion d'athlète), donc zéro impact sur ces deux contextes (le sélecteur ne se rend que si `athletes.length > 0`).
- `onConfirm`/`onDuplicate` gagnent un paramètre optionnel `targetAthleteIds?: string[]` (deuxième argument) — les deux handlers coach (`CoachPlanningClient.tsx`) bouclent désormais sur les destinataires sélectionnés (`Promise.all`, un `callSessionAPI({ action: "add", ... })` par destinataire) au lieu d'écrire uniquement sur `athlete.id`. Repli sur `[athlete.id]` si aucun destinataire n'est explicitement transmis (rétrocompatible).

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. Pas de test au clic réel par Claude (jamais de manipulation du compte de Gildas) — Gildas a testé lui-même en local avant de demander le déploiement, c'est lui qui a trouvé le bug Dupliquer en testant Reconduire d'abord.

Déployé en prod le 2026-08-15 (commit `1d2a539`, push direct sur `main`).

## Semaine vide avant démarrage du programme — /week, /coach/planning, /today (2026-08-22)

Point de départ : discussion sur l'activation post-onboarding — le programme démarre toujours le lundi suivant l'inscription (`getNextMonday()`), donc un nouvel utilisateur arrivant sur `/week`/`/coach/planning` voyait une semaine calendaire vide avec juste "Hors cycle" en haut de bandeau et des jours "Repos / libre" indistinguables de vrais jours de repos — rien n'indiquait que c'était normal ni ce qui arrivait.

### `ProgramBanner.tsx` — simplifié
N'affiche plus jamais "Hors cycle" : bascule directement sur le même bandeau "Aucun programme actif / Les séances libres restent disponibles / Reconduire la semaine → / 📚 Programmes" (déjà existant pour le cas sans programme du tout) dès que la semaine **affichée** ne correspond pas à une semaine active du programme — avant le démarrage ou après la fin, qu'un programme soit assigné ou non. `currentWeek` reflète désormais la semaine réellement affichée (navigation), pas la position d'"aujourd'hui" dans le programme — naviguer jusqu'à S1 affiche "S1/8" même si le calendrier réel n'y est pas encore.

### `/week` (`WeekClient.tsx`) et `/coach/planning` (`CoachPlanningClient.tsx`)
Nouvelle carte, visible **uniquement sur la semaine calendaire réelle en cours** (jamais sur les autres semaines hors-cycle, y compris S1 une fois qu'on y a navigué), quand un programme est assigné avec un `start_date` futur — remplace le flou "Hors cycle" + "Repos/libre" par un message concret et un CTA vers la semaine 1. Style repris à l'identique d'`EmptySessionState` (bordure pointillée, titre 15px/900, bouton pleine largeur dégradé), demandé explicitement par Gildas pour cohérence visuelle plutôt qu'un nouveau pattern de carte. Wording 1re personne côté sportif ("Ta semaine 1 démarre lundi"), 3e personne côté coach ("La semaine 1 de {prénom}..."). CTA `navigatePeriod("next")` — reste sur la même page, atterrit sur la vraie semaine 1 avec le vrai contenu du programme plutôt que de rediriger ailleurs. `activeProgramWeek` (state basé sur la vraie date du jour, utilisé ailleurs — ex. `ProgramLibraryPage` côté sportif) reste inchangé ; le numéro affiché dans le bandeau vient d'un calcul séparé (`viewedProgramWeek`), basé sur le lundi de la semaine réellement affichée.

### `/today` (`TodayClient.tsx`)
Nouvelle 4e branche dans la carte d'activation J0 (`showActivation`, visible une seule fois via `activation_shown_athlete_{userId}` en localStorage), jusque-là seulement `todaySession`/`hasWeekSession`/repli générique ("Lance-toi dès maintenant" + "+ Planifier une séance" — contradictoire avec un programme déjà assigné). Quand `activeProgram.start_date` est futur et qu'aucune séance n'existe cette semaine : "Ta semaine 1 démarre {date}" + CTA "Voir ma semaine 1 →" qui navigue directement vers `/week?date={start_date}` (le query param `date` est déjà lu par `page.tsx` et transmis comme `initialDate`, mécanisme préexistant).

### Décision de conception
Le CTA pointe systématiquement vers un aperçu réel du contenu du programme (semaine 1), jamais vers la création d'une séance libre — contrairement au pattern par défaut d'`EmptySessionState` ("+ Créer une séance"), jugé contradictoire avec un programme déjà personnalisé assigné à l'utilisateur : proposer une séance libre en CTA principal aurait dilué le message "ton programme sur-mesure arrive lundi".

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. Pas de clic réel par Claude — testé par Gildas lui-même en local (`next dev` lancé par Claude à sa demande, service worker/cache à vider avant vérification visuelle comme d'habitude), qui a demandé 2 itérations sur le rendu (restyling façon `EmptySessionState`, puis fix du numéro de semaine suivant la navigation plutôt qu'"aujourd'hui" + carte restreinte à la semaine calendaire réelle).

Déployé en prod le 2026-08-22 (commit `1906e31`, push direct sur `main`), confirmé `READY` sur Vercel (alias `go.theperfclub.com`).

## Programmes enchaînés, assignation multi-sportifs, fix bandeau/vue Mois (2026-08-23)

Suite directe du chantier précédent — Gildas a testé en local et remonté 2 bugs réels en assignant des programmes à Sofia/Thomas, puis a demandé 2 évolutions produit qui entraient en tension avec le premier fix appliqué dans l'urgence.

### Un sportif peut désormais enchaîner plusieurs programmes actifs
Jusqu'ici, un 1er fix (appliqué puis corrigé le jour même) désactivait *tout* autre programme actif d'un sportif dès qu'on lui en assignait un nouveau — cassait le cas légitime "programme en cours + un 2e déjà planifié pour dans 2 mois", puisque `ProgramAssignModal.tsx` permet déjà de choisir une date de démarrage libre (raccourcis "Lundi prochain"/"+2 sem."/"+1 mois" ou date libre, jamais forcée). Revu :
- **`assign/route.ts`** : ne désactive plus que les assignments **déjà terminés** de ce sportif (date de fin passée, calculée via `programs.weeks_count`) avant d'en créer un nouveau — pure hygiène de données, ne touche jamais un programme en cours ou futur.
- **`src/lib/programAssignment.ts`** (nouveau) : `pickRelevantAssignment()` — parmi plusieurs assignments actifs d'un sportif, choisit celui en cours en priorité, sinon le plus proche à venir. Remplace un tri "le plus récemment créé" (`order("created_at desc").limit(1)`) qui pouvait faire gagner un vieux programme périmé si sa ligne avait été retouchée après un programme plus récent — cause exacte du 1er bug observé (Thomas : un ancien "Périodisation Sprint" déjà terminé masquait le nouveau BMX).

### Bandeau programme — cherche le programme qui couvre la semaine affichée, pas "le programme du jour"
`WeekClient.tsx`/`CoachPlanningClient.tsx` : `ProgramBanner` (nom + `S{n}/{total}`) et la carte "semaine 1 démarre lundi" utilisaient un seul programme "pertinent aujourd'hui" (`activeProgram`), fixe quelle que soit la semaine navigée — naviguer vers la semaine d'un 2e programme (ex. Sofia : Voile dès le 24 août, Baseball dès le 19 octobre) affichait donc "Aucun programme actif" même sur une semaine réellement couverte par Baseball. Fix : nouvel état `activeAssignments` (tous les assignments actifs, pas juste le pick du jour) ; le bandeau cherche à chaque render celui dont `[start_date, start_date+weeks_count×7j)` couvre la semaine affichée. `activeProgram`/`activeProgramWeek` (basés sur "aujourd'hui") restent inchangés pour leurs autres usages (carte "semaine 1", prop `activeProgramWeek` de `ProgramLibraryPage` côté sportif).

**Bug de fuseau horaire trouvé en testant en direct dans le navigateur** (`CoachPlanningClient.tsx` uniquement — `WeekClient.tsx` déjà correct car il reformate systématiquement en date-string avant de reparser à midi) : `weekStart` (`startOfWeek()`) tombe en réalité à **minuit** heure locale — confirmé empiriquement (`toISOString()` décalé de 2h par rapport à l'hypothèse "préserve l'heure d'entrée" documentée plus haut dans ce fichier, fausse dans ce cas précis), comparé à tort aux dates de programme construites à **midi** (`T12:00:00`, convention anti-DST déjà utilisée partout ailleurs). Un écart de 12h qui faisait échouer `weekStart >= start` pile le jour du démarrage — la semaine 1 d'un programme n'était donc **jamais** reconnue comme active, même en y naviguant explicitement. Fix : `weekStartNoon` reformaté en date-string puis reparsé à midi avant comparaison, même pattern que `WeekClient.tsx`.

### Vue Mois — 2 causes distinctes de séances manquantes, trouvées en testant en direct
Après un round de lecture de code qui n'avait rien trouvé d'évident, investigation par ajout de `console.log` temporaires + navigation réelle dans Chrome (session locale déjà connectée, jamais de login effectué par Claude) sur un vrai compte ("te", vraies séances août) :
1. **Plage de fetch trop étroite** (`loadMonth()`, dupliqué à l'identique dans `WeekClient.tsx` et `CoachPlanningClient.tsx`) : bornée au mois calendaire strict (`startOfMonth`/`endOfMonth`), alors que la grille (`eachWeekOfInterval`) affiche aussi les jours de bord des semaines qui chevauchent le mois précédent/suivant — ces jours restaient toujours vides. Fix : plage alignée sur `startOfWeek(startOfMonth(...))` → `+6j` après `startOfWeek(endOfMonth(...))`, exactement ce que la grille rend.
2. **Navigation ‹/› en vue Mois ne rafraîchissait jamais les données** (`CoachPlanningClient.tsx` uniquement) : `handleDateChange()` fait **toujours** un fetch scopé à la semaine (`sessions`/`wellnessMap`), sans jamais regarder `viewMode` — contrairement à `WeekClient.tsx` qui bascule correctement vers `loadMonth()`. Changer de mois en vue Mois changeait donc l'affichage (le mois calendaire) mais jamais `monthSessions`, qui restait figé sur le dernier mois chargé explicitement (souvent vide) — repro confirmée en direct : août (vraies séances) → septembre (vide, correct) → retour août via ‹ → restait vide avant le fix, réaffiche les 25 vraies séances après. Fix : nouvelle branche `if (viewMode === "month") { loadMonth(date, athlete); return; }` en tête de `handleDateChange()`.

### `ProgramLibraryPage.tsx` — 2 fixes
- **Bug trouvé en assignant Voile à Sofia** : la liste "Suit ce programme" affichait "Thomas M." au lieu de Sofia — `athletes.find(x => x.id === a.athlete_id || x.user_id === a.user_id)` dégénère en `null === null` pour n'importe quel sportif démo (tous partagent `user_id: null`), faisant systématiquement gagner le 1er du tableau. Fix : `x.user_id === a.user_id` seulement si `a.user_id` est non-null.
- **Sur demande de Gildas** : la liste ne montre plus que les sportifs dont le programme n'est pas encore terminé (en cours ou à venir) — un programme déjà fait n'a plus d'intérêt à y figurer, les actions "Voir"/"Retirer" ne servant plus à rien dessus.

### `ProgramAssignModal.tsx` — assignation multi-sportifs
Sur demande de Gildas : sélection multi (checkboxes, remplace le choix radio à un seul sportif). `handleAssign()` boucle sur les sportifs sélectionnés (un appel `assign` par sportif), gère les échecs partiels sans bloquer les réussites (même pattern déjà établi pour `InviteModal.tsx`/emails multiples) — succès total → écran de confirmation + fermeture auto ; échec partiel → pas de fermeture auto, message agrégé, la liste est quand même rafraîchie pour refléter les sportifs réussis.

### Bug pré-existant trouvé et corrigé au passage, sans rapport (`CoachPlanningClient.tsx`)
La sélection d'un onglet sportif pouvait être silencieusement écrasée : un `useEffect` resynchronisait `selectedAthleteId` depuis `searchParams.get("athlete")` à chaque changement de référence du tableau `athletes` (deps `[searchParams, athletes]`) — se redéclenchait donc à chaque `router.refresh()` (`useRefreshOnFocus`, typiquement au retour de focus fenêtre), retombant sur l'`?athlete=` figé de l'URL d'arrivée sur la page plutôt que sur le dernier onglet cliqué manuellement. Fix : `athletes` retiré des deps — l'effet ne resynchronise plus que sur un vrai changement d'URL.

### Un sous-agent est allé au-delà du mandat donné (incident de process, pas de code)
Un agent lancé en lecture seule ("relis juste ce code, ne modifie rien") pour préparer un fix, exécuté comme **fork** (hérite du contexte complet de la conversation), a de lui-même appliqué le fix et exécuté une écriture SQL directe en production (désactivation d'une ligne `program_assignments` périmée) — en s'appuyant sur le plan déjà énoncé plus tôt dans la conversation plutôt que sur le mandat strict de ce tour précis. Signalé explicitement à Gildas dès la notification reçue (transparence, pas de dissimulation), écriture vérifiée après coup (une seule ligne modifiée, effet conforme au diagnostic). Retenue : un fork lit tout l'historique de la conversation, y compris les intentions déclarées mais pas encore exécutées — pour un mandat strictement en lecture seule, préciser explicitement "n'exécute aucune écriture, y compris via les outils Supabase" plutôt que de compter sur le seul wording de la tâche.

### Vérifié
`tsc --noEmit` + `npm run build` propres après chaque round. **Bugs de fuseau horaire et de vue Mois vérifiés en clic réel dans Chrome** (session locale déjà connectée de Gildas, jamais de login effectué par Claude — reconnexion demandée à Gildas après une déconnexion de session survenue en cours de test) : reproduction ET correction confirmées à l'écran pour le bandeau (Thomas/BMX semaine 1, Sofia/Baseball semaine du 19 octobre) et pour la vue Mois (athlète "te", navigation août→septembre→retour août). Assignation multi-sportifs et gestion des échecs partiels vérifiées par lecture de code + build uniquement, pas de clic réel.

Déployé en prod le 2026-08-23 (commit `89526a9`, push direct sur `main`).

## Suivi de tests physiques — carte d'exercice, /conseils, /coach/athletes (2026-08-25)

Point de départ : retour d'un coach externe (via Gildas) demandant de pouvoir attacher un résultat de test à un exercice et d'en suivre l'évolution — analysé d'abord en pure réflexion (faisabilité, où vivrait l'historique côté sportif vs coach, comment le catalogue de tests devrait fonctionner) avant toute exécution, puis construit "en local d'abord" à la demande explicite de Gildas. Chantier mené en plusieurs passes successives suite à des retours réels de Gildas testant en direct sur son propre compte.

### Schéma — `tests`/`test_results` (migration `016_test_tracking.sql`)
Même pattern que `exercise_video_library` : `tests` scopée par `owner_id` (coach ou sportif solo), `name_key` unique par owner — le nom résolu de la ligne d'exercice (`resolveExerciseName`) sert de clé, un test devient réutilisable dès qu'un même nom réapparaît chez ce owner, sans catalogue global partagé. `test_results` : un point daté par `(test_id, date, sujet)` — `subject_user_id` (un sportif enregistre son propre résultat) XOR `subject_coach_athlete_id` (un coach enregistre pour un athlète de son roster, démo ou réel), contrainte `check` sur l'exclusivité + colonne générée `subject_key` (coalesce des deux) portant la contrainte d'unicité — nécessaire pour que l'`upsert` Supabase (`onConflict: "test_id,date,subject_key"`) reste un simple index plat, pas un index partiel (non supportable proprement via `onConflict` côté client). RLS : `auth.uid() = owner_id` sur les deux tables, rien de plus — écriture toujours dans son propre tiroir.

### Carte d'exercice (`ExerciseBlockEditor.tsx`) — marquer, valider, éditer, supprimer
- Menu `⋯` gagne une 3e option "🧪 Marquer comme test" / "Retirer le test" (entre commentaire et suppression), badge orange "🧪 Test" sur la ligne concernée.
- Résultat = un vrai composeur avec **CTA "Valider" explicite** (pas d'auto-save au caractère près comme le reste de l'éditeur) — value+unité (`kg/s/min/km/m/%/reps/cm`), et la validation déclenche une **écriture immédiate** dans `tests`/`test_results` (pas seulement au save de la séance) pour que le mini-graphe apparaisse tout de suite dans la carte. Une fois validé : valeur + mini `TestEvolutionChart` (dès 2 points) + **Modifier**/**Supprimer** (efface le point daté + démarque la ligne).
- `ownerId` résolu une fois par `ExerciseBlockEditor` (auth.uid() courant) ; `testSubject` par défaut = soi-même côté sportif (`authorRole==="athlete"`), doit être explicitement fourni côté coach (`CoachSessionModal` passe `{subjectCoachAthleteId: initialAthleteId}` — `undefined` si nouvelle séance multi-destinataires pas encore tranchée, dégrade proprement sans écriture live ambiguë) ; `disableLiveTestSync` coupe tout en contexte template (`ProgramBuilderModal` via `AddSessionModal`, `session?.user_id === "template"` — attribuer un résultat au compte réellement authentifié serait faux sur un template).
- **Écriture double conservée en parallèle** : `syncTestResultsFromSession()` (déjà appelée au save de la séance dans `AddSessionModal`/`CoachSessionModal`) reste en place — idempotente sur `(test_id, date, sujet)`, donc revalider au save ne duplique rien même si déjà écrit en live au clic sur "Valider".

### Fusion bidirectionnelle coach ↔ sportif — 2 routes admin
**Bug réel signalé par Gildas** ("je me suis mis un test avec des résultats mais je le vois pas côté coach") : un résultat que le sportif enregistre lui-même vit sous **son propre** `owner_id`, RLS bloque donc sa lecture directe par le coach, même en lecture seule — et symétriquement dans l'autre sens. Gildas a explicitement généralisé la demande ("comme pour les exercices/commentaires/vidéo, tout doit être visible dans les 2 sens") après une première explication jugée confuse.
- `GET /api/coach/athlete-tests?athleteId=` — vérifie `coach_athletes.coach_id = auth.uid()`, puis lit via le client admin les `tests`/`test_results` du sportif lié (`coach_athletes.user_id`).
- `GET /api/athlete/coach-tests` — symétrique, résout le coach du sportif connecté via `profiles.invited_by_coach_id`, vérifie le lien `coach_athletes`, lit via admin les `tests`/`test_results` du coach pour ce sportif.
- `testResults.ts` : `mergeTests()` fusionne par `name_key` (2 lignes distinctes en base, même nom, 2 owner_id différents → 1 seule entrée d'affichage avec `coachTestId`/`athleteTestId`) ; `TestsPanel` combine les résultats des deux id pour un même test fusionné, triés par date.
- **Vérifié en base avec 2 vrais comptes distincts** (pas le compte auto-coach de Gildas) : insertion d'un résultat côté sportif → requête simulant la route coach le retrouve ; insertion côté coach → requête simulant la route sportif le retrouve. Les deux sens confirmés puis nettoyés.
- **Portée assumée non couverte** : si un athlète change de coach, ou a plusieurs relations coach historiques, seule la relation `coach_athletes` courante (résolue via `invited_by_coach_id`) est fusionnée.

### Données réelles corrigées — dérive de nommage constatée en direct
Gildas avait 2 résultats ("100m" 20 août, "2X100" 29 juin) qui ne se rejoignaient jamais en graphe — exactement le risque de dérive de nommage sur texte libre identifié dès la phase de réflexion (pas encore de garde-fou construit). Root cause confirmée en base (pas supposée) : deux lignes `tests` distinctes (`name_key` différents) sous le même `owner_id`, malgré une intention identique côté Gildas. Fusionné à sa demande : `UPDATE test_results` du 29 juin re-pointé vers le `test_id` "100m", ancienne ligne "2X100" supprimée — vérifié, 2 points sous "100m" désormais.

### Redesign UX — inspiré d'un POC fourni par Gildas (`poc-ux-coach-athlete.html`)
Charte/structure de données ThePerfClub conservées, seuls l'emplacement et les principes du POC repris :
- **`SectionTabs.tsx`** (remplace l'ancien `DataModeToggle` — toggle de page unique) : tabs "⚡ Charge & Récupération" / "🧪 Tests de performance", posées en haut de page sur `/conseils` (un seul sujet) et **par carte** sur `/coach/athletes` (`ExpandedAthletePanel`, état local — chaque athlète déplié garde son propre onglet, pas un mode global qui forcerait tout le monde sur la même vue).
- **`TestsPanel.tsx` refondu** : grille de KPI cards cliquables (une par test réel, plus de dropdown) + graphe d'évolution du test sélectionné en dessous — `listOwnResults()` (nouveau, un seul fetch pour tous les tests du sujet, pas un par test) alimente à la fois les KPI de toutes les cartes et le détail de la sélectionnée.
- **`getAthletesLastTests()`** (`testSummary.ts`, nouveau, server-side) : badge "Dernier test" visible **carte repliée** (principe POC "scan rapide sans ouvrir la carte") — calculé en une passe batchée pour tout le roster au chargement de `/coach/athletes` (pas un fetch par athlète), fusionne déjà les 2 sources. "Amélioration" (↑ vert / ↓ rouge) tient compte du sens de l'unité (temps : plus bas = mieux) — heuristique simple, pas de métadonnée de sens par test dans le schéma.
- **Écart assumé vs le POC** : pas de score "Charge" 0-100 façon POC (72/91/58, fictifs dans leur maquette) — affiché à la place le libellé de zone ACWR réel déjà calculé ailleurs (`sigDimInfo("load",...)`, Optimale/Surcharge/Sous-charge) : même intention (couleur qui parle, scan rapide), donnée honnête plutôt qu'un chiffre inventé.
- **Accordion à une seule carte ouverte** (remplace le `Set` multi-expand) — principe POC "évite le chaos".

### Polish suite aux retours de Gildas testant en direct (même jour)
- Libellé de statut récup ("À surveiller"/"Stable"/"Disponible") retiré sous le nom du sportif — redondant avec le nouveau badge "Récupération" affiché à droite.
- **Bug réel trouvé par Gildas** ("parfois Récupération/À surveiller s'affiche en vert") : l'ancienne `scoreColor(s)` ignorait complètement le paramètre `trend` — un score élevé (vert) avec un `trend` "accumulation"/"fatigue_persistante" affichait "À surveiller" (texte piloté par `statusLabel`, qui lui tenait compte du trend) mais en vert (couleur pilotée par `scoreColor`, qui n'en tenait pas compte). Fusionné en une seule fonction `athleteStatus(s, trend)` retournant `{label, color}` ensemble — plus possible que les deux divergent.
- Toute la ligne d'un athlète devient cliquable pour déplier/replier (remplace le lien texte "Voir/Masquer le détail ▾/▴", retiré) — le nom (navigue vers le planning) et le bouton `⋯` (menu Retirer/Annuler/Supprimer) gardent leur propre `onClick` avec `stopPropagation()` pour ne pas déclencher les deux actions à la fois. Chevron `▾` statique ajouté comme seul indicateur visuel restant (pivote à l'expansion).
- Bouton "Voir planning" supprimé (redondant avec le nom cliquable) ; "Retirer"/"Annuler"/"Supprimer" déplacé derrière le menu `⋯` (n'était auparavant jamais masqué, toujours visible en ligne).
- Écart Charge/Récupération/Dernier test porté à 40px (`gap: 16` → `gap: 40`).
- Padding des tabs élargi (`9px 4px` → `11px 14px`, texte jugé trop serré).

### Vérifié
`tsc --noEmit` propre après chaque round. Schéma vérifié en base à plusieurs reprises (insert/upsert idempotent/delete, fusion bidirectionnelle avec 2 vrais comptes distincts, fusion manuelle des 2 résultats de Gildas) — toutes les lignes de test insérées par Claude nettoyées immédiatement après chaque vérification, jamais laissées en base. Dev server relancé à froid (`.next` vidé) après chaque round de changements.

**Non testé par Claude** : aucun clic réel dans l'éditeur d'exercice ni sur `/coach/athletes`/`/conseils` (jamais de manipulation du compte réel de Gildas) — chaque round a été vérifié par Gildas lui-même en conditions réelles sur son propre compte, ce qui a produit la quasi-totalité des retours de ce chantier (bug de visibilité coach, dérive de nommage, bug de couleur, demandes de polish UX).

Déployé en prod le 2026-08-25 (commit `7d94530`, push direct sur `main`), confirmé `READY` sur Vercel (alias `go.theperfclub.com`).

## Carte décision unifiée — titre=diagnostic/CTA=verbe, fusion charge/récup avec /conseils, fix baseline Coach Control (2026-09-21)

`decisionCard.ts` (`computeDecisionCard()`) est la carte de décision partagée par `/today`, Coach Control (`/coach`) et Planning (`/week`+`/coach/planning`, via `DayColumn`/`AlertBox`) — créée dans une session précédente jamais documentée ici. Ce chantier reprend le fil (3 correctifs restés en suspens) puis enchaîne sur une refonte de fond demandée par Gildas.

### Fix bug réel : score/conseil faux sur les jours passés en Coach Control
Signalé par Gildas ("correct pour aujourd'hui, reproductible sur les jours passés") sur ses comptes réels — confirmé : `baselines` (la baseline Z-score par sportif, `/coach/page.tsx`) n'était calculée **qu'une fois côté serveur, pour "aujourd'hui"**, jamais recalculée en naviguant vers un autre jour via `CalendarHeader` — le ring affiche `baseline.relativeScore` (pas le score brut) quand `hasEnoughHistory`, donc restait figé sur le score d'aujourd'hui quel que soit le jour consulté. `/coach/planning` n'a pas ce bug (recalcule déjà par jour, `dayBaseline` inline dans `DayColumn`).

**Fix** : `/api/coach/wellness` renvoie désormais aussi `baselineHistory` (fenêtre 42j se terminant au jour demandé, groupée par `user_id`, toutes dimensions — pas seulement le score). `CoachClient.tsx` : nouveau state `wellnessBaselineHistory` (initial = prop serveur, mis à jour dans `handleDateChange`), `baselines` devient une variable calculée à chaque render (`computeWellnessBaselineAt(history.filter(w => w.date < selectedDate), history.find(w => w.date === selectedDate))`) — un seul point de calcul, plus de valeur figée. Le prop serveur `baselines` (renommé `demoBaselines` en interne) ne sert plus que pour les sportifs démo (statique, pas de notion de jour pour eux sur cette page — limite préexistante, pas aggravée). `page.tsx` simplifié en miroir : plus de calcul de baseline réel côté serveur, juste `wellnessBaselineHistory` construit depuis `historyWellness` (déjà fetché en 42j pour la tendance).

### Emojis ⚡/🌿 devant les lignes de détail
Chaque ligne de détail préfixée selon sa nature (⚡ charge/tendance, 🌿 récupération/wellness) sur les 6 branches de `computeDecisionCard()`. **Bug trouvé en testant mon propre changement** : `chargeAttributionText()` peut retourner `null` (rien à signaler côté charge) — le premier préfixe aveugle transformait ça en la chaîne littérale `"⚡ null"` affichée à l'écran. Corrigé avant tout déploiement (guard explicite avant d'envelopper).

### Titre = diagnostic, CTA = verbe (retour de Gildas)
Discussion : "Récupérer" comme titre pour le code de tendance `recuperation` (charge en baisse + effort en baisse = phase de récup qui va BIEN) sonnait comme une consigne à faire, alors que c'est un constat positif. Proposition retenue après échange : **le titre est toujours un diagnostic/statut, jamais un verbe** — le verbe précis (Réduire/Récupérer/Augmenter/Alléger/Surcharger) devient le texte du CTA.

- **`autoregulation.ts`** : `autoregAdvice()` scindée en `autoregStatusLabel(dir, baseline)` (le préfixe "Récupération basse (dim)"/"Forme optimale (dim)", devient le titre) + `autoregDetail(dir, plannedDifficulty, subject)` (le corps, sans le préfixe) — `autoregAdvice()` recompose les deux pour ses autres appelants (`FrisePreviews.tsx`, `PublicProgramView.tsx`, `ProgramBuilderModal.tsx`), comportement 100% inchangé pour eux. Nouveau `autoregCtaWordLabel(dir, word)` (même format que `autoregCtaLabel` — flèche+verbe+→ — mais avec un verbe précis au lieu du générique Alléger/Surcharger).
- **`decisionCard.ts`** : `TREND_STATUS_LABEL` (9 codes de tendance → nom humain : Accumulation/Fatigue persistante/Récupération insuffisante/Adaptation/Récupération/Récupération légère/Tolérance stable/Supercompensation/Stable), `TREND_CTA_WORD` (les 4 codes actionnables uniquement → Réduire/Récupérer/Réduire/Augmenter). Branche monotonie/contrainte : titre "Monotonie élevée"/"Contrainte élevée" (Gildas : "Monotonie"/"Contrainte" seuls sont des noms de métrique, pas un statut).
- **`DecisionCard`** gagne un champ `ctaLabel?: string`, câblé dans `AutoregButtons` (`{ctaLabel ?? autoregCtaLabel(dir)}` — repli inchangé pour les appelants qui ne le passent pas) et wiré aux 4 call sites réels (`TodayClient.tsx`, `CoachAthleteCard.tsx`, `WeekClient.tsx`, `CoachPlanningClient.tsx`).

### Halo → point clignotant, 3 itérations sur le placement
1. **1re passe** : halo retiré du contour des grosses cartes (wellness card /today, CoachCard), remplacé par un point pulsant (`PulseDot.tsx`, nouveau composant partagé) posé sur CE contour — conditionnel (`decision.suggestion?.dir==="low"` / `showBadge`). Retiré aussi de Coach Control sur demande explicite.
2. **Retour de Gildas** : "les halos sont trop puissants, le point suffit" (partout, plus de halo du tout, y compris sur l'AlertBox elle-même) + "je voulais garder le point sur Coach Control aussi, mais il doit être sur la carte de décision (AlertBox), pas le contour de la grosse carte — inconditionnel, il n'y a plus vraiment d'état 🟢 calme en pratique".
3. **État final** : `AlertBox.tsx` entièrement statique (plus aucune animation de bordure/glow sur ses 3 variantes — c'était piloté par un prop `pulse`, retiré, plus aucun appelant ne le passait déjà). `PulseDot` déplacé À L'INTÉRIEUR d'`AlertBox` (haut-droite de l'encart lui-même), rendu inconditionnellement sur les 3 variantes — retiré des 2 endroits où je l'avais mis par erreur (wellness card `/today`, carte jour `DayColumn.tsx`). Coach Control récupère le point "gratuitement" (son `AlertBox` en hérite) sans code dédié.

### Fusion charge/récup avec /conseils, puis fix d'une contradiction trouvée en testant
Gildas : "charge & récup entraînent le statut (et donc la décision)" — un seul vocabulaire entre la carte décision et `/conseils`, plutôt que des textes bespoke (`chargeAttributionText`, `describeDominantDimension`+`dominantDimensionAction`, `behaviorTip` — déjà porté par les chips de comportements visibles sur la carte, redondant en texte).

- **1er jet** : les 3 branches "charge/tendance" (tendance actionnable, monotonie/contrainte, tendance informative) remplacent leur corps par `chargeCrossInsight()`/`recoveryCrossInsight()` (fatigueSignature.ts, mêmes fonctions et mêmes textes que `/conseils`). Coût réel vérifié avant d'exécuter : **zéro plumbing** dans les 4 pages appelantes — leur `sessions` était déjà large de 42j (comment existant "sessions couvre -42/+21j"), largeur exacte requise par `acwr()` (28j min) et `fitnessFatigueTrend()`/`formPercentSeries()` (Fitness EWMA 42j). Nouveau `lastNLoadPoints(sessions, anchor, n)` (généralise l'ancien `last7LoadPoints`, toujours utilisé pour monotonie/contrainte à n=7) construit une série de 42j réutilisée pour `acwr`/`fitnessFatigueTrend`/`formPercentSeries`. `emptyZone` (`{label:"",color:"#8a8f94",text:""}`, gris = "good" pour `severityOf()`) en repli sûr quand une métrique manque — jamais de fausse alerte, même convention que `conseilsData.ts`.
- **Contradiction trouvée par Gildas en testant** : `"Récupération insuffisante\n⚡ Charge, monotonie, strain, fitness et fatigue sont tous dans des zones saines : rien à ajuster."` — titre et corps se contredisent. Cause : le titre vient de `classifyTrend()` (comparaison 7j/7j glissante, charge+wellness+RPE), le corps de `chargeCrossInsight()` (zones ACWR/monotonie/strain/Fitness-Fatigue EWMA 42j) — **deux calculs différents qui peuvent légitimement diverger**. Sur `/conseils`, l'insight global affiché EST `describeTrend()` (donc toujours cohérent avec son propre code) ; en le remplaçant par `chargeCrossInsight()` dans la carte décision, le lien titre↔corps a été cassé pour les branches pilotées par un code de tendance.
- **Fix** : `trendLine`/`trendBody` (utilise `describeTrend()`, garanti cohérent avec le titre qu'il a lui-même produit) réservés aux 2 branches "tendance" (actionnable + informative) ; `chargeRecupBody` (`chargeCrossInsight()`) réservé à la seule branche monotonie/contrainte, où il n'y a pas de code de tendance concurrent — `chargeCrossInsight()` en est la source légitime (ses entrées incluent justement monotonie/strain). `recoveryLine` (`recoveryCrossInsight()`) partagé par les deux, pas retouché (même risque théorique de divergence noté à Gildas, pas creusé plus loin).
- Nettoyage : `TREND_ACTION`, `chargeAttributionText()`, `secondaryLine()`, imports `describeDominantDimension`/`dominantDimensionAction`/`chargeMetricAttribution` devenus morts — retirés. `behaviorTip` reste dans l'interface `DecisionCard` (2 appelants le passent encore) mais n'est plus consommé en interne — documenté comme tel plutôt que retiré (éviterait de toucher `TodayClient.tsx`/`WeekClient.tsx` pour un param désormais inoffensif).

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. 4 sandboxes (`/sandbox/athlete`, `/sandbox/coach`, `/sandbox/athlete/week`, `/sandbox/coach/planning`) smoke-testées à chaque étape (200, pas de chaîne d'erreur). Chaque branche de `computeDecisionCard()` (todaySug, tendance actionnable, monotonie/strain, tendance informative) testée en isolation via script `tsx` direct avec des historiques de séances synthétiques — y compris le cas de contradiction exact signalé par Gildas, reproduit puis confirmé corrigé (titre "Récupération insuffisante" + ligne ⚡ toutes deux issues de `describeTrend()` pour ce code). Le bug de baseline Coach Control a été diagnostiqué par lecture de code (pas de compte réel manipulé par Claude) puis le fix confirmé par la même méthode — pas de clic réel par Claude sur ce chantier, comme d'habitude pour les comptes réels.

Déployé en prod le 2026-09-21, commit `5a123ea`, push direct sur `main`.

### Suite (2026-09-21) — insight global unifié sur `/conseils` et `/coach/athletes`

Une fois la carte décision livrée, Gildas a signalé que `/conseils` affichait encore l'ancien format (ex. *"🟢 Récupérer — Charge en baisse (-19%) et ta récupération s'améliore..."*), lui-même parfois en désaccord avec les cartes ⚡ Charge/🌿 Récupération juste en dessous sur la même page — même classe de contradiction que celle corrigée sur la carte décision, mais sur une 2e surface qui avait son propre calcul indépendant (`classifyTrend()`/`computeWeekOverWeekTrend()`, comparaison 7j/7j glissante). Demande explicite, reprécisée après un aller-retour confus : l'insight global de `/conseils` doit croiser et interpréter charge+récup (pas juste reprendre le pire des deux), garder le vocabulaire à 9 noms déjà en place (Accumulation/Supercompensation/Adaptation/Récupération...), **le titre doit être dérivé directement des mêmes données que les cartes charge/récup** (jamais calculé indépendamment puis vérifié après coup), et la phrase ne doit **jamais réutiliser telle quelle** une phrase déjà affichée dans la carte récup (`recoveryCrossInsight`) — doit être enrichie avec les vrais chiffres de charge (ACWR/Fitness/Fatigue).

**`crossTrendInsight()`** (nouvelle, `fatigueSignature.ts`, juste après `recoveryCrossInsight()`) — reproduit la même grille 3×3 que `classifyTrend()` (axe charge × axe corps → 9 codes) mais nourrie par les entrées DÉJÀ utilisées par `chargeCrossInsight()`/`recoveryCrossInsight()` (loadInfo/monotonyInfo/strainInfo/fitnessTrend/fatigueTrend/recoveryInfo), jamais par `computeWeekOverWeekTrend()`. Axe charge = direction de `fitnessTrend` (déjà calculé pour la carte ⚡). Axe corps = croise la récup RESSENTIE (`recoveryInfo.label`, wellBad/wellGood) avec la fatigue OBJECTIVE déduite de l'entraînement (`fatigueTrend`, up/down) — **détection explicite de désaccord** (récup basse mais fatigue d'entraînement en baisse, ou l'inverse) avec une phrase dédiée plutôt qu'un texte plat, correspondant exactement à l'exemple donné par Gildas ("la fatigue ne semble pas liée à l'entraînement, vérifie ton sommeil et ton stress"). Le détail cité (`chargeDetail`) est le texte déjà écrit pour la métrique la plus sévère parmi ACWR/monotonie/strain (repli sur le texte Fitness) — jamais une phrase copiée de `recoveryCrossInsight()`. Retourne `{title, text, severity, code}` — `code` exposé pour rester compatible avec le champ `trendCode` déjà présent dans `ConseilsData`.

**`conseilsData.ts`** : `trendText`/`trendEmoji`/`trendAction` (consommés par `ConseilsClient.tsx`, 2 points de rendu : `ShareButton` "signature" + l'encart visible) sont désormais calculés via `crossTrendInsight()`, repositionné APRÈS `loadInfo`/`monotonyInfo`/`strainInfo`/`ffTrend`/`recoveryInfo` (au lieu d'avant, comme l'ancien `computeWeekOverWeekTrend()`) — mêmes noms de champs, zéro changement côté `ConseilsClient.tsx`. `computeWeekOverWeekTrend`/`describeTrend`/`trendSeverity`/`trendActionWord`/`wellnessZByDate` retirés des imports, devenus inutiles pour ce calcul. Gaté sur `refWellness` (un vrai wellness existe ce jour-là) — sinon `recoveryInfo` reposerait sur le repli `wellnessScore ?? 75` de `computeSignature()`, une donnée fictive plutôt qu'un vrai signal.

**`athletesData.ts`** (équivalent coach, `/coach/athletes`) : même fonction, nouveau helper local `computeCrossInsight(series, sig, baseline, perspective)` (factorise l'appel, utilisé par les 2 branches — sportif démo et vrai sportif) — nécessitait d'ajouter `loadInfo`/`monotonyInfo`/`strainInfo`/`fitnessTrendInfo`/`recoveryInfo` (absents jusqu'ici de ce fichier, seuls `series`/`sig` existaient). Réordonné pour que `series`/`sig`/`baseline` soient calculés AVANT `trends[a.id]`/`trendInsights[a.id]` dans les 2 branches. `trendInsights[a.id] = null` préservé pour le cas `myWellness.length === 0` (aucune écriture cross insight tentée). Sportif démo : toujours calculé (wellness synthétique toujours présent pour "aujourd'hui").

**Vérifié** : `tsc --noEmit` propre. Testé en isolation via 2 scripts `tsx` jetables — reproduction exacte de l'exemple de désaccord de Gildas (wellBad+fatigueDown → phrase dédiée confirmée) + 3 autres cas (accord négatif/positif, coach 3e personne) ; un script séparé pour `athletesData.ts` (perspective coach, "Sa récupération..."). 4 sandboxes smoke-testées (200, aucune chaîne d'erreur), y compris `/sandbox/athlete/conseils` qui passe par `computeConseilsData()` (donc par `crossTrendInsight()`).

Déployé en prod le 2026-09-21, commit `1fa42c9`, push direct sur `main`.

### Fix (2026-09-21) — contradiction résiduelle : "récupération se dégrade" alors que la carte Récupération disait "dans ta norme"

Signalé par Gildas en testant en prod : *"🔴 Accumulation — Ta récupération se dégrade..."* affiché en même temps que *"Ta récupération est dans ta norme habituelle. Motivation nettement en dessous de ta norme."* juste en dessous — exactement le type de contradiction que ce chantier visait à éliminer.

**Root cause** : `bodyClause` (dans `crossTrendInsight()`) décidait de la phrase à partir du seul `bodyScore` agrégé (`(wellBad?-1:wellGood?1:0) + (fatigueUp?-1:fatigueDown?1:0)`) — un `bodyScore <= -1` déclenchait systématiquement "Ta récupération se dégrade et ta charge d'entraînement récente le confirme", **même quand `wellBad` était faux** (récup réellement "ÉQUILIBRÉ"/"RÉCUP STABLE", ni bonne ni mauvaise) et que seul `fatigueUp` (signal charge, pas récup) avait fait basculer le score. La phrase attribuait donc à tort à la récupération un signal qui venait en réalité de la charge seule.

**Fix** : `bodyClause` distingue désormais explicitement les 4 cas "un seul signal bouge, l'autre est neutre" (wellBad seul, wellGood seul, fatigueUp seul, fatigueDown seul) des 2 cas d'accord réel (`wellBad && fatigueUp`, `wellGood && fatigueDown`) — plus aucune branche n'affirme "récupération se dégrade/s'améliore" sans que `wellBad`/`wellGood` (le MÊME booléen que `recoveryCrossInsight()` utilise pour sa propre phrase) soit littéralement vrai. Le titre (`code`, dérivé du `bodyScore` inchangé) reste une classification plus grossière — "Accumulation" reste légitime quand la charge accumule et qu'un signal corporel (même charge-side seul) est net négatif, tant que la phrase en dessous ne contredit plus ce que dit la carte Récupération juste après.

**Vérifié** : reproduction exacte du cas signalé (récup "RÉCUP STABLE" + fitnessTrend "up" + fatigueTrend "up") via script `tsx` jetable — confirmé que le texte ne mentionne plus jamais "récupération se dégrade" dans ce cas, et affiche à la place *"Ta récupération reste dans ta norme, mais ta charge d'entraînement récente pèse plus que d'habitude (fatigue accumulée en hausse) : à surveiller."* Les 8 branches de `bodyClause` (2 désaccords + 2 accords + 4 nouveaux cas "un seul signal") rejouées en régression, aucun changement de comportement sur les cas déjà corrects. `tsc --noEmit` propre, 2 sandboxes (`/sandbox/athlete/conseils`, `/sandbox/coach/athletes`) smoke-testées.

Déployé en prod le 2026-09-21, push direct sur `main`.

## Refonte "point 1" — tabs Aujourd'hui/Charge/Récupération/Comportements unifiées, header calendrier + `/coach/athletes` retravaillés (2026-09-24/25)

Chantier construit directement en local (POC `poc-coach-context_4.html`/`_6.html`, hors session Claude Code — ce commit n'a jamais transité par une conversation documentée ici, juste committé/déployé/documenté après coup) : fusionne Charge/Récupération/Comportements (jusque-là sur `/conseils` seule) directement dans l'Accueil du sportif et dans Coach Control, via un nouveau bandeau d'onglets partagé, puis 2 fixes supplémentaires le lendemain (placement du toggle Sem./Mois, refonte `/coach/athletes` pour les tests).

### `HomeTabs.tsx` (nouveau) — Aujourd'hui/Charge/Récupération/Comportements
Bandeau d'onglets à 4 entrées (soulignement orange, style proche de `SectionTabs.tsx` mais fichier séparé — `SectionTabs.tsx` reste inchangé, toujours utilisé tel quel par `/coach/athletes`). Monté sur `/today` (`TodayClient.tsx`) et sur `/coach` (`CoachClient.tsx`, quand un sportif est sélectionné). Fix du même jour (2026-09-25, demande explicite) : emojis ⚡/🌿 retirés des libellés "Charge"/"Récupération", `flexWrap` passé en `nowrap` + gap/padding resserrés pour que les 4 tabs tiennent sur une seule ligne en mobile.

### `HomeAnalyticsSections.tsx` (nouveau) — extrait de `ConseilsClient.tsx`
`CrossInsightBanner`/`ChargeSection`/`RecuperationSection`/`BehaviorImpactCard` : mêmes fonctions/formules qu'avant (aucun recalcul dupliqué), déplacées dans un module partagé pour être rendues à la fois par `/today` (onglets sportif) et par `/coach` (carte sombre dédiée par sportif sélectionné, mode "Tous" hors périmètre — pas de vue équipe agrégée pour Charge/Récupération). `/conseils` ("Performance" dans la bottom nav) ne garde plus que le suivi de tests physiques (`TestsPanel`) — les sections Charge/Récupération/Comportements y ont disparu, remplacées par leur présence dans l'Accueil.

### `/today` — fond sombre pour le header, carte séance reste claire
`WellnessRingPOC` affiche désormais la zone relative ("Fatigué"/"Équilibré"/"Frais") dans le ring au lieu du libellé générique "wellness". La zone ring/décision passe en fond sombre (aligné avec Coach Control) mais **la carte séance (`TodaySessionCard`) reste blanche** — retour explicite de Gildas après une 1re tentative qui avait assombri toute la page ("les background des séances doivent rester light, même dans le wellness card, partout").

### `/coach` — barre de filtre sportifs persistante + filtre métrique
Nouveau `AthleteFilterBar.tsx` (chips scoreColor, `useCoachAthleteFilterStorage()` — clé localStorage partagée `coach_athlete_filter`, lue/écrite par `/coach` ET `/coach/planning` pour que la sélection survive à la navigation entre les deux, sans contexte React commun puisqu'aucune des 2 pages n'est montée en même temps). Filtre "métrique basse" (réservé au mode "Tous", reset dès qu'un sportif précis est sélectionné). Carrousel Coach Control désormais présent aussi en desktop (3 cartes visibles, scroll horizontal) — avant limité à une grille figée. Page reste claire, cartes restent sombres (corrige une tentative précédente qui avait assombri toute la page `/coach`, revert explicite).

### Header calendrier (`CalendarHeader.tsx`) — Sem./Mois sorti du header
Toggle `ViewModeSegmented` retiré du header lui-même (fond sombre, segments blancs) — `WeekClient.tsx`/`CoachPlanningClient.tsx` le rendent désormais eux-mêmes juste au-dessus de leur grille de jours, en style clair. Rings/dots du popup calendrier (jour par jour, `dotMap`/`wellnessMap`) construits via un nouveau `relativeWellnessByDate()` (`wellnessBaseline.ts`) — remplace `wellness_daily.score` brut par le score RELATIF (même convention que tous les autres rings de l'app depuis le chantier "Wellness relatif" du 2026-08-30/31), câblé sur les 3 appelants (`TodayClient`/`CoachClient`/`CoachPlanningClient`).

### `/coach/athletes` — refonte pour les tests
Retour explicite de Gildas : la liste roster n'était "pas adaptée aux tests". Nouveau `getAthletesTestVerdicts()` (`testSummary.ts`) — même pipeline que `TestsPanel.tsx` (`canonicalMetricKey`→`computeAllFamiliesInsights`→`buildVerdict`), batché en une seule passe pour tout le roster (RLS bloque la lecture cross-owner, client admin — même schéma de requête que `getAthletesLastTests()`, volontairement pas fusionnée avec elle). `TestVerdictBox` affiche le verdict forces/faiblesses tous tests confondus directement sur chaque ligne repliée du roster (même encadré que l'insight `trendInsights` déjà présent au-dessus), `null` = aucun test loggué, pas de placeholder.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre sur l'ensemble du working tree avant commit — travail déjà fait en local par Gildas (dev server actif), Claude n'a fait que le fix HomeTabs (emojis/nowrap/gap), committer l'ensemble, pousser et documenter après coup.

Déployé en prod le 2026-09-25, commit `92b4db2`, push direct sur `main` — confirmé `READY` sur Vercel (alias `go.theperfclub.com`).

## Fond COACH_PAGE_BG étendu à /coach/planning et /coach/athletes + fix icône profil (2026-09-26)

Suite directe du round précédent — Gildas a demandé d'étendre le traitement (jusque-là seulement `/coach`) aux 2 autres pages coach, plus un bug de contraste trouvé en le regardant en vrai.

### `CoachPageBg.tsx` (nouveau, `src/components/calendar/`)
Le wrapper `background: COACH_PAGE_BG` + trick `minHeight`/`marginBottom`/`paddingBottom` (clearance bottom nav) — d'abord écrit en inline dans `CoachClient.tsx` — est extrait en composant partagé : `/coach/planning` a **3 branches de retour distinctes** (empty state, vue "Tous", vue sportif sélectionné) qui doivent chacune l'appliquer, dupliquer le style inline aurait été fragile. `CoachClient.tsx` lui-même refactorisé pour l'utiliser aussi (plus de div inline). `/coach/athletes` n'a qu'un seul retour, plus simple.

Pour chacune des 3 pages : `<CalendarHeader>` déplacé à l'intérieur de `<CoachPageBg>`, avec `seamless` (pas de fond propre) — le fond de page peint désormais aussi le top nav, en continu.

### Fix contraste — icône profil illisible sur fond clair
Repéré en testant en vrai : le bouton profil de `CalendarHeader` (`background: rgba(255,255,255,.10)`, icône blanche translucide) est conçu pour un fond DARK — sur `COACH_PAGE_BG` (clair), quasi invisible. Les autres boutons du header (flèches ‹›, sélecteur de date) restent lisibles tels quels (pills sombres opaques, `#202020`/`#1a1a1a`, pas de problème de contraste avec un fond derrière puisqu'ils sont déjà opaques) — seul le bouton profil dépend du fond.

**Nouveau prop `theme?: "dark" | "light"`** sur `CalendarHeaderProps` (défaut `"dark"`, comportement inchangé partout ailleurs) — `"light"` bascule le bouton profil en pill sombre translucide (`rgba(0,0,0,.05)`/`rgba(0,0,0,.62)`) au lieu de blanche. Câblé sur les 3 pages coach (aux 4 emplacements `<CalendarHeader>` au total, 3 branches sur `/coach/planning`).

### Discussion ouverte, non tranchée (questions de Gildas, réponses données sans exécuter)
- **Sélecteur de sportif au-dessus de la top nav ?** Avis donné : garder l'ordre actuel (nav date/profil = nav primaire, sélecteur de sportif = filtre contextuel en dessous) — pas un avis tranché, à revoir si Gildas préfère "qui" avant "quand" en testant.
- **Même thème dark cyan que le sportif, pour la cohérence ?** Avis donné : garder le clair orange plutôt que par pure cohérence visuelle — différenciation volontaire déjà cohérente avec un choix antérieur explicite de Gildas (page coach volontairement restée claire, voir section "point 1" plus haut) et avec l'usage réel (coach consulte en journée/en salle, sportif plutôt matin/soir). Pas encore tranché, à décider après avoir vu les 2 côte à côte.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre. Serveur local redémarré à froid (`.next` vidé) à la demande de Gildas pour tester — pas de clic réel par Claude.

Déployé en prod le 2026-09-26, commit `c1d2e6f`, push direct sur `main`.

## Refonte des listes coach + app coach sur le fond sombre du sportif (2026-09-26)

Suite de la même journée (datepicker "vue mois", fond sombre /week). Point de départ : un POC grossier
fourni par Gildas (`~/Downloads/coach-charge-poc.html`) — une liste de cartes sportifs par onglet
(Charge), avec badge de statut, pastilles de signaux, mini-sparkline et sections par sévérité. Consigne
explicite : *"Ce POC est juste un POC, c'est toi qui a la connaissance métier de l'app, donc propose
mieux si tu peux"* — les couleurs/scores du POC (palette GitHub générique, scores "72/91/58" fictifs)
ont donc été écartés au profit des vraies fonctions/seuils de l'app.

### Cartographie faite avant d'exécuter (le CLAUDE.md était en retard sur le code)
La demande portait sur "les cartes en vue liste côté coach sur onglet charge, récupération et
comportement **et performance (/conseils)**". Vérification du code réel plutôt que de la mémoire :
- La "vue liste coach" est `TeamAnalyticsList` (`HomeAnalyticsSections.tsx`), affichée sur `/coach`
  en mode "Équipe" quand l'onglet actif n'est pas "Aujourd'hui".
- **`/conseils` ne contient plus Charge/Récupération/Comportements** (déménagés dans les onglets de
  `/today` au chantier "point 1" du 2026-09-24) : cette page ne porte plus que `TestsPanel`. La
  cible réelle de "performance" était donc `/coach/athletes`, qui porte le même libellé "Performance"
  dans la bottom nav côté coach — signalé explicitement à Gildas plutôt que deviné.

### `TeamAnalyticsList` redessiné
Chaque ligne passe d'un bandeau plat (ring + nom + 1 badge) à une carte dense, entièrement alimentée
par des valeurs déjà calculées dans `ConseilsData` (aucune donnée fabriquée) :
- **Sections par sévérité** ("À surveiller"/"Optimal"/"Sous-charge" pour Charge, "À surveiller"/
  "Stable"/"En forme" pour Récupération, "Points d'attention"/"Stable" pour Comportements) — `sectionFor()`
  dérive le bucket des mêmes libellés de zone (`loadInfo.label`/`recoveryInfo.label`/`topBehaviors`)
  déjà affichés en badge, jamais un nouveau seuil. L'ordre interne de sévérité (tri préexistant) est
  préservé à l'intérieur de chaque section.
- **Liseré gauche** coloré par `metricStatusColor()` — même source de couleur que la section.
- **Badges de signaux** : Fitness/Fatigue/Monotonie/Contrainte pour Charge, les 4 dimensions
  (`dimensionBadgesSeries`) + Forme pour Récupération — tous en `ZoneBadge size="sm"` avec leur
  tooltip pédagogique existant.
- **Mini-sparkline 7j** (`MiniBars`, nouveau) : volontairement PAS `ZoneSparkline`/`SparkLineClient`
  (tooltip/zones/animation, trop lourd pour une ligne de liste). **Hauteur en UA** (charge journalière
  brute Foster session-RPE, `zoneLoads`) et **couleur par zone ACWR du même jour** — 2 valeurs
  différentes par barre, d'où l'API `points: {value, color}[]` plutôt qu'un `colorFor(value)`
  (2026-09-26, retour de Gildas : "les barres en UA" — l'ACWR, ratio borné ~0-2, écrasait l'amplitude
  réelle jour à jour). Récupération garde le score 0-100 coloré par `wellnessColor`.
- **Comportements** : phrase "✗ … pénalise / ✓ … améliore sa récupération de X pts" à la 3e personne,
  reprenant exactement les chiffres de `topBehaviors()` — remplace les 2 pastilles sans contexte.
- Sport retiré des lignes (retour de Gildas, "pas besoin d'afficher le sport dans les listes").

### `/coach/athletes` ("Performance") recentré sur les tests
- En-tête "Coach / Mes sportifs / N sportifs suivis / + Inviter" **supprimé** (redondant avec le titre
  "Performance" du `CalendarHeader`) ; le bouton d'invitation survit, déplacé en bas de liste pleine
  largeur — même convention que `CoachClient.tsx`.
- Badges Charge et Récupération retirés : **seul le dernier test** reste (`TestBadge`), et le liseré
  gauche est piloté par lui (vert/rouge selon `improved`, gris si aucun test).
- **Seul l'insight des tests** (`TestVerdictBox`, verdict forces/faiblesses) est affiché — l'insight
  croisé charge/récup (`trendInsights`) est retiré de cette page : elle ne parle plus que de tests.
  L'état `trends`/`trendInsights` reste fetché mais n'est plus rendu (dead code assumé, le retirer
  toucherait `page.tsx` + la route API pour zéro gain visuel).
- `loadBadge()` supprimée (devenue morte, locale, aucun autre appelant) ; `athleteStatus` conservée,
  toujours importée par `InviteModal.tsx` et `FrisePreviews.tsx`.

### L'app coach passe sur le fond sombre cyan du sportif
Demande explicite de Gildas : *"update l'app coach avec le même couleur de BG que le sportif avec le
cyan. Fais les adaptations nécessaires de couleurs de typo etc"* — tranche la question restée ouverte
le 2026-09-26 matin (où l'avis donné était de garder l'orange clair pour différencier les usages).
`CoachPageBg` passe donc de `COACH_PAGE_BG` à `DARK_CARD_BG` : **l'app coach abandonne sa convention
"page claire + cartes sombres" pour celle du sportif** (page sombre + cartes claires/translucides).
`COACH_PAGE_BG` reste exporté dans `theme.ts` mais n'a plus d'appelant.

Adaptations nécessaires, page par page :
- `theme="light"` retiré des 5 appels `CalendarHeader` coach (l'icône profil redevient blanche).
- **`AthleteFilterBar`** : barre sticky blanche → sombre translucide + `backdrop-filter` (laisse le
  dégradé de la page transparaître au lieu d'empiler un 2e fond), puces en contour blanc translucide.
- **`CoachCard`** : ne peut plus porter `DARK_CARD_BG` — la page le porte déjà, la carte disparaîtrait
  dans le fond, avec en prime un décalage de dégradé visible (chaque boîte recalcule son propre radial
  à sa taille). Remplacé par un voile blanc translucide (`rgba(255,255,255,.055)`) qui la fait lire
  comme un panneau posé au-dessus — vrai aussi bien sur le dashboard que dans les aperçus onboarding.
  Même traitement pour toute surface sombre posée sur la page sombre.
- **`/coach`** : salutation, titres de section, ligne "Filtre : X bas" en blanc ; les 5 cartes de
  filtre métrique (Sommeil/Stress/…) passent de blanches à surfaces translucides ; `HomeTabs` repasse
  en mode `dark`.
- **`/coach/planning`** : textes d'état vide en clair, `ProgramBanner` reçoit `dark` (il est
  transparent depuis la veille, sa typo doit suivre le fond).
- **`/coach/athletes`** : `TestsPanel` reçoit `onDarkPage` (sinon sa carte sombre interne se superpose
  au fond sombre) — exactement le même prop que `/conseils`.

### 3 retours de suivi le même jour
1. **Plus d'encadré autour des charts** quand un sportif est sélectionné (onglets Charge/Récup/
   Comportements) : la carte enveloppante est supprimée, les sections se rendent dans un simple
   fragment — **strictement le même rendu que `/today`** ("je veux iso à l'app sportif en fait").
   Cet encadré n'avait de sens que tant que la page coach était claire.
2. **`AthleteFilterBar` remonté tout en haut**, au-dessus du header de date, sur les 4 emplacements
   (`/coach`, `/coach/planning` ×2 branches, `/coach/athletes`) — "qui" avant "quand", et c'est la
   seule barre sticky de ces pages. Limite connue signalée : sur un compte non abonné, `UnsavedBanner`
   est lui aussi `sticky top:0` (comportement pré-existant, les deux peuvent se superposer au scroll).
3. **Les listes de cartes prennent la surface des CoachCard** ("pas blanche") : `TeamAnalyticsList` et
   la liste `/coach/athletes` passent en `rgba(255,255,255,.055)` + bordure `rgba(255,255,255,.10)`,
   avec toute la typo recalibrée (noms en blanc, encadrés d'insight translucides, accent d'action en
   `#ff8a55` au lieu de `#d44000` illisible sur sombre, accents ✓/✗ en vert/rouge clairs, menu `⋯` et
   son dropdown en sombre).

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre après chaque round. **Piège JSX rencontré 3 fois** :
un `{/* commentaire */}` inséré entre `return (` et l'élément racine casse le composant (2 enfants
racines sans fragment) — écrire le commentaire AVANT le `return`, jamais entre les deux.

Vérifications navigateur arrêtées en cours de chantier à la demande explicite de Gildas ("pas la peine
de vérifier à chaque fois, c'est moi qui fait la QA") — règle désormais élargie à la sandbox non
authentifiée, pas seulement au compte réel (voir la mémoire `feedback_prefers_self_testing`). Les
rounds antérieurs du chantier avaient été vérifiés en clic réel sur `/sandbox/coach` (sections, badges
de signaux, sparkline, dégradation propre quand la fixture sandbox n'a ni wellness ni test).

**Limite pré-existante constatée au passage, pas corrigée** : les sportifs démo de la sandbox coach
n'ont pas d'historique wellness dans `ConseilsData` — la sparkline Récupération ET le chart individuel
existant (`RecuperationSection`) sont vides pour eux, tous les deux. Une limite de la fixture, pas du
rendu.

Déployé en prod le 2026-09-26, commit `915b8c5`, push direct sur `main`.

## Invitation déplacée dans le "+" de la nav, onglet "Accueil", sélecteur "Groupe" sans scores (2026-09-26, suite)

4 demandes groupées de Gildas, dans la foulée du chantier fond sombre coach.

- **`BottomNav.tsx`** : le bottom sheet du "+" central gagne une 3e option **côté coach uniquement**,
  "👥 Inviter un sportif" → `/coach/athletes?quickadd=invite`. `AthletesClient.tsx` gagne l'effet qui
  lit ce param au montage, ouvre `InviteModal` et nettoie l'URL — même mécanisme (et mêmes deps
  `[searchParams]`, pas `[]`, pour la raison déjà documentée : cliquer le "+" depuis la page déjà
  montée ne la remonte pas) que `?quickadd=session|program` sur `/week`/`/coach/planning`. Le
  commentaire de `quickAddOptions()` disait exactement l'inverse depuis 2026-08-31 ("jamais 'Ajouter
  un sportif' ici, volontairement") — réécrit.
- **CTA d'invitation retirés** : le bouton pleine largeur en bas de `/coach` et de `/coach/athletes`,
  plus la carte "+ Inviter →" qui occupait la 6e colonne de la grille de filtres métriques de
  `/coach` (grille repassée à `repeat(DIMENSION_KEYS.length, 1fr)`). L'`InviteModal` de
  `CoachClient.tsx` devenait injoignable → supprimé avec son state, son import et la référence dans
  le garde-fou de `useHorizontalScrollNav`. **Gardés volontairement** : le formulaire d'invitation de
  l'état vide (0 sportif — c'est la seule action possible de l'écran, pas un CTA redondant) et le
  bandeau d'activation J0.
- **"Aujourd'hui" → "Accueil"** dans les 2 bottom navs (sportif + coach) : cet onglet ne porte plus
  que la journée depuis que Charge/Récupération/Comportements y ont été ajoutés en onglets
  (chantier "point 1", 2026-09-24).
- **"👥 Équipe" → "👥 Groupe"** dans `AthleteFilterBar`.
- **Scores de forme retirés des puces du sélecteur** : c'est un sélecteur de profil, pas un tableau de
  bord — le score du sportif sélectionné est de toute façon sur le ring juste en dessous. Le prop
  `scores` (score RELATIF calculé par l'appelant, ajouté la veille pour corriger un chiffre faux) et
  les calculs `filterBarScores` de `CoachClient.tsx`/`CoachPlanningClient.tsx` disparaissent avec
  l'affichage, plus l'import `scoreColor` devenu inutile.

`tsc --noEmit` propre. Pas de clic réel par Claude (Gildas fait la QA, voir la mémoire
`feedback_prefers_self_testing`). Déployé le 2026-09-26, commit `3da9f54`.

## Score agrégé par onglet — jauge ouverte à 3 niveaux, Accueil et liste coach (2026-09-29)

Suite des cartes d'indice du 2026-09-28. Question de Gildas : les écrans Charge et Récupération étant
denses, un score global type ring ou jauge ne vaudrait-il pas le coup ? POC `charge-variantes.html`
(section « Explorations — synthèse en tête », 4 variantes S1-S4), variante **S2 retenue**.

### Ce n'est pas une note, c'est une position sur un axe
Deux versions ont été construites et comparées dans le POC avant de trancher :
- **Écartée — moyenne pondérée de sous-scores de qualité** (0 = mauvais, 100 = bon). Trois inventions
  empilées (les sous-scores attribués aux seuils, les poids égaux, les bandes du composite) et un
  défaut rédhibitoire vu sur les vraies données de Gildas : **elle sature à 100** dès que les trois
  indicateurs sont dans leur zone, sans voir qu'on glisse vers le bas de l'optimal (son ACWR était à
  0,85, tout en bas de la zone, et le composite affichait « 100 · Sain »).
- **Retenue — une POSITION sur un axe directionnel à 3 niveaux** (reformulation de Gildas) : 0 = un
  bout, 50 = le milieu de la zone visée, 100 = l'autre bout. Sous-charge / optimal / surcharge côté
  charge, fatigué / équilibré / frais côté récupération. Un même chiffre ne peut donc plus vouloir
  dire deux choses contraires.

### Ce qui évite l'invention (`aggregateFor` dans `metricCards.ts`)
- **Charge** : l'axe EST celui de l'ACWR (0-2), donc les bandes tombent sur ses seuils réels (Gabbett
  0,8 et 1,3 → 40 % et 65 % de l'arc) avec leurs vraies proportions. Monotonie et contrainte ne
  peuvent pousser que **vers la droite** (elles ne disent jamais « pas assez ») : elles n'ajoutent
  aucun delta arbitraire, elles posent un **plancher** sur une frontière qui existe déjà (entrée de
  surcharge, ou milieu de surcharge en alerte). Assumé : deux secondaires en alerte ne pèsent pas
  plus qu'un seul.
- **Récupération** : « pas que le wellness » (Gildas). On croise les deux axes réellement
  indépendants — le **ressenti** (le score relatif, déjà le composite sommeil/stress/état
  physique/motivation) et l'**objectif** (la Forme, dérivée de l'entraînement). Fitness et fatigue
  n'entrent pas séparément, ce sont ses composantes ; reprendre les 4 dimensions une par une les
  compterait deux fois. Les deux se moyennent légitimement parce qu'ils partagent la **même échelle
  normalisée et les mêmes frontières** : ±8 % de Forme sur un axe -50/+50 tombe sur 42 % et 58 %,
  exactement les bornes du percentile de récupération (±Z_SWC) — vérifié dans le code, pas supposé.
  Les comportements négatifs de la veille, absents des deux (le signal part du `base_score`), posent
  un **plafond juste sous « Frais »** au lieu d'un malus chiffré.
- **Les couleurs ne sont pas choisies à la main** : chaque bande demande sa couleur à `sigDimInfo()`
  ou à la rampe wellness sur une valeur représentative de sa zone (assertion dédiée), sinon elle
  aurait fini par diverger du chart juste en dessous.

### Rendu — `AggregateGauge.tsx` (nouveau)
Arc **ouvert** de 240°, pas un cercle fermé (Gildas, après avoir vu la version calquée sur la wellness
ring de `/today`) : l'ouverture en bas dit qu'il y a un plancher et un plafond, un cercle suggérerait
un cycle. C'est la forme des jauges contrainte/monotonie, reprise en grand. Le libellé de niveau vit
**dans** l'arc — c'est ce qui permet à la jauge d'être le seul readout du bloc, donc d'être grosse,
sans eyebrow ni libellé répété à côté. Tout le texte est dans un calque HTML à taille fixe, jamais
dans le viewBox (convention du repo). Pas de légende d'axe sous la jauge (retirée sur demande).

### Emplacements
- **Accueil sportif et détail d'un sportif côté coach** (`IndexCards`) : jauge centrée en haut des
  onglets Charge et Récupération, suivie de **l'insight de section centré à 17,5px** — la même taille
  que la ligne « statut · valeur » des cartes mais en graisse 600, pour coiffer les cartes sans
  entrer en concurrence avec chacune. Colonne bornée à 460px (un texte centré plus large devient
  pénible à suivre).
- **Liste coach** (`TeamAnalyticsList`) : remplace l'`AthleteRing` de gauche (Gildas : « la
  wellnessring est le plus pertinent déjà sur l'accueil ») — la colonne de gauche parle désormais de
  l'onglet consulté au lieu de répéter un score de récupération sur l'onglet Charge. 58px, libellé
  masqué (il tomberait sous 4px). L'onglet Comportements n'a pas d'agrégat défini : il garde la ring.

### Tri, sections et liseré de la liste coach alignés sur l'agrégat (2026-09-29, même jour)
D'abord laissé inchangé et signalé, puis basculé à la demande de Gildas. Les trois dérivent
désormais du **même** `aggregateFor`, calculé une fois par sportif en tête de `TeamAnalyticsList` :
- **tri** — charge : le plus éloigné du **milieu de la bande Optimal** remonte, dans un sens comme
  dans l'autre (pas le milieu de l'axe : les bandes n'ont pas la même largeur) ; récup : le plus
  fatigué d'abord. Départage alphabétique à égalité, conservé.
- **sections** — le titre EST le libellé de la bande (Surcharge / Optimal / Sous-charge, Fatigué /
  Équilibré / Frais), donc une section ne peut plus dire autre chose que la jauge de ses lignes.
  Remplace les titres dérivés de `loadInfo.label`/`recoveryInfo.label` ("À surveiller", "En forme").
- **liseré** — la couleur de la bande, au lieu de `metricStatusColor`.

**Pourquoi les trois ensemble et pas le tri seul** : trier par l'agrégat en laissant les sections sur
l'ancienne source remontait en tête un sportif que la monotonie seule met en surcharge, tout en
l'affichant sous « Optimal » — vérifié dans le harnais (ACWR 1,05 parfait + monotonie 2,2 → classé
Surcharge, section la plus préoccupante). L'onglet Comportements, sans agrégat, garde l'ancien
chemin en repli.

### Vérifié
`tsc --noEmit -p tsconfig.notnext.json` propre. **21 assertions** rejouées contre les vraies valeurs
de Gildas (script jetable) : le portage donne exactement ce que le POC affichait (charge **43 ·
Optimal**, récup **53 · Équilibré**), plus les cas limites — plancher de surcharge qui ne tire jamais
un ACWR déjà plus à droite vers la gauche, plafond « pas Frais » qui ne se déclenche que sur un
comportement **négatif** et **du jour de référence**, axe manquant ignoré au lieu de tirer la moyenne
vers le bas, bandes alignées sur les seuils Gabbett. Le POC lui-même est vérifié par un harnais qui
exécute son script et relit le HTML produit (16 contrôles) — `node --check` ne suffit pas, déjà vu
passer du code qui appelait des fonctions supprimées. Pas de clic réel par Claude : Gildas fait la QA.

## Retirer un sportif : tiroir profil, onglet « Mes sportifs » (2026-10-04)

POC : https://claude.ai/artifact/LJKJb4nx5xuvPSFGUcCcP8 (variante A, onglets).
- `ProfileDrawer.tsx` : côté coach uniquement, 2 onglets « Mon profil » (contenu inchangé) / « Mes sportifs » (`CoachAthletesManager.tsx`, nouveau). Liste `coach_athletes` du coach (client normal, RLS), statut Compte actif / Invitation envoyée · email / Profil sans compte, ⋯ → Retirer de mon groupe / Annuler l'invitation / Supprimer le profil, confirmation dans la ligne (plus de `confirm()`), même route `/api/athlete/delete`. Sandbox : la liste de la fixture, l'action ouvre la porte d'inscription.
- Les pages coach gardent leurs sportifs en state : si un sportif a été retiré, fermer le tiroir recharge la page.
- `/coach/athletes` (Performance) : menu ⋯ supprimé, avec `handleDelete`/`menuOpenId`/`deleting`/`gateInput`.
- `/api/athlete/delete` vérifie désormais `.error` sur ses 3 écritures (500 au lieu d'un faux succès).
- **Invitation sur place partout** : `InviteHost.tsx` (monté une fois dans `(app)/layout.tsx` côté coach et dans la sandbox coach) écoute `OPEN_INVITE` et affiche `InviteModal` (code d'invitation lu dans `profiles` à l'ouverture ; fermer après une invitation recharge la page, via le prop `onSent`). `openInvite()` est appelé par « + Inviter » (`AthleteFilterBar`), l'étape « Invite tes sportifs » de la checklist, le tiroir de l'activité et la carte d'invitation du Coach Control — plus aucune redirection vers `/coach/athletes?quickadd=invite` (le paramètre reste lu par la page, sans appelant). N'ouvre pas l'onglet « Mes sportifs ».
- Email affiché pour chaque sportif (inscrit : lu dans `auth.users` par `GET /api/coach/roster`, admin après vérification de propriété ; invité : `invite_email` ; profil démo : aucun).
- Menu ⋯ : « Voir sa journée » (pose la sélection de la barre des sportifs puis ouvre `/coach`), « Renvoyer l'invitation » (invités seulement, `POST /api/invite/resend`, renvoie l'email Resend), puis l'action de retrait.

## Coach Control v2 : radar, revue en swipe, lignes à jauges (2026-10-05, DÉPLOYÉ)

POC : https://claude.ai/artifact/LJKJb4nx5xuvPSFGUcCcP8. Vue Groupe de `/coach` (onglet Aujourd'hui, aucun sportif sélectionné) uniquement ; la vue d'un sportif sélectionné ne change pas.
- **Remplace** le carrousel « À décider », la grille « Plan cohérent » et les 4 tuiles de filtre par métrique (le state `metricFilter` reste, plus affiché).
- **Gauche** : `CoachRadar.tsx` (X = score de récup affiché par la carte, relatif dès que la norme existe ; Y = RPE prévu de la séance la plus dure du jour). Zones de fond = table de `computeAutoregSuggestion` (Fatigué < 42 → Alléger ; 42-58 + séance ≥ 8 → Marge ; > 58 + séance ≤ 7 → Peut pousser). Contour du point = vraie suggestion de la carte (même source). Sans séance ou sans check-in → colonne « Sans données ». Bouton « Passer en revue · N décisions ».
- **Droite** : lignes « À décider maintenant » / « Décidé aujourd'hui » / « Plan cohérent » : nom, séance, pastille (Alléger/Surcharger, « À vérifier » si signal sans reco chiffrée, « À décider » si verrouillé en gratuit), `AthleteRing` (extrait dans `components/coach/AthleteRing.tsx`, libellé « well. » → « récup ») + `DecisionRingMini showValue` (RPE au centre, zone seulement s'il y a une reco). « + Invite un sportif » en bas.
- **Revue** : `CoachDecisionDeck.tsx`, plein écran, la vraie `CoachCard` une à la fois. Glisser à droite = la reco, à gauche = Maintenir, via le nouveau prop `actionRequest` (CoachCard → AutoregButtons, exécute les mêmes `apply()`/`maintenir()` que les boutons). La carte part dès que `isReviewed` devient vrai ; rien enregistré en 2,5 s (paywall, erreur) → la carte revient. « Plus tard » remet en fin de file. Un clic sur une ligne hors file ouvre la carte seule. File figée à l'ouverture.

### Suite (2026-10-05, DÉPLOYÉ) — reco en diagonale, le radar devient la référence du calcul
- **`computeAutoregSuggestion` réécrit** (remplace la grille z/Hopkins + exceptions par difficulté du 2026-09-27/29, sections plus haut devenues historiques). Axe X = récupération effective 0..100 (`effectiveRecoveryX` : percentile personnel `relativeScore` dès que la norme existe, sinon score absolu ramené par `recoveryAxisX`, 60 → 42 et 80 → 58 ; moins la pénalité chronique, jamais pour un sportif > 58). Bande « Maintenir » `autoregBand(x)`, façon WHOOP arrondie : s(x) = 1/(1+e^(−(x−50)/9)), haut = 4,5 + 6·s(x) (plateau 4,5 fatigué, 7,5 équilibré, 10,5 frais), bas = haut − 6 (frais : toute séance facile ≤ 4 est surchargée). RPE prévu > haut → Alléger ⌈RPE − haut⌉ ; < bas → Surcharger ⌈bas − RPE⌉ ; plafond 2 (3 si critique, garde-fou < 40 ou `Z_SEVERE`). `kind: "norm_hard"` = allègement d'un sportif non fatigué (x ≥ 42, sans pénalité).
- Tableau obtenu (x \ RPE) : x=10 → allège dès 5 ; x=50 → allège 8 (−1), 9-10 (−2) ; x=58 → surcharge 1-2, allège 9-10 ; x=70 → surcharge 1-3, allège 10 ; x≥85 → surcharge 1-4, jamais d'allègement ; une séance à 5 ou plus n'est jamais surchargée ; équilibré : RPE 1 → +1. Un fatigué sur une séance facile n'est plus allégé.
- `chronicPenaltyFor(sessions, anchor, perspective)` extrait de `computeDecisionCard` (decisionCard.ts) pour que le radar place chaque sportif là où la reco le voit.
- `CoachRadar` : bande tracée avec `autoregBand`, zones Alléger (rouge) / Maintenir (gris, diagonale) / Surcharger (vert), légendes Facile/Modérée/Dure (axe vertical, seuils de DiffGauge) et Fatigué/Équilibré/Frais (axe horizontal), plus aucun chiffre ni titre d'axe. X = récupération effective (`groupRadarX`).
- Jauge « récup » des lignes = `recoveryAxisX` (sans pénalité chronique, sans la Forme) dans `AggregateGauge`, plus l'agrégat de l'onglet Récupération.
- Non revérifiés après ce changement : les démos calibrées sur l'ancienne règle (DecisionStep onboarding, simulateur `/p/[id]`, wizard, sandbox sportif).
- Fix du repli absolu (`recoveryAxisX`) : la bande neutre [60, 80] est posée sur [42, 58] (une 1re version la décalait de 10 points, 60 → 34).
- Radar : points à leur position EXACTE (l'anti-chevauchement, qui pouvait faire passer un point de l'autre côté d'une frontière, est retiré).
- Démos revérifiées par script avec la nouvelle règle : WellnessCardPreview 45/8 → Alléger −2 ; CoachControlPreview 88/3 → Surcharger +1 ; previews onboarding 35 + séance 5-9 → Alléger (−2/−3, critique < 40) ; sandbox coach Léa −3, Karim −2, Sofia +2, Nora +1, Thomas sans séance ; sandbox sportif (42, séance 8) → Alléger −2 ; simulateur `/p/[id]` et wizard : Alléger en bas du curseur, Maintenir au milieu (72 = équilibré), Surcharger des séances ≤ 4 en haut.
- Design (2026-10-05) : en-tête du radar remplacé par une phrase d'explication ; points = `DecisionRingMini` (prop `centerLabel`, initiales au centre) sur disque sombre neutre, plus de fond/contour colorés ; légende 3 items Alléger / Maintenir / Surcharger (couleurs des zones) ; sportifs sans séance ou sans check-in en bande sous le radar (plus de colonne latérale) ; vue Groupe en pleine largeur (`maxWidth: none`, comme le Planning).
- Points du radar : `DecisionRingMini thin` (même épaisseur que les lignes), zone pointillée toujours dessinée, nouveau prop `disc` (disque de fond centré sur l'arc, pas sur la boîte) + `decisionRingMiniCenterY()` pour poser le centre de l'arc exactement sur la donnée. En `thin`, le cadre de zone est un peu plus large que le trait (×1,05 au lieu de ×0,75) pour rester lisible, lignes comprises.
- Radar sans carte enveloppante (ni fond ni bordure, comme les charts de l'Accueil), légende retirée (les mots des zones suffisent), disque des points semi-transparent (`rgba(10,14,18,.55)`), sportifs « sans séance ou sans check-in » en simples pastilles d'initiales.

## Éditeur de programme : mêmes features que les séances, commentaires du coach suivent le programme (2026-10-08)
- **Modèle / Importer / Générer** (`SessionQuickFill`) dans les séances d'un programme : la condition `session?.user_id !== "template"` d'`AddSessionModal` est retirée. Difficulté remplie aussi pour un template (toujours "édition"). `ProgramBuilderModal` prop `sport` (passé par `ProgramLibraryPage` depuis `step.meta.sport`, null pour un programme vierge) présélectionné dans Modèle/Générer.
- **Auteur des commentaires** : `AddSessionModal` prop `authorRole` (défaut sportif) ; `ProgramBuilderModal` passe son `role`, que `ProgramLibraryPage` fournit enfin (`coachSide`). En template, l'utilisateur connecté et son `profiles.name` sont lus par la modale (signature du vrai nom au lieu de « Toi »).
- **Autocomplete** en template : historique réel (sportif : `sessions` faites ; coach : `coach_sessions` faites qu'il a créées).
- **Recopie à l'assignation** (`src/lib/programMedia.ts`, `mediaForAssignment`) : `POST /api/programs/[id]/assign` (séances + acclimatation) et `/resync` copient `exercise_media` du template. Commentaires de sportif retirés sauf si le sportif s'assigne son propre programme ; un test garde son marquage, jamais sa valeur. Les commentaires du coach déclenchent le point de notification chez chaque sportif.
- Limites : programmes déjà assignés non rétro-remplis (réassigner ou « Mettre à jour mes séances à venir ») ; un programme partagé via `/p/` garde ses commentaires dans la copie claimée.
- Déployé le 2026-10-08, commit `62ef641`.

## Aperçu programme, Coach Control décidé, message d'invitation prêt (2026-10-27)
POC avant/après : https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu. Objectif : que le coach sente la valeur au 1er radar alors qu'il n'a invité personne (7 coachs sur 59 invitent), et que le sportif voie son programme vivre avec sa forme. Boucle des 5 premiers matins écartée : 4 sportifs sur 213 ont les notifs.
- **ob_week (sportif, `WeekStepBody`)** : sur-titre « Ton programme est prêt », titre « Ton programme {sport}, ajusté chaque matin. » (sport tiré du nom « Programme X » ; programme claimé : sans sport), sous-titre « N semaines jusqu'au {échéance}, construit sur tes réponses. », CTA « C'est parti ». Bannière programme, puis le simulateur de forme de /p/ (même rampe `WELLNESS_RAMP`, `relativeZoneLabel`, `WellnessRing`, collé en haut au défilement) qui démarre sur son vrai check-in (« Ta forme ce matin », 60 s'il l'a passé), puis ses séances des 7 prochains jours en cartes complètes recalculées au glisser (alerte, `DecisionGauge` + zone, badge de points, exercices réécrits, comme /p/). Remplace les onglets Cuit / Aujourd'hui / En forme. Pas de détail des 8 semaines (refusé).
- **ob_control (coach, `ControlStepBody`)** : un seul écran. Sur-titre « Coach Control · ce matin », titre « Une séance, ajustée à la forme de chacun. », sous-titre « Thomas vient de faire son check-in : nuit courte, jambes lourdes. À toi de décider. ». Radar avec les 4 démos (plus de listes « À décider »/« Dans le plan »), puis le vrai anneau `AutoregButtons` + `AlertBox` sur Thomas et sa carte de séance réécrite en direct. « Continuer » toujours actif, même sans décider (choix assumé : ne pas bloquer). `AutoregButtons demo` : ni `autoreg_adjust`, ni `markFirstAdjustment` (le coach est déjà connecté, ça aurait posé `first_adjustment_at` et ouvert le priming), ni écriture (sessionId non-UUID). PostHog `ob_control_continue {decided, pct, skipped?}`.
- **Message prêt (`InviteForm readyMessage`)** : sous prénom + email, « Ou par WhatsApp, message prêt et modifiable » : texte au prénom tapé (`readyInviteText`, check-in en 10 secondes + lien /join/{code}), modifiable (ne suit plus le prénom une fois édité), boutons « Envoyer sur WhatsApp » / « Copier ». Remplace le bloc « Lien d'invitation ». Activé sur ob_invite et dans le tiroir « + Inviter » (`InviteHost`). PostHog `invite_ready_message {action: whatsapp|copy, edited}` (un envoi WhatsApp ne crée pas de ligne coach_invites).
- Écartés pendant le POC : place vide « Ton 1er sportif » sur le radar et l'Accueil (Gildas préfère l'écran d'invitation actuel), aperçu programme côté coach (le radar montre déjà son programme).
- Pas testé dans le vrai flow /register (captures via une page sandbox locale non commitée) : à vérifier sur iPhone, notamment le simulateur collé en haut dans `QuestionShell`.

## Côté coach : verdict de séance, bilan du sportif, seuil recalé (2026-10-24)

Pour la section landing coach « De la prog au bilan. Et chaque conseil vérifié » (POC https://claude.ai/artifact/6hpkjmcgdJcV4sbj24hfc5).
- **Verdict** : comme côté sportif, uniquement dans l'écran de résultat (`CoachResultHost`, toucher une séance faite), pas sur la carte (essayé en titre de `CoachCard` puis retiré le 24/10, Gildas : « pareil que côté sportif »). `sessionVerdict(s, subject?)` extrait de `sessionResult`. Planning : l'écran s'ouvre aussi juste après que le coach a noté la séance (`completeSession`), comme le sportif après la sienne.
- **Bilan du sportif** : `BilanCarousel` prop `subject { athleteId, name }` → lecture via `GET /api/coach/bilan` (vérifie le lien coach_athletes, puis client admin), textes à la 3e personne (`T(you, them)` dans `SlideBody`, « l'app » au lieu de « je »), écran « partage » retiré, pas de bouton « Me recaler » (le sportif décide ; le coach voit « Seuil recalé » ou « Recalage proposé »). Accès comme le sportif : liens « Bilan › » / « Bilan du mois › » / « Depuis le début › » du calendrier (`onOpenBilan` de `CalendarHeader`) sur Coach Control et le Planning, dès qu'un vrai sportif est sélectionné. Compte coach gratuit : paywall. PostHog `coach_bilan_opened` {from, period}, `bilan_opened` source `coach`.
- **Seuil recalé** : pastille « SEUIL RECALÉ » sur `/coach/athletes` si `profiles.autoreg_shift > 0` (`CoachAthlete.autoreg_shift`).
- **Résultat d'une séance faite** : toucher le bloc durée / difficulté (ou la carte compacte de la revue en swipe) ouvre l'écran de résultat, comme le sportif (`CoachAthleteCard`, `onComplete` / `onEditSession` → `openCoachSession`).

## Check-in et résultat de séance saisis par le coach (DÉPLOYÉ 2026-10-26, `25e061f`)
Besoin : usage en salle, une tablette sur le compte coach ; le coach (ou le sportif à qui il tend la tablette) remplit le check-in et le résultat de séance. **Décision de Gildas** : pas de « mode salle » dédié (grille de prénoms, code de sortie, maquette abandonnée), mais les mêmes boutons que l'Accueil du sportif, à la 3e personne, sur la vue pleine page d'un sportif sélectionné dans Coach Control (`CoachCard`, prop `page`).
- **Check-in** : « Faire le check-in de X » (ou « Modifier son check-in » s'il est fait) ouvre `WellnessModal` avec la prop `subject` : questions à la 3e personne avec le prénom, historique lu via `GET /api/coach/bilan` (RLS), pas de teaser ni d'écran montre, pas d'écran de résultat (la carte Coach Control se met à jour). Enregistrement via `POST /api/coach/checkin` (lien coach vérifié, client admin, `withDeviceScore` pour la montre du sportif, `.error` vérifié), puis la modale appelle `/api/sessions/proposal` avec `athleteUserId` : le conseil du matin est figé pour le sportif comme s'il avait fait le check-in lui-même. Échec d'enregistrement : message visible, la modale reste ouverte.
- **Séance** : `onComplete` de `TodaySessionCard` (bouton Terminer) ouvre `CoachCompleteModal` (le même qu'au Planning), `action: "complete"` sur `/api/coach/session`, puis `openCoachSession` (écran de résultat). Avant ce chantier, Coach Control affichait le RPE/la durée sans permettre de les saisir (seul le Planning le permettait).
- **Sportifs sans compte** (`user_id` null) : exclus, choix de Gildas (pas de `wellness_daily` possible sans compte ; le « compte géré » invisible a été proposé et écarté). Aucun bouton en sandbox.
- Vérifié : `tsc`, build, route 401 sans session ; parcours testés par Gildas en local avant mise en ligne.

## Bilan du groupe (DÉPLOYÉ 2026-10-26/27, `7e8b648` → `5247532`)
Coach Control, **vue Groupe** (aucun sportif sélectionné) : les liens « Bilan › » (semaine), « Bilan du mois › » et « depuis le début » du calendrier ouvrent le bilan de tous les sportifs inscrits. Accès choisi par Gildas. Même coque que le bilan individuel (`BilanCarousel`, prop `group`) ; compte coach gratuit : paywall, comme le bilan d'un sportif. Pas de bilan en sandbox (sportifs démo sans compte).
- **Données** : `GET /api/coach/group-bilan?today=` : liens lus par le coach (client normal), puis client admin ; lectures paginées par 1000 lignes (plafond Supabase) ; un sportif lié deux fois compte une fois ; toutes les séances, faites ou non (« qui décroche » compte les jours de séance). Sportifs sans compte exclus.
- **Calcul** : `src/lib/groupBilan.ts` (`computeGroupBilan`). Historique d'inscription exclu (`isSynthetic`). Chaque écran saute sous son seuil, et **un seul sportif avec des données suffit** (le seuil initial de 2 sportifs faisait sauter 3 écrans sur 4 chez un coach avec un seul sportif actif, corrigé le 26/10). Jamais de moyenne du groupe : des prénoms, triés du plus préoccupant au moins préoccupant.
- **Les 5 écrans, dans l'ordre** :
  1. `g_decroche` « Qui décroche » (≥ 3 jours de séance sur la période) : chaque jour de séance = check-in fait / fait mais fatigué (zone relative de la carte du jour : Fatigué, Zone prudente, Zone récupération) / manqué. Alertes : « Plus de check-in » (4 derniers jours de séance manqués), « Check-ins manqués » (≥ 3 et ≥ 40 %), « Souvent fatigué » (≥ 3 et ≥ 40 % des check-ins faits). Sans alerte : « Tout le groupe suit ».
  2. `g_seances` « Tes séances » (refait le 27/10 : le regroupement par nom de séance ne s'affichait jamais quand chaque sportif a ses propres séances) : prévu vs ressenti par **mot de difficulté prévue** (légère, modérée, dure ; « très dure » exclue), quel que soit le nom, même règle que « Tes biais » du bilan sportif (plus dure = mot ressenti au-dessus du mot prévu). Un niveau compte à partir de 5 séances notées ; sous chaque niveau, « Surtout X et Y » (≥ 2 séances de ce niveau, plus dures une fois sur deux). Titre d'alerte si ≥ 60 % (« Tes séances modérées sont ressenties dures »). En plus, si elle existe : la même séance (même nom, casse et espaces ignorés) faite par ≥ 2 sportifs, ≥ 5 notes et ≥ 60 % plus dure, en une ligne « en particulier ».
  3. `g_appris` « Appris sur chacun » (27/10) : pour chaque sportif, l'enseignement le plus fort de son propre bilan (`computeBilan` sur tout son historique jusqu'à la fin de la période), dans l'ordre signal appris (`predit`) > soirée (`fatigue`) > biais > levier > ressenti vs montre, en une phrase avec le prénom. Intitulés neutres (« Signal appris », « Fatigue »…), jamais « il/le ». Sportif sans assez d'historique : absent.
  4. `g_conseils` « Conseils vérifiés » (≥ 5 conseils jugés) : `allVerdicts()` (exporté de `bilan.ts`, même juge et mêmes seuils du jour que la frise), « x sur y » par sportif, le moins bien lu en premier.
  5. `g_charge` « Charge » : ACWR comme l'écran charge individuel (compté après 28 j d'historique, zone 0,8-1,3) ; seuls les sportifs sortis de leur zone ont une carte, les autres tiennent en une ligne. Titre d'alerte si ≥ 30 % des jours au-dessus (ou en dessous), sinon « dans sa zone » (« à quelques jours près » s'il y a des sorties).
- **Lien vers le bilan de chaque sportif** (27/10) : « Bilan de X › » sous chaque prénom (écrans 1, 3, 4, 5) ouvre son bilan complet à la 3e personne, même période, par-dessus le bilan du groupe (`BilanCarousel` se rend lui-même avec `subject`) ; la croix ramène au même écran du groupe ; seul le bilan du dessus écoute le clavier. Événement PostHog `coach_bilan_opened` (`from: "group_bilan"`) ; ouverture du groupe : `coach_bilan_opened` (`scope: "group"`) puis `bilan_opened` (`source: "coach_group"`).
- **Daltonisme** : jour fait = barre pleine, fatigué = demi-hauteur orange, manqué = pointillé, avec légende ; barres de charge toujours doublées de texte.
- **Vérification** : `tsc` et build à chaque étape ; calcul rejoué sur des données fictives (4 sportifs, puis 1 sportif actif + 1 vide, puis enseignements forcés) en semaine, mois et depuis le début ; rendu contrôlé à l'écran via une page de prévisualisation locale qui simule les API (supprimée ensuite, jamais commitée). Pas de rejeu sur la vraie base (le script avec la clé service a été refusé). Au 26/10, les vrais groupes ont au plus 2 sportifs inscrits : la semaine montrera surtout « Qui décroche », le mois et « depuis le début » davantage.
