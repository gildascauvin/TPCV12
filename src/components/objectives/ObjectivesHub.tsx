"use client";

/* Objectifs (23/11/2026, POC JXgkB7TK) : les tests deviennent des objectifs. Ce composant porte l'état des
   objectifs (1 à 3, chacun avec sa cible et sa date) et le carrousel « Tes objectifs » ; la liste des tests,
   les filtres, la recommandation, la fiche et toutes les saisies restent ceux de TestsPanel (layout
   « objectives »), qui reçoit l'adaptateur via `children(api)`. Les objectifs hors test (régularité,
   récupération, jour J) ont leur propre petite fiche ici. Stockage v1 : user_metadata.objectives = { items }. */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadLibrary, Carousel, Cover } from "@/components/programs/ProgramStoreSections";
import { servedBy } from "@/lib/programServes";
import { notifyFollowObjective } from "@/components/objectives/FollowProgramObjectives";
import PlanTestSheet from "@/components/objectives/PlanTestSheet";
import type { LibraryProgram } from "@/components/programs/ProgramLibraryBrowser";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { sportIllustration } from "@/lib/sportPhoto";
import { METRIC_DISPLAY, type CardInsight, type CardStatus, type MetricKey } from "@/lib/testNorms";
import { mediaForLine, ytFrame } from "@/lib/exerciseDemos";
import type { TestsObjectivesAdapter } from "@/components/tests/TestsPanel";
import {
  MAX_OBJECTIVES, defById, measureObjective, fmtValue, addDays, todayIso, latestByMetric, lowerIsBetter, metricOfName,
  testLibrary, groupOf, photoForGroup, REGULARITY, RECOVERY, FORME, servesObjective, servedSessionsText,
  type ObjectiveData, type ObjectiveDef, type ObjectiveItem, type ObjectiveProgress,
} from "@/lib/objectives";

const MONO = "var(--font-mono), ui-monospace, Menlo, monospace";
const ACCENT = "#f04a08";
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const fmtDate = (iso: string) => { const d = new Date(iso + "T12:00:00"); return `${d.getDate() === 1 ? "1er" : d.getDate()} ${MONTHS[d.getMonth()]}`; };
const weeksBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86400000)));
const WEEKS = [6, 8, 12, 16];
const COUNT_BACK_DAYS = 28;
const kicker: React.CSSProperties = { fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: ACCENT };

