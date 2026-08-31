"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import Actions from "@/components/onboarding/Actions";
import { CoachCard } from "@/components/coach/CoachAthleteCard";
import { computeAutoregSuggestion } from "@/lib/autoregulation";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { SessionTemplate, CoachAthlete, CoachViewSession } from "@/types";

/* Écran de décision — 5e itération (2026-08-31) : la jauge de forme interactive (slider continu,
   même mécanique que l'ancien week_preview — voir sa doc historique dans l'ancienne version de ce
   fichier avant migration) déménage ici, sur l'écran "décision" plutôt que sur l'écran "programme"
   (retour explicite de Gildas : personne ne jouait avec le curseur pendant qu'on vend encore le
   produit, decision est le seul écran cadré comme "le premier vrai geste"). week_preview redevient
   un aperçu 100% passif (plus aucune simulation de forme).
   N'est plus responsable de la transition "intégration" (déplacée sur WellnessCheckStep.tsx, écran
   précédent, dead code) — arrive directement révélé (ring + décision), le changement d'écran EST
   déjà la transition. Réutilise le vrai `CoachCard` pour les 2 rôles (1 carte "Toi" pour le
   sportif, 3 pour le coach en grille 2 colonnes comme /coach réel). Dès qu'une décision est prise,
   célébration en place (confettis) — mais n'avance PLUS automatiquement (retour explicite de
   Gildas : "seul le CTA sticky en bas fait avancer") : la célébration se referme d'elle-même, le
   CTA devient actif, l'utilisateur clique lui-même.
   `demoHardest`/`demoLightest`/`demoMiddle` viennent d'OnboardingFlow (calculés une seule fois,
   voir sa doc "pickHardest") — garantit un vrai jour dur/léger (seuils réels requis par
   computeAutoregSuggestion, un wellness ne peut pas à lui seul compenser une difficulté qui ne les
   franchit pas — bug trouvé par Gildas en testant : "j'ai pas toujours un sportif à alléger et un
   sportif à surcharger").
   Jauge réservée au sportif (retour explicite de Gildas, 2026-08-31) — le coach garde ses 3 cartes
   à wellness fixe (38/70/88, valeurs d'origine), il a déjà plusieurs cas distincts à observer dans
   son Coach Control, une jauge en plus serait redondant. ATHLETE_BASE_WELLNESS=65, PAS 38 : la
   suggestion (comme le ring) tourne désormais sur `baseline.relativeScore` (percentile Z-score,
   voir wellnessBaseline.ts — le score absolu n'est plus qu'un garde-fou secondaire depuis le
   chantier "autorégulation continue" du 2026-08-31). Vérifié par calcul direct (pas deviné) : avec
   base=38 et le delta -28/+22, le score brut ne dépasse jamais 60, or la baseline synthétique tourne
   autour d'une moyenne ~73 — le percentile restait *saturé à 5 sur toute la plage du curseur*, ring
   et reco figés. base=65 fait sweeper le percentile de 5 à 95 sur toute la course du slider, avec
   un vrai basculement Alléger→Maintenir aux alentours de la 2e moitié du curseur (jamais Surcharger,
   qui exigerait une séance légère — demoHardest est toujours dure, hors périmètre d'une seule carte). */

const ANCHOR_DELTA = { low: -28, ok: 0, high: 22 };
function deltaFromSlider(v: number): number {
  if (v <= 50) return ANCHOR_DELTA.low + (ANCHOR_DELTA.ok - ANCHOR_DELTA.low) * (v / 50);
  return ANCHOR_DELTA.ok + (ANCHOR_DELTA.high - ANCHOR_DELTA.ok) * ((v - 50) / 50);
}
function sliderStateLabel(v: number): { emoji: string; text: string } {
  if (v < 34) return { emoji: "😴", text: "Pas en forme" };
  if (v > 66) return { emoji: "⚡", text: "En forme" };
  return { emoji: "😐", text: "Forme OK" };
}

const ATHLETE_BASE_WELLNESS = 65;
const FORCED_WELLNESS = 38;
const FORCED_BEHAVIORS = ["late_sleep", "screen_late"];

type Role = "athlete" | "coach";

interface Props {
  demoHardest: SessionTemplate | null;
  demoLightest: SessionTemplate | null;
  demoMiddle: SessionTemplate | null;
  sport: string;
  role: Role;
  athleteName?: string;
  frise?: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
}

type TplSession = { name: string; notes: string | null; diff: number };

function toTpl(s: SessionTemplate | null): TplSession | null {
  return s ? { name: s.name, notes: s.notes ?? null, diff: s.target_difficulty } : null;
}

