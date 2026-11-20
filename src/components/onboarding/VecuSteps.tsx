"use client";

/* Onboarding vécu (2026-11-15, POC https://claude.ai/artifact/61zkoU967UzqLb2dSTYGko v40, doc
   .claude/skills/onboarding-flow/chantier-onboarding-vecu-2026-11.md). Écrans du parcours sportif :
   présignup, carte de membre, questions en feuille du bas avec réaction, habitudes (vrai anneau du point
   forme), « Ce que tes réponses disent », le déclic (vrai anneau de décision et vraies lignes ajustées),
   mot du fondateur, Avant / Après, « Ce que tu gagnes », 14 jours, paiement. Rien n'est écrit en base
   ici : OnboardingFlow garde la création du compte, les events et l'enregistrement. */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import DecisionRing from "@/components/sessions/DecisionRing";
import CoachRadar, { type RadarPoint } from "@/components/coach/CoachRadar";
import PointFormeRing from "@/components/wellness/PointFormeRing";
import TodaySessionCard from "@/components/sessions/TodaySessionCard";
import { flyToken } from "@/lib/flyToken";
import { breathForDir } from "@/lib/ringAmbience";
import { PhotoBanner } from "@/components/bilan/BilanCarousel";
import { DayCurve, DayFrise } from "@/components/bilan/BilanViz";
import { parseAndApply } from "@/lib/loadAdjust";
import type { Session } from "@/types";
import { SCALE_WORDS, type ScaleKey } from "@/lib/wellnessWords";
import { computeAutoregSuggestion, pctToPoints, zoneRange, applyAutoregDifficulty, autoregBand } from "@/lib/autoregulation";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { recupColor, chargeColor } from "@/lib/ringColors";
import { DARK_CARD_BG } from "@/lib/theme";
import { INTERVIEWS } from "@/components/paywall/interviews";
import { PRICING } from "@/components/paywall/PaywallModal";
import { OfferRows } from "@/components/paywall/PricingPriming";
import {
  VECU_BEHAVIORS, behaviorPhrase, demoAdjust, demoAdjustLines, loadDelta, loadOf, habitsScore, oneIn, soreShare, effortHours, stagPeriod, dayLabel, dayPlan,
  type VecuFamily, type VecuHabits,
} from "@/lib/vecuModel";

const ACCENT = "#d44000";
const INK = "#171b1f";
const MUTED = "#6b7177";
const LINE = "rgba(0,0,0,.10)";
const EASE = "cubic-bezier(.23,1,.32,1)";
/* Une phrase par ligne (18/11, Gildas) : après un point suivi d'une nouvelle phrase, on va à la ligne plutôt que de
   laisser la phrase suivante démarrer au milieu d'une ligne. */
function sent(text: string | null | undefined): React.ReactNode {
  if (!text) return text;
  /* Sans lookbehind (non pris en charge avant Safari 16.4) : on coupe à la main après « . », « ! » ou « ? ». */
  const parts: string[] = [];
  let start = 0;
  const re = /[.!?]\s+(?=[A-ZÀ-ÖØ-Þ0-9«])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) { parts.push(text.slice(start, m.index + 1)); start = m.index + m[0].length; }
  parts.push(text.slice(start));
  return parts.length < 2 ? text : parts.map((p, i) => <span key={i}>{i > 0 && <br />}{p}</span>);
}
const MONO = "var(--font-mono), monospace";
const DISPLAY = "var(--font-display)";

/* Animations partagées des écrans (coupées si l'appareil demande moins d'animations). */
const VECU_CSS = `
.vc-in::placeholder{color:rgba(255,255,255,.32)}
.vc-pay-ring{width:clamp(52%, calc(100dvh - 470px), 86%)}
.vc-sess-ring{width:clamp(60%, calc(100dvh - 440px), 100%)}
.vc-ins-box{display:flex}
.vc-ins-big{font-size:60px}
@media (max-height:700px){.vc-lock{zoom:.78}.vc-ins-box{display:none}.vc-ins-gap{display:none}.vc-ins-big{font-size:46px}}
@keyframes vcRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes vcPop{from{opacity:0;transform:translateY(14px) scale(.96)}}
@keyframes vcSheet{from{transform:translateY(100%)}}
@keyframes vcGrow{from{transform:scaleY(0)}}
@keyframes vcBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes vcFill{from{width:0}to{width:100%}}
@keyframes vcKb{from{transform:scale(1.08) translate(-1.5%,1%)}to{transform:scale(1) translate(0,0)}}
@keyframes vcCaret{50%{opacity:0}}
@keyframes vcMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes vcDraw{to{stroke-dashoffset:0}}
.vc-rise{opacity:0;animation:vcRise .5s ${EASE} forwards}
.vc-pop{animation:vcPop .55s ${EASE} both}
.vc-press{transition:transform .16s ${EASE}}
.vc-press:active{transform:scale(.97)}
.vc-car{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}
.vc-car::-webkit-scrollbar{display:none}
.vc-car>*{scroll-snap-align:center;flex-shrink:0}
@media (prefers-reduced-motion:reduce){.vc-rise,.vc-pop{animation:none!important;opacity:1!important;transform:none!important}[style*=vcMarquee]{animation:none!important}}
`;

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { setR(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  return r;
}

/* ── Cadre d'écran : fond sombre de l'app, photo du sport teintée en haut, en-tête, feuille ou pied. ── */
export function VecuFrame({ photo, onBack, progress, right, children, sheet, foot, glow, center, noScroll, bleed }: {
  photo?: string | null;
  onBack?: () => void;
  /* Frise en 3 thèmes (ta forme, le problème, l'offre), chaque valeur entre 0 et 1. */
  progress?: [number, number, number];
  right?: React.ReactNode;
  children?: React.ReactNode;
  sheet?: React.ReactNode;
  foot?: React.ReactNode;
  glow?: boolean;
  center?: boolean;
  /* Le haut ne défile pas : c'est la feuille du bas qui s'ouvre ou se replie (déclic). */
  noScroll?: boolean;
  /* Le halo de l'anneau déborde librement (paywall, 20/11, Gildas : pas de carré autour de l'anneau). */
  bleed?: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10, background: DARK_CARD_BG, color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: VECU_CSS }} />
      {photo && (
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: "64%", overflow: "hidden" }}>
          <Image src={photo} alt="" fill priority sizes="100vw" style={{ objectFit: "cover", filter: "grayscale(1) contrast(1.15) brightness(.78)" }} />
          {/* 20/11 (Gildas : trop noir) : la teinte du fond sombre de l'app (DARK_CARD_BG, lueur cyan) au lieu du noir et
              de l'orange ; seul le bas se fond dans le fond de page. */}
          <div style={{ position: "absolute", inset: 0, background: "#0b3d55", mixBlendMode: "multiply", opacity: 0.55 }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 105% 65% at 50% -10%, rgba(56,189,248,0.32) 0%, rgba(125,211,252,0.12) 40%, transparent 65%), radial-gradient(ellipse 55% 35% at 15% 25%, rgba(14,165,233,0.1) 0%, transparent 55%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(7,10,13,.3) 0%,rgba(7,10,13,0) 40%,rgba(7,10,13,.6) 82%,#070a0d 100%)" }} />
        </div>
      )}
      {glow && <div aria-hidden style={{ position: "absolute", inset: "0 0 auto", height: "55%", background: "radial-gradient(80% 70% at 50% 0%,rgba(255,106,40,.28),transparent 70%)", pointerEvents: "none" }} />}
      <div style={{ position: "relative", zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px 6px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Retour" className="vc-press" style={roundBtn}>←</button>
        ) : <span style={{ width: 34 }} />}
        {progress ? (
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
            {progress.map((p, i) => (
              <i key={i} style={{ height: 4, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.18)", display: "block" }}>
                <b style={{ display: "block", height: "100%", borderRadius: 999, background: ACCENT, transformOrigin: "left", transform: `scaleX(${Math.max(0, Math.min(1, p))})`, transition: `transform .35s ${EASE}` }} />
              </i>
            ))}
          </div>
        ) : <span style={{ flex: 1 }} />}
        {right ?? <span style={{ width: 34 }} />}
      </div>
      <div style={{ position: "relative", zIndex: 3, flex: 1, minHeight: 0, overflowY: bleed ? "visible" : noScroll ? "hidden" : "auto", overflowX: bleed ? "visible" : "hidden", padding: "6px 20px 12px", display: "flex", flexDirection: "column", justifyContent: center ? "center" : undefined, maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {children}
      </div>
      {foot && (
        <div style={{ position: "relative", zIndex: 4, flexShrink: 0, padding: "10px 20px calc(22px + env(safe-area-inset-bottom, 0px))", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>{foot}</div>
      )}
      {sheet}
    </div>
  );
}

const roundBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)",
  color: "#fff", fontSize: 16, cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, padding: 0,
};

export function Sheet({ title, sub, children, subInline }: { title?: string; sub?: string; children: React.ReactNode; subInline?: boolean }) {
  return (
    /* 20/11 (Gildas : la feuille blanche pesait) : plus de feuille, le bas de l'écran est posé sur le fond sombre. */
    <div style={{ position: "relative", zIndex: 6, flexShrink: 0, color: "#fff", animation: `vcRise .42s cubic-bezier(.32,.72,0,1) both`, maxHeight: "72%", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", padding: "8px 20px calc(22px + env(safe-area-inset-bottom, 0px))", overflowY: "auto" }}>
        {title && <div style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.02em", textWrap: "balance" }}>{title}</div>}
        {sub && <div style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(255,255,255,.7)", marginTop: 4 }}>{subInline ? sub : sent(sub)}</div>}
        {children}
      </div>
    </div>
  );
}

export function Pill({ children, onClick, disabled, light }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; light?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="vc-press"
      style={{ display: "block", width: "100%", padding: 16, borderRadius: 999, border: 0, cursor: disabled ? "default" : "pointer", fontWeight: 800, fontSize: 16, fontFamily: "inherit",
        background: disabled ? (light ? "#e8e4df" : "rgba(255,255,255,.12)") : "linear-gradient(180deg,#f04a08,#d44000)", color: disabled ? (light ? "#a3a8ad" : "rgba(255,255,255,.4)") : "#fff" }}>
      {children}
    </button>
  );
}

function Chip({ children, on, onClick }: { children: React.ReactNode; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="vc-press"
      style={{ padding: "11px 15px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14.5, fontFamily: "inherit",
        color: on ? ACCENT : INK, border: on ? `2px solid ${ACCENT}` : `1px solid ${LINE}`, background: on ? "rgba(212,64,0,.06)" : "#fff" }}>
      {on && <span aria-hidden>✓ </span>}{children}
    </button>
  );
}

/* Réaction à une réponse, posée sur la photo (16/11, Gildas : sans voile, « Touche pour continuer » dessous).
   La feuille se retire ; elle reste jusqu'au tap, sans minuteur. */
function Reaction({ text, node, onTap }: { text: string | null; node?: React.ReactNode; onTap?: () => void }) {
  if (!text) return null;
  return (
    <button type="button" onClick={onTap} aria-label="Continuer"
      style={{ flex: 1, width: "100%", border: 0, background: "none", padding: "0 8px calc(24px + env(safe-area-inset-bottom, 0px))", cursor: "pointer", fontFamily: "inherit", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textShadow: "0 2px 18px rgba(0,0,0,.55)" }}>
      {node ?? <span role="status" className="vc-rise" style={{ maxWidth: 440, textAlign: "center", fontFamily: DISPLAY, fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.3, textWrap: "balance" }}>{sent(text)}</span>}
      <span className="vc-rise" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", animationDelay: "1.2s" }}>Touche pour continuer</span>
    </button>
  );
}

/* Après « depuis quand » (16/11, Gildas : une vraie page, pas de minuteur, CTA « Changer ça ») : ses heures,
   puis le constat (STAG_REACTIONS). Encadré « Avec ThePerfClub » et cases jours / séances retirés le 16/11. */
export function EffortScreen({ hours, stagMonths, sport, insight, onBack, onNext, progress }: {
  hours: number; stagMonths: number | null; sport: string; insight: string;
  onBack: () => void; onNext: () => void; progress: [number, number, number];
}) {
  /* Le calcul se voit (20/11, Gildas : les heures arrivaient d'un coup) : « Je calcule… » puis le chiffre qui monte. */
  const reducedE = useReducedMotion();
  const [calc, setCalc] = useState(true);
  useEffect(() => { const id = window.setTimeout(() => setCalc(false), reducedE ? 300 : 1900); return () => window.clearTimeout(id); }, [reducedE]);
  if (calc) return (
    <VecuFrame glow center progress={progress}>
      <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Je calcule ton effort…</div>
        <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.12)", margin: "16px 0 18px", overflow: "hidden" }}>
          <i style={{ display: "block", height: "100%", width: "100%", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", transformOrigin: "left", animation: `vcBar 1.7s ${EASE} both` }} />
        </div>
        <div className="vc-rise" style={{ fontSize: 14.5, color: "rgba(255,255,255,.7)", animationDelay: ".3s" }}>Tes séances, leur durée, tes semaines</div>
        {stagMonths ? <div className="vc-rise" style={{ fontSize: 14.5, color: "rgba(255,255,255,.7)", marginTop: 8, animationDelay: ".75s" }}>Depuis {stagPeriod(stagMonths)}</div> : null}
      </div>
    </VecuFrame>
  );
  return (
    <VecuFrame glow center onBack={onBack} progress={progress} foot={<Pill onClick={onNext}>Changer ça</Pill>}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <span className="vc-rise" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "#ffb08a" }}>Ton effort en {sport.toLowerCase()}</span>
        <span style={{ fontSize: 80, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, margin: "14px 0 10px", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}><CountUp to={hours} /> h</span>
        <span className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 700, lineHeight: 1.35, animationDelay: ".3s" }}>
          {stagMonths ? `d'entraînement depuis ${stagPeriod(stagMonths)}. Toujours le même niveau.` : "investies ces 3 derniers mois."}
        </span>
        <span className="vc-rise" style={{ width: "100%", marginTop: 22, animationDelay: ".5s" }}><PlateauIllus months={stagMonths} /></span>
        <span className="vc-rise" style={{ marginTop: 18, maxWidth: 400, fontSize: 16, lineHeight: 1.5, color: "rgba(255,255,255,.75)", textWrap: "balance", animationDelay: ".7s" }}>{sent(insight)}</span>
        {/* Note App Store (17/11, Gildas) ; l'écran de transition du 20/11 est retiré, le calcul des heures se voit à la place. */}
        <Proof />
      </div>
    </VecuFrame>
  );
}

/* Illustrations des réactions (16/11, Gildas : montrer quelque chose selon sa réponse). */
export function IllusReaction({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%", maxWidth: 400 }}>
      <span className="vc-rise" style={{ width: "100%" }}>{children}</span>
      <span className="vc-rise" style={{ textAlign: "center", fontFamily: DISPLAY, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.3, textWrap: "balance", animationDelay: ".35s" }}>{sent(text)}</span>
    </span>
  );
}

const ILL_KICK: React.CSSProperties = { fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", textAlign: "center", marginBottom: 10 };

/* Périodisation type selon l'objectif : 12 semaines de charge. */
export function GoalIllus({ goal }: { goal: string | null }) {
  const W: Record<string, { v: number[]; cap: string; peak?: number }> = {
    volume: { v: [42, 52, 62, 30, 50, 60, 72, 34, 58, 70, 82, 38], cap: "Le volume monte par blocs, une semaine plus légère pour encaisser." },
    competition: { v: [48, 58, 68, 40, 62, 74, 86, 46, 80, 64, 46, 100], cap: "La charge monte, puis s'affûte jusqu'à l'échéance.", peak: 11 },
    /* 20/11 (Gildas) : même forme que l'échéance, la charge monte par blocs puis s'allège avant le pic (« Pic »). */
    intensite: { v: [52, 62, 72, 42, 64, 76, 88, 48, 82, 66, 50, 100], cap: "L'intensité monte par blocs, puis s'affûte jusqu'au pic.", peak: 11 },
  };
  const g = W[goal ?? ""] ?? { v: [50, 58, 64, 44, 56, 64, 70, 48, 62, 70, 76, 52], cap: "Une progression régulière, ajustée semaine après semaine." };
  return (
    <span style={{ display: "block" }}>
      <span style={{ ...ILL_KICK, display: "block" }}>Ta périodisation</span>
      <span style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 96 }}>
        {g.v.map((h, i) => (
          <span key={i} style={{ position: "relative", flex: 1, height: `${h}%`, borderRadius: "5px 5px 2px 2px", transformOrigin: "bottom", animation: `vcGrow .6s ${EASE} ${i * 50}ms both`,
            background: i === g.peak ? "#fff" : `linear-gradient(180deg,#ff8a4c,#d44000)`, opacity: i === g.peak ? 1 : 0.55 + h / 250 }}>
            {i === g.peak && <b style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontFamily: MONO, fontSize: 9, whiteSpace: "nowrap" }}>{goal === "competition" ? "Échéance" : "Pic"}</b>}
          </span>
        ))}
      </span>
      {/* Légende retirée (20/11, Gildas : redite de la réaction juste dessous). */}
    </span>
  );
}

