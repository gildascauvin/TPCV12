"use client";

import { getPrimingHeadline, UNLIMITED_BULLET, COACH_AUTOREG_HEADLINE, COACH_LIBRARY_PITCH } from "@/lib/primingCopy";
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

const AVATARS = [
  "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
  "https://www.theperfclub.com/wp-content/uploads/2022/02/Rond_SC.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/07/rugby-club-tarbes-768x768.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2022/05/2toiles-92-natation.jpeg",
  "https://www.theperfclub.com/wp-content/uploads/2021/03/halte%CC%81rophilie-Thibault-cortes.png",
];

const TESTIMONIALS = {
  athlete: {
    quote: "ThePerfClub a totalement changé la façon dont je structure mes entraînements. Je suis passé de « plus c'est mieux » à une vraie autorégulation — et mes résultats ont suivi.",
    name: "Franck G.",
    role: "Sportif · Membre ThePerfClub",
    photo: "https://www.theperfclub.com/wp-content/uploads/2021/03/Antoine-serpe-handball-powerlifting-1536x978.png",
  },
  coach: {
    quote: "Je pensais que ThePerfClub était encore un outil pour créer des séances. Cela va bien plus loin : gestion du volume, de la fatigue, autorégulation — un véritable tableau de bord.",
    name: "Killian Anno",
    role: "Préparateur physique · Rugby Club d'Arcachon",
    photo: "https://www.theperfclub.com/wp-content/uploads/2021/10/rugby-1024x820.png",
  },
};

interface Props {
  role: Role;
  name: string;
  sport: string;
  level: Level;
  goal: string;
  frustration: string;
  coachingChallenge: string;
  wScore: number | null;
  wellnessTip?: string | null;
  claimedProgramName?: string | null;
  claimedProgramWeeks?: number | null;
  showProfile: boolean;
  showWellness: boolean;
  saving: boolean;
  onStartTrial: () => void;
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
  role, name, sport, level, goal, frustration, coachingChallenge, wScore, wellnessTip,
  claimedProgramName, claimedProgramWeeks,
  showProfile, showWellness, saving, onStartTrial,
}: Props) {
  const previews = role === "coach" ? getCoachPreviews(sport) : getAthletePreviews(sport);
  const headline = role === "coach"
    ? COACH_AUTOREG_HEADLINE
    : getPrimingHeadline({ mode: "athlete", goal, frustration });
  const unlimitedBullet = UNLIMITED_BULLET[role];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(16px)" }}>
      <div style={{
        position: "relative", width: "100%", maxWidth: 420, maxHeight: "92vh", overflowY: "auto", overflowX: "hidden",
        borderRadius: 30, padding: 28, boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        background: "#161616",
      }}>
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
                {role === "athlete" && <Chip label={LEVEL_LABELS[level]} />}
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
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Score wellness</div>
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
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Capacité illimitée</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                  {COACH_LIBRARY_PITCH}
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

          {/* Preuve sociale */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16 }}>
              <div style={{ display: "flex" }}>
                {AVATARS.map((src, i) => (
                  <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #161616", marginLeft: i > 0 ? -9 : 0, overflow: "hidden", flexShrink: 0, position: "relative", zIndex: 5 - i }}>
                    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>+300 sportifs, coachs et clubs</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 1 }}>font confiance à ThePerfClub</div>
              </div>
            </div>
            <div style={{ padding: "14px 16px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.82)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
                &ldquo;{TESTIMONIALS[role].quote}&rdquo;
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                  <img src={TESTIMONIALS[role].photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{TESTIMONIALS[role].name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)" }}>{TESTIMONIALS[role].role}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                  {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ color: "#ff8a4c", fontSize: 12 }}>★</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Upgrade pitch */}
          <div style={{ background: "rgba(212,64,0,0.10)", border: "1px solid rgba(212,64,0,0.30)", borderRadius: 16, padding: "16px 16px 14px" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.45, marginBottom: 10 }}>
              {headline}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(212,64,0,.20)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#ff8a4c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{unlimitedBullet}</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <Actions variant="modal-dark" onNext={onStartTrial} nextDisabled={saving} nextLabel="Commencer mon essai gratuit →" />
      </div>
    </div>
  );
}
