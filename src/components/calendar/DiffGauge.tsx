export default function DiffGauge({ value, height = 11 }: { value: number | null; height?: number }) {
  if (!value) return null;
  const cls = value >= 8 ? "hard" : value >= 5 ? "moderate" : "easy";
  const bg: Record<string, string> = {
    hard: "linear-gradient(90deg,#ffb5a7,#d44000)",
    moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)",
    easy: "linear-gradient(90deg,#bfeec8,#2f9e44)",
  };
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ width: "100%", height, borderRadius: 999, background: "#e7e4df", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 999, width: `${w}%`, background: bg[cls], transition: "width .22s ease" }} />
    </div>
  );
}
