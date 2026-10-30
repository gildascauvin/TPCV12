"use client";

/* Argumentaire avant paywall (2026-10-27, POC https://claude.ai/artifact/Ma3E6NB8dAAhd7HwjjuVF7).
   ob_replay : les 30 jours d'Apple Santé rejoués (iOS). ob_insight : juste après le check-in, un carrousel
   d'écrans du bilan en données réelles d'un sportif ThePerfClub, le premier choisi par sa réponse la
   plus basse (« Nos données indiquent qu'un sportif stressé… »).
   Les cartes sont les vrais écrans du bilan (SlideBody de BilanCarousel), dans un cadre réduit. */

import { useRef, useState } from "react";
import { SlideBody, GLOW, KICKER, KICKER_COACH } from "@/components/bilan/BilanCarousel";
import { SCALE_WORDS, type ScaleKey } from "@/lib/wellnessWords";
import type { Bilan, BilanSlide } from "@/lib/bilan";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };
const BOX: React.CSSProperties = { background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16 };
const DOWN = "#6da7ec", UP = "#ff8a5c";

/* ── Réponses du check-in ── */
export type Answers = { sleep: number; stress: number; recovery: number; motivation: number };
const ORDER: ScaleKey[] = ["sleep", "stress", "recovery", "motivation"];
const QLABEL: Record<ScaleKey, string> = { sleep: "Sommeil", stress: "Stress", recovery: "Récupération", motivation: "Motivation" };
/* Les mots de l'échelle sont au masculin (« douloureux », « lourd ») : « corps » pour la récupération. */
const QPHRASE: Record<ScaleKey, string> = { sleep: "sommeil", stress: "stress", recovery: "corps", motivation: "motivation" };
const good = (k: ScaleKey, v: number) => (SCALE_WORDS[k].inverted ? 11 - v : v);
/* La réponse la plus basse, seulement si elle est franchement basse (sinon : bon matin). */
export function lowestAnswer(a: Answers): ScaleKey | null {
  let best: { k: ScaleKey; g: number } | null = null;
  for (const k of ORDER) { const g = good(k, a[k]); if (g <= 5 && (!best || g < best.g)) best = { k, g }; }
  return best?.k ?? null;
}
export const answerWord = (k: ScaleKey, v: number) => SCALE_WORDS[k].labels[v].toLowerCase();
/* « stress marqué, récupération lourde » : les deux réponses les plus basses, pour le sous-titre coach. */
export function lowWords(a: Answers): string {
  return [...ORDER].sort((x, y) => good(x, a[x]) - good(y, a[y])).slice(0, 2).filter(k => good(k, a[k]) <= 6)
    .map(k => `${QLABEL[k].toLowerCase()} ${answerWord(k, a[k])}`).join(", ");
}

/* ── Titres (écran insight et paywall), par réponse la plus basse ── */
export function insightTitle(a: Answers, name?: string): string {
  const k = lowestAnswer(a);
  if (!k) return name ? `${name} est en forme ce matin.` : "Tout est bon ce matin.";
  return name ? `${name} : ${QPHRASE[k]} ${answerWord(k, a[k])}.` : `Ce matin, ${QPHRASE[k]} ${answerWord(k, a[k])}.`;
}
/* sessionName : la séance de sa jauge, pour que le titre reprenne celle qu'il vient de voir. */
export function payHeadline(a: Answers, replay: boolean, sport = "", sessionName?: string): string {
  const ses = sessionName ? `séance « ${sessionName} »` : FAM[sportFamily(sport)].ses;
  if (replay) return "Ce mois-ci, 3 matins à alléger sont passés inaperçus. Le prochain, ThePerfClub le voit avant ta séance.";
  const k = lowestAnswer(a);
  return {
    sleep: "Ta prochaine nuit courte ne te coûtera plus ta séance.",
    stress: `Ta prochaine journée de stress ne te coûtera plus ta ${ses}.`,
    recovery: "Tes jambes lourdes auront une explication. Et ta séance, le bon dosage.",
    motivation: "Quand l'envie baisse, ta charge se recale avant que tu décroches.",
  }[k as ScaleKey] ?? "Les bons matins, tu pousses. Les autres, ta séance s'allège avant de se rater.";
}
export function payHeadlineCoach(a: Answers, name: string, sport = "", sessionName?: string): string {
  const ses = sessionName ? `séance « ${sessionName} »` : FAM[sportFamily(sport)].ses;
  const k = lowestAnswer(a);
  return {
    sleep: `La prochaine nuit courte de ${name} ne lui coûtera plus sa séance.`,
    stress: `La prochaine journée de stress de ${name} ne lui coûtera plus sa ${ses}.`,
    recovery: `Les jambes lourdes de ${name} auront une explication. Et sa séance, le bon dosage.`,
    motivation: `Quand l'envie de ${name} baisse, sa charge se recale avant qu'il décroche.`,
  }[k as ScaleKey] ?? `Les bons matins, ${name} pousse. Les autres, tu allèges avant la séance.`;
}

