---
name: autoregulation-analyses
description: Moteur d'autorégulation et analyses de ThePerfClub. À charger pour toute modif de la reco Alléger/Surcharger (autoregulation.ts, computeAutoregSuggestion, autoregBand), de la carte et de l'anneau de décision (decisionCard.ts, computeDecisionCard, DecisionRing, AutoregButtons, AlertBox, PhaseLine), du moteur de charge (trainingLoad.ts, fatigueSignature.ts : Foster, ACWR, monotonie, contrainte, Fitness/Fatigue/Forme), de la récup relative (wellnessBaseline.ts, z-score), du point forme (WellnessModal, ScaleBars, checkinInsight.ts), des écrans de résultat (PhysioRevealHost, sessionInsight.ts, ZoneGauge), de la boucle de vérification (adviceJudge.ts, autoreg_proposal, recalage), des bilans (bilan.ts, BilanCarousel), des onglets Charge/Récupération (IndexCards, metricCards.ts) et du ressenti vs montre / TRIMP (physioCompare.ts, watchEstimates.ts, watchCompare.ts).
---

# Autorégulation, décision et analyses (état au 30/10/2026)

Principe produit : le plan (périodisation) fixe le niveau, la forme du jour le décale de ±1 ou ±2 points de RPE. Jamais de modification automatique d'une séance : la reco est proposée, le sportif ou le coach décide. Saisie subjective toujours « à l'aveugle », comparaisons montrées APRÈS validation.