export default function DecisionStep({ demoHardest, demoLightest, demoMiddle, sport, role, athleteName, frise, onNext, onBack }: Props) {
  const { isMd, isLg } = useBreakpoint();
  const heroMaxWidth = isLg ? 720 : isMd ? 640 : 560;
  const [overrides, setOverrides] = useState<Record<string, { notes: string | null; diff: number }>>({});
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [celebrating, setCelebrating] = useState(false);
  const celebratedRef = useRef(false);
  const [formSlider, setFormSlider] = useState(50);
  const formDelta = deltaFromSlider(formSlider);
  const { emoji: sliderEmoji, text: sliderText } = sliderStateLabel(formSlider);
  const clampScore = (base: number) => Math.round(Math.max(5, Math.min(98, base + formDelta)));

  /* Bouger le curseur change la forme simulée, donc potentiellement la reco elle-même — une
     décision déjà "traitée" (overrides/decidedIds) sous l'ancienne forme n'a plus de sens sous la
     nouvelle. Reset propre à chaque changement (aucune écriture réelle sur cet écran, zéro perte de
     donnée) plutôt que de laisser un badge "Traité ✓" périmé à côté d'une reco recalculée. */
  useEffect(() => {
    setOverrides({});
    setDecidedIds(new Set());
    celebratedRef.current = false;
  }, [formSlider]);

  const hardest = toTpl(demoHardest);
  const lightest = toTpl(demoLightest);
  const middle = toTpl(demoMiddle);
  const pool = [hardest, lightest, middle].filter((s): s is TplSession => !!s);

  const nextLabel = role === "coach" ? "Continuer avec mes sportifs →" : "Continuer avec mon programme →";

  const heroBlock = (
    <div style={{
      background: "#141414", width: "100vw", position: "relative", left: "50%", right: "50%",
      marginLeft: "-50vw", marginRight: "-50vw", marginTop: -36, paddingTop: 24, paddingBottom: 20,
    }}>
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: "0 20px" }}>
        {frise}
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", lineHeight: "normal", marginBottom: 4, color: "#fff" }}>
          {role === "coach" ? "⚡ Ajuste la charge selon la forme de tes sportifs." : "⚡ Ajuste la charge selon ta forme."}
        </div>
        {/* Wording "zoom in" (2026-08-28, retour explicite de Gildas) — week_preview est la vue
            large/immersive du programme ; cet écran est le moment resserré où une vraie décision se
            prend. Titre = verbe d'action en ouverture ("Ajuste..."), inversé par rapport à une
            itération précédente (constat "Le programme ne sait pas comment tu te sens" en titre,
            action en sous-titre) — retour explicite de Gildas préférant l'inverse, le titre pointe
            directement vers la carte cliquable juste en dessous plutôt que d'ouvrir sur le manque.
            Sous-titre : "Le plan, lui, ne bouge pas" reste la réassurance clé — évite que
            l'autorégulation ne sonne comme un choix libre/arbitraire (retour Gildas sur une version
            antérieure, "À toi de choisir : la garder, l'alléger, ou pousser plus fort.", jugée pas
            assez orientée action ET sous-entendant à tort qu'on se fiche du programme) : c'est une
            reco calculée sur un signal réel (forme + difficulté prévue), jamais l'objectif du cycle
            qui bouge. Le constat ("le programme ne sait pas...") reste implicite plutôt que redit. */}
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginBottom: 18 }}>
          {/* Identique pour les 2 rôles — rien dans cette phrase ne dépend de "tu"/"tes sportifs". */}
          Le plan, lui, ne bouge pas — seule la charge s&apos;ajuste.
        </div>

        {/* Jauge de forme interactive — sportif uniquement (voir doc en tête de fichier). Le coach
            garde heroBlock sans elle : ses 3 cartes à wellness fixe suffisent déjà à montrer les
            3 issues, une jauge en plus serait redondante avec son Coach Control réel. */}
        {role !== "coach" && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 10 }}>
              Ta forme aujourd&apos;hui
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>{sliderEmoji}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{sliderText}</span>
            </div>
            <input
              type="range" min={0} max={100} value={formSlider}
              onChange={e => setFormSlider(Number(e.target.value))}
              style={{
                WebkitAppearance: "none", width: "100%", height: 6, borderRadius: 3,
                background: "linear-gradient(90deg, #2a78d6 0%, rgba(255,255,255,.18) 50%, #d44000 100%)",
                outline: "none", cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,.55)" }}>
              <span>😴 Pas en forme</span><span>⚡ En forme</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (!pool.length) {
    return (
      <div>
        {heroBlock}
        <div style={{ padding: "24px 20px", textAlign: "center", color: "#8a8f94", fontSize: 13 }}>Chargement…</div>
        <Actions onNext={onNext} onBack={onBack} nextLabel={nextLabel} nextDisabled />
      </div>
    );
  }

  function buildSession(id: string, athleteId: string, tpl: TplSession | null): CoachViewSession | null {
    if (!tpl) return null;
    const ov = overrides[id];
    return {
      id, athlete_id: athleteId, date: format(new Date(), "yyyy-MM-dd"),
      name: tpl.name, notes: ov ? ov.notes : tpl.notes, duration: null, rpe: null, done: false,
      target_difficulty: ov ? ov.diff : tpl.diff, created_at: new Date().toISOString(), _real: false,
    };
  }

  // Dès qu'une décision est prise (Maintenir OU Alléger/Surcharger appliqué) : célébration en
  // place, une seule fois — ne déclenche plus onNext() automatiquement (Gildas : "seul le CTA
  // sticky en bas fait avancer"). La célébration se referme d'elle-même après son animation.
  function handleAnyDecision(id: string) {
    setDecidedIds(prev => { const s = new Set(prev); s.add(id); return s; });
    if (!celebratedRef.current) {
      celebratedRef.current = true;
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 2600);
    }
  }

  if (role !== "coach") {
    const session = buildSession("preview-you", "preview-you", hardest);
    const athleteScore = clampScore(ATHLETE_BASE_WELLNESS);
    const athlete: CoachAthlete = {
      id: "preview-you", coach_id: "preview", name: athleteName?.trim() || "Toi", sport,
      wellness_score: athleteScore, behaviors: FORCED_BEHAVIORS,
      wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString(),
    };
    // Baseline (Z-score, src/lib/wellnessBaseline.ts) sur historique synthétique — même calcul que
    // /coach, /coach/planning et la sandbox (syntheticBaselineFor, src/lib/sandboxFixtures.ts),
    // jamais un seuil absolu propre à cet aperçu.
    const baseline = syntheticBaselineFor(athleteScore, "preview-you");
    const suggestion = session ? computeAutoregSuggestion(athleteScore, session.target_difficulty ?? 6, baseline) : null;
    return (
      <div style={{ position: "relative" }}>
        {heroBlock}
        <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: isMd ? "20px 24px 0" : "18px 16px 0" }}>
          {session && (
            <CoachCard
              athlete={athlete} sessions={[session]} isPriority={!!suggestion} isReviewed={decidedIds.has("preview-you")} selfView
              baseline={baseline}
              onDecide={() => {}}
              onApplyAdjust={async (s, pct) => {
                const notes = s.notes ? s.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : s.notes;
                setOverrides(prev => ({ ...prev, [s.id]: { notes, diff: adjustDifficulty(s.target_difficulty ?? 6, pct) } }));
              }}
              onUndoAdjust={async () => setOverrides(prev => { const n = { ...prev }; delete n["preview-you"]; return n; })}
              onAutoregDecided={() => handleAnyDecision("preview-you")}
              onAutoregUndone={() => setDecidedIds(prev => { const s2 = new Set(prev); s2.delete("preview-you"); return s2; })}
            />
          )}
        </div>
        <Actions onNext={onNext} onBack={onBack} nextLabel={nextLabel} />
        {celebrating && <CelebrationOverlay title="Première séance adaptée à la forme du jour !" benefits={["Moins de blessures", "Plus de performances"]} />}
      </div>
    );
  }

  const thomasSession = buildSession("preview-thomas", "preview-thomas", hardest);
  const emmaSession = buildSession("preview-emma", "preview-emma", middle);
  const pierreSession = buildSession("preview-pierre", "preview-pierre", lightest);
  const allSessions = [thomasSession, emmaSession, pierreSession].filter((s): s is CoachViewSession => !!s);

  // Wellness fixe côté coach (pas de jauge ici, voir doc en tête de fichier) — 3 valeurs qui
  // garantissent les 3 issues Alléger/Maintenir/Surcharger simultanément, inchangées depuis avant
  // ce chantier.
  const baselinesById: Record<string, ReturnType<typeof syntheticBaselineFor>> = {
    "preview-thomas": syntheticBaselineFor(FORCED_WELLNESS, "preview-thomas"),
    "preview-emma": syntheticBaselineFor(70, "preview-emma"),
    "preview-pierre": syntheticBaselineFor(88, "preview-pierre"),
  };

  const athletes: { athlete: CoachAthlete; session: CoachViewSession | null }[] = [
    { athlete: { id: "preview-thomas", coach_id: "preview", name: "Thomas M.", sport, wellness_score: FORCED_WELLNESS, behaviors: FORCED_BEHAVIORS, wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString() }, session: thomasSession },
    { athlete: { id: "preview-emma", coach_id: "preview", name: "Emma L.", sport, wellness_score: 70, behaviors: ["walk"], wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString() }, session: emmaSession },
    { athlete: { id: "preview-pierre", coach_id: "preview", name: "Pierre D.", sport, wellness_score: 88, behaviors: ["hydration"], wellnessFilledToday: true, user_id: null, invite_email: null, created_at: new Date().toISOString() }, session: pierreSession },
  ];

  function isPriorityFor(id: string, session: CoachViewSession | null): boolean {
    if (!session) return false;
    const wellness = id === "preview-thomas" ? FORCED_WELLNESS : id === "preview-emma" ? 70 : 88;
    return !!computeAutoregSuggestion(wellness, session.target_difficulty ?? 6, baselinesById[id]);
  }

  function renderCard(a: CoachAthlete, session: CoachViewSession | null) {
    if (!session) return null;
    return (
      <CoachCard
        key={a.id}
        athlete={a} sessions={allSessions} isPriority={isPriorityFor(a.id, session)} isReviewed={decidedIds.has(a.id)}
        baseline={baselinesById[a.id]}
        onDecide={() => {}}
        onApplyAdjust={async (s, pct) => {
          const notes = s.notes ? s.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : s.notes;
          setOverrides(prev => ({ ...prev, [s.id]: { notes, diff: adjustDifficulty(s.target_difficulty ?? 6, pct) } }));
        }}
        onUndoAdjust={async () => setOverrides(prev => { const n = { ...prev }; delete n[a.id]; return n; })}
        onAutoregDecided={() => handleAnyDecision(a.id)}
        onAutoregUndone={() => setDecidedIds(prev => { const s2 = new Set(prev); s2.delete(a.id); return s2; })}
      />
    );
  }

  const priorityList = athletes.filter(({ athlete, session }) => isPriorityFor(athlete.id, session));
  const stableList = athletes.filter(({ athlete, session }) => !isPriorityFor(athlete.id, session));

  return (
    <div style={{ position: "relative" }}>
      {heroBlock}
      <div style={{ width: "100vw", position: "relative", left: "50%", marginLeft: "-50vw", marginRight: "-50vw" }}>
        <div style={{ maxWidth: isLg ? 1000 : isMd ? 720 : 600, margin: "0 auto", padding: isLg ? "20px 40px 0" : isMd ? "18px 24px 0" : "16px 16px 0" }}>
          {priorityList.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428", marginBottom: 2 }}>À décider maintenant</div>
              <div style={{ fontSize: 12, color: "#687075", marginBottom: 10 }}>Le coach voit d&apos;abord ce qui mérite une action.</div>
              <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
                {priorityList.map(({ athlete, session }) => renderCard(athlete, session))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: "-0.03em", color: "#1f2428", marginBottom: 2 }}>Plan cohérent</div>
            <div style={{ fontSize: 12, color: "#687075", marginBottom: 10 }}>Pas d&apos;intervention immédiate.</div>
            <div style={{ display: "grid", gridTemplateColumns: isLg ? "1fr 1fr" : "1fr", gap: 10 }}>
              {stableList.map(({ athlete, session }) => renderCard(athlete, session))}
            </div>
          </div>
        </div>
      </div>
      <Actions onNext={onNext} onBack={onBack} nextLabel={nextLabel} />
      {celebrating && <CelebrationOverlay title="Première séance autorégulée !" benefits={["Moins de blessures", "Plus de performances"]} />}
    </div>
  );
}

