"use client";

import { useState } from "react";
import { format, addDays, startOfWeek, subDays, addMonths, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type ViewMode = "week" | "month";

interface CalendarHeaderProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange?: (date: string) => void;
  dotMap?: Record<string, "done-light" | "done-med" | "done-high" | "planned">;
  // Si non fourni, toggle et bouton Aujourd'hui sont masqués (/today n'en a pas besoin)
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export default function CalendarHeader({
  selectedDate,
  onDateChange,
  dotMap = {},
  viewMode = "week",
  onViewModeChange,
}: CalendarHeaderProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate + "T12:00:00"));

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const showControls = !!onViewModeChange; // toggle + Aujourd'hui uniquement si /week ou /coach/planning

  function selectDay(d: Date) {
    const iso = format(d, "yyyy-MM-dd");
    setCurrentDate(d);
    onDateChange?.(iso);
  }

  function prevPeriod() {
    const newDate = viewMode === "month" ? subMonths(currentDate, 1) : subDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  function nextPeriod() {
    const newDate = viewMode === "month" ? addMonths(currentDate, 1) : addDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  function goToday() {
    const now = new Date();
    setCurrentDate(now);
    onDateChange?.(today);
    if (viewMode === "month") onViewModeChange?.("week");
  }

  const isOnCurrentPeriod = viewMode === "week"
    ? days.some(d => format(d, "yyyy-MM-dd") === today)
    : format(currentDate, "yyyy-MM") === format(new Date(), "yyyy-MM");

  return (
    <header style={{
      background: "radial-gradient(circle at 18% 8%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg,#050505 0%,#171717 58%,#101010 100%)",
      boxShadow: "0 16px 38px rgba(0,0,0,.18)",
      color: "#fff",
      paddingTop: 8,
    }}>
      {/* Top row : [Aujourd'hui]  [‹ mois/année ›]  [Semaine|Mois] */}
      <div className="flex items-center px-4 pb-3 pt-[14px] gap-2">

        {/* Gauche : Aujourd'hui (ou placeholder pour garder l'alignement) */}
        <div style={{ minWidth: 80 }}>
          {showControls && !isOnCurrentPeriod && (
            <button
              onClick={goToday}
              style={{
                height: 28, paddingLeft: 10, paddingRight: 10, borderRadius: 8,
                background: "rgba(212,64,0,.22)", border: "1px solid rgba(212,64,0,.4)",
                color: "#ff8a55", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Aujourd'hui
            </button>
          )}
        </div>

        {/* Centre : flèches + label mois */}
        <div className="flex gap-1 items-center flex-1 justify-center">
          <button onClick={prevPeriod} className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white border border-white/16" style={{ background: "#202020" }}>‹</button>
          <span className="text-[14px] font-black uppercase tracking-[0.02em] text-white px-2">
            {format(currentDate, "MMMM yyyy", { locale: fr })}
          </span>
          <button onClick={nextPeriod} className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white border border-white/16" style={{ background: "#202020" }}>›</button>
        </div>

        {/* Droite : toggle Semaine/Mois */}
        <div style={{ minWidth: 80, display: "flex", justifyContent: "flex-end" }}>
          {showControls && (
            <div style={{ display: "flex", background: "rgba(255,255,255,.10)", borderRadius: 10, padding: 3, gap: 2 }}>
              {(["week", "month"] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => onViewModeChange?.(m)}
                  style={{
                    height: 28, paddingLeft: 10, paddingRight: 10, borderRadius: 8, border: "none",
                    background: viewMode === m ? "#fff" : "transparent",
                    color: viewMode === m ? "#111" : "rgba(255,255,255,.6)",
                    fontSize: 11, fontWeight: 800, cursor: "pointer", transition: "all .15s",
                  }}
                >
                  {m === "week" ? "Sem." : "Mois"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Day strip — visible en semaine (toujours sur /today, conditionnel sur /week) */}
      {viewMode === "week" && (
        <div className="flex justify-between px-[18px] pb-4">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const isToday = iso === today;
            const isSelected = iso === format(currentDate, "yyyy-MM-dd");
            const dot = dotMap[iso];
            return (
              <button
                key={iso}
                onClick={() => selectDay(d)}
                className={cn("flex-1 flex flex-col items-center gap-[3px] py-1 rounded-[10px] transition-all duration-150 border-0 bg-transparent cursor-pointer hover:bg-white/8")}
              >
                <span className="text-[9px] font-black tracking-[0.05em] uppercase" style={{ color: "rgba(255,255,255,0.58)" }}>
                  {format(d, "EEE", { locale: fr }).slice(0, 3)}
                </span>
                <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all",
                  isSelected ? "bg-white text-[#111]" : isToday ? "border border-accent text-white" : "text-white")}>
                  {format(d, "d")}
                </span>
                <span className="w-1 h-1 rounded-full" style={{
                  background: dot ? dot === "done-light" ? "#7ecb20" : dot === "done-med" ? "#f28a00" : dot === "done-high" ? "#d10000" : "#d44000" : "transparent",
                }} />
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