## Où vivent les choses
- **/today** (`TodayClient.tsx`) : onglets `HomeTabs` « Aujourd'hui / Charge / Récupération ». Les analyses ont quitté `/conseils`, qui ne porte plus que les tests physiques (`TestsPanel`).
- **Coach Control** (`CoachAthleteCard.tsx`, `CoachClient.tsx`) : même carte de décision, à la 3e personne (`perspective: "coach"`). Radar de groupe et revue swipe : skill `coach`.
- **Planning** (`/week`, `/coach/planning`) : barre `DecisionGauge` dans la carte séance (pas l'anneau).
- Données des onglets : `getConseilsData` / `src/lib/conseilsData.ts` (`ConseilsData`, `CONSEILS_HISTORY_DAYS = 104`), relu en silence via `/api/conseils` par `refreshAnalyticsSoon()` après chaque point forme, note de séance, suppression, event temps réel.

## Moteur de charge (`src/lib/trainingLoad.ts`, fonctions pures)
- Charge de séance Foster = RPE × durée (UA) : `sessionLoad` / `dailyLoad`, source unique.
- `monotony` = moyenne / écart-type sur 7 j ; `strain` = charge hebdo × monotonie (Foster 1998).
- `acwr` / `acwrSeries` : moyenne 7 j / moyenne 28 j, moyennes glissantes simples (Gabbett), fenêtre chronique élargie dès 14 j. Jamais présenté comme un risque de blessure, seulement comme tendance.
- Fitness / Fatigue = EWMA 42 j / 7 j, `lambda = 1/n` (comme TrainingPeaks, depuis le 24/10), poids renormalisés sur les jours disponibles. Forme % = (Fitness − Fatigue) / Fitness × 100 (`formPercentSeries`), stable pour un sportif mais non comparable entre sportifs. `fitnessFatigueTrend` : seuil ±5 %.
- `partialChargeReady` : onglet Charge actif dès 7 j (1re séance il y a ≥ 7 j, ≥ 2 jours chargés) ; ACWR et jauge agrégée attendent 14 j.
- Deux conventions distinctes, ne pas les mélanger : ACWR 7/28 (Gabbett), Fitness/Fatigue 7/42 (Banister).

## Seuils d'affichage (`src/lib/fatigueSignature.ts`)
- `sigDimInfo` : ACWR < 0,8 sous-charge (jaune `#eab308`) / 0,8-1,3 optimal / > 1,3 risque modéré / > 1,5 risque élevé. Monotonie < 2 / ≤ 2,5 / au-delà. Contrainte < 6000 / < 10000 UA. Forme ≥ +8 % Frais / > −8 % Équilibré / sinon Fatigué (bandes « produit », pas littérature).
- Récup : avec norme, Frais / Équilibré / Fatigué selon `Z_SWC` ; sans norme, 70 / 50 (BONNE / STABLE / FRAGILE). Couleur = `wellnessColor()` (rampe bleue `WELLNESS_RAMP`, `wellness.ts`).
- `severityOf(color)` = « ça pousse vers la fatigue ? » (sous-charge = good, utilisé par la pénalité chronique). `displaySeverityOf` = « hors zone saine ? » (sous-charge = watch, utilisé par les insights et cartes d'indice). Ne pas fusionner.
- Détection bon/mauvais de la récup sur `.label`, jamais sur `.color` (la couleur est un dégradé).
- `chargeCrossInsight(load, monotony, strain)` ne parle plus de Fitness/Fatigue : ils sont racontés par `recoveryCrossInsight(..., fitnessTrend, fatigueTrend)`, qui ne les cite que si la Forme est plate.
- `crossTrendInsight()` : axe état = ressenti seul, une phrase par code (`crossPhaseText`), `crossPhaseChargeText` = charge seule. Ne sert plus qu'à la ligne Phase.
- Vocabulaire : « charge récente » (7 j) et « charge chronique ». Jamais « charge de fond », « charge habituelle », ni nom de fenêtre.

## Récupération relative (`src/lib/wellnessBaseline.ts`)
- `computeWellnessBaselineAt` : z composite et par dimension, fenêtre `WELLNESS_BASELINE_WINDOW_DAYS = 21`, norme pleine à `WELLNESS_BASELINE_MIN_DAYS = 12`, provisoire dès 5 jours (`shrinkStat`, a priori 70 ± 8, poids perso n/12, champ `provisional`).
- `relativeScore = clamp(5, 95, Φ(z) × 100)` (`normalCDF`). Seuils Hopkins : `Z_SWC = 0.2`, `Z_MODERATE = 0.6`, `Z_SEVERE = -1.645`. Garde-fou absolu `WELLNESS_ABSOLUTE_GUARD_SCORE = 40`.
- `wellnessSignal(row) = base_score ?? score` : le z ne lit jamais `score` (qui inclut les comportements), sinon les corrélations comportements deviennent circulaires.
- `computeWellnessScore` (`wellness.ts`) : base = moyenne de sommeil (effectif, avec nuit mesurée), 10 − stress, état physique, motivation, + FC repos / VFC si montre ; `score = base − 3/comportement négatif (max 15) + 2/positif (max 10)`. Les comportements de la ligne J sont ceux de la veille : corrélation sur la même ligne, jamais J+1.
- Stress = seule dimension inversée (`dimensionRaw` : 10 − stress). Charts : libellés « MOINS / PLUS DE STRESS », tooltip ré-inversé (valeur saisie).
- `DIMENSION_LABELS.recovery = "État physique"` (mot du formulaire).
- Toute surface démo (sandbox, sportifs démo d'un coach, aperçus onboarding/paywall) passe par `syntheticBaselineFor()` (`sandboxFixtures.ts`), même calcul que les vrais sportifs.

## La reco : `computeAutoregSuggestion` (`src/lib/autoregulation.ts`)
Modèle diagonal en vigueur depuis le 05/10 (remplace les grilles z/Hopkins et le tableau par difficulté du 27-29/09) :
- Axe X 0..100 = `effectiveRecoveryX` : `relativeScore` dès que la norme existe, sinon `recoveryAxisX` ramène la bande absolue 60-80 sur 42-58 ; plus la pénalité chronique, jamais appliquée à un sportif > 58.
- Bande « Maintenir » `autoregBand(x)` : s(x) = 1/(1+e^(−(x−50)/9)), haut = 4,5 + 6·s(x), bas = haut − 6.
- RPE prévu > haut → Alléger ⌈RPE − haut⌉ ; < bas → Surcharger ⌈bas − RPE⌉ ; magnitude 1-2, +1 (max 3) si critique (garde-fou < 40 ou z ≤ `Z_SEVERE`, côté Alléger seulement, icône 🚨).
- Retour `null` si le RPE prévu arrondi tombe déjà dans la zone (un seul point de vérité pour titre, jauge, simulateurs).
- `kind: "norm_hard"` = allègement d'un sportif non fatigué (x ≥ 42, sans pénalité) : le texte doit dire que c'est la séance qui est dure.
- Paramètres `shift` (borne Alléger, `profiles.autoreg_shift`) et `shiftHigh` (borne Pousser, `profiles.autoreg_shift_high`) : deux curseurs séparés.
- Pénalité chronique (`chronicPenaltyFor`, `decisionCard.ts`) : pire de ACWR / monotonie / contrainte / Forme via `severityOf` → −20 alerte, −10 watch. La tendance Fitness n'en fait plus partie. Le signal appris ajoute `PERSONAL_PENALTY = -10`.
- Zone : `zoneRange(target, dir)` = toujours 2 entiers, cible = extrémité conservatrice, l'autre s'étend à l'opposé du plan ; glisse aux bords (« 9-10 », « 1-2 ») pour l'affichage seulement.
- Points ↔ % des charges : table fixe `pointsToPct` (±1 → 2,5 %, ±2 → 5 %, ±3 → 10 %, ±4+ → 20 %). Nouvelle difficulté = `applyAutoregDifficulty` (prévu + points), jamais `adjustDifficulty` (réservé à Reconduire/Dupliquer). Aucun % affiché dans l'UI : `formatAutoregPoints`.
- Couleurs de sévérité : `suggestionSeverityColor` (🚨 `#dc2626`, ⚠️ `#f28a00`, 🚀 `#2f9e44`), source unique.
- Mots de difficulté Foster CR-10 : `qualitativeDifficulty` 1-2 légère, 3-4 modérée, 5-7 dure, 8-10 très dure. Les seuils de logique 5 et 8 ne bougent pas.
- Aperçus d'onboarding / paywall / simulateurs `/p/[id]` : moteur générique, volontairement (aucun historique).

## Carte et anneau de décision
- `computeDecisionCard` (`decisionCard.ts`) : partagé /today, Coach Control, Planning. Params clés : `day` (`DecisionDay` : avant point forme, reco, séance faite, repos), `behaviors`, `physio` (`physioDecisionInputs`), `personal` (calculé en direct sur /today, relu via `proposalPersonal(autoreg_proposal)` partout ailleurs pour que coach et sportif voient la même décision).
- Règle « une info = un seul bloc » : ligne 2 = niveau de récup du jour + action + demain ; Phase (`PhaseLine.tsx`) = tendance de charge, jamais la récup ni demain.
- Repos (`restText`) : ligne 2 commente la récup + « Demain : séance X… » ; titre Bonne récup / Récup stable / Récup fragile / Récup à confirmer.
- Séance faite : titre Dans / Sous / Au-dessus de la zone (zone proposée, sinon `zoneRange(prévu, "low")`, aussi en `doneZone`) ; ligne 2 = `feltVsPlanned()` + `doneAdvice()` (via `morningSignal()`, jamais « zone » ni « demain ») + `afterText` ; Phase = `cross.chargeText`.
- Reco : ligne 2 = `phaseAdviceLine()`. `withTitle()` remplace la 1re ligne à l'affichage, `decision.text` reste intact.
- Anneau (`components/sessions/DecisionRing.tsx`), état du 28/10 :
  - en grand avec `fluid` : 210-300 px et ≤ 34 % de la hauteur d'écran (la `HomeSheet` mobile recouvre le bas), trait à 5,5 % du diamètre ;
  - titre AU CENTRE : `centerTitle` (repos, séance faite), sinon le hint vivant Dans / Sous / Au-dessus de la zone, ou « Allègement appliqué / Surcharge appliquée / Difficulté maintenue » une fois décidé ; 2 lignes max, police réduite jusqu'à 14 px ;
  - `glow` = halo de la couleur de sévérité ; `titleLocked` en gratuit (« 7 · Modérée » lisible, titre flouté) ;
  - plus de carte décision : `AlertBox variant="bare"` (`components/calendar/AlertBox.tsx`) affiche conseil + CTA + Phase sous l'anneau, sans la 1re ligne (déjà au centre) ;
  - variantes `RestDecisionRing`, `DoneDecisionRing`, `DecisionRingMini` + `decisionRingState()` (miniature de l'onglet Aujourd'hui, radar coach). Vaut pour /today et `CoachCard` ; la vue Groupe du Coach Control garde les miniatures.
- `AutoregButtons.tsx` :
  - états `active` / `decided` ; le verbe du CTA suit la position réelle du curseur ; jamais de % sur un bouton ; clic hors zone = saute dans la zone ET applique ;
  - CTA rendus par portail dans `actionsSlot` (`.autoreg-slot`, masqué vide par globals.css) ;
  - « ↩ Séance prévue » réécrit les valeurs `original` stockées (vrai revert en base) ;
  - en mode décidé : `onPreviewChange(null)` (sinon l'ajustement s'applique deux fois à l'affichage) et `setAutoregDecision` AVANT l'`await onApply` (sinon remontage = décision perdue).
- Décision enregistrée : `sessions.autoreg_decision` / `coach_sessions.autoreg_decision` (migration 030) via `POST /api/sessions/decision` (qui décide est déduit côté serveur) ; `autoregDecisionRecord.ts` (`validDecision` ignore une décision dont la date ≠ date de séance). Le réglage gratuit de l'anneau n'est pas une décision.
- Planning : `DecisionGauge.tsx`, tolérance `min(0.5, prévu × 0.05)`, pas de 1 point.

## Point forme (`components/wellness/WellnessModal.tsx`)
- Notes en un tap : `components/ui/ScaleBars.tsx` (10 lignes, aucune valeur par défaut, palettes `recovery` / `recovery-inverted` / `load`, `CR10_LABELS`). Libellés par note : `SCALE_WORDS` (`lib/wellnessWords.ts`). Avance au relâcher.
- Mobile : bottom sheet (`SHEET_SNAPS = [52, 66, 92]` dvh), score qui se construit dans `AggregateGauge`. `skipResult` en onboarding.
- `askPlan` : « Qu'as-tu prévu aujourd'hui ? » si aucune séance (Repos / Léger 2 / Modéré 4 / Dur 6 / Très dur 8, `plannedIntensity.ts`).
- `notableInsight` après la réponse seulement : ≥ 12 réponses sur 28 j, |z| ≥ 1,6, plancher d'écart-type 0,75, pas vu depuis 7 j. `CostBadge` par comportement dès 12 points forme (`computeBehaviorCorrelations`).
- Juste après : `POST /api/sessions/proposal { date }` fige la reco côté serveur (voir boucle).
- Terminer une séance (`CompleteModal`, `CoachCompleteModal`) : RPE `null` à la 1re note, Valider grisé ; `RpeInsightLine` / `rpeInsight.ts` (écart au prévu ≥ 2 points en mots, sinon note rare ≥ 12 séances / |z| ≥ 1,6).

## Écrans de résultat (`components/physio/PhysioRevealHost.tsx`, monté dans le layout et sur /register)
- Un seul score de récup partout : `recupAggregatePos` (70 % ressenti relatif + 30 % Forme, `metricCards.ts` / `checkinInsight.ts`), mots Fatigué / Équilibré / Frais.
- Après point forme (`checkinResult`) : score, un bloc gris avec la phrase du jour + le conseil hors entraînement (`dailyAdvice`, question la plus basse ≤ 6), « Jour n sur 5 » tant que la norme se construit, jauge « Ressenti vs nuit mesurée » (phrase seulement en désaccord). « Sous ta norme » / séries de matins seulement si le score affiché est dans Fatigué.
- Après séance (`sessionResult`, `sessionInsight.ts`) : titre = verdict (registre impersonnel, ni « je » ni « l'app »), `ZoneGauge` (zone de `sessionZone()`, « Conseillé » ou « Prévu », rond = ressenti, carré = montre), changements du texte affichés seulement s'il y avait un conseil, « Conseils confirmés : x sur y » + `VerdictStrip`, annonce de recalage.
- Relecture : `requestPhysioReplay` (taper une séance faite, « Modifier mon ressenti ») rouvre l'écran, son bouton ouvre le formulaire. Données : `resultContext.ts` (`loadSessionContext`). Côté coach : `components/coach/CoachResultHost.tsx`, 3e personne, sans montre.

## Boucle de vérification
- Reco du matin figée : `autoreg_proposal` (jsonb, migration 042) écrite par `POST /api/sessions/proposal` (`autoregProposalServer.ts`, `computeProposalFor`) une seule fois par séance et par jour, aussi à la création d'une séance après le point forme (/week, `/api/coach/session`, assign de programme). Accepte `athleteUserId` (coach lié). Prévient le coach si Alléger (`sendOnce` « recovery_alert »). **Ne jamais écrire `autoreg_decision` automatiquement** : sa présence = décision prise.
- Juge (`src/lib/adviceJudge.ts`) : règle unique partout, `HARDER_POINTS = 1`, `EASIER_POINTS = 1`. Issues `justified`, `margin`, `followed_ok`, `push_right`, `push_wrong`, `none_same`, `none_harder`, `none_easier` ; `outcomeRight()`. Jours sans conseil jugés en mots Foster (raté seulement si changement de catégorie). Le réalisé : clic > `autoreg_followed` (migration 043, lien « J'ai allégé sans le noter », `POST /api/sessions/followed`) > `compareNotes(original_notes, notes)` > séance gardée. Lignes renommées de même prescription = pas un changement.
- Rejeu sans reco figée : `replayProposalServer` (`/api/sessions/replay`, `/api/coach/session-replay`), même calcul que le figeage.
- Recalage (`checkRecal`, `bilan.ts` ; `recalFor` dans la route) :
  - chiffre de pilotage = rapport `liftOf` : P(séance ≥ 1 point plus dure | alerte) / P(idem | pas d'alerte), séances suivies exclues, ≥ 5 alertes et ≥ 10 jours sans ; pas affiché à l'écran ;
  - déclenché si ≥ 10 conseils jugés du type et rapport < 1,2 ; seuil retenu = gain ≥ 0,15 en gardant ≥ 5 conseils et ≥ un tiers de ceux d'avant ; pas de 5, plafond 15 (`RECAL_MAX`) ; un recalage annulé n'est jamais reproposé ;
  - `POST /api/autoreg/recal` : `{ sessionId }` automatique après chaque note (annonce + « Annuler » côté sportif), `{ undo: true }`, `{ apply }` = « Me recaler » du bilan ;
  - journal `profiles.autoreg_recal_events` (migration 044) ; bilan, comptes et courbe rejouent chaque jour avec le seuil de ce jour-là (`shiftsOn`).
- Signal appris (`autoregPersonal.ts`) : qualité de séance via le parseur (`lineQuality`, `sessionTypes` : 8 qualités des tests + technique, groupes force_puissance / vitesse_reactivite), jamais le nom de séance. `learnSignals` : ≥ 12 séances du type, ≥ 8 de chaque côté, écart ≥ 20 points ; `personalAdjust` → ligne « Appris sur toi : … ».

## Onglets Charge / Récupération
- `components/conseils/HomeAnalyticsSections.tsx` (`ChargeSection`, `RecuperationSection`, `behaviorIndexCard`), `components/conseils/IndexCards.tsx`, `MetricChart.tsx`, logique pure dans `src/lib/metricCards.ts` (`chartSpecFor`, `prettyStatus`, `statusDisplayColor`). Une carte par indice, chart au clic, un insight sur chaque carte (même vert et stable), toggle 7/28/90 partagé dans le chart déplié.
- Récup : chips Score / Sommeil / Stress / État physique / Motivation / FC repos / VFC qui tracent le z (réf. = 0). Comportements = dernière carte (« En collecte » sous 10 j ; charge de la veille fusionnée via `computeLoadBehaviorCorrelations`).
- `analyticsReady` (`lib/demoAnalytics.ts`) : sous les seuils, l'onglet et la Phase montrent un exemple avec mention.
- ACWR reste le chart par défaut de Charge (jamais les zones Surcharge/Optimal sur une échelle UA). Pas de spline (dépasserait les points réels). Texte et marqueurs des charts en overlay HTML, jamais en `<text>` SVG dans le viewBox.

## Ressenti vs montre
- Synchro (`healthSync.ts`) : FC des entraînements seulement dans les builds marqués `TPCHeart` (`canReadHeart`, `heartAccess.ts`) ; `health_workouts.avg_hr/max_hr/trimp` (TRIMP de Banister, FC repos médiane 30 j, FC max vue jamais < 180), dédoublonnage par `start_at`.
- `physioCompare.ts` : familles `heartFamily` force / cardio / autre, `matchWorkout`, régression RPE ~ ln(TRIMP/min), `HEART_CALIBRATION = 8` séances ; `physioVerdictAt` compare ressenti et mesures chacun à SA norme 28 j (`PHYSIO_MIN_DAYS = 5`) puis l'un à l'autre (≥ 1 écart-type). Lecture client `physioData.ts`.
- `watchEstimates.ts` : un entraînement montre sans séance notée compte dans la charge avec un RPE estimé (`personalRpeFor` sinon FC de réserve), marche exclue ; `withWatchEstimates` seulement dans la liste passée au moteur, jamais affiché (`isEstimated`).
- `measuredRecovery` : récup mesurée avant l'inscription seulement ; après, le score du jour exige le point forme.
- `watchCompare.ts` + `WatchPairChart` : déclaré (bleu plein) vs montre (orange pointillé), badge d'accord par corrélation (≥ 0,4 / < 0,15, 5 j mini). Charge : `heartFamilyCards()`.
- UI : « tes données physiologiques », « fréquence cardiaque » en toutes lettres (jamais « FC », jamais « ta montre » dans les comparaisons). Pas de côté coach (RLS `health_*`).

## Bilans (`src/lib/bilan.ts`, `components/bilan/`)
- `computeBilan` pur, un écran par thème avec son seuil (sous le seuil, l'écran saute). `BilanCarousel` (next/dynamic), `BilanCard` en haut de /today, accès `CalendarHeader`. Données : `loadBilanRaw` (`bilanData.ts`, coach via `/api/coach/bilan`).
- Forme comparée = forme RESSENTIE (4 réponses), jamais `score` ni `base_score`. Historique synthétique de l'onboarding exclu (`isSynthetic`). ACWR à partir de la 1re séance, charge après 28 j. « Conseils vérifiés » : `computeAccounts`, frise, courbe mois par mois.

## Invariants et pièges
- Wording : « point forme » (10 secondes, jamais 30), « récupération », « sportif ». Jamais de note chiffrée 1-10 à l'écran (« 5/10 », « RPE 6 ») : des mots (`qualitativeDifficulty`, `SCALE_WORDS`). Comptes (« 8 sur 14 ») et forme sur 100 permis. « Soirée (alcool ou sortie) », « se paie le lendemain ».
- Ne pas marketer le taux de conseils confirmés (une app muette ferait 87 % sur Gildas) ni « Appris sur toi ≈ 2× ». Marketer le mécanisme (« Chaque conseil, vérifié après ta séance ») et la science (Saw et al., BJSM 2016).
- Vrai sportif sans point forme du jour = `null` / « non renseigné », jamais `coach_athletes.wellness_score` (dénormalisé, périmé) ; la valeur fixe ne vaut que pour les démos (`user_id === null`).
- Toute nouvelle surface qui affiche une récup lit la même baseline (SSR compris : `today/page.tsx`, `week/page.tsx` fournissent l'historique au 1er rendu).
- Vérifier une règle par script `tsx` sur les vraies séries ou un balayage exhaustif, pas par relecture : c'est ainsi que la plupart des bugs de ce domaine ont été trouvés.
- Limites connues : une difficulté prévue fausse fausse le verdict ; le moteur générique ne repère pas mieux les séances dures sur les données de Gildas (rapport 0,7 → 0,9 après recalage).

## Abandonné / supprimé
- Modèles de reco successifs : seuils fixes wellness < 60 / ≥ 80, écart continu en %, paliers z Hopkins, tableau par difficulté (27-29/09). `AUTOREG_CHIPS` reste exporté mais `AdjustSessionModal` n'existe plus.
- `computeFatigueImpact`, `computeDisplayScore`, bandeau « Impact fatigue », `getAdvice`, `getContextualInsight`, `mergeChargeIntoBody`, `chronicContextLine`, `/api/push/event` (recalculait la reco sans charge chronique), `CrossInsightBanner` et partage « signature de fatigue » sur les onglets, carte décision séparée sous l'anneau (28/10), texte sous l'anneau (12/10), tuile « ♥ MESURÉ », cartes « Ressenti vs physiologie » séparées, puce « Charge cardiaque », curseurs `<input type="range">` et valeurs par défaut du point forme, rampe horizontale 1-10, fenêtre saine UA sur la carte Charge, `ChargeReportChart`.
- Pas fait volontairement : apprentissage par exercice (testé, rien), aperçus d'onboarding personnalisés, comparaison montre côté coach.

Détails et raisons : grep `historique.md` de ce dossier (sections datées, la plus récente prime).
Attention : le modèle de reco diagonal en vigueur (`autoregBand`, 05/10) est historisé dans `../coach/historique.md` (section Coach Control v2). Les sections « points de RPE », « écart à la norme » et « règles par difficulté » de ce dossier sont périmées.
