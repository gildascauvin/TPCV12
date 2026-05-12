"use client";

import { useState } from "react";
import { format, addDays, startOfWeek, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CalendarHeaderProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange?: (date: string) => void;
  dotMap?: Record<string, "done-light" | "done-med" | "done-high" | "planned">;
}

export default function CalendarHeader({
  selectedDate,
  onDateChange,
  dotMap = {},
}: CalendarHeaderProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate));

  // Build 7-day strip centred on today's week (Mon→Sun)
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function selectDay(d: Date) {
    const iso = format(d, "yyyy-MM-dd");
    setCurrentDate(d);
    onDateChange?.(iso);
  }

  function prevWeek() {
    const newDate = subDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  function nextWeek() {
    const newDate = addDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  return (
    <header
      style={{
        background:
          "radial-gradient(circle at 18% 8%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg,#050505 0%,#171717 58%,#101010 100%)",
        boxShadow: "0 16px 38px rgba(0,0,0,.18)",
        color: "#fff",
        paddingTop: 8,
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-6 pb-3 pt-[18px]">
        <span className="text-[15px] font-black uppercase tracking-[0.02em] text-white">
          {format(currentDate, "MMMM yyyy", { locale: fr })}
        </span>
        <div className="flex gap-1">
          <button
            onClick={prevWeek}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white border border-white/16"
            style={{ background: "#202020" }}
          >
            ‹
          </button>
          <button
            onClick={nextWeek}
            className="w-[34px] h-[34px] flex items-center justify-center rounded-[8px] text-white border border-white/16"
            style={{ background: "#202020" }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Day strip */}
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
              className={cn(
                "flex-1 flex flex-col items-center gap-[3px] py-1 rounded-[10px] transition-all duration-150 border-0 bg-transparent cursor-pointer",
                "hover:bg-white/8"
              )}
            >
              <span
                className="text-[9px] font-black tracking-[0.05em] uppercase"
                style={{ color: "rgba(255,255,255,0.58)" }}
              >
                {format(d, "EEE", { locale: fr }).slice(0, 3)}
              </span>
              <span
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all",
                  isSelected
                    ? "bg-white text-[#111]"
                    : isToday
                    ? "border border-accent text-white"
                    : "text-white"
                )}
              >
                {format(d, "d")}
              </span>
              <span
                className="w-1 h-1 rounded-full"
                style={{
                  background: dot
                    ? dot === "done-light"
                      ? "#7ecb20"
                      : dot === "done-med"
                      ? "#f28a00"
                      : dot === "done-high"
                      ? "#d10000"
                      : "#d44000"
                    : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>
    </header>
  );
}