/* ── Écrans du bilan ── */
const PERIOD = { kind: "week" as const, start: "2026-11-02", end: "2026-11-08" };
const BILAN: Bilan = { period: PERIOD, slides: [], title: "" };
const RECAL = { state: "kept" as const, apply: () => {}, keep: () => {} };

/* Écrans du bilan en illustration (assumé, 2026-10-27) : chiffres du bilan réel d'un sportif ThePerfClub
   quand on les a, inventés sinon. Un cas par réponse la plus basse du matin (ou « tout est bon »), décliné
   par famille de sport (2026-10-29 : pas de séance de force pour un traileur), avec sa phrase ;
   `n` = prénom côté coach (3e personne). Les autres écrans suivent dans le carrousel, avec une ligne courte. */
type CaseKey = ScaleKey | "ok";
type Card = { key: string; says?: (n?: string) => string; slide: BilanSlide };
export type SportFamily = "force" | "endurance" | "mixte" | "collectif";
export function sportFamily(sport: string): SportFamily {
  const s = sport.toLowerCase();
  if (/halt|power|muscu|force|hypertroph|strong/.test(s)) return "force";
  if (/course|trail|marath|running|run|vélo|velo|cycl|triath|natation|swim|ultra|endurance|ski/.test(s)) return "endurance";
  if (/foot|rugby|basket|hand|volley|tennis|padel|hockey|combat|boxe|judo|mma/.test(s)) return "collectif";
  return "mixte";
}
const FAM: Record<SportFamily, { ses: string; block: string; stress: [number, number, number, number]; heavy: [number, number, number, number]; test: { name: string; unit: string; pct: number; values: number[] } }> = {
  force: { ses: "séance de force", block: "Force", stress: [17, 26, 13, 38], heavy: [14, 20, 12, 44], test: { name: "Squat Jump", unit: "cm", pct: 18, values: [38, 40.5, 42.2, 44.8] } },
  endurance: { ses: "séance de fractionné", block: "Fractionné", stress: [15, 22, 11, 34], heavy: [13, 18, 10, 41], test: { name: "VMA", unit: "km/h", pct: 6, values: [16, 16.4, 16.8, 17] } },
  mixte: { ses: "séance la plus intense", block: "Metcon", stress: [16, 24, 12, 36], heavy: [14, 19, 11, 42], test: { name: "Burpees en 3 min", unit: "reps", pct: 17, values: [52, 55, 58, 61] } },
  collectif: { ses: "séance la plus intense", block: "Séance intense", stress: [14, 21, 10, 33], heavy: [12, 17, 9, 38], test: { name: "Détente verticale", unit: "cm", pct: 12, values: [41, 42.5, 44, 46] } },
};
const DATES = ["2026-06-02", "2026-07-07", "2026-08-25", "2026-10-06"];
const S_SLEEP: BilanSlide = { kind: "ressenti", crashes: 0, crashesSeen: 0, sleepBars: [{ label: "Correct", value: 413, display: "6h53" }, { label: "Bon", value: 453, display: "7h33" }, { label: "Très bon", value: 471, display: "7h51", highlight: true }] };
const S_FATIGUE: BilanSlide = { kind: "fatigue", soirees: 12, normScore: 71, nextScore: 62, afterScore: null, hrv: { norm: 63, next: 45 }, hard: { easy: 71, hard: 68 } };
const S_LEVIER: BilanSlide = { kind: "leviers", unit: "sleep", rows: [{ label: "Stretching le soir", with: "7 h 59", without: "7 h 35", delta: "+24 min", positive: true }] };
const S_CHARGE: BilanSlide = { kind: "charge", pctInZone: 64, daysHigh: 3, daysCounted: 7 };
const sStress = (f: SportFamily): BilanSlide => { const [a, b, c, d] = FAM[f].stress; return { kind: "predit", blocks: [{ title: `${FAM[f].block} · stress élevé`, rows: [{ label: "Les jours de stress", part: a, total: b, highlight: true }, { label: "Les autres jours", part: c, total: d }] }] }; };
const sHeavy = (f: SportFamily): BilanSlide => { const [a, b, c, d] = FAM[f].heavy; return { kind: "predit", blocks: [{ title: `${FAM[f].block} · corps fatigué`, rows: [{ label: "Les matins corps fatigué", part: a, total: b, highlight: true }, { label: "Les autres matins", part: c, total: d }] }] }; };
const sTests = (f: SportFamily): BilanSlide => { const t = FAM[f].test; return { kind: "tests", main: { name: t.name, unit: t.unit, pct: t.pct, points: t.values.map((value, i) => ({ date: DATES[i], value })) }, others: [] }; };

