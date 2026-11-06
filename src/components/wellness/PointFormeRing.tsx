"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTick } from "@/lib/native";
import { gaugeLock, gaugeTick } from "@/lib/gaugeSound";
import { mixLab } from "@/lib/ringColors";
export { mixLab };

/* Point forme, version B (2026-11-06, POC https://claude.ai/artifact/736H2ey2Cr6YHaRcnpeSjZ, section 0 ter) :
   un seul anneau sur fond sombre, deux pistes. La piste épaisse est la réponse (même arc de 240°, mêmes
   crans et même curseur que l'anneau de décision) ; la piste fine, à l'extérieur, est le score récup qui
   se construit en direct. L'essaim autour se remplit et s'anime quand la récup monte (densité, vivacité,
   éclat), sans couleur de température. À la fin, la piste de réponse s'efface et la piste du score
   devient l'anneau récup. Ordre de prod gardé : bas à gauche, haut à droite, stress compris. */

const MIN = 1, MAX = 10, A0 = -120, A1 = 120;
const SIZE = 300, R = 108, SW = 17;
const RO = R + SW * 0.95, CX = SIZE / 2, CY = Math.round(RO + SW / 2 + 3), H = Math.round(CY + RO * 0.5 + SW / 2 + 3);
const TR = R + SW * 1.25, TW = 4;
const TAU = 2 * Math.PI, ARC_FROM = ((A0 - 90) * Math.PI) / 180, ARC_TO = ((A1 - 90) * Math.PI) / 180;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
function arc(r: number, from: number, to: number) {
  return `M ${pt(polar(r, from))} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(polar(r, to))}`;
}

/* Récup en bleu (point forme), charge en orange (fin de séance), comme les onglets. */
export type RingPalette = "recup" | "charge";
const PAL = {
  recup: { c0: "#2a3c44", c1: "#8cc3d4", score: (f: number) => mixLab("#d2e6ea", "#2f6d8f", f), tint: "235,243,255", glow: "rgba(170,205,255,.85)" },
  charge: { c0: "#3a2418", c1: "#ff7a33", score: (f: number) => mixLab("#f7d9c6", "#d44000", f), tint: "250,175,130", glow: "rgba(255,160,110,.85)" },
};

