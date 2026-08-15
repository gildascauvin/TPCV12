"use client";

import { useState, useEffect, useRef } from "react";
import { format, addDays, startOfWeek, subDays, addMonths, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { wellnessColor } from "@/lib/wellness";

export type ViewMode = "week" | "month";

interface CalendarHeaderProps {
  selectedDate: string;
  onDateChange?: (date: string) => void;
  dotMap?: Record<string, "done-light" | "done-med" | "done-high" | "planned">;
  wellnessMap?: Record<string, number | null>;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onSwipe?: (dir: "next" | "prev") => void;
  /* Slot alternatif dans le même emplacement (haut-droite) que le toggle Semaine/Mois — pour les
     pages qui veulent un contrôle différent à cet endroit sans activer le toggle de navigation
     lui-même (ex. /conseils, /coach/athletes : bascule 7j/4 semaines des graphiques, indépendante
     de la navigation par jour de ce header — voir RangeToggle.tsx). Ignoré si onViewModeChange est
     fourni (jamais les deux en même temps). */
  extraControls?: React.ReactNode;
}

const CIRC = 81.68; // 2π × r=13

// Dégradé séquentiel bleu (wellnessColor) — voir SparkLineClient.tsx pour la doc complète du choix.
function ringColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.15)";
  return wellnessColor(score);
}

function dotColor(dot: string) {
  if (dot === "done-high") return "#d10000";
  if (dot === "done-med")  return "#f28a00";
  if (dot === "done-light") return "#7ecb20";
  return "#d44000"; // planned
}

export default function CalendarHeader({
  selectedDate,
  onDateChange,
  dotMap = {},
  wellnessMap = {},
  viewMode = "week",
  onViewModeChange,
  onSwipe,
  extraControls,
}: CalendarHeaderProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate + "T12:00:00"));
  const touchStartX = useRef(0);

  // Sync interne quand le parent navigue (swipe, prev/next week)
  useEffect(() => {
    setCurrentDate(new Date(selectedDate + "T12:00:00"));
  }, [selectedDate]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const showControls = !!onViewModeChange;
  const showTodayBtn = !!onDateChange;

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
  }

  const isOnCurrentPeriod = viewMode === "week"
    ? days.some(d => format(d, "yyyy-MM-dd") === today)
    : format(currentDate, "yyyy-MM") === format(new Date(), "yyyy-MM");

  function handleStripTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleStripTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -55) onSwipe?.("next");
    else if (dx > 55) onSwipe?.("prev");
  }

  return (
    <header style={{
      background: "radial-gradient(circle at 18% 8%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg,#050505 0%,#171717 58%,#101010 100%)",
      boxShadow: "0 16px 38px rgba(0,0,0,.18)",
      color: "#fff",
      paddingTop: 8,
    }}>
      {/* Top row */}
      <div className="flex items-center px-4 pb-3 pt-[14px] gap-2">

        {/* Gauche : Aujourd'hui — visible dès qu'il y a un onDateChange */}
        <div style={{ minWidth: 80 }}>
          {showTodayBtn && (
            <button
              onClick={isOnCurrentPeriod ? undefined : goToday}
              style={{
                height: 28, paddingLeft: 10, paddingRight: 10, borderRadius: 8,
                background: isOnCurrentPeriod ? "rgba(255,255,255,.08)" : "rgba(212,64,0,.22)",
                border: `1px solid ${isOnCurrentPeriod ? "rgba(255,255,255,.12)" : "rgba(212,64,0,.4)"}`,
                color: isOnCurrentPeriod ? "rgba(255,255,255,.35)" : "#ff8a55",
                fontSize: 11, fontWeight: 800,
                cursor: isOnCurrentPeriod ? "default" : "pointer",
                whiteSpace: "nowrap",
                transition: "all .2s",
              }}
            >
              Aujourd&apos;hui
            </button>
          )}
        </div>

        {/* Centre : flèches + label mois */}
        <div className="flex gap-1 items-center flex-1 justify-center">
          <button onClick={prevPeriod} className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>‹</button>
          <span className="text-[14px] font-black uppercase tracking-[0.02em] text-white px-2">
            {format(currentDate, "MMMM yyyy", { locale: fr })}
          </span>
          <button onClick={nextPeriod} className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>›</button>
        </div>

        {/* Droite : toggle Semaine/Mois */}
        <div style={{ minWidth: 80, display: "flex", justifyContent: "flex-end" }}>
          {showControls ? (
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
          ) : extraControls}
        </div>
      </div>

      {/* Day strip avec wellness rings — semaine uniquement */}
      {viewMode === "week" && (
        <div
          className="flex justify-between px-[18px] pb-4"
          onTouchStart={handleStripTouchStart}
          onTouchEnd={handleStripTouchEnd}
        >
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const isToday    = iso === today;
            const isSelected = iso === format(currentDate, "yyyy-MM-dd");
            const dot        = dotMap[iso];
            const score      = wellnessMap[iso] ?? null;
            const rc         = ringColor(score);
            const dashOffset = score !== null ? CIRC * (1 - score / 100) : CIRC;

            return (
              <button
                key={iso}
                onClick={() => selectDay(d)}
                className={cn("flex-1 flex flex-col items-center gap-[3px] py-1 rounded-[10px] transition-all duration-150 border-0 bg-transparent cursor-pointer hover:bg-white/8")}
              >
                {/* Jour abrégé */}
                <span className="text-[9px] font-black tracking-[0.05em] uppercase" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {format(d, "EEE", { locale: fr }).slice(0, 3)}
                </span>

                {/* Ring wellness + numéro */}
                <div style={{ position: "relative", width: 36, height: 36 }}>
                  {/* SVG wellness ring */}
                  <svg width="36" height="36" viewBox="0 0 36 36"
                    style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
                    <circle cx="18" cy="18" r="13" fill="none"
                      stroke="rgba(255,255,255,0.12)" strokeWidth="2.8" />
                    <circle cx="18" cy="18" r="13" fill="none"
                      stroke={score !== null ? rc : "transparent"}
                      strokeWidth="2.8"
                      strokeDasharray={CIRC}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset .3s ease" }}
                    />
                  </svg>

                  {/* Fond blanc pour le jour sélectionné */}
                  {isSelected && (
                    <div style={{
                      position: "absolute", inset: 6, borderRadius: "50%",
                      background: "#fff",
                    }} />
                  )}

                  {/* Numéro du jour */}
                  <span style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 900, lineHeight: 1,
                    color: isSelected ? "#111" : isToday ? "#ff8a55" : "rgba(255,255,255,.9)",
                    zIndex: 1,
                  }}>
                    {format(d, "d")}
                  </span>
                </div>

                {/* Dot session */}
                <span style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: dot ? dotColor(dot) : "transparent",
                  transition: "background .2s",
                }} />
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