/* Semaine conseillée selon ses jours : dure / légère / repos, écrit sous chaque jour. */
export function DaysIllus({ days }: { days: number[] }) {
  const plan = dayPlan(days);
  const L = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <span style={{ display: "block" }}>
      <span style={{ ...ILL_KICK, display: "block" }}>Ta semaine conseillée</span>
      <span style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, alignItems: "end" }}>
        {L.map((d, i) => {
          const p = plan[i];
          return (
            <span key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ width: "100%", height: 80, display: "flex", alignItems: "flex-end" }}>
                <span style={{ width: "100%", height: p === "dure" ? "100%" : p === "legere" ? "48%" : "8%", borderRadius: 6, transformOrigin: "bottom", animation: `vcGrow .6s ${EASE} ${i * 60}ms both`,
                  background: p === "dure" ? "linear-gradient(180deg,#ffb5a7,#d44000)" : p === "legere" ? "linear-gradient(180deg,#bfeec8,#2f9e44)" : "rgba(255,255,255,.14)" }} />
              </span>
              <b style={{ fontFamily: MONO, fontSize: 11 }}>{d}</b>
              <small style={{ fontSize: 10, color: "rgba(255,255,255,.65)", whiteSpace: "nowrap" }}>{p === "dure" ? "Dure" : p === "legere" ? "Légère" : "Repos"}</small>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/* Courbe de perfs : elle monte, puis plafonne depuis `months` (0 = elle monte encore). */
export function PlateauIllus({ months }: { months: number | null }) {
  const flat = months ? Math.min(0.62, 0.22 + months * 0.07) : 0;
  const x0 = 18 + (1 - flat) * 264;
  const d = flat ? `M 18 100 C ${x0 * 0.45} 96, ${x0 * 0.7} 46, ${x0} 40 L 282 40` : "M 18 100 C 110 96, 200 56, 282 20";
  return (
    <svg viewBox="0 0 300 120" width="100%" aria-hidden style={{ display: "block", maxWidth: 320, margin: "0 auto", overflow: "visible" }}>
      <line x1="18" y1="108" x2="282" y2="108" stroke="rgba(255,255,255,.18)" />
      <path d={d} fill="none" stroke="#ff8a4c" strokeWidth="3.5" strokeLinecap="round" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: `vcDraw 1.2s ${EASE} .2s forwards` }} />
      {flat > 0 && <>
        <rect x={x0} y="30" width={282 - x0} height="20" rx="6" fill="rgba(255,255,255,.08)" />
        <text x={(x0 + 282) / 2} y="25" textAnchor="middle" fill="rgba(255,255,255,.7)" style={{ fontFamily: "ui-monospace,monospace", fontSize: 10 }}>Plateau</text>
      </>}
      <circle cx="282" cy={flat ? 40 : 20} r="6" fill="#fff" />
      <text x="282" y={flat ? 64 : 44} textAnchor="end" fill="#fff" style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, fontWeight: 700 }}>Aujourd&apos;hui</text>
    </svg>
  );
}

/* Question en feuille : un tap choisit, la réaction s'affiche, puis l'écran suivant. */
export function useReact(onDone: () => void) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const fire = (t: string) => {
    if (timer.current) return;
    setText(t);
    timer.current = window.setTimeout(() => { timer.current = null; setText(null); onDone(); }, 2300);
  };
  return { text, fire, busy: text != null };
}

export function QuestionScreen({ photo, onBack, progress, title, sub, options = [], reaction, reactionNode, chips, noCheck, body, onReactTap, onContinue, extra }: {
  photo: string | null; onBack?: () => void; progress: [number, number, number]; title: string; sub?: string;
  options?: { key: string; label: string; icon?: string; hint?: string; on?: boolean; onPick: () => void }[];
  reaction: string | null;
  chips?: boolean;
  /* Pastilles sans ✓ (jours : la coche faisait passer la rangée à la ligne) ; la sélection reste lisible par le fond plein. */
  noCheck?: boolean;
  /* Contenu libre à la place des options (sélecteur de sport : le vrai SportPicker de l'app, en `dark`). */
  body?: React.ReactNode;
  onReactTap?: () => void;
  reactionNode?: React.ReactNode;
  /* Réaction en direct (20/11, Gildas) : chaque tap met à jour le miroir au-dessus, il change d'avis s'il veut et passe
     à la suite avec « Continuer ». */
  onContinue?: () => void;
  extra?: React.ReactNode;
}) {
  /* Ancien mode (réaction posée sur la photo, « Touche pour continuer ») : écrans encore hors parcours. */
  if (reaction && !onContinue) {
    return <VecuFrame photo={photo} onBack={onBack} progress={progress}><Reaction text={reaction} node={reactionNode} onTap={onReactTap} /></VecuFrame>;
  }
  /* 20/11 (Gildas : la feuille blanche pesait) : plus de feuille. Les choix sont posés sur le fond sombre, au style du
     point forme ; « Continuer » en bas. */
  const live = !!onContinue && !!reaction;
  return (
    <VecuFrame photo={photo} onBack={onBack} progress={progress}
      foot={onContinue ? <Pill disabled={!reaction} onClick={onContinue}>Continuer</Pill> : undefined}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 24, display: "flex", flexDirection: "column", justifyContent: live ? "center" : "flex-end", textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>
          {live ? (
            <div key={reaction} role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px" }}>
              {reactionNode ?? <span className="vc-rise" style={{ maxWidth: 440, textAlign: "center", fontFamily: DISPLAY, fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.3, textWrap: "balance" }}>{sent(reaction)}</span>}
            </div>
          ) : (
            <>
              <h2 key={title} className="vc-rise" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", textWrap: "balance" }}>{title}</h2>
              {sub && <div className="vc-rise" style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(255,255,255,.75)", marginTop: 6, animationDelay: ".1s" }}>{sent(sub)}</div>}
              {extra}
            </>
          )}
        </div>
        {live && <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.6)", marginTop: 14 }}>{title}</div>}
        <div style={{ flexShrink: 0, paddingTop: live ? 8 : 16 }}>
          {body ? body : chips ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {options.map(o => <DarkChip key={o.key} on={o.on} noCheck={noCheck} onClick={o.onPick}>{o.icon ? `${o.icon} ` : ""}{o.label}</DarkChip>)}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {options.map(o => <DarkOption key={o.key} on={o.on} icon={o.icon} hint={o.hint} onClick={o.onPick}>{o.label}</DarkOption>)}
            </div>
          )}
        </div>
      </div>
    </VecuFrame>
  );
}

/* Choix sur fond sombre (20/11), mêmes lignes que « Qu'as-tu prévu aujourd'hui ? » du point forme. Choisi : contour clair
   épais, fond orangé et ✓ (jamais la couleur seule). */
function DarkOption({ children, onClick, on, icon, hint }: { children: React.ReactNode; onClick: () => void; on?: boolean; icon?: string; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className="vc-press" aria-pressed={on}
      style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", padding: "14px 16px", borderRadius: 16, cursor: "pointer", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 800,
        background: on ? "rgba(240,74,8,.22)" : "rgba(255,255,255,.06)", border: on ? "2px solid #ffb08a" : "1.5px solid rgba(255,255,255,.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      {icon && <span aria-hidden style={{ fontSize: 22, width: 28, textAlign: "center" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{children}{hint && <small style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{hint}</small>}</span>
      {on && <span aria-hidden style={{ fontSize: 16, color: "#ffb08a" }}>✓</span>}
    </button>
  );
}
function DarkChip({ children, on, noCheck, onClick }: { children: React.ReactNode; on?: boolean; noCheck?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="vc-press"
      style={{ padding: "11px 15px", borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14.5, fontFamily: "inherit", color: "#fff",
        background: on ? "rgba(240,74,8,.32)" : "rgba(255,255,255,.06)", border: on ? "2px solid #ffb08a" : "1.5px solid rgba(255,255,255,.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      {on && !noCheck && <span aria-hidden>✓ </span>}{children}
    </button>
  );
}

/* ── Carte de membre : le prénom s'écrit pendant la saisie. ── */
/* Numéro de membre (15/11, Gildas : quelques milliers, « il y a du monde ») : tiré une fois par appareil. */
function memberNumber(): number {
  try {
    const k = "tpc_member_no", v = Number(localStorage.getItem(k));
    if (v) return v;
    const n = 4200 + Math.floor(Math.random() * 1600);
    localStorage.setItem(k, String(n));
    return n;
  } catch { return 4817; }
}
export function MemberCard({ name, sport, typing }: { name: string; sport?: string | null; typing?: boolean }) {
  const [no, setNo] = useState<number | null>(null);
  useEffect(() => { setNo(memberNumber()); }, []);
  const [date] = useState(() => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }).toUpperCase());
  return (
    <div className="vc-pop" style={{ position: "relative", width: 296, maxWidth: "100%", aspectRatio: "1.586", borderRadius: 22, padding: "18px 20px", overflow: "hidden", color: "#fff", boxSizing: "border-box",
      background: "radial-gradient(120% 140% at 0% 0%,#2a2f34 0%,#111417 55%,#0a0c0e 100%)", boxShadow: "0 30px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.12),inset 0 1px 0 rgba(255,255,255,.12)",
      display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase" }}>ThePerfClub</span>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 7, background: "rgba(255,255,255,.12)" }}>Membre</span>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, minHeight: 26 }}>
          {name.trim() || <span style={{ color: "rgba(255,255,255,.3)" }}>Ton prénom</span>}
          {typing && <span aria-hidden style={{ display: "inline-block", width: 2, height: 22, background: "#ff8a55", marginLeft: 3, verticalAlign: -3, animation: "vcCaret 1s steps(1) infinite" }} />}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "rgba(255,255,255,.62)", marginTop: 6, letterSpacing: ".04em" }}>
          {no ? <>N° <b style={{ color: "#fff" }}>{no.toLocaleString("fr-FR")}</b> · </> : null}{sport ? `${sport.toUpperCase()} · ` : ""}{date}
        </div>
      </div>
      <div />
    </div>
  );
}

/* ── Présignup « Trame » (17/11, Gildas, POC 61zkoU v40 variante Trame) : façon Opal, un écran par tap, sans frise.
   Un seul objet, le vrai anneau de décision de /today avec son essaim en fond (field), qui reste en place d'un
   écran à l'autre : seuls sa valeur, sa zone, le titre et les tags changent (fondus, glissements).
   1 jour à lever le pied (au-dessus de la zone), 2 jour à pousser (sous la zone), 3 l'échauffement donne le ton
   (la zone remonte une fois chaud), 4 le compte : l'anneau revient dans la zone (geste de /today, aspiration de
   l'essaim), puis Moi / Mes sportifs et les comptes. Pas de séance ici : elle est réservée au déclic (ob_sess). ── */
type RingState = { v: number; lo: number; hi: number };
type TrameTag = { e: string; l: string; hot?: boolean; at: TagAt; delay: number };
/* Tags autour de l'anneau, au-dessus (deux coins décalés) et dessous (17/11, Gildas : anneau aussi grand que
   sur /today en mobile, les tags jamais dessus). */
type TagAt = React.CSSProperties;
const TAG_POS: TagAt[] = [{ top: 0, left: "4%" }, { top: 20, right: "4%" }, { bottom: 0, left: "50%", transform: "translateX(-50%)" }];
const TRAME: { ring: RingState; title: React.ReactNode; tags: TrameTag[]; then?: { ring: RingState; after: number; tags: TrameTag[] } }[] = [
  { ring: { v: 7, lo: 2, hi: 4 },
    title: <>Ton programme te fait forcer <em style={{ fontStyle: "normal", color: "#ffb08a" }}>les jours où tu devrais lever le pied.</em></>,
    tags: [{ e: "😴", l: "Nuit courte", at: TAG_POS[0], delay: 0.35 }, { e: "💼", l: "Journée chargée", at: TAG_POS[1], delay: 0.55 }, { e: "🦵", l: "Courbatures", at: TAG_POS[2], delay: 0.75 }] },
  { ring: { v: 4, lo: 7, hi: 9 },
    title: <>Et il te retient <em style={{ fontStyle: "normal", color: "#9fd0e0" }}>les jours où tu pourrais pousser plus.</em></>,
    tags: [{ e: "🌙", l: "Grosse nuit", at: TAG_POS[0], delay: 0.35 }, { e: "🧘", l: "Stretching", at: TAG_POS[1], delay: 0.55 }, { e: "🔥", l: "Motivation", at: TAG_POS[2], delay: 0.75 }] },
  { ring: { v: 7, lo: 3, hi: 5 },
    title: <>Parfois, l&apos;échauffement <em style={{ fontStyle: "normal", color: "#ffb08a" }}>donne le ton de la séance.</em></>,
    tags: [{ e: "😮‍💨", l: "Arrivé fatigué", at: TAG_POS[0], delay: 0.3 }],
    then: { ring: { v: 7, lo: 6, hi: 8 }, after: 1500, tags: [{ e: "✓", l: "Une fois chaud", hot: true, at: TAG_POS[1], delay: 0 }] } },
];
/* Trame en voix coach (18/11, Gildas : même anneau, le coach l'a aussi sur la carte de chaque sportif ; arrivée par
   « Espace coach » = ?role=coach). Douleur du coach : l'impuissance, l'info qui arrive trop tard. */
const TRAME_COACH: typeof TRAME = [
  { ring: { v: 7, lo: 2, hi: 4 },
    title: <>Le programme de Léa la fait forcer <em style={{ fontStyle: "normal", color: "#ffb08a" }}>le jour où elle devrait lever le pied.</em></>,
    tags: [{ e: "😴", l: "Nuit courte", at: TAG_POS[0], delay: 0.35 }, { e: "📚", l: "Partiels", at: TAG_POS[1], delay: 0.55 }, { e: "🤐", l: "Elle ne dit rien", at: TAG_POS[2], delay: 0.75 }] },
  { ring: { v: 4, lo: 7, hi: 9 },
    title: <>Et retient Hugo <em style={{ fontStyle: "normal", color: "#9fd0e0" }}>le jour où il pourrait pousser plus.</em></>,
    tags: [{ e: "🌙", l: "Grosse nuit", at: TAG_POS[0], delay: 0.35 }, { e: "🔥", l: "Motivé", at: TAG_POS[1], delay: 0.55 }] },
  { ring: { v: 8, lo: 3, hi: 5 },
    title: <>Et la fatigue de Thomas, <em style={{ fontStyle: "normal", color: "#ffb08a" }}>tu l&apos;apprends le jour de la blessure.</em></>,
    tags: [{ e: "🦵", l: "Courbatures depuis lundi", at: TAG_POS[0], delay: 0.3 }, { e: "🤐", l: "Rien dit", at: TAG_POS[1], delay: 0.6 }] },
];
/* Écran du compte : part d'un jour à lever le pied, puis l'anneau glisse dans la zone. */
const ACCT_FROM: RingState = { v: 7, lo: 2, hi: 4 }, ACCT_TO: RingState = { v: 3, lo: 2, hi: 4 };
/* Séance d'aperçu sous l'anneau (17/11, Gildas : « qu'on voie que c'est une app de sport ») : décor discret, fondu
   dans le fond. Le sport n'est pas encore connu : séance de force. Au compte, elle s'allège avec le vrai moteur
   (parseAndApply) et un jeton en kg part de l'anneau vers chaque ligne changée, comme sur /today. */
/* En % de la charge max (18/11, Gildas : on ne connaît pas son niveau). */
const TRAME_SESSION = { name: "Force · Séance A", lines: ["Squat 4x6 @ 75%", "Développé couché 4x8 @ 70%", "Rowing barre 4x10 @ 70%"] };
const TRAME_PCT = -10;
const kgOf = (l: string) => { const m = l.match(/(\d+(?:[.,]\d+)?)\s*kg/i); return m ? parseFloat(m[1].replace(",", ".")) : null; };
const ringGlowFor = (s: RingState) => (Math.round(s.v) > s.hi ? "#d44000" : Math.round(s.v) < s.lo ? "#3f7f9a" : "#2a8045");
const ringDirFor = (s: RingState) => (Math.round(s.v) > s.hi ? "low" as const : Math.round(s.v) < s.lo ? "high" as const : undefined);

/* Valeur et zone de l'anneau qui glissent vers leur cible (le DecisionRing change d'état sans transition après
   son arrivée) : l'essaim, la couleur et le titre suivent pendant le glissement. */
function useRingTween(target: RingState, ms: number, reduced: boolean) {
  const [s, setS] = useState<RingState>(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced) { cur.current = target; setS(target); return; }
    const from = { ...cur.current }, t0 = performance.now();
    let raf = 0;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (now: number) => {
      const k = ease(Math.min(1, (now - t0) / ms));
      const n = { v: from.v + (target.v - from.v) * k, lo: from.lo + (target.lo - from.lo) * k, hi: from.hi + (target.hi - from.hi) * k };
      cur.current = n; setS(n);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [target.v, target.lo, target.hi, ms, reduced]);
  return s;
}

function GChip({ children, at, hot, delay = 0, emoji }: { children: React.ReactNode; at: TagAt; hot?: boolean; delay?: number; emoji: string }) {
  return (
    <span style={{ position: "absolute", zIndex: 4, ...at }}>
      <span className="vc-pop" style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap",
        background: hot ? "rgba(42,128,69,.85)" : "rgba(255,255,255,.1)", border: `1px solid ${hot ? "rgba(160,230,180,.5)" : "rgba(255,255,255,.16)"}`,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 10px 26px rgba(0,0,0,.3)", animationDelay: `${delay}s` }}>
        <span aria-hidden>{emoji}</span>{children}
      </span>
    </span>
  );
}