function leadCard(k: CaseKey, f: SportFamily): Card {
  const { ses, stress: [sa, sb], heavy: [ha, hb], test } = FAM[f];
  return {
    stress: { key: "stress", slide: sStress(f), says: (n?: string) => n
      ? `Le stress de ${n} se paie sur sa ${ses} : plus dure que prévu ${sa} fois sur ${sb}.`
      : `Le stress se paie sur ta ${ses} : plus dure que prévu ${sa} fois sur ${sb}.` },
    sleep: { key: "sleep", slide: S_SLEEP, says: (n?: string) => n
      ? `${n} ne se trompe pas sur sa nuit : chaque note du réveil colle à un vrai temps de sommeil.`
      : "Ton ressenti ne te trompe pas : chaque note du réveil colle à un vrai temps de sommeil." },
    recovery: { key: "heavy", slide: sHeavy(f), says: (n?: string) => n
      ? `Ces matins-là, sa ${ses} passe mal : plus dure que prévu ${ha} fois sur ${hb}.`
      : `Ces matins-là, ta ${ses} passe mal : plus dure que prévu ${ha} fois sur ${hb}.` },
    motivation: { key: "charge", slide: S_CHARGE, says: (n?: string) => n
      ? `Pas un manque de volonté : quand l'envie de ${n} baisse, la charge est souvent sortie de la zone.`
      : "Pas un manque de volonté : quand l'envie baisse, ta charge est souvent sortie de ta zone." },
    ok: { key: "tests", slide: sTests(f), says: () => `Les bons matins poussés s'additionnent : ${test.name} +${test.pct} %.` },
  }[k];
}
/* Levier choisi selon sa réponse la plus basse (2026-10-29), d'après l'historique d'un sportif ThePerfClub
   (n=1, illustration) : marche → nuit, stretching → corps, hydratation → stress et motivation. */
const lever = (label: string, unit: "sleep" | "score", w: string, wo: string, delta: string): BilanSlide =>
  ({ kind: "leviers", unit, rows: [{ label, with: w, without: wo, delta, positive: true }] });
