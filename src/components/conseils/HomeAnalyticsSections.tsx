"use client";

/* Extrait de ConseilsClient.tsx (2026-09-24, "point 1" — fusionner Charge/Récupération/Comportements
   dans l'accueil, voir POC `poc-coach-context_4.html`, tabsHtml()/tabBody() : Entraînement/Charge/
   Récupération/Comportements en tabs sur l'Accueil). Source unique — TodayClient.tsx (nouveaux
   onglets) ET ConseilsClient.tsx (bloc "Tests de performance" seul désormais) partagent ces pièces
   plutôt que de dupliquer la logique de rendu. Comportement/formules 100% inchangés, seul
   l'emplacement dans l'UI change. */

import ShareButton from "@/components/sessions/ShareButton";
import SparkLineClient, { FORM_ZONES, formToChartPosition, WELLNESS_ZONES } from "@/components/conseils/SparkLineClient";
import { dimensionBadgesSeries, DIMENSION_ARROW, dimensionBadgeColor, type DimensionKey } from "@/lib/wellnessBaseline";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import ZoneBadge from "@/components/conseils/ZoneBadge";
import RangeToggle, { type RangeMode } from "@/components/calendar/RangeToggle";
import { METRIC_DEFINITIONS } from "@/lib/fatigueSignature";
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
            <div style={{ background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.85)", borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" as const }}>
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
              {trendEmoji} {trendAction && <span style={{ textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#ff8a55" }}>{trendAction} — </span>}{trendText}
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
  const { monotonyInfo, strainInfo, fitnessTrendInfo, fatigueTrendInfo, chargeInsight } = data;
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
          <ZoneBadge label={monotonyInfo.label} color={monotonyInfo.color} definition={METRIC_DEFINITIONS.monotony} />
          {strainInfo && <ZoneBadge label={strainInfo.label} color={strainInfo.color} definition={METRIC_DEFINITIONS.strain} />}
          {fitnessTrendInfo && <ZoneBadge label={fitnessTrendInfo.label} color={fitnessTrendInfo.color} definition={METRIC_DEFINITIONS.fitness} />}
          {fatigueTrendInfo && <ZoneBadge label={fatigueTrendInfo.label} color={fatigueTrendInfo.color} definition={METRIC_DEFINITIONS.fatigue} />}
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
        {chargeInsight}
      </div>
      <div style={{ overflowX: "hidden", width: "100%" }}>
        <ZoneSparkline points={zoneAcwr} dates={zoneDates} loads={zoneLoads} monotony={zoneMonotony} strain={zoneStrain} weekLabels={rangeMode !== "week"} />
      </div>
    </div>
  );
}

export function RecuperationSection({ data, rangeMode, onRangeModeChange }: { data: ConseilsData; rangeMode: RangeMode; onRangeModeChange: (m: RangeMode) => void }) {
  const { formInfo, recoveryInsight, recoveryInfo } = data;
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
          {todayDimensionBadges?.map((b: { key: DimensionKey; label: string; arrow: "up" | "down" | "stable" }) => (
            <ZoneBadge key={b.key} label={`${b.label} ${DIMENSION_ARROW[b.arrow]}`} color={dimensionBadgeColor(b.arrow)} />
          ))}
          {formInfo && <ZoneBadge label={`FORME ${formInfo.label}`} color={formInfo.color} definition={METRIC_DEFINITIONS.form} />}
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
        <SparkLineClient
          points={recoveryRelativePoints} pointsRaw={recoveryRawPoints} dates={zoneDates} color={recoveryInfo.color}
          maxVal={100} height={168} animDelay={300}
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

/* ── Vue "Tous" côté coach (2026-09-24) — équivalent de teamBody() dans le POC : une liste
   d'athlètes classée par sévérité pour l'onglet actif, plutôt que le grand chart individuel des 2
   autres modes. `rows` porte déjà le ConseilsData de chaque athlète (calculé une fois côté
   CoachClient.tsx, jamais recalculé ici) — ce composant ne fait que trier/afficher. */
export function TeamAnalyticsList({ rows, metric, onSelect }: {
  rows: { athlete: CoachAthlete; data: ConseilsData }[];
  metric: "charge" | "recuperation" | "comportements";
  onSelect: (athleteId: string) => void;
}) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
      {sorted.map(({ athlete: a, data }) => {
        // Score de récupération — même résolution que la branche "recuperation" ci-dessous, hissé
        // pour aussi alimenter l'AthleteRing (2026-09-24, unification avec le style de carte de
        // /coach/athletes — voir athleteStatus()/AthleteRing importés en haut de fichier) : un seul
        // score par athlète, jamais deux calculs qui pourraient diverger entre le ring et le badge.
        const recoveryScore = data.wellnessBaseline?.hasEnoughHistory ? data.wellnessBaseline.relativeScore : (data.timeSeries[data.timeSeries.length - 1]?.recovery ?? null);
        let right: React.ReactNode;
        // Encadré = le MÊME composant que sur les pages dédiées (2026-09-25, retour de Gildas —
        // "ces conseils... doivent être le même composant que ceux dans les pages dédiées avec
        // '🟢 Récupération légère — Ta récupération est basse...' dans l'encadré") : c'est
        // exactement l'encadré de CrossInsightBanner (trendEmoji/trendAction/trendText, la même
        // donnée déjà affichée en tête de ChargeSection/RecuperationSection pour un seul sportif),
        // pas chargeInsight/recoveryInsight (des phrases différentes, jamais montrées dans un
        // encadré ailleurs dans l'app) — remplace le 1er jet qui inventait un nouveau texte ici.
        // Version light (fond clair) car ces cartes ne sont plus sur fond sombre, voir plus haut.
        if (metric === "charge") {
          right = <ZoneBadge label={data.loadInfo.label} color={data.loadInfo.color} definition={METRIC_DEFINITIONS.acwr} />;
        } else if (metric === "recuperation") {
          right = recoveryScore !== null
            ? <ZoneBadge label={`${data.recoveryInfo.label} ${recoveryScore}`} color={data.recoveryInfo.color} definition={METRIC_DEFINITIONS.recovery} />
            : <span style={{ fontSize: 11, color: "#8a8f94" }}>—</span>;
        } else {
          const { bestHelper, worstHurt } = topBehaviors(data.correlations);
          right = (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
              {bestHelper && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color: "#2f9e44", background: "#2f9e4426" }}>{bestHelper.emoji} {bestHelper.label}</span>}
              {worstHurt && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color: "#d10000", background: "#d1000026" }}>{worstHurt.emoji} {worstHurt.label}</span>}
              {!bestHelper && !worstHurt && <span style={{ fontSize: 11, color: "#8a8f94" }}>Pas assez de données</span>}
            </div>
          );
        }
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            style={{
              display: "block", padding: "12px 14px",
              background: "#fff", border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 16, cursor: "pointer", textAlign: "left" as const, width: "100%",
              boxShadow: "0 4px 14px rgba(0,0,0,.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AthleteRing score={recoveryScore} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#171b1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {a.name}
                </div>
                {a.sport && (
                  <div style={{ fontSize: 10.5, color: "#8a8f94", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {a.sport}
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0 }}>{right}</span>
            </div>
            {metric !== "comportements" && data.trendText && (
              <div style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.06)", borderRadius: 12, padding: "10px 12px", marginTop: 10, fontSize: 12.5, color: "#171b1f", lineHeight: 1.5, fontWeight: 600 }}>
                {data.trendEmoji} {data.trendAction && <span style={{ textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#d44000" }}>{data.trendAction} — </span>}{data.trendText}
              </div>
            )}
          </button>
        );
      })}
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
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>Impact comportements</div>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", marginBottom: 8 }}>Données en cours de collecte</div>
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
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em" }}>Ce qui t&apos;aide ou te pénalise</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>

        <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,.85)", lineHeight: 1.5, marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 6 }}>
          {bestHelper && (
            <div>
              <span style={{ fontWeight: 900, color: "#2f9e44" }}>✓ Continue : </span>
              <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span>
              {" "}améliore ta récupération de{" "}
              <span style={{ fontWeight: 900, color: "#2f9e44" }}>+{bestHelper.impact.toFixed(1)} pts</span> en moyenne.
            </div>
          )}
          {worstHurt && (
            <div>
              <span style={{ fontWeight: 900, color: "#d10000" }}>✗ Évite : </span>
              <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span>
              {" "}pénalise ta récupération de{" "}
              <span style={{ fontWeight: 900, color: "#d10000" }}>{worstHurt.impact.toFixed(1)} pts</span> en moyenne.
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
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" as const, color, background: `${color}26` }}>
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
