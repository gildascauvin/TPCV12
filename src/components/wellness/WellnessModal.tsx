"use client";

import { useState } from "react";
import { computeWellnessScore, getRecoveryAdvice } from "@/lib/wellness";
import { computeWellnessBaselineAt, relativeZoneLabel } from "@/lib/wellnessBaseline";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { WIZARD_BANNER_H } from "@/components/paywall/UnsavedBanner";
import WellnessRing from "@/components/wellness/WellnessRing";

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
  }) => Promise<void>;
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

export default function WellnessModal({ date, onSave, onClose, wizardHero, cancelLabel = "Annuler", onBack, wellnessHistory }: Props) {
  const { isMd } = useBreakpoint();
  const heroOnLeft = !!wizardHero && isMd;
  const [step, setStep] = useState(0);
  const [sleep, setSleep] = useState(7);
  const [bedtime, setBedtime] = useState("23to00");
  const [stress, setStress] = useState(5);
  const [recovery, setRecovery] = useState(7);
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [motivation, setMotivation] = useState(8);
  const [saving, setSaving] = useState(false);

  /* Aha réactif (2026-09-14, wizard uniquement — voir wizardHero ci-dessous) : la vraie fonction
     de score, recalculée à chaque frappe. Ring/zone pilotés par `base_score` (jamais `score`,
     retour explicite de Gildas : "les badges comportements sont pas censés impacter le score") —
     même convention que wellnessSignal() (wellnessBaseline.ts), qui exclut déjà le bonus/malus
     comportements de tout calcul de "l'état de forme" pour ne pas rendre la corrélation
     tautologique (voir /conseils). Les chips restent affichés (ce qui est coché aujourd'hui),
     ils ne font juste plus bouger le chiffre. */
  const { base_score: liveBaseScore } = computeWellnessScore(sleep, stress, recovery, motivation, behaviors);
  /* Même baseline que /today (computeWellnessBaselineAt) si l'historique fourni suffit. Repli
     (2026-09-14, retour explicite de Gildas) : toujours "Frais"/"Équilibré"/"Fatigué", jamais
     l'ancien vocabulaire absolu ("Zone stable"...) — celui-ci n'est plus affiché nulle part
     ailleurs dans l'app depuis le chantier "Wellness relatif" du 2026-08-30/31, seuils calqués
     sur Z_SWC=0.2 (Φ(±0.2)×100 ≈ 42/58, mêmes bornes que FORM_ZONES). */
  const liveBaseline = wellnessHistory
    ? computeWellnessBaselineAt(
        wellnessHistory.filter(h => h.date < date),
        { sleep, stress, recovery, motivation, score: liveBaseScore, base_score: liveBaseScore },
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

  async function handleSave() {
    setSaving(true);
    const { base_score, score } = computeWellnessScore(sleep, stress, recovery, motivation, behaviors);
    await onSave({ sleep, stress, recovery, motivation, behaviors, bedtime, base_score, score });
    setSaving(false);
  }

  function goNext() {
    if (step < WQ_TOTAL - 1) setStep((s) => s + 1);
    else handleSave();
  }
  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  const negativeCount = behaviors.filter(b => NEGATIVE_BEHAVIORS.some(n => n.key === b)).length;
  const positiveCount = behaviors.filter(b => POSITIVE_BEHAVIORS.some(p => p.key === b)).length;
  const penalty = Math.min(negativeCount * 3, 15);

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
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 48px 0", background: "#141414" }}>
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
                  <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.03em", color: "#fff" }}>{liveZone}</div>
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
                🌿 {getRecoveryAdvice({ sleep, stress, recovery, motivation, behaviors }, "moderate", liveBaseline)}
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{
        background: "#fff",
        color: "#171b1f",
        boxShadow: isMd ? "-32px 0 80px rgba(0,0,0,.30)" : "none",
        borderRadius: isMd ? "28px 0 0 28px" : 0,
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
          <div style={{ margin: "0 -34px 20px", padding: "0 28px 14px", background: "#141414" }}>
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
                  <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#fff" }}>{liveZone}</div>
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
          <div style={{ fontSize: 11, color: "#7b7f82" }}>{step + 1} / {WQ_TOTAL}</div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
          {Array.from({ length: WQ_TOTAL }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "#d44000" : "rgba(0,0,0,0.10)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Step 0: Sleep + Bedtime */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              😴 Comment as-tu dormi ?
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Qualité et récupération pendant le sommeil
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={sleep} step={1}
                onChange={(e) => setSleep(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {sleep}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82", marginBottom: 18 }}>
              <span>Très mauvais</span><span>Excellent</span>
            </div>
            {/* Bedtime select */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7b7f82", marginBottom: 6 }}>
                Heure de coucher
              </div>
              <select
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                style={{ width: "100%", background: "#fff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: "#172018", fontFamily: "inherit", outline: "none" }}
              >
                {BEDTIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Stress */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              🧠 Niveau de stress mental
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Travail, vie personnelle, charge mentale
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={stress} step={1}
                onChange={(e) => setStress(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {stress}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Zen total</span><span>Très élevé</span>
            </div>
          </div>
        )}

        {/* Step 2: Physical recovery */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              💪 État physique aujourd'hui
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Ressenti musculaire, douleurs, lourdeur
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={recovery} step={1}
                onChange={(e) => setRecovery(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {recovery}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Courbatures sévères</span><span>Frais et dispo</span>
            </div>
          </div>
        )}

        {/* Step 3: Behaviors */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              🔍 Comportements d'hier
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 14 }}>
              Coche tout ce qui s'applique
            </div>

            {/* Negative section */}
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#c81e1e", marginBottom: 8 }}>
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
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10,
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
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#2f9e44", marginBottom: 8 }}>
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
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10,
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

        {/* Step 4: Motivation */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              ⚡ As-tu envie de t'entraîner ?
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Motivation intrinsèque du moment
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={motivation} step={1}
                onChange={(e) => setMotivation(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {motivation}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Pas du tout</span><span>Au max</span>
            </div>
          </div>
        )}

        </div>
        {/* Navigation — flex item non-scrollable (pas position:sticky, voir convention "Footer
            non-scrollable des modales" déjà établie dans ce repo pour ce genre de carte). */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, padding: "20px 34px 20px", background: "#fff" }}>
          {step > 0 ? (
            <button
              onClick={goBack}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#172018", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              ← Retour
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#7b7f82", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={goNext}
            disabled={saving}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.20)" }}
          >
            {saving ? "..." : step === WQ_TOTAL - 1 ? "Valider ✓" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
