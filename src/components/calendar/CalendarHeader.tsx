"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  format, addDays, startOfWeek, subDays, addMonths, subMonths,
  startOfMonth, endOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { wellnessColor } from "@/lib/wellness";
import { DARK_CARD_BG } from "@/lib/theme";

export type ViewMode = "week" | "month";
export type HeaderMode = "day" | "period" | "title";

// ViewModeSegmented (toggle Sem./Mois) supprimé (2026-09-26) — le calendrier popup ci-dessous
// (rings + points de séance + titre semaine/programme, façon "vue mois") remplace désormais ce
// que la vue Mois de /week et /coach/planning apportait ; leur bloc `viewMode === "month"` reste
// en place (dead code assumé, `viewMode` figé sur "week" faute d'un toggle pour le changer — même
// principe déjà appliqué ailleurs dans ce repo pour un step/mode devenu inatteignable).

interface CalendarHeaderProps {
  mode?: HeaderMode;
  /* Titre statique, mode "title" uniquement (ex. "Performance"). */
  title?: string;
  selectedDate: string;
  onDateChange?: (date: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  /* Slot alternatif dans le même emplacement (haut-droite) que le toggle Semaine/Mois — pour les
     pages qui veulent un contrôle différent à cet endroit sans activer le toggle de navigation
     lui-même (ex. RangeToggle.tsx : 7j/28j/90j des graphiques Charge/Récupération). Ignoré si
     onViewModeChange est fourni (jamais les deux en même temps). */
  extraControls?: React.ReactNode;
  onProfileClick?: () => void;
  /* Alignement — même largeur de colonne que le sélecteur de sportif (AthleteFilterBar) et le
     contenu de la page en dessous. Chaque page passe sa propre valeur (déjà calculée pour son
     contenu). Absent = pleine largeur. */
  contentMaxWidth?: number;
  /* Wellness rings + points de séance à l'intérieur du calendrier popup uniquement (2026-09-24,
     POC datepicker) — jamais sur le trigger collapsed. Réservé au contexte "un seul sportif"
     (sportif sur /today, ou coach filtré sur UN athlète précis) : Gildas — "quand on est un
     sportif ou filtré sur un, on peut voir les wellness ring autour des jours, avec les points
     des séances". dotMap/wellnessMap ne couvrent en pratique que la semaine déjà chargée par la
     page ; les jours hors de cette fenêtre affichent un jour nu (pas de donnée à afficher). */
  showRings?: boolean;
  wellnessMap?: Record<string, number | null>;
  dotMap?: Record<string, "done-light" | "done-med" | "done-high" | "planned">;
  /* Titre programme/label libre par semaine, affiché en bandeau au-dessus de chaque ligne de 7
     jours du calendrier popup — façon "vue mois" (ProgramBanner compact au-dessus de chaque
     semaine sur /week, /coach/planning). Reçoit le lundi (ISO) de la semaine de la grille popup en
     cours de rendu, retourne le texte à afficher ou `null` (rien affiché — semaine hors de tout
     programme connu de l'appelant, ex. mois pas encore chargé). CalendarHeader reste agnostique de
     la notion de "programme" : chaque page construit elle-même ce texte (nom+emoji+semaine, ou
     libellé libre) à partir de ses propres données déjà chargées. */
  weekTitleFor?: (mondayIso: string) => string | null;
  /* Sans fond propre (2026-09-25) — pour les pages qui portent DÉJÀ leur propre fond dark
     "DARK_CARD_BG" pleine page (/today, /conseils sportif) et veulent que le header s'y fonde,
     plutôt que 2 fonds dark distincts empilés (l'ancien header avait son propre dégradé, visible
     comme une bande séparée au-dessus du fond de page). Le fond de page continue alors SOUS le
     header (voir TodayClient.tsx/ConseilsClient.tsx, header déplacé à l'intérieur du wrapper dark).
     Défaut false = comportement inchangé partout ailleurs (le header garde son propre DARK_CARD_BG,
     îlot sombre sur une page par ailleurs claire — /week, /coach*). */
  seamless?: boolean;
  /* Thème des éléments qui supposent un fond DERRIÈRE eux (pour l'instant : seul le bouton profil,
     `theme="dark"` — icône/pill blanche translucide, illisible sur un fond clair) — pas le fond du
     header lui-même (`seamless`, indépendant). "light" (2026-09-25, CoachClient.tsx COACH_PAGE_BG) :
     icône/pill sombre translucide, pour un header `seamless` posé sur un fond clair. Défaut "dark" =
     comportement inchangé partout ailleurs (headers dark, `/today`/`/week`/`/coach*` avant ce prop). */
  theme?: "dark" | "light";
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weekRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  if (format(weekStart, "MM") === format(weekEnd, "MM")) {
    return `${format(weekStart, "d")}–${format(weekEnd, "d MMM", { locale: fr })}`;
  }
  return `${format(weekStart, "d MMM", { locale: fr })} – ${format(weekEnd, "d MMM", { locale: fr })}`;
}

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function monthGridDays(viewDate: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

const DOT_COLOR: Record<string, string> = {
  "done-light": "#4caf50",
  "done-med": "#f28a00",
  "done-high": "#d44000",
  planned: "rgba(255,255,255,.45)",
};

// viewBox fixe + width/height 100% (2026-09-25, fix — "les wellness ring... sont moches et pas
// toujours droites/centrées") : un <svg width={px} height={px}> figé ne correspondait pas toujours
// à la taille réelle de la cellule (calculée en `1fr` par la grille CSS, jamais exactement égale au
// `cellSize` codé en dur) — la ring débordait ou restait décalée du centre selon l'arrondi. Un
// viewBox à coordonnées fixes, étiré à 100% du conteneur (toujours carré, voir le cell wrapper),
// reste toujours centré et proportionné quelle que soit la taille réelle rendue.
const RING_VB = 36;
function DayRing({ score }: { score: number }) {
  const r = RING_VB / 2 - 3;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = wellnessColor(score);
  return (
    <svg viewBox={`0 0 ${RING_VB} ${RING_VB}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <circle cx={RING_VB / 2} cy={RING_VB / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={2.5} />
      <circle
        cx={RING_VB / 2} cy={RING_VB / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
        strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${RING_VB / 2} ${RING_VB / 2})`}
      />
    </svg>
  );
}

export default function CalendarHeader({
  mode = "period",
  title,
  selectedDate,
  onDateChange,
  viewMode = "week",
  onViewModeChange,
  extraControls,
  onProfileClick,
  contentMaxWidth,
  showRings,
  wellnessMap,
  dotMap,
  weekTitleFor,
  seamless = false,
  theme = "dark",
}: CalendarHeaderProps) {
  const { isMd } = useBreakpoint();
  const today = format(new Date(), "yyyy-MM-dd");
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate + "T12:00:00"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(currentDate);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef(0);
  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const popupNodeRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setCurrentDate(new Date(selectedDate + "T12:00:00"));
  }, [selectedDate]);

