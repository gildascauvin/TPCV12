# Historique « emails-brevo » (extrait verbatim de l'ancien CLAUDE.md, du plus ancien au plus récent)

Les sections récentes priment sur les anciennes. Toujours vérifier dans le code avant de s'appuyer sur un détail.

## Intégration Brevo (emailing)
- Route : `src/app/api/brevo/contact/route.ts`
- Env vars Vercel : `BREVO_API_KEY`, `BREVO_ONBOARDING_LIST_ID`
- Déclenchement : après paiement Stripe réussi (`stripe/webhook`) → `markBrevoClient(userId)` retire l'user de la liste onboarding Brevo (stoppe la séquence email)
- Route publique (pas d'auth requise) — déclarée dans `middleware.ts` sous `/api/brevo/`

## App iPhone dans Brevo : drip J0/J+2 par appareil + campagne d'annonce (2026-10-18)
- **Attributs Brevo** (texte, créés via API) : `PLATEFORME` = `IOS_APP` | `IPHONE` | `ANDROID` | `DESKTOP`, posé à l'inscription par `signupPlatform()` (`src/lib/native.ts`, iPad = DESKTOP) envoyé dans les 2 appels `/api/brevo/contact` d'`OnboardingFlow` ; `NOTIFS` = `NON` à l'inscription, `OUI` dans `/api/push/subscribe` (web push ou APNs, échec Brevo non bloquant). Commit `cd86d1d`.
- **Drip (workflow 4)** : templates live 75 (sportif J0, étape 13), 104 (coach J0, 10), 83 (sportif J+2, 17), 103 (coach J+2, 9). Encadré « Notifications » juste au-dessus du CTA : `{% if contact.PLATEFORME == "IOS_APP" %}…{% elif … "IPHONE" %}…{% elif … "ANDROID" %}…{% else %}…{% endif %}` (elif testé OK en envoi réel). App iPhone = promesse + activer dans le profil ; iPhone navigateur = installer l'app + badge App Store ; Android = notifs dans Chrome, app bientôt ; else (ordinateur, contacts d'avant le 18/10) = les deux + badge. Au J+2 tout le bloc est dans `{% if contact.NOTIFS != "OUI" %}`. Côté coach : alerte check-in fragile + résumé du matin de « ton groupe ». Sources orphelines 63/64/68/69 NON mises à jour. HTML dans le bucket `email-assets/html-app/{id}.txt`, badge `emails/app-appstore-badge.png` (redessiné, le site Apple était injoignable).
- **Mise à jour d'un template live** : l'API répond toujours 404 ; passer par `app.brevo.com/editor/classic/html/{tpl}?automation_id=4&step_id={étape}` (textarea + ⋮ → Enregistrer). L'enregistrement en JS par Claude est bloqué par le garde-fou sauf demande explicite de Gildas.
- **Campagne d'annonce app iPhone** (sportif / coach, ouverture douleur, 4 nouveautés, bande de 3 visuels App Store, CTA = badge App Store, paragraphe Android « réponds Android ») : #106 vague 1 sportifs (liste 16, 187) et #107 vague 1 coachs (liste 17, 56) le 21/10 10h, #108 Legacy (liste 18, 230) le 22/10 10h, #109 Legacy (liste 19, 229) le 23/10 10h. Exclusion liste 11 (payants), comptes de test et désinscrits retirés. Legacy sans rôle = version sportif. Jours choisis hors drip (cohorte du 06/10 : 20, 24, 27/10) et sous 300 emails/jour. Visuels `emails/app-ios-sportif.jpg` (Aujourd'hui / comportements / programmes) et `app-ios-coach.jpg` (radar / tests / programmes).
- **Wording coach** : « ton groupe » / « tes sportifs », jamais « équipe » (tous les coachs n'ont pas une équipe). Le visuel App Store 02_coach dit encore « Toute ton équipe » : version « Tout ton groupe » régénérée, à mettre dans App Store Connect à la prochaine version.
- **À mesurer** : vague 1 vs annonce freemium (84 ouvertures uniques, 2 clics sur 230 reçus) ; réponses « Android » ; retour J1 (notifs iOS 14/10, nouveau J0 18/10 et campagne 21/10 se chevauchent).
