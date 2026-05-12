"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Objective } from "@/types";

const SPORTS = [
  "Course à pied", "Cyclisme", "Natation", "Triathlon", "Musculation",
  "CrossFit", "Tennis", "Football", "Basketball", "Rugby",
  "Arts martiaux", "Yoga", "Escalade", "Randonnée", "Autre",
];

const OBJECTIVES: { id: Objective; icon: string; title: string; sub: string }[] = [
  { id: "performance", icon: "🏆", title: "Performance", sub: "Améliorer mes résultats compétitifs" },
  { id: "longevite", icon: "🌱", title: "Longévité", sub: "Rester actif et en bonne santé" },
  { id: "stress", icon: "🧘", title: "Anti-stress", sub: "Utiliser le sport pour décompresser" },
  { id: "composition", icon: "💪", title: "Composition", sub: "Perte de poids / prise de muscle" },
  { id: "equilibre", icon: "⚖️", title: "Équilibre", sub: "Trouver le bon équilibre vie/sport" },
  { id: "rehab", icon: "🩹", title: "Réhabilitation", sub: "Reprendre après une blessure" },
];

const FREQ_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

interface OnboardingFlowProps {
  userId: string;
}

export default function OnboardingFlow({ userId }: OnboardingFlowProps) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [objective, setObjective] = useState<Objective | null>(null);
  const [freq, setFreq] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const totalSteps = 4;

  async function handleFinish() {
    if (!name || !sport || !objective || !freq) return;
    setSaving(true);
    await supabase.from("profiles").update({
      name,
      sport,
      objective,
      freq_target: freq,
      onboarding_done: true,
    }).eq("user_id", userId);
    router.push("/today");
    router.refresh();
    setSaving(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-[22px]"
      style={{ background: "#f1f1f1" }}
    >
      <div
        className="w-full max-w-[360px] rounded-[18px] p-6"
        style={{
          background: "rgba(255,255,255,0.72)",
          border: "1px solid rgba(0,0,0,0.12)",
          boxShadow: "0 22px 70px rgba(0,0,0,0.18)",
        }}
      >
        {/* Progress */}
        <div className="flex gap-1 mb-[18px]">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-[3px] rounded-[2px] transition-colors duration-300"
              style={{ background: i <= step ? "#d44000" : "rgba(0,0,0,0.1)" }}
            />
          ))}
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div>
            <h2 className="text-[19px] font-semibold text-text mb-1">Bienvenue sur ThePerfClub 👋</h2>
            <p className="text-[13px] text-muted mb-4 leading-snug">
              Commence par te présenter pour personnaliser ton expérience.
            </p>
            <label className="text-[11px] text-muted mb-1 block">Ton prénom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Alex"
              className="w-full bg-white border border-black/10 rounded-[10px] px-3 py-2.5 text-sm text-text mb-4"
              autoFocus
            />
            <button
              onClick={() => setStep(1)}
              disabled={!name.trim()}
              className="btn-primary w-full"
            >
              Continuer
            </button>
          </div>
        )}

        {/* Step 1: Sport */}
        {step === 1 && (
          <div>
            <h2 className="text-[19px] font-semibold text-text mb-1">Ton sport principal</h2>
            <p className="text-[13px] text-muted mb-4 leading-snug">
              Quel sport pratiques-tu principalement ?
            </p>
            <div className="flex flex-wrap gap-[5px] mb-4 max-h-[40vh] overflow-y-auto pr-1">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSport(s)}
                  className={cn(
                    "px-[11px] py-[5px] rounded-full border text-[12px] transition-all",
                    sport === s
                      ? "border-accent bg-accent/8 text-accent"
                      : "border-black/10 text-muted hover:text-text"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className="btn-secondary flex-1">Retour</button>
              <button
                onClick={() => setStep(2)}
                disabled={!sport}
                className="btn-primary flex-1"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Objective */}
        {step === 2 && (
          <div>
            <h2 className="text-[19px] font-semibold text-text mb-1">Ton objectif</h2>
            <p className="text-[13px] text-muted mb-4 leading-snug">
              Qu'est-ce qui te motive à t'entraîner ?
            </p>
            <div className="grid grid-cols-2 gap-[7px] mb-4">
              {OBJECTIVES.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setObjective(o.id)}
                  className={cn(
                    "p-[10px] rounded-[10px] border text-left transition-all",
                    objective === o.id
                      ? "border-accent bg-accent/8"
                      : "border-black/10 bg-white/58 hover:border-accent/35"
                  )}
                >
                  <div className="text-[19px] mb-[3px]">{o.icon}</div>
                  <div className={cn("text-[11px] font-bold mb-[2px]", objective === o.id ? "text-accent" : "text-text")}>
                    {o.title}
                  </div>
                  <div className="text-[10px] text-muted leading-snug">{o.sub}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">Retour</button>
              <button
                onClick={() => setStep(3)}
                disabled={!objective}
                className="btn-primary flex-1"
              >
                Continuer
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Frequency */}
        {step === 3 && (
          <div>
            <h2 className="text-[19px] font-semibold text-text mb-1">Fréquence cible</h2>
            <p className="text-[13px] text-muted mb-1 leading-snug">
              Combien de séances par semaine vises-tu ?
            </p>
            <p className="text-[11px] text-muted mb-4">Tu pourras modifier ça plus tard.</p>
            <div className="grid grid-cols-7 gap-[5px] mb-4">
              {FREQ_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={cn(
                    "border rounded-[9px] py-2 text-center text-[11px] font-black transition-all",
                    freq === f
                      ? "bg-accent text-white border-accent"
                      : "bg-white/58 border-black/13 text-text hover:border-accent/40"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mb-4">jour{freq && freq > 1 ? "s" : ""}/semaine</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1">Retour</button>
              <button
                onClick={handleFinish}
                disabled={!freq || saving}
                className="btn-primary flex-1"
              >
                {saving ? "..." : "Commencer 🚀"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
