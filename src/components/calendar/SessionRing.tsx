import { AGG_BANDS } from "@/lib/metricCards";
import { difficultyWord } from "@/lib/loadRule";
import { braiseColor, chargeColor } from "@/lib/ringColors";
import { sessionZone } from "@/lib/sessionInsight";
import type { ResultSession } from "@/lib/sessionInsight";
import { CR10_LABELS } from "@/components/ui/ScaleBars";
import { pctToPoints, zoneRange, type AutoregDir } from "@/lib/autoregulation";

/* Mini anneau d'une séance dans le Planning (06/11, idée de Gildas : un seul anneau par séance, plus de
   barre ni d'anneau récup en tête de colonne).
   - Séance à venir : la charge prévue (sa difficulté), aux couleurs de l'onglet Charge (orange).
   - Aujourd'hui et passé : l'anneau de décision avec sa zone en pointillé (Braise : écart à la zone) ;
     séance faite = curseur sur l'effort ressenti, trait sur le prévu. */
const A0 = -120, A1 = 120, MIN = 1, MAX = 10;
const ang = (v: number) => A0 + ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * (A1 - A0);
function pol(cx: number, cy: number, r: number, d: number): [number, number] { const a = ((d - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
const P = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const arc = (cx: number, cy: number, r: number, f: number, t: number) => `M ${P(pol(cx, cy, r, f))} A ${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${P(pol(cx, cy, r, t))}`;
function sector(cx: number, cy: number, ri: number, ro: number, a0: number, a1: number) {
  const rc = ((ro - ri) / 2).toFixed(2), b = a1 - a0 > 180 ? 1 : 0;
  return `M ${P(pol(cx, cy, ro, a0))} A ${ro} ${ro} 0 ${b} 1 ${P(pol(cx, cy, ro, a1))} A ${rc} ${rc} 0 0 1 ${P(pol(cx, cy, ri, a1))} A ${ri} ${ri} 0 ${b} 0 ${P(pol(cx, cy, ri, a0))} A ${rc} ${rc} 0 0 1 ${P(pol(cx, cy, ro, a0))} Z`;
}

export type SessionRingSession = { date: string; done?: boolean | null; rpe?: number | null; target_difficulty?: number | null } & Record<string, unknown>;

/* Libellé de difficulté (échelle CR-10) au centre d'un anneau : sur deux lignes s'il est long (06/11, Gildas). */
export function ringLabelLines(label: string): string[] {
  if (label.length <= 9 || !label.includes(" ")) return [label];
  const words = label.split(" "); let best = [label]; let bestGap = Infinity;
  for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(" "), b = words.slice(k).join(" "), gap = Math.abs(a.length - b.length); if (gap < bestGap) { bestGap = gap; best = [a, b]; } }
  return best;
}

/* Même mot que l'encadré du jour (loadRule.difficultyWord, 06/11). */
export function sessionRingWord(v: number): string { return difficultyWord(v); }

/* Anneau du jour calculé comme sur /today (06/11, bug : le Planning lisait la zone stockée, /today la recalcule
   depuis le conseil du matin). Reprend AutoregButtons : zone = autour de la cible conseillée (prévu + reco),
   autour de la valeur appliquée une fois décidé, zone de la séance faite (doneZone) sinon. */
export type SessionRingState = { value: number; zone: { low: number; high: number } | null };
export function todayRingState(s: { done?: boolean | null; rpe?: number | null; target_difficulty?: number | null }, o: {
  suggestion: { dir: AutoregDir; reco: number } | null | undefined; decided: boolean; doneZone?: { low: number; high: number } | null; locked: boolean;
}): SessionRingState | null {
  const target = s.target_difficulty ?? null;
  if (s.done) {
    const v = s.rpe ?? target; if (!v) return null;
    if (o.locked) return { value: v, zone: null };
    const z = o.doneZone ?? (target ? (({ zoneLow, zoneHigh }) => ({ low: zoneLow, high: zoneHigh }))(zoneRange(Math.round(target), "low")) : null);
    return { value: v, zone: z };
  }
  if (!target) return null;
  if (o.locked) return { value: target, zone: null };
  const zr = o.decided ? zoneRange(Math.round(target), o.suggestion?.dir ?? "low")
    : o.suggestion ? zoneRange(Math.round(target + pctToPoints(o.suggestion.reco)), o.suggestion.dir)
    : zoneRange(Math.round(target), "low");
  return { value: target, zone: { low: zr.zoneLow, high: zr.zoneHigh } };
}

export default function SessionRing({ session, today, size = 44, dark = false, state }: { session: SessionRingSession; today: string; size?: number;
  /* Aujourd'hui : état calculé comme sur /today (todayRingState) ; prioritaire sur la zone stockée. */
  state?: SessionRingState | null;
  /* Version Planning : grand arc sur fond blanc, libellé au centre (06/11). */
  dark?: boolean }) {
  const future = session.date > today && !session.done;
  const v = state ? state.value : session.done ? session.rpe ?? null : session.target_difficulty ?? null;
  if (!v) return null;
  const z = state ? state.zone : future ? null : sessionZone(session as unknown as ResultSession);
  const col = (u: number) => (z ? braiseColor(u, z.low, z.high) : chargeColor(0.2 + (0.8 * (u - MIN)) / (MAX - MIN)));
  const R = 36, SW = 11, CX = 50, CY = 50, H = 80, end = ang(v), n = 22;
  const [sx, sy] = pol(CX, CY, R, A0), [ex, ey] = pol(CX, CY, R, end);
  const planned = session.done ? session.target_difficulty ?? null : null;
  const inZ = z && Math.round(v) >= z.low && Math.round(v) <= z.high;
  const label = future ? `Charge prévue : ${sessionRingWord(v)}` : session.done ? `Ressentie ${sessionRingWord(v).toLowerCase()}${z ? (inZ ? ", dans la zone" : v > z.high ? ", au-dessus de la zone" : ", sous la zone") : ""}` : `Prévue ${sessionRingWord(v).toLowerCase()}${z ? (inZ ? ", dans la zone" : v > z.high ? ", au-dessus de la zone" : ", sous la zone") : ""}`;
  if (dark) {
    /* Version Planning (06/11, Gildas : fond blanc finalement) : l'arc prend toute la place de l'ancien rond,
       même style que l'anneau de l'éditeur, libellé de difficulté en noir au centre. */
    const r = 40, sw = 10, cx = 50, cy = 50, VH = 84, e2 = ang(v);
    const [s2x, s2y] = pol(cx, cy, r, A0), [e2x, e2y] = pol(cx, cy, r, e2);
    /* Au centre (06/11, Gildas) : à venir = la difficulté prévue ; aujourd'hui et passé = le statut de /today
       (« Dans la zone », « Au-dessus de la zone »…). */
    const status = !z ? (CR10_LABELS[Math.round(v)] ?? "") : session.done && session.rpe == null ? "Non notée"
      : Math.round(v) < z.low ? "Sous la zone" : Math.round(v) > z.high ? "Au-dessus de la zone" : "Dans la zone";
    const lines = ringLabelLines(status);
    return (
      <svg viewBox={`0 0 100 ${VH}`} width={size} height={Math.round((size * VH) / 100)} role="img" aria-label={label} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
        <title>{label}</title>
        <path d={arc(cx, cy, r, A0, A1)} fill="none" stroke="#ebe9e4" strokeWidth={sw} strokeLinecap="round" />
        {Array.from({ length: n }, (_, i) => (
          <path key={i} d={arc(cx, cy, r, A0 + ((e2 - A0) * i) / n, A0 + ((e2 - A0) * (i + 1.05)) / n)} fill="none" stroke={col(MIN + ((v - MIN) * (i + 0.5)) / n)} strokeWidth={sw} />
        ))}
        <circle cx={s2x} cy={s2y} r={sw / 2} fill={col(MIN)} />
        {z && <path d={sector(cx, cy, r - sw * 0.95, r + sw * 0.95, ang(z.low - 0.35), ang(z.high + 0.35))} fill="none" stroke="rgba(23,27,31,.6)" strokeWidth={1.6} strokeDasharray="3 2.5" />}
        <circle cx={e2x} cy={e2y} r={sw * 0.6} fill={inZ ? "#2a8045" : "#18181b"} stroke="#fff" strokeWidth={1.6} />
        {size >= 40 && lines.map((ln, k) => <text key={k} x={cx} y={cy + 4 + (k - (lines.length - 1) / 2) * 13} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontWeight={900} fontSize={12.5} fill="#171b1f">{ln}</text>)}
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 100 ${H}`} width={size} height={Math.round((size * H) / 100)} role="img" aria-label={label} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      <title>{label}</title>
      <path d={arc(CX, CY, R, A0, A1)} fill="none" stroke="#ebe9e4" strokeWidth={SW} strokeLinecap="round" />
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={arc(CX, CY, R, A0 + ((end - A0) * i) / n, A0 + ((end - A0) * (i + 1.05)) / n)} fill="none" stroke={col(MIN + ((v - MIN) * (i + 0.5)) / n)} strokeWidth={SW} />
      ))}
      <circle cx={sx} cy={sy} r={SW / 2} fill={col(MIN)} />
      <circle cx={ex} cy={ey} r={SW / 2} fill={col(v)} />
      {z && <path d={sector(CX, CY, R - SW * 0.95, R + SW * 0.95, ang(z.low - 0.35), ang(z.high + 0.35))} fill="none" stroke="rgba(23,27,31,.6)" strokeWidth={1.6} strokeDasharray="3 2.5" />}
      <circle cx={ex} cy={ey} r={SW * 0.55} fill={inZ ? "#2a8045" : "#18181b"} stroke="#fff" strokeWidth={1.6} />
    </svg>
  );
}

/* Jour sans séance (06/11, Gildas : la décision des jours de repos, comme /today) : l'anneau lit la charge
   de la semaine (onglet Charge) avec sa zone optimale, même style que l'anneau de séance du Planning.
   Sans charge connue (jour à venir, historique court) : anneau vide « Repos ». */
export function RestDayRing({ pos, size = 92 }: { pos: number | null; size?: number }) {
  const [zl, zh] = [AGG_BANDS.charge[1].from, AGG_BANDS.charge[1].to];
  const toV = (p: number) => MIN + (MAX - MIN) * Math.max(0, Math.min(1, p));
  const r = 40, sw = 10, cx = 50, cy = 50, VH = 84, n = 22;
  const status = pos === null ? "Repos" : pos < zl ? "Sous la zone" : pos > zh ? "Au-dessus de la zone" : "Dans la zone";
  const lines = ringLabelLines(status);
  const label = pos === null ? "Jour de repos" : `Jour de repos, charge de la semaine : ${status.toLowerCase()}`;
  const v = pos === null ? null : toV(pos), lo = toV(zl), hi = toV(zh);
  const col = (u: number) => braiseColor(u, lo, hi);
  const e2 = v !== null ? ang(v) : A0;
  const [s2x, s2y] = pol(cx, cy, r, A0), [e2x, e2y] = pol(cx, cy, r, e2);
  const inZ = pos !== null && pos >= zl && pos <= zh;
  const fs = lines.length > 2 ? 11 : 12.5, lh = lines.length > 2 ? 11.5 : 13;
  return (
    <svg viewBox={`0 0 100 ${VH}`} width={size} height={Math.round((size * VH) / 100)} role="img" aria-label={label} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      <title>{label}</title>
      <path d={arc(cx, cy, r, A0, A1)} fill="none" stroke="#ebe9e4" strokeWidth={sw} strokeLinecap="round" />
      {v !== null && Array.from({ length: n }, (_, i) => (
        <path key={i} d={arc(cx, cy, r, A0 + ((e2 - A0) * i) / n, A0 + ((e2 - A0) * (i + 1.05)) / n)} fill="none" stroke={col(MIN + ((v - MIN) * (i + 0.5)) / n)} strokeWidth={sw} />
      ))}
      {v !== null && <circle cx={s2x} cy={s2y} r={sw / 2} fill={col(MIN)} />}
      {v !== null && <path d={sector(cx, cy, r - sw * 0.95, r + sw * 0.95, ang(lo - 0.35), ang(hi + 0.35))} fill="none" stroke="rgba(23,27,31,.6)" strokeWidth={1.6} strokeDasharray="3 2.5" />}
      {v !== null && <circle cx={e2x} cy={e2y} r={sw * 0.6} fill={inZ ? "#2a8045" : "#18181b"} stroke="#fff" strokeWidth={1.6} />}
      {size >= 40 && lines.map((ln, k) => <text key={k} x={cx} y={cy + 4 + (k - (lines.length - 1) / 2) * lh} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontWeight={900} fontSize={fs} fill={pos === null ? "#8a8f94" : "#171b1f"}>{ln}</text>)}
    </svg>
  );
}
