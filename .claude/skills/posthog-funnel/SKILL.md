---
name: posthog-funnel
description: Mode opératoire du tracking PostHog et des rapports funnel : noms d'événements à ne jamais renommer, propriétés (platform, onboarding_source), accès API/HogQL et GA4, exclusion des comptes de test, significativité, réconciliation des chiffres. Déclencheurs : PostHog, funnel, conversion, A/B test, flag, HogQL, insight, dashboard 706709, trial_started, rapport, GA4, posthog.capture.
---

# PostHog : tracking et rapports funnel

## 1. Installation

- App : `src/providers/PostHogProvider.tsx` (clé `NEXT_PUBLIC_POSTHOG_KEY`, hôte `https://eu.i.posthog.com`, `person_profiles: "always"`, **`capture_pageview: false`**, aucun init en `development` : le local n'envoie rien). `posthog.identify(user.id, { email })` à la connexion, `posthog.reset()` seulement si l'utilisateur était connecté.
- Importer le singleton `posthog` depuis `posthog-js`, pas le hook `usePostHog()` dans des dépendances d'effet.
- Super-propriété **`platform`** sur chaque événement depuis le 14/10/2026 : `ios_app` / `android_app` / `pwa` / `web` ; propriétés personne `last_platform`, `used_native_app`. `$os` ne distingue pas Safari iPhone de l'app iOS : toujours ventiler par `platform`. Événements antérieurs au 14/10 sans la propriété.
- Site WordPress www.theperfclub.com : snippet dans WPCode Lite → « En-tête et pied de page globaux », puis « Vider les caches » (Kinsta). Trou de données définitif : **aucun pageview www entre début septembre et le 23/10/2026**. Recoller un snippet : toujours partir du snippet officiel.

## 2. Événements clés (noms techniques : ne jamais les renommer)

Le code et PostHog gardent `athlete`, `wellness`, `checkin` même si l'UI dit « sportif », « point forme ».

| Étape | Événement(s) | Où |
|---|---|---|
| Entrée du parcours | `onboarding_flow_started` (une fois au montage, indépendant des variantes) | `OnboardingFlow.tsx` |
| Chaque écran | `onboarding_step_viewed` {step, step_index, role, mode} **et** `onboarding_${step}_viewed` | idem |
| Entrées spéciales | `program_onboarding_start`, `coach_invite_onboarding_start` | idem |
| Compte | `onboarding_account_viewed`, `account_created` | idem |
| Post-signup | `onboarding_ob_<step>_viewed` (ob_sport, ob_plan, ob_decide, ob_insight, ob_week, ob_notif, ob_pay…), `onboarding_checkin_saved/skipped`, `onboarding_decide_answered`, `onboarding_health_connected/skipped/failed`, `onboarding_app_push(_skipped)`, `onboarding_pay_free/purchased` | `OnboardingFlow.tsx` |
| Paywall | `paywall_priming_viewed`, `paywall_form_viewed`, `paywall_loss_sheet_viewed/stayed/left`, `exit_offer_viewed/accepted/declined` | `src/components/paywall/` |
| Essai | `trial_started` {plan, billing, method, promo} | `PaywallModal.tsx`, `NativeCheckout.tsx` |
| Activation | `onboarding_checklist_*`, `first_decision_shown`, `checkin_result_shown`, `session_result_shown` | app |
| Mobile | `notif_prompt_viewed/dismissed/enabled`, `app_banner_viewed/clicked/dismissed`, `pwa_install_cta_viewed/clicked/result`, `pwa_installed`, `garmin_connect_started/connected/disconnected` | app |

Règles :
- **Ne jamais fusionner** les deux appels de vue d'étape : les funnels lisent les événements spécifiques, le générique sert aux comptages par `step`. Un step ID ne se renomme pas (l'événement en dérive).
- Tous les événements d'onboarding (y compris post-signup) partent de `src/components/onboarding/OnboardingFlow.tsx` ; les step IDs vivants incluent `value_intro`, `decision_2a`/`decision_2b`, `account`, puis `ob_*` (`ob_sport`, `ob_count`, `ob_program`, `ob_health`, `ob_plan`, `ob_decide`, `ob_insight`, `ob_week`, `ob_notif`, `ob_invite`, `ob_pay`…).
- Propriétés d'événement à connaître : `step`, `step_index`, `role` (`selecting` avant choix), `mode` (`register`/`auth`), `plan`, `billing`, `source`, `promo`.
- Propriétés personne utiles : `onboarding_source` (`program`, `coach_invite`, absent = classique), `role`, `team_size`, `claimed_program_id`, `email`.
- Liste vivante : `grep -rhoE "posthog\.capture\(\s*[\"'\`][a-zA-Z0-9_\$\{\}]+" src | sort | uniq -c`.
- Morts (ne plus construire dessus) : `celebration_cta_clicked`, `paywall_opened`, `paywall_skipped`, `welcome_modal_viewed` (encore dans `WelcomeModal.tsx`, hors parcours), `onboarding_when_answered`, `onboarding_ob_when/mirror/checkin/control_viewed`.

