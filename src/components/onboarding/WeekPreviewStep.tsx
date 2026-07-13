"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";
import DiffGauge from "@/components/calendar/DiffGauge";
import { getSessionTemplates } from "@/lib/sessionTemplates";
import { loadRule, ruleTagColors } from "@/lib/loadRule";
import type { ProgramTemplate, SessionTemplate } from "@/types";

const DOW_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function loadBarColor(avg: number): string {
  if (!avg) return "#e5e7eb";
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}
const DOW_MAP: Record<string, number> = { Lun: 0, Mar: 1, Mer: 2, Jeu: 3, Ven: 4, Sam: 5, Dim: 6 };

function getSportEmoji(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes("course") || s.includes("marathon") || s.includes("trail") || s.includes("endurance")) return "🏃";
  if (s.includes("vélo") || s.includes("cyclisme") || s.includes("triathlon")) return "🚴";
  if (s.includes("collectif") || s.includes("football") || s.includes("basket") || s.includes("rugby")) return "🏉";
  if (s.includes("combat") || s.includes("martial") || s.includes("judo") || s.includes("boxe")) return "🥋";
  if (s.includes("force") || s.includes("puissance") || s.includes("musculation") || s.includes("powerlifting")) return "💪";
  return "⚡";
}

function toDisplayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function adjustDiff(base: number, level: Level): number {
  if (level === "beginner") return Math.max(1, base - 4);
  if (level === "elite") return Math.min(10, base + 1);
  return base;
}

function weekAvgDiff(week: Record<string, SessionTemplate[]>): number {
  const all = Object.values(week).flat();
  if (!all.length) return 5;
  return Math.round(all.reduce((s, ses) => s + ses.target_difficulty, 0) / all.length);
}

type Level = "beginner" | "intermediate" | "elite";

interface FetchedProgram {
  name: string;
  sport: string;
  level: Level;
  template: ProgramTemplate;
}

interface Props {
  sport: string;
  level: Level;
  trainingDays: number[];
  programFlow?: boolean;
  onNext: () => void;
}

