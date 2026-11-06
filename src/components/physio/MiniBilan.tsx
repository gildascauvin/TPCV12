"use client";

/* Mini bilan (2026-11-04, concept QCvbPposTtk6okHT9LF5rZ v11) : après CHAQUE point forme et CHAQUE séance
   notée, plein écran sombre au format des bilans. 2 à 3 slides, chacune avec un grand chiffre, une phrase
   et une visu ; la photo du thème derrière (dans le sens de l'insight : positif = la ressource, négatif =
   le problème), la photo 2 un jour sur deux. La coque reprend celle de BilanCarousel. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hero, PhotoBanner } from "@/components/bilan/BilanCarousel";

export type MiniSlide = {
  key: string;
  kicker: string;
  /* Photo du thème (public/bilan/<photo>.webp) ou photo du sport teintée. */
  photo: string;
  sportPhoto?: { src: string; tint: [string, string] } | null;
  hero: { big: string | number; unit?: string; cap: string; color: string };
  /* Visu à la place du grand chiffre (anneau récup de « Ta forme », 2026-11-06). */
  heroNode?: React.ReactNode;
  sub?: React.ReactNode;
  body?: React.ReactNode;
};

export const miniCard: React.CSSProperties = { background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 10 };
const subStyle: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,0.78)" };

