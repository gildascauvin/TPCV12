"use client";

import { cn } from "@/lib/utils";
import { scoreLabel } from "@/lib/wellness";

interface WellnessRingProps {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export default function WellnessRing({
  score,
  size = 58,
  strokeWidth = 5,
  showLabel = true,
  className,
}: WellnessRingProps) {
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference - (pct / 100) * circumference;

  const label = score != null ? scoreLabel(score) : "s-empty";
  const colorMap = {
    "s-great": "#78bf13",
    "s-ok": "#f28a00",
    "s-low": "#d10000",
    "s-empty": "#c0c0c0",
  };
  const trackColor = "rgba(0,0,0,0.07)";

  return (
    <div className={cn("relative flex-shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorMap[label]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[14px] font-bold leading-none"
            style={{ color: colorMap[label] }}
          >
            {score != null ? score : "—"}
          </span>
          <span className="text-[7px] text-muted tracking-[0.06em] mt-[1px]">FORM</span>
        </div>
      )}
    </div>
  );
}
