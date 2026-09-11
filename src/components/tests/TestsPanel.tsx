"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  listTests, listOwnResults, fetchAthleteOwnTests, fetchCoachTestsForAthlete, mergeTests,
  upsertTestResult, parseResultValue, mergeTestInto, deleteTestIfEmpty, deleteTestResult, deleteTestCompletely, TEST_UNITS,
  listOwnStrengthReps, upsertStrengthRep, deleteStrengthRep,
  type TestResultRow, type TestSubject, type MergedTest, type StrengthRepRow,
} from "@/lib/testResults";
import TestEvolutionChart from "@/components/tests/TestEvolutionChart";
import { guessSportChip } from "@/lib/sportCategories";
import {
  computeAllInsights, computeCrossFamilyInsights, computeAllFamiliesInsights, canonicalMetricKey, buildVerdict, splitByStrength, groupInsightsByMetric, METRIC_DISPLAY, suggestCanonicalNames, heightFromFlightTime, dropJumpProfile, formatDropJumpHeightCm, formatDropJumpContactMs, ftctRatio, vo2maxFromCooperDistance, vmaFromDemiCooperDistance,
  type MetricKey, type CardInsight, type CardStatus, type Sexe,
} from "@/lib/testNorms";
import { TEST_BATTERIES, BATTERY_TEST_METRICS, type BatteryTest, sharesEnoughWords, buildMergeSuggestions } from "@/lib/testBattery";
import { QUALITY_ORDER, QUALITY_META, METRIC_QUALITY, BATTERY_TEST_QUALITY, type Quality } from "@/lib/testQualities";
import { classifySprintProfile, type SprintAxisComparison, type SprintDistance, type FlyKey } from "@/lib/sprintProfile";
import { estimateOneRepMax, bestStrengthEnduranceComparison } from "@/lib/strengthProfile";

const STATUS_COLOR: Record<CardStatus, { text: string; bg: string; fill: string }> = {
  green: { text: "#2f9e44", bg: "rgba(47,158,68,.10)", fill: "#2f9e44" },
  amber: { text: "#c77700", bg: "rgba(199,119,0,.10)", fill: "#e0a100" },
  red: { text: "#d10000", bg: "rgba(209,0,0,.08)", fill: "#d10000" },
};
// Wording refonte cartes (2026-09, inspiré profil-cards-v2-poc.html) — remplace "Point fort/Dans la
// norme" par un vocabulaire de progression vers un repère plus explicite ("Proche"/"Objectif atteint"),
// même calcul de statut sous-jacent (CardStatus dérivé du score vs norme de population, inchangé) —
// seul le libellé affiché change, aucune nouvelle donnée ni logique de score.
const STATUS_LABEL: Record<CardStatus, string> = { green: "Objectif atteint", amber: "Proche", red: "Axe de travail" };
// Profils réel-vs-attendu (2026-09, sprintProfile.ts ET strengthProfile.ts, même 3 libellés) —
// couleurs distinctes de STATUS_COLOR : ce ne sont pas des scores contre une norme de population
// (aucune sourcée pour ces distances/l'endurance de force), juste un écart réel-vs-attendu à partir
// des propres autres données du sportif — "amber" plutôt que "red" pour l'écart défavorable,
// volontairement moins sévère qu'un vrai axe de travail contre une norme externe.
// `SprintAxisComparison.axis` porte désormais directement son libellé humain (sprintProfile.ts,
// modèle mono-exponentiel généralisé à toutes les distances/segments, 2026-09) — plus de mapping
// fixe ici, l'ancien SPRINT_AXIS_LABEL (3 axes figés) a été retiré avec la logique qu'il servait.
const COMPARISON_LABEL_COLOR: Record<"point fort" | "conforme à l'attendu" | "axe de travail", { text: string; bg: string }> = {
  "point fort": { text: "#2f9e44", bg: "rgba(47,158,68,.10)" },
  "axe de travail": { text: "#c77700", bg: "rgba(199,119,0,.10)" },
  "conforme à l'attendu": { text: "#8a8f94", bg: "#eeefec" },
};
// Métriques résolues (canonicalMetricKey) mais SANS AUCUNE CardInsight (pas de RATIO_CARD/BW_CARD/
// ABSOLUTE_CARD dont ce serait le `primaryMetric`) — `coveredMetrics` (dérivé des CardInsight) ne
// peut donc jamais les voir comme "représentées" une fois loggées, malgré `isMetricRepresented`
// ci-dessous. Sprint60m/100m/200m et les distances d'endurance : aucune norme de population sourcée
// à ce jour. `cmjFreeArms` (2026-09, suite — bug réel signalé par Gildas, "j'ai 2 Saut vertical bras
// libres") : absent d'ici par oubli lors de l'ajout de ce MetricKey — sans cette entrée, sa carte
// recommandée (testBattery.ts) n'était JAMAIS marquée "faite" (notCovered() toujours vrai), et
// s'affichait donc EN PLUS de sa propre carte "résolue mais sans repère" (resolvedUninterpretedMetrics)
// — 2 lignes pour le même test. Toute future métrique dans ce cas (résolue, sans CardInsight) doit
// être ajoutée ici pour éviter la même duplication.
// fly10m/fly20m/fly30m (2026-09, suite — ajoutés comme tests recommandés par défaut, "10m/20m/30m
// lancé") : même raison que sprint10m/30m/60m/100m juste au-dessus, ajoutés d'emblée cette fois
// (leçon retenue de l'oubli cmjFreeArms) — aucune RATIO_CARD sourcée, sans cette entrée leur carte
// recommandée ne serait jamais marquée "faite" une fois une vraie valeur loguée.
const MULTI_ENTRY_METRICS = new Set<MetricKey>(["sprint10m", "sprint30m", "sprint60m", "sprint100m", "sprint200m", "fly10m", "fly20m", "fly30m", "time5k", "time10k", "timeSemi", "timeMarathon", "cmjFreeArms"]);
// Mouvements de force "pure" au sens strict — même liste que METRIC_QUALITY["force"] (testQualities.ts)
// — seuls ceux-ci ont l'option "reps" (endurance de force, strengthProfile.ts). Exclut délibérément
// les mouvements olympiques/leurs variantes techniques (snatch, cleanJerk, etc. — qualité "puissance") :
// Gildas a précisé que le modèle Epley ne s'y prête pas, la technique casse avant la fatigue
// musculaire sur ces mouvements, contrairement à un squat/bench/deadlift. Jamais gaté sur `unit==="kg"`
// (bug réel trouvé par Gildas : un vieux test "100m" mal unité-tagué "kg" avant d'avoir un MetricKey
// proposait à tort la fonctionnalité reps).
const FORCE_MOVEMENT_METRICS = new Set<MetricKey>(["backSquat", "frontSquat", "bench", "deadlift", "press", "goodMorning", "cleanDeadlift", "snatchDeadlift", "ohSquat"]);
// Métriques qui ne doivent JAMAIS avoir leur propre carte, même résolues (2026-09) — toujours
// affichées en secondaire d'une autre carte. dropJumpContact vit déjà sur la carte "Drop jump"
// (secondaryByDate) — bug réel trouvé par Gildas : sans cette exclusion, un vieux test "Temps de
// contact (drop jump)" (jamais primaryMetric d'aucun CardInsight) réapparaissait comme carte séparée,
// doublonnant une donnée déjà visible.
const SECONDARY_ONLY_METRICS = new Set<MetricKey>(["dropJumpContact"]);

/* Emoji par mouvement (2026-09, inspiré profil-cards-v2-poc.html — "reconnaître le mouvement
   instantanément, comme dans le bilan") — petite table curatée pour les mouvements les plus fréquents,
   repli sur l'emoji de la qualité physique dominante (QUALITY_META, déjà réutilisé pour les chips de
   filtre) pour tout le reste, plutôt qu'une 2e table à maintenir en parallèle pour chacun des ~90
   MetricKey. Dernier repli 🧪 (test sans MetricKey ni quality connue). */
const MOVEMENT_EMOJI: Partial<Record<MetricKey, string>> = {
  backSquat: "🦵", frontSquat: "🦵", ohSquat: "🦵", ohSquatPushPress: "🦵",
  bench: "🏋️", press: "💪", pressOh: "💪", pushPress: "💪", pressBtn: "💪",
  deadlift: "🏋️‍♂️", cleanDeadlift: "🏋️‍♂️", snatchDeadlift: "🏋️‍♂️", goodMorning: "🙇",
  clean: "🏋️‍♀️", cleanJerk: "🏋️‍♀️", snatch: "🏋️‍♀️", jerk: "🏋️‍♀️",
  cmjHeight: "🚀", squatJumpHeight: "🚀", dropJumpHeight: "🚀", dropJumpContact: "🚀",
  sprint10m: "🏃", sprint30m: "🏃", sprint60m: "🏃", sprint100m: "🏃", sprint200m: "🏃",
  time5k: "🏃‍♂️", time10k: "🏃‍♂️", timeSemi: "🏃‍♂️", timeMarathon: "🏃‍♂️",
  vma: "🫁", vo2max: "🫁",
};
function movementEmoji(metric: MetricKey | undefined, fallbackQualities?: Quality[]): string {
  if (metric && MOVEMENT_EMOJI[metric]) return MOVEMENT_EMOJI[metric]!;
  const q = (metric ? METRIC_QUALITY[metric]?.[0] : undefined) ?? fallbackQualities?.[0];
  return q ? QUALITY_META[q].emoji : "🧪";
}

