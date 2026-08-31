"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { format, addDays, startOfWeek, subDays, addMonths, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { wellnessColor } from "@/lib/wellness";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import ViewToggleButton from "./ViewToggleButton";

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
  /* Icône profil en haut à droite du header (2026-08-31) — remplace l'onglet "Profil" retiré de
     la bottom nav (remplacé par "Programmes"). Un seul endroit à câbler pour toutes les pages qui
     utilisent ce header plutôt qu'un bouton par page. Absent = pas d'icône (repli permissif). */
  profileHref?: string;
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
  profileHref,
}: CalendarHeaderProps) {
  const { isMd } = useBreakpoint();
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

  function handleHeaderTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleHeaderTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -55) onSwipe?.("next");
    else if (dx > 55) onSwipe?.("prev");
  }

  return (
    <header
      onTouchStart={handleHeaderTouchStart}
      onTouchEnd={handleHeaderTouchEnd}
      style={{
        background: "radial-gradient(circle at 18% 8%, rgba(255,255,255,.08), transparent 24%), linear-gradient(180deg,#050505 0%,#171717 58%,#101010 100%)",
        boxShadow: "0 16px 38px rgba(0,0,0,.18)",
        color: "#fff",
        paddingTop: 8,
      }}>
      {/* Top row (2026-09-01) : flèches remises (ça tient maintenant que le reste a été
          compacté), Aujourd'hui déplacé à gauche à côté du mois affiché — le swipe (attaché à
          tout le header, pas juste le day strip) reste un moyen de naviguer en plus des flèches. */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[14px] gap-2">
        <div className="flex gap-2 items-center">
          <button onClick={prevPeriod} className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>‹</button>
          <button onClick={nextPeriod} className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>›</button>
          <span className="text-[16px] font-black uppercase tracking-[0.02em] text-white px-1">
            {format(currentDate, "MMMM", { locale: fr })}
          </span>
          {showTodayBtn && (
            <button
              onClick={isOnCurrentPeriod ? undefined : goToday}
              style={{
                height: 32, paddingLeft: 12, paddingRight: 12, borderRadius: 10,
                background: isOnCurrentPeriod ? "rgba(255,255,255,.08)" : "rgba(212,64,0,.22)",
                border: `1px solid ${isOnCurrentPeriod ? "rgba(255,255,255,.14)" : "rgba(212,64,0,.4)"}`,
                color: isOnCurrentPeriod ? "rgba(255,255,255,.7)" : "#ff8a55",
                fontSize: 11, fontWeight: 800,
                cursor: isOnCurrentPeriod ? "default" : "pointer",
                whiteSpace: "nowrap",
                transition: "all .2s",
              }}
            >
              {isMd ? "Aujourd'hui" : "Auj."}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {showControls ? (
            <ViewToggleButton mode={viewMode} onChange={m => onViewModeChange?.(m)} />
          ) : extraControls}
          {profileHref && (
            <Link
              href={profileHref}
              aria-label="Profil"
              style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)",
                color: "rgba(255,255,255,.85)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="2.15"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7.4 8.3a7.4 7.4 0 0 1 14.8 0"/>
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Day strip avec wellness rings — semaine uniquement */}
      {viewMode === "week" && (
        <div className="flex justify-between px-[18px] pb-4">
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
