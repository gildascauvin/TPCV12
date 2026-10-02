"use client";

import type { ConseilsData } from "@/lib/conseilsData";
import type { MetricGroup, MetricKey } from "@/lib/metricCards";
import { METRICS, METRIC_GROUPS } from "@/lib/metricCards";
import type { Perspective } from "@/lib/fatigueSignature";
import { WELLNESS_BASELINE_PROVISIONAL_MIN_DAYS } from "@/lib/wellnessBaseline";

/* Collecte (2026-10-02, POC https://claude.ai/artifact/GBoj2wydy4kK8N8skjTAwW) : un compte qui a
   accès aux analyses (Premium, ou gratuit le jour de sa 1re décision) mais pas encore assez
   d'historique voit ce qui se construit, au lieu de données d'exemple. Les seuils sont ceux du moteur
   (analyticsReady) : 5 jours de ressenti pour la norme de récupération, 7 jours depuis la 1re séance
   (dont 2 avec séance) pour la charge, 14 jours et 4 séances pour la charge habituelle. Pas besoin de
   jours consécutifs, d'où des coches sans jours nommés. Un compte gratuit, lui, ne voit jamais ça : il
   a le même écran flouté avec ou sans historique (décision de Gildas). */

export type CollectProgress = { done: number; total: number; remaining: number };

const RECUP_TOTAL = WELLNESS_BASELINE_PROVISIONAL_MIN_DAYS;
const CHARGE_TOTAL = 7;
const BEHAVIOR_DAYS = 10;

/** Jours de ressenti sur la fenêtre de la norme (21 j). */
export function recupProgress(data: ConseilsData): CollectProgress {
  const n = data.timeSeries.slice(-21).filter(p => p.recovery !== null).length;
  const done = Math.min(RECUP_TOTAL, n);
  return { done, total: RECUP_TOTAL, remaining: RECUP_TOTAL - done };
}

/** Jours depuis la 1re séance, plus au moins 2 jours avec séance sur les 7 derniers (partialChargeReady). */
export function chargeProgress(data: ConseilsData, total = CHARGE_TOTAL): CollectProgress {
  const s = data.timeSeries;
  const first = s.findIndex(p => p.load > 0);
  if (first < 0) return { done: 0, total, remaining: total };
  const done = Math.min(total, s.length - first);
  const loaded = s.slice(-7).filter(p => p.load > 0).length;
  const remaining = Math.max(total - done, total === CHARGE_TOTAL && loaded < 2 ? 1 : 0);
  return { done: Math.min(done, total - remaining), total, remaining };
}

/** Phase de l'Accueil : il lui faut les deux, c'est donc le plus long qui compte. */
export function phaseProgress(data: ConseilsData): CollectProgress {
  const c = chargeProgress(data), r = recupProgress(data);
  return c.remaining >= r.remaining ? c : r;
}

function inDays(n: number): string {
  return n <= 1 ? "1 jour" : `${n} jours`;
}

/* Coches : pas de jours nommés (ils ne sont pas obligatoirement consécutifs). */
export function CollectChecks({ p }: { p: CollectProgress }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
      {Array.from({ length: p.total }, (_, i) => {
        const done = i < p.done;
        return (
          <span key={i} style={{
            width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center",
            fontSize: 12, fontWeight: 900,
            background: done ? "linear-gradient(180deg,#f04a08,#d44000)" : "transparent",
            border: done ? "none" : "1.5px dashed rgba(255,255,255,.25)",
            color: "#fff",
          }}>{done ? "✓" : ""}</span>
        );
      })}
    </div>
  );
}

