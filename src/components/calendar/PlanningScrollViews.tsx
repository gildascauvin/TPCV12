"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, addDays, subDays, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { type DragEndEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core";
import { PlanningDnd } from "@/components/calendar/DraggablePlanning";

/* Vues "défilantes" du planning (POC 2026-10-26), partagées par /week et /coach/planning :
   - mobile/tablette (< 1024px) : vue Colonne, jours empilés de haut en bas, on descend vers le futur ;
   - desktop : vue Bloc, une colonne par semaine et une ligne par jour (tous les lundis côte à côte).
   Chaque jour est rendu par la page elle-même (`renderDay` → sa vraie carte DayColumn), ce module ne
   gère que la disposition, le chargement par plage (infini vers le futur) et la bascule. */

const STORAGE_KEY = "tpc_planning_column";
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const INITIAL_WEEKS = 3;
const MAX_WEEKS = 26;

type RenderDay = (date: Date, prevStr: string, nextStr: string) => React.ReactNode;

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function usePlanningScroll({ selectedDate, isLg, loadRange, onVisibleDate }: {
  selectedDate: string;
  isLg: boolean;
  /* Fetch + fusion des séances/wellness de la plage [start, end] (dates ISO incluses). */
  loadRange: (start: string, end: string) => Promise<void>;
  /* Date à refléter dans le header pendant le défilement (jour en haut d'écran en colonne, 1re
     semaine visible en bloc) — la page met à jour sa date sélectionnée SANS recharger ni défiler. */
  onVisibleDate: (date: string) => void;
}) {
  const [active, setActive] = useState(false);
  /* Faux tant que la vue initiale (semaine ou colonne) n'est pas choisie : la page masque alors sa
     grille semaine sur mobile, sinon elle s'affiche un instant avant de basculer en colonne. */
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  const [scrollTarget, setScrollTarget] = useState<{ date: string; smooth: boolean } | null>(null);
  const lastVisibleRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const blocScrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function resetAt(date: string) {
    const monday = startOfWeek(new Date(date + "T12:00:00"), { weekStartsOn: 1 });
    const s = format(monday, "yyyy-MM-dd");
    setStart(s);
    setWeeks(INITIAL_WEEKS);
    loadRange(s, format(addDays(monday, INITIAL_WEEKS * 7 - 1), "yyyy-MM-dd"));
  }

  function enable(on: boolean, date: string, remember = true) {
    setActive(on);
    if (remember) { try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch {} }
    if (!on) return;
    resetAt(date);
    lastVisibleRef.current = date;
    setScrollTarget({ date, smooth: remember });
  }

  /* À appeler depuis le handleDateChange de la page (flèches ‹ ›, calendrier, "Aujourd'hui"). Vue
     bloc : la semaine choisie devient la 1re colonne à gauche ; vue colonne : on recharge seulement
     si la date sort de la plage déjà affichée, puis on y descend. */
  function onDateChange(date: string) {
    if (!active) return;
    const end = format(addDays(new Date(start + "T12:00:00"), weeks * 7 - 1), "yyyy-MM-dd");
    if (isLg || date < start || date > end) resetAt(date);
    lastVisibleRef.current = date;
    setScrollTarget({ date, smooth: true });
  }

  // Par défaut : vue colonne sur mobile (< 640px), vue semaine ailleurs ; un choix explicite gagne.
  // window.innerWidth lu directement : useBreakpoint vaut encore 390 au 1er rendu. Effet de layout :
  // la bascule est appliquée avant le 1er affichage côté client (pas de vue semaine entrevue).
  useIsomorphicLayoutEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    const on = stored != null ? stored === "1" : window.innerWidth < 640;
    if (on) enable(true, selectedDate, false);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Défilement infini vers le futur : la sentinelle en bout de liste charge 2 semaines de plus.
  useEffect(() => {
    if (!active) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting || loadingRef.current || weeks >= MAX_WEEKS) return;
      loadingRef.current = true;
      const from = addDays(new Date(start + "T12:00:00"), weeks * 7);
      loadRange(format(from, "yyyy-MM-dd"), format(addDays(from, 13), "yyyy-MM-dd"))
        .finally(() => { setWeeks(w => w + 2); loadingRef.current = false; });
    }, isLg
      ? { root: blocScrollRef.current, rootMargin: "0px 600px 0px 0px" }
      : { rootMargin: "0px 0px 800px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, start, weeks, isLg]);

  // Amène le jour choisi en haut d'écran (colonne) / la grille au bord gauche (bloc). Instantané à
  // l'ouverture de la page, animé ensuite (calendrier, flèches, bascule).
  useEffect(() => {
    if (!active || !scrollTarget) return;
    const behavior: ScrollBehavior = scrollTarget.smooth ? "smooth" : "auto";
    const id = requestAnimationFrame(() => {
      if (isLg) blocScrollRef.current?.scrollTo({ left: 0, behavior });
      else dayRefs.current[scrollTarget.date]?.scrollIntoView({ block: "start", behavior });
    });
    return () => cancelAnimationFrame(id);
  }, [active, scrollTarget, start, isLg]);

  // Le header suit le défilement : colonne = jour en haut d'écran ; bloc = 1re semaine visible à
  // gauche (aujourd'hui si c'est la semaine en cours, sinon son lundi).
  useEffect(() => {
    if (!active) return;
    const target: HTMLElement | Window | null = isLg ? blocScrollRef.current : window;
    if (!target) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const entries = Object.entries(dayRefs.current).filter(([, el]) => el).sort(([a], [b]) => a.localeCompare(b));
      let date: string | null = null;
      if (isLg) {
        const left = blocScrollRef.current!.getBoundingClientRect().left;
        const hit = entries.find(([d, el]) => new Date(d + "T12:00:00").getDay() === 1 && el!.getBoundingClientRect().right > left + 40);
        if (hit) {
          const sunday = iso(addDays(new Date(hit[0] + "T12:00:00"), 6));
          const today = iso(new Date());
          date = today >= hit[0] && today <= sunday ? today : hit[0];
        }
      } else {
        date = entries.find(([, el]) => el!.getBoundingClientRect().bottom > 80)?.[0] ?? null;
      }
      if (date && date !== lastVisibleRef.current) {
        lastVisibleRef.current = date;
        onVisibleDate(date);
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => { target.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isLg, start, weeks]);

  return { active, ready, enable, onDateChange, view: { start, weeks, sentinelRef, blocScrollRef, dayRefs } };
}

export type PlanningScrollView = ReturnType<typeof usePlanningScroll>["view"];

/* Bascule Semaine / vue défilante : un seul bouton au bord gauche du header, en miroir du profil,
   qui montre l'icône de la vue vers laquelle il bascule (colonne sur mobile, bloc sur desktop). */
export function PlanningLayoutToggle({ alt, bloc, onChange }: { alt: boolean; bloc: boolean; onChange: (alt: boolean) => void }) {
  const label = alt ? "Passer en vue semaine" : bloc ? "Passer en vue bloc" : "Passer en vue colonne";
  return (
    <button type="button" aria-label={label} title={label} onClick={() => onChange(!alt)} style={{
      width: 40, height: 40, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", cursor: "pointer",
      background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.85)",
    }}>
      {alt ? (
        <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="1" y="2" width="3" height="10" rx="1" /><rect x="5.5" y="2" width="3" height="10" rx="1" /><rect x="10" y="2" width="3" height="10" rx="1" /></svg>
      ) : bloc ? (
        <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="1" y="1" width="5" height="5" rx="1" /><rect x="8" y="1" width="5" height="5" rx="1" /><rect x="1" y="8" width="5" height="5" rx="1" /><rect x="8" y="8" width="5" height="5" rx="1" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden><rect x="2" y="1" width="10" height="3" rx="1" /><rect x="2" y="5.5" width="10" height="3" rx="1" /><rect x="2" y="10" width="10" height="3" rx="1" /></svg>
      )}
    </button>
  );
}

function WeekLabel({ monday, todayStr, title }: { monday: Date; todayStr: string; title: string | null }) {
  const mondayIso = format(monday, "yyyy-MM-dd");
  const sundayIso = format(addDays(monday, 6), "yyyy-MM-dd");
  const isThisWeek = todayStr >= mondayIso && todayStr <= sundayIso;
  return (
    <div style={{ padding: "6px 2px 2px", borderBottom: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: isThisWeek ? "#ff8a55" : "rgba(255,255,255,.85)", whiteSpace: "nowrap" }}>
        {isThisWeek ? "Cette semaine" : `Sem. du ${format(monday, "d MMM", { locale: fr })}`}
      </div>
      {title && (
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {title}
        </div>
      )}
    </div>
  );
}

export function PlanningScrollViews({ view, bloc, todayStr, weekTitleFor, renderDay, sensors, onDragEnd, padX }: {
  view: PlanningScrollView;
  bloc: boolean;
  todayStr: string;
  weekTitleFor: (mondayIso: string) => string | null;
  renderDay: RenderDay;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (event: DragEndEvent) => void;
  /* Marge latérale de la page (alignée sur la vue semaine). */
  padX: number;
}) {
  const startD = new Date(view.start + "T12:00:00");
  const mondays = Array.from({ length: view.weeks }, (_, w) => addDays(startD, w * 7));
  const day = (date: Date) => renderDay(date, iso(subDays(date, 1)), iso(addDays(date, 1)));

  return (
    <PlanningDnd sensors={sensors} onDragEnd={onDragEnd}>
      {bloc ? (
        <div style={{ padding: `12px ${padX}px 24px` }}>
          <div ref={view.blocScrollRef} style={{ overflowX: "auto", scrollbarWidth: "thin", paddingBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "stretch", width: "max-content" }}>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${view.weeks}, var(--wk-col, 280px))`, gap: 12 }}>
                {mondays.map(m => <div key={iso(m)}><WeekLabel monday={m} todayStr={todayStr} title={weekTitleFor(iso(m))} /></div>)}
                {Array.from({ length: 7 }, (_, d) => mondays.map(m => {
                  const date = addDays(m, d);
                  return (
                    <div key={iso(date)} ref={el => { view.dayRefs.current[iso(date)] = el; }} style={{ display: "flex", flexDirection: "column" }}>
                      {day(date)}
                    </div>
                  );
                }))}
              </div>
              <div ref={view.sentinelRef} style={{ width: 1, flexShrink: 0 }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: `8px ${padX}px 24px` }}>
          {mondays.map(m => (
            <section key={iso(m)} style={{ marginBottom: 18 }}>
              <div style={{ marginBottom: 8 }}><WeekLabel monday={m} todayStr={todayStr} title={weekTitleFor(iso(m))} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Array.from({ length: 7 }, (_, d) => {
                  const date = addDays(m, d);
                  return (
                    <div key={iso(date)} ref={el => { view.dayRefs.current[iso(date)] = el; }} style={{ scrollMarginTop: 12 }}>
                      {day(date)}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <div ref={view.sentinelRef} style={{ height: 1 }} />
          {view.weeks >= MAX_WEEKS && (
            <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.4)", padding: "8px 0 0" }}>Fin du planning affiché ({MAX_WEEKS} semaines)</div>
          )}
        </div>
      )}
    </PlanningDnd>
  );
}
