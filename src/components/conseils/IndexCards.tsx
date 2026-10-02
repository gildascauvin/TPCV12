"use client";

import { useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import MetricChart, { ExampleNote } from "@/components/conseils/MetricChart";
import { dimensionBadgesSeries, DIMENSION_ARROW, dimensionBadgeColor, DIMENSION_KEYS, type DimensionKey, type Perspective } from "@/lib/wellnessBaseline";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import { displaySeverityOf, type DayPoint } from "@/lib/fatigueSignature";
import { wellnessColor } from "@/lib/wellness";
import {
  METRICS, METRIC_GROUPS, TREND_ARROW, TREND_IS_STATUS, AGG_BANDS, aggregateFor,
  chartSpecFor, DIMENSION_CHART_LABELS, dimensionSpec, rhrSpec, hrvSpec, impactFor, lastOf, prettyStatus,
  sessionQualifier, sessionReference, seriesOf, statusDisplayColor, trendFor, TREND_STATUS_LABEL,
  type MetricGroup, type MetricKey,
} from "@/lib/metricCards";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import type { ConseilsData } from "@/lib/conseilsData";

/* Cartes d'indice de l'Accueil (2026-09-28) — variante E1 du POC `charge-variantes.html`, retenue
   par Gildas. Une carte par indice : à gauche titre, tendance chiffrée et impact de cette tendance ;
   à droite l'aperçu, le statut et la valeur. Le détail (chart plein) se déplie au clic.
   Toute la logique (bornes, zones, formats, textes) vit dans src/lib/metricCards.ts. */

type Info = { label: string; color: string; text: string } | null;

/* Statut de chaque indice — pris tel quel dans ConseilsData, qui l'a déjà calculé via sigDimInfo().
   Seule la charge en UA n'y a pas d'entrée : elle n'a aucun seuil absolu, son statut est l'écart à
   MA séance moyenne des 4 dernières semaines. */
function statusOf(metric: MetricKey, data: ConseilsData, series: DayPoint[], perspective: Perspective): Info {
  switch (metric) {
    case "load": {
      const v = lastOf("load", series);
      const q = sessionQualifier(v, sessionReference(data.timeSeries));
      const color = q.label === "Dure" ? "#a8500f" : q.label === "Légère" ? "#ffd2b0" : q.label === "Repos" ? "rgba(255,255,255,.35)" : "#ef8544";
      const pct = q.pct;
      return {
        label: q.label, color,
        text: v === null || v <= 0
          ? "Jour de repos : aucune séance enregistrée."
          : pct === null ? "Pas encore assez d'historique pour situer cette séance."
          : Math.abs(pct) <= 10
            ? `${perspective === "coach" ? "Sa" : "Ta"} séance du jour est dans la moyenne ${perspective === "coach" ? "de ses" : "de tes"} 4 dernières semaines.`
            : `${perspective === "coach" ? "Sa" : "Ta"} séance du jour est ${Math.abs(pct)} % ${pct > 0 ? "au-dessus" : "en dessous"} ${perspective === "coach" ? "de sa" : "de ta"} séance type des 4 dernières semaines.`,
      };
    }
    case "acwr": return data.loadInfo;
    case "strain": return data.strainInfo;
    case "monotony": return data.monotonyInfo;
    case "recovery": return data.recoveryInfo;
    case "form": return data.formInfo;
    case "fitness": return data.fitnessTrendInfo;
    case "fatigue": return data.fatigueTrendInfo;
  }
}

/* Carte supplémentaire rendue avec le MÊME gabarit que les cartes d'indice (2026-09-30, Gildas :
   "les comportements dans récupération sous la même forme que les autres : une card, au clic le
   rapport complet"). L'appelant fournit le contenu résumé et le rapport déplié. */
export type ExtraIndexCard = {
  key: string;
  label: string;
  status: string;
  statusColor: string;
  value?: string;
  accent: string | null;   // couleur du liseré gauche quand la carte "décroche", null sinon
  impact: string;
  preview: React.ReactNode;
  trend: string;
  body: React.ReactNode;
};

export default function IndexCards({ data, rangeMode, onRangeModeChange, group, insight, perspective = "athlete", extraCards = [], lockedHistory = null, example = false }: {
  data: ConseilsData;
  /* Le toggle 7/28/90 vit DANS le chart déplié (2026-09-28, arguments de Gildas : les aperçus ne
     sont pas des charts complets, et avec des cartes qui se déplient un contrôle en haut de section
     devient inatteignable sans remonter). La fenêtre reste UNIQUE et partagée par toutes les cartes :
     la ligne de tendance de chacune la lit aussi, leur donner des fenêtres séparées les rendrait
     incomparables entre elles. */
  rangeMode: RangeMode;
  onRangeModeChange: (m: RangeMode) => void;
  group: MetricGroup;
  /* L'insight croisé de la section (chargeInsight / recoveryInsight) — reste au-dessus des cartes :
     c'est le scan en 2 secondes, il ne doit jamais être remplacé par le détail d'une métrique. */
  insight: string;
  perspective?: Perspective;
  extraCards?: ExtraIndexCard[];
  /* Freemium (2026-09-30) : voir `locked` plus bas. Absent = tout lisible. */
  lockedHistory?: { onUnlock: () => void } | null;
  /* Données d'exemple (2026-10-01, Gildas : pas de bandeau en haut, le message sur chaque chart) :
     pastille "Exemple" sur la jauge et sur chaque carte, phrase explicite au-dessus de chaque chart. */
  example?: boolean;
}) {
  const { isMd } = useBreakpoint();
  const [open, setOpen] = useState<string | null>(null);
  /* Sous-jacent affiché DANS la carte Récupération (null = le score composite). */
  const [subDim, setSubDim] = useState<DimensionKey | "rhr" | "hrv" | null>(null);
  const days = rangeMode === "quarter" ? 90 : rangeMode === "month" ? 28 : 7;
  const series = data.timeSeries.slice(-days);
  const sessionRef = sessionReference(data.timeSeries);
  const baselineWindow = data.wellnessBaselineSeries.slice(-days);
  /* Même règle que le chart de prod : on ne trace le relatif que si l'historique le permet, sinon
     rien — jamais un score absolu mélangé à une échelle de percentile. */
  const recoveryRelative = baselineWindow.map(b => (b?.hasEnoughHistory ? b.relativeScore : null));
  const dimBadges = dimensionBadgesSeries(data.wellnessBaselineSeries).slice(-1)[0] ?? null;
  /* Montre (Apple Santé, 2026-09-30) : le sommeil mesuré complète le déclaré et la FC au repos entre
     dans le score. Ligne de synthèse sous la carte + sous-jacent "FC repos" dès qu'une FC existe sur
     la période. Rien de tout ça sans montre : la carte reste 100 % subjective. */
  const hasRhr = baselineWindow.some(b => b?.rhr);
  const hasHrv = baselineWindow.some(b => b?.hrv);
  const lastB = data.wellnessBaselineSeries.slice(-1)[0] ?? null;
  const deviceToday = (() => {
    if (!lastB) return null;
    const parts: string[] = [];
    const sl = lastB.dimensions.sleep;
    if (sl.deviceMinutes != null) {
      const m = Math.round(sl.deviceMinutes);
      parts.push(`sommeil ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`);
    }
    if (lastB.rhr) parts.push(`FC au repos ${Math.round(lastB.rhr.bpm)} bpm (norme ${Math.round(lastB.rhr.norm)})`);
    if (lastB.hrv) parts.push(`VFC ${Math.round(lastB.hrv.ms)} ms (norme ${Math.round(lastB.hrv.norm)})`);
    return parts.length ? parts.join(" · ") + "." : null;
  })();

  /* Score agrégé de l'onglet, centré au-dessus des cartes (2026-09-29, Gildas) — une POSITION sur un
     axe à 3 niveaux, pas une note ; voir aggregateFor() pour ce que chacun agrège et pourquoi.
     Pas de légende d'axe sous la jauge (demandée explicitement retirée) : le libellé de niveau est
     dans l'arc, et les bandes colorées disent déjà de quel côté on est. */
  const agg = aggregateFor(group, data);

  /* Gabarit d'une carte : résumé cliquable puis contenu déplié. Partagé par les cartes d'indice et
     la carte supplémentaire (comportements), pour qu'elles ne puissent pas diverger. */
  /* Freemium (2026-09-30) : le constat reste lisible (jauge agrégée, nom, statut · valeur, ligne
     montre, puces) ; ce qu'on en tire est flouté (insights, aperçus, tendances, séries des charts). */
  const locked = !!lockedHistory;
  const blur: React.CSSProperties = locked ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : {};
  const blurChart: React.CSSProperties = locked ? { filter: "blur(10px)", opacity: .6, userSelect: "none", pointerEvents: "none" } : {};
  const coachP = perspective === "coach";
  const lockedCopy = group === "charge"
    ? { title: coachP ? "Son analyse de charge est prête" : "Ton analyse de charge est prête",
        sub: coachP ? "Elle croise sa charge récente, sa charge chronique et la variété de ses séances." : "Elle croise ta charge récente, ta charge chronique et la variété de tes séances." }
    : { title: coachP ? "Son analyse de récupération est prête" : "Ton analyse de récupération est prête",
        sub: coachP ? "Elle croise son ressenti, sa forme et ses comportements." : "Elle croise ton ressenti, ta forme et tes comportements." };
  const exampleText = perspective === "coach"
    ? "Ses analyses arrivent après ~1 semaine de check-ins et de séances."
    : "Tes analyses arrivent après ~1 semaine de check-ins et de séances.";
  /* Freemium (2026-10-02) : « les mesures sont gratuites, les décisions payantes ». Statut et valeur
     d'un indice restent nets ; aperçu, tendance et séries des charts sont floutés comme en prod
     (sinon on donne tout). L'impact écrit (ce qu'il faut en
     faire) et l'insight de section sont floutés. La carte Comportements est une analyse : floutée. */
  const renderCard = (key: string, c: Omit<ExtraIndexCard, "key" | "body">, body: React.ReactNode, analysis = false) => {
    const statusBlur = analysis ? blur : {};
    const previewBlur = blur;
    const isOpen = open === key;
    return (
      /* minWidth 0 : sans lui, la rangée de filtres de la carte Récupération dépliée (nowrap, jusqu'à 7
         chips avec FC repos/VFC) imposait sa largeur à la carte et élargissait toute la page
         (scroll horizontal dans l'app iOS, 2026-09-30). La rangée garde son propre scroll. */
      <div key={key} style={{ minWidth: 0 }}>
        <button
          onClick={() => setOpen(isOpen ? null : key)}
          aria-expanded={isOpen}
          style={{
            width: "100%", textAlign: "left" as const, cursor: "pointer",
            display: "grid", gridTemplateColumns: "1fr auto 14px", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,.055)",
            border: "1px solid rgba(255,255,255,.10)",
            borderLeft: c.accent ? `3px solid ${c.accent}` : "1px solid rgba(255,255,255,.10)",
            borderRadius: 12, borderBottomLeftRadius: isOpen ? 0 : 13, borderBottomRightRadius: isOpen ? 0 : 13,
            padding: "13px 15px", color: "#fff", font: "inherit",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column" as const, gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#fff" }}>
              {c.label}
            </span>
            <span style={{ fontSize: 17.5, fontWeight: 800, color: c.statusColor, letterSpacing: "-.01em", lineHeight: 1.25, ...statusBlur }}>
              {c.status}
              {c.value && (
                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "rgba(255,255,255,.55)" }}>{` · ${c.value}`}</span>
              )}
            </span>
            {isMd && <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4, marginTop: 4, ...blur }}>{c.impact}</span>}
          </span>

          <span style={{ position: "relative", display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 5, flex: "0 0 auto", ...previewBlur }}>
            {example && !locked && <ExampleNote compact top="40%" />}
            <span style={{ width: 118 }}>{c.preview}</span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.55)", textAlign: "right" as const, letterSpacing: "0.01em" }}>
              {c.trend}
            </span>
          </span>

          <span style={{ color: "rgba(255,255,255,.35)", fontSize: 17, textAlign: "right" as const }}>{isOpen ? "⌄" : "›"}</span>
          {!isMd && <span style={{ gridColumn: "1 / -1", fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.4, marginTop: 8, ...blur }}>{c.impact}</span>}
        </button>

        {isOpen && (
          <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)", borderTop: 0, borderRadius: "0 0 12px 12px", padding: "14px 15px 10px", marginTop: -1, overflowX: "hidden", overflowY: "visible" as const }}>
            {body}
          </div>
        )}
      </div>
    );
  };

  const content = (
    <div>
      {/* Jauge puis insight, centrés dans le même bloc (2026-09-29, Gildas) : c'est l'insight de la
          SECTION, donc le texte le plus important de l'écran — il passe devant les impacts des
          cartes en taille, et il est aligné sous la jauge plutôt que collé au bord à gauche.
          `maxWidth` : au-delà d'une soixantaine de caractères par ligne un texte centré devient
          pénible à lire, la colonne est donc bornée même sur grand écran. */}
      <div style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", marginBottom: 16, gap: 12,
      }}>
        {agg && <AggregateGauge pos={agg.pos} band={agg.band} bands={AGG_BANDS[group]} />}
        {/* Analyses avant 2 semaines (2026-10-01) : on dit qu'elles sont partielles plutôt que
            d'attendre ou de montrer l'exemple. */}
        {!example && group === "recup" && lastB?.provisional && (
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#7dd3fc" }}>
            Norme provisoire · {lastB.historyDays}/12 check-ins
          </div>
        )}
        {!example && group === "charge" && data.loadInfo.label === "HISTORIQUE INSUFFISANT" && (
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#7dd3fc" }}>
            Charge habituelle disponible après 14 jours
          </div>
        )}
        {/* 17,5px : la même taille que la ligne "statut · valeur" des cartes, mais en graisse plus
            légère. Centré et seul en haut de section, il domine sans crier — une graisse 800 en
            plus de la taille entrerait en concurrence avec chaque carte au lieu de les coiffer. */}
        <div style={{ position: "relative", maxWidth: 460, display: "flex", alignItems: "center", minHeight: locked ? 112 : undefined }}>
        {/* Freemium (2026-10-02) : la pancarte se pose sur le 1er flou de l'écran (l'insight) ;
            les flous suivants (cartes, charts) n'ont plus aucun bouton. */}
        {locked && (
          <div style={{ position: "absolute", inset: "-6px 0", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: "0 8px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.25, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{lockedCopy.title}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.75)", lineHeight: 1.4, maxWidth: 300 }}>{lockedCopy.sub}</div>
            <button onClick={() => lockedHistory?.onUnlock()} style={{ marginTop: 2, border: "none", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800, borderRadius: 999, padding: "9px 16px", background: "#D44000" }}>
              Activer l'ajustement
            </button>
          </div>
        )}

          <div style={{ fontSize: 17.5, fontWeight: 600, color: "rgba(255,255,255,.92)", lineHeight: 1.45, letterSpacing: "-.01em", ...blur }}>
            {insight}
          </div>
          {/* Données d'exemple : la mention couvre l'insight, jamais la jauge et son score. */}
          {example && !locked && <ExampleNote text={exampleText} top="50%" />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
        {METRIC_GROUPS[group].map(metric => {
          const meta = METRICS[metric];
          const info = statusOf(metric, data, series, perspective);
          const relLast = recoveryRelative.filter((x): x is number => x !== null).slice(-1)[0] ?? null;
          const v = metric === "recovery" ? relLast : lastOf(metric, series);
          const trend = trendFor(metric, series, days, metric === "recovery" ? recoveryRelative : undefined);
          /* displaySeverityOf : la sous-charge est hors zone, donc la carte doit porter son texte
             d'action et pas la pédagogie "tout va bien" (même bug que l'insight, 2026-09-29). */
          const decroche = info ? displaySeverityOf(info.color) !== "good" : false;
          const impact = impactFor(metric, info?.text ?? null, trend.dir, decroche, perspective);
          const trendIsStatus = TREND_IS_STATUS.includes(metric);
          /* Fitness et fatigue n'ont pas de zone : leur statut EST leur direction, écrite en toutes
             lettres et dérivée de la tendance que la carte affiche — jamais de celle que prod
             calcule sur sa propre fenêtre (voir impactFor). */
          const statusLabel = trendIsStatus ? TREND_STATUS_LABEL[trend.dir] : prettyStatus(metric, info?.label) || "—";
          const color = statusDisplayColor(metric, info?.color);
          const showValue = v !== null && !trend.showsValue;

          return renderCard(metric, {
            label: meta.label, status: statusLabel, statusColor: color,
            value: showValue ? meta.fmt(v as number) : undefined,
            accent: decroche ? (info?.color ?? color) : null,
            impact,
            preview: <Preview metric={metric} series={series} sessionRef={sessionRef} override={metric === "recovery" ? recoveryRelative : undefined} />,
            trend: `${TREND_ARROW[trend.dir]} ${trend.text}`,
          }, (
            <>
                  {/* Les sous-jacents filtrent le chart DANS la carte Récupération : ce sont les
                      composantes du score, pas des indices frères — en faire des cartes de plus
                      donnerait une liste plate sans hiérarchie. La flèche du badge est celle déjà
                      calculée par dimensionBadgesSeries(), pas un second calcul. */}
                  {metric === "recovery" && deviceToday && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", lineHeight: 1.45, marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#fff", marginRight: 6 }}>MONTRE</span>
                      {deviceToday}
                    </div>
                  )}
                  {metric === "recovery" && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" as const, overflowX: "auto", scrollbarWidth: "none" as const, marginBottom: 12, paddingBottom: 2 }}>
                      {([null, ...DIMENSION_KEYS, ...(hasRhr ? ["rhr" as const] : []), ...(hasHrv ? ["hrv" as const] : [])] as (DimensionKey | "rhr" | "hrv" | null)[]).map(dim => {
                        const active = subDim === dim;
                        const badge = dim && dim !== "rhr" && dim !== "hrv" ? dimBadges?.find(b => b.key === dim) : null;
                        return (
                          <span
                            key={dim ?? "composite"}
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setSubDim(dim); }}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setSubDim(dim); } }}
                            style={{
                              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                              fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 600,
                              padding: "4px 9px", borderRadius: 999, flex: "0 0 auto", whiteSpace: "nowrap" as const,
                              background: active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)",
                              border: `1px solid ${active ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.10)"}`,
                              color: active ? "#fff" : "rgba(255,255,255,.55)",
                            }}
                          >
                            {dim === "rhr" ? "FC repos" : dim === "hrv" ? "VFC" : dim ? DIMENSION_CHART_LABELS[dim] : "Score"}
                            {badge && <span style={{ color: dimensionBadgeColor(badge.arrow) }}>{DIMENSION_ARROW[badge.arrow]}</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginBottom: 10, width: "fit-content" }}>
                    <RangeToggle mode={rangeMode} onChange={onRangeModeChange} />
                  </div>
                  <MetricChart
                    spec={metric === "recovery" && subDim === "rhr"
                      ? rhrSpec(baselineWindow, series.map(p => p.date))
                      : metric === "recovery" && subDim === "hrv"
                      ? hrvSpec(baselineWindow, series.map(p => p.date))
                      : metric === "recovery" && subDim && subDim !== "rhr" && subDim !== "hrv"
                      ? dimensionSpec(subDim, baselineWindow, series.map(p => p.date))
                      : chartSpecFor(metric, series, { sessionRef, recoveryRelative })}
                    weekLabels={days > 7} locked={locked} height={200}
                    exampleNote={example ? exampleText : undefined}
                  />
                            </>
          ));
        })}
        {extraCards.map(c => renderCard(c.key, { ...c }, (
          <div style={{ position: "relative" }}>
            <div style={blurChart}>{c.body}</div>
            {example && !locked && <ExampleNote text={exampleText} top="50%" />}
          </div>
        ), true))}
      </div>
    </div>
  );

  return content;
}