// Dark (2026-09, suite) — la liste de tests vit désormais dans la carte "Recommandations" (fond
// sombre), recolorée en conséquence.
const INPUT_STYLE = { width: "100%", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 10, padding: "9px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, color: "#fff" };

function sexeLabel(s: Sexe): string { return s === "homme" ? "Homme" : s === "femme" ? "Femme" : "Sexe non renseigné"; }
function poidsLabel(p: number | null | undefined): string { return p ? `${p} kg` : "Poids non renseigné"; }

const MONTH_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];
function formatLong(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()} ${MONTH_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/* Retrouve, parmi les tests déjà loggués par l'utilisateur (`merged`), celui qui correspond à un test
   recommandé SANS MetricKey (2026-09, fusion "Tests recommandés" → cartes) — nécessaire pour savoir
   QUELLE ligne réelle afficher en carte remplie plutôt que verrouillée. Exact d'abord (même clé que
   resolveTest produirait, .trim().toLowerCase() — jamais dupliqué ailleurs, voir testResults.ts),
   flou en repli (sharesEnoughWords, déplacée dans testBattery.ts — voir ce fichier pour le pourquoi)
   sinon. */
function findMatchingRawTest(testName: string, candidates: MergedTest[]): MergedTest | undefined {
  const key = testName.trim().toLowerCase();
  const exact = candidates.find(m => m.name_key === key);
  if (exact) return exact;
  return candidates.find(m => sharesEnoughWords(testName, m.name));
}

const TIME_UNITS = new Set(["s", "min"]);

/* Relecture cm/ms (2026-09) — le stockage reste m/s (voir formatDropJumpHeightCm/formatDropJumpContactMs,
   testNorms.ts), seule la présentation change pour ces 2 métriques précises. Le drop jump se lit
   toujours à 2 valeurs : quand `secondaryByDate` (le temps de contact, par date) est fourni et qu'un
   point existe pour cette date précise, il est affiché à côté de la hauteur — jamais la hauteur seule. */
function formatRawValue(metric: MetricKey | undefined, value: number, unit: string, date?: string, secondaryByDate?: Map<string, number>): string {
  if (metric === "dropJumpHeight") {
    const heightText = formatDropJumpHeightCm(value);
    const contact = date != null ? secondaryByDate?.get(date) : undefined;
    return contact != null ? `${heightText} · ${formatDropJumpContactMs(contact)}` : heightText;
  }
  if (metric === "dropJumpContact") return formatDropJumpContactMs(value);
  return `${value} ${unit}`;
}
function trendInfo(prevRaw: number, lastRaw: number, unit: string): { deltaPct: number | null; improved: boolean | null } {
  const prev = Number(prevRaw), last = Number(lastRaw);
  if (prev === last) return { deltaPct: 0, improved: null };
  if (prev === 0) return { deltaPct: null, improved: null };
  const deltaPct = Math.round(((last - prev) / prev) * 100);
  const wentUp = last > prev;
  return { deltaPct, improved: TIME_UNITS.has(unit) ? !wentUp : wentUp };
}

/* Un exercice peut être comparé à plusieurs références (un autre lift, le poids de corps) — chacune
   avec son propre statut, jamais résumées en un seul badge qui masquerait qu'un exercice peut être
   un point fort sur un axe et un axe de travail sur un autre (ex. Snatch fort vs Épaulé-jeté mais
   faible rapporté au poids de corps). */
/* Redessiné (2026-09) : "75% vs Back Squat" tient sur une seule ligne (valeur + comparaison fusionnées,
   au lieu d'un kicker "vs X" suivi d'un gros chiffre sur sa propre ligne), et le texte `desc`
   ("Rapporté à ton Back Squat, repère théorique ~80%...") ne s'affiche plus du tout — remplacé par un
   repère visuel : un petit trait vertical sur la jauge, positionné à `refValue` (voir CardInsight,
   testNorms.ts), pour montrer où on est "censé être" sans passer par du texte. */
/* Uniquement les comparaisons VERROUILLÉES (2026-09, suite) — depuis que la liste unifiée affiche la
   comparaison résolue "primary" directement dans l'en-tête de ligne (jauge + valeur, voir
   TestsPanel), la réafficher ici en détail serait un pur doublon (même chiffre, même jauge, jamais
   d'info nouvelle) : l'ancienne branche "résolue" (gauge complète + tick + badge de statut) n'est
   donc plus jamais atteinte, retirée plutôt que laissée morte. Ce bloc ne sert plus qu'à motiver
   "pourquoi tu ne vois rien encore" (jamais loggué, ou référence manquante) — la seule info qui
   n'existe nulle part ailleurs. Dark (2026-09, suite) : cette liste vit désormais dans la carte
   "Recommandations" (fond sombre), recolorée en conséquence. */
function ComparisonBlock({ insight, first }: { insight: CardInsight; first: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 10, paddingTop: first ? 0 : 10, borderTop: first ? undefined : "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>vs {insight.compareLabel}</div>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.65)", background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", borderRadius: 10, padding: "9px 12px", lineHeight: 1.5 }}>
        {insight.locked?.kind === "weight" ? "Renseigne ton poids dans ton profil pour voir ce repère."
          : insight.locked?.kind === "reference" ? `Ajoute un résultat pour « ${insight.locked.refLabel} » pour voir ce repère.`
          : "Ajoute un résultat ci-dessous pour voir ce repère."}
      </div>
    </div>
  );
}

/* Menu "⋯" (relier/supprimer) d'une ligne non reliée (2026-09, suite) — vit désormais dans l'en-tête
   de ligne de la liste unifiée (TestsPanel), plus dans TestCard (qui n'a plus de header propre, voir
   plus bas) : extrait en composant à part pour ne pas alourdir le JSX de la ligne. Dark, comme le
   reste de la liste. */
/* Repère théorique en unité réelle du test (2026-09, suite — jamais le %/multiple interne d'une
   comparaison "ratio"/"bodyweight") : pour "absolute", `refValue` est déjà en unité réelle (fmt le
   sait déjà formater correctement) ; pour "ratio"/"bodyweight", `refValueDisplay` est déjà pré-
   formaté en absolu (voir formatAbsoluteRef, testNorms.ts, ex. "128 kg"). `null` quand aucun repère
   théorique n'existe (classification graduée sans cible unique, ex. VO2max). */
function targetRealUnitDisplay(insight: CardInsight): string | null {
  if (insight.kind === "absolute") return insight.refValue != null ? insight.fmt(insight.refValue) : null;
  return insight.refValueDisplay ?? null;
}
/* Même repère, en NOMBRE (pour calculer un écart réel) plutôt qu'en texte déjà formaté — extrait le
   nombre de `refValueDisplay` via parseFloat plutôt que dupliquer le calcul de formatAbsoluteRef. */
function targetRealUnitNumeric(insight: CardInsight): number | null {
  if (insight.kind === "absolute") return insight.refValue ?? null;
  if (!insight.refValueDisplay) return null;
  const n = parseFloat(insight.refValueDisplay);
  return Number.isFinite(n) ? n : null;
}

/* Jauge pleine largeur de la comparaison "primary" d'une ligne (2026-09, suite) — reprend le rendu
   complet retiré de ComparisonBlock (valeur/% + "vs {compareLabel}" + badge de statut), dark,
   DIRECTEMENT dans la ligne (plus dans le détail déplié) : Gildas a explicitement demandé de la
   retrouver telle quelle plutôt que le résumé compact (qui perdait "vs {compareLabel}").
   `deltaRealUnit` (calculé par l'appelant, voir UnifiedRow) s'affiche EN PLUS du %, jamais à sa
   place — les 2 informations sont complémentaires.
   Jauge centrée sur la CIBLE (2026-09, suite — retour de Gildas) : le centre (50%) est TOUJOURS le
   repère théorique, jamais une extrémité de la norme de population — la barre part du centre et
   s'étend vers la droite (mieux que la cible) ou la gauche (en dessous), sur une échelle de score
   (0-100, même normalisation que `insight.score`) plutôt qu'en unité réelle (les 2 axes de la norme
   n'ont pas la même échelle physique que l'écart réel, un mélange des deux serait trompeur). Repli
   sur l'ancien remplissage linéaire 0→score% quand aucun repère théorique n'existe (classification
   graduée sans cible unique, ex. VO2max) — pas de centre à définir dans ce cas. */
function PrimaryGauge({ insight, deltaRealUnit, rawValueLabel }: { insight: CardInsight; deltaRealUnit: string | null; rawValueLabel: string | null }) {
  const c = STATUS_COLOR[insight.status!];
  const hasTarget = insight.refValue != null && insight.norms[1] !== insight.norms[0];
  const targetScore = hasTarget
    ? Math.max(0, Math.min(100, ((insight.refValue! - insight.norms[0]) / (insight.norms[1] - insight.norms[0])) * 100))
    : null;
  const targetLabel = targetRealUnitDisplay(insight);
  return (
    <div style={{ marginTop: 4 }}>
      {/* Cible déplacée SOUS la jauge (2026-09, suite — retour de Gildas, "en mobile c'est mieux") :
          l'ancienne version centrait "cible vs X : Y" en absolu PAR-DESSUS la ligne résultat/badge,
          ce qui pouvait chevaucher un badge large (delta long) sur un écran étroit. Désormais un
          simple flex normal résultat/badge, puis la cible en centré textuel sous la jauge — plus de
          `position:absolute`/chevauchement possible, et le centrage sous la même largeur que la
          jauge reste visuellement aligné avec le tick. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        {rawValueLabel != null ? (
          <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.1 }}>{rawValueLabel}</span>
        ) : <span />}
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap", color: c.fill, background: `${c.fill}26` }}>
          {STATUS_LABEL[insight.status!]}{deltaRealUnit && ` : ${deltaRealUnit}`}
        </span>
      </div>
      <div style={{ position: "relative", height: 12, background: "rgba(255,255,255,.10)", borderRadius: 6 }}>
        {targetScore != null ? (
          <>
            <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
            {(() => {
              const deviation = insight.score! - targetScore;
              const dir = deviation >= 0 ? "right" : "left";
              const width = Math.min(50, Math.abs(deviation));
              return (
                <div
                  style={{
                    position: "absolute", top: 0, height: "100%", borderRadius: 6, background: c.fill,
                    ...(dir === "left" ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }),
                  }}
                />
              );
            })()}
          </>
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${insight.score}%`, background: c.fill, borderRadius: 6 }} />
        )}
      </div>
      {targetLabel != null && (
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
          cible vs {insight.compareLabel} : <b style={{ color: "#fff", fontWeight: 700 }}>{targetLabel}</b>
        </div>
      )}
    </div>
  );
}

/* Jauge du profil de vitesse (2026-09, suite — retour de Gildas, "propose comment afficher ça") —
   même langage visuel que PrimaryGauge (centre = repère, ici le temps ATTENDU d'après les autres
   splits du sportif, sourcé fechain-athletisme.fr/Chu/Dick, voir sprintProfile.ts) mais adapté à un
   SprintAxisComparison (pas de CardInsight/score ici, juste actual/predicted/deltaPct) plutôt qu'une
   fausse CardInsight avec des champs inventés. `deltaPct` > 0 = plus LENT que prévu (voir
   sprintProfile.ts) — la barre va donc vers la DROITE (mieux) quand deltaPct est NÉGATIF. */
function SprintAxisGauge({ comp, hideLabel }: { comp: SprintAxisComparison; hideLabel?: boolean }) {
  const col = COMPARISON_LABEL_COLOR[comp.label];
  const better = -comp.deltaPct; // positif = plus rapide que prévu
  const dir = better >= 0 ? "right" : "left";
  const width = Math.min(50, Math.abs(comp.deltaPct) * 4);
  return (
    <div style={{ marginTop: hideLabel ? 4 : 0, marginBottom: hideLabel ? 0 : 14 }}>
      {/* `hideLabel` (2026-09, suite) : utilisé quand la jauge s'affiche directement sur la ligne du
          test dans la liste unifiée (voir UnifiedRow.sprintComparison) — le nom du test est déjà
          affiché juste au-dessus par la ligne elle-même, répéter `comp.axis` ferait doublon (contraire
          au titre du chantier "aucun doublon d'informations"). Toujours affiché dans la liste
          "Recommandations", où plusieurs jauges de distances différentes s'enchaînent sans autre
          repère. */}
      {!hideLabel && <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{comp.axis}</div>}
      {/* Attendu déplacé SOUS la jauge (2026-09, suite — même fix que PrimaryGauge, "en mobile c'est
          mieux") : même raisonnement, plus de position:absolute superposée à la ligne résultat/badge. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>{comp.actual.toFixed(2)}s</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap", color: col.text, background: `${col.text}26` }}>
          {comp.label.charAt(0).toUpperCase() + comp.label.slice(1)}
        </span>
      </div>
      <div style={{ position: "relative", height: 12, background: "rgba(255,255,255,.10)", borderRadius: 6 }}>
        <div style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
        <div
          style={{
            position: "absolute", top: 0, height: "100%", borderRadius: 6, background: col.text,
            ...(dir === "left" ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }),
          }}
        />
      </div>
      <div style={{ marginTop: 6, textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
        attendu : <b style={{ color: "#fff", fontWeight: 700 }}>{comp.predicted.toFixed(2)}s</b>
      </div>
    </div>
  );
}

/* Nouveau test entièrement libre (2026-09, suite — retour de Gildas, "ajoute la possibilité d'ajouter
   un test depuis la page des tests de performance") : réutilise EXACTEMENT le même mécanisme
   d'écriture que handleAddForNewRecommendedTest (le nom n'a pas besoin d'exister dans testBattery.ts —
   upsertTestResult/resolveTest crée la fiche sous ce nom exact) mais sans partir d'un test recommandé
   préexistant, le nom est tapé librement. Rejoint automatiquement une carte interprétée si le nom
   résout un MetricKey connu (canonicalMetricKey), sinon apparaît comme un test "brut"/non relié —
   même sort que n'importe quel exercice loggué en séance sous un nom inconnu. */
function AddCustomTestForm({ onSave, onCancel }: {
  onSave: (name: string, value: number, unit: string, date: string, qualities: Quality[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>(TEST_UNITS[0]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  // Qualité(s) physique(s) (2026-09, suite — retour de Gildas, "il faut sûrement aussi pouvoir
  // ajouter une catégorie/qualité physique quand on créer un test") : uniquement pertinent pour un
  // nom qui ne résout PAS déjà un MetricKey connu (sinon METRIC_QUALITY gère déjà le filtrage, ce
  // champ ne serait jamais lu) — masqué dans ce cas plutôt qu'affiché pour rien. Optionnel : ne pas
  // en choisir garde le comportement historique (toujours affiché, quel que soit le filtre actif).
  const [selectedQualities, setSelectedQualities] = useState<Quality[]>([]);
  function toggleQuality(q: Quality) {
    setSelectedQualities(prev => (prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q]));
  }
  // Suggestion de test proche déjà connu (2026-09, suite — retour de Gildas : "je viens de créer
  // 'épaulé debout', ça ne me recommande pas Power Clean qui est la traduction" / "je veux avoir la
  // recommandation pour le lier à un existant proche directement, comme on le fait en séance") :
  // réutilise EXACTEMENT le même mécanisme que le "🔗 Relier" d'un test brut (buildMergeSuggestions —
  // mot-clés partagés contre les alias canoniques ET les noms de tests recommandés), mais proposé
  // AVANT la création plutôt qu'après coup. Masquée dès que le nom tapé résout déjà tout seul
  // (`canonicalMetricKey`) — pas la peine de suggérer un nom qui se lierait de toute façon.
  const trimmedName = name.trim();
  const suggestions = trimmedName.length >= 3 && !canonicalMetricKey(trimmedName)
    ? buildMergeSuggestions(trimmedName).filter(s => s.toName.toLowerCase() !== trimmedName.toLowerCase()).slice(0, 4)
    : [];
  const canSave = name.trim().length > 0 && parseResultValue(value) !== null && !!date;
  const showQualityPicker = trimmedName.length >= 3 && !canonicalMetricKey(trimmedName);
  const fieldStyle = { boxSizing: "border-box" as const, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, color: "#fff", fontSize: 13.5 };
  async function handleSubmit() {
    const v = parseResultValue(value);
    if (v === null || !name.trim() || !date || saving) return;
    setSaving(true);
    await onSave(name.trim(), v, unit, date, selectedQualities);
    setSaving(false);
  }
  function applySuggestion(toName: string) {
    setName(toName);
    const key = canonicalMetricKey(toName);
    if (key) setUnit(METRIC_DISPLAY[key].unit);
  }
  return (
    <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", marginBottom: 10 }}>🆕 Nouveau test</div>
      <input
        value={name} onChange={e => setName(e.target.value)} placeholder="Nom du test (ex. Test T, Beep test...)" autoFocus
        style={{ ...fieldStyle, width: "100%", padding: "9px 11px", marginBottom: suggestions.length ? 6 : 8 }}
      />
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.45)", alignSelf: "center" }}>Tu veux dire :</span>
          {suggestions.map(s => (
            <button
              key={s.toName}
              onClick={() => applySuggestion(s.toName)}
              style={{ background: "rgba(240,74,8,.16)", border: "1px solid rgba(240,74,8,.4)", borderRadius: 20, color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}
            >
              🔗 {s.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={value} onChange={e => setValue(e.target.value)} type="number" inputMode="decimal" placeholder="Résultat"
          style={{ ...fieldStyle, flex: 1, minWidth: 0, padding: "9px 11px" }}
        />
        <select value={unit} onChange={e => setUnit(e.target.value)} style={{ ...fieldStyle, padding: "9px 8px" }}>
          {TEST_UNITS.map(u => <option key={u} value={u} style={{ color: "#111" }}>{u}</option>)}
        </select>
        <input
          value={date} onChange={e => setDate(e.target.value)} type="date"
          style={{ ...fieldStyle, padding: "9px 8px", colorScheme: "dark" as const }}
        />
      </div>
      {showQualityPicker && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>
            Qualité(s) physique(s) (optionnel)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {QUALITY_ORDER.map(q => {
              const meta = QUALITY_META[q];
              const active = selectedQualities.includes(q);
              return (
                <button
                  key={q}
                  onClick={() => toggleQuality(q)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: active ? "#f04a08" : "rgba(255,255,255,.08)",
                    border: active ? "1px solid #f04a08" : "1px solid rgba(255,255,255,.16)",
                    borderRadius: 20, color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 11px", cursor: "pointer",
                  }}
                >
                  <span>{meta.emoji}</span>{meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleSubmit} disabled={!canSave || saving}
          style={{ flex: 1, background: canSave ? "#f04a08" : "rgba(255,255,255,.10)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, fontSize: 13.5, padding: "9px 0", cursor: canSave ? "pointer" : "default" }}
        >
          {saving ? "..." : "Ajouter"}
        </button>
        <button
          onClick={onCancel}
          style={{ background: "none", border: "1px solid rgba(255,255,255,.18)", borderRadius: 10, color: "rgba(255,255,255,.7)", fontWeight: 700, fontSize: 13.5, padding: "9px 14px", cursor: "pointer" }}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function RowMenu({ mergeSuggestions, onMerge, onDeleteWhole }: {
  mergeSuggestions?: { label: string; toName: string }[];
  onMerge?: (toName: string) => Promise<void>;
  onDeleteWhole?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.45)", fontSize: 15, fontWeight: 900, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
        ⋯
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9 }} />
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#232323", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.45)", padding: 10, minWidth: 220, zIndex: 10 }}>
            {onMerge && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>🔗 Relier à un test connu</div>
                {mergeSuggestions?.length ? (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {mergeSuggestions.map(s => (
                      <button
                        key={s.toName} disabled={!!merging}
                        onClick={async () => { setMerging(s.toName); await onMerge(s.toName); setMerging(null); setOpen(false); }}
                        style={{ fontSize: 10.5, fontWeight: 700, color: "#ff9d6e", background: "rgba(240,74,8,.15)", border: "1px solid rgba(240,74,8,.4)", borderRadius: 20, padding: "3px 9px", cursor: "pointer", opacity: merging && merging !== s.toName ? 0.5 : 1 }}
                      >
                        {merging === s.toName ? "…" : s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)" }}>Aucun nom proche trouvé.</div>
                )}
              </div>
            )}
            {onDeleteWhole && (
              <button
                disabled={deleting}
                onClick={async () => { setDeleting(true); await onDeleteWhole(); setOpen(false); }}
                style={{ width: "100%", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#ff6b6b", background: "none", border: "none", borderTop: onMerge ? "1px solid rgba(255,255,255,.1)" : undefined, paddingTop: onMerge ? 8 : 0, cursor: "pointer" }}
              >
                🗑 {deleting ? "Suppression…" : "Supprimer ce test"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* Une carte = un exercice testé (résultat + évolution + historique), avec 0 à N comparaisons à la
   littérature (chacune sa propre référence et son propre statut — voir ComparisonBlock) quand
   `comparisons` est fourni (sinon carte "brute", sans interprétation — cas d'un test hors des
   normes connues, toujours affiché mais sans jugement forces/faiblesses). Toujours visible en
   entier, jamais un détail caché derrière une sélection préalable. */
function TestCard({ title, unit, results, comparisons, onAdd, onAddNew, onAddPair, readOnly, batteryInfo, onDeleteResult, metric, sscProfile, secondaryByDate, ftctInfo, repEntries, onAddRepEntry, onDeleteRepEntry, initialOpen }: {
  title: string;
  unit: string;
  results: TestResultRow[];
  comparisons?: CardInsight[];
  onAdd: (value: number, date: string) => Promise<void>;
  /* Test recommandé jamais loggué (2026-09, fusion "Tests recommandés" → cartes) — remplace `onAdd`
     quand AUCUNE ligne `tests` n'existe encore pour ce nom (ex. "Test T (agilité)") et qu'aucune
     unité fiable n'est déductible (testBattery.ts ne connaît pas d'unité "correcte" pour la plupart
     des tests sans MetricKey — temps ? niveau ? degrés ? dépend du protocole réel). Demande l'unité
     au moment de la 1re saisie (dropdown TEST_UNITS) plutôt que d'en inventer une ; écrit la toute
     première ligne `tests` sous ce nom exact (upsertTestResult → resolveTest crée si absent). */
  onAddNew?: (value: number, unit: string, date: string) => Promise<void>;
  /* Saisie fusionnée (2026-09, dropJumpHeight uniquement) — quand fournie, remplace `onAdd` : le
     formulaire demande aussi le temps de contact et écrit les 2 métriques (dropJumpHeight,
     dropJumpContact) d'un coup avec la même date, pour garantir qu'elles viennent du même saut. Sans
     ça, "Temps de contact (drop jump)" n'avait aucun point d'entrée dans ce panneau (jamais un
     primaryMetric de RATIO_CARD, donc jamais de carte dédiée). */
  onAddPair?: (heightM: number, contactS: number, date: string) => Promise<void>;
  /** Sandbox/démo : données factices, aucun backend réel derrière — masque "+ Ajouter un résultat"
      plutôt que de risquer un appel réseau qui échouerait silencieusement. */
  readOnly?: boolean;
  /* Fusion "Tests recommandés" (2026-09, BATTERY_TEST_METRICS) : contexte "pourquoi ce test" pour le
     sport de profil (toujours, indépendant du filtre par qualité — voir testQualities.ts) — affiché
     qu'il y ait déjà un résultat ou non, pour ne plus dupliquer cette info dans une liste séparée. */
  batteryInfo?: BatteryTest;
  /* Suppression d'un point d'historique précis (2026-09) — absent (pas de bouton) quand readOnly. */
  onDeleteResult?: (row: TestResultRow) => Promise<void>;
  /* Clé canonique de la carte (2026-09) — pilote l'input alternatif "temps de vol" (dropJumpHeight)
     et le rappel "même saut" (dropJumpHeight/dropJumpContact), voir plus bas. */
  metric?: MetricKey;
  /* Classification élasticité/force (2026-09) — fournie uniquement pour la carte dropJumpHeight,
     dérivée du temps de contact déjà loggué (TestsPanel, dropJumpProfile()). */
  sscProfile?: { label: string; detail: string };
  /* Temps de contact par date (2026-09, dropJumpHeight uniquement) — le drop jump se lit toujours à
     2 valeurs (hauteur + contact), jamais une seule : l'historique/les chips Premier/Dernier doivent
     montrer les 2, pas seulement la hauteur. Indexé par date plutôt qu'un simple tableau parallèle,
     pour rester robuste si les 2 historiques divergent (ex. un point de hauteur ajouté seul avant ce
     chantier, sans contact correspondant à cette date précise). */
  secondaryByDate?: Map<string, number>;
  /* Ratio temps de vol/contact (2026-09, "style MyJump" — voir ftctRatio, testNorms.ts) — affiché
     comme un simple chiffre informatif, JAMAIS coloré/jaugé/inclus dans forces-faiblesses : aucun
     seuil publié trouvé pour cette formule (contrairement au RSI = hauteur/contact, sourcé). */
  ftctInfo?: number;
  /* Séries reps×poids (2026-09, suite, strength_reps) — sur les mouvements de force pure uniquement
     (FORCE_MOVEMENT_METRICS, jamais gaté sur `unit==="kg"` — bug réel trouvé par Gildas). Le champ
     "Nbr de reps" est fusionné DANS le formulaire principal "+ Ajouter un résultat" (pas un 2e
     formulaire séparé, demande explicite de Gildas) : reps vide/1 → écrit dans `test_results` comme
     avant (vrai 1RM, alimente les ratios) ; reps>1 → écrit UNIQUEMENT dans `strength_reps` (jamais les
     ratios). `repEntries` alimente l'affichage des séries déjà loguées + la comparaison croisée. */
  repEntries?: StrengthRepRow[];
  onAddRepEntry?: (reps: number, weight: number, date: string) => Promise<void>;
  onDeleteRepEntry?: (id: string) => Promise<void>;
  /* Ligne unifiée + expand (2026-09, suite) — la carte complète n'est montée QUE quand la ligne est
     dépliée (voir TestsPanel), donc `initialOpen` (lu une seule fois, au montage) suffit pour que le
     "+" rapide de la ligne repliée ouvre directement le formulaire d'ajout sans clic supplémentaire. */
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initialOpen);
  const [value, setValue] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [newUnit, setNewUnit] = useState<string>("kg");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  // Champ "reps" fusionné DANS le formulaire principal (2026-09, suite — plus de 2e formulaire séparé,
  // demande explicite de Gildas). Vide/1 = vrai 1RM (onAdd, alimente les ratios) ; >1 = série
  // sous-maximale (onAddRepEntry uniquement, jamais les ratios — voir strengthProfile.ts).
  const [repsCount, setRepsCount] = useState("");
  const [deletingRepId, setDeletingRepId] = useState<string | null>(null);
  const isDropJumpHeight = metric === "dropJumpHeight";
  const isVo2max = metric === "vo2max";
  const isVma = metric === "vma";
  // Cooper/Demi-Cooper (2026-09, demande de Gildas) : même principe que le toggle drop jump — un
  // mode de saisie alternatif (distance parcourue en m) qui convertit vers l'unité canonique déjà
  // stockée (vo2maxFromCooperDistance/vmaFromDemiCooperDistance, testNorms.ts) avant écriture, jamais
  // un nouveau MetricKey — un VO2max/une VMA obtenus via Cooper rejoignent le même historique/graphe
  // qu'une mesure directe.
  const [inputMode, setInputMode] = useState<"direct" | "flight" | "cooper" | "demiCooper">("direct");
  const flightPreview = isDropJumpHeight && inputMode === "flight" ? parseResultValue(value) : null;
  const cooperPreview = isVo2max && inputMode === "cooper" ? parseResultValue(value) : null;
  const demiCooperPreview = isVma && inputMode === "demiCooper" ? parseResultValue(value) : null;
  // Rappel doux (2026-09) : sur la carte fusionnée (onAddPair), les 2 valeurs sont de toute façon
  // écrites ensemble — le texte explique juste pourquoi 2 champs. Sur une éventuelle carte "Temps de
  // contact" isolée (cas résiduel, un exercice loggué en séance sous ce nom sans passer par ici),
  // reste un vrai rappel puisque rien ne force alors la cohérence.
  const sameJumpNote = onAddPair
    ? "💡 RSI = hauteur de saut ÷ temps de contact au sol : les 2 valeurs ci-dessous sont enregistrées ensemble, pour le même saut."
    : metric === "dropJumpContact"
    ? "💡 Utilise la même valeur de saut que ton dernier « Drop jump » loggé, pour que le RSI reste cohérent."
    : null;
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  const last = results[results.length - 1];
  const prev = results[results.length - 2];
  const trend = last && prev ? trendInfo(prev.value, last.value, last.unit) : null;
  async function handleSave() {
    const raw = parseResultValue(value);
    if (raw === null || !date) return;
    // Saisie en cm/ms (2026-09) — plus naturel pour un drop jump (apps type MyJump, plateformes de
    // contact) que des décimales de mètres/secondes. Le stockage canonique reste m/s (jamais changé,
    // c'est l'unité que suppose le calcul RSI et les seuils sourcés) : conversion faite ici, à la
    // frontière saisie → écriture, jamais ailleurs.
    // Cooper/Demi-Cooper (2026-09) — même frontière saisie→écriture que le drop jump ci-dessus :
    // `raw` est alors une distance en mètres, jamais écrite telle quelle, toujours convertie en
    // VO2max (ml/kg/min)/VMA (km/h) avant `onAdd`.
    const v = isDropJumpHeight
      ? (inputMode === "flight" ? Math.round(heightFromFlightTime(raw / 1000) * 1000) / 1000 : raw / 100)
      : isVo2max && inputMode === "cooper"
      ? Math.round(vo2maxFromCooperDistance(raw) * 10) / 10
      : isVma && inputMode === "demiCooper"
      ? Math.round(vmaFromDemiCooperDistance(raw) * 10) / 10
      : raw;
    setSaving(true);
    const reps = onAddRepEntry ? parseInt(repsCount, 10) : NaN;
    if (onAddRepEntry && Number.isFinite(reps) && reps > 1) {
      // Série sous-maximale (2026-09, suite) — jamais dans test_results/onAdd (n'alimente pas les
      // ratios), uniquement strength_reps via onAddRepEntry.
      await onAddRepEntry(reps, v, date);
    } else if (onAddPair) {
      const contactMs = parseResultValue(contactValue);
      if (contactMs === null) { setSaving(false); return; }
      await onAddPair(v, contactMs / 1000, date);
    } else if (onAddNew) {
      await onAddNew(v, newUnit, date);
    } else {
      await onAdd(v, date);
    }
    setSaving(false);
    setOpen(false);
    setValue("");
    setContactValue("");
    setInputMode("direct");
    setRepsCount("");
  }

  // Comparaisons (2026-09, suite) : la ligne de la liste unifiée (TestsPanel) affiche déjà, en
  // permanence, la comparaison résolue LA PLUS FAIBLE ("primary" — même sélection qu'ici) via sa
  // propre jauge + valeur + écart. La réafficher ici serait un pur doublon (même chiffre, même
  // jauge) — ce détail ne montre donc plus JAMAIS le "primary" : uniquement ce qui n'est visible
  // nulle part ailleurs (les hints "verrouillé" quand une référence manque encore, et les AUTRES
  // comparaisons résolues d'un exercice à plusieurs axes, ex. Clean & Jerk vs Back Squat ET vs
  // Snatch — la ligne n'en montre qu'un seul, le pire).
  const resolvedComparisons = (comparisons ?? []).filter(c => !c.locked);
  const lockedComparisons = (comparisons ?? []).filter(c => c.locked);
  const primaryComparison = resolvedComparisons.length ? resolvedComparisons.reduce((a, b) => (b.score! < a.score! ? b : a)) : null;
  const secondaryComparisons = resolvedComparisons.filter(c => c.id !== primaryComparison?.id);

  return (
    <div>
      {batteryInfo && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 2 }}>🎯 {batteryInfo.quality}</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.65)", lineHeight: 1.4 }}>{batteryInfo.desc}</div>
          </div>
          {batteryInfo.url && (
            <a href={batteryInfo.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#f04a08", textDecoration: "none", whiteSpace: "nowrap" }}>
              Calculateur →
            </a>
          )}
        </div>
      )}

      {/* Hints "verrouillé" (référence manquante ou jamais loggué — la seule info nouvelle, voir
          note plus haut) — compactés en une seule ligne quand TOUS pointent vers la MÊME cause,
          sinon chacun nomme individuellement ce qui manque encore (ComparisonBlock). 2 cas de
          condensation (2026-09, suite — généralisé au-delà de l'endurance sur demande de Gildas,
          "faudrait faire pareil pour les ratios en haltéro et sprints et tous les ratios qu'on a") :
          - `kind: "primary"` partout (l'exercice TESTÉ n'a lui-même jamais été loggué, ex. un
            10km jamais fait qui masque ses 3 comparaisons à 5km/Semi/Marathon) : "logguer CET
            exercice" débloque tout d'un coup.
          - `kind: "reference"` partout (l'exercice testé EST déjà loggué, mais plusieurs
            RÉFÉRENCES différentes manquent encore, ex. un Clean déjà loggué avec ses ratios vers
            Front Squat/Back Squat/Deadlift/Snatch/Jerk tous encore verrouillés) : le déblocage
            vient de logguer CES AUTRES exercices, pas celui-ci — wording distinct pour rester exact.
          Mélange des 2 kinds (ou `weight`) : pas condensé, chaque ComparisonBlock reste explicite
          plutôt que de fabriquer une phrase qui mélangerait 2 actions différentes. */}
      {lockedComparisons.length > 1 && lockedComparisons.every(c => c.locked?.kind === "primary") ? (
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", borderRadius: 10, padding: "9px 12px", lineHeight: 1.5, marginBottom: 10 }}>
          {lockedComparisons.length} repères disponibles une fois loggué (vs {lockedComparisons.map(c => c.compareLabel).join(", ")}).
        </div>
      ) : lockedComparisons.length > 1 && lockedComparisons.every(c => c.locked?.kind === "reference") ? (
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", background: "rgba(255,255,255,.05)", border: "1px dashed rgba(255,255,255,.15)", borderRadius: 10, padding: "9px 12px", lineHeight: 1.5, marginBottom: 10 }}>
          {lockedComparisons.length} repères disponibles en ajoutant un résultat pour : {lockedComparisons.map(c => c.locked!.refLabel).join(", ")}.
        </div>
      ) : (
        lockedComparisons.map((ins, i) => <ComparisonBlock key={ins.id} insight={ins} first={i === 0} />)
      )}

      {/* Autres comparaisons résolues d'un exercice multi-axes (2026-09) — jamais le "primary" déjà
          montré par la ligne, uniquement le reste. */}
      {secondaryComparisons.length > 0 && (
        <div style={{ marginTop: lockedComparisons.length ? 10 : 0, padding: "9px 11px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>Aussi comparé à</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {secondaryComparisons.map(ins => (
              <div key={ins.id} style={{ fontSize: 12, color: "rgba(255,255,255,.72)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[ins.status!].fill, flexShrink: 0 }} />
                {/* Parenthèse en unité réelle du test (2026-09, suite — retour de Gildas), jamais le
                    %/multiple interne de la comparaison : repli sur le % uniquement si aucun repère
                    théorique n'est convertible (classification graduée sans cible unique). */}
                <span><b style={{ color: "#fff" }}>{ins.compareLabel}</b> : {STATUS_LABEL[ins.status!]} ({targetRealUnitDisplay(ins) ?? ins.fmt(ins.value!)})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profil élasticité/force (2026-09, drop jump) — le RSI lui-même (valeur+repère) n'est plus
          répété ici : c'est le "primary" de cette carte, déjà sur la ligne. Seuls le label/detail
          (classification) et le ratio temps de vol/contact (jamais scoré) sont une info nouvelle. */}
      {sscProfile && (
        <div style={{ marginTop: 10, padding: "9px 11px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
          {ftctInfo != null && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>
              Ratio temps de vol/contact (style MyJump) : {ftctInfo.toFixed(2)} · non normé, indicatif (pas de seuil scientifique publié pour cette variante).
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginBottom: 2 }}>{sscProfile.label}</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.65)", lineHeight: 1.45 }}>{sscProfile.detail}</div>
        </div>
      )}

      {results.length >= 2 ? (
        <div style={{ marginTop: 10 }}>
          <TestEvolutionChart points={results.map(r => ({ date: r.date, value: r.value }))} height={70} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "5px 9px", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>
              Premier : <b style={{ color: "#fff" }}>{formatRawValue(metric, results[0].value, results[0].unit, results[0].date, secondaryByDate)}</b>
            </span>
            <span style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "5px 9px", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>
              Dernier : <b style={{ color: "#fff" }}>{formatRawValue(metric, last!.value, last!.unit, last!.date, secondaryByDate)}</b>
            </span>
          </div>
        </div>
      ) : results.length === 1 ? null : (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: results.length || comparisons || sscProfile || batteryInfo ? 10 : 0 }}>Aucun résultat encore.</div>
      )}

      {/* Historique affiché par défaut (2026-09, suite — retour de Gildas) : plus de 2e niveau de
          repli, la carte entière n'étant déjà montée qu'au dépli de la ligne (voir TestsPanel), un
          toggle supplémentaire ici était redondant. */}
      {results.length > 0 && (
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.5)", margin: "12px 0 6px" }}>
          Historique complet ({results.length})
        </div>
      )}
      {results.length > 0 && (
        <div>
          {[...results].reverse().map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,.5)", width: 90, flexShrink: 0 }}>{formatLong(r.date)}</span>
              <span style={{ fontWeight: 800, flex: 1, color: "#fff" }}>{formatRawValue(metric, r.value, r.unit, r.date, secondaryByDate)}</span>
              {r.video_url && <span style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(212,64,0,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>🎥</span>}
              {!readOnly && onDeleteResult && (
                <button
                  disabled={deletingRowId === r.id}
                  onClick={async () => { setDeletingRowId(r.id); await onDeleteResult(r); }}
                  style={{ flexShrink: 0, background: "none", border: "none", color: "#ff6b6b", fontSize: 13, cursor: "pointer", padding: "0 2px", opacity: deletingRowId === r.id ? 0.5 : 1 }}
                >
                  {deletingRowId === r.id ? "…" : "🗑"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: "#f04a08", fontWeight: 800, fontSize: 11.5, cursor: "pointer", padding: "10px 0 0" }}>
        + Ajouter un résultat
      </button>
      )}
      {!readOnly && open && (
        <div style={{ marginTop: 9, paddingTop: 10, borderTop: "1px dashed rgba(255,255,255,.12)" }}>
          {sameJumpNote && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", lineHeight: 1.4, marginBottom: 9 }}>{sameJumpNote}</div>
          )}
          {isDropJumpHeight && (
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {(["direct", "flight"] as const).map(m => (
                <button
                  key={m} type="button" onClick={() => setInputMode(m)}
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                    border: inputMode === m ? "1px solid #fff" : "1px solid rgba(255,255,255,.15)",
                    background: inputMode === m ? "#fff" : "transparent", color: inputMode === m ? "#171b1f" : "#fff",
                  }}
                >
                  {m === "direct" ? "Hauteur (cm)" : "Temps de vol (ms)"}
                </button>
              ))}
            </div>
          )}
          {/* Cooper (VO2max)/Demi-Cooper (VMA) — 2026-09, demande de Gildas : mêmes formules sourcées
              que testNorms.ts (Cooper 1968 ; Demi-Cooper, 5 sources françaises indépendantes). */}
          {isVo2max && (
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {(["direct", "cooper"] as const).map(m => (
                <button
                  key={m} type="button" onClick={() => setInputMode(m)}
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                    border: inputMode === m ? "1px solid #fff" : "1px solid rgba(255,255,255,.15)",
                    background: inputMode === m ? "#fff" : "transparent", color: inputMode === m ? "#171b1f" : "#fff",
                  }}
                >
                  {m === "direct" ? "VO2max direct" : "Test Cooper (12 min)"}
                </button>
              ))}
            </div>
          )}
          {isVma && (
            <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
              {(["direct", "demiCooper"] as const).map(m => (
                <button
                  key={m} type="button" onClick={() => setInputMode(m)}
                  style={{
                    fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                    border: inputMode === m ? "1px solid #fff" : "1px solid rgba(255,255,255,.15)",
                    background: inputMode === m ? "#fff" : "transparent", color: inputMode === m ? "#171b1f" : "#fff",
                  }}
                >
                  {m === "direct" ? "VMA directe" : "Demi-Cooper (6 min)"}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 90 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>
                {isDropJumpHeight && inputMode === "flight" ? "Temps de vol (ms)"
                  : (isVo2max && inputMode === "cooper") || (isVma && inputMode === "demiCooper") ? "Distance parcourue (m)"
                  : onAddPair ? "Hauteur (cm)" : onAddNew ? "Résultat" : `Résultat (${unit})`}
              </div>
              <input
                type="number"
                step={isDropJumpHeight ? (inputMode === "flight" ? "1" : "0.1") : (isVo2max && inputMode === "cooper") || (isVma && inputMode === "demiCooper") ? "1" : "0.01"}
                value={value} onChange={e => setValue(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14 }}
              />
              {flightPreview != null && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 4 }}>≈ {formatDropJumpHeightCm(heightFromFlightTime(flightPreview / 1000))}</div>
              )}
              {cooperPreview != null && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 4 }}>≈ {vo2maxFromCooperDistance(cooperPreview).toFixed(1)} ml/kg/min</div>
              )}
              {demiCooperPreview != null && (
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 4 }}>≈ {vmaFromDemiCooperDistance(demiCooperPreview).toFixed(1)} km/h</div>
              )}
            </div>
            {onAddNew && (
              <div style={{ flexShrink: 0, minWidth: 80 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>Unité</div>
                <select value={newUnit} onChange={e => setNewUnit(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14, height: 36 }}>
                  {TEST_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            )}
            {onAddPair && (
              <div style={{ flex: 1, minWidth: 90 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>Temps de contact (ms)</div>
                <input type="number" step="1" value={contactValue} onChange={e => setContactValue(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14 }} />
              </div>
            )}
            {onAddRepEntry && (
              <div style={{ flexShrink: 0, minWidth: 70 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>Nbr de reps</div>
                <input type="number" step="1" min="1" placeholder="1" value={repsCount} onChange={e => setRepsCount(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14 }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.55)", marginBottom: 4 }}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 13 }} />
            </div>
            <button
              onClick={handleSave} disabled={saving || !value.trim() || (!!onAddPair && !contactValue.trim())}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: (!value.trim() || (!!onAddPair && !contactValue.trim())) ? 0.6 : 1 }}
            >
              {saving ? "..." : "Enregistrer"}
            </button>
          </div>
          {onAddRepEntry && (
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)", marginTop: 6, lineHeight: 1.4 }}>
              Laisse "Nbr de reps" vide (ou 1) pour un vrai 1RM (utilisé pour tes ratios) ; renseigne-le pour une série sous-maximale (ex. 5RM) — jamais utilisée pour tes ratios, juste informative.
            </div>
          )}
        </div>
      )}

      {repEntries !== undefined && (() => {
        const sets = [...repEntries.map(r => ({ reps: r.reps, weight: r.weight })), ...(metric != null && last ? [{ reps: 1, weight: last.value }] : [])];
        const cmp = bestStrengthEnduranceComparison(sets);
        // Les 2 directions ("force absolue" ou "endurance de force") signalent toujours un axe de
        // travail relatif (jamais un "point fort" en soi) — un déséquilibre pointe systématiquement
        // vers LA qualité la plus faible des deux, peu importe le sens.
        const col = cmp?.focus ? COMPARISON_LABEL_COLOR["axe de travail"] : null;
        if (!repEntries.length && !cmp) return null;
        return (
          <div style={{ marginTop: 10, padding: "9px 11px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>💪 Séries à charge sous-maximale</div>
            {repEntries.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: cmp?.focus ? 8 : 0 }}>
                {repEntries.map(r => {
                  const est = estimateOneRepMax({ reps: r.reps, weight: r.weight });
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(255,255,255,.7)" }}>
                      <span>{r.reps} reps @ {r.weight}kg ({formatLong(r.date)}) <span style={{ color: "rgba(255,255,255,.45)" }}>· e1RM {est.value.toFixed(1)}kg</span></span>
                      {!readOnly && onDeleteRepEntry && (
                        <button
                          disabled={deletingRepId === r.id}
                          onClick={async () => { setDeletingRepId(r.id); await onDeleteRepEntry(r.id); setDeletingRepId(null); }}
                          style={{ flexShrink: 0, background: "none", border: "none", color: "#ff6b6b", fontSize: 12, cursor: "pointer", padding: "0 2px", opacity: deletingRepId === r.id ? 0.5 : 1 }}
                        >
                          {deletingRepId === r.id ? "…" : "🗑"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {cmp && cmp.focus && col && (
              <div style={{ fontSize: 11.5, color: "#fff", padding: "8px 10px", background: "rgba(255,255,255,.06)", border: `1px solid ${col.text}55`, borderRadius: 8 }}>
                Ton {cmp.highRepSet.reps}RM ({cmp.highRepSet.weight}kg) est théoriquement {cmp.focus === "force absolue" ? "meilleur" : "moins bon"} que ton {cmp.lowRepSet.reps}RM ({cmp.lowRepSet.weight}kg) ne le laisserait attendre. Travaille ta <b>{cmp.focus}</b>.
                {!cmp.reliable && " (hors zone fiable du modèle Epley, 2-10 reps)"}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* Panneau "tests de performance" — inspiré du POC UX construit avec Gildas
   (profil-athlete-poc-v2.html). Une seule liste de cartes, toutes toujours visibles (jamais de
   sélection préalable requise) : celles dont l'exercice matche une norme connue pour le sport
   affichent une comparaison à la littérature (badge + jauge), les autres restent des cartes
   "brutes" (résultat + évolution + historique, sans jugement forces/faiblesses — pas possible sans
   norme). Au-dessus, un verdict + des recommandations en 2 colonnes (points faibles/points forts)
   quand le sport est couvert (testNorms.ts).
   Fusionné DANS LES DEUX SENS ("un sportif qui édite doit être visible par un coach et
   inversement") :
   - /conseils (subject = le sportif lui-même) : `mergeCoach` fusionne ce que SON coach a enregistré
     pour lui (owner_id=coach, lu via /api/athlete/coach-tests — RLS bloque toute lecture directe
     cross-owner, y compris en lecture seule).
   - /coach/athletes (subject = un coach_athlete précis) : `linkedUserId` (le vrai user_id lié, pas
     un démo) fusionne ce que CE sportif a enregistré lui-même (owner_id=sportif, lu via
     /api/coach/athlete-tests).
   Les deux routes admin vérifient l'appartenance avant de lire quoi que ce soit. */
/* Liste unifiée "Mouvement / Écart" (2026-09, remplace à la fois la grille de cartes toujours
   dépliées ET le bilan texte séparé) — demande explicite de Gildas : une seule vue compacte
   (emoji + jauge + écart, façon "chart des comportements"), et chaque ligne se déplie vers la carte
   complète (comparaisons détaillées, courbe d'évolution, historique, formulaire d'ajout, fusion/
   suppression — CRUD complet, TestCard inchangée). `cardProps` porte donc EXACTEMENT les mêmes props
   qu'avant pour chacune des 4 sources (interprétée/résolue sans jauge/recommandée/brute), pour ne
   rien perdre en dépliant. */
type TestCardProps = ComponentProps<typeof TestCard>;
interface UnifiedRow {
  key: string;
  emoji: string;
  name: string;
  /** Dernière date loggée (formatée), `null` si jamais loggué. */
  date: string | null;
  /** 0-100 si une comparaison à une norme existe déjà (score de `primaryComparison`), sinon `null` —
      utilisé uniquement pour le tri (le pire en premier). */
  score: number | null;
  /** La comparaison résolue la plus faible (même convention que la sélection "primary" déjà utilisée
      par TestCard quand plusieurs comparaisons existent) — objet CardInsight complet, pour rendre la
      jauge pleine largeur (valeur/% + "vs {compareLabel}" + badge + jauge + repère, voir PrimaryGauge)
      exactement comme avant ce chantier, plutôt que de la réduire à un résumé qui perdait le "vs X".
      `null` si aucune comparaison n'est encore résolue (jamais loggué, ou référence manquante). */
  primaryComparison: CardInsight | null;
  /** Valeur brute réelle (unité du test) — utilisée UNIQUEMENT en repli quand `primaryComparison` est
      `null` (aucune norme sourcée pour ce test, ou référence manquante) : jamais à la place du %/
      multiple de `primaryComparison`, qui reste la bonne info quand elle existe. */
  rawValueLabel: string | null;
  /** Écart réel-vs-repère, TOUJOURS en unité réelle du test (2026-09, suite — jamais le %/multiple
      interne de `primaryComparison.value`/`.fmt`, bug réel signalé par Gildas) — affiché EN PLUS du %
      dans PrimaryGauge, pas à sa place (les 2 informations sont complémentaires : le % situe par
      rapport à la référence, l'écart réel dit concrètement de combien). `null` si non convertible en
      unité réelle (repère théorique sans donnée de référence chiffrée) ou si `primaryComparison` est
      `null`. */
  deltaRealUnit: string | null;
  /** Comparaison réel-vs-attendu du profil de vitesse (sprintProfile.ts) — UNIQUEMENT pour
      sprint60m/100m/200m, qui n'ont pas de CardInsight/RATIO_CARD sourcée (voir `primaryComparison`)
      mais peuvent quand même avoir un vrai repère via le fit mono-exponentiel ou le repli fechain
      60↔100m. Prioritaire sur `primaryComparison`/`rawValueLabel` au rendu quand présent — bug réel
      trouvé par Gildas ("j'ai Sprint 100m et Sprint 60m pour autant j'ai pas de jauge") : ces
      distances étaient résolues dynamiquement dans `sprintAxisComparisons` (utilisé par la liste
      "Recommandations") mais jamais reliées à la ligne du test elle-même, qui retombait toujours sur
      "pas de repère". `null` si aucune comparaison n'existe pour cette distance précise (fit
      impossible, et le repli fechain ne couvre que 60m/100m). */
  sprintComparison?: SprintAxisComparison;
  cardProps: TestCardProps;
  unlinked?: boolean;
  mergeSuggestions?: { label: string; toName: string }[];
  onMerge?: (toName: string) => Promise<void>;
  onDeleteWhole?: () => Promise<void>;
}
/* Une ligne à partir d'un groupe d'insights déjà interprétés (n'importe quel statut, y compris
   entièrement verrouillé — jamais loggué ou référence manquante). Représentant = la comparaison
   résolue la plus faible (même convention que la sélection "primary" déjà utilisée par TestCard
   quand plusieurs comparaisons existent) — un choix cohérent unique, plus de distinction
   faible/fort à ce stade puisque la liste couvre désormais tous les statuts. */
function unifiedRowFromInsightGroup(group: { metric: MetricKey; label: string; comparisons: CardInsight[] }, emoji: string, cardProps: TestCardProps): UnifiedRow {
  const resolved = group.comparisons.filter(c => !c.locked);
  const rep = resolved.length ? resolved.reduce((a, b) => (b.score! < a.score! ? b : a)) : null;
  const last = cardProps.results[cardProps.results.length - 1];
  const rawValueLabel = last ? formatRawValue(group.metric, last.value, last.unit, last.date, cardProps.secondaryByDate) : null;
  const date = last ? formatLong(last.date) : null;
  // Écart en unité réelle (2026-09, suite) : `rep.value`/`rep.fmt` restent utilisés tels quels pour le
  // %/multiple affiché par PrimaryGauge (c'est la bonne info à cet endroit) — uniquement CET écart
  // complémentaire est reconverti en unité réelle, via `rep.refValueDisplay` (déjà formaté ainsi, voir
  // formatAbsoluteRef, testNorms.ts, ex. "128 kg") pour les cartes ratio/poids de corps, ou
  // `rep.refValue` directement pour les cartes "absolute" (déjà en unité réelle).
  let deltaRealUnit: string | null = null;
  if (rep && last) {
    const targetRaw = targetRealUnitNumeric(rep);
    if (targetRaw != null) {
      const deltaRaw = last.value - targetRaw;
      // Arrondi (2026-09, suite — bug réel signalé par Gildas, "chiffres pas arrondis des fois") :
      // la soustraction peut faire ressortir du bruit flottant hérité de formatAbsoluteRef
      // (Math.round(x*10)/10 ne retombe pas toujours sur une décimale exacte en binaire IEEE754,
      // ex. 12.700000000000001) — ré-arrondi à 1 décimale, même précision que formatAbsoluteRef.
      const deltaRounded = Math.round(Math.abs(deltaRaw) * 10) / 10;
      const deltaDisplay = formatRawValue(group.metric, deltaRounded, last.unit);
      deltaRealUnit = `${deltaRaw >= 0 ? "+" : "−"}${deltaDisplay}`;
    }
  }
  return {
    key: `insight-${group.metric}`, emoji, name: group.label, date,
    score: rep?.score ?? null, primaryComparison: rep, rawValueLabel, deltaRealUnit, cardProps,
  };
}
/** Ligne pour les 3 sources sans CardInsight (métrique résolue sans norme, test recommandé jamais
    loggué/non résolu, test brut non relié) — jamais de comparaison possible, uniquement la valeur
    brute réelle en repli. */
function unifiedRowFromRaw(key: string, name: string, emoji: string, metric: MetricKey | undefined, results: TestResultRow[], cardProps: TestCardProps): UnifiedRow {
  const last = results[results.length - 1];
  return {
    key, emoji, name, date: last ? formatLong(last.date) : null,
    score: null, primaryComparison: null,
    rawValueLabel: last ? formatRawValue(metric, last.value, last.unit) : null,
    deltaRealUnit: null,
    cardProps,
  };
}

export default function TestsPanel({ ownerId, subject, linkedUserId, mergeCoach, emptyHint, sport, sexe, poidsKg, onEditProfile, fixture }: {
  ownerId: string;
  subject: TestSubject;
  linkedUserId?: string | null;
  mergeCoach?: boolean;
  emptyHint?: string;
  /* Sport principal du profil (texte libre) — bucketé via guessSportChip() en famille de sport
     (mêmes familles que le reste de l'app : icônes, filtres bibliothèque) pour choisir les
     comparaisons à afficher (RATIO_CARDS/BW_CARDS, testNorms.ts). Optionnels : sans eux, chaque
     carte reste "brute" (aucune interprétation), comme avant ce chantier. */
  sport?: string | null;
  sexe?: Sexe;
  poidsKg?: number | null;
  /* Contexte visible + raccourci d'édition — fourni uniquement depuis /conseils (le sportif consulte
     SES PROPRES tests) ; absent côté /coach/athletes (l'édition du profil d'un sportif n'est pas
     l'affaire du coach), qui bénéficie quand même silencieusement des mêmes repères si sport/sexe/
     poids sont déjà connus côté profil du sportif. */
  onEditProfile?: () => void;
  /* Sandbox/démo (2026-09) : données factices déjà en mémoire, jamais de backend Supabase réel
     derrière `ownerId`/`subject` pour un visiteur non authentifié. Fournie = saute intégralement le
     fetch réseau (qui échouerait ou retournerait vide silencieusement) et passe le panneau en lecture
     seule (pas de "+ Ajouter", rien à persister). Absente = comportement inchangé (fetch réel). */
  fixture?: { merged: MergedTest[]; results: TestResultRow[] };
}) {
  const isCoachView = "subjectCoachAthleteId" in subject;
  const [merged, setMerged] = useState<MergedTest[] | null>(fixture ? fixture.merged : null);
  const [ownResults, setOwnResults] = useState<TestResultRow[]>(fixture ? fixture.results : []);
  const [otherResults, setOtherResults] = useState<TestResultRow[]>([]);
  // Filtre par qualité physique (2026-09, suite — le seul filtre restant sur les tests recommandés
  // depuis le retrait complet du filtrage par sport de profil, voir `recommendedTestsForView`) : ne
  // change jamais `activeFamily` (dérivé du sport de profil, sert UNIQUEMENT au scoring des cartes
  // déjà interprétées via RATIO_CARDS — testQualities.ts pour le détail de cette séparation). `null` =
  // aucun filtre, tous les tests recommandés de l'app s'affichent. Cliquer le chip déjà actif redonne
  // la main à "tout afficher".
  const [activeQuality, setActiveQuality] = useState<Quality | null>(null);
  // Ligne dépliée (accordion, 2026-09, suite) — une seule à la fois, `key` = UnifiedRow.key. La carte
  // complète (TestCard) n'est montée QUE quand sa ligne est ouverte : `autoAddKey` mémorise que
  // l'ouverture vient du "+" rapide (pas d'un clic sur la ligne elle-même), pour que TestCard monte
  // avec son formulaire déjà ouvert (`initialOpen`, lu une seule fois au montage).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [autoAddKey, setAutoAddKey] = useState<string | null>(null);
  // Nouveau test entièrement libre (2026-09, suite — retour de Gildas, "ajoute la possibilité
  // d'ajouter un test depuis la page des tests de performance") : un simple toggle, pas un accordion
  // de plus (le formulaire n'est associé à aucune ligne existante).
  const [addingCustomTest, setAddingCustomTest] = useState(false);

  // Fetch pur (aucun setState ici) — réutilisé à la fois par l'effet de montage (qui applique le
  // résultat seulement si toujours d'actualité, via `cancelled` local ci-dessous) et par l'ajout
  // inline (qui l'applique directement, une vraie action utilisateur n'a pas le même risque de race
  // que l'effet de montage). Jamais de flag "monté" partagé entre les deux appels — un tel flag ne
  // se réinitialiserait pas correctement à chaque nouvelle exécution de l'effet (bug réel rencontré :
  // restait bloqué à `false` après le double-mount de React en dev, "Chargement…" ne se résolvait
  // jamais).
  async function fetchAll() {
    const coachAthleteId = isCoachView && "subjectCoachAthleteId" in subject ? subject.subjectCoachAthleteId : null;
    const otherFetch = isCoachView && linkedUserId && coachAthleteId
      ? fetchAthleteOwnTests(coachAthleteId)
      : !isCoachView && mergeCoach
        ? fetchCoachTestsForAthlete()
        : Promise.resolve({ tests: [], results: [] });

    const [ownTests, ownRes, other] = await Promise.all([listTests(ownerId), listOwnResults(subject), otherFetch]);
    // Ordre fixe (coachTests, athleteTests) quel que soit le sens : côté coach, "own"=coach,
    // "other"=sportif ; côté sportif, "own"=sportif, "other"=coach — voir doc de mergeTests.
    const m = isCoachView ? mergeTests(ownTests, other.tests) : mergeTests(other.tests, ownTests);
    return { ownRes, otherRes: other.results, merged: m };
  }

  useEffect(() => {
    if (fixture) return; // sandbox/démo : données déjà seedées au montage, jamais de fetch réseau
    let cancelled = false;
    fetchAll().then(({ ownRes, otherRes, merged: m }) => {
      if (cancelled) return;
      setOwnResults(ownRes);
      setOtherResults(otherRes);
      setMerged(m);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, linkedUserId, mergeCoach, isCoachView, JSON.stringify(subject)]);

  // Séries reps×poids (2026-09, strength_reps) — fetch séparé de fetchAll ci-dessus (portée réduite,
  // pas de fusion croisée coach/sportif pour l'instant, voir listOwnStrengthReps). Rechargé après
  // chaque écriture via refetchStrengthReps, même principe que fetchAll pour le reste.
  const [strengthReps, setStrengthReps] = useState<StrengthRepRow[]>([]);
  async function refetchStrengthReps() {
    if (fixture) return;
    setStrengthReps(await listOwnStrengthReps(subject));
  }
  useEffect(() => {
    if (fixture) return;
    let cancelled = false;
    listOwnStrengthReps(subject).then(rows => { if (!cancelled) setStrengthReps(rows); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isCoachView, JSON.stringify(subject)]);

  // Regroupe les résultats par test fusionné (2 fetch uniques, jamais un par test).
  const resultsByKey = useMemo(() => {
    const byTestId = new Map<string, TestResultRow[]>();
    for (const r of [...ownResults, ...otherResults]) {
      if (!byTestId.has(r.test_id)) byTestId.set(r.test_id, []);
      byTestId.get(r.test_id)!.push(r);
    }
    const out = new Map<string, TestResultRow[]>();
    for (const t of merged ?? []) {
      const rows = [
        ...(t.coachTestId ? byTestId.get(t.coachTestId) ?? [] : []),
        ...(t.athleteTestId ? byTestId.get(t.athleteTestId) ?? [] : []),
      ].sort((a, b) => a.date.localeCompare(b.date));
      out.set(t.name_key, rows);
    }
    return out;
  }, [merged, ownResults, otherResults]);

  // Résultats combinés par clé canonique (testNorms.ts) — fusionne plusieurs tests alias du même
  // exercice (ex. "Squat" et "Back squat" créés séparément) en une seule timeline dédupliquée par
  // date, pour que l'évolution/l'historique affiché dans une carte "Tests & repères" ne perde jamais
  // silencieusement l'historique logué sous un alias différent.
  const combinedByMetric = useMemo(() => {
    const map: Partial<Record<MetricKey, TestResultRow[]>> = {};
    for (const t of merged ?? []) {
      const key = canonicalMetricKey(t.name_key);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key]!.push(...(resultsByKey.get(t.name_key) ?? []));
    }
    for (const key of Object.keys(map) as MetricKey[]) {
      const byDate = new Map<string, TestResultRow>();
      for (const r of map[key]!) byDate.set(r.date, r);
      map[key] = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [merged, resultsByKey]);

  const latestByMetric = useMemo(() => {
    const map: Partial<Record<MetricKey, number>> = {};
    for (const key of Object.keys(combinedByMetric) as MetricKey[]) {
      const rows = combinedByMetric[key];
      if (rows && rows.length) map[key] = rows[rows.length - 1].value;
    }
    return map;
  }, [combinedByMetric]);

  // Profil de vitesse (2026-09, sprintProfile.ts, modèle mono-exponentiel généralisé) — utilise la
  // DERNIÈRE valeur de chaque distance (latestByMetric), pas une exigence de même date entre
  // distances : demandé explicitement par Gildas ("je préfère rester flexible et pas forcer une date
  // le même jour") plutôt que la 1re version (qui n'utilisait qu'un jour où ≥2 distances avaient été
  // loguées ensemble). Même convention que TOUTES les autres RATIO_CARDS de l'app (elles comparent
  // déjà "dernière valeur de chaque métrique", sans jamais exiger la même date — ex. Deadlift vs Back
  // Squat logués à des mois d'écart). Limite assumée, propre à ce calcul précis (contrairement à un
  // simple ratio) : le fit cinématique et la comparaison réel-vs-attendu supposent un seul effort
  // maximal cohérent — mélanger un 30m d'il y a 3 mois à un 100m d'hier peut donc produire un profil
  // moins représentatif de ta forme actuelle qu'un vrai sprint chronométré d'un bout à l'autre. Aucune
  // donnée inventée pour autant : uniquement de vraies valeurs déjà loguées, juste potentiellement à
  // des dates différentes.
  // Généralisé à TOUTES les distances standing (10/20/30/60/100/200m) + fly10/20/30m (2026-09, suite)
  // — remplace l'ancienne logique figée à 3 axes (uniquement calculable si 100m ET 60m/30m étaient
  // loggués) par `fitSprintModel`/`classifySprintProfile` (n'importe quelle paire de 2 distances
  // loguées comme source du fit, toutes les autres distances/segments loggués comparées à ce que le
  // fit prédit) — la mécanique brute F0/V0/Pmax/Sfv reste retirée de l'affichage (jugée incompréhensible
  // pour la plupart, Gildas), seul le résultat réel-vs-attendu par distance/segment est montré, avec
  // un vrai verdict (point fort/axe de travail) dans Recommandations, pas une carte à part.
  const sprintAxisComparisons = useMemo(() => {
    const splits: Partial<Record<SprintDistance, number>> = {};
    if (latestByMetric.sprint10m != null) splits[10] = latestByMetric.sprint10m;
    if (latestByMetric.sprint20m != null) splits[20] = latestByMetric.sprint20m;
    if (latestByMetric.sprint30m != null) splits[30] = latestByMetric.sprint30m;
    if (latestByMetric.sprint60m != null) splits[60] = latestByMetric.sprint60m;
    if (latestByMetric.sprint100m != null) splits[100] = latestByMetric.sprint100m;
    if (latestByMetric.sprint200m != null) splits[200] = latestByMetric.sprint200m;
    const flySplits: Partial<Record<FlyKey, number>> = {};
    if (latestByMetric.fly10m != null) flySplits.fly10m = latestByMetric.fly10m;
    if (latestByMetric.fly20m != null) flySplits.fly20m = latestByMetric.fly20m;
    if (latestByMetric.fly30m != null) flySplits.fly30m = latestByMetric.fly30m;
    return classifySprintProfile(splits, flySplits);
  }, [latestByMetric]);

  // Séries reps×poids groupées par MetricKey (2026-09, suite) — plus par nom libre : chaque carte de
  // mouvement (TestCard) affiche directement les siennes via son propre `metric`, jamais un nom retapé
  // à la main (source de l'ancien risque de faute de frappe cassant le lien).
  const repsByMetric = useMemo(() => {
    const out: Partial<Record<MetricKey, StrengthRepRow[]>> = {};
    for (const t of merged ?? []) {
      const key = canonicalMetricKey(t.name_key);
      if (!key) continue;
      const rows = strengthReps.filter(r => r.test_id === t.coachTestId || r.test_id === t.athleteTestId);
      if (!rows.length) continue;
      out[key] = [...(out[key] ?? []), ...rows].sort((a, b) => a.date.localeCompare(b.date));
    }
    return out;
  }, [merged, strengthReps]);

  async function handleAddStrengthRep(name: string, reps: number, weight: number, date: string) {
    await upsertStrengthRep(ownerId, subject, { name, unit: "kg", reps, weight, date });
    await refetchStrengthReps();
  }
  async function handleDeleteStrengthRep(id: string) {
    await deleteStrengthRep(id);
    await refetchStrengthReps();
  }

  if (merged === null) {
    return <div style={{ fontSize: 13, color: "#8a8f94", padding: "8px 2px" }}>Chargement…</div>;
  }

  const sportFamily = sport ? guessSportChip(sport) : null;
  // Famille de normes (2026-09) : dérivée UNIQUEMENT du sport de profil, indépendante du filtre par
  // qualité ci-dessous (qui ne pilote que l'affichage, jamais quelle famille RATIO_CARDS/BW_CARDS est
  // interprétée — voir testQualities.ts). Concerne UNIQUEMENT le scoring des cartes déjà interprétées
  // (RATIO_CARDS) — pas la liste des tests recommandés (voir `recommendedTestsForView` plus bas,
  // retirée de toute notion de sport de profil, 2026-09, suite — retour de Gildas répété : "je veux
  // plus filtrer les tests par sport du profil... tous les tests de l'app pour tous les users,
  // filtrables par qualité physique").
  const activeFamily = sportFamily;
  const allInsights = computeAllInsights(activeFamily, sexe ?? null, poidsKg ?? null, latestByMetric);
  // Un test DÉJÀ LOGUÉ garde sa carte enrichie quel que soit le sport de profil (2026-09) — ex. un
  // Drop Jump loggué (repère RSI, "Athlétisme & vitesse") reste enrichi même si le profil est
  // "Haltérophilie". `cardInsights` (famille active + déjà loggé ailleurs) reste le comportement PAR
  // DÉFAUT (aucune qualité sélectionnée) — inchangé depuis avant ce chantier.
  const crossFamilyInsights = computeCrossFamilyInsights(activeFamily, sexe ?? null, poidsKg ?? null, latestByMetric);
  const cardInsights = [...allInsights, ...crossFamilyInsights];
  // Vue "toutes familles, verrouillées comprises" (2026-09, bug réel trouvé par Gildas) — activée
  // UNIQUEMENT quand une qualité est sélectionnée : sans elle, filtrer "Endurance" avec un profil
  // "Football" perdait les cartes 5km/10km jamais loguées (elles n'existent dans aucune des 2 sources
  // ci-dessus, qui exigent soit la famille active soit un résultat déjà présent) — régression par
  // rapport à l'ancien chip "par sport", qui pouvait basculer `activeFamily` entièrement. Jamais
  // utilisée par défaut (sans qualité active) : afficherait sinon les cartes verrouillées de tous les
  // sports en permanence.
  const filteredCardInsights = activeQuality
    ? computeAllFamiliesInsights(sexe ?? null, poidsKg ?? null, latestByMetric).filter(i => METRIC_QUALITY[i.primaryMetric].includes(activeQuality))
    : cardInsights;
  const coveredMetrics = new Set(filteredCardInsights.map(i => i.primaryMetric));
  // Le filtre qualité s'applique aussi aux Recommandations (verdict/points faibles-forts) — cohérent
  // avec le reste de la page, ET corrige un 2e bug réel trouvé par Gildas : un Drop Jump ou un Sprint
  // logué (carte visible avec jauge) mais hors de la famille de profil n'était JAMAIS repris dans
  // "Recommandations d'entraînement" (`allInsights` = famille de profil seule, sans crossFamily).
  // `filteredCardInsights` inclut déjà tout ça une fois une qualité active ; sans qualité, retombe sur
  // `allInsights` (comportement historique, famille de profil uniquement).
  const qualityFilteredInsights = activeQuality ? filteredCardInsights : allInsights;
  const verdict = buildVerdict(qualityFilteredInsights);
  const { weak, strong } = splitByStrength(qualityFilteredInsights);
  // Profil de vitesse et endurance de force dans Recommandations, pas des cartes à part (2026-09,
  // suite) — ce sont de vrais verdicts (point fort/axe de travail), au même titre que les CardInsight
  // ci-dessus, juste construits sur un mécanisme réel-vs-attendu plutôt qu'une norme de population.
  // Rendues séparément de RecoColumn (couplé aux CardInsight — score/fmt/norms), pas une fausse
  // CardInsight avec des champs inventés.
  // Jauge, pas du texte brut (2026-09, suite — retour de Gildas) : plus de mapping vers
  // {label,detail}, on garde les SprintAxisComparison bruts (axis/actual/predicted/deltaPct/label)
  // pour SprintAxisGauge, qui réutilise le même langage visuel que PrimaryGauge (centre = attendu,
  // la barre part du centre vers le temps réel). "Conforme à l'attendu" reste filtré (rien
  // d'actionnable à montrer), "axe de travail" d'abord, "point fort" ensuite.
  const sprintAxisRows = (!activeQuality || activeQuality === "vitesse")
    ? sprintAxisComparisons
        .filter(c => c.label !== "conforme à l'attendu")
        .sort((a, b) => (a.label === "axe de travail" ? 0 : 1) - (b.label === "axe de travail" ? 0 : 1))
    : [];
  // Toujours "axe de travail" (jamais "point fort" en soi) — un déséquilibre reps pointe vers LA
  // qualité la plus faible des deux, pas vers une force à mettre en avant (voir strengthProfile.ts).
  const forceExtraWeak = (!activeQuality || activeQuality === "force")
    ? Object.entries(repsByMetric).map(([metricKey, rows]) => {
        const metricTyped = metricKey as MetricKey;
        const trueMax = latestByMetric[metricTyped];
        const sets = [...rows.map(r => ({ reps: r.reps, weight: r.weight })), ...(trueMax != null ? [{ reps: 1, weight: trueMax }] : [])];
        const cmp = bestStrengthEnduranceComparison(sets);
        if (!cmp?.focus) return null;
        return {
          label: METRIC_DISPLAY[metricTyped].name, emoji: movementEmoji(metricTyped),
          detail: `Ton ${cmp.highRepSet.reps}RM (${cmp.highRepSet.weight}kg) est théoriquement ${cmp.focus === "force absolue" ? "meilleur" : "moins bon"} que ton ${cmp.lowRepSet.reps}RM (${cmp.lowRepSet.weight}kg) ne le laisserait attendre. Travaille ta ${cmp.focus}.`,
          deltaPct: cmp.deltaPct,
        };
      }).filter((x): x is { label: string; emoji: string; detail: string; deltaPct: number } => x != null)
    : [];
  // Pas de mécanisme croisé "réel-vs-attendu" séparé pour l'endurance (2026-09, suite) — contrairement
  // au sprint 60/100/200m (aucune norme de population sourcée), les distances de course ont DÉJÀ 12
  // vraies RATIO_CARDS sourcées entre elles (5k/10k/semi/marathon, testNorms.ts) avec jauge et repère
  // de littérature — un mécanisme séparé ferait doublon avec ce qui existe déjà en mieux intégré
  // (jauge visuelle, pas juste du texte). Un `enduranceProfile.ts` (formule de Riegel) avait été
  // construit puis retiré pour cette raison précise, trouvée en vérifiant l'inventaire des corrélations
  // déjà existantes avant de généraliser l'architecture.
  const showReco = !!activeFamily || sprintAxisRows.length > 0 || forceExtraWeak.length > 0;
  // Contexte "pourquoi ce test" (batteryInfo) pour les cartes à UN SEUL MetricKey (2026-09, suite —
  // scanne désormais TOUTES les batteries, plus seulement celle du sport de profil, cohérent avec le
  // retrait du filtrage par sport ci-dessous). Les composés (plusieurs MetricKey) n'ont pas de carte
  // unique à qui l'attacher (ambigu) — ils disparaissent simplement de la liste une fois tous leurs
  // MetricKey couverts (voir `notCovered` plus bas), chaque sous-métrique gardant sa propre carte/son
  // propre `batteryInfo`. Un même MetricKey peut apparaître dans plusieurs batteries sport avec un
  // texte différent (ex. CMJ : football/basketball/handball/rugby) — premier match rencontré gagne,
  // pas de tentative de fusionner/choisir "le meilleur" texte.
  const metricToBatteryTest = new Map<MetricKey, BatteryTest>();
  for (const battery of Object.values(TEST_BATTERIES)) {
    for (const t of battery.tests) {
      const metrics = BATTERY_TEST_METRICS[t.name];
      if (metrics?.length === 1 && coveredMetrics.has(metrics[0]) && !metricToBatteryTest.has(metrics[0])) {
        metricToBatteryTest.set(metrics[0], t);
      }
    }
  }
  // Fusion "Tests recommandés" → cartes, sans exception (2026-09, remplace la section séparée à la
  // demande explicite de Gildas) : TOUT test recommandé — qu'il ait un MetricKey interprété ou non —
  // devient une carte. Ceux à MetricKey (1 ou N, composés compris depuis le fix précédent) sont déjà
  // représentés par `groupInsightsByMetric(filteredCardInsights)` ci-dessous — `notCovered` les exclut
  // d'ici. Les tests SANS AUCUN MetricKey (agilité, mobilité, WOD, tests de terrain...) deviennent
  // leur propre carte : verrouillée (jamais loguée, "+Ajouter" crée la 1re ligne avec une unité
  // choisie à la volée, voir onAddNew sur TestCard) ou remplie (une ligne `tests` matche déjà,
  // trouvée via findMatchingRawTest — sa vraie unité/historique s'affichent, pas une supposition).
  // Un métrique compte comme "déjà représenté" (2026-09, suite) dès qu'il a une vraie valeur
  // (latestByMetric), même sans carte interprétée à lui — vrai pour MULTI_ENTRY_METRICS (Sprint/Course,
  // ex. sprint60m/100m : aucune norme sourcée) ET pour SECONDARY_ONLY_METRICS (ex. dropJumpContact :
  // jamais sa propre carte, toujours affiché en secondaire de "Drop jump"). Sans ce 2e cas, bug réel
  // trouvé par Gildas : "Drop Jump (RSI)" restait recommandé pour toujours même une fois hauteur ET
  // contact loggués via la carte "Drop jump" — dropJumpContact n'étant `coveredMetrics` nulle part
  // (jamais primaryMetric d'un CardInsight), `notCovered` ne pouvait jamais le voir comme "fait".
  const isMetricRepresented = (m: MetricKey) => coveredMetrics.has(m) || ((MULTI_ENTRY_METRICS.has(m) || SECONDARY_ONLY_METRICS.has(m)) && latestByMetric[m] != null);
  const notCovered = (t: BatteryTest) => {
    const metrics = BATTERY_TEST_METRICS[t.name];
    return !(metrics?.length && metrics.every(isMetricRepresented));
  };
  // Liste des tests recommandés — TOUJOURS tous les sports, jamais filtrée par le sport du profil
  // (2026-09, suite — retour répété de Gildas : "je veux plus filtrer les tests par sport du profil...
  // tous les tests de l'app pour tous les users, filtrables par qualité physique"). `activeQuality`
  // ne fait plus basculer entre "1 sport" et "tous les sports" — il ne fait plus qu'un filtre
  // OPTIONNEL sur ce même pool complet, déjà cross-sport avec ou sans qualité sélectionnée.
  const recommendedTestsForView: BatteryTest[] = (() => {
    const seen = new Set<string>();
    const out: BatteryTest[] = [];
    for (const battery of Object.values(TEST_BATTERIES)) {
      for (const t of battery.tests) {
        if (seen.has(t.name)) continue;
        if (activeQuality && !BATTERY_TEST_QUALITY[t.name]?.includes(activeQuality)) continue;
        if (!notCovered(t)) continue;
        seen.add(t.name);
        out.push(t);
      }
    }
    return out;
  })();
  const matchedRawTestKeys = new Set<string>();
  const recommendedCards = recommendedTestsForView.map(t => {
    const match = findMatchingRawTest(t.name, merged);
    if (match) matchedRawTestKeys.add(match.name_key);
    return { t, match };
  });

  // Un métrique résolu n'est JAMAIS affiché via rawTests (2026-09, fix doublon réel trouvé par
  // Gildas) — "100m" ET "100m départ arrêté" (2 noms bruts distincts, tous deux alias de sprint100m)
  // affichaient 2 cartes séparées, chacune avec sa propre moitié de l'historique. Toute métrique
  // résolue passe désormais par UNE des 2 voies : `groupInsightsByMetric` (a un vrai CardInsight) ou
  // `resolvedUninterpretedMetrics` ci-dessous (résolu mais sans jauge, ex. sprint60m/100m/200m) —
  // jamais les deux, jamais rawTests. Seuls les tests VRAIMENT jamais résolus (nom libre) restent ici.
  // Filtre qualité (2026-09, suite — retour de Gildas, "il faut sûrement aussi pouvoir ajouter une
  // catégorie/qualité physique quand on créer un test") : un test libre n'a de qualité que si son
  // créateur en a choisi une (AddCustomTestForm, `tests.qualities`) — `null`/vide = comportement
  // historique inchangé (toujours affiché, quel que soit le filtre actif), jamais masqué a posteriori
  // pour ne pas faire disparaître de vieux tests créés avant cette fonctionnalité.
  const rawTests = merged.filter(t =>
    !canonicalMetricKey(t.name_key) && !matchedRawTestKeys.has(t.name_key) &&
    (!activeQuality || !t.qualities?.length || t.qualities.includes(activeQuality))
  );

  // Métriques déjà résolus mais SANS carte interprétée (2026-09, suite — sprint60m/100m/200m : aucune
  // norme sourcée, jamais de CardInsight). Fusionne TOUS les alias d'un même métrique en UNE carte
  // (même principe que combinedByMetric pour l'historique), affichée sous le nom canonique
  // (METRIC_DISPLAY), jamais le nom brut sous lequel une donnée a été loguée en premier — répond
  // directement à "100m départ arrêté vs 100m, lequel garder ?" : ni l'un ni l'autre, un 3e nom
  // canonique cohérent ("Sprint 100m"), comme pour n'importe quel autre exercice déjà interprété.
  // `SECONDARY_ONLY_METRICS` exclut les métriques qui ne doivent JAMAIS avoir leur propre carte,
  // toujours affichés en secondaire d'une autre (dropJumpContact — déjà visible sur la carte "Drop
  // jump" via secondaryByDate, doublonnerait sinon la même donnée).
  const resolvedUninterpretedMetrics = Array.from(new Set(
    merged
      .map(t => canonicalMetricKey(t.name_key))
      .filter((m): m is MetricKey => m != null && !coveredMetrics.has(m) && !SECONDARY_ONLY_METRICS.has(m))
  )).filter(m => !activeQuality || METRIC_QUALITY[m].includes(activeQuality));

  // Réutilise le test existant qui matche déjà cette clé canonique (peu importe l'alias exact sous
  // lequel il a été créé) pour ne jamais créer un doublon sous un 2e nom — sinon, nouveau test sous
  // le nom canonique de référence (METRIC_DISPLAY).
  // Écriture pure (aucun fetch/setState ici) — réutilisée telle quelle par handleAddForMetric et par
  // handleAddDropJumpPair (2026-09), qui doit écrire 2 métriques d'un coup sans déclencher 2 fetchAll
  // séparés (juste redondant, pas un bug, mais pas nécessaire).
  async function upsertForMetric(metric: MetricKey, value: number, date: string) {
    const existing = (merged ?? []).find(t => canonicalMetricKey(t.name_key) === metric);
    const name = existing?.name ?? METRIC_DISPLAY[metric].name;
    const unit = existing?.unit ?? METRIC_DISPLAY[metric].unit;
    await upsertTestResult(ownerId, subject, { name, unit, value, date });
  }

  async function handleAddForMetric(metric: MetricKey, value: number, date: string) {
    await upsertForMetric(metric, value, date);
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Saisie fusionnée hauteur+contact (2026-09) : avant ce fix, "Temps de contact (drop jump)" n'avait
  // AUCUN point d'entrée depuis ce panneau (jamais un primaryMetric de RATIO_CARD, donc jamais de
  // carte "cardInsights" ; et aucun moyen de créer un 1er résultat "raw" sans passer par le suivi
  // d'exercice en séance) — repéré par Gildas en testant. Écrit les 2 métriques avec la MÊME date en
  // un seul geste (garantit qu'elles viennent bien du même saut), un seul fetchAll après les 2.
  async function handleAddDropJumpPair(heightM: number, contactS: number, date: string) {
    await Promise.all([
      upsertForMetric("dropJumpHeight", heightM, date),
      upsertForMetric("dropJumpContact", contactS, date),
    ]);
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  async function handleAddForRawTest(test: MergedTest, value: number, date: string) {
    // Unité canonique préférée à l'unité brute stockée si le test est résolu (2026-09, même fix que
    // l'affichage ci-dessus) — sinon une unité fausse héritée d'avant la résolution (ex. "kg" pour un
    // sprint) se serait perpétuée indéfiniment sur chaque nouvelle écriture.
    const resolvedMetric = canonicalMetricKey(test.name_key);
    const unit = resolvedMetric ? METRIC_DISPLAY[resolvedMetric].unit : test.unit;
    await upsertTestResult(ownerId, subject, { name: test.name, unit, value, date });
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Test recommandé jamais loggué (2026-09, fusion "Tests recommandés" → cartes) — écrit la 1re ligne
  // `tests` sous le nom EXACT du test recommandé, avec l'unité choisie par l'utilisateur dans le
  // dropdown (voir onAddNew, TestCard) ; upsertTestResult/resolveTest créent la fiche puisqu'aucune
  // n'existe encore sous ce name_key. `qualities` (2026-09, suite) : uniquement fourni par "+ Nouveau
  // test" pour un nom entièrement libre (voir AddCustomTestForm) — un test recommandé a déjà sa
  // qualité via BATTERY_TEST_QUALITY, jamais besoin de la redemander.
  async function handleAddForNewRecommendedTest(name: string, value: number, unit: string, date: string, qualities?: Quality[]) {
    await upsertTestResult(ownerId, subject, { name, unit, value, date, qualities });
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Filet de sécurité "test orphelin" (2026-09, item 3) : ne peut recibler que la ligne qui vit sous
  // CE owner_id (coachTestId côté coach, athleteTestId côté sportif) — l'autre côté, s'il existe,
  // n'est pas modifiable ici (RLS l'empêcherait de toute façon).
  // `toName` est déjà le nom final à écrire (2026-09, suite) — que la cible soit un exercice canonique
  // (label = METRIC_DISPLAY[key].name) ou un test recommandé sans MetricKey (label = son nom exact,
  // voir buildMergeSuggestions) ne change rien ici : mergeTestInto accepte n'importe quel nom cible.
  async function handleMergeRawTest(test: MergedTest, toName: string) {
    const ownTestId = isCoachView ? test.coachTestId : test.athleteTestId;
    if (!ownTestId) return;
    await mergeTestInto(ownerId, ownTestId, subject, toName);
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Suppression complète d'une carte non reliée (2026-09, menu "⋯") — fonctionne qu'elle ait déjà des
  // résultats ou non, contrairement à l'ancien "🗑 Supprimer ce test" (vide uniquement). Même garde
  // que le merge : ne peut agir que sur la ligne qui vit sous CE owner_id.
  async function handleDeleteTestCompletely(test: MergedTest) {
    const ownTestId = isCoachView ? test.coachTestId : test.athleteTestId;
    if (!ownTestId) return;
    await deleteTestCompletely(ownerId, ownTestId, subject);
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Suppression d'un seul point d'historique (2026-09) — nettoie aussi la fiche `tests` si ce point
  // était le dernier restant (deleteTestIfEmpty), pour que la carte disparaisse d'elle-même plutôt
  // que de rester affichée vide. `row.test_id` porte déjà la bonne fiche même pour une carte
  // interprétée qui fusionne plusieurs alias (combinedByMetric) — pas besoin de le redéduire ici.
  async function handleDeleteHistoryRow(row: TestResultRow) {
    await deleteTestResult(row.test_id, row.date, subject);
    await deleteTestIfEmpty(row.test_id, ownerId, subject);
    const { ownRes, otherRes, merged: m } = await fetchAll();
    setOwnResults(ownRes);
    setOtherResults(otherRes);
    setMerged(m);
  }

  // Liste unifiée (2026-09, suite — remplace à la fois le bilan texte séparé ET la grille de cartes
  // toujours dépliées) : chacune des 4 sources devient une UnifiedRow, avec exactement les mêmes
  // `cardProps` qu'avant pour ne rien perdre une fois la ligne dépliée (CRUD complet inchangé).
  const interpretedRows: UnifiedRow[] = groupInsightsByMetric(filteredCardInsights).map(group => {
    const cardProps: TestCardProps = {
      title: group.label,
      unit: METRIC_DISPLAY[group.metric].unit,
      results: combinedByMetric[group.metric] ?? [],
      comparisons: group.comparisons,
      onAdd: (v, d) => handleAddForMetric(group.metric, v, d),
      readOnly: !!fixture,
      batteryInfo: metricToBatteryTest.get(group.metric),
      onDeleteResult: handleDeleteHistoryRow,
      metric: group.metric,
      onAddPair: group.metric === "dropJumpHeight" ? handleAddDropJumpPair : undefined,
      sscProfile: group.metric === "dropJumpHeight" ? dropJumpProfile(latestByMetric.dropJumpContact) ?? undefined : undefined,
      secondaryByDate: group.metric === "dropJumpHeight" ? new Map((combinedByMetric["dropJumpContact"] ?? []).map(r => [r.date, r.value])) : undefined,
      ftctInfo: group.metric === "dropJumpHeight" && latestByMetric.dropJumpHeight != null && latestByMetric.dropJumpContact != null
        ? ftctRatio(latestByMetric.dropJumpHeight, latestByMetric.dropJumpContact) : undefined,
      repEntries: FORCE_MOVEMENT_METRICS.has(group.metric) ? repsByMetric[group.metric] ?? [] : undefined,
      onAddRepEntry: FORCE_MOVEMENT_METRICS.has(group.metric) ? (r, w, d) => handleAddStrengthRep(group.label, r, w, d) : undefined,
      onDeleteRepEntry: FORCE_MOVEMENT_METRICS.has(group.metric) ? handleDeleteStrengthRep : undefined,
    };
    return unifiedRowFromInsightGroup(group, movementEmoji(group.metric), cardProps);
  });

  // Métriques résolus sans carte interprétée (sprint60/100/200m notamment, aucune norme sourcée pour
  // une vraie RATIO_CARD — mais sprint60m/100m/200m ONT quand même un repère possible via le profil
  // de vitesse, voir `sprintComparison` sur UnifiedRow et `sprintAxisComparisons` plus haut).
  const SPRINT_AXIS_LABEL: Partial<Record<MetricKey, string>> = { sprint60m: "Sprint 60m", sprint100m: "Sprint 100m", sprint200m: "Sprint 200m" };
  const uninterpretedRows: UnifiedRow[] = resolvedUninterpretedMetrics.map(metric => {
    const cardProps: TestCardProps = {
      title: METRIC_DISPLAY[metric].name,
      unit: METRIC_DISPLAY[metric].unit,
      results: combinedByMetric[metric] ?? [],
      onAdd: (v, d) => handleAddForMetric(metric, v, d),
      readOnly: !!fixture,
      batteryInfo: metricToBatteryTest.get(metric),
      onDeleteResult: handleDeleteHistoryRow,
      metric,
      repEntries: FORCE_MOVEMENT_METRICS.has(metric) ? repsByMetric[metric] ?? [] : undefined,
      onAddRepEntry: FORCE_MOVEMENT_METRICS.has(metric) ? (r, w, d) => handleAddStrengthRep(METRIC_DISPLAY[metric].name, r, w, d) : undefined,
      onDeleteRepEntry: FORCE_MOVEMENT_METRICS.has(metric) ? handleDeleteStrengthRep : undefined,
    };
    const axisLabel = SPRINT_AXIS_LABEL[metric];
    const sprintComparison = axisLabel ? sprintAxisComparisons.find(c => c.axis === axisLabel) : undefined;
    const row = unifiedRowFromRaw(`metric-${metric}`, METRIC_DISPLAY[metric].name, movementEmoji(metric), metric, cardProps.results, cardProps);
    if (!sprintComparison) return row;
    // Score dérivé (2026-09, suite) — UNIQUEMENT pour le tri "plus faible en premier" de la liste
    // (même échelle 0-100, même sens que CardInsight.score), jamais affiché tel quel à l'écran :
    // 50 au repère (deltaPct=0), qui monte/descend avec l'écart réel-vs-attendu (même facteur ×4 que
    // la largeur de SprintAxisGauge, pour rester cohérent avec ce qui est visuellement montré).
    const score = Math.max(0, Math.min(100, 50 - sprintComparison.deltaPct * 4));
    return { ...row, sprintComparison, score };
  });

  // Tests recommandés → lignes, sans exception : verrouillée (jamais loguée) ou remplie (une ligne
  // `tests` matche déjà, voir findMatchingRawTest).
  const recommendedRows: UnifiedRow[] = recommendedCards.map(({ t, match }) => {
    const results = match ? resultsByKey.get(match.name_key) ?? [] : [];
    const metric = match ? canonicalMetricKey(match.name_key) ?? undefined : undefined;
    const cardProps: TestCardProps = {
      title: t.name,
      unit: match?.unit ?? "",
      results,
      onAdd: match ? (v, d) => handleAddForRawTest(match, v, d) : async () => {},
      onAddNew: match ? undefined : (v, u, d) => handleAddForNewRecommendedTest(t.name, v, u, d),
      readOnly: !!fixture,
      batteryInfo: t,
      onDeleteResult: handleDeleteHistoryRow,
      metric,
    };
    return {
      ...unifiedRowFromRaw(`rec-${t.name}`, t.name, movementEmoji(metric, BATTERY_TEST_QUALITY[t.name]), metric, results, cardProps),
      unlinked: match ? !canonicalMetricKey(match.name_key) : undefined,
      mergeSuggestions: match && !canonicalMetricKey(match.name_key) ? buildMergeSuggestions(match.name) : undefined,
      onMerge: match ? (toKey: string) => handleMergeRawTest(match, toKey) : undefined,
      onDeleteWhole: match ? () => handleDeleteTestCompletely(match) : undefined,
    };
  });

  const rawRows: UnifiedRow[] = rawTests.map(t => {
    const rawMetric = canonicalMetricKey(t.name_key) ?? undefined;
    // Unité canonique préférée à l'unité brute stockée quand le métrique est résolu (2026-09, fix bug
    // réel trouvé par Gildas) : un test créé AVANT d'avoir un alias connu peut avoir stocké une unité
    // fausse ("kg" par défaut) — l'unité canonique (testNorms.ts) reste toujours correcte, elle.
    const displayUnit = rawMetric != null ? METRIC_DISPLAY[rawMetric].unit : t.unit;
    const isForceMovement = rawMetric != null && FORCE_MOVEMENT_METRICS.has(rawMetric);
    const results = resultsByKey.get(t.name_key) ?? [];
    const cardProps: TestCardProps = {
      title: t.name,
      unit: displayUnit,
      results,
      onAdd: (v, d) => handleAddForRawTest(t, v, d),
      readOnly: !!fixture,
      onDeleteResult: handleDeleteHistoryRow,
      metric: rawMetric,
      repEntries: isForceMovement ? repsByMetric[rawMetric!] ?? [] : undefined,
      onAddRepEntry: isForceMovement ? (r, w, d) => handleAddStrengthRep(t.name, r, w, d) : undefined,
      onDeleteRepEntry: isForceMovement ? handleDeleteStrengthRep : undefined,
    };
    return {
      ...unifiedRowFromRaw(t.name_key, t.name, movementEmoji(rawMetric), rawMetric, results, cardProps),
      unlinked: !canonicalMetricKey(t.name_key),
      mergeSuggestions: canonicalMetricKey(t.name_key) ? undefined : buildMergeSuggestions(t.name),
      onMerge: (toKey: string) => handleMergeRawTest(t, toKey),
      onDeleteWhole: () => handleDeleteTestCompletely(t),
    };
  });

  // Tri (2026-09, suite) : les lignes avec un vrai repère chiffré d'abord, la plus faible en premier
  // (priorité réelle façon bilan — "commence par ton plus gros écart"), puis les lignes neutres
  // (jamais loguées ou sans norme sourcée) à la suite, dans leur ordre d'apparition d'origine (tri
  // stable, jamais mélangées entre elles).
  const unifiedRows: UnifiedRow[] = [...interpretedRows, ...uninterpretedRows, ...recommendedRows, ...rawRows]
    .sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return a.score - b.score;
    });

  function toggleRow(key: string) {
    setAutoAddKey(null);
    setExpandedKey(prev => (prev === key ? null : key));
  }
  function quickAdd(key: string) {
    setAutoAddKey(key);
    setExpandedKey(key);
  }

  return (
    <div>
      {/* Carte dark "Recommandations" — s'affiche dès qu'il y a un verdict à montrer OU au moins un
          test à lister (2026-09, suite) : la liste de tests ne doit JAMAIS disparaître faute de
          verdict (ex. aucun sport de profil et aucun signal sprint/force), même si ce sont les 2
          raisons pour lesquelles cette carte existe à l'origine. */}
      {(showReco || unifiedRows.length > 0) && (
        <div style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", borderRadius: 20, padding: "18px 18px 16px", marginBottom: 14, color: "#fff" }}>
          {showReco && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f04a08", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Recommandations d&apos;entraînement</div>

              {/* Profil (2026-09, suite — retour de Gildas) : déplacé sous le titre "Recommandations
                  d'entraînement" (était au-dessus de toute la carte, sur fond clair) — restylé dark
                  pour rester cohérent avec le reste de la carte. */}
              {onEditProfile && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "9px 12px", marginBottom: 10, fontSize: 12, color: "rgba(255,255,255,.75)" }}>
                  <span>👤 <b style={{ color: "#fff" }}>{sport || "Sport non renseigné"}</b> · {sexeLabel(sexe ?? null)} · {poidsLabel(poidsKg)}</span>
                  <button onClick={onEditProfile} style={{ background: "none", border: "none", color: "#f04a08", fontWeight: 800, fontSize: 12, cursor: "pointer", padding: 0 }}>✏️ Modifier</button>
                </div>
              )}

              {/* Chips de qualité physique (2026-09) — remplace l'ancien filtre par sport. Ne change
                  jamais la famille de normes interprétée (toujours celle du sport de profil) : filtre
                  uniquement QUELLES cartes/tests recommandés s'affichent, transversalement à tous les
                  sports (voir testQualities.ts). "Tous" (2026-09, suite — retour de Gildas) : remet
                  `activeQuality` à `null`, seul moyen de sortir du filtre une fois un chip cliqué
                  (avant, il fallait recliquer le MÊME chip actif — pas évident). */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.4)", marginBottom: 8 }}>Filtrer par qualité physique</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  <button
                    onClick={() => setActiveQuality(null)}
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 13px", borderRadius: 20,
                      border: activeQuality == null ? "1px solid #f04a08" : "1px solid rgba(255,255,255,.14)",
                      background: activeQuality == null ? "#f04a08" : "rgba(255,255,255,.06)", color: "#fff",
                      fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Tous
                  </button>
                  {QUALITY_ORDER.map(q => {
                    const meta = QUALITY_META[q];
                    const active = activeQuality === q;
                    return (
                      <button
                        key={q}
                        onClick={() => setActiveQuality(prev => (prev === q ? null : q))}
                        style={{
                          flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 13px", borderRadius: 20,
                          border: active ? "1px solid #f04a08" : "1px solid rgba(255,255,255,.14)",
                          background: active ? "#f04a08" : "rgba(255,255,255,.06)", color: "#fff",
                          fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        <span>{meta.emoji}</span>{meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3, marginBottom: 10 }}>{verdict.title}</div>
              <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>
                <b style={{ color: "#fff" }}>{verdict.emoji} {verdict.action} :</b> {verdict.sub}
              </div>
            </>
          )}
          {/* Profil de vitesse — jauges (2026-09, suite — retour de Gildas) : pas de carte CRUD à qui
              les rattacher (profils dérivés de plusieurs distances, pas un mouvement unique loggable),
              donc elles restent ici plutôt que dans la liste ci-dessous — mais avec le même langage
              visuel que PrimaryGauge (centre = temps attendu, la barre part du centre vers le temps
              réel) plutôt qu'une ligne de texte brut. */}
          {sprintAxisRows.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {sprintAxisRows.map(c => <SprintAxisGauge key={c.axis} comp={c} />)}
            </div>
          )}
          {/* Signal Force (2026-09) — pas de repère actual/predicted à jauger de la même façon (voir
              StrengthEnduranceComparison), reste en texte. */}
          {forceExtraWeak.length > 0 && (
            <div style={{ marginTop: sprintAxisRows.length > 0 ? 4 : 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {forceExtraWeak.map((it, i) => (
                <div key={`sig-force-${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#ff8a6a", background: "rgba(209,0,0,.22)" }}>!</span>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.78)", lineHeight: 1.4 }}><b style={{ color: "#fff" }}>{it.label}</b> — {it.detail}</div>
                </div>
              ))}
            </div>
          )}

          {/* "+ Nouveau test" (2026-09, suite) — toujours visible (indépendant de showReco/du filtre
              qualité), masqué en sandbox (fixture, aucun backend réel derrière). */}
          {!fixture && (
            <div style={{ marginTop: showReco ? 14 : 0 }}>
              {addingCustomTest ? (
                <AddCustomTestForm
                  onSave={async (name, value, unit, date, qualities) => {
                    await handleAddForNewRecommendedTest(name, value, unit, date, qualities);
                    setAddingCustomTest(false);
                  }}
                  onCancel={() => setAddingCustomTest(false)}
                />
              ) : (
                <button
                  onClick={() => setAddingCustomTest(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.06)", border: "1px dashed rgba(255,255,255,.24)", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 14px", cursor: "pointer", marginBottom: 12 }}
                >
                  <span style={{ fontSize: 15 }}>+</span> Nouveau test
                </button>
              )}
            </div>
          )}

          {/* Liste unifiée "Mouvement / Écart" (2026-09, suite — Variante A retenue par Gildas) : reste
              DANS la carte Recommandations, sur son fond dark (demande explicite) — valeur dominante +
              jauge type "comportement" (centrée, épaisse) visibles par défaut, expand n'ajoute QUE du
              contenu nouveau (comparaisons secondaires, courbe, historique, formulaire — voir TestCard,
              qui ne réaffiche jamais ce que la ligne montre déjà : zéro doublon). */}
          {unifiedRows.length > 0 && (
            <div style={showReco ? { marginTop: 16, borderTop: "1px solid rgba(255,255,255,.10)" } : undefined}>
              {unifiedRows.map(row => {
                const isExpanded = expandedKey === row.key;
                return (
                  <div key={row.key} style={{ borderBottom: "1px solid rgba(255,255,255,.06)", padding: "13px 2px" }}>
                    <div onClick={() => toggleRow(row.key)} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{row.emoji}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>{row.name}</div>
                            {row.unlinked && (row.onMerge || row.onDeleteWhole) && (
                              <RowMenu mergeSuggestions={row.mergeSuggestions} onMerge={row.onMerge} onDeleteWhole={row.onDeleteWhole} />
                            )}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {isExpanded ? (
                              <span style={{ color: "rgba(255,255,255,.35)", fontSize: 12 }}>▾</span>
                            ) : row.cardProps.readOnly ? null : (
                              <button
                                onClick={e => { e.stopPropagation(); quickAdd(row.key); }}
                                title="Ajouter un résultat"
                                style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontWeight: 900, fontSize: 14, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                              >
                                +
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.45)", marginTop: 1 }}>{row.date ?? "Jamais loggué"}</div>

                        {/* Valeur actuelle (2026-09, suite — retour de Gildas, "j'ai perdu la valeur
                            actuelle") : quand une comparaison existe, elle rejoint la ligne cible/
                            badge de PrimaryGauge (les 3 alignées : résultat à gauche, cible au
                            centre, badge à droite) — jamais répétée sur sa propre ligne au-dessus.
                            Sinon (aucune comparaison), sa propre grande ligne reste la seule info. */}
                        {row.sprintComparison ? (
                          <SprintAxisGauge comp={row.sprintComparison} hideLabel />
                        ) : row.primaryComparison ? (
                          <PrimaryGauge insight={row.primaryComparison} deltaRealUnit={row.deltaRealUnit} rawValueLabel={row.rawValueLabel} />
                        ) : row.rawValueLabel != null ? (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.01em", color: "#fff", marginTop: 4, lineHeight: 1.1 }}>{row.rawValueLabel}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>pas de repère</div>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 4, paddingLeft: 42 }}>
                        <TestCard {...row.cardProps} initialOpen={autoAddKey === row.key} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {unifiedRows.length === 0 && (
        <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.5, padding: "8px 2px" }}>
          {emptyHint ?? "Aucun test enregistré pour l'instant — marque une ligne d'exercice comme test (menu ⋯ d'une séance) pour commencer."}
        </div>
      )}
    </div>
  );
}
