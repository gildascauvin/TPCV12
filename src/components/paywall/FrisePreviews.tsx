"use client";

import { startOfWeek, addDays, format as formatDate } from "date-fns";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import WellnessRing from "@/components/wellness/WellnessRing";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import ZoneSparkline from "@/components/conseils/ZoneSparkline";
import SparkLineClient, { FORM_ZONES, WELLNESS_ZONES, formToChartPosition } from "@/components/conseils/SparkLineClient";
import DayColumn, { WeekSessionCard, type SessionLike } from "@/components/calendar/DayColumn";
import { AthleteRing, athleteStatus } from "@/app/(app)/coach/athletes/AthletesClient";
import { zoneLabel, getRecoveryAdvice } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { computeAutoregSuggestion, autoregAdvice, autoregHeadline, suggestionSeverityColor } from "@/lib/autoregulation";
import { parseAndApply } from "@/lib/loadAdjust";
import { loadRule } from "@/lib/loadRule";
import { classifyTrend, describeTrend, trendSeverity, trendActionWord, type TrendInput } from "@/lib/trainingLoad";
import { sigDimInfo, chargeCrossInsight, recoveryCrossInsight } from "@/lib/fatigueSignature";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { useBreakpoint } from "@/hooks/useBreakpoint";

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
/* Exercices par séance portés à 3-4 (2026-09-02, retour de Gildas : "mets plus d'exercices dans
   les séances de planning, 3 et 4") — jusque-là 1-2 lignes par séance, trop clairsemé pour
   ressembler à une vraie carte de planning en prod. */
