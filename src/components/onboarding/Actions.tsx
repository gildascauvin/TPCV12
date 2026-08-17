"use client";

import { useBreakpoint } from "@/hooks/useBreakpoint";

type Variant = "light" | "dark" | "modal-light" | "modal-dark";

interface Props {
  variant?: Variant;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  caption?: string;
  /* Petit bouton "←" à gauche du CTA principal, dans la même rangée sticky (2026-08-17, réintroduit
     après avoir été supprimé partout le 2026-07-13 — retour explicite de Gildas, qui veut le bouton
     retour "à gauche du CTA sticky en bas", pas flottant en haut de l'écran comme un 1er essai).
     `undefined` par défaut : zéro impact sur les appelants qui ne le passent pas. */
  onBack?: () => void;
}

const PAGE_VARIANTS: Variant[] = ["light", "dark"];

const RECIPES: Record<Variant, React.CSSProperties> = {
  light:         { padding: "14px 20px 24px", background: "#f1f0ee" },
  dark:          { padding: "14px 20px 24px" },
  "modal-light": { padding: "20px 28px 20px", background: "#fff", flexShrink: 0 },
  "modal-dark":  { padding: "20px 28px 20px", background: "#161616", flexShrink: 0 },
};

export default function Actions({ variant = "light", onNext, nextLabel, nextDisabled = false, onSkip, skipLabel, caption, onBack }: Props) {
  const isDark = variant === "dark" || variant === "modal-dark";
  const isPage = PAGE_VARIANTS.includes(variant);
  const { isMd, isLg } = useBreakpoint();
  const maxWidth = isLg ? 720 : isMd ? 640 : 560;

  const backBtn = onBack && (
    <button
      onClick={onBack} aria-label="Retour"
      style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0, cursor: "pointer", fontSize: 17,
        border: isDark ? "1.5px solid rgba(255,255,255,.18)" : "1.5px solid rgba(0,0,0,.10)",
        background: isDark ? "rgba(255,255,255,.06)" : "#fff",
        color: isDark ? "#fff" : "#171b1f",
      }}
    >←</button>
  );

  const button = (
    <button
      onClick={() => { if (!nextDisabled) onNext(); }}
      disabled={nextDisabled}
      style={{ width: "100%", height: 52, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 15, fontWeight: 900, cursor: nextDisabled ? "default" : "pointer", opacity: nextDisabled ? 0.45 : 1, boxShadow: "0 8px 20px rgba(212,64,0,.26)" }}
    >
      {nextLabel}
    </button>
  );
  const row = backBtn
    ? <div style={{ display: "flex", gap: 10 }}>{backBtn}<div style={{ flex: 1 }}>{button}</div></div>
    : button;

  const captionEl = caption && (
    <div style={{ textAlign: "center", fontSize: 11.5, color: isDark ? "rgba(255,255,255,.45)" : "#8a8f94", fontWeight: 600, padding: "9px 0 0" }}>
      {caption}
    </div>
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
        <div style={{ maxWidth, margin: "0 auto" }}>
          {row}
          {captionEl}
          {skip}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...RECIPES[variant] }}>
      {row}
      {captionEl}
      {skip}
    </div>
  );
}