/* Ligne Phase de la carte décision pendant la collecte (à la place de la phase d'exemple). */
export function PhaseCollecting({ p, perspective = "athlete" }: { p: CollectProgress; perspective?: Perspective }) {
  return (
    <div style={{ borderTop: "1px dashed rgba(255,255,255,.2)", paddingTop: 10, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,.6)", marginBottom: 5 }}>Phase</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, fontWeight: 600, color: "rgba(255,255,255,.8)", marginBottom: 10 }}>
        {perspective === "coach" ? "Ses" : "Tes"} analyses arrivent dans {inDays(p.remaining)} de suivi. {p.done} sur {p.total}.
      </div>
      <CollectChecks p={p} />
    </div>
  );
}

/* Faux graphe gris qui se dessine en boucle : la carte « se construit », sans aucune fausse donnée. */
function MockChart({ kind, delay }: { kind: "line" | "bars"; delay: number }) {
  return (
    <svg viewBox="0 0 300 58" preserveAspectRatio="none" aria-hidden="true" style={{ display: "block", width: "100%", height: 58, marginTop: 10 }}>
      {kind === "bars"
        ? [[18, 26], [62, 14], [106, 34], [150, 20], [194, 30], [238, 10], [282, 22]].map(([x, y], i) => (
            <rect key={i} className="tpc-mock-bar" x={x - 11} y={y} width={22} height={58 - y} rx={5} style={{ animationDelay: `${delay + i * 0.12}s` }} />
          ))
        : <>
            <path d="M0 40 L50 30 L100 36 L150 22 L200 28 L250 16 L300 24 L300 58 L0 58Z" fill="rgba(255,255,255,.05)" />
            <polyline className="tpc-mock-line" points="0,40 50,30 100,36 150,22 200,28 250,16 300,24" style={{ animationDelay: `${delay}s` }} />
          </>}
    </svg>
  );
}

export default function AnalyticsCollecting({ data, group, perspective = "athlete" }: {
  data: ConseilsData;
  group: MetricGroup;
  perspective?: Perspective;
}) {
  const coach = perspective === "coach";
  const p = group === "charge" ? chargeProgress(data) : recupProgress(data);
  const charge = chargeProgress(data);
  const habitual = chargeProgress(data, 14);
  const recup = recupProgress(data);
  const readyIn = (m: MetricKey): number =>
    m === "recovery" ? recup.remaining : m === "acwr" ? habitual.remaining : charge.remaining;
  const sub = group === "charge"
    ? `Il faut 7 jours depuis ${coach ? "sa" : "ta"} 1re séance pour lire ${coach ? "sa" : "ta"} charge.`
    : `Il faut 5 jours de ressenti pour connaître ${coach ? "sa" : "ta"} norme.`;
  const cards: { key: string; label: string; kind: "line" | "bars"; ready: number | null }[] = [
    ...METRIC_GROUPS[group].map(m => ({ key: m, label: METRICS[m].label, kind: (METRICS[m].kind === "bars" ? "bars" : "line") as "line" | "bars", ready: readyIn(m) })),
    ...(group === "recup" ? [{ key: "behaviors", label: "Comportements", kind: "bars" as const, ready: null }] : []),
  ];

  return (
    <div>
      <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: "16px 14px", textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", color: "#fff", marginBottom: 4, textWrap: "balance" as React.CSSProperties["textWrap"] }}>
          {coach ? "Ses" : "Tes"} analyses arrivent dans {inDays(p.remaining)} de suivi
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", lineHeight: 1.4, marginBottom: 12 }}>
          {sub} {p.done} sur {p.total}.
        </div>
        <CollectChecks p={p} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
        {cards.map((c, i) => (
          <div key={c.key} style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 13, padding: "13px 15px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff" }}>{c.label}</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#ffb08a", background: "rgba(255,138,85,.12)", border: "1px solid rgba(255,138,85,.3)", borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>⏳ En construction</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 9 }}>
              <i className="tpc-skel" style={{ width: "62%", height: 14 }} />
              <i className="tpc-skel" style={{ width: "88%", height: 10 }} />
            </div>
            <MockChart kind={c.kind} delay={i * 0.35} />
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", marginTop: 8 }}>
              {c.ready === null ? `Prête après ~${BEHAVIOR_DAYS} jours de ressenti` : c.ready <= 0 ? "Prête dès les prochaines données" : `Prête dans ${inDays(c.ready)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Même progression, calculée depuis les données brutes quand aucune ConseilsData n'est sous la main
   (cartes Coach Control) : dates des séances avec charge, dates de ressenti. */
export function progressFromRaw(loadDates: string[], checkinDates: string[], today: string): CollectProgress {
  const day = (d: string) => Math.round((new Date(today + "T12:00:00").getTime() - new Date(d + "T12:00:00").getTime()) / 86400000);
  const past = loadDates.filter(d => day(d) >= 0);
  const first = past.length ? Math.max(...past.map(day)) : null;
  const loaded7 = new Set(past.filter(d => day(d) < 7)).size;
  const cDone = first === null ? 0 : Math.min(CHARGE_TOTAL, first + 1);
  const cRem = first === null ? CHARGE_TOTAL : Math.max(CHARGE_TOTAL - cDone, loaded7 < 2 ? 1 : 0);
  const charge = { done: Math.min(cDone, CHARGE_TOTAL - cRem), total: CHARGE_TOTAL, remaining: cRem };
  const rDone = Math.min(RECUP_TOTAL, new Set(checkinDates.filter(d => day(d) >= 0 && day(d) < 21)).size);
  const recup = { done: rDone, total: RECUP_TOTAL, remaining: RECUP_TOTAL - rDone };
  return charge.remaining >= recup.remaining ? charge : recup;
}
