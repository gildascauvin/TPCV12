import { wellnessColor } from "@/lib/wellness";

// Dégradé séquentiel bleu — voir SparkLineClient.tsx pour la doc complète du choix (magnitude
// continue, pas un état catégoriel). null garde son propre gris translucide (pas de donnée, pas
// une valeur basse) plutôt que le gris neutre de wellnessColor(null).
function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return wellnessColor(score);
}

export default function PlanningRing({ score, size = 58 }: { score: number | null; size?: number }) {
  const r = Math.round(size * 0.379);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const color = scoreColor(score);
  const sw = Math.round(size * 0.103);
  const fSize = Math.round(size * 0.259);
  const labelSize = Math.round(size * 0.112);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 8px 18px rgba(0,0,0,.12))" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.28s ease, stroke 0.28s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: fSize, fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.04em", color: "#fff" }}>
          {score !== null ? score : "—"}
        </span>
        <span style={{ fontSize: labelSize, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,0.56)", marginTop: 2, textTransform: "uppercase" }}>
          well
        </span>
      </div>
    </div>
  );
}