interface SessionPreview { name: string; exercises: string[]; diff: number }
const SPORT_SESSION_PREVIEW: Record<string, SessionPreview[]> = {
  "Haltérophilie": [
    { name: "Arraché — Technique", exercises: ["Arraché — 5×2 @ 70%", "Tirage haut — 4×3", "Squat avant — 3×5", "Gainage complet — 3×40s"], diff: 7 },
    { name: "Épaulé-Jeté — Technique", exercises: ["Épaulé — 5×2 @ 70%", "Jeté — 4×2", "Tirage nuque — 4×4"], diff: 7 },
    { name: "Squat — Force", exercises: ["Squat — 5×3 @ 80%", "Fentes bulgares — 3×10", "Gainage complet — 3×40s"], diff: 8 },
  ],
  "Powerlifting": [
    { name: "Squat — Force", exercises: ["Back squat — 5×5 @ 80kg", "Fentes — 3×10", "Gainage complet — 3×40s"], diff: 8 },
    { name: "Développé couché — Force", exercises: ["Bench press — 5×5 @ 70kg", "Rowing — 4×6", "Développé incliné — 3×10"], diff: 7 },
    { name: "Soulevé de terre — Force", exercises: ["Deadlift — 4×4 @ 100kg", "Tirage horizontal — 3×8", "Hip thrust — 3×10"], diff: 8 },
  ],
  "Musculation / Hypertrophie": [
    { name: "Jambes — Hypertrophie", exercises: ["Presse à cuisses — 4×12", "Leg curl — 3×15", "Mollets — 4×15", "Fentes — 3×10"], diff: 7 },
    { name: "Dos — Hypertrophie", exercises: ["Tirage horizontal — 4×10", "Tractions — 3×8", "Rowing haltère — 3×12"], diff: 6 },
    { name: "Pectoraux — Hypertrophie", exercises: ["Développé couché — 4×10", "Écarté couché — 3×12", "Dips — 3×12"], diff: 7 },
  ],
  "Fitness / CrossFit": [
    { name: "WOD — Force & Metcon", exercises: ["Clean & Jerk — 5×3", "AMRAP 12min — Burpees, KB swings", "Gainage complet — 3×40s"], diff: 8 },
    { name: "Gymnastique — Skill", exercises: ["Muscle-up — technique", "Handstand hold — 5×20s", "Toes to bar — 4×10"], diff: 6 },
    { name: "Monostructural — Cardio", exercises: ["Rameur — 2000m", "Bike — 10min", "Corde à sauter — 5min"], diff: 5 },
  ],
  "Athlétisme & vitesse": [
    { name: "Sprint — Vitesse max", exercises: ["Accélérations — 6×20m", "Sprint — 4×40m", "Gainage complet — 3×40s"], diff: 8 },
    { name: "Technique — Gammes", exercises: ["Gammes techniques — 4×20m", "Skip — 3×15m", "Montées de genoux — 3×20m"], diff: 5 },
    { name: "Renfo — Explosivité", exercises: ["Squat sauté — 4×6", "Gainage complet — 3×40s", "Fentes sautées — 3×10"], diff: 6 },
  ],
  "Sports collectifs": [
    { name: "Technique & Vitesse", exercises: ["Ateliers techniques — 20min", "Sprints navette — 8×20m", "Passes en mouvement — 15min"], diff: 6 },
    { name: "Endurance — Intermittent", exercises: ["30-30 — ×10", "Récupération active", "Gainage complet — 3×40s"], diff: 7 },
    { name: "Renfo — Prévention", exercises: ["Gainage complet — 3×40s", "Squat — 3×10", "Fentes — 3×10"], diff: 5 },
  ],
  "Endurance": [
    { name: "Endurance fondamentale", exercises: ["Course — 45min Zone 2", "Gainage complet — 3×40s"], diff: 5 },
    { name: "Seuil", exercises: ["Course — 20min allure seuil", "Retour au calme — 10min"], diff: 7 },
    { name: "Sortie longue", exercises: ["Course — 70min Zone 2", "Étirements — 10min"], diff: 6 },
  ],
  "Arts martiaux & combat": [
    { name: "Technique & Sparring", exercises: ["Travail technique — 25min", "Sparring léger — 3×3min", "Gainage complet — 3×40s"], diff: 7 },
    { name: "Conditionnement", exercises: ["Circuit combat — 20min", "Corde à sauter — 5min", "Gainage complet — 3×40s"], diff: 7 },
    { name: "Force & Explosivité", exercises: ["Squat sauté — 4×6", "Gainage complet — 3×40s", "Fentes sautées — 3×10"], diff: 6 },
  ],
};
const DEFAULT_SESSIONS: SessionPreview[] = [
  { name: "Séance A — Force", exercises: ["Exercice principal — 5×5", "Accessoire — 3×10", "Gainage complet — 3×40s"], diff: 7 },
  { name: "Séance B — Volume", exercises: ["Circuit — 4×12", "Accessoire — 3×12", "Gainage complet — 3×40s"], diff: 6 },
  { name: "Séance C — Récupération active", exercises: ["Cardio léger — 20min", "Mobilité — 10min"], diff: 4 },
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

/* Variante avec ring de forme au-dessus de chaque séance — le VRAI `PlanningRing` (calendar/
   PlanningRing.tsx), le même composant que /week et /coach/planning, pas une réinvention (demande
   explicite de Gildas, 2026-09-04 : "prog avec les wellness rings, le même composant que le
   planning"). Scores illustratifs statiques (aucun historique n'existe à ce stade du funnel) —
   variés pour montrer que la forme change d'un jour à l'autre, jamais une valeur plate répétée. */
const PROGRAM_RING_DAYS = ["Lun", "Mer", "Ven"];
const PROGRAM_RING_SCORES = [78, 52, 88];
export function ProgramWithRingsPreview({ sport }: { sport?: string }) {
  const previews = (sport && SPORT_SESSION_PREVIEW[sport]) || DEFAULT_SESSIONS;
  return (
    <div style={{ width: "100%", display: "flex", gap: 10 }}>
      {previews.map((p, i) => (
        <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#8a8f94" }}>{PROGRAM_RING_DAYS[i]}</div>
          <PlanningRing score={PROGRAM_RING_SCORES[i]} size={44} />
          <SessionMiniCard preview={p} />
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Enregistre (2026-09-04, retour explicite de Gildas : "plutôt qu'une
   animation coûteuse, mets des icônes Excel/PDF/Word avec des flèches vers
   le program preview") — remplace l'ancienne séquence à 3 phases minutées
   (tableau Excel simulé → champ collé → révélé, `setTimeout` en cascade,
   plusieurs `@keyframes` tournant en boucle) par un rendu STATIQUE : 3
   badges de format (Excel/PDF/Word, couleurs officielles de chaque format)
   + une flèche, posés au-dessus du programme déjà révélé. Un seul rendu,
   aucun state/effect/timer — le sens ("importe où que soit ton programme")
   reste identique, le coût (CPU, re-renders, complexité) disparaît.
   Programme affiché : VRAIE semaine (7 jours) dans le VRAI composant
   planning (`DayColumn`/`WeekSessionCard`, calendar/DayColumn.tsx —
   littéralement le même composant que /week et /coach/planning, pas une
   reconstruction — voir HyroxWeekPlanning ci-dessous, inchangée par ce
   passage). Contenu fixe (vrai vocabulaire Hyrox — curriculum réel
   `selectHyrox()`, voir CLAUDE.md — plutôt qu'un exemple générique). */
const FILE_TYPES: { label: string; emoji: string; bg: string }[] = [
  { label: "Excel", emoji: "📊", bg: "#217346" },
  { label: "PDF", emoji: "📄", bg: "#b30b00" },
  { label: "Word", emoji: "📝", bg: "#2b579a" },
];

/* Contenu par jour (index 0=Lun...6=Dim), null = repos — 4 séances réelles du curriculum Hyrox
   (selectHyrox(), generate/route.ts), espacées avec repos entre pour ne jamais enchaîner 2 jours
   durs (même règle que le vrai générateur). */
const HYROX_WEEK_SESSIONS: (({ name: string; notes: string; diff: number }) | null)[] = [
  { name: "Endurance fonctionnelle", notes: "Course — 45min Zone 2\nGainage complet — 3×40s", diff: 5 },
  { name: "Force & Conditioning", notes: "Sled push — 4×20m\nKettlebell swings — 4×15\nRowing — 500m", diff: 7 },
  null,
  { name: "Simulation de stations", notes: "Ski erg — 500m\nBurpees broad jump — 40m\nWall balls — 50 reps @ 9kg\nFarmers carry — 200m", diff: 8 },
  null,
  { name: "Run long", notes: "Course — 60min Zone 2", diff: 6 },
  null,
];
const HYROX_NOOP = () => {};

function HyroxWeekPlanning() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const todayStr = formatDate(new Date(), "yyyy-MM-dd");
  return (
    <div style={{ width: "100%", overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, var(--wk-col, 240px))", gap: 10 }}>
        {HYROX_WEEK_SESSIONS.map((meta, i) => {
          const date = addDays(monday, i);
          const sessions: SessionLike[] = meta ? [{
            id: `hyrox-demo-${i}`, date: formatDate(date, "yyyy-MM-dd"), name: meta.name, notes: meta.notes,
            duration: null, rpe: null, done: false, target_difficulty: meta.diff,
          }] : [];
          return (
            <DayColumn
              key={i}
              date={date} sessions={sessions} wellness={null} todayStr={todayStr}
              onAddSession={HYROX_NOOP} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} onWellness={HYROX_NOOP}
              renderSession={s => (
                <WeekSessionCard session={s} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} hideActions cardStyle={{ cursor: "default" }} />
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ImportWowPreview() {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 8 }}>
        📥 Importe ton programme existant
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 6 }}>
        {FILE_TYPES.map(f => (
          <div key={f.label} style={{ textAlign: "center" }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, background: f.bg, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19,
              boxShadow: "0 4px 12px rgba(0,0,0,.14)",
            }}>
              {f.emoji}
            </div>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#8a8f94", marginTop: 4 }}>{f.label}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: 18, color: "#c7ccd1", marginBottom: 10 }}>↓</div>

      <div>
        <HyroxWeekPlanning />
      </div>
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
   Obtiens ton score de forme (2026-09-04, item 1 de DecisionStep) — `pointerEvents:none`
   (illustration passive, décision de Gildas : "le geste on le fera post signup").
   ──────────────────────────────────────────────────────────────────────── */

/* Athlète, step 1 (2026-09-04, retour explicite de Gildas — remplace la version CoachCard/selfView
   ci-dessus, jugée pas assez proche de la vraie carte "Score & conseils" de /today) : reconstruit
   fidèlement cette carte — ring, zone relative (`relativeZoneLabel`), badges de comportements réels
   (`BEHAVIOR_META`), puis un bloc "✦ Conseils" à 2 encarts (⚡ Entraînement via `loadRule()`, 🌿
   Récupération via `getRecoveryAdvice()` — mêmes fonctions que /today, texte non réinventé) —
   AUCUN encart de suggestion/ajustement ("sans ajustements", demande explicite). Score bas +
   3 jours durs consécutifs + comportement négatif loggé : combinaison choisie pour que loadRule()
   ET getRecoveryAdvice() retournent chacun un texte concret et réaliste (pas un repli générique). */
export function FullWellnessAdvicePreview() {
  const { isMd } = useBreakpoint();
  const wellnessScore = 20;
  const baseline = syntheticBaselineFor(wellnessScore, "preview-wellness-advice");
  const zone = relativeZoneLabel(baseline);
  const behaviors = ["late_sleep", "social_out"];
  const rule = loadRule([{ target_difficulty: 8, done: false }], { prevMax: 8, nextMax: 8 });
  const advice = getRecoveryAdvice({ sleep: 4, stress: 7, recovery: 3, motivation: 5, behaviors }, rule.cls, baseline);

  // Réduite en desktop (2026-09-04, retour de Gildas) — pas de maxWidth en mobile (pleine largeur
  // de la colonne, comme partout ailleurs dans ce fichier).
  return (
    <div style={{
      width: "100%", maxWidth: isMd ? 460 : undefined, margin: isMd ? "0 auto" : undefined,
      background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: 18,
      color: "#fff", boxShadow: "0 14px 36px rgba(0,0,0,.24)", pointerEvents: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <WellnessRing score={baseline?.relativeScore ?? wellnessScore} size={72} strokeWidth={6} dark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 4 }}>
            Score & conseils
          </div>
          <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.03em", marginBottom: 7 }}>{zone}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {behaviors.map(b => {
              const meta = BEHAVIOR_META[b];
              if (!meta) return null;
              return (
                <span key={b} style={{ fontSize: 9.5, padding: "3px 7px", borderRadius: 999, background: "rgba(212,64,0,.22)", color: "#ffd2bf" }}>
                  {meta.emoji} {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,.10)", paddingTop: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 9 }}>
          ✦ Conseils
        </div>
        <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 13 }}>⚡</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.6)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Entraînement</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "#fff" }}>{rule.title}. {rule.text}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid rgba(255,255,255,.07)", paddingTop: 10 }}>
            <span style={{ fontSize: 13 }}>🌿</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.6)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Récupération</div>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "#fff" }}>{advice}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Coach, step 1 (2026-09-04, retour explicite de Gildas — remplace les 2 CoachCard côte à côte
   ci-dessus, jugées pas fidèles à ce qu'il voulait : "3 avec 3 wellness différents comme dans
   /athletes") : 3 lignes empilées, EXACTEMENT le rendu de la liste `/coach/athletes` (ring, nom,
   sport, badges Charge/Récupération, bandeau d'insight coloré) — `AthleteRing`/`athleteStatus`
   réutilisées telles quelles depuis AthletesClient.tsx (exportées pour l'occasion, aucun changement
   de comportement), `sigDimInfo("load",...)` déjà importée dans ce fichier pour le badge Charge.
   Aucune séance, aucun encart de décision/ajustement — juste ce que /athletes montre en ligne
   repliée + son bandeau d'insight. Données illustratives calquées sur une vraie capture de Gildas. */
interface RowPreviewData { name: string; sport: string; recovery: number; acwr: number; emoji: string; action: string; text: string }
const COACH_ROWS_PREVIEW: RowPreviewData[] = [
  { name: "Léa Girard", sport: "Haltérophilie", recovery: 35, acwr: 1.0, emoji: "🟡", action: "Réduire", text: "À charge stable (0%), sa récupération se dégrade : sa tolérance à la charge semble baisser." },
  { name: "Karim Haddad", sport: "Sprint", recovery: 50, acwr: 1.0, emoji: "🟡", action: "Réduire", text: "À charge stable (0%), sa récupération se dégrade : sa tolérance à la charge semble baisser." },
  { name: "Sofia Renard", sport: "CrossFit", recovery: 85, acwr: 1.0, emoji: "🟢", action: "Maintenir", text: "Charge et signaux corporels stables cette semaine : rien de notable, le plan actuel lui convient." },
];
export function CoachAthleteRowsPreview() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, pointerEvents: "none" }}>
      {COACH_ROWS_PREVIEW.map(row => {
        const status = athleteStatus(row.recovery);
        const chargeInfo = sigDimInfo("load", row.acwr, "coach");
        return (
          <div key={row.name} style={{ background: "#fff", border: "1px solid rgba(47,158,68,.20)", borderRadius: 26, padding: 18, boxShadow: "0 8px 24px rgba(47,158,68,.07)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <AthleteRing score={row.recovery} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{row.name}</div>
                <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>{row.sport}</div>
              </div>
              <div style={{ display: "flex", gap: 40, flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 2 }}>Charge</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: chargeInfo.color, whiteSpace: "nowrap" }}>{chargeInfo.label}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 2 }}>Récupération</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: status.color, whiteSpace: "nowrap" }}>{status.label}</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: "9px 13px", borderRadius: 12, background: "rgba(0,0,0,.035)", fontSize: 12.5, color: "#3a3f43", lineHeight: 1.45 }}>
              {row.emoji} <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", color: "#d44000", fontWeight: 800 }}>{row.action} — </span>{row.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Ajuste tes séances — 2026-09-04, demande explicite de Gildas : "program preview avec 3 séances
   (avec les tabs sportifs pour le coach), exactement les composants de prod, juste on met pas la
   semaine entière". 2 jours au lieu de 3, alerte "Alléger recommandé" au-dessus de la carte séance
   (2026-09-02, 1re passe). 2e passe le même jour, capture d'écran de référence : le vrai
   `DayColumn` (ring, zone label `formLabel()`, encart alerte/rule-box, "Séances · N" — même
   composant que /week/coach/planning, même grille horizontale `--wk-col` que `HyroxWeekPlanning`
   plus haut) remplace le rendu maison SessionMiniCard+PlanningRing, DESKTOP ET MOBILE désormais
   (un seul rendu, plus de branche `isMd` séparée) — le jour de l'alerte est TOUJOURS la 1re colonne
   (demande explicite : "mets le jour de l'alerte en premier"), avec ses exercices barrés/ajustés
   (`renderExerciseLine`, visible desktop et mobile depuis le 2026-09-04). Aucun geste actionnable
   nulle part (illustration passive) : ni CTA "+ Ajouter une séance" (`hideAddSession` toujours vrai)
   ni boutons Alléger/Maintenir de l'alerte — les deux retirés le 2026-09-04, demande explicite de
   Gildas. */
const PROGRAM3_TABS = ["Léa Girard", "Karim Haddad", "Sofia Renard", "Thomas Morel", "Nora Lefebvre"];
// Score du jour de l'alerte bas, score de l'autre jour sain — le ring raconte visuellement pourquoi
// l'alerte se déclenche sur ce jour précis, pas sur l'autre.
const PROGRAM3_OTHER_DAY_SCORE = 75;
export function ProgramPreview3Days({ role, sport, athleteName }: { role: "athlete" | "coach"; sport?: string; athleteName?: string }) {
  const { isMd } = useBreakpoint();
  const coach = role === "coach";
  const today = new Date();
  const todayStr = formatDate(today, "yyyy-MM-dd");
  const previews = (sport && SPORT_SESSION_PREVIEW[sport]) || DEFAULT_SESSIONS;
  const name = coach ? "Léa" : (athleteName?.trim() || "toi");

  // Jour de l'alerte (1re colonne) : score bas + séance dure → déclenche une vraie suggestion.
  const alertScore = 35;
  const alertDiff = previews[0]?.diff ?? 8;
  const baseline = syntheticBaselineFor(alertScore, "preview-program3-alert");
  const suggestion = computeAutoregSuggestion(alertScore, alertDiff, baseline);
  const badgeColor = suggestion ? suggestionSeverityColor(suggestion) : "#d44000";
  const alert = suggestion ? {
    border: `${badgeColor}66`, glow: badgeColor,
    text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, alertDiff, coach ? name : undefined)}`,
  } : undefined;
  // Jour de l'alerte en premier, l'autre jour ensuite.
  const days = [0, 1].map(i => ({
    date: addDays(today, i === 0 ? 0 : -1), isAlertDay: i === 0,
    score: i === 0 ? alertScore : PROGRAM3_OTHER_DAY_SCORE,
  }));

  const tabs = coach && isMd && (
    <div style={{ display: "flex", gap: 20, marginBottom: 16, borderBottom: "1px solid rgba(0,0,0,.08)", overflowX: "auto" }}>
      {PROGRAM3_TABS.map((n, i) => (
        <div key={n} style={{
          fontSize: 13, fontWeight: 800, color: i === 0 ? "#171b1f" : "#8a8f94", whiteSpace: "nowrap",
          padding: "0 0 10px", borderBottom: i === 0 ? "2.5px solid #d44000" : "2.5px solid transparent",
        }}>
          {n}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      {tabs}
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        {/* Centré en desktop (2026-09-04, retour explicite de Gildas) — 2 colonnes tiennent
            largement dans la colonne d'illustration (720px), plus besoin de scroll ni d'ancrage
            à gauche ; mobile garde son scroll horizontal naturel, jamais de largeur maximale. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, var(--wk-col, 240px))", gap: 10, maxWidth: isMd ? 500 : undefined, margin: isMd ? "0 auto" : undefined }}>
          {days.map(({ date, isAlertDay, score }, i) => {
            const p = previews[i] ?? previews[0];
            const sessions: SessionLike[] = [{
              id: `program3-demo-${i}`, date: formatDate(date, "yyyy-MM-dd"),
              name: p.name, notes: p.exercises.join("\n"),
              duration: null, rpe: isAlertDay ? null : p.diff, done: !isAlertDay, target_difficulty: p.diff,
            }];
            return (
              <DayColumn
                key={i}
                date={date} sessions={sessions} wellness={{ score }} todayStr={todayStr}
                onAddSession={HYROX_NOOP} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} onWellness={HYROX_NOOP}
                hideAddSession
                alert={isAlertDay ? alert : undefined}
                renderSession={s => (
                  <WeekSessionCard
                    session={s} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} hideActions cardStyle={{ cursor: "default" }}
                    renderExerciseLine={isAlertDay && suggestion ? (line, li) => {
                      const modified = parseAndApply(line, suggestion.reco);
                      const changed = modified !== line;
                      return (
                        <div style={{ padding: "6px 9px", borderTop: li > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                          {changed && (
                            <div style={{ fontSize: 9.5, lineHeight: 1.3, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1 }}>
                              {line}
                            </div>
                          )}
                          <div style={{ fontSize: 11, lineHeight: 1.4, color: changed ? "#E8571A" : "#2c3236", fontWeight: changed ? 800 : 600 }}>
                            {modified}
                          </div>
                        </div>
                      );
                    } : undefined}
                  />
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Athlète, step 2 (2026-09-04, retour explicite de Gildas — remplace `ProgramPreview3Days` pour
   ce rôle : "une seule [séance] avec ajustement de décharge, il faudrait montrer les exos barrés
   aussi") : une seule carte séance (aujourd'hui), même `DayColumn`/`WeekSessionCard` que le reste
   de ce fichier, avec l'alerte Alléger + le rendu avant/après barré des exercices — aucun CTA
   actionnable (bouton Alléger/Maintenir retiré, illustration passive, même règle que
   `ProgramPreview3Days`). Coach garde `ProgramPreview3Days` inchangée (2 jours, tabs sportifs) —
   ce composant est réservé au sportif. */
export function SingleSessionAdjustPreview({ sport }: { sport?: string }) {
  const { isMd } = useBreakpoint();
  const today = new Date();
  const todayStr = formatDate(today, "yyyy-MM-dd");
  const previews = (sport && SPORT_SESSION_PREVIEW[sport]) || DEFAULT_SESSIONS;
  const p = previews[0];

  const score = 35;
  const diff = p?.diff ?? 8;
  const baseline = syntheticBaselineFor(score, "preview-single-session-alert");
  const suggestion = computeAutoregSuggestion(score, diff, baseline);
  const badgeColor = suggestion ? suggestionSeverityColor(suggestion) : "#d44000";
  const alert = suggestion ? {
    border: `${badgeColor}66`, glow: badgeColor,
    text: `${suggestion.icon} ${autoregHeadline(suggestion.dir)}\n${autoregAdvice(suggestion.dir, diff)}`,
  } : undefined;
  const sessions: SessionLike[] = [{
    id: "single-session-demo", date: todayStr,
    name: p?.name ?? "Séance du jour", notes: (p?.exercises ?? []).join("\n"),
    duration: null, rpe: null, done: false, target_difficulty: diff,
  }];

  // Largeur élargie (2026-09-04, retour de Gildas) — n'est plus contrainte à var(--wk-col), qui
  // vise une grille multi-colonnes non pertinente ici (une seule carte, jamais de scroll horizontal).
  return (
    <div style={{ width: "100%", display: "flex", justifyContent: isMd ? "center" : "flex-start" }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <DayColumn
          date={today} sessions={sessions} wellness={{ score }} todayStr={todayStr}
          onAddSession={HYROX_NOOP} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} onWellness={HYROX_NOOP}
          hideAddSession
          alert={alert}
          renderSession={s => (
            <WeekSessionCard
              session={s} onComplete={HYROX_NOOP} onEdit={HYROX_NOOP} onDuplicate={HYROX_NOOP} hideActions cardStyle={{ cursor: "default" }}
              renderExerciseLine={suggestion ? (line, li) => {
                const modified = parseAndApply(line, suggestion.reco);
                const changed = modified !== line;
                return (
                  <div style={{ padding: "6px 9px", borderTop: li > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                    {changed && (
                      <div style={{ fontSize: 9.5, lineHeight: 1.3, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1 }}>
                        {line}
                      </div>
                    )}
                    <div style={{ fontSize: 11, lineHeight: 1.4, color: changed ? "#E8571A" : "#2c3236", fontWeight: changed ? 800 : 600 }}>
                      {modified}
                    </div>
                  </div>
                );
              } : undefined}
            />
          )}
        />
      </div>
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

/* ────────────────────────────────────────────────────────────────────────
   Signature (charge + récupération) : les 2 vrais charts de /conseils —
   ZoneSparkline (charge) et SparkLineClient (récupération, dégradé bleu +
   Forme pointillée) — chacun avec SON insight croisé (chargeCrossInsight/
   recoveryCrossInsight, mêmes fonctions que /conseils, fatigueSignature.ts),
   empilés dans une seule carte. Remplace ChargePreview/AthleteChargePreview
   au step 3 de la séquence DecisionStep (2026-09-04, demande explicite de
   Gildas : "le chart de charge et celui de récupération avec les insight à
   chaque fois"). Données illustratives statiques (aucun historique n'existe
   encore à ce stade du funnel) — même arc narratif positif déjà établi pour
   DEMO_ACWR ci-dessus (surcharge → correction → stabilisé) et prolongé côté
   récupération (amélioration progressive, Forme qui remonte) : cohérent
   avec "Progresse", pas un signal négatif juste avant le paywall. */
// Variation jour à jour volontairement plus marquée (2026-09-04, retour de Gildas : "plus de
// variation") — jamais monotone comme une vraie semaine ne l'est, tout en gardant le dernier jour
// positif (cohérent avec l'arc narratif "Progresse" déjà établi côté charge, voir DEMO_ACWR).
const DEMO_RECOVERY = [55, 38, 62, 48, 70, 58, 82];
const DEMO_FORM_PCT = [-15, -5, -10, 3, -2, 8, 14];

function SignatureSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function ChargeSection({ perspective, chartHeight, chartMaxWidth }: { perspective: "athlete" | "coach"; chartHeight: number; chartMaxWidth: number }) {
  const loadInfo = sigDimInfo("load", DEMO_ACWR[DEMO_ACWR.length - 1], perspective);
  const monotonyInfo = sigDimInfo("monotony", DEMO_MONOTONY[DEMO_MONOTONY.length - 1], perspective);
  const strainInfo = sigDimInfo("strain", DEMO_STRAIN[DEMO_STRAIN.length - 1], perspective);
  const insight = chargeCrossInsight(loadInfo, monotonyInfo, strainInfo, undefined, undefined, perspective);
  return (
    <div>
      <SignatureSectionLabel>⚡ Charge</SignatureSectionLabel>
      <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>{insight}</div>
      <div style={{ maxWidth: chartMaxWidth }}>
        <ZoneSparkline points={DEMO_ACWR} dates={DEMO_DATES} loads={DEMO_LOADS} monotony={DEMO_MONOTONY} strain={DEMO_STRAIN} hideDayLabels height={chartHeight} />
      </div>
    </div>
  );
}

function RecoverySection({ perspective, chartHeight, chartMaxWidth }: { perspective: "athlete" | "coach"; chartHeight: number; chartMaxWidth: number }) {
  const recoveryInfo = sigDimInfo("recovery", DEMO_RECOVERY[DEMO_RECOVERY.length - 1], perspective);
  const formValue = DEMO_FORM_PCT[DEMO_FORM_PCT.length - 1];
  const insight = recoveryCrossInsight(recoveryInfo, formValue, perspective);
  return (
    <div>
      <SignatureSectionLabel>🌿 Récupération</SignatureSectionLabel>
      <div style={{ marginBottom: 10, fontSize: 12, color: "rgba(255,255,255,.88)", lineHeight: 1.5, fontWeight: 600 }}>{insight}</div>
      <div style={{ maxWidth: chartMaxWidth }}>
        <SparkLineClient
          points={DEMO_RECOVERY} dates={DEMO_DATES} color={recoveryInfo.color} maxVal={100} height={chartHeight}
          metricType="recovery" uid="frise-recovery-demo" chartType="line" sequentialFill zones1={WELLNESS_ZONES}
          points2={DEMO_FORM_PCT.map(formToChartPosition)} points2Raw={DEMO_FORM_PCT} zones2={FORM_ZONES}
        />
      </div>
    </div>
  );
}

// Charts plus hauts en desktop (2026-09-04, retour de Gildas : "que les 2 charts prennent plus de
// place en hauteur en desktop") — 96px partout à l'origine, calibré pour la colonne mobile étroite ;
// isMd élargit aussi le plafond de largeur en proportion, pour ne pas étirer les charts au point de
// les rendre disproportionnés.
export function SignaturePreview({ perspective }: { perspective: "athlete" | "coach" }) {
  const { isMd } = useBreakpoint();
  const chartHeight = isMd ? 190 : 100;
  const chartMaxWidth = isMd ? 620 : 460;
  return (
    <div style={{
      width: "100%", background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: "14px 16px 16px",
      boxShadow: "0 14px 36px rgba(0,0,0,.24)", display: "flex", flexDirection: "column", gap: 16,
    }}>
      <ChargeSection perspective={perspective} chartHeight={chartHeight} chartMaxWidth={chartMaxWidth} />
      <div style={{ height: 1, background: "rgba(255,255,255,.10)" }} />
      <RecoverySection perspective={perspective} chartHeight={chartHeight} chartMaxWidth={chartMaxWidth} />
    </div>
  );
}

/* Obtiens des recommandations — 2026-09-04, demande explicite de Gildas : "qu'un seul graph dans
   lequel il y aura le chart avec une ligne pour le wellness et l'autre pour la charge, toujours avec
   sparkline et insight croisé en haut" — remplace SignaturePreview (2 charts empilés) pour CE step
   (SignaturePreview reste utilisée ailleurs si besoin, pas touchée). Insight croisé = TrendInsight,
   déjà réel (classifyTrend/describeTrend, combine charge+récupération+RPE en une seule phrase — voir
   ChargePreview/AthleteChargePreview ci-dessus, même fonction, pas dupliquée). Chart = le vrai
   SparkLineClient (même composant que /conseils), série principale = wellness (déjà 0-100), série
   secondaire = charge (ACWR, DEMO_ACWR déjà défini plus haut) reprojetée sur le même espace
   d'affichage 0-100 via `acwrToChartPosition` — pas une nouvelle donnée, juste une échelle commune
   pour co-tracer 2 dimensions normalement affichées séparément. */
const ACWR_DOMAIN = { min: 0.4, max: 1.8 };
function acwrToChartPosition(v: number): number {
  return Math.max(0, Math.min(100, ((v - ACWR_DOMAIN.min) / (ACWR_DOMAIN.max - ACWR_DOMAIN.min)) * 100));
}
export function CombinedInsightPreview({ perspective }: { perspective: "athlete" | "coach" }) {
  const { isMd } = useBreakpoint();
  // Desktop réduit (2026-09-04, retour de Gildas : 620→460, carte+chart resserrés ensemble) ;
  // mobile en aspect-ratio 400/230 (le viewBox SVG de SparkLineClient a une largeur interne fixe
  // W=400 — passer height=230 donne exactement ce ratio, demande explicite de Gildas).
  const chartHeight = isMd ? 190 : 230;
  const chartMaxWidth = 460;
  return (
    <div style={{
      width: "100%", maxWidth: isMd ? 460 : undefined, margin: isMd ? "0 auto" : undefined,
      background: "linear-gradient(145deg,#1a1a1a,#282828)", borderRadius: 20, padding: "14px 16px 16px",
      boxShadow: "0 14px 36px rgba(0,0,0,.24)",
    }}>
      <TrendInsight perspective={perspective} />
      <div style={{ display: "flex", gap: 14, marginBottom: 8, fontSize: 10.5, fontWeight: 800 }}>
        <span style={{ color: "#5aa9e6" }}>● Récupération</span>
        <span style={{ color: "#d44000" }}>● Charge</span>
      </div>
      <div style={{ maxWidth: chartMaxWidth }}>
        <SparkLineClient
          points={DEMO_RECOVERY} dates={DEMO_DATES} color="#5aa9e6" maxVal={100} height={chartHeight}
          metricType="recovery" uid="frise-combined-demo" chartType="line" sequentialFill zones1={WELLNESS_ZONES}
          points2={DEMO_ACWR.map(acwrToChartPosition)} points2Raw={DEMO_ACWR} color2="#d44000"
        />
      </div>
    </div>
  );
}