/* ── aperçus ─────────────────────────────────────────────────────────────────────────────────────
   L'aperçu suit la NATURE de l'indice, pas un gabarit unique : anneau pour ceux qui ont un seuil
   absolu (contrainte, monotonie), jauge horizontale de zone pour ceux qui se lisent comme une
   position (ACWR, forme), courbe pour le reste. L'anneau porte sa valeur au centre ; les autres la
   laissent à la colonne de droite. */
function Preview({ metric, series, sessionRef, override }: { metric: MetricKey; series: DayPoint[]; sessionRef: number | null; override?: (number | null)[] }) {
  if (metric === "strain" || metric === "monotony") return <MiniRing metric={metric} series={series} />;
  if (metric === "acwr" || metric === "form") return <MiniBalance metric={metric} series={series} />;
  return <MiniLine metric={metric} series={series} sessionRef={sessionRef} override={override} />;
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from), [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function MiniRing({ metric, series }: { metric: MetricKey; series: DayPoint[] }) {
  const meta = METRICS[metric];
  const v = lastOf(metric, series);
  const lo = meta.lo, hi = meta.hi ?? 1;
  const cx = 55, cy = 52, r = 38, A0 = -120, A1 = 120;
  const at = (x: number) => A0 + ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * (A1 - A0);
  const zone = v === null ? null : meta.zones?.find(z => v >= z.from && v < z.to) ?? meta.zones?.[0];
  return (
    <svg viewBox="0 0 110 62" style={{ display: "block", width: "100%", height: 50 }} aria-hidden="true">
      <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={7} strokeLinecap="round" />
      {[...(meta.zones ?? [])].reverse().map(z => (
        <path key={z.label} d={arcPath(cx, cy, r, at(z.from), at(z.to))} fill="none" stroke={z.color} strokeWidth={7} opacity={0.85} />
      ))}
      {v !== null && (() => {
        const [mx, my] = polar(cx, cy, r, at(v));
        /* Plus de valeur au centre de l'anneau : la ligne principale de la carte la porte
           désormais, et c'est exactement le doublon qu'on retire partout ailleurs. L'anneau ne
           sert plus qu'à situer la valeur dans ses zones. */
        return <circle key="marker" cx={mx} cy={my} r={5.5} fill={zone?.color ?? "#fff"} stroke="#12161a" strokeWidth={2.5} />;
      })()}
    </svg>
  );
}

/* Jauge horizontale de zone — même langage que la balance Fatigue ↔ Forme. Les bandes viennent de
   METRICS, donc jamais d'un seuil recopié à la main. */
function MiniBalance({ metric, series }: { metric: MetricKey; series: DayPoint[] }) {
  const meta = METRICS[metric];
  const v = lastOf(metric, series);
  const lo = meta.lo, hi = meta.hi ?? 1;
  const X = (x: number) => ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * 120;
  return (
    <svg viewBox="0 0 120 26" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 26 }} aria-hidden="true">
      {meta.zones?.map(z => (
        <rect key={z.label} x={X(z.from)} y={9} width={X(z.to) - X(z.from)} height={8} fill={z.color} opacity={0.55} />
      ))}
      {v !== null && <rect x={Math.max(0, Math.min(117, X(v) - 1.5))} y={3} width={3} height={20} rx={1.5} fill="#fff" />}
    </svg>
  );
}