const LEVER: Record<CaseKey, { slide: BilanSlide; says: string }> = {
  sleep: { slide: lever("La marche dans la journée", "sleep", "7 h 58", "7 h 29", "+29 min"), says: "Ce qui rallonge la nuit : bouger dans la journée." },
  recovery: { slide: lever("Le stretching le soir", "score", "76", "66", "+10 points"), says: "Ce qui allège le corps le lendemain : le stretching." },
  stress: { slide: lever("Bien s'hydrater", "score", "79", "67", "+12 points"), says: "Un levier simple les jours chargés : l'hydratation." },
  motivation: { slide: lever("Bien s'hydrater", "score", "79", "67", "+12 points"), says: "Un levier simple quand l'envie baisse : l'hydratation." },
  ok: { slide: S_LEVIER, says: "Un petit geste le soir change la nuit." },
};
const moreCards = (f: SportFamily, k: CaseKey): Card[] => [
  { key: "levier", slide: LEVER[k].slide, says: () => LEVER[k].says },
  { key: "fatigue", slide: S_FATIGUE, says: () => "Ce n'est pas la séance de la veille qui fatigue le plus." },
  { key: "stress", slide: sStress(f), says: () => `Le stress se paie surtout sur la ${FAM[f].ses}.` },
  { key: "sleep", slide: S_SLEEP, says: () => "Une nuit notée mauvaise est vraiment plus courte." },
];

/* Les cartes parlent au sportif (« ta charge ») ; côté coach, au prénom de son sportif. */
function SlideFrame({ slide, name }: { slide: BilanSlide; name?: string }) {
  return (
    <div style={{ borderRadius: 22, overflow: "hidden", background: "#070a0d", backgroundImage: `radial-gradient(ellipse 110% 60% at 50% -8%, ${GLOW[slide.kind]} 0%, transparent 65%)`, border: "1px solid rgba(255,255,255,.10)" }}>
      <div style={{ zoom: 0.86, padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...MONO, fontSize: 11, color: "rgba(255,255,255,.75)" }}>Bilan · {KICKER_COACH[slide.kind] ?? KICKER[slide.kind]}</div>
        <SlideBody s={slide} bilan={BILAN} onShare={() => {}} shared={false} recal={RECAL} n={name} />
      </div>
    </div>
  );
}

export function InsightStepBody({ answers, name, sport = "" }: { answers: Answers; name?: string; sport?: string }) {
  const k = lowestAnswer(answers);
  const f = sportFamily(sport);
  const lead = leadCard(k ?? "ok", f);
  const slides = [lead, ...moreCards(f, k ?? "ok").filter(c => c.key !== lead.key)];
  const [idx, setIdx] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const go = (i: number) => track.current?.scrollTo({ left: i * (track.current.clientWidth + 16), behavior: "smooth" });
  return (
    <div>
      <div ref={track} onScroll={e => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / (el.clientWidth + 16))); }}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", gap: 16, alignItems: "flex-start" }}>
        {slides.map((c, i) => (
          <div key={c.key} style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
            {c.says && <p style={{ margin: "0 0 12px", fontSize: i === 0 ? 16 : 15, fontWeight: 700, lineHeight: 1.35, color: "#fff" }}>{(t => t.charAt(0).toUpperCase() + t.slice(1))(c.says(name)).replace(/ ([:;!?])/g, "\u00a0$1")}</p>}
            <SlideFrame slide={c.slide} name={name} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }} role="tablist" aria-label="Écrans du bilan">
        {slides.map((c, i) => (
          <button key={c.key} type="button" onClick={() => go(i)} aria-label={`Écran ${i + 1}`} aria-selected={i === idx}
            style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", background: i === idx ? "#ff8a55" : "rgba(255,255,255,.25)", transition: "width .2s" }} />
        ))}
      </div>
      <div style={{ ...BOX, borderRadius: 18, padding: "14px 16px", marginTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", color: "#ff8a55", lineHeight: 1 }}>111</span>
        <span style={{ fontSize: 13.5, lineHeight: 1.4, color: "rgba(255,255,255,.8)" }}>séances ajustées en 6 mois par un sportif ThePerfClub, au lieu d&apos;être faites au feeling.</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, color: "rgba(255,255,255,.4)", marginTop: 12, textAlign: "center" }}>Exemples tirés du bilan ThePerfClub</div>
    </div>
  );
}

/* ── Demande de note (POC) : en prod, la fenêtre système iOS (SKStoreReviewController via un plugin
   Capacitor) ou Android (In-App Review), déclenchée juste après sa 1re décision. Imitation ici. ── */
