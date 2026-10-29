"use client";

import { useExitAnimation } from "@/hooks/useExitAnimation";
import { hapticTick } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { invalidatePhysio, requestPhysioReveal } from "@/lib/physioData";
import { computeWellnessScore, getRecoveryAdvice } from "@/lib/wellness";
import { computeWellnessBaselineAt, relativeZoneLabel, WELLNESS_BASELINE_WINDOW_DAYS, Z_SWC } from "@/lib/wellnessBaseline";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { WIZARD_BANNER_H } from "@/components/paywall/UnsavedBanner";
import { DARK_CARD_BG } from "@/lib/theme";
import PhysioTeaser from "@/components/physio/PhysioTeaser";
import ScaleBars from "@/components/ui/ScaleBars";
import { SCALE_WORDS, type ScaleKey } from "@/lib/wellnessWords";
import { recoveryGauge, recoveryAggregate, formAt } from "@/lib/checkinInsight";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import { computeBehaviorCorrelations, CONSEILS_HISTORY_DAYS } from "@/lib/conseilsData";
import type { WellnessDaily } from "@/types";
import WellnessRing from "@/components/wellness/WellnessRing";
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
  }) => Promise<void>;
  /* Pose d'abord "Qu'as-tu prévu aujourd'hui ?" (aucune séance au planning ce jour-là). */
  askPlan?: boolean;
  onClose: () => void;
  /* Wizard onboarding (2026-09-03) : bande d'habillage (dots + eyebrow + titre + sous-titre)
     injectée au-dessus du header réel — absent = comportement inchangé (usage in-app). */
  wizardHero?: React.ReactNode;
  /* Wizard onboarding (2026-09-03) : le bouton "Annuler" du 1er step devient "Me le rappeler plus
     tard" (même mécanisme que le "🔔 Plus tard" de célébration/InviteModal) — absent = "Annuler"
     inchangé (usage in-app). */
  cancelLabel?: string;
  /** Pas d'écran de résultat après l'enregistrement (onboarding : l'écran suivant montre déjà l'effet du point forme). */
  skipResult?: boolean;
  /** Accueil mobile (2026-10-22) : rendu dans la feuille de l'Accueil, sans fond ni feuille propre ; le score
      qui se construit est porté dans `scoreSlot` (haut de la page), à la taille `scoreSize`. */
  embedded?: boolean;
  scoreSlot?: HTMLElement | null;
  scoreSize?: number;
  /** Hauteur à laisser libre sous le bouton (navigation flottante), mode intégré. */
  footerOffset?: number;
  /* Wizard onboarding (2026-09-04) : "←" vers l'étape wizard précédente, affiché uniquement au 1er
     step (step>0 a déjà son propre "← Retour" intra-formulaire) — absent = pas de bouton retour
     (usage in-app). */
  onBack?: () => void;
  /* Aha réactif (2026-09-14, wizard uniquement) : historique wellness_daily déjà réel de
     l'utilisateur (les ~28 jours synthétiques seedés par completeProfile() avant ce step, voir
     OnboardingFlow.tsx) — permet de calculer la VRAIE baseline relative (comme /today) pendant la
     saisie, au lieu du seul repli absolu. Absent = comportement inchangé (usage in-app, où ce
     composant ne connaît de toute façon aucune vraie baseline en dehors de son propre payload). */
  wellnessHistory?: { date: string; sleep: number; stress: number; recovery: number; motivation: number; score: number; base_score: number }[];
  /** Point forme saisi par le coach pour un sportif inscrit (2026-10-26) : questions à la 3e personne,
      historique lu via /api/coach/bilan (RLS), conseil figé pour ce sportif, pas d'écran de résultat
      (la carte Coach Control se met à jour). L'enregistrement reste à `onSave` (/api/coach/checkin). */
  subject?: { athleteId: string; userId: string; name: string };
}