/* `final` 0..1 : la piste de réponse s'efface, la piste du score s'épaissit et vient sur l'arc. */
function ringSvg(f: number | null, score: number | null, final: number, dim: boolean, palette: RingPalette = "recup", ticks = 10, norm?: number, normLabel = "TA NORME") {
  const P = PAL[palette], ANS = P, recupCol = P.score;
  const op = (dim ? 0.3 : 1) * (1 - final);
  let s = `<g opacity="${op.toFixed(2)}"><path d="${arc(R, A0, A1)}" fill="none" stroke="#1d2226" stroke-width="${SW}" stroke-linecap="round"/>`;
  for (let t = 0; t < ticks; t++) {
    const u = t / (ticks - 1), a = A0 + (A1 - A0) * u, [ax, ay] = polar(R - SW * 0.5 - 5, a), [bx, by] = polar(R - SW * 0.5 - 10, a);
    s += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${f != null && u <= f + 0.001 ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.18)"}" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (f != null) {
    const end = A0 + (A1 - A0) * f;
    if (f > 0.003) for (let i = 0; i < 28; i++) s += `<path d="${arc(R, A0 + ((end - A0) * i) / 28, A0 + ((end - A0) * (i + 1.02)) / 28)}" fill="none" stroke="${mixLab(ANS.c0, ANS.c1, ((i + 0.5) / 28) * f)}" stroke-width="${SW}"/>`;
    const [sx, sy] = polar(R, A0), [mx, my] = polar(R, end), k = SW / 16;
    s += `<circle cx="${sx}" cy="${sy}" r="${SW / 2}" fill="${ANS.c0}"/><g transform="translate(${mx.toFixed(2)} ${my.toFixed(2)}) scale(${k.toFixed(2)})"><circle r="12.5" fill="rgba(255,255,255,.14)"/><circle r="9.5" fill="#18181b" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/>${[-3, 0, 3].map(d => `<line x1="-3.5" x2="3.5" y1="${d}" y2="${d}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join("")}</g>`;
  }
  const tR = TR + (R - TR) * final, tW = TW + (SW - TW) * final;
  s += `</g><path d="${arc(tR, A0, A1)}" fill="none" stroke="rgba(255,255,255,${(0.09 + 0.05 * final).toFixed(2)})" stroke-width="${tW.toFixed(1)}" stroke-linecap="round"/>`;
  if (score != null && score > 0) {
    const e = A0 + ((A1 - A0) * Math.max(0, Math.min(100, score))) / 100;
    for (let i = 0; i < 28; i++) s += `<path d="${arc(tR, A0 + ((e - A0) * i) / 28, A0 + ((e - A0) * (i + 1.03)) / 28)}" fill="none" stroke="${recupCol(0.25 + (((i + 0.5) / 28) * (e - A0)) / (A1 - A0) * 0.75)}" stroke-width="${tW.toFixed(1)}"/>`;
    const [sx, sy] = polar(tR, A0), [ex, ey] = polar(tR, e);
    s += `<circle cx="${sx}" cy="${sy}" r="${(tW / 2).toFixed(1)}" fill="${recupCol(0.25)}"/><circle cx="${ex}" cy="${ey}" r="${(tW / 2 + 1.6 * (1 - final)).toFixed(1)}" fill="${recupCol(0.25 + 0.75 * (e - A0) / (A1 - A0))}" stroke="#070a0d" stroke-width="${(1.5 * (1 - final)).toFixed(1)}"/>`;
  }
  /* Trait « TA NORME » sur l'arc (récup), comme le POC : la norme se lit sans couleur. */
  if (norm != null) {
    const a = A0 + ((A1 - A0) * norm) / 100, [ax, ay] = polar(RO + 3, a), [bx, by] = polar(RO + 10, a), [lx, ly] = polar(RO + 21, a + 4);
    s += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="rgba(255,255,255,.65)" stroke-width="2" stroke-linecap="round"/><text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" font-family="ui-monospace,monospace" font-size="8.5" font-weight="700" letter-spacing=".5" fill="rgba(255,255,255,.55)">${normLabel}</text>`;
  }
  return `<svg viewBox="0 0 ${SIZE} ${H}" aria-hidden="true" style="display:block;width:100%;height:auto;overflow:visible">${s}</svg>`;
}

  /* Essaim : le score règle la densité, la vivacité et l'éclat ; il respire à 6 cycles par minute. */
type Live = { score: number | null; kick: number; palette?: RingPalette };
function useSwarm(cvRef: React.RefObject<HTMLCanvasElement>, live: React.MutableRefObject<Live>) {
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const N = 72, Rorb = R + SW * 1.15;
    const P = Array.from({ length: N }, (_, i) => { const phi = ((i * 0.6180339) % 1) * 2 * Math.PI; return { phi, ang: phi + (Math.random() - 0.5), r: Rorb + 60 + Math.random() * 80, sd: Math.random(), al: 0 }; });
    let s = 0, T = 0, last = performance.now(), raf = 0, visible = true;
    /* Performance (06/11) : rien n'est dessiné hors écran ni onglet caché. */
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io?.observe(cv);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) { raf = requestAnimationFrame(frame); return; }
      const t = reduce ? 0 : now / 1000, L = live.current, dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w) {
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
        const g = cv.getContext("2d");
        if (g) {
          const k = w / (SIZE * 1.24), br = Math.sin((t * 2 * Math.PI) / 10);
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
          g.setTransform(dpr * k, 0, 0, dpr * k, dpr * k * SIZE * 0.12, dpr * k * H * 0.12);
          s += (Math.max(0, Math.min(1, (L.score ?? 0) / 100)) - s) * Math.min(1, dt * 2);
          const vis = L.score == null ? 0 : Math.round(N * (0.18 + 0.82 * s));
          T += dt * (0.02 + 0.16 * s); L.kick *= Math.exp(-dt * 3.2);
          /* Essaim coupé comme la jauge (06/11, Gildas) : seulement sur l'arc de 240°. */
          if (s > 0.05) { g.beginPath(); g.arc(CX, CY, Rorb + br * 2 * s, ARC_FROM, ARC_TO); g.strokeStyle = `rgba(255,255,255,${((0.04 + 0.08 * s) * (0.7 + (0.3 * (br + 1)) / 2)).toFixed(3)})`; g.lineWidth = 1; g.stroke(); }
          P.forEach((q, i) => {
            q.al += ((i < vis ? 1 : 0) - q.al) * Math.min(1, dt * 2.5); if (q.al < 0.02) return;
            const home = q.phi + T, dA = Math.atan2(Math.sin(home - q.ang), Math.cos(home - q.ang)); q.ang += dA * Math.min(1, dt * 1.5);
            const tr = Rorb + s * 5 * Math.sin(t * (1 + 2 * q.sd) + 10 * q.sd) + br * 2 * s + (1 - s) * 6 * q.sd + L.kick * 18 * (0.4 + q.sd);
            q.r += (tr - q.r) * Math.min(1, dt * 2.5);
            const u = (((q.ang % TAU) + TAU) % TAU) / TAU, da = ARC_FROM + u * (ARC_TO - ARC_FROM), edge = Math.min(1, u / 0.06, (1 - u) / 0.06);
            const sag = (1 - s) * (6 + 16 * q.sd), x = CX + q.r * Math.cos(da), y = CY + q.r * Math.sin(da) + sag;
            if (edge < 0.02) return;
            const pal = PAL[L.palette ?? "recup"], rad = 1.1 + 0.9 * s + 0.6 * q.sd * s;
            /* Éclat quand le score est haut : disque doux dessous au lieu de shadowBlur (coûteux sur mobile). */
            if (s > 0.7) { g.beginPath(); g.arc(x, y, rad * 2.6, 0, 2 * Math.PI); g.fillStyle = pal.glow.replace(/[\d.]+\)$/, `${(0.22 * (s - 0.7) / 0.3).toFixed(3)})`); g.fill(); }
            g.beginPath(); g.arc(x, y, rad, 0, 2 * Math.PI);
            g.fillStyle = `rgba(${pal.tint},${((0.22 + 0.6 * s) * q.al * edge * (0.8 + (0.2 * s * (br + 1)) / 2)).toFixed(2)})`; g.fill();
          });
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/* Même taille partout (2026-11-06, Gildas) : anneau de décision, point forme, fin de séance, mini bilans,
   onboarding. Toute la largeur jusqu'à 340 px, et pas plus de 38 % de la hauteur d'écran (sur l'Accueil,
   conseil et bouton doivent rester visibles au-dessus de la feuille de séance). */
export function ringWidth() {
  if (typeof window === "undefined") return 320;
  return Math.max(220, Math.min(340, window.innerWidth - 40, Math.round(window.innerHeight * 0.38)));
}

type Props = {
  /* Réponse (1..10 par défaut, ou min..max) ; null = pas encore répondu. */
  value: number | null;
  min?: number;
  max?: number;
  /* Crans dessinés sur l'arc. */
  ticks?: number;
  /* Mot au centre pour une valeur (par défaut labels[v]). */
  wordOf?: (v: number) => string;
  /* Textes des deux bouts (par défaut labels[min] et labels[max]). */
  ends?: [string, string];
  /* Un clic sonore tous les `tickEvery` (durée : toutes les 5 min). */
  tickEvery?: number;
  palette?: RingPalette;
  /* Libellés par note ; absent = anneau au repos (question sans échelle, ex. comportements). */
  labels?: Record<number, string>;
  kicker: string;
  /* Texte au centre quand rien n'est choisi (ou sans échelle). */
  placeholder: string;
  /* Score récup 0..100 qui se construit (piste fine) ; null avant la première réponse. */
  score: number | null;
  /* Hauteur du son par note (1 = moins bien, 10 = mieux) : stress inversé. */
  better?: (n: number) => number;
  onChange?: (n: number) => void;
  onRelease?: (n: number) => void;
  /* Fin du point forme : l'anneau devient l'anneau récup, score au centre. */
  final?: boolean;
  /* Incrémenté à chaque réponse validée : petite impulsion de l'essaim. */
  pulse?: number;
  width?: number;
};

export default function PointFormeRing({ value, min = MIN, max = MAX, ticks = 10, wordOf, ends, tickEvery = 1, palette = "recup", labels, kicker, placeholder, score, better = n => n, onChange, onRelease, final = false, pulse = 0, width = ringWidth() }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [fin, setFin] = useState(0);
  const cur = useRef(value);
  cur.current = value;
  const live = useRef<Live>({ score, kick: 0, palette });

  // Impulsion de l'essaim quand une réponse est validée.
  useEffect(() => { live.current.kick = pulse ? 1 : 0; }, [pulse]);
  useEffect(() => { live.current.score = score; }, [score]);

  useEffect(() => {
    if (!final) { setFin(0); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setFin(1); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const p = Math.min(1, (now - t0) / 700); setFin(1 - Math.pow(1 - p, 3)); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [final]);

  useSwarm(cvRef, live);

  const interactive = (!!labels || !!wordOf) && !final && !!onChange;
  const shown = drag ?? (value != null ? value : null);
  const f = shown == null ? null : (shown - min) / (max - min);
  const snapped = shown == null ? null : Math.round(shown);

  function valueAt(e: React.PointerEvent) {
    const host = hostRef.current; if (!host) return null;
    const rc = host.getBoundingClientRect(), sc = SIZE / rc.width, x = (e.clientX - rc.left) * sc - CX, y = (e.clientY - rc.top) * sc - CY;
    const a = Math.max(A0, Math.min(A1, (Math.atan2(x, -y) * 180) / Math.PI));
    return min + ((a - A0) / (A1 - A0)) * (max - min);
  }
  function set(v: number) {
    setDrag(v);
    const n = Math.round(v);
    if (n !== cur.current) {
      const prev = cur.current;
      if (prev == null || Math.floor(n / tickEvery) !== Math.floor(prev / tickEvery)) { hapticTick(prev ?? 0, n); gaugeTick(better(n)); }
      cur.current = n;
      onChange?.(n);
    }
  }
  function release() {
    if (drag == null) return;
    setDrag(null);
    if (cur.current != null) { gaugeLock(); onRelease?.(cur.current); }
  }
  function onKey(e: React.KeyboardEvent) {
    if (!interactive) return;
    const base = value ?? 5;
    const n = e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(max, base + tickEvery) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(min, base - tickEvery) : null;
    if (n != null) { e.preventDefault(); if (n !== value) { gaugeTick(better(n)); onChange?.(n); } return; }
    if ((e.key === "Enter" || e.key === " ") && value != null) { e.preventDefault(); gaugeLock(); onRelease?.(value); }
  }

  const centerY = (CY / H) * 100;
  const word = final ? null : snapped == null ? null : wordOf ? wordOf(snapped) : labels ? labels[snapped] : null;
  const endTexts: [string, string] | null = ends ?? (labels ? [labels[min], labels[max]] : null);

  return (
    <div style={{ width, maxWidth: "100%", margin: "0 auto" }}>
      <div
        ref={hostRef}
        role={interactive ? "slider" : undefined}
        aria-label={interactive ? kicker : undefined}
        aria-valuemin={interactive ? min : undefined}
        aria-valuemax={interactive ? max : undefined}
        aria-valuenow={interactive && value != null ? value : undefined}
        aria-valuetext={interactive && value != null ? (wordOf ? wordOf(value) : labels?.[value]) : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={onKey}
        onPointerDown={e => { if (!interactive) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } const v = valueAt(e); if (v != null) set(v); }}
        onPointerMove={e => { if (!interactive || drag == null) return; const v = valueAt(e); if (v != null) set(v); }}
        onPointerUp={release}
        onPointerCancel={release}
        style={{ position: "relative", touchAction: interactive ? "none" : undefined, cursor: interactive ? (drag != null ? "grabbing" : "grab") : undefined, userSelect: "none", WebkitUserSelect: "none", outline: "none" }}
      >
        <canvas ref={cvRef} aria-hidden style={{ position: "absolute", left: "-12%", top: "-12%", width: "124%", height: "124%", pointerEvents: "none", zIndex: 2 }} />
        <div style={{ position: "relative", zIndex: 1 }} dangerouslySetInnerHTML={{ __html: ringSvg(f, score, fin, !labels && !wordOf && !final, palette, ticks) }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: `${centerY}%`, transform: "translateY(-50%)", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", pointerEvents: "none" }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 4, maxWidth: "60%" }}>{kicker}</span>
          {final ? (
            <strong style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{placeholder}</strong>
          ) : word ? (
            <strong style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.05, maxWidth: "64%", textWrap: "balance" } as React.CSSProperties}>{word}</strong>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.55)", maxWidth: "60%" }}>{placeholder}</span>
          )}
        </div>
      </div>
      {endTexts && !final && (
        <div style={{ display: "flex", justifyContent: "space-between", margin: "2px 10px 0", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
          <span>{endTexts[0]}</span><span>{endTexts[1]}</span>
        </div>
      )}
    </div>
  );
}

/* Anneau de la 1re slide d'un mini bilan (2026-11-06) : la fin du formulaire à l'anneau. Même arc, même
   piste et même essaim ; la valeur se pose à l'arrivée, son chiffre au centre. `fill` 0..100 = part de l'arc. */
export function ScoreRing({ fill, big, unit, cap, cap2, palette = "recup", width = ringWidth(), color, zone, norm, normLabel }: {
  /* « SA NORME » côté coach (06/11). */
  normLabel?: string; fill: number; big: number | string; unit?: string; cap?: string; cap2?: string; palette?: RingPalette; width?: number;
  /* Couleur du chiffre et du mot de zone (celle de la bande, comme l'ancienne jauge). */
  color?: string;
  /* Mot de la zone (« Équilibré »), en capitales mono comme les cartes Forme / Fitness / Fatigue. */
  zone?: string;
  /* Position 0..100 du trait « ta norme ». */
  norm?: number }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [p, setP] = useState(0);
  const live = useRef<Live>({ score: 0, kick: 0, palette });
  useSwarm(cvRef, live);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setP(1); live.current.score = fill; return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const q = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - q, 3); setP(e); live.current.score = fill * e; if (q < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fill]);
  return (
    <div style={{ width, maxWidth: "100%", margin: "0 auto 10px", position: "relative" }}>
      <canvas ref={cvRef} aria-hidden style={{ position: "absolute", left: "-12%", top: "-12%", width: "124%", height: "124%", pointerEvents: "none", zIndex: 2 }} />
      <div style={{ position: "relative", zIndex: 1 }} dangerouslySetInnerHTML={{ __html: ringSvg(null, fill * p, 1, false, palette, 10, norm, normLabel) }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: `${(CY / H) * 100}%`, transform: "translateY(-50%)", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", pointerEvents: "none" }}>
        {typeof big === "number" ? (
          <span style={{ fontFamily: "var(--font-display)", fontSize: 54, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: color ?? "#fff" }}>
            {Math.round(big * p)}{unit && <span style={{ fontSize: 18, opacity: 0.6, marginLeft: 2 }}>{unit}</span>}
          </span>
        ) : (
          <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: "62%", color: color ?? "#fff" }}>{big}</span>
        )}
        {zone && <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: color ?? "#fff", marginTop: 8 }}>{zone}</span>}
        {cap && <span style={{ fontSize: 12.5, lineHeight: 1.35, color: "rgba(255,255,255,.65)", marginTop: 6, maxWidth: "58%" }}>{cap}</span>}
        {cap2 && <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: "#ffc8a8", marginTop: 4, maxWidth: "58%" }}>{cap2}</span>}
      </div>
    </div>
  );
}
export function RecupRing({ score, cap, width, norm }: { score: number; cap?: string; width?: number; norm?: number }) {
  return <ScoreRing fill={score} big={score} unit="/100" cap={cap} width={width} norm={norm} />;
}