export function VecuPresignup({ picked, onPick, onGoogle, onApple, onEmail, busy, error, onStep, coach = false, kicker, lockRole = false }: {
  picked: boolean;
  onPick: (r: "athlete" | "coach") => void;
  onRepick: () => void;
  onGoogle: () => void;
  onApple?: () => void;
  onEmail: () => void;
  busy?: boolean;
  error?: string | null;
  onStep?: (i: number) => void;
  /* Voix coach (?role=coach) : mêmes écrans, titres sur ses sportifs ; l'en-tête propose « Espace sportif ». */
  coach?: boolean;
  /* D'où il vient (20/11, Gildas) : invitation du coach, programme /p/, test /o/. Une ligne au-dessus du titre, sur
     toute la Trame, sans toucher aux titres ni à l'anneau. */
  kicker?: string | null;
  /* Sportif invité : pas de bascule « Espace coach ». */
  lockRole?: boolean;
}) {
  const reduced = useReducedMotion();
  const TR = coach ? TRAME_COACH : TRAME;
  /* Rôle déjà connu (retour en arrière, ?role=) : directement l'écran du compte. */
  const [i, setI] = useState(picked ? TRAME.length : 0);
  const [phase, setPhase] = useState(0); // écran 3 : 1 = une fois chaud ; compte : 1 = dans la zone, 2 = boutons
  const acct = i === TRAME.length;
  const sc = TR[i];
  useEffect(() => { onStep?.(i); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [i]);
  useEffect(() => {
    setPhase(0);
    const ts: number[] = [];
    if (acct) { ts.push(window.setTimeout(() => setPhase(1), reduced ? 0 : 900), window.setTimeout(() => setPhase(2), reduced ? 0 : 4300)); }
    else if (sc?.then) ts.push(window.setTimeout(() => setPhase(1), reduced ? 0 : sc.then.after));
    return () => ts.forEach(clearTimeout);
  }, [i, acct, sc, reduced]);
  const target: RingState = acct ? (phase >= 1 ? ACCT_TO : ACCT_FROM) : sc.then && phase >= 1 ? sc.then.ring : sc.ring;
  const ring = useRingTween(target, acct && phase >= 1 ? 1100 : 750, reduced);
  const tags = acct ? [] : [...sc.tags, ...(sc.then && phase >= 1 ? sc.then.tags : [])];
  const adjusted = acct && phase >= 1;
  const original = TRAME_SESSION.lines.join("\n");
  const cardRef = useRef<HTMLDivElement>(null);
  /* Place libre sous l'anneau (18/11, Gildas : l'anneau passait sous la séance) : au compte, la carte ne monte jamais
     plus haut que le bas de l'anneau. */
  const ringBoxRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    if (!acct) return;
    const m = () => { const el = ringBoxRef.current?.querySelector("svg"), c = cardRef.current; if (!el || !c) return;
      /* Le bas de la carte est fixe (posé en bas d'écran) : sa hauteur max = du bas de l'anneau au bas de la carte. */
      setRoom(Math.max(120, Math.round(c.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom - 12))); };
    m(); window.addEventListener("resize", m);
    return () => window.removeEventListener("resize", m);
  }, [acct]);
  useEffect(() => {
    if (!adjusted || reduced) return;
    const ts: number[] = [];
    ts.push(window.setTimeout(() => {
      const knob = document.querySelector("[data-ring-knob]"), card = cardRef.current;
      if (!knob || !card) return;
      const box = card.getBoundingClientRect();
      /* Seulement les lignes visibles au-dessus du fondu. */
      const lines = Array.from(card.querySelectorAll("[data-ex-line='changed']")).filter(el => el.getBoundingClientRect().top < box.bottom - 40).slice(0, 3);
      lines.forEach((el, n) => {
        const k = Number((el as HTMLElement).dataset.exIdx ?? n), src = TRAME_SESSION.lines[k] ?? "", d = loadDelta(src, demoAdjust(src, TRAME_PCT));
        if (!d) return;
        ts.push(window.setTimeout(() => flyToken(knob, el, d, d.startsWith("−") ? "#d44000" : "#2f9e44"), n * 380));
      });
    }, 1100));
    return () => ts.forEach(clearTimeout);
  }, [adjusted, reduced]);
  const go = (d: number) => setI(x => Math.max(0, Math.min(TRAME.length, x + d)));
  const btn: React.CSSProperties = { height: 52, borderRadius: 16, border: 0, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: busy ? "default" : "pointer", fontFamily: "inherit", width: "100%", opacity: busy ? 0.7 : 1 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10, background: DARK_CARD_BG /* même fond que /today */, color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: VECU_CSS }} />
      <div style={{ position: "relative", zIndex: 6, display: "flex", justifyContent: "flex-end", padding: "calc(14px + env(safe-area-inset-top, 0px)) 20px 0", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", minHeight: 44 }}>
        {/* La plupart sont des sportifs (17/11, Gildas) : le compte part en sportif, le coach passe par ce lien. */}
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Link href="/login" style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.6)", textDecoration: "none", padding: "6px 2px" }}>Connexion</Link>
          {!lockRole && <button type="button" onClick={() => { if (!busy) onPick(coach ? "athlete" : "coach"); }} style={{ border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 13, fontWeight: 800, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>{coach ? "Espace sportif" : "Espace coach"}</button>}
        </div>
      </div>
      {kicker && (
        <div style={{ position: "relative", zIndex: 4, display: "flex", justifyContent: "center", marginTop: 10, padding: "0 24px", pointerEvents: "none" }}>
          <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.78)", padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)" }}>{kicker}</span>
        </div>
      )}
      {/* Hauteur fixe (3 lignes) : l'anneau ne bouge pas quand le titre passe de 3 à 2 lignes (17/11, Gildas). */}
      <div style={{ position: "relative", zIndex: 4, height: 96, marginTop: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <h1 key={`t${i}`} className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, padding: "0 24px", maxWidth: 460, boxSizing: "border-box", textAlign: "center", textWrap: "balance" }}>
          {acct ? (coach ? <>Chaque séance, réglée <em style={{ fontStyle: "normal", color: "#ffb08a" }}>sur la forme de tes sportifs.</em></>
            : <>Chaque séance dans ta zone.<br /><em style={{ fontStyle: "normal", color: "#ffb08a" }}>Même les mauvais jours.</em></>) : sc.title}
        </h1>
      </div>
      {/* Anneau centré dans la place libre entre le titre et le bas d'écran réservé (carte + invite), toujours le même
          espace d'un écran à l'autre : il ne bouge pas, et descend sur les grands téléphones (17/11, Gildas : trop haut). */}
      <div style={{ position: "relative", zIndex: 3, flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px calc(min(150px, 17dvh) + 74px + env(safe-area-inset-bottom, 0px))" }}>
        <div ref={ringBoxRef} style={{ position: "relative", width: "100%", maxWidth: 460, padding: "58px 0 54px", boxSizing: "border-box", display: "flex", justifyContent: "center" }}>
          {/* Halo d'ambiance derrière l'anneau (POC Trame) : orange pour lever le pied, bleu pour pousser, vert dans la
              zone ; la couleur glisse d'un écran à l'autre. */}
          <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: "min(560px, 150vw)", aspectRatio: "1", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 0,
            backgroundColor: ringGlowFor(ring), opacity: 0.32, transition: `background-color .9s ${EASE}`,
            maskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)" }} />
          <div style={{ width: "100%", position: "relative" }}>
            <DecisionRing readOnly onChange={() => {}} fluid field fieldFade ambient hideLegend hideHint
              value={ring.v} zoneLow={ring.lo} zoneHigh={ring.hi} recoDir={ringDirFor(ring)}
              glow={ringGlowFor(ring)} breath={breathForDir(ringDirFor(ring))} celebrate={acct && phase >= 1} />
          </div>
          {tags.map(g => <GChip key={`${i}-${g.l}`} at={g.at} hot={g.hot} emoji={g.e} delay={reduced ? 0 : g.delay}>{g.l}</GChip>)}
        </div>
      </div>
      {!acct && (
          /* Toute la surface avance (un tiers à gauche revient en arrière), comme Opal. */
          <div style={{ position: "absolute", inset: "64px 0 0", zIndex: 7, display: "grid", gridTemplateColumns: "1fr 2fr" }}>
            <button type="button" aria-label="Précédent" onClick={() => go(-1)} style={{ border: 0, background: "none", cursor: "pointer" }} />
            <button type="button" aria-label="Suivant" onClick={() => go(1)} style={{ border: 0, background: "none", cursor: "pointer" }} />
          </div>
      )}
      {/* Bas d'écran posé en absolu : la carte, l'invite ou les boutons ne déplacent jamais l'anneau. Au compte, la
          séance s'allège (jetons en kg) puis disparaît pour laisser la place aux boutons. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: acct ? 5 : 8, pointerEvents: acct ? "auto" : "none", display: "flex", flexDirection: "column", gap: 10, paddingBottom: acct ? "calc(26px + env(safe-area-inset-bottom, 0px))" : 0 }}>
        <div ref={cardRef} aria-hidden style={{ width: "min(360px, calc(100% - 40px))", margin: "0 auto", height: acct ? (phase >= 2 ? 0 : room != null ? `min(310px, ${room}px)` : "min(150px, 17dvh)") : "min(150px, 17dvh)", overflow: "hidden", pointerEvents: "none",
        position: "relative", opacity: acct && phase >= 2 ? 0 : 1, transition: `opacity .4s ${EASE}, height .5s ${EASE}` }}>
        {/* Voile opaque (18/11, Gildas : l'essaim ne doit jamais passer sur la séance) : la carte reste pleine, assombrie
            en retrait, et son bas se fond dans la couleur du fond au lieu de devenir transparent. */}
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", transition: `background .5s ${EASE}`,
          background: `linear-gradient(180deg, rgba(7,10,13,${acct ? 0 : 0.5}) 0%, rgba(7,10,13,${acct ? 0 : 0.5}) ${acct ? 82 : 42}%, #070a0d 100%)` }} />
        <TodaySessionCard hideGauge hideShare statusLabel="Séance prévue" authorName="Toi" onEdit={() => {}}
          session={{ id: "vc-trame", user_id: "", date: "", name: TRAME_SESSION.name, notes: adjusted ? demoAdjustLines(TRAME_SESSION.lines, TRAME_PCT).join("\n") : original, target_difficulty: adjusted ? applyAutoregDifficulty(7, TRAME_PCT) : 7, duration: null, rpe: null, done: false, created_at: "" } as unknown as Session}
          flashOriginal={adjusted ? original : null} />
        </div>
        {!acct && (
          /* 20/11 (Gildas) : un vrai bouton plutôt que « Touche pour continuer », translucide pour laisser l'orange aux
             boutons du compte. Toute la surface reste touchable. */
          <div key={`h${i}`} className="vc-rise" style={{ padding: "0 20px calc(22px + env(safe-area-inset-bottom, 0px))", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", animationDelay: reduced ? undefined : ".6s" }}>
            <button type="button" className="vc-press" onClick={() => go(1)}
              style={{ pointerEvents: "auto", display: "block", width: "100%", height: 52, borderRadius: 999, border: "1.5px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
              Continuer
            </button>
          </div>
        )}
      {acct && (
        <div style={{ display: "grid", gap: 8, padding: "0 20px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {phase >= 2 && (
            <>
              {error && <div style={{ fontSize: 13, color: "#ffb3a7", textAlign: "center" }}>{error}</div>}
              <>
                  <button type="button" className="vc-press vc-rise" onClick={() => { if (!busy) onGoogle(); }} style={{ ...btn, background: "#fff", color: "#111" }}><GoogleG />Continuer avec Google</button>
                  {onApple && <button type="button" className="vc-press vc-rise" onClick={() => { if (!busy) onApple(); }} style={{ ...btn, background: "#000", color: "#fff" }}><AppleA />Continuer avec Apple</button>}
                  <button type="button" onClick={onEmail} style={{ border: 0, background: "none", color: "rgba(255,255,255,.8)", fontSize: 14, fontWeight: 700, padding: 8, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, textDecorationColor: "rgba(255,255,255,.35)", fontFamily: "inherit" }}>Continuer avec mon email</button>
                  <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,.42)", lineHeight: 1.4 }}>
                    En continuant, tu acceptes les <a href="https://www.theperfclub.com/conditions-generales/" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>conditions</a> et la <a href="https://www.theperfclub.com/politique-de-confidentialite/" target="_blank" rel="noreferrer" style={{ color: "inherit" }}>politique de confidentialité</a>.
                  </div>
              </>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
  );
}
function AppleA() {
  return <svg width="15" height="18" viewBox="0 0 384 512" aria-hidden><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>;
}

/* ── Carte de membre (inscription par email) ── */
export function VecuAccount({ name, email, setName, setEmail, onSubmit, onBack, saving, error, valid, sub = "Gratuit pour commencer. Tu choisis ta formule plus tard." }: {
  name: string; email: string; setName: (v: string) => void; setEmail: (v: string) => void;
  onSubmit: () => void; onBack?: () => void; saving: boolean; error: string | null; valid: boolean; sub?: string;
}) {
  const field: React.CSSProperties = { fontSize: 16, height: 50, borderRadius: 12, border: "1.5px solid rgba(255,255,255,.16)", padding: "0 13px", background: "rgba(255,255,255,.07)", color: "#fff", width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none" };
  const emailRef = useRef<HTMLInputElement>(null);
  /* 20/11 : le bouton grisé dit pourquoi (email à vérifier une fois quitté, prénom manquant). */
  const [emailLeft, setEmailLeft] = useState(false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const hint = email.trim() && emailLeft && !emailOk ? "Vérifie ton email." : emailOk && !name.trim() ? "Ajoute ton prénom." : null;
  return (
    <VecuFrame onBack={onBack} center
      sheet={
        <Sheet title="Bienvenue au club" sub={sub} subInline>
          <form noValidate onSubmit={e => { e.preventDefault(); if (valid && !saving) onSubmit(); }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 14 }}>
              <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>Prénom
                <input className="vc-in" value={name} onChange={e => setName(e.target.value)} placeholder="Théo" autoComplete="given-name" autoCapitalize="words" maxLength={40} enterKeyHint="next"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); emailRef.current?.focus(); } }}
                  style={{ ...field, borderColor: name.trim().length > 1 ? "#2fbf71" : "rgba(255,255,255,.16)" }} />
              </label>
              <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.65)" }}>Email
                <input ref={emailRef} className="vc-in" onBlur={() => setEmailLeft(true)} type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="theo@mail.com" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} enterKeyHint="go"
                  style={{ ...field, borderColor: valid ? "#2fbf71" : "rgba(255,255,255,.16)" }} />
              </label>
            </div>
            {hint && !error && <div role="status" style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 10 }}>{hint}</div>}
            {error && (
              <div style={{ fontSize: 13, color: "#ffb3a7", marginTop: 10 }}>
                {error}{" "}
                {/déjà|already|registered/i.test(error) && <Link href="/login" style={{ color: "#fff", fontWeight: 700, textDecoration: "underline" }}>Me connecter</Link>}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={!valid || saving} className="vc-press"
                style={{ display: "block", width: "100%", padding: 16, borderRadius: 999, border: 0, fontWeight: 800, fontSize: 16, fontFamily: "inherit", cursor: !valid || saving ? "default" : "pointer",
                  background: !valid || saving ? "rgba(255,255,255,.12)" : "linear-gradient(180deg,#f04a08,#d44000)", color: !valid || saving ? "rgba(255,255,255,.4)" : "#fff" }}>
                {saving ? "Création…" : "Entrer au club"}
              </button>
            </div>
          </form>
        </Sheet>
      }>
      <div style={{ display: "grid", placeItems: "center", gap: 16 }}>
        <div style={{ position: "relative", display: "grid", placeItems: "center", width: "100%" }}>
          <div aria-hidden style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(closest-side,rgba(255,90,20,.32),transparent)", filter: "blur(8px)" }} />
          <MemberCard name={name} typing />
        </div>
      </div>
    </VecuFrame>
  );
}


/* ── « Ce que tes réponses disent » : analyse, puis 3 messages glissables. ── */
export type FactInput = { freq: number; stagMonths: number | null; habits: VecuHabits; behaviors: string[]; fam: VecuFamily; goal: string };