function CelebrationOverlay({ title, benefits }: { title: string; benefits: string[] }) {
  const colors = ["#d44000", "#1f6f52", "#f28a00", "#3fae63", "#171b1f"];
  const pieces = Array.from({ length: 22 }).map((_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.4, color: colors[i % colors.length], rot: Math.round(Math.random() * 40 - 20),
  }));
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(20,20,20,.92)", backdropFilter: "blur(3px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {pieces.map((p, i) => (
          <div key={i} style={{
            position: "absolute", width: 7, height: 13, top: -16, left: `${p.left}%`, borderRadius: 2, background: p.color,
            transform: `rotate(${p.rot}deg)`, animation: `celebFall 1.7s ease-in ${p.delay}s forwards`,
          }} />
        ))}
      </div>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(180deg,#3fae63,#237a35)", color: "#fff",
        fontSize: 28, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16,
        boxShadow: "0 14px 30px rgba(35,122,53,.28)", animation: "celebPop .45s cubic-bezier(.2,.8,.2,1)",
      }}>✓</div>
      <div style={{ fontSize: 21, fontWeight: 950, letterSpacing: "-0.03em", color: "#fff", position: "relative", zIndex: 2 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, position: "relative", zIndex: 2 }}>
        {benefits.map(b => (
          <div key={b} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.9)" }}>
            <span style={{ color: "#7fdb8f", fontWeight: 900 }}>✓</span>{b}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes celebFall { to { transform: translateY(500px) rotate(360deg); opacity: 0; } }
        @keyframes celebPop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}