function MiniLine({ metric, series, sessionRef, override }: { metric: MetricKey; series: DayPoint[]; sessionRef: number | null; override?: (number | null)[] }) {
  const meta = METRICS[metric];
  /* Même série que le chart déplié : la récupération se lit en RELATIF, sinon l'aperçu tracerait un
     score brut contre des bandes définies sur l'échelle du percentile. */
  const vals = override ?? seriesOf(metric, series);
  const n = vals.length;
  const real = vals.filter((v): v is number => v !== null);
  if (!real.length) return null;
  /* Un aperçu à bandes se cadre sur toute l'échelle de zone et non sur l'amplitude des données,
     sinon les bandes bougeraient d'un jour à l'autre. */
  const lo = meta.zones ? meta.lo : meta.kind === "bars" ? 0 : Math.min(...real);
  const hi = meta.zones ? (meta.hi ?? 1) : meta.kind === "bars" ? Math.max(...real) : Math.max(...real);
  const sp = hi - lo || 1;
  const Y = (v: number) => 40 - ((Math.max(lo, Math.min(hi, v)) - lo) / sp) * 34;
  const X = (i: number) => (n <= 1 ? 60 : (i / (n - 1)) * 116 + 2);
  const colorAt = (v: number) =>
    metric === "load"
      ? (sessionQualifier(v, sessionRef).label === "Dure" ? "#a8500f" : sessionQualifier(v, sessionRef).label === "Légère" ? "#ffd2b0" : "#ef8544")
      : metric === "recovery" ? wellnessColor(v)
      : metric === "fitness" ? "#8fbdf0" : metric === "fatigue" ? "#d10000" : "#8fbdf0";

  const known = vals.map((v, i) => (v !== null ? { i, v } : null)).filter((p): p is { i: number; v: number } => p !== null);
  const segs: { i: number; v: number }[][] = [];
  for (const p of known) {
    const last = segs[segs.length - 1];
    if (last && p.i === last[last.length - 1].i + 1) last.push(p);
    else segs.push([p]);
  }

  return (
    <svg viewBox="0 0 120 44" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 46 }} aria-hidden="true">
      {meta.zones?.map(z => {
        const yt = Y(Math.min(hi, z.to)), yb = Y(Math.max(lo, z.from));
        return yb - yt > 0.5 ? <rect key={z.label} x={0} y={yt} width={120} height={yb - yt} fill={z.color} opacity={0.13} /> : null;
      })}
      {meta.kind === "bars"
        ? vals.map((v, i) => (v === null || v <= lo ? null : (
            <rect key={i} x={X(i) - Math.max(1.4, (116 / n) * 0.29)} y={Y(v)} width={Math.max(1.4, (116 / n) * 0.58)} height={40 - Y(v)} rx={0.7} fill={colorAt(v)} />
          )))
        : segs.map((seg, k) => (seg.length > 1 ? (
            <polyline key={k} points={seg.map(p => `${X(p.i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ")} fill="none" stroke={colorAt(seg[seg.length - 1].v)} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : null))}
    </svg>
  );
}