export function Proof({ left }: { left?: boolean } = {}) {
  const faces = INTERVIEWS.filter(x => x.personas.includes("athlete")).slice(0, 3);
  return (
    <div className="vc-rise" style={{ display: "flex", alignItems: "center", justifyContent: left ? "flex-start" : "center", gap: 10, marginTop: 14, fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.35, animationDelay: ".3s" }}>
      <span style={{ display: "flex" }}>
        {faces.map((x, i) => <img key={x.slug} src={`/testimonials/${x.slug}.jpg`} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2px solid #0e1114", marginLeft: i ? -8 : 0, position: "relative", zIndex: 9 - i }} />)}
      </span>
      <span><b style={{ color: "#ffc83d" }}>★ 5,0</b> sur l&apos;App Store<br /><small style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)" }}>Plus de 5 000 points forme déjà faits</small></span>
    </div>
  );
}

/* Écran de transition (20/11, Gildas) : la note App Store en grand, entre « depuis quand » et l'écran des heures.
   Passe tout seul après 2,6 s, ou au tap. */
export function ProofScreen({ onNext, progress }: { onNext: () => void; progress: [number, number, number] }) {
  const reduced = useReducedMotion();
  useEffect(() => { const id = window.setTimeout(onNext, reduced ? 1200 : 2600); return () => window.clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <VecuFrame glow center progress={progress}>
      <button type="button" onClick={onNext} aria-label="Continuer"
        style={{ border: 0, background: "none", color: "#fff", fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%" }}>
        {/* Pas de visages (20/11) : les miniatures d'interviews ne rendent pas en grand. */}
        <span className="vc-rise" style={{ fontSize: 34, letterSpacing: 4, color: "#ffc83d", animationDelay: ".15s" }} aria-hidden>★★★★★</span>
        <span className="vc-rise" style={{ marginTop: 8, fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", animationDelay: ".25s" }}>5,0 sur l&apos;App Store</span>
        <span className="vc-rise" style={{ marginTop: 8, fontSize: 16, color: "rgba(255,255,255,.65)", animationDelay: ".4s" }}>Plus de 5 000 points forme déjà faits</span>
      </button>
    </VecuFrame>
  );
}

function Experts({ role = "athlete" }: { role?: "athlete" | "coach" }) {
  const xs = INTERVIEWS.filter(x => x.personas.includes(role)).slice(0, 6);
  return (
    <div className="vc-rise" style={{ marginTop: 28, animationDelay: "1.2s", width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw" }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 10 }}>Les experts en parlent</div>
      <div aria-hidden style={{ overflow: "hidden", maskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)" }}>
        <div style={{ display: "flex", gap: 10, width: "max-content", animation: "vcMarquee 18s linear infinite" }}>
          {[...xs, ...xs].map((v, i) => (
            <div key={i} style={{ width: 230, flexShrink: 0, textAlign: "left", background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 14, overflow: "hidden" }}>
              <img src={`/testimonials/${v.slug}.jpg`} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", display: "block" }} />
              <div style={{ padding: "9px 11px 11px" }}>
                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.55)", marginTop: 2, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CountUp({ to }: { to: number }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const f = (t: number) => { const p = Math.min(1, (t - t0) / 1200); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, reduced]);
  return <>{v}</>;
}

/* ── Cartes « Ce que ton bilan t'apprendra » (17/11, Gildas : « aussi beau que les cartes de la homepage ») : même
   écran que le bilan de l'app et la section bilan de la landing (photo du thème, grand chiffre, phrase, encadré),
   choisies selon SES réponses. Chiffres d'un sportif ThePerfClub : toujours marquées « Exemple ». ── */
type InsightCard = { key: string; photo: string; color: string; kicker: string; big: string; unit?: string; cap: string; box: React.ReactNode };
const boxRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: "rgba(255,255,255,.8)" };
function InsBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <>
      <div style={boxRow}><span>{label}</span><b style={{ color: "#fff", whiteSpace: "nowrap" }}>{value}</b></div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.12)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 4, background: color, transformOrigin: "left", animation: `vcBar .9s ${EASE} .3s both` }} /></div>
    </>
  );
}
function InsLever({ emoji, label, pill, pos, w, color }: { emoji: string; label: string; pill: string; pos: boolean; w: number; color: string }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12.5, fontWeight: 800 }}>
        <span>{emoji} {label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap", color: pos ? "#2f9e44" : "rgba(255,255,255,.55)", background: pos ? "rgba(47,158,68,.16)" : "rgba(255,255,255,.1)" }}>{pill}</span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: "rgba(255,255,255,.1)" }}>
        <span style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "rgba(255,255,255,.4)", transform: "translateX(-1px)" }} />
        <i style={{ position: "absolute", top: 0, height: "100%", borderRadius: 6, [pos ? "left" : "right"]: "50%", width: `${w}%`, background: color }} />
      </div>
    </>
  );
}
/* Personnalisées sur son point forme d'onboarding (17/11, Gildas) : quelles cartes, dans quel ordre (son signal le plus
   fort d'abord) et leurs chiffres (jours stressés et nuits courtes sur un mois, sa forme habituelle, son levier).
   Ce sont des projections tirées de ses réponses, pas des mesures : la pastille dit « Aperçu ». */
/* Profil « en forme » (17/11, Gildas : simulation en forme + voyage + repas lourd, rien de pertinent) : sa douleur
   n'est pas de forcer les mauvais jours, c'est d'être retenu les bons (écran 2 de la Trame). */
export function goodDays(input: FactInput): { fit: boolean; perMonth: number; sessions: number } {
  const form = habitsScore(input.habits) ?? 50;
  const sessions = Math.round(input.freq * 4.33);
  const share = Math.max(0.2, Math.min(0.6, (form - 50) / 60));
  return { fit: form >= 65, perMonth: Math.max(2, Math.round(sessions * share)), sessions };
}
/* Le constat du haut de l'écran : bons jours (en forme), charge (courbatures qui traînent, 4 séances ou plus), sinon
   « 1 séance sur R ». Aucune carte ne répète ce constat (17/11, Gildas : pas de doublon titre / carte). */
function headlineKind(input: FactInput): "good" | "load" | "low" {
  return goodDays(input).fit ? "good" : soreShare(input.habits) >= 0.45 && input.freq >= 4 ? "load" : "low";
}
function insightCardsFor(input: FactInput): InsightCard[] {
  const { habits, behaviors, fam, freq } = input;
  const ses = fam === "force" ? "séance de force" : fam === "endurance" ? "séance de qualité" : "séance";
  const pSleep = habits.sleep == null ? 0.3 : (10 - habits.sleep) / 10 * 0.8;
  const pStress = habits.stress == null ? 0.3 : habits.stress / 10 * 0.8;
  const pSore = soreShare(habits);
  const form = habitsScore(habits) ?? 70;
  const C: (InsightCard & { w: number })[] = [];

  /* Stress : jours stressés sur un mois, dont 2 sur 3 avec une séance plus dure que prévu (1 sur 3 les jours calmes). */
  const stressDays = Math.max(3, Math.round(30 * pStress)), stressHard = Math.max(2, Math.round(stressDays * 0.65));
  const calmDays = 30 - stressDays, calmHard = Math.round(calmDays * 0.3);
  if (pStress >= 0.35) C.push({ w: pStress, key: "stress", photo: "stress", color: "#ffb08a", kicker: "Ce qui durcit tes séances", big: String(stressHard), unit: `sur ${stressDays}`,
    cap: `jours stressés par mois où ta ${ses} sera plus dure que prévu.`,
    box: <><InsBar label="Jours stressés" value={`${stressHard} sur ${stressDays}`} pct={Math.round(stressHard / stressDays * 100)} color="#ff8a5c" /><InsBar label="Jours calmes" value={`${calmHard} sur ${calmDays}`} pct={Math.round(calmHard / Math.max(1, calmDays) * 100)} color="rgba(255,255,255,.45)" /></> });

  /* Sommeil : ses nuits courtes sur un mois. */
  const shortNights = Math.max(2, Math.round(30 * pSleep));
  if (pSleep >= 0.35 || behaviors.includes("late_sleep")) C.push({ w: pSleep + (behaviors.includes("late_sleep") ? 0.4 : 0), key: "sommeil", photo: "sommeil", color: "#b3c6ff", kicker: "Ton sommeil", big: String(shortNights), unit: "nuits courtes",
    cap: "par mois. Le lendemain, ta séance est plus dure que prévu 2 fois sur 3.",
    box: <><InsBar label="Après une nuit courte" value="2 fois sur 3" pct={67} color="#38bdf8" /><InsBar label="Après une bonne nuit" value="1 fois sur 4" pct={25} color="rgba(255,255,255,.45)" /></> });

  /* Soirée : sa forme habituelle, puis le lendemain. */
  if (behaviors.includes("social_out") || behaviors.includes("alcohol")) C.push({ w: 0.6, key: "soiree", photo: "soiree", color: "#d8b4ff", kicker: "Ce qui te fatigue", big: "−9",
    cap: `de forme le lendemain d'une soirée, sur ta forme habituelle de ${form}.`,
    box: <DayCurve norm={form} next={form - 9} after={form} color="#a855f7" normLabel="ta forme habituelle" /> });

  /* Courbatures qui traînent : les jours pour revenir après une grosse séance, selon son rythme. */
  if (pSore >= 0.3 && headlineKind(input) !== "load") C.push({ w: pSore, key: "recup", photo: "recup", color: "#9be8f0", kicker: "Ta récupération", big: pSore >= 0.45 ? "2" : "1", unit: pSore >= 0.45 ? "jours" : "nuit",
    cap: `pour récupérer d'une grosse séance. À ${freq} séances par semaine, ça se planifie.`,
    box: <DayFrise steps={pSore >= 0.45 ? [{ back: false }, { back: true }] : [{ back: true }]} color="#7fd6e0" /> });

  if (behaviors.includes("screen_late")) C.push({ w: 0.45, key: "ecran", photo: "ecran", color: "#9fd0ff", kicker: "Ce qui te coûte", big: "−35", unit: "min",
    cap: "de sommeil les soirs d'écran tard.",
    box: <><InsBar label="Soirs sans écran" value="7 h 25" pct={74} color="#9fd0ff" /><InsBar label="Soirs d'écran tard" value="6 h 50" pct={60} color="rgba(255,255,255,.45)" /></> });

  /* Une carte par comportement coché (ses mots d'abord) : écart de forme sur sa forme habituelle. */
  const formBox = (label: string, delta: number, color: string) => <><InsBar label="Ta forme habituelle" value={String(form)} pct={form} color="rgba(255,255,255,.45)" /><InsBar label={label} value={String(form - delta)} pct={form - delta} color={color} /></>;
  if (behaviors.includes("travel")) C.push({ w: 0.7, key: "voyage", photo: "voyage", color: "#d2d2d7", kicker: "Ce qui te décale", big: "−6",
    cap: "de forme les 2 jours qui suivent un voyage.", box: formBox("Après un voyage", 6, "#d2d2d7") });
  if (behaviors.includes("heavy_meal")) C.push({ w: 0.65, key: "repas", photo: "repas", color: "#9fd0ff", kicker: "Ce qui te pèse", big: "−4",
    cap: "de forme le lendemain d'un repas lourd.", box: formBox("Lendemain d'un repas lourd", 4, "#38bdf8") });
  if (behaviors.includes("caffeine_late")) C.push({ w: 0.6, key: "cafeine", photo: "cafeine", color: "#9fd0ff", kicker: "Ce qui te coûte", big: "−20", unit: "min",
    cap: "de sommeil les soirs de caféine tardive.",
    box: <><InsBar label="Soirs sans caféine" value="7 h 30" pct={75} color="#9fd0ff" /><InsBar label="Soirs de caféine tard" value="7 h 10" pct={66} color="rgba(255,255,255,.45)" /></> });
  if (behaviors.includes("tobacco")) C.push({ w: 0.55, key: "tabac", photo: "tabac", color: "#d2d2d7", kicker: "Ce qui te coûte", big: "−5",
    cap: "de forme les semaines où tu fumes plus.", box: formBox("Semaines où tu fumes plus", 5, "#d2d2d7") });

  /* Son levier, selon ce qui pèse le plus chez lui. */
  const lever = pStress >= pSleep && pStress >= pSore ? { photo: "meditation", emoji: "🧘‍♂️", label: "Méditation", gain: 18, other: ["📖", "Lecture", 9] as const }
    : pSore > pSleep ? { photo: "stretch", emoji: "🧘", label: "Stretching", gain: 24, other: ["🚶", "Marche détente", 11] as const }
    : { photo: "lecture", emoji: "📖", label: "Lecture", gain: 21, other: ["🧘", "Stretching", 8] as const };
  C.sort((x, y) => y.w - x.w);
  /* Au moins 3 cartes en tout pour illustrer le bilan (17/11, Gildas) : complétées par des cartes qui ne répètent ni le
     constat du haut ni une carte déjà là (charge, récupération, sommeil). */
  const fill: InsightCard[] = [
    { key: "charge", photo: "charge", color: "#a0ebcd", kicker: "Ta charge", big: "124", unit: "sur 141",
      cap: "jours dans ta zone de charge : tu t'entraînes dur, sans t'enterrer.",
      box: <><InsBar label="Dans ta zone" value="124 sur 141" pct={88} color="#a0ebcd" /><InsBar label="Au-dessus, alerte envoyée" value="9 sur 141" pct={6} color="rgba(255,255,255,.45)" /></> },
    ...(headlineKind(input) !== "load" ? [{ key: "recup", photo: "recup", color: "#9be8f0", kicker: "Ta récupération", big: "1", unit: "nuit",
      cap: `pour récupérer d'une grosse séance. À ${freq} séances par semaine, ça se planifie.`,
      box: <DayFrise steps={[{ back: true }]} color="#7fd6e0" /> }] : []),
  ];
  for (const f of fill) if (C.length < 2 && !C.some(c => c.key === f.key)) C.push({ ...f, w: 0 });
  const out: InsightCard[] = C.slice(0, 4);
  out.push({ key: "leviers", photo: lever.photo, color: "#9ff0ad", kicker: "Tes leviers", big: `+${lever.gain}`, unit: "min",
    cap: `de sommeil les soirs de ${lever.label.toLowerCase()}.`,
    box: <><InsLever emoji={lever.emoji} label={lever.label} pill={`Aide +${lever.gain} min`} pos w={Math.round(lever.gain * 1.9)} color="#2f9e44" /><InsLever emoji={lever.other[0]} label={lever.other[1]} pill={`Aide +${lever.other[2]} min`} pos w={Math.round(lever.other[2] * 1.9)} color="#2f9e44" /></> });
  return out;
}
function InsightCardView({ c }: { c: InsightCard }) {
  return (
    <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", background: "#070a0d", color: "#fff", display: "flex", flexDirection: "column", height: "100%", isolation: "isolate", boxShadow: "0 18px 44px rgba(0,0,0,.45)" }}>
      <PhotoBanner photo={c.photo} height="58%" />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 9, padding: "16px 18px 18px", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.88)", textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>{c.kicker}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 999, background: "rgba(0,0,0,.35)", color: "rgba(255,255,255,.8)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>Aperçu</span>
        </div>
        <div className="vc-ins-gap" style={{ flex: "1 1 60px", minHeight: 20, maxHeight: 96 }} />
        <div className="vc-ins-big" style={{ fontFamily: DISPLAY, fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: c.color, textShadow: "0 2px 18px rgba(0,0,0,.45)" }}>
          {c.big}{c.unit && <small style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0, opacity: 0.85 }}> {c.unit}</small>}
        </div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, lineHeight: 1.28, textWrap: "balance" } as React.CSSProperties}>{sent(c.cap)}</div>
        {/* Petits écrans (iPhone SE, 20/11) : le détail chiffré est masqué, le chiffre et la phrase suffisent. */}
        <div className="vc-ins-box" style={{ marginTop: "auto", background: "rgba(255,255,255,.06)", borderRadius: 14, padding: "11px 12px", flexDirection: "column", gap: 7 }}>{c.box}</div>
      </div>
    </div>
  );
}
function InsightCarousel({ input, cards: given }: { input?: FactInput; cards?: InsightCard[] }) {
  const cards = given ?? insightCardsFor(input!);
  const [k, setK] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => { const el = ref.current; if (!el) return; const c = el.children[0] as HTMLElement | undefined; const n = Math.round(el.scrollLeft / Math.max(1, (c?.offsetWidth ?? 1) + 12)); if (n !== k) setK(n); };
  return (
    <>
      <div ref={ref} onScroll={onScroll} className="vc-car vc-rise" style={{ margin: "0 -20px", padding: "0 20px 6px", scrollPaddingLeft: 20, animationDelay: ".35s" }}>
        {cards.map(c => <div key={c.key} style={{ width: "84%", maxWidth: 360, height: "clamp(330px, 44dvh, 440px)", scrollSnapAlign: "start" }}><InsightCardView c={c} /></div>)}
      </div>
      <div aria-hidden style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
        {cards.map((_, i) => <i key={i} style={{ width: i === k ? 18 : 6, height: 6, borderRadius: 99, background: i === k ? "#fff" : "rgba(255,255,255,.25)", transition: `width .2s ${EASE}` }} />)}
      </div>
    </>
  );
}

/* « J'analyse tes réponses… » : chargeur des écrans d'insight, jamais avant le déclic. */
export function FactLoader({ input, onDone, ms = 3600 }: { input: FactInput; onDone?: () => void; ms?: number }) {
  useEffect(() => { if (!onDone) return; const id = window.setTimeout(onDone, ms); return () => window.clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { freq, stagMonths, habits, behaviors } = input;
    const lines = [
      `${freq} séances par semaine`,
      stagMonths ? `Pas de progrès depuis ${stagPeriod(stagMonths)}` : "Tu progresses encore",
      habits.sleep != null ? `Sommeil ${SCALE_WORDS.sleep.labels[habits.sleep].toLowerCase()}, stress ${SCALE_WORDS.stress.labels[habits.stress ?? 5].toLowerCase()}` : null,
      behaviors.length ? behaviorPhrase(behaviors) : null,
    ].filter((x): x is string => !!x);
    return (
      <VecuFrame glow center>
        <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>J&apos;analyse tes réponses…</div>
          <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.12)", margin: "16px 0 18px", overflow: "hidden" }}>
            <i style={{ display: "block", height: "100%", width: "100%", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", transformOrigin: "left", animation: `vcBar 2.4s ${EASE} both` }} />
          </div>
          {lines.map((x, k) => <div key={k} className="vc-rise" style={{ fontSize: 14.5, color: "rgba(255,255,255,.7)", marginTop: 8, animationDelay: `${0.3 + k * 0.45}s` }}>{x}</div>)}
          {/* « Les experts en parlent » pendant le chargement (17/11, Gildas) : les vignettes des interviews ThePerfCast. */}
          <Experts />
        </div>
      </VecuFrame>
    );
  
}
export function FactScreen({ input, onBack, onNext, progress, cta = "Voir comment ça marche", noLoader }: { input: FactInput; onBack: () => void; onNext: () => void; progress: [number, number, number]; cta?: string; noLoader?: boolean }) {
  const [analysing, setAnalysing] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setAnalysing(false), 3600); return () => window.clearTimeout(t); }, []);
  const { freq, stagMonths, habits, behaviors, fam, goal } = input;
  const stag = stagMonths ?? 4.5;
  const H = effortHours(freq, stag, fam);
  const R = oneIn(habits);
  const load = headlineKind(input) === "load";
  const cap = goal.charAt(0).toUpperCase() + goal.slice(1);
  const verb = /^(tes|leurs) /.test(goal) ? "se jouent" : "se joue";

  if (analysing && !noLoader) return <FactLoader input={input} />;
  const kick: React.CSSProperties = { fontFamily: MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" };
  const fl: React.CSSProperties = { fontSize: 19, fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.01em", textAlign: "center", textWrap: "balance" };
  const big: React.CSSProperties = { fontSize: 52, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, margin: "10px 0 8px", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textAlign: "center" };
  void H;
  const gd = goodDays(input);
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>{cta}</Pill>}>
      <p className="vc-rise" style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#ffb08a", margin: "0 0 10px" }}>Ce que tes réponses disent</p>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {gd.fit ? (
          <div className="vc-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={big}>{gd.perMonth} séances</div>
            <div style={fl}>par mois où tu pourrais pousser plus.<br />{cap} {verb} aussi là.</div>
          </div>
        ) : load ? (
          <div className="vc-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={big}>{freq} séances</div>
            <div style={fl}>par semaine, sur des courbatures qui traînent.<br />Ta charge monte plus vite que ta récupération.</div>
          </div>
        ) : (
          <div className="vc-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={big}>1 séance sur {R}</div>
            <div style={fl}>tombe un jour de forme basse.<br />{cap} {verb} sur celles-là.</div>
          </div>
        )}
        <div className="vc-rise" style={{ ...kick, color: "#ffb08a", marginTop: 26, marginBottom: 12, animationDelay: ".3s" }}>Ce que ton bilan t&apos;apprendra</div>
      </div>
      <InsightCarousel input={input} />
    </VecuFrame>
  );
}

