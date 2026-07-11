"use client";

import { useState, useEffect } from "react";

interface Props {
  overloadCoachAns: string;
  planningCoachAns: string;
  fatigueCoachAns:  string;
  onNext: () => void;
}

function toRisk(ans: string, highWords: string[]): number {
  const a = ans.toLowerCase();
  if (highWords.some(w => a.includes(w))) return 3;
  if (a.includes("souvent")) return 2;
  if (a.startsWith("parfois") || a.startsWith("un peu")) return 1;
  return 0;
}

const RISK_LABELS = ["Maîtrisé", "À affiner", "À travailler", "À risque"] as const;

function riskColor(risk: number): string {
  if (risk === 0) return "#2f9e44";
  if (risk === 1) return "#f28a00";
  if (risk === 2) return "#e8590c";
  return "#d44000";
}

function globalColor(pct: number): string {
  if (pct >= 75) return "#2f9e44";
  if (pct >= 45) return "#f28a00";
  return "#d44000";
}

function getBridgeMessage(pct: number): string {
  if (pct >= 90) return "Tu maîtrises déjà bien ton équipe — ThePerfClub va te donner les données pour aller encore plus loin.";
  if (pct >= 60) return "Bonne base de gestion. ThePerfClub va t'aider à affiner le suivi de chaque sportif.";
  if (pct >= 35) return "Il y a de la marge pour optimiser le suivi. ThePerfClub te donne la visibilité pour prendre les bonnes décisions.";
  return "C'est exactement pour ça que ThePerfClub existe — suivi en temps réel, moins de fatigue accumulée, plus d'efficacité.";
}

function DimensionBar({ label, risk, visible }: { label: string; risk: number; visible: boolean }) {
  const fillPct = Math.round((3 - risk) / 3 * 90 + 10);
  const color = riskColor(risk);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: visible ? color : "transparent" }}>
          {RISK_LABELS[risk]}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99, background: color,
          width: visible ? `${fillPct}%` : "0%",
          transition: "width 0.65s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: `0 0 8px ${color}88`,
        }} />
      </div>
    </div>
  );
}

export default function AutoRegScoreStepCoach({ overloadCoachAns, planningCoachAns, fatigueCoachAns, onNext }: Props) {
  const [phase, setPhase] = useState<"loading" | "reveal">("loading");
  const [visibleBars, setVisibleBars] = useState(0);
  const [scoreVisible, setScoreVisible] = useState(false);

  const overloadRisk = toRisk(overloadCoachAns, ["très souvent", "problème récurrent"]);
  const planningRisk = toRisk(planningCoachAns, ["principal frein"]);
  const fatigueRisk  = toRisk(fatigueCoachAns,  ["je préfère maintenir"]);
  const totalRisk    = overloadRisk + planningRisk + fatigueRisk;
  const globalPct    = Math.round(((9 - totalRisk) / 9) * 100);
  const gColor       = globalColor(globalPct);

  useEffect(() => {
    const t = setTimeout(() => setPhase("reveal"), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "reveal") return;
    const t0 = setTimeout(() => setScoreVisible(true), 100);
    const t1 = setTimeout(() => setVisibleBars(1), 500);
    const t2 = setTimeout(() => setVisibleBars(2), 720);
    const t3 = setTimeout(() => setVisibleBars(3), 940);
    return () => [t0, t1, t2, t3].forEach(clearTimeout);
  }, [phase]);

  const ctaBtn: React.CSSProperties = {
    width: "100%", height: 50, borderRadius: 14, border: "none",
    background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
    fontSize: 15, fontWeight: 900, cursor: "pointer",
    boxShadow: "0 8px 20px rgba(212,64,0,.28)", marginTop: 4,
  };

  return (
    <div style={{ padding: "12px 4px", animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#ff6b2b", marginBottom: 20 }}>
        ⚡ Diagnostic d&apos;autorégulation
      </div>

      {phase === "loading" ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>
            Analyse de ton profil coach…
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: "#d44000",
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.7,
              }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Score global */}
          <div style={{
            textAlign: "center", marginBottom: 22,
            opacity: scoreVisible ? 1 : 0,
            transform: scoreVisible ? "scale(1)" : "scale(0.8)",
            transition: "all 0.45s cubic-bezier(0.2,0,0,1)",
          }}>
            <div style={{ fontSize: 64, fontWeight: 950, letterSpacing: "-0.04em", color: gColor, lineHeight: 1 }}>
              {globalPct}%
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.5)", marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Score d'autorégulation
            </div>
          </div>

          {/* Dimensions */}
          <div style={{ marginBottom: 18 }}>
            <DimensionBar label="Maîtrise de l'intensité" risk={overloadRisk} visible={visibleBars >= 1} />
            <DimensionBar label="Efficacité de planification" risk={planningRisk} visible={visibleBars >= 2} />
            <DimensionBar label="Gestion de la fatigue"   risk={fatigueRisk}  visible={visibleBars >= 3} />
          </div>

          {/* Message-pont */}
          <div style={{
            background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "14px 16px",
            marginBottom: 18, fontSize: 13, color: "rgba(255,255,255,.8)", lineHeight: 1.55, fontWeight: 500,
            opacity: visibleBars >= 3 ? 1 : 0, transition: "opacity 0.5s ease 0.3s",
          }}>
            {getBridgeMessage(globalPct)}
          </div>

          <button onClick={onNext} style={{
            ...ctaBtn,
            opacity: visibleBars >= 3 ? 1 : 0, transition: "opacity 0.4s ease 0.5s",
          }}>
            Configurons ton espace coach →
          </button>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.4); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
