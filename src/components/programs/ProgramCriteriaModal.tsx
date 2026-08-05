"use client";

import { useState } from "react";
import type { ProgramTemplate, ProgramLevel, ProgramFocus } from "@/types";

// Wording/icônes repris du POC (theperfclub_poc_onboarding_program_fields_v1.html, SPORT_META) —
// "Musculation / Force" du POC reste ici volontairement splitté en 2 cartes (Powerlifting +
// Musculation/Hypertrophie) plutôt que fusionné à l'identique : la fusion du POC route TOUJOURS
// vers powerlifting côté backend (getSportCategory() vérifie "hypertroph" AVANT "power"/"force",
// mais "Musculation / Force" ne contient pas "hypertroph") — fusionner ferait perdre l'accès au
// curriculum musculation (split Jambes/Dos/Pectoraux/Épaules/Bras) depuis cet écran, une
// régression sur un fix explicite fait plus tôt dans ce même chantier (le curriculum musculation
// était "invisible/impossible à tester depuis l'UI in-app" avant d'avoir sa propre entrée ici).
const SPORT_META: { value: string; icon: string; label: string; sub: string }[] = [
  { value: "Haltérophilie", icon: "🏋️", label: "Haltérophilie", sub: "Arraché, épaulé-jeté" },
  { value: "Powerlifting", icon: "🦍", label: "Powerlifting", sub: "Squat, développé couché, soulevé de terre" },
  { value: "Musculation / Hypertrophie", icon: "💪", label: "Musculation / Hypertrophie", sub: "Prise de masse, split par groupe musculaire" },
  { value: "Fitness / CrossFit", icon: "🔥", label: "Fitness / CrossFit", sub: "Conditionnement croisé" },
  { value: "Athlétisme & vitesse", icon: "🏃", label: "Athlétisme & vitesse", sub: "Sprint, demi-fond…" },
  { value: "Sports collectifs", icon: "⚽", label: "Sports collectifs", sub: "Foot, rugby, hand…" },
  { value: "Endurance", icon: "🏊", label: "Endurance", sub: "Course, trail, natation, vélo…" },
  { value: "Arts martiaux & combat", icon: "🥋", label: "Arts martiaux & combat", sub: "MMA, boxe, judo…" },
  { value: "Autre", icon: "✨", label: "Autre", sub: "Précise ton sport" },
];

