"use client";

/* Extrait de ConseilsClient.tsx (2026-09-24, "point 1" — fusionner Charge/Récupération/Comportements
   dans l'accueil, voir POC `poc-coach-context_4.html`, tabsHtml()/tabBody() : Entraînement/Charge/
   Récupération/Comportements en tabs sur l'Accueil). Source unique — TodayClient.tsx (nouveaux
   onglets) ET ConseilsClient.tsx (bloc "Tests de performance" seul désormais) partagent ces pièces
   plutôt que de dupliquer la logique de rendu. Comportement/formules 100% inchangés, seul
   l'emplacement dans l'UI change. */

import { useState } from "react";
import ShareButton from "@/components/sessions/ShareButton";
import { type DimensionKey, type Perspective, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import IndexCards, { type ExtraIndexCard } from "@/components/conseils/IndexCards";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import { sigDimInfo } from "@/lib/fatigueSignature";
import { METRICS, prettyStatus, statusDisplayColor, TREND_ARROW, trendFor, AGG_BANDS, aggregateFor, type MetricKey, type MetricGroup } from "@/lib/metricCards";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import { wellnessColor } from "@/lib/wellness";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ConseilsData, BehaviorCorrelation } from "@/lib/conseilsData";
import type { CoachAthlete } from "@/types";
import { AthleteRing } from "@/app/(app)/coach/athletes/AthletesClient";

/* Pastille "Exemple" (sandbox, sportif démo) — seul reste de CrossInsightBanner, retiré le
   2026-09-29 : l'insight croisé vit désormais dans la ligne Phase de la carte décision
   (/today, Coach Control), le répéter en tête des onglets Charge/Récupération faisait doublon. */
export function DemoDataChip() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.85)", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
        🔎 Exemple
      </div>
    </div>
  );
}

/* Cartes d'indice (2026-09-28, POC `charge-variantes.html` variante E1, retenue par Gildas) —
   remplacent les sous-onglets Charge/Adaptation et la rangée de badges : les badges disaient la même
   chose que le chart juste en dessous, et il fallait cliquer pour savoir où on en était sur chaque
   indice. Une carte par indice, statut visible en permanence, chart au clic. */
export function ChargeSection({ data, rangeMode, onRangeModeChange, perspective = "athlete" }: { data: ConseilsData; rangeMode: RangeMode; onRangeModeChange: (m: RangeMode) => void; perspective?: Perspective }) {
  return <IndexCards data={data} rangeMode={rangeMode} onRangeModeChange={onRangeModeChange} group="charge" insight={data.chargeInsight} perspective={perspective} />;
}

/* Les 4 badges de dimension ont disparu d'ici (2026-09-28) : ils sont devenus les chips de filtre
   à l'intérieur de la carte Récupération, où ils pilotent le chart au lieu de n'être qu'un état. */
export function RecuperationSection({ data, rangeMode, onRangeModeChange, perspective = "athlete" }: { data: ConseilsData; rangeMode: RangeMode; onRangeModeChange: (m: RangeMode) => void; perspective?: Perspective }) {
  return <IndexCards data={data} rangeMode={rangeMode} onRangeModeChange={onRangeModeChange} group="recup" insight={data.recoveryInsight} perspective={perspective} extraCards={[behaviorIndexCard(data)]} />;
}

/* ── Carte "Comportements" dans l'onglet Récupération (2026-09-30, Gildas : "sous la même forme que
   les autres : une card, au clic le rapport complet"). Résumé = le comportement qui pèse le plus
   (même seuils que le rapport, topBehaviors), aperçu = les impacts en barres centrées sur zéro, et le
   rapport complet (BehaviorImpactCard) une fois déplié. */
const BEHAVIOR_MIN_DAYS = 10;
const HURT_COLOR = "#ff7a6b", HELP_COLOR = "#6ede8a";

