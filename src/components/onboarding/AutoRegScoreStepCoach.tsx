"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";

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

export interface AutoregProfile {
  persona: { title: string; description: string };
  dimensions: { label: string; riskLabel: string; color: string }[];
}

/* Emoji du badge flottant sur la jauge (2026-07-31, cf. POC restructuration funnel) — un par
   persona, cohérent avec PERSONA_EMOJI d'AutoRegScoreStep.tsx côté sportif. */
const PERSONA_EMOJI: Record<string, string> = {
  "Coach data-driven": "📊",
  "Coach du volume": "🔥",
  "Coach exigeant": "🎯",
  "Coach terrain": "🧭",
};

function pickCoachPersona(overloadRisk: number, planningRisk: number, fatigueRisk: number): { title: string; description: string } {
  const maxRisk = Math.max(overloadRisk, planningRisk, fatigueRisk);
  if (maxRisk === 0) {
    return { title: "Coach data-driven", description: "Tu suis déjà tes sportifs de près et tu ajustes en fonction de ce que tu observes. Cette rigueur limite le risque de blessure et construit la confiance de ton groupe sur la durée." };
  }
  if (overloadRisk === maxRisk) {
    return { title: "Coach du volume", description: "Tu pousses le collectif fort, quitte à ce que certains dépassent leurs limites sans que tu le voies venir. Sans donnée individuelle, ce risque reste invisible jusqu'à ce qu'une blessure ou une contre-performance le révèle." };
  }
  if (fatigueRisk === maxRisk) {
    return { title: "Coach exigeant", description: "Tu maintiens l'intensité même quand la fatigue s'accumule dans le groupe. Cette exigence porte ses fruits à court terme, mais elle demande de savoir précisément qui récupère bien et qui commence à s'épuiser." };
  }
  return { title: "Coach terrain", description: "Tu gères au feeling, séance après séance, sans grille figée. Cette adaptabilité est une vraie qualité, mais elle rend difficile de repérer les tendances qui se jouent sur plusieurs semaines." };
}

export function computeCoachAutoregProfile(overloadCoachAns: string, planningCoachAns: string, fatigueCoachAns: string): AutoregProfile {
  const overloadRisk = toRisk(overloadCoachAns, ["très souvent", "problème récurrent"]);
  const planningRisk = toRisk(planningCoachAns, ["principal frein"]);
  const fatigueRisk  = toRisk(fatigueCoachAns,  ["je préfère maintenir"]);
  return {
    persona: pickCoachPersona(overloadRisk, planningRisk, fatigueRisk),
    dimensions: [
      { label: "Maîtrise de l'intensité",      riskLabel: RISK_LABELS[overloadRisk], color: riskColor(overloadRisk) },
      { label: "Efficacité de planification",  riskLabel: RISK_LABELS[planningRisk], color: riskColor(planningRisk) },
      { label: "Gestion de la fatigue",        riskLabel: RISK_LABELS[fatigueRisk],  color: riskColor(fatigueRisk) },
    ],
  };
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
  const persona      = pickCoachPersona(overloadRisk, planningRisk, fatigueRisk);

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
          {/* Jauge circulaire + emoji persona (2026-07-31, remplace le score plat + badge fixe) */}
          <div style={{
            display: "flex", justifyContent: "center", marginBottom: 18,
            opacity: scoreVisible ? 1 : 0,
            transform: scoreVisible ? "scale(1)" : "scale(0.8)",
            transition: "all 0.45s cubic-bezier(0.2,0,0,1)",
          }}>
            <div style={{ position: "relative", width: 168, height: 168 }}>
              <svg width={168} height={168} viewBox="0 0 168 168" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={84} cy={84} r={72} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={14} />
                <circle
                  cx={84} cy={84} r={72} fill="none" stroke={gColor} strokeWidth={14} strokeLinecap="round"
                  strokeDasharray={452.4} strokeDashoffset={452.4 * (1 - globalPct / 100)}
                  style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2,0,0,1)" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 42, fontWeight: 950, letterSpacing: "-0.04em", color: gColor, lineHeight: 1 }}>{globalPct}%</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,.5)", marginTop: 3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Autorégulation</div>
              </div>
              <div style={{ position: "absolute", top: -6, right: -6, width: 46, height: 46, borderRadius: "50%", background: "#1c1c1c", border: "3px solid #111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 10px rgba(0,0,0,.35)" }}>
                {PERSONA_EMOJI[persona.title] || "⚡"}
              </div>
            </div>
          </div>

          {/* Profil comportemental */}
          <div style={{
            textAlign: "center", opacity: scoreVisible ? 1 : 0, transition: "opacity 0.4s ease 0.15s", marginBottom: 20,
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,157,110,.14)", border: "1px solid rgba(255,157,110,.3)", color: "#ff9d6e", fontSize: 13, fontWeight: 800, padding: "8px 16px", borderRadius: 999 }}>
              Ton profil : {persona.title}
            </span>
          </div>

          {/* Dimensions */}
          <div style={{ marginBottom: 18 }}>
            <DimensionBar label="Maîtrise de l'intensité" risk={overloadRisk} visible={visibleBars >= 1} />
            <DimensionBar label="Efficacité de planification" risk={planningRisk} visible={visibleBars >= 2} />
            <DimensionBar label="Gestion de la fatigue"   risk={fatigueRisk}  visible={visibleBars >= 3} />
          </div>

          {/* Description du profil d'autorégulation */}
          <div style={{
            background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "14px 16px",
            marginBottom: 18, fontSize: 13, color: "rgba(255,255,255,.8)", lineHeight: 1.55, fontWeight: 500,
            opacity: visibleBars >= 3 ? 1 : 0, transition: "opacity 0.5s ease 0.3s",
          }}>
            {persona.description}
          </div>

          <div style={{ opacity: visibleBars >= 3 ? 1 : 0, transition: "opacity 0.4s ease 0.5s" }}>
            <Actions variant="dark" onNext={onNext} nextLabel="Configurons ton espace coach →" />
          </div>
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
