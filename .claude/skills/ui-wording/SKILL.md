---
name: ui-wording
description: Règles de texte et de design visuel de ThePerfClub, à relire avant d'écrire ou de livrer tout texte visible (UI, emails Brevo, push, landings, posts, réels, fiches store) ou tout composant visuel. Mots-clés : wording, copy, libellé, titre, CTA, sportif, point forme, récupération, groupe, tiret, /10, couleur, daltonien, POC v59, modale, jauge.
---

# Texte et design visuel

## Vocabulaire imposé (texte affiché uniquement)
| Dire | Jamais | Code / DB / PostHog (ne pas renommer) |
|---|---|---|
| sportif | athlète | `athlete`, `coach_athletes`, `subscription_status = "athlete"` |
| récupération | wellness | `wellness_daily`, `WellnessModal`, `WellnessRing`… |
| point forme (pluriel « points forme ») | check-in, questionnaire wellness | `checkin`, `ob_checkin`, `?checkin=1`, events `checkin_*`, kinds `no_checkin` |
| ton groupe, tes sportifs | ton équipe | onglet « Groupe » |

- Bouton : « Faire mon point forme ». Pluriel en code : `` `${n} point${n > 1 ? "s" : ""} forme` `` (jamais `pl(n, "point forme")`).
- Le point forme prend **10 secondes**, jamais 30.
- Éviter « point forme… ta forme du jour » dans la même phrase.
- Exception SEO : « questionnaire wellness » peut rester en synonyme sur les pages coach (ex. `/coach-suivi-charge-wellness-sportifs`).

## Style
- **Pas de tiret long « — » en prose** (fait « trop IA ») : point, deux-points ou reformulation. Vérifier par grep avant commit sur un fichier de copy.
- **Des mots, pas de notes /10** : jamais « 5/10 » ni « noté 4 ». Difficulté : `qualitativeDifficulty()` (`src/lib/autoregulation.ts`). Les comptes (« 11 fois sur 11 ») et le score de forme sur 100 restent permis.
- **Pas de calques de l'anglais** (« cinq touches » pour five taps). Test : un coach français le dirait-il à l'oral ?
- **Ton contrarian** : jamais « fini WhatsApp, les tableurs, les relances ».
- Pitch (email, vidéo, pub) : ouvrir sur la douleur avant la solution.
- Avant le paywall, on peut survendre avec des chiffres illustratifs s'ils sont marqués « aperçu », jamais présentés comme des données réelles.
- Côté coach, toujours relire avec un grep « équipe ».

## Design
- Référence : `/Users/Gildas/Desktop/theperfclub_poc_v59_coach_exercises_share_delete.html`. Avant un nouveau composant, grep ses classes CSS (la dernière surcharge v59 gagne). Pour un comportement **déjà en prod**, c'est la prod qui fait foi, pas le POC : reproduire le câblage de la page de prod.
- Réutiliser les vrais composants de l'app (`WellnessModal`, `InviteModal`, `ProgramAssignModal`…), jamais une copie maison dans l'onboarding.
- **Daltonisme** (Gildas l'est) : garder les couleurs, mais toujours les doubler d'une forme, d'un signe (✓ ✕ ↑ ↓), d'un remplissage ou d'un texte. Jamais vert/orange ni vert/rouge comme seule différence. Vaut aussi pour les dataviz et les POC.
- Contenu verrouillé : flouter le vrai contenu (`filter: blur`, `pointerEvents: none`) avec un overlay titre + CTA. Pas de cadenas sur les onglets, pas de panneau vide.
- Jamais de `::after` / `::before` dans un `<button>` (cassé sur Safari iOS) : utiliser un `<span>` réel.
- Étape de choix unique (onboarding) : rien de présélectionné, pas de bouton « Continuer », le clic fait avancer.
- Constantes : accent `#d44000` / fort `#f04a08`, gradient bouton `linear-gradient(180deg,#f04a08,#d44000)`, modale `#fff` radius 30 padding 28, ombre `0 42px 120px rgba(0,0,0,.34)`, z-index modales `2147483100` (bottom nav `2147483000`).
- Footer de modale scrollable : carte `display:flex; flexDirection:column; overflow:hidden`, contenu `overflowY:auto`, footer `flexShrink:0` (pas de `position:sticky`), padding `20px 28px 20px`.
- Une seule jauge par carte de séance (RPE si faite, difficulté prévue sinon), sans label.
- Comportements : toujours traduire les clés DB (`alcohol`, `screen_late`…) avant affichage.

## Checklist avant de livrer un texte
1. `grep -n " — "` sur les fichiers touchés.
2. grep « athlète », « check-in », « wellness », « équipe », « /10 » dans le texte affiché.
3. L'information colorée a-t-elle aussi une forme ou un mot ?
4. Si un flow a été restructuré, comparer à l'ancien flow : rien n'a disparu sans qu'on l'ait voulu ?
