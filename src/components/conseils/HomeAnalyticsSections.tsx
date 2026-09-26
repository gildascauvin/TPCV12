"use client";

/* Extrait de ConseilsClient.tsx (2026-09-24, "point 1" — fusionner Charge/Récupération/Comportements
   dans l'accueil, voir POC `poc-coach-context_4.html`, tabsHtml()/tabBody() : Entraînement/Charge/
   Récupération/Comportements en tabs sur l'Accueil). Source unique — TodayClient.tsx (nouveaux
   onglets) ET ConseilsClient.tsx (bloc "Tests de performance" seul désormais) partagent ces pièces
   plutôt que de dupliquer la logique de rendu. Comportement/formules 100% inchangés, seul
   l'emplacement dans l'UI change. */

import ShareButton from "@/components/sessions/ShareButton";
import SparkLineClient, { FORM_ZONES, formToChartPosition, WELLNESS_ZONES } from "@/components/conseils/SparkLineClient";
import { dimensionBadgesSeries, dimensionInsightText, DIMENSION_ARROW, dimensionBadgeColor, type DimensionKey, type Perspective, type WellnessBaselineResult } from "@/lib/wellnessBaseline";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import { sigDimInfo } from "@/lib/fatigueSignature";
import { wellnessColor } from "@/lib/wellness";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { ConseilsData, BehaviorCorrelation } from "@/lib/conseilsData";
import type { CoachAthlete } from "@/types";
import { AthleteRing } from "@/app/(app)/coach/athletes/AthletesClient";

function windowFor(data: ConseilsData, rangeMode: RangeMode) {
  const n = rangeMode === "quarter" ? 90 : rangeMode === "month" ? 28 : 7;
  const series = data.timeSeries.slice(-n);
  const baseline = data.wellnessBaselineSeries.slice(-n);
  return { series, baseline };
}

/* ── En-tête partagé (2026-09-24, allégé en suite — retour de Gildas : "pas besoin de répéter
   Charge et récupération... tu peux supprimer '[sous-titre]/[N séances]'") — insight croisé
   charge/récup/RPE + alerte récup, affiché au-dessus du contenu des 3 onglets Charge/Récupération/
   Comportements. Le sous-titre descriptif et le badge de comptage de séances ont été retirés :
   redondants avec le titre de l'onglet actif (juste au-dessus) et avec le "Nj de données" déjà
   affiché sur la carte Comportements. Ne reste que : le chip "Exemple" (démo), le partage, l'insight
   croisé lui-même, et l'alerte récup. */
