"use client";

type Variant = "light" | "dark" | "modal-light" | "modal-dark";

interface Props {
  variant?: Variant;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}

const PAGE_VARIANTS: Variant[] = ["light", "dark"];

const RECIPES: Record<Variant, React.CSSProperties> = {
  light:         { padding: "14px 20px 24px", background: "#f1f0ee" },
  dark:          { padding: "14px 20px 24px" },
  "modal-light": { margin: "16px 0 0", padding: "14px 0 0", background: "#fff" },
  "modal-dark":  { margin: "16px 0 0", padding: "14px 0 0", background: "#161616" },
};

export default function Actions({ variant = "light", onNext, nextLabel, nextDisabled = false, onSkip, skipLabel }: Props) {
  const isDark = variant === "dark" || variant === "modal-dark";
  const isPage = PAGE_VARIANTS.includes(variant);

  const button = (
    <button
      onClick={() => { if (!nextDisabled) onNext(); }}
      disabled={nextDisabled}
      style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 900, cursor: nextDisabled ? "default" : "pointer", opacity: nextDisabled ? 0.45 : 1, boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}
    >
      {nextLabel}
    </button>
  );

  const skip = onSkip && (
    <button
      onClick={onSkip}
      style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: "none", color: isDark ? "rgba(255,255,255,.45)" : "#8a8f94", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "10px 0 0" }}
    >
      {skipLabel}
    </button>
  );

  if (isPage) {
    /* Steps pleine-page (dans OnboardingBackground) : ancré au vrai bas du viewport via position:fixed.
       "sticky" ne colle nulle part quand le contenu est plus court que l'écran (bug 2026-07-13) — OnboardingBackground.tsx
       réserve le padding-bottom nécessaire pour que ce footer ne masque jamais la fin du contenu défilant. */
    return (
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, ...RECIPES[variant] }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {button}
          {skip}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "sticky", bottom: 0, zIndex: 2, ...RECIPES[variant] }}>
      {button}
      {skip}
    </div>
  );
}
