"use client";

import DiffGauge from "@/components/calendar/DiffGauge";
import { zoneLabel } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import type { CoachAthlete, CoachViewSession } from "@/types";

/* Carte sportif de Coach Control — extraite de CoachClient.tsx pour être réutilisable ailleurs
   (ex. aperçu onboarding coach) sans dupliquer la logique décision/risque. */

export function scoreColor(s: number | null) { return s === null ? "rgba(255,255,255,0.18)" : s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000"; }

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

export function attention(a: CoachAthlete, maxDiff: number) {
  if (a.wellnessFilledToday === false) return maxDiff >= 8; // pas de wellness du jour : seule une séance dure prévue justifie une alerte
  return a.wellness_score < 55 ||
    (a.wellness_score < 65 && maxDiff >= 5) ||
    maxDiff >= 8;
}

export function riskScore(a: CoachAthlete, maxDiff: number): number {
  let score = 0;
  if (a.wellnessFilledToday !== false) {
    if (a.wellness_score < 55) score += 4;
    else if (a.wellness_score < 65) score += 2;
  }
  if (maxDiff >= 8) score += 3;
  else if (maxDiff >= 6) score += 1;
  return score;
}

export function decisionText(a: CoachAthlete, maxDiff: number) {
  if (a.wellnessFilledToday === false) {
    if (maxDiff >= 8) return "Wellness non renseigné aujourd'hui + séance dure prévue : vérifier avec lui avant.";
    return "Wellness non renseigné aujourd'hui.";
  }
  if (a.wellness_score < 55 && maxDiff >= 7) return "Wellness bas + séance difficile : alléger maintenant.";
  if (maxDiff >= 8) return "Séance dure prévue : vérifier qu'il n'enchaîne pas dur.";
  if (a.wellness_score < 65 && maxDiff <= 4) return "Wellness légèrement bas, séance légère : rien à changer, surveiller demain.";
  if (a.wellness_score < 65) return "Wellness à surveiller : réduire le volume ou vérifier la difficulté réelle.";
  return "Plan cohérent : suivre la difficulté réelle.";
}

export function CoachCard({ athlete, sessions, isPriority, isReviewed, onDecide, tourId }: {
  athlete: CoachAthlete;
  sessions: CoachViewSession[];
  isPriority: boolean;
  isReviewed: boolean;
  onDecide: () => void;
  tourId?: string;
}) {
  const maxDiff = maxDiffToday(athlete.id, sessions);
  const todaySessions = sessions.filter(s => s.athlete_id === athlete.id);
  const topSession = [...todaySessions].sort((a, b) => (b.target_difficulty ?? 0) - (a.target_difficulty ?? 0))[0] ?? null;
  const extraSessions = todaySessions.length - (topSession ? 1 : 0);
  const decision = decisionText(athlete, maxDiff);
  const showBadge = isPriority && !isReviewed;
  const showReviewed = isPriority && isReviewed;
  const behaviors = athlete.behaviors ?? [];
  const firstName = athlete.name.split(" ")[0];
  const displayScore = athlete.wellnessFilledToday === false ? null : athlete.wellness_score;

  return (
    <div data-tour={tourId} style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(145deg,#1a1a1a,#282828)",
      border: showBadge ? "1.5px solid rgba(212,64,0,.45)" : showReviewed ? "1.5px solid rgba(47,158,68,.30)" : "1px solid rgba(255,255,255,.08)",
      borderRadius: 26, padding: 18,
      boxShadow: showBadge ? "0 18px 46px rgba(212,64,0,.18)" : "0 14px 36px rgba(0,0,0,.28)",
      transition: "border 0.3s ease, box-shadow 0.3s ease",
      color: "#fff",
    }}>
      {/* Pulsing badge top-right */}
      {showBadge && (
        <>
          <style>{`
            @keyframes perf-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(1.35); }
            }
          `}</style>
          <div style={{
            position: "absolute", top: 14, right: 14,
            width: 9, height: 9, borderRadius: "50%", background: "#d44000",
            animation: "perf-pulse 1.8s ease-in-out infinite",
          }} />
        </>
      )}

      {/* Ring + zone + prénom */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <WellnessRing score={displayScore} size={72} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#ff8a55", marginBottom: 4 }}>
            {zoneLabel(displayScore)}
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

      {/* Encart décision */}
      <div style={{
        padding: "12px 14px", borderRadius: 16,
        background: isPriority ? "rgba(212,64,0,.16)" : "rgba(47,158,68,.14)",
        border: `1px solid ${isPriority ? "rgba(212,64,0,.30)" : "rgba(47,158,68,.30)"}`,
        marginBottom: todaySessions.length > 0 ? 12 : 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "#fff", marginBottom: 10 }}>
          {isPriority ? "💛" : "✅"} {decision}
        </div>
        <button
          data-tour={tourId ? "decider-btn" : undefined}
          onClick={onDecide}
          style={{
            height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10,
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

      {/* Carte séance imbriquée */}
      {topSession && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "11px 13px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
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
              {topSession.notes.split("\n").filter(Boolean).map((ex, i) => (
                <div key={i} style={{ padding: "6px 9px", fontSize: 11, lineHeight: 1.4, color: "#2c3236", fontWeight: 600, borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                  {ex}
                </div>
              ))}
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