// Clés partagées avec WEAKNESS_META/WEAKNESS_ARCHETYPE_L1 côté generate/route.ts — biaise la
// génération sur 2 niveaux (voir route.ts pour le détail) : jamais juste décoratif.
const WEAKNESSES_BY_SPORT: Record<string, { key: string; label: string }[]> = {
  "Haltérophilie": [
    { key: "arrache", label: "Technique arraché" },
    { key: "epaule_jete", label: "Technique épaulé-jeté" },
    { key: "mobilite", label: "Mobilité hanches/chevilles" },
    { key: "explosivite", label: "Explosivité" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Powerlifting": [
    { key: "jambes", label: "Jambes" },
    { key: "dos_bras", label: "Dos & bras" },
    { key: "pecs_epaules", label: "Pectoraux & épaules" },
    { key: "technique", label: "Technique de mouvement" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Musculation / Hypertrophie": [
    { key: "jambes", label: "Jambes" },
    { key: "dos", label: "Dos" },
    { key: "pectoraux", label: "Pectoraux" },
    { key: "epaules", label: "Épaules" },
    { key: "bras", label: "Bras" },
  ],
  "Athlétisme & vitesse": [
    { key: "vitesse", label: "Vitesse pure" },
    { key: "endurance_vitesse", label: "Endurance de vitesse" },
    { key: "explosivite", label: "Explosivité" },
    { key: "technique_course", label: "Technique de course" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Endurance": [
    { key: "vitesse", label: "Vitesse" },
    { key: "endurance_fond", label: "Endurance de fond" },
    { key: "explosivite", label: "Explosivité" },
    { key: "technique_course", label: "Technique de course" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Sports collectifs": [
    { key: "puissance", label: "Puissance" },
    { key: "vitesse", label: "Vitesse" },
    { key: "explosivite", label: "Explosivité" },
    { key: "gainage", label: "Gainage / contact" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Fitness / CrossFit": [
    { key: "cardio", label: "Endurance cardio" },
    { key: "force_generale", label: "Force générale" },
    { key: "technique", label: "Technique des mouvements" },
    { key: "explosivite", label: "Explosivité" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Arts martiaux & combat": [
    { key: "frappe", label: "Puissance de frappe" },
    { key: "cardio", label: "Endurance cardio" },
    { key: "explosivite", label: "Explosivité" },
    { key: "gainage", label: "Gainage" },
    { key: "recuperation", label: "Récupération" },
  ],
  "Autre": [
    { key: "force_generale", label: "Force générale" },
    { key: "cardio", label: "Endurance cardio" },
    { key: "technique", label: "Technique" },
    { key: "recuperation", label: "Récupération" },
  ],
};

// Wording/icônes repris du POC (FOCUS_META) — pilote réellement ProgramFocus (shapeForCycle),
// pas juste une étiquette narrative. "technique"/"combat"/"autre" (ProgramFocus valides mais pas
// exposés ici) restent accessibles uniquement en modifiant le state directement si besoin futur.
const FOCUS_META: { value: ProgramFocus; icon: string; label: string }[] = [
  { value: "volume", icon: "📈", label: "Augmenter mon volume d'entraînement" },
  { value: "intensite", icon: "🔥", label: "Progresser en intensité" },
  { value: "competition", icon: "🎯", label: "Préparer une échéance précise" },
  { value: "mixte", icon: "⚖️", label: "Un peu de tout, rester régulier" },
];

// Niveau retiré (2026-08-05, même décision que le POC) : `baseDiff` démarre sur une ancre neutre
// fixe (6/10 = "intermédiaire") pour tout le monde plutôt qu'un niveau auto-déclaré peu fiable —
// l'ajustement individuel réel viendrait de l'autorégulation/wellness, pas d'une étiquette.
const NEUTRAL_LEVEL: ProgramLevel = "intermediaire";

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
  const [days, setDays] = useState<string[]>(["Lun", "Mer", "Ven"]);
  const [duration, setDuration] = useState<4 | 8 | 12>(8);
  const [weaknesses, setWeaknesses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function selectSport(s: string) {
    const next = s === sport ? "" : s;
    setSport(next);
    setWeaknesses([]); // les clés de faiblesses sont spécifiques au sport précédent, plus valides
  }

  function toggleWeakness(key: string) {
    setWeaknesses(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : prev.length >= 2 ? prev : [...prev, key]
    );
  }

  function toggleDay(d: string) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  const canSubmit = focus && days.length > 0;

  async function handleGenerate() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await fetch("/api/programs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, level: NEUTRAL_LEVEL, days, duration, focus, weaknesses }),
      });
      if (!res.ok) return;
      const { template } = await res.json();
      const meta: ProgramMeta = { sport, level: NEUTRAL_LEVEL, focus: focus as ProgramFocus, days, duration };
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
          {/* Sport — chips compactes comme le POC (icône inline, pas de carte haute) */}
          <Section label="🏋️ Sport">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SPORT_META.map(s => (
                <Pill key={s.value} active={sport === s.value} onClick={() => selectSport(s.value)} title={s.sub}>
                  {s.icon} {s.label}
                </Pill>
              ))}
            </div>
          </Section>

          {/* Faiblesses — biaise réellement la génération, voir generate/route.ts */}
          {sport && (
            <Section label="🎯 Points à travailler en priorité">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                {WEAKNESSES_BY_SPORT[sport].map(w => (
                  <Pill key={w.key} active={weaknesses.includes(w.key)} onClick={() => toggleWeakness(w.key)}>{w.label}</Pill>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#8a8f94" }}>Jusqu&apos;à 2 priorités — optionnel.</p>
            </Section>
          )}

          {/* Objectif du bloc */}
          <Section label="🎯 Objectif du bloc">
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {FOCUS_META.map(f => (
                <FocusCard key={f.value} active={focus === f.value} icon={f.icon} label={f.label} onClick={() => setFocus(focus === f.value ? "" : f.value)} />
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

function Pill({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
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

function FocusCard({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        padding: "12px 14px", borderRadius: 14, cursor: "pointer",
        border: active ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,.10)",
        background: active ? "rgba(212,64,0,.05)" : "#fff",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: active ? "#d44000" : "#1f2428" }}>{label}</span>
    </button>
  );
}