/* ── Le déclic : l'anneau de décision ajuste chaque séance type selon sa forme habituelle. ── */
export type VecuSession = { name: string; lines: string[]; planned: number; tag?: string };

function adjustFor(score: number, planned: number) {
  const baseline = syntheticBaselineFor(score);
  const sug = computeAutoregSuggestion(score, planned, baseline);
  const target = sug ? Math.round(planned + pctToPoints(sug.reco)) : planned;
  const zone = zoneRange(target, sug?.dir ?? "low");
  return { sug, zone, target };
}

/* Le déclic (17/11, Gildas, retour à la version carrousel) : l'anneau sur sa forme habituelle en haut, ses
   séances en carrousel dessous (plusieurs cas : glisser change l'état de l'anneau). Un seul geste :
   « Continuer » applique la décision de la séance affichée avec le mouvement de /today (TodayClient
   onApply : séance réécrite, l'anneau glisse jusqu'à la valeur appliquée, avant / après sur la carte, un
   jeton par ligne changée au relâchement de l'essaim), puis passe tout seul à l'écran suivant. Séance
   dans la zone : « Dans la zone », sans changement de charge. Pas de boutons Appliquer / Garder. */
/* Ses tags autour de l'anneau, tirés de ses réponses (habitudes + comportements) : la Trame avec SES données. */
function formTagsFor(habits: VecuHabits, behaviors: string[]): { e: string; l: string }[] {
  const T: { e: string; l: string; w: number }[] = [];
  if ((habits.sleep ?? 6) <= 5) T.push({ e: "😴", l: "Nuit courte", w: 10 - (habits.sleep ?? 6) });
  if ((habits.stress ?? 4) >= 6) T.push({ e: "🧠", l: "Stress", w: habits.stress ?? 4 });
  if ((habits.recovery ?? 6) <= 5) T.push({ e: "🦵", l: "Courbatures", w: 10 - (habits.recovery ?? 6) });
  VECU_BEHAVIORS.filter(b => behaviors.includes(b.key)).forEach(b => T.push({ e: b.emoji, l: b.label, w: 3 }));
  if (!T.length) return [{ e: "🌙", l: "Grosse nuit" }, { e: "🧘", l: "Corps frais" }, { e: "🔥", l: "Motivation" }];
  return T.sort((x, y) => y.w - x.w).slice(0, 3).map(({ e, l }) => ({ e, l }));
}

/* Le déclic en deux temps (17/11, Gildas). Temps 1 avec la grammaire de la Trame (anneau en grand, essaim en fond,
   halo, ses tags autour, sa séance en aperçu fondu en bas) mais avec SES données : sa forme habituelle, ses tags, la
   séance de son sport que l'anneau change. « Lancer la séance » : l'anneau glisse dans la zone, la séance s'allège (ou
   monte) et un jeton en kg part vers chaque ligne changée. Temps 2 : la carte passe en séance en direct (LiveSetsDemo). */
export function SessScreen({ sessions, score, onBack, onNext, progress, fromProgram, fam = "force", habits, behaviors = [], coachFor, message, honest, dir, onShown }: {
  sessions: VecuSession[]; score: number;
  onBack: () => void; onNext: () => void; progress: [number, number, number]; fromProgram?: string | null; fam?: VecuFamily;
  habits?: VecuHabits; behaviors?: string[];
  /* Version coach (18/11, Gildas : l'anneau plutôt que le radar, déjà vu) : la décision sur ce sportif, sa séance
     réécrite et le message prêt ; pas de séries en direct. */
  coachFor?: string; message?: string;
  /* v55 (20/11) : son vrai point forme du jour, enregistré. Jamais d'ajustement forcé : dans sa zone, on le dit, et
     « Et après une nuit courte ? » montre la version allégée (contraste, pas une décision). */
  honest?: boolean;
  /* Mesure (20/11) : le déclic s'affiche dans sa zone ou avec un ajustement. */
  onShown?: (inZone: boolean, pct: number) => void;
  /* Sens imposé par son point forme (20/11, Gildas : fatigué, on lui disait de pousser) : une suggestion du moteur dans
     l'autre sens est ignorée, l'ajustement part alors dans le bon sens. */
  dir?: "up" | "down";
}) {
  const reduced = useReducedMotion();
  const [contrast, setContrast] = useState(false);
  const [live, setLive] = useState(false);
  const [liveDone, setLiveDone] = useState(false);
  const [applied, setApplied] = useState(false);
  /* La carte se déplie au tap pour voir tous les exercices (18/11, Gildas), et d'office après « Lancer la séance ». */
  const [open, setOpen] = useState(false);
  const [readable, setReadable] = useState(false);
  const adj = sessions.map(x => adjustFor(score, x.planned));
  /* Il choisit sa séance de démo (18/11, Gildas : qu'il ait l'impression d'avoir la main, façon Opal) : feuille du bas
     à l'arrivée, un tap, rien de présélectionné. Une seule séance : on ne demande rien. */
  const [pick, setPick] = useState<number | null>(sessions.length > 1 ? null : 0);
  const k = pick ?? Math.max(0, adj.findIndex(x => !!x.sug));
  const s = sessions[k], a = adj[k];
  /* Toujours un ajustement à faire (18/11, Gildas : jamais « dans la zone » d'office). Si sa forme met la séance dans la
     zone, on part quand même d'en dehors : forme basse, la zone est sous la séance (on allège) ; en forme, au-dessus
     (on pousse). */
  const planned = s?.planned ?? 6;
  const sugOk = !!a?.sug && (!dir || (dir === "up" ? a.sug.reco > 0 : a.sug.reco < 0));
  const inZone = !!honest && !sugOk;
  const forced = !sugOk && !honest;
  const up = forced && (dir ? dir === "up" : score >= 65);
  const pct = sugOk ? a!.sug!.reco : (up ? 5 : -10);
  const lowZone = { lo: Math.max(1, planned - 3), hi: Math.max(1, planned - 2) };
  const zone = forced
    ? (up ? { lo: Math.min(10, planned + 1), hi: Math.min(10, planned + 2) } : lowZone)
    : inZone && contrast ? lowZone
    : { lo: a?.zone.zoneLow ?? planned - 1, hi: a?.zone.zoneHigh ?? planned + 1 };
  const tags = formTagsFor(habits ?? { sleep: null, stress: null, recovery: null }, behaviors);
  const from: RingState = { v: planned, lo: zone.lo, hi: zone.hi };
  const to: RingState = { v: forced ? (up ? zone.lo : zone.hi) : inZone ? planned : applyAutoregDifficulty(planned, pct), lo: zone.lo, hi: zone.hi };
  const ring = useRingTween(applied ? to : from, applied ? 1100 : 750, reduced);
  useEffect(() => { if (s) onShown?.(inZone, inZone ? 0 : pct); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const contrastNotes = inZone && contrast ? demoAdjustLines(s?.lines ?? [], -10).join("\n") : null;
  const cardRef = useRef<HTMLDivElement>(null);
  if (!s) return null;
  const original = s.lines.join("\n");
  const DIFF = (d: number) => d >= 8 ? "Très dure" : d >= 5 ? "Dure" : d >= 3 ? "Modérée" : "Légère";
  const chooser = pick == null && !applied ? (
    <Sheet title="Choisis ta séance de démo">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, maxHeight: "52dvh", overflowY: "auto" }}>
        {sessions.map((x, i) => (
          <button key={i} type="button" className="vc-press" onClick={() => setPick(i)}
            style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", color: INK, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 15.5, fontWeight: 800 }}>{x.name}</b>
              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: chargeColor(0.25 + 0.75 * x.planned / 10) }}>{DIFF(x.planned)}</span>
            </span>
            {x.tag && <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(212,64,0,.08)", color: ACCENT }}>{x.tag}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  ) : null;
  const go = () => {
    if (applied) return;
    setApplied(true);
    window.setTimeout(() => setOpen(true), reduced ? 0 : 900);
    if (pct && !reduced) window.setTimeout(() => {
      const knob = document.querySelector("[data-ring-knob]"), card = cardRef.current;
      if (!knob || !card) return;
      const box = card.getBoundingClientRect();
      Array.from(card.querySelectorAll("[data-ex-line='changed']")).filter(el => el.getBoundingClientRect().top < box.bottom - 30).slice(0, 4).forEach((el, n) => {
        const i = Number((el as HTMLElement).dataset.exIdx ?? n), src = s.lines[i] ?? "";
        const txt = loadDelta(src, demoAdjustLines(s.lines, pct)[i] ?? src) ?? `${pct < 0 ? "−" : "+"}${Math.abs(Math.round(pct))} %`;
        window.setTimeout(() => flyToken(knob, el, txt, pct < 0 ? "#d44000" : "#2f9e44"), n * 380);
      });
    }, 1500);
    /* Plus de passage automatique aux séries (18/11, Gildas : pas le temps de lire les ajustements) : le bouton
       « Voir la suite » s'active une fois les jetons posés, il lit à son rythme. */
    window.setTimeout(() => setReadable(true), reduced ? 300 : pct ? 2800 : 1200);
  };
  return (
    <VecuFrame onBack={applied ? () => {} : onBack} progress={progress} noScroll center={live} sheet={chooser}
      foot={chooser ? undefined : live ? <Pill onClick={onNext} disabled={!liveDone}>{coachFor ? "Voir ce que ton groupe y gagne" : honest ? "Continuer" : "Voir ce que tu y gagnes"}</Pill>
        : <>
          {/* 20/11, Gildas : dire qu'il garde la main sur son programme et ses séances. */}
          {!coachFor && !open && <div style={{ textAlign: "center", fontSize: 12.5, lineHeight: 1.4, color: "rgba(255,255,255,.6)", margin: "0 0 10px" }}>Personnalise ton programme et tes séances dans l&apos;app.</div>}
          {/* « Et après une nuit courte ? » retiré (20/11, Gildas : trop de complexité). Dans sa zone, on le dit, c'est tout. */}
          {inZone ? <Pill onClick={() => setLive(true)}>Lancer la séance</Pill>
            : applied ? (coachFor ? <Pill onClick={() => setLive(true)} disabled={!readable}>Voir tout ton groupe</Pill> : <Pill onClick={() => setLive(true)} disabled={!readable}>Voir la suite</Pill>)
            : <Pill onClick={go}>{coachFor ? `Valider la décision pour ${coachFor}` : "Lancer la séance"}</Pill>}
        </>}>
      <h2 key={live ? "l" : "a"} className="vc-rise" style={{ position: "relative", zIndex: 4, fontFamily: DISPLAY, fontSize: live ? 30 : 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, margin: live ? "0 0 20px" : "6px 0 0", textAlign: "center", textWrap: "balance" }}>
        {live ? (coachFor ? <>Et chaque sportif,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>dans sa zone.</em></>
          : <>Ta séance suit ta forme,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>jusqu&apos;à la dernière série.</em></>)
          : coachFor ? <>Une décision prête par sportif,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>avant l&apos;échauffement.</em></>
          : inZone ? (contrast ? <>Après une nuit courte,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>elle s&apos;allégerait.</em></>
            : <>Ta séance est bonne<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>telle quelle aujourd&apos;hui.</em></>)
          : <>Ta séance se règle sur ta forme,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>avant l&apos;échauffement.</em></>}
      </h2>
      {live ? (coachFor
        /* Coach, 2e temps (18/11, Gildas : l'équivalent des séries du sportif) : le radar de son groupe, toutes les
           décisions validées, chaque sportif glisse dans la bande. */
        ? <div className="vc-rise"><CoachAlign onDone={() => setLiveDone(true)} /></div>
        : <div className="vc-rise"><LiveSetsDemo fam={fam} onDone={() => setLiveDone(true)} /></div>) : <>
        {/* L'anneau en grand, ses tags autour, l'essaim et le halo derrière (comme la Trame). */}
        <div style={{ position: "relative", zIndex: 3, flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 460, padding: "52px 0 46px", boxSizing: "border-box", display: "flex", justifyContent: "center" }}>
            <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: "min(560px, 150vw)", aspectRatio: "1", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 0,
              backgroundColor: ringGlowFor(ring), opacity: 0.32, transition: `background-color .9s ${EASE}`,
              maskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)" }} />
            <div className="vc-sess-ring" style={{ position: "relative" }}>
              <DecisionRing readOnly onChange={() => {}} fluid field fieldFade ambient hideLegend hideHint
                value={ring.v} zoneLow={ring.lo} zoneHigh={ring.hi} recoDir={ringDirFor(ring)}
                glow={ringGlowFor(ring)} breath={breathForDir(ringDirFor(ring))} celebrate={applied} />
            </div>
            {!applied && pick != null && tags.map((g, i) => <GChip key={g.l} at={TAG_POS[i]} emoji={g.e} delay={reduced ? 0 : 0.35 + i * 0.2}>{g.l}</GChip>)}
          </div>
        </div>
        {/* Sa séance, en aperçu fondu en bas ; nette et réécrite quand il lance. */}
        {pick != null && <div ref={cardRef} role="button" tabIndex={0} aria-expanded={open} aria-label={open ? "Replier la séance" : "Voir toute la séance"}
          onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
          style={{ position: open ? "absolute" : "relative", left: open ? 20 : undefined, right: open ? 20 : undefined, bottom: open ? 0 : undefined, zIndex: open ? 6 : 4, flexShrink: 0,
            width: open ? undefined : "min(360px, 100%)", maxWidth: 360, margin: "0 auto", height: open ? "auto" : "min(210px, 25dvh)", maxHeight: open ? "min(62dvh, 560px)" : undefined, overflow: open ? "auto" : "hidden", cursor: "pointer",
            borderRadius: 18, transition: `height .45s ${EASE}`, boxShadow: open ? "0 -18px 44px rgba(0,0,0,.5)" : undefined }}>
          {/* Voile opaque au lieu de la transparence : l'essaim ne passe jamais sur la séance. */}
          {!open && <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", transition: `background .5s ${EASE}`,
            background: `linear-gradient(180deg, rgba(7,10,13,${applied ? 0 : 0.45}) 0%, rgba(7,10,13,${applied ? 0 : 0.45}) 50%, #070a0d 100%)` }} />}
          <TodaySessionCard hideGauge hideShare statusLabel={coachFor ? `Pour ${coachFor}` : s.tag ? "Ton point faible" : fromProgram ? fromProgram : "Ta séance"} authorName="Toi" onEdit={() => {}}
            session={{ id: "vc-sess", user_id: "", date: "", name: s.name, notes: contrastNotes ?? (applied && pct ? demoAdjustLines(s.lines, pct).join("\n") : original), target_difficulty: contrastNotes ? applyAutoregDifficulty(s.planned, -10) : applied ? to.v : s.planned, duration: null, rpe: null, done: false, created_at: "" } as unknown as Session}
            flashOriginal={contrastNotes || (applied && pct) ? original : null} />
          {coachFor && applied && message && (
            <div className="vc-rise" style={{ marginTop: 10, borderRadius: "18px 18px 18px 5px", padding: "11px 13px", background: "#fff", color: INK, fontSize: 13.5, lineHeight: 1.45, animationDelay: "1.4s" }}>
              <b style={{ display: "block", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#2a8045", marginBottom: 3 }}>Message prêt pour {coachFor}</b>{message}
            </div>
          )}
        </div>}
      </>}
    </VecuFrame>
  );
}

/* ── Mot du fondateur, juste après le déclic. Texte du parcours à écrire par Gildas. ── */
export const FOUNDER_STORY: string | null = null;
export function NoteScreen({ first, onBack, onNext, progress }: { first: string; onBack: () => void; onNext: () => void; progress: [number, number, number] }) {
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>Voir la différence</Pill>}>
      <div className="vc-rise" style={{ background: "#fbf7f1", color: "#1d2226", borderRadius: 20, padding: "20px 20px 16px", boxShadow: "0 18px 50px rgba(0,0,0,.35)", transform: "rotate(-.6deg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span aria-hidden style={{ width: 44, height: 44, borderRadius: "50%", background: ACCENT, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 18, flex: "none" }}>G</span>
          <span><b style={{ display: "block", fontSize: 15 }}>Gildas</b><small style={{ fontSize: 12, color: MUTED }}>Fondateur de ThePerfClub</small></span>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 15.5, lineHeight: 1.5 }}>{first ? `${first}, c'est Gildas.` : "C'est Gildas."}</p>
        {FOUNDER_STORY && <p style={{ margin: "0 0 10px", fontSize: 15.5, lineHeight: 1.5 }}>{FOUNDER_STORY}</p>}
        <p style={{ margin: "0 0 10px", fontSize: 15.5, lineHeight: 1.5 }}>Ce que tu viens de voir, c&apos;est ce qui manquait à mon programme. Essaie-le 14 jours sur tes vraies séances.</p>
        <div style={{ fontFamily: '"Segoe Script","Bradley Hand","Snell Roundhand",cursive', fontSize: 24, color: ACCENT, textAlign: "right", marginTop: 4 }}>Gildas</div>
      </div>
    </VecuFrame>
  );
}

