"use client";

/* Onglets de l'Accueil (sportif : /today, coach : /coach sur un sportif sélectionné).
   Même style visuel que SectionTabs.tsx (soulignement orange, fond dark) — SectionTabs.tsx reste
   inchangé, toujours utilisé tel quel par /coach/athletes.

   2026-09-29, POC charge-variantes.html (section « Explorations — l'Accueil », variante retenue) :
   1. TROIS onglets au lieu de quatre — Comportements devient le 5e item du rapport de Récupération,
      sa vraie place : c'est un déterminant de la récup, pas une section sœur.
   2. Chaque onglet porte une MINIATURE discrète, en arc — la géométrie des jauges de la page,
      réutilisée telle quelle via AggregateGauge `bare`, y compris pour Aujourd'hui, dont l'axe est
      l'ajustement du jour et non un agrégat. Elles suggèrent quel onglet décroche sans rien
      chiffrer : pas de score dans la nav, sinon elle se lirait comme un tableau de bord et
      concurrencerait le contenu.

   Les miniatures sont toutes optionnelles : absente = l'onglet s'affiche comme avant. Nécessaire
   parce que les agrégats charge/récup viennent d'un fetch différé (voir TodayClient.tsx) et ne sont
   donc pas là au premier rendu. */
import AggregateGauge from "@/components/conseils/AggregateGauge";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DecisionRingMini, type DecisionRingState } from "@/components/sessions/DecisionRing";
import { AGG_BANDS, type AggBand, type MetricGroup } from "@/lib/metricCards";

export type HomeTab = "today" | "charge" | "recuperation";

const TABS: { key: HomeTab; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "charge", label: "Charge" },
  { key: "recuperation", label: "Récupération" },
];

const GROUP_OF: Record<"charge" | "recuperation", MetricGroup> = { charge: "charge", recuperation: "recup" };

export type HomeTabPreviews = {
  /** État de la jauge de décision du jour (decisionRingState) — la miniature la reproduit telle quelle. */
  today?: DecisionRingState | null;
  charge?: { pos: number | null; band: AggBand | null } | null;
  recuperation?: { pos: number | null; band: AggBand | null } | null;
};

/* Taille des miniatures (2026-09-30, Gildas : "faut les mettre plus grandes", puis +35 % validé sur
   le POC). */
const MINI_W = 54;

/* Mot de statut sous le nom de l'onglet (2026-09-30, POC validé par Gildas) — pas DANS la jauge : à
   54px le creux de l'arc fait ~30px, "Sous-charge" ou "Équilibré" n'y tiendraient pas sans abréger.
   Charge/Récup : le niveau de leur jauge agrégée. Aujourd'hui : la position du curseur par rapport à
   la zone conseillée, le même texte que sous la grande jauge. */
function statusOf(key: HomeTab, previews?: HomeTabPreviews): { label: string; color: string } | null {
  if (key === "today") {
    const st = previews?.today;
    if (!st) return null;
    const v = Math.round(st.value);
    if (v < st.zoneLow) return { label: "Sous la zone", color: "rgba(255,255,255,.62)" };
    if (v > st.zoneHigh) return { label: "Au-dessus de la zone", color: "rgba(255,255,255,.62)" };
    return { label: "Dans la zone", color: "#6ede8a" };
  }
  const band = previews?.[key]?.band;
  return band ? { label: band.label, color: band.color } : null;
}

export default function HomeTabs({ active, onChange, dark = true, previews }: {
  active: HomeTab;
  onChange: (t: HomeTab) => void;
  dark?: boolean;
  previews?: HomeTabPreviews;
}) {
  const { isMd } = useBreakpoint();
  return (
    /* Onglets espacés (22px) sur écran large. Sur téléphone (2026-09-30, Gildas : "ça scroll
       vertical et horizontal") : plus de défilement — trois colonnes égales, jauge AU-DESSUS du
       libellé, plus petite, et le statut peut passer sur 2 lignes. */
    <div style={{
      display: "flex", gap: isMd ? 22 : 4, justifyContent: "center",
      flexWrap: "nowrap" as const, marginBottom: 16,
    }}>
      {TABS.map(t => {
        /* Aujourd'hui = miniature FIDÈLE de la jauge de décision (2026-09-30) : même axe RPE, même
           dégradé, même zone, même curseur. Charge/Récup = miniature de leur jauge agrégée. */
        let mini: React.ReactNode = null;
        if (t.key === "today") {
          if (previews?.today) mini = <DecisionRingMini state={previews.today} size={isMd ? MINI_W : 44} />;
        } else {
          const axis = previews?.[t.key] ?? null;
          if (axis) mini = <AggregateGauge bare size={isMd ? MINI_W : 44} pos={axis.pos} band={axis.band} bands={AGG_BANDS[GROUP_OF[t.key]]} />;
        }
        const status = statusOf(t.key, previews);
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              display: "inline-flex", alignItems: "center", gap: isMd ? 10 : 5,
              flexDirection: isMd ? "row" : "column", textAlign: isMd ? "left" : "center",
              flex: isMd ? "0 0 auto" : "1 1 0", minWidth: 0,
              border: "none", background: "transparent", cursor: "pointer",
              padding: isMd ? "12px 10px 11px" : "8px 2px 9px", marginBottom: -1, flexShrink: isMd ? 0 : 1,
              borderBottom: active === t.key ? "2px solid #d44000" : "2px solid transparent",
              color: active === t.key ? "#ff8a55" : dark ? "rgba(255,255,255,.5)" : "#62686e",
              fontSize: isMd ? 12.5 : 12, fontWeight: 800, whiteSpace: isMd ? "nowrap" as const : "normal" as const,
            }}
          >
            {/* Miniature À GAUCHE du libellé (2026-09-30, Gildas). */}
            {mini}
            <span style={{ display: "flex", flexDirection: "column" as const, alignItems: isMd ? "flex-start" : "center", gap: 2, minWidth: 0 }}>
              {t.label}
              {status && (
                <span style={{ fontSize: isMd ? 11 : 10.5, fontWeight: 700, lineHeight: 1.15, color: status.color }}>{status.label}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
