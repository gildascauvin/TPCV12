"use client";

import { useEffect, useRef, useState } from "react";

/* Accueil mobile (2026-10-22, POC « séance en sheet » PgTQbMYpsUhqCounWHL28M) : la séance du jour, ou
   le check-in tant qu'il n'est pas fait, vit dans une feuille posée en bas de l'écran, au-dessus de la
   navigation. Glisser la poignée la monte ou la descend, elle reste où on la lâche (bornée) ; un tap
   sur la poignée passe au cran suivant. Glisser le contenu la pilote aussi (voir plus bas). Le
   haut de la page reste visible et défile au-dessus d'elle (le parent réserve sa hauteur en bas). */

export const NAV_CLEAR = 104;   // place réservée sous le contenu pour la navigation flottante
const MIN_H = 132;       // feuille rabaissée : le titre de la séance reste visible

export function sheetBounds(vh: number) {
  const max = Math.max(MIN_H + 120, vh - 150);
  return { min: MIN_H, mid: Math.round(Math.min(max, Math.max(MIN_H + 80, vh * 0.52))), max };
}

export default function HomeSheet({ height, onHeightChange, onVisibleHeight, children, header, dragArea, overNav = false, contentKey }: {
  /** Hauteur visible de la feuille en px (navigation comprise). */
  height: number;
  onHeightChange: (h: number) => void;
  onVisibleHeight?: (h: number) => void;
  children: React.ReactNode;
  /** Ligne toujours visible sous la poignée (ex. nom de la séance), elle se saisit aussi. */
  header?: React.ReactNode;
  /** Zone de la page dont le défilement pilote la feuille : faire défiler l'Accueil vers le bas la fait
      monter en suivant le doigt, remonter (en haut de page) la fait redescendre. */
  dragArea?: HTMLElement | null;
  /** Passe par-dessus la navigation (check-in : ses boutons restent en bas de l'écran). */
  overNav?: boolean;
  /** Change quand le contenu est remplacé (check-in → séance) : le contenu repart en haut. */
  contentKey?: string;
}) {
  const navClear = overNav ? 0 : NAV_CLEAR;
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  /* Jamais plus haute que son contenu (2026-10-22, Gildas : « pas d'espace vide en bas ») : le cran
     haut est ramené à la hauteur réelle poignée + en-tête + contenu + place de la navigation. */
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [contentH, setContentH] = useState<number | null>(null);
  /* Feuille repliée = nom de la 1re séance et sa jauge de RPE visibles au-dessus de la navigation
     (2026-10-22, Gildas) : le contenu marque ce repère avec data-sheet-peek. */
  const [peekH, setPeekH] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const head = headRef.current?.offsetHeight ?? 0;
      setContentH(28 + head + (bodyRef.current?.offsetHeight ?? 0) + navClear);
      const peek = bodyRef.current?.querySelector("[data-sheet-peek]") as HTMLElement | null;
      if (peek && bodyRef.current) {
        const bottom = peek.getBoundingClientRect().bottom - bodyRef.current.getBoundingClientRect().top;
        setPeekH(Math.ceil(28 + head + bottom + 12 + navClear));
      } else setPeekH(null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (bodyRef.current) ro.observe(bodyRef.current);
    if (headRef.current) ro.observe(headRef.current);
    return () => ro.disconnect();
  }, [navClear]);
  const vb = sheetBounds(vh);
  const minH = peekH == null ? vb.min : Math.min(vb.max - 60, peekH);
  const fitMax = contentH == null ? vb.max : Math.max(minH, Math.min(vb.max, Math.ceil(contentH)));
  const b = { min: minH, mid: Math.max(minH, Math.min(vb.mid, fitMax)), max: fitMax };
  const h = Math.max(b.min, Math.min(b.max, height));
  // Hauteur réellement affichée (la demande est bornée par le contenu) : le parent s'en sert pour la
  // place réservée en bas de page. La demande n'est jamais réécrite (contenu pas encore chargé).
  useEffect(() => { onVisibleHeight?.(h); }, [h]); // eslint-disable-line react-hooks/exhaustive-deps
  const atMax = h >= b.max - 4;

  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  function down(e: React.PointerEvent) {
    drag.current = { y: e.clientY, h, moved: false };
    setDragging(true);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    onHeightChange(Math.max(b.min, Math.min(b.max, d.h + dy)));
  }
  function up() {
    const d = drag.current; drag.current = null; setDragging(false);
    if (!d || d.moved) return;
    // Tap : cran suivant (bas → milieu → haut → bas).
    const order = [b.min, b.mid, b.max];
    const i = order.reduce((best, x, k) => (Math.abs(x - d.h) < Math.abs(order[best] - d.h) ? k : best), 0);
    onHeightChange(order[(i + 1) % order.length]);
  }

  /* Défiler la page pilote la feuille (2026-10-22, Gildas : « si je scroll down dans l'accueil ça doit
     faire découvrir la bottom sheet naturellement »). Écouteurs natifs non passifs : on empêche le
     défilement de la page tant que c'est la feuille qui bouge. */
  const hRef = useRef(h); hRef.current = h;
  const boundsRef = useRef(b); boundsRef.current = b;
  const changeRef = useRef(onHeightChange); changeRef.current = onHeightChange;
  useEffect(() => {
    if (!dragArea) return;
    let start: { x: number; y: number; h: number; axis: "x" | "y" | null } | null = null;
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      // Un geste qui règle quelque chose (note d'une jauge, arc de l'anneau de décision) n'est pas un défilement.
      const grabsTouch = t.closest?.("[data-handle]") || (t instanceof SVGElement && getComputedStyle(t).touchAction === "none");
      if (!dragArea.contains(t) || grabsTouch) { start = null; return; }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, h: hRef.current, axis: null };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x, dy = start.y - e.touches[0].clientY;
      if (!start.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        start.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      }
      if (start.axis !== "y") return;
      const bb = boundsRef.current, next = Math.max(bb.min, Math.min(bb.max, start.h + dy));
      // Feuille ouverte en grand et le doigt monte, ou page déjà défilée et le doigt descend : la page défile.
      if (dy > 0 && hRef.current >= bb.max - 1 && next >= bb.max - 1) return;
      if (dy < 0 && window.scrollY > 0) return;
      if (next === hRef.current && ((dy > 0 && next >= bb.max) || (dy < 0 && next <= bb.min))) return;
      e.preventDefault();
      setDragging(true);
      changeRef.current(next);
    };
    const onEnd = () => { if (start) setDragging(false); start = null; };
    const onWheel = (e: WheelEvent) => {
      if (!dragArea.contains(e.target as HTMLElement)) return;
      const bb = boundsRef.current, cur = hRef.current;
      if (e.deltaY > 0 && cur < bb.max - 1) { e.preventDefault(); changeRef.current(Math.min(bb.max, cur + e.deltaY)); }
      else if (e.deltaY < 0 && window.scrollY <= 0 && cur > bb.min + 1) { e.preventDefault(); changeRef.current(Math.max(bb.min, cur + e.deltaY)); }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("wheel", onWheel);
    };
  }, [dragArea]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Contenu remplacé, ou feuille qui n'est plus ouverte en grand (son contenu ne défile plus) : retour en haut,
  // sinon le nom et la jauge de la séance resteraient hors champ.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [contentKey]);
  useEffect(() => { if (!atMax && scrollRef.current) scrollRef.current.scrollTop = 0; }, [atMax]);
  /* Le contenu pilote la feuille (2026-10-27, Gildas : « si je scroll up au maximum il se replie sans
     avoir à trouver la poignée ») : en haut du contenu, le doigt qui descend (ou la molette vers le
     haut) fait descendre la feuille en le suivant, jusqu'en bas ; tant qu'elle n'est pas ouverte en
     grand, le doigt qui monte la fait monter. Au lâcher, elle se cale sur le cran suivant dans le sens
     du geste (min / milieu / haut). Remplace un saut haut → milieu, qui laissait la feuille bloquée
     au milieu. Écouteurs natifs non passifs : on empêche le contenu de défiler pendant ce temps. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let g: { y: number; h: number; taken: boolean; skip: boolean; dir: number } | null = null;
    const snap = (cur: number, dir: number) => {
      const bb = boundsRef.current;
      const order = [bb.min, bb.mid, bb.max];
      const next = dir < 0 ? [...order].reverse().find(x => x < cur - 2) ?? bb.min : order.find(x => x > cur + 2) ?? bb.max;
      changeRef.current(next);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      const skip = !!t.closest?.("[data-handle]") || (t instanceof SVGElement && getComputedStyle(t).touchAction === "none");
      g = { y: e.touches[0].clientY, h: hRef.current, taken: false, skip, dir: 0 };
    };
    const onMove = (e: TouchEvent) => {
      if (!g || g.skip) return;
      const y = e.touches[0].clientY, bb = boundsRef.current;
      const dy = g.y - y; // > 0 : le doigt monte
      if (!g.taken) {
        const atTop = el.scrollTop <= 0, cur = hRef.current;
        const down = dy < -6 && atTop && cur > bb.min + 1;
        const up = dy > 6 && cur < bb.max - 1;
        if (!down && !up) { if (Math.abs(dy) > 6) g.y = y; return; }
        g = { ...g, y, h: cur, taken: true };
        setDragging(true);
      }
      e.preventDefault();
      const next = Math.max(bb.min, Math.min(bb.max, g.h + (g.y - y)));
      // Sens du dernier mouvement : c'est lui qui choisit le cran au lâcher.
      g.dir = next > hRef.current ? 1 : next < hRef.current ? -1 : g.dir;
      changeRef.current(next);
    };
    const onEnd = () => {
      if (g?.taken) { setDragging(false); snap(hRef.current, g.dir); }
      g = null;
    };
    let wheelTimer = 0, wheelDir = 0;
    const onWheel = (e: WheelEvent) => {
      const bb = boundsRef.current, cur = hRef.current;
      const down = e.deltaY < 0 && el.scrollTop <= 0 && cur > bb.min + 1;
      const up = e.deltaY > 0 && cur < bb.max - 1;
      if (!down && !up) return;
      e.preventDefault();
      setDragging(true);
      wheelDir = down ? -1 : 1;
      changeRef.current(Math.max(bb.min, Math.min(bb.max, cur + e.deltaY)));
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => { setDragging(false); snap(hRef.current, wheelDir); }, 140);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.clearTimeout(wheelTimer);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const grab = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, height: h, zIndex: overNav ? 2147483050 : 40,
      background: "#f1f0ee", color: "#171b1f", borderRadius: "24px 24px 0 0",
      boxShadow: "0 -18px 44px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", overflow: "hidden",
      transition: dragging ? "none" : "height .32s cubic-bezier(.22,1,.36,1)",
    }}>
      <div role="slider" aria-label="Hauteur de la feuille" aria-valuemin={b.min} aria-valuemax={b.max} aria-valuenow={Math.round(h)} tabIndex={0}
        {...grab}
        style={{ flexShrink: 0, height: 28, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", cursor: "grab" }}>
        <span style={{ width: 42, height: 5, borderRadius: 999, background: "rgba(0,0,0,.18)" }} />
      </div>
      <div ref={headRef} {...grab} style={{ flexShrink: 0, touchAction: "none", cursor: "grab" }}>{header}</div>
      <div ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: atMax ? "auto" : "hidden", padding: `0 14px ${navClear}px`, overscrollBehavior: "contain" }}>
        <div ref={bodyRef}>{children}</div>
      </div>
    </div>
  );
}