export default function MiniBilan({ slides, title, alt, onClose, exitClass, nav, actions, lastLabel = "Fermer", onLast, onSlide, start = 0 }: {
  slides: MiniSlide[];
  /* « POINT FORME » / « FIN DE SÉANCE » : préfixe du kicker. */
  title: string;
  alt: boolean;
  onClose: () => void;
  exitClass?: string;
  /* Relecture : flèches entre les jours ou séances comparés. */
  nav?: { label: string; sub: string; prev: (() => void) | null; next: (() => void) | null } | null;
  /* Boutons en plus sur la dernière slide (« Modifier mes réponses »). */
  actions?: React.ReactNode;
  lastLabel?: string;
  onLast?: () => void;
  onSlide?: (key: string, index: number) => void;
  start?: number;
}) {
  const [idx, setIdx] = useState(start);
  const touchX = useRef<number | null>(null);
  const keys = slides.map(s => s.key).join(",");
  // Un autre jour (relecture) : on repart de la première slide.
  useEffect(() => { setIdx(start); }, [nav?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  // Les comptes arrivent après l'affichage : une slide en plus ne fait pas sauter l'index.
  useEffect(() => { setIdx(i => Math.min(i, Math.max(0, slides.length - 1))); }, [keys, slides.length]);
  const slide = slides[Math.min(idx, slides.length - 1)];
  useEffect(() => { if (slide) onSlide?.(slide.key, idx); }, [slide?.key, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx(i => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx(i => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);
  if (!slide || typeof document === "undefined") return null;
  const last = idx >= slides.length - 1;

  const content = (
    <div
      className={exitClass}
      role="dialog" aria-modal="true" aria-label={title === "FIN DE SÉANCE" ? "Ta séance" : "Ton point forme"}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current; touchX.current = null;
        if (dx < -50) setIdx(i => Math.min(i + 1, slides.length - 1)); else if (dx > 50) setIdx(i => Math.max(i - 1, 0));
      }}
      style={{ position: "fixed", inset: 0, zIndex: 2147483150, background: "#070a0d", color: "#fff", fontFamily: "var(--font-dm-sans), 'Helvetica Neue', sans-serif", display: "flex", justifyContent: "center" }}
    >
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 560, height: "min(48vh, 420px)" }}>
        <PhotoBanner key={slide.key} photo={slide.photo} height="100%" sportPhoto={slide.sportPhoto} alt={alt} />
      </div>
      <div style={{ position: "relative", width: "100%", maxWidth: 440, boxSizing: "border-box", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= idx ? "#fff" : "rgba(255,255,255,0.22)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>
          <span>{slide.kicker ? `${title} · ${slide.kicker}` : title}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: 0, color: "#fff", fontSize: 26, lineHeight: 1, cursor: "pointer", padding: 4 }}>×</button>
        </div>
        {nav && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -6 }}>
            <NavArrow dir="prev" onClick={nav.prev} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "center", textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>
              <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nav.label}</div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginTop: 2 }}>{nav.sub}</div>
            </div>
            <NavArrow dir="next" onClick={nav.next} />
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingTop: 12 }}>
          {/* Contenu posé juste au-dessus des boutons (06/11, Gildas) : l'espace libre passe en haut ; la cale s'efface s'il déborde. */}
          <div aria-hidden="true" style={{ flex: "1 1 0", minHeight: 0 }} />
          {slide.heroNode ?? <Hero big={slide.hero.big} unit={slide.hero.unit} cap={slide.hero.cap} color={slide.hero.color} />}
          {slide.sub && <div style={subStyle}>{slide.sub}</div>}
          {slide.body}
        </div>

        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {last && actions}
          <div style={{ display: "flex", gap: 10 }}>
            {idx > 0 && <button onClick={() => setIdx(i => i - 1)} style={{ flex: 1, height: 52, borderRadius: 14, border: 0, background: "rgba(255,255,255,0.1)", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Précédent</button>}
            <button onClick={() => last ? (onLast ?? onClose)() : setIdx(i => i + 1)} style={{ flex: 1.6, height: 52, borderRadius: 14, border: 0, background: last && onLast ? "linear-gradient(180deg,#f04a08,#d44000)" : "#fff", color: last && onLast ? "#fff" : "#14181b", fontFamily: "inherit", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{last ? lastLabel : "Suivant"}</button>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

function NavArrow({ dir, onClick }: { dir: "prev" | "next"; onClick: (() => void) | null }) {
  return (
    <button onClick={onClick ?? undefined} disabled={!onClick} aria-label={dir === "prev" ? "Précédent" : "Suivant"}
      style={{ width: 40, height: 40, flex: "none", borderRadius: 12, border: 0, background: "rgba(255,255,255,0.12)", color: "#fff", cursor: onClick ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: onClick ? 1 : 0.35 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} /></svg>
    </button>
  );
}

/* Pastilles du bas : une mesure ou une réponse en mots, son libellé dessous. */
export function Chips({ items }: { items: { value: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {items.map(c => (
        <div key={c.label} style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "9px 6px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 15, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value}</b>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* Les deux colonnes de A1 : le ressenti en rond, la mesure en carré (formes différentes : lisible sans la
   couleur), la bande de la norme ou de la zone prévue en pointillés, le trait d'écart entre les deux.
   Valeurs sur 0..1 (0 = bas de l'échelle). `ghost` : colonne de droite en pointillés (séance prévue,
   sans capteur). */
export function Columns({ feel, measure, band, bandLabel = "NORME", labels, scale, color, gapColor = "#ffb08a", ghost = false, aria }: {
  feel: number; measure: number; band: [number, number] | null; bandLabel?: string; gapColor?: string; labels: [string, string]; scale?: [string, string]; color: string; ghost?: boolean; aria: string;
}) {
  const top = 8, h = 140, y = (v: number) => top + h - Math.max(0.04, Math.min(1, v)) * h;
  const yf = y(feel), ym = y(measure);
  const by0 = band ? y(band[1]) : 0, by1 = band ? y(band[0]) : 0;
  const gap = Math.abs(yf - ym) > 10;
  return (
    <div style={miniCard}>
      <svg viewBox="0 0 260 172" width="100%" role="img" aria-label={aria} style={{ maxHeight: "max(150px, calc(100vh - 560px))" }}>
        {band && <>
          <rect x="0" y={by0} width="260" height={Math.max(10, by1 - by0)} rx="8" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
          <text x="234" y={(by0 + Math.max(by0 + 10, by1)) / 2 + 3} textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9" fontFamily="var(--font-mono), monospace">{bandLabel}</text>
        </>}
        {scale && <g fill="rgba(255,255,255,.45)" fontSize="8.5" fontFamily="var(--font-mono), monospace"><text x="2" y="16">{scale[1]}</text><text x="2" y="146">{scale[0]}</text></g>}
        <rect x="56" y={top} width="40" height={h} rx="20" fill="rgba(255,255,255,.08)" />
        <rect x="56" y={yf} width="40" height={top + h - yf} rx="20" fill={color} />
        <circle cx="76" cy={yf} r="13" fill="#fff" /><circle cx="76" cy={yf} r="8" fill={color} />
        <rect x="164" y={top} width="40" height={h} rx="20" fill="rgba(255,255,255,.08)" />
        {ghost
          ? <rect x="165" y={ym} width="38" height={top + h - ym - 1} rx="19" fill="none" stroke="#f5f2ec" strokeWidth="2" strokeDasharray="5 4" />
          : <><rect x="164" y={ym} width="40" height={top + h - ym} rx="20" fill="#f5f2ec" />
            <rect x="171" y={ym - 12} width="26" height="26" rx="5" fill="#f5f2ec" stroke="#070a0d" strokeWidth="3" /></>}
        {gap && <line x1="96" y1={yf} x2="164" y2={ym} stroke={gapColor} strokeWidth="2.5" strokeDasharray="5 4" />}
        <text x="76" y="168" textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="700">{labels[0]}</text>
        <text x="184" y="168" textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="700">{labels[1]}</text>
      </svg>
    </div>
  );
}



/* Zones de récupération (Fatigué / Équilibré / Frais) sur le dégradé de la jauge de récup (rampe
   WELLNESS_RAMP, 2026-11-04 Gildas : « reprendre la couleur des jauges issues du gradient »), chaque
   libellé dans la couleur du dégradé sous lui, celui du jour en gras. Repère = couleur du score. */
const RECUP_RAMP = "linear-gradient(90deg, #cde2fb 0%, #b7d3f6 25%, #6da7ec 50%, #2a78d6 75%, #184f95 100%)";
export function BandBar({ pos, bands }: { pos: number; bands: { label: string; from: number; to: number; color: string }[] }) {
  const p = Math.max(0.03, Math.min(0.97, pos)) * 100;
  const cur = bands.find(b => pos >= b.from && pos < b.to) ?? bands[bands.length - 1];
  return (
    <div style={{ ...miniCard, gap: 8 }}>
      <div style={{ position: "relative", height: 10, margin: "6px 4px", borderRadius: 999, background: RECUP_RAMP }}>
        {bands.slice(1).map(b => <span key={b.label} style={{ position: "absolute", left: `${b.from * 100}%`, top: -1, bottom: -1, width: 2, transform: "translateX(-1px)", background: "#15181c" }} />)}
        <span style={{ position: "absolute", left: `${p}%`, top: "50%", width: 18, height: 18, borderRadius: "50%", transform: "translate(-50%,-50%)", background: cur.color, border: "3px solid #fff", boxSizing: "border-box" }} />
      </div>
      <div style={{ position: "relative", height: 14, fontSize: 11 }}>
        {bands.map(b => <span key={b.label} style={{ position: "absolute", left: `${((b.from + b.to) / 2) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", fontWeight: b === cur ? 800 : 600, color: b.color === "#2368bc" ? "#5b98e4" : b.color }}>{b.label}</span>)}
      </div>
    </div>
  );
}

/* Courbe des 7 derniers jours (aujourd'hui en gros point blanc), la moyenne en ligne pointillée. */
export function WeekCurve({ points, color, dotColor }: { points: { label: string; value: number }[]; color: string; dotColor?: (v: number) => string }) {
  if (points.length < 2) return null;
  const vals = points.map(p => p.value), lo = Math.min(...vals) - 6, hi = Math.max(...vals) + 6;
  const x = (i: number) => 20 + i * (220 / Math.max(1, points.length - 1));
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 88;
  const mean = vals.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, vals.length - 1);
  return (
    <div style={miniCard}>
      <svg viewBox="0 0 260 128" width="100%" style={{ maxHeight: "max(110px, calc(100vh - 600px))" }} role="img" aria-label={`Ton ressenti sur ${points.length} jours, aujourd'hui en dernier`}>
        <line x1="0" x2="260" y1={y(mean)} y2={y(mean)} stroke="rgba(255,255,255,.45)" strokeDasharray="4 4" />
        <text x="256" y={y(mean) - 5} textAnchor="end" fill="rgba(255,255,255,.55)" fontSize="9" fontFamily="var(--font-mono), monospace">MOYENNE</text>
        <path d={points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 7 : 3.5} fill={i === points.length - 1 ? "#fff" : dotColor ? dotColor(p.value) : color} stroke={i === points.length - 1 && dotColor ? dotColor(p.value) : "none"} strokeWidth="3" />)}
        {points.map((p, i) => <text key={`t${i}`} x={x(i)} y="124" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9" fontFamily="var(--font-mono), monospace">{p.label}</text>)}
      </svg>
    </div>
  );
}

/* Charge de la semaine par jour (ressenti × durée), la séance du jour en couleur. */
/* `color` par jour (2026-11-04) : les couleurs de l'onglet Charge selon la difficulté ressentie ; le jour de
   la séance plein, les autres atténués. */
export function WeekBars({ days, note }: { days: { label: string; load: number; today: boolean; color: string; word?: string }[]; note?: string }) {
  const max = Math.max(1, ...days.map(d => d.load));
  return (
    <div style={miniCard}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 112 }} role="img" aria-label={`Charge de la semaine : ${days.filter(d => d.load > 0).length} jours d'entraînement`}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 0 }}>
            {d.load > 0 && d.word && <div style={{ fontSize: 10, fontWeight: d.today ? 800 : 600, color: d.today ? "#fff" : "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{d.word}</div>}
            <div style={{ width: "100%", height: d.load > 0 ? Math.max(6, (d.load / max) * 72) : 2, borderRadius: 6, background: d.load > 0 ? d.color : "rgba(255,255,255,0.12)", opacity: d.today || d.load === 0 ? 1 : 0.45 }} />
            <div style={{ fontSize: 11, fontWeight: d.today ? 800 : 500, color: d.today ? "#fff" : "rgba(255,255,255,0.5)" }}>{d.label}</div>
          </div>
        ))}
      </div>
      {note && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{note}</div>}
    </div>
  );
}
