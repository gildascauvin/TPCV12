"use client";

import { useState } from "react";
import { computeWellnessScore } from "@/lib/wellness";

const BEDTIME_OPTIONS = [
  { value: "before22", label: "Avant 22h" },
  { value: "22to23", label: "22h–23h" },
  { value: "23to00", label: "23h–minuit" },
  { value: "00to01", label: "Minuit–1h" },
  { value: "after01", label: "Après 1h" },
];

const BEHAVIORS = [
  { key: "alcohol", emoji: "🍷", label: "Alcool" },
  { key: "late_sleep", emoji: "🌙", label: "Couché tardif" },
  { key: "tobacco", emoji: "🚬", label: "Tabac" },
  { key: "screen_late", emoji: "📱", label: "Écran tard" },
  { key: "heavy_meal", emoji: "🍔", label: "Repas lourd" },
  { key: "caffeine_late", emoji: "☕", label: "Caféine tard" },
  { key: "social_out", emoji: "🎉", label: "Sortie sociale" },
  { key: "travel", emoji: "✈️", label: "Voyage" },
];

const WQ_TOTAL = 5;

interface Props {
  date: string;
  onSave: (data: {
    sleep: number;
    stress: number;
    recovery: number;
    motivation: number;
    behaviors: string[];
    bedtime: string;
    base_score: number;
    score: number;
  }) => Promise<void>;
  onClose: () => void;
}

export default function WellnessModal({ date, onSave, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [sleep, setSleep] = useState(7);
  const [bedtime, setBedtime] = useState("23to00");
  const [stress, setStress] = useState(5);
  const [recovery, setRecovery] = useState(7);
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [motivation, setMotivation] = useState(8);
  const [saving, setSaving] = useState(false);

  function toggleBehavior(key: string) {
    setBehaviors((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSave() {
    setSaving(true);
    const { base_score, score } = computeWellnessScore(sleep, stress, recovery, motivation, behaviors);
    await onSave({ sleep, stress, recovery, motivation, behaviors, bedtime, base_score, score });
    setSaving(false);
  }

  function goNext() {
    if (step < WQ_TOTAL - 1) setStep((s) => s + 1);
    else handleSave();
  }
  function goBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  const penalty = Math.min(behaviors.length * 3, 15);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#f8faf3",
        color: "#172018",
        border: "1px solid rgba(34,54,38,.16)",
        boxShadow: "0 28px 80px rgba(22,32,24,.22)",
        borderRadius: 34,
        padding: 34,
        width: "100%",
        maxWidth: 560,
        animation: "fadeIn 0.14s ease",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: "#172018" }}>
            💓 Wellness du jour
          </div>
          <div style={{ fontSize: 11, color: "#7b7f82" }}>{step + 1} / {WQ_TOTAL}</div>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 3, marginBottom: 24 }}>
          {Array.from({ length: WQ_TOTAL }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "#d44000" : "rgba(0,0,0,0.10)", transition: "background 0.3s" }} />
          ))}
        </div>

        {/* Step 0: Sleep + Bedtime */}
        {step === 0 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              😴 Comment as-tu dormi ?
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Qualité et récupération pendant le sommeil
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={sleep} step={1}
                onChange={(e) => setSleep(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {sleep}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82", marginBottom: 18 }}>
              <span>Très mauvais</span><span>Excellent</span>
            </div>
            {/* Bedtime select */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7b7f82", marginBottom: 6 }}>
                Heure de coucher
              </div>
              <select
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                style={{ width: "100%", background: "#fff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: "10px 14px", fontSize: 14, color: "#172018", fontFamily: "inherit", outline: "none" }}
              >
                {BEDTIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Stress */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              🧠 Niveau de stress mental
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Travail, vie personnelle, charge mentale
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={stress} step={1}
                onChange={(e) => setStress(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {stress}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Zen total</span><span>Très élevé</span>
            </div>
          </div>
        )}

        {/* Step 2: Physical recovery */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              💪 État physique aujourd'hui
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Ressenti musculaire, douleurs, lourdeur
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={recovery} step={1}
                onChange={(e) => setRecovery(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {recovery}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Courbatures sévères</span><span>Frais et dispo</span>
            </div>
          </div>
        )}

        {/* Step 3: Behaviors */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              🔍 Comportements d'hier soir
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Coche tout ce qui s'applique
            </div>
            {behaviors.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 12, background: "rgba(200,30,30,0.08)", border: "0.5px solid rgba(200,30,30,0.22)", color: "#c81e1e" }}>
                ⚠ −{penalty} pts sur le score
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {BEHAVIORS.map((b) => {
                const checked = behaviors.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleBehavior(b.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", borderRadius: 10,
                      border: checked ? "1px solid rgba(200,30,30,0.40)" : "1px solid rgba(0,0,0,0.10)",
                      background: checked ? "rgba(200,30,30,0.08)" : "#fff",
                      color: checked ? "#c81e1e" : "#7b7f82",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", transition: "all 0.14s",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{b.emoji}</span>{b.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Motivation */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 34, fontWeight: 1000, lineHeight: 1.02, letterSpacing: "-0.06em", marginBottom: 6, color: "#172018" }}>
              ⚡ As-tu envie de t'entraîner ?
            </div>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#7b7f82", marginBottom: 18 }}>
              Motivation intrinsèque du moment
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <input type="range" min={1} max={10} value={motivation} step={1}
                onChange={(e) => setMotivation(Number(e.target.value))}
                style={{ flex: 1, height: 34, accentColor: "#d44000" }} />
              <div style={{ fontSize: 38, fontWeight: 1000, color: "#d44000", minWidth: 48, textAlign: "center", lineHeight: 1 }}>
                {motivation}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7b7f82" }}>
              <span>Pas du tout</span><span>Au max</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          {step > 0 ? (
            <button
              onClick={goBack}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#172018", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              ← Retour
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.12)", background: "#fff", color: "#7b7f82", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Annuler
            </button>
          )}
          <button
            onClick={goNext}
            disabled={saving}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "13px 16px", borderRadius: 14, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.20)" }}
          >
            {saving ? "..." : step === WQ_TOTAL - 1 ? "Valider ✓" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
