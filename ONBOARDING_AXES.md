# ThePerfClub — Onboarding : 6 axes d'amélioration

Objectif : créer le "aha moment" et convertir les visiteurs en free trials avec CB.

---

## Axe 1 — Écran "reveal" post-inscription ✅

**Problème résolu :** L'user créait son compte et atterrissait directement sur le dashboard sans savoir ce qui venait d'être généré pour lui. Pas d'émotion, pas de surprise.

**Ce qui a été fait :** Un écran de transition (`reveal`) a été ajouté après la création de compte. Il montre explicitement ce qui a été créé :
- Athlète : `X séances de [sport] générées` + `1 séance de récupération` + `Score wellness initialisé`
- Coach : `Tableau de bord configuré` + `Modèles de séances prêts`

**Fichier :** `src/components/onboarding/OnboardingFlow.tsx` — step `reveal`

---

## Axe 2 — Trial présenté comme opportunité (pas comme mur) ✅

**Problème résolu :** Le trial 7 jours + CB n'était présenté qu'en bloquant une action (ajouter une séance). Pattern bait-and-switch — l'user se sentait forcé, pas invité.

**Ce qui a été fait :** L'offre trial est maintenant intégrée dans l'écran `reveal`, au moment de pic d'émotion positive. L'user voit son programme, puis l'offre : "Accède à tout — 7 jours gratuits". Un bouton "Découvrir mon espace →" laisse l'option de ne pas s'engager immédiatement.

**Fichier :** `src/components/onboarding/OnboardingFlow.tsx` — section trial dans `reveal`

---

## Axe 3 — Suppression de l'étape `readiness` ✅

**Problème résolu :** L'étape "Comment tu te sens ?" (Bonne énergie / Correct / Fatigué) était posée une seule fois à l'inscription. C'est une donnée quotidienne — la poser à l'onboarding n'a aucun sens fonctionnel.

**Ce qui a été fait :**
- Étape `readiness_a` supprimée de tous les flows (register + auth)
- Wellness baseline initialisée avec des valeurs neutres : `sleep=7, stress=5, recovery=6, motivation=7`
- Flow athlète passe de 7 à 6 étapes

**À faire côté app :** Intégrer la question wellness quotidienne dans `/today` au premier chargement du jour (si `wellness_daily` non remplie pour le jour J).

**Fichier :** `src/components/onboarding/OnboardingFlow.tsx` — `buildWellnessBaseline`, paths

---

## Axe 4 — Refonte du coach onboarding ✅

**Problème résolu :** Deux étapes inutiles existaient dans le flow coach :
- `level_c` : "Niveau de tes athlètes" — n'avait aucun impact concret sur l'expérience
- `count_c` : "Combien d'athlètes simuler ?" — générait de la fausse data, créait de fausses attentes

**Ce qui a été fait :**
- `level_c` et `count_c` supprimés → flow coach passe de 7 à 4 étapes (welcome → role → sport → account → reveal)
- Plus de faux athlètes générés à l'inscription
- Écran `reveal` pour le coach inclut un formulaire d'invitation du premier athlète (email → `POST /api/invite/create`)

**À faire côté dashboard coach :** Créer un état vide bien designé sur `/coach` quand aucun athlète réel n'est encore connecté.

**Fichier :** `src/components/onboarding/OnboardingFlow.tsx`, `src/app/api/invite/create/route.ts`

---

## Axe 5 — Signaux de confiance ✅

**Problème résolu :** La CB était demandée sans aucune réassurance visible. "Résiliable à tout moment" était noyé dans une ligne de texte secondaire. Pas de badge de sécurité.

**Ce qui a été fait dans `PaywallModal` :**
- Badge "🔒 Paiement sécurisé · Résiliable à tout moment" ajouté sous le bouton CTA
- Icône cadenas SVG intégrée

**Ce qui a été fait dans l'étape `account` :**
- Texte revu : "Plus qu'un compte" (au lieu de l'annonce prématurée "Ton planning est prêt")
- Description honnête : "Entre ton email pour sauvegarder ton programme"

**À ajouter :** Ligne de social proof dans l'étape `account` : "Rejoins X athlètes qui optimisent leur récupération" (mettre à jour le chiffre manuellement au fil du temps).

**Fichiers :** `src/components/paywall/PaywallModal.tsx`, `src/components/onboarding/OnboardingFlow.tsx` — step `account`

---

## Axe 6 — Écran de confirmation email ✅

**Problème résolu :** Quand Supabase requiert une confirmation email, l'user créait son compte et… rien. Le flow semblait se terminer sans explication.

**Ce qui a été fait :** Après `supabase.auth.signUp()`, on détecte si `data.session` est null (= email confirmation requise). Dans ce cas, l'écran `reveal` affiche à la place :
- "Vérifie tes emails 📬"
- "On a envoyé un lien à [email]. Clique dessus pour activer ton compte."
- Bouton "Ouvrir Gmail →"
- Le bouton principal devient "J'ai activé mon compte →" (qui redirige vers l'app)

Si email confirmation est désactivée dans Supabase (session immédiate), l'écran trial s'affiche normalement.

**Fichier :** `src/components/onboarding/OnboardingFlow.tsx` — état `emailSent`, step `reveal`

---

## Récapitulatif des flows post-implémentation

### Athlète (inscription)
```
Prénom → Rôle → Sport → Niveau → Fréquence → Email/MDP → Reveal (aha + trial)
6 étapes de formulaire + 1 écran de révélation
```

### Coach (inscription)
```
Prénom → Rôle → Sport → Email/MDP → Reveal (aha + invite athlète + trial)
4 étapes de formulaire + 1 écran de révélation
```

### Fichiers modifiés
| Fichier | Changements |
|---------|-------------|
| `src/components/onboarding/OnboardingFlow.tsx` | Axes 1, 2, 3, 4, 6 |
| `src/components/paywall/PaywallModal.tsx` | Axe 5 |
