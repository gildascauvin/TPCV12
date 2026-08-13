"use client";

import DiffGauge from "@/components/calendar/DiffGauge";
import WellnessRing from "@/components/wellness/WellnessRing";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import { zoneLabel, getRecoveryAdvice } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { computeAutoregSuggestion, autoregAdvice } from "@/lib/autoregulation";
import { classifyTrend, describeTrend, trendSeverity, trendActionWord, type TrendInput } from "@/lib/trainingLoad";

/* Illustrations sous chaque point de la frise paywall_priming (Enregistre/Cible/Progresse) —
   fonctions/composants réels de l'app, alimentés par des données illustratives statiques (aucun
   historique n'existe encore à ce stade du funnel). Toute la typographie reste strictement plus
   petite que le sous-texte de la frise (13px) — AutoregButtons (13px en interne, composant partagé
   avec /today et Coach Control, jamais modifié pour ça) est donc enveloppé en `zoom:0.85`. Non
   cliquable pour les deux rôles (pointerEvents:none) — un écran de paiement n'est pas le bon
   endroit pour une vraie interaction. */

const noop = () => {};
const noopAsync = async () => {};
const SHRINK: React.CSSProperties = { zoom: 0.85 };

/* ────────────────────────────────────────────────────────────────────────
   Enregistre : 3 séances sport-aware côte à côte, pleine largeur — pas de
   rule-box ni de label "Séances", pas de header jour/ring, pas de boutons
   d'action. Juste 3 cartes (nom/gauge/exercices).
   ──────────────────────────────────────────────────────────────────────── */
interface SessionPreview { name: string; exercises: string[]; diff: number }
const SPORT_SESSION_PREVIEW: Record<string, SessionPreview[]> = {
  "Haltérophilie": [
    { name: "Arraché — Technique", exercises: ["Arraché — 5×2 @ 70%", "Tirage haut — 4×3"], diff: 7 },
    { name: "Épaulé-Jeté — Technique", exercises: ["Épaulé — 5×2 @ 70%", "Jeté — 4×2"], diff: 7 },
    { name: "Squat — Force", exercises: ["Squat — 5×3 @ 80%", "Gainage complet — 3×40s"], diff: 8 },
  ],
  "Powerlifting": [
    { name: "Squat — Force", exercises: ["Back squat — 5×5 @ 80kg", "Gainage complet — 3×40s"], diff: 8 },
    { name: "Développé couché — Force", exercises: ["Bench press — 5×5 @ 70kg", "Rowing — 4×6"], diff: 7 },
    { name: "Soulevé de terre — Force", exercises: ["Deadlift — 4×4 @ 100kg", "Tirage horizontal — 3×8"], diff: 8 },
  ],
  "Musculation / Hypertrophie": [
    { name: "Jambes — Hypertrophie", exercises: ["Presse à cuisses — 4×12", "Leg curl — 3×15"], diff: 7 },
    { name: "Dos — Hypertrophie", exercises: ["Tirage horizontal — 4×10", "Tractions — 3×8"], diff: 6 },
    { name: "Pectoraux — Hypertrophie", exercises: ["Développé couché — 4×10", "Écarté couché — 3×12"], diff: 7 },
  ],
  "Fitness / CrossFit": [
    { name: "WOD — Force & Metcon", exercises: ["Clean & Jerk — 5×3", "AMRAP 12min — Burpees, KB swings"], diff: 8 },
    { name: "Gymnastique — Skill", exercises: ["Muscle-up — technique", "Handstand hold — 5×20s"], diff: 6 },
    { name: "Monostructural — Cardio", exercises: ["Rameur — 2000m", "Bike — 10min"], diff: 5 },
  ],
  "Athlétisme & vitesse": [
    { name: "Sprint — Vitesse max", exercises: ["Accélérations — 6×20m", "Sprint — 4×40m"], diff: 8 },
    { name: "Technique — Gammes", exercises: ["Gammes techniques — 4×20m", "Skip — 3×15m"], diff: 5 },
    { name: "Renfo — Explosivité", exercises: ["Squat sauté — 4×6", "Gainage complet — 3×40s"], diff: 6 },
  ],
  "Sports collectifs": [
    { name: "Technique & Vitesse", exercises: ["Ateliers techniques — 20min", "Sprints navette — 8×20m"], diff: 6 },
    { name: "Endurance — Intermittent", exercises: ["30-30 — ×10", "Récupération active"], diff: 7 },
    { name: "Renfo — Prévention", exercises: ["Gainage complet — 3×40s", "Squat — 3×10"], diff: 5 },
  ],
  "Endurance": [
    { name: "Endurance fondamentale", exercises: ["Course — 45min Zone 2"], diff: 5 },
    { name: "Seuil", exercises: ["Course — 20min allure seuil"], diff: 7 },
    { name: "Sortie longue", exercises: ["Course — 70min Zone 2"], diff: 6 },
  ],
  "Arts martiaux & combat": [
    { name: "Technique & Sparring", exercises: ["Travail technique — 25min", "Sparring léger — 3×3min"], diff: 7 },
    { name: "Conditionnement", exercises: ["Circuit combat — 20min"], diff: 7 },
    { name: "Force & Explosivité", exercises: ["Squat sauté — 4×6", "Gainage complet — 3×40s"], diff: 6 },
  ],
};
const DEFAULT_SESSIONS: SessionPreview[] = [
  { name: "Séance A — Force", exercises: ["Exercice principal — 5×5", "Accessoire — 3×10"], diff: 7 },
  { name: "Séance B — Volume", exercises: ["Circuit — 4×12", "Gainage complet — 3×40s"], diff: 6 },
  { name: "Séance C — Récupération active", exercises: ["Cardio léger — 20min"], diff: 4 },
];

