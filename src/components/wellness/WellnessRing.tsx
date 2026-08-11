"use client";

import { cn } from "@/lib/utils";
import { wellnessColor } from "@/lib/wellness";

interface WellnessRingProps {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
  /** Fond sombre (célébration onboarding) — track + texte adaptés. */
  dark?: boolean;
  /** Mode "capacité illimitée" (coach, pas de score wellness) — ring plein + label "∞". */
  infinite?: boolean;
}

export default function WellnessRing({
  score,
  size = 58,
  strokeWidth = 5,
  showLabel = true,
  className,
  dark = false,
  infinite = false,
}: WellnessRingProps) {
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = infinite ? 100 : score != null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference - (pct / 100) * circumference;

  // Dégradé séquentiel bleu (wellnessColor, src/lib/wellness.ts) — magnitude continue, pas un état
  // catégoriel, voir la doc complète dans ce fichier. "infinite" (capacité illimitée coach) n'est
  // pas un score wellness : reste en vert fixe, cas à part.
  const ringColor = infinite ? "#78bf13" : wellnessColor(score);
  const trackColor = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.07)";

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
          stroke={ringColor}
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
            style={{ color: infinite ? ringColor : dark ? "#fff" : ringColor }}
          >
            {infinite ? "∞" : score != null ? score : "—"}
          </span>
          <span
            className={cn("text-[7px] tracking-[0.06em] mt-[1px]", !dark && "text-muted")}
            style={dark ? { color: "rgba(255,255,255,0.55)" } : undefined}
          >
            {infinite ? "ILLIMITÉ" : "FORM"}
          </span>
        </div>
      )}
    </div>
  );
}