export default function WeekPreviewStep({ sport, level, trainingDays, programFlow, onNext }: Props) {
  const [fetchedProgram, setFetchedProgram] = useState<FetchedProgram | null>(null);

  useEffect(() => {
    if (!programFlow) return;
    const claimId = localStorage.getItem("claim_program_id");
    if (!claimId) return;
    fetch(`/api/programs/${claimId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: FetchedProgram | null) => {
        if (data?.name && data?.template) setFetchedProgram(data);
      });
  }, [programFlow]);

  // When we have the real program template, use its week 1 sessions
  const week1 = fetchedProgram?.template?.weeks?.[0] ?? null;

  const displaySport = fetchedProgram?.sport ?? sport;
  const displayLevel = fetchedProgram?.level ?? level;
  const displayName  = fetchedProgram?.name;
  const sportEmoji   = getSportEmoji(displaySport);

  // Days + sessions: real template if available, generic if not
  let displayDays: number[];
  let sessionForDay: Record<number, { name: string; notes: string | null; diff: number }>;

  if (week1) {
    displayDays = Object.keys(week1).map(d => DOW_MAP[d] ?? 0).sort((a, b) => a - b);
    sessionForDay = {};
    Object.entries(week1).forEach(([dayKey, sessions]) => {
      const di = DOW_MAP[dayKey] ?? 0;
      const s = sessions[0];
      if (s) sessionForDay[di] = { name: s.name, notes: s.notes ?? null, diff: s.target_difficulty };
    });
  } else {
    const templates = getSessionTemplates(displaySport);
    displayDays = Array.from(new Set(trainingDays.map(toDisplayIndex))).sort((a, b) => a - b);
    sessionForDay = {};
    displayDays.forEach((d, i) => {
      const tpl = templates[i % templates.length];
      sessionForDay[d] = { name: tpl[0], notes: tpl[1], diff: adjustDiff(tpl[2], displayLevel) };
    });
  }

  // S1-SN gauges
  let weekPhases: { label: string; diff: number }[];
  if (fetchedProgram?.template?.weeks) {
    const weeks = fetchedProgram.template.weeks;
    weekPhases = weeks.map(week => ({ label: "", diff: weekAvgDiff(week) }));
  } else {
    const baseDiff = adjustDiff(getSessionTemplates(displaySport)[0][2], displayLevel);
    weekPhases = [
      { label: "Base",   diff: baseDiff },
      { label: "Accum.", diff: Math.min(10, baseDiff + 1) },
      { label: "Pic",    diff: Math.min(10, baseDiff + 2) },
      { label: "Récup",  diff: Math.max(1, baseDiff - 1) },
    ];
  }

  const defaultDay = displayDays[0] ?? 0;
  const [selectedDay, setSelectedDay] = useState<number>(defaultDay);

  // Keep selected day in sync when real data loads
  useEffect(() => {
    if (displayDays.length > 0 && !displayDays.includes(selectedDay)) {
      setSelectedDay(displayDays[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week1]);

  const shownSession = sessionForDay[selectedDay] ?? sessionForDay[displayDays[0]] ?? { name: "Séance", notes: null, diff: 6 };
  const currentDiff = shownSession.diff;
  const selIdx = displayDays.indexOf(selectedDay);
  const allDiffs = displayDays.map(d => sessionForDay[d]?.diff ?? 6);
  const prevMax = selIdx > 0 ? (allDiffs[selIdx - 1] ?? 0) : 0;
  const nextMax = selIdx < displayDays.length - 1 ? (allDiffs[selIdx + 1] ?? 0) : 0;
  const rule = loadRule([{ target_difficulty: currentDiff }], { prevMax, nextMax });
  const tagColor = ruleTagColors[rule.cls];

  const loading = programFlow && !fetchedProgram;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4 }}>
        {sportEmoji} {displayName ?? (programFlow ? "Chargement…" : "Ton programme de la semaine")}
      </div>
      <div style={{ fontSize: 13, color: "#8a8f94", lineHeight: 1.45, marginBottom: 16 }}>
        {programFlow
          ? (displayName ? "Personnalisable à tout moment selon l'avancée de tes sportifs." : "Chargement du programme…")
          : "Généré selon ton niveau et tes jours d'entraînement. Personnalisable à tout moment."}
      </div>

      {/* S1-S4 charge progression */}
      <div style={{ background: "#f7f8f9", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#8a8f94", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
          Charge sur {weekPhases.length} semaine{weekPhases.length > 1 ? "s" : ""}
        </div>
        {(() => {
          const maxDiff = Math.max(...weekPhases.map(p => p.diff), 0.01);
          return (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              {weekPhases.map(({ label, diff }, i) => {
                const barH = Math.max(4, Math.round((diff / maxDiff) * 28));
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 18, height: barH, borderRadius: "2px 2px 0 0", background: loadBarColor(diff) }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#171b1f" }}>S{i + 1}</span>
                    {label && <span style={{ fontSize: 8, fontWeight: 600, color: "#8a8f94" }}>{label}</span>}
                  </div>
                );
              })}
            </div>
          );
        })()}
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
      {!loading && (
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
                {shownSession.name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "rgba(212,64,0,0.10)", color: "#d44000", whiteSpace: "nowrap", flexShrink: 0 }}>
                Prévu
              </span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <DiffGauge value={currentDiff} height={10} />
            </div>
            {shownSession.notes && (
              <div style={{ border: "1px solid rgba(0,0,0,.075)", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                {shownSession.notes.split("\n").filter(Boolean).map((ex, i) => (
                  <div key={i} style={{
                    padding: "8px 10px", fontSize: 12, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
                    borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff",
                  }}>
                    {ex}
                  </div>
                ))}
              </div>
            )}

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
      )}

      <Actions onNext={onNext} nextLabel="Personnaliser ce programme →" />
    </div>
  );
}
