"use client";

import { COACH_UNLIMITED_ATHLETES_PITCH } from "@/lib/primingCopy";
import WellnessRing from "@/components/wellness/WellnessRing";
import Actions from "@/components/onboarding/Actions";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";

const LEVEL_LABELS: Record<Level, string> = { beginner: "Débutant", intermediate: "Intermédiaire", elite: "Compétiteur" };

function getAthletePreviews(sport: string) {
  return [
    { emoji: "🏃", title: "Ta séance du jour, ajustée à ta forme" },
    { emoji: "📅", title: sport ? `Ton programme ${sport}, semaine par semaine` : "Ton programme, semaine par semaine" },
    { emoji: "📊", title: "Tes données de performance en un coup d'œil" },
  ];
}

function getCoachPreviews(sport: string) {
  return [
    { emoji: "👥", title: "Le niveau de forme de chaque sportif" },
    { emoji: "📋", title: sport ? `Un programme ${sport} prêt à assigner` : "Un programme prêt à assigner" },
    { emoji: "🎯", title: "Le lien coach-sportif centralisé" },
  ];
}

interface Props {
  role: Role;
  name: string;
  sport: string;
  level: Level;
  /* N'affiche le chip niveau que si un vrai choix existe derrière (programme claimé — voir
     showLevel dans OnboardingFlow, même règle que ProfileRecapStep). Sur le chemin classique,
     `level` reste figé à sa valeur neutre par défaut ("intermediate") jamais choisie par
     l'utilisateur depuis que level_2a a été remplacé par les faiblesses — l'afficher sous "On a
     compris ton profil" aurait affirmé un fait jamais recueilli (bug réel trouvé par Gildas,
     2026-08-17, même catégorie que le headline paywall non personnalisé). */
  showLevel: boolean;
  goal: string;
  coachingChallenge: string;
  wScore: number | null;
  wellnessTip?: string | null;
  claimedProgramName?: string | null;
  claimedProgramWeeks?: number | null;
  showProfile: boolean;
  showWellness: boolean;
  saving: boolean;
  /* Le paiement a déjà eu lieu avant cet écran (paywall_priming/paywall_form précèdent
     désormais celebration) — ce CTA avance simplement vers l'activation, il ne déclenche plus
     le paywall. */
  onNext: () => void;
}

function Chip({ label }: { label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", padding: "7px 12px", borderRadius: 999,
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
      fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)",
    }}>
      {label}
    </div>
  );
}

export default function CelebrationScreen({
  role, name, sport, level, showLevel, goal, coachingChallenge, wScore, wellnessTip,
  claimedProgramName, claimedProgramWeeks,
  showProfile, showWellness, saving, onNext,
}: Props) {
  const previews = role === "coach" ? getCoachPreviews(sport) : getAthletePreviews(sport);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{
        position: "relative", width: "100%", maxWidth: 420, maxHeight: "92vh",
        borderRadius: 30, boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        background: "#161616",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
      <div style={{ overflowY: "auto", overflowX: "hidden", padding: 28 }}>
        <div style={{ position: "absolute", right: "-10%", top: "-10%", width: 260, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(36px)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Header */}
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 14 }}>
            ✦ Bienvenue
          </div>
          <div style={{ fontSize: 26, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 22 }}>
            {name ? `Bienvenue, ${name} ! 🎉` : "Bienvenue ! 🎉"}
          </div>

          {/* Recap profil */}
          {showProfile && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
                On a compris ton profil
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sport && <Chip label={sport} />}
                {role === "athlete" && showLevel && <Chip label={LEVEL_LABELS[level]} />}
                {role === "athlete" && goal && <Chip label={goal} />}
                {role === "coach" && coachingChallenge && <Chip label={coachingChallenge} />}
              </div>
            </div>
          )}

          {/* Score wellness (sportif) */}
          {showWellness && wScore != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
              <WellnessRing dark score={wScore} size={64} strokeWidth={6} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Score de récupération</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                  {wellnessTip || "Ton programme tient compte de ta récupération réelle, pas d'un plan générique."}
                </div>
              </div>
            </div>
          )}

          {/* Capacité illimitée (coach) */}
          {role === "coach" && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
              <WellnessRing dark infinite score={null} size={64} strokeWidth={6} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Sportifs illimités</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                  {COACH_UNLIMITED_ATHLETES_PITCH}
                </div>
              </div>
            </div>
          )}

          {/* Programme claimé */}
          {claimedProgramName && (
            <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
                Ton programme
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.35 }}>
                {claimedProgramName}
              </div>
              {claimedProgramWeeks && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                  {claimedProgramWeeks} semaines, prêt à démarrer
                </div>
              )}
            </div>
          )}

          {/* Aperçus */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>
              Ton espace est prêt
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, overflow: "hidden" }}>
              {previews.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none" }}>
                  <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: "center" }}>{p.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.82)", lineHeight: 1.35 }}>{p.title}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

        {/* CTA */}
        <Actions variant="modal-dark" onNext={onNext} nextDisabled={saving} nextLabel="Continuer →" />
      </div>
    </div>
  );
}
