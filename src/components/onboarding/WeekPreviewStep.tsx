"use client";

import { useState } from "react";
import DiffGauge from "@/components/calendar/DiffGauge";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { loadRule, ruleTagColors } from "@/lib/loadRule";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const SPORT_EMOJI: Record<string, string> = {
  "Force & puissance": "💪",
  "Athlétisme & vitesse": "🏃",
  "Sports collectifs": "🏉",
  "Endurance": "🚴",
  "Arts martiaux & combat": "🥋",
};

function getSportEmoji(sport: string): string {
  return SPORT_EMOJI[sport] ?? "⚡";
}

function toDisplayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

// Adjust base template difficulty by athlete level
function adjustDiff(base: number, level: "beginner" | "intermediate" | "elite"): number {
  if (level === "beginner") return Math.max(1, base - 4);
  if (level === "elite") return Math.min(10, base + 1);
  return base;
}

interface Props {
  sport: string;
  level: "beginner" | "intermediate" | "elite";
  trainingDays: number[];
  onNext: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, onNext }: Props) {
  const templates = getSessionTemplates(sport);
  const sportEmoji = getSportEmoji(sport);

  const displayDays = Array.from(new Set(trainingDays.map(toDisplayIndex))).sort((a, b) => a - b);

  const sessionForDay: Record<number, [string, string, number]> = {};
  const diffForDay: Record<number, number> = {};
  displayDays.forEach((d, i) => {
    const tpl = templates[i % templates.length];
    sessionForDay[d] = tpl;
    diffForDay[d] = adjustDiff(tpl[2], level);
  });

  const defaultDay = displayDays[0] ?? 0;
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);
  const shownSession = sessionForDay[selectedDay] ?? templates[0];

  const selIdx = displayDays.indexOf(selectedDay);
  const currentDiff = diffForDay[selectedDay] ?? 6;
  const prevMax = selIdx > 0 ? (diffForDay[displayDays[selIdx - 1]] ?? 0) : 0;
  const nextMax = selIdx < displayDays.length - 1 ? (diffForDay[displayDays[selIdx + 1]] ?? 0) : 0;
  const rule = loadRule([{ target_difficulty: currentDiff }], { prevMax, nextMax });
  const tagColor = ruleTagColors[rule.cls];

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>
        {getSportEmoji(sport)} Ton programme de la semaine
      </div>
      <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.45, marginBottom: 18 }}>
        Généré selon ton niveau et tes jours d&apos;entraînement
      </div>

      {/* Mini-calendrier semaine */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 16 }}>
        {DOW_LABELS.map((label, i) => {
          const hasSession = displayDays.includes(i);
          const isSelected = i === selectedDay;
          return (
            <div
              key={i}
              onClick={() => hasSession ? setSelectedDay(i) : undefined}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: hasSession ? "pointer" : "default" }}
            >
              <div style={{ fontSize: 8, fontWeight: 700, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {label}
              </div>
              <div style={{
                width: "100%", aspectRatio: "1", borderRadius: 8,
                background: hasSession ? (isSelected ? "#d44000" : "rgba(212,64,0,0.10)") : "rgba(0,0,0,0.04)",
                border: hasSession ? (isSelected ? "none" : "1.5px solid rgba(212,64,0,0.25)") : "1px solid rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {hasSession && (
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "#fff" : "#d44000" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Carte séance sélectionnée */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>
          🎯 {DOW_LABELS[selectedDay]} · Séance planifiée
        </div>
        <div style={{
          border: "1px solid rgba(212,64,0,0.16)", background: "#fff",
          borderRadius: 16, padding: "14px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#171b1f", lineHeight: 1.2, letterSpacing: "-0.03em" }}>
              {shownSession[0]}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "rgba(212,64,0,0.10)", color: "#d44000", whiteSpace: "nowrap", flexShrink: 0 }}>
              Prévu
            </span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <DiffGauge value={currentDiff} height={10} />
          </div>
          <div style={{ border: "1px solid rgba(0,0,0,.075)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            {shownSession[1].split("\n").filter(Boolean).map((ex, i) => (
              <div key={i} style={{
                padding: "8px 10px", fontSize: 12, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
                borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff",
              }}>
                {ex}
              </div>
            ))}
          </div>

          <div style={{ padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
                {rule.tag}
              </div>
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, margin: "16px -18px -18px", padding: "14px 18px 20px", background: "linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 28%,#fff 50%)" }}>
        <button
          onClick={onNext}
          style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 13.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.26)", lineHeight: 1.3 }}
        >
          Ajuste ton programme selon ta forme →
        </button>
      </div>
    </div>
  );
}
