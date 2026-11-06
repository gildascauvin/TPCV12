import { chargeColor, recupColor } from "@/lib/ringColors";

/* Mini anneau de score (06/11, « nouvelles jauges partout ») : même arc de 240° que les grands anneaux,
   remplissage dans la palette du score (récup bleu, charge orange), chiffre en blanc au centre. Remplace les
   ronds complets (liste des sportifs, en-têtes de jour du Planning). Pas d'essaim : trop petit. */
const A0 = -120, A1 = 120;
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from), [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function arcSegments(cx: number, cy: number, r: number, sw: number, score: number | null, pal: (f: number) => string, n = 18) {
  if (score === null || score <= 0.5) return null;
  const f = Math.max(0, Math.min(100, score)) / 100, end = A0 + (A1 - A0) * f;
  const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, end);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={arcPath(cx, cy, r, A0 + ((end - A0) * i) / n, A0 + ((end - A0) * (i + 1.04)) / n)} fill="none" stroke={pal(0.25 + 0.75 * f * (i + 0.5) / n)} strokeWidth={sw} />
      ))}
      <circle cx={sx} cy={sy} r={sw / 2} fill={pal(0.25)} />
      <circle cx={ex} cy={ey} r={sw / 2} fill={pal(0.25 + 0.75 * f)} />
    </>
  );
}
export function trackPath(cx: number, cy: number, r: number) { return arcPath(cx, cy, r, A0, A1); }

export default function MiniScoreArc({ score, size = 52, label, palette = "recup", box = true, light = false, lines }: {
  /* Texte au centre (version claire) : mêmes taille et graisse que le statut des anneaux de séance du Planning. */
  lines?: string[];
  score: number | null; size?: number; label?: string; palette?: "recup" | "charge";
  /* Sur fond blanc (Planning, jours de repos, 06/11) : même style que l'anneau d'une séance, arc plus grand. */
  light?: boolean;
  /* Fond sombre arrondi (comme les anciens ronds), pour les cartes claires. */
  box?: boolean;
}) {
  const pal = palette === "charge" ? chargeColor : recupColor;
  const r = size * (light ? 0.4 : 0.36), sw = Math.max(3, size * 0.1), cx = size / 2, cy = size * (light ? 0.5 : 0.52);
  const vh = light ? Math.round(size * 0.84) : size;
  return (
    <div style={{ position: "relative", width: size, height: vh, flexShrink: 0, borderRadius: box && !light ? "50%" : 0, background: box && !light ? "#0f1318" : "transparent" }}>
      <svg width={size} height={vh} viewBox={`0 0 ${size} ${vh}`} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
        <path d={trackPath(cx, cy, r)} fill="none" stroke={light ? "#ebe9e4" : "rgba(255,255,255,0.12)"} strokeWidth={sw} strokeLinecap="round" />
        {arcSegments(cx, cy, r, sw, score, pal)}
      </svg>
      {light && lines ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "var(--font-sans), sans-serif", fontWeight: 900, fontSize: size * 0.125, lineHeight: 1.04, color: "#171b1f", textAlign: "center" }}>
          {lines.map((l, k) => <span key={k}>{l}</span>)}
        </div>
      ) : (
      <div style={{ position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: Math.round(size * 0.27), fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: light ? "#171b1f" : score === null ? "rgba(255,255,255,.45)" : "#fff" }}>{score !== null ? Math.round(score) : "—"}</span>
        {label && <span style={{ fontSize: Math.max(6, size * 0.12), fontWeight: 800, letterSpacing: "0.12em", color: light ? "#8a8f94" : "rgba(255,255,255,.56)", marginTop: 2, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" }}>{label}</span>}
      </div>
      )}
    </div>
  );
}
