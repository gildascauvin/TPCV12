---
name: emails-brevo
description: Emails de ThePerfClub : contacts et drip Brevo (workflow 4, attributs PLATEFORME/NOTIFS/STATUS/SPORT_PHRASE), emails transactionnels lifecycle (`src/lib/email/lifecycle.ts`, table `lifecycle_emails`), invitations coach via Resend (`inviteEmail.ts`). À charger avant de toucher `/api/brevo/contact`, `/api/brevo/sport`, `/api/push/send`, un template Brevo ou une campagne.
---

# Emails : Brevo et Resend (état au 30/10/2026)

## Qui envoie quoi
- **Brevo** : contacts, drip d'onboarding (automation workflow 4), campagnes, et emails transactionnels lifecycle.
- **Resend** : uniquement les invitations (`src/lib/email/inviteEmail.ts` : `sendCoachInviteEmail`, `sendSandboxInviteEmail`), appelé par `/api/invite/create`, `/api/invite/resend` (bouton « Renvoyer » de `CoachAthletesManager.tsx`), `/api/sandbox/invite`. Env `RESEND_API_KEY`, `RESEND_FROM_EMAIL` ; clé absente = invitation créée en base sans email (warning en log).
- Emails d'auth (lien magique, « crée ton mot de passe ») : templates Supabase gérés dans le dashboard, hors repo.

## Contacts Brevo
- `src/lib/email/brevoContact.ts` (serveur) : `addBrevoSignup()` crée le contact (`STATUS=FREE`, `PRENOM`, `ROLE`, `PLATEFORME` + `NOTIFS=NON`, attributs sport) et l'ajoute à la liste `BREVO_ONBOARDING_LIST_ID` (entrée du drip) ; `markBrevoClient(email)` passe en `CLIENT` et retire de la liste (stoppe le drip) ; `deleteBrevoContact(email)`.
- `src/app/api/brevo/contact/route.ts` : appelée par l'onboarding juste après la création du compte. Exige une session, prend l'email de la session (jamais du corps) et ne fait que `addBrevoSignup`.
- Appelée 2 fois par `OnboardingFlow.tsx` à l'inscription (avec `platform: signupPlatform()` de `src/lib/native.ts` : `IOS_APP` | `IPHONE` | `ANDROID` | `DESKTOP`, iPad = DESKTOP).
- `markBrevoClient()` est appelé directement par le webhook Stripe (abonnement `trialing`/`active`) et par `src/lib/revenuecat.ts` après un achat store (via `markBrevoClientByUser`) : c'est le début de l'essai qui sort du drip, pas le 1er prélèvement.
- `src/app/api/brevo/sport/route.ts` (fin des questions post-signup) : `SPORT_PHRASE` + `SPORT_PHOTO` via `brevoSportAttributes()` (`src/lib/email/brevoSport.ts`). Le sport est lu en base (`profiles.sport` ou programme claimé), jamais pris du client. Bandeaux dans le bucket `email-assets/emails/sport/{programId}.jpg` ; un programme officiel sans bandeau retombe sur le générique.
- `/api/push/subscribe` passe `NOTIFS=OUI` (coupe le rappel notifs du J+2) ; un échec Brevo n'empêche pas l'abonnement push.
- `profiles.frustration` (réponse à « Tu fais quoi ? » : `force/feeling/saute/pousse`, coach `coach_garde/oeil/aveugle/pousse`) remplace les anciennes valeurs d'ob_when : segments Brevo manuels à revoir s'ils s'en servent.

## Drip d'onboarding (workflow 4)
- Templates live : 75 (sportif J0, étape 13), 104 (coach J0, 10), 83 (sportif J+2, 17), 103 (coach J+2, 9). Encadré « Notifications » en `{% if contact.PLATEFORME == "IOS_APP" %}…{% elif %}…{% else %}…{% endif %}` (elif fonctionne), au J+2 dans `{% if contact.NOTIFS != "OUI" %}`. Sources orphelines 63/64/68/69 non tenues à jour.
- HTML des templates dans le bucket `email-assets/html-app/{id}.txt`.
- **Piège** : l'API renvoie toujours 404 pour modifier un template attaché à l'automation. Passer par `app.brevo.com/editor/classic/html/{tpl}?automation_id=4&step_id={étape}`. Ne jamais enregistrer un template live sans demande explicite de Gildas.

## Emails lifecycle (transactionnels)
- `src/lib/email/lifecycle.ts`, `runLifecycleEmails()` lancé par le cron `/api/push/send` à 9 h (heure de Paris) : Vercel Hobby limite à 2 crons, déjà pris, ne pas en créer un 3e.
- Kinds → templates : `recup_ready` 45 (5 jours de point forme), `charge_ready` 46 (7 jours depuis la 1re séance, 2 séances faites), `decision_next` 47 (lendemain de la 1re décision, gratuit sans coach), `no_checkin` 48 (3 jours sans point forme, au plus toutes les 3 semaines), `coach_first_checkin` 49 (1er point forme d'un vrai sportif du coach, param `SPORTIF`).
- `POST /v3/smtp/email` + `templateId` : templates créés par API, jamais attachés à une automation, donc modifiables par API.
- Idempotence : réservation dans `lifecycle_emails` (migration `033_lifecycle_emails.sql`, clé user/kind/ref) AVANT l'envoi ; échec → réservation retirée pour retenter. Contact blacklisté → pas d'envoi, réservation gardée.
- Ne cible que les comptes créés depuis `LIFECYCLE_START` (2026-10-07), sinon toute la base recevrait les emails le jour du déploiement.

## Règles et pièges
- Wording : ouvrir sur la douleur, « point forme » (jamais « check-in »), « 10 secondes », côté coach « ton groupe » / « tes sportifs », jamais « équipe ». Pas de tiret long en prose.
- Campagnes : exclure la liste 11 (payants), les comptes de test (`cauvingildas+…`, contact@theperfclub.com) et les désinscrits ; rester sous 300 emails/jour et hors jours de drip d'une cohorte.
- Tout `/api/` est public dans `src/lib/supabase/middleware.ts` : chaque route vérifie elle-même la session. `/api/brevo/contact` était ouverte (n'importe qui pouvait sortir un email du drip) jusqu'au 30/10 : ne jamais y remettre `status: "client"`.
- `/api/account/delete` supprime le contact Brevo (best effort, depuis le 30/10).

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