## 3. Flags A/B

- **Aucun flag A/B lu par le code au 30/10/2026** (`grep -rn "useFeatureFlag\|getFeatureFlag" src` vide) : `short-onboarding-signup` (id 227509) et `skip-value-intro` (id 245715) sont fermés et leur plumbing retiré (commit `19f519b`, 03/09). Les propriétés `ab_variant` / `value_variant` ne sont plus posées ; seul `trial_started` accepte encore un `abVariant` optionnel.
- Pour un futur test : trier sur **le vrai flag**, pas sur `ab_variant`. La propriété custom a été fausse dans les deux sens (jusqu'à 9 personnes sur 15 mal rangées). `$feature/<flag>` au niveau événement manque sur les premiers événements d'une session (~53 % absents sur l'écran rôle) et tronque le dénominateur. Le moins mauvais : breakdown **par personne** sur le flag, en vérifiant la couverture. Poser une règle d'arrêt avant de regarder (durée ET volume).

## 4. Insights de référence (projet 187815, EU)

- Dashboard **706709**. Depuis le 30/10 : funnel sportif `6JLNeyfb`, funnel coach `M71wHM4I`, « Questions post-signup » `SUb8KXZy` / `HLxOiBpE`. Référence de l'ancien parcours (19 → 30/10) : 27 comptes, 0 essai.
- Antérieurs : `Idd8I8sh` / `nBeaNBuY` (sportif/coach, breakdown `onboarding_source`), User Path `S3Tznl9b`, `/p/* → register` 4607763.
- Lecture : les étapes « écran vu » sont strictes (« Passer » mène toujours à l'écran suivant), seules les étapes qui comptent une **action** sont facultatives (point forme fait/imaginé, offre de sortie). Les `exit_offer_*` partent aussi des paywalls de l'app.
- **Toujours lire la définition exacte de l'insight officiel** (étapes, filtres, `date_from`) avant de reconstruire un chiffre maison. Gildas maintient ces insights : leur `date_from` fait foi.

## 5. Accès aux données (jamais de clé dans un fichier, un rapport ou un message)

- **API PostHog privée** : `https://eu.posthog.com/api/projects/187815/...`, en-tête `Authorization: Bearer <clé personnelle>`. La clé personnelle est notée dans la mémoire `project_analytics.md` : la passer par variable d'environnement le temps de la commande, ne jamais la recopier.
  - HogQL : `POST /query/` avec `{"query":{"kind":"HogQLQuery","query":"SELECT …"}}`.
  - Insight : `GET /insights/?short_id=6JLNeyfb` ; modifier : `PATCH /insights/{id}/` avec `{"query": {...}}`.
- **GA4** (site WordPress, acquisition) : MCP `google-analytics`, propriété `properties/311985077` (tag `G-KVBMEZ962W`), compte de service dont la clé est `~/.config/theperfclub/ga4-analytics-reader.json` (jamais dans Téléchargements). Pas de `gcloud auth application-default login`.
- **Vérité paiement** : Supabase (`profiles.subscription_status`, via le skill `supabase-write`) et Stripe / RevenueCat, pas `trial_started` seul.
- **Installs** : App Store Connect → Analytics (24-48 h de retard), Play Console.

## 6. Procédure « produire un rapport funnel »

1. **Cadrer** : question, période, rôle, source (`onboarding_source`), plateforme. Repérer les dates de déploiement qui coupent la période (refonte = nouvelle architecture, ne pas mélanger).
2. **Partir de l'insight officiel** (§4) et lire sa query. Ne construire un funnel HogQL que si aucun insight ne répond, et en vérifiant l'ordre réel des étapes sur des traces (`groupArray(event)` trié par timestamp).
3. **Exclure les comptes de test** partout (stats, payants, « meilleur utilisateur ») : `contact@theperfclub.com` (coach GC700), `cauvingildas@gmail.com` et `cauvingildas+*`. En HogQL : `coalesce(person.properties.email, '') NOT ILIKE '%cauvin%' AND coalesce(person.properties.email, '') NOT ILIKE '%theperfclub.com%'` (le `coalesce` garde les anonymes d'avant inscription). Exclure aussi les comptes de revue `+review-*`. Pilote gratuit `romain.r@strasbourgalsacerugby.fr` : son pic du 08/10 = démo, pas d'usage spontané.
4. **Ventiler** par `platform` et par source ; filtrer `role` au niveau **événement**, jamais personne (la propriété personne se résout tard). Jamais de filtre global `role` sur un funnel d'onboarding (le 1er écran envoie `selecting`). Valeurs numériques des filtres en **chaîne** (`["1"]`).
5. **Chiffres de base** : `count(DISTINCT person_id)` direct pour chaque total de référence, jamais une somme de sous-groupes (double comptage si la propriété change). Calculer chaque chiffre une seule fois et le réutiliser partout.
6. **Significativité au lieu de « pas assez de volume »** : avec n essais et 0 succès, le vrai taux est sous ~3/n (règle de trois, 95 %) ; donner un intervalle (Wilson) pour un taux, un test exact de Fisher pour comparer deux bras. 0 sur 64 n'est pas du bruit, c'est un signal.
7. **Réconcilier** : deux méthodes pour un même KPI (funnel strict vs large, événement vs personne) = encadré explicite qui dit pourquoi elles diffèrent, avec un chiffre de passage, dès la première version.
8. **Revérifier les fondations** dès qu'un total ne colle pas entre deux vues, même si le chiffre a survécu à plusieurs corrections : une correction n'audite que ce qu'elle touche.
9. **Anomalie signalée** : ne pas se limiter à la config du funnel ; interroger les événements bruts des derniers `account_created` triés par timestamp. Un funnel peut afficher 0 juste après une conversion (fusion `identify` asynchrone) ou juste après un déploiement (pas encore de trafic).
10. **Rendu** : funnels **toujours visualisés** (barres, effectifs, pertes par étape), la mise en garde vient en plus, jamais à la place. Rapport synthétique : chiffres finaux + 2-3 constats par section, une seule note de méthode ; retirer les encadrés de correction une fois stabilisé. Dataviz : skill `dataviz` ; publication en artifact privé.

## 7. Règles de code

- **Avant de remplacer ou supprimer un composant**, `grep -n "posthog\|capture\|identify" <fichier>` et reporter les appels dans le nouveau (précédent : `welcome_modal_viewed` perdu, funnel bloqué pendant des semaines).
- Nouvel écran d'onboarding : l'événement part tout seul via l'effet générique ; ne l'ajouter à un funnel existant qu'en bumpant `date_from` au déploiement (sinon la cohorte antérieure tombe à 0 %).
- Ordre des effets React = ordre des événements : un événement d'ancrage (`program_onboarding_start`) doit être déclaré avant l'effet de vue d'étape.
- Ne jamais envoyer de valeurs de santé à PostHog (engagement Garmin / Apple).
- Les funnels PostHog ne sont pas temps réel (5-15 min) : « Refresh » avant de conclure à un trou.
- PostHog ignore les navigateurs détectés comme robots : un Playwright headless ne prouve pas que le tracking marche.

Détails et raisons : grep `historique.md` de ce dossier.
