"use client";

import { useState } from "react";
import DiffGauge from "@/components/calendar/DiffGauge";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AlertBox from "@/components/calendar/AlertBox";
import ShareButton from "@/components/sessions/ShareButton";
import UnseenDot, { hasUnseenAttachment } from "@/components/sessions/UnseenDot";
import { zoneLabel, wellnessColor } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { parseAndApply } from "@/lib/loadAdjust";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, suggestionSeverityColor, type AutoregOriginal } from "@/lib/autoregulation";
import {
  Z_SWC, Z_MODERATE, relativeZoneLabel,
  type WellnessBaselineResult, type Perspective as BaselinePerspective,
} from "@/lib/wellnessBaseline";
import type { TrendCode } from "@/lib/trainingLoad";
import type { CoachAthlete, CoachViewSession } from "@/types";

/* Carte sportif de Coach Control — extraite de CoachClient.tsx pour être réutilisable ailleurs
   (ex. aperçu onboarding coach) sans dupliquer la logique décision/risque. */

// Dégradé séquentiel bleu (wellnessColor) — voir SparkLineClient.tsx pour la doc complète du
// choix. null garde son propre gris translucide (ring vide, pas une valeur basse).
export function scoreColor(s: number | null) { return s === null ? "rgba(255,255,255,0.18)" : wellnessColor(s); }

