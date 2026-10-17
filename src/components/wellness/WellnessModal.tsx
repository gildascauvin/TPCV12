"use client";

import { hapticTick } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { invalidatePhysio, requestPhysioReveal } from "@/lib/physioData";
import { computeWellnessScore, getRecoveryAdvice } from "@/lib/wellness";
import { computeWellnessBaselineAt, relativeZoneLabel } from "@/lib/wellnessBaseline";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { WIZARD_BANNER_H } from "@/components/paywall/UnsavedBanner";
import { DARK_CARD_BG } from "@/lib/theme";
import PhysioTeaser from "@/components/physio/PhysioTeaser";
import ScaleBars from "@/components/ui/ScaleBars";
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
  { key: "hard", emoji: "🔥", label: "Dur", sub: "Séance intense, compétition" },
];

/* Échelles 1-10 (ScaleBars) : un libellé par note, extrémités reprises des anciens curseurs.
   Le stress est la seule question où 10 = mauvais : sa palette bleue est inversée. */
const L = (...w: string[]) => Object.fromEntries(w.map((x, i) => [i + 1, x])) as Record<number, string>;
const SCALE_WORDS = {
  sleep: { labels: L("Très mauvais", "Mauvais", "Médiocre", "Passable", "Moyen", "Correct", "Bon", "Très bon", "Reposant", "Excellent"), inverted: false },
  stress: { labels: L("Zen total", "Très calme", "Calme", "Léger", "Modéré", "Présent", "Marqué", "Fort", "Élevé", "Très élevé"), inverted: true },
  recovery: { labels: L("Courbatures sévères", "Très douloureux", "Douloureux", "Lourd", "Raide", "Correct", "Bien", "Frais", "Très frais", "Frais et dispo"), inverted: false },
  motivation: { labels: L("Pas du tout", "Très faible", "Faible", "Peu", "Moyenne", "Correcte", "Bonne", "Forte", "Très forte", "Au max"), inverted: false },
} as const;
type ScaleKey = keyof typeof SCALE_WORDS;

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
}