const RANK: Record<CardStatus, number> = { red: 0, amber: 1, green: 2 };
const STATUS_TXT: Record<CardStatus, string> = { red: "▼ Point faible", amber: "◆ Proche", green: "✓ Point fort" };
const STATUS_COLOR: Record<CardStatus, string> = { red: "#ff8a7a", amber: "#ffc24a", green: "#7fdb8f" };
function statusFor(metric: MetricKey, insights: CardInsight[], value: number | undefined): { status: CardStatus; gap: string | null } | null {
  const c = insights.filter(i => i.primaryMetric === metric && i.status).sort((a, b) => RANK[a.status!] - RANK[b.status!])[0];
  if (!c?.status) return null;
  const unit = METRIC_DISPLAY[metric]?.unit ?? "";
  const refNum = c.refValueDisplay ? parseFloat(c.refValueDisplay.replace(",", ".").replace(/[^0-9.-]/g, "")) : NaN;
  let gap: string | null = null;
  if (value != null && Number.isFinite(refNum) && c.status !== "green") {
    const d = lowerIsBetter(metric) ? refNum - value : value - refNum;
    if (Math.abs(d) > 0) gap = `${d > 0 ? "+" : "−"}${fmtValue(Math.abs(d), unit).trim()}`;
  }
  return { status: c.status, gap };
}
function exerciseImage(d: ObjectiveDef): string | null {
  if (d.measure.kind !== "metric") return null;
  const m = mediaForLine(METRIC_DISPLAY[d.measure.metric]?.name ?? "");
  return !m ? null : m.kind === "demo" ? ytFrame(m.items[0].yt) : m.src;
}
function Bar({ pct }: { pct: number }) {
  return <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.18)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${Math.max(3, Math.min(100, pct))}%`, background: "linear-gradient(90deg,#f04a08,#ff8a55)", borderRadius: 3 }} /></div>;
}
const progressPct = (p: ObjectiveProgress) => p.start === null || p.target === null || p.current === null || p.target === p.start ? 0 : ((p.current - p.start) / (p.target - p.start)) * 100;

/* Carte d'un objectif suivi (23/11, « c'est la récompense ») : gain depuis le départ en avant, valeur
   actuelle en grand, cible, piste de progression qui se remplit à l'arrivée, compte à rebours et séances. */
function RewardCard({ index, photo, label, current, target, hint, pct, gain, daysLeft, deadline, sessions, sessionsText, reached, onOpen }: {
  index: number; photo: string; label: string; current: string | null; target: string | null; hint: string; pct: number | null; gain: string | null;
  daysLeft: number; deadline: string; sessions: number; sessionsText: string | null; reached: boolean; onOpen: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(true); return; }
    const t = window.setTimeout(() => setShown(true), 180 + index * 90);
    return () => window.clearTimeout(t);
  }, [index]);
  const fill = pct === null ? 0 : Math.max(4, Math.min(100, pct));
  const pill = { fontSize: 11.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", whiteSpace: "nowrap" as const };
  return (
    <button type="button" className="tpc-press" onClick={onOpen} aria-label={`${label}${current && target ? `, ${current} vers ${target}` : ""}`}
      style={{ position: "relative", flex: "0 0 272px", height: 268, scrollSnapAlign: "start", borderRadius: 28, overflow: "hidden", padding: 0, color: "#fff", textAlign: "left", cursor: "pointer",
        border: reached ? "2px solid #ffc861" : "1px solid rgba(255,255,255,.16)", background: "#0d1114",
        boxShadow: reached ? "0 0 0 4px rgba(255,200,97,.14), 0 18px 40px rgba(0,0,0,.45)" : "0 18px 40px rgba(0,0,0,.45)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.15) brightness(.42)", transform: shown ? "scale(1)" : "scale(1.06)", transition: "transform 1.2s cubic-bezier(.22,1,.36,1)" }} />
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(7,10,13,.25) 0%,rgba(7,10,13,.15) 30%,rgba(7,10,13,.92) 72%)" }} />
      <span style={{ position: "absolute", left: -60, bottom: -80, width: 260, height: 200, borderRadius: "50%", background: reached ? "radial-gradient(closest-side,rgba(255,200,97,.35),transparent)" : "radial-gradient(closest-side,rgba(240,74,8,.38),transparent)", opacity: shown ? 0.4 + (fill / 100) * 0.6 : 0, transition: "opacity 1s ease-out" }} />

      <span style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span style={{ ...pill, ...(reached ? { background: "#ffc861", color: "#1a1206" } : {}) }}>
          {reached ? "✓ Objectif atteint" : daysLeft > 0 ? `J-${daysLeft}` : "Échéance passée"}
        </span>
        {sessions > 0 && <span style={pill} title={sessionsText ?? undefined} aria-label={sessionsText ?? undefined}>🔥 {sessions} séance{sessions > 1 ? "s" : ""}</span>}
      </span>

      <span style={{ position: "absolute", left: 16, right: 16, bottom: 16, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {current && target ? (
          <>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{current}</span>
              {gain && <span style={{ fontSize: 13, fontWeight: 800, color: "#7ee2a0", padding: "2px 7px", borderRadius: 8, background: "rgba(126,226,160,.14)" }}>▲ {gain}</span>}
            </span>
            {/* Piste : départ → actuel (rempli) → cible (drapeau) */}
            <span style={{ position: "relative", display: "block", height: 10, marginTop: 14, borderRadius: 5, background: "rgba(255,255,255,.14)" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "100%", borderRadius: 5, transformOrigin: "left", transform: `scaleX(${shown ? fill / 100 : 0})`, transition: "transform 1.1s cubic-bezier(.22,1,.36,1)", background: reached ? "linear-gradient(90deg,#f5a524,#ffc861)" : "linear-gradient(90deg,#d44000,#ff8a55)", boxShadow: "0 0 14px rgba(240,74,8,.55)" }} />
              <span style={{ position: "absolute", top: "50%", left: `${fill}%`, width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 3px rgba(240,74,8,.6)", opacity: shown ? 1 : 0, transform: shown ? "scale(1)" : "scale(.4)", transition: "opacity .3s ease-out 0.9s, transform .4s cubic-bezier(.34,1.56,.64,1) 0.9s" }} />
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,.62)" }}>
              <span>d&apos;ici le {deadline}</span>
              <span style={{ fontWeight: 800, color: reached ? "#ffc861" : "#ff8a55", fontVariantNumeric: "tabular-nums" }}>🎯 {target}</span>
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>{hint}</span>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.62)", marginTop: 8 }}>d&apos;ici le {deadline}</span>
          </>
        )}
      </span>
    </button>
  );
}

/* « Pour y arriver » (P3, 24/11/2026) : trois moyens, du plus simple au plus engageant. 1) Tes séances
   comptent déjà (avec ou sans programme). 2) Un programme fait pour cet objectif (générateur). 3) Les
   modèles de la bibliothèque qui le servent, triés par séances par semaine (programServes, P2). */
function ObjectiveWays({ metric, coach, deadline, followed = true }: { d: ObjectiveDef; metric: MetricKey; coach: boolean; counted: number; since: string; deadline: string; noValue: boolean; followed?: boolean }) {
  const router = useRouter();
  const [lib, setLib] = useState<LibraryProgram[] | null>(null);
  useEffect(() => { let alive = true; loadLibrary().then(l => { if (alive) setLib(l); }).catch(() => { if (alive) setLib([]); }); return () => { alive = false; }; }, []);
  /* Mêmes données et même seuil que les tags d'un programme (programServes, ≥ ~1 séance/semaine) : un
     programme tagué avec ce mouvement apparaît toujours ici (Gildas : « des fois j'ai les objectifs sur un
     programme mais pas l'inverse »). Famille principale d'abord, puis les familles voisines (poids 0,5),
     bonus si le nom du programme cite le mouvement (spécialisation). */
  const fams = servedBy(metric);
  const name = (METRIC_DISPLAY[metric]?.name ?? "").toLowerCase().replace(/\(.*\)/, "").trim();
  const serving = (lib ?? [])
    .map(p => {
      let score = 0, best: { line: string; w: number } | null = null;
      for (const [fam, w] of fams) {
        const sv = p.serves?.find(x => x.metric === fam);
        if (!sv) continue;
        const pw = sv.perWeek ?? (parseFloat(sv.line) || 0);
        score += w * pw;
        if (!best || w > best.w) best = { line: sv.line, w };
      }
      if (best && name && p.name.toLowerCase().includes(name.split(" ")[0])) score += 2;
      return best ? { p, s: { line: best.line }, score, primary: best.w === 1 } : null;
    })
    .filter((x): x is { p: LibraryProgram; s: { line: string }; score: number; primary: boolean } => !!x)
    .sort((a, b) => Number(b.primary) - Number(a.primary) || b.score - a.score)
    .slice(0, 8);
  const weeks = Math.max(2, Math.round((Date.parse(deadline) - Date.now()) / (7 * 86400000)));
  return (
    <div style={{ marginTop: 22 }}>

      <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em" }}>{followed ? "Pour y arriver" : "Pour le faire progresser"}</div>

      {/* Programmes (24/11, Gildas) : le carrousel de cartes de la bibliothèque, avec en 1re carte « Créer un
          programme pour cet objectif » (générateur pré-rempli) à la place d'une ligne à part. */}
      <div style={{ height: 10 }} />
      <Carousel itemWidth="200px" gap={12}>
        {[
          ...(!coach ? [(
            <button key="create" type="button" onClick={() => router.push(`/programmes?objectif=${encodeURIComponent(`metric:${metric}`)}&semaines=${weeks}`)}
              style={{ width: "100%", height: 200, borderRadius: 22, border: "2px dashed rgba(255,138,85,.5)", background: "rgba(212,64,0,.08)", color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end", gap: 4, padding: 16, textAlign: "left" }}>
              <span style={{ fontSize: 26 }}>✨</span>
              <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>Créer un programme pour cet objectif</span>
              <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)" }}>{weeks} semaines, jusqu&apos;à ton échéance</span>
            </button>
          )] : []),
          ...serving.map(({ p, s }) => (
            <button key={p.id} type="button" onClick={() => router.push(coach ? `/coach/programmes?modele=${p.id}` : `/programmes?modele=${p.id}`)} className="tpc-lift"
              style={{ width: "100%", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", background: "none" }}>
              <Cover id={p.id} sport={p.sport} sizes="200px" emojiSize={56} style={{ height: 200, borderRadius: 22 }}>
                <span style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 30%, rgba(0,0,0,.85))" }} />
                <span style={{ position: "absolute", left: 14, right: 14, bottom: 14, color: "#fff" }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "rgba(255,255,255,.8)", marginTop: 4, lineHeight: 1.3 }}>{s.line}</span>
                </span>
              </Cover>
            </button>
          )),
        ]}
      </Carousel>
    </div>
  );
}

/* Courbe de l'objectif : toutes les valeurs + le tracé jusqu'à la cible. */
function Curve({ p, deadline }: { p: ObjectiveProgress; deadline: string }) {
  const W = 330, H = 160, pad = { l: 36, r: 14, t: 12, b: 22 };
  if (!p.points.length) return null; // sans valeur : pas de courbe vide, le bouton « Renseigne ton 1er test » suit
  const last = p.points[p.points.length - 1];
  const t0 = Date.parse(p.points[0].date), t1 = Math.max(Date.parse(deadline), Date.parse(last.date) + 86400000);
  const x = (iso: string) => pad.l + ((Date.parse(iso) - t0) / ((t1 - t0) || 1)) * (W - pad.l - pad.r);
  const vals = [...p.points.map(q => q.value), ...(p.target !== null ? [p.target] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || Math.abs(hi) * 0.05 || 1, mlo = lo - span * 0.25, mhi = hi + span * 0.25;
  const yRaw = (v: number) => pad.t + (1 - (v - mlo) / (mhi - mlo)) * (H - pad.t - pad.b);
  const y = (v: number) => p.lowerIsBetter ? (H - pad.b) - (yRaw(v) - pad.t) : yRaw(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Courbe de l'objectif" style={{ display: "block" }}>
      {[0.2, 0.5, 0.8].map(f => { const v = mlo + (mhi - mlo) * f; return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,.07)" /><text x={pad.l - 6} y={y(v) + 3} fontSize={9.5} textAnchor="end" fill="rgba(255,255,255,.45)" fontFamily="IBM Plex Mono, monospace">{Math.round(v * 10) / 10}</text></g>; })}
      {p.target !== null && <><line x1={x(last.date)} y1={y(last.value)} x2={x(deadline)} y2={y(p.target)} stroke="rgba(255,255,255,.6)" strokeWidth={2} strokeDasharray="5 5" /><circle cx={x(deadline)} cy={y(p.target)} r={5} fill="none" stroke="#fff" strokeWidth={2} /></>}
      {p.points.length > 1 && <polyline points={p.points.map(q => `${x(q.date).toFixed(1)},${y(q.value).toFixed(1)}`).join(" ")} fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />}
      {p.points.map(q => <circle key={q.date} cx={x(q.date)} cy={y(q.value)} r={3} fill="#fff" />)}
      <circle cx={x(last.date)} cy={y(last.value)} r={5.5} fill={ACCENT} stroke="#fff" strokeWidth={2} />
      <text x={pad.l} y={H - 5} fontSize={9.5} fill="rgba(255,255,255,.45)" fontFamily="IBM Plex Mono, monospace">{fmtDate(p.points[0].date)}</text>
      <text x={W - pad.r} y={H - 5} fontSize={9.5} textAnchor="end" fill="rgba(255,255,255,.45)" fontFamily="IBM Plex Mono, monospace">{fmtDate(new Date(t1).toISOString().slice(0, 10))}</text>
    </svg>
  );
}

/* Fiches et feuilles rendues dans <body> : la transition de page (.tpc-page-in) décale le position:fixed. */
function InBody({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 2147483200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(7,10,13,.6)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 520, maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#fff", color: "#171b1f", borderRadius: "24px 24px 0 0", animation: "sheetInUp .22s ease-out" }}>
        <div style={{ padding: "10px 20px 6px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 9, background: "rgba(0,0,0,.14)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: "-0.02em" }}>{title}</div>
          {sub && <div style={{ fontSize: 13.5, color: "#6b7177", marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
        </div>
        <div style={{ overflowY: "auto", padding: "6px 20px max(24px, env(safe-area-inset-bottom))" }}>{children}</div>
      </div>
    </div>
  );
}

export default function ObjectivesHub({ initial, sport, data, sexe = null, poidsKg = null, children, initialOpenMetric = null, locked = false, persist = true, coach = null }: {
  initial: ObjectiveItem[]; sport: string | null; data: ObjectiveData; initialOpenMetric?: MetricKey | null;
  /** Compte gratuit : le statut (analyse) est flouté, comme dans TestsPanel ; les valeurs restent lisibles. */
  locked?: boolean;
  /** false = aperçu local (aucune écriture). */
  persist?: boolean;
  /** Vue coach : objectifs d'un sportif, écrits via /api/coach/objectives (coach_athletes.id). */
  coach?: { athleteId: string } | null;
  sexe?: "homme" | "femme" | null; poidsKg?: number | null;
  children: (api: TestsObjectivesAdapter) => React.ReactNode;
}) {
  const router = useRouter();
  const T = (tu: string, il: string) => (coach ? il : tu);
  const [items, setItems] = useState<ObjectiveItem[]>(initial);
  /* Une écriture faite ailleurs (remplacement sur place, programme démarré) revient par router.refresh(). */
  const initialKey = JSON.stringify(initial);
  useEffect(() => { setItems(JSON.parse(initialKey)); }, [initialKey]);
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(initialOpenMetric);
  const [openOther, setOpenOther] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = todayIso();
  const sportPhoto = sportIllustration(sport) ?? "/illustrations/groupe.jpg";
  const photo = (d: ObjectiveDef) => exerciseImage(d) ?? photoForGroup(groupOf(d), sportPhoto);
  const latest = useMemo(() => latestByMetric(data), [data]);
  const insights = useMemo(() => testLibrary({ sport, sexe, poidsKg, latest, quality: null }).insights, [sport, sexe, poidsKg, latest]);
  const itemFor = (id: string): ObjectiveItem => items.find(i => i.id === id) ?? { id, start: today, deadline: addDays(today, (defById(id, sport)?.defaultWeeks ?? 8) * 7) };
  /* Mesure avec TOUTES les valeurs du test (pas seulement depuis le départ) pour la courbe. */
  const measure = (d: ObjectiveDef): ObjectiveProgress => {
    const p = measureObjective(d, itemFor(d.id), data);
    if (d.measure.kind !== "metric") return p;
    const metric = d.measure.metric;
    const pts = data.results.filter(r => { const t = data.tests.find(x => x.id === r.test_id); return t && metricOfName(t.name_key || t.name) === metric; }).map(r => ({ date: r.date, value: Number(r.value) }));
    const m = new Map<string, number>();
    for (const q of [...pts, ...p.points]) { const v = m.get(q.date); if (v === undefined || (p.lowerIsBetter ? q.value < v : q.value > v)) m.set(q.date, q.value); }
    return { ...p, points: Array.from(m, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)) };
  };

  /* Table `objectives` (049) : on applique la différence (ajouts, retraits, échéances). Aperçu : état local seul. */
  async function save(next: ObjectiveItem[]) {
    setErr(null);
    if (persist && coach) {
      const r = await fetch("/api/coach/objectives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athleteId: coach.athleteId, items: next }) }).catch(() => null);
      if (!r?.ok) { console.error("[objectives] coach save", r?.status); setErr("Enregistrement impossible. Réessaie."); return false; }
    } else if (persist) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { setErr("Session expirée. Recharge la page."); return false; }
      const added = next.filter(n => !items.some(i => i.id === n.id));
      const removed = items.filter(i => !next.some(n => n.id === i.id));
      const changed = next.filter(n => items.some(i => i.id === n.id && i.deadline !== n.deadline));
      const ops = [
        ...added.map(a => supabase.from("objectives").insert({ user_id: uid, objective_id: a.id, start_date: a.start, deadline: a.deadline })),
        ...removed.map(r => supabase.from("objectives").delete().eq("user_id", uid).eq("objective_id", r.id)),
        ...changed.map(c => supabase.from("objectives").update({ deadline: c.deadline }).eq("user_id", uid).eq("objective_id", c.id)),
      ];
      const res = await Promise.all(ops);
      const failed = res.find(r => r.error);
      if (failed?.error) { console.error("[objectives] save", failed.error.message); setErr("Enregistrement impossible. Réessaie."); return false; }
    }
    setItems(next); return true;
  }
  async function follow(d: ObjectiveDef) {
    if (items.length >= MAX_OBJECTIVES || items.some(i => i.id === d.id)) return;
    if (await save([...items, { id: d.id, start: today, deadline: addDays(today, d.defaultWeeks * 7) }])) posthog.capture("objective_added", { id: d.id, weeks: d.defaultWeeks, count: items.length + 1 });
  }
  const metricId = (m: MetricKey) => `metric:${m}`;
  /* Séances qui comptent : faites depuis le départ de l'objectif et qui le travaillent (programme ou pas). */
  /* Rétroactif : les 4 semaines avant le départ comptent aussi (le travail déjà fait). */
  const countFrom = (d: ObjectiveDef) => addDays(itemFor(d.id).start, -COUNT_BACK_DAYS);
  const counted = (d: ObjectiveDef) => { const from = countFrom(d); return data.sessions.filter(x => x.done && x.date >= from && servesObjective(d, x)).length; };
  async function unfollow(id: string) {
    if (await save(items.filter(i => i.id !== id))) posthog.capture("objective_removed", { id });
  }

  /* Bloc objectif dans la fiche : cible et date, avancement, courbe projetée, modifier. */
  /* Courbe de l'objectif (toutes les valeurs + tracé jusqu'à la cible), sous l'en-tête de la fiche. */
  const objectiveBlock = (d: ObjectiveDef) => {
    const it = itemFor(d.id), p = measure(d);
    if (!p.points.length) return null;
    return (
      <div style={{ borderRadius: 20, padding: "12px 10px 8px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
        <Curve p={p} deadline={it.deadline} />
      </div>
    );
  };
  /* Fiche d'un objectif hors test (régularité, récupération, jour J) : avancement + courbe + modifier. */
  const otherBlock = (d: ObjectiveDef) => {
    const it = itemFor(d.id), p = measure(d), n = counted(d);
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.8)" }}>🎯 d&apos;ici le {fmtDate(it.deadline)}</div>
        {n > 0 && <div style={{ fontSize: 13, color: "rgba(255,255,255,.78)", marginTop: 8 }}>🔥 {servedSessionsText(d, n)} depuis le {fmtDate(countFrom(d))}</div>}
        <button type="button" onClick={() => setEditing(d.id)} style={{ width: "100%", marginTop: 14, border: 0, borderRadius: 16, padding: 14, fontSize: 15.5, fontWeight: 700, color: "#fff", background: "linear-gradient(180deg,#f04a08,#d44000)", cursor: "pointer" }}>Modifier l&apos;objectif</button>
        <div style={{ marginTop: 16 }}>{objectiveBlock(d)}</div>
        {p.emptyHint && <p style={{ fontSize: 13.5, color: "rgba(255,255,255,.6)", marginTop: 10 }}>{p.emptyHint}</p>}
      </div>
    );
  };

  const api: TestsObjectivesAdapter = {
    isFollowed: m => items.some(i => i.id === metricId(m)),
    followedMetrics: items.filter(i => i.id.startsWith("metric:")).map(i => i.id.slice(7) as MetricKey),
    canFollow: items.length < MAX_OBJECTIVES || !coach,
    onFollow: m => {
      const d = defById(metricId(m), sport);
      if (!d) return;
      /* Déjà 3 objectifs : remplacement sur place (feuille FollowProgramObjectives), plus de bouton grisé. */
      if (items.length >= MAX_OBJECTIVES && !coach) { notifyFollowObjective(m, d.defaultWeeks || 8); return; }
      follow(d);
    },
    onUnfollow: m => unfollow(metricId(m)),
    onEdit: m => setEditing(metricId(m)),
    headline: m => {
      const d = defById(metricId(m), sport);
      if (!d || !items.some(i => i.id === d.id)) return null;
      const p = measure(d), it = itemFor(d.id);
      if (p.target === null) return null;
      const unit = METRIC_DISPLAY[m]?.unit ?? p.unit, n = counted(d);
      return {
        target: fmtValue(p.target, unit), date: fmtDate(it.deadline), reached: p.reached, current: p.current !== null ? fmtValue(p.current, unit) : null,
        pct: Math.max(0, Math.round(progressPct(p))),
        remaining: p.current !== null && !p.reached ? `${T("Il te reste", "Il lui reste")} ${fmtValue(Math.abs(p.target - (unit === "kg" ? Math.round(p.current * 2) / 2 : p.current)), unit).trim()}` : null,
        sessions: n > 0 ? servedSessionsText(d, n) : null,
      };
    },
    /* « Je le teste en séance » depuis « Renseigne ton 1er test » (pas côté coach). */
    planTest: coach ? undefined : (m, onClose) => <PlanTestSheet metric={m} onClose={onClose} />,
    /* La courbe seule : TestsPanel la pose dans l'encadré qui contient aussi l'historique et l'ajout. */
    panel: m => { const d = defById(metricId(m), sport); if (!d || !items.some(i => i.id === d.id)) return null; const p = measure(d); return p.points.length ? <Curve p={p} deadline={itemFor(d.id).deadline} /> : null; },
    /* « Pour y arriver » : sous l'historique et l'ajout d'un résultat (Gildas, 25/11 : historique juste sous la courbe). */
    /* Sur TOUTE fiche de test (Gildas, 25/11 : un test non suivi doit aussi montrer ses programmes). Non suivi :
       pas de compte de séances ni de test à préparer, échéance par défaut pour le générateur. */
    ways: m => {
      const d = defById(metricId(m), sport);
      if (!d) return null;
      const on = items.some(i => i.id === d.id);
      return on
        ? <ObjectiveWays d={d} metric={m} coach={!!coach} counted={counted(d)} since={fmtDate(countFrom(d))} deadline={itemFor(d.id).deadline} noValue={!measure(d).points.length} />
        : <ObjectiveWays d={d} metric={m} coach={!!coach} counted={0} since="" deadline={addDays(today, (d.defaultWeeks || 8) * 7)} noValue={false} followed={false} />;
    },
    openMetric,
    onOpenMetricHandled: () => setOpenMetric(null),
    onDataChanged: () => { if (!coach) router.refresh(); },
    coachWords: !!coach,
    extraCards: (
      <>
        {[FORME, REGULARITY, RECOVERY].map(d => {
          const on = items.some(i => i.id === d.id);
          return (
            <div key={d.id} style={{ position: "relative", height: 200, borderRadius: 24, overflow: "hidden", border: `${on ? 2 : 1}px solid ${on ? "#fff" : "rgba(255,255,255,.1)"}`, background: "#11161a" }}>
              <button type="button" onClick={() => setOpenOther(d.id)} aria-label={d.label} style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "none", color: "#fff", textAlign: "left", cursor: "pointer" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo(d)} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.1) brightness(.5)" }} />
                <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(7,10,13,.05),rgba(7,10,13,.3) 45%,rgba(7,10,13,.94))" }} />
                <span style={{ position: "absolute", left: 14, right: 52, bottom: 14, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.2 }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Mesuré par l&apos;app</span>
                </span>
              </button>
              {on ? <button type="button" onClick={() => unfollow(d.id)} aria-label={`Retirer l'objectif ${d.label}`} style={{ position: "absolute", right: 12, bottom: 12, width: 32, height: 32, borderRadius: "50%", border: 0, background: "#fff", color: "#111", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>✓</button>
                : <button type="button" onClick={() => follow(d)} disabled={items.length >= MAX_OBJECTIVES} aria-label={`Suivre ${d.label}`} style={{ position: "absolute", right: 12, bottom: 12, width: 32, height: 32, borderRadius: "50%", border: 0, background: "rgba(255,255,255,.22)", color: "#fff", fontSize: 19, fontWeight: 700, cursor: "pointer", opacity: items.length >= MAX_OBJECTIVES ? 0.35 : 1 }}>+</button>}
            </div>
          );
        })}
      </>
    ),
  };

  const followed = items.map(it => defById(it.id, sport)).filter((d): d is ObjectiveDef => !!d);
  const otherDef = openOther ? defById(openOther, sport) : null;
  const editDef = editing ? defById(editing, sport) : null;

  return (
    <>
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "2px 16px 8px", scrollbarWidth: "none" }}>
          {followed.map(d => {
            const it = itemFor(d.id), p = measure(d);
            const st = d.measure.kind === "metric" ? statusFor(d.measure.metric, insights, latest[d.measure.metric]) : null;
            const unit = d.measure.kind === "metric" ? METRIC_DISPLAY[d.measure.metric]?.unit ?? "" : p.unit;
            const n = counted(d);
            const gain = p.start !== null && p.current !== null ? (p.lowerIsBetter ? p.start - p.current : p.current - p.start) : 0;
            return (
              <RewardCard key={d.id} index={followed.indexOf(d)} photo={photo(d)} label={d.label}
                current={d.measure.kind === "metric" && p.current !== null ? fmtValue(p.current, unit) : null}
                target={d.measure.kind === "metric" && p.target !== null ? fmtValue(p.target, unit) : null}
                hint={p.emptyHint ?? "Mesuré par l'app"}
                pct={d.measure.kind === "metric" && p.target !== null ? progressPct(p) : null}
                gain={gain > 0 ? `+${fmtValue(gain, unit).trim()}` : null}
                daysLeft={Math.ceil((Date.parse(it.deadline) - Date.parse(today)) / 86400000)} deadline={fmtDate(it.deadline)}
                sessions={n} sessionsText={n > 0 ? servedSessionsText(d, n) : null}
                reached={p.reached}
                onOpen={() => d.measure.kind === "metric" ? setOpenMetric(d.measure.metric) : setOpenOther(d.id)} />
            );
          })}
          {items.length < MAX_OBJECTIVES && (
            <button type="button" onClick={() => document.getElementById("obj-tests")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="tpc-press"
              style={{ flex: "0 0 132px", height: 268, scrollSnapAlign: "start", borderRadius: 28, border: "2px dashed rgba(255,255,255,.2)", background: "rgba(255,255,255,.03)", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 13.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 10 }}>
              <span style={{ fontSize: 30, lineHeight: 1 }}>+</span>{items.length ? T("Choisis un objectif", "Fixe-lui un objectif") : T("Choisis ton 1er objectif", "Fixe-lui son 1er objectif")}
            </button>
          )}
        </div>
        {err && <div role="alert" style={{ marginTop: 8, fontSize: 13, color: "#ff8a55" }}>{err}</div>}
      </section>

      <div id="obj-tests" style={{ scrollMarginTop: 80 }}>
        {children(api)}
      </div>

      {otherDef && (<InBody>
        <div role="dialog" aria-label={otherDef.label} style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: "#070a0d", color: "#fff", overflowY: "auto" }}>
          <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 48 }}>
            <div style={{ position: "relative", height: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(otherDef)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.1) brightness(.5)" }} />
              <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(7,10,13,.2),#070a0d 96%)" }} />
              <button type="button" onClick={() => setOpenOther(null)} aria-label="Retour" style={{ position: "absolute", top: "max(14px, env(safe-area-inset-top))", left: 14, width: 38, height: 38, borderRadius: "50%", border: 0, background: "rgba(0,0,0,.45)", color: "#fff", fontSize: 20, cursor: "pointer" }}>‹</button>
            </div>
            <div style={{ padding: "0 20px", marginTop: -34, position: "relative" }}>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{otherDef.label}</div>
              <p style={{ fontSize: 14.5, color: "rgba(255,255,255,.8)", lineHeight: 1.5, margin: "14px 0 0" }}>
                {otherDef.measure.kind === "regularity" ? "Tes séances faites, comparées à ton rythme d'entraînement." : otherDef.measure.kind === "recovery" ? "Ta récupération comparée à ta norme, en moyenne sur 7 jours." : "Ta forme (fond moins fatigue) jusqu'à ton échéance, pour arriver frais le jour J."}
              </p>
              {items.some(i => i.id === otherDef.id) ? otherBlock(otherDef) : (
                <button type="button" onClick={() => follow(otherDef)} disabled={items.length >= MAX_OBJECTIVES}
                  style={{ width: "100%", marginTop: 18, border: 0, borderRadius: 16, padding: 14, fontSize: 15.5, fontWeight: 700, color: "#fff", background: "linear-gradient(180deg,#f04a08,#d44000)", cursor: "pointer", opacity: items.length >= MAX_OBJECTIVES ? 0.5 : 1 }}>
                  {items.length >= MAX_OBJECTIVES ? "Tu suis déjà 3 objectifs" : "🎯 En faire un objectif"}
                </button>
              )}
            </div>
          </div>
        </div>
      </InBody>)}

      {editDef && (() => {
        const it = itemFor(editDef.id);
        return (
          <InBody><Sheet title={editDef.label} sub="Le tracé repart de ta valeur actuelle. L'historique reste." onClose={() => setEditing(null)}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", margin: "6px 0 8px" }}>Échéance</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {WEEKS.map(w => {
                const on = weeksBetween(it.start, it.deadline) === w;
                return (
                  <button key={w} type="button" aria-pressed={on} onClick={async () => { if (await save(items.map(i => i.id === editDef.id ? { ...i, deadline: addDays(i.start, w * 7) } : i))) posthog.capture("objective_deadline_changed", { id: editDef.id, weeks: w }); }}
                    style={{ border: `1.5px solid ${on ? "#171b1f" : "rgba(0,0,0,.12)"}`, background: on ? "#171b1f" : "#fff", color: on ? "#fff" : "#171b1f", borderRadius: 10, padding: "8px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {w} sem. · {fmtDate(addDays(it.start, w * 7))}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10, border: "1.5px solid rgba(0,0,0,.12)", borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 700 }}>
              <span>Une date précise</span>
              <input type="date" value={it.deadline} min={addDays(today, 7)} aria-label="Date de l'échéance"
                onChange={async e => { const v = e.target.value; if (v && v > today && await save(items.map(i => i.id === editDef.id ? { ...i, deadline: v } : i))) posthog.capture("objective_deadline_changed", { id: editDef.id, custom: true }); }}
                style={{ border: 0, fontSize: 14, fontWeight: 700, color: "#171b1f", background: "transparent" }} />
            </label>
            <button type="button" onClick={async () => { if (await save(items.filter(i => i.id !== editDef.id))) { posthog.capture("objective_removed", { id: editDef.id }); setEditing(null); setOpenOther(null); } }}
              style={{ width: "100%", marginTop: 18, border: 0, borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700, color: "#d44000", background: "#f1f0ee", cursor: "pointer" }}>Retirer cet objectif</button>
          </Sheet></InBody>
        );
      })()}
    </>
  );
}