/* ── Avant / Après en barres, devant l'écran de la séance en direct (téléphone de trois quarts). ── */
/* Avant / Après en séries (17/11, Gildas : le principe du POC « Ta semaine », ligne pointillée du programme et barres
   qui glissent, appliqué aux séries, avec les composants de la séance en direct : cases de série de LiveSessionHost
   (faite = sombre ✓, ajustée = orange + valeur barrée), jauge de ressenti à 5 niveaux (chargeColor), jeton flyToken
   vers la série recalée). La ligne « Ton programme » dit seule ce que serait la séance sans ThePerfClub.
   Recalage comme liveSets : −5 % plus dur, +2,5 % plus facile (allure : +10 s / −5 s), appliqué à toutes les séries
   restantes. Ressenti toujours écrit en mots (daltonisme). */
type AvFeel = "dur" | "prevu" | "facile";
const AV_FEELS: AvFeel[] = ["facile", "dur"];
const AV_WORD: Record<AvFeel, string> = { dur: "Plus dur", prevu: "Comme prévu", facile: "Plus facile" };
const AV_GAUGE: Record<AvFeel, number> = { facile: 1, prevu: 2, dur: 3 };
const GAUGE_ORDER = ["Beaucoup plus facile", "Plus facile", "Comme prévu", "Plus dur", "Beaucoup plus dur"];
export function AvapScreen({ onBack, onNext, progress, fam = "force" }: { onBack: () => void; onNext: () => void; progress: [number, number, number]; photo?: string | null; fam?: VecuFamily }) {
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>Voir ce que tu y gagnes</Pill>}>
      <h2 className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, textAlign: "center", margin: "0 0 20px", textWrap: "balance" } as React.CSSProperties}>
        Ta séance suit ta forme,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>jusqu&apos;à la dernière série.</em>
      </h2>
      <LiveSetsDemo fam={fam} />
    </VecuFrame>
  );
}
/* Démo des séries (carte d'exercice + jauge de ressenti), lancée quand `start` passe à vrai. Sert au 2e temps du
   déclic (« Pendant la séance ») et à l'aperçu AvapScreen. */
export function LiveSetsDemo({ fam = "force", start = true, onDone }: { fam?: VecuFamily; start?: boolean; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const pace = fam === "endurance";
  /* En % de la charge max (18/11, Gildas : on ne connaît pas son niveau). */
  const plan = pace ? 260 : 80, N = 3;
  const vals: number[] = [plan];
  AV_FEELS.forEach((f, i) => {
    const v = vals[i];
    vals.push(f === "dur" ? (pace ? v + 10 : v - 5) : f === "facile" ? (pace ? v - 5 : v + 2.5) : v);
  });
  const fmt = (v: number) => pace ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}` : `${String(v).replace(".", ",")} %`;
  /* Dans les cases, le chiffre seul (l'unité est dans le titre) : « 102,5 kg » passait sur deux lignes. */
  const num = (v: number) => pace ? fmt(v) : String(v).replace(".", ",");
  const badge = (f: AvFeel) => f === "prevu" ? null : pace ? (f === "dur" ? "+10 s" : "−5 s") : (f === "dur" ? "−5 %" : "+2,5 %");
  /* s = séries faites. Les séries restantes prennent la dernière valeur recalée (comme en séance). */
  const [s, setS] = useState(0);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (!start) return;
    if (reduced) { setS(AV_FEELS.length); onDone?.(); return; }
    const ts = AV_FEELS.map((_, i) => window.setTimeout(() => setS(i + 1), 1100 + i * 1600));
    ts.push(window.setTimeout(() => onDone?.(), 1100 + AV_FEELS.length * 1600));
    return () => ts.forEach(clearTimeout);
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [reduced, start]);
  useEffect(() => {
    if (!s || reduced) return;
    const f = AV_FEELS[s - 1], b = badge(f), to = cellRefs.current[s], from = gaugeRef.current;
    if (b && to && from) flyToken(from, to, b, f === "dur" ? "#d44000" : "#2f9e44", "center");
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [s]);
  const shown = (j: number) => vals[Math.min(j, s)];
  const lastFeel = s ? AV_FEELS[s - 1] : null;
  return (
    <>
      {/* La carte d'exercice de la séance en direct. */}
      <div className="vc-pop" style={{ background: "#fff", color: INK, borderRadius: 22, padding: "14px 14px 12px", boxShadow: "0 18px 44px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.01em" }}>{pace ? "Fractionné 1 000 m" : "Back squat"}<span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}> · {pace ? "allure /km" : "% de ta max"}</span></div>
          </div>
        </div>
        {/* Cases de série (LiveSessionHost). */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${N}, 1fr)`, gap: 8, marginTop: 14 }}>
          {Array.from({ length: N }, (_, j) => {
            const v = shown(j), done = j < s, cur = j === s && s < N, changed = v !== plan;
            const sign = changed ? ((pace ? v < plan : v > plan) ? " ↑" : " ↓") : "";
            return (
              <div key={j} ref={el => { cellRefs.current[j] = el; }}
                style={{ minHeight: 72, padding: "8px 4px", borderRadius: 14, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: MONO,
                  background: done ? "#1f2428" : changed ? "rgba(212,64,0,.10)" : "#f4f4f2", color: done ? "#fff" : changed ? ACCENT : "#1f2428",
                  border: cur ? `2px solid ${INK}` : done && changed ? `2px solid ${ACCENT}` : "1.5px solid transparent", transition: "background .3s, color .3s" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: done ? "rgba(255,255,255,.75)" : changed ? ACCENT : "#8a8f94" }}>{done ? "✓ " : ""}S{j + 1}{sign}</span>
                {changed && <s style={{ fontSize: 11, opacity: 0.6 }}>{num(plan)}</s>}
                <span style={{ fontSize: 18, fontWeight: 800, whiteSpace: "nowrap" }}>{num(v)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* Jauge de ressenti de la séance en direct : la réponse de la série qu'il vient de finir. */}
      <div ref={gaugeRef} className="vc-rise" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", background: "#1a1f24", borderRadius: 18, border: "1px solid rgba(255,255,255,.12)", animationDelay: ".3s" }}>
        <div style={{ textAlign: "center", fontSize: 13.5, fontWeight: 900, minHeight: 18 }}>
          {lastFeel ? <>Série {s} : {AV_WORD[lastFeel]}</> : <>Série 1 faite ? C&apos;était…</>}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {GAUGE_ORDER.map((w, k) => {
            const sel = lastFeel ? AV_GAUGE[lastFeel] : -1, filled = sel >= 0 && k <= sel, col = chargeColor(0.15 + 0.85 * (k / 4));
            return <span key={w} aria-hidden style={{ flex: 1, height: 34, borderRadius: 8, boxSizing: "border-box", border: `1px solid ${filled ? col : "rgba(255,255,255,.16)"}`, background: filled ? col : "rgba(255,255,255,.08)",
              outline: sel < 0 && k === 2 ? "1.5px dashed rgba(255,255,255,.85)" : "none", outlineOffset: 3, boxShadow: k === sel ? "0 0 0 2px #fff" : "none", transition: "background .15s, box-shadow .15s" }} />;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
          <span>+ facile</span><span style={{ color: "rgba(255,255,255,.85)" }}>Comme prévu</span><span>+ dur</span>
        </div>
      </div>
    </>
  );
}

/* ── Ce que tu gagnes (façon Opal). ── */
export function PathScreen({ first, input, onBack, onNext, progress }: { first: string; input: FactInput; onBack: () => void; onNext: () => void; progress: [number, number, number] }) {
  const R = oneIn(input.habits);
  const H = effortHours(input.freq, input.stagMonths ?? 4.5, input.fam);
  /* Gains (18/11, Gildas : orientés frustration, puis soulagement, plus le mécanisme) : le plateau, forcer à vide,
     ce qui le freine (ses comportements, avec leur article). */
  const DE: Record<string, string> = { late_sleep: "des couchers tardifs", screen_late: "de l'écran tard", alcohol: "de l'alcool", social_out: "des sorties",
    caffeine_late: "de la caféine tard", heavy_meal: "des repas lourds", travel: "des voyages", tobacco: "du tabac" };
  const beh = input.behaviors.filter(k => DE[k]).slice(0, 2).map(k => DE[k]);
  const gd = goodDays(input);
  const rows: [string, string, string][] = [
    input.stagMonths
      ? ["📈", "Tu sors du plateau", "Tes séances poussent les jours où ton corps suit. C'est là que tu progresses."]
      : ["📈", "Tu continues de progresser", "Tes séances poussent les jours où ton corps suit. Ta progression ne s'arrête pas."],
    gd.fit
      ? ["🛡️", "Tes bons jours, enfin poussés", `${gd.perMonth} séances par mois où ta charge peut monter.`]
      : ["🛡️", "Fini de forcer à vide", `1 séance sur ${R} tombe un jour de forme basse. Elle s'ajuste, au lieu de te coûter la semaine.`],
    ["🧭", "Identifie ce qui te freine", beh.length ? `Chaque lundi, le poids réel ${beh.join(" et ")} sur tes séances.` : "Chaque lundi, le poids réel de ton sommeil, de ton stress et de tes courbatures sur tes séances."],
  ];
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>Faire compter mes séances</Pill>}>
      <h2 className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, textAlign: "center", margin: 0, textWrap: "balance" }}>
        {first ? <>{first},<br /></> : null}{input.stagMonths ? `${first ? "tes" : "Tes"} ${H} heures` : `${first ? "tes" : "Tes"} heures d'entraînement`}<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>vont enfin compter.</em>
      </h2>
      <div style={{ marginTop: 26, display: "grid", gap: 20 }}>
        {rows.map(([e, b, t], i) => (
          <div key={b} className="vc-rise" style={{ display: "flex", gap: 14, alignItems: "flex-start", animationDelay: `${0.2 + i * 0.16}s` }}>
            <span aria-hidden style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 12, background: "rgba(255,90,20,.14)", display: "grid", placeItems: "center", fontSize: 18 }}>{e}</span>
            <div><b style={{ fontSize: 16.5 }}>{b}</b><p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,.62)" }}>{sent(t)}</p></div>
          </div>
        ))}
      </div>
    </VecuFrame>
  );
}

/* ── 14 jours : 2 ou 3 jours avant, par email et par notification (le choix pousse à accepter les notifications). ── */
/* Écran verrouillé d'iPhone (17/11, Gildas : « simule un vrai téléphone ») : coque, Dynamic Island, barre d'état,
   cadenas, date et heure façon iOS, notification en verre dépoli avec la vraie icône de l'app. Le bas du téléphone
   se fond sous la feuille. */
function LockPhone({ date, days, coach = false }: { date: string; days: number; coach?: boolean }) {
  return (
    <div aria-hidden className="vc-lock" style={{ position: "relative", width: 250, height: 330, overflow: "hidden", maskImage: "linear-gradient(180deg,#000 72%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 72%,transparent)" }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 520, borderRadius: 46, padding: 7, background: "linear-gradient(145deg,#4a4f55,#16191c 38%,#2c3035)", boxShadow: "0 30px 70px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.1)" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 39, overflow: "hidden", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif" }}>
          {/* Fond d'écran : la photo du présignup, floutée et assombrie. */}
          <div style={{ position: "absolute", inset: -20, backgroundImage: "url(/onboarding/vecu/p_sprint.webp)", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(2px) saturate(.9) brightness(.55)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(20,30,48,.45),rgba(212,64,0,.22) 70%,rgba(0,0,0,.5))" }} />
          <div style={{ position: "absolute", top: 9, left: "50%", transform: "translateX(-50%)", width: 74, height: 22, borderRadius: 14, background: "#000" }} />
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px 0", fontSize: 11, fontWeight: 600 }}>
            <span />
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <svg width="15" height="10" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#fff" /><rect x="5" y="5" width="3" height="7" rx="1" fill="#fff" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill="#fff" /><rect x="15" y="0" width="3" height="12" rx="1" fill="#fff" /></svg>
              <svg width="20" height="10" viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.5" stroke="#fff" opacity=".5" fill="none" /><rect x="2" y="2" width="17" height="8" rx="2" fill="#fff" /><rect x="24.5" y="4" width="2" height="4" rx="1" fill="#fff" opacity=".5" /></svg>
            </span>
          </div>
          <div style={{ position: "relative", textAlign: "center", marginTop: 14 }}>
            <svg width="11" height="14" viewBox="0 0 11 14" style={{ display: "block", margin: "0 auto 6px", opacity: 0.9 }}><rect x="0.5" y="6" width="10" height="7.5" rx="2" fill="#fff" /><path d="M2.7 6V4.2a2.8 2.8 0 0 1 5.6 0V6" stroke="#fff" strokeWidth="1.4" fill="none" /></svg>
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.92 }}>{date}</div>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 2, fontVariantNumeric: "tabular-nums", textShadow: "0 2px 12px rgba(0,0,0,.25)" }}>9:41</div>
          </div>
          <div key={days} className="vc-pop" style={{ position: "relative", margin: "26px 10px 0", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 20, background: "rgba(245,245,250,.28)", backdropFilter: "blur(24px) saturate(1.6)", WebkitBackdropFilter: "blur(24px) saturate(1.6)", boxShadow: "0 6px 20px rgba(0,0,0,.18)", animationDelay: ".5s" }}>
            <img src="/apple-touch-icon.png" alt="" width={34} height={34} style={{ borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.3, textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><b style={{ fontWeight: 600 }}>ThePerfClub</b><span style={{ fontSize: 11, opacity: 0.7 }}>maintenant</span></div>
              <div style={{ opacity: 0.95 }}>Il te reste {days} jours d&apos;essai. {coach ? "Ton groupe : 31 séances ajustées cette semaine." : "Ton bilan de la semaine t'attend."}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrialScreen({ onBack, progress, onEnable, busy, coach = false }: {
  onBack: () => void; progress: [number, number, number];
  onEnable: (days: 2 | 3) => void; busy?: boolean; coach?: boolean;
}) {
  const [days, setDays] = useState<2 | 3>(2);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const row = (n: 2 | 3) => {
    const on = days === n;
    return (
      <button key={n} type="button" role="radio" aria-checked={on} onClick={() => setDays(n)} className="vc-press"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "12px 14px", marginTop: 8, borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#fff",
          border: on ? "2px solid #ffb08a" : "1.5px solid rgba(255,255,255,.12)", background: on ? "rgba(240,74,8,.22)" : "rgba(255,255,255,.06)" }}>
        <span><b style={{ display: "block", fontSize: 14.5 }}>{n} jours avant</b><small style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{cap(dayLabel(14 - n))}</small></span>
        <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", border: on ? "6px solid #ffb08a" : "2px solid rgba(255,255,255,.35)", boxSizing: "border-box" }} />
      </button>
    );
  };
  return (
    <VecuFrame glow onBack={onBack} progress={progress}
      sheet={
        <Sheet>
          <div role="radiogroup" aria-label="Quand te prévenir">{row(2)}{row(3)}</div>
          <div style={{ marginTop: 14 }}><Pill onClick={() => { if (!busy) onEnable(days); }}>{busy ? "…" : "Me prévenir avant"}</Pill></div>
        </Sheet>
      }>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 8 }}>
        <h2 className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0, textWrap: "balance" }}>
          14 jours offerts.<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>On te prévient avant la fin.</em>
        </h2>
        <div className="vc-rise" style={{ marginTop: 18, width: "100%", display: "flex", justifyContent: "center", animationDelay: ".1s" }}>
          <LockPhone date={cap(dayLabel(14 - days))} days={days} coach={coach} />
        </div>
      </div>
    </VecuFrame>
  );
}

/* ── Apple Santé / Santé Connect (apps) : ce que ça apporte, puis la vraie demande. ── */
export function HealthScreen({ appName, onConnect, onSkip, onBack, progress, busy }: {
  appName: string; onConnect: () => void; onSkip: () => void; onBack: () => void; progress: [number, number, number]; busy?: boolean;
}) {
  const bars = [62, 48, 70, 40, 55, 66, 38, 58, 44, 72, 50, 60, 36, 64];
  return (
    <VecuFrame onBack={onBack} progress={progress} center
      sheet={
        <Sheet title="Ton bilan lit aussi tes 30 dernières nuits" sub="Ta montre et ton téléphone ont déjà tout noté. On compare avec ton ressenti.">
          <div style={{ marginTop: 16 }}><Pill onClick={() => { if (!busy) onConnect(); }}>{busy ? "…" : `Connecter ${appName}`}</Pill></div>
          <button type="button" onClick={onSkip} style={{ display: "block", margin: "10px auto 0", border: 0, background: "none", color: "rgba(255,255,255,.7)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>Plus tard</button>
        </Sheet>
      }>
      <div className="vc-pop" style={{ width: 260, margin: "0 auto", background: "rgba(14,16,19,.86)", borderRadius: 24, padding: 18, boxShadow: "0 30px 70px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)" }}>
        <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>{appName} · 30 dernières nuits</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70, marginTop: 12 }}>
          {bars.map((h, i) => <i key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: recupColor(0.25 + 0.75 * h / 72), transformOrigin: "bottom", animation: `vcGrow .6s ${EASE} ${i * 40}ms both` }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5 }}><span style={{ color: "rgba(255,255,255,.6)" }}>Sommeil</span><b>chaque nuit</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12.5 }}><span style={{ color: "rgba(255,255,255,.6)" }}>FC au repos</span><b>chaque jour</b></div>
      </div>
    </VecuFrame>
  );
}

