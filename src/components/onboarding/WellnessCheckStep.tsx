"use client";

import { useRef, useState } from "react";
import Actions from "@/components/onboarding/Actions";
import { SessionTemplateCard } from "@/components/programs/ProgramBuilderModal";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import type { SessionTemplate } from "@/types";

/* Écran "Ta forme" — montre la carte wellness enrichie + UN exemple de séance (jamais de Coach
   Control ici, même pour le coach — voir DecisionStep.tsx, écran suivant). `demoSession` vient
   d'OnboardingFlow (calculé une seule fois, partagé avec DecisionStep — voir sa doc "pickHardest")
   pour garantir EXACTEMENT la même séance sur les deux écrans, jamais une sélection locale
   divergente.

   Animation de fusion (2026-08-17, 4e itération) — reprend littéralement le mécanisme du
   prototype `theperfclub_onboarding_v3.html` (playWellnessIntegration()) : mesure les positions
   réelles (getBoundingClientRect) de la carte wellness et de la carte séance, anime un
   translate+scale de l'une vers l'autre en mutant directement le style du DOM (comme le
   prototype — plus fiable pour une animation ponctuelle non-répétée qu'un état React), puis
   n'appelle onNext() qu'une fois l'animation terminée. Les deux cartes vivent dans CE composant
   (contrairement à un essai précédent qui utilisait un écran de transition séparé, approximatif) —
   la vraie fusion physique n'est possible qu'entre deux éléments réellement présents dans le même
   DOM au même moment. */

type Role = "athlete" | "coach";

// Mix volontaire négatif/positif (2 chacun) — mêmes clés réelles que BEHAVIOR_META, jamais inventées.
const FORCED_BEHAVIORS = ["screen_late", "alcohol", "stretching", "cold_shower"];

interface Props {
  demoSession: SessionTemplate | null;
  role: Role;
  frise?: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
}

export default function WellnessCheckStep({ demoSession: hardest, role, frise, onNext, onBack }: Props) {
  const { isMd, isLg } = useBreakpoint();
  const heroMaxWidth = isLg ? 720 : isMd ? 640 : 560;
  const wellnessRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [merging, setMerging] = useState(false);

  function handleCTA() {
    if (merging) return;
    const card = wellnessRef.current;
    const target = targetRef.current;
    if (card && target) {
      const cardRect = card.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const toX = (targetRect.left + targetRect.width / 2) - (cardRect.left + cardRect.width / 2);
      const toY = (targetRect.top + targetRect.height / 2) - (cardRect.top + cardRect.height / 2);
      setMerging(true);
      card.style.transition = "transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease";
      card.style.transform = `translate(${toX}px, ${toY}px) scale(.22)`;
      card.style.opacity = "0";
      setTimeout(onNext, 520);
    } else {
      onNext();
    }
  }

  const heroBlock = (
    <div style={{
      background: "#141414", width: "100vw", position: "relative", left: "50%", right: "50%",
      marginLeft: "-50vw", marginRight: "-50vw", marginTop: -36, paddingTop: 24, paddingBottom: 20,
    }}>
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: "0 20px" }}>
        {frise}
        <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: "-0.04em", marginBottom: 4, color: "#fff" }}>
          {role === "coach" ? "La forme de tes sportifs compte autant que le programme." : "Ta forme compte autant que le programme."}
        </div>
        {/* Wording "problème" (2026-08-17, raccourci après retour de Gildas — "c'est trop long") —
            constat resserré à l'essentiel : sommeil/stress/courbatures, jamais pris en compte par
            un programme figé. */}
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.45 }}>
          {role === "coach"
            ? "Un programme figé ne tient jamais compte de la forme réelle de tes sportifs (sommeil, stress, courbatures)."
            : "Un programme figé ne tient jamais compte de ta forme réelle (sommeil, stress, courbatures)."}
        </div>
      </div>
    </div>
  );

  if (!hardest) {
    return (
      <div>
        {heroBlock}
        <div style={{ padding: "24px 20px", textAlign: "center", color: "#8a8f94", fontSize: 13 }}>Chargement…</div>
        <Actions onNext={onNext} onBack={onBack} nextLabel="Continuer →" nextDisabled />
      </div>
    );
  }

  return (
    <div>
      {heroBlock}
      <div style={{ maxWidth: heroMaxWidth, margin: "0 auto", padding: isMd ? "20px 24px 0" : "18px 16px 0" }}>
        <div ref={wellnessRef} style={{ position: "relative", zIndex: 2 }}>
          <WellnessCard athleteName={role === "coach" ? "Thomas" : undefined} />
        </div>
        <div ref={targetRef} style={{ marginTop: 14 }}>
          <SessionTemplateCard session={hardest} />
        </div>
      </div>
      <Actions onNext={handleCTA} onBack={onBack} nextLabel={role === "coach" ? "Voir les décisions →" : "Voir l'ajustement →"} />
    </div>
  );
}

function WellnessCard({ athleteName }: { athleteName?: string }) {
  return (
    <div style={{
      width: 260, margin: "0 auto", background: "linear-gradient(155deg,#1a1a1a,#282828)", borderRadius: 18,
      padding: "16px 17px", color: "#fff", boxShadow: "0 14px 30px rgba(0,0,0,.28)",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,.55)", marginBottom: 9 }}>
        {athleteName ? `Forme de ${athleteName}` : "Ta forme"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, marginBottom: 12 }}>
        <MetricRow label="😴 Sommeil" value="Mauvais" />
        <MetricRow label="🧠 Stress" value="Élevé" />
        <MetricRow label="💪 Courbatures" value="Fortes" />
        <MetricRow label="🔋 Fatigue" value="Élevée" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {FORCED_BEHAVIORS.map(key => {
          const meta = BEHAVIOR_META[key];
          if (!meta) return null;
          return (
            <div key={key} style={{
              fontSize: 10.5, fontWeight: 700, padding: "5px 8px", borderRadius: 999, textAlign: "center",
              background: meta.positive ? "rgba(47,158,68,.18)" : "rgba(212,64,0,.22)",
              color: meta.positive ? "#bfeec8" : "#ffd2bf",
            }}>
              {meta.emoji} {meta.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 5, borderTop: "1px dashed rgba(255,255,255,.15)" }}>
      <span style={{ color: "rgba(255,255,255,.7)" }}>{label}</span>
      <b style={{ color: "#ffb27a" }}>{value}</b>
    </div>
  );
}