  // Portalé dans document.body (2026-09-24, fix) — un simple z-index élevé sur un élément resté
  // dans l'arbre du header ne suffisait pas en pratique : un widget ailleurs sur la page (ring
  // wellness de Coach Control) se peignait par-dessus le popup malgré un z-index pourtant plus bas,
  // vraisemblablement une couche de composition GPU indépendante créée par un ancêtre transformé.
  // Le portail échappe à tout contexte d'empilement ambigu — position calculée depuis le rect réel
  // du trigger plutôt qu'un simple `position:absolute` relatif (le portail sort du flux du header).
  useLayoutEffect(() => {
    if (!calendarOpen || !triggerBtnRef.current) return;
    const r = triggerBtnRef.current.getBoundingClientRect();
    setPopupPos({ top: r.bottom + 10, left: r.left + r.width / 2 });
  }, [calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerWrapRef.current?.contains(t)) return;
      if (popupNodeRef.current?.contains(t)) return;
      setCalendarOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCalendarOpen(false);
    }
    function onScroll() { setCalendarOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [calendarOpen]);

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  // Popup calendrier — day mode et period+week uniquement (POC 2026-09-24). En period+month, une
  // grille mensuelle complète est déjà affichée sur la page elle-même : un 2e calendrier dans le
  // header serait redondant, le label reste un simple pas-à-pas comme avant.
  const hasPopup = mode !== "title" && !!onDateChange && !(mode === "period" && viewMode === "month");

