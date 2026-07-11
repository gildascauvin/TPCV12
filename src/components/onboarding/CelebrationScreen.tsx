"use client";

import { getPrimingHeadline, UNLIMITED_BULLET, COACH_AUTOREG_HEADLINE } from "@/lib/primingCopy";

type Role = "athlete" | "coach";
type Level = "beginner" | "intermediate" | "elite";

const LEVEL_LABELS: Record<Level, string> = { beginner: "Débutant", intermediate: "Intermédiaire", elite: "Compétiteur" };

const ATHLETE_PREVIEWS = [
  { emoji: "🏃", title: "Ta séance du jour, ajustée à ta forme" },
  { emoji: "📅", title: "Ton programme, semaine par semaine" },
  { emoji: "📊", title: "Tes données de performance en un coup d'œil" },
];

const COACH_PREVIEWS = [
  { emoji: "👥", title: "Le niveau de forme de chaque sportif" },
  { emoji: "📋", title: "Un programme prêt à assigner" },
  { emoji: "🎯", title: "Le lien coach-sportif centralisé" },
];

interface Props {
  role: Role;
  name: string;
  sport: string;
  level: Level;
  goal: string;
  frustration: string;
  coachingChallenge: string;
  wScore: number | null;
  showProfile: boolean;
  showWellness: boolean;
  saving: boolean;
  onStartTrial: () => void;
  onSkip: () => void;
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
  role, name, sport, level, goal, frustration, coachingChallenge, wScore,
  showProfile, showWellness, saving, onStartTrial, onSkip,
}: Props) {
  const previews = role === "coach" ? COACH_PREVIEWS : ATHLETE_PREVIEWS;
  const headline = role === "coach"
    ? COACH_AUTOREG_HEADLINE
    : getPrimingHeadline({ mode: "athlete", goal, frustration });
  const unlimitedBullet = UNLIMITED_BULLET[role];
  const scoreColor = wScore == null ? "#8a8f94" : wScore >= 70 ? "#2f9e44" : wScore >= 45 ? "#f28a00" : "#d44000";

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", right: "-10%", top: "-10%", width: 260, height: 220, borderRadius: "50%", background: "rgba(212,64,0,0.18)", filter: "blur(36px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, padding: "12px 4px" }}>
        {/* Header */}
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 14 }}>
          ✦ Bienvenue
        </div>
        <div style={{ fontSize: 30, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 22 }}>
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

        {/* Score wellness */}
        {showWellness && wScore != null && (
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 1000, color: scoreColor, letterSpacing: "-0.03em", lineHeight: 1 }}>{wScore}%</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score wellness</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
              Ton programme tient compte de ta récupération réelle, pas d&apos;un plan générique.
            </div>
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

        {/* Upgrade pitch */}
        <div style={{ background: "rgba(212,64,0,0.10)", border: "1px solid rgba(212,64,0,0.30)", borderRadius: 16, padding: "16px 16px 14px", marginBottom: 16 }}>
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

        {/* CTA */}
        <button
          onClick={onStartTrial}
          disabled={saving}
          style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: saving ? "default" : "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.30)", letterSpacing: "-0.01em", marginBottom: 10 }}
        >
          Commencer mon essai gratuit →
        </button>
        <button onClick={onSkip} style={{ width: "100%", background: "none", border: "none", fontSize: 12, color: "rgba(255,255,255,0.45)", cursor: "pointer", padding: "4px 0" }}>
          Accéder sans abonnement →
        </button>
      </div>
    </div>
  );
}
