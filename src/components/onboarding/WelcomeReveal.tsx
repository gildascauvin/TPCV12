"use client";

interface Props {
  name: string | null;
  sport: string | null;
  mode: "athlete" | "coach";
  onDismiss: () => void;
}

const ATHLETE_STEPS = [
  { icon: "▶", label: "Fais ta séance du jour" },
  { icon: "📅", label: "Suis ton planning hebdomadaire" },
  { icon: "💡", label: "Apprends ce qui impacte tes performances" },
];

const COACH_STEPS = [
  { icon: "👥", label: "Invite tes sportifs" },
  { icon: "📋", label: "Crée ou utilise un programme existant" },
  { icon: "📊", label: "Suis les données de tes sportifs au quotidien" },
];

export default function WelcomeReveal({ name, sport, mode, onDismiss }: Props) {
  const steps = mode === "coach" ? COACH_STEPS : ATHLETE_STEPS;
  const summary = mode === "coach"
    ? "Ton espace a été configuré selon tes préférences de coaching."
    : sport
      ? `Ton planning a été créé selon ton sport (${sport}), ton niveau et tes jours d'entraînement.`
      : "Ton planning a été créé selon ton niveau et tes jours d'entraînement.";

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483100,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 380,
          background: "linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 28, padding: 24,
          boxShadow: "0 42px 120px rgba(0,0,0,0.50)",
          position: "relative", overflow: "hidden",
        }}
      >
        {/* Glow décor */}
        <div style={{ position: "absolute", right: "-10%", bottom: "-35%", width: 240, height: 180, borderRadius: "50%", background: "rgba(212,64,0,0.16)", filter: "blur(28px)", pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.18em", color: "#ff6b2b", textTransform: "uppercase", marginBottom: 10 }}>
            ✦ Bienvenue
          </div>
          <div style={{ fontSize: 24, fontWeight: 1000, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1.15, marginBottom: 8 }}>
            {name ? `Bienvenue, ${name} ! 🎉` : "Bienvenue ! 🎉"}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>

        {/* Next steps */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", color: "rgba(255,255,255,0.38)", textTransform: "uppercase", marginBottom: 10 }}>
            Pour commencer
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, overflow: "hidden" }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderTop: i > 0 ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: "center" }}>{step.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.82)", lineHeight: 1.35 }}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modifiable note */}
        <div style={{ position: "relative", zIndex: 2, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>✏️</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
            Tout est modifiable et personnalisable à tout moment.
          </span>
        </div>

        {/* CTA */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <button
            onClick={onDismiss}
            style={{ width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.30)", letterSpacing: "-0.01em" }}
          >
            C'est parti →
          </button>
        </div>
      </div>
    </div>
  );
}
