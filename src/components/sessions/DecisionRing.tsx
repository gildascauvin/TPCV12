"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { braiseColor, chargeColor } from "@/lib/ringColors";
import { ringWidth } from "@/components/wellness/PointFormeRing";
import { haptic, hapticTick } from "@/lib/native";
import { type AutoregDir, zoneRange, pctToPoints } from "@/lib/autoregulation";
import { BREATH_VARS, type RingBreath } from "@/lib/ringAmbience";

/* Jauge de décision en ANNEAU (2026-09-30, variante R2 du POC "Onglet Charge, version retenue" :
   https://claude.ai/artifact/McRwVAu86X9vArN2JRHBGF). Même contrat que DecisionGauge.tsx (la barre
   horizontale, qui reste celle de Coach Control et du Planning) — seule la forme change, montée sur
   /today via `shape="ring"` d'AutoregButtons.

   - Même géométrie que les jauges de charge/récup (AggregateGauge.tsx) : arc ouvert de 240°,
     A0 −120 / A1 +120 — une seule forme de jauge dans l'app, de la miniature d'onglet à ce ring.
   - Axe = RPE 1 à 10, remplissage aux paliers de la barre de difficulté de prod, rogné au curseur.
   - Plage conseillée = cadre pointillé FERMÉ qui entoure l'épaisseur de l'anneau, bouts
     entièrement arrondis : la transposition du rectangle pointillé de la barre (R2, préférée à R1
     où la plage était un arc ouvert posé à l'extérieur).
   - Centre : flèche + verbe de la reco, aux places du chiffre et du libellé de zone des autres
     jauges. Dessous : où est le curseur par rapport à la zone, sans wording inventé. */

const MIN = 1, MAX = 10;
const A0 = -120, A1 = 120;
/* Mêmes dégradés que DiffGauge.tsx / la jauge horizontale (2026-09-30, Gildas : "même gradient que
   les jauges RPE") — un dégradé choisi selon la position du curseur, déroulé le long de l'arc. */
const DIFF_STOPS = {
  hard: ["#ffb5a7", "#d44000"],
  moderate: ["#ffe0a0", "#f28a00"],
  easy: ["#bfeec8", "#2f9e44"],
} as const;
function mixHex(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}
const VERB = { low: "Alléger", high: "Surcharger", flat: "Maintenir" } as const;
const ARROW = { low: "⬇", high: "⬆", flat: "→" } as const;

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const clampDiff = (v: number) => Math.max(MIN, Math.min(MAX, v));
const ang = (d: number) => A0 + ((clampDiff(d) - MIN) / (MAX - MIN)) * (A1 - A0);
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  return `M ${pt(polar(cx, cy, r, from))} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(polar(cx, cy, r, to))}`;
}
/* Contour fermé d'une portion d'anneau à bouts arrondis (demi-cercles de rayon (rOut−rIn)/2).
   polar() tourne dans le sens horaire à l'écran = sweep 1 en SVG, d'où sweep 1 sur l'arc extérieur
   et les deux bouchons, sweep 0 sur l'arc intérieur qui revient. */
