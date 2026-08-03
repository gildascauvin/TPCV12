"use client";

import { useState } from "react";
import type { ProgramTemplate, ProgramLevel, ProgramFocus } from "@/types";

const SPORTS = ["Haltérophilie", "Sprint/Athlétisme", "Force/Powerlifting", "Course à pied/Endurance", "Sports collectifs", "Fitness/Forme", "Combat/Arts martiaux", "Autre"];
const FOCUSES: { value: ProgramFocus; label: string }[] = [
  { value: "mixte", label: "Mixte équilibré" },
  { value: "technique", label: "Développement technique" },
  { value: "volume", label: "Construction volume" },
  { value: "intensite", label: "Pic d'intensité" },
  { value: "competition", label: "Prépa compétition" },
  { value: "combat", label: "Prépa combat" },
  { value: "autre", label: "Autre" },
];
const LEVELS: { value: ProgramLevel; label: string; sub: string; icon: string }[] = [
  { value: "debutant", label: "Débutant", sub: "< 1 an", icon: "🌱" },
  { value: "intermediaire", label: "Intermédiaire", sub: "1–3 ans", icon: "⚡" },
  { value: "avance", label: "Avancé", sub: "3–6 ans", icon: "🔥" },
  { value: "elite", label: "Élite", sub: "Compétiteur", icon: "🏆" },
];
const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
// Toujours un multiple de 4 semaines — aligné sur les blocs de périodisation
// MEV/Surcharge/MRV/Deload du générateur (voir generate/route.ts).
const DURATIONS = [4, 8, 12] as const;

export interface ProgramMeta {
  sport: string;
  level: ProgramLevel;
  focus: ProgramFocus;
  days: string[];
  duration: 4 | 8 | 12;
}

interface Props {
  onClose: () => void;
  onGenerate: (template: ProgramTemplate, meta: ProgramMeta) => void;
}

export default function ProgramCriteriaModal({ onClose, onGenerate }: Props) {
  const [sport, setSport] = useState("");
  const [focus, setFocus] = useState<ProgramFocus | "">("");
  const [level, setLevel] = useState<ProgramLevel | "">("");
  const [days, setDays] = useState<string[]>(["Lun", "Mer", "Ven"]);
  const [duration, setDuration] = useState<4 | 8 | 12>(8);
  const [loading, setLoading] = useState(false);

  function toggleDay(d: string) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const canSubmit = focus && level && days.length > 0;

  async function handleGenerate() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/programs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, level, days, duration, focus }),
      });
      if (!res.ok) return;
      const { template } = await res.json();
      const meta: ProgramMeta = { sport, level: level as ProgramLevel, focus: focus as ProgramFocus, days, duration };
      onGenerate(template, meta);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2147483100, padding: 18, overflow: "hidden",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 30, padding: "28px 28px 0",
        width: "100%", maxWidth: 520, maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 42px 120px rgba(0,0,0,.34)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.03em" }}>Créer un programme</div>
            <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 2 }}>Remplis les critères — généré en un clic</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8a8f94", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingBottom: 8 }}>
          {/* Sport */}
          <Section label="🏋️ Sport">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPORTS.map(s => (
                <Pill key={s} active={sport === s} onClick={() => setSport(s === sport ? "" : s)}>{s}</Pill>
              ))}
            </div>
          </Section>

          {/* Objectif */}
          <Section label="🎯 Objectif principal">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FOCUSES.map(f => (
                <Pill key={f.value} active={focus === f.value} onClick={() => setFocus(focus === f.value ? "" : f.value)}>{f.label}</Pill>
              ))}
            </div>
          </Section>

          {/* Niveau */}
          <Section label="📊 Niveau">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
              {LEVELS.map(l => (
                <button
                  key={l.value}
                  onClick={() => setLevel(level === l.value ? "" : l.value)}
                  style={{
                    padding: "12px 5px", borderRadius: 13, cursor: "pointer", textAlign: "center",
                    border: level === l.value ? "2px solid #d44000" : "2px solid rgba(0,0,0,0.08)",
                    background: level === l.value ? "rgba(212,64,0,0.10)" : "#fff",
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{l.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: level === l.value ? "#d44000" : "#8a8f94" }}>{l.label}</div>
                  <div style={{ fontSize: 10, color: "#8a8f94", marginTop: 1 }}>{l.sub}</div>
                </button>
              ))}
            </div>
          </Section>

          {/* Jours */}
          <Section label={`📅 Jours d'entraînement`}>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {WEEK_DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
                    border: days.includes(d) ? "2px solid #d44000" : "2px solid rgba(0,0,0,0.08)",
                    background: days.includes(d) ? "#d44000" : "#fff",
                    color: days.includes(d) ? "#fff" : "#8a8f94",
                    fontWeight: 800, fontSize: 11,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#8a8f94" }}>{days.length} séance{days.length !== 1 ? "s" : ""} par semaine</p>
          </Section>

          {/* Durée */}
          <Section label="🗓 Durée du cycle">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DURATIONS.map(d => (
                <Pill key={d} active={duration === d} onClick={() => setDuration(d)}>{d} semaines</Pill>
              ))}
            </div>
          </Section>
        </div>

        {/* Sticky action */}
        <div style={{
          position: "sticky", bottom: 0, margin: "16px -28px 0",
          padding: "14px 28px 20px",
          background: "linear-gradient(180deg,rgba(255,255,255,.88),#fff 38%)",
        }}>
          <button
            onClick={handleGenerate}
            disabled={!canSubmit || loading}
            style={{
              width: "100%", padding: "15px", borderRadius: 14, border: "none",
              cursor: canSubmit && !loading ? "pointer" : "not-allowed",
              background: canSubmit && !loading ? "linear-gradient(180deg,#f04a08,#d44000)" : "#e8e4df",
              color: canSubmit && !loading ? "#fff" : "#aaa",
              fontWeight: 900, fontSize: 15, letterSpacing: ".01em",
              boxShadow: canSubmit && !loading ? "0 6px 20px rgba(212,64,0,.28)" : "none",
            }}
          >
            {loading ? "Génération…" : "Générer le programme →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 18, padding: 20, marginBottom: 10, border: "1px solid rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 20, cursor: "pointer",
        border: active ? "2px solid #d44000" : "2px solid rgba(0,0,0,0.08)",
        background: active ? "rgba(212,64,0,0.10)" : "#fff",
        color: active ? "#d44000" : "#8a8f94",
        fontWeight: 600, fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
