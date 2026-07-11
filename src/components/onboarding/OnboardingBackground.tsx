"use client";

/* Fond plein-page de l'onboarding — pas de carte flottante, pas de faux aperçu d'app flouté.
   dark = steps value/concept/célébration, light = steps de questions/formulaire. */
export default function OnboardingBackground({ variant, children }: { variant: "dark" | "light"; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, overflowY: "auto",
      background: variant === "dark"
        ? "linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)"
        : "#f1f0ee",
      transition: "background .25s ease",
    }}>
      <div style={{ minHeight: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 560, padding: "36px 20px 56px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
