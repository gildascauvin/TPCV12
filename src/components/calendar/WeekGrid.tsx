"use client";

import { format, addDays, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { WellnessDaily, Session } from "@/types";

interface WeekGridProps {
  referenceDate: Date;
  wellnessByDate: Record<string, WellnessDaily>;
  sessionsByDate: Record<string, Session[]>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function WeekGrid({
  referenceDate,
  wellnessByDate,
  sessionsByDate,
  selectedDate,
  onSelectDate,
}: WeekGridProps) {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="grid grid-cols-7 gap-[3px] px-3 pb-3">
      {days.map((d) => {
        const iso = format(d, "yyyy-MM-dd");
        const isToday = iso === today;
        const isSelected = iso === selectedDate;
        const wellness = wellnessByDate[iso];
        const sessions = sessionsByDate[iso] ?? [];
        const doneSessions = sessions.filter((s) => s.done);
        const plannedSessions = sessions.filter((s) => !s.done);

        return (
          <button
            key={iso}
            onClick={() => onSelectDate(iso)}
            className={cn(
              "flex flex-col gap-[2px] rounded-[7px] border bg-white p-1 cursor-pointer transition-all min-h-[52px]",
              isSelected
                ? "border-accent bg-accent/5"
                : isToday
                ? "border-accent/40"
                : "border-black/8"
            )}
          >
            {/* Charge bar */}
            <div
              className="h-[3px] w-full rounded-[2px] mb-[2px]"
              style={{
                background: wellness?.score
                  ? wellness.score >= 70
                    ? "#7ecb20"
                    : wellness.score >= 45
                    ? "#f28a00"
                    : "#d10000"
                  : "transparent",
              }}
            />
            {doneSessions.slice(0, 2).map((s) => (
              <span
                key={s.id}
                className="text-[9px] font-medium rounded-[4px] px-1 py-[2px] leading-[1.3] truncate w-full"
                style={{ background: "rgba(126,203,32,0.12)", color: "#5a9a0c" }}
              >
                {s.name}
              </span>
            ))}
            {plannedSessions.slice(0, 1).map((s) => (
              <span
                key={s.id}
                className="text-[9px] font-medium rounded-[4px] px-1 py-[2px] leading-[1.3] truncate w-full"
                style={{ background: "rgba(212,64,0,0.10)", color: "#d44000" }}
              >
                {s.name}
              </span>
            ))}
            {sessions.length === 0 && (
              <span className="text-[8px] text-center text-muted mt-auto w-full">—</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
