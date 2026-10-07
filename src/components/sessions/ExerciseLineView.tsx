"use client";

/* Ligne d'exercice enrichie (2026-10-07, POC « Séances, exos et ajustements ») — rendu UNIQUE de toutes
   les lignes d'exercice de l'app : cartes séance (Accueil, Planning, Coach Control, revue en swipe),
   programmes (éditeur, fiche, /p/), aperçus Reconduire/Dupliquer, tiroir d'édition (pastilles
   cliquables), séance en direct (taille large), démos. La ligne tapée reste la source de vérité ; ce
   composant ne fait que la lire avec le parseur unique (exerciseParser.ts).
   - icône de catégorie (exerciseBank.ts), nom (préfixe A/B/C en gris, format AMRAP/EMOM en pastille,
     texte entre parenthèses = note en italique) ;
   - pastilles : volume, charges, %, RPE, zone, allure, tempo, récup — elles passent à la ligne quand
     la prescription dépasse (jamais de débordement horizontal) ;
   - points (1 par série) ou barres de montée en charge, calés à droite (pas dans le tiroir d'édition) ;
   - avec `original` (aperçu d'un ajustement) : chiffres modifiés en orange, ancienne valeur barrée ;
   - consigne en italique, ligne non comprise affichée telle quelle (« texte brut ») ;
   - ligne ambiguë pendant un ajustement : « Non ajustée : lecture incertaine ».
   `onTokenClick` (tiroir d'édition) : chaque pastille et le nom renvoient les bornes exactes du texte
   brut qu'ils représentent, pour ouvrir l'éditeur de token dessus. */
import { parseLine, type ParsedLine, type Scheme, type Token } from "@/lib/exerciseParser";
import { bestExerciseMatch, CATEGORY_FAMILY, CATEGORY_LABEL, type ExerciseCategory } from "@/lib/exerciseBank";
import { findNameSpans } from "@/lib/exerciseAutocomplete";
import { adjustNotes, describeChange } from "@/lib/sessionLevers";

const C = {
  text: "#1f2428", muted: "#7b7f82", line: "rgba(0,0,0,.09)", ghost: "#f4f4f2",
  accent: "#d44000", accentDim: "rgba(212,64,0,.10)", name: "#2980b9", nameDim: "#ebf5fb",
  ok: "#1f9d55", warn: "#f28a00", danger: "#c81e1e",
  // points et barres de séries : orange de la charte, transparent pour rester discret ; une série
  // modifiée pendant un aperçu passe en orange plein (C.accent)
  set: "rgba(212,64,0,.32)", setOff: "rgba(212,64,0,.18)",
};
const MONO = "var(--font-mono), ui-monospace, monospace";