/* ── Feuille « l'app » après le déclic (web) : badge du store sur téléphone, QR sur ordinateur. ── */
export function AppSheet({ phone, qrSrc, storeHref, badgeSrc, badgeAlt, badgeH, onStore, onSkip }: {
  phone: "iphone" | "android" | null; qrSrc: string; storeHref?: string; badgeSrc?: string; badgeAlt?: string; badgeH?: number;
  onStore: () => void; onSkip: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483150, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(7,10,13,.45)" }}>
      <div role="dialog" aria-label="Ta prochaine séance sur l'app" style={{ width: "100%", maxWidth: 520, background: "#fff", color: INK, borderRadius: "22px 22px 0 0", padding: "10px 20px max(18px, env(safe-area-inset-bottom))", boxShadow: "0 -10px 30px rgba(0,0,0,.35)", animation: `vcSheet .42s cubic-bezier(.32,.72,0,1)` }}>
        <div style={{ width: 36, height: 4, borderRadius: 9, background: "rgba(0,0,0,.14)", margin: "0 auto 14px" }} />
        <div style={{ display: phone ? "block" : "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: 16, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {!phone && <img src={qrSrc} alt="QR code pour télécharger l'app" width={96} height={96} style={{ borderRadius: 8 }} />}
          <div>
            <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Ta prochaine séance t&apos;attend sur l&apos;app</div>
            <div style={{ fontSize: 14.5, color: "#5d6166", lineHeight: 1.45, marginTop: 4 }}>
              {phone ? "Installe l'app, puis touche le lien qu'on vient de t'envoyer par email : tu reprends là où tu en es." : "Scanne pour installer l'app, puis touche sur ton téléphone le lien qu'on vient de t'envoyer par email."}
            </div>
          </div>
        </div>
        {phone && storeHref && badgeSrc && (
          <a href={storeHref} onClick={e => { e.preventDefault(); onStore(); }} aria-label={badgeAlt} style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badgeSrc} alt={badgeAlt} height={badgeH} style={{ height: badgeH, width: "auto" }} />
          </a>
        )}
        <button type="button" onClick={onSkip} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#8a8f94", textDecoration: "underline" }}>Continuer sur le web</button>
      </div>
    </div>
  );
}

/* ── Paiement v4 (18/11, Gildas ; POC https://claude.ai/artifact/E4xq2Lyjq4KUGvNMoc7m95) : un seul visuel qui referme le
   parcours, l'anneau de la Trame. Il part de son état (au-dessus de la zone en forme basse, en dessous en forme), glisse
   dans la zone, l'essaim se calme, puis la promesse (prénom + objectif) et 4 coches de réassurance. Dessous, l'offre :
   2 formules, annuel coché, la frise d'essai en une ligne. Même écran sur le web (puis le formulaire Stripe) et dans
   les apps (achat App Store / Google Play intégré, prix facturé en gros, mentions 3.1.2). ── */
/* Les gains de l'ancien « Ce que tu gagnes » (retiré le 20/11) portés ici, puis ce qui est inclus. */
const PAY_CHECKS = ["Tu sors du plateau", "Fini de forcer à vide", "Chaque lundi, ce qui te freine", "Programmes, séances et tests inclus"];
export function PayScreen({ first, stag = true, hours, fit, billing, setBilling, onPay, onClose, onView, native }: {
  first: string; goal?: string; stag?: boolean; hours?: number; fit: boolean; billing: "monthly" | "annual"; setBilling: (b: "monthly" | "annual") => void;
  onPay: () => void; onClose: () => void; onView?: () => void;
  /* Apps : le panneau d'achat du store remplace le bouton, onPay est appelé après l'achat. */
  native?: React.ReactNode;
}) {
  useEffect(() => { onView?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = useReducedMotion();
  const FROM: RingState = fit ? { v: 4, lo: 7, hi: 9 } : { v: 7, lo: 2, hi: 4 };
  const TO: RingState = fit ? { v: 8, lo: 7, hi: 9 } : { v: 3, lo: 2, hi: 4 };
  const [arrived, setArrived] = useState(reduced);
  const [shown, setShown] = useState(reduced);
  /* 20/11 (Gildas, hiérarchie) : la promesse d'abord, avec l'anneau ; les formules ensuite. */
  const [offer, setOffer] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const a = window.setTimeout(() => setArrived(true), 900), b = window.setTimeout(() => setShown(true), 600), c = window.setTimeout(() => setOffer(true), 1700);
    return () => { window.clearTimeout(a); window.clearTimeout(b); window.clearTimeout(c); };
  }, [reduced]);
  const ring = useRingTween(arrived ? TO : FROM, 1200, reduced);
  const P = PRICING.athlete;
  const was = P.monthly * 12;
  const euro = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
  const an = billing === "annual";
  const rows = [
    { b: "annual" as const, label: "Annuel", tag: "Meilleur prix", badge: `−${Math.round((1 - P.annual / was) * 100)} %`,
      ...(native
        ? { big: euro(P.annual), unit: "/an", small: <>{euro(P.annualMonthly)}/mois · {(P.annual / 365).toFixed(2).replace(".", ",")} € par jour</> }
        : { big: euro(P.annualMonthly), unit: "/mois", small: <><s style={{ opacity: 0.6 }}>{euro(was)}</s> {euro(P.annual)} par an</> }) },
    { b: "monthly" as const, label: "Mensuel", big: euro(P.monthly), unit: "/mois", small: `Sans engagement · ${(P.monthly * 12 / 365).toFixed(2).replace(".", ",")} € par jour` },
  ];
  const short = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
  return (
    <VecuFrame noScroll bleed
      right={<button type="button" onClick={onClose} aria-label="Fermer" className="vc-press" style={roundBtn}>×</button>}
      sheet={
        <div style={{ position: "relative", zIndex: 6, flexShrink: 0, opacity: offer ? 1 : 0, transform: offer ? "none" : "translateY(10px)", pointerEvents: offer ? "auto" : "none", transition: `opacity .5s ${EASE}, transform .5s ${EASE}` }}>
        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", padding: "16px 20px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ marginBottom: 12 }}><OfferRows rows={rows} billing={billing} setBilling={setBilling} check /></div>
          {native ?? (
            <>
              <button type="button" onClick={onPay} className="vc-press"
                style={{ width: "100%", height: 54, borderRadius: 16, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 12px 30px rgba(212,64,0,.3)" }}>
                Démarrer mon essai gratuit
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.62)", marginTop: 8, lineHeight: 1.45 }}>
                <b style={{ color: "#fff" }}>0 € aujourd&apos;hui</b> · rappel le {short(12)} · {an ? euro(P.annual) : euro(P.monthly)} le {short(14)}<br />Annulation en 1 clic, sans engagement.
              </div>
            </>
          )}
        </div>
        </div>
      }>
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 340, display: "flex", justifyContent: "center" }}>
          <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: "min(560px, 150vw)", aspectRatio: "1", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 0,
            backgroundColor: ringGlowFor(ring), opacity: 0.32, transition: `background-color .9s ${EASE}`,
            maskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)" }} />
          {/* Petits écrans (iPhone SE, 20/11) : anneau réduit pour que titre, ✓ et formules tiennent sans défiler. */}
          <div className="vc-pay-ring" style={{ position: "relative" }}>
            <DecisionRing readOnly onChange={() => {}} fluid field fieldFade ambient hideLegend hideHint
              value={ring.v} zoneLow={ring.lo} zoneHigh={ring.hi} recoDir={ringDirFor(ring)}
              glow={ringGlowFor(ring)} breath={breathForDir(ringDirFor(ring))} celebrate={arrived && !reduced} />
          </div>
        </div>
        <h1 style={{ position: "relative", zIndex: 3, fontFamily: DISPLAY, fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, textAlign: "center", margin: "16px 0 0", textWrap: "balance",
          opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)", transition: `opacity .6s ${EASE}, transform .6s ${EASE}` } as React.CSSProperties}>
          {/* Réponse à la frustration (18/11, Gildas) : son effort sans résultat, puis le mécanisme en une ligne. */}
          {first ? `${first}, ` : ""}{stag
            /* Le chiffre de l'écran douleur, repris mot pour mot (20/11, Gildas : « Ce que tu gagnes » passe ici). Ses heures
               et la promesse en orange, le constat en blanc. */
            ? <><em style={{ fontStyle: "normal", color: "#ff8a55" }}>{first ? "tes" : "Tes"} {hours ? `${hours} h` : "efforts"}</em>{hours ? " d'entraînement sans progrès" : ""} <em style={{ fontStyle: "normal", color: "#ff8a55" }}>vont enfin payer.</em></>
            : <>{first ? "ta progression" : "Ta progression"} <em style={{ fontStyle: "normal", color: "#ff8a55" }}>ne s&apos;arrête pas.</em></>}
        </h1>
        <div style={{ position: "relative", zIndex: 3, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px", marginTop: 14, width: "100%", maxWidth: 360,
          opacity: shown ? 1 : 0, transition: `opacity .6s ${EASE} .25s` }}>
          {PAY_CHECKS.map(c => <span key={c} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: 1.3, color: "rgba(255,255,255,.8)" }}><b style={{ color: "#7fdb8f" }}>✓</b>{c}</span>)}
        </div>
      </div>
    </VecuFrame>
  );
}

/* ══════════════ Onboarding vécu, COACH (18/11, parallèle du sportif) ══════════════
   Primitive : le radar du Coach Control (CoachRadar). Douleur : l'impuissance (il écrit tout, ce qui décide du
   résultat lui échappe, il l'apprend trop tard ; enfouie, en miroir : « il va partir ailleurs »). Mis en avant plus
   que côté sportif : la gestion de la charge (prévention des blessures) et les tests. */

/* Groupe d'exemple : récupération du jour (0..100), séance prévue (RPE) et RPE après décision. */
const DEMO_GROUP: { id: string; name: string; score: number; diff: number; to: number }[] = [
  { id: "tm", name: "Thomas M", score: 22, diff: 7, to: 4 },
  { id: "lb", name: "Léa B", score: 32, diff: 7, to: 5 },
  { id: "is", name: "Inès S", score: 50, diff: 7, to: 7 },
  { id: "kr", name: "Kylian R", score: 72, diff: 7, to: 7 },
  { id: "hr", name: "Hugo R", score: 88, diff: 4, to: 7 },
];
/* `fatigue` (18/11, Gildas) : chaque comportement coché dans « Ce qui revient dans ton groupe » fait reculer UN sportif
   vers la gauche du radar, à tour de rôle parmi les 4 les plus à gauche (Thomas, Léa, Inès, Kylian). */
const FATIGUE_ORDER = ["tm", "lb", "is", "kr"];
function groupPoints(applied: boolean, fatigue = 0): RadarPoint[] {
  const shift: Record<string, number> = {};
  for (let i = 0; i < fatigue; i++) { const id = FATIGUE_ORDER[i % FATIGUE_ORDER.length]; shift[id] = (shift[id] ?? 0) + 12; }
  return DEMO_GROUP.map(p => {
    const score = Math.max(4, p.score - (shift[p.id] ?? 0));
    const b = autoregBand(score), v = applied ? p.to : p.diff;
    const lo = Math.max(1, Math.round(b.lo)), hi = Math.min(10, Math.max(lo, Math.round(b.hi)));
    return { id: p.id, name: p.name, score, diff: v, ring: { value: v, zoneLow: lo, zoneHigh: hi, planned: true }, hideZone: false };
  });
}
function GroupRadar({ applied, fatigue = 0 }: { applied: boolean; fatigue?: number }) {
  return <CoachRadar points={groupPoints(applied, fatigue)} onSelect={() => {}} animate />;
}