export default function WellnessModal({ date, onSave, onClose, wizardHero, cancelLabel = "Annuler", onBack, wellnessHistory, askPlan = false, skipResult = false, embedded = false, scoreSlot, scoreSize = 200, footerOffset = 0, subject }: Props) {
  const who = subject ? subject.name.split(" ")[0] : null;
  const { isMd } = useBreakpoint();
  const heroOnLeft = !!wizardHero && isMd;
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
  const [form, setForm] = useState<number | null>(null);
  const [insight, setInsight] = useState<{ key: ScaleKey; text: string; bad: boolean } | null>(null);
  const advanceDelay = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date(`${date}T12:00:00`); since.setDate(since.getDate() - CONSEILS_HISTORY_DAYS);
      const sinceS = new Date(`${date}T12:00:00`); sinceS.setDate(sinceS.getDate() - 120);
      if (subject) {
        const r = await fetch(`/api/coach/bilan?athleteId=${encodeURIComponent(subject.athleteId)}&today=${date}`);
        if (!r.ok) return;
        const j = await r.json();
        const s0 = since.toISOString().slice(0, 10), s1 = sinceS.toISOString().slice(0, 10);
        if (!alive) return;
        setHistory(((j.checkins ?? []) as HistoryRow[]).filter(h => h.date < date && h.date >= s0));
        setForm(formAt(((j.sessions ?? []) as { date: string; rpe: number | null; duration: number | null; done: boolean }[]).filter(x => x.date >= s1), date));
        return;
      }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("wellness_daily")
        .select("date, sleep, stress, recovery, motivation, score, base_score, behaviors")
        .eq("user_id", user.id).lt("date", date).gte("date", since.toISOString().slice(0, 10));
      if (alive && data) setHistory(data as HistoryRow[]);
      // Forme du jour (charge) : la part fixe du score agrégé, la même que l'onglet Récupération.
      const { data: done } = await supabase.from("sessions").select("date, rpe, duration, done")
        .eq("user_id", user.id).eq("done", true).gte("date", sinceS.toISOString().slice(0, 10)).lte("date", date);
      if (alive && done) setForm(formAt(done as { date: string; rpe: number | null; duration: number | null; done: boolean }[], date));
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
  const hasCost = Object.keys(behaviorCost).length > 0;
  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);
  /* Aperçu du wizard seulement : valeurs neutres tant que la question n'a pas de réponse. */
  const pv = { sleep: sleep ?? 7, stress: stress ?? 5, recovery: recovery ?? 7, motivation: motivation ?? 8 };
  const [saving, setSaving] = useState(false);
  // Fermeture animée (croix, fond, Annuler) ; l'enregistrement, lui, ferme tout de suite.
  const { close: closeAnimated, exitClass } = useExitAnimation(onClose);

  /* Aha réactif (2026-09-14, wizard uniquement — voir wizardHero ci-dessous) : la vraie fonction
     de score, recalculée à chaque frappe. Ring/zone pilotés par `base_score` (jamais `score`,
     retour explicite de Gildas : "les badges comportements sont pas censés impacter le score") —
     même convention que wellnessSignal() (wellnessBaseline.ts), qui exclut déjà le bonus/malus
     comportements de tout calcul de "l'état de forme" pour ne pas rendre la corrélation
     tautologique (voir /conseils). Les chips restent affichés (ce qui est coché aujourd'hui),
     ils ne font juste plus bouger le chiffre. */
  const { base_score: liveBaseScore } = computeWellnessScore(pv.sleep, pv.stress, pv.recovery, pv.motivation, behaviors);
  /* Même baseline que /today (computeWellnessBaselineAt) si l'historique fourni suffit. Repli
     (2026-09-14, retour explicite de Gildas) : toujours "Frais"/"Équilibré"/"Fatigué", jamais
     l'ancien vocabulaire absolu ("Zone stable"...) — celui-ci n'est plus affiché nulle part
     ailleurs dans l'app depuis le chantier "Wellness relatif" du 2026-08-30/31, seuils calqués
     sur Z_SWC=0.2 (Φ(±0.2)×100 ≈ 42/58, mêmes bornes que FORM_ZONES). */
  const liveBaseline = wellnessHistory
    ? computeWellnessBaselineAt(
        wellnessHistory.filter(h => h.date < date),
        { ...pv, score: liveBaseScore, base_score: liveBaseScore },
      )
    : null;
  const liveZone = liveBaseline?.hasEnoughHistory
    ? relativeZoneLabel(liveBaseline, "athlete")
    : liveBaseScore >= 58 ? "Frais" : liveBaseScore >= 42 ? "Équilibré" : "Fatigué";
  const liveChips = behaviors.map(k => BEHAVIOR_META[k]).filter(Boolean);

  /* Score qui se construit (2026-10-22, POC « Notes en un tap » + POC Wellness live) : moyenne des
     seules questions répondues (même formule que computeWellnessScore, qui fait la moyenne des 4),
     comparée à sa norme comme sur /today, et même zone que l'écran de résultat (checkinInsight). */
  const answeredParts = [sleep, stress == null ? null : 10 - stress, recovery, motivation].filter((v): v is number => v != null);
  const partBase = answeredParts.length ? Math.round(answeredParts.reduce((a, b) => a + b, 0) / (answeredParts.length * 10) * 100) : null;
  const buildBaseline = (() => {
    if (partBase == null) return null;
    // Même norme que l'onglet Récupération : tous les points forme chargés (fenêtre CONSEILS_HISTORY_DAYS).
    const hist = (wellnessHistory ?? history).filter(h => h.date < date);
    return computeWellnessBaselineAt(hist, { ...pv, score: partBase, base_score: partBase });
  })();
  // Même score que l'onglet Récupération et que l'écran de fin : agrégat ressenti + Forme.
  const buildFeel = partBase == null || !buildBaseline ? null : buildBaseline.hasEnoughHistory && buildBaseline.composite.z != null ? buildBaseline.relativeScore : partBase;
  const buildScore = buildFeel == null ? null : recoveryAggregate(buildFeel, form)?.score ?? null;
  const answerChips = ([["sleep", "😴", sleep], ["stress", "🧠", stress], ["recovery", "💪", recovery], ["motivation", "⚡", motivation]] as const)
    .map(([k, e, v]) => ({ k, e, word: v == null ? null : SCALE_WORDS[k].labels[v] }));
  // Même jauge ouverte que l'onglet Récupération (AggregateGauge), score en gros au centre.
  const buildGauge = recoveryGauge(buildScore);
  function renderBuildingScore(size: number) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", color: "#fff" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 8 }}>{who ? `Récupération de ${who} ce matin` : "Ta récupération ce matin"}</div>
        <AggregateGauge pos={buildGauge.pos} band={buildGauge.band} bands={buildGauge.bands} size={size} />
        {buildScore == null && <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 4 }}>{who ? "Réponds, son score se construit" : "Réponds, ton score se construit"}</div>}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10, maxWidth: 360 }}>
          {answerChips.map(c => (
            <span key={c.k} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: c.word ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)", color: c.word ? "#fff" : "rgba(255,255,255,.35)", transition: "background .2s" }}>
              {c.e} {c.word ?? "…"}
            </span>
          ))}
        </div>
      </div>
    );
  }

  /* Bottom sheet réglable sur mobile (2026-10-22) : le formulaire en bas, le score qui se construit
     au-dessus. Hauteur en % de l'écran, glissée par la poignée, posée sur le cran le plus proche. */
  const SHEET_SNAPS = [52, 66, 92];
  const [sheetH, setSheetH] = useState(66);
  const sheetDrag = useRef<{ y: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sheetMode = !isMd && !wizardHero && !embedded;
  /* Défiler pilote la feuille (2026-10-22) : tant qu'elle n'est pas ouverte en grand, glisser vers le
     haut l'ouvre (le contenu ne défile pas encore) ; ouverte et en haut du contenu, glisser vers le
     bas la rabaisse. Un geste sur la note choisie de la jauge (data-handle) reste un réglage de note. */
  const SHEET_MAX = SHEET_SNAPS[SHEET_SNAPS.length - 1];
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ y: number; used: boolean; skip: boolean } | null>(null);
  function onSheetTouchStart(e: React.TouchEvent) {
    if (!sheetMode) return;
    const skip = !!(e.target as HTMLElement).closest?.("[data-handle]");
    swipe.current = { y: e.touches[0].clientY, used: false, skip };
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    const sw = swipe.current;
    if (!sw || sw.used || sw.skip) return;
    const dy = sw.y - e.touches[0].clientY;  // > 0 : le doigt monte (défiler vers le bas)
    const top = (scrollRef.current?.scrollTop ?? 0) <= 0;
    if (dy > 14 && sheetH < SHEET_MAX) { sw.used = true; setSheetH(SHEET_MAX); }
    else if (dy < -14 && top && sheetH >= SHEET_MAX) { sw.used = true; setSheetH(66); }
  }

  function toggleBehavior(key: string) {
    setBehaviors((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  /* Ressenti vs physiologie (2026-10-11) : si la montre a déjà la nuit de ce jour (FC au repos ou nuit
     de 3 h et plus), la 1re question montre un teaser (PhysioTeaser) ; la comparaison s'affiche après la
     validation (PhysioRevealHost), réponses déjà enregistrées. Jamais dans le wizard. */
  const [physioReady, setPhysioReady] = useState(false);
  useEffect(() => {
    if (wizardHero || subject) return;
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
  }, [date, wizardHero, subject]);

  async function handleSave(override: { motivation?: number } = {}) {
    const m = override.motivation ?? motivation;
    if (sleep == null || stress == null || recovery == null || m == null || bedtime == null) return;
    const motivation_ = m;
    setSaving(true);
    const { base_score, score } = computeWellnessScore(sleep, stress, recovery, motivation_, behaviors);
    await onSave({ sleep, stress, recovery, motivation: motivation_, behaviors, bedtime, base_score, score, plannedIntensity: askPlan ? plannedIntensity : null });
    /* Reco du matin figée côté serveur (2026-10-23) ; le coach lié est prévenu depuis elle si elle dit
       d'alléger. Remplace /api/push/event, qui recalculait la reco avec le moteur générique. */
    fetch("/api/sessions/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subject ? { date, athleteUserId: subject.userId } : { date }) })
      .then(r => { if (!r.ok) console.error("[reco du matin]", r.status); })
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
  const answered = q === 0 ? sleep != null && bedtime != null
    : q === 1 ? stress != null
    : q === 2 ? recovery != null
    : q === 4 ? motivation != null
    : true;
  function goBack() {
    if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    if (step > 0) setStep((s) => s - 1);
  }


  function renderScale(key: ScaleKey, title: string, sub: string, value: number | null, onPick: (n: number) => void, onRelease: (n: number) => void) {
    const w = SCALE_WORDS[key];
    const palette = w.inverted ? "recovery-inverted" : "recovery";
    return (
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: sheetMode ? 27 : 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
          {title}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
          {sub}
        </div>
        <ScaleBars value={value} onChange={onPick} palette={palette} labels={w.labels}
          onRelease={(n) => {
            const ins = notableInsight(key, n, history, date, !!who);
            setInsight(ins ? { key, ...ins } : null);
            // Le temps de lire la ligne avant de passer à la question suivante.
            advanceDelay.current = ins ? 3000 : null;
            onRelease(n);
          }} />
        {insight && insight.key === key && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, fontSize: 14, fontWeight: 700, lineHeight: 1.35,
            background: insight.bad ? "#fff3e8" : "#eef4fc", color: insight.bad ? "#b45309" : "#184f95", animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
            {insight.bad ? "↘ " : "↗ "}{insight.text}
          </div>
        )}
      </div>
    );
  }

  const body = (
    <>
        {/* En-tête « 💓 Wellness du jour · 1 / 5 » retiré (2026-10-27, Gildas : les barres disent déjà où
            on en est). Reste seulement ce qui informe : le retour à l'étape 0, et le nom du sportif quand
            le coach saisit pour lui. */}
        {((step === 0 && onBack) || who) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}>
            {step === 0 && onBack && <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 18, padding: "2px 4px", borderRadius: 8, flexShrink: 0, marginLeft: -4 }}>←</button>}
            {who && <div style={{ fontSize: 13, fontWeight: 700, color: "#172018" }}>Point forme de {who}</div>}
          </div>
        )}

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "#d44000" : "rgba(0,0,0,0.10)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Séance prévue (askPlan) : clic = avance direct, aucune valeur présélectionnée. */}
        {q === -1 && (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: sheetMode ? 27 : 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
              Qu&apos;as-tu prévu aujourd&apos;hui ?
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Rien n&apos;est encore au planning. On cale ta séance sur ta forme.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {PLAN_OPTIONS.map(o => (
                <button
                  key={o.key}
                  onClick={() => { setPlannedIntensity(o.key); setStep(s => s + 1); }}
                  style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16, cursor: "pointer", fontFamily: "inherit", color: "#172018", background: plannedIntensity === o.key ? "rgba(212,64,0,.06)" : "#f7f8f9", border: plannedIntensity === o.key ? "1.5px solid #d44000" : "1.5px solid transparent" }}
                >
                  <span style={{ fontSize: 24, width: 30, textAlign: "center" }}>{o.emoji}</span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{o.label}</span>
                    <span style={{ fontSize: 13, color: "#7b7f82", marginTop: 2 }}>{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 0: Sleep + Bedtime — la question avance une fois les deux réponses données. */}
        {q === 0 && (
          <div>
            {physioReady && <PhysioTeaser label="⌚ Nuit mesurée" text="Renseigne ton ressenti pour le comparer à tes mesures de la nuit." chips={["7h30", "48 bpm", "Zone"]} />}
            {renderScale("sleep", who ? `😴 Comment a dormi ${who} ?` : "😴 Comment as-tu dormi ?", "Qualité et récupération pendant le sommeil", sleep, setSleep, () => { if (bedtime != null) autoAdvance(); })}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "#7b7f82", marginBottom: 8 }}>
                Heure de coucher
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {BEDTIME_OPTIONS.map((o) => {
                  const on = bedtime === o.value;
                  return (
                    <button key={o.value} type="button"
                      onClick={() => { hapticTick(0, 1); setBedtime(o.value); if (sleep != null) autoAdvance(); }}
                      style={{ padding: "9px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, border: on ? "1.5px solid #2a78d6" : "1.5px solid rgba(0,0,0,0.10)", background: on ? "#eaf2fd" : "#fff", color: on ? "#184f95" : "#3b4046" }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Stress */}
        {q === 1 && renderScale("stress", "🧠 Niveau de stress mental", "Travail, vie personnelle, charge mentale", stress, setStress, () => autoAdvance())}

        {/* Step 2: Physical recovery */}
        {q === 2 && renderScale("recovery", "💪 État physique aujourd'hui", "Ressenti musculaire, douleurs, lourdeur", recovery, setRecovery, () => autoAdvance())}

        {/* Step 3: Behaviors */}
        {q === 3 && (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: sheetMode ? 27 : 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
              🔍 Comportements d'hier
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 14 }}>
              {hasCost ? (who ? `Coche tout ce qui s'applique. Le chiffre : son effet moyen sur la récupération de ${who}.` : "Coche tout ce qui s'applique. Le chiffre : son effet moyen sur ta récupération, chez toi.") : "Coche tout ce qui s'applique"}
            </div>

            {/* Negative section */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, color: "#c81e1e", marginBottom: 8 }}>
              {who ? `Ce qui a pénalisé ${who}` : "Ce qui m'a pénalisé"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {NEGATIVE_BEHAVIORS.map((b) => {
                const checked = behaviors.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBehavior(b.key)}
                    style={{
                      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 12,
                      border: checked ? "1px solid rgba(200,30,30,0.40)" : "1px solid rgba(0,0,0,0.10)",
                      background: checked ? "rgba(200,30,30,0.08)" : "#fff",
                      color: checked ? "#c81e1e" : "#7b7f82",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, transition: "all 0.14s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.emoji}</span>{b.label}
                    {behaviorCost[b.key] != null && <CostBadge impact={behaviorCost[b.key]} />}
                  </button>
                );
              })}
            </div>

            {/* Positive section */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, color: "#2f9e44", marginBottom: 8 }}>
              {who ? `Ce que ${who} a fait de bien` : "Ce que j'ai fait de bien"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {POSITIVE_BEHAVIORS.map((b) => {
                const checked = behaviors.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBehavior(b.key)}
                    style={{
                      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 12,
                      border: checked ? "1px solid rgba(47,158,68,0.40)" : "1px solid rgba(0,0,0,0.10)",
                      background: checked ? "rgba(47,158,68,0.08)" : "#fff",
                      color: checked ? "#2f9e44" : "#7b7f82",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, transition: "all 0.14s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.emoji}</span>{b.label}
                    {behaviorCost[b.key] != null && <CostBadge impact={behaviorCost[b.key]} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Motivation — dernière question : le tap enregistre. */}
        {q === 4 && renderScale("motivation", who ? `⚡ ${who} a envie de s'entraîner ?` : "⚡ As-tu envie de t'entraîner ?", "Motivation intrinsèque du moment", motivation, setMotivation, (n) => autoAdvance({ motivation: n }))}

    </>
  );
  const footer = (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, padding: sheetMode ? "12px 22px max(14px, env(safe-area-inset-bottom))" : embedded ? "10px 14px max(12px, env(safe-area-inset-bottom))" : "20px 34px 20px", background: embedded ? "#f1f0ee" : "#fff" }}>
          {step > 0 ? (
            <button
              onClick={goBack}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#172018", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              ← Retour
            </button>
          ) : (
            <button
              onClick={closeAnimated}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 16px", borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#7b7f82", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={goNext}
            disabled={saving || (q === -1 && !plannedIntensity) || !answered}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 16, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.20)", opacity: (q === -1 && !plannedIntensity) || !answered ? 0.45 : 1 }}
          >
            {saving ? <span aria-label="Enregistrement" style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spinBtn 0.7s linear infinite" }} /> : step === total - 1 ? "Valider ✓" : q === 3 && behaviors.length === 0 ? "Rien de particulier →" : "Suivant →"}
          </button>
        </div>
  );

  /* Intégré à la feuille de l'Accueil : questions + boutons collés en bas, score porté en haut de page. */
  if (embedded) {
    return (
      <div style={{ color: "#171b1f", paddingTop: 4 }}>
        {body}
        <div style={{ position: "sticky", bottom: footerOffset, margin: "14px -14px 0", background: "#f1f0ee", zIndex: 2 }}>{footer}</div>
        {scoreSlot && createPortal(renderBuildingScore(scoreSize), scoreSlot)}
      </div>
    );
  }

  /* Drawer docké à droite sur desktop, plein écran mobile (2026-09-04, même shell que
     ProgramCriteriaModal.tsx/InviteModal.tsx/ProgramAssignModal.tsx — "tout le wizard doit
     utiliser les drawer", demande explicite de Gildas, appliqué aussi à l'usage in-app /today). */
  return (
    <div
      style={{
        position: "fixed", top: wizardHero ? WIZARD_BANNER_H : 0, right: 0, bottom: 0, left: 0,
        background: sheetMode ? DARK_CARD_BG : "rgba(0,0,0,0.72)",
        backdropFilter: sheetMode ? undefined : "blur(16px)", WebkitBackdropFilter: sheetMode ? undefined : "blur(16px)",
        display: "flex", flexDirection: sheetMode ? "column" : "row", alignItems: "stretch", justifyContent: heroOnLeft || (isMd && !wizardHero) ? "flex-start" : (isMd ? "flex-end" : "stretch"),
        zIndex: 2147483100, overflow: "hidden",
      }}
      className={exitClass}
      onClick={(e) => { if (e.target === e.currentTarget) closeAnimated(); }}
    >
      {isMd && !wizardHero && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 48, background: DARK_CARD_BG }}
          onClick={closeAnimated}>
          <div onClick={e => e.stopPropagation()}>{renderBuildingScore(260)}</div>
        </div>
      )}
      {sheetMode && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "max(16px, env(safe-area-inset-top)) 20px 12px", overflow: "hidden" }}>
          {renderBuildingScore(sheetH > 80 ? 110 : sheetH > 60 ? 200 : 240)}
        </div>
      )}
      {heroOnLeft && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 48px 0", background: DARK_CARD_BG }}>
          <div style={{ maxWidth: 480, width: "100%" }}>
            {wizardHero}
            {/* Aha réactif (2026-09-14) : le point forme se construit en direct pendant la saisie —
                même vraie fonction de score que la sauvegarde, jamais une approximation dédiée à
                l'affichage. Composant additif, ne change rien à la disposition existante du hero. */}
            <div style={{ padding: "10px 12px", marginTop: 22, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16 }}>
              {/* Chips sous le libellé de zone, à droite du ring (retour explicite de Gildas) —
                  plus une ligne pleine largeur sous tout le bloc. */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Taille alignée sur FullWellnessAdvicePreview (2026-09-14, retour explicite de
                    Gildas — "à peu près la même taille que" la slide 1 de DecisionStep.tsx). */}
                <WellnessRing score={liveBaseScore} size={72} strokeWidth={6} dark />
                <div>
                  {/* Statut en blanc, taille alignée sur FullWellnessAdvicePreview (2026-09-14,
                      retours explicites de Gildas) — plus coloré selon le score, la couleur reste
                      réservée au ring lui-même. */}
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>{liveZone}</div>
                  {liveChips.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {liveChips.map(c => (
                        <span key={c.label} style={{ fontSize: 10.5, fontWeight: 700, background: c.positive ? "rgba(47,158,68,.16)" : "rgba(212,64,0,.18)", color: c.positive ? "#7fdb8f" : "#ffb99a", padding: "4px 9px", borderRadius: 999 }}>
                          {c.positive ? "✓" : "⚠"} {c.emoji} {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Conseil récupération réel (2026-09-14, desktop uniquement — ce bloc heroOnLeft
                  n'est de toute façon rendu que sur desktop) : même fonction que /today,
                  getRecoveryAdvice(). loadCls="moderate" par défaut faute de séance du jour
                  connue à cet endroit (WellnessModal n'a aucune notion de programme/séance). */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>
                🌿 {getRecoveryAdvice({ ...pv, behaviors }, "moderate", liveBaseline)}
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{
        background: "#fff",
        color: "#171b1f",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : sheetMode ? "0 -18px 50px rgba(0,0,0,.35)" : "none",
        borderRadius: isMd ? "24px 0 0 24px" : sheetMode ? "24px 24px 0 0" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        /* Feuille : hauteur = son contenu, plafonnée par le cran choisi. Jamais plus haute que son
           contenu, donc jamais de blanc sous le formulaire (2026-10-22, retour de Gildas). */
        height: sheetMode ? undefined : wizardHero ? `calc(100dvh - ${WIZARD_BANNER_H}px)` : "100dvh",
        maxHeight: sheetMode ? `${sheetH}dvh` : undefined,
        flexShrink: 0, transition: sheetMode && !dragging ? "max-height .25s cubic-bezier(0.2,0,0,1)" : undefined,
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : sheetMode ? "sheetInUp 0.25s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {sheetMode && (
          <div
            role="slider" aria-label="Hauteur du formulaire" aria-valuemin={SHEET_SNAPS[0]} aria-valuemax={SHEET_SNAPS[SHEET_SNAPS.length - 1]} aria-valuenow={sheetH}
            onPointerDown={e => { sheetDrag.current = { y: e.clientY, h: sheetH }; setDragging(true); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }}
            onPointerMove={e => {
              const d = sheetDrag.current; if (!d) return;
              const h = d.h + ((d.y - e.clientY) / window.innerHeight) * 100;
              setSheetH(Math.max(SHEET_SNAPS[0] - 6, Math.min(96, h)));
            }}
            onPointerUp={() => {
              if (!sheetDrag.current) return; sheetDrag.current = null; setDragging(false);
              setSheetH(h => SHEET_SNAPS.reduce((best, x) => (Math.abs(x - h) < Math.abs(best - h) ? x : best), SHEET_SNAPS[0]));
            }}
            onPointerCancel={() => { sheetDrag.current = null; setDragging(false); }}
            style={{ flexShrink: 0, padding: "10px 0 8px", display: "flex", justifyContent: "center", touchAction: "none", cursor: "grab" }}
          >
            <span style={{ width: 42, height: 5, borderRadius: 999, background: "rgba(0,0,0,.18)" }} />
          </div>
        )}
        <div ref={scrollRef} onTouchStart={onSheetTouchStart} onTouchMove={onSheetTouchMove} onTouchEnd={() => { swipe.current = null; }}
          style={{ flex: sheetMode ? "0 1 auto" : 1, minHeight: 0, overflowY: sheetMode && sheetH < SHEET_MAX ? "hidden" : "auto", padding: sheetMode ? "4px 22px 18px" : 34 }}>
        {/* Hero déplacé DANS la zone scrollable sur mobile (2026-09-08) — voir ProgramCreatePicker.tsx.
            Marge basse retirée (2026-09-14) : la bande live juste en dessous doit être directement
            accolée au hero (même fond dark, aucun écart blanc entre les deux) — l'espacement de 20px
            avant le formulaire est désormais porté par la bande elle-même. */}
        {wizardHero && !isMd && <div style={{ margin: "-34px -34px 0" }}>{wizardHero}</div>}
        {/* Aha réactif mobile (2026-09-14) : même carte que le hero desktop. Retiré de
            position:sticky (retour explicite de Gildas — ligne blanche parasite au scroll,
            probable seam de rendu sticky+backdropFilter du drawer) : reste en flux normal,
            collée directement au header. Écart du dessus = padding-bottom de WizardHero (24px)
            seul, comme les autres pages du wizard. Espace avant le formulaire = margin-bottom 20px
            (même valeur que ProgramAssignModal.tsx/ProgramCreatePicker.tsx/etc., "standard aux
            autres pages") + padding-bottom 14 (dark, dans l'encadré) pour ne pas coller l'encadré
            à la frontière dark/form (retour explicite — "je veux un espace"). */}
        {wizardHero && !isMd && (
          <div style={{ margin: "0 -34px 20px", padding: "0 28px 14px", background: DARK_CARD_BG }}>
            {/* Même encadré que le hero desktop (2026-09-14, retour explicite de Gildas —
                "encapsule ... dans l'encadré de couleur comme en desktop") : le fond dark reste
                flush avec wizardHero (pas de seam), l'encadré translucide flotte dedans. Padding
                horizontal 28 (pas 34) pour rester aligné avec le padding interne de WizardHero
                ("22px 28px 24px") — le texte du dessus et cet encadré démarrent au même x. */}
            <div style={{ padding: "8px 10px", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {/* Légèrement réduit vs desktop (2026-09-14, retour explicite de Gildas — "réduit
                    un peu la taille de la ring et du status en mobile"), toujours alignée sur
                    FullWellnessAdvicePreview en desktop (72/22). */}
                <WellnessRing score={liveBaseScore} size={60} strokeWidth={5} dark />
                {/* Chips ajoutés en mobile (2026-09-14, retour explicite de Gildas) — même disposition
                    que le hero desktop : à droite du ring, sous le statut (blanc, plus coloré). */}
                <div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff" }}>{liveZone}</div>
                  {liveChips.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {liveChips.map(c => (
                        <span key={c.label} style={{ fontSize: 10, fontWeight: 700, background: c.positive ? "rgba(47,158,68,.16)" : "rgba(212,64,0,.18)", color: c.positive ? "#7fdb8f" : "#ffb99a", padding: "3px 8px", borderRadius: 999 }}>
                          {c.positive ? "✓" : "⚠"} {c.emoji} {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {body}
        </div>
        {/* Navigation — flex item non-scrollable (pas position:sticky, voir convention "Footer
            non-scrollable des modales" déjà établie dans ce repo pour ce genre de carte). */}
        {footer}
      </div>
    </div>
  );
}
