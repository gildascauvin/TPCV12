"use client";

import { requestCoachCheckinResult } from "@/components/coach/CoachResultHost";
import type { AutoregProposal } from "@/lib/autoregPersonal";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { hapticTick } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidatePhysio, requestPhysioReveal } from "@/lib/physioData";
import { computeWellnessScore } from "@/lib/wellness";
import { DARK_CARD_BG } from "@/lib/theme";
import { SCALE_WORDS, type ScaleKey } from "@/lib/wellnessWords";
import { computeBehaviorCorrelations, CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import type { WellnessDaily } from "@/types";
import PointFormeRing from "@/components/wellness/PointFormeRing";
import type { PlannedIntensity } from "@/lib/plannedIntensity";

const BEDTIME_OPTIONS = [
  { value: "before22", label: "Avant 22h" },
  { value: "22to23", label: "22h–23h" },
  { value: "23to00", label: "23h–minuit" },
  { value: "00to01", label: "Minuit–1h" },
  { value: "after01", label: "Après 1h" },
];

const NEGATIVE_BEHAVIORS = [
  { key: "alcohol", emoji: "🍷", label: "Alcool" },
  { key: "late_sleep", emoji: "🌙", label: "Couché tardif" },
  { key: "tobacco", emoji: "🚬", label: "Tabac" },
  { key: "screen_late", emoji: "📱", label: "Écran tard" },
  { key: "heavy_meal", emoji: "🍔", label: "Repas lourd" },
  { key: "caffeine_late", emoji: "☕", label: "Caféine tard" },
  { key: "social_out", emoji: "🎉", label: "Sortie sociale" },
  { key: "travel", emoji: "✈️", label: "Voyage" },
];

const POSITIVE_BEHAVIORS = [
  { key: "stretching", emoji: "🧘", label: "Stretching" },
  { key: "cold_shower", emoji: "🧊", label: "Douche froide" },
  { key: "reading", emoji: "📖", label: "Lecture" },
  { key: "meditation", emoji: "🧘‍♂️", label: "Méditation" },
  { key: "hydration", emoji: "💧", label: "Bonne hydratation" },
  { key: "walk", emoji: "🚶", label: "Marche détente" },
];

const WQ_TOTAL = 5;

const PLAN_OPTIONS: { key: PlannedIntensity; emoji: string; label: string; sub: string }[] = [
  { key: "rest", emoji: "🛌", label: "Repos", sub: "Pas d'entraînement aujourd'hui" },
  { key: "easy", emoji: "🚶", label: "Léger", sub: "Marche, mobilité, footing tranquille" },
  { key: "mod", emoji: "🏃", label: "Modéré", sub: "Une séance classique" },
  { key: "hard", emoji: "🔥", label: "Dur", sub: "Séance intense" },
  { key: "vhard", emoji: "🚀", label: "Très dur", sub: "Séance max, compétition" },
];



/* Point forme augmenté (2026-10-20, POC "Notes en un tap", pistes 2 et 3) : seulement avec de l'historique.
   Insight après la réponse, jamais avant (pas d'ancrage), et seulement si elle est rare : |z| ≥ 1,6
   sur les 28 derniers jours (≥ 12 réponses) ET plus extrême que tous les jours des 7 derniers au moins.
   Le stress est comparé sur le stress réel (10 = mauvais). */
const INSIGHT_MIN_DAYS = 12;
const INSIGHT_Z = 1.6;
const INSIGHT_WORDS: Record<ScaleKey, { bad: string; good: string }> = {
  sleep: { bad: "Ta pire nuit", good: "Ta meilleure nuit" },
  stress: { bad: "Ton stress le plus haut", good: "Ton stress le plus bas" },
  recovery: { bad: "Ton état physique le plus bas", good: "Ton meilleur état physique" },
  motivation: { bad: "Ton envie la plus basse", good: "Ton envie la plus haute" },
};
// Point forme saisi par le coach (subject) : même insight à la 3e personne.
const INSIGHT_WORDS_THIRD: Record<ScaleKey, { bad: string; good: string }> = {
  sleep: { bad: "Sa pire nuit", good: "Sa meilleure nuit" },
  stress: { bad: "Son stress le plus haut", good: "Son stress le plus bas" },
  recovery: { bad: "Son état physique le plus bas", good: "Son meilleur état physique" },
  motivation: { bad: "Son envie la plus basse", good: "Son envie la plus haute" },
};
/* Badge du coût d'un comportement : mêmes seuils et couleurs que la carte Comportements
   (behaviorStatus, HomeAnalyticsSections.tsx), en version fond clair, sans les mots Aide / Pénalise
   (demande de Gildas, la couleur suffit). */
function CostBadge({ impact }: { impact: number }) {
  const neutral = Math.abs(impact) < 0.3;
  const pos = impact > 0;
  const color = neutral ? "#7b7f82" : pos ? "#2f9e44" : "#d10000";
  const bg = neutral ? "rgba(0,0,0,.05)" : pos ? "rgba(47,158,68,.12)" : "rgba(209,0,0,.09)";
  const label = neutral ? "0 pt" : `${pos ? "+" : "−"}${Math.abs(impact).toFixed(1).replace(".", ",")} pts`;
  return (
    <span style={{ marginLeft: "auto", padding: "3px 8px", borderRadius: 999, background: bg, color, fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>
  );
}
type HistoryRow = Pick<WellnessDaily, "date" | "sleep" | "stress" | "recovery" | "motivation" | "score" | "base_score" | "behaviors">;
function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
}
function sinceText(days: number) {
  if (days >= 84) return "depuis 3 mois";
  if (days >= 56) return "depuis 2 mois";
  if (days >= 28) return "depuis un mois";
  if (days >= 14) return `depuis ${Math.floor(days / 7)} semaines`;
  return `depuis ${days} jours`;
}
export function notableInsight(key: ScaleKey, value: number, history: HistoryRow[], today: string, third = false): { text: string; bad: boolean } | null {
  const rows = history.filter(h => h.date < today && h[key] != null).sort((a, b) => b.date.localeCompare(a.date));
  const recent = rows.filter(h => daysBetween(h.date, today) <= 28);
  if (recent.length < INSIGHT_MIN_DAYS) return null;
  const vals = recent.map(h => h[key] as number);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.max(0.75, Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length));
  const z = (value - mean) / sd;
  if (Math.abs(z) < INSIGHT_Z) return null;
  const higher = z > 0;
  // Dernier jour au moins aussi extrême dans le même sens : l'insight dit depuis quand ce n'était pas arrivé.
  const last = rows.find(h => (higher ? (h[key] as number) >= value : (h[key] as number) <= value));
  const since = last ? daysBetween(last.date, today) : daysBetween(rows[rows.length - 1].date, today) + 1;
  if (since < 7) return null;
  const bad = key === "stress" ? higher : !higher;
  const w = (third ? INSIGHT_WORDS_THIRD : INSIGHT_WORDS)[key];
  // L'historique lu s'arrête à 90 jours : au-delà, on ne peut pas dire « depuis le début ».
  const beyond = since >= 85 ? "depuis plus de 3 mois" : third ? "depuis le début de son suivi" : "depuis le début de ton suivi";
  const text = `${bad ? w.bad : w.good} ${last ? sinceText(since) : beyond}.`;
  return { text, bad };
}

interface Props {
  date: string;
  onSave: (data: {
    sleep: number;
    stress: number;
    recovery: number;
    motivation: number;
    behaviors: string[];
    bedtime: string;
    base_score: number;
    score: number;
    plannedIntensity?: PlannedIntensity | null;
  /* false = non enregistré (31/10) : la fenêtre reste ouverte sur la dernière question, l'appelant affiche l'erreur. */
  }) => Promise<void | boolean>;
  /* Pose d'abord "Qu'as-tu prévu aujourd'hui ?" (aucune séance au planning ce jour-là). */
  askPlan?: boolean;
  onClose: () => void;
  /* Wizard onboarding (2026-09-03) : le bouton "Annuler" du 1er step devient "Me le rappeler plus
     tard" (même mécanisme que le "🔔 Plus tard" de célébration/InviteModal) — absent = "Annuler"
     inchangé (usage in-app). */
  cancelLabel?: string;
  /** Pas d'écran de résultat après l'enregistrement (onboarding : l'écran suivant montre déjà l'effet du point forme). */
  skipResult?: boolean;
  /* Wizard onboarding (2026-09-04) : "←" vers l'étape wizard précédente, affiché uniquement au 1er
     step (step>0 a déjà son propre "← Retour" intra-formulaire) — absent = pas de bouton retour
     (usage in-app). */
  onBack?: () => void;
  /** Point forme saisi par le coach pour un sportif inscrit (2026-10-26) : questions à la 3e personne,
      historique lu via /api/coach/bilan (RLS), conseil figé pour ce sportif, pas d'écran de résultat
      (la carte Coach Control se met à jour). L'enregistrement reste à `onSave` (/api/coach/checkin). */
  subject?: { athleteId: string; userId: string; name: string; /** Libellé gardé entier (« ton sportif »), pas réduit au prénom. */ label?: boolean; /** En-tête à la place de « Point forme de X ». */ heading?: string };
  /** Check-in imaginé (onboarding coach, 2026-10-29) : aucun appel serveur, ni historique ni reco du matin. */
  offline?: boolean;
  /* Point forme obligatoire (2026-11-04) : pas de « Plus tard », pas de fermeture au clic à côté. */
  required?: boolean;
}

export default function WellnessModal({ date, onSave, onClose, cancelLabel = "Annuler", onBack, askPlan = false, skipResult = false, subject, offline = false, required = false }: Props) {
  const who = subject ? (subject.label ? subject.name : subject.name.split(" ")[0]) : null;
  // En début de phrase : « Ton sportif a envie… ».
  const Who = who ? who.charAt(0).toUpperCase() + who.slice(1) : null;
  const [step, setStep] = useState(0);
  const [plannedIntensity, setPlannedIntensity] = useState<PlannedIntensity | null>(null);
  const off = askPlan ? 1 : 0;
  const total = WQ_TOTAL + off;
  const q = step - off; // index de la question de ressenti (−1 = séance prévue)
  /* Notes en un tap (2026-10-17) : plus aucune valeur par défaut. Avant, 7/5/7/8 et 23h-minuit
     étaient enregistrés tels quels si le sportif validait sans toucher, impossible à distinguer
     d'une vraie réponse. Une note tapée passe à la question suivante (ScaleBars). */
  const [sleep, setSleep] = useState<number | null>(null);
  const [bedtime, setBedtime] = useState<string | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<number | null>(null);
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [motivation, setMotivation] = useState<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [insight, setInsight] = useState<{ key: ScaleKey; text: string; bad: boolean } | null>(null);
  const advanceDelay = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - CONSEILS_HISTORY_DAYS);
      if (offline) return;
      if (subject) {
        const r = await fetch(`/api/coach/bilan?athleteId=${encodeURIComponent(subject.athleteId)}&today=${date}`);
        if (!r.ok) return;
        const j = await r.json();
        const s0 = since.toISOString().slice(0, 10);
        if (!alive) return;
        setHistory(((j.checkins ?? []) as HistoryRow[]).filter(h => h.date < date && h.date >= s0));
        return;
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("wellness_daily")
        .select("date, sleep, stress, recovery, motivation, score, base_score, behaviors")
        .eq("user_id", user.id).lt("date", date).gte("date", since.toISOString().slice(0, 10));
      if (alive && data) setHistory(data as HistoryRow[]);
    })().catch(() => {});
    return () => { alive = false; };
  }, [date, subject?.athleteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setInsight(null); }, [step]);
  /* Coût réel de chaque comportement, sur son historique (même calcul que la carte Comportements).
     Rien tant qu'il n'y a pas au moins 12 points forme : un compte neuf ne voit aucun chiffre. */
  const behaviorCost: Record<string, number> = {};
  if (history.length >= INSIGHT_MIN_DAYS) {
    for (const c of computeBehaviorCorrelations(history as WellnessDaily[])) behaviorCost[c.key] = c.impact;
  }
  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);
  const [saving, setSaving] = useState(false);
  /* Point forme à l'anneau (2026-11-06, version B du POC). */
  const [ringPulse, setRingPulse] = useState(0);
  const ringStart = useRef<number | null>(null);
  // Fermeture animée (croix, fond, Annuler) ; l'enregistrement, lui, ferme tout de suite.
  const { close: closeAnimated, exitClass } = useExitAnimation(onClose);


  /* Score qui se construit (2026-10-22, POC « Notes en un tap » + POC Wellness live) : moyenne des
     seules questions répondues (même formule que computeWellnessScore, qui fait la moyenne des 4),
     comparée à sa norme comme sur /today, et même zone que l'écran de résultat (checkinInsight). */
  const answeredParts = [sleep, stress == null ? null : 10 - stress, recovery, motivation].filter((v): v is number => v != null);
  const partBase = answeredParts.length ? Math.round(answeredParts.reduce((a, b) => a + b, 0) / (answeredParts.length * 10) * 100) : null;
  /* Anneau du point forme : la piste fine suit la moyenne des réponses (partBase), sans norme ni charge.
     Le score relatif (buildScore) peut bondir de 30 points pour un cran près de la norme ; la comparaison
     à la norme et le score officiel vivent dans le mini bilan, juste après. */
  const ringScore = partBase;
  useEffect(() => { ringStart.current = ringScore; }, [step]); // eslint-disable-line react-hooks/exhaustive-deps


  function toggleBehavior(key: string) {
    setBehaviors((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  /* Ressenti vs physiologie (2026-10-11) : si la montre a déjà la nuit de ce jour (FC au repos ou nuit
     de 3 h et plus), la comparaison s'affiche après la validation (PhysioRevealHost), réponses déjà
     enregistrées. Jamais dans le wizard. Teaser flouté en tête retiré le 02/11/2026 (Gildas : ne teasait
     pas vraiment, prenait de la place). */
  const [physioReady, setPhysioReady] = useState(false);
  useEffect(() => {
    if (subject) return;
    let alive = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      return supabase.from("health_daily").select("resting_hr, sleep_minutes").eq("user_id", data.user.id).eq("date", date).maybeSingle()
        .then(({ data: row }) => {
          if (alive && row && (row.resting_hr != null || (row.sleep_minutes ?? 0) >= 180)) setPhysioReady(true);
        });
    });
    return () => { alive = false; };
  }, [date, subject]);

  async function handleSave(override: { motivation?: number } = {}) {
    const m = override.motivation ?? motivation;
    if (sleep == null || stress == null || recovery == null || m == null || bedtime == null) return;
    const motivation_ = m;
    setSaving(true);
    const { base_score, score } = computeWellnessScore(sleep, stress, recovery, motivation_, behaviors);
    const ok = await onSave({ sleep, stress, recovery, motivation: motivation_, behaviors, bedtime, base_score, score, plannedIntensity: askPlan ? plannedIntensity : null });
    if (ok === false) { setSaving(false); return; }
    /* Reco du matin figée côté serveur (2026-10-23) ; le coach lié est prévenu depuis elle si elle dit
       d'alléger. Remplace /api/push/event, qui recalculait la reco avec le moteur générique. */
    if (!offline) fetch("/api/sessions/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subject ? { date, athleteUserId: subject.userId } : { date }) })
      .then(async r => {
        if (!r.ok) { console.error("[reco du matin]", r.status); return; }
        /* Point forme saisi par le coach (2026-11-04) : la slide « Sa séance du jour », depuis la reco figée. */
        const j = await r.json().catch(() => null) as { sessionId?: string; name?: string | null; proposal?: AutoregProposal | null } | null;
        if (subject && !skipResult && j?.proposal && j.sessionId) {
          requestCoachCheckinResult({ subject: subject.name, athleteId: subject.athleteId, date, session: { id: j.sessionId, name: j.name ?? null, target_difficulty: j.proposal.original_difficulty, done: false, autoreg_proposal: j.proposal } });
        }
      })
      .catch(e => console.error("[reco du matin]", e));
    setSaving(false);
    // Écran de résultat pour tous (2026-10-22) : score, insight, norme ; la comparaison à la nuit s'y ajoute si la montre l'a.
    if (physioReady) invalidatePhysio();
    if (!skipResult && !subject) requestPhysioReveal({ kind: "wellness", date, sleep, stress, recovery, motivation: motivation_ });
  }

  function goNext() {
    if (step < total - 1) setStep((s) => s + 1);
    else handleSave();
  }
  /* Après un tap : courte pause pour lire le mot de la note, puis question suivante (ou
     enregistrement à la dernière). */
  function autoAdvance(override: { motivation?: number } = {}) {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      if (step < total - 1) setStep((s) => s + 1);
      else handleSave(override);
    }, advanceDelay.current ?? 380);
    advanceDelay.current = null;
  }
  function goBack() {
    if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    if (step > 0) setStep((s) => s - 1);
  }



  /* ── Point forme à l'anneau (version B) ── */
  const RING_KICKER: Record<ScaleKey, string> = { sleep: "Sommeil", stress: "Stress", recovery: "Corps", motivation: "Envie" };
  /* Comportements en dernier (06/11) : les quatre questions à l'anneau s'enchaînent, la seule à cases termine. */
  const rq = q; // 0 sommeil, 1 stress, 2 corps, 3 envie, 4 comportements
  const ringLast = step === total - 1;
  /* Fin : on enregistre tout de suite, le mini bilan s'ouvre sur l'anneau récup (« Ta forme »). */
  function ringFinish(override: { motivation?: number } = {}) {
    if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    handleSave(override);
  }
  function ringAdvance(override: { motivation?: number } = {}) {
    if (ringLast) ringFinish(override); else autoAdvance(override);
  }
  const darkTitle = { fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color: "#fff", textAlign: "center", textWrap: "balance" } as React.CSSProperties;
  const darkSub = { fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,.6)", marginTop: 6, textAlign: "center", textWrap: "balance" } as React.CSSProperties;
  const monoKicker = { fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" } as const;
  function ringScoreLine() {
    if (ringScore == null) return <div style={{ height: 22 }} />;
    const d = ringStart.current == null ? 0 : ringScore - ringStart.current;
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, height: 22, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.75)" }}>
        <span aria-hidden style={{ width: 16, height: 4, borderRadius: 2, background: "#8cc3d4" }} />
        {who ? `Récup de ${who}` : "Ta récup"}
        {d !== 0 && <span style={{ fontWeight: 700, color: d > 0 ? "#8cc3d4" : "rgba(255,255,255,.55)" }}>{d > 0 ? "↑ en hausse" : "↓ en baisse"}</span>}
      </div>
    );
  }
  function ringInsight(key: ScaleKey) {
    if (!insight || insight.key !== key) return null;
    return (
      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, fontSize: 14, fontWeight: 700, lineHeight: 1.35, background: "rgba(255,255,255,.07)", color: insight.bad ? "#ffc8a8" : "#bfe2ee", animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
        {insight.bad ? "↘ " : "↗ "}{insight.text}
      </div>
    );
  }
  function ringScale(key: ScaleKey, title: string, sub: string, value: number | null, onPick: (n: number) => void, onRelease: (n: number) => void) {
    const w = SCALE_WORDS[key];
    return (
      <div key={key} style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
        {/* Question et sous-titre dans la feuille blanche du bas (06/11, POC) ; l'anneau seul en haut. */}
        <div style={{ marginTop: 4 }}>
          <PointFormeRing value={value} labels={w.labels} kicker={RING_KICKER[key]} placeholder="Touche ou glisse sur l'anneau" sheet="seg"
            sheetTitle={title} sheetSub={sub} centerScore={{ label: who ? "Sa forme" : "Ta forme", value: ringScore }}
            score={ringScore} pulse={ringPulse}
            better={n => (w.inverted ? 11 - n : n)}
            onChange={n => { if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; } onPick(n); }}
            onRelease={n => {
              setRingPulse(p => p + 1);
              const ins = notableInsight(key, n, history, date, !!who);
              setInsight(ins ? { key, ...ins } : null);
              advanceDelay.current = ins ? 3000 : null;
              onRelease(n);
            }} />
        </div>
        <div style={{ marginTop: 10 }}>{ringScoreLine()}</div>
        {ringInsight(key)}
      </div>
    );
  }
  function ringChip(b: { key: string; emoji: string; label: string }, negative: boolean) {
    const checked = behaviors.includes(b.key);
    return (
      <button key={b.key} onClick={() => { toggleBehavior(b.key); hapticTick(0, 1); }}
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 12, fontFamily: "inherit",
          border: checked ? `1px solid ${negative ? "rgba(255,140,90,.65)" : "rgba(127,219,143,.6)"}` : "1px solid rgba(255,255,255,.12)",
          background: checked ? (negative ? "rgba(212,64,0,.18)" : "rgba(47,158,68,.16)") : "rgba(255,255,255,.04)",
          color: checked ? (negative ? "#ffc8a8" : "#a8e6b4") : "rgba(255,255,255,.72)",
          fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all 0.14s",
        }}>
        <span style={{ fontSize: 16 }}>{b.emoji}</span>{checked ? "✓ " : ""}{b.label}
        {behaviorCost[b.key] != null && <CostBadge impact={behaviorCost[b.key]} />}
      </button>
    );
  }
  function renderRingLayout() {
    let content: React.ReactNode = null;
    if (q === -1) {
      content = (
        <div>
          <div style={darkTitle}>Qu&apos;as-tu prévu aujourd&apos;hui ?</div>
          <div style={darkSub}>Rien n&apos;est encore au planning. On cale ta séance sur ta forme.</div>
          <div style={{ display: "grid", gap: 8, marginTop: 18 }}>
            {PLAN_OPTIONS.map(o => (
              <button key={o.key} onClick={() => { setPlannedIntensity(o.key); setStep(s => s + 1); }}
                style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", color: "#fff", background: "rgba(255,255,255,.06)", border: plannedIntensity === o.key ? "1.5px solid #ffb08a" : "1.5px solid rgba(255,255,255,.1)" }}>
                <span style={{ fontSize: 24, width: 30, textAlign: "center" }}>{o.emoji}</span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{o.label}</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    } else if (rq === 0) {
      content = (
        <div>
          {ringScale("sleep", who ? `😴 Comment a dormi ${who} ?` : "😴 Comment as-tu dormi ?", "Qualité et récupération pendant le sommeil", sleep, setSleep, () => {
            if (bedtime != null) { ringAdvance(); return; }
            setTimeout(() => document.getElementById("wq-bedtime")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 200);
          })}
          <div id="wq-bedtime" style={{ marginTop: 16, scrollMarginBottom: 24 }}>
            <div style={{ ...monoKicker, marginBottom: 8, textAlign: "center" }}>Heure de coucher</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
              {BEDTIME_OPTIONS.map(o => {
                const on = bedtime === o.value;
                return (
                  <button key={o.value} type="button" onClick={() => { hapticTick(0, 1); setBedtime(o.value); if (sleep != null) ringAdvance(); }}
                    style={{ padding: "9px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: on ? "1.5px solid #8cc3d4" : "1.5px solid rgba(255,255,255,.14)", background: on ? "rgba(140,195,212,.16)" : "rgba(255,255,255,.04)", color: on ? "#fff" : "rgba(255,255,255,.72)" }}>
                    {on ? "✓ " : ""}{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    } else if (rq === 1) {
      content = ringScale("stress", "🧠 Niveau de stress mental", "Travail, vie personnelle, charge mentale", stress, setStress, () => ringAdvance());
    } else if (rq === 2) {
      content = ringScale("recovery", "💪 État physique aujourd'hui", "Ressenti musculaire, douleurs, lourdeur", recovery, setRecovery, () => ringAdvance());
    } else if (rq === 4) {
      content = (
        <div style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
          <div style={darkTitle}>🔍 Comportements d&apos;hier</div>
          <div style={darkSub}>Coche tout ce qui s'applique</div>
          <div style={{ ...monoKicker, color: "#ffb08a", margin: "18px 0 8px", textAlign: "center" }}>{who ? `Ce qui a pénalisé ${who}` : "Ce qui m'a pénalisé"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>{NEGATIVE_BEHAVIORS.map(b => ringChip(b, true))}</div>
          <div style={{ ...monoKicker, color: "#9fd8ad", margin: "14px 0 8px", textAlign: "center" }}>{who ? `Ce que ${who} a fait de bien` : "Ce que j'ai fait de bien"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>{POSITIVE_BEHAVIORS.map(b => ringChip(b, false))}</div>
        </div>
      );
    } else if (rq === 3) {
      content = ringScale("motivation", who ? `⚡ ${Who} a envie de s'entraîner ?` : "⚡ As-tu envie de t'entraîner ?", "Motivation intrinsèque du moment", motivation, setMotivation, n => ringAdvance({ motivation: n }));
    }
    return (
      <div className={exitClass} style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: DARK_CARD_BG, color: "#fff", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
        <div style={{ maxWidth: 440, margin: "0 auto", minHeight: "100%", display: "flex", flexDirection: "column", padding: "max(14px, env(safe-area-inset-top)) 20px calc(var(--answer-sheet-h, 0px) + max(18px, env(safe-area-inset-bottom)))", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, minHeight: 34 }}>
            {(step > 0 || onBack) && (
              <button onClick={step > 0 ? goBack : onBack} aria-label="Retour"
                style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0, display: "grid", placeItems: "center" }}>←</button>
            )}
            {who && <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", minWidth: 0 }}>{subject?.heading ?? `Point forme de ${who}`}</div>}
            {!required && (
              <button onClick={closeAnimated} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.6)", fontSize: 14, fontWeight: 700, padding: "6px 2px", fontFamily: "inherit" }}>{cancelLabel}</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 22 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "#fff" : "rgba(255,255,255,.14)", transition: "background 0.3s" }} />
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 24 }}>{content}</div>
          {(rq === 4 || saving) && (
            <div style={{ position: "sticky", bottom: 0, paddingTop: 14, marginTop: 8 }}>
              <button onClick={() => (ringLast ? ringFinish() : goNext())} disabled={saving}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.25)", fontFamily: "inherit" }}>
                {saving
                  ? <span aria-label="Enregistrement" style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spinBtn 0.7s linear infinite" }} />
                  : behaviors.length ? "Terminer →" : "Rien de tout ça →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* Une seule mise en page depuis le 06/11 : le point forme à l'anneau, plein écran sombre (anciennes
     échelles en barres, version intégrée à l'Accueil et bandeau d'onboarding retirées). */
  return renderRingLayout();
}