function SessionMiniCard({ preview }: { preview: SessionPreview }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: "1px solid rgba(212,64,0,0.16)", background: "#fff", borderRadius: 14, padding: "10px 11px", boxShadow: "0 2px 10px rgba(0,0,0,0.045)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.02em", marginBottom: 8 }}>{preview.name}</div>
      <div style={{ marginBottom: 8 }}>
        <DiffGauge value={preview.diff} height={9} />
      </div>
      <div style={{ borderRadius: 12, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
        {preview.exercises.map((ex, i) => (
          <div key={i} style={{ padding: "6px 8px", fontSize: 10.5, lineHeight: 1.35, color: "#2c3236", fontWeight: 600, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff" }}>
            {ex}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanningPreview({ sport }: { sport?: string }) {
  const previews = (sport && SPORT_SESSION_PREVIEW[sport]) || DEFAULT_SESSIONS;
  return (
    <div style={{ width: "100%", display: "flex", gap: 8 }}>
      {previews.map((p, i) => <SessionMiniCard key={i} preview={p} />)}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Cible (sportif) : carte "Score & conseils" + reco décharge/surcharge —
   non cliquable.
   ──────────────────────────────────────────────────────────────────────── */
export function WellnessCardPreview() {
  const score = 45;
  const plannedDiff = 8;
  const behaviors = ["alcohol", "late_sleep"];
  const suggestion = computeAutoregSuggestion(score, plannedDiff);
  const advice = getRecoveryAdvice({ sleep: 5, stress: 7, recovery: 4, motivation: 5, behaviors }, "hard");

  return (
    <div style={{
      width: "100%", background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: 16,
      color: "#fff", boxShadow: "0 14px 36px rgba(0,0,0,.24)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <WellnessRing score={score} size={52} strokeWidth={5} dark />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 3 }}>
            {zoneLabel(score)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {behaviors.map(b => {
              const meta = BEHAVIOR_META[b];
              if (!meta) return null;
              return (
                <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(212,64,0,.22)", color: "#ffd2bf" }}>
                  {meta.emoji} {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ pointerEvents: "none", ...SHRINK }}>
        {suggestion ? (
          <AutoregButtons
            sessionId="frise-wellness-demo"
            dir={suggestion.dir}
            reco={suggestion.reco}
            advice={`${suggestion.icon} ${autoregAdvice(suggestion.dir, plannedDiff)}`}
            sessionLabel="Sprint — Vitesse max"
            onPreviewChange={noop}
            onApply={noopAsync}
            onMaintenir={noop}
          />
        ) : (
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,.78)" }}>
            🌿 {advice}
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Cible (coach) : carte compacte (pas le CoachCard réel — ses tailles fixes,
   ex. prénom 22px, dépassent la contrainte "plus petit que le sous-texte")
   mais mêmes fonctions réelles (zoneLabel, BEHAVIOR_META, AutoregButtons) —
   ring + zone + prénom + comportements + décision, sans exercices.
   ──────────────────────────────────────────────────────────────────────── */
export function CoachControlPreview({ name }: { name?: string }) {
  const score = 88;
  const plannedDiff = 3;
  const behaviors = ["hydration", "stretching"];
  const firstName = name || "Toi";
  const suggestion = computeAutoregSuggestion(score, plannedDiff);
  const advice = suggestion ? `${suggestion.icon} ${autoregAdvice(suggestion.dir, plannedDiff, firstName)}` : "";

  return (
    <div style={{
      width: "100%", background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: 16,
      color: "#fff", boxShadow: "0 14px 36px rgba(0,0,0,.24)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <WellnessRing score={score} size={52} strokeWidth={5} dark />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 3 }}>
            {zoneLabel(score)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", marginBottom: 4 }}>{firstName}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {behaviors.map(b => {
              const meta = BEHAVIOR_META[b];
              if (!meta) return null;
              return (
                <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(47,158,68,.18)", color: "#bfeec8" }}>
                  {meta.emoji} {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {suggestion && (
        <div style={{ pointerEvents: "none", ...SHRINK }}>
          <AutoregButtons
            sessionId="frise-coach-demo"
            dir={suggestion.dir}
            reco={suggestion.reco}
            advice={advice}
            sessionLabel="Technique — Vitesse"
            onPreviewChange={noop}
            onApply={noopAsync}
            onMaintenir={noop}
          />
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Progresse : le vrai ZoneSparkline (charge/ACWR) + l'insight croisé
   charge/récupération/RPE (classifyTrend/describeTrend — mêmes fonctions
   que /conseils), rôle-aware. Chart plafonné en largeur pour garder une
   hauteur comparable aux 2 autres illustrations.
   ──────────────────────────────────────────────────────────────────────── */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const DEMO_DATES = [6, 5, 4, 3, 2, 1, 0].map(daysAgo);
// Arc narratif : surcharge (2j) → optimal (1j) → récup (2j, correction) → optimal (2j, stabilisé).
const DEMO_ACWR = [1.45, 1.38, 1.05, 0.68, 0.72, 0.92, 1.08];
const DEMO_LOADS = [420, 400, 300, 150, 170, 260, 290];
const DEMO_MONOTONY = [1.9, 1.8, 1.5, 1.2, 1.3, 1.4, 1.5];
const DEMO_STRAIN = DEMO_LOADS.map((l, i) => Math.round(l * DEMO_MONOTONY[i]));

// Charge en hausse (+22%, retour vers l'optimal après la correction) + récupération qui s'améliore
// + effort perçu qui diminue → "supercompensation" (positif, cohérent avec "Progresse").
const TREND_INPUT: TrendInput = { loadPct: 22, wellnessDelta: 7, rpeDelta: -0.6 };
const TREND_CODE = classifyTrend(TREND_INPUT)!;
const TREND_SEVERITY = trendSeverity(TREND_CODE);
const TREND_EMOJI = TREND_SEVERITY === "alert" ? "🔴" : TREND_SEVERITY === "watch" ? "🟡" : "🟢";
const TREND_ACTION = trendActionWord(TREND_CODE);

function TrendInsight({ perspective }: { perspective: "athlete" | "coach" }) {
  const text = describeTrend(TREND_CODE, TREND_INPUT, perspective);
  return (
    <div style={{ marginBottom: 10, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>
      {TREND_EMOJI} <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", color: "#ff8a55" }}>{TREND_ACTION} — </span>{text}
    </div>
  );
}

function ChartBlock() {
  return (
    <div style={{ maxWidth: 460 }}>
      <ZoneSparkline points={DEMO_ACWR} dates={DEMO_DATES} loads={DEMO_LOADS} monotony={DEMO_MONOTONY} strain={DEMO_STRAIN} hideDayLabels height={118} />
    </div>
  );
}

/* Iso sportif/coach : même carte (insight + chart), seul le texte de l'insight change de
   perspective (tutoiement vs 3e personne) via TrendInsight. */
export function ChargePreview() {
  return (
    <div style={{
      width: "100%", background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: "14px 16px 16px",
      boxShadow: "0 14px 36px rgba(0,0,0,.24)",
    }}>
      <TrendInsight perspective="athlete" />
      <ChartBlock />
    </div>
  );
}

export function AthleteChargePreview() {
  return (
    <div style={{
      width: "100%", background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: "14px 16px 16px",
      boxShadow: "0 14px 36px rgba(0,0,0,.24)",
    }}>
      <TrendInsight perspective="coach" />
      <ChartBlock />
    </div>
  );
}