  function prevPeriod() {
    const newDate = mode === "day" ? subDays(currentDate, 1) : viewMode === "month" ? subMonths(currentDate, 1) : subDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  function nextPeriod() {
    const newDate = mode === "day" ? addDays(currentDate, 1) : viewMode === "month" ? addMonths(currentDate, 1) : addDays(currentDate, 7);
    setCurrentDate(newDate);
    onDateChange?.(format(newDate, "yyyy-MM-dd"));
  }

  function goToday() {
    const now = new Date();
    setCurrentDate(now);
    onDateChange?.(today);
    setCalendarOpen(false);
  }

  function toggleCalendar() {
    if (!hasPopup) return;
    // Bascule (2026-09-25, "quand je clique à nouveau dessus je veux que ça le referme") — avant,
    // un 2e clic sur le trigger rouvrait silencieusement le même popup déjà ouvert (no-op visuel).
    if (calendarOpen) { setCalendarOpen(false); return; }
    setCalendarViewDate(currentDate);
    setCalendarOpen(true);
  }

  function selectDay(date: Date) {
    const iso = format(date, "yyyy-MM-dd");
    setCurrentDate(date);
    onDateChange?.(iso);
    const delay = mode === "day" ? 120 : 220;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setCalendarOpen(false), delay);
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const isOnCurrentPeriod = mode === "day"
    ? format(currentDate, "yyyy-MM-dd") === today
    : mode === "period" && viewMode === "week"
    ? days.some(d => format(d, "yyyy-MM-dd") === today)
    : format(currentDate, "yyyy-MM") === format(new Date(), "yyyy-MM");

  // Masqué quand le calendrier popup existe pour ce mode — son propre bouton "Aujourd'hui" en
  // footer le remplace (POC 2026-09-24, "plus besoin du 'Aujourd'hui' dans le header si le
  // calendar view le contient"). Reste affiché tel quel sur period+month, seul cas sans popup.
  const showTodayBtn = mode !== "title" && !!onDateChange && !isOnCurrentPeriod && !hasPopup;

  const label = mode === "title"
    ? title ?? ""
    : mode === "day"
    ? cap(format(currentDate, "EEE d MMM", { locale: fr }))
    : viewMode === "month"
    ? cap(format(currentDate, "MMM", { locale: fr }))
    : weekRangeLabel(weekStart);

  function handleHeaderTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleHeaderTouchEnd(e: React.TouchEvent) {
    if (mode === "title" || calendarOpen) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -55) nextPeriod();
    else if (dx > 55) prevPeriod();
  }

  const gridDays = monthGridDays(calendarViewDate);
  // Regroupé par semaine (6×7, au lieu d'une grille plate) pour porter un bandeau titre optionnel
  // (weekTitleFor) au-dessus de chaque ligne, façon "vue mois" (2026-09-26).
  const gridWeeks = Array.from({ length: 6 }, (_, i) => gridDays.slice(i * 7, i * 7 + 7));

  // Agrandi (2026-09-26, "tu peux agrandir ce datepicker") — cellule 30→38px, popup 300→340px.
  function renderDayCell(d: Date) {
    const iso = format(d, "yyyy-MM-dd");
    const inMonth = format(d, "M") === format(calendarViewDate, "M");
    const isToday = iso === today;
    const isSelected = mode === "day"
      ? iso === format(currentDate, "yyyy-MM-dd")
      : days.some(wd => format(wd, "yyyy-MM-dd") === iso);
    const ring = showRings && wellnessMap?.[iso] != null ? wellnessMap[iso] : null;
    const dotKind = showRings ? dotMap?.[iso] : undefined;
    return (
      <button
        key={iso}
        onClick={() => selectDay(d)}
        style={{
          cursor: "pointer", borderRadius: 12, background: "transparent",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "3px 0 4px", gap: 3,
        }}
      >
        {/* Boîte ring carrée — le point de séance vit désormais SOUS elle, jamais en
           incrustation top-right (2026-09-25, "je veux que les petits points soient
           sous les ring"). Aujourd'hui = liseré orange sur la boîte plutôt qu'un 2e
           point, pour ne jamais concurrencer visuellement le point de séance. */}
        <div style={{
          position: "relative", width: 38, height: 38, borderRadius: "50%",
          background: isSelected ? "#f04a08" : "transparent",
          boxShadow: isToday && !isSelected ? "0 0 0 1.5px #f04a08" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {ring !== null && <DayRing score={ring} />}
          <span style={{
            position: "relative", zIndex: 1, fontSize: 14,
            fontWeight: isSelected ? 800 : 500,
            color: isSelected ? "#fff" : inMonth ? "#f5f5f7" : "rgba(255,255,255,.28)",
          }}>
            {d.getDate()}
          </span>
        </div>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotKind ? DOT_COLOR[dotKind] : "transparent",
        }} />
      </button>
    );
  }