export function ReviewPromptMock({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: 270, borderRadius: 14, background: "rgba(242,242,247,.96)", color: "#000", textAlign: "center", overflow: "hidden", fontFamily: "-apple-system, system-ui, sans-serif" }}>
        <div style={{ padding: "18px 16px 14px" }}>
          <img src="/icon-192.png" alt="" width={56} height={56} style={{ borderRadius: 13, display: "block", margin: "0 auto 10px" }} onError={e => { e.currentTarget.style.display = "none"; }} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Vous aimez ThePerfClub ?</div>
          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>Touchez une étoile pour l&apos;évaluer sur l&apos;App Store.</div>
          <div style={{ fontSize: 28, color: "#0a84ff", letterSpacing: 6, marginTop: 10 }}>☆☆☆☆☆</div>
        </div>
        <button onClick={onClose} style={{ width: "100%", height: 44, border: 0, borderTop: "1px solid rgba(60,60,67,.29)", background: "transparent", color: "#0a84ff", fontSize: 17, cursor: "pointer" }}>Plus tard</button>
      </div>
    </div>
  );
}

/* ── ob_replay : ses 30 derniers jours (en prod : health_days + health_workouts, rejoués par le moteur). ── */
type ReplayDay = { v: number; ses: boolean; flag?: "down" | "up" };
const REPLAY: ReplayDay[] = (() => {
  const out: ReplayDay[] = []; let s = 7;
  const ses = new Set([0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 25, 26, 28]);
  for (let d = 0; d < 30; d++) { s = (s * 9301 + 49297) % 233280; out.push({ v: Math.round(58 + (s / 233280) * 26), ses: ses.has(d) }); }
  ([[5, 31], [16, 34], [21, 38]] as const).forEach(([d, v]) => { out[d] = { v, ses: true, flag: "down" }; });
  ([[9, 92], [25, 90]] as const).forEach(([d, v]) => { out[d] = { v, ses: true, flag: "up" }; });
  return out;
})();
const DAYS = [
  { d: "Mar. 6 oct.", rows: [["🌙", "Nuit de 5 h 41, 1 h 12 sous ta norme"], ["♥", "Fréquence cardiaque au repos : 7 bpm au-dessus de ta norme"]], ses: "Musculation, 1 h 08", note: "faite comme prévu" },
  { d: "Sam. 17 oct.", rows: [["〰", "VFC à 41 ms, ta norme est à 58 ms"], ["♥", "Fréquence cardiaque au repos : 5 bpm au-dessus"]], ses: "Course, 52 min", note: "cœur 9 bpm plus haut que sur tes courses habituelles" },
  { d: "Jeu. 22 oct.", rows: [["〰", "VFC sous ta norme, 3e matin de suite"], ["🌙", "Nuit de 6 h 02"]], ses: "CrossFit, 58 min", note: "faite comme prévu" },
];

