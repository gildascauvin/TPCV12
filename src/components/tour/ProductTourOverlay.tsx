"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import PrimingJourneyModal from "@/components/paywall/PrimingJourneyModal";
import PaywallModal from "@/components/paywall/PaywallModal";

interface TourStep {
  page: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const ATHLETE_STEPS: TourStep[] = [
  {
    page: "/today",
    emoji: "🏃",
    title: "Entraîne-toi au bon moment",
    subtitle: "Ton wellness oriente l'intensité du jour. Plus de surmenage, plus de séances ratées.",
  },
  {
    page: "/week",
    emoji: "📅",
    title: "Une semaine construite sur mesure",
    subtitle: "Séances ajustées à ton profil. Modifie, ajoute, ou laisse telle quelle.",
  },
  {
    page: "/conseils",
    emoji: "📊",
    title: "Découvre ce qui fait vraiment la différence",
    subtitle: "Sommeil, stress, comportements — vois l'impact réel sur tes perfs, en chiffres.",
  },
];

const COACH_STEPS: TourStep[] = [
  {
    page: "/coach",
    emoji: "👥",
    title: "Sache exactement qui surveiller",
    subtitle: "Wellness croisé avec la charge prévue. Identifie d'un coup d'œil qui peut pousser et qui doit lever le pied.",
  },
  {
    page: "/coach/planning",
    emoji: "📋",
    title: "Plus de temps à coacher, moins à planifier",
    subtitle: "Génère une prog IA ou pars d'un template. Assigne en un clic.",
  },
  {
    page: "/coach/athletes",
    emoji: "🎯",
    title: "Prêt à suivre de vrais sportifs",
    subtitle: "Débloque l'accès pour inviter ton équipe et activer le suivi en temps réel.",
  },
];

interface Props {
  role: "athlete" | "coach";
  hasCoach: boolean;
}

export default function ProductTourOverlay({ role, hasCoach }: Props) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [paywallStage, setPaywallStage] = useState<"none" | "journey" | "paywall">("none");
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");

  const steps = role === "coach" ? COACH_STEPS : ATHLETE_STEPS;
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  /* Add tour-active class to body for the duration of the tour */
  useEffect(() => {
    document.body.classList.add("tour-active");
    return () => document.body.classList.remove("tour-active");
  }, []);

  useEffect(() => {
    router.push(steps[0].page);
    posthog.capture("tour_step_viewed", { step: 1, role, page: steps[0].page });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Block clicks on the page but allow scroll */
  useEffect(() => {
    if (paywallStage !== "none") return;

    const block = (e: MouseEvent | TouchEvent) => {
      if (sheetRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener("click", block, { capture: true });
    document.addEventListener("touchend", block, { capture: true, passive: false });
    return () => {
      document.removeEventListener("click", block, { capture: true });
      document.removeEventListener("touchend", block, { capture: true });
    };
  }, [paywallStage]);

  function handleNext() {
    if (isLast) {
      posthog.capture("tour_completed", { role });
      setPaywallStage("journey");
    } else {
      const next = stepIndex + 1;
      setStepIndex(next);
      router.push(steps[next].page);
      posthog.capture("tour_step_viewed", { step: next + 1, role, page: steps[next].page });
    }
  }

  if (paywallStage === "journey") {
    return (
      <PrimingJourneyModal
        mode={role}
        billing={billing}
        setBilling={setBilling}
        allowDismiss={hasCoach}
        onContinue={() => setPaywallStage("paywall")}
        onDismiss={() => setPaywallStage("none")}
      />
    );
  }

  if (paywallStage === "paywall") {
    return (
      <PaywallModal
        mode={role}
        allowDismiss={hasCoach}
        initialBilling={billing}
        onClose={() => setPaywallStage("journey")}
        onSuccess={() => {
          window.location.href = role === "coach" ? "/coach?welcome=1" : "/today?welcome=1";
        }}
      />
    );
  }

  return (
    <div
      ref={sheetRef}
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        zIndex: 2147483001,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "24px 24px 0 0",
        padding: "14px 20px 32px",
        boxShadow: "0 -8px 32px rgba(0,0,0,.13)",
        borderTop: "1px solid rgba(0,0,0,.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 12 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === stepIndex ? 18 : 6,
            height: 6, borderRadius: 999,
            background: i === stepIndex ? "#d44000" : "rgba(0,0,0,.15)",
            transition: "all .25s ease",
          }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{step.emoji}</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#171b1f", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 4 }}>
            {step.title}
          </div>
          <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.45 }}>
            {step.subtitle}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#a0a5a9", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0, marginLeft: "auto" }}>
          {stepIndex + 1}/{steps.length}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {stepIndex > 0 && (
          <button
            onClick={() => {
              const prev = stepIndex - 1;
              setStepIndex(prev);
              router.push(steps[prev].page);
            }}
            style={{
              height: 46, borderRadius: 14, border: "1.5px solid rgba(0,0,0,.12)",
              background: "#fff", color: "#62686e", fontSize: 15, fontWeight: 700,
              cursor: "pointer", padding: "0 18px", flexShrink: 0,
            }}
          >
            ‹
          </button>
        )}
        <button
          onClick={handleNext}
          style={{
            flex: 1, height: 46, borderRadius: 14,
            background: "linear-gradient(180deg,#f04a08,#d44000)",
            color: "#fff", border: "none", fontSize: 15, fontWeight: 900,
            cursor: "pointer", letterSpacing: "-0.01em",
            boxShadow: "0 6px 20px rgba(212,64,0,.28)",
          }}
        >
          {isLast ? "Démarrer mon essai gratuit →" : "Suivant →"}
        </button>
      </div>
    </div>
  );
}
