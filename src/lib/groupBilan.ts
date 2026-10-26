/* Bilan du groupe (2026-10-26) : le bilan vu par le coach pour tous ses sportifs inscrits, ouvert
   depuis les liens « Bilan › » du calendrier en vue Groupe. Quatre écrans, chacun avec son seuil de
   données (sous le seuil, l'écran saute, comme le bilan individuel) :
   - qui décroche : check-ins manqués les jours de séance, jours fatigué ;
   - tes séances plus dures que prévu : même séance (même nom) sur plusieurs sportifs ;
   - les conseils au groupe : conseils confirmés, sportif par sportif (juge d'adviceJudge.ts) ;
   - la charge hors zone : jours au-dessus / en dessous de la zone de charge (ACWR).
   Un seul sportif avec des données suffit (2026-10-26, Gildas) : un coach qui débute n'en a souvent
   qu'un actif. Jamais de moyenne du groupe : elle cache justement le sportif qui décroche. Sportifs sans compte
   exclus (pas de check-in). Historique synthétique de l'onboarding exclu, comme partout. */

import { acwrSeries, sessionLoad, type LoadPoint } from "@/lib/trainingLoad";
import { qualitativeDifficulty, type DifficultyWord } from "@/lib/autoregulation";
import { computeWellnessBaselineAt, relativeZoneLabel } from "@/lib/wellnessBaseline";
import { outcomeRight } from "@/lib/adviceJudge";
import { allVerdicts, isSynthetic, type BilanCheckin, type BilanPeriod, type BilanSession, type RecalEvent } from "@/lib/bilan";

export type GroupAthlete = {
  id: string; name: string; signupAt: string;
  shift: number; shiftHigh: number; events: RecalEvent[];
  sessions: BilanSession[]; checkins: BilanCheckin[];
};

/* Jour de séance du sportif : check-in fait (frais/équilibré), fait mais fatigué, ou manqué. */
export type DayMark = "ok" | "tired" | "missed";
export type GroupSlide =
  | { kind: "g_decroche"; rows: { name: string; flag: string | null; marks: DayMark[]; missed: number; tired: number; days: number }[]; regular: number }
  | { kind: "g_seances"; rows: { name: string; planned: DifficultyWord; harder: number; total: number; athletes: number }[] }
  | { kind: "g_conseils"; right: number; judged: number; rows: { name: string; right: number; judged: number }[] }
  | { kind: "g_charge"; rows: { name: string; above: number; below: number; days: number }[] };

export type GroupBilan = { period: BilanPeriod; slides: GroupSlide[]; title: string };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const first = (name: string) => name.split(" ")[0];
const WORD_ORDER: DifficultyWord[] = ["légère", "modérée", "dure", "très dure"];
const wordIdx = (n: number) => WORD_ORDER.indexOf(qualitativeDifficulty(n));
const TIRED = new Set(["Fatigué", "Zone prudente", "Zone récupération"]);

/* Données réelles d'un sportif (historique d'inscription retiré), jusqu'à la fin de la période. */
function clean(a: GroupAthlete, end: string) {
  return {
    sessions: a.sessions.filter(s => !isSynthetic(s, a.signupAt) && s.date <= end),
    checkins: a.checkins.filter(c => !isSynthetic(c, a.signupAt) && c.date <= end),
  };
}

function decroche(period: BilanPeriod, end: string, athletes: GroupAthlete[]): GroupSlide | null {
  const rows: Extract<GroupSlide, { kind: "g_decroche" }>["rows"] = [];
  for (const a of athletes) {
    const { sessions, checkins } = clean(a, end);
    const days = Array.from(new Set(sessions.filter(s => s.date >= period.start && s.date <= end).map(s => s.date))).sort();
    if (days.length < 3) continue;
    const byDate = new Map(checkins.map(c => [c.date, c]));
    const marks: DayMark[] = days.map(d => {
      const c = byDate.get(d);
      if (!c) return "missed";
      // Même zone que la carte du jour : relative à sa propre norme dès qu'il a l'historique.
      const b = computeWellnessBaselineAt(checkins.filter(x => x.date < d && x.date >= addDays(d, -35)) as never, c as never);
      return TIRED.has(relativeZoneLabel(b)) ? "tired" : "ok";
    });
    const missed = marks.filter(m => m === "missed").length, tired = marks.filter(m => m === "tired").length;
    const lastFour = marks.slice(-4);
    const flag = lastFour.length === 4 && lastFour.every(m => m === "missed") ? "Plus de check-in"
      : missed >= 3 && missed / days.length >= 0.4 ? "Check-ins manqués"
      : tired >= 3 && tired / (days.length - missed || 1) >= 0.4 ? "Souvent fatigué"
      : null;
    rows.push({ name: first(a.name), flag, marks: marks.slice(-12), missed, tired, days: days.length });
  }
  if (!rows.length) return null;
  const score = (r: typeof rows[number]) => (r.flag ? 100 : 0) + (r.missed + r.tired) / r.days;
  rows.sort((x, y) => score(y) - score(x));
  const flagged = rows.filter(r => r.flag);
  return { kind: "g_decroche", rows: (flagged.length ? flagged : rows).slice(0, 4), regular: rows.length - flagged.length };
}