function behaviorIndexCard(data: ConseilsData): ExtraIndexCard {
  const { correlations, filledDays } = data;
  const body = <BehaviorImpactCard correlations={correlations} filledDays={filledDays} embedded />;
  if (filledDays < BEHAVIOR_MIN_DAYS || correlations.length === 0) {
    const remaining = Math.max(0, BEHAVIOR_MIN_DAYS - filledDays);
    return {
      key: "behaviors", label: "Comportements", status: "En collecte", statusColor: "rgba(255,255,255,.55)",
      accent: null, body, trend: `${filledDays}/${BEHAVIOR_MIN_DAYS} jours`,
      impact: remaining > 0
        ? `Encore ${remaining} jour${remaining > 1 ? "s" : ""} de ressenti pour mesurer l'effet réel des comportements.`
        : "Les corrélations apparaîtront dès qu'un comportement revient assez souvent.",
      preview: <BehaviorPreview correlations={[]} />,
    };
  }
  const { bestHelper, worstHurt } = topBehaviors(correlations);
  const lead = worstHurt ?? bestHelper;
  const fmt = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)} pts`;
  const parts = [
    worstHurt && `à éviter : ${worstHurt.emoji} ${worstHurt.label} (${fmt(worstHurt.impact)})`,
    bestHelper && `à garder : ${bestHelper.emoji} ${bestHelper.label} (${fmt(bestHelper.impact)})`,
  ].filter(Boolean) as string[];
  return {
    key: "behaviors", label: "Comportements",
    status: lead ? `${lead.emoji} ${lead.label}` : "Aucun effet marqué",
    statusColor: worstHurt ? HURT_COLOR : bestHelper ? HELP_COLOR : "rgba(255,255,255,.7)",
    value: lead ? fmt(lead.impact) : undefined,
    accent: worstHurt ? HURT_COLOR : null,
    impact: parts.length
      ? parts.map((t, i) => (i === 0 ? t[0].toUpperCase() + t.slice(1) : t)).join(" · ") + "."
      : "Aucun comportement n'a d'effet marqué sur la récupération pour l'instant.",
    preview: <BehaviorPreview correlations={correlations} />,
    trend: `${filledDays}j de données`,
    body,
  };
}

/* Aperçu : les 4 comportements les plus marqués, en barres qui partent de zéro (vers la droite =
   aide, vers la gauche = pénalise) — la même lecture que les jauges du rapport. */
function BehaviorPreview({ correlations }: { correlations: BehaviorCorrelation[] }) {
  const top = [...correlations].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 4);
  const maxAbs = Math.max(3, ...top.map(c => Math.abs(c.impact)));
  const W = 118, rowH = 9, H = Math.max(4, top.length) * rowH;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} aria-hidden="true">
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="rgba(255,255,255,.25)" strokeWidth={1} />
      {top.map((c, i) => {
        const w = (Math.abs(c.impact) / maxAbs) * (W / 2 - 2);
        const y = i * rowH + 2;
        return <rect key={c.key} x={c.impact >= 0 ? W / 2 : W / 2 - w} y={y} width={Math.max(1, w)} height={rowH - 4} rx={2.5}
          fill={Math.abs(c.impact) < 0.3 ? "rgba(255,255,255,.3)" : c.impact > 0 ? HELP_COLOR : HURT_COLOR} />;
      })}
    </svg>
  );
}

/* ── Comportements (2026-09) — badge de statut sur la ligne du nom, jauge centrée sur zéro. */
function behaviorStatus(impact: number) {
  const isPositive = impact > 0;
  const isNeutral  = Math.abs(impact) < 0.3;
  const color      = isNeutral ? "rgba(255,255,255,.35)" : isPositive ? "#2f9e44" : "#d10000";
  const impactStr  = isNeutral ? "0 pt" : `${impact > 0 ? "+" : ""}${impact.toFixed(1)} pts`;
  const statusLabel = isNeutral ? "Neutre" : isPositive ? "Aide" : "Pénalise";
  return { isPositive, isNeutral, color, impactStr, statusLabel };
}

const DIMENSION_PHRASE: Record<DimensionKey, string> = {
  sleep: "le sommeil",
  stress: "le stress",
  recovery: "la récupération musculaire",
  motivation: "la motivation",
};

function BehaviorGauge({ c, maxAbs }: { c: BehaviorCorrelation; maxAbs: number }) {
  const { isPositive, isNeutral, color } = behaviorStatus(c.impact);
  const width = Math.min(50, Math.abs(c.impact) / maxAbs * 50);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative" as const, height: 12, background: "rgba(255,255,255,.10)", borderRadius: 6 }}>
        <div style={{ position: "absolute" as const, left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
        {!isNeutral && (
          <div style={{ position: "absolute" as const, top: 0, height: "100%", borderRadius: 6, background: color, ...(isPositive ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }) }} />
        )}
      </div>
      <div style={{ marginTop: 6, textAlign: "center" as const, fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>
        loggué <b style={{ color: "#fff", fontWeight: 700 }}>{c.occurrences}×</b> sur la période
      </div>
    </div>
  );
}

/* Réutilisé par BehaviorImpactCard (2026-09-24) ET TeamAnalyticsList (vue "Tous" côté coach, onglet
   Comportements) — évite de dupliquer le seuil (impact > 0.5 / < -0.5). */
function topBehaviors(correlations: BehaviorCorrelation[]) {
  const bestHelper = correlations.find(c => c.impact > 0.5);
  const worstHurt = [...correlations].reverse().find(c => c.impact < -0.5);
  return { bestHelper, worstHurt };
}

type Metric = "charge" | "recuperation" | "comportements";

/* Mini-sparkline non-interactive (2026-09-26, POC coach-charge-poc.html) — jamais ZoneSparkline/
   SparkLineClient ici (tooltip/zones/animation, trop lourd pour une ligne de liste) : juste un
   repère de forme sur 7j. Échelle relative au max de la série affichée (comme le POC), pas un
   domaine fixe — l'objectif est la silhouette, pas une valeur lue précisément (déjà disponible via
   le badge/tooltip juste au-dessus). `points` porte value ET color séparément (pas un simple
   colorFor(value)) — nécessaire pour la charge (2026-09-26, retour de Gildas : "les barres en UA")
   où la hauteur vient de la charge journalière brute (UA, Foster session-RPE) mais la couleur reste
   pilotée par la zone ACWR du même jour, deux valeurs différentes. */
function MiniBars({ points, height = 26 }: { points: { value: number | null; color: string }[]; height?: number }) {
  const known = points.filter((p): p is { value: number; color: string } => p.value !== null);
  if (!known.length) return null;
  const max = Math.max(...known.map(p => p.value), 0.0001);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
      {points.map((p, i) => (
        <div key={i} style={{
          width: 5, borderRadius: 2,
          height: p.value === null ? 3 : Math.max(3, Math.round((p.value / max) * height)),
          background: p.value === null ? "rgba(255,255,255,.12)" : p.color,
        }} />
      ))}
    </div>
  );
}

/* Couleur de sévérité par sportif pour un onglet donné — pilote à la fois le liseré gauche de la
   carte ET le classement en section (jamais deux échelles de couleur différentes pour la même
   info). Toujours dérivée d'un objet déjà calculé côté ConseilsData (loadInfo/recoveryInfo/
   topBehaviors), jamais une nouvelle couleur inventée. */
function metricStatusColor(metric: Metric, data: ConseilsData): string {
  if (metric === "charge") return data.loadInfo.color;
  if (metric === "recuperation") return data.recoveryInfo.color;
  const { bestHelper, worstHurt } = topBehaviors(data.correlations);
  return worstHurt ? "#d10000" : bestHelper ? "#2f9e44" : "#8a8f94";
}

/* Regroupement en sections façon POC ("À surveiller"/"Optimal"/"Sous-charge") — dérivé des mêmes
   libellés de zone déjà affichés en badge sur chaque carte, jamais un nouveau seuil recalculé ici.
   `order` fixe l'ordre d'affichage (le plus préoccupant en premier). */
/* Sections dérivées du score agrégé (2026-09-29) : le titre EST le libellé de la bande, donc la
   section ne peut pas dire autre chose que la jauge de la ligne. L'ordre met le côté préoccupant en
   premier et la sous-charge en dernier — la même hiérarchie que les sections qu'elles remplacent. */
const AGG_SECTION_ORDER: Record<string, number> = {
  Surcharge: 0, Optimal: 1, "Sous-charge": 2,
  Fatigué: 0, Équilibré: 1, Frais: 2,
};
function sectionForAgg(bandLabel: string): { title: string; order: number } {
  return { title: bandLabel, order: AGG_SECTION_ORDER[bandLabel] ?? 1 };
}

/* Repli pour l'onglet Comportements, qui n'a pas d'agrégat. */
function sectionFor(metric: Metric, data: ConseilsData): { title: string; order: number } {
  if (metric === "charge") {
    const l = data.loadInfo.label;
    if (l === "RISQUE ÉLEVÉ" || l === "RISQUE MODÉRÉ") return { title: "À surveiller", order: 0 };
    if (l === "SOUS-CHARGE") return { title: "Sous-charge", order: 2 };
    return { title: "Optimal", order: 1 };
  }
  if (metric === "recuperation") {
    const l = data.recoveryInfo.label;
    if (l === "FATIGUÉ" || l === "RÉCUP FRAGILE") return { title: "À surveiller", order: 0 };
    if (l === "FRAIS" || l === "BONNE RÉCUP") return { title: "En forme", order: 2 };
    return { title: "Stable", order: 1 };
  }
  const { worstHurt } = topBehaviors(data.correlations);
  return worstHurt ? { title: "Points d'attention", order: 0 } : { title: "Stable", order: 1 };
}

/* ── Vue "Tous" côté coach (2026-09-24, redesign 2026-09-26 inspiré de coach-charge-poc.html) —
   équivalent de teamBody() dans le POC : une liste d'athlètes classée par sévérité ET regroupée par
   section pour l'onglet actif, avec liseré de couleur, badges de signaux (Fitness/Fatigue/
   Monotonie/Contrainte pour la charge, 4 dimensions pour la récupération) et mini-sparkline 7j —
   plutôt que le grand chart individuel des 2 autres modes. `rows` porte déjà le ConseilsData de
   chaque athlète (calculé une fois côté CoachClient.tsx, jamais recalculé ici) — ce composant ne
   fait que trier/regrouper/afficher, aucune nouvelle donnée fabriquée (contrairement au POC, dont
   les scores/insights sont des exemples fictifs). */
export function TeamAnalyticsList({ rows, metric, onSelect }: {
  rows: { athlete: CoachAthlete; data: ConseilsData }[];
  metric: Metric;
  onSelect: (athleteId: string) => void;
}) {
  const { isMd } = useBreakpoint();

  if (rows.length === 0) {
    return <div style={{ color: "#8a8f94", fontSize: 13, padding: "24px 0" }}>Aucun sportif à afficher.</div>;
  }

  /* Le score agrégé de l'onglet pilote le tri, les sections ET le liseré (2026-09-29, Gildas :
     "le tri avec les scores qu'on vient de mettre en place"). Il est calculé UNE fois par sportif
     ici, puis réutilisé partout plus bas — sinon la jauge d'une ligne et sa position dans la liste
     pourraient se contredire, exactement le genre de divergence corrigé ailleurs dans ce fichier.
     Conséquence assumée : trier par l'agrégat sans faire suivre les sections aurait remonté en tête
     un sportif que la monotonie seule met en surcharge, tout en l'affichant sous "Optimal". */
  const aggGroup: MetricGroup | null = metric === "charge" ? "charge" : metric === "recuperation" ? "recup" : null;
  type EnrichedRow = typeof rows[number] & { agg: ReturnType<typeof aggregateFor> };
  const enriched: EnrichedRow[] = rows.map(r => ({ ...r, agg: aggGroup ? aggregateFor(aggGroup, r.data) : null }));

  /* Point idéal de la charge = le milieu de la bande Optimal, pas 0,5 : les bandes n'ont pas la même
     largeur (0,40-0,65), donc le centre de l'axe n'est pas le centre de l'optimal. */
  const CHARGE_IDEAL = (AGG_BANDS.charge[1].from + AGG_BANDS.charge[1].to) / 2;

  /* Tri par sévérité, puis alphabétique à égalité (2026-09-28) : sans ce départage, deux sportifs
     au même niveau pouvaient permuter d'un rendu à l'autre au gré de l'ordre du roster, et un coach
     perdait la position qu'il venait de mémoriser. */
  const byName = (r1: EnrichedRow, r2: EnrichedRow) =>
    (r1.athlete.name ?? "").localeCompare(r2.athlete.name ?? "", "fr");
  const sorted = [...enriched].sort((r1, r2) => {
    if (metric === "charge") {
      // Le plus ÉLOIGNÉ du milieu de l'optimal remonte, dans un sens comme dans l'autre.
      const off = (r: EnrichedRow) => (r.agg === null ? 0 : Math.abs(r.agg.pos - CHARGE_IDEAL));
      return off(r2) - off(r1) || byName(r1, r2);
    }
    if (metric === "recuperation") {
      // Le plus fatigué d'abord : ici l'axe a un sens, le bas est le côté préoccupant.
      const p = (r: EnrichedRow) => r.agg?.pos ?? 0.5;
      return p(r1) - p(r2) || byName(r1, r2);
    }
    const sev = (r: EnrichedRow) => { const { worstHurt } = topBehaviors(r.data.correlations); return Math.abs(worstHurt?.impact ?? 0); };
    return sev(r2) - sev(r1) || byName(r1, r2);
  });

  // Groupé en préservant l'ordre de sévérité déjà calculé ci-dessus — jamais retrié à l'intérieur
  // d'une section.
  const buckets = new Map<string, { order: number; rows: typeof sorted }>();
  for (const row of sorted) {
    const { title, order } = row.agg ? sectionForAgg(row.agg.band.label) : sectionFor(metric, row.data);
    if (!buckets.has(title)) buckets.set(title, { order, rows: [] });
    buckets.get(title)!.rows.push(row);
  }
  const orderedBuckets = Array.from(buckets.entries()).sort((a, b) => a[1].order - b[1].order);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>
      {orderedBuckets.map(([title, { rows: bucketRows }]) => (
        <div key={title}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
            fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 800,
            letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.5)",
          }}>
            {title}
            <span style={{ background: "rgba(255,255,255,.10)", color: "rgba(255,255,255,.7)", borderRadius: 999, padding: "1px 8px", fontSize: 10.5 }}>{bucketRows.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {bucketRows.map(({ athlete: a, data, agg: rowAggPos }) => {
              // Score de récupération — même résolution que RecuperationSection, hissé pour aussi
              // alimenter l'AthleteRing (un seul score par athlète, jamais deux calculs qui
              // pourraient diverger entre le ring et les badges).
              const recoveryScore = data.wellnessBaseline?.hasEnoughHistory ? data.wellnessBaseline.relativeScore : (data.timeSeries[data.timeSeries.length - 1]?.recovery ?? null);
              /* Le liseré prend la couleur de la bande de l'agrégat : tri, section, liseré et jauge
                 sortent tous de la même valeur, plus aucune de ces quatre lectures ne peut en
                 contredire une autre. Repli sur l'ancienne couleur pour les Comportements. */
              const rowAgg = aggGroup && rowAggPos ? { ...rowAggPos, group: aggGroup } : null;
              const statusColor = rowAgg ? rowAgg.band.color : metricStatusColor(metric, data);

              /* Philosophie des cartes d'indice appliquée au roster (2026-09-28, variante "C4" du POC) :
                 nom, puis une LIGNE PRINCIPALE "statut · valeur", puis l'insight ; aperçu et tendance
                 à droite. L'indice de tête est l'ACWR côté charge et le score de récupération côté
                 récup — les deux seuls de leur onglet à être normalisés sur la norme propre de chaque
                 sportif, donc les seuls comparables d'une ligne à l'autre. Un volume en UA ne l'est
                 pas : 520 UA ne dit pas la même chose chez deux sportifs différents.
                 Les rangées de badges secondaires ont disparu — l'insight nomme déjà l'indicateur qui
                 décroche, et cette liste est une surface de SCAN : le détail s'ouvre en cliquant. */
              const headKey: MetricKey | null = metric === "charge" ? "acwr" : metric === "recuperation" ? "recovery" : null;
              const window7 = data.timeSeries.slice(-7);
              let mainLine: React.ReactNode = null;
              let trendLine: string | null = null;
              let sparklinePoints: { value: number | null; color: string }[] | null = null;
              let insightBox: React.ReactNode = null;

              if (headKey) {
                const info = metric === "charge" ? data.loadInfo : data.recoveryInfo;
                const relWindow = data.wellnessBaselineSeries.slice(-7).map(b => (b?.hasEnoughHistory ? b.relativeScore : null));
                const headValue = metric === "charge"
                  ? (data.zoneAcwr[data.zoneAcwr.length - 1] ?? null)
                  : recoveryScore;
                const tr = trendFor(headKey, window7, 7, metric === "recuperation" ? relWindow : undefined);
                trendLine = `${TREND_ARROW[tr.dir]} ${tr.text}`;
                mainLine = (
                  <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.01em", lineHeight: 1.25, color: statusDisplayColor(headKey, info.color) }}>
                    {prettyStatus(headKey, info.label) || "—"}
                    {headValue !== null && (
                      <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "rgba(255,255,255,.55)" }}>{` · ${METRICS[headKey].fmt(headValue)}`}</span>
                    )}
                  </span>
                );
              }

              if (metric === "charge") {
                // Hauteur = charge journalière brute en UA (Foster session-RPE), pas l'ACWR
                // (2026-09-26, retour de Gildas : "les barres en UA") — l'ACWR (ratio, borné ~0-2)
                // écrasait la vraie amplitude jour à jour. La couleur reste pilotée par la ZONE ACWR
                // du même jour (sigDimInfo) : deux valeurs différentes par barre, jamais confondues.
                const loadsSlice = data.zoneLoads.slice(-7);
                const acwrSlice = data.zoneAcwr.slice(-7);
                sparklinePoints = loadsSlice.map((load, i) => ({
                  value: load,
                  color: acwrSlice[i] !== null ? sigDimInfo("load", acwrSlice[i]!, "coach").color : "rgba(255,255,255,.25)",
                }));
              } else if (metric === "recuperation") {
                const recentBaseline: (WellnessBaselineResult | null)[] = data.wellnessBaselineSeries.slice(-7);
                sparklinePoints = window7.map((p, i) => {
                  const b = recentBaseline[i];
                  const v = b?.hasEnoughHistory ? b.relativeScore : p.recovery;
                  return { value: v, color: v !== null ? wellnessColor(v) : "rgba(255,255,255,.25)" };
                });
              }

              /* L'insight de l'ONGLET, pas l'insight croisé (2026-09-28, Gildas) : `trendText` mêle
                 charge et récupération, donc sur l'onglet Charge la ligne parlait pour moitié d'autre
                 chose que ce que la carte affiche — et disait autre chose que le détail du sportif,
                 qui montre déjà chargeInsight/recoveryInsight. Les deux sont calculés en perspective
                 coach côté CoachClient, donc ils parlent bien du sportif. */
              const tabInsight = metric === "charge" ? data.chargeInsight
                : metric === "recuperation" ? data.recoveryInsight : null;
              if (headKey && tabInsight) {
                insightBox = (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: "rgba(255,255,255,.72)", lineHeight: 1.45 }}>
                    {tabInsight}
                  </div>
                );
              } else if (metric === "comportements") {
                const { bestHelper, worstHurt } = topBehaviors(data.correlations);
                insightBox = bestHelper || worstHurt ? (
                  <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 12.5, color: "rgba(255,255,255,.88)", lineHeight: 1.5 }}>
                    {worstHurt && (
                      <div>
                        <span style={{ fontWeight: 900, color: "#ff6b6b" }}>✗ </span>
                        <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span> pénalise sa récupération de{" "}
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#ff6b6b" }}>{worstHurt.impact.toFixed(1)} pts</span>.
                      </div>
                    )}
                    {bestHelper && (
                      <div style={worstHurt ? { marginTop: 4 } : undefined}>
                        <span style={{ fontWeight: 900, color: "#4ade80" }}>✓ </span>
                        <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span> améliore sa récupération de{" "}
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#4ade80" }}>+{bestHelper.impact.toFixed(1)} pts</span>.
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 10 }}>Pas assez de données pour identifier un effet marqué.</div>
                );
              }

              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  style={{
                    display: "block", padding: "13px 15px",
                    // Même surface que CoachCard (2026-09-26, "les listes de cards... la même
                    // couleur que les coachcontrol cards, pas blanche") — voile blanc translucide
                    // sur le fond sombre de la page, jamais une carte blanche.
                    background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderLeft: `3px solid ${statusColor}`,
                    borderRadius: 16, cursor: "pointer", textAlign: "left" as const, width: "100%",
                    boxShadow: "0 10px 26px rgba(0,0,0,.22)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Le score agrégé de l'onglet remplace la wellness ring (2026-09-29, Gildas :
                        "la wellnessring est le plus pertinent déjà sur l'accueil") — ici la colonne
                        de gauche doit parler de l'onglet consulté, pas répéter un score de
                        récupération sur l'onglet Charge. Libellé masqué : à cette taille il
                        tomberait sous 4px, la couleur et le liseré de la ligne suffisent.
                        Onglet Comportements : pas d'agrégat défini, on garde la ring. */}
                    {rowAgg
                      ? <AggregateGauge pos={rowAgg.pos} band={rowAgg.band} bands={AGG_BANDS[rowAgg.group]} size={58} showLabel={false} />
                      : <AthleteRing score={recoveryScore} />}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, gap: 2 }}>
                      {/* Le nom porte l'identité de la ligne : en petit, gris et en capitales
                          mono (le gabarit d'eyebrow des cartes d'indice, où il ne portait qu'un nom
                          de métrique), les sportifs ne se distinguaient plus les uns des autres.
                          En blanc et en casse normale, c'est lui qu'on balaye ; le statut reste
                          au-dessus en taille, mais il est coloré, donc les deux ne se concurrencent
                          pas. */}
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {a.name}
                      </span>
                      {mainLine}
                      {isMd && insightBox}
                    </div>
                    {sparklinePoints && (
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <MiniBars points={sparklinePoints} />
                        {trendLine && (
                          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,.5)", whiteSpace: "nowrap" as const }}>{trendLine}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Même règle qu'en mobile côté sportif : sous une centaine de pixels de large,
                      l'insight coincé à côté de l'aperçu tombe sur cinq lignes. */}
                  {!isMd && insightBox}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* `embedded` (2026-09-30) : rapport déplié DANS la carte "Comportements" de l'onglet Récupération —
   sans son propre titre ni halo, la carte qui le contient porte déjà le nom et le résumé. */
export function BehaviorImpactCard({ correlations, filledDays, embedded = false }: { correlations: BehaviorCorrelation[]; filledDays: number; embedded?: boolean }) {
  const MIN_DAYS = 10;

  if (filledDays < MIN_DAYS || correlations.length === 0) {
    const remaining = Math.max(0, MIN_DAYS - filledDays);
    return (
      <div data-tour="conseils-chart" style={{ padding: embedded ? "2px 0 0" : "18px 0", color: "#fff", position: "relative" as const }}>
        <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>Impact comportements</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Données en cours de collecte</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.60)", lineHeight: 1.5, marginBottom: 18 }}>
            {remaining > 0
              ? `Renseigne ta récupération ${remaining} jour${remaining > 1 ? "s" : ""} de plus pour voir l'impact réel de tes comportements.`
              : "Continue à renseigner ta récupération — les corrélations apparaîtront bientôt."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {["🧘 Stretching", "🧊 Douche froide", "📖 Lecture", "💧 Hydratation", "🍷 Alcool", "📱 Écran tard"].map(b => (
              <div key={b} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: "5px 11px", fontSize: 13, color: "rgba(255,255,255,.50)" }}>{b}</div>
            ))}
          </div>
          <div style={{ marginTop: 14, height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(filledDays / MIN_DAYS * 100, 100)}%`, background: "#d44000", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 6 }}>{filledDays}/{MIN_DAYS} jours collectés</div>
        </div>
      </div>
    );
  }

  const maxAbs = Math.max(...correlations.map(c => Math.abs(c.impact)), 3);
  const { bestHelper, worstHurt } = topBehaviors(correlations);

  return (
    <div data-tour="conseils-chart" style={{ padding: embedded ? "2px 0 0" : "18px 0", color: "#fff", position: "relative" as const }}>
      {!embedded && <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />}
      <div style={{ position: "relative", zIndex: 2 }}>
        {!embedded && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Ce qui t&apos;aide ou te pénalise</div>
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>}

        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.5, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {bestHelper && (
            <div>
              <span style={{ fontWeight: 900, color: "#2f9e44" }}>✓ Continue : </span>
              <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span>
              {" "}améliore ta récupération de{" "}
              <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#2f9e44" }}>+{bestHelper.impact.toFixed(1)} pts</span> en moyenne.
            </div>
          )}
          {worstHurt && (
            <div>
              <span style={{ fontWeight: 900, color: "#d10000" }}>✗ Évite : </span>
              <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span>
              {" "}pénalise ta récupération de{" "}
              <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#d10000" }}>{worstHurt.impact.toFixed(1)} pts</span> en moyenne.
            </div>
          )}
          {!bestHelper && !worstHurt && (
            <div style={{ color: "rgba(255,255,255,.60)" }}>Aucun comportement n&apos;a d&apos;effet marqué sur ta récupération pour l&apos;instant.</div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" as const }}>
          {correlations.map(c => {
            const { color, statusLabel, impactStr } = behaviorStatus(c.impact);
            const dd = c.dominantDimension;
            const showDominant = dd && Math.abs(dd.impact) >= 0.3;
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{c.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{c.label}</div>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" as const, color, background: `${color}26` }}>
                      {statusLabel} {impactStr}
                    </span>
                  </div>
                  {showDominant && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
                      Impacte {dd!.impact > 0 ? "positivement" : "négativement"} <b style={{ color: "rgba(255,255,255,.65)" }}>{DIMENSION_PHRASE[dd!.key]}</b> ({dd!.impact > 0 ? "+" : ""}{dd!.impact.toFixed(1)})
                    </div>
                  )}
                  <BehaviorGauge c={c} maxAbs={maxAbs} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,.28)", lineHeight: 1.5 }}>Basé sur tes {filledDays} derniers jours · veille → jour même</div>
      </div>
    </div>
  );
}