export function WellnessRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const r = Math.round(size * 0.423);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const sw = Math.round(size * 0.077);
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 16px rgba(0,0,0,.18))" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.307), fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color }}>{score !== null ? score : "—"}</span>
        <span style={{ fontSize: Math.round(size * 0.11), fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,0.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

export function maxDiffToday(athleteId: string, sessions: CoachViewSession[]) {
  const s = sessions.filter(x => x.athlete_id === athleteId);
  return s.length ? Math.max(...s.map(x => x.target_difficulty ?? 6)) : 0;
}

/* trend?: résultat de classifyTrend() (trainingLoad.ts) sur les 7j courants vs 7j précédents du
   sportif — optionnel partout, absent pour tous les appelants qui n'ont pas cet historique
   (alerts.ts, aperçu onboarding WeekPreviewStep) : comportement strictement inchangé pour eux. */
const TREND_ALERT: ReadonlySet<TrendCode> = new Set<TrendCode>(["accumulation", "fatigue_persistante"]);

/* `baseline` (optionnel, partout) : dès que l'historique du sportif est suffisant, ces 3 fonctions
   comparent au Z-score personnel (src/lib/wellnessBaseline.ts) plutôt qu'au score absolu — absent/
   `hasEnoughHistory=false` = repli exact sur `a.wellness_score` en absolu, comportement 100%
   inchangé pour tout appelant qui ne fournit pas encore ce paramètre (ex. aperçu onboarding). Le
   garde-fou absolu (`baseline.guardRailTriggered`, score composite brut < 40) escalade toujours au
   palier le plus sévère même si le Z lit "dans sa norme" — jamais masqué par une norme perso basse. */
function isLowZ(baseline?: WellnessBaselineResult | null): boolean {
  if (!baseline?.hasEnoughHistory || baseline.composite.z === null) return false;
  return baseline.composite.z < -Z_MODERATE || baseline.guardRailTriggered;
}
function isMildLowZ(baseline?: WellnessBaselineResult | null): boolean {
  if (!baseline?.hasEnoughHistory || baseline.composite.z === null) return false;
  return baseline.composite.z < -Z_SWC || baseline.guardRailTriggered;
}

export function attention(a: CoachAthlete, maxDiff: number, trend?: TrendCode | null, baseline?: WellnessBaselineResult | null) {
  if (trend && TREND_ALERT.has(trend)) return true; // charge en accumulation ou fatigue persistante : alerte même si le snapshot du jour semble OK
  if (a.wellnessFilledToday === false) return maxDiff >= 8; // pas de wellness du jour : seule une séance dure prévue justifie une alerte
  if (baseline?.hasEnoughHistory) return isLowZ(baseline) || (isMildLowZ(baseline) && maxDiff >= 5) || maxDiff >= 8;
  return a.wellness_score < 55 ||
    (a.wellness_score < 65 && maxDiff >= 5) ||
    maxDiff >= 8;
}

export function riskScore(a: CoachAthlete, maxDiff: number, trend?: TrendCode | null, baseline?: WellnessBaselineResult | null): number {
  let score = 0;
  if (a.wellnessFilledToday !== false) {
    if (baseline?.hasEnoughHistory) {
      if (isLowZ(baseline)) score += 4;
      else if (isMildLowZ(baseline)) score += 2;
    } else {
      if (a.wellness_score < 55) score += 4;
      else if (a.wellness_score < 65) score += 2;
    }
  }
  if (maxDiff >= 8) score += 3;
  else if (maxDiff >= 6) score += 1;
  if (trend && TREND_ALERT.has(trend)) score += 2;
  return score;
}

/* `selfView` (2026-08-17, réutilisation de CoachCard pour la carte "toi" du sportif dans
   l'onboarding — voir DecisionStep.tsx) : 2 des branches ci-dessous parlent de l'athlète à la 3e
   personne ("vérifier avec lui", "qu'il n'enchaîne pas dur"), correct quand c'est un coach qui
   regarde un vrai sportif, faux quand la carte représente l'utilisateur lui-même. `undefined`/
   `false` par défaut : comportement 100% inchangé pour /coach et /coach/planning. */
export function decisionText(a: CoachAthlete, maxDiff: number, trend?: TrendCode | null, selfView?: boolean, baseline?: WellnessBaselineResult | null) {
  if (trend === "accumulation") return "Charge en hausse cette semaine + récupération qui se dégrade : accumulation à surveiller.";
  if (trend === "fatigue_persistante") return "Charge en baisse mais récupération toujours dégradée : fatigue pas encore résorbée.";
  if (a.wellnessFilledToday === false) {
    if (maxDiff >= 8) return selfView
      ? "Récupération non renseignée aujourd'hui + séance dure prévue : vérifie avant de te lancer."
      : "Récupération non renseignée aujourd'hui + séance dure prévue : vérifier avec lui avant.";
    return "Récupération non renseignée aujourd'hui.";
  }
  const useZ = baseline?.hasEnoughHistory ?? false;
  const mildLowZ = useZ ? isMildLowZ(baseline) : a.wellness_score < 65;
  const mildLabel = useZ ? "Un peu fatigué" : "Récupération légèrement basse";
  // Le cas "Fatigué + séance dure" est désormais entièrement couvert par computeAutoregSuggestion()
  // (chips Alléger, seuils Z_SWC/diff≥8 — voir autoregulation.ts) : decisionText() n'est appelé
  // qu'en repli quand computeAutoregSuggestion() a déjà renvoyé null (tous les appelants), donc plus
  // jamais atteint pour ce cas précis — branche retirée plutôt que laissée en texte incohérent
  // ("alléger maintenant" sans bouton pour le faire).
  if (maxDiff >= 8) return selfView
    ? "Séance dure prévue : assure-toi de ne pas enchaîner trop dur."
    : "Séance dure prévue : vérifier qu'il n'enchaîne pas dur.";
  if (mildLowZ && maxDiff <= 4) return `${mildLabel}, séance légère : rien à changer, surveiller demain.`;
  if (mildLowZ) return "Récupération à surveiller : réduire le volume ou vérifier la difficulté réelle.";
  return "Plan cohérent : suivre la difficulté réelle.";
}

/* Zone relative si `baseline` est fourni et son historique suffisant, sinon repli exact sur
   l'ancien zoneLabel() absolu (comportement inchangé pour tout appelant qui ne câble pas encore
   `baseline`, ex. aperçu onboarding). */
function zoneLabelFor(score: number | null, baseline: WellnessBaselineResult | null | undefined, perspective: BaselinePerspective): string {
  if (score === null) return "Non renseigné";
  if (baseline?.hasEnoughHistory) return relativeZoneLabel(baseline, perspective);
  return zoneLabel(score);
}

export function CoachCard({ athlete, sessions, isPriority, isReviewed, onDecide, onApplyAdjust, onUndoAdjust, onAutoregDecided, onAutoregUndone, tourId, trend, coachName, selfView, isActive, baseline }: {
  athlete: CoachAthlete;
  sessions: CoachViewSession[];
  isPriority: boolean;
  isReviewed: boolean;
  onDecide: () => void;
  /* Écriture réelle de la décharge/surcharge — déléguée au parent (callSessionAPI côté coach,
     RLS bloque l'écriture cross-user directe). Jamais appelé pour "Maintenir" (aucune donnée
     à modifier dans ce cas). */
  onApplyAdjust: (session: CoachViewSession, pct: number) => Promise<void>;
  /* "Annuler" une décision déjà appliquée — réécrit notes/target_difficulty d'origine tels quels
     (snapshot capturé au moment de l'application, voir autoregulation.ts), jamais une inversion
     calculée de parseAndApply()/adjustDifficulty(). */
  onUndoAdjust: (session: CoachViewSession, original: AutoregOriginal) => Promise<void>;
  /* Marque l'athlète "traité" (Maintenir OU décharge/surcharge appliquée) — garde le compteur
     "Décisions restantes" du bandeau du haut synchronisé avec ce chemin de décision rapide. */
  onAutoregDecided: () => void;
  /* Symétrique : "Annuler" repasse l'athlète en attente de décision. */
  onAutoregUndone: () => void;
  tourId?: string;
  trend?: TrendCode | null;
  coachName?: string;
  /* Carte représentant l'utilisateur lui-même (pas un vrai sportif suivi par un coach) — bascule
     decisionText()/autoregAdvice() en 2e personne. Voir décisionText() ci-dessus. `undefined` par
     défaut, zéro impact sur /coach et /coach/planning. */
  selfView?: boolean;
  /* Passé tel quel à AutoregButtons — évite de marquer "traité" localement quand onApplyAdjust
     n'a en réalité rien écrit (compte non actif, requireSubscription a juste déclenché le
     paywall/signup). `undefined`/absent = toujours considéré actif (usages onboarding/aperçus,
     jamais réellement gatés — voir AutoregButtons.tsx). */
  isActive?: boolean;
  /* Baseline personnelle (Z-score, src/lib/wellnessBaseline.ts) du sportif — calculée par le parent
     (historique multi-jours réel pour un vrai sportif, historique synthétique déterministe via
     syntheticBaselineFor()/src/lib/sandboxFixtures.ts pour un sportif démo/aperçu onboarding — même
     calcul dans les deux cas, jamais deux formules séparées). `undefined`/absent = repli automatique
     sur les seuils absolus actuels, comportement 100% inchangé. */
  baseline?: WellnessBaselineResult | null;
}) {
  const maxDiff = maxDiffToday(athlete.id, sessions);
  const todaySessions = sessions.filter(s => s.athlete_id === athlete.id);
  const topSession = [...todaySessions].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  const extraSessions = todaySessions.length - (topSession ? 1 : 0);
  const perspective: BaselinePerspective = selfView ? "athlete" : "coach";
  const decision = decisionText(athlete, maxDiff, trend, selfView, baseline);
  const showBadge = isPriority && !isReviewed;
  const showReviewed = isPriority && isReviewed;
  const behaviors = athlete.behaviors ?? [];
  const firstName = athlete.name.split(" ")[0];
  /* Score ABSOLU brut — celui qu'`athlete.wellness_score` porte déjà, jamais transformé. Sert de
     garde-fou (`computeAutoregSuggestion`, WELLNESS_ABSOLUTE_GUARD_SCORE) et de repli tant que la
     baseline n'a pas assez d'historique — toujours ce nombre-là, jamais le score relatif. */
  const absoluteScore = athlete.wellnessFilledToday === false ? null : athlete.wellness_score;
  /* `displayScore` = le chiffre affiché sur cette carte (ring, headline) — score relatif dès que la
     baseline est fournie et son historique suffisant, repli exact sur le score absolu sinon (même
     nom déjà établi dans ce fichier avant ce chantier, conserve son sens local : "le score affiché
     par CETTE carte", distinct du `displayScore` de TodayClient.tsx — post-impact fatigue même jour,
     concept différent, jamais confondu). */
  const displayScore = baseline?.hasEnoughHistory ? baseline.relativeScore : absoluteScore;

  /* Suggestion décharge/surcharge — seulement sur une séance encore prévue (une séance déjà
     terminée n'a plus de sens à ajuster). Indépendant de isPriority : une "surcharge" (forme au
     top + séance légère) n'a rien d'une alerte, ce sportif reste classé "Plan cohérent" — voir
     autoregulation.ts. `absoluteScore` (jamais `displayScore`) : computeAutoregSuggestion() a besoin
     du score ABSOLU pour son garde-fou interne, même quand une baseline pilote déjà le déclenchement
     via le Z. */
  const suggestion = topSession && !topSession.done
    ? computeAutoregSuggestion(absoluteScore, topSession.target_difficulty, baseline)
    : null;
  const [previewPct, setPreviewPct] = useState<number | null>(null);

  /* Le halo pulsant "attention requise" vit sur le CONTOUR DE LA CARTE ENTIÈRE (pas sur l'encart de
     suggestion interne, qui reste statique — un seul signal de mouvement par carte). Couleur du
     pulse dérivée de la sévérité réelle (🚨 rouge / ⚠️ orange) quand une suggestion existe, repli
     sur l'orange historique sinon (cas "attention requise" générique, hors mécanisme
     computeAutoregSuggestion — ex. tendance de charge). Le surcharge (🚀 vert) ne déclenche jamais
     showBadge (isPriority reste toujours faux pour une surcharge, par design — voir doc plus haut),
     donc jamais de pulse vert ici. */
  const badgeColor = suggestion ? suggestionSeverityColor(suggestion) : "#d44000";

  return (
    <div data-tour={tourId} style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(145deg,#1a1a1a,#282828)",
      border: showBadge ? `3px solid ${badgeColor}8c` : showReviewed ? "1.5px solid rgba(47,158,68,.30)" : "1px solid rgba(255,255,255,.08)",
      borderRadius: 26, padding: 18,
      boxShadow: showBadge ? `0 0 0 0 ${badgeColor}00, 0 18px 46px ${badgeColor}2e` : "0 14px 36px rgba(0,0,0,.28)",
      transition: "border 0.3s ease, box-shadow 0.3s ease",
      animation: showBadge ? "perf-border-pulse 1.8s ease-in-out infinite" : undefined,
      color: "#fff",
    }}>
      {/* Pulsing badge top-right + bordure + halo clignotants, même rythme, pour les sportifs "attention requise" */}
      {showBadge && (
        <>
          <style>{`
            @keyframes perf-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(1.35); }
            }
            @keyframes perf-border-pulse {
              0%, 100% { border-color: ${badgeColor}66; box-shadow: 0 0 0 0 ${badgeColor}00, 0 18px 46px ${badgeColor}2e; }
              50% { border-color: ${badgeColor}; box-shadow: 0 0 16px 3px ${badgeColor}8c, 0 18px 46px ${badgeColor}66; }
            }
          `}</style>
          <div style={{
            position: "absolute", top: 14, right: 14,
            width: 9, height: 9, borderRadius: "50%", background: badgeColor,
            animation: "perf-pulse 1.8s ease-in-out infinite",
          }} />
        </>
      )}

      <div style={{ position: "absolute", top: 12, right: showBadge ? 34 : 14, zIndex: 2 }} onClick={e => e.stopPropagation()}>
        <ShareButton
          resourceType="coach_athlete"
          variant="dark"
          buildSnapshot={() => ({
            athleteName: athlete.name,
            score: displayScore,
            zoneLabel: zoneLabelFor(displayScore, baseline, perspective),
            decision,
            isPriority,
            behaviors: behaviors.map(b => BEHAVIOR_META[b]
              ? { emoji: BEHAVIOR_META[b].emoji, label: BEHAVIOR_META[b].label, positive: BEHAVIOR_META[b].positive }
              : { emoji: "", label: b, positive: true }),
            topSession: topSession ? {
              name: topSession.name, done: topSession.done,
              difficulty: topSession.done ? topSession.rpe : topSession.target_difficulty,
              exercises: topSession.notes ? topSession.notes.split("\n").filter(Boolean) : [],
            } : undefined,
            authorName: coachName ?? "Coach",
          })}
          title={`${firstName} — ${zoneLabelFor(displayScore, baseline, perspective)}`}
          text={decision}
        />
      </div>

      {/* Ring + zone + prénom */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <WellnessRing score={displayScore} size={72} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 4 }}>
            {zoneLabelFor(displayScore, baseline, perspective)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 1000, color: "#fff", letterSpacing: "-0.03em" }}>{firstName}</div>
            {showBadge && (
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: "#d44000", color: "#fff", borderRadius: 999, padding: "3px 8px" }}>
                Attention requise
              </div>
            )}
            {showReviewed && (
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(47,158,68,.18)", color: "#bfeec8", border: "1px solid rgba(47,158,68,.35)", borderRadius: 999, padding: "3px 8px" }}>
                Traité ✓
              </div>
            )}
          </div>
          {behaviors.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {behaviors.map(b => {
                const meta = BEHAVIOR_META[b];
                if (!meta) return null;
                return (
                  <span key={b} style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 999,
                    background: meta.positive ? "rgba(47,158,68,.18)" : "rgba(212,64,0,.22)",
                    color: meta.positive ? "#bfeec8" : "#ffd2bf",
                  }}>
                    {meta.emoji} {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Encart décision — bloc décharge/surcharge 1-clic (AutoregButtons) quand une suggestion
         existe, sinon l'encart "Décider/Voir" existant (inchangé, ouvre l'éditeur libre). Réutilise
         le vrai AlertBox (variant="darkColor", pulse={false} — le halo vit sur le contour de la
         carte entière, pas ici) au lieu d'une copie locale de sa palette/bordure/padding, pour une
         bordure strictement identique à celle de /today. `badgeColor` déjà calculé plus haut pour
         le pulse du contour — réutilisé tel quel ici, une seule source de sévérité pour toute la
         carte. */}
      {suggestion && topSession ? (
        <div style={{ marginBottom: todaySessions.length > 0 ? 12 : 0 }}>
          <AlertBox
            variant="darkColor"
            pulse={false}
            alert={{
              border: `${badgeColor}66`,
              glow: badgeColor,
              text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, topSession.target_difficulty ?? maxDiff, selfView ? undefined : firstName)}`,
            }}
            actions={
              <AutoregButtons
                key={`${topSession.id}-${isReviewed}`}
                sessionId={topSession.id}
                dir={suggestion.dir}
                reco={suggestion.reco}
                advice=""
                sessionLabel={topSession.name}
                severityColor={badgeColor}
                onPreviewChange={setPreviewPct}
                onApply={async (pct) => {
                  const original: AutoregOriginal = { notes: topSession.notes, target_difficulty: topSession.target_difficulty };
                  await onApplyAdjust(topSession, pct);
                  // isActive===false : onApplyAdjust n'a fait que déclencher le paywall (requireSubscription),
                  // rien n'a été écrit — ne pas marquer l'athlète "traité" (voir prop isActive plus haut).
                  if (isActive !== false) onAutoregDecided();
                  return original;
                }}
                onMaintenir={onAutoregDecided}
                onUndo={async (original) => {
                  if (original) await onUndoAdjust(topSession, original);
                  onAutoregUndone();
                }}
                isActive={isActive}
              />
            }
          />
        </div>
      ) : (() => {
        const DARK_COLOR_BG: Record<string, string> = {
          "#dc2626": "linear-gradient(145deg,#3d0f0c,#521410)",
          "#f28a00": "linear-gradient(145deg,#2e1608,#42200c)",
          "#d44000": "linear-gradient(145deg,#33140a,#4a1c0c)",
          "#2f9e44": "linear-gradient(145deg,#0f2417,#163a22)",
        };
        const severity = isPriority ? "#d44000" : "#2f9e44";
        const encartBg = DARK_COLOR_BG[severity] ?? "linear-gradient(145deg,#1a1a1a,#282828)";
        return (
      <div style={{
        padding: "12px 14px", borderRadius: 16,
        background: encartBg,
        border: `1px solid ${severity}66`,
        marginBottom: todaySessions.length > 0 ? 12 : 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "#fff", flex: 1, minWidth: 0 }}>
              {isPriority ? "⚠️" : "👌"} {decision}
            </div>
            <button
              data-tour={tourId ? "decider-btn" : undefined}
              onClick={onDecide}
              style={{
                height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10, flexShrink: 0,
                background: showReviewed
                  ? "linear-gradient(180deg,#2f9e44,#166534)"
                  : "linear-gradient(180deg,#f04a08,#d44000)",
                color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
                cursor: "pointer",
                boxShadow: showReviewed ? "0 6px 16px rgba(47,158,68,.22)" : "0 6px 16px rgba(212,64,0,.22)",
                whiteSpace: "nowrap",
              }}
            >
              {isPriority ? (showReviewed ? "Revoir" : "Décider") : "Voir"} →<span className="tour-lock">🔒</span>
            </button>
      </div>
        );
      })()}

      {/* Carte séance imbriquée — mise à jour en live (surbrillance orange) quand une décharge/
         surcharge est en cours de sélection ou déjà appliquée (previewPct). */}
      {topSession && (
        <div onClick={onDecide} style={{ background: "#fff", borderRadius: 16, padding: "11px 13px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word" }}>
              {topSession.name}
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: topSession.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,0.10)", color: topSession.done ? "#2f9e44" : "#d44000" }}>
              {topSession.done ? "Terminé" : "Prévu"}
            </span>
          </div>
          {(topSession.done ? topSession.rpe : topSession.target_difficulty) != null && (
            <DiffGauge value={(topSession.done ? topSession.rpe : topSession.target_difficulty) ?? null} height={8} />
          )}
          {topSession.notes && (
            <div style={{ marginTop: 7, borderRadius: 10, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
              {topSession.notes.split("\n").filter(Boolean).map((ex, i) => {
                const modified = previewPct != null ? parseAndApply(ex, previewPct) : ex;
                const changed = modified !== ex;
                const unseen = hasUnseenAttachment(topSession.exercise_media?.[String(i)], "coach", topSession.viewed_by_coach_at);
                return (
                  <div key={i} style={{ padding: "6px 9px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                    {changed && (
                      <div style={{ fontSize: 9.5, lineHeight: 1.3, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1, wordBreak: "break-word" }}>
                        {ex}
                      </div>
                    )}
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: changed ? "#E8571A" : "#2c3236", fontWeight: changed ? 800 : 600, wordBreak: "break-word" }}>
                      {modified}{unseen && <UnseenDot />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Résultats (durée + RPE réel) — seulement une fois la séance terminée, même info que
             le grid "MIN/DIFF." de TodaySessionCard, pour que le coach voie aussi le résultat réel
             et pas seulement la difficulté prévue. */}
          {topSession.done && (topSession.duration || topSession.rpe) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 7 }}>
              {topSession.duration != null && (
                <div style={{ background: "#f7f8f9", borderRadius: 10, padding: "6px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.03em", lineHeight: 1 }}>{topSession.duration}</div>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8f94", marginTop: 2 }}>MIN</div>
                </div>
              )}
              {topSession.rpe != null && (
                <div style={{ background: "#f7f8f9", borderRadius: 10, padding: "6px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.03em", lineHeight: 1 }}>{topSession.rpe}</div>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8f94", marginTop: 2 }}>DIFF.</div>
                </div>
              )}
            </div>
          )}
          {extraSessions > 0 && (
            <div style={{ fontSize: 10, color: "#8a8f94", marginTop: 7 }}>+{extraSessions} autre{extraSessions > 1 ? "s" : ""} séance{extraSessions > 1 ? "s" : ""}</div>
          )}
        </div>
      )}
    </div>
  );
}