function Strip() {
  const W = 320, H = 96, bw = W / 30, ny = H - ((70 - 20) / 80) * H;
  return (
    <div style={{ ...BOX, borderRadius: 18, padding: "14px 12px 10px", marginBottom: 14 }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Forme physiologique de tes 30 derniers jours">
        <line x1={0} x2={W} y1={ny} y2={ny} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />
        <text x={W} y={ny - 4} textAnchor="end" fontSize={8.5} fill="rgba(255,255,255,.45)" fontFamily="var(--font-mono), monospace">ta norme</text>
        {REPLAY.map((p, i) => {
          const h = ((p.v - 20) / 80) * H, x = i * bw + 1.5, cx = x + (bw - 3) / 2;
          const c = p.flag === "down" ? DOWN : p.flag === "up" ? UP : "rgba(255,255,255,.22)";
          return (
            <g key={i}>
              <rect x={x} y={H - h} width={bw - 3} height={h} rx={2} fill={c} />
              {p.ses && <circle cx={cx} cy={H + 7} r={2} fill="rgba(255,255,255,.55)" />}
              {p.flag && <text x={cx} y={H + 19} textAnchor="middle" fontSize={9} fill={c}>{p.flag === "down" ? "▼" : "▲"}</text>}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 11.5, color: "rgba(255,255,255,.58)", padding: "8px 4px 0" }}>
        <span>▼ alléger</span><span>▲ pousser</span><span>• séance enregistrée</span>
      </div>
    </div>
  );
}
const pill = (down: boolean): React.CSSProperties => ({ ...MONO, fontSize: 10, letterSpacing: ".06em", padding: "5px 9px", borderRadius: 999, whiteSpace: "nowrap", background: down ? "rgba(109,167,236,.18)" : "rgba(255,138,92,.16)", color: down ? DOWN : UP });

export function ReplayStepBody() {
  return (
    <div>
      <style>{`@keyframes obIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.ob-in{animation:none!important}}`}</style>
      <Strip />
      {DAYS.map((d, i) => (
        <div key={d.d} className="ob-in" style={{ ...BOX, padding: "13px 14px", marginBottom: 8, animation: `obIn .45s ease ${0.25 + i * 0.35}s both` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ ...MONO, fontSize: 11.5, letterSpacing: ".06em", color: "rgba(255,255,255,.58)" }}>{d.d}</span>
            <span style={pill(true)}>▼ Aurait allégé</span>
          </div>
          {d.rows.map(([ic, t]) => (
            <div key={t} style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)", padding: "2px 0" }}><span style={{ width: 16, textAlign: "center", color: "rgba(255,255,255,.58)" }}>{ic}</span><span>{t}</span></div>
          ))}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.10)", fontSize: 13.5, color: "#fff" }}>{d.ses} <span style={{ color: "rgba(255,255,255,.58)" }}>· {d.note}</span></div>
        </div>
      ))}
      <div className="ob-in" style={{ ...BOX, padding: "13px 14px", marginBottom: 14, animation: "obIn .45s ease 1.4s both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ ...MONO, fontSize: 11.5, letterSpacing: ".06em", color: "rgba(255,255,255,.58)" }}>Sam. 10 et lun. 26 oct.</span>
          <span style={pill(false)}>▲ Aurait poussé</span>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)" }}>Au-dessus de ta norme deux matins, séance faite sans rien ajouter.</div>
      </div>
      <p className="ob-in" style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,.75)", margin: 0, paddingLeft: 12, borderLeft: "3px solid #d44000", animation: "obIn .45s ease 1.8s both" }}>Ton feeling a laissé passer 3 matins. Dès demain, ThePerfClub les voit avant ta séance.</p>
    </div>
  );
}

/* La frise sans risque de l'essai vit avec le paywall (commune à l'onboarding et à l'app). */
export { RiskTimeline } from "@/components/paywall/RiskTimeline";

/* ── ob_decide : après le check-in, sa vraie situation de ce matin. Remplace ob_when + ob_mirror (POC
   2026-10-28) : la question n'est plus hypothétique, et la réponse est confrontée à l'ajustement deux
   écrans plus loin. Réponse à enregistrer dans profiles.frustration (emails Brevo). ── */
export type Pick = "force" | "feeling" | "saute" | "pousse";
export function decideOptions(a: Answers): { value: Pick; label: string }[] {
  return lowestAnswer(a)
    ? [{ value: "force", label: "Je la fais comme prévu" }, { value: "feeling", label: "J'allège au feeling" }, { value: "saute", label: "Je la saute" }]
    : [{ value: "force", label: "Je la fais comme prévu" }, { value: "pousse", label: "Je pousse un peu" }];
}
export function decideLead(a: Answers): string {
  const k = lowestAnswer(a);
  return k ? `Ce matin, ${QPHRASE[k]} ${answerWord(k, a[k])}` : "Tout est bon ce matin";
}
/* Titre de l'écran séance ajustée : son choix face à la règle. Pas de chiffre ici : la carte de prod juste
   dessous dit déjà « -3 points » et réécrit les séries, un % dans le titre ne collait pas avec elle. */
export function contrastTitle(pick: Pick | null, sug: { dir: "low" | "high"; reco: number } | null): string {
  const p = pick ?? "force";
  if (!sug) return { force: "Ton feeling avait raison : on la garde comme prévu.", feeling: "Tu aurais allégé au feeling. Ton état permet de la garder telle quelle.", saute: "Tu l'aurais sautée. Ton état permet de la faire, telle quelle.", pousse: "Tu aurais poussé. Ton état dit de la garder comme prévu." }[p];
  if (sug.dir === "low") return { force: "Tu l'aurais faite comme prévu. ThePerfClub l'allège, série par série.", feeling: "Tu aurais allégé au feeling. ThePerfClub te dit de combien, série par série.", saute: "Tu l'aurais sautée. ThePerfClub la garde, allégée série par série.", pousse: "Tu aurais poussé. ThePerfClub l'allège, série par série." }[p];
  return { force: "Tu l'aurais faite comme prévu. Ton état permet de pousser, série par série.", pousse: "Ton feeling avait raison. ThePerfClub te dit de combien pousser, série par série.", feeling: "Tu aurais allégé. Ton état permet de pousser, série par série.", saute: "Tu l'aurais sautée. Ton état permet même de pousser." }[p];
}
export const pickWords: Record<Pick, string> = { force: "Tu fais la séance quand même.", feeling: "Tu allèges au feeling.", saute: "Tu sautes la séance.", pousse: "Tu pousses au feeling." };

/* ── Coach, mêmes étapes que le sportif (POC 2026-10-28) : remplace ob_when coach, ob_mirror coach et le
   radar. Le coach saisit le check-in qu'un de ses sportifs lui enverrait (vraie fonction depuis le 26/10),
   dit ce qu'il lui dirait, puis voit la règle sur la séance de ce sportif avec la jauge. ── */
export type PickCoach = "garde" | "oeil" | "aveugle" | "pousse";
export function decideOptionsCoach(a: Answers): { value: PickCoach; label: string }[] {
  return lowestAnswer(a)
    ? [{ value: "garde", label: "« Fais-la comme prévu »" }, { value: "oeil", label: "« Allège un peu »" }, { value: "aveugle", label: "Rien : je ne l'aurais pas su avant la séance" }]
    : [{ value: "garde", label: "« Fais-la comme prévu »" }, { value: "pousse", label: "« Pousse un peu »" }];
}
export function decideLeadCoach(a: Answers, name: string): string {
  const k = lowestAnswer(a);
  return k ? `${name} : ${QPHRASE[k]} ${answerWord(k, a[k])}` : `${name} est en forme`;
}
export function contrastTitleCoach(pick: PickCoach | null, sug: { dir: "low" | "high" } | null, n: string): string {
  const p = pick ?? "garde";
  if (p === "aveugle") return sug?.dir === "low" ? `Sans point forme, tu l'aurais vu pendant la séance. Là, tu allèges ${n} avant.` : `Sans point forme, tu ne l'aurais pas su. Là, tu sais où en est ${n} avant la séance.`;
  if (!sug) return { garde: `Ton instinct avait raison : la séance de ${n} reste comme prévu.`, oeil: `Tu aurais allégé. ${n} peut la faire telle quelle.`, pousse: `Tu l'aurais poussé. Son état dit de garder la séance.` }[p];
  if (sug.dir === "low") return { garde: `Tu aurais gardé la séance de ${n}. ThePerfClub l'allège, série par série.`, oeil: `Tu aurais allégé à l'œil. ThePerfClub te dit de combien pour ${n}.`, pousse: `Tu l'aurais poussé. ThePerfClub allège ${n}, série par série.` }[p];
  return { garde: `Tu aurais gardé la séance. ${n} peut pousser, série par série.`, pousse: `Ton instinct avait raison. ThePerfClub te dit de combien pousser ${n}.`, oeil: `Tu aurais allégé. ${n} peut pousser, série par série.` }[p];
}
export const pickWordsCoach: Record<PickCoach, string> = { garde: "Tu gardes la séance prévue.", oeil: "Tu allèges à l'œil.", aveugle: "Tu le découvres pendant la séance.", pousse: "Tu pousses à l'instinct." };