const ICON: Record<ExerciseCategory, string> = {
  halt: "M3 5h18M6 3v4M18 3v4M12 5v8M8 21l4-8 4 8",
  legs: "M6 6v12M18 6v12M2.5 9.5v5M21.5 9.5v5M6 12h12",
  push: "M3 12h13M12 7l5 5-5 5M20 5v14",
  pull: "M21 12H8M12 7l-5 5 5 5M4 5v14",
  plio: "M3 20h18M5 20c2.5-11 11.5-11 14 0M12 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 1 0 0-3.2",
  sprint: "M2 8h7M4 12h7M2 16h7M13 6l6 6-6 6",
  core: "M5 10h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4zM6 14v4M18 14v4",
  cardio: "M2 12h4l2.5-6 4.5 12 2.5-6H22",
  skill: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7",
  test: "M12 5a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 13V9M9 2h6M19 6l-1.5 1.5",
  warm: "M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
};
const FAMILY_STYLE = { f: { bg: C.accentDim, fg: C.accent }, e: { bg: C.nameDim, fg: C.name }, o: { bg: "rgba(31,157,85,.12)", fg: C.ok } };
const FORMAT_RE = /^(?:[A-H]\d?\s*[-–:.)]\s*)?(AMRAP|E\d?MOM|For time|Tabata|Circuit|Superset|Drop set|Rest-pause|Cluster|Pyramide|WOD|Metcon|HIIT)\b/i;

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const fmtDist = (m: number) => (m >= 1000 ? `${fmt(m / 1000)} km` : `${fmt(m)} m`);
const fmtSec = (s: number) => s >= 3600 && s % 60 === 0 ? `${Math.floor(s / 3600)}h${s % 3600 ? String((s % 3600) / 60).padStart(2, "0") : ""}` : s >= 60 && s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}` : `${fmt(s)} s`;

export function lineCategory(p: ParsedLine): ExerciseCategory | null {
  if (p.kind === "note") return null;
  const clean = (s: string) => s.replace(/\([^)]*\)/g, " ").replace(/^\s*[A-H]\d?\s*[-–:]\s*/, "");
  const m = bestExerciseMatch(clean(p.name.split("+")[0])) || bestExerciseMatch(clean(p.name));
  if (m) return m.cat;
  if (FORMAT_RE.test(p.name)) return "cardio";
  if (p.schemes.some(s => s.dist) && !p.entries.length) return "sprint";
  if (p.schemes.length && p.schemes.every(s => s.sec && !s.sets && s.reps == null)) return "cardio";
  return null;
}

export interface LineContext { cat: ExerciseCategory | null; role: "" | "header" | "child" }

/** Contexte de chaque ligne d'une séance : catégorie héritée (une ligne sans nom prend celle du
    dessus) et blocs (« 3 tours : » regroupe les lignes suivantes sans séries propres). */
export function sessionLineContexts(lines: string[]): LineContext[] {
  let lastCat: ExerciseCategory | null = null, inBlock = false;
  return lines.map(l => {
    const p = parseLine(l);
    let cat = lineCategory(p);
    if (!p.name && lastCat) cat = lastCat;
    if (p.name && p.kind !== "note") lastCat = cat;
    let role: LineContext["role"] = "";
    if (p.header) { inBlock = true; role = "header"; }
    else if (inBlock && p.kind !== "note" && !p.schemes.some(s => s.sets)) role = "child";
    else inBlock = false;
    return { cat, role };
  });
}

function schemeText(sc: Scheme, side: boolean): string | null {
  const reps = sc.reps != null ? (/^\d+(\+\d+)+$/.test(String(sc.reps)) && sc.tok?.k === "complex" ? `(${sc.reps})` : String(sc.reps)) : null;
  const secT = sc.sec ? (sc.sec2 ? (sc.sec % 60 === 0 && sc.sec2 % 60 === 0 ? `${sc.sec / 60}-${sc.sec2 / 60} min` : `${sc.sec}-${sc.sec2} s`) : fmtSec(sc.sec)) : null;
  let t: string;
  if (sc.ladder) t = `${sc.ladder} ${sc.unit}`;
  else if (sc.work) t = `${sc.work}/${sc.rest}`;
  else if (sc.sets && reps != null) t = `${sc.sets}×${reps}`;
  else if (sc.sets && sc.dist) t = `${sc.sets}×${fmtDist(sc.dist)}`;
  else if (sc.sets && secT) t = `${sc.sets}×${secT}`;
  else if (sc.sets) t = `${sc.sets}×`;
  else if (reps != null) t = /[-/]/.test(reps) ? reps : `${reps} reps`;
  else if (sc.dist) t = fmtDist(sc.dist);
  else if (secT) t = secT;
  else return null;
  if (sc.work && sc.sets) t = `${sc.sets}×${t}`;
  if (sc.rounds) t += ` · ×${sc.rounds}`;
  return side && (reps != null || sc.sec) ? t + "/côté" : t;
}

function loadText(x: Scheme["items"][number]): string {
  return (x.kind === "sub"
    ? (x.reps ? `${fmt(x.v)}×${x.reps}` : ((x.n ?? 1) > 1 ? `${x.n}×${fmt(x.v)}` : fmt(x.v)))
    : (x.pair ? `${x.pair}×` : "") + (x.lest ? "+" : "") + fmt(x.v) + (x.plus ? "+" : "")) + " kg";
}

type Span = { start: number; end: number };
type Chip = { k: string; t: string; span: Span | null; cls?: "vol" | "ld" | "soft" | "zone" | "rpe-lo" | "rpe-mid" | "rpe-hi" };
const perSet = (p: ParsedLine) => p.entries.flatMap(e => Array(Math.max(0, Math.min(e.n || 1, 30))).fill(e.load) as number[]);
const totalSets = (p: ParsedLine) => p.entries.length ? p.entries.reduce((a, e) => a + (e.n || 1), 0) : p.schemes.reduce((a, s) => a + (s.sets || 0), 0);
const spanOf = (toks: (Token | null | undefined)[]): Span | null => {
  const ts = toks.filter((t): t is Token => !!t);
  return ts.length ? { start: Math.min(...ts.map(t => t.start)), end: Math.max(...ts.map(t => t.end)) } : null;
};

function chipsOf(p: ParsedLine) {
  const out: Chip[] = [];
  p.schemes.forEach((sc, i) => {
    const t = schemeText(sc, p.perSide);
    if (t) out.push({ k: "v" + i, t, cls: "vol", span: spanOf([sc.tok, sc.setsRef?.t, sc.secRef?.t]) });
    if (sc.range) {
      const own = sc.items.filter(x => !x.rangeStart && !x.rangeEnd).map(x => x.v);
      const covered = own.length && Math.min(...own) === sc.range[0].v && Math.max(...own) === sc.range[1].v;
      if (!covered) out.push({ k: "r" + i, t: `${fmt(sc.range[0].v)} → ${fmt(sc.range[1].v)} kg`, span: spanOf(sc.range.map(x => x.ref?.t)) });
    }
    // une pastille par charge (« 3×75 kg », « 90 kg »), comme écrit : lisible et passe à la ligne
    sc.items.filter(x => !x.rangeStart && !x.rangeEnd).forEach((x, j) => {
      out.push({ k: `l${i}-${j}`, t: loadText(x), span: spanOf([x.ref?.t, x.nRef?.t]) });
    });
  });
  if (p.pct != null) out.push({ k: "pct", t: `${fmt(p.pct)}${p.pct2 != null ? "-" + fmt(p.pct2) : ""} %${p.pctRef ? " " + p.pctRef : ""}`, span: spanOf([p.pctRefs?.[0].t]) });
  if (p.rpe) {
    const v = p.rpe.v2 ?? p.rpe.v;
    out.push({ k: "rpe", t: `${p.rpe.k} ${fmt(p.rpe.v)}${p.rpe.v2 != null ? "-" + fmt(p.rpe.v2) : ""}`, cls: p.rpe.k === "RPE" ? (v <= 4 ? "rpe-lo" : v <= 7 ? "rpe-mid" : "rpe-hi") : undefined, span: spanOf([p.rpe.ref.t]) });
  }
  p.extras.forEach((x, i) => out.push({ k: "x" + i, t: x.t, cls: x.k === "zone" ? "zone" : undefined, span: spanOf([x.ref?.t]) }));
  if (p.otm) out.push({ k: "otm", t: p.otm, cls: "soft", span: spanOf([p.toks.find(t => t.k === "otm")]) });
  const loads = perSet(p);
  return { list: out, loads, isRamp: new Set(loads).size > 1 && loads.length <= 30 };
}

export type LineSize = "compact" | "normal" | "large";
const SIZES = {
  compact: { name: 12, chip: 11, vol: 11.5, icon: 22, ic: 13, gap: 7, dot: 6, ramp: 15, bar: 4, note: 11.5 },
  normal: { name: 14, chip: 12, vol: 12.5, icon: 28, ic: 16, gap: 10, dot: 7, ramp: 19, bar: 5, note: 13 },
  large: { name: 21, chip: 16, vol: 17, icon: 36, ic: 20, gap: 12, dot: 9, ramp: 26, bar: 6, note: 17 },
};

function chipStyle(c: Chip, z: typeof SIZES.normal, changed: boolean, active: boolean, clickable: boolean, gone = false): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: z.chip, fontWeight: 700, borderRadius: 7, padding: z.chip > 12 ? "2px 9px" : "1px 7px",
    background: C.ghost, color: C.text, whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%", lineHeight: 1.35,
    cursor: clickable ? "pointer" : undefined,
  };
  if (active) return { ...base, background: C.accent, color: "#fff" };
  if (changed) return { ...base, background: C.accentDim, color: C.accent };
  if (gone) return { ...base, opacity: 0.5, textDecoration: "line-through" };
  switch (c.cls) {
    // volume (« 5×5 ») : repère principal par la graisse, pas par un fond noir (trop de bruit)
    case "vol": return { ...base, fontWeight: 800, fontSize: z.vol };
    case "ld": return { ...base, background: "transparent", border: `1px solid ${C.line}` };
    case "soft": return { ...base, background: "transparent", color: C.muted, padding: "0 2px", fontWeight: 600 };
    case "zone": return { ...base, color: C.name };
    case "rpe-lo": return { ...base, color: C.ok };
    case "rpe-mid": return { ...base, color: C.warn };
    case "rpe-hi": return { ...base, color: C.danger };
    default: return base;
  }
}

type ClickFn = (start: number, end: number, rect: DOMRect) => void;

function NameText({ name, raw, z, onTokenClick, activeSpan }: { name: string; raw: string; z: typeof SIZES.normal; onTokenClick?: ClickFn; activeSpan?: Span | null }) {
  // préfixe A/B/C en gris, format en pastille, "+" en accent, (texte) = note. Dans le tiroir, chaque
  // nom d'exercice est cliquable (bornes exactes dans la ligne brute via findNameSpans).
  const pre = name.match(/^([A-H]\d?\s*[-–:.)])\s*/);
  let rest = pre ? name.slice(pre[0].length) : name;
  const fm = rest.match(/^(AMRAP|E\d?MOM|For time|Tabata|Circuit|Superset|Drop set|Rest-pause|Cluster|Pyramide|WOD|Metcon|HIIT)\b\s*:?\s*/i);
  if (fm) rest = rest.slice(fm[0].length);
  const parts = rest.split(/(\([^)]*\)|\s\+\s)/g).filter(Boolean);
  const nameSpans = onTokenClick ? findNameSpans(raw) : [];
  const spanFor = (x: string) => nameSpans.find(s => raw.slice(s.start, s.end).trim() === x.trim()) ?? null;
  return (
    <>
      {pre && <span style={{ color: C.muted, fontWeight: 800, marginRight: 4 }}>{pre[1]}</span>}
      {fm && <span style={{ fontFamily: MONO, fontSize: z.chip - 1.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 5, padding: "0 5px", marginRight: 4, verticalAlign: 1 }}>{fm[1]}</span>}
      {parts.map((x, i) => {
        if (/^\(.*\)$/.test(x)) return <span key={i} style={{ fontWeight: 500, color: C.muted, fontStyle: "italic", marginLeft: 4 }}>{x}</span>;
        if (/^\s\+\s$/.test(x)) return <span key={i} style={{ color: C.accent, fontWeight: 800, padding: "0 3px" }}>+</span>;
        const sp = spanFor(x);
        if (!sp || !onTokenClick) return <span key={i}>{x}</span>;
        const active = !!activeSpan && activeSpan.start === sp.start;
        return (
          <span key={i}
            onClick={e => { e.stopPropagation(); onTokenClick(sp.start, sp.end, e.currentTarget.getBoundingClientRect()); }}
            style={{ cursor: "pointer", borderRadius: 6, padding: "0 3px", margin: "0 -3px", background: active ? C.name : undefined, color: active ? "#fff" : undefined, textDecoration: active ? undefined : `underline dotted ${C.name}`, textUnderlineOffset: 3 }}
          >{x}</span>
        );
      })}
    </>
  );
}

function Ramp({ loads, prevLoads, z }: { loads: number[]; prevLoads: number[] | null; z: typeof SIZES.normal }) {
  const all = prevLoads && prevLoads.length > loads.length ? prevLoads : loads;
  const lo = Math.min(...all), hi = Math.max(...all), H = z.ramp;
  const h = (v: number) => hi === lo ? H - 2 : 6 + (H - 7) * (v - lo) / (hi - lo);
  return (
    <span aria-label={`${loads.length} séries de ${fmt(Math.min(...loads))} à ${fmt(Math.max(...loads))} kg`} style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: H, flexShrink: 0 }}>
      {all.map((v, i) => i >= loads.length
        ? <i key={i} style={{ display: "block", width: z.bar, height: h(v), borderRadius: 2, border: `1.5px solid ${C.setOff}`, boxSizing: "border-box" }} />
        : <i key={i} title={`${fmt(loads[i])} kg`} style={{ display: "block", width: z.bar, height: h(loads[i]), borderRadius: 2, background: prevLoads && prevLoads[i] !== loads[i] ? C.accent : C.set }} />)}
    </span>
  );
}

function Dots({ n, prev, z }: { n: number; prev: number | null; z: typeof SIZES.normal }) {
  if (!n || n > 12) return null;
  const p = prev == null ? n : prev, m = Math.max(n, p), d = z.dot;
  return (
    <span aria-label={`${n} séries`} style={{ display: "inline-flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
      {Array.from({ length: m }, (_, i) => (
        <span key={i} style={{ width: d, height: d, borderRadius: "50%", boxSizing: "border-box", ...(i >= n ? { border: `1.5px solid ${C.setOff}` } : { background: i >= p ? C.accent : C.set }) }} />
      ))}
    </span>
  );
}

export function ExerciseLineView({ text, original, ctx, compact = false, size, adjusting = false, onTokenClick, activeSpan, hideSide = false }: {
  text: string;
  /** Ligne avant ajustement : les chiffres modifiés passent en orange, ancienne valeur barrée. */
  original?: string;
  ctx?: LineContext;
  compact?: boolean;
  /** Prioritaire sur `compact` : "large" = séance en direct. */
  size?: LineSize;
  /** Un ajustement est en cours d'aperçu : signale les lignes non ajustées (ambiguës). */
  adjusting?: boolean;
  /** Tiroir d'édition : pastille ou nom cliqué → bornes du texte brut correspondant. */
  onTokenClick?: ClickFn;
  activeSpan?: Span | null;
  /** Tiroir d'édition : pas de points ni de barres (on édite, la visualisation est sur les cartes). */
  hideSide?: boolean;
}) {
  const z = SIZES[size ?? (compact ? "compact" : "normal")];
  const p = parseLine(text);
  const prev = original !== undefined && original !== text ? parseLine(original) : null;
  const cat = ctx?.cat ?? lineCategory(p);
  const role = ctx?.role ?? "";
  const indent: React.CSSProperties = role === "child" ? { marginLeft: z.icon * 0.6, borderLeft: `2px solid ${C.accentDim}`, paddingLeft: z.gap } : {};

  const icon = (c: ExerciseCategory | null) => {
    if (!c) return <div style={{ width: z.icon, height: z.icon, flexShrink: 0 }} />;
    const st = FAMILY_STYLE[CATEGORY_FAMILY[c]];
    return (
      <div title={CATEGORY_LABEL[c]} style={{ width: z.icon, height: z.icon, borderRadius: z.icon / 3, background: st.bg, color: st.fg, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <svg width={z.ic} height={z.ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[c]} /></svg>
      </div>
    );
  };

  if (p.kind === "note" || !text.trim()) {
    return (
      <div style={{ display: "flex", gap: z.gap, alignItems: "flex-start", ...indent }}>
        {icon(null)}
        <div style={{ fontSize: z.note, fontWeight: 500, fontStyle: "italic", color: C.muted, lineHeight: 1.35, minWidth: 0, overflowWrap: "anywhere" }}>{text}</div>
      </div>
    );
  }
  if (p.kind === "fallback") {
    return (
      <div style={{ display: "flex", gap: z.gap, alignItems: "flex-start", ...indent }}>
        {icon(cat)}
        <div style={{ fontSize: z.name, fontWeight: 600, color: C.muted, lineHeight: 1.35, minWidth: 0, overflowWrap: "anywhere" }}>
          {prev && <div style={{ fontSize: z.name - 2, textDecoration: "line-through", color: "#b8bfc4" }}>{original}</div>}
          {text}
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "0 6px", marginLeft: 6, fontStyle: "normal", whiteSpace: "nowrap" }}>texte brut</span>
        </div>
      </div>
    );
  }

  const c = chipsOf(p), pc = prev ? chipsOf(prev) : null;
  const side = c.isRamp || (pc && pc.isRamp && c.loads.length)
    ? <Ramp loads={c.loads} prevLoads={pc ? pc.loads : null} z={z} />
    : <Dots n={totalSets(p)} prev={prev ? totalSets(prev) : null} z={z} />;
  const chipEls = [
    ...c.list.map(x => {
      const old = pc?.list.find(y => y.k === x.k);
      const changed = !!pc && (!old || old.t !== x.t);
      const clickable = !!onTokenClick && !!x.span;
      const active = !!activeSpan && !!x.span && activeSpan.start === x.span.start;
      return (
        <span key={x.k} style={chipStyle(x, z, changed, active, clickable)}
          onClick={clickable ? e => { e.stopPropagation(); onTokenClick!(x.span!.start, x.span!.end, e.currentTarget.getBoundingClientRect()); } : undefined}>
          {changed && old && old.t.length <= 22 && <><s style={{ opacity: 0.55, fontWeight: 500 }}>{old.t}</s>{" → "}</>}
          {x.t}
        </span>
      );
    }),
    ...(pc ? pc.list.filter(y => !c.list.some(x => x.k === y.k)).map(y => <span key={"g" + y.k} style={chipStyle(y, z, false, false, false, true)}>{y.t}</span>) : []),
  ];
  const skipped = adjusting && !prev && p.ambiguous;

  return (
    <div style={{ display: "flex", gap: z.gap, alignItems: "flex-start", ...indent }}>
      {icon(role === "header" ? null : cat)}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: z.gap / 2.5 }}>
        {p.name && (
          <div style={{ fontSize: z.name, fontWeight: role === "header" ? 800 : 700, color: C.text, lineHeight: 1.3, overflowWrap: "anywhere" }}>
            <NameText name={p.name} raw={text} z={z} onTokenClick={onTokenClick} activeSpan={activeSpan} />
          </div>
        )}
        {chipEls.length > 0 && (
          <div style={{ display: "flex", gap: z.chip > 12 ? 6 : 4, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
            {chipEls}
          </div>
        )}
        {skipped && <div style={{ fontSize: 11, fontWeight: 700, color: C.warn }}>Non ajustée : lecture incertaine</div>}
      </div>
      {/* Points (1 par série) ou barres de montée, calés à droite de la ligne. */}
      {!hideSide && side && <div style={{ flexShrink: 0, alignSelf: "center", display: "flex", justifyContent: "flex-end", maxWidth: z.ramp * 4 }}>{side}</div>}
    </div>
  );
}

/* Synthèse d'un ajustement, une phrase par séance, affichée sous le titre de la séance partout :
   - aperçu (`adjustPct`) : ce que le moteur va changer (charges, séries, lignes non ajustées) ;
   - décision déjà appliquée (`originalNotes` = notes d'avant) : ce qui a changé par rapport au plan. */
export function sessionSynthesisText(notes: string | null | undefined, adjustPct?: number | null, originalNotes?: string | null): string {
  if (adjustPct) return adjustNotes(notes ?? "", adjustPct).summary;
  if (originalNotes != null && originalNotes !== notes) return describeChange(originalNotes, notes);
  return "";
}

export function SessionSynthesis({ notes, adjustPct, originalNotes, compact = false, style }: {
  notes: string | null | undefined;
  adjustPct?: number | null;
  originalNotes?: string | null;
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  const t = sessionSynthesisText(notes, adjustPct, originalNotes);
  if (!t) return null;
  return (
    <div style={{ fontSize: compact ? 10.5 : 12.5, fontWeight: 600, color: "#62686e", lineHeight: 1.45, background: "rgba(212,64,0,.06)", borderRadius: compact ? 8 : 12, padding: compact ? "6px 8px" : "8px 11px", ...style }}>
      {t}
    </div>
  );
}

/** Données d'affichage de chaque ligne d'une séance (contexte + ajustement éventuel) : calculées une
    fois par les cartes, transmises aux rendus personnalisés (drag & drop) via renderExerciseLine. */
export interface ExerciseLineViewData { text: string; original?: string; ctx: LineContext; adjusting: boolean }
/** Liste de lignes enrichies prête à poser dans une carte (aperçus, listes de choix, exercices floutés). */
export function ExerciseLinesBox({ lines, adjustPct, compact = true, max, style }: { lines: string[]; adjustPct?: number | null; compact?: boolean; max?: number; style?: React.CSSProperties }) {
  const views = exerciseViews(lines, adjustPct);
  const shown = max ? views.slice(0, max) : views;
  const more = views.length - shown.length;
  if (!shown.length) return null;
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(0,0,0,.07)", background: "#fff", ...style }}>
      {shown.map((v, i) => (
        <div key={i} style={{ padding: compact ? "6px 9px" : "9px 12px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
          <ExerciseLineView text={v.text} original={v.original} ctx={v.ctx} adjusting={v.adjusting} compact={compact} />
        </div>
      ))}
      {more > 0 && <div style={{ padding: "5px 9px", fontSize: 11, fontWeight: 700, color: "#8a8f94", borderTop: "1px solid rgba(0,0,0,.07)" }}>+{more} autre{more > 1 ? "s" : ""}</div>}
    </div>
  );
}

export function exerciseViews(lines: string[], adjustPct?: number | null): ExerciseLineViewData[] {
  const ctxs = sessionLineContexts(lines);
  return lines.map((line, i) => {
    if (!adjustPct) return { text: line, ctx: ctxs[i], adjusting: false };
    return { text: adjustNotes(line, adjustPct).text, original: line, ctx: ctxs[i], adjusting: true };
  });
}