export function CrossInsightBanner({ data, isDemoData = false }: { data: ConseilsData; isDemoData?: boolean }) {
  const { sig, trendText, trendEmoji, trendAction, recoveryAlert } = data;
  const { series: last7Series } = windowFor(data, "week");
  const zoneDates = last7Series.map(p => p.date);
  const zoneAcwr = last7Series.map(p => p.acwr);

  return (
    <div data-tour="fatigue-signature" style={{ padding: "0 0 14px", color: "#fff", position: "relative" as const }}>
      <div style={{ position: "absolute", right: -80, bottom: -90, width: 240, height: 210, background: "rgba(212,64,0,.18)", borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none" }} />
      {(isDemoData || (sig.signals !== 0 && trendText)) && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, position: "relative" as const, zIndex: 2, marginBottom: sig.signals === 0 ? 0 : 8 }}>
          {isDemoData && (
            <div style={{ fontFamily: "var(--font-mono), monospace", background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.85)", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const }}>
              🔎 Exemple
            </div>
          )}
          {sig.signals !== 0 && trendText && (
            <ShareButton
              resourceType="signature"
              variant="dark"
              buildSnapshot={() => ({
                emoji: trendEmoji, action: trendAction, insight: trendText,
                chargePoints: zoneAcwr, recoveryPoints: last7Series.map(p => p.recovery),
                recoveryPoints2: last7Series.map(p => p.form !== null ? formToChartPosition(p.form) : null),
                dates: zoneDates, weekLabels: false,
              })}
              title="Ma signature de fatigue"
              text={trendText}
            />
          )}
        </div>
      )}

      {sig.signals === 0 ? (
        <div style={{ position: "relative" as const, zIndex: 2, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: "16px 18px", fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>
          Termine des séances avec RPE + durée pour construire ta signature de fatigue.
        </div>
      ) : (
        <div style={{ position: "relative" as const, zIndex: 2 }}>
          {trendText && (
            <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "13px 15px", fontSize: 14, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>
              {trendEmoji} {trendAction && <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55" }}>{trendAction} — </span>}{trendText}
            </div>
          )}
          {recoveryAlert && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(242,138,0,.12)", border: "1px solid rgba(242,138,0,.35)", borderRadius: 14, padding: "10px 14px", marginTop: 14 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: 14, color: "#f28a00", lineHeight: 1.45, fontWeight: 600 }}>
                Séance planifiée demain — ta récupération est fragile. Considère de réduire l&apos;intensité.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChargeSection({ data, rangeMode, onRangeModeChange }: { data: ConseilsData; rangeMode: RangeMode; onRangeModeChange: (m: RangeMode) => void }) {
  const { loadInfo, monotonyInfo, strainInfo, fitnessTrendInfo, fatigueTrendInfo, chargeInsight } = data;
  const { isMd } = useBreakpoint();
  const { series } = windowFor(data, rangeMode);
  const zoneAcwr = series.map(p => p.acwr);
  const zoneLoads = series.map(p => p.load);
  const zoneDates = series.map(p => p.date);
  const zoneMonotony = series.map(p => p.monotony);
  const zoneStrain = series.map(p => p.strain);

  return (
    <div>
      {/* Titre retiré (2026-09-24, retour de Gildas : "pas besoin de répéter ⚡ Charge... vu que
         c'est le titre de l'onglet") — le toggle 7j/28j/90j prend sa place, "à côté du chart"
         plutôt que dans le header tout en haut de la page (retiré de CalendarHeader). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 }}>
        <RangeToggle mode={rangeMode} onChange={onRangeModeChange} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {/* Tooltip = insight PERSONNALISÉ (xxxInfo.text, déjà "ta charge chronique est en
             baisse..."), plus la définition générique/neutre METRIC_DEFINITIONS (2026-09, retour de
             Gildas — "ce qu'on a dans le tooltip mais en insight personnalisé synthétique"). ACWR
             (loadInfo) ajouté — jusqu'ici seulement visible via les bandes de couleur du chart,
             jamais comme badge à part entière. */}
          <ZoneBadge label={loadInfo.label} color={loadInfo.color} definition={loadInfo.text} />
          <ZoneBadge label={monotonyInfo.label} color={monotonyInfo.color} definition={monotonyInfo.text} />
          {strainInfo && <ZoneBadge label={strainInfo.label} color={strainInfo.color} definition={strainInfo.text} />}
          {fitnessTrendInfo && <ZoneBadge label={fitnessTrendInfo.label} color={fitnessTrendInfo.color} definition={fitnessTrendInfo.text} />}
          {fatigueTrendInfo && <ZoneBadge label={fatigueTrendInfo.label} color={fatigueTrendInfo.color} definition={fatigueTrendInfo.text} />}
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
        {chargeInsight}
      </div>
      {/* overflowY:"visible" explicite (2026-09-25, régression trouvée par Gildas — "j'ai plus les
         tooltips visibles au survol des charts") : `overflow-x: hidden` seul fait calculer
         `overflow-y` à "auto" par la spec CSS (pas "visible"), donc le tooltip de ZoneSparkline
         (positionné au-dessus du chart via `bottom: calc(100% + 8px)`, hors de la boîte de CE
         wrapper) se retrouvait rogné — même piège déjà corrigé plus bas pour SparkLineClient/
         RecuperationSection, manqué ici lors de l'extraction de ce fichier. */}
      <div style={{ overflowX: "hidden", overflowY: "visible", width: "100%" }}>
        {/* Hauteur plus grande en mobile (2026-09-26, retour de Gildas — "sur mobile les charts sont
           trop petits en hauteur") : ce n'était pas un oubli de hauteur, c'est que le SVG est en
           `width:100%` + `aspectRatio: 400/H`, donc sa hauteur RENDUE est proportionnelle à la
           largeur — mobile étroit = chart court (~147px à 390px de viewport, contre ~286px en
           desktop, l'inverse de ce qu'on veut). Passer un H plus grand rend le ratio moins large,
           donc le chart plus haut, sans jamais déformer les traits (le viewBox ET l'aspect-ratio CSS
           utilisent tous les deux ce H, donc l'échelle reste uniforme malgré
           preserveAspectRatio="none"). Précédent identique : FrisePreviews.tsx. */}
        <ZoneSparkline points={zoneAcwr} dates={zoneDates} loads={zoneLoads} monotony={zoneMonotony} strain={zoneStrain} weekLabels={rangeMode !== "week"} height={isMd ? 168 : 240} />
      </div>
    </div>
  );
}

export function RecuperationSection({ data, rangeMode, onRangeModeChange, perspective = "athlete" }: { data: ConseilsData; rangeMode: RangeMode; onRangeModeChange: (m: RangeMode) => void; perspective?: Perspective }) {
  const { formInfo, recoveryInsight, recoveryInfo } = data;
  const { isMd } = useBreakpoint();
  const { series, baseline } = windowFor(data, rangeMode);
  const zoneDates = series.map(p => p.date);
  const recoveryRelativePoints = baseline.map(b => b?.hasEnoughHistory ? b.relativeScore : null);
  const recoveryRawPoints = series.map(p => p.recovery);
  const dimensionBadgesFull = dimensionBadgesSeries(data.wellnessBaselineSeries);
  // Fix (2026-09-24) : le slicing ne connaissait que "month"/"week" — le cran "quarter" (90j)
  // retombait à tort sur la fenêtre 7j pour les badges de dimension au survol (même bug déjà
  // corrigé pour windowFor() ci-dessus, manqué ici — 2 calculs séparés au lieu d'un seul).
  const rangeN = rangeMode === "quarter" ? 90 : rangeMode === "month" ? 28 : 7;
  const windowDimensionBadges = dimensionBadgesFull.slice(-rangeN);
  const todayDimensionBadges = dimensionBadgesFull[dimensionBadgesFull.length - 1];

  return (
    <div>
      {/* Titre retiré, toggle 7j/28j/90j à sa place — même principe que ChargeSection ci-dessus. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 }}>
        <RangeToggle mode={rangeMode} onChange={onRangeModeChange} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {/* Badge composite "Récupération" (2026-09, ajouté — jusqu'ici absent de cette page,
             seulement visible via les 4 dimensions et le chart) + tooltip pédagogique personnalisé
             sur chaque badge, y compris les 4 dimensions qui n'en avaient aucun (juste la flèche) —
             même principe que ChargeSection ci-dessus. */}
          <ZoneBadge label={recoveryInfo.label} color={recoveryInfo.color} definition={recoveryInfo.text} />
          {todayDimensionBadges?.map((b: { key: DimensionKey; label: string; arrow: "up" | "down" | "stable" }) => (
            <ZoneBadge key={b.key} label={`${b.label} ${DIMENSION_ARROW[b.arrow]}`} color={dimensionBadgeColor(b.arrow)} definition={dimensionInsightText(b.key, data.wellnessBaseline, perspective)} />
          ))}
          {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={formInfo.text} />}
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
        {recoveryInsight}
      </div>
      {/* overflowX:hidden (2026-09-24, "les charts dépassent à droite") en garde-fou — le chart
         lui-même est déjà en width:100%, mais une tooltip/label imprévu ne doit jamais pousser la
         page plus large que l'écran. overflowY reste visible : la tooltip (position:absolute,
         au-dessus du chart) ne doit jamais être rognée verticalement. */}
      <div style={{ borderRadius: 10, overflowX: "hidden", overflowY: "visible", marginBottom: 6 }}>
        {/* `height` mobile : même raison exactement que ChargeSection ci-dessus (aspect-ratio =
           hauteur RENDUE proportionnelle à la largeur), même viewBox W=400. */}
        <SparkLineClient
          points={recoveryRelativePoints} pointsRaw={recoveryRawPoints} dates={zoneDates} color={recoveryInfo.color}
          maxVal={100} height={isMd ? 168 : 240} animDelay={300}
          metricType="recovery" uid="recovery-home" chartType="line" sequentialFill
          zones1={WELLNESS_ZONES}
          dimensionBadgesAt={windowDimensionBadges}
          points2={series.map(p => p.form !== null ? formToChartPosition(p.form) : null)}
          points2Raw={series.map(p => p.form)} zones2={FORM_ZONES}
          weekLabels={rangeMode !== "week"}
        />
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.25)", fontStyle: "italic" as const, textAlign: "right" as const }}>Trait dégradé = récupération (clair = en forme) · Pointillé coloré = Forme · Bande = écart entre les deux</div>
    </div>
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

  const sorted = [...rows].sort((r1, r2) => {
    if (metric === "charge") {
      const dev = (r: typeof r1) => { const last = r.data.zoneAcwr[r.data.zoneAcwr.length - 1]; return last === null ? 0 : Math.abs(last - 1); };
      return dev(r2) - dev(r1);
    }
    if (metric === "recuperation") {
      const score = (r: typeof r1) => r.data.wellnessBaseline?.hasEnoughHistory ? r.data.wellnessBaseline.relativeScore : (r.data.timeSeries[r.data.timeSeries.length - 1]?.recovery ?? 50);
      return score(r1) - score(r2);
    }
    const sev = (r: typeof r1) => { const { worstHurt } = topBehaviors(r.data.correlations); return Math.abs(worstHurt?.impact ?? 0); };
    return sev(r2) - sev(r1);
  });

  // Groupé en préservant l'ordre de sévérité déjà calculé ci-dessus — jamais retrié à l'intérieur
  // d'une section.
  const buckets = new Map<string, { order: number; rows: typeof sorted }>();
  for (const row of sorted) {
    const { title, order } = sectionFor(metric, row.data);
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
            {bucketRows.map(({ athlete: a, data }) => {
              // Score de récupération — même résolution que RecuperationSection, hissé pour aussi
              // alimenter l'AthleteRing (un seul score par athlète, jamais deux calculs qui
              // pourraient diverger entre le ring et les badges).
              const recoveryScore = data.wellnessBaseline?.hasEnoughHistory ? data.wellnessBaseline.relativeScore : (data.timeSeries[data.timeSeries.length - 1]?.recovery ?? null);
              const statusColor = metricStatusColor(metric, data);

              let statusBadge: React.ReactNode = null;
              let signalBadges: React.ReactNode = null;
              let sparklinePoints: { value: number | null; color: string }[] | null = null;
              let insightBox: React.ReactNode = null;

              if (metric === "charge") {
                statusBadge = <ZoneBadge label={data.loadInfo.label} color={data.loadInfo.color} definition={data.loadInfo.text} />;
                const signals = [data.fitnessTrendInfo, data.fatigueTrendInfo, data.monotonyInfo, data.strainInfo]
                  .filter((x): x is { label: string; color: string; text: string } => !!x);
                signalBadges = signals.length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {signals.map((s, i) => <ZoneBadge key={i} size="sm" label={s.label} color={s.color} definition={s.text} />)}
                  </div>
                );
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
                if (data.trendText) {
                  insightBox = (
                    <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 12.5, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>
                      {data.trendEmoji} {data.trendAction && <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55" }}>{data.trendAction} — </span>}{data.trendText}
                    </div>
                  );
                }
              } else if (metric === "recuperation") {
                statusBadge = <ZoneBadge label={data.recoveryInfo.label} color={data.recoveryInfo.color} definition={data.recoveryInfo.text} />;
                const todayDims = dimensionBadgesSeries(data.wellnessBaselineSeries).slice(-1)[0];
                const dimBadges = (todayDims ?? []).map((b: { key: DimensionKey; label: string; arrow: "up" | "down" | "stable" }, i: number) => (
                  <ZoneBadge key={`d${i}`} size="sm" label={`${b.label} ${DIMENSION_ARROW[b.arrow]}`} color={dimensionBadgeColor(b.arrow)} definition={dimensionInsightText(b.key, data.wellnessBaseline, "coach")} />
                ));
                signalBadges = (dimBadges.length > 0 || data.formInfo) && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {dimBadges}
                    {data.formInfo && <ZoneBadge size="sm" label={`FORME ${data.formInfo.label}`} color={data.formInfo.color} definition={data.formInfo.text} />}
                  </div>
                );
                const recentSeries = data.timeSeries.slice(-7);
                const recentBaseline: (WellnessBaselineResult | null)[] = data.wellnessBaselineSeries.slice(-7);
                sparklinePoints = recentSeries.map((p, i) => {
                  const b = recentBaseline[i];
                  const v = b?.hasEnoughHistory ? b.relativeScore : p.recovery;
                  return { value: v, color: v !== null ? wellnessColor(v) : "rgba(255,255,255,.25)" };
                });
                if (data.trendText) {
                  insightBox = (
                    <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 12.5, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>
                      {data.trendEmoji} {data.trendAction && <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55" }}>{data.trendAction} — </span>}{data.trendText}
                    </div>
                  );
                }
              } else {
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
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AthleteRing score={recoveryScore} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {a.name}
                        </span>
                        {statusBadge}
                      </div>
                    </div>
                    {isMd && sparklinePoints && (
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4, flexShrink: 0 }}>
                        <MiniBars points={sparklinePoints} />
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.35)" }}>7j</span>
                      </div>
                    )}
                  </div>
                  {signalBadges}
                  {insightBox}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BehaviorImpactCard({ correlations, filledDays }: { correlations: BehaviorCorrelation[]; filledDays: number }) {
  const MIN_DAYS = 10;

  if (filledDays < MIN_DAYS || correlations.length === 0) {
    const remaining = Math.max(0, MIN_DAYS - filledDays);
    return (
      <div data-tour="conseils-chart" style={{ padding: "18px 0", color: "#fff", position: "relative" as const }}>
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
    <div data-tour="conseils-chart" style={{ padding: "18px 0", color: "#fff", position: "relative" as const }}>
      <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Ce qui t&apos;aide ou te pénalise</div>
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>

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