function sectorPath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number) {
  const rc = ((rOut - rIn) / 2).toFixed(2);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(polar(cx, cy, rOut, a0))} A ${rOut} ${rOut} 0 ${big} 1 ${pt(polar(cx, cy, rOut, a1))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rIn, a1))}`
    + ` A ${rIn} ${rIn} 0 ${big} 0 ${pt(polar(cx, cy, rIn, a0))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rOut, a0))} Z`;
}

/* État d'une jauge de décision (valeur du curseur + zone conseillée), calculé comme la vraie jauge
   (AutoregButtons.tsx) — sert à la miniature de l'onglet Aujourd'hui (HomeTabs.tsx), pour qu'elle
   montre exactement la même chose que la grande (2026-09-30, Gildas : "fidèle"). */
/* `planned` : séance encore à faire (la zone est alors une décision, masquée en gratuit). */
export type DecisionRingState = { value: number; zoneLow: number; zoneHigh: number; planned?: boolean; done?: boolean; rest?: boolean };
export function decisionRingState(
  sessions: { done: boolean; rpe?: number | null; target_difficulty?: number | null }[],
  suggestion: { dir: AutoregDir; reco: number } | null | undefined,
  previewPct?: number | null,
  doneZone?: { low: number; high: number } | null,
): DecisionRingState {
  const byDiff = [...sessions].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0));
  const undone = byDiff.find(s => !s.done);
  if (undone) {
    const planned = undone.target_difficulty ?? 6;
    const zone = suggestion
      ? zoneRange(Math.round(planned + pctToPoints(suggestion.reco)), suggestion.dir)
      : zoneRange(Math.round(planned), "low");
    const value = Math.max(MIN, Math.min(MAX, planned + (previewPct ? pctToPoints(previewPct) : 0)));
    return { value, ...zone, planned: true };
  }
  const done = byDiff[0];
  if (!done) return { value: 1, zoneLow: 1, zoneHigh: 2, rest: true };   // repos
  const target = Math.round(done.target_difficulty ?? done.rpe ?? 5);
  return { value: done.rpe ?? target, zoneLow: doneZone ? doneZone.low : target, zoneHigh: doneZone ? doneZone.high : target, done: true };
}

/* Miniature de la jauge de décision (onglet Aujourd'hui) : même dégradé, même zone pointillée, même
   curseur que la grande, sans texte — géométrie des miniatures Charge/Récup (AggregateGauge bare). */
/* `showValue` (2026-10-05, lignes du Coach Control) : le RPE au centre de l'arc. */
/* `thin` (2026-10-05) : même épaisseur d'arc que AggregateGauge (non bare), pour s'aligner sur la
   jauge de récupération posée à côté dans les lignes du Coach Control. */
/* Centre de l'arc d'une mini-jauge (pour aligner un point dessus, radar du Coach Control). */
export function decisionRingMiniCenterY(size = 40, thin = false) {
  const r = size * 0.36, sw = thin ? Math.max(4, Math.round(size * 0.075)) : Math.max(3, Math.round(size * 0.17));
  return r + sw * (thin ? 1.05 : 0.75) + 2;
}
/* `disc` (2026-10-05) : disque de fond centré sur l'arc lui-même (pas sur la boîte, l'arc étant
   ouvert en bas), pour poser la jauge sur un fond chargé sans qu'il dépasse. */
export function DecisionRingMini({ state, size = 40, hideZone = false, showValue = false, thin = false, centerLabel, disc }: { state: DecisionRingState; size?: number; hideZone?: boolean; showValue?: boolean; thin?: boolean; centerLabel?: string; disc?: string }) {
  const { value, zoneLow, zoneHigh } = state;
  const r = size * 0.36, sw = thin ? Math.max(4, Math.round(size * 0.075)) : Math.max(3, Math.round(size * 0.17));
  // Fin : cadre de zone un peu plus large que le trait, sinon le pointillé se confond avec l'arc.
  const rOut = r + sw * (thin ? 1.05 : 0.75), rIn = r - sw * (thin ? 1.05 : 0.75);
  const cx = size / 2, cy = rOut + 2;
  const h = disc ? Math.ceil(cy + rOut + 2) : Math.round(cy + rOut * 0.5 + 2);
  const rounded = Math.round(value);
  const inZone = !hideZone && rounded >= zoneLow && rounded <= zoneHigh;
  /* 06/11 : mêmes couleurs que le grand anneau. Avec zone = Braise (écart à la zone) ; sans zone = orange de charge. */
  const colAt = (u: number) => (hideZone ? chargeColor(0.18 + (0.82 * (u - MIN)) / (MAX - MIN)) : braiseColor(u, zoneLow, zoneHigh));
  const c0 = colAt(MIN), c1 = colAt(value);
  const end = ang(value);
  const SEGS = 16;
  const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, end);
  const svg = (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true" style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      {disc && <circle cx={cx} cy={cy} r={rOut + 2} fill={disc} />}
      <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={sw} strokeLinecap="round" />
      {value > MIN && Array.from({ length: SEGS }, (_, i) => (
        <path key={i} d={arcPath(cx, cy, r, A0 + ((end - A0) * i) / SEGS, A0 + ((end - A0) * (i + 1.02)) / SEGS)}
          fill="none" stroke={colAt(MIN + ((value - MIN) * (i + 0.5)) / SEGS)} strokeWidth={sw} />
      ))}
      <circle cx={sx} cy={sy} r={sw / 2} fill={c0} />
      {value > MIN && <circle cx={ex} cy={ey} r={sw / 2} fill={c1} />}
      {!hideZone && <path d={sectorPath(cx, cy, rIn, rOut, ang(Math.max(MIN, zoneLow - 0.35)), ang(Math.min(MAX, zoneHigh + 0.35)))}
        fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={1.1} strokeDasharray="2 1.5" />}
      <circle cx={ex} cy={ey} r={thin ? Math.max(4.5, sw * 0.62) : sw * 0.62} fill={inZone ? "#2a8045" : "#18181b"} stroke="#fff" strokeWidth={1.1} />
    </svg>
  );
  if (!showValue && !centerLabel) return svg;
  return (
    <div style={{ position: "relative", width: size, height: h, flexShrink: 0 }}>
      {svg}
      <span style={{ position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)", textAlign: "center", fontFamily: "var(--font-mono), monospace", fontSize: Math.round(size * (centerLabel ? 0.22 : 0.24)), fontWeight: 700, lineHeight: 1, color: "#fff" }}>{centerLabel ?? rounded}</span>
    </div>
  );
}

/* Jour de repos (2026-09-30, Gildas : "même en jour de repos je veux afficher cette ring, comme
   étant dans la zone puisque c'est repos") — lecture seule, curseur au plancher dans sa zone. */
/* Position verticale du centre de l'arc dans le SVG (même calcul que DecisionRing ci-dessous).
   Sert à aligner la jauge des onglets Charge/Récup sur cet anneau (IndexCards). */
export function decisionRingCenterY(size = 188) {
  const r = Math.round(size * 0.36), sw = Math.round(size * 0.085);
  return Math.round(r + sw * 0.95 + sw / 2 + 3);
}

/* Anneau en grand (2026-10-28, POC https://claude.ai/artifact/5wmJBpxrMaMthAvi1qVeUm) : toute la
   largeur disponible (210 à 300 px, et ≤ 34 % de la hauteur d'écran), trait affiné, le titre de la décision AU CENTRE à la place de
   la flèche + verbe (déjà dits par le CTA, le titre ou la séance), halo de la couleur de sévérité.
   La carte décision disparaît : conseil, CTA et Phase sont posés sous l'anneau par l'appelant. */
/* introFrom (2026-10-29) : l'animation d'arrivée part de cette valeur au lieu du bas de l'échelle —
   l'anneau remonté après une décision (ou son annulation) glisse d'où il était vers sa destination. */
/* Ambiance (2026-11-04, POC « L'anneau, niveau 4 ») :
   - `breath` : l'anneau respire (taille ±1,5 % et halo), rythme selon la reco ; arrêté pendant le glisser ;
   - `ambient` : halo renforcé (celui d'avant, à 22 %, ne se voyait pas assez pour porter le souffle) ;
   - `zoneLabel` : étiquette posée sur la zone (« Conseillé » sur une séance faite) ;
   - `kicker` : petit texte au-dessus du titre (repère, ex. « Charge de la semaine ») ;
   - `axis` : la valeur est une position 0..1 sur un autre axe (score de charge un jour de repos), zone et
     couleurs fournies ; même grammaire curseur + zone que l'échelle de difficulté. */
type BigRingProps = { fluid?: boolean; centerTitle?: string; titleLocked?: boolean; glow?: string; introFrom?: number;
  breath?: RingBreath; ambient?: boolean; zoneLabel?: string; kicker?: string;
  axis?: { zone: [number, number]; colors: [string, string] };
  /* Lot 4 (2026-11-06) : la légende de l'essaim ouvre le détail de la récup et de la charge (à la place des onglets). */
  legend?: RingLegend };
export type RingLegend = { recup: { value: number | null; color?: string; onClick: () => void }; charge: { value: number | null; color?: string; onClick: () => void } };

/* Jour de repos (08/11, Gildas) : même sens que les autres jours, la difficulté de la journée (« Repos », au
   départ de l'arc) face à ce que la forme permet. `restZoneHigh` absent = pas de zone (forme inconnue). */
export function restZoneFromRecup(recup: number | null | undefined): number | null {
  return recup == null ? null : recup >= 58 ? 3 : 1;
}
export function restTitle(zoneHigh: number | null): string | undefined {
  return zoneHigh == null ? undefined : zoneHigh > 1 ? "Tu pourrais bouger un peu" : "Repos bien placé";
}
export function RestDecisionRing({ size, light, hideHint, restZoneHigh = null, ...big }: { size?: number; light?: boolean; hideHint?: boolean; restZoneHigh?: number | null } & BigRingProps) {
  return (
    <DecisionRing
      zoneLow={1} zoneHigh={restZoneHigh ?? 2} value={1} readOnly hideZone={restZoneHigh == null} onChange={() => {}}
      size={size} light={light} hideHint={hideHint} {...big}
      centerLabel={{ arrow: "→", verb: "Repos" }}
      hint="Jour de repos"
    />
  );
}

/* Séance déjà faite (2026-09-30, Gildas : "dans le passé, je veux voir la jauge qu'il y ait une
   séance de faite ou non") — lecture seule, curseur sur le RPE réellement ressenti, repère blanc sur
   le prévu, zone = la difficulté prévue. Sans RPE noté, le curseur reste sur le prévu. */
export function DoneDecisionRing({ rpe, planned, size, light, hideZone = false, zone, hideHint, ...big }: BigRingProps & { rpe: number | null; planned: number | null; size?: number; light?: boolean; hideZone?: boolean; hideHint?: boolean;
  /* Zone proposée ce jour-là (decisionCard.doneZone, 2026-10-04) : le RPE réel se lit par rapport à
     elle, plus seulement par rapport au plan. */
  zone?: { low: number; high: number } | null }) {
  const target = planned ?? rpe ?? 5;
  const value = rpe ?? target;
  const hint = rpe === null ? "Séance faite · RPE non noté"
    : planned === null ? `Séance faite · RPE ${rpe}`
    : Math.round(rpe) === Math.round(planned) ? `Séance faite · RPE ${rpe}, comme prévu`
    : `Séance faite · RPE ${rpe} pour ${planned} prévu`;
  return (
    <DecisionRing
      zoneLow={zone ? zone.low : Math.round(target)} zoneHigh={zone ? zone.high : Math.round(target)} value={value} readOnly hideZone={hideZone} onChange={() => {}}
      plannedMarker={planned}
      size={size} light={light} hideHint={hideHint} {...big}
      centerLabel={{ arrow: "✓", verb: "Faite" }}
      hint={hint}
    />
  );
}

const TAU = 2 * Math.PI, ARC_FROM = ((A0 - 90) * Math.PI) / 180, ARC_TO = ((A1 - 90) * Math.PI) / 180;
type SwarmLive = { v: number; lo: number; hi: number; drag: boolean; r: number; sw: number; cx: number; cy: number; size: number; h: number };
function useDecisionSwarm(cvRef: React.RefObject<HTMLCanvasElement> | null, live: React.MutableRefObject<SwarmLive>) {
  useEffect(() => {
    const cv = cvRef?.current; if (!cv) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const N = 40;
    const P = Array.from({ length: N }, (_, i) => ({ phi: (i / N) * 2 * Math.PI, ang: (i / N) * 2 * Math.PI, r: 0, sd: Math.random(), cl: Math.floor(Math.random() * 7), ty: i & 1 }));
    let sg = 0, boost = 1, T = 0, last = performance.now(), raf = 0, visible = true;
    const born = performance.now();
    /* Performance (06/11) : rien n'est dessiné hors écran (anneau sous la feuille, page défilée) ni onglet caché. */
    const io = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io?.observe(cv);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) { raf = requestAnimationFrame(frame); return; }
      const L = live.current, t = reduce ? 0 : now / 1000, dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, hh = cv.clientHeight, g = cv.getContext("2d");
      if (w && g) {
        if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
        const m = L.size * 0.12;
        g.setTransform(dpr, 0, 0, dpr, dpr * m, dpr * m); g.clearRect(-m, -m, w, hh);
        const lo = L.lo - 0.3, hi = L.hi + 0.3, dist = L.v < lo ? lo - L.v : L.v > hi ? L.v - hi : 0;
        const target = L.v > hi ? Math.min(1, dist / 3) : L.v < lo ? -Math.min(1, dist / 3) : 0;
        sg += (target - sg) * Math.min(1, dt * 2.2);
        const awake = L.drag || now - born < 1800;
        boost += ((awake ? 1 : 0) - boost) * Math.min(1, dt * 3);
        const s = sg * (0.3 + 0.7 * boost), hot = Math.max(0, s), cold = Math.max(0, -s), calm = 1 - hot - cold, agit = hot + cold;
        const br = Math.sin((t * 2 * Math.PI) / 10), Rorb = L.r + L.sw * 1.15, nT = Math.ceil(N / 2), scale = L.size / 300;
        T += dt * 0.12 * (1 - 0.9 * cold) * (1 + 1.5 * hot);
        /* Essaim coupé comme la jauge (06/11, Gildas) : il ne vit que sur l'arc de 240°, l'ouverture du bas reste vide. */
        if (calm > 0.05) { g.beginPath(); g.arc(L.cx, L.cy, Rorb + calm * br * 2 * scale, ARC_FROM, ARC_TO); g.strokeStyle = `rgba(255,255,255,${(calm * (0.1 + 0.06 * br) * 0.6).toFixed(3)})`; g.lineWidth = 1; g.stroke(); }
        P.forEach((q, i) => {
          if (!q.r) q.r = Rorb;
          q.ang += dt * hot * (q.sd - 0.5) * 5 + hot * 0.05 * Math.sin(t * (6 + 5 * q.sd) + 9 * q.sd);
          const clusterA = (q.cl / 7) * 2 * Math.PI + T + (q.sd - 0.5) * 0.18;
          const home = q.phi + T, toCl = Math.atan2(Math.sin(clusterA - home), Math.cos(clusterA - home)) * Math.min(1, cold * 1.3);
          let tg = home + toCl;
          const k = Math.floor(i / 2), segA = (q.ty ? 0 : Math.PI) + ((k + 0.5) / nT) * Math.PI + T * 0.3, dS = Math.atan2(Math.sin(segA - tg), Math.cos(segA - tg));
          tg += dS * Math.min(1, agit * 1.4);
          const tr = Rorb + (hot * 26 * Math.sin(t * (3 + 5 * q.sd) + 10 * q.sd) + cold * (2 + 6 * q.sd) + calm * br * 2) * scale;
          const dA = Math.atan2(Math.sin(tg - q.ang), Math.cos(tg - q.ang));
          q.ang += dA * Math.min(1, dt * (2.5 * (1 - hot) + 0.3));
          q.r += (tr - q.r) * Math.min(1, dt * (4 + hot * 6));
          /* Angle libre → position sur l'arc : le flux coule du début vers la fin et réapparaît au début, en fondu. */
          const u = (((q.ang % TAU) + TAU) % TAU) / TAU, da = ARC_FROM + u * (ARC_TO - ARC_FROM), edge = Math.min(1, u / 0.06, (1 - u) / 0.06);
          const x = L.cx + q.r * Math.cos(da), y = L.cy + q.r * Math.sin(da);
          const dom = q.ty ? hot - cold : cold - hot;
          const sz = (1.4 + hot * q.sd * 1.2 + cold * 1.1) * (1 + 0.7 * Math.max(0, dom) - 0.4 * Math.max(0, -dom)) * scale;
          const al = Math.min(1, (0.5 + 0.35 * q.sd * hot + 0.35 * cold + (0.25 * calm * (br + 1)) / 2) * 0.6 + 0.2) * edge;
          /* Lueur des points de charge quand ça chauffe : un disque doux dessous (shadowBlur coûte cher sur mobile). */
          if (hot > 0.3 && q.ty) { g.beginPath(); g.arc(x, y, sz * 2.6, 0, 2 * Math.PI); g.fillStyle = `rgba(255,120,40,${(0.18 * hot).toFixed(3)})`; g.fill(); }
          g.beginPath(); g.arc(x, y, sz, 0, 2 * Math.PI);
          g.fillStyle = q.ty ? `rgba(246,128,64,${al.toFixed(2)})` : `rgba(128,184,204,${al.toFixed(2)})`; g.fill();
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io?.disconnect(); };
  }, [cvRef, live]);
}

export default function DecisionRing({
  zoneLow, zoneHigh, recoDir, value, onChange, readOnly, plannedMarker, hint: hintOverride, size: sizeProp = 188, light, centerLabel, hideZone = false, hideHint = false, onHint,
  fluid = false, centerTitle, titleLocked = false, glow, introFrom, breath, ambient = false, zoneLabel, kicker, axis, locked = false, celebrate = false, neutralAt, legend,
}: BigRingProps & {
  /* Gratuit (zone masquée) : couleur et essaim lus par rapport à la séance prévue, jamais au conseil. */
  neutralAt?: number;
  /* Décision prise : la zone pointillée devient pleine (2026-11-06, lot 3). */
  locked?: boolean;
  /* Décision qu'on vient de prendre : onde depuis l'anneau et vibration « succès » à l'arrivée. */
  celebrate?: boolean;
  /* Texte sous l'anneau masqué (2026-10-12, Gildas) : il devient le titre de la carte décision
     (Premium, /today + Coach Control), remonté par `onHint`. Le gratuit le garde sous l'anneau. */
  hideHint?: boolean;
  onHint?: (hint: string) => void;
  /* Pas de zone conseillée (difficulté prévue seule, gratuit). */
  hideZone?: boolean;
  zoneLow: number;
  zoneHigh: number;
  /* Sens de la RECO, pas du curseur : c'est lui que porte le centre. Absent = Maintenir. */
  recoDir?: AutoregDir;
  value: number;
  onChange: (newDifficulty: number) => void;
  readOnly?: boolean;
  plannedMarker?: number | null;
  hint?: string;
  size?: number;
  /* Carte blanche (Coach Control, 2026-09-30) : texte du centre et pointillé en sombre, le track
     sombre reste — il se lit aussi bien sur fond clair. */
  light?: boolean;
  /* Centre imposé (2026-09-30, jour de repos) : remplace flèche + verbe de la reco. */
  centerLabel?: { arrow: string; verb: string };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fluidSize, setFluidSize] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    if (!fluid || !wrapRef.current) return;
    const el = wrapRef.current;
    /* Plafonné aussi par la hauteur d'écran (2026-10-28, Gildas) : sur mobile, la feuille de séance
       du bas recouvre ce qui suit l'anneau, il doit laisser voir conseil + CTA au-dessus d'elle. */
    const measure = () => setFluidSize(Math.min(ringWidth(), Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [fluid]);
  const size = fluid ? (fluidSize ?? 300) : sizeProp;
  /* « Optimal » le long de la zone sur tout grand anneau (06/11, Gildas : partout où l'anneau est grand). */
  const zoneText = size >= 160 ? (zoneLabel ?? (fluid ? "Optimal" : undefined)) : undefined;
  /* Titre du centre sur 2 lignes maximum (2026-10-28, Gildas) : la police descend jusqu'à tenir. */
  const titleRef = useRef<HTMLSpanElement>(null);
  const [titleShrink, setTitleShrink] = useState(0);
  /* Remplissage à l'arrivée (2026-10-27, qualité perçue) : l'arc et le curseur partent du bas de
     l'échelle et montent jusqu'à la valeur en 650 ms, une seule fois au montage. Les changements
     suivants (glisser, nouvelle reco) restent directs. */
  const [intro, setIntro] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setIntro(1); return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 650);
      setIntro(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const introRunning = intro < 1;
  const [sonar, setSonar] = useState(false);
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => { setSonar(true); haptic("success"); }, 620);
    return () => window.clearTimeout(t);
  }, [celebrate]);
  const introStart = introFrom ?? (axis ? 0 : MIN);
  const drawValue = introRunning ? introStart + (value - introStart) * (1 - Math.pow(1 - intro, 3)) : value;

  const r = Math.round(size * 0.36), sw = Math.round(size * (fluid ? 0.055 : 0.085));
  const rOut = r + sw * 0.95, rIn = r - sw * 0.95;
  const cx = size / 2, cy = Math.round(rOut + sw / 2 + 3);
  const h = Math.round(cy + rOut * 0.5 + sw / 2 + 3);
  // Le curseur suit l'épaisseur du trait, pas le diamètre (16 = trait de l'anneau de 188 px).
  const knob = fluid ? Math.max(1, sw / 16) : 1;

  const roundedValue = Math.round(value);
  const inZone = axis ? value >= axis.zone[0] && value <= axis.zone[1] : !hideZone && roundedValue >= zoneLow && roundedValue <= zoneHigh;
  const toAng = axis ? (v: number) => A0 + Math.max(0, Math.min(1, v)) * (A1 - A0) : ang;
  const floor = axis ? 0 : MIN;

  /* Angle du pointeur -> RPE entier. Dans l'ouverture du bas (|angle| > 120°), on colle à
     l'extrémité la plus proche plutôt que de sauter d'un bout à l'autre. */
  function diffFromPointer(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * size - cx;
    const y = ((e.clientY - rect.top) / rect.height) * h - cy;
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg > 180) deg -= 360;
    deg = Math.max(A0, Math.min(A1, deg));
    return Math.round(MIN + ((deg - A0) / (A1 - A0)) * (MAX - MIN));
  }
  // Vibration à chaque cran franchi, plus marquée en entrant dans la zone conseillée.
  function pick(d: number) {
    const enters = !hideZone && d >= zoneLow && d <= zoneHigh && !inZone;
    hapticTick(roundedValue, d, enters);
    onChange(d);
  }
  function handlePointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    // Seul l'anneau se saisit (2026-10-04) : un doigt posé au centre ou hors de l'arc fait défiler
    // la page normalement au lieu de bloquer le défilement et de déplacer le curseur.
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const dx = (e.clientX - rect.left) * (size / rect.width) - cx;
      const dy = (e.clientY - rect.top) * (h / rect.height) - cy;
      if (Math.abs(Math.hypot(dx, dy) - r) > sw * 1.6) return;
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    pick(diffFromPointer(e));
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (readOnly || !dragging) return;
    pick(diffFromPointer(e));
  }
  const endDrag = () => setDragging(false);

  // Même marge visuelle que la barre (±0,35) : le curseur est centré sur l'entier, une plage qui
  // s'arrêtait pile à l'entier le couperait en deux sur les bornes.
  const zoneA0 = axis ? toAng(axis.zone[0]) : ang(Math.max(MIN, zoneLow - 0.35));
  const zoneA1 = axis ? toAng(axis.zone[1]) : ang(Math.min(MAX, zoneHigh + 0.35));

  /* Le dégradé suit l'arc : découpé en petits segments dont la couleur est interpolée (un
     linearGradient SVG suivrait la corde, pas la courbe). */
  /* Anneau en grand avec zone (2026-11-06, lot 3) : palette Braise, la couleur dit l'écart à la zone
     (jade dedans, bleu pétrole en dessous, ocre puis rouille au-dessus) au lieu de la difficulté brute. */
  const refLo = hideZone ? (neutralAt ?? value) : zoneLow, refHi = hideZone ? (neutralAt ?? value) : zoneHigh;
  const braise = fluid && (!!axis || !hideZone || neutralAt != null);
  /* Axe 0..1 (charge de la semaine, jour de repos) ramené sur 1..10 pour la palette, comme l'essaim. */
  const toScale = (v: number) => (axis ? 1 + 9 * v : v);
  const bLo = axis ? toScale(axis.zone[0]) : refLo, bHi = axis ? toScale(axis.zone[1]) : refHi;
  const [c0, c1] = braise ? [braiseColor(MIN, bLo, bHi), braiseColor(toScale(drawValue), bLo, bHi)]
    : axis ? axis.colors
    : DIFF_STOPS[roundedValue >= 8 ? "hard" : roundedValue >= 5 ? "moderate" : "easy"];
  const fillEnd = toAng(drawValue);
  const SEGS = braise ? 64 : 28;
  const fills = drawValue > floor ? Array.from({ length: SEGS }, (_, i) => ({
    d: arcPath(cx, cy, r, A0 + ((fillEnd - A0) * i) / SEGS, A0 + ((fillEnd - A0) * (i + 1.04)) / SEGS),
    color: braise ? braiseColor(MIN + ((toScale(drawValue) - MIN) * (i + 0.5)) / SEGS, bLo, bHi) : mixHex(c0, c1, (i + 0.5) / SEGS),
  })) : [];
  const [mx, my] = polar(cx, cy, r, toAng(drawValue));
  /* Plus de trait « prévu » sur les anneaux (06/11, Gildas : on ne comprend pas). */
  const showMarker = false as boolean;

  const k = recoDir ?? "flat";
  const zonePos = axis ? (value < axis.zone[0] ? "Sous la zone" : value > axis.zone[1] ? "Au-dessus de la zone" : "Dans la zone")
    : roundedValue < zoneLow ? "Sous la zone" : roundedValue > zoneHigh ? "Au-dessus de la zone" : "Dans la zone";
  const hintText = hintOverride ?? zonePos;
  const fitKey = fluid ? `${size}|${centerTitle ?? hintText}` : "";
  useIsoLayoutEffect(() => { setTitleShrink(0); }, [fitKey]);
  useIsoLayoutEffect(() => {
    const el = titleRef.current;
    if (!fluid || !el) return;
    const font = parseFloat(getComputedStyle(el).fontSize);
    if (el.offsetHeight > font * 1.05 * 2 + 1 && font > 14) setTitleShrink(v => v + 1);
  });
  /* Essaim F2b sobre (2026-11-06, lot 3) : récup (bleu) et charge (orange) autour de l'anneau. Au-dessus de
     la zone il chauffe et s'agite (la charge domine), en dessous il refroidit et ralentit (la récup domine),
     d'autant plus qu'on s'éloigne. Sobre au quotidien (agitation réduite), plein effet en glissant et à l'arrivée. */
  const swarm = fluid && (!hideZone || neutralAt != null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const swarmLive = useRef({ v: value, lo: zoneLow, hi: zoneHigh, drag: false, r, sw, cx, cy, size, h });
  /* Échelle « axe » (charge de la semaine un jour de repos) : ramenée sur 1..10 pour l'essaim. */
  swarmLive.current = axis
    ? { v: 1 + 9 * drawValue, lo: 1 + 9 * axis.zone[0], hi: 1 + 9 * axis.zone[1], drag: dragging, r, sw, cx, cy, size, h }
    : { v: drawValue, lo: hideZone ? (neutralAt ?? value) : zoneLow, hi: hideZone ? (neutralAt ?? value) : zoneHigh, drag: dragging, r, sw, cx, cy, size, h };
  useDecisionSwarm(swarm ? cvRef : null, swarmLive);

  const onHintRef = useRef(onHint);
  onHintRef.current = onHint;
  useEffect(() => { onHintRef.current?.(hintText); }, [hintText]);

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: fluid ? "100%" : undefined }}>
      <div style={{ position: "relative", width: size, height: h }}>
        {fluid && glow && <div aria-hidden className={breath && !dragging ? "tpc-breath-glow" : undefined} style={{ position: "absolute", left: "50%", top: cy, width: size * 1.15, height: size * 1.15, transform: "translate(-50%, -50%)", borderRadius: "50%", pointerEvents: "none",
          ...(breath ? BREATH_VARS[breath] : {}),
          background: ambient ? `radial-gradient(circle, ${glow}70 0%, ${glow}28 40%, transparent 68%)` : `radial-gradient(circle, ${glow}38 0%, ${glow}12 45%, transparent 70%)`,
          } as React.CSSProperties} />}
        {sonar && glow && <div aria-hidden className="tpc-glow-pulse" style={{ position: "absolute", left: "50%", top: cy, width: size * 1.15, height: size * 1.15, borderRadius: "50%", pointerEvents: "none", background: `radial-gradient(circle, ${glow}80 0%, ${glow}30 40%, transparent 68%)` }} />}
        {sonar && <div aria-hidden className="tpc-sonar" onAnimationEnd={() => setSonar(false)} style={{ position: "absolute", left: cx, top: cy, width: rOut * 2, height: rOut * 2, borderRadius: "50%", border: "2px solid #5fae7e", pointerEvents: "none", zIndex: 3 }} />}
        {swarm && <canvas ref={cvRef} aria-hidden style={{ position: "absolute", left: -size * 0.12, top: -size * 0.12, width: size * 1.24, height: h + size * 0.24, pointerEvents: "none", zIndex: 2 }} />}
        <div className={breath && !dragging ? "tpc-breath1" : undefined} style={breath ? (BREATH_VARS[breath] as React.CSSProperties) : undefined}>
        <div className={breath && !dragging ? "tpc-breath2" : undefined} style={breath ? (BREATH_VARS[breath] as React.CSSProperties) : undefined}>
        <svg
          ref={svgRef}
          width={size} height={h} viewBox={`0 0 ${size} ${h}`}
          role="img" aria-label={`Difficulté ${roundedValue} sur 10, zone conseillée ${zoneLow} à ${zoneHigh}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ position: "relative", display: "block", overflow: "visible", cursor: readOnly ? "default" : "pointer", touchAction: readOnly ? "auto" : "pan-y" }}
        >
          <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="#1d2226" strokeWidth={sw} strokeLinecap="round" />
          {fills.map((f, i) => <path key={i} d={f.d} fill="none" stroke={f.color} strokeWidth={sw} strokeLinecap="butt" />)}
          {/* Bouts arrondis du remplissage, aux couleurs de départ et d'arrivée du dégradé. Plus de
              repères blancs par point de RPE (2026-09-30, Gildas). */}
          {fills.length > 0 && (() => {
            const [sx, sy] = polar(cx, cy, r, A0), [ex, ey] = polar(cx, cy, r, fillEnd);
            return <>
              <circle cx={sx} cy={sy} r={sw / 2} fill={c0} />
              <circle cx={ex} cy={ey} r={sw / 2} fill={c1} />
            </>;
          })()}
          {/* Repère du RPE PRÉVU (2026-09-30, Gildas : "une petite barre blanche qui symbolise le
              prévu") : trait blanc radial en travers de l'anneau. Au repos il est caché sous le
              curseur, qui démarre sur le prévu ; il apparaît dès qu'on déplace le curseur, et reste
              en mode décidé pour montrer d'où on est parti. */}
          {showMarker && (() => {
            const [ax, ay] = polar(cx, cy, r - sw * 0.8, toAng(plannedMarker!));
            const [bx, by] = polar(cx, cy, r + sw * 0.8, toAng(plannedMarker!));
            /* Légende du trait (06/11, Gildas : « on comprend pas ») : « PRÉVU » à l'extérieur de l'arc, sur l'anneau en grand. */
            const [lx, ly] = polar(cx, cy, r + sw * 0.8 + 11, toAng(plannedMarker!));
            return <>
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke={light ? "#171b1f" : "#fff"} strokeWidth={3} strokeLinecap="round" />
              {fluid && <text x={lx} y={ly + 3} textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize={9} fontWeight={700} letterSpacing=".06em" fill={light ? "rgba(23,27,31,.7)" : "rgba(255,255,255,.7)"}>PRÉVU</text>}
            </>;
          })()}
          {/* Étiquette de zone le long de l'arc, à l'extérieur (06/11, Gildas : « Optimale », parallèle à la courbe). */}
          {zoneText && !hideZone && (() => {
            const mid = (zoneA0 + zoneA1) / 2, id = `zl-${uid}`;
            return <>
              <path id={id} d={arcPath(cx, cy, rOut + 9, mid - 70, mid + 70)} fill="none" />
              <text fontFamily="var(--font-mono), monospace" fontSize={9.5} fontWeight={700} letterSpacing="0.12em" fill={light ? "rgba(23,27,31,.75)" : "rgba(255,255,255,.8)"}>
                <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{zoneText.toUpperCase()}</textPath>
              </text>
            </>;
          })()}
          {!hideZone && (locked
            ? <path d={sectorPath(cx, cy, rIn, rOut, zoneA0, zoneA1)} fill="rgba(95,174,126,.16)" stroke="#5fae7e" strokeWidth={2.5} />
            : <path d={sectorPath(cx, cy, rIn, rOut, zoneA0, zoneA1)} fill="none" stroke={light ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.75)"} strokeWidth={2} strokeDasharray="3 3" />)}
          {/* Même curseur que la jauge horizontale du Planning (DecisionGauge.tsx) : 19px, sombre,
              vert dans la zone, halo doux et poignée à 3 traits. Liseré blanc sur fond sombre
              seulement, sinon le curseur sombre se perd sur le track sombre. */}
          <g data-ring-knob="" style={{ transform: `translate(${mx}px, ${my}px)${knob !== 1 ? ` scale(${knob.toFixed(2)})` : ""}`, transition: dragging || introRunning ? "none" : "transform .35s cubic-bezier(.22,1,.36,1)" }}>
            <circle r={12.5} fill={inZone ? "rgba(42,128,69,.25)" : (light ? "rgba(24,24,27,.1)" : "rgba(255,255,255,.14)")} />
            <circle r={9.5} fill={inZone ? "#2a8045" : "#18181b"} stroke={light ? "none" : "rgba(255,255,255,.9)"} strokeWidth={1.5} />
            {[-3, 0, 3].map(dy => <line key={dy} x1={-3.5} x2={3.5} y1={dy} y2={dy} stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
          </g>
          {/* Zone de saisie, au-dessus de tout : seul l'anneau bloque le défilement au toucher. */}
          {!readOnly && <path d={arcPath(cx, cy, r, A0, A1)} fill="none" stroke="transparent" strokeWidth={sw * 3.2} strokeLinecap="round" style={{ touchAction: "none" }} />}
        </svg>
        </div>
        </div>
        {/* Arc ouvert en bas : le centre du cercle n'est pas celui de la boîte, on ancre sur cy.
            Mêmes tailles relatives qu'AggregateGauge (.215 valeur, .063 libellé). */}
        {fluid ? (() => {
          const t = centerTitle ?? hintText;
          const titleFont = Math.round(size * (t.length > 16 ? 0.1 : 0.12)) - titleShrink;
          return (
            <div style={{
              position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", pointerEvents: "none",
            }}>
              {/* Gratuit : le chiffre + son mot restent lisibles, le titre (la décision) est flouté. */}
              {kicker && !(titleLocked && centerLabel) && (
                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: light ? "rgba(23,27,31,.7)" : "rgba(255,255,255,.75)", marginBottom: 6, maxWidth: Math.round(rIn * 1.7), textAlign: "center", lineHeight: 1.3 }}>
                  {kicker}
                </span>
              )}
              {titleLocked && centerLabel && (
                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 12, letterSpacing: "0.09em", textTransform: "uppercase", color: light ? "rgba(23,27,31,.75)" : "rgba(255,255,255,.78)", marginBottom: 8 }}>
                  {centerLabel.arrow} · {centerLabel.verb}
                </span>
              )}
              <span ref={titleRef} style={{ fontWeight: 900, fontSize: titleFont, lineHeight: 1.05, letterSpacing: "-0.025em", maxWidth: Math.round(rIn * 1.85), textWrap: "balance", color: light ? "#171b1f" : "#fff", filter: titleLocked ? "blur(7px)" : undefined, userSelect: titleLocked ? "none" : undefined } as React.CSSProperties}>
                {t}
              </span>
            </div>
          );
        })() : <div style={{
          position: "absolute", left: 0, right: 0, top: cy, transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none",
        }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: light ? "#171b1f" : "#fff", fontSize: Math.round(size * 0.215) }}>
            {centerLabel?.arrow ?? ARROW[k]}
          </span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.15, marginTop: 4, color: light ? "#171b1f" : "#fff", fontSize: Math.max(9, Math.round(size * 0.063)) }}>
            {centerLabel?.verb ?? VERB[k]}
          </span>
        </div>}
      </div>
      {/* Légende de l'essaim : bleu = récup, orange = charge (couleurs sûres pour les daltoniens, doublées du mot). */}
      {legend ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4 }}>
          {([["recup", "Récup", "#80b8cc"], ["charge", "Charge", "#f6803f"]] as const).map(([k, lab, col]) => (
            <button key={k} type="button" onClick={legend[k].onClick}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", background: light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.07)", boxShadow: light ? "inset 0 0 0 1px rgba(0,0,0,.08)" : "inset 0 0 0 1px rgba(255,255,255,.1)", color: light ? "rgba(23,27,31,.75)" : "rgba(255,255,255,.75)" }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />{lab}
              <b style={{ color: light ? "#171b1f" : "#fff", fontSize: 11 }}>{legend[k].value ?? "–"}</b>
              <span aria-hidden style={{ opacity: 0.5 }}>›</span>
            </button>
          ))}
        </div>
      ) : swarm && <div aria-hidden style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 2, fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: light ? "rgba(23,27,31,.6)" : "rgba(255,255,255,.55)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: "#80b8cc" }} />Récup</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: "50%", background: "#f6803f" }} />Charge</span>
      </div>}
      {!hideHint && <div style={{ marginTop: 8, fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: inZone ? (light ? "#2a8045" : "#4ade80") : (light ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.5)") }}>
        {hintText}
      </div>}
    </div>
  );
}