  return (
    <header
      onTouchStart={handleHeaderTouchStart}
      onTouchEnd={handleHeaderTouchEnd}
      style={{
        background: seamless ? "transparent" : DARK_CARD_BG,
        boxShadow: seamless ? "none" : "0 16px 38px rgba(0,0,0,.18)",
        color: "#fff",
        paddingTop: 8,
      }}>
      <div
        className="relative flex items-center px-4 pb-3 pt-[14px] gap-2"
        style={{ maxWidth: contentMaxWidth, margin: contentMaxWidth ? "0 auto" : undefined }}
      >
        {/* Centré indépendamment de la largeur du bloc de droite (POC 2026-09-24, "ce sélecteur
            doit être centré dans le header"). */}
        <div
          ref={triggerWrapRef}
          style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {mode !== "title" && (
            <button onClick={prevPeriod} className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>‹</button>
          )}
          <button
            ref={triggerBtnRef}
            onClick={toggleCalendar}
            disabled={!hasPopup}
            className="text-[16px] font-black tracking-[0.02em] text-white px-2 h-[32px] rounded-[8px]"
            style={{ background: hasPopup ? "#1a1a1a" : "transparent", cursor: hasPopup ? "pointer" : "default", whiteSpace: "nowrap" }}
          >
            {label}
          </button>

          {mounted && calendarOpen && hasPopup && popupPos && createPortal(
            <div
              ref={popupNodeRef}
              style={{
                position: "fixed", top: popupPos.top, left: popupPos.left, transform: "translateX(-50%)",
                zIndex: 2147483100, width: 340, background: "#1c1c1e", border: "1px solid #3a3a3c",
                borderRadius: 18, padding: 18, boxShadow: "0 16px 48px rgba(0,0,0,.55)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setCalendarViewDate(subMonths(calendarViewDate, 1))} className="w-[30px] h-[30px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#2c2c2e" }}>‹</button>
                {/* color:"#fff" explicite (2026-09-26, fix contraste) — ce span est portalé dans
                   document.body, hors de l'ancêtre <header> qui pose color:#fff : sans lui il
                   retombait sur le noir par défaut du document, quasi invisible sur ce fond dark. */}
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#fff" }}>{cap(format(calendarViewDate, "MMMM yyyy", { locale: fr }))}</span>
                <button onClick={() => setCalendarViewDate(addMonths(calendarViewDate, 1))} className="w-[30px] h-[30px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#2c2c2e" }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
                {WEEKDAY_LABELS.map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.4)", padding: "4px 0" }}>{d}</div>
                ))}
              </div>
              {/* Une ligne par semaine, façon "vue mois" (2026-09-26) — bandeau titre optionnel
                 (programme/label libre, fourni par la page via weekTitleFor) au-dessus de chaque
                 rangée de 7 jours, comme ProgramBanner compact au-dessus de chaque semaine sur
                 /week et /coach/planning. */}
              {gridWeeks.map((week, gi) => {
                const mondayIso = format(week[0], "yyyy-MM-dd");
                const weekLabel = weekTitleFor?.(mondayIso) ?? null;
                return (
                  <div key={gi} style={{ marginBottom: gi < gridWeeks.length - 1 ? 6 : 0 }}>
                    {weekLabel && (
                      <div style={{
                        fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono), monospace",
                        color: "rgba(255,255,255,.55)", padding: "2px 4px 3px",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {weekLabel}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                      {week.map(d => renderDayCell(d))}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <button onClick={goToday} style={{ fontSize: 14, fontWeight: 800, color: "#ff8a55", cursor: "pointer" }}>Aujourd'hui</button>
              </div>
            </div>,
            document.body
          )}
          {mode !== "title" && (
            <button onClick={nextPeriod} className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] text-white" style={{ background: "#202020" }}>›</button>
          )}
          {showTodayBtn && (
            <button
              onClick={goToday}
              style={{
                height: 32, paddingLeft: 12, paddingRight: 12, borderRadius: 10,
                background: "rgba(212,64,0,.22)", border: "1px solid rgba(212,64,0,.4)",
                color: "#ff8a55", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {isMd ? "Aujourd'hui" : "Auj."}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, width: "100%" }}>
          {extraControls}
          {onProfileClick && (
            <button
              onClick={onProfileClick}
              aria-label="Profil"
              style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: theme === "light" ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.10)",
                border: theme === "light" ? "1px solid rgba(0,0,0,.08)" : "1px solid rgba(255,255,255,.12)",
                color: theme === "light" ? "rgba(0,0,0,.62)" : "rgba(255,255,255,.85)", cursor: "pointer",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="2.15"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7.4 8.3a7.4 7.4 0 0 1 14.8 0"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
