"use client";

const MONTH_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];

function formatShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

/* Chart d'évolution de test — ligne+aire orange, même esprit visuel que ZoneSparkline/SparkLineClient
   (aire remplie, trait, point final marqué) mais volontairement dédié plutôt que de forcer leur API :
   ces deux composants sont taillés pour une échelle 0-100 fixe (wellness) ou un ACWR normalisé, alors
   qu'un résultat de test est une valeur arbitraire dans une unité arbitraire (kg, s, reps...). */
export default function TestEvolutionChart({ points, height = 90 }: { points: { date: string; value: number }[]; height?: number }) {
  if (points.length === 0) return null;

  const W = 280, H = height, PAD = Math.min(10, height / 4);
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = points.length > 1 ? (W - 2 * PAD) / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: PAD + i * stepX,
    y: PAD + (1 - (p.value - min + span * 0.1) / (span * 1.2)) * (H - 2 * PAD),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `M${coords[0].x.toFixed(1)},${H} ${coords.map(c => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")} L${coords[coords.length - 1].x.toFixed(1)},${H} Z`;

  // Au plus 5 labels affichés (premier/dernier + répartition régulière) — évite le chevauchement
  // sur un historique long, même principe de décimation que les charts déjà en place ailleurs.
  const maxLabels = 5;
  const labelIdx = new Set<number>();
  if (points.length <= maxLabels) {
    points.forEach((_, i) => labelIdx.add(i));
  } else {
    for (let i = 0; i < maxLabels; i++) labelIdx.add(Math.round((i * (points.length - 1)) / (maxLabels - 1)));
  }

  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="test-evo-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d44000" stopOpacity=".20" />
            <stop offset="100%" stopColor="#d44000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#test-evo-fill)" />
        <path d={linePath} fill="none" stroke="#d44000" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle
            key={i} cx={c.x} cy={c.y}
            r={i === coords.length - 1 ? 5.5 : 3.5}
            fill={i === coords.length - 1 ? "#d44000" : "#fff"}
            stroke="#d44000" strokeWidth={i === coords.length - 1 ? 0 : 2}
          />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#b0b3b5", fontWeight: 700, marginTop: 4, padding: "0 4px" }}>
        {points.map((p, i) => labelIdx.has(i) ? <span key={i}>{formatShort(p.date)}</span> : <span key={i} />)}
      </div>
    </div>
  );
}
