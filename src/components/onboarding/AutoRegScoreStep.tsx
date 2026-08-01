"use client";

import { useState, useEffect } from "react";
import Actions from "@/components/onboarding/Actions";

interface Props {
  overloadAns: string;
  planningAns: string;
  fatigueAns:  string;
  frustration: string;
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
   persona, pas par score : le persona est ce qui donne du caractère à l'écran, le score seul
   ("58%") ne suffit pas à le distinguer. */
const PERSONA_EMOJI: Record<string, string> = {
  "Autorégulé confirmé": "🧘",
  "Battant instinctif": "🔥",
  "Volontaire du dépassement": "💪",
  "Improvisateur engagé": "🎲",
};

function pickAthletePersona(overloadRisk: number, planningRisk: number, fatigueRisk: number): { title: string; description: string } {
  const maxRisk = Math.max(overloadRisk, planningRisk, fatigueRisk);
  if (maxRisk === 0) {
    return { title: "Autorégulé confirmé", description: "Tu sais déjà lire ton corps et ajuster tes séances en conséquence. Cette discipline te protège des blessures et te permet de progresser sur la durée, sans à-coups." };
  }
  if (overloadRisk === maxRisk) {
    return { title: "Battant instinctif", description: "Tu avances à l'instinct et tu ne recules devant rien. Cette énergie est une vraie force, mais sans repère extérieur, elle peut te pousser à dépasser ta capacité de récupération réelle sans t'en rendre compte." };
  }
  if (fatigueRisk === maxRisk) {
    return { title: "Volontaire du dépassement", description: "Tu tiens le cap même fatigué, quitte à ignorer les signaux d'alerte de ton corps. Cette ténacité paie à court terme, mais elle use la récupération sur la durée si elle n'est jamais réévaluée." };
  }
  return { title: "Improvisateur engagé", description: "Tu t'entraînes sérieusement mais sans structure fixe, au feeling du jour. Cette souplesse te va bien, mais elle rend difficile de savoir si ta charge progresse vraiment d'une semaine à l'autre." };
}

export function computeAthleteAutoregProfile(overloadAns: string, planningAns: string, fatigueAns: string): AutoregProfile {
  const overloadRisk = toRisk(overloadAns, ["tout le temps", "j'envoie"]);
  const planningRisk = toRisk(planningAns, ["complètement", "entièrement au feeling"]);
  const fatigueRisk  = toRisk(fatigueAns,  ["tout le temps", "quoi qu'il arrive"]);
  return {
    persona: pickAthletePersona(overloadRisk, planningRisk, fatigueRisk),
    dimensions: [
      { label: "Gestion de l'intensité",     riskLabel: RISK_LABELS[overloadRisk], color: riskColor(overloadRisk) },
      { label: "Planification de la charge", riskLabel: RISK_LABELS[planningRisk], color: riskColor(planningRisk) },
      { label: "Récupération",               riskLabel: RISK_LABELS[fatigueRisk],  color: riskColor(fatigueRisk) },
    ],
  };
}

export default function AutoRegScoreStep({ overloadAns, planningAns, fatigueAns, onNext }: Props) {
  const [phase, setPhase] = useState<"loading" | "reveal">("loading");
  const [visibleBars, setVisibleBars] = useState(0);
  const [scoreVisible, setScoreVisible] = useState(false);

  const overloadRisk = toRisk(overloadAns, ["tout le temps", "j'envoie"]);
  const planningRisk = toRisk(planningAns, ["complètement", "entièrement au feeling"]);
  const fatigueRisk  = toRisk(fatigueAns,  ["tout le temps", "quoi qu'il arrive"]);
  const totalRisk    = overloadRisk + planningRisk + fatigueRisk;
  const globalPct    = Math.round(((9 - totalRisk) / 9) * 100);
  const gColor       = globalColor(globalPct);
  const persona      = pickAthletePersona(overloadRisk, planningRisk, fatigueRisk);

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
            Analyse de ton profil…
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
            <DimensionBar label="Gestion de l'intensité"    risk={overloadRisk} visible={visibleBars >= 1} />
            <DimensionBar label="Planification de la charge" risk={planningRisk} visible={visibleBars >= 2} />
            <DimensionBar label="Récupération"               risk={fatigueRisk}  visible={visibleBars >= 3} />
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
            <Actions variant="dark" onNext={onNext} nextLabel="Construisons ton programme →" />
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