/* Après « Comment tu sais qu'un sportif est fatigué ? » : le constat de l'impuissance, puis la peur enfouie en miroir. */
export function CoachBlindScreen({ count, know, onBack, onNext, progress }: {
  count: number; know: string | null; onBack: () => void; onNext: () => void; progress: [number, number, number];
}) {
  const n = count * 3;
  /* 20/11, Gildas : trop de texte. Une phrase, plus de légende sous le graphique ni de ligne « changer de coach ». */
  const line = know === "says" ? "Il te le dit quand il y pense."
    : know === "warmup" ? "À l'échauffement, la séance est déjà écrite."
    : know === "after" ? "Tu l'apprends après la séance."
    : "Ça se passe hors de ta vue.";
  /* Le calcul se voit, comme côté sportif (20/11). */
  const reducedB = useReducedMotion();
  const [calc, setCalc] = useState(true);
  useEffect(() => { const id = window.setTimeout(() => setCalc(false), reducedB ? 300 : 1900); return () => window.clearTimeout(id); }, [reducedB]);
  if (calc) return (
    <VecuFrame glow center progress={progress}>
      <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Je calcule ta semaine…</div>
        <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.12)", margin: "16px 0 18px", overflow: "hidden" }}>
          <i style={{ display: "block", height: "100%", width: "100%", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", transformOrigin: "left", animation: `vcBar 1.7s ${EASE} both` }} />
        </div>
        <div className="vc-rise" style={{ fontSize: 14.5, color: "rgba(255,255,255,.7)", animationDelay: ".3s" }}>{count} sportifs, 3 séances chacun</div>
      </div>
    </VecuFrame>
  );
  return (
    <VecuFrame glow center onBack={onBack} progress={progress} foot={<Pill onClick={onNext}>Changer ça</Pill>}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {/* 18/11, Gildas : pas de « 0 sur N » (une note qui l'accuse) ; son travail, puis ce qui lui échappe. */}
        <span style={{ fontSize: 58, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, margin: "14px 0 10px", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{n} séances</span>
        {/* Ce que compte le chiffre (18/11) : sportifs × 3 séances, faites par eux, pas écrites par lui. */}
        <span className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, lineHeight: 1.35, animationDelay: ".3s" }}>
          faites par tes sportifs chaque semaine.<br />Leur niveau de forme t&apos;échappe.
        </span>
        {/* Le graphique de l'ancien constat (18/11, Gildas) : la forme du groupe, jour de séance par jour de séance, face
            à la ligne fixe de la séance prévue. Exemple. */}
        <div className="vc-rise" style={{ width: "100%", maxWidth: 320, marginTop: 20, animationDelay: ".45s" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 8, height: 104, paddingTop: 16 }}>
            {[["Lun", 78], ["Mar", 46], ["Jeu", 88], ["Ven", 38], ["Sam", 64]].map(([d, v], i) => (
              <div key={d as string} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                <span style={{ width: "100%", height: `${v}%`, borderRadius: "7px 7px 3px 3px", background: recupColor(0.1 + 0.9 * ((v as number) - 20) / 75), transformOrigin: "bottom", animation: `vcGrow .7s ${EASE} ${500 + i * 80}ms both` }} />
              </div>
            ))}
            <em style={{ position: "absolute", left: -4, right: -4, bottom: "62%", borderTop: "2px dashed rgba(255,255,255,.75)", fontStyle: "normal" }}>
              <small style={{ position: "absolute", right: 0, top: -17, fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", background: "#0e1114", padding: "0 4px", color: "#fff" }}>ta séance prévue</small>
            </em>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
            {["Lun", "Mar", "Jeu", "Ven", "Sam"].map(d => <span key={d} style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 10, color: "rgba(255,255,255,.55)" }}>{d}</span>)}
          </div>
        </div>
        <span className="vc-rise" style={{ marginTop: 16, maxWidth: 400, fontSize: 16, lineHeight: 1.5, color: "rgba(255,255,255,.75)", textWrap: "balance", animationDelay: ".6s" } as React.CSSProperties}>{sent(line)}</span>
        <Proof />
      </div>
    </VecuFrame>
  );
}

/* Les critères du point forme d'abord, puis leurs comportements (18/11, Gildas). */
const COACH_BEHAVIORS: { key: string; emoji: string; label: string }[] = [
  { key: "f_sleep", emoji: "😴", label: "Nuits courtes" }, { key: "f_stress", emoji: "🧠", label: "Stress" },
  { key: "sore", emoji: "🦵", label: "Courbatures" }, { key: "f_motivation", emoji: "😮‍💨", label: "Manque d'envie" },
  { key: "exams", emoji: "📚", label: "Partiels, boulot" }, { key: "social_out", emoji: "🎉", label: "Sorties" },
  { key: "travel", emoji: "✈️", label: "Déplacements" }, { key: "screen_late", emoji: "📱", label: "Écran tard" },
];
export function CoachHabitsScreen({ behaviors, setBehaviors, onBack, onDone, progress }: {
  behaviors: string[]; setBehaviors: (b: string[]) => void; onBack: () => void; onDone: () => void; progress: [number, number, number];
}) {
  const [none, setNone] = useState(false);
  const ok = behaviors.length > 0 || none;
  return (
    <VecuFrame onBack={onBack} progress={progress}
      sheet={
        <Sheet title="Ce qui revient dans ton groupe">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {COACH_BEHAVIORS.map(b => {
              const on = behaviors.includes(b.key);
              return <DarkChip key={b.key} on={on} onClick={() => { setNone(false); setBehaviors(on ? behaviors.filter(x => x !== b.key) : [...behaviors, b.key]); }}><span aria-hidden>{b.emoji}</span> {b.label}</DarkChip>;
            })}
            <DarkChip on={none} onClick={() => { setNone(!none); if (!none) setBehaviors([]); }}>Rien de tout ça</DarkChip>
          </div>
          <div style={{ marginTop: 16 }}><Pill disabled={!ok} onClick={onDone}>Continuer</Pill></div>
        </Sheet>
      }>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", textAlign: "center", marginBottom: 8 }}>Ton groupe, un jour comme les autres</div>
        <GroupRadar applied={false} fatigue={behaviors.length} />
      </div>
    </VecuFrame>
  );
}

/* Cartes du bilan du groupe : la charge et les tests d'abord (18/11, Gildas : plus en avant que côté sportif). */
function coachCards(count: number): InsightCard[] {
  const n = Math.max(4, count);
  return [
    { key: "charge", photo: "groupe_charge", color: "#a0ebcd", kicker: "La charge du groupe", big: "2", unit: "sportifs",
      cap: "montent trop vite. L'alerte arrive avant le pic, pas après la blessure.",
      box: <><InsBar label="Dans leur zone de charge" value={`${n - 2} sur ${n}`} pct={Math.round((n - 2) / n * 100)} color="#a0ebcd" /><InsBar label="Au-dessus, alerte envoyée" value={`2 sur ${n}`} pct={Math.round(200 / n)} color="#38bdf8" /></> },
    { key: "tests", photo: "tests", color: "#ffb08a", kicker: "Leurs tests", big: "+4", unit: "cm",
      cap: "de détente pour Léa en 6 semaines. Chaque sportif voit ce que ton travail lui rapporte.",
      box: <><InsBar label="Détente (CMJ), il y a 6 semaines" value="34 cm" pct={68} color="rgba(255,255,255,.45)" /><InsBar label="Détente (CMJ), aujourd'hui" value="38 cm" pct={76} color="#ff8a5c" /></> },
    { key: "decroche", photo: "groupe_decroche", color: "#ffb08a", kicker: "Qui décroche", big: "3", unit: "sportifs",
      cap: "dont la forme baisse depuis 2 semaines. Tu le sais avant qu'ils le disent.",
      box: <InsBar label="Forme sous leur norme" value={`3 sur ${n}`} pct={Math.round(300 / n)} color="#ff6a2b" /> },
    { key: "seances", photo: "groupe_seances", color: "#ffd27a", kicker: "Tes séances", big: "14", unit: "sur 20",
      cap: "séances modérées ressenties dures par le groupe.",
      box: <InsBar label="Prévues modérées, plus dures" value="14 sur 20" pct={70} color="#f28a00" /> },
  ];
}
export function CoachLoader({ count, behaviors, onDone, ms = 3600 }: { count: number; behaviors: string[]; onDone?: () => void; ms?: number }) {
  useEffect(() => { if (!onDone) return; const id = window.setTimeout(onDone, ms); return () => window.clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const lines = [`${count} sportifs`, "3 séances par semaine", ...COACH_BEHAVIORS.filter(b => behaviors.includes(b.key)).slice(0, 2).map(b => b.label)];
    return (
      <VecuFrame glow center>
        <div style={{ width: "100%", maxWidth: 300, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>J&apos;analyse ton groupe…</div>
          <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.12)", margin: "16px 0 18px", overflow: "hidden" }}>
            <i style={{ display: "block", height: "100%", width: "100%", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", transformOrigin: "left", animation: `vcBar 3.2s ${EASE} both` }} />
          </div>
          {lines.map((x, k) => <div key={k} className="vc-rise" style={{ fontSize: 14.5, color: "rgba(255,255,255,.7)", marginTop: 8, animationDelay: `${0.3 + k * 0.45}s` }}>{x}</div>)}
          <Experts role="coach" />
        </div>
      </VecuFrame>
    );
  
}
export function CoachFactScreen({ count, behaviors, onBack, onNext, progress, cta = "Voir comment ça marche", noLoader }: {
  count: number; behaviors: string[]; onBack: () => void; onNext: () => void; progress: [number, number, number]; cta?: string; noLoader?: boolean;
}) {
  const [analysing, setAnalysing] = useState(true);
  useEffect(() => { const t = window.setTimeout(() => setAnalysing(false), 3600); return () => window.clearTimeout(t); }, []);
  if (analysing && !noLoader) return <CoachLoader count={count} behaviors={behaviors} />;
  const big: React.CSSProperties = { fontSize: 46, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1, margin: "10px 0 8px", background: "linear-gradient(90deg,#ffb08a,#ff5a14)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", textAlign: "center" };
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>{cta}</Pill>}>
      <p className="vc-rise" style={{ textAlign: "center", fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "#ffb08a", margin: "0 0 10px" }}>Ce que tu ne vois pas</p>
      <div className="vc-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={big}>1 séance sur 3</div>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, textAlign: "center", textWrap: "balance" } as React.CSSProperties}>tombe un jour où un sportif n&apos;est pas en forme.<br />Tu ne le sais qu&apos;après.</div>
      </div>
      <div className="vc-rise" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "#ffb08a", textAlign: "center", marginTop: 22, marginBottom: 12, animationDelay: ".3s" }}>Ce que le bilan de ton groupe t&apos;apprendra</div>
      <InsightCarousel cards={coachCards(count)} />
    </VecuFrame>
  );
}


/* Ce que ton groupe gagne (18/11, Gildas : orienté bénéfice, en réponse à l'impuissance). */
export function CoachPathScreen({ first, count = 10, onBack, onNext, progress }: { first: string; count?: number; onBack: () => void; onNext: () => void; progress: [number, number, number] }) {
  /* 18/11, Gildas : plus court (une phrase par gain). */
  const rows: [string, string, string][] = [
    ["🎯", "Chaque séance réglée avant qu'ils arrivent", "Une décision prête par sportif, validée en un tap."],
    ["🛡️", "Moins de blessures dans ton groupe", "L'alerte arrive avant le pic de charge."],
    ["📈", "Des progrès qu'ils voient", "Détente, sprint, 1RM : leurs tests, intégrés."],
  ];
  return (
    <VecuFrame glow onBack={onBack} progress={progress} center foot={<Pill onClick={onNext}>Reprendre la main</Pill>}>
      <h2 className="vc-rise" style={{ fontFamily: DISPLAY, fontSize: 29, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, textAlign: "center", margin: 0, textWrap: "balance" } as React.CSSProperties}>
        {/* Miroir du sportif (« tes N heures vont enfin compter ») : ses séances de la semaine, individualisées. */}
        {first ? <>{first},<br /></> : null}{first ? "tes" : "Tes"} {count * 3} séances,<br /><em style={{ fontStyle: "normal", color: "#ff8a55" }}>individualisées.</em>
      </h2>
      <div style={{ marginTop: 26, display: "grid", gap: 20 }}>
        {rows.map(([e, b, t], i) => (
          <div key={b} className="vc-rise" style={{ display: "flex", gap: 14, alignItems: "flex-start", animationDelay: `${0.2 + i * 0.16}s` }}>
            <span aria-hidden style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 12, background: "rgba(255,90,20,.14)", display: "grid", placeItems: "center", fontSize: 18 }}>{e}</span>
            <div><b style={{ fontSize: 16.5 }}>{b}</b><p style={{ margin: "3px 0 0", fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,.62)" }}>{sent(t)}</p></div>
          </div>
        ))}
      </div>
    </VecuFrame>
  );
}

/* Paywall coach (v4) : l'anneau glisse dans la zone (comme le sportif ; avant : le radar), la promesse, 4 coches (charge et tests en avant),
   prix par sportif. Même feuille d'offre que le sportif ; achat store dans les apps. */
/* Les gains de l'ancien écran « Tes N séances, individualisées » (retiré le 20/11), puis le bilan. */
const COACH_PAY_CHECKS = ["Chaque séance réglée avant qu'ils arrivent", "Moins de blessures dans ton groupe", "Leurs tests intégrés", "Bilan du groupe chaque lundi"];
export function CoachPayScreen({ first, count, billing, setBilling, onPay, onClose, onView, native }: {
  first: string; goal?: string; count: number; billing: "monthly" | "annual"; setBilling: (b: "monthly" | "annual") => void;
  onPay: () => void; onClose: () => void; onView?: () => void; native?: React.ReactNode;
}) {
  useEffect(() => { onView?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(reduced);
  const [shown, setShown] = useState(reduced);
  const [offer, setOffer] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const a = window.setTimeout(() => setSettled(true), 900), b = window.setTimeout(() => setShown(true), 600), c = window.setTimeout(() => setOffer(true), 1700);
    return () => { window.clearTimeout(a); window.clearTimeout(b); window.clearTimeout(c); };
  }, [reduced]);
  const ring = useRingTween(settled ? { v: 3, lo: 2, hi: 4 } : { v: 7, lo: 2, hi: 4 }, 1200, reduced);
  const P = PRICING.coach;
  const euro = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
  const per = (P.annualMonthly / Math.max(1, count)).toFixed(2).replace(".", ",");
  const an = billing === "annual";
  const rows = [
    { b: "annual" as const, label: "Annuel", tag: "Meilleur prix", badge: `−${Math.round((1 - P.annual / (P.monthly * 12)) * 100)} %`,
      ...(native ? { big: euro(P.annual), unit: "/an", small: <>{euro(P.annualMonthly)}/mois · {per} € par sportif</> }
        : { big: euro(P.annualMonthly), unit: "/mois", small: <>{per} € par sportif et par mois · {euro(P.annual)} par an</> }) },
    { b: "monthly" as const, label: "Mensuel", big: euro(P.monthly), unit: "/mois", small: "Sans engagement · sportifs illimités" },
  ];
  const short = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
  return (
    <VecuFrame noScroll bleed glow
      right={<button type="button" onClick={onClose} aria-label="Fermer" className="vc-press" style={roundBtn}>×</button>}
      sheet={
        <div style={{ position: "relative", zIndex: 6, flexShrink: 0, opacity: offer ? 1 : 0, transform: offer ? "none" : "translateY(10px)", pointerEvents: offer ? "auto" : "none", transition: `opacity .5s ${EASE}, transform .5s ${EASE}` }}>
        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", padding: "16px 20px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ marginBottom: 12 }}><OfferRows rows={rows} billing={billing} setBilling={setBilling} check /></div>
          {native ?? (
            <>
              <button type="button" onClick={onPay} className="vc-press"
                style={{ width: "100%", height: 54, borderRadius: 16, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 12px 30px rgba(212,64,0,.3)" }}>
                Démarrer mon essai gratuit
              </button>
              <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.62)", marginTop: 8, lineHeight: 1.45 }}>
                <b style={{ color: "#fff" }}>0 € aujourd&apos;hui</b> · rappel le {short(12)} · {an ? euro(P.annual) : euro(P.monthly)} le {short(14)}<br />Annulation en 1 clic, sans engagement.
              </div>
            </>
          )}
        </div>
        </div>
      }>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* L'anneau, comme le paywall sportif (18/11, Gildas) : il glisse dans la zone, la boucle de la Trame. */}
        <div style={{ position: "relative", width: "100%", maxWidth: 320, display: "flex", justifyContent: "center" }}>
          <div aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: "min(560px, 150vw)", aspectRatio: "1", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 0,
            backgroundColor: ringGlowFor(ring), opacity: 0.32, transition: `background-color .9s ${EASE}`,
            maskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, #000 0%, rgba(0,0,0,.45) 45%, transparent 100%)" }} />
          {/* Petits écrans (iPhone SE, 20/11) : anneau réduit pour que titre, ✓ et formules tiennent sans défiler. */}
          <div className="vc-pay-ring" style={{ position: "relative" }}>
            <DecisionRing readOnly onChange={() => {}} fluid field fieldFade ambient hideLegend hideHint
              value={ring.v} zoneLow={ring.lo} zoneHigh={ring.hi} recoDir={ringDirFor(ring)}
              glow={ringGlowFor(ring)} breath={breathForDir(ringDirFor(ring))} celebrate={settled && !reduced} />
          </div>
        </div>
        <h1 style={{ position: "relative", zIndex: 3, fontFamily: DISPLAY, fontSize: 25, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, textAlign: "center", margin: "14px 0 0", textWrap: "balance",
          opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(8px)", transition: `opacity .6s ${EASE}, transform .6s ${EASE}` } as React.CSSProperties}>
          {/* Réponse à l'impuissance (18/11, Gildas), en miroir de « Leur niveau de forme t'échappe ». */}
          {/* 20/11, Gildas : le titre de l'ancien écran de gains, retiré du parcours. Même couleur que le sportif. */}
          {first ? `${first}, ` : ""}{first ? "tes" : "Tes"} {count * 3} séances, <em style={{ fontStyle: "normal", color: "#ff8a55" }}>individualisées.</em>
        </h1>
        <div style={{ position: "relative", zIndex: 3, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px", marginTop: 12, width: "100%", maxWidth: 360, opacity: shown ? 1 : 0, transition: `opacity .6s ${EASE} .25s` }}>
          {COACH_PAY_CHECKS.map(c => <span key={c} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, lineHeight: 1.3, color: "rgba(255,255,255,.8)" }}><b style={{ color: "#7fdb8f" }}>✓</b>{c}</span>)}
        </div>
      </div>
    </VecuFrame>
  );
}

/* « Ce qui revient dans ton quotidien » (18/11, Gildas : remplace les 3 questions notées sur l'anneau ; le point forme,
   il le fait à l'arrivée dans l'app). Les critères du point forme puis ses comportements, plusieurs choix. Sa forme
   habituelle est déduite de ses choix (nuits courtes = sommeil faible, stress = stress marqué, courbatures =
   récupération faible ; rien = en forme) et s'affiche au centre de l'anneau pendant qu'il coche. */
const FORM_CHIPS: { key: string; emoji: string; label: string }[] = [
  { key: "f_sleep", emoji: "😴", label: "Nuits courtes" }, { key: "f_stress", emoji: "🧠", label: "Stress" }, { key: "f_sore", emoji: "🦵", label: "Courbatures" },
];
/* Les comportements pèsent aussi (18/11, Gildas) : chacun retire un cran au sommeil ou à la récupération. */
const SLEEP_HITS = ["late_sleep", "screen_late", "caffeine_late", "alcohol", "social_out"];
const RECOVERY_HITS = ["heavy_meal", "travel", "tobacco", "alcohol"];
export function habitsFromChips(keys: string[]): VecuHabits {
  const s = keys.filter(k => SLEEP_HITS.includes(k)).length, r = keys.filter(k => RECOVERY_HITS.includes(k)).length;
  return {
    sleep: Math.max(1, (keys.includes("f_sleep") ? 3 : 8) - s),
    stress: keys.includes("f_stress") ? 8 : 3,
    recovery: Math.max(1, (keys.includes("f_sore") ? 3 : 8) - r),
  };
}
export function RoutineScreen({ habits, behaviors, onBack, onDone, progress }: {
  habits: VecuHabits; behaviors: string[]; onBack: () => void; progress: [number, number, number];
  onDone: (habits: VecuHabits, behaviors: string[], none: boolean) => void;
}) {
  const [sel, setSel] = useState<string[]>(() => [
    ...(habits.sleep != null && habits.sleep <= 5 ? ["f_sleep"] : []), ...(habits.stress != null && habits.stress >= 6 ? ["f_stress"] : []),
    ...(habits.recovery != null && habits.recovery <= 5 ? ["f_sore"] : []), ...behaviors]);
  const [none, setNone] = useState(false);
  const ok = sel.length > 0 || none;
  const h = habitsFromChips(sel);
  const score = habitsScore(h);
  const toggle = (k: string) => { setNone(false); setSel(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]); };
  return (
    <VecuFrame onBack={onBack} progress={progress}
      sheet={
        <Sheet title="Ce qui revient dans ton quotidien">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {[...FORM_CHIPS, ...VECU_BEHAVIORS].map(b => <Chip key={b.key} on={sel.includes(b.key)} onClick={() => toggle(b.key)}><span aria-hidden>{b.emoji}</span> {b.label}</Chip>)}
            <Chip on={none} onClick={() => { setNone(!none); if (!none) setSel([]); }}>Rien de tout ça</Chip>
          </div>
          <div style={{ marginTop: 16 }}><Pill disabled={!ok} onClick={() => onDone(h, sel.filter(k => !k.startsWith("f_")), none)}>Continuer</Pill></div>
        </Sheet>
      }>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <PointFormeRing value={h.recovery} labels={SCALE_WORDS.recovery.labels} kicker="Ta forme" placeholder="" score={score} centerScore={{ label: "Ta forme", value: score }} final />
        {/* 18/11, Gildas : dire que c'est une estimation. */}
        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 6, lineHeight: 1.4 }}>Score simplifié.<br />Dans l&apos;app, ton point forme le calcule via : sommeil, stress, douleurs, envie, comportements.</div>
      </div>
    </VecuFrame>
  );
}

/* Message prêt du coach après la décision (18/11) : l'exercice le plus chargé et sa nouvelle charge. */
export function coachMessage(name: string, lines: string[], pct: number): string {
  const hit = lines.map(l => [l, loadOf(l), loadOf(demoAdjust(l, pct))] as const).find(([, a, b]) => a && b && a.v !== b.v);
  if (!hit) return `Salut ${name}, vu ton point forme on garde la séance mais on allège un peu.`;
  const ex = (hit[0].split(/\s[—–-]\s|\s\d/)[0] ?? "la charge").replace(/^./, c => c.toLowerCase());
  const b = hit[2]!;
  return `Salut ${name}, vu ton point forme on garde la séance mais on allège : ${ex} à ${String(b.v).replace(".", ",")} ${b.unit === "%" ? "%" : "kg"}.`;
}

/* Le groupe s'aligne : le radar part des séances prévues, puis toutes les décisions validées font glisser chaque
   sportif dans la bande. */
function CoachAlign({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [applied, setApplied] = useState(reduced);
  useEffect(() => {
    const a = window.setTimeout(() => setApplied(true), reduced ? 0 : 700), b = window.setTimeout(onDone, reduced ? 0 : 2200);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  return (
    <div>
      <GroupRadar applied={applied} />
      <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.65)", marginTop: 8, minHeight: 18, opacity: applied ? 1 : 0, transition: `opacity .5s ${EASE} .8s` }}>
        2 séances allégées, 1 poussée, 2 gardées. Validé en un tap.
      </div>
    </div>
  );
}