/* Même séance = même nom (casse et espaces ignorés) : c'est le cas quand le coach envoie une séance
   ou un programme au groupe. Plus dure = mot ressenti au-dessus du mot prévu (règle du bilan). */
function seances(period: BilanPeriod, end: string, athletes: GroupAthlete[]): GroupSlide | null {
  const by = new Map<string, { name: string; harder: number; total: number; planned: number[]; who: Set<string> }>();
  for (const a of athletes) {
    for (const s of clean(a, end).sessions) {
      if (s.date < period.start || !s.done || s.rpe === null || !s.target_difficulty || !s.name) continue;
      const k = s.name.trim().toLowerCase().replace(/\s+/g, " ");
      const g = by.get(k) ?? { name: s.name.trim(), harder: 0, total: 0, planned: [], who: new Set<string>() };
      g.total++; g.planned.push(s.target_difficulty); g.who.add(a.id);
      if (wordIdx(s.rpe) > wordIdx(s.target_difficulty)) g.harder++;
      by.set(k, g);
    }
  }
  const groups = Array.from(by.values()).filter(g => g.total >= 5);
  if (!groups.length) return null;
  groups.sort((x, y) => y.harder / y.total - x.harder / x.total || y.total - x.total);
  const modeWord = (xs: number[]) => {
    const c = new Map<DifficultyWord, number>();
    for (const x of xs) { const w = qualitativeDifficulty(x); c.set(w, (c.get(w) ?? 0) + 1); }
    return Array.from(c.entries()).sort((p, q) => q[1] - p[1])[0][0];
  };
  return { kind: "g_seances", rows: groups.slice(0, 3).map(g => ({ name: g.name, planned: modeWord(g.planned), harder: g.harder, total: g.total, athletes: g.who.size })) };
}

function conseils(period: BilanPeriod, end: string, athletes: GroupAthlete[]): GroupSlide | null {
  const rows: Extract<GroupSlide, { kind: "g_conseils" }>["rows"] = [];
  for (const a of athletes) {
    const { sessions, checkins } = clean(a, end);
    const cells = allVerdicts({ sessions, checkins, signupAt: a.signupAt, shift: a.shift, shiftHigh: a.shiftHigh, events: a.events })
      .filter(c => c.date >= period.start && c.date <= end);
    if (!cells.length) continue;
    rows.push({ name: first(a.name), right: cells.filter(c => outcomeRight(c.outcome)).length, judged: cells.length });
  }
  const judged = rows.reduce((t, r) => t + r.judged, 0);
  if (judged < 5) return null;
  rows.sort((x, y) => x.right / x.judged - y.right / y.judged || y.judged - x.judged);
  return { kind: "g_conseils", right: rows.reduce((t, r) => t + r.right, 0), judged, rows: rows.slice(0, 5) };
}

/* Même calcul que l'écran charge du bilan individuel : ACWR à partir de la 1re séance, compté
   seulement après 28 jours d'historique. Zone 0,8 à 1,3. */
function charge(period: BilanPeriod, end: string, athletes: GroupAthlete[]): GroupSlide | null {
  const rows: Extract<GroupSlide, { kind: "g_charge" }>["rows"] = [];
  for (const a of athletes) {
    const sessions = clean(a, end).sessions.filter(s => s.done);
    if (!sessions.length) continue;
    const firstDate = sessions.reduce((m, s) => (s.date < m ? s.date : m), "9999-12-31");
    const mature = addDays(firstDate, 28);
    const lead = addDays(period.start, -42);
    const from = lead > firstDate ? lead : firstDate;
    const series: LoadPoint[] = [];
    for (let d = from; d <= end; d = addDays(d, 1)) series.push({ date: d, load: sessions.filter(s => s.date === d).reduce((t, s) => t + sessionLoad(s), 0) });
    const ac = acwrSeries(series);
    const inP = ac.filter((p, i) => series[i].date >= period.start && series[i].date >= mature && p.value !== null);
    if (inP.length < (period.kind === "week" ? 5 : 10)) continue;
    rows.push({ name: first(a.name), above: inP.filter(p => p.value! > 1.3).length, below: inP.filter(p => p.value! < 0.8).length, days: inP.length });
  }
  if (!rows.length) return null;
  const out = (r: typeof rows[number]) => (r.above + r.below) / r.days;
  rows.sort((x, y) => out(y) - out(x));
  return { kind: "g_charge", rows };
}

export function computeGroupBilan(input: { period: BilanPeriod; today: string; athletes: GroupAthlete[] }): GroupBilan {
  const { period, today, athletes } = input;
  const end = period.end < today ? period.end : today;
  const slides = [decroche(period, end, athletes), seances(period, end, athletes), conseils(period, end, athletes), charge(period, end, athletes)]
    .filter((x): x is GroupSlide => !!x);
  const fmtD = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
  const title = period.kind === "week" ? `Semaine du ${fmtD(period.start)}` : period.kind === "month" ? (MONTHS[Number(period.start.slice(5, 7)) - 1].replace(".", "") + " " + period.start.slice(0, 4)) : `Depuis le ${fmtD(period.start)}`;
  return { period, slides, title };
}
