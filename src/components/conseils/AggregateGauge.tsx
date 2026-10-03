"use client";

/* Jauge OUVERTE (arc de 240°) du score agrégé d'un onglet — 2026-09-29, POC charge-variantes.html
   variante S2, retenue par Gildas.

   Pourquoi un arc ouvert et pas un cercle fermé comme la wellness ring de /today : l'ouverture en
   bas dit qu'il y a un plancher et un plafond, alors qu'un cercle suggère un cycle qui revient sur
   lui-même. Or ce chiffre est une POSITION sur un axe à deux extrémités opposées (sous-charge ↔
   surcharge, fatigué ↔ frais), pas une progression de 0 à 100 — c'est la forme des jauges de
   contrainte et de monotonie, reprise en grand.

   Le libellé de niveau vit À L'INTÉRIEUR de l'arc, comme la zone vit dans le ring de /today : c'est
   ce qui permet à la jauge d'être le seul readout du bloc, donc d'être grosse, sans eyebrow ni
   libellé répété à côté.

   Convention SVG du repo : tout le texte est dans un calque HTML à taille fixe en px, jamais dans le
   viewBox — un <text> scale avec la largeur rendue (voir MetricChart.tsx / ZoneSparkline.tsx). */

import type { AggBand } from "@/lib/metricCards";

const A0 = -120, A1 = 120;   // 240° ouverts en bas, même géométrie que les jauges contrainte/monotonie

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* Position verticale du centre de l'arc dans le SVG (même calcul que ci-dessous, taille normale). */
export function aggregateGaugeCenterY(size = 188) {
  const r = Math.round(size * 0.36);
  const sw = Math.max(4, Math.round(size * 0.075));
  return r + sw / 2 + 2;
}

export default function AggregateGauge({
  pos, band, bands, size = 188, showLabel = true, bare = false,
}: {
  /** Position sur l'axe, 0..1. `null` = pas assez de données. */
  pos: number | null;
  band: AggBand | null;
  bands: AggBand[];
  size?: number;
  /** Masqué en petit (liste coach) : sous ~60px le libellé tomberait à 4px. */
  showLabel?: boolean;
  /* Miniature (2026-09-29) : arc et curseur seuls, aucun calque de texte — pour les ~26px des
     onglets de l'Accueil (HomeTabs.tsx), où même le chiffre serait illisible. Réutilise la MÊME
     géométrie que la grande jauge plutôt qu'un second composant : "une seule forme de jauge dans
     toute l'app, du 26px de la nav au ring de la page" (retour de Gildas sur le POC). */
  bare?: boolean;
}) {
  const r = Math.round(size * 0.36);
  const sw = Math.max(bare ? 3 : 4, Math.round(size * (bare ? 0.17 : 0.075)));
  const cx = size / 2;
  const cy = r + sw / 2 + (bare ? 1 : 2);
  const h = Math.round(cy + r * 0.5 + sw / 2 + (bare ? 1 : 4));
  const at = (f: number) => A0 + Math.max(0, Math.min(1, f)) * (A1 - A0);
  const color = band?.color ?? "rgba(255,255,255,.28)";

  return (
    <div style={{ position: "relative", width: size, height: h, flexShrink: 0 }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ display: "block" }} aria-hidden="true">
        <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={sw} strokeLinecap="round" />
        {/* Bandes dessinées à l'envers : les extrémités arrondies de la première ne doivent pas
            mordre sur les suivantes (même ordre que les jauges contrainte/monotonie existantes). */}
        {/* Couleurs jusqu'au bout de l'arrondi (2026-09-30, Gildas) : pastilles aux 2 extrémités, aux
            couleurs de la première et de la dernière bande — un linecap rond par bande ferait mordre
            chaque bande sur la suivante. Opacité portée par le groupe, sinon le recouvrement
            pastille/bande ressortirait plus foncé. */}
        <g opacity={bare ? 0.55 : 0.9}>
          {[...bands].reverse().map(b => (
            <path key={b.label} d={arcPath(cx, cy, r, at(b.from), at(b.to))} fill="none" stroke={b.color} strokeWidth={sw} />
          ))}
          {bands.length > 0 && (() => {
            const first = bands.reduce((m, b) => (b.from < m.from ? b : m), bands[0]);
            const last = bands.reduce((m, b) => (b.to > m.to ? b : m), bands[0]);
            const [sx, sy] = polar(cx, cy, r, at(first.from));
            const [ex, ey] = polar(cx, cy, r, at(last.to));
            return <>
              <circle cx={sx.toFixed(2)} cy={sy.toFixed(2)} r={sw / 2} fill={first.color} />
              <circle cx={ex.toFixed(2)} cy={ey.toFixed(2)} r={sw / 2} fill={last.color} />
            </>;
          })()}
        </g>
        {pos !== null && (() => {
          const [mx, my] = polar(cx, cy, r, at(pos));
          return <circle cx={mx.toFixed(2)} cy={my.toFixed(2)} r={(sw * 0.62).toFixed(1)} fill={color} stroke="#0f1318" strokeWidth={Math.max(2, Math.round(sw * 0.24))} />;
        })()}
      </svg>
      {/* Le centre du cercle n'est pas le centre de la boîte (l'arc est ouvert en bas, la boîte est
          plus courte sous le centre) : on ancre sur cy, jamais sur inset:0. */}
      {!bare && <div style={{
        position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", padding: "0 10px",
      }}>
        <span style={{
          fontFamily: "var(--font-mono), monospace", fontWeight: 700, lineHeight: 1,
          letterSpacing: "-0.02em", fontSize: Math.round(size * 0.215), color,
        }}>
          {pos === null ? "—" : Math.round(pos * 100)}
        </span>
        {showLabel && band && (
          <span style={{
            fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", textAlign: "center", lineHeight: 1.15, marginTop: 4,
            fontSize: Math.round(size * 0.063), color,
          }}>
            {band.label}
          </span>
        )}
      </div>}
    </div>
  );
}
