# Objectifs (caps) par sport (22/11/2026, brouillon à valider)

Cap proposé = famille de sport (`WEAKNESSES_BY_SPORT`, `src/lib/sportCategories.ts`) × point faible → repère (un test de la batterie du sport, `TEST_BATTERIES` dans `src/lib/testBattery.ts`, ou une mesure de l'app) → cible type → horizon par défaut.

- Cible exprimée en **% du départ** tant qu'aucune mesure n'existe ; elle devient une valeur dès le 1er test ou les 1res séries saisies.
- Cibles = ordres de grandeur pour un pratiquant entraîné, **à valider** avant de coder.
- « Mesure app » = déjà calculé : charge max estimée (séries + charges + ressenti), courbe de forme, régularité, récupération / norme, allure à ressenti égal.
- **Jusqu'à 3 objectifs, sans principal** (façon Opal / Ahead). Le générateur les intègre tous (qualités = points faibles des objectifs) ; deux objectifs qui se gênent (marathon + squat max) : on informe, on ne bloque pas ; ceux qui se renforcent (front squat → épaulé-jeté) : on le dit. L'échéance n'est pas un objectif à part : c'est l'horizon (affûtage avant la date).
- À l'écran on dit **« objectif »** (cap = nom interne du projet).
- **Une seule échéance pour tous les objectifs** (Gildas, 22/11) : préremplie selon le 1er objectif (6 sem. test rapide, 8 force, 12 endurance ou date d'échéance), modifiable une fois pour tous ; toutes les cibles se recalculent sur cette durée. La colonne Horizon ci-dessous sert seulement à choisir l'échéance par défaut.
- Pas de point faible « Autre » (Gildas) ; « Changer d'exercice repère » dans Modifier reste possible ; maillon faible par rapports entre mouvements = plus tard.

| Famille | Point faible | Objectif proposé | Repère | Cible type | Horizon |
|---|---|---|---|---|---|
| Musculation / Hypertrophie | Jambes | Squat plus lourd | Charge max estimée squat (test : 1RM Back Squat) | +3 à 5 % | 8 sem. |
| | Dos | Soulevé de terre plus lourd | Charge max estimée soulevé de terre (1RM Soulevé de terre) | +3 à 5 % | 8 sem. |
| | Pectoraux | Développé couché plus lourd | Charge max estimée couché (1RM Développé couché) | +2,5 à 4 % | 8 sem. |
| | Épaules | Développé militaire plus lourd | Charge max estimée militaire | +2,5 à 4 % | 8 sem. |
| | Bras | Tractions lestées | Charge max estimée tractions | +5 kg lestés | 8 sem. |
| Powerlifting | Jambes | Squat plus lourd | 1RM Back Squat | +2,5 à 4 % | 8 sem. |
| | Dos & bras | Soulevé de terre plus lourd | 1RM Soulevé de terre | +2,5 à 4 % | 8 sem. |
| | Pectoraux & épaules | Développé couché plus lourd | 1RM Développé couché | +2 à 3 % | 8 sem. |
| | Technique de mouvement | Même charge, plus facile | Ressenti à charge égale (mesure app) | 1 cran de ressenti en moins | 6 sem. |
| | Récupération | Mieux récupérer entre les séances lourdes | Récupération / ta norme | dans le couloir 4 semaines sur 4 | 4 sem. |
| Haltérophilie | Technique arraché | Arraché plus lourd | 1RM Snatch (ou Power Snatch) | +2 à 4 % | 8 sem. |
| | Technique épaulé-jeté | Épaulé-jeté plus lourd | 1RM Clean & Jerk | +2 à 4 % | 8 sem. |
| | Mobilité hanches/chevilles | Squat clavicule plus profond | Test de mobilité overhead squat / dorsiflexion (Knee-to-Wall) | +2 à 3 cm | 6 sem. |
| | Explosivité | Sauter plus haut | Saut vertical (CMJ) | +2 à 3 cm | 6 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| Athlétisme & vitesse | Vitesse pure | Partir plus vite | 10 m départ arrêté | −0,03 à −0,05 s | 6 sem. |
| | Endurance de vitesse | Tenir ta vitesse | 60 m ou 100 m départ arrêté | −1 à 2 % | 8 sem. |
| | Explosivité | Sauter plus haut et plus loin | CMJ ou Broad Jump | +2 à 3 cm / +5 à 10 cm | 6 sem. |
| | Technique de course | Vitesse lancée | 20 m ou 30 m lancé | −1 à 2 % | 8 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| Endurance (course, trail, vélo, natation) | Vitesse | Aller plus vite au seuil | Course : allure seuil (Test de seuil) · Vélo : FTP · Natation : 400 m | −2 à 4 % d'allure / +3 à 6 % FTP | 12 sem. |
| | Endurance de fond | Tenir plus longtemps | Durée des sorties longues (mesure app) ou test 10 km / semi | +20 à 30 % de durée | 12 sem. |
| | Explosivité | Une foulée plus réactive | Drop Jump (RSI) · Vélo : puissance max sprint 6-10 s | +5 à 10 % | 6 sem. |
| | Technique de course | Courir plus économe | Allure à ressenti égal (mesure app) | −2 à 3 % d'allure | 8 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| Sports collectifs (foot, basket, rugby, hand, volley) | Puissance | Sauter plus haut | CMJ · volley : Block Jump / Spike Jump · basket : Sargent | +2 à 3 cm | 6 sem. |
| | Vitesse | Partir plus vite | Sprint 10 m (secours : 10 m départ arrêté) | −0,03 à −0,05 s | 6 sem. |
| | Explosivité | Être plus réactif | Drop Jump (RSI), test conseillé foot / rugby / hand | +5 à 10 % | 6 sem. |
| | Gainage / contact | Gagner en force | 1RM Back Squat · rugby : pompes / tirage isométrique | +3 à 5 % | 8 sem. |
| | Récupération | Récupérer entre les matchs | Récupération du lendemain de match / ta norme | dans le couloir | 4 sem. |
| | *(endurance du match, si objectif « Tenir tout le match »)* | Tenir tout le match | Yo-Yo IR1 · rugby : Bronco | +10 à 20 % de distance / −10 à 20 s | 8 sem. |
| Fitness / CrossFit / Hyrox | Endurance cardio | Tenir plus longtemps | 2000 m rameur ou 5 km | −2 à 4 % | 8 sem. |
| | Force générale | Squat plus lourd | 1RM Back Squat | +3 à 5 % | 8 sem. |
| | Technique des mouvements | Un benchmark plus rapide | WOD Fran / Grace / Helen | −5 à 10 % de temps | 8 sem. |
| | Explosivité | Sauter plus haut | CMJ (secours : Squat Jump) | +2 à 3 cm | 6 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| Arts martiaux & combat | Puissance de frappe | Frapper plus fort | Test de vitesse de frappe (secours : Squat Jump) | +5 % | 6 sem. |
| | Endurance cardio | Tenir tout le combat | Test d'assauts enchaînés (rounds) (secours : Yo-Yo IR1) | +1 round au même ressenti | 8 sem. |
| | Explosivité | Être plus explosif | CMJ | +2 à 3 cm | 6 sem. |
| | Gainage | Un gainage solide | Test de gainage (planche) | +30 à 60 s | 6 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| Escalade | *(pas de liste de points faibles : « Autre »)* | Doigts plus forts | Suspension à la poutre (dead hang) | +10 à 15 % (charge ou temps) | 8 sem. |
| Autre | Force générale | Gagner en force | Charge max estimée de l'exercice principal | +3 à 5 % | 8 sem. |
| | Endurance cardio | Tenir plus longtemps | Durée des séances d'endurance (mesure app) | +20 % | 8 sem. |
| | Technique | Même effort, plus facile | Ressenti à charge égale (mesure app) | 1 cran de ressenti en moins | 6 sem. |
| | Récupération | Mieux récupérer | Récupération / ta norme | dans le couloir | 4 sem. |
| **Tous** | *(objectif « Préparer une échéance »)* | Arriver au top le jour J | Courbe de forme (mesure app) | pic de forme le jour J | jusqu'à la date |
| **Tous** | *(toujours proposé en 3e carte)* | Tenir N séances par semaine | Régularité (séances faites / prévues) | N séances, 6 semaines sur 6 | 6 sem. |

## Règles de proposition
1. Point faible renseigné → la ligne correspondante. « Je ne sais pas » → le test conseillé du sport (`pickAdvisedTest`) ou, à défaut, le 1er point faible de la famille.
2. Objectif « Préparer une échéance » → « Arriver au top le jour J » en 1re carte, la ligne du point faible en 2e (même horizon).
3. Objectif « volume » (Encaisser plus de travail, Tenir tout le match / combat, Tenir plus longtemps) → la ligne d'endurance de la famille passe devant si elle existe.
4. Horizon par défaut : 6 sem. test de qualité rapide (saut, sprint, réactivité), 8 sem. force et benchmarks, 12 sem. endurance aérobie ; modifiable (6 / 8 / 12 / date).
5. Repère sans test fait : « départ à ton 1er test » + test planifié en semaine 1 par le générateur (programme ThePerfClub) ou suggéré (programme importé).
