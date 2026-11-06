import type { RpeInsight } from "@/lib/rpeInsight";

/* Ligne d'insight sous la jauge RPE (fin de séance sportif et coach) : mêmes couleurs que celle du
   point forme (orange = plus dur, bleu = plus facile). */
export default function RpeInsightLine({ insight, dark = false }: { insight: RpeInsight | null; dark?: boolean }) {
  if (!insight) return null;
  return (
    <div style={{
      marginTop: 12, padding: "10px 12px", borderRadius: 12, fontSize: 14, fontWeight: 700, lineHeight: 1.35,
      background: dark ? "rgba(255,255,255,.07)" : insight.harder ? "#fff3e8" : "#eef4fc",
      color: dark ? (insight.harder ? "#ffc8a8" : "#bfe2ee") : insight.harder ? "#b45309" : "#184f95",
      animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)",
    }}>
      {insight.harder ? "↗ " : "↘ "}{insight.text}
    </div>
  );
}
