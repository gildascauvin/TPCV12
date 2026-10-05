"use client";

import { AGG_BANDS } from "@/lib/metricCards";
import { autoregBand } from "@/lib/autoregulation";
import { DecisionRingMini, decisionRingMiniCenterY, type DecisionRingState } from "@/components/sessions/DecisionRing";

/* Radar du Coach Control (2026-10-05) — RÉFÉRENCE VISUELLE DU CALCUL DE RECO. Chaque sportif est
   placé à sa récupération EFFECTIVE (X, effectiveRecoveryX : percentile du jour moins la pénalité
   chronique, exactement l'entrée de computeAutoregSuggestion) et au RPE prévu de sa séance (Y). La
   bande "Maintenir" est tracée avec autoregBand() : un point au-dessus est allégé, en dessous
   surchargé, dans la bande rien ne change. Le contour du point = la vraie suggestion de la carte. */

export type RadarPoint = {
  id: string;
  name: string;
  /** Récupération effective, 0..100 (null = pas de ressenti). */
  score: number | null;
  diff: number | null;
  /** Jauge de décision (même que la mini-jauge RPE des lignes), null = pas de séance aujourd'hui. */
  ring: DecisionRingState | null;
  /** true = pas de reco chiffrée (zone conseillée non dessinée). */
  hideZone: boolean;
};

const BANDS = AGG_BANDS.recup;
const bandOf = (v: number) => BANDS.find(b => v / 100 >= b.from && v / 100 < b.to) ?? BANDS[BANDS.length - 1];
const W = 560, H = 300, PL = 22, PR = 8, PT = 8, PB = 22;
const xs = (v: number) => PL + (v / 100) * (W - PL - PR);
const ys = (v: number) => PT + (1 - v / 10) * (H - PT - PB);


function initials(name: string) {
  return name.split(" ").map(s => s[0]).join("").toUpperCase().slice(0, 2);
}

export default function CoachRadar({ points, onSelect }: { points: RadarPoint[]; onSelect: (id: string) => void }) {

  const placed = points.filter(p => p.score !== null && p.diff !== null).map(p => ({ p, x: xs(p.score!), y: ys(p.diff!) }));
  const noData = points.filter(p => p.score === null || p.diff === null);
  /* Position EXACTE (2026-10-05) : le radar est la référence du calcul, un point ne doit jamais
     être déplacé de l'autre côté d'une frontière. Deux sportifs au même endroit se superposent. */

  /* Point = la jauge de décision du sportif (arc du RPE prévu + zone conseillée), initiales au
     centre, sur un disque sombre neutre : une seule information visuelle, celle des lignes. */
  const zoneLabel: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 9.5, letterSpacing: "0.08em" };
  const DOT = 44;
  const DOT_CY = decisionRingMiniCenterY(DOT, true);
  const dot = (p: RadarPoint, style: React.CSSProperties) => (
    <button key={p.id} type="button" onClick={() => onSelect(p.id)} title={`${p.name} · RPE prévu ${p.diff ?? "—"}`}
      aria-label={`${p.name}, RPE prévu ${p.diff ?? "aucun"}`}
      style={{ border: "none", padding: 0, background: "none", cursor: "pointer", display: "block", ...style }}>
      {p.ring
        ? <DecisionRingMini state={p.ring} size={DOT} thin disc="rgba(10,14,18,.55)" centerLabel={initials(p.name)} />
        : <span style={{ width: DOT, height: DOT, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(10,14,18,.94)", fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, color: "#fff" }}>{initials(p.name)}</span>}
    </button>
  );

  return (
    <div>
    <div>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }} role="img" aria-label="Sportifs placés selon leur récupération et le RPE prévu">
          {(() => {
            const pts = Array.from({ length: 101 }, (_, x) => ({ x, ...autoregBand(x) }));
            const clampY = (v: number) => ys(Math.max(0, Math.min(10, v)));
            const hiLine = pts.map(p => `${xs(p.x)},${clampY(p.hi)}`).join(" ");
            const loLine = pts.map(p => `${xs(p.x)},${clampY(p.lo)}`).reverse().join(" ");
            return (
              <>
                <polygon points={`${xs(0)},${ys(10)} ${xs(100)},${ys(10)} ${pts.slice().reverse().map(p => `${xs(p.x)},${clampY(p.hi)}`).join(" ")}`} fill="rgba(220,38,38,0.16)" />
                <polygon points={`${hiLine} ${loLine}`} fill="rgba(255,255,255,0.08)" />
                <polygon points={`${xs(0)},${ys(0)} ${pts.map(p => `${xs(p.x)},${clampY(p.lo)}`).join(" ")} ${xs(100)},${ys(0)}`} fill="rgba(47,158,68,0.16)" />
              </>
            );
          })()}
          <text x={xs(3)} y={ys(10) + 14} style={{ ...zoneLabel, fill: "rgba(255,140,112,.95)" }}>ALLÉGER</text>
          <text x={xs(48)} y={ys(4.3)} textAnchor="middle" transform={`rotate(-38 ${xs(48)} ${ys(4.3)})`} style={{ ...zoneLabel, fill: "rgba(232,238,243,.65)" }}>MAINTENIR</text>
          <text x={xs(97)} y={ys(0) - 8} textAnchor="end" style={{ ...zoneLabel, fill: "rgba(143,224,176,.95)" }}>SURCHARGER</text>
          {([[0, 4.5, "#2f9e44", "FACILE"], [4.5, 7.5, "#f28a00", "MODÉRÉE"], [7.5, 10, "#d44000", "DURE"]] as const).map(([lo, hi, c, label]) => (
            <g key={label}>
              <rect x={xs(0) - 1.5} y={ys(hi)} width={3} height={ys(lo) - ys(hi)} fill={c} />
              <text x={9} y={(ys(lo) + ys(hi)) / 2} textAnchor="middle" transform={`rotate(-90 9 ${(ys(lo) + ys(hi)) / 2})`} style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8.5, letterSpacing: "0.06em", fill: c }}>{label}</text>
            </g>
          ))}
          {BANDS.map(b => (
            <g key={b.label}>
              <rect x={xs(b.from * 100)} y={ys(0) - 1.5} width={xs(b.to * 100) - xs(b.from * 100)} height={3} fill={b.color} />
              <text x={(xs(b.from * 100) + xs(b.to * 100)) / 2} y={H - 6} textAnchor="middle" style={{ fontFamily: "var(--font-mono), monospace", fontSize: 8.5, letterSpacing: "0.06em", fill: b.color, textTransform: "uppercase" }}>{b.label}</text>
            </g>
          ))}
        </svg>
        {placed.map(q => dot(q.p, { position: "absolute", left: `${(q.x / W) * 100}%`, top: `${(q.y / H) * 100}%`, marginLeft: -DOT / 2, marginTop: -DOT_CY }))}
      </div>
    </div>
    {noData.length > 0 && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 4px 0" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Sans séance ou sans check-in</span>
        {noData.map(p => (
          <button key={p.id} type="button" onClick={() => onSelect(p.id)} title={p.name} aria-label={p.name}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,.14)", padding: 0, cursor: "pointer", background: "rgba(255,255,255,.06)", color: "#fff", fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700 }}>
            {initials(p.name)}
          </button>
        ))}
      </div>
    )}
    </div>
  );
}