export default function WellnessModal({ date, onSave, onClose, wizardHero, cancelLabel = "Annuler", onBack, wellnessHistory, askPlan = false }: Props) {
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
  useEffect(() => () => { if (advanceTimer.current) window.clearTimeout(advanceTimer.current); }, []);
  /* Aperçu du wizard seulement : valeurs neutres tant que la question n'a pas de réponse. */
  const pv = { sleep: sleep ?? 7, stress: stress ?? 5, recovery: recovery ?? 7, motivation: motivation ?? 8 };
  const [saving, setSaving] = useState(false);

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
    if (wizardHero) return;
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
  }, [date, wizardHero]);

  async function handleSave(override: { motivation?: number } = {}) {
    const m = override.motivation ?? motivation;
    if (sleep == null || stress == null || recovery == null || m == null || bedtime == null) return;
    const motivation_ = m;
    setSaving(true);
    const { base_score, score } = computeWellnessScore(sleep, stress, recovery, motivation_, behaviors);
    await onSave({ sleep, stress, recovery, motivation: motivation_, behaviors, bedtime, base_score, score, plannedIntensity: askPlan ? plannedIntensity : null });
    // Coach prévenu tout de suite si la reco du jour est d'alléger (2026-10-14). Sans effet hors compte lié.
    fetch("/api/push/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "checkin", date }) }).catch(() => {});
    setSaving(false);
    if (physioReady) {
      invalidatePhysio();
      requestPhysioReveal({ kind: "wellness", date, sleep, stress, recovery, motivation: motivation_ });
    }
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
    }, 380);
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
        <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
          {title}
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
          {sub}
        </div>
        <ScaleBars value={value} onChange={onPick} onRelease={onRelease} palette={palette} labels={w.labels} />
      </div>
    );
  }

  /* Drawer docké à droite sur desktop, plein écran mobile (2026-09-04, même shell que
     ProgramCriteriaModal.tsx/InviteModal.tsx/ProgramAssignModal.tsx — "tout le wizard doit
     utiliser les drawer", demande explicite de Gildas, appliqué aussi à l'usage in-app /today). */
  return (
    <div
      style={{
        position: "fixed", top: wizardHero ? WIZARD_BANNER_H : 0, right: 0, bottom: 0, left: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "stretch", justifyContent: heroOnLeft ? "flex-start" : (isMd ? "flex-end" : "stretch"),
        zIndex: 2147483100, overflow: "hidden",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
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
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "24px 0 0 24px" : 0,
        width: isMd ? "50vw" : "100%", maxWidth: isMd ? "50vw" : "100%",
        height: wizardHero ? `calc(100dvh - ${WIZARD_BANNER_H}px)` : "100dvh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: isMd ? "drawerInRight 0.22s cubic-bezier(0.2,0,0,1)" : "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 34 }}>
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
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {step === 0 && onBack && <button onClick={onBack} aria-label="Retour" style={{ background: "none", border: "none", cursor: "pointer", color: "#8a8f94", fontSize: 18, padding: "2px 4px", borderRadius: 8, flexShrink: 0, marginLeft: -4 }}>←</button>}
            <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "#172018" }}>
              💓 Wellness du jour
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#7b7f82" }}>{step + 1} / {total}</div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "#d44000" : "rgba(0,0,0,0.10)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Séance prévue (askPlan) : clic = avance direct, aucune valeur présélectionnée. */}
        {q === -1 && (
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
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
            {renderScale("sleep", "😴 Comment as-tu dormi ?", "Qualité et récupération pendant le sommeil", sleep, setSleep, () => { if (bedtime != null) autoAdvance(); })}
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
            <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", marginBottom: 6, color: "#172018" }}>
              🔍 Comportements d'hier
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 14 }}>
              Coche tout ce qui s'applique
            </div>

            {/* Negative section */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, color: "#c81e1e", marginBottom: 8 }}>
              Ce qui m'a pénalisé
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 14 }}>
              {NEGATIVE_BEHAVIORS.map((b) => {
                const checked = behaviors.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBehavior(b.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 12,
                      border: checked ? "1px solid rgba(200,30,30,0.40)" : "1px solid rgba(0,0,0,0.10)",
                      background: checked ? "rgba(200,30,30,0.08)" : "#fff",
                      color: checked ? "#c81e1e" : "#7b7f82",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, transition: "all 0.14s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.emoji}</span>{b.label}
                  </button>
                );
              })}
            </div>

            {/* Positive section */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase" as const, color: "#2f9e44", marginBottom: 8 }}>
              Ce que j'ai fait de bien
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {POSITIVE_BEHAVIORS.map((b) => {
                const checked = behaviors.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBehavior(b.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 12,
                      border: checked ? "1px solid rgba(47,158,68,0.40)" : "1px solid rgba(0,0,0,0.10)",
                      background: checked ? "rgba(47,158,68,0.08)" : "#fff",
                      color: checked ? "#2f9e44" : "#7b7f82",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" as const, transition: "all 0.14s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.emoji}</span>{b.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Motivation — dernière question : le tap enregistre. */}
        {q === 4 && renderScale("motivation", "⚡ As-tu envie de t'entraîner ?", "Motivation intrinsèque du moment", motivation, setMotivation, (n) => autoAdvance({ motivation: n }))}

        </div>
        {/* Navigation — flex item non-scrollable (pas position:sticky, voir convention "Footer
            non-scrollable des modales" déjà établie dans ce repo pour ce genre de carte). */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, padding: "20px 34px 20px", background: "#fff" }}>
          {step > 0 ? (
            <button
              onClick={goBack}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#172018", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              ← Retour
            </button>
          ) : (
            <button
              onClick={onClose}
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
            {saving ? "..." : step === total - 1 ? "Valider ✓" : q === 3 && behaviors.length === 0 ? "Rien de particulier →" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
